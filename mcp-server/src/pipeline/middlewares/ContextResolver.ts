import path from 'path';

const REFERENCE_MARKER_REGEX = /\[(?<label>[^\]]+)\]\((?<bProto>file|mcp|ctx7|artifact|pdf):\/\/(?<bPath>[^)]+)\)|(?<proto>file|mcp|ctx7|artifact|pdf):\/\/(?<path>[^\s)]+)/gi;
const SENTINEL_REGEX = /\[[A-Z][A-Z0-9_-]*:[^\]]*\]/g;
const MAX_CONTEXT_LOG_CHARS = 4000;

export class ContextResolver {
    static isWithinWorkspaceScope(filePath: string, workspaceRoot: string): boolean {
        const rel = path.relative(workspaceRoot, filePath);
        if (path.isAbsolute(rel)) return false; // Cross-drive path on Windows
        const depth = rel.split(path.sep).filter(p => p === '..').length;
        return depth <= 1 && !rel.startsWith(`..${path.sep}..`);
    }

    static protectInjectedReferenceBlocks(goal: string): { tokenized: string; placeholders: Map<string, string> } {
        const placeholders = new Map<string, string>();
        const matches = [...goal.matchAll(REFERENCE_MARKER_REGEX)];

        let tokenized: string;
        let placeholderIndex = 0;

        if (matches.length === 0) {
            tokenized = goal;
        } else {
            tokenized = '';
            let cursor = 0;

            for (let i = 0; i < matches.length; i++) {
                const match = matches[i];
                const matchStart = match.index ?? -1;
                if (matchStart < cursor) continue;

                const markerEnd = matchStart + match[0].length;
                const rest = goal.slice(markerEnd);
                const leadingWsLen = rest.length - rest.trimStart().length;
                const contentStart = markerEnd + leadingWsLen;

                const PDF_CONTEXT_CLOSE = '[/PDF-Context]';
                let blockEnd: number;
                if (goal.startsWith('```', contentStart)) {
                    const closeIdx = goal.indexOf('```', contentStart + 3);
                    blockEnd = closeIdx === -1 ? goal.length : closeIdx + 3;
                } else if (goal.startsWith('[PDF-Context]', contentStart)) {
                    const closeIdx = goal.indexOf(PDF_CONTEXT_CLOSE, contentStart);
                    blockEnd = closeIdx === -1 ? goal.length : closeIdx + PDF_CONTEXT_CLOSE.length;
                } else {
                    const nextMatch = matches.slice(i + 1).find(m => (m.index ?? -1) >= contentStart);
                    blockEnd = nextMatch ? (nextMatch.index as number) : goal.length;
                }

                const placeholder = `protected_ref_${placeholderIndex++}`;
                placeholders.set(placeholder, goal.slice(matchStart, blockEnd));
                tokenized += goal.slice(cursor, matchStart) + placeholder;
                cursor = blockEnd;
            }
            tokenized += goal.slice(cursor);
        }

        let finalTokenized = '';
        let sentinelCursor = 0;
        for (const m of tokenized.matchAll(SENTINEL_REGEX)) {
            const start = m.index ?? -1;
            const end = start + m[0].length;
            const placeholder = `protected_ref_${placeholderIndex++}`;
            placeholders.set(placeholder, m[0]);
            finalTokenized += tokenized.slice(sentinelCursor, start) + placeholder;
            sentinelCursor = end;
        }
        finalTokenized += tokenized.slice(sentinelCursor);

        return { tokenized: finalTokenized, placeholders };
    }

    static extractDeferredPdfPages(text: string): string[] {
        const regex = /\[PDF-PAGE-DEFERRED:\s*([^—\]]+?)\s*—[^\]]*\]/g;
        return [...text.matchAll(regex)].map(m => m[1].trim());
    }

    static excerptForLog(text: string): string {
        const trimmed = text.trim();
        return trimmed.length > MAX_CONTEXT_LOG_CHARS
            ? trimmed.slice(0, MAX_CONTEXT_LOG_CHARS) + '…[truncated]'
            : trimmed;
    }

    static appendDeferredPagesNotice(content: string, deferred: string[], maxPages: number): string {
        if (deferred.length === 0) return content;
        const list = deferred.map(d => `- \`${d}\``).join('\n');
        return `${content}\n\n---\n⚠️ **Note:** ${deferred.length} PDF page reference(s) were not processed in this pass (max ${maxPages} pages per request) and are not reflected above:\n${list}\nAsk again in a follow-up request to include them.`;
    }

    static restoreProtectedReferenceBlocks(text: string, placeholders: Map<string, string>): string {
        let restored = text;
        for (const [placeholder, original] of placeholders) {
            restored = restored.split(placeholder).join(original);
        }
        return restored;
    }
}
