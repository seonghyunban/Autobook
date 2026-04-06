import { useCallback, useEffect, useRef, useState } from "react";
import { submitLLMInteraction } from "../api/llm";
import { subscribeToRealtimeUpdates, ensureConnection } from "../api/realtime";
import type { LLMInteractionResponse, JournalLine, RealtimeEvent, AgentResult } from "../api/types";
import s from "./LLMInteractionPage.module.css";

// ── Shared tokens & components ───────────────────────────
import { MOTION, palette, T, panel, PanelHeader, HoverButton } from "./llm-interaction/shared";

// ── Reasoning panel ──────────────────────────────────────
import {
  ReasoningSection,
  SECTION_ORDER,
} from "./llm-interaction/reasoning_panel";
import type {
  EntryLineData,
  ReasoningChunk,
  SectionId,
} from "./llm-interaction/reasoning_panel";

// ── Review panel ─────────────────────────────────────────
import {
  TransactionAnalysisContainer,
  AmbiguityReviewContainer,
  TaxReviewContainer,
  FinalEntryReviewContainer,
  ReviewSectionContainer,
  REVIEW_SECTIONS,
} from "./llm-interaction/review_panel";
import { DUMMY_AGENT_RESULT, EMPTY_AGENT_RESULT } from "./llm-interaction/dummyData";
import { TransactionDisplay } from "./llm-interaction/shared/TransactionDisplay";

// ── Entry panel ──────────────────────────────────────────
import { EntryTable, DecisionOverlay } from "./llm-interaction/entry_panel";


export function LLMInteractionPage() {
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LLMInteractionResponse | null>(null);
  const [agentResult, setAgentResult] = useState<AgentResult>(DUMMY_AGENT_RESULT);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [showReviewHelp, setShowReviewHelp] = useState(false);
  const [reviewStep, setReviewStep] = useState(0);
  const [windowResizing, setWindowResizing] = useState(false);
  const [showReasoning, setShowReasoning] = useState(true);
  const [reasoningWidth, setReasoningWidth] = useState(320);
  const [reasoningFullscreen, setReasoningFullscreen] = useState(false);
  const [reasoningFullscreenAnimating, setReasoningFullscreenAnimating] = useState(false);
  const [graphLayoutVersion, setGraphLayoutVersion] = useState(0);
  const [reasoningExiting, setReasoningExiting] = useState(false);
  const savedReasoningWidth = useRef(320);
  const reasoningSectionRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const resizing = useRef(false);
  const mainContentRef = useRef<HTMLDivElement>(null);
  const parseIdRef = useRef<string | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  const dummyGraph = DUMMY_AGENT_RESULT.pipeline_state?.transaction_graph;

  const initialReasoning = (): Record<SectionId, ReasoningChunk[]> => ({
    normalization: dummyGraph ? [{
      label: "Transaction analyzed",
      done: true,
      blocks: [{ type: "graph" as const, tag: "Transaction structure", graph: dummyGraph as import("./llm-interaction/reasoning_panel").GraphBlockData }],
    }] : [],
    ambiguity: [], gap: [], proceed: [], debit: [], credit: [], tax: [], entry: [],
  });

  const emptyReasoning = (): Record<SectionId, ReasoningChunk[]> => ({
    normalization: [], ambiguity: [], gap: [], proceed: [], debit: [], credit: [], tax: [], entry: [],
  });

  const [reasoningSections, setReasoningSections] = useState<Record<SectionId, ReasoningChunk[]>>(initialReasoning);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const entryScrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    textareaRef.current?.classList.add("scrolling");
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      textareaRef.current?.classList.remove("scrolling");
    }, 800);
  }, []);

  // ── Helper: update the last chunk in a section ─────────
  function updateLastChunk(section: SectionId, updater: (chunk: ReasoningChunk) => ReasoningChunk) {
    setReasoningSections((prev) => {
      const chunks = [...prev[section]];
      if (chunks.length === 0) return prev;
      chunks[chunks.length - 1] = updater(chunks[chunks.length - 1]);
      return { ...prev, [section]: chunks };
    });
  }

  // ── Event dispatcher: action-based switch ──────────────
  function handleStreamEvent(ev: RealtimeEvent) {
    const { action, section, text, label, tag } = ev;
    if (!action || !section) return;

    const sid = section as SectionId;
    if (!SECTION_ORDER.includes(sid)) return;

    switch (action) {
      case "chunk.create":
        setReasoningSections((prev) => ({
          ...prev,
          [sid]: [...prev[sid], { label: label || "", done: false, blocks: [] }],
        }));
        break;

      case "chunk.label":
        if (label) updateLastChunk(sid, (c) => ({ ...c, label }));
        break;

      case "chunk.done":
        updateLastChunk(sid, (c) => ({ ...c, done: true, ...(label ? { label } : {}) }));
        break;

      case "block.collapsible":
        if (text) updateLastChunk(sid, (c) => ({
          ...c,
          blocks: [...c.blocks, { type: "collapsible", header: text, lines: [] }],
        }));
        break;

      case "block.text":
        if (text) updateLastChunk(sid, (c) => ({
          ...c,
          blocks: [...c.blocks, { type: "text", content: text }],
        }));
        break;

      case "block.entry":
        if (tag && ev.data) updateLastChunk(sid, (c) => ({
          ...c,
          blocks: [...c.blocks, { type: "entry", tag, entry: ev.data as EntryLineData["entry"] }],
        }));
        break;

      case "block.graph":
        if (tag && ev.data) updateLastChunk(sid, (c) => ({
          ...c,
          blocks: [...c.blocks, { type: "graph", tag, graph: ev.data as import("./llm-interaction/reasoning_panel").GraphBlockData }],
        }));
        break;

      case "line":
        if (tag && text != null) updateLastChunk(sid, (c) => {
          const blocks = [...c.blocks];
          for (let i = blocks.length - 1; i >= 0; i--) {
            const b = blocks[i];
            if (b.type === "collapsible") {
              blocks[i] = { ...b, lines: [...b.lines, { kind: "text", tag, text }] };
              break;
            }
          }
          return { ...c, blocks };
        });
        break;

      case "line.entry":
        if (tag && ev.data) updateLastChunk(sid, (c) => {
          const blocks = [...c.blocks];
          for (let i = blocks.length - 1; i >= 0; i--) {
            const b = blocks[i];
            if (b.type === "collapsible") {
              blocks[i] = { ...b, lines: [...b.lines, { kind: "entry", tag, entry: ev.data as EntryLineData["entry"] }] };
              break;
            }
          }
          return { ...c, blocks };
        });
        break;
    }
  }

  function closeReviewModal() {
    setReviewModalVisible(false);
    setTimeout(() => setShowReviewModal(false), MOTION.normal);
  }

  // ── Reasoning fullscreen toggle ──────────────────────────
  function toggleReasoningFullscreen() {
    if (!reasoningFullscreen) {
      // Enter: save width, go absolute, expand
      savedReasoningWidth.current = reasoningWidth;
      setReasoningFullscreen(true);
      setReasoningFullscreenAnimating(true);
      // After one frame, the absolute position is set — now animate width
      requestAnimationFrame(() => {
        setReasoningWidth(mainContentRef.current?.offsetWidth ?? 800);
      });
      // After animation, stop animating (disable transitions for resize)
      setTimeout(() => {
        setReasoningFullscreenAnimating(false);
        setGraphLayoutVersion((v) => v + 1);
      }, MOTION.expand);
    } else {
      // Exit: shrink back to saved width
      setReasoningWidth(savedReasoningWidth.current);
      setReasoningExiting(true);
      setReasoningFullscreenAnimating(true);
      // After animation completes, remove absolute positioning
      setTimeout(() => {
        setReasoningFullscreen(false);
        setReasoningExiting(false);
        setReasoningFullscreenAnimating(false);
        setGraphLayoutVersion((v) => v + 1);
      }, MOTION.expand);
    }
  }


  // ── Disable layout transitions during window resize
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onResize = () => {
      setWindowResizing(true);
      clearTimeout(timer);
      timer = setTimeout(() => setWindowResizing(false), 100);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      clearTimeout(timer);
    };
  }, []);

  // ── Resize listener: keep fullscreen reasoning at container width
  useEffect(() => {
    if (!reasoningFullscreen || reasoningExiting) return;
    const onResize = () => {
      setReasoningWidth(mainContentRef.current?.offsetWidth ?? 800);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [reasoningFullscreen, reasoningExiting]);

  // ── Cleanup SSE subscription on unmount ──────────────────
  useEffect(() => {
    return () => { unsubRef.current?.(); };
  }, []);

  async function handleSubmit() {
    const trimmed = inputText.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setAgentResult(EMPTY_AGENT_RESULT);
    setOverlayVisible(false);
    setReasoningSections(emptyReasoning());

    // Unsubscribe previous
    unsubRef.current?.();

    // Generate parse_id on client and subscribe BEFORE submitting
    const parseId = `llm_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    parseIdRef.current = parseId;

    try {
      // Ensure SSE connection before submitting
      await ensureConnection(true);

      // Subscribe to SSE events BEFORE the POST — no race condition
      unsubRef.current = subscribeToRealtimeUpdates((ev) => {
        if (ev.parse_id !== parseIdRef.current) return;

        if (ev.type === "agent.stream") {
          handleStreamEvent(ev);
        } else if (ev.type === "pipeline.result") {
          const result = ev.result as AgentResult | undefined;
          console.log("agentResult:", result);
          if (result) {
            setAgentResult(result);
            if (result.decision === "MISSING_INFO" || result.decision === "STUCK") {
              requestAnimationFrame(() => setOverlayVisible(true));
            }
          }
          setLoading(false);
        } else if (ev.type === "pipeline.error") {
          setError(ev.error || "Agent processing failed");
          setLoading(false);
        }
      });

      // Submit AFTER subscription is active
      const response = await submitLLMInteraction(parseId, trimmed);
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
      setLoading(false);
    }
  }


  return (
    <div
      style={{
        height: "100vh",
        minWidth: 800,
        background: T.pageBg,
        padding: "24px 24px",
        boxSizing: "border-box",
        fontFamily: T.pageFont,
        color: T.pageText,
        overflow: "auto",
      }}
    >
      <div style={{
        maxWidth: "90vw",
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 20,
        height: "100%",
      }}
      >

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "nowrap" }}>
          <div>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.eyebrow }}>
              LLM Interaction
            </p>
            <h1 style={{ margin: "4px 0 0", fontSize: 26, fontWeight: 700, color: T.textPrimary }}>
              Entry Builder
            </h1>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0, marginTop: 18 }}>
            <HoverButton
              type="button"
              bgHover={palette.silver}
              color={T.textSecondary}
              colorHover={palette.carbonBlack}
              borderColor={T.inputBorder}
              borderColorHover={palette.silver}
              onClick={() => {
                setShowReviewModal(true);
                requestAnimationFrame(() => setReviewModalVisible(true));
              }}
              style={{ padding: "6px 14px", borderRadius: T.buttonRadius, fontSize: 12, fontWeight: 600 }}
            >
              Review & Correct
            </HoverButton>
            <HoverButton
              type="button"
              bgHover={palette.silver}
              color={T.textSecondary}
              colorHover={palette.carbonBlack}
              borderColor={T.inputBorder}
              borderColorHover={palette.silver}
              onClick={() => setShowReasoning((v) => !v)}
              style={{ padding: "6px 14px", borderRadius: T.buttonRadius, fontSize: 12, fontWeight: 600 }}
            >
              {showReasoning ? "Hide Reasoning" : "Show Reasoning"}
            </HoverButton>
          </div>
        </div>

        {/* Main content: panels + reasoning side by side */}
        <div ref={mainContentRef} style={{ display: "flex", gap: 0, flex: 1, minHeight: 0, position: "relative" }}>

        {/* Panels: main column */}
        <div style={{ display: "flex", gap: 0, flex: 1, minHeight: 0, minWidth: 440 }}>

          {/* Main column */}
          <div style={{
            display: "flex", flexDirection: "column", gap: 20, flex: 1, minHeight: 0, minWidth: 420,
            marginRight: showReasoning ? 20 : 0,
            transition: windowResizing
              ? "none"
              : (showReasoning ? "margin-right 0.4s ease" : `margin-right 0.4s ease ${MOTION.expand}ms`),
          }}>
            {/* Entry */}
            <section style={{ ...panel, overflow: "hidden", flex: 1, minHeight: 0, position: "relative" }}>
              <PanelHeader
                title="Entry"
                help={agentResult.entry?.lines?.length
                  ? "Journal entry from the agent pipeline."
                  : "Entry will appear here as the agent processes."}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1, minHeight: 0 }}>
                <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                  <EntryTable lines={agentResult.entry?.lines || []} currencySymbol={agentResult.entry?.currency_symbol || ""} scrollable minRows={12} showAccountCode rowAppearAnimation scrollRef={entryScrollRef} />
                </div>
              </div>
              {(agentResult.decision === "MISSING_INFO" || agentResult.decision === "STUCK") && (
                <DecisionOverlay data={agentResult as unknown as Record<string, unknown>} visible={overlayVisible} onClose={() => {
                  setOverlayVisible(false);
                }} />
              )}
            </section>

            {/* Input */}
            <section style={{ ...panel, flexShrink: 0 }}>
              <PanelHeader title="Input" help="Describe a transaction in English or Korean." />
              <div style={{
                background: T.inputBg,
                borderRadius: T.inputRadius,
                border: `1px solid ${T.inputBorder}`,
                display: "flex",
                flexDirection: "column",
              }}>
                <textarea
                  ref={textareaRef}
                  className={s.scrollable}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onScroll={handleScroll}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
                  }}
                  placeholder={"e.g. Bought a laptop from Apple for $2,400\ne.g. 从苹果购买了一台笔记本电脑，花费$2,400\ne.g. Compré una laptop de Apple por $2,400\ne.g. 애플에서 노트북을 $2,400에 구매했습니다"}
                  style={{
                    width: "100%",
                    height: 120,
                    boxSizing: "border-box",
                    resize: "none",
                    overflow: "auto",
                    border: "none",
                    borderRadius: T.inputRadius,
                    padding: "10px 12px",
                    fontSize: 14,
                    color: palette.floralWhite,
                    background: "transparent",
                    outline: "none",
                    fontFamily: "inherit",
                  }}
                />
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: 12, height: 50, boxSizing: "border-box", alignItems: "center" }}>
                  <button
                    className={s.buttonTransition}
                    type="button"
                    disabled={loading || !inputText.trim()}
                    onClick={handleSubmit}
                    style={{
                      padding: "9px 22px",
                      borderRadius: T.buttonRadius,
                      border: "none",
                      background: loading || !inputText.trim() ? T.buttonBgDisabled : T.buttonBg,
                      color: T.buttonText,
                      fontWeight: 600,
                      fontSize: 14,
                      cursor: loading || !inputText.trim() ? "not-allowed" : "pointer",
                    }}
                  >
                    {loading ? "Processing…" : "Submit"}
                  </button>
                </div>
              </div>
              {error && (
                <p style={{ margin: 0, fontSize: 13, color: T.errorText, background: T.errorBg, borderRadius: T.inputRadius, padding: "8px 12px" }}>
                  {error}
                </p>
              )}
            </section>
          </div>

        </div>{/* end panels */}

        {/* Reasoning & Progress viewer (right) */}
        <div style={{
          flexShrink: 0,
          position: "relative",
          width: (!showReasoning || (reasoningFullscreen && !reasoningExiting)) ? 0 : reasoningWidth,
          transition: (isResizing || (reasoningFullscreen && !reasoningFullscreenAnimating))
            ? "none"
            : showReasoning
              ? "width 0.4s ease"
              : `width 0.4s ease ${MOTION.normal}ms`,
        }}>
        <section
          ref={reasoningSectionRef}
          style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: (reasoningFullscreen || reasoningExiting) ? 10 : "auto",
          width: showReasoning
            ? ((reasoningFullscreen && !reasoningExiting) ? (mainContentRef.current?.offsetWidth ?? 800) : reasoningWidth)
            : 0,
          overflow: "hidden",
          background: showReasoning ? "rgba(229, 228, 226, 0.3)" : "transparent",
          backdropFilter: showReasoning ? "blur(16px)" : "none",
          WebkitBackdropFilter: showReasoning ? "blur(16px)" : "none",
          borderRadius: T.panelRadius,
          padding: showReasoning ? T.panelPadding : 0,
          display: "flex",
          flexDirection: "column",
          gap: T.panelGap,
          border: showReasoning ? "1px solid rgba(229, 228, 226, 0.2)" : "none",
          boxShadow: showReasoning ? T.panelShadow : "none",
          ...((reasoningFullscreen || reasoningExiting) ? { transition: "width 0.4s ease, padding 0.4s ease, background 0.4s ease, box-shadow 0.4s ease, border 0.4s ease" } : {}),
        }}
        className={(reasoningFullscreen || reasoningExiting) ? undefined : (isResizing ? s.reasoningResizing : showReasoning ? s.reasoningShow : s.reasoningHide)}>
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
                const panelMinTotal = 450;
                const percentCap = 0.5;
                const maxReasoningWidth = Math.min(containerWidth * percentCap, containerWidth - panelMinTotal - 24);
                const onMove = (ev: MouseEvent) => {
                  if (!resizing.current) return;
                  const delta = startX - ev.clientX;
                  setReasoningWidth(Math.max(250, Math.min(maxReasoningWidth, startWidth + delta)));
                };
                const onUp = () => {
                  resizing.current = false;
                  setIsResizing(false);
                  document.removeEventListener("mousemove", onMove);
                  document.removeEventListener("mouseup", onUp);
                };
                document.addEventListener("mousemove", onMove);
                document.addEventListener("mouseup", onUp);
              }}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: 4,
                height: "100%",
                cursor: "col-resize",
                background: "transparent",
                borderRadius: "4px 0 0 4px",
                zIndex: 2,
              }}
            />
          )}
          <div
            className={showReasoning ? s.reasoningContentShow : s.reasoningContentHide}
            style={{
              minWidth: 0,
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                <PanelHeader
                  title="Reasoning"
                  help="Agent trace and progress"
                />
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
              style={{
                flex: 1,
                overflowY: "auto",
                fontSize: 13,
                lineHeight: 1.6,
                color: T.textSecondary,
                marginTop: T.panelGap,
                marginRight: -4,
                display: "flex",
                flexDirection: "column",
                gap: 24,
              }}
            >
              {SECTION_ORDER.map((id) =>
                reasoningSections[id].length > 0 ? (
                  <div key={id} data-section={id}>
                    <ReasoningSection chunks={reasoningSections[id]} graphLayoutVersion={graphLayoutVersion} />
                  </div>
                ) : null
              )}
            </div>
          </div>
        </section>
        </div>{/* end reasoning wrapper */}

        </div>{/* end main content */}

      </div>

      {/* Review & Correct Modal */}
      {showReviewModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "transparent",
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
            background: "rgba(229, 228, 226, 0.3)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            borderRadius: T.panelRadius,
            border: "1px solid rgba(229, 228, 226, 0.2)",
            opacity: reviewModalVisible ? 1 : 0,
            transform: reviewModalVisible ? "translateY(0)" : "translateY(8px)",
            transition: `opacity ${MOTION.normal}ms ease, transform ${MOTION.normal}ms ease`,
            boxShadow: T.panelShadow,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}>
            {/* Header */}
            <div style={{
              padding: "16px 20px",
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              gap: 4,
              borderBottom: "1px solid rgba(64, 61, 57, 0.15)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: T.textPrimary }}>Review & Correct</h2>
                <HoverButton
                  onClick={() => closeReviewModal()}
                  bgHover="rgba(204, 197, 185, 0.3)"
                  color={T.textSecondary}
                  style={{ fontSize: 18, lineHeight: 1, padding: "2px 6px", borderRadius: 4 }}
                >
                  ✕
                </HoverButton>
              </div>
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6 }}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: T.textPrimary }}>{REVIEW_SECTIONS[reviewStep].title}</h3>
                <button
                  className={s.buttonTransition}
                  onClick={() => setShowReviewHelp((v) => !v)}
                  style={{
                    background: showReviewHelp ? "rgba(204, 197, 185, 0.3)" : "transparent",
                    border: "none",
                    borderRadius: "50%",
                    width: 18,
                    height: 18,
                    fontSize: 11,
                    fontWeight: 700,
                    color: T.textSecondary,
                    cursor: "pointer",
                    lineHeight: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(204, 197, 185, 0.3)"; }}
                  onMouseLeave={(e) => { if (!showReviewHelp) e.currentTarget.style.background = "transparent"; }}
                >
                  ?
                </button>
              </div>
              {/* Collapsible explanation */}
              <div className={`${s.collapsibleWrapper} ${showReviewHelp ? s.collapsibleWrapperOpen : ""}`}>
                <div className={s.collapsibleInner}>
                  <div style={{ margin: "0 auto", fontSize: 11, color: T.textSecondary, textAlign: "center", width: "55%", lineHeight: 1.6, paddingBottom: 12, borderBottom: "1px solid rgba(64, 61, 57, 0.15)" }}>
                    {reviewStep === 0 && <>
                      <p style={{ margin: 0 }}>Review how the agent interpreted the transaction structure.</p>
                      <p style={{ margin: "4px 0 0" }}>The graph shows parties involved and value flows between them.</p>
                    </>}
                    {reviewStep === 1 && <>
                      <p style={{ margin: 0 }}>The agent identified these ambiguities in your transaction.</p>
                      <p style={{ margin: "4px 0 0" }}>You can correct the agent's attempt by editing, disabling, or adding ambiguities.</p>
                    </>}
                    {reviewStep === 2 && <>
                      <p style={{ margin: 0 }}>Review the tax treatment determined by the agent.</p>
                      <p style={{ margin: "4px 0 0" }}>You can correct individual fields by clicking Edit.</p>
                    </>}
                    {reviewStep === 3 && <>
                      <p style={{ margin: 0 }}>Review the journal entry drafted by the agent.</p>
                      <p style={{ margin: "4px 0 0" }}>You can edit account names, amounts, add/delete lines, and correct the rationale.</p>
                    </>}
                  </div>
                </div>
              </div>
              {/* Transaction */}
              <div style={{ marginTop: 16, paddingRight: 8 }}>
                <TransactionDisplay text={agentResult.pipeline_state?.transaction_text || inputText || ""} />
              </div>
            </div>

            {/* Body */}
            <div className={s.scrollable} style={{
              flex: 1,
              overflowY: "auto",
              scrollbarGutter: "auto",
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: 24,
            }}>
              {reviewStep === 0 && <TransactionAnalysisContainer agentResult={agentResult} />}
              {reviewStep === 1 && <AmbiguityReviewContainer agentResult={agentResult} />}
              {reviewStep === 2 && <TaxReviewContainer agentResult={agentResult} />}
              {reviewStep === 3 && <FinalEntryReviewContainer agentResult={agentResult} />}
            </div>

            {/* Footer */}
            <div style={{
              padding: "12px 20px",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              borderTop: "1px solid rgba(64, 61, 57, 0.15)",
            }}>
              <div style={{ width: 160 }} />
              {/* Progress dots */}
              <div style={{ flex: 1, display: "flex", justifyContent: "center", gap: 12 }}>
                {REVIEW_SECTIONS.map((sec, i) => (
                  <div
                    key={sec.key}
                    className={s.buttonTransition}
                    onClick={() => setReviewStep(i)}
                    title={sec.title}
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: i === reviewStep ? "rgba(235, 94, 40, 0.7)" : i < reviewStep ? "rgba(64, 61, 57, 0.7)" : "rgba(204, 197, 185, 0.7)",
                      cursor: "pointer",
                      transition: "background 0.15s ease",
                    }}
                  />
                ))}
              </div>
              {/* Back + Next/Submit */}
              <div style={{ display: "flex", gap: 8, width: 160, justifyContent: "flex-end" }}>
                {reviewStep > 0 && (
                  <HoverButton
                    bg="rgba(235, 94, 40, 0.7)"
                    bgHover="rgba(235, 94, 40, 0.9)"
                    color="#fff"
                    onClick={() => setReviewStep((s) => s - 1)}
                    style={{ padding: "8px 18px", borderRadius: T.buttonRadius, fontSize: 13, fontWeight: 600 }}
                  >
                    Back
                  </HoverButton>
                )}
                <HoverButton
                  bg="rgba(235, 94, 40, 0.7)"
                  bgHover="rgba(235, 94, 40, 0.9)"
                  color="#fff"
                  onClick={() => {
                    if (reviewStep < REVIEW_SECTIONS.length - 1) {
                      setReviewStep((s) => s + 1);
                    }
                  }}
                  style={{ padding: "8px 18px", borderRadius: T.buttonRadius, fontSize: 13, fontWeight: 600 }}
                >
                  {reviewStep === REVIEW_SECTIONS.length - 1 ? "Submit" : "Next"}
                </HoverButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
