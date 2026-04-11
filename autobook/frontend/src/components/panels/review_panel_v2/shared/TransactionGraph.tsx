import { useMemo } from "react";
import { useDraftStore } from "../../store";
import { ForceGraph, toGraphData } from "../../../../components/force-graph";
import type { GraphData } from "../../../../components/force-graph";
import { EmptyBox } from "../../shared/EmptyBox";
import { ReviewSubsection } from "./ReviewSubsection";

/**
 * Read-only transaction graph visualization.
 * Reads from corrected.transaction_graph so it always reflects
 * the user's edits (renamed nodes, deleted parties, etc.).
 */
export function TransactionGraph() {
  const graph = useDraftStore((st) => st.corrected.transaction_graph);
  const graphData: GraphData | null = useMemo(
    () => graph ? toGraphData(graph as Parameters<typeof toGraphData>[0]) : null,
    [graph],
  );

  return (
    <ReviewSubsection title="Transaction Structure" explanation="Parties and value flows identified in this transaction." gap={16}>
      <div style={{ width: "100%", height: 350, borderRadius: 8, overflow: "hidden" }}>
        {graphData ? (
          <ForceGraph data={graphData} />
        ) : (
          <EmptyBox label="No transaction graph" style={{ height: "100%" }} />
        )}
      </div>
    </ReviewSubsection>
  );
}
