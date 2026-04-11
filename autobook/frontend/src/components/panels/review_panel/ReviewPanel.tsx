import { useEffect, useMemo, useRef, useState } from "react";
import { IoChevronDownSharp, IoChevronUpSharp } from "react-icons/io5";
import { SegmentedControl } from "../shared/SegmentedControl";
import { SectionSubheader } from "../shared/SectionSubheader";
import { motion, AnimatePresence } from "motion/react";
import { palette, T, entryColors, attemptedEntryColors, CURRENCY_SYM, ROLE_COLORS, roleFieldBg, roleFieldBgEditing } from "../shared/tokens";
import { ReviewTextField } from "../shared/ReviewTextField";
import { NumberField } from "../shared/NumberField";
import { DeleteButton } from "../shared/DeleteButton";
import { AddButton } from "../shared/AddButton";
import { EmptyBox } from "../shared/EmptyBox";
import { DashedArrow } from "../shared/DashedArrow";
import { DropdownSelect } from "../shared/DropdownSelect";
import { NotesTextarea } from "../shared/NotesTextarea";
import { EntryTable, EntryHeader, EntryRow, EntryTotalRow } from "../entry_panel/EntryPanel";
import type {
  JournalLine,
  AmbiguityOutput,
  HumanCorrectedTrace,
  TransactionGraphNode,
  TransactionGraphEdge,
  EdgeKind,
  HumanEditableTax,
  LineDcClassification,
} from "../../../api/types";
import { ForceGraph, toGraphData } from "../../../components/force-graph";
import type { GraphData } from "../../../components/force-graph";
import { getTaxonomy } from "../../../api/taxonomy";
import type { TaxonomyDict } from "../../../api/taxonomy";
import { useLLMInteractionStore } from "../store";
import { useShallow } from "zustand/react/shallow";
import { STATUS_VISUAL, type DiffStatus } from "./diff";
import s from "../panels.module.css";

// Local aliases for the canonical graph types so existing code keeps reading.
type GraphNode = TransactionGraphNode;
type GraphEdgeData = TransactionGraphEdge;

// ── Action Bar ──────────────────────────────────────────

const correctedActionBtn: React.CSSProperties = {
  background: "rgba(144, 169, 85, 0.15)",
  border: "none",
  borderRadius: 3,
  padding: "2px 8px",
  fontSize: 10,
  fontWeight: 600,
  color: palette.charcoalBrown,
  cursor: "pointer",
};

function CorrectedActionBar({ actions, muted, variant = "corrected" }: { actions: { label: string; onClick?: () => void; disabled?: boolean }[]; muted?: boolean; variant?: "attempted" | "corrected" }) {
  const colors = {
    attempted: { bg: "rgba(255, 165, 0, 0.15)", bgHover: "rgba(255, 165, 0, 0.25)" },
    corrected: { bg: "rgba(144, 169, 85, 0.15)", bgHover: "rgba(144, 169, 85, 0.25)" },
    muted: { bg: "rgba(204, 197, 185, 0.15)", bgHover: "rgba(204, 197, 185, 0.25)" },
  };
  const c = muted ? colors.muted : colors[variant];
  const bg = c.bg;
  const bgHover = c.bgHover;
  return (
    <div /* action bar */ style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
      {actions.map((a) => (
        <button
          key={a.label}
          className={s.buttonTransition}
          style={{ ...correctedActionBtn, background: bg, opacity: a.disabled ? 0.6 : 1, cursor: a.disabled ? "default" : "pointer" }}
          onClick={a.disabled ? undefined : a.onClick}
          onMouseEnter={(e) => { if (!a.disabled) e.currentTarget.style.background = bgHover; }}
          onMouseLeave={(e) => { if (!a.disabled) e.currentTarget.style.background = bg; }}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}

// ── Ambiguity Item Views ────────────────────────────────

/** Backwards-compatible alias used by CorrectionSummary/sections/AmbiguitySummary. */
export type AmbiguityItem = AmbiguityOutput;

/**
 * One sub-row inside an ambiguity item (Aspect / Defaults / Clarification).
 * Renders the attempted side (read-only), the arrow, and the editable
 * corrected side. Sub-rows no longer have their own disable button —
 * disabling lives at the whole-ambiguity level.
 */
function AmbiguitySubRow({ label, attemptedContent, correctedContent, changed, added, onReset }: {
  label: string;
  attemptedContent: React.ReactNode;
  correctedContent: React.ReactNode;
  changed: boolean;
  added?: boolean;
  onReset: () => void;
}) {
  const status: DiffStatus = added ? "added" : changed ? "updated" : "kept";
  const visual = STATUS_VISUAL[status];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <SectionSubheader style={{ fontSize: 10 }}>{label}</SectionSubheader>
      <AttemptedCorrectedLabels />
      <div style={{ display: "flex", gap: 0, alignItems: "stretch" }}>
        {added ? (
          <EmptyBox style={{ flex: 1 }} />
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, padding: "8px 10px", background: T.attemptedItem, borderRadius: 4, minWidth: 0 }}>
            {attemptedContent}
            <div style={{ height: 18 }} />
          </div>
        )}
        <DashedArrow label={visual.arrowLabel} color={visual.arrowColor} />
        <div style={{
          flex: 1, display: "flex", flexDirection: "column", gap: 10,
          padding: "8px 10px", background: changed || added ? T.correctedItem : T.attemptedItem, borderRadius: 4, minWidth: 0,
          transition: "background 0.15s ease",
        }}>
          {correctedContent}
          <CorrectedActionBar variant={changed ? "corrected" : "attempted"} actions={[
            { label: "Reset", onClick: onReset },
          ]} />
        </div>
      </div>
    </div>
  );
}

/**
 * Render a single ambiguity row. Driven by stable id — reads its own
 * attempted + corrected slices from the store and derives status from
 * their relationship.
 *
 * Status flow:
 *   - In attempted only → "disabled" (user removed it)
 *   - In corrected only → "added" (user added it)
 *   - In both, identical → "kept"
 *   - In both, different → "updated"
 */
function AmbiguityItemView({ id }: { id: string }) {
  const [open, setOpen] = useState(false);

  const attempted = useLLMInteractionStore((st) =>
    st.attempted.output_decision_maker?.ambiguities?.find((a) => a.id === id)
  );
  const corrected = useLLMInteractionStore((st) =>
    st.corrected.output_decision_maker?.ambiguities?.find((a) => a.id === id)
  );
  const setCorrected = useLLMInteractionStore((st) => st.setCorrected);

  if (!attempted && !corrected) return null;

  // Per-sub-row diff (only meaningful when both sides exist).
  // We do these explicitly with scalar/JSON compares because the ambiguity
  // object has nested arrays (`cases`) — `shallowEqualIgnoringId` would
  // compare those arrays by reference and incorrectly report "updated" after
  // the structuredClone done by the store on ingest.
  const aspectChanged = !!attempted && !!corrected && corrected.aspect !== attempted.aspect;
  const defaultsChanged = !!attempted && !!corrected && (
    (corrected.input_contextualized_conventional_default ?? "") !== (attempted.input_contextualized_conventional_default ?? "") ||
    (corrected.input_contextualized_ifrs_default ?? "") !== (attempted.input_contextualized_ifrs_default ?? "")
  );
  const clarificationChanged = !!attempted && !!corrected && (
    (corrected.clarification_question ?? "") !== (attempted.clarification_question ?? "") ||
    JSON.stringify((corrected.cases ?? []).map((c) => c.case)) !== JSON.stringify((attempted.cases ?? []).map((c) => c.case))
  );

  // Row-level status derived from the sub-row flags, not from computeStatus
  // (which would do object-level shallow equality and produce false positives
  // for nested arrays).
  let status: DiffStatus;
  if (!attempted) status = "added";
  else if (!corrected) status = "disabled";
  else if (aspectChanged || defaultsChanged || clarificationChanged) status = "updated";
  else status = "kept";

  // ── Mutators ──
  function mutate(updater: (amb: AmbiguityOutput) => void) {
    setCorrected((draft) => {
      const list = draft.output_decision_maker?.ambiguities;
      if (!list) return;
      const target = list.find((a) => a.id === id);
      if (target) updater(target);
    });
  }

  const setAspect = (v: string) => mutate((a) => { a.aspect = v; });
  const setConventional = (v: string) =>
    mutate((a) => { a.input_contextualized_conventional_default = v; });
  const setIfrs = (v: string) =>
    mutate((a) => { a.input_contextualized_ifrs_default = v; });
  const setQuestion = (v: string) => mutate((a) => { a.clarification_question = v; });
  const updateCaseAt = (caseIdx: number, v: string) =>
    mutate((a) => {
      if (a.cases && a.cases[caseIdx]) a.cases[caseIdx].case = v;
    });
  const addCase = () =>
    mutate((a) => {
      if (!a.cases) a.cases = [];
      a.cases.push({ id: `c-new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, case: "" });
    });
  const removeCaseAt = (caseIdx: number) =>
    mutate((a) => {
      if (a.cases) a.cases.splice(caseIdx, 1);
    });

  // ── Reset helpers (per sub-row, copy fields from attempted) ──
  const resetAspect = () => {
    if (!attempted) return;
    mutate((a) => { a.aspect = attempted.aspect; });
  };
  const resetDefaults = () => {
    if (!attempted) return;
    mutate((a) => {
      a.input_contextualized_conventional_default = attempted.input_contextualized_conventional_default;
      a.input_contextualized_ifrs_default = attempted.input_contextualized_ifrs_default;
    });
  };
  const resetClarification = () => {
    if (!attempted) return;
    mutate((a) => {
      a.clarification_question = attempted.clarification_question;
      a.cases = attempted.cases ? structuredClone(attempted.cases) : undefined;
    });
  };

  // ── Disable / re-enable (the only correction that lives at row level) ──
  const isDisabled = status === "disabled";
  const handleToggleDisable = () => {
    setCorrected((draft) => {
      const dm = draft.output_decision_maker;
      if (!dm) return;
      if (!dm.ambiguities) dm.ambiguities = [];
      if (isDisabled && attempted) {
        // Re-enable: clone attempted back into corrected
        dm.ambiguities.push(structuredClone(attempted));
      } else {
        // Disable: remove from corrected by id
        const idx = dm.ambiguities.findIndex((a) => a.id === id);
        if (idx >= 0) dm.ambiguities.splice(idx, 1);
      }
    });
  };

  // The display side (the "ambiguity" used in JSX) is attempted when present,
  // otherwise corrected (for the "added" case).
  const displayAmb = attempted ?? corrected!;
  const editAmb = corrected ?? displayAmb;
  const visual = STATUS_VISUAL[status];
  const corrTextColor = T.textPrimary;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    {/* Collapsible trigger */}
    <div
      className={s.buttonTransition}
      onClick={() => setOpen((v) => !v)}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        padding: "6px 10px", borderRadius: 4, cursor: "pointer",
        color: palette.carbonBlack, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em",
        background: open ? "rgba(204, 197, 185, 0.3)" : "transparent",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(204, 197, 185, 0.3)"; }}
      onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{ flex: 1 }}>Ambiguous aspect: {displayAmb.aspect || "(empty)"}</span>
      <span style={{
        fontSize: 9, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
        background: visual.bg, color: palette.carbonBlack,
        textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0,
      }}>{visual.arrowLabel}</span>
      <span style={{ fontSize: 12, display: "flex", flexShrink: 0 }}>
        {open ? <IoChevronUpSharp /> : <IoChevronDownSharp />}
      </span>
    </div>
    {/* Collapsible content */}
    <div className={`${s.collapsibleWrapper} ${open ? s.collapsibleWrapperOpen : ""}`}>
    <div className={s.collapsibleInner}>
    <div className={s.collapsibleFade} style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 12, paddingBottom: 12, opacity: isDisabled ? 0.5 : 1, transition: "opacity 0.15s ease" }}>

    {/* Sub-row 1: Aspect */}
    <AmbiguitySubRow label="Aspect" changed={aspectChanged} added={status === "added"}
      onReset={resetAspect}
      attemptedContent={
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={T.fieldLabel}>Ambiguous aspect</span>
          <ReviewTextField value={displayAmb.aspect} />
        </div>
      }
      correctedContent={
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ ...T.fieldLabel, color: corrTextColor }}>Ambiguous aspect</span>
          <ReviewTextField value={editAmb.aspect} onChange={setAspect} disabled={isDisabled} />
        </div>
      }
    />

    {/* Sub-row 2: Default Interpretations */}
    <AmbiguitySubRow label="Default Interpretation" changed={defaultsChanged} added={status === "added"}
      onReset={resetDefaults}
      attemptedContent={<>
        {displayAmb.input_contextualized_conventional_default && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={T.fieldLabel}>Conventional default interpretation</span>
            <ReviewTextField value={displayAmb.input_contextualized_conventional_default} />
          </div>
        )}
        {displayAmb.input_contextualized_ifrs_default && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={T.fieldLabel}>IFRS default interpretation</span>
            <ReviewTextField value={displayAmb.input_contextualized_ifrs_default} />
          </div>
        )}
      </>}
      correctedContent={<>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ ...T.fieldLabel, color: corrTextColor }}>Conventional default interpretation</span>
          <ReviewTextField value={editAmb.input_contextualized_conventional_default ?? ""} onChange={setConventional} emptyText="—" disabled={isDisabled} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ ...T.fieldLabel, color: corrTextColor }}>IFRS default interpretation</span>
          <ReviewTextField value={editAmb.input_contextualized_ifrs_default ?? ""} onChange={setIfrs} emptyText="—" disabled={isDisabled} />
        </div>
      </>}
    />

    {/* Sub-row 3: Clarification */}
    <AmbiguitySubRow label="Clarification" changed={clarificationChanged} added={status === "added"}
      onReset={resetClarification}
      attemptedContent={<>
        {displayAmb.clarification_question && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={T.fieldLabel}>Clarification question that should have been asked</span>
            <ReviewTextField value={displayAmb.clarification_question} />
          </div>
        )}
        {displayAmb.cases && displayAmb.cases.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={T.fieldLabel}>Possible cases</span>
            {displayAmb.cases.map((c, i) => (
              <div key={c.id || i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ ...T.fieldLabel, whiteSpace: "nowrap" }}>Case {i + 1}:</span>
                <ReviewTextField value={c.case} flex={1} />
              </div>
            ))}
          </div>
        )}
      </>}
      correctedContent={<>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ ...T.fieldLabel, color: corrTextColor }}>Clarification question that should have been asked</span>
          <ReviewTextField value={editAmb.clarification_question ?? ""} onChange={setQuestion} emptyText="—" disabled={isDisabled} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ ...T.fieldLabel, color: corrTextColor }}>Possible cases</span>
          {(editAmb.cases ?? []).map((c, i) => (
            <div key={c.id || i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ ...T.fieldLabel, whiteSpace: "nowrap" }}>Case {i + 1}:</span>
              <ReviewTextField value={c.case} onChange={(v) => updateCaseAt(i, v)} flex={1} disabled={isDisabled} />
              <DeleteButton onClick={() => removeCaseAt(i)} />
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
            <AddButton onClick={addCase} title="Add case" />
          </div>
        </div>
      </>}
    />

    {/* Flag as unambiguous — toggles "remove from corrected" */}
    {attempted && (
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          className={s.buttonTransition}
          onClick={handleToggleDisable}
          title="This transaction does not have the stated ambiguity"
          style={{
            background: "rgba(204, 197, 185, 0.15)",
            border: "none",
            borderRadius: 3,
            padding: "2px 8px",
            fontSize: 10,
            fontWeight: 600,
            color: palette.carbonBlack,
            cursor: "pointer",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(204, 197, 185, 0.25)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(204, 197, 185, 0.15)"; }}
        >
          {isDisabled ? "Flagged as unambiguous" : "Flag as unambiguous"}
        </button>
      </div>
    )}

    </div>
    </div>
    </div>
    </div>
  );
}

// ── Ambiguity Review Container ──────────────────────────

let _ambIdCounter = 0;
function newAmbiguityId(): string {
  _ambIdCounter += 1;
  return `a-new-${Date.now()}-${_ambIdCounter}`;
}

/**
 * Container for the ambiguity review step. Renders one row per unique
 * ambiguity id across both attempted and corrected lists, in order:
 *   1. Each attempted id (status: kept | updated | disabled)
 *   2. Each corrected id not in attempted (status: added)
 *
 * Per-row diff/visuals are derived inside AmbiguityItemView via
 * `computeStatus`. The container only owns the id ordering and the
 * "Add ambiguity" action.
 */
export function AmbiguityReviewContainer() {
  const attemptedIds = useLLMInteractionStore(
    useShallow((st) =>
      (st.attempted.output_decision_maker?.ambiguities ?? []).map((a) => a.id)
    )
  );
  const correctedIds = useLLMInteractionStore(
    useShallow((st) =>
      (st.corrected.output_decision_maker?.ambiguities ?? []).map((a) => a.id)
    )
  );
  const setCorrected = useLLMInteractionStore((st) => st.setCorrected);

  // Order: attempted ids first, then any corrected ids not present in attempted (added).
  const attemptedSet = new Set(attemptedIds);
  const orderedIds = [
    ...attemptedIds,
    ...correctedIds.filter((id) => !attemptedSet.has(id)),
  ];

  function handleAddAmbiguity() {
    setCorrected((draft) => {
      if (!draft.output_decision_maker) {
        draft.output_decision_maker = { decision: "PROCEED", rationale: "", ambiguities: [] };
      }
      if (!draft.output_decision_maker.ambiguities) {
        draft.output_decision_maker.ambiguities = [];
      }
      draft.output_decision_maker.ambiguities.push({
        id: newAmbiguityId(),
        aspect: "",
        ambiguous: true,
        input_contextualized_conventional_default: "",
        input_contextualized_ifrs_default: "",
        clarification_question: "",
        cases: [],
      });
    });
  }

  return (
    <ReviewSectionLayout sectionKey="ambiguity"
      notesPlaceholder="If there is anything else in addition to the corrections above — such as patterns the agent consistently misses, ambiguities it fails to detect, or context it should have considered — note it here."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
        <Subsection title="Ambiguities">
          {orderedIds.map((id) => (
            <div key={id}>
              <AmbiguityItemView id={id} />
            </div>
          ))}
          <button
            className={s.buttonTransition}
            style={{
              width: "100%",
              background: "rgba(204, 197, 185, 0.2)",
              border: "none",
              borderRadius: 4,
              padding: "6px 10px",
              fontSize: 10,
              fontWeight: 600,
              textTransform: "uppercase" as const,
              letterSpacing: "0.05em",
              color: palette.carbonBlack,
              cursor: "pointer",
              textAlign: "center",
            }}
            onClick={handleAddAmbiguity}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(204, 197, 185, 0.3)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(204, 197, 185, 0.2)"; }}
          >
            + Add ambiguity
          </button>
        </Subsection>
        <Subsection title="Conclusion">
          <DecisionItemView />
        </Subsection>
      </div>
    </ReviewSectionLayout>
  );
}

// ── Shared review section layout ─────────────────────

const AttemptedCorrectedLabels = () => (
  <div style={{ display: "flex", alignItems: "baseline" }}>
    <SectionSubheader style={{ flex: 1, fontSize: 10 }}>Attempted</SectionSubheader>
    <div style={{ width: 100, flexShrink: 0 }} />
    <SectionSubheader style={{ flex: 1, fontSize: 10 }}>Corrected</SectionSubheader>
  </div>
);

function Subsection({ title, gap = 8, children }: { title: string; gap?: number; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      <SectionSubheader>{title}</SectionSubheader>
      {children}
    </div>
  );
}

/**
 * Per-section key for the corrected.notes slot. One per review step.
 */
type NotesSectionKey = keyof HumanCorrectedTrace["notes"];

/**
 * Wraps a review section's body and adds a controlled "Additional Notes"
 * textarea at the bottom. The notes value lives in `corrected.notes[sectionKey]`
 * — the store is the single source of truth so notes survive step changes
 * and modal close/reopen.
 */
function ReviewSectionLayout({ children, notesPlaceholder, sectionKey }: {
  children: React.ReactNode;
  notesPlaceholder: string;
  sectionKey: NotesSectionKey;
}) {
  const notes = useLLMInteractionStore((st) => st.corrected.notes[sectionKey]);
  const setCorrected = useLLMInteractionStore((st) => st.setCorrected);
  const handleNotesChange = (v: string) => {
    setCorrected((draft) => {
      draft.notes[sectionKey] = v;
    });
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 40, flex: 1 }}>
      {children}
      <NotesTextarea
        placeholder={notesPlaceholder}
        value={notes}
        onChange={handleNotesChange}
      />
    </div>
  );
}

// ── Transaction Analysis Review ─────────────────────

const SILVER_BG = "rgba(204, 197, 185, 0.2)";
const REPORTING_FIELD_BG = roleFieldBg("reporting_entity");
const REPORTING_FIELD_BG_EDITING = roleFieldBgEditing("reporting_entity");

// Read helpers — null-safe extraction from a (possibly null) transaction graph.
function readGraphNodes(graph: { nodes?: GraphNode[] } | null | undefined): GraphNode[] {
  return graph?.nodes ?? [];
}

function readGraphEdges(graph: { edges?: GraphEdgeData[] } | null | undefined): GraphEdgeData[] {
  return graph?.edges ?? [];
}

function ReportingEntityView() {
  // Read both sides from the store. Fine-grained selectors: only re-render when
  // the reporting-entity node's name actually changes.
  const attemptedName = useLLMInteractionStore((st) =>
    readGraphNodes(st.attempted.transaction_graph).find((n) => n.role === "reporting_entity")?.name ?? ""
  );
  const correctedName = useLLMInteractionStore((st) =>
    readGraphNodes(st.corrected.transaction_graph).find((n) => n.role === "reporting_entity")?.name ?? ""
  );
  const setCorrected = useLLMInteractionStore((st) => st.setCorrected);

  const changed = correctedName !== attemptedName;
  const itemBg = SILVER_BG;
  const corrBg = changed ? T.correctedItem : SILVER_BG;
  const arrowColor = changed ? palette.fern : palette.charcoalBrown;
  const arrowLabel = changed ? "Update" : "Keep";

  const handleChange = (v: string) => {
    setCorrected((draft) => {
      const node = readGraphNodes(draft.transaction_graph).find((n) => n.role === "reporting_entity");
      if (node) node.name = v;
    });
  };

  const handleReset = () => {
    setCorrected((draft) => {
      const attempted = useLLMInteractionStore.getState().attempted;
      const sourceNode = readGraphNodes(attempted.transaction_graph).find((n) => n.role === "reporting_entity");
      const draftNode = readGraphNodes(draft.transaction_graph).find((n) => n.role === "reporting_entity");
      if (draftNode && sourceNode) draftNode.name = sourceNode.name;
    });
  };

  return (
    <>
      <AttemptedCorrectedLabels />
      <div style={{ display: "flex", gap: 0, alignItems: "stretch" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, padding: "8px 10px", background: itemBg, borderRadius: 4, minWidth: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={T.fieldLabel}>Reporting Entity</span>
            <ReviewTextField value={attemptedName} bg={{ display: REPORTING_FIELD_BG, editing: REPORTING_FIELD_BG_EDITING }} />
          </div>
          <div style={{ height: 18 }} />
        </div>
        <DashedArrow label={arrowLabel} color={arrowColor} />
        <div style={{
          flex: 1, display: "flex", flexDirection: "column", gap: 10,
          padding: "8px 10px", background: corrBg, borderRadius: 4, minWidth: 0,
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={T.fieldLabel}>Reporting Entity</span>
            <ReviewTextField
              value={correctedName}
              onChange={handleChange}
              bg={{ display: REPORTING_FIELD_BG, editing: REPORTING_FIELD_BG_EDITING }}
            />
          </div>
          <CorrectedActionBar muted={!changed} variant={changed ? "corrected" : "attempted"} actions={[
            { label: "Reset", onClick: handleReset },
          ]} />
        </div>
      </div>
    </>
  );
}

const DIRECT_FIELD_BG = roleFieldBg("counterparty");
const DIRECT_FIELD_BG_EDITING = roleFieldBgEditing("counterparty");

function PartyListSubsection({ label, parties, fieldBg, fieldBgEditing, onChange, onDelete, onAdd }: {
  label: string;
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
      {parties.map((name, i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <ReviewTextField
            value={name}
            onChange={(v) => onChange(i, v)}
            bg={{ display: fieldBg, editing: fieldBgEditing }}
            flex={1}
          />
          <DeleteButton onClick={() => onDelete(i)} />
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
        <AddButton onClick={onAdd} title="Add party" />
      </div>
    </div>
  );
}

/**
 * Replace all corrected nodes with the given role using attempted's nodes
 * with that role. Other roles are preserved.
 */
function resetNodesByRole(
  setCorrected: (updater: (draft: HumanCorrectedTrace) => void) => void,
  role: GraphNode["role"]
) {
  setCorrected((draft) => {
    const attempted = useLLMInteractionStore.getState().attempted;
    const graph = draft.transaction_graph;
    if (!graph) return;
    const draftNodes = graph.nodes;
    const attemptedNodes = readGraphNodes(attempted.transaction_graph);
    const nonRole = draftNodes.filter((n) => n.role !== role);
    const attemptedWithRole = attemptedNodes
      .filter((n) => n.role === role)
      .map((n) => ({ ...n }));
    graph.nodes = [...nonRole, ...attemptedWithRole];
  });
}

function PartiesInvolvedItemView() {
  // Read attempted + corrected node lists, filtered by role.
  // .filter() returns a new array reference each call, so we wrap the selector
  // in useShallow to compare contents (not reference) and avoid the
  // "getSnapshot should be cached" infinite re-render loop.
  const attemptedDirect = useLLMInteractionStore(
    useShallow((st) =>
      readGraphNodes(st.attempted.transaction_graph).filter((n) => n.role === "counterparty")
    )
  );
  const attemptedIndirect = useLLMInteractionStore(
    useShallow((st) =>
      readGraphNodes(st.attempted.transaction_graph).filter((n) => n.role === "indirect_party")
    )
  );
  const correctedDirectNodes = useLLMInteractionStore(
    useShallow((st) =>
      readGraphNodes(st.corrected.transaction_graph).filter((n) => n.role === "counterparty")
    )
  );
  const correctedIndirectNodes = useLLMInteractionStore(
    useShallow((st) =>
      readGraphNodes(st.corrected.transaction_graph).filter((n) => n.role === "indirect_party")
    )
  );
  const setCorrected = useLLMInteractionStore((st) => st.setCorrected);

  const correctedDirect = correctedDirectNodes.map((n) => n.name);
  const correctedIndirect = correctedIndirectNodes.map((n) => n.name);

  const directChanged = JSON.stringify(correctedDirect) !== JSON.stringify(attemptedDirect.map((n) => n.name));
  const indirectChanged = JSON.stringify(correctedIndirect) !== JSON.stringify(attemptedIndirect.map((n) => n.name));

  const itemBg = SILVER_BG;

  // Mutate the i-th node of `role` in the corrected nodes array
  function changePartyName(role: GraphNode["role"], filteredIdx: number, value: string) {
    setCorrected((draft) => {
      const draftNodes = readGraphNodes(draft.transaction_graph);
      let seen = 0;
      for (const node of draftNodes) {
        if (node.role === role) {
          if (seen === filteredIdx) {
            node.name = value;
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
            draftNodes.splice(i, 1);
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

  const handleResetDirect = () => resetNodesByRole(setCorrected, "counterparty");
  const handleResetIndirect = () => resetNodesByRole(setCorrected, "indirect_party");

  return (
    <>
      <AttemptedCorrectedLabels />
      {/* Row 1: Direct Parties */}
      <div style={{ display: "flex", gap: 0, alignItems: "stretch" }}>
        {/* Attempted */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, padding: "8px 10px", background: itemBg, borderRadius: 4, minWidth: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={T.fieldLabel}>Direct Parties</span>
            {attemptedDirect.length > 0 ? attemptedDirect.map((n, i) => (
              <ReviewTextField key={i} value={n.name} bg={{ display: DIRECT_FIELD_BG, editing: DIRECT_FIELD_BG_EDITING }} />
            )) : (
              <ReviewTextField value="" emptyText="—" bg={{ display: DIRECT_FIELD_BG, editing: DIRECT_FIELD_BG_EDITING }} />
            )}
          </div>
          <div style={{ height: 18 }} />
        </div>
        {/* Arrow */}
        <DashedArrow label={directChanged ? "Update" : "Keep"} color={directChanged ? palette.fern : palette.charcoalBrown} />
        {/* Corrected */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "column", gap: 16,
          padding: "8px 10px", background: directChanged ? T.correctedItem : SILVER_BG, borderRadius: 4, minWidth: 0,
        }}>
          <PartyListSubsection
            label="Direct Parties"
            parties={correctedDirect}
            fieldBg={DIRECT_FIELD_BG}
            fieldBgEditing={DIRECT_FIELD_BG_EDITING}
            onChange={(i, v) => changePartyName("counterparty", i, v)}
            onDelete={(i) => deleteParty("counterparty", i)}
            onAdd={() => addParty("counterparty")}
          />
          <CorrectedActionBar muted={!directChanged} variant={directChanged ? "corrected" : "attempted"} actions={[
            { label: "Reset", onClick: handleResetDirect },
          ]} />
        </div>
      </div>

      {/* Row 2: Indirect Parties */}
      <div style={{ display: "flex", gap: 0, alignItems: "stretch" }}>
        {/* Attempted */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, padding: "8px 10px", background: itemBg, borderRadius: 4, minWidth: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={T.fieldLabel}>Indirect Parties</span>
            {attemptedIndirect.length > 0 ? attemptedIndirect.map((n, i) => (
              <ReviewTextField key={i} value={n.name} />
            )) : (
              <ReviewTextField value="" emptyText="—" />
            )}
          </div>
          <div style={{ height: 18 }} />
        </div>
        {/* Arrow */}
        <DashedArrow label={indirectChanged ? "Update" : "Keep"} color={indirectChanged ? palette.fern : palette.charcoalBrown} />
        {/* Corrected */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "column", gap: 16,
          padding: "8px 10px", background: indirectChanged ? T.correctedItem : SILVER_BG, borderRadius: 4, minWidth: 0,
        }}>
          <PartyListSubsection
            label="Indirect Parties"
            parties={correctedIndirect}
            fieldBg={T.fieldBg}
            fieldBgEditing={T.fieldBgEditing}
            onChange={(i, v) => changePartyName("indirect_party", i, v)}
            onDelete={(i) => deleteParty("indirect_party", i)}
            onAdd={() => addParty("indirect_party")}
          />
          <CorrectedActionBar muted={!indirectChanged} variant={indirectChanged ? "corrected" : "attempted"} actions={[
            { label: "Reset", onClick: handleResetIndirect },
          ]} />
        </div>
      </div>
    </>
  );
}

// ── Value Flows ──────────────────────────────────────

const KIND_LABELS: Record<EdgeKind, string> = {
  reciprocal_exchange: "Reciprocal exchange",
  chained_exchange:    "Chained exchange",
  non_exchange:        "Non-exchange",
  relationship:        "Relationship",
};
const KIND_OPTIONS = Object.values(KIND_LABELS);

function labelToKind(label: string): EdgeKind {
  const entry = (Object.entries(KIND_LABELS) as [EdgeKind, string][]).find(([, v]) => v === label);
  return entry?.[0] ?? "reciprocal_exchange";
}

const CURRENCY_OPTIONS = Object.keys(CURRENCY_SYM);

const ARROW_DIRECTION_WIDTH = 128;
const ARROW_GAP = 32;
const ARROW_SOURCE_X = ARROW_DIRECTION_WIDTH;
const ARROW_TARGET_X = ARROW_DIRECTION_WIDTH + ARROW_GAP;

/**
 * Measures the body container, source box, and each edge row to compute
 * pixel y-coordinates needed by FanOutArrowOverlay. All ys are relative
 * to the body container's top.
 */
function useEdgeRowMeasurements(edgeCount: number) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [measurements, setMeasurements] = useState<{
    bodyHeight: number;
    sourceY: number;
    targetYs: number[];
  }>({ bodyHeight: 0, sourceY: 0, targetYs: [] });

  useEffect(() => {
    function measure() {
      const container = containerRef.current;
      if (!container) return;
      const cRect = container.getBoundingClientRect();
      const sRect = sourceRef.current?.getBoundingClientRect();
      const sourceY = sRect
        ? (sRect.top + sRect.bottom) / 2 - cRect.top
        : cRect.height / 2;
      const targetYs = rowRefs.current.slice(0, edgeCount).map((row) => {
        if (!row) return 0;
        const r = row.getBoundingClientRect();
        return (r.top + r.bottom) / 2 - cRect.top;
      });
      setMeasurements({ bodyHeight: cRect.height, sourceY, targetYs });
    }

    measure();

    const obs = new ResizeObserver(measure);
    if (containerRef.current) obs.observe(containerRef.current);
    if (sourceRef.current) obs.observe(sourceRef.current);
    rowRefs.current.slice(0, edgeCount).forEach((r) => { if (r) obs.observe(r); });
    return () => obs.disconnect();
  }, [edgeCount]);

  return { containerRef, sourceRef, rowRefs, measurements };
}

/**
 * Curved dashed arrows fanning out from one source point to N target ys.
 * Lives as an absolute overlay above the Direction column. Animates the
 * stroke-dashoffset like the existing DashedArrow.
 */
function FanOutArrowOverlay({ bodyHeight, sourceY, targetYs }: {
  bodyHeight: number;
  sourceY: number;
  targetYs: number[];
}) {
  if (bodyHeight === 0 || targetYs.length === 0) return null;
  return (
    <svg
      width={ARROW_TARGET_X}
      height={bodyHeight}
      viewBox={`0 0 ${ARROW_TARGET_X} ${bodyHeight}`}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        pointerEvents: "none",
        overflow: "visible",
      }}
    >
      {targetYs.map((y, i) => {
        const midX = (ARROW_SOURCE_X + ARROW_TARGET_X) / 2;
        const path = `M ${ARROW_SOURCE_X} ${sourceY} C ${midX} ${sourceY}, ${midX} ${y}, ${ARROW_TARGET_X} ${y}`;
        return (
          <path
            key={i}
            d={path}
            fill="none"
            stroke={palette.charcoalBrown}
            strokeWidth="1.5"
            strokeDasharray="4 3"
            opacity={0.7}
          >
            <animate attributeName="stroke-dashoffset" from="7" to="0" dur="0.6s" repeatCount="indefinite" />
          </path>
        );
      })}
    </svg>
  );
}

const valueHeaderStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, color: palette.charcoalBrown,
  textTransform: "uppercase", letterSpacing: "0.05em",
  padding: "2px 6px", minWidth: 0,
};

function ValueHeaderRow() {
  return (
    <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
      <div style={{ ...valueHeaderStyle, flex: 1.2 }}>Target</div>
      <div style={{ ...valueHeaderStyle, flex: 2 }}>Nature</div>
      <div style={{ ...valueHeaderStyle, flex: 1.5 }}>Kind</div>
      <div style={{ ...valueHeaderStyle, flex: 0.8 }}>Amount</div>
      <div style={{ ...valueHeaderStyle, flex: 0.6 }}>Currency</div>
      <div style={{ width: 14, flexShrink: 0 }} />
    </div>
  );
}

function EdgeRow({ edge, allNodes, onChange, onDelete, rowRef }: {
  edge: GraphEdgeData;
  allNodes: GraphNode[];
  onChange: (patch: Partial<GraphEdgeData>) => void;
  onDelete: () => void;
  rowRef: (el: HTMLDivElement | null) => void;
}) {
  const targetNode = allNodes.find((n) => n.index === edge.target_index);
  const targetRole = targetNode?.role ?? "indirect_party";
  const targetBg = roleFieldBg(targetRole);
  const targetBgEditing = roleFieldBgEditing(targetRole);

  const isRelationship = edge.kind === "relationship";

  // Unified bg pair for the target column (role-colored by target's role)
  const targetBgPair = { display: targetBg, editing: targetBgEditing };

  return (
    <div ref={rowRef} style={{ display: "flex", gap: 5, alignItems: "center" }}>
      {/* Target */}
      <div style={{ flex: 1.2, minWidth: 0 }}>
        <DropdownSelect
          value={edge.target || null}
          options={allNodes.map((n) => n.name)}
          placeholder="—"
          onChange={(name) => {
            const n = allNodes.find((x) => x.name === name);
            onChange({ target: name, target_index: n?.index ?? -1 });
          }}
          bg={targetBgPair}
          style={{ width: "100%" }}
        />
      </div>

      {/* Nature */}
      <div style={{ flex: 2, minWidth: 0 }}>
        <ReviewTextField
          value={edge.nature}
          onChange={(v) => onChange({ nature: v })}
          emptyText="—"
        />
      </div>

      {/* Kind */}
      <div style={{ flex: 1.5, minWidth: 0 }}>
        <DropdownSelect
          value={KIND_LABELS[edge.kind]}
          options={KIND_OPTIONS}
          onChange={(v) => onChange({ kind: labelToKind(v) })}
          style={{ width: "100%" }}
        />
      </div>

      {/* Amount — disabled when kind=relationship */}
      <div style={{ flex: 0.8, minWidth: 0 }}>
        <NumberField
          value={edge.amount}
          disabled={isRelationship}
          step="0.01"
          onChange={(v) => onChange({ amount: v })}
          emptyText="—"
        />
      </div>

      {/* Currency — disabled when kind=relationship */}
      <div style={{ flex: 0.6, minWidth: 0 }}>
        <DropdownSelect
          value={edge.currency || null}
          options={CURRENCY_OPTIONS}
          placeholder="—"
          onChange={(v) => onChange({ currency: v })}
          disabled={isRelationship}
          style={{ width: "100%" }}
        />
      </div>

      {/* Delete */}
      <div style={{ width: 14, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <DeleteButton onClick={onDelete} />
      </div>
    </div>
  );
}

let _edgeIdCounter = 0;
function newEdgeId(): string {
  _edgeIdCounter += 1;
  return `e-new-${Date.now()}-${_edgeIdCounter}`;
}

function ValueFlowRow({ nodeIndex }: { nodeIndex: number }) {
  // .find() returns the same node object reference if the node array is unchanged
  // — primitive selector, no shallow needed.
  const node = useLLMInteractionStore((st) =>
    readGraphNodes(st.corrected.transaction_graph).find((n) => n.index === nodeIndex)
  );
  // .filter() / list reads create new array references each call, so wrap in
  // useShallow to compare contents (avoids the "getSnapshot should be cached"
  // infinite re-render loop).
  const allNodes = useLLMInteractionStore(
    useShallow((st) => readGraphNodes(st.corrected.transaction_graph))
  );
  const attemptedEdges = useLLMInteractionStore(
    useShallow((st) =>
      readGraphEdges(st.attempted.transaction_graph).filter((e) => e.source_index === nodeIndex)
    )
  );
  const correctedEdges = useLLMInteractionStore(
    useShallow((st) =>
      readGraphEdges(st.corrected.transaction_graph).filter((e) => e.source_index === nodeIndex)
    )
  );
  const setCorrected = useLLMInteractionStore((st) => st.setCorrected);

  const { containerRef, sourceRef, rowRefs, measurements } = useEdgeRowMeasurements(correctedEdges.length);

  if (!node) return null;

  const changed = JSON.stringify(correctedEdges) !== JSON.stringify(attemptedEdges);
  const sourceBg = roleFieldBg(node.role);
  const sourceBgEditing = roleFieldBgEditing(node.role);

  // ── Mutation helpers (operate on the absolute graph.edges array, by edge id) ──
  function addEdge() {
    setCorrected((draft) => {
      const graph = draft.transaction_graph;
      if (!graph) return;
      graph.edges.push({
        id: newEdgeId(),
        source: node!.name,
        source_index: nodeIndex,
        target: "",
        target_index: -1,
        nature: "",
        kind: "reciprocal_exchange",
        amount: null,
        currency: null,
      });
    });
  }

  function updateEdge(edgeId: string, patch: Partial<GraphEdgeData>) {
    setCorrected((draft) => {
      const graph = draft.transaction_graph;
      if (!graph) return;
      const target = graph.edges.find((e) => e.id === edgeId);
      if (target) Object.assign(target, patch);
    });
  }

  function deleteEdge(edgeId: string) {
    setCorrected((draft) => {
      const graph = draft.transaction_graph;
      if (!graph) return;
      const idx = graph.edges.findIndex((e) => e.id === edgeId);
      if (idx >= 0) graph.edges.splice(idx, 1);
    });
  }

  function handleReset() {
    setCorrected((draft) => {
      const draftGraph = draft.transaction_graph;
      if (!draftGraph) return;
      // Drop this row's edges
      draftGraph.edges = draftGraph.edges.filter((e) => e.source_index !== nodeIndex);
      // Re-add attempted edges from this row, filtered to keep only those whose
      // endpoints still exist in the corrected node set
      const validIndices = new Set(draftGraph.nodes.map((n) => n.index));
      const attempted = useLLMInteractionStore.getState().attempted;
      const restored = readGraphEdges(attempted.transaction_graph)
        .filter((e) => e.source_index === nodeIndex && validIndices.has(e.target_index))
        .map((e) => structuredClone(e));
      draftGraph.edges.push(...restored);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {/* Header (uppercase node name acts as row divider) */}
      <SectionSubheader style={{ fontSize: 10 }}>{node.name}</SectionSubheader>

      {/* Body — silver bg wrapping Direction + Value + Add + ActionBar */}
      <div style={{
        background: SILVER_BG, borderRadius: 4, padding: "8px 10px",
        display: "flex", flexDirection: "column", gap: 8,
      }}>
        {correctedEdges.length > 0 && (
          <div ref={containerRef} style={{ position: "relative", display: "flex", gap: ARROW_GAP, alignItems: "stretch" }}>
            {/* Fan-out arrow overlay (absolute, drawn over the Direction column) */}
            <FanOutArrowOverlay
              bodyHeight={measurements.bodyHeight}
              sourceY={measurements.sourceY}
              targetYs={measurements.targetYs}
            />
            {/* Direction column: SOURCE header + source box vertically centered */}
            <div style={{
              width: ARROW_DIRECTION_WIDTH, flexShrink: 0,
              display: "flex", flexDirection: "column", gap: 4,
              padding: 0,
            }}>
              <div style={valueHeaderStyle}>Source</div>
              <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
                <div ref={sourceRef} style={{ width: "100%" }}>
                  <ReviewTextField
                    value={node.name}
                    bg={{ display: sourceBg, editing: sourceBgEditing }}
                  />
                </div>
              </div>
            </div>
            {/* Value column: header + edge rows */}
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
              <ValueHeaderRow />
              {correctedEdges.map((edge, i) => (
                <EdgeRow
                  key={edge.id}
                  edge={edge}
                  allNodes={allNodes}
                  onChange={(patch) => updateEdge(edge.id, patch)}
                  onDelete={() => deleteEdge(edge.id)}
                  rowRef={(el) => { rowRefs.current[i] = el; }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Add edge button — always visible (empty state = just this button) */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <AddButton onClick={addEdge} title="Add edge" />
        </div>

        {/* Action bar */}
        <CorrectedActionBar
          muted={!changed}
          variant={changed ? "corrected" : "attempted"}
          actions={[
            { label: "Reset", onClick: handleReset },
          ]}
        />
      </div>
    </div>
  );
}

function ValueFlowsContainer() {
  // Rows are driven by the corrected nodes — Parties Involved adds/deletes
  // automatically propagate via the store. Each row reads its own attempted
  // and corrected edges via its own selectors.
  const correctedNodes = useLLMInteractionStore(
    useShallow((st) => readGraphNodes(st.corrected.transaction_graph))
  );
  if (correctedNodes.length === 0) {
    return <EmptyBox label="No nodes" style={{ padding: "20px 10px" }} />;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {correctedNodes.map((n) => (
        <ValueFlowRow key={n.index} nodeIndex={n.index} />
      ))}
    </div>
  );
}

export function TransactionAnalysisContainer() {
  // Read the attempted graph from the store. The graph is shown in the
  // visualization (read-only); the editable fields below it (entity, parties)
  // get their data from the store directly via their own selectors.
  const graph = useLLMInteractionStore((st) => st.attempted.transaction_graph);
  const graphData: GraphData | null = useMemo(() => graph ? toGraphData(graph as Parameters<typeof toGraphData>[0]) : null, [graph]);
  const nodes = graph?.nodes;
  const hasReportingEntity = !!nodes?.find((n) => n.role === "reporting_entity");
  const hasParties = !!nodes && nodes.length > 1;

  return (
    <ReviewSectionLayout sectionKey="transactionAnalysis"
      notesPlaceholder="Any additional notes about the transaction structure — such as missing parties, incorrect relationships, or value flow errors."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
        <Subsection title="Transaction Structure" gap={16}>
          <div style={{ width: "100%", height: 350, borderRadius: 8, overflow: "hidden" }}>
            {graphData ? (
              <ForceGraph data={graphData} />
            ) : (
              <EmptyBox label="No transaction graph" style={{ height: "100%" }} />
            )}
          </div>
        </Subsection>
        <Subsection title="Reporting Entity">
          {hasReportingEntity ? (
            <ReportingEntityView />
          ) : (
            <EmptyBox label="No reporting entity" style={{ padding: "20px 10px" }} />
          )}
        </Subsection>
        <Subsection title="Parties Involved">
          {hasParties ? (
            <PartiesInvolvedItemView />
          ) : (
            <EmptyBox label="No parties" style={{ padding: "20px 10px" }} />
          )}
        </Subsection>
        <Subsection title="Value Flows">
          <ValueFlowsContainer />
        </Subsection>
      </div>
    </ReviewSectionLayout>
  );
}

// ── Review sections ──────────────────────────────────

export const REVIEW_SECTIONS = [
  { key: "transaction_analysis", title: "Transaction Analysis" },
  { key: "ambiguity", title: "Ambiguity" },
  { key: "tax", title: "Tax" },
  { key: "final_entry", title: "Final Entry" },
  { key: "summary", title: "Correction Summary" },
] as const;

// ── Final Decision Review ────────────────────────────

function DecisionItemView() {
  const attemptedDecision = useLLMInteractionStore((st) => st.attempted.decision);
  const attemptedRationale = useLLMInteractionStore(
    (st) => st.attempted.output_decision_maker?.rationale ?? ""
  );
  const correctedDecision = useLLMInteractionStore((st) => st.corrected.decision);
  const correctedRationale = useLLMInteractionStore(
    (st) => st.corrected.output_decision_maker?.rationale ?? ""
  );
  const setCorrected = useLLMInteractionStore((st) => st.setCorrected);

  const isComplete = attemptedDecision === "PROCEED";
  const correctedComplete = correctedDecision === "PROCEED";

  const handleSetComplete = (complete: boolean) => {
    setCorrected((draft) => {
      draft.decision = complete ? "PROCEED" : "MISSING_INFO";
    });
  };

  const handleSetRationale = (v: string) => {
    setCorrected((draft) => {
      if (draft.output_decision_maker) {
        draft.output_decision_maker.rationale = v;
      }
    });
  };

  function handleReset() {
    setCorrected((draft) => {
      const attempted = useLLMInteractionStore.getState().attempted;
      draft.decision = attempted.decision;
      if (draft.output_decision_maker) {
        draft.output_decision_maker.rationale =
          attempted.output_decision_maker?.rationale ?? "";
      }
    });
  }

  const changed = correctedComplete !== isComplete || correctedRationale !== attemptedRationale;
  const itemBg = T.attemptedItem;
  const corrBg = changed ? T.correctedItem : T.attemptedItem;
  const corrTextColor = T.textPrimary;
  const arrowColor = changed ? palette.fern : palette.charcoalBrown;
  const arrowLabel = changed ? "Update" : "Keep";


  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    <AttemptedCorrectedLabels />
    <div style={{ display: "flex", gap: 0, alignItems: "stretch" }}>
      {/* Attempted */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column", gap: 16,
        padding: "8px 10px", background: itemBg, borderRadius: 4, minWidth: 0,
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={T.fieldLabel}>Ambiguity Conclusion</span>
          <div style={{ fontSize: 12, color: T.textPrimary, lineHeight: 2.2 }}>
            This transaction has{" "}
            <DropdownSelect value={isComplete ? "Complete" : "Incomplete"} options={["Complete", "Incomplete"]} />
            {" "}information to draft a journal entry.
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={T.fieldLabel}>Rationale</span>
          <ReviewTextField value={attemptedRationale} />
        </div>
        <div style={{ height: 18 }} />
      </div>
      {/* Arrow */}
      <DashedArrow label={arrowLabel} color={arrowColor} />
      {/* Corrected */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column", gap: 16,
        padding: "8px 10px", background: corrBg, borderRadius: 4, minWidth: 0,
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={T.fieldLabel}>Ambiguity Conclusion</span>
          <div style={{ fontSize: 12, color: corrTextColor, lineHeight: 2.2 }}>
            This transaction has{" "}
            <DropdownSelect value={correctedComplete ? "Complete" : "Incomplete"} options={["Complete", "Incomplete"]}
              onChange={(v) => handleSetComplete(v === "Complete")} />
            {" "}information to draft a journal entry.
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={T.fieldLabel}>Rationale</span>
          <ReviewTextField value={correctedRationale} onChange={handleSetRationale} />
        </div>
        <CorrectedActionBar variant={changed ? "corrected" : "attempted"} actions={[
          { label: "Reset", onClick: handleReset },
        ]} />
      </div>
    </div>
    </div>
  );
}


// ── Final Entry Review ───────────────────────────────

type EntryData = {
  reason: string;
  currency: string;
  lines: JournalLine[];
};

// ── FinalEntryItemView (controlled) ─────────────────
function FinalEntryItemView({ data, correctedLines, lineKeys, correctedReason, changed, sym, onLineChange, onAddLine, onDeleteLine, onReasonChange, onReset }: {
  data: EntryData;
  correctedLines: JournalLine[];
  lineKeys: string[];
  correctedReason: string;
  changed: boolean;
  sym: string;
  onLineChange: (i: number, line: JournalLine) => void;
  onAddLine: (i: number) => void;
  onDeleteLine: (i: number) => void;
  onReasonChange: (reason: string) => void;
  onReset: () => void;
}) {
  const arrowColor = changed ? palette.fern : palette.charcoalBrown;
  const arrowLabel = changed ? "Update" : "Keep";
  const suppBgCorrected = changed ? T.correctedSupplement : T.attemptedSupplement;
  const corrSubColor = T.textSecondary;

  return (
    <div style={{ display: "flex", gap: 0, alignItems: "stretch" }}>
      {/* Attempted */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, padding: "8px 10px", minWidth: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <SectionSubheader style={{ fontSize: 10 }}>Entry</SectionSubheader>
          <EntryTable lines={data.lines} currencySymbol={sym} minRows={0} colors={attemptedEntryColors} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <SectionSubheader style={{ fontSize: 10 }}>Reason</SectionSubheader>
          <ReviewTextField
            value={data.reason}
            bg={{
              display: { background: T.attemptedSupplement, borderRadius: 3 },
              editing: { background: T.attemptedSupplement, borderRadius: 3 },
            }}
            style={{ fontSize: 11, color: T.textSecondary, fontStyle: "italic", padding: "4px 6px" }}
          />
        </div>
        <div style={{ height: 18 }} />
      </div>
      {/* Arrow */}
      <DashedArrow label={arrowLabel} color={arrowColor} />
      {/* Corrected */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, minWidth: 0, padding: "8px 10px", borderRadius: 4 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <SectionSubheader style={{ fontSize: 10 }}>Entry</SectionSubheader>
          <EntryTable
            lines={correctedLines}
            currencySymbol={sym}
            colors={changed ? entryColors : attemptedEntryColors}
            editable
            lineKeys={lineKeys}
            onLineChange={onLineChange}
            onAddLine={onAddLine}
            onDeleteLine={onDeleteLine}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <SectionSubheader style={{ fontSize: 10 }}>Reason</SectionSubheader>
          <ReviewTextField
            value={correctedReason}
            onChange={onReasonChange}
            bg={{
              display: { background: suppBgCorrected, borderRadius: 3 },
              editing: { background: suppBgCorrected, borderRadius: 3 },
            }}
            style={{ fontSize: 11, color: corrSubColor, fontStyle: "italic", padding: "4px 6px" }}
          />
        </div>
        <CorrectedActionBar variant={changed ? "corrected" : "attempted"} actions={[
          { label: "Reset", onClick: onReset },
        ]} />
      </div>
    </div>
  );
}

// ── DebitCreditRelationshipView ─────────────────────
const ACCOUNT_TYPES = ["Asset", "Liability", "Equity", "Revenue", "Expense"];
const DIRECTIONS = ["Increase", "Decrease"];

function DebitCreditRelationshipView({ lines, lineKeys, currencySymbol, colors, taxonomyDict }: {
  lines: JournalLine[];
  lineKeys: string[];
  currencySymbol: string;
  colors: import("../shared/tokens").EntryColorTheme;
  taxonomyDict: TaxonomyDict;
}) {
  // Per-line D/C classifications live in two parallel maps on `corrected`,
  // split by the line's debit/credit type. Each line's classification is
  // looked up in the map matching its current type — see `getCell` and
  // `updateCell` below.
  const debitRel = useLLMInteractionStore(
    useShallow((st) => st.corrected.debit_relationship)
  );
  const creditRel = useLLMInteractionStore(
    useShallow((st) => st.corrected.credit_relationship)
  );
  const setCorrected = useLLMInteractionStore((st) => st.setCorrected);

  const getCell = (line: JournalLine): LineDcClassification => {
    if (!line.id) return { type: null, direction: null, taxonomy: null };
    const bucket = line.type === "debit" ? debitRel : creditRel;
    return bucket[line.id] ?? { type: null, direction: null, taxonomy: null };
  };

  const updateCell = (line: JournalLine, patch: Partial<LineDcClassification>) => {
    if (!line.id) return;
    setCorrected((draft) => {
      const bucket = line.type === "debit" ? draft.debit_relationship : draft.credit_relationship;
      const current = bucket[line.id!] ?? { type: null, direction: null, taxonomy: null };
      bucket[line.id!] = { ...current, ...patch };
    });
  };
  const rightCellStyle: React.CSSProperties = { padding: "8px 10px", borderRadius: 4, fontSize: 13, color: "rgba(37, 36, 34, 0.8)", background: "rgba(204, 197, 185, 0.15)", flex: 1, textAlign: "center", minHeight: 28, minWidth: 0 };
  const rightHeaderStyle: React.CSSProperties = { ...rightCellStyle, fontWeight: 600, color: "rgba(37, 36, 34, 0.9)", fontSize: 13, minHeight: undefined };

  const dur = 0.15;
  const outerInitial = { height: 0, overflow: "hidden" as const };
  const outerAnimate = { height: "auto", overflow: "visible" as const, transition: { duration: dur, ease: "easeOut" as const } };
  const outerExit = { height: 0, overflow: "hidden" as const, transition: { duration: dur, delay: dur, ease: "easeOut" as const } };
  const innerInitial = { opacity: 0 };
  const innerAnimate = { opacity: 1, transition: { duration: dur, delay: dur, ease: "easeOut" as const } };
  const innerExit = { opacity: 0, transition: { duration: dur, ease: "easeOut" as const } };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {/* Header */}
      <div style={{ display: "flex", gap: 0, alignItems: "stretch" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <EntryHeader colors={colors} />
        </div>
        <div style={{ width: 100, flexShrink: 0 }} />
        {(() => {
          const allFilled = lines.length > 0 && lines.every((line) => {
            const cell = getCell(line);
            return cell.type && cell.direction && cell.taxonomy;
          });
          const headerBg = allFilled ? "rgba(79, 119, 45, 0.7)" : rightHeaderStyle.background;
          return (
            <div style={{ flex: 1, display: "flex", gap: 5, minWidth: 0 }}>
              <div style={{ ...rightHeaderStyle, background: headerBg }}>Type</div>
              <div style={{ ...rightHeaderStyle, background: headerBg }}>Direction</div>
              <div style={{ ...rightHeaderStyle, background: headerBg }}>Taxonomy</div>
            </div>
          );
        })()}
      </div>
      {/* Rows */}
      <AnimatePresence initial={false}>
        {lines.map((line, i) => {
          const key = lineKeys[i];
          const cell = getCell(line);
          return (
          <motion.div key={key} initial={outerInitial} animate={outerAnimate} exit={outerExit}>
            <motion.div initial={innerInitial} animate={innerAnimate} exit={innerExit}
              style={{ display: "flex", gap: 0, alignItems: "stretch" }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <EntryRow line={line} index={i} currencySymbol={currencySymbol} colors={colors} />
              </div>
              <DashedArrow label="" color={palette.silver} />
              <div style={{ flex: 1, display: "flex", gap: 5, minWidth: 0 }}>
                <div style={{ ...rightCellStyle, background: cell.type ? "rgba(79, 119, 45, 0.15)" : rightCellStyle.background, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <DropdownSelect
                    value={cell.type}
                    options={ACCOUNT_TYPES}
                    placeholder="Select ..."
                    onChange={(v) => updateCell(line, { type: v, taxonomy: null })}
                    style={{ width: "100%" }}
                  />
                </div>
                <div style={{ ...rightCellStyle, background: cell.direction ? "rgba(79, 119, 45, 0.15)" : rightCellStyle.background, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <DropdownSelect
                    value={cell.direction}
                    options={DIRECTIONS}
                    placeholder="Select ..."
                    onChange={(v) => updateCell(line, { direction: v })}
                    style={{ width: "100%" }}
                  />
                </div>
                <div style={{ ...rightCellStyle, background: cell.taxonomy ? "rgba(79, 119, 45, 0.15)" : rightCellStyle.background, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <DropdownSelect
                    value={cell.taxonomy}
                    options={taxonomyDict[(cell.type ?? "").toLowerCase()] ?? []}
                    placeholder={cell.type ? "Select ..." : "Select type first"}
                    onChange={(v) => updateCell(line, { taxonomy: v })}
                    allowNew
                    style={{ width: "100%" }}
                  />
                </div>
              </div>
            </motion.div>
          </motion.div>
          );
        })}
      </AnimatePresence>
      {/* Total row (left side only) */}
      <div style={{ display: "flex", gap: 0, alignItems: "stretch" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <EntryTotalRow lines={lines} currencySymbol={currencySymbol} colors={colors} />
        </div>
        <div style={{ width: 100, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }} />
      </div>
    </div>
  );
}

let _newLineCounter = 0;
function newLineId(): string {
  _newLineCounter += 1;
  return `l-new-${Date.now()}-${_newLineCounter}`;
}

// ── FinalEntryReviewContainer ───────────────────────
export function FinalEntryReviewContainer() {
  const attemptedEntry = useLLMInteractionStore(
    (st) => st.attempted.output_entry_drafter
  );
  const correctedEntry = useLLMInteractionStore(
    (st) => st.corrected.output_entry_drafter
  );
  const setCorrected = useLLMInteractionStore((st) => st.setCorrected);

  const attemptedData: EntryData = attemptedEntry
    ? { reason: attemptedEntry.reason, currency: attemptedEntry.currency || "CAD", lines: attemptedEntry.lines }
    : { reason: "", currency: "CAD", lines: [] };
  const correctedLines: JournalLine[] = correctedEntry?.lines ?? [];
  const correctedReason: string = correctedEntry?.reason ?? "";

  // The line.id field IS the React key now — no separate `lineKeys` state.
  const lineKeys = correctedLines.map((l) => l.id ?? "");
  const jurisdiction = useLLMInteractionStore((st) => st.attempted.jurisdiction);
  const [taxonomyDict, setTaxonomyDict] = useState<TaxonomyDict>({});

  useEffect(() => {
    getTaxonomy(jurisdiction).then(setTaxonomyDict).catch(() => {});
  }, [jurisdiction]);

  const sym = CURRENCY_SYM[attemptedData.currency] || "";
  const changed = correctedReason !== attemptedData.reason
    || JSON.stringify(correctedLines) !== JSON.stringify(attemptedData.lines);

  // Mutation helpers — write through the store
  function mutateEntry(updater: (entry: { reason: string; currency: string; lines: JournalLine[]; currency_symbol?: string }) => void) {
    setCorrected((draft) => {
      const target = draft.output_entry_drafter;
      if (!target) return;
      updater(target);
    });
  }

  function handleReset() {
    setCorrected((draft) => {
      const attempted = useLLMInteractionStore.getState().attempted;
      const source = attempted.output_entry_drafter;
      const target = draft.output_entry_drafter;
      if (!source || !target) return;
      target.reason = source.reason;
      target.currency = source.currency;
      target.lines = structuredClone(source.lines);
      // Reset the per-line debit/credit relationship maps too
      draft.debit_relationship = structuredClone(attempted.debit_relationship);
      draft.credit_relationship = structuredClone(attempted.credit_relationship);
    });
  }

  function handleAddLine(index: number) {
    const newLine: JournalLine = { id: newLineId(), account_code: "", account_name: "", type: "debit", amount: 0 };
    mutateEntry((entry) => {
      entry.lines.splice(index, 0, newLine);
    });
  }

  function handleDeleteLine(index: number) {
    setCorrected((draft) => {
      const target = draft.output_entry_drafter;
      if (!target) return;
      const removed = target.lines[index];
      target.lines.splice(index, 1);
      // Drop the corresponding classification from both buckets (it lives
      // in only one, but checking both is harmless and avoids a branch).
      if (removed?.id) {
        delete draft.debit_relationship[removed.id];
        delete draft.credit_relationship[removed.id];
      }
    });
  }

  function handleLineChange(i: number, line: JournalLine) {
    setCorrected((draft) => {
      const target = draft.output_entry_drafter;
      if (!target) return;
      const oldLine = target.lines[i];
      const id = oldLine?.id ?? line.id;
      // If the line's debit/credit type flipped, move its classification
      // between the two relationship buckets so it stays aligned with the
      // line's current type.
      if (id && oldLine && oldLine.type !== line.type) {
        const fromBucket = oldLine.type === "debit" ? draft.debit_relationship : draft.credit_relationship;
        const toBucket = line.type === "debit" ? draft.debit_relationship : draft.credit_relationship;
        const cls = fromBucket[id];
        if (cls) {
          delete fromBucket[id];
          toBucket[id] = cls;
        }
      }
      target.lines[i] = { ...line, id };
    });
  }

  function handleReasonChange(reason: string) {
    mutateEntry((entry) => {
      entry.reason = reason;
    });
  }

  return (
    <ReviewSectionLayout sectionKey="finalEntry"
      notesPlaceholder="Any additional notes about the final entry — such as incorrect accounts, wrong amounts, or missing lines."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
        <Subsection title="Final Entry">
          <AttemptedCorrectedLabels />
          <FinalEntryItemView
            data={attemptedData}
            correctedLines={correctedLines}
            lineKeys={lineKeys}
            correctedReason={correctedReason}
            changed={changed}
            sym={sym}
            onLineChange={handleLineChange}
            onAddLine={handleAddLine}
            onDeleteLine={handleDeleteLine}
            onReasonChange={handleReasonChange}
            onReset={handleReset}
          />
        </Subsection>
        <Subsection title="Debit / Credit Relationship">
          <DebitCreditRelationshipView lines={correctedLines} lineKeys={lineKeys} currencySymbol={sym} colors={changed ? entryColors : attemptedEntryColors} taxonomyDict={taxonomyDict} />
        </Subsection>
      </div>
    </ReviewSectionLayout>
  );
}

// ── Tax Review ──────────────────────────────────────

const CLASSIFICATION_OPTIONS = ["Taxable", "Zero-rated", "Exempt", "Out of scope"];
const BOOL_OPTIONS = ["Yes", "No"];

function classificationToDisplay(c: string): string {
  return ({ taxable: "Taxable", zero_rated: "Zero-rated", exempt: "Exempt", out_of_scope: "Out of scope" }[c] ?? c);
}
function displayToClassification(d: string): HumanEditableTax["classification"] {
  return ({ "Taxable": "taxable", "Zero-rated": "zero_rated", "Exempt": "exempt", "Out of scope": "out_of_scope" }[d] ?? "out_of_scope") as HumanEditableTax["classification"];
}

function TaxFieldItemView({ label, question, attemptedControl, correctedControl, changed, onReset }: {
  label: string;
  question: string;
  attemptedControl: React.ReactNode;
  correctedControl: React.ReactNode;
  changed: boolean;
  onReset: () => void;
}) {
  const itemBg = T.attemptedItem;
  const corrBg = changed ? T.correctedItem : T.attemptedItem;
  const arrowColor = changed ? palette.fern : palette.charcoalBrown;
  const arrowLabel = changed ? "Update" : "Keep";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <SectionSubheader>{label}</SectionSubheader>
      <AttemptedCorrectedLabels />
      <div style={{ display: "flex", gap: 0, alignItems: "stretch" }}>
        {/* Attempted */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "column", gap: 10,
          padding: "8px 10px", background: itemBg, borderRadius: 4, minWidth: 0,
        }}>
          <div style={T.fieldLabel}>{question}</div>
          <div>{attemptedControl}</div>
          <div style={{ height: 18 }} />
        </div>
        {/* Arrow */}
        <DashedArrow label={arrowLabel} color={arrowColor} />
        {/* Corrected */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "column", gap: 10,
          padding: "8px 10px", background: corrBg, borderRadius: 4, minWidth: 0,
        }}>
          <div style={T.fieldLabel}>{question}</div>
          <div>{correctedControl}</div>
          <CorrectedActionBar variant={changed ? "corrected" : "attempted"} actions={[
            { label: "Reset", onClick: onReset },
          ]} />
        </div>
      </div>
    </div>
  );
}

export function TaxReviewContainer() {
  // Read attempted tax fields from store. Empty defaults if no tax data exists yet.
  const attemptedTax = useLLMInteractionStore((st) => st.attempted.output_tax_specialist) ?? null;
  const correctedTax = useLLMInteractionStore((st) => st.corrected.output_tax_specialist) ?? null;
  const setCorrected = useLLMInteractionStore((st) => st.setCorrected);

  const attemptedTaxMentioned = attemptedTax?.tax_mentioned ?? false;
  const attemptedClassification = attemptedTax?.classification ?? "out_of_scope";
  const attemptedItcEligible = attemptedTax?.itc_eligible ?? false;
  const attemptedAmountInclusive = attemptedTax?.amount_tax_inclusive ?? false;
  const attemptedTaxRate = attemptedTax?.tax_rate ?? null;
  const attemptedTaxContext = attemptedTax?.tax_context ?? "";

  const corrTaxMentioned = correctedTax?.tax_mentioned ?? false;
  const corrClassification = correctedTax?.classification ?? "out_of_scope";
  const corrItcEligible = correctedTax?.itc_eligible ?? false;
  const corrAmountInclusive = correctedTax?.amount_tax_inclusive ?? false;
  const corrTaxRate = correctedTax?.tax_rate ?? null;
  const corrTaxContext = correctedTax?.tax_context ?? "";

  // Mutate one field on the corrected tax_specialist via immer. The
  // corrected tax is HumanEditableTax (no `reasoning`) — only the 6
  // fields with UI controls live there.
  function mutateTax(updater: (tax: HumanEditableTax) => void) {
    setCorrected((draft) => {
      if (!draft.output_tax_specialist) return;
      updater(draft.output_tax_specialist);
    });
  }

  function resetField(field: string) {
    setCorrected((draft) => {
      const attempted = useLLMInteractionStore.getState().attempted.output_tax_specialist;
      const draftTax = draft.output_tax_specialist;
      if (!attempted || !draftTax) return;
      switch (field) {
        case "tax_mentioned": draftTax.tax_mentioned = attempted.tax_mentioned; break;
        case "classification": draftTax.classification = attempted.classification; break;
        case "itc_eligible": draftTax.itc_eligible = attempted.itc_eligible; break;
        case "amount_tax_inclusive": draftTax.amount_tax_inclusive = attempted.amount_tax_inclusive; break;
        case "tax_rate": draftTax.tax_rate = attempted.tax_rate; break;
        case "tax_context": draftTax.tax_context = attempted.tax_context; break;
      }
    });
  }

  return (
    <ReviewSectionLayout sectionKey="tax"
      notesPlaceholder="Any additional notes about the tax treatment — such as special rules, mixed-use considerations, or jurisdiction-specific details."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
        <TaxFieldItemView
          label="Tax mentioned"
          question="Was tax mentioned in the transaction description?"
          attemptedControl={<SegmentedControl value={attemptedTaxMentioned ? "Yes" : "No"} options={BOOL_OPTIONS} />}
          correctedControl={
            <SegmentedControl value={corrTaxMentioned ? "Yes" : "No"} options={BOOL_OPTIONS}
              onChange={(v) => mutateTax((tax) => { tax.tax_mentioned = v === "Yes"; })} />
          }
          changed={corrTaxMentioned !== attemptedTaxMentioned}
          onReset={() => resetField("tax_mentioned")}
        />

        <TaxFieldItemView
          label="Classification"
          question="What is the tax classification of this supply?"
          attemptedControl={<SegmentedControl value={classificationToDisplay(attemptedClassification)} options={CLASSIFICATION_OPTIONS} />}
          correctedControl={
            <SegmentedControl value={classificationToDisplay(corrClassification)} options={CLASSIFICATION_OPTIONS}
              onChange={(v) => mutateTax((tax) => { tax.classification = displayToClassification(v); })} />
          }
          changed={corrClassification !== attemptedClassification}
          onReset={() => resetField("classification")}
        />

        <TaxFieldItemView
          label="ITC eligible"
          question="Can the business claim an Input Tax Credit?"
          attemptedControl={<SegmentedControl value={attemptedItcEligible ? "Yes" : "No"} options={BOOL_OPTIONS} />}
          correctedControl={
            <SegmentedControl value={corrItcEligible ? "Yes" : "No"} options={BOOL_OPTIONS}
              onChange={(v) => mutateTax((tax) => { tax.itc_eligible = v === "Yes"; })} />
          }
          changed={corrItcEligible !== attemptedItcEligible}
          onReset={() => resetField("itc_eligible")}
        />

        <TaxFieldItemView
          label="Amount tax-inclusive"
          question="Does the stated amount already include tax?"
          attemptedControl={<SegmentedControl value={attemptedAmountInclusive ? "Yes" : "No"} options={BOOL_OPTIONS} />}
          correctedControl={
            <SegmentedControl value={corrAmountInclusive ? "Yes" : "No"} options={BOOL_OPTIONS}
              onChange={(v) => mutateTax((tax) => { tax.amount_tax_inclusive = v === "Yes"; })} />
          }
          changed={corrAmountInclusive !== attemptedAmountInclusive}
          onReset={() => resetField("amount_tax_inclusive")}
        />

        <TaxFieldItemView
          label="Tax rate"
          question="What is the applicable tax rate?"
          attemptedControl={
            <NumberField
              value={attemptedTaxRate}
              formatDisplay={(v) => `${(v * 100).toFixed(0)}%`}
              style={{ fontWeight: 600 }}
            />
          }
          correctedControl={
            <NumberField
              value={corrTaxRate}
              step="0.01"
              min="0"
              max="1"
              formatDisplay={(v) => `${(v * 100).toFixed(0)}%`}
              onChange={(v) => mutateTax((tax) => { tax.tax_rate = v; })}
              style={{ fontWeight: 600 }}
            />
          }
          changed={corrTaxRate !== attemptedTaxRate}
          onReset={() => resetField("tax_rate")}
        />

        <TaxFieldItemView
          label="Tax context"
          question="What tax context is relevant for the entry drafter?"
          attemptedControl={
            <ReviewTextField value={attemptedTaxContext} emptyText="—" />
          }
          correctedControl={
            <ReviewTextField
              value={corrTaxContext}
              onChange={(v) => mutateTax((tax) => { tax.tax_context = v; })}
              emptyText="—"
            />
          }
          changed={corrTaxContext !== attemptedTaxContext}
          onReset={() => resetField("tax_context")}
        />
      </div>
    </ReviewSectionLayout>
  );
}

export function ReviewSectionContainer({ title, children, sectionKey }: { title: string; children?: React.ReactNode; sectionKey: NotesSectionKey }) {
  return (
    <ReviewSectionLayout sectionKey={sectionKey} notesPlaceholder={`Any additional notes about ${title.toLowerCase()} that the agent may have missed or handled incorrectly.`}>
      {children || <p style={{ margin: 0, fontSize: 12, color: T.textMuted, textAlign: "center", padding: "20px 0" }}>No items to review.</p>}
    </ReviewSectionLayout>
  );
}
