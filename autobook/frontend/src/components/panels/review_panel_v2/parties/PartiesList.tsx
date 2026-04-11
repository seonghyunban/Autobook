import { useDraftStore } from "../../store";
import { useShallow } from "zustand/react/shallow";
import { palette, T, roleFieldBg, roleFieldBgEditing } from "../../shared/tokens";
import { ReviewTextField } from "../../shared/ReviewTextField";
import { DeleteButton } from "../../shared/DeleteButton";
import { AddButton } from "../../shared/AddButton";
import { readGraphNodes, propagateNodeRename, type GraphNode } from "../shared/graphHelpers";
import { AttemptedCorrectedLabels } from "../shared/AttemptedCorrectedLabels";
import { CorrectedActionBar } from "../shared/CorrectedActionBar";
import { AttemptedCorrectedRow } from "../shared/AttemptedCorrectedRow";
import type { HumanCorrectedTrace } from "../../../../api/types";

const SILVER_BG = "rgba(204, 197, 185, 0.2)";
const DIRECT_FIELD_BG = roleFieldBg("counterparty");
const DIRECT_FIELD_BG_EDITING = roleFieldBgEditing("counterparty");

function PartyListSubsection({ label, description, parties, fieldBg, fieldBgEditing, onChange, onDelete, onAdd }: {
  label: string;
  description?: string;
  parties: string[];
  fieldBg: React.CSSProperties;
  fieldBgEditing: React.CSSProperties;
  onChange: (index: number, value: string) => void;
  onDelete: (index: number) => void;
  onAdd: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={T.fieldLabel}>{label}</span>
      {description && <span style={{ fontSize: 10, color: T.textSecondary, lineHeight: 1.4 }}>{description}</span>}
      {parties.map((name, i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <ReviewTextField value={name} onChange={(v) => onChange(i, v)} bg={{ display: fieldBg, editing: fieldBgEditing }} flex={1} />
          <DeleteButton onClick={() => onDelete(i)} />
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
        <AddButton onClick={onAdd} title="Add party" />
      </div>
    </div>
  );
}

function resetNodesByRole(
  setCorrected: (updater: (draft: HumanCorrectedTrace) => void) => void,
  role: GraphNode["role"]
) {
  setCorrected((draft) => {
    const attempted = useDraftStore.getState().attempted;
    const graph = draft.transaction_graph;
    if (!graph) return;
    const draftNodes = graph.nodes;
    const attemptedNodes = readGraphNodes(attempted.transaction_graph);
    const nonRole = draftNodes.filter((n) => n.role !== role);
    const attemptedWithRole = attemptedNodes.filter((n) => n.role === role).map((n) => ({ ...n }));
    graph.nodes = [...nonRole, ...attemptedWithRole];
  });
}

export function PartiesList() {
  const attemptedDirect = useDraftStore(
    useShallow((st) => readGraphNodes(st.attempted.transaction_graph).filter((n) => n.role === "counterparty"))
  );
  const attemptedIndirect = useDraftStore(
    useShallow((st) => readGraphNodes(st.attempted.transaction_graph).filter((n) => n.role === "indirect_party"))
  );
  const correctedDirectNodes = useDraftStore(
    useShallow((st) => readGraphNodes(st.corrected.transaction_graph).filter((n) => n.role === "counterparty"))
  );
  const correctedIndirectNodes = useDraftStore(
    useShallow((st) => readGraphNodes(st.corrected.transaction_graph).filter((n) => n.role === "indirect_party"))
  );
  const setCorrected = useDraftStore((st) => st.setCorrected);

  const correctedDirect = correctedDirectNodes.map((n) => n.name);
  const correctedIndirect = correctedIndirectNodes.map((n) => n.name);

  const directChanged = JSON.stringify(correctedDirect) !== JSON.stringify(attemptedDirect.map((n) => n.name));
  const indirectChanged = JSON.stringify(correctedIndirect) !== JSON.stringify(attemptedIndirect.map((n) => n.name));

  function changePartyName(role: GraphNode["role"], filteredIdx: number, value: string) {
    setCorrected((draft) => {
      const draftNodes = readGraphNodes(draft.transaction_graph);
      let seen = 0;
      for (const node of draftNodes) {
        if (node.role === role) {
          if (seen === filteredIdx) {
            node.name = value;
            propagateNodeRename(draft.transaction_graph, node.index, value);
            return;
          }
          seen++;
        }
      }
    });
  }

  function deleteParty(role: GraphNode["role"], filteredIdx: number) {
    setCorrected((draft) => {
      const draftNodes = readGraphNodes(draft.transaction_graph);
      let seen = 0;
      for (let i = 0; i < draftNodes.length; i++) {
        if (draftNodes[i].role === role) {
          if (seen === filteredIdx) {
            const deletedIndex = draftNodes[i].index;
            draftNodes.splice(i, 1);
            // Remove orphan edges
            if (draft.transaction_graph?.edges) {
              draft.transaction_graph.edges = draft.transaction_graph.edges.filter(
                (e) => e.source_index !== deletedIndex && e.target_index !== deletedIndex
              );
            }
            return;
          }
          seen++;
        }
      }
    });
  }

  function addParty(role: GraphNode["role"]) {
    setCorrected((draft) => {
      const draftNodes = readGraphNodes(draft.transaction_graph);
      const newIndex = draftNodes.reduce((max, n) => Math.max(max, n.index), -1) + 1;
      draftNodes.push({ index: newIndex, name: "", role });
    });
  }

  return (
    <>
      {/* Direct Parties */}
      <AttemptedCorrectedRow
        changed={directChanged}
        attempted={
          <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "8px 10px", background: SILVER_BG, borderRadius: 4 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={T.fieldLabel}>Direct Parties</span>
              <span style={{ fontSize: 10, color: T.textSecondary, lineHeight: 1.4 }}>Counterparties directly exchanging value with the reporting entity.</span>
              {attemptedDirect.length > 0 ? attemptedDirect.map((n, i) => (
                <ReviewTextField key={i} value={n.name} bg={{ display: DIRECT_FIELD_BG, editing: DIRECT_FIELD_BG_EDITING }} />
              )) : (
                <ReviewTextField value="" emptyText="—" bg={{ display: DIRECT_FIELD_BG, editing: DIRECT_FIELD_BG_EDITING }} />
              )}
            </div>
            <div style={{ height: 18 }} />
          </div>
        }
        corrected={
          <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "8px 10px", background: SILVER_BG, borderRadius: 4 }}>
            <PartyListSubsection
              label="Direct Parties"
              description="Counterparties directly exchanging value with the reporting entity."
              parties={correctedDirect}
              fieldBg={DIRECT_FIELD_BG}
              fieldBgEditing={DIRECT_FIELD_BG_EDITING}
              onChange={(i, v) => changePartyName("counterparty", i, v)}
              onDelete={(i) => deleteParty("counterparty", i)}
              onAdd={() => addParty("counterparty")}
            />
            <CorrectedActionBar muted={!directChanged} variant={directChanged ? "corrected" : "attempted"} actions={[
              { label: "Reset", onClick: () => resetNodesByRole(setCorrected, "counterparty") },
            ]} />
          </div>
        }
      />

      {/* Indirect Parties */}
      <AttemptedCorrectedRow
        changed={indirectChanged}
        attempted={
          <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "8px 10px", background: SILVER_BG, borderRadius: 4 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={T.fieldLabel}>Indirect Parties</span>
              <span style={{ fontSize: 10, color: T.textSecondary, lineHeight: 1.4 }}>Third parties involved but not directly exchanging value.</span>
              {attemptedIndirect.length > 0 ? attemptedIndirect.map((n, i) => (
                <ReviewTextField key={i} value={n.name} />
              )) : (
                <ReviewTextField value="" emptyText="—" />
              )}
            </div>
            <div style={{ height: 18 }} />
          </div>
        }
        corrected={
          <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "8px 10px", background: SILVER_BG, borderRadius: 4 }}>
            <PartyListSubsection
              label="Indirect Parties"
              description="Third parties involved but not directly exchanging value."
              parties={correctedIndirect}
              fieldBg={T.fieldBg}
              fieldBgEditing={T.fieldBgEditing}
              onChange={(i, v) => changePartyName("indirect_party", i, v)}
              onDelete={(i) => deleteParty("indirect_party", i)}
              onAdd={() => addParty("indirect_party")}
            />
            <CorrectedActionBar muted={!indirectChanged} variant={indirectChanged ? "corrected" : "attempted"} actions={[
              { label: "Reset", onClick: () => resetNodesByRole(setCorrected, "indirect_party") },
            ]} />
          </div>
        }
      />
    </>
  );
}
