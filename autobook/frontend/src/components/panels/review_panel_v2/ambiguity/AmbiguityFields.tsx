/**
 * Single ambiguity item view — copied from review_panel/ReviewPanel.tsx AmbiguityItemView.
 * Renders attempted vs corrected for one ambiguity (by id).
 */
import { useState } from "react";
import { IoChevronDownSharp, IoChevronUpSharp } from "react-icons/io5";
import { useDraftStore } from "../../store";
import { palette, T } from "../../shared/tokens";
import { ReviewTextField } from "../../shared/ReviewTextField";
import { DeleteButton } from "../../shared/DeleteButton";
import { AddButton } from "../../shared/AddButton";
import { AmbiguitySubRow } from "../shared/AmbiguitySubRow";
import { STATUS_VISUAL, type DiffStatus } from "../../review_panel/diff";
import type { AmbiguityOutput } from "../../../../api/types";
import s from "../../panels.module.css";

export function AmbiguityFields({ id }: { id: string }) {
  const [open, setOpen] = useState(false);

  const attempted = useDraftStore((st) =>
    st.attempted.output_decision_maker?.ambiguities?.find((a) => a.id === id)
  );
  const corrected = useDraftStore((st) =>
    st.corrected.output_decision_maker?.ambiguities?.find((a) => a.id === id)
  );
  const setCorrected = useDraftStore((st) => st.setCorrected);

  if (!attempted && !corrected) return null;

  const aspectChanged = !!attempted && !!corrected && corrected.aspect !== attempted.aspect;
  const defaultsChanged = !!attempted && !!corrected && (
    (corrected.input_contextualized_conventional_default ?? "") !== (attempted.input_contextualized_conventional_default ?? "") ||
    (corrected.input_contextualized_ifrs_default ?? "") !== (attempted.input_contextualized_ifrs_default ?? "")
  );
  const clarificationChanged = !!attempted && !!corrected && (
    (corrected.clarification_question ?? "") !== (attempted.clarification_question ?? "") ||
    JSON.stringify((corrected.cases ?? []).map((c) => c.case)) !== JSON.stringify((attempted.cases ?? []).map((c) => c.case))
  );

  let status: DiffStatus;
  if (!attempted) status = "added";
  else if (!corrected) status = "disabled";
  else if (aspectChanged || defaultsChanged || clarificationChanged) status = "updated";
  else status = "kept";

  function mutate(updater: (amb: AmbiguityOutput) => void) {
    setCorrected((draft) => {
      const list = draft.output_decision_maker?.ambiguities;
      if (!list) return;
      const target = list.find((a) => a.id === id);
      if (target) updater(target);
    });
  }

  const setAspect = (v: string) => mutate((a) => { a.aspect = v; });
  const setConventional = (v: string) => mutate((a) => { a.input_contextualized_conventional_default = v; });
  const setIfrs = (v: string) => mutate((a) => { a.input_contextualized_ifrs_default = v; });
  const setQuestion = (v: string) => mutate((a) => { a.clarification_question = v; });
  const updateCaseAt = (caseIdx: number, v: string) =>
    mutate((a) => { if (a.cases && a.cases[caseIdx]) a.cases[caseIdx].case = v; });
  const addCase = () =>
    mutate((a) => {
      if (!a.cases) a.cases = [];
      a.cases.push({ id: `c-new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, case: "" });
    });
  const removeCaseAt = (caseIdx: number) =>
    mutate((a) => { if (a.cases) a.cases.splice(caseIdx, 1); });

  const resetAspect = () => { if (attempted) mutate((a) => { a.aspect = attempted.aspect; }); };
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

  const isDisabled = status === "disabled";
  const handleToggleDisable = () => {
    setCorrected((draft) => {
      const dm = draft.output_decision_maker;
      if (!dm) return;
      if (!dm.ambiguities) dm.ambiguities = [];
      if (isDisabled && attempted) {
        dm.ambiguities.push(structuredClone(attempted));
      } else {
        const idx = dm.ambiguities.findIndex((a) => a.id === id);
        if (idx >= 0) dm.ambiguities.splice(idx, 1);
      }
    });
  };

  const displayAmb = attempted ?? corrected!;
  const editAmb = corrected ?? displayAmb;
  const visual = STATUS_VISUAL[status];
  const corrTextColor = T.textPrimary;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
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
      <div className={`${s.collapsibleWrapper} ${open ? s.collapsibleWrapperOpen : ""}`}>
        <div className={s.collapsibleInner}>
          <div className={s.collapsibleFade} style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 12, paddingBottom: 12, opacity: isDisabled ? 0.5 : 1, transition: "opacity 0.15s ease" }}>

            <AmbiguitySubRow label="Aspect" changed={aspectChanged} added={status === "added"} onReset={resetAspect}
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

            <AmbiguitySubRow label="Default Interpretation" changed={defaultsChanged} added={status === "added"} onReset={resetDefaults}
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

            <AmbiguitySubRow label="Clarification" changed={clarificationChanged} added={status === "added"} onReset={resetClarification}
              attemptedContent={<>
                {displayAmb.clarification_question && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={T.fieldLabel}>Clarification question</span>
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
                  <span style={{ ...T.fieldLabel, color: corrTextColor }}>Clarification question</span>
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

            {attempted && (
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  className={s.buttonTransition}
                  onClick={handleToggleDisable}
                  title="This transaction does not have the stated ambiguity"
                  style={{
                    background: "rgba(204, 197, 185, 0.15)", border: "none", borderRadius: 3,
                    padding: "2px 8px", fontSize: 10, fontWeight: 600, color: palette.carbonBlack, cursor: "pointer",
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
