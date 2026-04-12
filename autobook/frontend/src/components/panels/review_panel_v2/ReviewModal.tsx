/**
 * Shared Review & Correct modal shell.
 *
 * Owns: modal backdrop, header (title + help + transaction text),
 * body (section tabs with display:none switching), footer (progress
 * indicators + Back/Next/Submit).
 *
 * Used by both EntryDrafterPage and EntryViewerPage.
 */
import { createContext, useContext, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { BsStars, BsExclamationTriangle } from "react-icons/bs";
import { MOTION, T, PrimaryButton, HoverButton } from "../shared";
import { TransactionDisplay } from "../shared/TransactionDisplay";
import { useDraftStore } from "../store";
import { submitCorrection } from "../../../api/corrections";
import { validateCorrected } from "./validation";
import type { SectionDef } from "./shared/types";
import type { Section as ValidationSection } from "./validation";
import s from "../panels.module.css";

/** Map review panel section keys → validation section filters. */
const SECTION_TO_VALIDATION: Record<string, ValidationSection> = {
  parties: "transaction",
  "value-flow": "transaction",
  tax: "tax",
  entry: "entry",
  relationship: "entry",
  conclusion: "ambiguity",
  summary: "transaction", // summary runs all, but we check all issues there
};
function validationSectionForKey(key: string): ValidationSection | null {
  if (key.startsWith("ambiguity-")) return "ambiguity";
  if (key === "add-ambiguity") return "ambiguity";
  return SECTION_TO_VALIDATION[key] ?? null;
}

const ShowAttemptedContext = createContext(false);
export function useShowAttempted() { return useContext(ShowAttemptedContext); }

function ProgressPill({ title, active, onClick }: { title: string; active: boolean; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const showLabel = active || hovered;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ padding: "6px 2px", cursor: "pointer" }}
    >
    <motion.div
      layout
      animate={{
        background: active ? "rgba(235, 94, 40, 0.7)" : hovered ? "rgba(64, 61, 57, 0.7)" : "rgba(204, 197, 185, 0.7)",
        padding: showLabel ? "0px 10px" : "0px 5px",
      }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      style={{
        display: "flex", alignItems: "center", height: 20, borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <motion.div
        animate={{ background: active ? "#fff" : "rgba(64, 61, 57, 0.5)" }}
        transition={{ duration: 0.15 }}
        style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0 }}
      />
      <AnimatePresence>
        {showLabel && (
          <motion.span
            initial={{ width: 0, opacity: 0, marginLeft: 0 }}
            animate={{ width: "auto", opacity: 1, marginLeft: 6 }}
            exit={{ width: 0, opacity: 0, marginLeft: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            style={{
              fontSize: 10, fontWeight: 600,
              color: active ? "#fff" : "rgba(255,255,255,0.9)",
              whiteSpace: "nowrap", overflow: "hidden",
              maxWidth: 100, textOverflow: "ellipsis",
            }}
          >
            {title}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
    </div>
  );
}

export function ReviewModal({ sections, transactionText, visible, anchorRef, onClose }: {
  sections: SectionDef[];
  transactionText: string;
  visible: boolean;
  anchorRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showAttempted, setShowAttempted] = useState(false);
  const [showIssues, setShowIssues] = useState(false);

  const corrected = useDraftStore((st) => st.corrected);
  const allIssues = useMemo(() => validateCorrected(corrected), [corrected]);
  const currentSectionKey = sections[step]?.key ?? "";
  const valSection = validationSectionForKey(currentSectionKey);
  const sectionIssues = valSection != null ? allIssues.filter((i) => i.section === valSection) : [];
  const hasIssues = sectionIssues.length > 0;

  function handleClose() {
    void useDraftStore.getState().flushIfDirty();
    onClose();
  }

  async function handleSubmit() {
    const did = useDraftStore.getState().draftId;
    if (!did) return;
    setSubmitting(true);
    try {
      await useDraftStore.getState().flushIfDirty();
      await submitCorrection(did);
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 2000);
    } catch (err) {
      console.error("Submit correction failed:", err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 100, background: "transparent",
        opacity: visible ? 1 : 0,
        transition: `opacity ${MOTION.normal}ms ease`,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div style={{
        position: "absolute",
        top: anchorRef.current?.getBoundingClientRect().top ?? 0,
        left: anchorRef.current?.getBoundingClientRect().left ?? 0,
        width: anchorRef.current?.offsetWidth ?? "100%",
        height: anchorRef.current?.offsetHeight ?? "100%",
        background: "rgba(204, 197, 185, 0.15)",
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        borderRadius: T.panelRadius,
        border: "1px solid rgba(204, 197, 185, 0.2)",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(8px)",
        transition: `opacity ${MOTION.normal}ms ease, transform ${MOTION.normal}ms ease`,
        boxShadow: T.panelShadow,
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ padding: "16px 20px", flexShrink: 0, display: "flex", flexDirection: "column", gap: 4, borderBottom: "1px solid rgba(64, 61, 57, 0.15)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: T.textPrimary }}>Review & Correct</h2>
            <HoverButton onClick={handleClose} bgHover="rgba(204, 197, 185, 0.3)" color={T.textSecondary} style={{ fontSize: 18, lineHeight: 1, padding: "2px 6px", borderRadius: 4 }}>✕</HoverButton>
          </div>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: T.textPrimary }}>{sections[step]?.title}</h3>
            <button
              className={s.buttonTransition}
              onClick={() => setShowHelp((v) => !v)}
              style={{ background: showHelp ? "rgba(204, 197, 185, 0.3)" : "transparent", border: "none", borderRadius: "50%", width: 18, height: 18, fontSize: 11, fontWeight: 700, color: T.textSecondary, cursor: "pointer", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(204, 197, 185, 0.3)"; }}
              onMouseLeave={(e) => { if (!showHelp) e.currentTarget.style.background = "transparent"; }}
            >?</button>
          </div>
          <div className={`${s.collapsibleWrapper} ${showHelp ? s.collapsibleWrapperOpen : ""}`}>
            <div className={s.collapsibleInner}>
              <div style={{ margin: "0 auto", fontSize: 11, color: T.textSecondary, textAlign: "center", width: "55%", lineHeight: 1.6, paddingBottom: 12, borderBottom: "1px solid rgba(64, 61, 57, 0.15)" }}>
                <p style={{ margin: 0 }}>Review and correct the agent's output for this section.</p>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 16, paddingRight: 8 }}>
            <TransactionDisplay text={transactionText} />
          </div>
        </div>

        {/* Body — all sections mounted, only active one visible */}
        <ShowAttemptedContext.Provider value={showAttempted}>
        {sections.map((sec, i) => {
          const Section = sec.component as React.ComponentType<Record<string, unknown>>;
          return (
            <div key={sec.key} className={s.scrollable} style={{ flex: 1, overflowY: "auto", scrollbarGutter: "auto", padding: "20px", display: step === i ? "flex" : "none", flexDirection: "column", gap: 24 }}>
              <Section {...(sec.props ?? {})} />
            </div>
          );
        })}
        </ShowAttemptedContext.Provider>

        {/* Validation issues panel */}
        <AnimatePresence>
          {showIssues && sectionIssues.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              style={{ flexShrink: 0, overflow: "hidden" }}
            >
              <div style={{ margin: "0 12px 8px", background: "rgba(235, 94, 40, 0.1)", border: "1px solid rgba(235, 94, 40, 0.25)", borderRadius: 8, padding: "14px 18px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary, marginBottom: 10 }}>
                  {sectionIssues.length} {sectionIssues.length === 1 ? "warning" : "warnings"} — review before submitting
                </div>
                <div className={s.scrollable} style={{ maxHeight: 140, overflowY: "auto" }}>
                  <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
                    {sectionIssues.map((issue, i) => (
                      <li key={i} style={{ fontSize: 12, color: T.textPrimary, lineHeight: 1.5 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, padding: "1px 6px", borderRadius: 3, background: "rgba(235, 94, 40, 0.15)", color: "#EB5E28", marginRight: 8, verticalAlign: "middle" }}>
                          {issue.section}
                        </span>
                        {issue.message}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <div style={{ padding: "12px 20px", flexShrink: 0, display: "flex", alignItems: "center", borderTop: "1px solid rgba(64, 61, 57, 0.15)" }}>
          <div style={{ width: 160, display: "flex", alignItems: "center", gap: 4 }}>
            <HoverButton
              type="button"
              bgHover="rgba(204, 197, 185, 0.3)"
              color={showAttempted ? T.textPrimary : T.textSecondary}
              onClick={() => setShowAttempted((v) => !v)}
              style={{ padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}
            >
              <BsStars style={{ width: 16, height: 16, flexShrink: 0 }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{showAttempted ? "Hide Attempted" : "Show Attempted"}</span>
            </HoverButton>
            <HoverButton
              type="button"
              bgHover={hasIssues ? "rgba(235, 94, 40, 0.15)" : "rgba(204, 197, 185, 0.3)"}
              color={hasIssues ? "#EB5E28" : T.textSecondary}
              colorHover={hasIssues ? "#EB5E28" : T.textSecondary}
              onClick={() => setShowIssues((v) => !v)}
              style={{ padding: "4px 8px", borderRadius: 6, fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}
            >
              <BsExclamationTriangle style={{ width: 14, height: 14, flexShrink: 0 }} />
            </HoverButton>
          </div>
          {/* Progress indicators */}
          <div style={{ flex: 1, display: "flex", justifyContent: "center", gap: 8, alignItems: "center" }}>
            {sections.map((sec, i) => {
              const isActive = i === step;
              return (
                <ProgressPill
                  key={sec.key}
                  title={sec.title}
                  active={isActive}
                  onClick={() => setStep(i)}
                />
              );
            })}
          </div>
          {/* Back + Next/Submit */}
          <div style={{ display: "flex", gap: 8, width: 160, justifyContent: "flex-end" }}>
            {step > 0 && <PrimaryButton size="sm" onClick={() => setStep((s) => s - 1)}>Back</PrimaryButton>}
            <PrimaryButton
              size="sm"
              disabled={submitting || submitted}
              onClick={async () => {
                if (step < sections.length - 1) {
                  setStep((s) => s + 1);
                } else {
                  await handleSubmit();
                }
              }}
            >
              {(() => {
                const label = step === sections.length - 1
                  ? (submitting ? "Submitting…" : submitted ? "Submitted" : "Submit")
                  : "Next";
                return <span key={label} style={{ display: "inline-block", animation: "jurisdictionIn 0.25s ease" }}>{label}</span>;
              })()}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}
