import { ReviewSectionLayout } from "../shared/ReviewSectionLayout";
import { useDraftStore } from "../../store";
import { useShallow } from "zustand/react/shallow";
import { EmptyBox } from "../../shared/EmptyBox";
import { readGraphNodes } from "../shared/graphHelpers";
import { ValueFlowRow } from "./ValueFlowRow";

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
          {correctedNodes.map((n) => (
            <ValueFlowRow key={n.index} nodeIndex={n.index} />
          ))}
        </div>
      )}
    </ReviewSectionLayout>
  );
}
