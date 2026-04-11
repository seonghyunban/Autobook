import { useMemo } from "react";
import { useDraftStore } from "../../store";
import { ForceGraph, toGraphData } from "../../../../components/force-graph";
import type { GraphData } from "../../../../components/force-graph";
import { EmptyBox } from "../../shared/EmptyBox";
import { ReviewSubsection } from "./ReviewSubsection";

/**
 * Read-only transaction graph visualization.
 * Reads from attempted.transaction_graph in the store.
 * Used as header in PartiesSection and ValueFlowSection.
 */
export function TransactionGraph() {
  const graph = useDraftStore((st) => st.attempted.transaction_graph);
  const graphData: GraphData | null = useMemo(
    () => graph ? toGraphData(graph as Parameters<typeof toGraphData>[0]) : null,
    [graph],
  );

  return (
    <ReviewSubsection title="Transaction Structure" gap={16}>
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
