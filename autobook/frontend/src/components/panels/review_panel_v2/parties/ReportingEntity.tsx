/**
 * Reporting Entity subsection — attempted vs corrected entity name.
 * Copied from review_panel/ReviewPanel.tsx ReportingEntityView.
 */
import { useDraftStore } from "../../store";
import { palette, T, roleFieldBg, roleFieldBgEditing } from "../../shared/tokens";
import { ReviewTextField } from "../../shared/ReviewTextField";
import { DashedArrow } from "../../shared/DashedArrow";
import type { TransactionGraphNode, TransactionGraphEdge, HumanCorrectedTrace } from "../../../../api/types";

type GraphNode = TransactionGraphNode;
type GraphEdgeData = TransactionGraphEdge;

const SILVER_BG = "rgba(204, 197, 185, 0.2)";
const REPORTING_FIELD_BG = roleFieldBg("reporting_entity");
const REPORTING_FIELD_BG_EDITING = roleFieldBgEditing("reporting_entity");

function readGraphNodes(graph: { nodes?: GraphNode[] } | null | undefined): GraphNode[] {
  return graph?.nodes ?? [];
}
function readGraphEdges(graph: { edges?: GraphEdgeData[] } | null | undefined): GraphEdgeData[] {
  return graph?.edges ?? [];
}
function propagateNodeRename(graph: { edges?: GraphEdgeData[] } | null | undefined, nodeIndex: number, newName: string) {
  for (const edge of readGraphEdges(graph)) {
    if (edge.source_index === nodeIndex) edge.source = newName;
    if (edge.target_index === nodeIndex) edge.target = newName;
  }
}

// Imported from ReviewPanel — labels row
function AttemptedCorrectedLabels() {
  return (
    <div style={{ display: "flex", gap: 0 }}>
      <div style={{ flex: 1, textAlign: "center" }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: T.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>Attempted</span>
      </div>
      <div style={{ width: 80 }} />
      <div style={{ flex: 1, textAlign: "center" }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: T.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>Corrected</span>
      </div>
    </div>
  );
}

// Imported from ReviewPanel — action bar
function CorrectedActionBar({ muted, variant, actions }: {
  muted: boolean;
  variant: "attempted" | "corrected";
  actions: { label: string; onClick: () => void }[];
}) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, opacity: muted ? 0.4 : 1 }}>
      {actions.map((a) => (
        <button
          key={a.label}
          onClick={a.onClick}
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: variant === "corrected" ? palette.fern : T.textSecondary,
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
          }}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}

export function ReportingEntity() {
  const attemptedName = useDraftStore((st) =>
    readGraphNodes(st.attempted.transaction_graph).find((n) => n.role === "reporting_entity")?.name ?? ""
  );
  const correctedName = useDraftStore((st) =>
    readGraphNodes(st.corrected.transaction_graph).find((n) => n.role === "reporting_entity")?.name ?? ""
  );
  const setCorrected = useDraftStore((st) => st.setCorrected);

  const changed = correctedName !== attemptedName;

  const handleChange = (v: string) => {
    setCorrected((draft) => {
      const node = readGraphNodes(draft.transaction_graph).find((n) => n.role === "reporting_entity");
      if (node) {
        node.name = v;
        propagateNodeRename(draft.transaction_graph, node.index, v);
      }
    });
  };

  const handleReset = () => {
    setCorrected((draft) => {
      const attempted = useDraftStore.getState().attempted;
      const sourceNode = readGraphNodes(attempted.transaction_graph).find((n) => n.role === "reporting_entity");
      const draftNode = readGraphNodes(draft.transaction_graph).find((n) => n.role === "reporting_entity");
      if (draftNode && sourceNode) {
        draftNode.name = sourceNode.name;
        propagateNodeRename(draft.transaction_graph, draftNode.index, sourceNode.name);
      }
    });
  };

  return (
    <>
      <AttemptedCorrectedLabels />
      <div style={{ display: "flex", gap: 0, alignItems: "stretch" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, padding: "8px 10px", background: SILVER_BG, borderRadius: 4, minWidth: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={T.fieldLabel}>Reporting Entity</span>
            <ReviewTextField value={attemptedName} bg={{ display: REPORTING_FIELD_BG, editing: REPORTING_FIELD_BG_EDITING }} />
          </div>
          <div style={{ height: 18 }} />
        </div>
        <DashedArrow label={changed ? "Update" : "Keep"} color={changed ? palette.fern : palette.charcoalBrown} />
        <div style={{
          flex: 1, display: "flex", flexDirection: "column", gap: 10,
          padding: "8px 10px", background: changed ? T.correctedItem : SILVER_BG, borderRadius: 4, minWidth: 0,
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={T.fieldLabel}>Reporting Entity</span>
            <ReviewTextField value={correctedName} onChange={handleChange} bg={{ display: REPORTING_FIELD_BG, editing: REPORTING_FIELD_BG_EDITING }} />
          </div>
          <CorrectedActionBar muted={!changed} variant={changed ? "corrected" : "attempted"} actions={[
            { label: "Reset", onClick: handleReset },
          ]} />
        </div>
      </div>
    </>
  );
}
