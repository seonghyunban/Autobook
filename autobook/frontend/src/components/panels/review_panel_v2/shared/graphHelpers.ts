import type { TransactionGraphNode, TransactionGraphEdge } from "../../../../api/types";

export type GraphNode = TransactionGraphNode;
export type GraphEdgeData = TransactionGraphEdge;

export function readGraphNodes(graph: { nodes?: GraphNode[] } | null | undefined): GraphNode[] {
  return graph?.nodes ?? [];
}

export function readGraphEdges(graph: { edges?: GraphEdgeData[] } | null | undefined): GraphEdgeData[] {
  return graph?.edges ?? [];
}

export function propagateNodeRename(graph: { edges?: GraphEdgeData[] } | null | undefined, nodeIndex: number, newName: string) {
  for (const edge of readGraphEdges(graph)) {
    if (edge.source_index === nodeIndex) edge.source = newName;
    if (edge.target_index === nodeIndex) edge.target = newName;
  }
}
