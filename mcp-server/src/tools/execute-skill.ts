import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import { useFreeLLM } from './use-free-llm.js';
import { loadSkillPrompt } from './load-skill-prompt.js';
import { resolveConfigDir } from '../utils/config-path.js';
import { memoryManager } from '../memory/index.js';
import { WorkspaceScanner } from '../cache/workspace.js';
import { findHermesSkill, loadHermesSkillContent } from '../hermes/loader.js';

const workspaceScanner = new WorkspaceScanner(process.cwd());

// Injected ahead of a Hermes skill's own SKILL.md content — Hermes skills were
// authored against the Claude Desktop/filesystem environment (raw file
// read/write, its own memory tool), not this MCP server's tool surface, so
// without this note the model tries to call tools that don't exist here.
const HERMES_ADAPTER_NOTE = `## MCP Environment Overrides
This skill originates from the Hermes-Agent skill set, authored for a different environment. In THIS environment:
- Do NOT create files or folders directly. Use \`manage_memory\` for persistent storage instead.
- For fetching external/web data, use \`browser_tool\`.
- For searching existing code or prior notes, use the workspace context tools (grep/wiki) already available to you — not a raw filesystem search.
Follow the skill's methodology below, but execute it through this server's tools.

`;

export interface ExecuteSkillInput {
  skill: string;
  input: string;
  model?: string;
  workspace_root?: string;
  sessionId?: string;
  /** Force a specific skill source instead of auto-detecting Hermes first. */
  source?: 'agentic-awesome' | 'hermes';
}

export interface ExecuteSkillResult {
  success: boolean;
  response?: string;
  error?: string;
}

/**
 * Extracts relative file paths mentioned in SKILL.md content.
 * Matches `path/to/file` or [text](path/to/file)
 */
function extractReferencedFiles(content: string): string[] {
  const matches = new Set<string>();
  const regex = /`([^`\s]+)`|\[[^\]]+\]\(([^)]+)\)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const filePath = match[1] || match[2];
    if (
      filePath &&
      (filePath.includes('references/') ||
        filePath.includes('resources/') ||
        filePath.includes('examples/'))
    ) {
      matches.add(filePath.replace(/\\/g, '/').trim());
    }
  }
  return Array.from(matches);
}

/**
 * Resolves referenced files, handling wildcards like references/examples/*.md
 */
async function resolveReferences(
  skillDir: string,
  referencedPaths: string[]
): Promise<{ availableRefs: string[]; missingRefs: string[] }> {
  const availableRefs: string[] = [];
  const missingRefs: string[] = [];

  for (const ref of referencedPaths) {
    if (ref.includes('*')) {
      const parts = ref.split('*');
      const dirPart = path.join(skillDir, parts[0]);
      const extPart = parts[1] || '';
      try {
        if (await fs.pathExists(dirPart)) {
          const files = await fs.readdir(dirPart);
          const matchedFiles = files.filter(f => f.endsWith(extPart));
          if (matchedFiles.length > 0) {
            matchedFiles.forEach(f => {
              availableRefs.push(path.join(parts[0], f).replace(/\\/g, '/'));
            });
          } else {
            missingRefs.push(ref);
          }
        } else {
          missingRefs.push(ref);
        }
      } catch {
        missingRefs.push(ref);
      }
    } else {
      const fullPath = path.join(skillDir, ref);
      try {
        if (await fs.pathExists(fullPath) && (await fs.stat(fullPath)).isFile()) {
          availableRefs.push(ref);
        } else {
          missingRefs.push(ref);
        }
      } catch {
        missingRefs.push(ref);
      }
    }
  }

  return { availableRefs, missingRefs };
}

/**
 * Execute a prompt using a specific local skill's instructions and reference files.
 */
export async function executeSkill(input: ExecuteSkillInput): Promise<ExecuteSkillResult> {
  const { skill, input: userPrompt, model, workspace_root, sessionId, source } = input;

  // 1. Path traversal security guard
  if (!skill || !/^[a-zA-Z0-9_\-\.]+$/.test(skill) || skill.includes('..')) {
    return { success: false, error: 'Security Exception: Invalid skill name.' };
  }

  // 2. Hermes auto-detect: try the bundled Hermes skill set first (unless the
  // caller pinned source: 'agentic-awesome'), since a Hermes skill and an
  // agentic-awesome skill can share a name and Hermes's bundled/offline
  // content should win when both exist. Never let a manifest/fs error here
  // block the normal agentic-awesome path — only source: 'hermes' (an
  // explicit pin) should surface a Hermes-side failure to the caller.
  if (source !== 'agentic-awesome') {
    let hermesContent: string | null = null;
    try {
      const hermesMatch = await findHermesSkill(skill);
      if (hermesMatch) {
        const loaded = await loadHermesSkillContent(hermesMatch.id);
        if (loaded) hermesContent = HERMES_ADAPTER_NOTE + loaded.content;
      } else if (source === 'hermes') {
        return { success: false, error: `Hermes skill "${skill}" not found in the manifest. Run \`npm run fetch-hermes\` or check the skill name.` };
      }
    } catch (err: any) {
      if (source === 'hermes') {
        return { success: false, error: `Hermes skill lookup failed: ${err?.message || err}` };
      }
      console.error(`[execute-skill] Hermes lookup failed for "${skill}", falling back to agentic-awesome:`, err?.message || err);
    }
    // Deliberately outside the try/catch above — a downstream LLM/provider
    // error here is a normal execution failure, not a Hermes lookup failure,
    // and must be reported as such rather than mislabeled. Still caught (its
    // own try/catch) so executeSkill's contract of "never throws, always
    // returns ExecuteSkillResult" holds for the Hermes path too.
    if (hermesContent) {
      try {
        return await executeWithSystemPrompt(hermesContent, userPrompt, model, workspace_root, sessionId, skill);
      } catch (error: any) {
        return { success: false, error: error?.message || 'Unknown error occurred during Hermes skill execution.' };
      }
    }
  }

  try {
    // 2. Resolve skill directory using resolveConfigDir
    const configDir = workspace_root ? resolveConfigDir(workspace_root) : path.join(os.homedir(), '.free-llm-mcp');
    let skillDir = path.join(configDir, 'skills', skill);

    let skillMdPath = path.join(skillDir, 'SKILL.md');
    
    // 3. Fallback to download if SKILL.md is missing
    if (!await fs.pathExists(skillMdPath)) {
      console.error(`[execute-skill] Local skill "${skill}" not found. Attempting to download...`);
      const loadResult = await loadSkillPrompt({
        type: 'load',
        name: skill,
        workspaceDir: workspace_root
      });
      if (!loadResult.success) {
        return {
          success: false,
          error: `Skill "${skill}" could not be resolved or downloaded: ${loadResult.error}`
        };
      }
      
      // Re-evaluate paths after load
      skillDir = path.join(configDir, 'skills', skill);
      skillMdPath = path.join(skillDir, 'SKILL.md');
    }

    // Double check existence after potential download
    if (!await fs.pathExists(skillMdPath)) {
      return { success: false, error: `Skill instructions (SKILL.md) not found for skill "${skill}".` };
    }

    // 4. Read core skill instructions
    const skillContent = await fs.readFile(skillMdPath, 'utf-8');

    // 5. Extract and resolve referenced files
    const referencedPaths = extractReferencedFiles(skillContent);
    const { availableRefs, missingRefs } = await resolveReferences(skillDir, referencedPaths);

    // 6. Build the structured system prompt context
    let systemMessage = '';
    
    // Safety guard for missing referenced files to prevent LLM hallucinations
    if (missingRefs.length > 0) {
      systemMessage += `⚠️ NOTE: The following referenced resource files are NOT available in this environment: ${missingRefs.map(m => `\`${m}\``).join(', ')}. Do NOT try to read or refer to their contents, and do not make assumptions about what they contain.\n\n`;
    }

    systemMessage += `# Specialized Skill Core Instructions (SKILL.md)\n${skillContent}\n\n`;

    // Surface known pitfalls/prior learnings for this skill from the wiki, if any.
    try {
      const wsHash = await workspaceScanner.getWorkspaceHash(workspace_root);
      const wiki = memoryManager.getWiki(wsHash, workspace_root);
      const pastNotes = await wiki.search(skill, 'coder');
      const relevantNotes = pastNotes.filter(p => p.tags.includes(skill)).slice(0, 2);
      if (relevantNotes.length > 0) {
        systemMessage += `## 📚 Known Pitfalls for Skill "${skill}"\n` +
          relevantNotes.map(p => `- ${p.title}: ${p.content.slice(0, 300)}`).join('\n') + '\n\n';
      }
    } catch (err: any) {
      console.error(`[execute-skill] Wiki lookup failed for skill "${skill}":`, err.message);
    }

    // Load available reference files into context
    for (const ref of availableRefs) {
      const refPath = path.join(skillDir, ref);
      try {
        const refContent = await fs.readFile(refPath, 'utf-8');
        systemMessage += `## Skill Reference File: ${ref}\n${refContent}\n\n`;
      } catch (err: any) {
        console.error(`[execute-skill] Failed to read reference file "${ref}":`, err.message);
      }
    }

    // 7. Invoke useFreeLLM with stateless custom messages
    return await executeWithSystemPrompt(systemMessage, userPrompt, model, workspace_root, sessionId, skill);

  } catch (error: any) {
    return {
      success: false,
      error: error?.message || 'Unknown error occurred during skill execution.'
    };
  }
}

/**
 * Shared tail shared by both the agentic-awesome path (above) and the Hermes
 * path (HERMES_ADAPTER_NOTE + skill content, see executeSkill's step 2):
 * invoke useFreeLLM with the assembled system prompt, then record a wiki note
 * on success so future runs of this skill surface past pitfalls.
 */
async function executeWithSystemPrompt(
  systemMessage: string,
  userPrompt: string,
  model: string | undefined,
  workspace_root: string | undefined,
  sessionId: string | undefined,
  skillLabel: string
): Promise<ExecuteSkillResult> {
  const result = await useFreeLLM({
    model,
    messages: [
      { role: 'system', content: systemMessage },
      { role: 'user', content: userPrompt }
    ],
    workspace_root,
    sessionId,
    agentic: false, // Disable auto-enrichment to prevent double-enrichment and token waste
    isOnePass: true
  });

  const responseText = result?.choices?.[0]?.message?.content;
  if (!responseText) {
    return { success: false, error: 'No response was generated by the model.' };
  }

  // Record that this skill/pattern ran successfully, for future pitfall lookups.
  try {
    const wsHash = await workspaceScanner.getWorkspaceHash(workspace_root);
    const wiki = memoryManager.getWiki(wsHash, workspace_root);
    await wiki.write(`Skill run: ${skillLabel}`, responseText, ['skill', skillLabel], []);
  } catch (err: any) {
    console.error(`[execute-skill] Wiki write failed for skill "${skillLabel}":`, err.message);
  }

  return {
    success: true,
    response: responseText
  };
}
