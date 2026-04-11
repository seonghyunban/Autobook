import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAutoSave } from "../hooks/useAutoSave";
import { submitCorrection } from "../api/corrections";
import { fetchDraftDetail, type DraftDetail } from "../api/drafts";
import { useLLMInteractionStore } from "../components/panels/store";
import s from "../components/panels/panels.module.css";
import type { AgentAttemptedTrace, HumanCorrectedTrace } from "../api/types";

import { MOTION, palette, T, panel, PanelHeader, HoverButton, PrimaryButton } from "../components/panels/shared";
import { ReasoningStream, defaultManifest, reconstructReasoning } from "../components/panels/reasoning_panel";
import type { ReasoningChunk, SectionId } from "../components/panels/reasoning_panel";
import {
  TransactionAnalysisContainer,
  AmbiguityReviewContainer,
  TaxReviewContainer,
  FinalEntryReviewContainer,
  ReviewSectionContainer,
  REVIEW_SECTIONS,
  CorrectionSummaryContainer,
} from "../components/panels/review_panel";
import { TransactionDisplay } from "../components/panels/shared/TransactionDisplay";
import { motion, AnimatePresence } from "motion/react";
import { EntryTable, DecisionContent } from "../components/panels/entry_panel";

const CURRENCY_SYMBOLS: Record<string, string> = {
  CAD: "$", USD: "$", KRW: "₩", EUR: "€", GBP: "£", JPY: "¥", CNY: "¥",
};

function currencySymbol(entry: { currency?: string; currency_symbol?: string } | null | undefined): string {
  if (!entry) return "";
  return entry.currency_symbol || CURRENCY_SYMBOLS[entry.currency ?? ""] || "";
}

/**
 * Convert a DraftDetail (from DB) into an AgentAttemptedTrace shape
 * that the Zustand store and all review/entry panels can consume.
 */
function detailToTrace(detail: DraftDetail): AgentAttemptedTrace {
  const attempt = detail.traces.find((t) => t.kind === "attempt");
  const graph = detail.graph;
  const entry = detail.entry;

  return {
    transaction_text: detail.raw_text,
    transaction_graph: graph
      ? {
          nodes: graph.nodes.map((n) => ({ index: n.index, name: n.name, role: n.role as "reporting_entity" | "counterparty" | "indirect_party" })),
          edges: graph.edges.map((e) => ({
            id: "",
            source: e.source,
            source_index: e.source_index,
            target: e.target,
            target_index: e.target_index,
            nature: e.nature,
            kind: e.kind as "reciprocal_exchange" | "chained_exchange" | "non_exchange" | "relationship",
            amount: e.amount,
            currency: e.currency,
          })),
        }
      : null,
    output_decision_maker: attempt
      ? {
          decision: (attempt.decision_kind as "PROCEED" | "MISSING_INFO" | "STUCK") ?? "PROCEED",
          rationale: attempt.decision_rationale ?? "",
          ambiguities: attempt.ambiguities.map((a) => ({
            id: "",
            aspect: a.aspect,
            ambiguous: a.ambiguous,
            input_contextualized_conventional_default: a.conventional_default,
            input_contextualized_ifrs_default: a.ifrs_default,
            clarification_question: a.clarification_question,
            cases: a.cases.map((c) => ({
              id: "",
              case: c.case_text,
              possible_entry: c.proposed_entry_json ?? undefined,
            })),
          })),
          complexity_flags: attempt.complexity_flags ?? [],
        }
      : null,
    output_tax_specialist: attempt
      ? {
          reasoning: attempt.tax_reasoning ?? "",
          tax_mentioned: attempt.tax_mentioned ?? false,
          classification: (attempt.tax_classification as "taxable" | "zero_rated" | "exempt" | "out_of_scope") ?? "out_of_scope",
          itc_eligible: attempt.tax_itc_eligible ?? false,
          amount_tax_inclusive: attempt.tax_amount_inclusive ?? false,
          tax_rate: attempt.tax_rate,
          tax_context: attempt.tax_context,
        }
      : null,
    output_entry_drafter: entry
      ? {
          reason: entry.entry_reason ?? "",
          currency: entry.lines[0]?.currency ?? "CAD",
          lines: entry.lines.map((l) => ({
            id: l.id,
            account_code: l.account_code,
            account_name: l.account_name,
            type: l.type as "debit" | "credit",
            amount: l.amount,
          })),
        }
      : null,
    output_debit_classifier: attempt?.classifier_output?.debit ?? null,
    output_credit_classifier: attempt?.classifier_output?.credit ?? null,
    decision: (attempt?.decision_kind as "PROCEED" | "MISSING_INFO" | "STUCK") ?? null,
    debit_relationship: {},
    credit_relationship: {},
    rag_normalizer_hits: attempt?.rag_hits?.normalizer ?? [],
    rag_local_hits: attempt?.rag_hits?.local ?? [],
    rag_pop_hits: attempt?.rag_hits?.pop ?? [],
    jurisdiction: detail.jurisdiction ?? null,
  };
}

/**
 * If a correction trace exists in the detail, build a HumanCorrectedTrace
 * from it so the review panel shows the saved corrections.
 */
function detailToCorrected(detail: DraftDetail): Partial<HumanCorrectedTrace> | null {
  const correction = detail.traces.find((t) => t.kind === "correction");
  if (!correction) return null;

  const correctionEntry = detail.correction_entry;

  // Only include fields that have actual correction data.
  // Omitting a field means hydrateCorrected keeps the attempted value.
  const result: Partial<HumanCorrectedTrace> = {
    decision: (correction.decision_kind as "PROCEED" | "MISSING_INFO" | "STUCK") ?? undefined,
    output_tax_specialist: {
      tax_mentioned: correction.tax_mentioned ?? false,
      classification: (correction.tax_classification as "taxable" | "zero_rated" | "exempt" | "out_of_scope") ?? "out_of_scope",
      itc_eligible: correction.tax_itc_eligible ?? false,
      amount_tax_inclusive: correction.tax_amount_inclusive ?? false,
      tax_rate: correction.tax_rate,
      tax_context: correction.tax_context,
    },
    notes: {
      transactionAnalysis: correction.note_tx_analysis ?? "",
      ambiguity: correction.note_ambiguity ?? "",
      tax: correction.note_tax ?? "",
      finalEntry: correction.note_entry ?? "",
    },
  };

  if (correction.ambiguities.length > 0) {
    result.output_decision_maker = {
      decision: (correction.decision_kind as "PROCEED" | "MISSING_INFO" | "STUCK") ?? "PROCEED",
      rationale: correction.decision_rationale ?? "",
      ambiguities: correction.ambiguities.map((a) => ({
        id: "",
        aspect: a.aspect,
        ambiguous: a.ambiguous,
        input_contextualized_conventional_default: a.conventional_default,
        input_contextualized_ifrs_default: a.ifrs_default,
        clarification_question: a.clarification_question,
        cases: a.cases.map((c) => ({
          id: "",
          case: c.case_text,
          possible_entry: c.proposed_entry_json ?? undefined,
        })),
      })),
    };
  }

  if (correctionEntry) {
    result.output_entry_drafter = {
      reason: correctionEntry.entry_reason ?? "",
      currency: correctionEntry.lines[0]?.currency ?? "CAD",
      lines: correctionEntry.lines.map((l) => ({
        id: l.id,
        account_code: l.account_code,
        account_name: l.account_name,
        type: l.type as "debit" | "credit",
        amount: l.amount,
      })),
    };
  }

  if (detail.correction_graph) {
    const g = detail.correction_graph;
    result.transaction_graph = {
      nodes: g.nodes.map((n) => ({ index: n.index, name: n.name, role: n.role as "reporting_entity" | "counterparty" | "indirect_party" })),
      edges: g.edges.map((e) => ({
        id: "",
        source: e.source,
        source_index: e.source_index,
        target: e.target,
        target_index: e.target_index,
        nature: e.nature,
        kind: e.kind as "reciprocal_exchange" | "chained_exchange" | "non_exchange" | "relationship",
        amount: e.amount,
        currency: e.currency,
      })),
    };
  }

  return result;
}

export function EntryViewerPage() {
  useAutoSave();
  const navigate = useNavigate();
  const { draftId } = useParams<{ draftId: string }>();
  const [detail, setDetail] = useState<DraftDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const agentResult = useLLMInteractionStore((st) => st.attempted);
  const visibleSections = agentResult.decision === "PROCEED" || !agentResult.decision
    ? REVIEW_SECTIONS
    : REVIEW_SECTIONS.filter((s) => s.key === "transaction_analysis" || s.key === "ambiguity" || s.key === "summary");
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [showReviewHelp, setShowReviewHelp] = useState(false);
  const [reviewStep, setReviewStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const showReasoning = true;
  const [windowResizing, setWindowResizing] = useState(false);
  const [reasoningWidth, setReasoningWidth] = useState(320);
  const [reasoningFullscreen, setReasoningFullscreen] = useState(false);
  const [reasoningFullscreenAnimating, setReasoningFullscreenAnimating] = useState(false);
  const [reasoningExiting, setReasoningExiting] = useState(false);
  const [graphLayoutVersion, setGraphLayoutVersion] = useState(0);
  const [isResizing, setIsResizing] = useState(false);
  const savedReasoningWidth = useRef(320);
  const reasoningSectionRef = useRef<HTMLDivElement>(null);
  const resizing = useRef(false);
  const mainContentRef = useRef<HTMLDivElement>(null);
  const entryScrollRef = useRef<HTMLDivElement>(null);

  // Build full reasoning from the attempted trace using default pipeline order
  const reasoningSections: Record<SectionId, ReasoningChunk[]> = reconstructReasoning(agentResult, defaultManifest(agentResult));

  // Fetch detail and hydrate store
  useEffect(() => {
    if (!draftId) return;
    setLoading(true);
    fetchDraftDetail(draftId)
      .then((d) => {
        setDetail(d);
        const trace = detailToTrace(d);
        useLLMInteractionStore.getState().resetAll(trace, d.id);

        // Hydrate saved corrections if they exist
        const corrected = detailToCorrected(d);
        if (corrected) {
          useLLMInteractionStore.getState().hydrateCorrected(corrected);
        }

        if (trace.decision === "MISSING_INFO" || trace.decision === "STUCK") {
          requestAnimationFrame(() => setOverlayVisible(true));
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load draft"))
      .finally(() => setLoading(false));
  }, [draftId]);

  // Window resize handler
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onResize = () => {
      setWindowResizing(true);
      clearTimeout(timer);
      timer = setTimeout(() => setWindowResizing(false), 100);
    };
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); clearTimeout(timer); };
  }, []);

  useEffect(() => {
    if (!reasoningFullscreen || reasoningExiting) return;
    const onResize = () => setReasoningWidth(mainContentRef.current?.offsetWidth ?? 800);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [reasoningFullscreen, reasoningExiting]);

  function closeReviewModal() {
    setReviewModalVisible(false);
    setTimeout(() => setShowReviewModal(false), MOTION.normal);
  }

  function toggleReasoningFullscreen() {
    if (!reasoningFullscreen) {
      savedReasoningWidth.current = reasoningWidth;
      setReasoningFullscreen(true);
      setReasoningFullscreenAnimating(true);
      requestAnimationFrame(() => setReasoningWidth(mainContentRef.current?.offsetWidth ?? 800));
      setTimeout(() => { setReasoningFullscreenAnimating(false); setGraphLayoutVersion((v) => v + 1); }, MOTION.expand);
    } else {
      setReasoningWidth(savedReasoningWidth.current);
      setReasoningExiting(true);
      setReasoningFullscreenAnimating(true);
      setTimeout(() => { setReasoningFullscreen(false); setReasoningExiting(false); setReasoningFullscreenAnimating(false); setGraphLayoutVersion((v) => v + 1); }, MOTION.expand);
    }
  }

  if (loading) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.pageFont, color: T.textSecondary }}>
        Loading draft...
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.pageFont, color: T.errorText }}>
        {error || "Draft not found"}
      </div>
    );
  }

  return (
    <div
      style={{
        height: "100%",
        minWidth: 800,
        padding: 20,
        boxSizing: "border-box",
        fontFamily: T.pageFont,
        color: T.pageText,
      }}
    >
      <div style={{ margin: "0 auto", display: "flex", flexDirection: "column", gap: 20, height: "100%" }}>

        <div ref={mainContentRef} style={{ display: "flex", gap: 0, flex: 1, minHeight: 0, position: "relative" }}>

          <div style={{ display: "flex", gap: 0, flex: 1, minHeight: 0, minWidth: 440 }}>
            <div style={{
              display: "flex", flexDirection: "column", gap: 20, flex: 1, minHeight: 0, minWidth: 420,
              marginRight: showReasoning ? 20 : 0,
              transition: windowResizing ? "none" : (showReasoning ? "margin-right 0.4s ease" : `margin-right 0.4s ease ${MOTION.expand}ms`),
            }}>

              {/* Entry panel */}
              <section style={{ ...panel, overflow: "hidden", flex: 1, minHeight: 0, position: "relative" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, minWidth: 0 }}>
                  <div style={{ minWidth: 0, flex: 1, display: "flex", alignItems: "center", gap: 12 }}>
                    <HoverButton
                      type="button"
                      bgHover="rgba(204, 197, 185, 0.25)"
                      color={T.textSecondary}
                      colorHover={palette.carbonBlack}
                      onClick={() => navigate("/history")}
                      style={{ padding: "4px 8px", borderRadius: 6, fontSize: 12, fontWeight: 500, flexShrink: 0 }}
                    >
                      ←
                    </HoverButton>
                    <PanelHeader
                      title="Entry"
                      help={agentResult.output_entry_drafter?.lines?.length
                        ? "Journal entry from the agent pipeline."
                        : "No entry data available."}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <HoverButton
                      type="button"
                      bgHover={palette.silver}
                      color={T.textSecondary}
                      colorHover={palette.carbonBlack}
                      borderColor={T.inputBorder}
                      borderColorHover={palette.silver}
                      onClick={() => { setShowReviewModal(true); requestAnimationFrame(() => setReviewModalVisible(true)); }}
                      style={{ padding: "6px 14px", borderRadius: T.buttonRadius, fontSize: 12, fontWeight: 600 }}
                    >
                      Review & Correct
                    </HoverButton>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, position: "relative" }}>
                  <AnimatePresence mode="wait">
                    {overlayVisible && (agentResult.decision === "MISSING_INFO" || agentResult.decision === "STUCK") ? (
                      <motion.div
                        key="decision"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
                      >
                        <DecisionContent data={agentResult as unknown as Record<string, unknown>} />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="entry"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
                      >
                        <EntryTable lines={agentResult.output_entry_drafter?.lines || []} currencySymbol={currencySymbol(agentResult.output_entry_drafter)} scrollable minRows={12} showAccountCode rowAppearAnimation scrollRef={entryScrollRef} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </section>

              {/* Input (read-only) */}
              <section style={{ ...panel, flexShrink: 0 }}>
                <PanelHeader title="Transaction" help="The original transaction text submitted." />
                <div style={{
                  background: T.inputBg,
                  borderRadius: T.inputRadius,
                  border: `1px solid ${T.inputBorder}`,
                  padding: "10px 12px",
                  fontSize: 14,
                  color: palette.carbonBlack,
                  fontFamily: "inherit",
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                  minHeight: 40,
                }}>
                  {detail.raw_text}
                </div>
              </section>
            </div>
          </div>

          {/* Reasoning panel */}
          <div style={{
            flexShrink: 0,
            position: "relative",
            width: (!showReasoning || (reasoningFullscreen && !reasoningExiting)) ? 0 : reasoningWidth,
            transition: (isResizing || (reasoningFullscreen && !reasoningFullscreenAnimating))
              ? "none"
              : showReasoning ? "width 0.4s ease" : `width 0.4s ease ${MOTION.normal}ms`,
          }}>
            <section
              ref={reasoningSectionRef}
              style={{
                position: "absolute",
                top: 0, right: 0, bottom: 0,
                zIndex: (reasoningFullscreen || reasoningExiting) ? 10 : "auto",
                width: showReasoning
                  ? ((reasoningFullscreen && !reasoningExiting) ? (mainContentRef.current?.offsetWidth ?? 800) : reasoningWidth)
                  : 0,
                overflow: "hidden",
                background: showReasoning ? "rgba(204, 197, 185, 0.15)" : "transparent",
                backdropFilter: showReasoning ? "blur(16px)" : "none",
                WebkitBackdropFilter: showReasoning ? "blur(16px)" : "none",
                borderRadius: T.panelRadius,
                padding: showReasoning ? T.panelPadding : 0,
                display: "flex",
                flexDirection: "column",
                gap: T.panelGap,
                border: showReasoning ? "1px solid rgba(204, 197, 185, 0.2)" : "none",
                boxShadow: showReasoning ? T.panelShadow : "none",
                ...((reasoningFullscreen || reasoningExiting) ? { transition: "width 0.4s ease, padding 0.4s ease, background 0.4s ease, box-shadow 0.4s ease, border 0.4s ease" } : {}),
              }}
              className={(reasoningFullscreen || reasoningExiting) ? undefined : (isResizing ? s.reasoningResizing : showReasoning ? s.reasoningShow : s.reasoningHide)}
            >
              {showReasoning && (
                <div
                  className={s.resizeHandle}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    resizing.current = true;
                    setIsResizing(true);
                    const startX = e.clientX;
                    const startWidth = reasoningWidth;
                    const containerWidth = mainContentRef.current?.offsetWidth ?? 1200;
                    const maxW = Math.min(containerWidth * 0.5, containerWidth - 450 - 24);
                    const onMove = (ev: MouseEvent) => { if (resizing.current) setReasoningWidth(Math.max(250, Math.min(maxW, startWidth + (startX - ev.clientX)))); };
                    const onUp = () => { resizing.current = false; setIsResizing(false); document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
                    document.addEventListener("mousemove", onMove);
                    document.addEventListener("mouseup", onUp);
                  }}
                  style={{ position: "absolute", top: 0, left: 0, width: 4, height: "100%", cursor: "col-resize", background: "transparent", borderRadius: "4px 0 0 4px", zIndex: 2 }}
                />
              )}
              <div
                className={showReasoning ? s.reasoningContentShow : s.reasoningContentHide}
                style={{ minWidth: 0, flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                    <PanelHeader title="Reasoning" help="Agent trace and progress" />
                  </div>
                  <HoverButton
                    type="button"
                    bgHover="rgba(229, 228, 226, 0.4)"
                    color={T.textSecondary}
                    title={reasoningFullscreen ? "Exit full window" : "Full window"}
                    onClick={toggleReasoningFullscreen}
                    style={{ padding: "4px 6px", borderRadius: 4, fontSize: 14, lineHeight: 1, flexShrink: 0 }}
                  >
                    ⛶
                  </HoverButton>
                </div>
                <div
                  className={s.scrollable}
                  style={{ flex: 1, overflowY: "auto", fontSize: 13, lineHeight: 1.6, color: T.textSecondary, marginTop: T.panelGap, marginRight: -4, display: "flex", flexDirection: "column", gap: 24 }}
                >
                  <ReasoningStream sections={reasoningSections} graphLayoutVersion={graphLayoutVersion} />
                </div>
              </div>
            </section>
          </div>

        </div>
      </div>

      {/* Review & Correct Modal */}
      {showReviewModal && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 100, background: "transparent",
            opacity: reviewModalVisible ? 1 : 0,
            transition: `opacity ${MOTION.normal}ms ease`,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) closeReviewModal(); }}
        >
          <div style={{
            position: "absolute",
            top: mainContentRef.current?.getBoundingClientRect().top ?? 0,
            left: mainContentRef.current?.getBoundingClientRect().left ?? 0,
            width: mainContentRef.current?.offsetWidth ?? "100%",
            height: mainContentRef.current?.offsetHeight ?? "100%",
            background: "rgba(204, 197, 185, 0.15)",
            backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
            borderRadius: T.panelRadius,
            border: "1px solid rgba(204, 197, 185, 0.2)",
            opacity: reviewModalVisible ? 1 : 0,
            transform: reviewModalVisible ? "translateY(0)" : "translateY(8px)",
            transition: `opacity ${MOTION.normal}ms ease, transform ${MOTION.normal}ms ease`,
            boxShadow: T.panelShadow,
            display: "flex", flexDirection: "column", overflow: "hidden",
          }}>
            {/* Header */}
            <div style={{ padding: "16px 20px", flexShrink: 0, display: "flex", flexDirection: "column", gap: 4, borderBottom: "1px solid rgba(64, 61, 57, 0.15)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: T.textPrimary }}>Review & Correct</h2>
                <HoverButton onClick={closeReviewModal} bgHover="rgba(204, 197, 185, 0.3)" color={T.textSecondary} style={{ fontSize: 18, lineHeight: 1, padding: "2px 6px", borderRadius: 4 }}>✕</HoverButton>
              </div>
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6 }}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: T.textPrimary }}>{visibleSections[reviewStep].title}</h3>
                <button
                  className={s.buttonTransition}
                  onClick={() => setShowReviewHelp((v) => !v)}
                  style={{ background: showReviewHelp ? "rgba(204, 197, 185, 0.3)" : "transparent", border: "none", borderRadius: "50%", width: 18, height: 18, fontSize: 11, fontWeight: 700, color: T.textSecondary, cursor: "pointer", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(204, 197, 185, 0.3)"; }}
                  onMouseLeave={(e) => { if (!showReviewHelp) e.currentTarget.style.background = "transparent"; }}
                >?</button>
              </div>
              {showReviewHelp && (
                <div style={{ margin: "0 auto", fontSize: 11, color: T.textSecondary, textAlign: "center", width: "55%", lineHeight: 1.6, paddingBottom: 12, borderBottom: "1px solid rgba(64, 61, 57, 0.15)" }}>
                  <p style={{ margin: 0 }}>Review and correct the agent's output for this transaction.</p>
                </div>
              )}
              <div style={{ marginTop: 16, paddingRight: 8 }}>
                <TransactionDisplay text={detail.raw_text} />
              </div>
            </div>

            {/* Body */}
            {visibleSections.map((sec, i) => (
              <div key={sec.key} className={s.scrollable} style={{ flex: 1, overflowY: "auto", scrollbarGutter: "auto", padding: "20px", display: reviewStep === i ? "flex" : "none", flexDirection: "column", gap: 24 }}>
                {sec.key === "transaction_analysis" && <TransactionAnalysisContainer />}
                {sec.key === "ambiguity" && <AmbiguityReviewContainer />}
                {sec.key === "tax" && <TaxReviewContainer />}
                {sec.key === "final_entry" && <FinalEntryReviewContainer />}
                {sec.key === "summary" && <CorrectionSummaryContainer />}
              </div>
            ))}

            {/* Footer */}
            <div style={{ padding: "12px 20px", flexShrink: 0, display: "flex", alignItems: "center", borderTop: "1px solid rgba(64, 61, 57, 0.15)" }}>
              <div style={{ width: 160 }} />
              <div style={{ flex: 1, display: "flex", justifyContent: "center", gap: 12 }}>
                {visibleSections.map((sec, i) => (
                  <div
                    key={sec.key}
                    className={s.buttonTransition}
                    onClick={() => setReviewStep(i)}
                    title={sec.title}
                    style={{ width: 10, height: 10, borderRadius: "50%", background: i === reviewStep ? "rgba(235, 94, 40, 0.7)" : i < reviewStep ? "rgba(64, 61, 57, 0.7)" : "rgba(204, 197, 185, 0.7)", cursor: "pointer", transition: "background 0.15s ease" }}
                  />
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, width: 160, justifyContent: "flex-end" }}>
                {reviewStep > 0 && <PrimaryButton size="sm" onClick={() => setReviewStep((s) => s - 1)}>Back</PrimaryButton>}
                {reviewStep < visibleSections.length - 1
                  ? <PrimaryButton size="sm" onClick={() => setReviewStep((s) => s + 1)}>Next</PrimaryButton>
                  : <PrimaryButton size="sm" disabled={submitting || submitted} onClick={async () => {
                      const did = useLLMInteractionStore.getState().draftId;
                      if (did) {
                        setSubmitting(true);
                        try {
                          await submitCorrection(did);
                          setSubmitted(true);
                          setTimeout(() => setSubmitted(false), 2000);
                        } catch (err) {
                          console.error("Submit correction failed:", err);
                        } finally {
                          setSubmitting(false);
                        }
                      }
                    }}>{(() => {
                      const label = submitting ? "Submitting…" : submitted ? "Submitted" : "Submit";
                      return <span key={label} style={{ display: "inline-block", animation: "jurisdictionIn 0.25s ease" }}>{label}</span>;
                    })()}</PrimaryButton>
                }
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
