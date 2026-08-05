import fs from 'fs-extra';
import path from 'node:path';
import { listLocalModels, rankCandidateModels, chatLocal, type OllamaLocalChatResult } from '../providers/ollama-local.js';
import { ContextGatherer } from '../pipeline/middlewares/context-gatherer.js';
import { logToolCall } from '../utils/ChatLogger.js';

/**
 * local_llm_patch — Ollama-driven single-file patch stub (v1.0.9 scope, per
 * the deferred `coding_agents` split: full LSP-grounded multi-file version is
 * v1.1.0). Explicit non-goals, backed by the v1.0.9 retrospective on local
 * models + repo_graph RAG:
 *  - No multi-file patches — single `filePath` only.
 *  - No dataflow/variable-flow analysis — nothing in this repo does that yet
 *    (no LSP, no AST def-use tracking); a regex shortcut would produce false
 *    confidence, which is worse than admitting the gap.
 *  - No repo_graph.json semantic RAG — ContextGatherer's existing grep+graph
 *    neighborhood lookup is reused as-is; embedding graph nodes into
 *    VectorStore is real, separately-scoped work that doesn't pay off at
 *    single-file granularity.
 *  - No auto-apply to disk — returns a proposed patch; a human/agent applies
 *    it. Diff preview UI is deferred to v1.1.0.
 *  - No LSP validation of the produced patch.
 *  - Local Ollama only — no silent fallback to a cloud provider if no local
 *    server/model is available (fails fast instead), since a silent fallback
 *    would defeat the cost/privacy reasons someone picked this tool.
 */

export interface LocalLlmPatchInput {
  filePath: string;
  instruction: string;
  workspace_root?: string;
  sessionId?: string;
}

export interface LocalLlmPatchResult {
  success: boolean;
  filePath?: string;
  modelUsed?: string;
  usedFallbackModel?: boolean;
  patch?: string;
  error?: string;
}

/** Strips a single ```lang\n...\n``` fence if the model wrapped its answer in one, else returns the text unchanged. */
function extractCodeFromResponse(text: string): string {
  const fenced = text.match(/```(?:[a-zA-Z0-9_+-]*)\r?\n([\s\S]*?)```/);
  return fenced ? fenced[1] : text;
}

export async function localLlmPatch(input: LocalLlmPatchInput): Promise<LocalLlmPatchResult> {
  const start = Date.now();
  const sessionId = input.sessionId || 'local-llm-patch-adhoc';
  let result: LocalLlmPatchResult;
  let isError = false;

  try {
    if (!input.filePath) throw new Error('filePath is required');
    if (!input.instruction) throw new Error('instruction is required');

    const absPath = path.resolve(input.filePath);
    if (!await fs.pathExists(absPath)) {
      throw new Error(`File not found: ${absPath}`);
    }

    let availableModels: string[];
    try {
      availableModels = await listLocalModels();
    } catch (err: any) {
      throw new Error(`Could not reach a local Ollama server (${process.env.OLLAMA_LOCAL_BASE_URL || 'http://localhost:11434'}): ${err.message}. Install/start Ollama and pull a model, e.g. \`ollama pull qwen2.5-coder\`.`);
    }
    if (availableModels.length === 0) {
      throw new Error('No models available on the local Ollama server. Pull one first, e.g. `ollama pull qwen2.5-coder`.');
    }

    const candidateModels = rankCandidateModels(availableModels);

    const fileContent = await fs.readFile(absPath, 'utf-8');
    const workspaceRoot = input.workspace_root || path.dirname(absPath);

    let context: string[] = [];
    try {
      context = await ContextGatherer.gatherContext({
        workspaceRoot,
        query: `${path.basename(absPath)} ${input.instruction}`,
        limit: 3,
        sessionId,
      });
    } catch (err: any) {
      // Context enrichment is best-effort — a failure here (e.g. no git repo,
      // ripgrep unavailable) shouldn't block patch generation from the file
      // content alone.
      console.error(`[local-llm-patch] Context gathering failed, proceeding with file content only: ${err.message}`);
    }

    const contextBlock = context.length > 0
      ? `\n\n## Related workspace context\n${context.join('\n\n')}`
      : '';

    const prompt = [
      `You are patching a single file. Apply the instruction and return the COMPLETE new file content only, wrapped in a single code fence. Do not include explanations outside the fence.`,
      `## File: ${path.basename(absPath)}`,
      '```',
      fileContent,
      '```',
      `## Instruction\n${input.instruction}`,
      contextBlock,
    ].filter(Boolean).join('\n\n');

    // Try candidates in rankCandidateModels' preference order, calling the
    // real /api/chat endpoint each time — a model that can't actually chat
    // (e.g. an embedding-only model with a name that doesn't look like one)
    // reveals that by failing the call itself, not by a name-pattern guess.
    let chatResult: OllamaLocalChatResult | null = null;
    let modelUsed = '';
    let usedFallback = false;
    const attemptErrors: string[] = [];

    for (let i = 0; i < candidateModels.length; i++) {
      const candidate = candidateModels[i];
      try {
        chatResult = await chatLocal(candidate, [
          { role: 'system', content: 'You are a precise code-editing assistant. Return only the complete new file content in a single code fence.' },
          { role: 'user', content: prompt },
        ]);
        modelUsed = candidate;
        usedFallback = i > 0;
        break;
      } catch (err: any) {
        attemptErrors.push(`${candidate}: ${err.message}`);
      }
    }

    if (!chatResult) {
      throw new Error(`No candidate model could handle /api/chat. Tried: ${attemptErrors.join('; ')}`);
    }

    const patch = extractCodeFromResponse(chatResult.content);

    result = {
      success: true,
      filePath: absPath,
      modelUsed,
      usedFallbackModel: usedFallback,
      patch,
    };
  } catch (err: any) {
    isError = true;
    result = { success: false, error: err?.message || String(err) };
  }

  await logToolCall(sessionId, 'local_llm_patch', input, result, Date.now() - start, isError).catch(() => {});
  return result;
}
