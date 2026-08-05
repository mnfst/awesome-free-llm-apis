import { describe, it, expect } from 'vitest';
import { parseSnapshot, diffSnapshots, summarizeDiff, looksLikeStructuralInterstitial } from '../src/browser/SnapshotDiffer.js';

const BEFORE = `
[
  button "Login" uid=1
  button "Sign up" uid=2
  generic "Welcome" uid=3
]
`;

const AFTER_ADDED = `
[
  button "Login" uid=1
  button "Sign up" uid=2
  generic "Welcome" uid=3
  list "Lineups" uid=4
    generic "Player 1" uid=5
    generic "Player 2" uid=6
]
`;

const AFTER_INTERSTITIAL = `
[
  generic "Checking your browser" uid=7
  button "Verify" uid=8
]
`;

describe('SnapshotDiffer', () => {
  it('parses uid-bearing lines into nodes, skipping punctuation-only lines', () => {
    const nodes = parseSnapshot(BEFORE);
    expect(nodes.length).toBe(3);
    expect(nodes.map(n => n.uid)).toEqual(['1', '2', '3']);
  });

  it('diffSnapshots reports newly added nodes and no removals when nodes are only appended', () => {
    const diff = diffSnapshots(parseSnapshot(BEFORE), parseSnapshot(AFTER_ADDED));
    expect(diff.removed).toHaveLength(0);
    expect(diff.added.map(n => n.uid).sort()).toEqual(['4', '5', '6']);
  });

  it('diffSnapshots reports removed nodes when uids disappear', () => {
    const diff = diffSnapshots(parseSnapshot(AFTER_ADDED), parseSnapshot(BEFORE));
    expect(diff.added).toHaveLength(0);
    expect(diff.removed.map(n => n.uid).sort()).toEqual(['4', '5', '6']);
  });

  it('summarizeDiff produces a human-readable count when nothing changed', () => {
    const diff = diffSnapshots(parseSnapshot(BEFORE), parseSnapshot(BEFORE));
    expect(summarizeDiff(diff)).toBe('No structural changes.');
  });

  it('summarizeDiff mentions added/removed counts', () => {
    const diff = diffSnapshots(parseSnapshot(BEFORE), parseSnapshot(AFTER_ADDED));
    const summary = summarizeDiff(diff);
    expect(summary).toContain('+3 nodes');
  });

  it('looksLikeStructuralInterstitial is false for an ordinary append', () => {
    const diff = diffSnapshots(parseSnapshot(BEFORE), parseSnapshot(AFTER_ADDED));
    expect(looksLikeStructuralInterstitial(parseSnapshot(BEFORE), diff)).toBe(false);
  });

  it('looksLikeStructuralInterstitial is true when nearly all top-level nodes are wiped and replaced by a small set', () => {
    const before = parseSnapshot(BEFORE);
    const diff = diffSnapshots(before, parseSnapshot(AFTER_INTERSTITIAL));
    expect(looksLikeStructuralInterstitial(before, diff)).toBe(true);
  });

  it('parseSnapshot returns an empty array for empty text', () => {
    expect(parseSnapshot('')).toEqual([]);
  });
});
