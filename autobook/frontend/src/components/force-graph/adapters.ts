import type { EdgeType, GraphData, GraphEdge, GraphNode, NodeRole } from "./types";

type BackendNode = {
  index: number;
  name: string;
  role: NodeRole;
};

type BackendEdge = {
  source: string;
  source_index: number;
  target: string;
  target_index: number;
  nature: string;
  amount?: number | null;
  currency?: string | null;
  kind: string;
};

type TransactionGraph = {
  nodes: BackendNode[];
  edges: BackendEdge[];
};

export function deriveEdgeType(sourceRole: NodeRole, targetRole: NodeRole): EdgeType {
  const roles = new Set([sourceRole, targetRole]);
  if (roles.has("reporting_entity") && roles.has("counterparty")) return "operational";
  if (roles.size === 1 && roles.has("counterparty")) return "contextual";
  if (roles.has("counterparty") && roles.has("indirect_party")) return "deep";
  return "deep_contextual";
}

export function toGraphData(graph: TransactionGraph): GraphData {
  const nodes: GraphNode[] = graph.nodes.map((n) => ({
    index: n.index,
    name: n.name,
    role: n.role,
  }));

  const roleByIndex = new Map(graph.nodes.map((n) => [n.index, n.role]));

  const edges: GraphEdge[] = graph.edges.map((e) => ({
    sourceIndex: e.source_index,
    targetIndex: e.target_index,
    source: e.source,
    target: e.target,
    nature: e.nature,
    amount: e.amount ?? null,
    currency: e.currency ?? null,
    kind: e.kind,
    edgeType: deriveEdgeType(
      roleByIndex.get(e.source_index) || "counterparty",
      roleByIndex.get(e.target_index) || "counterparty",
    ),
  }));

  return { nodes, edges };
}
