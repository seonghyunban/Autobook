/**
 * Value Flow section.
 * Header: —
 * Body: One ValueFlowRow per corrected node
 * Footer: Notes (transactionAnalysis — shared with Parties)
 */
import { ReviewSectionLayout } from "../shared/ReviewSectionLayout";
import { useDraftStore } from "../../store";
import { useShallow } from "zustand/react/shallow";
import { EmptyBox } from "../../shared/EmptyBox";
// TODO: import ValueFlowRow once extracted

function readGraphNodes(graph: { nodes?: { index: number; name: string; role: string }[] } | null | undefined) {
  return graph?.nodes ?? [];
}

export function ValueFlowSection() {
  const correctedNodes = useDraftStore(
    useShallow((st) => readGraphNodes(st.corrected.transaction_graph))
  );

  return (
    <ReviewSectionLayout notesKey="transactionAnalysis">
      {correctedNodes.length === 0 ? (
        <EmptyBox label="No nodes" style={{ padding: "20px 10px" }} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* TODO: render ValueFlowRow per node once extracted */}
          {correctedNodes.map((n) => (
            <div key={n.index}>ValueFlowRow placeholder for node {n.index}: {n.name}</div>
          ))}
        </div>
      )}
    </ReviewSectionLayout>
  );
}
