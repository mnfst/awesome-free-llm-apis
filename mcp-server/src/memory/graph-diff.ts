import type { RepositoryGraph, Node, Edge } from './dependency-scanner.js';

export interface GraphDiff {
  newNodes: Node[];
  removedNodes: Node[];
  newEdges: Edge[];
  removedEdges: Edge[];
}

/** Edge identity deliberately excludes `confidence` — a low-to-normal confidence bump on
 *  the same logical edge is a refinement, not structural churn, and shouldn't show up as
 *  an add+remove pair in the diff. */
function edgeKey(e: Edge): string {
  return `${e.source}::${e.target}::${e.type}`;
}

/**
 * Pure set-diff between two RepositoryGraph snapshots. `oldGraph === null` (no prior
 * snapshot, e.g. first wiki-maintenance run) treats every node/edge as new — this
 * bootstraps the wiki rather than no-oping on the first pass.
 */
export function diffGraphs(oldGraph: RepositoryGraph | null, newGraph: RepositoryGraph): GraphDiff {
  const oldNodes = oldGraph ? oldGraph.getAllNodes() : [];
  const oldEdges = oldGraph ? oldGraph.getAllEdges() : [];
  const newNodesList = newGraph.getAllNodes();
  const newEdgesList = newGraph.getAllEdges();

  const oldNodeIds = new Set(oldNodes.map(n => n.id));
  const newNodeIds = new Set(newNodesList.map(n => n.id));
  const oldEdgeKeys = new Set(oldEdges.map(edgeKey));
  const newEdgeKeys = new Set(newEdgesList.map(edgeKey));

  return {
    newNodes: newNodesList.filter(n => !oldNodeIds.has(n.id)),
    removedNodes: oldNodes.filter(n => !newNodeIds.has(n.id)),
    newEdges: newEdgesList.filter(e => !oldEdgeKeys.has(edgeKey(e))),
    removedEdges: oldEdges.filter(e => !newEdgeKeys.has(edgeKey(e))),
  };
}
