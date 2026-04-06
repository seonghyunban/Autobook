export type NodeRole = "reporting_entity" | "counterparty" | "indirect_party";

export type EdgeType = "operational" | "contextual" | "deep" | "deep_contextual";

export type GraphNode = {
  index: number;
  name: string;
  role: NodeRole;
};

export type GraphEdge = {
  sourceIndex: number;
  targetIndex: number;
  source: string;
  target: string;
  nature: string;
  amount: number | null;
  currency: string | null;
  kind: string;
  edgeType: EdgeType;
};

export type GraphData = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};
