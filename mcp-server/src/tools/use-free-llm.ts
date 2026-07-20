import crypto from 'node:crypto';
import { ProviderRegistry } from '../providers/registry.js';
import { getMessageContent } from '../utils/MessageUtils.js';
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { WorkspaceScanner } from '../cache/workspace.js';
import { renderPdfPage } from '../utils/PdfRenderer.js';
import { getModelCapability } from '../config/models.js';
import type { ChatRequest, ChatResponse } from '../providers/types.js';
import {
  PipelineExecutor,
  TaskType,
  type PipelineContext
} from '../pipeline/middleware.js';
import { StructuralMarkdownMiddleware } from '../pipeline/middlewares/StructuralMiddleware.js';
import { calculateModelWeightedMaxTokens } from '../utils/model-tokens.js';
import { toMarkdownResponse } from '../utils/markdown.js';
import { loadSkillPrompt } from './load-skill-prompt.js';
import { manageMemory } from './manage-memory.js';
import { indexWorkspace } from './index-workspace.js';
import { getTokenStats } from './get-token-stats.js';
import { validateProvider } from './validate-provider.js';
import { initWorkspace } from './init-workspace.js';
import { GlobalWikiManager } from '../utils/GlobalWikiManager.js';
import { logToolCall } from '../utils/ChatLogger.js';

// Each pdf:// reference costs a subprocess render plus a vision-classification LLM call
// (resolvePdfRef) — sequential, uncapped resolution of many pages in one pass would be an
// unbounded-sequential-cost pattern that can exhaust a provider's rate limit. Cap to 5
// pdf:// references per pass (matches wikiConfig.pageBatchThreshold's existing precedent
// of 5 for the same reason, in the separate wiki-indexing system). Exported so every
// resolution path — resolveFileRefs()'s top-level intake AND AgenticMiddleware's
// subtask-local proactive resolution — enforces the same real limit, not just the first one.
export const MAX_PDF_PAGES_PER_PASS = 5;

export interface UseFreeLLMInput {
  model?: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: any }>;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
  provider?: string;
  fallback?: boolean;
  workspace_root?: string;
  agentic?: boolean;
  sessionId?: string;
  taskType?: TaskType | string;
  isOnePass?: boolean;
  keywords?: string[];
  skill?: string;
  // Skip the pre-emptive full-workspace re-index + wiki-maintenance pass that
  // normally runs on every agentic call with a workspace_root. Useful when the
  // request is narrowly about a specific file/PDF reference and doesn't need (or
  // shouldn't pay the latency/provider-budget cost of) a full codebase re-scan.
  skipIndexing?: boolean;
}

const workspaceScanner = new WorkspaceScanner(process.cwd());

const STOP_WORDS = new Set(['and', 'the', 'with', 'your', 'from', 'that', 'this', 'for', 'are', 'you', 'was', 'were', 'been', 'have', 'has', 'had', 'should', 'would', 'could']);


import {
  getSharedResponseCache,
  getSharedRouter,
  getSharedImageRouter,
  getAgenticMiddleware,
  getWorkspaceContextMiddleware,
  getStructuralMarkdownMiddleware
} from '../pipeline/instances.js';

/**
 * v1.0.4: Local TF-style summarization for large files (no API calls)
 */
export function summarizeTextLocally(text: string, limit: number): string {
  const sentences = text.split(/[.\n]/).filter(s => s.trim().length > 10);
  if (sentences.length < 5) return text.substring(0, limit) + "... [truncated]";

  const words = text.toLowerCase().match(/\w+/g) || [];
  const freq = new Map<string, number>();
  for (const w of words) {
    if (w.length > 3) freq.set(w, (freq.get(w) || 0) + 1);
  }

  const scored = sentences.map(s => {
    const sWords = s.toLowerCase().match(/\w+/g) || [];
    let score = 0;
    for (const sw of sWords) score += freq.get(sw) || 0;
    return { text: s.trim(), score: score / (sWords.length || 1) };
  });

  scored.sort((a, b) => b.score - a.score);

  let result = "<!-- summarized -->\n";
  let currentLen = result.length;
  // Keep original order if possible by filtering original sentences? 
  // No, just take top N.
  for (const s of scored) {
    if (currentLen + s.text.length + 2 > limit) break;
    result += s.text + ".\n";
    currentLen += s.text.length + 2;
  }
  return result;
}

/**
 * v1.0.4: Platform-aware artifact roots for model-specific context.
 */
const artifactRoots = {
  claude: process.env.CLAUDE_ARTIFACTS_DIR || path.join(os.homedir(), '.anthropic', 'artifacts'),
  chatgpt: process.env.CHATGPT_ARTIFACTS_DIR || path.join(os.homedir(), '.openai', 'artifacts'),
  codex: process.env.CODEX_ARTIFACTS_DIR || path.join(os.homedir(), '.codex', 'artifacts'),
  antigravity: process.env.ANTIGRAVITY_APP_DATA || path.join(os.homedir(), '.gemini', 'antigravity')
};

/**
 * v1.0.4: Scans the last 2 messages for code blocks matching a filename.
 * fufills the "user provided context via markdown" fallback.
 */
async function findInRecentMessages(filename: string, messages: any[]): Promise<string | null> {
  const recent = messages.slice(-3, -1);
  for (const msg of recent) {
    if (typeof msg.content !== 'string') continue;
    const codeBlockRegex = new RegExp(`\`\`\`(?:file:)?${filename}\\n([\\s\\S]*?)\`\`\``, 'i');
    const match = codeBlockRegex.exec(msg.content);
    if (match) return match[1];
  }
  return null;
}

/**
 * v1.0.4: Resolves file://, artifact://, ctx7://, and mcp:// references in user messages.
 */
export async function resolveFileRefs(
  msgOrContent: any,
  messages: any[],
  workspaceRoot?: string
): Promise<any> {
  const isStringInput = typeof msgOrContent === 'string';
  const msg = isStringInput ? { role: 'user', content: msgOrContent } : msgOrContent;
  
  let content = '';
  if (typeof msg.content === 'string') {
    content = msg.content;
  } else if (Array.isArray(msg.content)) {
    const textPart = msg.content.find((p: any) => p.type === 'text');
    if (textPart) content = textPart.text || '';
  }

  // Two alternatives: a markdown-link form `[label](proto://path with spaces)`, where the
  // closing `)` unambiguously terminates the path (so spaces inside are fine — real project
  // files/uploads legitimately have them, e.g. "SQL Injection Based on Reinforcement
  // Learning.pdf"), and a bare `proto://path` form embedded directly in prose, where a
  // path can't contain spaces without becoming ambiguous with the surrounding sentence.
  const uriRegex = /\[(?<label>[^\]]+)\]\((?<bProto>file|mcp|ctx7|artifact|pdf):\/\/(?<bPath>[^)]+)\)|(?<proto>file|mcp|ctx7|artifact|pdf):\/\/(?<path>[^\s)]+)/gi;
  let newContent = content;
  const matches = [...content.matchAll(uriRegex)];

  const wsRoot = (workspaceRoot && workspaceRoot.trim()) ? path.resolve(workspaceRoot) : undefined;
  const imageAttachments: string[] = [];

  let pdfPagesResolved = 0;

  for (const match of matches) {
    const fullMatch = match[0];
    const g = match.groups!;
    const protocol = (g.bProto ?? g.proto)!.toLowerCase();
    const uriPath = (g.bPath ?? g.path)!;
    let resolvedContent: string | null = null;
    let sourceLabel = '';

    if (protocol === 'file' || protocol === 'artifact') {
      let filePath = uriPath;
      if (protocol === 'artifact') {
        const platform = uriPath.split('/')[0].toLowerCase();
        const relativePath = uriPath.split('/').slice(1).join('/');
        const root = (artifactRoots as any)[platform] || artifactRoots.antigravity;
        filePath = path.join(root, relativePath);
        sourceLabel = `artifact:${platform}`;
      } else {
        if (filePath.startsWith('/')) {
          if (/^\/[A-Za-z]:\//.test(filePath)) filePath = filePath.substring(1);
        }
        sourceLabel = 'file';
      }

      filePath = path.normalize(decodeURIComponent(filePath));
      const absPath = path.resolve(filePath);
      const normAbs = absPath.replace(/\\/g, '/');

      const allowedRoots = [
        wsRoot,
        artifactRoots.claude,
        artifactRoots.chatgpt,
        artifactRoots.codex,
        artifactRoots.antigravity
      ].filter(Boolean).map(r => r!.replace(/\\/g, '/'));

      const isAuthorized = allowedRoots.some(root => {
        if (process.platform === 'win32' && /^[A-Za-z]:\//.test(normAbs)) {
          return normAbs.toLowerCase().startsWith(root.toLowerCase());
        }
        return normAbs.startsWith(root);
      });

      if (!isAuthorized) {
        console.error(`[v1.0.4][resolveRefs] Security block: ${absPath} is outside allowed boundaries`);
        continue;
      }

      try {
        if (await fs.pathExists(absPath) && (await fs.stat(absPath)).isFile()) {
          resolvedContent = await fs.readFile(absPath, 'utf-8');
        }
      } catch (err) {
        console.error(`[v1.0.4][resolveRefs] Disk read failed for ${absPath}:`, err);
      }

      if (!resolvedContent) {
        const fileName = path.basename(absPath);
        resolvedContent = await findInRecentMessages(fileName, messages);
        if (resolvedContent) sourceLabel += ':history';
      }

      if (resolvedContent) {
        const MAX_CHARS = 12000;
        if (resolvedContent.length > MAX_CHARS) {
          resolvedContent = summarizeTextLocally(resolvedContent, MAX_CHARS);
        }
        const baseName = path.basename(absPath);
        const replacement = `${fullMatch}\n\n\`\`\`${sourceLabel}:${baseName}\n${resolvedContent}\n\`\`\``;
        newContent = newContent.replace(fullMatch, replacement);
        console.error(`[v1.0.4][resolveRefs] Resolved ${baseName} via ${sourceLabel}`);
      } else {
        const baseName = path.basename(absPath);
        const sentinel = `[NOT_FOUND_HARD_STOP: ${baseName} (${fullMatch}) could not be resolved. Provide the correct file:/// path.]`;
        newContent = newContent.replace(fullMatch, sentinel);
        console.error(`[v1.0.4][resolveRefs] UNRESOLVED — injecting sentinel for ${baseName}`);
      }
    } else if (protocol === 'pdf') {
      if (pdfPagesResolved >= MAX_PDF_PAGES_PER_PASS) {
        const sentinel = `[PDF-PAGE-DEFERRED: ${uriPath} — resolve in a follow-up request; max ${MAX_PDF_PAGES_PER_PASS} PDF pages per pass.]`;
        newContent = newContent.replace(fullMatch, sentinel);
        console.error(`[v1.0.4][resolveRefs] PDF page cap reached (${MAX_PDF_PAGES_PER_PASS}) — deferring ${uriPath}`);
        continue;
      }
      const res = await resolvePdfRef(uriPath, workspaceRoot);
      pdfPagesResolved++;
      if (res) {
        resolvedContent = res.resolvedContent;
        newContent = newContent.replace(fullMatch, `${fullMatch}\n\n${resolvedContent}`);
        if (res.imageBase64) {
          imageAttachments.push(res.imageBase64);
        } else if (res.imagePath) {
          imageAttachments.push(res.imagePath);
        }
      } else {
        const sentinel = `[NOT_FOUND_HARD_STOP: PDF ${uriPath} could not be resolved.]`;
        newContent = newContent.replace(fullMatch, sentinel);
      }
    } else if (protocol === 'ctx7') {
      /**
       * v1.0.4 Placeholder: Context7 Integration
       * FUTURE(TODO): Implement resolver using context7 MCP server.
       * CONSTRAINT: Cap total tool calls to 3 per query.
       */
      console.warn(`[v1.0.4][resolveRefs] ctx7 protocol not yet implemented: ${uriPath}`);
    } else if (protocol === 'mcp') {
      console.warn(`[v1.0.4][resolveRefs] mcp protocol not yet implemented: ${uriPath}`);
    }
  }

  // Update msg.content with text + image attachments if any
  if (imageAttachments.length > 0) {
    if (Array.isArray(msg.content)) {
      const textPart = msg.content.find((p: any) => p.type === 'text');
      if (textPart) textPart.text = newContent;
      for (const img of imageAttachments) {
        msg.content.push({
          type: 'image_url',
          image_url: { url: img.startsWith('data:') ? img : `file://${img}` }
        });
      }
    } else {
      msg.content = [
        { type: 'text', text: newContent },
        ...imageAttachments.map(img => ({
          type: 'image_url',
          image_url: { url: img.startsWith('data:') ? img : `file://${img}` }
        }))
      ];
    }
  } else {
    if (Array.isArray(msg.content)) {
      const textPart = msg.content.find((p: any) => p.type === 'text');
      if (textPart) textPart.text = newContent;
    } else {
      msg.content = newContent;
    }
  }

  return isStringInput ? msg.content : undefined;
}

export async function resolvePdfRef(
  uriPath: string,
  workspaceRoot?: string
): Promise<{ resolvedContent: string; imagePath: string | null; imageBase64: string | null } | null> {
  // Split off only a trailing `:<pageNum>` suffix — a naive uriPath.split(':') breaks on
  // absolute Windows paths, which have their own colon after the drive letter (e.g.
  // "C:/Users/.../Resume.pdf:1" would split into "C", "/Users/.../Resume.pdf", "1").
  const pageMatch = uriPath.match(/^(.*):(\d+)$/);
  const relativePdfPath = pageMatch ? pageMatch[1] : uriPath;
  const pageNumStr = pageMatch ? pageMatch[2] : '1';
  const pageNum = parseInt(pageNumStr, 10) || 1;

  const wsRoot = (workspaceRoot && workspaceRoot.trim()) ? path.resolve(workspaceRoot) : process.cwd();
  const absPdfPath = path.resolve(wsRoot, relativePdfPath);
  const pdfName = path.basename(absPdfPath);

  if (!await fs.pathExists(absPdfPath)) {
    console.error(`[resolvePdfRef] PDF not found: ${absPdfPath}`);
    return null;
  }

  const currentMtimeMs = (await fs.stat(absPdfPath)).mtimeMs;

  // 1. Check if index/offset is cached, and whether the PDF has changed since it was cached
  const memoryKey = `pdf:index:${pdfName}`;
  const { memoryManager } = await import('../memory/index.js');
  const savedIndex = await memoryManager.longTerm.load(memoryKey) as any;
  const isStale = !!savedIndex && savedIndex.mtimeMs !== currentMtimeMs;

  let physicalPage = pageNum;
  if (savedIndex && !isStale && typeof savedIndex.offset === 'number') {
    if (pageNum !== savedIndex.index_page) {
      physicalPage = pageNum + savedIndex.offset;
    }
  }

  // 2. Run the python renderer script
  const renderResult = await renderPdfPage(absPdfPath, physicalPage);
  if (!renderResult) {
    return null;
  }

  const textContent = renderResult.text;

  let imageBase64: string | null = null;
  if (renderResult.image_path) {
    try {
      const imgBuffer = await fs.readFile(renderResult.image_path);
      const ext = path.extname(renderResult.image_path).toLowerCase().replace('.', '');
      const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
      imageBase64 = `data:${mimeType};base64,${imgBuffer.toString('base64')}`;
    } catch (err) {
      console.error(`[resolvePdfRef] Failed to convert PDF page image to base64:`, err);
    }
  }

  // 2b. Fire-and-forget: keep the workspace wiki in sync with this PDF's content.
  setImmediate(() => {
    import('../memory/pdf-wiki.js')
      .then(({ maybeIndexPdfIntoWiki }) => maybeIndexPdfIntoWiki({
        workspaceRoot: wsRoot,
        absPdfPath,
        relativePdfPath,
        totalPages: renderResult.total_pages,
        pageNum: physicalPage,   // reuse already-rendered page, no extra subprocess
        pageText: textContent,
        imageCoverageRatio: renderResult.image_coverage_ratio,
        imagePath: renderResult.image_path,
        imageBlocks: renderResult.image_blocks,
      }))
      .catch(err => console.error('[resolvePdfRef] PDF wiki indexing failed:', err));
  });

  // 3. If not cached (or the PDF changed since it was cached), detect if this is an
  // index page via multimodal LLM call
  if (!savedIndex || isStale) {
    try {
      // This call sends a multimodal `image_url` content part (OpenAI-style, base64 data
      // URI), unlike the plain-text provider-selection calls elsewhere in this codebase —
      // it needs providers whose declared vision capability is real, not "whichever's
      // first and isn't siliconflow". Reuse the same source of truth ImageRouterMiddleware
      // uses (ProviderRegistry.getAvailableVisionModels(), backed by each provider's own
      // `visionModels` — BaseProvider, computed from the centralized `isVisionSupported()`
      // config) rather than a hand-maintained duplicate list — and try every candidate in
      // order rather than picking one and giving up, so a single provider being down or
      // rate-limited doesn't silently kill classification.
      const registry = ProviderRegistry.getInstance();
      // Cheapest-capability-first: this is a small, low-stakes classification call
      // (max_tokens: 150), not a task that needs the strongest available model.
      const orderedCandidates = registry.getAvailableVisionModels()
        .sort((a, b) => getModelCapability(a.model.id) - getModelCapability(b.model.id))
        .map(({ provider, model }) => ({ provider, model: model.id }));

      const promptForLLM = `Analyze the attached screenshot from the PDF page.
Determine if this page is a Table of Contents (TOC) / Index of the document.
Return ONLY a valid JSON object matching this structure:
{
  "is_index": true/false,
  "offset": <number or 0>,
  "explanation": "Why or why not"
}
Note: 'offset' is defined as the difference (physical_page_number - printed_page_number).
For example:
- If this page is physical page 2, and the printed page number on the page is '2', the offset is 0.
- If this page is physical page 5, but the printed page number on it is '1', the offset is 4.
- If it is not an index page, set offset to 0.`;

      let attemptSucceeded = false;
      let parsed: any = null;
      for (const { provider, model } of orderedCandidates) {
        try {
          const response = await provider.chat({
            model,
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: promptForLLM },
                  {
                    type: 'image_url',
                    image_url: { url: imageBase64 || '' }
                  }
                ]
              }
            ],
            temperature: 0.1,
            max_tokens: 150
          });

          const choice = response.choices?.[0];
          const content = getMessageContent(choice?.message) || '';
          try {
            parsed = JSON.parse(content.replace(/```json|```/g, '').trim());
          } catch {
            const match = content.match(/\{[\s\S]*?\}/);
            if (match) parsed = JSON.parse(match[0]);
          }
          attemptSucceeded = true;
          break;
        } catch (err) {
          console.error(`[resolvePdfRef] Vision classification attempt via ${provider.id}/${model} failed:`, err);
        }
      }

      if (attemptSucceeded) {
        if (parsed && parsed.is_index) {
          await memoryManager.longTerm.save(memoryKey, {
            is_index: true,
            index_page: pageNum,
            offset: parsed.offset || 0,
            mtimeMs: currentMtimeMs
          });
          console.error(`[resolvePdfRef] Saved index mapping for ${pdfName}: page ${pageNum}, offset ${parsed.offset}`);
        } else {
          await memoryManager.longTerm.save(memoryKey, {
            is_index: false,
            index_page: pageNum,
            offset: 0,
            mtimeMs: currentMtimeMs
          });
        }
      } else {
        console.error(`[resolvePdfRef] All vision classification attempts failed for ${pdfName}; will retry on next reference.`);
      }
    } catch (err) {
      console.error(`[resolvePdfRef] LLM classification failed:`, err);
    }
  }

  // Closing sentinel matters: resolveFileRefs() splices this in right after the pdf://
  // marker with no separator from whatever text originally followed it in the same
  // message (e.g. "pdf://x.pdf:1 summarize this page" -> "...page text... summarize this
  // page"). Without an explicit end marker, downstream consumers that need to treat this
  // block as one opaque unit (decomposeGoal, classifyIntent) can't tell where injected
  // content ends and the user's real trailing instruction begins.
  const finalContent = `[PDF-Context] --- FILE: ${pdfName} physical_page:${physicalPage} ---\n` +
    `Page Text:\n${textContent || '(No extractable text found. Vision analysis screenshot attached.)'}` +
    `\n[/PDF-Context]`;

  return {
    resolvedContent: finalContent,
    imagePath: renderResult.image_path,
    imageBase64: imageBase64
  };
}

export async function useFreeLLM(input: UseFreeLLMInput): Promise<ChatResponse> {
  const {
    model,
    messages: inputMessages,
    temperature = 0.7,
    max_tokens = calculateModelWeightedMaxTokens(model),
    top_p,
    stream = false,
    provider: providerId,
    fallback = true,
    agentic,
    sessionId: inputSessionId,
    workspace_root: workspaceRoot,
    keywords,
    skill,
    skipIndexing,
  } = input;

  const promptInput = (input as any).prompt;
  let messages = inputMessages;
  if (!messages && typeof promptInput === 'string') {
    messages = [{ role: 'user', content: promptInput }];
  } else if (!messages) {
    messages = [];
  }

  if (skill) {
    const loadedSkill = await loadSkillPrompt({ skill, type: 'load' });
    if (loadedSkill.success && loadedSkill.prompt) {
      messages.unshift({
        role: 'system',
        content: [
          `# DYNAMIC SKILL LOADED: ${loadedSkill.skill}`,
          loadedSkill.description ? `Description: ${loadedSkill.description}` : '',
          loadedSkill.terminalSetupHint ? `Terminal setup note: ${loadedSkill.terminalSetupHint}` : '',
          '',
          loadedSkill.prompt
        ].filter(Boolean).join('\n')
      });
    }
  }

  // v1.0.4 Resolution Pass: Resolve file, artifact, ctx7, pdf references in user messages.
  // Previously gated behind `agentic` — but resolveFileRefs()/resolvePdfRef() (and by
  // extension PDF-to-wiki indexing, which only ever fires from inside resolvePdfRef) both
  // already degrade gracefully with no workspace_root, so there's no real reason a plain
  // one-shot chat couldn't reference a pdf://, file://, or artifact:// URI too. Gating this
  // meant a one-shot request with a pdf:// reference (e.g. the dashboard's file-upload flow
  // in one-shot mode) silently never resolved it — the raw "pdf://..." text just got sent
  // to the model as-is, and PDF-to-wiki indexing never ran at all.
  if (workspaceRoot) {
    setImmediate(() => {
      initWorkspace(workspaceRoot).catch(err => {
        console.error('[free-llm-mcp] Failed to initialize workspace config:', err);
      });
    });
  }

  for (const msg of messages) {
    if (msg.role === 'user' && (typeof msg.content === 'string' || Array.isArray(msg.content))) {
      await resolveFileRefs(msg, messages, workspaceRoot);
    }
  }

  // v1.0.4 Hard Stop Gate: If any sentinel is present after resolution, short-circuit
  // the entire pipeline and return a structured error. The LLM is never called.
  const sentinelPattern = /\[NOT_FOUND_HARD_STOP:[^\]]+\]/g;
  const allSentinels: string[] = [];
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      const found = msg.content.match(sentinelPattern);
      if (found) allSentinels.push(...found);
    }
  }
  if (allSentinels.length > 0) {
    const detail = allSentinels.join('\n');
    const errorMsg = `❌ **File Not Found — Request Aborted**\n\nThe following file URI(s) could not be resolved. The request was not forwarded to the model to prevent hallucination:\n\n${detail}\n\nPlease provide the correct absolute path(s) and try again.`;
    console.error(`[v1.0.4][useFreeLLM] Hard Stop — ${allSentinels.length} unresolved URI(s), aborting pipeline.`);
    return {
      id: 'middleware-gate',
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'middleware-gate',
      choices: [{ index: 0, message: { role: 'assistant', content: errorMsg }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
  }

  const request: ChatRequest = {
    model,
    messages,
    temperature,
    max_tokens,
    top_p,
    stream,
    agentic,
    skipIndexing,
  };

  const pipeline = new PipelineExecutor();

  // Pipeline order:
  // 1. StructuralMarkdownMiddleware - Inject full session memory into agentic requests (v1.0.4)
  // 2. ResponseCache - Check for cached responses
  // 3. AgenticMiddleware - Handle agentic/reasoning mode if enabled
  // 4. IntelligentRouter - Select provider/model and execute (includes token management and LLM execution)
  pipeline.use(getStructuralMarkdownMiddleware());
  pipeline.use(getSharedResponseCache());
  pipeline.use(getWorkspaceContextMiddleware());
  pipeline.use(getAgenticMiddleware());
  pipeline.use(getSharedImageRouter());
  pipeline.use(getSharedRouter());

  const wsHash = await workspaceScanner.getWorkspaceHash(workspaceRoot);

  // Derive a foolproof sessionId if not explicitly provided
  let effectiveSessionId = inputSessionId;
  if (!effectiveSessionId && (workspaceRoot || agentic)) {
    // v1.0.4 Hardening: Use the stable wsHash to derive sessionId if missing
    effectiveSessionId = `ws-${wsHash.substring(0, 16)}`;
  }

  const context: PipelineContext = {
    request,
    taskType: (input as any).taskType as TaskType || TaskType.Chat,
    workspaceRoot,
    wsHash,
    providerId: providerId,
    agentic,
    sessionId: effectiveSessionId,
    keywords,
    // Defaults to true whenever this isn't an agentic call, so WorkspaceContextMiddleware's
    // `allowMemory = context.isOnePass ? !!context.workspaceRoot : true` gate actually engages
    // for plain one-shot chats too — previously only vision_tool ever set this explicitly, so
    // every non-agentic use_free_llm call (workspace or not) always allowed memory injection,
    // and with no workspaceRoot it fell back to the single shared '__no_ws__' namespace —
    // leaking unrelated memory/wiki content from every other one-shot conversation into this one.
    isOnePass: input.isOnePass ?? !agentic
  };

  let finalContext = await pipeline.execute(context);

  // Tool-call interception loop: execute parsed local tool calls and continue the conversation.
  let toolCallDepth = 0;
  const MAX_TOOL_CALL_DEPTH = 3;
  while (toolCallDepth < MAX_TOOL_CALL_DEPTH) {
    const assistantContent = finalContext?.response?.choices?.[0]?.message?.content || '';
    const parsedCall = tryExtractToolCall(assistantContent);
    if (!parsedCall) break;
    toolCallDepth++;

    const _tcStart = Date.now();
    let toolOutput: any;
    let toolCallIsError = false;
    try {
      toolOutput = await executeServerToolCall(parsedCall, workspaceRoot);
    } catch (err: any) {
      toolOutput = { error: err?.message || String(err) };
      toolCallIsError = true;
    }
    const _tcMs = Date.now() - _tcStart;
    if (effectiveSessionId) {
      logToolCall(effectiveSessionId, parsedCall.tool, parsedCall.args, toolOutput, _tcMs, toolCallIsError)
        .catch(() => {}); // fire-and-forget — must never gate the pipeline
    }
    if (toolCallIsError) throw new Error(toolOutput.error);

    context.request.messages.push(
      { role: 'assistant', content: assistantContent },
      {
        role: 'user',
        content: [
          `Tool \`${parsedCall.tool}\` was executed server-side.`,
          'Use this result to continue with the original user intent:',
          '',
          '```json',
          JSON.stringify(toolOutput, null, 2),
          '```'
        ].join('\n')
      }
    );

    finalContext = await pipeline.execute(context);
  }

  if (!finalContext.response) {
    throw new Error('Pipeline completed but no response was generated.');
  }

  const finalChoice = finalContext.response?.choices?.[0]?.message;
  if (finalChoice?.content) {
    finalChoice.content = toMarkdownResponse(finalChoice.content);

    // Extract nouns/terms for skill auto-suggestion in agentic mode
    if (agentic) {
      const textForNouns = finalChoice.content;
      // Simple noun/term extraction using word frequencies (excluding common stop words)
      const words = textForNouns.toLowerCase().match(/\b[a-zA-Z]{3,}\b/g) || [];
      const freq = new Map<string, number>();
      for (const w of words) {
        if (!STOP_WORDS.has(w)) {
          freq.set(w, (freq.get(w) || 0) + 1);
        }
      }
      const sortedTerms = Array.from(freq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(entry => entry[0]);

      if (sortedTerms.length > 0) {
        // Non-blocking fire-and-forget search for matched skills
        (finalChoice as any)._suggestedPromise = loadSkillPrompt({
          type: 'search',
          keywords: sortedTerms,
          workspaceDir: workspaceRoot
        }).then(searchResult => {
          if (searchResult.success && searchResult.skills && searchResult.skills.length > 0) {
            const suggestedBlock = [
              '\n\n---',
              '## 💡 Suggested Skills',
              ...searchResult.skills.map(s => `- \`${s.name}\` — ${s.description}`),
              `\nTo load a skill, trigger: \`load_skill_prompt({ skill: "${searchResult.skills[0].name}", type: "load" })\``
            ].join('\n');
            finalChoice.content += suggestedBlock;
          }
        }).catch(() => {});
      }
    }

    // Postpend token-efficient CLI patterns for debugger persona
    const { detectPersona } = await import('../utils/persona-detector.js');
    const userMessage = messages.find(m => m.role === 'user');
    const userContent = userMessage ? (typeof userMessage.content === 'string' ? userMessage.content : JSON.stringify(userMessage.content)) : '';
    const persona = detectPersona(userContent, workspaceRoot);

    if (context.taskType !== TaskType.Vision && persona === 'debugger') {
      const isWindows = os.platform() === 'win32';
      const queryLower = userContent.toLowerCase();

      // Parse referenced files from the prompt
      const mdFiles = userContent.match(/\b[\w\-./\\]+\.md\b/gi) || [];
      const jsonFiles = userContent.match(/\b[\w\-./\\]+\.json\b/gi) || [];
      const logFiles = userContent.match(/\b[\w\-./\\]+\.(log|txt)\b/gi) || [];
      
      const targetMd = mdFiles[0] ? path.basename(mdFiles[0]) : 'file.md';
      const targetJson = jsonFiles[0] ? path.basename(jsonFiles[0]) : 'file.json';
      const targetLog = logFiles[0] ? path.basename(logFiles[0]) : 'large_file.bin';

      const tips: string[] = [];

      // Exclusive category filtering
      const hasMdMention = mdFiles.length > 0;
      const hasJsonMention = jsonFiles.length > 0;
      const hasLogMention = logFiles.length > 0;

      // 1. Search category
      const wantsSearch = /\b(search|find|grep|rg|read|line|section|heading|match|code)\b/i.test(queryLower);
      if (wantsSearch && (!hasJsonMention && !hasLogMention)) {
        if (isWindows) {
          tips.push(
            '### 🪟 Document/Source Code Search (Windows PowerShell)',
            '```powershell',
            `Get-Content ${targetMd} | Select-String "^#{1,6}\\s"                      # Get headings`,
            `Get-Content ${targetMd} | Select-Object -Skip 41 -First 33                # Read lines 42-75`,
            `Get-Content ${targetMd} | Select-String '\\*\\*.*\\*\\*'                        # Find bold text`,
            '```'
          );
        } else {
          tips.push(
            '### 📄 Document/Source Code Search (Unix/Bash)',
            '```bash',
            `grep -nE "^#{1,6}\\s" ${targetMd}               # Get all headings with line numbers`,
            `grep -n "^## Target Section" ${targetMd}        # Find exact heading line`,
            `sed -n "42,75p" ${targetMd}                    # Read specific lines 42-75 only`,
            `grep -nE "\\*\\*.*\\*\\*" ${targetMd}              # Extract bold/highlighted text`,
            `grep -nE "^\\s*\\|" ${targetMd}                  # Extract markdown table rows`,
            '```'
          );
        }
      }

      // 2. JSON / Tool Output Extraction category
      const wantsJson = /\b(json|result|error|output|field|extract|parse|jq|format|api)\b/i.test(queryLower);
      if (wantsJson && (!hasMdMention && !hasLogMention)) {
        if (isWindows) {
          tips.push(
            '### 📊 JSON / Tool Output Extraction (Windows PowerShell)',
            '```powershell',
            `(Get-Content ${targetJson} | ConvertFrom-Json).key.subkey                  # Raw value`,
            `(Get-Content ${targetJson} | ConvertFrom-Json) | Where-Object { $_.type -eq "error" } | Select-Object -ExpandProperty message # Filter + extract`,
            '```'
          );
        } else {
          tips.push(
            '### 📊 JSON / Tool Output Extraction (Unix/Bash)',
            '```bash',
            `jq -r '.key.subkey' ${targetJson}              # Raw value, no quotes`,
            `jq '.[] | select(.type=="error") | .message' ${targetJson}  # Filter + extract`,
            `grep -oE '"error":"[^"]+"' ${targetJson}       # Regex extract error fields only`,
            '```'
          );
        }
      }

      // 3. Binary & Large File Safety category
      const wantsBinary = /\b(binary|large|file|token|limit|config|key|secret|strings|log)\b/i.test(queryLower);
      if (wantsBinary && (!hasMdMention && !hasJsonMention)) {
        if (isWindows) {
          tips.push(
            '### 🛡️ Binary & Large File Safety (Windows PowerShell)',
            '```powershell',
            `Select-String -Path ${targetLog} -Pattern 'config','key','token'  # Safe search`,
            '```'
          );
        } else {
          tips.push(
            '### 🛡️ Binary & Large File Safety (Unix/Bash)',
            '```bash',
            `strings ${targetLog} | grep -i "config\\|key\\|token"  # Safe text extraction`,
            `file ${targetLog}                          # Identify type before reading`,
            '```'
          );
        }
      }

      // 4. Runtime & Package Diagnostics
      const wantsPackage = /\b(package|dependency|import|module|python|venv|node|require|dir)\b/i.test(queryLower);
      if (wantsPackage) {
        tips.push(
          '### 📦 Runtime & Package Diagnostics',
          '```bash',
          'strings venv/lib/site-packages/pkg/file.py | grep -i "version\\|schema"',
          'python -c "import pkg; print(dir(pkg))"     # Inspect runtime module attributes',
          'node -e "console.log(require(\'pkg\'))"       # Inspect Node package exports',
          '```'
        );
      }

      if (tips.length > 0) {
        const debugTips = [
          '\n\n---',
          '## 🔑 Token-Efficient CLI Diagnostics (Debugger Mode)',
          '> Since you are in a debugger session, use these local shell commands to surgically inspect code/variables without bloating your context window:',
          '',
          ...tips
        ].join('\n');
        finalChoice.content += debugTips;
      }
    }

    // Wikiv2 write side: persist durable knowledge from agentic sessions and reinforce/penalize
    // the wiki pages that were surfaced into context this turn based on the outcome.
    if (agentic) {
      try {
        const { memoryManager } = await import('../memory/index.js');
        const { GLOBAL_CYBER_WIKI_NS } = await import('../utils/GithubRepoScanner.js');
        const isCyber = context.taskType === TaskType.Cyber;
        const wiki = isCyber
          ? memoryManager.getWiki(GLOBAL_CYBER_WIKI_NS)
          : memoryManager.getWiki(context.wsHash || context.sessionId || 'global', context.workspaceRoot);
        const failureLanguage = /\b(didn't work|did not work|failed to|failure|error occurred|unsuccessful|not working)\b/i;
        const isFailure = failureLanguage.test(finalChoice.content);

        const wikiPagesUsed: string[] = (finalContext as any).wikiPagesUsed || [];
        for (const title of wikiPagesUsed) {
          if (isFailure) {
            await wiki.recordFailure(title, 'Follow-up response indicated the referenced knowledge did not work.');
          } else {
            await wiki.reinforce(title);
          }
        }

        const WIKI_WORTHY_PATTERNS = [/decided to/i, /chose\s+.*\s+over\s+.*/i, /we\s+use\s+.*\s+because/i, /decision:/i, /solution:/i, /root cause:/i, /fixed by/i];
        if (!isFailure && WIKI_WORTHY_PATTERNS.some(p => p.test(finalChoice.content))) {
          const title = userContent.split(/\s+/).slice(0, 8).join(' ').trim() || `Session ${new Date().toISOString()}`;
          await wiki.write(title, finalChoice.content, isCyber ? ['cyber'] : [], []);
        }

        await GlobalWikiManager.flushToWiki(wiki);
      } catch (err) {
        console.error(`[useFreeLLM] Wiki write failed: ${err}`);
      }
    }
  }

  return finalContext.response;
}

export async function flushSystem(): Promise<void> {
  getSharedResponseCache().flush();
  // Persist pending usage counters before exit — deductTokens() only schedules a
  // debounced disk write, so shutting down without this (or clearing in-memory
  // state via getSharedRouter().flush() first, as this used to do) silently
  // drops the last batch of request/token counts, which looked like usage
  // "resetting" on every restart.
  await getSharedRouter().persistNow();
}

interface ParsedToolCall {
  tool: string;
  args: Record<string, any>;
}

function safeJsonParse(candidate: string): any | null {
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function tryExtractToolCall(content: string): ParsedToolCall | null {
  const text = (content || '').trim();
  if (!text) return null;

  const fencedJsonBlocks = [...text.matchAll(/```json\s*([\s\S]*?)```/gi)].map((m) => m[1].trim());
  for (const block of fencedJsonBlocks) {
    const parsed = safeJsonParse(block);
    if (parsed && typeof parsed === 'object' && typeof parsed.tool === 'string') {
      return { tool: parsed.tool, args: (parsed.args || parsed.arguments || {}) as Record<string, any> };
    }
  }

  const inlineJson = text.match(/\{[\s\S]*\}/);
  if (inlineJson) {
    const parsed = safeJsonParse(inlineJson[0]);
    if (parsed && typeof parsed === 'object' && typeof parsed.tool === 'string') {
      return { tool: parsed.tool, args: (parsed.args || parsed.arguments || {}) as Record<string, any> };
    }
  }

  return null;
}

export async function executeServerToolCall(call: ParsedToolCall, workspaceRoot?: string): Promise<any> {
  const tool = call.tool.trim();
  const args = call.args || {};

  try {
    let result;
    if (tool === 'read_file') {
      const rawPath = args.path || args.file_path;
      if (!rawPath || typeof rawPath !== 'string') {
        throw new Error('read_file requires `path`.');
      }
      const resolved = path.resolve(workspaceRoot || process.cwd(), rawPath);
      if (workspaceRoot && !resolved.startsWith(path.resolve(workspaceRoot))) {
        throw new Error('read_file path is outside workspace_root.');
      }
      const content = await fs.readFile(resolved, 'utf-8');
      result = { path: resolved, content };
    } else if (tool === 'manage_memory') {
      result = await manageMemory(args as any);
    } else if (tool === 'index_workspace') {
      result = await indexWorkspace(args as any);
    } else if (tool === 'get_token_stats') {
      result = await getTokenStats();
    } else if (tool === 'validate_provider') {
      result = await validateProvider(args.providerId);
    } else if (tool === 'load_skill_prompt') {
      result = await loadSkillPrompt({ skill: args.skill, type: 'load' });
    } else if (tool === 'wiki_search' || tool === 'wiki_write') {
      result = await manageMemory({ action: tool, ...args } as any);
    } else {
      throw new Error(`Unsupported tool call: ${tool}`);
    }

    GlobalWikiManager.logSuccess(tool);
    return result;
  } catch (err: any) {
    GlobalWikiManager.logFailure(tool);
    throw err;
  }
}
