import { describe, it, expect } from 'vitest';
import { parseSnapshot, diffSnapshots, summarizeDiff, looksLikeStructuralInterstitial } from '../src/browser/SnapshotDiffer.js';
import { detectBlockingChallenge } from '../src/browser/BlockDetector.js';

describe('Browser Snapshot Differ and BlockDetector Unit Tests', () => {
  it('parses snapshot lines with uid and role into SnapshotNode array', () => {
    const raw = `
uid=root role=main "Main Page"
  uid=nav-1 role=navigation "Nav"
  uid=btn-1 role=button "Submit"
    `;
    const nodes = parseSnapshot(raw);
    expect(nodes.length).toBe(3);
    expect(nodes[0].key).toBe('uid:root');
    expect(nodes[0].role).toBe('main');
    expect(nodes[1].key).toBe('uid:nav-1');
    expect(nodes[2].key).toBe('uid:btn-1');
  });

  it('diffSnapshots identifies added and removed nodes correctly', () => {
    const prev = parseSnapshot('uid=root role=main "Main"\n  uid=item-1 role=listitem "Item 1"');
    const curr = parseSnapshot('uid=root role=main "Main"\n  uid=item-1 role=listitem "Item 1"\n  uid=item-2 role=listitem "Item 2"');

    const diff = diffSnapshots(prev, curr);
    expect(diff.added.length).toBe(1);
    expect(diff.added[0].key).toBe('uid:item-2');
    expect(diff.removed.length).toBe(0);
  });

  it('summarizeDiff formats node additions and removals into readable string', () => {
    const prev = parseSnapshot('uid=root role=main "Main"\n  uid=a role=button "A"');
    const curr = parseSnapshot('uid=root role=main "Main"\n  uid=b role=button "B"');

    const diff = diffSnapshots(prev, curr);
    const summary = summarizeDiff(diff);
    expect(summary).toContain('+1 nodes added');
    expect(summary).toContain('-1 nodes removed');
  });

  it('detects structural interstitial Cloudflare wipeout', () => {
    const prevText = `
uid=h1 role=banner "Header"
uid=nav role=navigation "Nav"
uid=main role=main "Main Content"
uid=footer role=contentinfo "Footer"
    `;
    const currText = `
uid=cf-title role=dialog "Just a moment..."
    `;

    const prev = parseSnapshot(prevText);
    const curr = parseSnapshot(currText);
    const diff = diffSnapshots(prev, curr);

    const isStructural = looksLikeStructuralInterstitial(prev, diff);
    expect(isStructural).toBe(true);

    const result = detectBlockingChallenge(currText, isStructural);
    expect(result.blocked).toBe(true);
  });
});
