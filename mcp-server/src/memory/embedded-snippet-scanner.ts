export type EmbeddedLanguage = 'javascript' | 'python' | 'shell' | 'bash';

export interface EmbeddedSnippet {
  fieldPath: string;
  language: EmbeddedLanguage;
  code: string;
  parentContext: string;
}

/**
 * Field-name -> language table for known embedded-code fields (e.g. n8n workflow
 * export JSON). Shared with context-gatherer.ts's compaction guard so both stay
 * in sync on what counts as "real code" worth preserving.
 */
export const FIELD_LANGUAGE_MAP: Record<string, EmbeddedLanguage> = {
  jsCode: 'javascript',
  functionCode: 'javascript',
  code: 'javascript',
  pythonCode: 'python',
};

const MAX_JSON_WALK_DEPTH = 6;

function extractJsonSnippets(content: string): EmbeddedSnippet[] {
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }

  const snippets: EmbeddedSnippet[] = [];

  const walk = (node: any, jsonPath: string, siblingContext: string, depth: number) => {
    if (depth > MAX_JSON_WALK_DEPTH || node === null || typeof node !== 'object') return;

    const nodeContext = typeof node.name === 'string'
      ? node.name
      : (typeof node.type === 'string' ? node.type : siblingContext);

    for (const [key, value] of Object.entries(node)) {
      const childPath = jsonPath ? `${jsonPath}.${key}` : key;
      if (typeof value === 'string' && FIELD_LANGUAGE_MAP[key]) {
        snippets.push({
          fieldPath: childPath,
          language: FIELD_LANGUAGE_MAP[key],
          code: value,
          parentContext: nodeContext,
        });
      } else if (value !== null && typeof value === 'object') {
        if (Array.isArray(value)) {
          value.forEach((item, idx) => walk(item, `${childPath}[${idx}]`, nodeContext, depth + 1));
        } else {
          walk(value, childPath, nodeContext, depth + 1);
        }
      }
    }
  };

  walk(parsed, '', '', 0);
  return snippets;
}

/**
 * Best-effort, line-based scan for GitHub Actions `run:` blocks. Not a full YAML
 * parser — tracks `jobs.<job>.steps[<n>].name` and `run:`/`shell:` keys via
 * indentation, which is sufficient for the common Actions workflow shape.
 */
function extractYamlRunSnippets(content: string): EmbeddedSnippet[] {
  const lines = content.split(/\r?\n/);
  const snippets: EmbeddedSnippet[] = [];

  let currentJob = '';
  let currentStepName = '';
  let stepIndex = -1;
  let pendingShell: EmbeddedLanguage = 'bash';

  const indentOf = (line: string) => line.length - line.trimStart().length;
  // Only strip quotes that wrap the *entire* value (YAML string quoting), not quotes
  // that are part of the shell command itself (e.g. `run: echo "hi"`).
  const stripWrappingQuotes = (s: string): string => {
    if (s.length >= 2 && ((s[0] === '"' && s[s.length - 1] === '"') || (s[0] === "'" && s[s.length - 1] === "'"))) {
      return s.slice(1, -1);
    }
    return s;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (/^jobs:\s*$/.test(trimmed)) continue;

    const jobIdMatch = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (jobIdMatch) {
      currentJob = jobIdMatch[1];
      continue;
    }

    const nameMatch = line.match(/^(\s+)-?\s*name:\s*(.+)$/);
    if (nameMatch) {
      currentStepName = stripWrappingQuotes(nameMatch[2].trim());
      stepIndex++;
      continue;
    }

    const shellMatch = line.match(/^\s+shell:\s*(.+)$/);
    if (shellMatch) {
      const shell = stripWrappingQuotes(shellMatch[1].trim()).toLowerCase();
      pendingShell = shell.includes('python') ? 'python' : shell.includes('pwsh') || shell.includes('powershell') ? 'shell' : 'bash';
      continue;
    }

    const runInlineMatch = line.match(/^(\s+)run:\s*(.+)$/);
    const runBlockMatch = line.match(/^(\s+)run:\s*\|-?\s*$/);

    if (runBlockMatch) {
      const blockIndent = indentOf(line);
      const blockLines: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const l = lines[j];
        if (l.trim() === '') { blockLines.push(''); j++; continue; }
        if (indentOf(l) <= blockIndent) break;
        blockLines.push(l);
        j++;
      }
      const jobLabel = currentJob || 'unknown-job';
      const stepLabel = currentStepName || `step[${stepIndex}]`;
      snippets.push({
        fieldPath: `jobs.${jobLabel}.steps[${stepIndex}].run`,
        language: pendingShell,
        code: blockLines.join('\n').trim(),
        parentContext: `${jobLabel} / ${stepLabel}`,
      });
      pendingShell = 'bash';
      i = j - 1;
      continue;
    }

    if (runInlineMatch) {
      const jobLabel = currentJob || 'unknown-job';
      const stepLabel = currentStepName || `step[${stepIndex}]`;
      snippets.push({
        fieldPath: `jobs.${jobLabel}.steps[${stepIndex}].run`,
        language: pendingShell,
        code: stripWrappingQuotes(runInlineMatch[2].trim()),
        parentContext: `${jobLabel} / ${stepLabel}`,
      });
      pendingShell = 'bash';
    }
  }

  return snippets;
}

export function extractEmbeddedSnippets(content: string, ext: '.json' | '.yml' | '.yaml'): EmbeddedSnippet[] {
  if (ext === '.json') return extractJsonSnippets(content);
  return extractYamlRunSnippets(content);
}
