import { useCallback, useEffect, useRef, useState } from "react";
import { submitLLMInteraction } from "../api/llm";
import { subscribeToRealtimeUpdates, ensureConnection } from "../api/realtime";
import type { LLMInteractionResponse, JournalLine, RealtimeEvent } from "../api/types";

// ── Palette (raw hex only) ────────────────────────────────
const palette = {
  floralWhite: "#FFFCF2",
  silver: "#CCC5B9",
  charcoalBrown: "#403D39",
  carbonBlack: "#252422",
  spicyPaprika: "#EB5E28",
  hunterGreen: "#31572C",
  fern: "#4F772D",
  palmLeaf: "#90A955",
} as const;

// ── Component tokens ─────────────────────────────────────
const T = {
  pageBg: palette.floralWhite,
  pageText: palette.charcoalBrown,
  pageFont: "system-ui, sans-serif",

  panelBg: "rgba(204, 197, 185, 0.2)",
  panelRadius: 12,
  panelPadding: "20px 22px",
  panelShadow: "0 2px 6px rgba(0, 0, 0, 0.2), 0 6px 16px rgba(0, 0, 0, 0.15)",
  panelGap: 12,

  textPrimary: palette.carbonBlack,
  textSecondary: palette.charcoalBrown,
  textMuted: "rgba(204, 197, 185, 0.5)",

  inputBorder: "rgba(204, 197, 185, 0.25)",
  inputBg: palette.carbonBlack,
  inputRadius: 6,

  buttonBg: palette.spicyPaprika,
  buttonBgDisabled: "rgba(204, 197, 185, 0.3)",
  buttonText: "#fff",
  buttonRadius: 6,

  badgeBg: palette.spicyPaprika,
  badgeText: "#fff",

  debitBg: "rgba(235, 94, 40, 0.15)",
  debitText: "#F4845F",
  creditBg: "rgba(45, 122, 58, 0.15)",
  creditText: "#6BCB77",

  errorBg: "rgba(192, 57, 43, 0.15)",
  errorText: "#F4845F",

  eyebrow: palette.spicyPaprika,

  tableBorder: "rgba(204, 197, 185, 0.2)",
  tableRowBorder: "rgba(204, 197, 185, 0.08)",
} as const;

// ── Shared panel style ───────────────────────────────────
const panel: React.CSSProperties = {
  background: T.panelBg,
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  borderRadius: T.panelRadius,
  padding: T.panelPadding,
  display: "flex",
  flexDirection: "column",
  gap: T.panelGap,
  boxShadow: T.panelShadow,
  border: "1px solid rgba(204, 197, 185, 0.1)",
};

function PanelHeader({ title, help }: { title: React.ReactNode; help: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, overflow: "hidden", whiteSpace: "nowrap" }}>
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: T.textPrimary, flexShrink: 0 }}>
        {title}
      </h2>
      <p style={{ margin: 0, fontSize: 13, color: T.textSecondary, overflow: "hidden", textOverflow: "ellipsis" }}>{help}</p>
    </div>
  );
}

// ── Reasoning types ──────────────────────────────────────

type ReasoningChunk =
  | { type: "line"; label: string; content: string[]; done: boolean }
  | { type: "collapsible"; label: string; header: string; details: string[]; done: boolean };

type SectionId = "ambiguity" | "gap" | "proceed" | "debit" | "credit" | "tax" | "entry";

const SECTION_ORDER: SectionId[] = ["ambiguity", "gap", "proceed", "debit", "credit", "tax", "entry"];

// ── Reasoning chunk components ───────────────────────────

function ChunkIcon({ done }: { done: boolean }) {
  return (
    <span
      className={done ? undefined : "llm-star-pulse"}
      style={{ fontSize: 11, lineHeight: 1, flexShrink: 0, color: palette.spicyPaprika }}
    >
      {done ? "✦" : "✧"}
    </span>
  );
}

const blockStyle: React.CSSProperties = {
  background: "rgba(204, 197, 185, 0.15)",
  borderRadius: 4,
  padding: "6px 8px",
  fontSize: 12,
  lineHeight: 1.5,
  color: T.textSecondary,
  wordBreak: "break-word",
  overflow: "hidden",
};

function Chunk({ label, done, children }: {
  label: string;
  done: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <ChunkIcon done={done} />
        <span style={{ fontSize: 12, fontWeight: 600, color: T.textPrimary }}>{label}</span>
      </div>
      {children && <div style={{ paddingLeft: 10 }}>{children}</div>}
    </div>
  );
}

function Block({ children }: { children: React.ReactNode }) {
  return <div style={blockStyle}>{children}</div>;
}

function CollapsibleBlock({ header, children, defaultOpen = false }: {
  header: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={blockStyle}>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none" }}
      >
        <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: T.textPrimary }}>{header}</span>
        <span style={{ fontSize: 10, lineHeight: 1, flexShrink: 0, color: palette.spicyPaprika }}>
          {open ? "◀" : "▼"}
        </span>
      </div>
      <div style={{
        maxHeight: open ? 1000 : 0,
        opacity: open ? 1 : 0,
        overflow: "hidden",
        transition: open
          ? "max-height 0.2s ease, opacity 0.2s ease 0.2s, margin-top 0.2s ease"
          : "opacity 0.2s ease, max-height 0.2s ease 0.2s, margin-top 0.2s ease 0.2s",
        marginTop: open ? 4 : 0,
      }}>
        {children}
      </div>
    </div>
  );
}

function BulletLine({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 6, background: "rgba(204, 197, 185, 0.2)", borderRadius: 3, padding: "3px 6px" }}>
      <span style={{ width: 12, flexShrink: 0, textAlign: "center", color: palette.charcoalBrown, fontSize: 8, lineHeight: "18px" }}>●</span>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

function ReasoningSection({ chunks }: { chunks: ReasoningChunk[] }) {
  if (chunks.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {chunks.map((chunk, i) =>
        chunk.type === "line" ? (
          <Chunk key={i} label={chunk.label} done={chunk.done}>
            {chunk.content.length > 0 && (
              <Block>
                {chunk.content.map((line, j) => <div key={j}>{line}</div>)}
              </Block>
            )}
          </Chunk>
        ) : (
          <Chunk key={i} label={chunk.label} done={chunk.done}>
            <CollapsibleBlock header={chunk.header}>
              {chunk.details.map((line, j) => <BulletLine key={j}>{line}</BulletLine>)}
            </CollapsibleBlock>
          </Chunk>
        )
      )}
    </div>
  );
}

const MIN_ROWS = 12;

function EntryTable({ lines, scrollRef, onScroll }: {
  lines: JournalLine[];
  scrollRef?: React.Ref<HTMLDivElement>;
  onScroll?: React.UIEventHandler<HTMLDivElement>;
}) {
  const emptyRows = Math.max(0, MIN_ROWS - lines.length);
  const totalDebit = lines.filter(l => l.type === "debit").reduce((s, l) => s + l.amount, 0);
  const totalCredit = lines.filter(l => l.type === "credit").reduce((s, l) => s + l.amount, 0);
  const tableStyle: React.CSSProperties = {
    width: "100%",
    borderCollapse: "separate",
    borderSpacing: "5px 3px",
    fontSize: 13,
    tableLayout: "fixed",
  };
  const colWidths = ["50%", "25%", "25%"];
  const cellRadius = 4;
  const cellBg = [`${palette.hunterGreen}1A`, `${palette.fern}1A`, `${palette.palmLeaf}1A`];
  const cellBgFilled = [`${palette.hunterGreen}33`, `${palette.fern}33`, `${palette.palmLeaf}33`];
  const totalBg = ["#7F7F7F1A", "#A5A5A51A", "#CCCCCC1A"];
  const totalBgFilled = ["#7F7F7F4D", "#A5A5A54D", "#CCCCCC4D"];

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {/* Fixed header — matching scrollbar gutter */}
      <div style={{ overflowY: "scroll", flexShrink: 0 }} className="llm-textarea">
      <table style={{ ...tableStyle }}>
        <colgroup>
          {colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
        </colgroup>
        <thead>
          <tr>
            {["Account", "Debit", "Credit"].map((h, i) => (
              <th
                key={h}
                style={{
                  textAlign: i === 0 ? "left" : "right",
                  padding: "8px 10px",
                  color: "rgba(37, 36, 34, 0.9)",
                  background: [`${palette.hunterGreen}B3`, `${palette.fern}B3`, `${palette.palmLeaf}B3`][i],
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  borderRadius: 4,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
      </table>
      </div>
      {/* Scrollable body */}
      <div ref={scrollRef} onScroll={onScroll} className="llm-textarea" style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        <table style={tableStyle}>
          <colgroup>
            {colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
          </colgroup>
          <tbody>
            {lines.map((line, i) => (
              <tr key={i}>
                <td style={{ padding: "8px 10px", color: "rgba(37, 36, 34, 0.8)", borderRadius: cellRadius, background: cellBgFilled[0], position: "relative" }}>
                  <span style={{ display: "flex", alignItems: "center", minHeight: 28 }}>
                    <span style={{ fontSize: 13, opacity: 0.8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line.account_name}</span>
                  </span>
                  <span style={{ position: "absolute", bottom: 4, right: 8, fontSize: 10, fontWeight: 600, opacity: 0.4 }}>{line.account_code}</span>
                </td>
                <td
                  style={{
                    padding: "8px 10px",
                    textAlign: "right",
                    fontFamily: "monospace",
                    color: "rgba(37, 36, 34, 0.8)",
                    borderRadius: cellRadius,
                    background: line.type === "debit" ? cellBgFilled[1] : cellBg[1],
                  }}
                >
                  {line.type === "debit" ? `$${line.amount.toFixed(2)}` : ""}
                </td>
                <td
                  style={{
                    padding: "8px 10px",
                    textAlign: "right",
                    fontFamily: "monospace",
                    color: "rgba(37, 36, 34, 0.8)",
                    borderRadius: cellRadius,
                    background: line.type === "credit" ? cellBgFilled[2] : cellBg[2],
                  }}
                >
                  {line.type === "credit" ? `$${line.amount.toFixed(2)}` : ""}
                </td>
              </tr>
            ))}
            {Array.from({ length: emptyRows }, (_, i) => (
              <tr key={`empty-${i}`}>
                <td style={{ padding: "8px 10px", borderRadius: cellRadius, background: cellBg[0] }}>&nbsp;</td>
                <td style={{ padding: "8px 10px", borderRadius: cellRadius, background: cellBg[1] }} />
                <td style={{ padding: "8px 10px", borderRadius: cellRadius, background: cellBg[2] }} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Total row — fixed below scrollable body */}
      <div style={{ overflowY: "scroll", flexShrink: 0 }} className="llm-textarea">
        <table style={tableStyle}>
          <colgroup>
            {colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
          </colgroup>
          <tbody>
            <tr>
              <td style={{
                padding: "8px 10px",
                borderRadius: cellRadius,
                background: (totalDebit > 0 || totalCredit > 0) ? totalBgFilled[0] : totalBg[0],
                fontSize: 13,
                color: "rgba(37, 36, 34, 0.8)",
                textAlign: "right",
              }}>
                Total
              </td>
              <td style={{
                padding: "8px 10px",
                textAlign: "right",
                fontFamily: "monospace",
                color: "rgba(37, 36, 34, 0.8)",
                borderRadius: cellRadius,
                background: totalDebit > 0 ? totalBgFilled[1] : totalBg[1],
              }}>
                {totalDebit > 0 ? `$${totalDebit.toFixed(2)}` : ""}
              </td>
              <td style={{
                padding: "8px 10px",
                textAlign: "right",
                fontFamily: "monospace",
                color: "rgba(37, 36, 34, 0.8)",
                borderRadius: cellRadius,
                background: totalCredit > 0 ? totalBgFilled[2] : totalBg[2],
              }}>
                {totalCredit > 0 ? `$${totalCredit.toFixed(2)}` : ""}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function LLMInteractionPage() {
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LLMInteractionResponse | null>(null);
  const [entryLines, setEntryLines] = useState<JournalLine[]>([]);
  const [entryDescription, setEntryDescription] = useState("");
  const [showEnglish, setShowEnglish] = useState(false);
  const [showReasoning, setShowReasoning] = useState(true);
  const [reasoningWidth, setReasoningWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);
  const resizing = useRef(false);
  const mainContentRef = useRef<HTMLDivElement>(null);
  const parseIdRef = useRef<string | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  const emptyReasoning = (): Record<SectionId, ReasoningChunk[]> => ({
    ambiguity: [], gap: [], proceed: [], debit: [], credit: [], tax: [], entry: [],
  });

  const [reasoningSections, setReasoningSections] = useState<Record<SectionId, ReasoningChunk[]>>(emptyReasoning);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const entryScrollRef = useRef<HTMLDivElement>(null);
  const englishEntryScrollRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);

  const syncScroll = useCallback((source: "entry" | "english") => {
    if (syncing.current) return;
    syncing.current = true;
    const from = source === "entry" ? entryScrollRef.current : englishEntryScrollRef.current;
    const to = source === "entry" ? englishEntryScrollRef.current : entryScrollRef.current;
    if (from && to) {
      to.scrollTop = from.scrollTop;
    }
    requestAnimationFrame(() => { syncing.current = false; });
  }, []);

  const handleScroll = useCallback(() => {
    textareaRef.current?.classList.add("scrolling");
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      textareaRef.current?.classList.remove("scrolling");
    }, 800);
  }, []);

  // ── Map (agent, phase) → section ID ──────────────────────
  function sectionForEvent(agent: string, phase: string): SectionId | null {
    if (agent === "decision_maker") {
      if (phase.startsWith("ambiguity")) return "ambiguity";
      if (phase.startsWith("complexity")) return "gap";
      if (phase.startsWith("decision") || phase === "proceed_reason" || phase === "rationale") return "proceed";
    }
    if (agent === "debit_classifier") return "debit";
    if (agent === "credit_classifier") return "credit";
    if (agent === "tax_specialist") return "tax";
    if (agent === "entry_drafter") return "entry";
    return null;
  }

  // ── Event dispatcher: maps stream events to C/F/B/L ops ──
  function handleStreamEvent(ev: RealtimeEvent) {
    const { agent, phase, text, label } = ev;
    if (!agent || !phase) return;

    const section = sectionForEvent(agent, phase);
    if (!section) return;

    // Create chunk (C)
    if (phase === "ambiguity_start" || phase === "complexity_start" || phase === "decision_start"
        || phase === "started" || phase === "start") {
      const chunkLabel = label || ({
        tax_specialist: "Considering tax applicability",
        entry_drafter: "Drafting journal entry",
      } as Record<string, string>)[agent] || agent;
      setReasoningSections((prev) => ({
        ...prev,
        [section]: [...prev[section], { type: "line" as const, label: chunkLabel, content: [], done: false }],
      }));
      return;
    }

    // Finish chunk (F)
    if (phase === "ambiguity_done" || phase === "complexity_done" || phase === "decision_done" || phase === "done") {
      setReasoningSections((prev) => {
        const chunks = [...prev[section]];
        if (chunks.length > 0) {
          chunks[chunks.length - 1] = { ...chunks[chunks.length - 1], done: true };
        }
        return { ...prev, [section]: chunks };
      });
      return;
    }

    if (!text) return;

    // Add block (B) — phases that start a new collapsible block
    const blockPhases = ["ambiguity_aspect", "complexity_aspect", "slot_and_count"];
    if (blockPhases.includes(phase)) {
      setReasoningSections((prev) => ({
        ...prev,
        [section]: [...prev[section].slice(0, -1),
          // Update parent chunk to collapsible type if it was line
          ...(() => {
            const last = prev[section][prev[section].length - 1];
            if (!last) return [];
            return [last];
          })(),
          { type: "collapsible" as const, label: text, header: text, details: [], done: false },
        ],
      }));
      return;
    }

    // Add block (B) — non-collapsible (summary, tax, entry, decision phases)
    const nonCollapsibleBlockPhases = [
      "ambiguity_summary", "complexity_summary",
      "proceed_reason", "rationale", "decision",
      "tax_detection", "tax_context", "tax_reasoning", "tax_decision",
      "entry_rationale", "final_entry",
      "no_detections",
    ];
    if (nonCollapsibleBlockPhases.includes(phase)) {
      setReasoningSections((prev) => {
        const chunks = [...prev[section]];
        const lastChunk = chunks[chunks.length - 1];
        if (lastChunk && lastChunk.type === "line") {
          // Add as content line to the existing line-type chunk
          chunks[chunks.length - 1] = { ...lastChunk, content: [...lastChunk.content, text] };
        }
        return { ...prev, [section]: chunks };
      });
      return;
    }

    // Add line (L) — everything else goes into current block's details
    setReasoningSections((prev) => {
      const chunks = [...prev[section]];
      for (let i = chunks.length - 1; i >= 0; i--) {
        const chunk = chunks[i];
        if (chunk.type === "collapsible") {
          chunks[i] = { ...chunk, details: [...chunk.details, text] };
          break;
        }
      }
      return { ...prev, [section]: chunks };
    });
  }

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
    setEntryLines([]);
    setEntryDescription("");
    setReasoningSections(emptyReasoning());

    // Unsubscribe previous
    unsubRef.current?.();

    try {
      // Ensure SSE connection before submitting
      await ensureConnection();

      const response = await submitLLMInteraction(trimmed);
      setResult(response);
      parseIdRef.current = response.parse_id;

      // Subscribe to SSE events for this parse_id
      unsubRef.current = subscribeToRealtimeUpdates((ev) => {
        if (ev.parse_id !== parseIdRef.current) return;

        if (ev.type === "agent.stream") {
          handleStreamEvent(ev);
        } else if (ev.type === "pipeline.result") {
          const agentResult = ev.result as Record<string, unknown> | undefined;
          if (agentResult?.decision === "PROCEED") {
            const entry = agentResult.entry as { reason?: string; lines?: JournalLine[] } | undefined;
            if (entry?.lines) {
              setEntryLines(entry.lines);
              setEntryDescription(entry.reason || "");
            }
          }
          setLoading(false);
        } else if (ev.type === "pipeline.error") {
          setError(ev.error || "Agent processing failed");
          setLoading(false);
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
      setLoading(false);
    }
  }

  const DUR = "0.25s";
  const DELAY = "0.25s";

  const grid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: showEnglish ? "minmax(0, 1fr) minmax(0, 1fr)" : "minmax(0, 1fr) 0fr",
    gap: showEnglish ? 20 : 0,
    alignItems: "stretch",
    transition: showEnglish
      ? `grid-template-columns ${DUR} ease, gap ${DUR} ease`
      : `grid-template-columns ${DUR} ease ${DELAY}, gap ${DUR} ease ${DELAY}`,
  };

  return (
    <div
      style={{
        height: "100vh",
        minWidth: showEnglish ? 1000 : 550,
        background: T.pageBg,
        padding: "24px 24px",
        boxSizing: "border-box",
        fontFamily: T.pageFont,
        color: T.pageText,
        overflow: "auto",
      }}
    >
      <div style={{
        maxWidth: showEnglish ? "90vw" : "70vw",
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 20,
        height: "100%",
        transition: showEnglish
          ? `max-width ${DUR} ease`
          : `max-width ${DUR} ease ${DELAY}`,
      }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.eyebrow }}>
              LLM Interaction
            </p>
            <h1 style={{ margin: "4px 0 0", fontSize: 26, fontWeight: 700, color: T.textPrimary }}>
              Bilingual Entry Builder
            </h1>
            <p style={{ margin: "6px 0 0", fontSize: 14, color: T.textSecondary }}>
              Enter a transaction in English or Korean — the system detects the language,
              translates if needed, and produces journal entries in both.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0, marginTop: 18 }}>
            <button
              type="button"
              onClick={() => setShowEnglish((v) => !v)}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = palette.silver;
                e.currentTarget.style.color = palette.carbonBlack;
                e.currentTarget.style.borderColor = palette.silver;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = T.textSecondary;
                e.currentTarget.style.borderColor = T.inputBorder;
              }}
              style={{
                padding: "6px 14px",
                borderRadius: T.buttonRadius,
                border: `1px solid ${T.inputBorder}`,
                background: "transparent",
                color: T.textSecondary,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {showEnglish ? "Hide English" : "Show English"}
            </button>
            <button
              type="button"
              onClick={() => setShowReasoning((v) => !v)}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = palette.silver;
                e.currentTarget.style.color = palette.carbonBlack;
                e.currentTarget.style.borderColor = palette.silver;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = T.textSecondary;
                e.currentTarget.style.borderColor = T.inputBorder;
              }}
              style={{
                padding: "6px 14px",
                borderRadius: T.buttonRadius,
                border: `1px solid ${T.inputBorder}`,
                background: "transparent",
                color: T.textSecondary,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {showReasoning ? "Hide Reasoning" : "Show Reasoning"}
            </button>
          </div>
        </div>

        {/* Main content: panels + reasoning side by side */}
        <div ref={mainContentRef} style={{ display: "flex", gap: 20, flex: 1, minHeight: 0 }}>

        {/* Panels wrapper (left) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20, flex: 1, minHeight: 0, minWidth: 0 }}>

        {/* Row 1: Entry (fills remaining space) */}
        <div className="llm-grid-animated" style={{ ...grid, flex: 1, minHeight: 0 }}>
          {/* Entry in detected language */}
          <section style={{ ...panel, overflow: "hidden", minWidth: 450 }}>
            <PanelHeader
              title="Entry"
              help={entryLines.length > 0
                ? "Journal entry from the agent pipeline."
                : "Entry will appear here as the agent processes."}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1, minHeight: 0 }}>
              {/* Entry section */}
              <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                {entryDescription && (
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: T.textSecondary }}>
                    {entryDescription}
                  </p>
                )}
                <EntryTable lines={entryLines} scrollRef={entryScrollRef} onScroll={() => syncScroll("entry")} />
              </div>

            </div>
          </section>

          {/* English Entry (toggled) */}
          <section className={`llm-english-panel${showEnglish ? " visible" : ""}`} style={{ ...panel, padding: undefined, minWidth: showEnglish ? 450 : 0, overflow: "hidden" }}>
            <div className="llm-english-content" style={{ display: "flex", flexDirection: "column", gap: T.panelGap, flex: 1, minHeight: 0 }}>
              <PanelHeader title="English Entry" help="Journal entry generated from the English text." />
              <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1, minHeight: 0 }}>
                <EntryTable lines={entryLines} scrollRef={englishEntryScrollRef} onScroll={() => syncScroll("english")} />
              </div>
            </div>
          </section>
        </div>

        {/* Row 2: Input (fixed at bottom) */}
        <div className="llm-grid-animated" style={{ ...grid, flexShrink: 0 }}>
          {/* Input Panel */}
          <section style={{ ...panel, minWidth: 450 }}>
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
                className="llm-textarea"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onScroll={handleScroll}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
                }}
                placeholder={"e.g. Bought a laptop from Apple for $2,400\ne.g. 애플에서 노트북을 $2,400에 구매했습니다"}
                rows={6}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  resize: "none",
                  overflow: "auto",
                  border: "none",
                  borderRadius: T.inputRadius,
                  padding: "10px 12px",
                  fontSize: 14,
                  color: T.textPrimary,
                  background: "transparent",
                  outline: "none",
                  fontFamily: "inherit",
                }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: 12 }}>
                <button
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
                    transition: "background 0.15s",
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

          {/* English Text Panel (toggled) */}
          <section className={`llm-english-panel${showEnglish ? " visible" : ""}`} style={{ ...panel, padding: undefined, minWidth: showEnglish ? 450 : 0, overflow: "hidden" }}>
            <div className="llm-english-content" style={{ display: "flex", flexDirection: "column", gap: T.panelGap, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <PanelHeader
                  title="English Text"
                  help={result
                    ? result.detected_language === "ko"
                      ? "Translated from Korean"
                      : "Original input (English detected)"
                    : "The English version of your input will appear here."}
                />
                {result && (
                  <span
                    style={{
                      flexShrink: 0,
                      marginLeft: "auto",
                      padding: "3px 10px",
                      borderRadius: 20,
                      fontSize: 11,
                      fontWeight: 700,
                      background: T.badgeBg,
                      color: T.badgeText,
                      letterSpacing: "0.03em",
                    }}
                  >
                    {result.detected_language === "ko" ? "Korean" : "English"}
                  </span>
                )}
              </div>
              <div
                style={{
                  flex: 1,
                  borderRadius: 6,
                  border: `1px solid ${T.inputBorder}`,
                  background: T.inputBg,
                  padding: "10px 12px",
                  fontSize: 14,
                  color: result?.english_text ? T.textPrimary : T.textSecondary,
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.55,
                }}
              >
                {result?.english_text ?? "—"}
              </div>
            </div>
          </section>
        </div>

        </div>{/* end panels wrapper */}

        {/* Reasoning & Progress viewer (right) */}
        <section style={{
          position: "relative",
          width: showReasoning ? reasoningWidth : 0,
          flexShrink: 0,
          overflow: "hidden",
          background: showReasoning ? "rgba(204, 197, 185, 0.2)" : "transparent",
          backdropFilter: showReasoning ? "blur(16px)" : "none",
          WebkitBackdropFilter: showReasoning ? "blur(16px)" : "none",
          borderRadius: T.panelRadius,
          padding: showReasoning ? T.panelPadding : 0,
          display: "flex",
          flexDirection: "column",
          gap: T.panelGap,
          border: showReasoning ? "1px solid rgba(204, 197, 185, 0.1)" : "none",
          boxShadow: showReasoning ? T.panelShadow : "none",
          transition: isResizing
            ? "padding 0.2s ease, background 0.2s ease, box-shadow 0.2s ease, border 0.2s ease"
            : showReasoning
              ? "width 0.2s ease, padding 0.2s ease, background 0.2s ease, box-shadow 0.2s ease, border 0.2s ease"
              : "width 0.2s ease 0.2s, padding 0.2s ease 0.2s, background 0.2s ease 0.2s, box-shadow 0.2s ease 0.2s, border 0.2s ease 0.2s",
        }}>
          {showReasoning && (
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                resizing.current = true;
                setIsResizing(true);
                const startX = e.clientX;
                const startWidth = reasoningWidth;
                const containerWidth = mainContentRef.current?.offsetWidth ?? 1200;
                const panelMinTotal = showEnglish ? 450 * 2 + 20 : 450; // two panels + gap, or one
                const maxReasoningWidth = containerWidth - panelMinTotal - 24;
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
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(204, 197, 185, 0.4)"; }}
              onMouseLeave={(e) => { if (!resizing.current) e.currentTarget.style.background = "transparent"; }}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: 4,
                height: "100%",
                cursor: "col-resize",
                background: "transparent",
                borderRadius: "4px 0 0 4px",
                transition: "background 0.15s",
                zIndex: 2,
              }}
            />
          )}
          <div style={{
            opacity: showReasoning ? 1 : 0,
            transform: showReasoning ? "translateX(0)" : "translateX(16px)",
            transition: showReasoning
              ? "opacity 0.2s ease 0.2s, transform 0.2s ease 0.2s"
              : "opacity 0.2s ease, transform 0.2s ease",
            minWidth: 0,
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}>
            <PanelHeader
              title="Reasoning"
              help="Agent trace and progress"
            />
            <div
              className="llm-textarea"
              style={{
                flex: 1,
                overflowY: "auto",
                fontSize: 13,
                lineHeight: 1.6,
                color: T.textSecondary,
                whiteSpace: "pre-wrap",
                marginTop: T.panelGap,
                marginRight: -4,
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              {SECTION_ORDER.map((id) => (
                <div key={id} data-section={id}>
                  <ReasoningSection chunks={reasoningSections[id]} />
                </div>
              ))}
            </div>
          </div>
        </section>

        </div>{/* end main content */}

      </div>
    </div>
  );
}
