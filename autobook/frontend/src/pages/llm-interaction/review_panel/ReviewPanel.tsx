import { useEffect, useMemo, useRef, useState } from "react";
import { RiAddCircleLine, RiCloseCircleLine } from "react-icons/ri";
import { IoChevronDownSharp, IoChevronUpSharp } from "react-icons/io5";
import { SegmentedControl } from "../shared/SegmentedControl";
import { SectionSubheader } from "../shared/SectionSubheader";
import { motion, AnimatePresence } from "motion/react";
import { palette, T, entryColors, attemptedEntryColors, CURRENCY_SYM, reviewTextareaStyle } from "../shared/tokens";
import { DashedArrow } from "../shared/DashedArrow";
import { DropdownSelect } from "../shared/DropdownSelect";
import { NotesTextarea } from "../shared/NotesTextarea";
import { EntryTable, EntryHeader, EntryRow, EntryTotalRow } from "../entry_panel/EntryPanel";
import type { JournalLine, AgentResult, AmbiguityOutput, TaxOutput } from "../../../api/types";
import { ForceGraph, toGraphData } from "../../../components/force-graph";
import type { GraphData } from "../../../components/force-graph";
import { getTaxonomy } from "../../../api/taxonomy";
import type { TaxonomyDict } from "../../../api/taxonomy";
import s from "../../LLMInteractionPage.module.css";

// ── Review Panel Types ──────────────────────────────────

export type AmbiguityItem = {
  aspect: string;
  ambiguous: boolean;
  input_contextualized_conventional_default?: string | null;
  input_contextualized_ifrs_default?: string | null;
  clarification_question?: string | null;
  cases?: Array<{ case: string; possible_entry?: Record<string, unknown> }>;
};

export const DUMMY_AMBIGUITIES: AmbiguityItem[] = [
  {
    aspect: "Payment method unclear",
    ambiguous: true,
    input_contextualized_conventional_default: "Credit card payment assumed based on typical retail purchase patterns.",
    input_contextualized_ifrs_default: "Accounts Payable recognized at transaction date per IAS 37.",
    clarification_question: "Was this paid by cash, credit card, or bank transfer?",
    cases: [
      { case: "If paid by credit card → Credit Card Payable (liability)" },
      { case: "If paid by cash → Cash (asset reduction)" },
      { case: "If paid by bank transfer → Bank Account (asset reduction)" },
    ],
  },
  {
    aspect: "Asset vs expense classification",
    ambiguous: true,
    input_contextualized_conventional_default: "Items under $500 are typically expensed immediately.",
    input_contextualized_ifrs_default: "Capitalize if future economic benefits are probable and cost is reliably measurable (IAS 16).",
    clarification_question: "Is this a capital expenditure or an operating expense?",
    cases: [
      { case: "If capital expenditure → Property, Plant & Equipment (asset)" },
      { case: "If operating expense → Expense in current period" },
    ],
  },
  {
    aspect: "Tax treatment uncertainty",
    ambiguous: false,
    input_contextualized_conventional_default: "Standard HST rate of 13% applied for Ontario purchases.",
    input_contextualized_ifrs_default: "Input tax credit recoverable per IAS 12 / local tax legislation.",
    clarification_question: "Is this purchase subject to GST/HST?",
  },
];

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

export type AmbiguityStatus = "updated" | "keep" | "disabled";

function AmbiguitySubRow({ label, attemptedContent, correctedContent, correctedEditContent, changed, editing, disabled, added, onReset, onToggleEdit, onToggleDisable }: {
  label: string;
  attemptedContent: React.ReactNode;
  correctedContent: React.ReactNode;
  correctedEditContent: React.ReactNode;
  changed: boolean;
  editing: boolean;
  disabled?: boolean;
  added?: boolean;
  onReset: () => void;
  onToggleEdit: () => void;
  onToggleDisable?: () => void;
}) {
  const corrBg = disabled ? "rgba(204, 197, 185, 0.15)" : changed ? T.correctedItem : T.attemptedItem;
  const arrowColor = added ? palette.fern : disabled ? palette.burntOrange : changed ? palette.fern : palette.charcoalBrown;
  const arrowLabel = added ? "Add" : disabled ? "Disable" : changed ? "Update" : "Keep";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <SectionSubheader style={{ fontSize: 10 }}>{label}</SectionSubheader>
      <AttemptedCorrectedLabels />
      <div style={{ display: "flex", gap: 0, alignItems: "stretch" }}>
        {added ? (
          <div style={{
            flex: 1, padding: "8px 10px", borderRadius: 4, minWidth: 0,
            border: `1.5px dashed ${palette.silver}`, background: "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontSize: 11, color: palette.silver, fontStyle: "italic" }}>Empty</span>
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, padding: "8px 10px", background: T.attemptedItem, borderRadius: 4, minWidth: 0 }}>
            {attemptedContent}
            <div style={{ height: 18 }} />
          </div>
        )}
        <DashedArrow label={arrowLabel} color={arrowColor} />
        <div style={{
          flex: 1, display: "flex", flexDirection: "column", gap: 10,
          padding: "8px 10px", background: (editing && !disabled) ? (changed ? "rgba(79, 119, 45, 0.2)" : "rgba(255, 143, 0, 0.2)") : corrBg, borderRadius: 4, minWidth: 0,
          opacity: disabled ? 0.5 : 1,
          boxShadow: (editing && !disabled) ? (changed
            ? "0 0 12px rgba(79, 119, 45, 0.4), 0 0 24px rgba(79, 119, 45, 0.2)"
            : "0 0 12px rgba(255, 143, 0, 0.4), 0 0 24px rgba(255, 143, 0, 0.2)") : "none",
          transition: "background 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease",
        }}>
          {(editing && !disabled) ? correctedEditContent : correctedContent}
          <CorrectedActionBar muted={disabled} variant={changed ? "corrected" : "attempted"} actions={[
            ...(onToggleDisable ? [{ label: disabled ? "Enable" : "Disable", onClick: onToggleDisable }] : []),
            { label: "Reset", onClick: onReset, disabled },
            { label: editing ? "Save" : "Edit", onClick: onToggleEdit, disabled },
          ]} />
        </div>
      </div>
    </div>
  );
}

function AmbiguityItemView({ ambiguity, index }: { ambiguity: AmbiguityItem; index: number }) {
  const [open, setOpen] = useState(false);
  const [allDisabled, setAllDisabled] = useState(false);

  // Sub-row 1: Aspect
  const [correctedAspect, setCorrectedAspect] = useState(ambiguity.aspect);
  const [editingAspect, setEditingAspect] = useState(false);
  const [disabledAspect, setDisabledAspect] = useState(false);
  const aspectChanged = correctedAspect !== ambiguity.aspect;

  // Sub-row 2: Default Interpretations
  const [correctedConventional, setCorrectedConventional] = useState(ambiguity.input_contextualized_conventional_default || "");
  const [correctedIfrs, setCorrectedIfrs] = useState(ambiguity.input_contextualized_ifrs_default || "");
  const [editingDefaults, setEditingDefaults] = useState(false);
  const [disabledDefaults, setDisabledDefaults] = useState(false);
  const defaultsChanged = correctedConventional !== (ambiguity.input_contextualized_conventional_default || "")
    || correctedIfrs !== (ambiguity.input_contextualized_ifrs_default || "");

  // Sub-row 3: Clarification
  const [correctedQuestion, setCorrectedQuestion] = useState(ambiguity.clarification_question || "");
  const [correctedCases, setCorrectedCases] = useState(() => (ambiguity.cases || []).map((c) => c.case));
  const [editingClarification, setEditingClarification] = useState(false);
  const [disabledClarification, setDisabledClarification] = useState(false);
  const clarificationChanged = correctedQuestion !== (ambiguity.clarification_question || "")
    || JSON.stringify(correctedCases) !== JSON.stringify((ambiguity.cases || []).map((c) => c.case));

  const corrTextColor = T.textPrimary;

  const overallStatus = allDisabled ? "Disable" : (aspectChanged || defaultsChanged || clarificationChanged || disabledAspect || disabledDefaults || disabledClarification) ? "Update" : "Keep";
  const statusBadge = {
    Keep: { bg: T.attemptedItem, color: palette.carbonBlack },
    Update: { bg: T.correctedItem, color: palette.carbonBlack },
    Disable: { bg: "rgba(204, 197, 185, 0.15)", color: palette.carbonBlack },
  }[overallStatus];

  const textareaStyle: React.CSSProperties = { ...reviewTextareaStyle, ...T.fieldBgEditing };
  const displayStyle: React.CSSProperties = { ...T.fieldText, ...T.fieldBg, padding: "4px 10px" };

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
      <span style={{ flex: 1 }}>Ambiguous aspect {index + 1}: {correctedAspect}</span>
      <span style={{
        fontSize: 9, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
        background: statusBadge.bg, color: statusBadge.color,
        textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0,
      }}>{overallStatus}</span>
      <span style={{ fontSize: 12, display: "flex", flexShrink: 0 }}>
        {open ? <IoChevronUpSharp /> : <IoChevronDownSharp />}
      </span>
    </div>
    {/* Collapsible content */}
    <div className={`${s.collapsibleWrapper} ${open ? s.collapsibleWrapperOpen : ""}`}>
    <div className={s.collapsibleInner}>
    <div className={s.collapsibleFade} style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 12, paddingBottom: 12 }}>

    {/* Sub-row 1: Aspect */}
    <AmbiguitySubRow label="Aspect" changed={aspectChanged} editing={editingAspect} disabled={allDisabled || disabledAspect} onToggleDisable={() => setDisabledAspect((d) => !d)}
      onReset={() => { setCorrectedAspect(ambiguity.aspect); setEditingAspect(false); }}
      onToggleEdit={() => setEditingAspect((e) => !e)}
      attemptedContent={
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={T.fieldLabel}>Ambiguous aspect</span>
          <div style={displayStyle}>{ambiguity.aspect}</div>
        </div>
      }
      correctedContent={
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ ...T.fieldLabel, color: corrTextColor }}>Ambiguous aspect</span>
          <div style={displayStyle}>{correctedAspect}</div>
        </div>
      }
      correctedEditContent={
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ ...T.fieldLabel, color: corrTextColor }}>Ambiguous aspect</span>
          <textarea autoFocus rows={1} value={correctedAspect} onChange={(e) => setCorrectedAspect(e.target.value)} style={textareaStyle} />
        </div>
      }
    />

    {/* Sub-row 2: Default Interpretations */}
    <AmbiguitySubRow label="Default Interpretation" changed={defaultsChanged} editing={editingDefaults} disabled={allDisabled || disabledDefaults} onToggleDisable={() => setDisabledDefaults((d) => !d)}
      onReset={() => { setCorrectedConventional(ambiguity.input_contextualized_conventional_default || ""); setCorrectedIfrs(ambiguity.input_contextualized_ifrs_default || ""); setEditingDefaults(false); }}
      onToggleEdit={() => setEditingDefaults((e) => !e)}
      attemptedContent={<>
        {ambiguity.input_contextualized_conventional_default && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={T.fieldLabel}>Conventional default interpretation</span>
            <div style={displayStyle}>{ambiguity.input_contextualized_conventional_default}</div>
          </div>
        )}
        {ambiguity.input_contextualized_ifrs_default && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={T.fieldLabel}>IFRS default interpretation</span>
            <div style={displayStyle}>{ambiguity.input_contextualized_ifrs_default}</div>
          </div>
        )}
      </>}
      correctedContent={<>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ ...T.fieldLabel, color: corrTextColor }}>Conventional default interpretation</span>
          <div style={displayStyle}>{correctedConventional || <span style={{ opacity: 0.5 }}>—</span>}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ ...T.fieldLabel, color: corrTextColor }}>IFRS default interpretation</span>
          <div style={displayStyle}>{correctedIfrs || <span style={{ opacity: 0.5 }}>—</span>}</div>
        </div>
      </>}
      correctedEditContent={<>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ ...T.fieldLabel, color: corrTextColor }}>Conventional default interpretation</span>
          <textarea rows={1} value={correctedConventional} onChange={(e) => setCorrectedConventional(e.target.value)} style={textareaStyle} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ ...T.fieldLabel, color: corrTextColor }}>IFRS default interpretation</span>
          <textarea rows={1} value={correctedIfrs} onChange={(e) => setCorrectedIfrs(e.target.value)} style={textareaStyle} />
        </div>
      </>}
    />

    {/* Sub-row 3: Clarification */}
    <AmbiguitySubRow label="Clarification" changed={clarificationChanged} editing={editingClarification} disabled={allDisabled || disabledClarification} onToggleDisable={() => setDisabledClarification((d) => !d)}
      onReset={() => { setCorrectedQuestion(ambiguity.clarification_question || ""); setCorrectedCases((ambiguity.cases || []).map((c) => c.case)); setEditingClarification(false); }}
      onToggleEdit={() => setEditingClarification((e) => !e)}
      attemptedContent={<>
        {ambiguity.clarification_question && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={T.fieldLabel}>Clarification question that should have been asked</span>
            <div style={displayStyle}>{ambiguity.clarification_question}</div>
          </div>
        )}
        {ambiguity.cases && ambiguity.cases.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={T.fieldLabel}>Possible cases</span>
            {ambiguity.cases.map((c, i) => (
              <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ ...T.fieldLabel, whiteSpace: "nowrap" }}>Case {i + 1}:</span>
                <div style={{ flex: 1, ...displayStyle }}>{c.case}</div>
              </div>
            ))}
          </div>
        )}
      </>}
      correctedContent={<>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ ...T.fieldLabel, color: corrTextColor }}>Clarification question that should have been asked</span>
          <div style={displayStyle}>{correctedQuestion || <span style={{ opacity: 0.5 }}>—</span>}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ ...T.fieldLabel, color: corrTextColor }}>Possible cases</span>
          {correctedCases.length > 0 ? correctedCases.map((c, i) => (
            <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ ...T.fieldLabel, whiteSpace: "nowrap" }}>Case {i + 1}:</span>
              <div style={{ flex: 1, ...displayStyle }}>{c}</div>
            </div>
          )) : (
            <div style={{ ...displayStyle, opacity: 0.5 }}>—</div>
          )}
        </div>
      </>}
      correctedEditContent={<>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ ...T.fieldLabel, color: corrTextColor }}>Clarification question that should have been asked</span>
          <textarea rows={1} value={correctedQuestion} onChange={(e) => setCorrectedQuestion(e.target.value)} style={textareaStyle} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ ...T.fieldLabel, color: corrTextColor }}>Possible cases</span>
            <button onClick={() => setCorrectedCases((prev) => [...prev, ""])}
              className={s.buttonTransition}
              style={{ background: "none", border: "none", padding: 0, fontSize: 14, color: corrTextColor, cursor: "pointer", lineHeight: 1 }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.6"; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
            ><RiAddCircleLine /></button>
          </div>
          {correctedCases.map((c, i) => (
            <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ ...T.fieldLabel, whiteSpace: "nowrap" }}>Case {i + 1}:</span>
              <textarea rows={1} value={c} onChange={(e) => setCorrectedCases((prev) => prev.map((v, j) => j === i ? e.target.value : v))} style={{ flex: 1, ...textareaStyle }} />
              <button onClick={() => setCorrectedCases((prev) => prev.filter((_, j) => j !== i))}
                className={s.buttonTransition}
                style={{ background: "none", border: "none", padding: 0, fontSize: 14, color: corrTextColor, cursor: "pointer", lineHeight: 1, flexShrink: 0 }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.6"; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
              ><RiCloseCircleLine /></button>
            </div>
          ))}
        </div>
      </>}
    />

    {/* Flag as unambiguous */}
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <button
        className={s.buttonTransition}
        onClick={() => setAllDisabled((d) => !d)}
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
        {allDisabled ? "Flagged as unambiguous" : "Flag as unambiguous"}
      </button>
    </div>

    </div>
    </div>
    </div>
    </div>
  );
}

function AddedAmbiguityItemView({ index, onDelete }: { index: number; onDelete: () => void }) {
  const [open, setOpen] = useState(true);

  // Sub-row 1: Aspect
  const [aspect, setAspect] = useState("");
  const [editingAspect, setEditingAspect] = useState(true);

  // Sub-row 2: Default Interpretations
  const [conventional, setConventional] = useState("");
  const [ifrs, setIfrs] = useState("");
  const [editingDefaults, setEditingDefaults] = useState(true);

  // Sub-row 3: Clarification
  const [question, setQuestion] = useState("");
  const [cases, setCases] = useState<string[]>([]);
  const [editingClarification, setEditingClarification] = useState(true);

  const corrTextColor = T.textPrimary;
  const textareaStyle: React.CSSProperties = { ...reviewTextareaStyle, ...T.fieldBgEditing };

  return (
    <div className={s.blockAppear} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
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
      <span style={{ flex: 1 }}>Ambiguous aspect {index + 1}: {aspect || "(new)"}</span>
      <span style={{
        fontSize: 9, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
        background: T.correctedItem, color: palette.carbonBlack,
        textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0,
      }}>Add</span>
      <span style={{ fontSize: 12, display: "flex", flexShrink: 0 }}>
        {open ? <IoChevronUpSharp /> : <IoChevronDownSharp />}
      </span>
    </div>
    {/* Collapsible content */}
    <div className={`${s.collapsibleWrapper} ${open ? s.collapsibleWrapperOpen : ""}`}>
    <div className={s.collapsibleInner}>
    <div className={s.collapsibleFade} style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 12, paddingBottom: 12 }}>

    {/* Sub-row 1: Aspect */}
    <AmbiguitySubRow label="Aspect" changed={true} editing={editingAspect} added
      onReset={() => { setAspect(""); setEditingAspect(true); }}
      onToggleEdit={() => setEditingAspect((e) => !e)}
      attemptedContent={null}
      correctedContent={
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ ...T.fieldLabel, color: corrTextColor }}>Ambiguous aspect</span>
          <div style={{ ...T.fieldText, ...T.fieldBg, padding: "4px 10px" }}>{aspect || <span style={{ opacity: 0.5 }}>—</span>}</div>
        </div>
      }
      correctedEditContent={
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ ...T.fieldLabel, color: corrTextColor }}>Ambiguous aspect</span>
          <textarea autoFocus rows={1} value={aspect} onChange={(e) => setAspect(e.target.value)} placeholder="What is the actual ambiguity?" style={textareaStyle} />
        </div>
      }
    />

    {/* Sub-row 2: Default Interpretations */}
    <AmbiguitySubRow label="Default Interpretation" changed={true} editing={editingDefaults} added
      onReset={() => { setConventional(""); setIfrs(""); setEditingDefaults(true); }}
      onToggleEdit={() => setEditingDefaults((e) => !e)}
      attemptedContent={null}
      correctedContent={<>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ ...T.fieldLabel, color: corrTextColor }}>Conventional default interpretation</span>
          <div style={{ ...T.fieldText, ...T.fieldBg, padding: "4px 10px" }}>{conventional || <span style={{ opacity: 0.5 }}>—</span>}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ ...T.fieldLabel, color: corrTextColor }}>IFRS default interpretation</span>
          <div style={{ ...T.fieldText, ...T.fieldBg, padding: "4px 10px" }}>{ifrs || <span style={{ opacity: 0.5 }}>—</span>}</div>
        </div>
      </>}
      correctedEditContent={<>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ ...T.fieldLabel, color: corrTextColor }}>Conventional default interpretation</span>
          <textarea rows={1} value={conventional} onChange={(e) => setConventional(e.target.value)} placeholder="What is the conventional default?" style={textareaStyle} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ ...T.fieldLabel, color: corrTextColor }}>IFRS default interpretation</span>
          <textarea rows={1} value={ifrs} onChange={(e) => setIfrs(e.target.value)} placeholder="What is the IFRS default?" style={textareaStyle} />
        </div>
      </>}
    />

    {/* Sub-row 3: Clarification */}
    <AmbiguitySubRow label="Clarification" changed={true} editing={editingClarification} added
      onReset={() => { setQuestion(""); setCases([]); setEditingClarification(true); }}
      onToggleEdit={() => setEditingClarification((e) => !e)}
      attemptedContent={null}
      correctedContent={<>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ ...T.fieldLabel, color: corrTextColor }}>Clarification question that should have been asked</span>
          <div style={{ ...T.fieldText, ...T.fieldBg, padding: "4px 10px" }}>{question || <span style={{ opacity: 0.5 }}>—</span>}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ ...T.fieldLabel, color: corrTextColor }}>Possible cases</span>
          {cases.length > 0 ? cases.map((c, i) => (
            <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ ...T.fieldLabel, whiteSpace: "nowrap" }}>Case {i + 1}:</span>
              <div style={{ flex: 1, ...T.fieldText, ...T.fieldBg, padding: "4px 10px" }}>{c}</div>
            </div>
          )) : (
            <div style={{ ...T.fieldText, ...T.fieldBg, padding: "4px 10px", opacity: 0.5 }}>—</div>
          )}
        </div>
      </>}
      correctedEditContent={<>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ ...T.fieldLabel, color: corrTextColor }}>Clarification question that should have been asked</span>
          <textarea rows={1} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What question should be asked?" style={textareaStyle} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ ...T.fieldLabel, color: corrTextColor }}>Possible cases</span>
            <button onClick={() => setCases((prev) => [...prev, ""])}
              className={s.buttonTransition}
              style={{ background: "none", border: "none", padding: 0, fontSize: 14, color: corrTextColor, cursor: "pointer", lineHeight: 1 }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.6"; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
            ><RiAddCircleLine /></button>
          </div>
          {cases.map((c, i) => (
            <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ ...T.fieldLabel, whiteSpace: "nowrap" }}>Case {i + 1}:</span>
              <textarea rows={1} value={c} onChange={(e) => setCases((prev) => prev.map((v, j) => j === i ? e.target.value : v))} style={{ flex: 1, ...textareaStyle }} />
              <button onClick={() => setCases((prev) => prev.filter((_, j) => j !== i))}
                className={s.buttonTransition}
                style={{ background: "none", border: "none", padding: 0, fontSize: 14, color: corrTextColor, cursor: "pointer", lineHeight: 1, flexShrink: 0 }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.6"; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
              ><RiCloseCircleLine /></button>
            </div>
          ))}
        </div>
      </>}
    />

    {/* Delete button */}
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <button
        className={s.buttonTransition}
        onClick={onDelete}
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
        Delete ambiguity
      </button>
    </div>

    </div>
    </div>
    </div>
    </div>
  );
}

// ── Ambiguity Review Container ──────────────────────────

export function AmbiguityReviewContainer({ agentResult }: { agentResult: AgentResult }) {
  const dm = agentResult.pipeline_state?.output_decision_maker;
  const ambiguities: AmbiguityItem[] = (dm?.ambiguities || agentResult.resolved_ambiguities || agentResult.ambiguities || []) as AmbiguityItem[];
  const decisionData = {
    decision: agentResult.decision,
    rationale: dm?.rationale || agentResult.proceed_reason || agentResult.stuck_reason || "",
  };
  const [addedIds, setAddedIds] = useState<number[]>([]);
  const addedIdCounter = useRef(0);

  return (
    <ReviewSectionLayout
      notesPlaceholder="If there is anything else in addition to the corrections above — such as patterns the agent consistently misses, ambiguities it fails to detect, or context it should have considered — note it here."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
        <Subsection title="Ambiguities">
          {ambiguities.map((amb, i) => (
            <div key={`m-${i}`}>
              <AmbiguityItemView ambiguity={amb} index={i} />
            </div>
          ))}
          {addedIds.map((id, j) => (
            <div key={`a-${id}`}>
              <AddedAmbiguityItemView index={ambiguities.length + j} onDelete={() => setAddedIds((ids) => ids.filter((x) => x !== id))} />
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
            onClick={() => { addedIdCounter.current += 1; setAddedIds((ids) => [...ids, addedIdCounter.current]); }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(204, 197, 185, 0.3)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(204, 197, 185, 0.2)"; }}
          >
            + Add ambiguity
          </button>
        </Subsection>
        <Subsection title="Conclusion">
          <DecisionItemView data={decisionData} />
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

function ReviewSectionLayout({ children, notesPlaceholder }: { children: React.ReactNode; notesPlaceholder: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 40, flex: 1 }}>
      {children}
      <NotesTextarea placeholder={notesPlaceholder} />
    </div>
  );
}

// ── Transaction Analysis Review ─────────────────────

const SILVER_BG = "rgba(204, 197, 185, 0.2)";
const REPORTING_FIELD_BG: React.CSSProperties = { background: palette.deepSaffron, opacity: 0.8, borderRadius: 6 };
const REPORTING_FIELD_BG_EDITING: React.CSSProperties = { background: palette.deepSaffron, opacity: 0.9, borderRadius: 6 };

function ReportingEntityView({ name }: { name: string }) {
  const [correctedName, setCorrectedName] = useState(name);
  const [editing, setEditing] = useState(false);

  const changed = correctedName !== name;
  const itemBg = SILVER_BG;
  const corrBg = changed ? T.correctedItem : SILVER_BG;
  const arrowColor = changed ? palette.fern : palette.charcoalBrown;
  const arrowLabel = changed ? "Update" : "Keep";

  return (
    <>
      <AttemptedCorrectedLabels />
      <div style={{ display: "flex", gap: 0, alignItems: "stretch" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, padding: "8px 10px", background: itemBg, borderRadius: 4, minWidth: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={T.fieldLabel}>Reporting Entity</span>
            <div style={{ ...T.fieldText, ...REPORTING_FIELD_BG, padding: "4px 10px" }}>{name}</div>
          </div>
          <div style={{ height: 18 }} />
        </div>
        <DashedArrow label={arrowLabel} color={arrowColor} />
        <div style={{
          flex: 1, display: "flex", flexDirection: "column", gap: 10,
          padding: "8px 10px", background: editing ? "rgba(204, 197, 185, 0.3)" : corrBg, borderRadius: 4, minWidth: 0,
          boxShadow: editing ? "0 0 12px rgba(204, 197, 185, 0.4), 0 0 24px rgba(204, 197, 185, 0.2)" : "none",
          transition: "background 0.15s ease, box-shadow 0.15s ease",
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={T.fieldLabel}>Reporting Entity</span>
            {editing ? (
              <textarea rows={1} value={correctedName} onChange={(e) => setCorrectedName(e.target.value)}
                style={{ ...reviewTextareaStyle, ...REPORTING_FIELD_BG_EDITING }} />
            ) : (
              <div style={{ ...T.fieldText, ...REPORTING_FIELD_BG, padding: "4px 10px" }}>{correctedName}</div>
            )}
          </div>
          <CorrectedActionBar muted={!changed} variant={changed ? "corrected" : "attempted"} actions={[
            { label: "Reset", onClick: () => { setCorrectedName(name); setEditing(false); } },
            { label: editing ? "Save" : "Edit", onClick: () => setEditing((e) => !e) },
          ]} />
        </div>
      </div>
    </>
  );
}

const DIRECT_FIELD_BG: React.CSSProperties = { background: palette.darkTeal, opacity: 0.8, borderRadius: 6 };
const DIRECT_FIELD_BG_EDITING: React.CSSProperties = { background: palette.darkTeal, opacity: 0.9, borderRadius: 6 };

function PartyListSubsection({ label, parties, fieldBg, fieldBgEditing, editing, onChange, onDelete, onAdd }: {
  label: string;
  parties: string[];
  fieldBg: React.CSSProperties;
  fieldBgEditing: React.CSSProperties;
  editing: boolean;
  onChange: (index: number, value: string) => void;
  onDelete: (index: number) => void;
  onAdd: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={T.fieldLabel}>{label}</span>
      {parties.map((name, i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {editing ? (
            <textarea rows={1} value={name}
              onChange={(e) => onChange(i, e.target.value)}
              style={{ ...reviewTextareaStyle, ...fieldBgEditing, flex: 1 }} />
          ) : (
            <div style={{ flex: 1, ...T.fieldText, ...fieldBg, padding: "4px 10px" }}>{name}</div>
          )}
          {editing && (
            <button
              onClick={() => onDelete(i)}
              className={s.buttonTransition}
              style={{ background: "none", border: "none", padding: 0, width: 14, height: 14, fontSize: 14, color: T.textPrimary, cursor: "pointer", lineHeight: 1, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.6"; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
            ><RiCloseCircleLine /></button>
          )}
        </div>
      ))}
      {parties.length === 0 && !editing && (
        <div style={{ ...T.fieldText, ...fieldBg, padding: "4px 10px", opacity: 0.5 }}>—</div>
      )}
      {editing && (
        <button
          className={s.buttonTransition}
          onClick={onAdd}
          style={{
            width: "100%", marginTop: 4, background: "rgba(204, 197, 185, 0.2)", border: "none", borderRadius: 4,
            padding: "6px 10px", fontSize: 10, fontWeight: 600, textTransform: "uppercase" as const,
            letterSpacing: "0.05em", color: palette.carbonBlack, cursor: "pointer", textAlign: "center",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(204, 197, 185, 0.3)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(204, 197, 185, 0.2)"; }}
        >
          + Add party
        </button>
      )}
    </div>
  );
}

function PartiesInvolvedItemView({ nodes }: { nodes: Array<{ index: number; name: string; role: string }> }) {
  const directParties = nodes.filter((n) => n.role === "counterparty");
  const indirectParties = nodes.filter((n) => n.role === "indirect_party");

  // Direct row
  const [correctedDirect, setCorrectedDirect] = useState(() => directParties.map((n) => n.name));
  const [editingDirect, setEditingDirect] = useState(false);
  const directChanged = JSON.stringify(correctedDirect) !== JSON.stringify(directParties.map((n) => n.name));

  // Indirect row
  const [correctedIndirect, setCorrectedIndirect] = useState(() => indirectParties.map((n) => n.name));
  const [editingIndirect, setEditingIndirect] = useState(false);
  const indirectChanged = JSON.stringify(correctedIndirect) !== JSON.stringify(indirectParties.map((n) => n.name));

  const itemBg = SILVER_BG;

  function handleResetDirect() {
    setCorrectedDirect(directParties.map((n) => n.name));
    setEditingDirect(false);
  }
  function handleResetIndirect() {
    setCorrectedIndirect(indirectParties.map((n) => n.name));
    setEditingIndirect(false);
  }

  return (
    <>
      <AttemptedCorrectedLabels />
      {/* Row 1: Direct Parties */}
      <div style={{ display: "flex", gap: 0, alignItems: "stretch" }}>
        {/* Attempted */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, padding: "8px 10px", background: itemBg, borderRadius: 4, minWidth: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={T.fieldLabel}>Direct Parties</span>
            {directParties.length > 0 ? directParties.map((n, i) => (
              <div key={i} style={{ ...T.fieldText, ...DIRECT_FIELD_BG, padding: "4px 10px" }}>{n.name}</div>
            )) : (
              <div style={{ ...T.fieldText, ...DIRECT_FIELD_BG, padding: "4px 10px", opacity: 0.5 }}>—</div>
            )}
          </div>
          <div style={{ height: 18 }} />
        </div>
        {/* Arrow */}
        <DashedArrow label={directChanged ? "Update" : "Keep"} color={directChanged ? palette.fern : palette.charcoalBrown} />
        {/* Corrected */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "column", gap: 16,
          padding: "8px 10px", background: editingDirect ? "rgba(204, 197, 185, 0.3)" : (directChanged ? T.correctedItem : itemBg), borderRadius: 4, minWidth: 0,
          boxShadow: editingDirect ? "0 0 12px rgba(204, 197, 185, 0.4), 0 0 24px rgba(204, 197, 185, 0.2)" : "none",
          transition: "background 0.15s ease, box-shadow 0.15s ease",
        }}>
          <PartyListSubsection
            label="Direct Parties"
            parties={correctedDirect}
            fieldBg={DIRECT_FIELD_BG}
            fieldBgEditing={DIRECT_FIELD_BG_EDITING}
            editing={editingDirect}
            onChange={(i, v) => setCorrectedDirect((prev) => prev.map((x, j) => j === i ? v : x))}
            onDelete={(i) => setCorrectedDirect((prev) => prev.filter((_, j) => j !== i))}
            onAdd={() => setCorrectedDirect((prev) => [...prev, ""])}
          />
          <CorrectedActionBar muted={!directChanged} variant={directChanged ? "corrected" : "attempted"} actions={[
            { label: "Reset", onClick: handleResetDirect },
            { label: editingDirect ? "Save" : "Edit", onClick: () => setEditingDirect((e) => !e) },
          ]} />
        </div>
      </div>

      {/* Row 2: Indirect Parties */}
      <div style={{ display: "flex", gap: 0, alignItems: "stretch" }}>
        {/* Attempted */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, padding: "8px 10px", background: itemBg, borderRadius: 4, minWidth: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={T.fieldLabel}>Indirect Parties</span>
            {indirectParties.length > 0 ? indirectParties.map((n, i) => (
              <div key={i} style={{ ...T.fieldText, ...T.fieldBg, padding: "4px 10px" }}>{n.name}</div>
            )) : (
              <div style={{ ...T.fieldText, ...T.fieldBg, padding: "4px 10px", opacity: 0.5 }}>—</div>
            )}
          </div>
          <div style={{ height: 18 }} />
        </div>
        {/* Arrow */}
        <DashedArrow label={indirectChanged ? "Update" : "Keep"} color={indirectChanged ? palette.fern : palette.charcoalBrown} />
        {/* Corrected */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "column", gap: 16,
          padding: "8px 10px", background: editingIndirect ? "rgba(204, 197, 185, 0.3)" : (indirectChanged ? T.correctedItem : itemBg), borderRadius: 4, minWidth: 0,
          boxShadow: editingIndirect ? "0 0 12px rgba(204, 197, 185, 0.4), 0 0 24px rgba(204, 197, 185, 0.2)" : "none",
          transition: "background 0.15s ease, box-shadow 0.15s ease",
        }}>
          <PartyListSubsection
            label="Indirect Parties"
            parties={correctedIndirect}
            fieldBg={T.fieldBg}
            fieldBgEditing={T.fieldBgEditing}
            editing={editingIndirect}
            onChange={(i, v) => setCorrectedIndirect((prev) => prev.map((x, j) => j === i ? v : x))}
            onDelete={(i) => setCorrectedIndirect((prev) => prev.filter((_, j) => j !== i))}
            onAdd={() => setCorrectedIndirect((prev) => [...prev, ""])}
          />
          <CorrectedActionBar muted={!indirectChanged} variant={indirectChanged ? "corrected" : "attempted"} actions={[
            { label: "Reset", onClick: handleResetIndirect },
            { label: editingIndirect ? "Save" : "Edit", onClick: () => setEditingIndirect((e) => !e) },
          ]} />
        </div>
      </div>
    </>
  );
}

export function TransactionAnalysisContainer({ agentResult }: { agentResult: AgentResult }) {
  const graph = agentResult.pipeline_state?.transaction_graph;
  const graphData: GraphData | null = useMemo(() => graph ? toGraphData(graph as Parameters<typeof toGraphData>[0]) : null, [graph]);
  const nodes = (graph as Record<string, unknown> | null)?.nodes as Array<{ index: number; name: string; role: string }> | undefined;
  const reportingEntity = nodes?.find((n) => n.role === "reporting_entity");

  return (
    <ReviewSectionLayout
      notesPlaceholder="Any additional notes about the transaction structure — such as missing parties, incorrect relationships, or value flow errors."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
        <Subsection title="Transaction Structure" gap={16}>
          <div style={{ width: "100%", height: 350, borderRadius: 8, overflow: "hidden" }}>
            {graphData ? (
              <ForceGraph data={graphData} />
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: 12, color: "rgba(204, 197, 185, 0.6)" }}>
                No transaction graph available
              </div>
            )}
          </div>
        </Subsection>
        <Subsection title="Reporting Entity">
          {reportingEntity ? (
            <ReportingEntityView name={reportingEntity.name} />
          ) : (
            <p style={{ margin: 0, fontSize: 12, color: "rgba(204, 197, 185, 0.6)", textAlign: "center", padding: "20px 0" }}>No reporting entity</p>
          )}
        </Subsection>
        <Subsection title="Parties Involved">
          {nodes && nodes.length > 1 ? (
            <PartiesInvolvedItemView nodes={nodes} />
          ) : (
            <p style={{ margin: 0, fontSize: 12, color: "rgba(204, 197, 185, 0.6)", textAlign: "center", padding: "20px 0" }}>No parties data available</p>
          )}
        </Subsection>
        <Subsection title="Value Flows">
          <p style={{ margin: 0, fontSize: 12, color: "rgba(204, 197, 185, 0.6)", textAlign: "center", padding: "20px 0" }}>Coming soon</p>
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
] as const;

// ── Final Decision Review ────────────────────────────

type DecisionData = {
  decision: "PROCEED" | "MISSING_INFO" | "STUCK";
  rationale: string;
};

const DUMMY_DECISION: DecisionData = {
  decision: "PROCEED",
  rationale: "The transaction clearly describes a laptop purchase from Apple with an explicit amount. No ambiguity remains after applying conventional defaults.",
};

function DecisionItemView({ data }: { data: DecisionData }) {
  const isComplete = data.decision === "PROCEED";
  const [correctedComplete, setCorrectedComplete] = useState(isComplete);
  const [correctedRationale, setCorrectedRationale] = useState(data.rationale);
  const [editing, setEditing] = useState(false);

  function handleReset() {
    setCorrectedComplete(isComplete);
    setCorrectedRationale(data.rationale);
    setEditing(false);
  }

  const changed = correctedComplete !== isComplete || correctedRationale !== data.rationale;
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
            <DropdownSelect value={isComplete ? "Complete" : "Incomplete"} options={["Complete", "Incomplete"]} onChange={() => {}} />
            {" "}information to draft a journal entry.
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={T.fieldLabel}>Rationale</span>
          <div style={{ ...T.fieldText, ...T.fieldBg, padding: "4px 10px" }}>
            {data.rationale}
          </div>
        </div>
        <div style={{ height: 18 }} />
      </div>
      {/* Arrow */}
      <DashedArrow label={arrowLabel} color={arrowColor} />
      {/* Corrected */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column", gap: 16,
        padding: "8px 10px", background: editing ? (changed ? "rgba(79, 119, 45, 0.2)" : "rgba(255, 143, 0, 0.2)") : corrBg, borderRadius: 4, minWidth: 0,
        boxShadow: editing ? (changed
          ? "0 0 12px rgba(79, 119, 45, 0.4), 0 0 24px rgba(79, 119, 45, 0.2)"
          : "0 0 12px rgba(255, 143, 0, 0.4), 0 0 24px rgba(255, 143, 0, 0.2)") : "none",
        transition: "background 0.15s ease, box-shadow 0.15s ease",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={T.fieldLabel}>Ambiguity Conclusion</span>
          <div style={{ fontSize: 12, color: corrTextColor, lineHeight: 2.2 }}>
            This transaction has{" "}
            <DropdownSelect value={correctedComplete ? "Complete" : "Incomplete"} options={["Complete", "Incomplete"]}
              onChange={(v) => setCorrectedComplete(v === "Complete")} />
            {" "}information to draft a journal entry.
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={T.fieldLabel}>Rationale</span>
          {editing ? (
            <textarea
              rows={1}
              value={correctedRationale}
              onChange={(e) => setCorrectedRationale(e.target.value)}
              style={{ ...reviewTextareaStyle, ...T.fieldBgEditing }}
            />
          ) : (
            <div style={{ ...T.fieldText, ...T.fieldBg, padding: "4px 10px" }}>
              {correctedRationale}
            </div>
          )}
        </div>
        <CorrectedActionBar variant={changed ? "corrected" : "attempted"} actions={[
          { label: "Reset", onClick: handleReset },
          { label: editing ? "Save" : "Edit", onClick: () => setEditing((e) => !e) },
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

const DUMMY_ENTRY: EntryData = {
  reason: "Standard laptop purchase for business use, paid by company credit card.",
  currency: "CAD",
  lines: [
    { account_code: "", account_name: "Computer Equipment", type: "debit", amount: 2400 },
    { account_code: "", account_name: "Accounts Payable - Credit Card", type: "credit", amount: 2400 },
  ],
};


let _entryKeyCounter = 0;

// ── FinalEntryItemView (controlled) ─────────────────
function FinalEntryItemView({ data, correctedLines, lineKeys, correctedReason, editing, changed, sym, onLineChange, onAddLine, onDeleteLine, onReasonChange, onReset, onToggleEdit }: {
  data: EntryData;
  correctedLines: JournalLine[];
  lineKeys: string[];
  correctedReason: string;
  editing: boolean;
  changed: boolean;
  sym: string;
  onLineChange: (i: number, line: JournalLine) => void;
  onAddLine: (i: number) => void;
  onDeleteLine: (i: number) => void;
  onReasonChange: (reason: string) => void;
  onReset: () => void;
  onToggleEdit: () => void;
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
          <div style={{ fontSize: 11, color: T.textSecondary, fontStyle: "italic", background: T.attemptedSupplement, borderRadius: 3, padding: "4px 6px" }}>
            {data.reason}
          </div>
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
            editable={editing}
            lineKeys={editing ? lineKeys : undefined}
            onLineChange={editing ? onLineChange : undefined}
            onAddLine={editing ? onAddLine : undefined}
            onDeleteLine={editing ? onDeleteLine : undefined}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <SectionSubheader style={{ fontSize: 10 }}>Reason</SectionSubheader>
          {editing ? (
            <textarea
              rows={1}
              value={correctedReason}
              onChange={(e) => onReasonChange(e.target.value)}
              style={{
                ...reviewTextareaStyle,
                fontSize: 11,
                color: corrSubColor,
                fontStyle: "italic",
                padding: "4px 6px",
                background: changed ? "rgba(144, 169, 85, 0.2)" : "rgba(255, 165, 0, 0.2)",
                borderRadius: 3,
              }}
            />
          ) : (
            <div style={{ fontSize: 11, color: corrSubColor, fontStyle: "italic", background: suppBgCorrected, borderRadius: 3, padding: "4px 6px" }}>
              {correctedReason}
            </div>
          )}
        </div>
        <CorrectedActionBar variant={changed ? "corrected" : "attempted"} actions={[
          { label: "Reset", onClick: onReset },
          { label: editing ? "Save" : "Edit", onClick: onToggleEdit },
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
  const [typeByKey, setTypeByKey] = useState<Record<string, string | null>>({});
  const [dirByKey, setDirByKey] = useState<Record<string, string | null>>({});
  const [taxByKey, setTaxByKey] = useState<Record<string, string | null>>({});
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
          const allFilled = lines.length > 0 && lineKeys.every((k) => typeByKey[k] && dirByKey[k] && taxByKey[k]);
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
        {lines.map((line, i) => (
          <motion.div key={lineKeys[i]} initial={outerInitial} animate={outerAnimate} exit={outerExit}>
            <motion.div initial={innerInitial} animate={innerAnimate} exit={innerExit}
              style={{ display: "flex", gap: 0, alignItems: "stretch" }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <EntryRow line={line} index={i} currencySymbol={currencySymbol} colors={colors} />
              </div>
              <DashedArrow label="" color={palette.silver} />
              <div style={{ flex: 1, display: "flex", gap: 5, minWidth: 0 }}>
                <div style={{ ...rightCellStyle, background: typeByKey[lineKeys[i]] ? "rgba(79, 119, 45, 0.15)" : rightCellStyle.background, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <DropdownSelect
                    value={typeByKey[lineKeys[i]] ?? null}
                    options={ACCOUNT_TYPES}
                    placeholder="Select ..."
                    onChange={(v) => {
                      setTypeByKey((prev) => ({ ...prev, [lineKeys[i]]: v }));
                      setTaxByKey((prev) => ({ ...prev, [lineKeys[i]]: null }));
                    }}
                    style={{ width: "100%" }}
                  />
                </div>
                <div style={{ ...rightCellStyle, background: dirByKey[lineKeys[i]] ? "rgba(79, 119, 45, 0.15)" : rightCellStyle.background, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <DropdownSelect
                    value={dirByKey[lineKeys[i]] ?? null}
                    options={DIRECTIONS}
                    placeholder="Select ..."
                    onChange={(v) => setDirByKey((prev) => ({ ...prev, [lineKeys[i]]: v }))}
                    style={{ width: "100%" }}
                  />
                </div>
                <div style={{ ...rightCellStyle, background: taxByKey[lineKeys[i]] ? "rgba(79, 119, 45, 0.15)" : rightCellStyle.background, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <DropdownSelect
                    value={taxByKey[lineKeys[i]] ?? null}
                    options={taxonomyDict[(typeByKey[lineKeys[i]] ?? "").toLowerCase()] ?? []}
                    placeholder={typeByKey[lineKeys[i]] ? "Select ..." : "Select type first"}
                    onChange={(v) => setTaxByKey((prev) => ({ ...prev, [lineKeys[i]]: v }))}
                    allowNew
                    style={{ width: "100%" }}
                  />
                </div>
              </div>
            </motion.div>
          </motion.div>
        ))}
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

// ── FinalEntryReviewContainer (owns state) ──────────
export function FinalEntryReviewContainer({ agentResult }: { agentResult: AgentResult }) {
  const ed = agentResult.pipeline_state?.output_entry_drafter || agentResult.entry;
  const data: EntryData = ed ? {
    reason: ed.reason,
    currency: ed.currency || "CAD",
    lines: ed.lines,
  } : DUMMY_ENTRY;
  const [correctedLines, setCorrectedLines] = useState<JournalLine[]>(data.lines);
  const [lineKeys, setLineKeys] = useState<string[]>(() => data.lines.map(() => `ek-${++_entryKeyCounter}`));
  const [correctedReason, setCorrectedReason] = useState(data.reason);
  const [editing, setEditing] = useState(false);
  const [taxonomyDict, setTaxonomyDict] = useState<TaxonomyDict>({});

  useEffect(() => {
    getTaxonomy().then(setTaxonomyDict).catch(() => {});
  }, []);

  const sym = CURRENCY_SYM[data.currency] || "";
  const changed = correctedReason !== data.reason
    || JSON.stringify(correctedLines) !== JSON.stringify(data.lines);

  function handleReset() {
    setCorrectedLines(data.lines);
    setLineKeys(data.lines.map(() => `ek-${++_entryKeyCounter}`));
    setCorrectedReason(data.reason);
  }

  function handleAddLine(index: number) {
    const newLine: JournalLine = { account_code: "", account_name: "", type: "debit", amount: 0 };
    setCorrectedLines((prev) => [...prev.slice(0, index), newLine, ...prev.slice(index)]);
    setLineKeys((prev) => [...prev.slice(0, index), `ek-${++_entryKeyCounter}`, ...prev.slice(index)]);
  }

  function handleDeleteLine(index: number) {
    setCorrectedLines((prev) => prev.filter((_, i) => i !== index));
    setLineKeys((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <ReviewSectionLayout
      notesPlaceholder="Any additional notes about the final entry — such as incorrect accounts, wrong amounts, or missing lines."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
        <Subsection title="Final Entry">
          <AttemptedCorrectedLabels />
          <FinalEntryItemView
            data={data}
            correctedLines={correctedLines}
            lineKeys={lineKeys}
            correctedReason={correctedReason}
            editing={editing}
            changed={changed}
            sym={sym}
            onLineChange={(i, line) => setCorrectedLines((prev) => prev.map((l, j) => j === i ? line : l))}
            onAddLine={handleAddLine}
            onDeleteLine={handleDeleteLine}
            onReasonChange={setCorrectedReason}
            onReset={handleReset}
            onToggleEdit={() => setEditing((e) => !e)}
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

type TaxData = {
  reasoning: string;
  tax_mentioned: boolean;
  classification: "taxable" | "zero_rated" | "exempt" | "out_of_scope";
  itc_eligible: boolean;
  amount_tax_inclusive: boolean;
  tax_rate: number | null;
  tax_context: string | null;
};

const DUMMY_TAX: TaxData = {
  reasoning: "Text states 13% HST on a $2,000 laptop purchase for business use",
  tax_mentioned: true,
  classification: "taxable",
  itc_eligible: true,
  amount_tax_inclusive: false,
  tax_rate: 0.13,
  tax_context: "13% HST on the full purchase amount. ITC claimable as business expense.",
};

const CLASSIFICATION_OPTIONS = ["Taxable", "Zero-rated", "Exempt", "Out of scope"];
const BOOL_OPTIONS = ["Yes", "No"];

function classificationToDisplay(c: string): string {
  return ({ taxable: "Taxable", zero_rated: "Zero-rated", exempt: "Exempt", out_of_scope: "Out of scope" }[c] ?? c);
}
function displayToClassification(d: string): TaxData["classification"] {
  return ({ "Taxable": "taxable", "Zero-rated": "zero_rated", "Exempt": "exempt", "Out of scope": "out_of_scope" }[d] ?? "out_of_scope") as TaxData["classification"];
}

function TaxFieldItemView({ label, question, attemptedControl, correctedControl, editing, changed, onReset, onToggleEdit }: {
  label: string;
  question: string;
  attemptedControl: React.ReactNode;
  correctedControl: React.ReactNode;
  editing: boolean;
  changed: boolean;
  onReset: () => void;
  onToggleEdit: () => void;
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
          padding: "8px 10px", background: editing ? (changed ? "rgba(79, 119, 45, 0.2)" : "rgba(255, 143, 0, 0.2)") : corrBg, borderRadius: 4, minWidth: 0,
          boxShadow: editing ? (changed
            ? "0 0 12px rgba(79, 119, 45, 0.4), 0 0 24px rgba(79, 119, 45, 0.2)"
            : "0 0 12px rgba(255, 143, 0, 0.4), 0 0 24px rgba(255, 143, 0, 0.2)") : "none",
          transition: "background 0.15s ease, box-shadow 0.15s ease",
        }}>
          <div style={T.fieldLabel}>{question}</div>
          <div>{correctedControl}</div>
          <CorrectedActionBar variant={changed ? "corrected" : "attempted"} actions={[
            { label: "Reset", onClick: onReset },
            { label: editing ? "Save" : "Edit", onClick: onToggleEdit },
          ]} />
        </div>
      </div>
    </div>
  );
}

export function TaxReviewContainer({ agentResult }: { agentResult: AgentResult }) {
  const tax = agentResult.pipeline_state?.output_tax_specialist;
  const data: TaxData = tax ? {
    reasoning: tax.reasoning,
    tax_mentioned: tax.tax_mentioned,
    classification: tax.classification,
    itc_eligible: tax.itc_eligible,
    amount_tax_inclusive: tax.amount_tax_inclusive,
    tax_rate: tax.tax_rate,
    tax_context: tax.tax_context,
  } : DUMMY_TAX;

  const [corrTaxMentioned, setCorrTaxMentioned] = useState(data.tax_mentioned);
  const [corrClassification, setCorrClassification] = useState(data.classification);
  const [corrItcEligible, setCorrItcEligible] = useState(data.itc_eligible);
  const [corrAmountInclusive, setCorrAmountInclusive] = useState(data.amount_tax_inclusive);
  const [corrTaxRate, setCorrTaxRate] = useState(data.tax_rate);
  const [corrTaxContext, setCorrTaxContext] = useState(data.tax_context || "");

  const [editingField, setEditingField] = useState<string | null>(null);

  function toggleEdit(field: string) {
    setEditingField((prev) => prev === field ? null : field);
  }

  function resetField(field: string) {
    switch (field) {
      case "tax_mentioned": setCorrTaxMentioned(data.tax_mentioned); break;
      case "classification": setCorrClassification(data.classification); break;
      case "itc_eligible": setCorrItcEligible(data.itc_eligible); break;
      case "amount_tax_inclusive": setCorrAmountInclusive(data.amount_tax_inclusive); break;
      case "tax_rate": setCorrTaxRate(data.tax_rate); break;
      case "tax_context": setCorrTaxContext(data.tax_context || ""); break;
    }
    setEditingField(null);
  }

  return (
    <ReviewSectionLayout
      notesPlaceholder="Any additional notes about the tax treatment — such as special rules, mixed-use considerations, or jurisdiction-specific details."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
        <TaxFieldItemView
          label="Tax mentioned"
          question="Was tax mentioned in the transaction description?"
          attemptedControl={<SegmentedControl value={data.tax_mentioned ? "Yes" : "No"} options={BOOL_OPTIONS} onChange={() => {}} disabled />}
          correctedControl={
            <SegmentedControl value={corrTaxMentioned ? "Yes" : "No"} options={BOOL_OPTIONS}
              onChange={(v) => setCorrTaxMentioned(v === "Yes")} disabled={editingField !== "tax_mentioned"} editing={editingField === "tax_mentioned"} />
          }
          editing={editingField === "tax_mentioned"} changed={corrTaxMentioned !== data.tax_mentioned}
          onReset={() => resetField("tax_mentioned")} onToggleEdit={() => toggleEdit("tax_mentioned")}
        />

        <TaxFieldItemView
          label="Classification"
          question="What is the tax classification of this supply?"
          attemptedControl={<SegmentedControl value={classificationToDisplay(data.classification)} options={CLASSIFICATION_OPTIONS} onChange={() => {}} disabled />}
          correctedControl={
            <SegmentedControl value={classificationToDisplay(corrClassification)} options={CLASSIFICATION_OPTIONS}
              onChange={(v) => setCorrClassification(displayToClassification(v))} disabled={editingField !== "classification"} editing={editingField === "classification"} />
          }
          editing={editingField === "classification"} changed={corrClassification !== data.classification}
          onReset={() => resetField("classification")} onToggleEdit={() => toggleEdit("classification")}
        />

        <TaxFieldItemView
          label="ITC eligible"
          question="Can the business claim an Input Tax Credit?"
          attemptedControl={<SegmentedControl value={data.itc_eligible ? "Yes" : "No"} options={BOOL_OPTIONS} onChange={() => {}} disabled />}
          correctedControl={
            <SegmentedControl value={corrItcEligible ? "Yes" : "No"} options={BOOL_OPTIONS}
              onChange={(v) => setCorrItcEligible(v === "Yes")} disabled={editingField !== "itc_eligible"} editing={editingField === "itc_eligible"} />
          }
          editing={editingField === "itc_eligible"} changed={corrItcEligible !== data.itc_eligible}
          onReset={() => resetField("itc_eligible")} onToggleEdit={() => toggleEdit("itc_eligible")}
        />

        <TaxFieldItemView
          label="Amount tax-inclusive"
          question="Does the stated amount already include tax?"
          attemptedControl={<SegmentedControl value={data.amount_tax_inclusive ? "Yes" : "No"} options={BOOL_OPTIONS} onChange={() => {}} disabled />}
          correctedControl={
            <SegmentedControl value={corrAmountInclusive ? "Yes" : "No"} options={BOOL_OPTIONS}
              onChange={(v) => setCorrAmountInclusive(v === "Yes")} disabled={editingField !== "amount_tax_inclusive"} editing={editingField === "amount_tax_inclusive"} />
          }
          editing={editingField === "amount_tax_inclusive"} changed={corrAmountInclusive !== data.amount_tax_inclusive}
          onReset={() => resetField("amount_tax_inclusive")} onToggleEdit={() => toggleEdit("amount_tax_inclusive")}
        />

        <TaxFieldItemView
          label="Tax rate"
          question="What is the applicable tax rate?"
          attemptedControl={
            <div style={{ ...T.fieldText, ...T.fieldBg, padding: "4px 10px", fontWeight: 600 }}>
              {data.tax_rate != null ? `${(data.tax_rate * 100).toFixed(0)}%` : "—"}
            </div>
          }
          correctedControl={
            editingField === "tax_rate" ? (
              <input type="number" step="0.01" min="0" max="1"
                value={corrTaxRate ?? ""} onChange={(e) => setCorrTaxRate(e.target.value ? parseFloat(e.target.value) : null)}
                style={{
                  ...T.fieldText, ...T.fieldBgEditing, padding: "4px 10px", fontWeight: 600,
                  border: "none", outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box",
                }} />
            ) : (
              <div style={{ ...T.fieldText, ...T.fieldBg, padding: "4px 10px", fontWeight: 600 }}>
                {corrTaxRate != null ? `${(corrTaxRate * 100).toFixed(0)}%` : "—"}
              </div>
            )
          }
          editing={editingField === "tax_rate"} changed={corrTaxRate !== data.tax_rate}
          onReset={() => resetField("tax_rate")} onToggleEdit={() => toggleEdit("tax_rate")}
        />

        <TaxFieldItemView
          label="Tax context"
          question="What tax context is relevant for the entry drafter?"
          attemptedControl={
            <div style={{ ...T.fieldText, ...T.fieldBg, padding: "4px 10px" }}>
              {data.tax_context || <span style={{ opacity: 0.5 }}>—</span>}
            </div>
          }
          correctedControl={
            editingField === "tax_context" ? (
              <textarea rows={1} value={corrTaxContext} onChange={(e) => setCorrTaxContext(e.target.value)}
                style={{ ...reviewTextareaStyle, ...T.fieldBgEditing }} />
            ) : (
              <div style={{ ...T.fieldText, ...T.fieldBg, padding: "4px 10px" }}>
                {corrTaxContext || <span style={{ opacity: 0.5 }}>—</span>}
              </div>
            )
          }
          editing={editingField === "tax_context"} changed={corrTaxContext !== (data.tax_context || "")}
          onReset={() => resetField("tax_context")} onToggleEdit={() => toggleEdit("tax_context")}
        />
      </div>
    </ReviewSectionLayout>
  );
}

export function ReviewSectionContainer({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <ReviewSectionLayout notesPlaceholder={`Any additional notes about ${title.toLowerCase()} that the agent may have missed or handled incorrectly.`}>
      {children || <p style={{ margin: 0, fontSize: 12, color: T.textMuted, textAlign: "center", padding: "20px 0" }}>No items to review.</p>}
    </ReviewSectionLayout>
  );
}
