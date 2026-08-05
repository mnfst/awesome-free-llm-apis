/**
 * Structural diff over chrome-devtools-mcp's `take_snapshot` text dump.
 *
 * take_snapshot returns a flattened, pretty-printed accessibility-tree — not
 * structured JSON — so there is no in-memory node tree anywhere downstream.
 * dispatch.ts's click-by-uid/role lookups (handleClick) already rely
 * informally on a per-line `uid=`/`role=` grammar with indentation-implied
 * nesting; parseSnapshot() below formalizes just enough of that same grammar
 * to key nodes for an id-keyed set-diff (mirrors src/memory/graph-diff.ts's
 * diffGraphs), without attempting to reconstruct a full tree.
 *
 * Only ever called on the final before/after pair around an action (click,
 * end-of-wait) — never per dom-stable poll tick, so it adds no latency to
 * the 300ms polling loop in dispatch.ts's handleWait.
 */

export interface SnapshotNode {
    /** uid when present, else a `role|label|depth` composite fallback. */
    key: string;
    uid?: string;
    role?: string;
    label: string;
    depth: number;
}

export interface SnapshotDiff {
    added: SnapshotNode[];
    removed: SnapshotNode[];
}

const UID_RE = /uid=["']?([\w-]+)["']?/;
const ROLE_RE = /role=["']?([\w-]+)["']?/;

/** Depth = count of leading indentation units (2 spaces, or a single tab) before the content starts. */
function indentDepth(line: string): number {
    const leading = line.match(/^[\t ]*/)?.[0] || '';
    if (leading.includes('\t')) return leading.length;
    return Math.floor(leading.length / 2);
}

/** True for lines that only encode metadata about an ancestor, not a fresh node in the tree (blank, or JSON-array punctuation). */
function isNonNodeLine(trimmed: string): boolean {
    return trimmed === '' || trimmed === '[' || trimmed === ']' || trimmed === '{' || trimmed === '}';
}

export function parseSnapshot(text: string): SnapshotNode[] {
    if (!text) return [];
    const nodes: SnapshotNode[] = [];
    const lines = text.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();
        if (isNonNodeLine(trimmed)) continue;

        const uidMatch = trimmed.match(UID_RE);
        const roleMatch = trimmed.match(ROLE_RE);
        const uid = uidMatch?.[1];
        const role = roleMatch?.[1];

        // A node line, in this snapshot format, always carries either a uid or a
        // role token — anything else (free-standing text runs, table dividers)
        // is not something dispatch.ts's click lookup could target anyway, so
        // it's not useful to diff on.
        if (!uid && !role) continue;

        const depth = indentDepth(line);
        const label = trimmed
            .replace(UID_RE, '')
            .replace(ROLE_RE, '')
            .replace(/["'=:,]/g, ' ')
            .trim()
            .slice(0, 80);

        const key = uid ? `uid:${uid}` : `rl:${role}|${label}|${depth}`;
        nodes.push({ key, uid, role, label, depth });
    }

    return nodes;
}

/** Id-keyed set-diff, same shape as src/memory/graph-diff.ts's diffGraphs. No "mutated" bucket — neither consumer needs per-field comparison yet. */
export function diffSnapshots(prev: SnapshotNode[], curr: SnapshotNode[]): SnapshotDiff {
    const prevKeys = new Set(prev.map(n => n.key));
    const currKeys = new Set(curr.map(n => n.key));

    const added = curr.filter(n => !prevKeys.has(n.key));
    const removed = prev.filter(n => !currKeys.has(n.key));

    return { added, removed };
}

/**
 * Groups added nodes under a dominant shared parent label when one clearly
 * exists (>60% of added nodes share the same depth-1-shallower label), else
 * falls back to a flat count. Cheap heuristic, not a real tree reconstruction.
 */
export function summarizeDiff(diff: SnapshotDiff): string {
    const { added, removed } = diff;
    if (added.length === 0 && removed.length === 0) return 'No structural changes.';

    const parts: string[] = [];

    if (added.length > 0) {
        const byParentLabel = new Map<string, number>();
        for (const node of added) {
            const parentDepth = node.depth - 1;
            const parent = added.find(n => n.depth === parentDepth) || null;
            const bucket = parent?.label || '(root)';
            byParentLabel.set(bucket, (byParentLabel.get(bucket) || 0) + 1);
        }
        const [dominantLabel, dominantCount] = [...byParentLabel.entries()].sort((a, b) => b[1] - a[1])[0];
        if (dominantCount / added.length > 0.6 && dominantLabel !== '(root)') {
            parts.push(`+${added.length} nodes mounted under "${dominantLabel}"`);
        } else {
            parts.push(`+${added.length} nodes added`);
        }
    }

    if (removed.length > 0) {
        parts.push(`-${removed.length} nodes removed`);
    }

    return parts.join(', ') + '.';
}

/**
 * Heuristic used by BlockDetector: a near-total top-level wipeout replaced by
 * a small added set looks like an interstitial swap (challenge wall mounting
 * over the real page), not an ordinary content update.
 */
export function looksLikeStructuralInterstitial(prev: SnapshotNode[], diff: SnapshotDiff): boolean {
    const prevTopLevel = prev.filter(n => n.depth <= 1);
    if (prevTopLevel.length < 3) return false;
    const removedTopLevel = diff.removed.filter(n => n.depth <= 1).length;
    const wipedMost = removedTopLevel / prevTopLevel.length > 0.8;
    return wipedMost && diff.added.length > 0 && diff.added.length < 5;
}
