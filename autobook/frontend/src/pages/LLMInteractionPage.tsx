import { useCallback, useRef, useState } from "react";
import { submitLLMInteraction } from "../api/llm";
import type { LLMInteractionResponse, JournalLine } from "../api/types";

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
  | { type: "collapsible"; label: string; details: string[]; done: boolean };

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
  background: "rgba(204, 197, 185, 0.12)",
  borderRadius: 4,
  padding: "6px 8px",
  fontSize: 12,
  lineHeight: 1.5,
  color: T.textSecondary,
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
      {children}
    </div>
  );
}

function Block({ children }: { children: React.ReactNode }) {
  return <div style={blockStyle}>{children}</div>;
}

function CollapsibleBlock({ children, defaultOpen = false }: {
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      style={{ ...blockStyle, cursor: "pointer", userSelect: "none", position: "relative" }}
      onClick={() => setOpen((v) => !v)}
    >
      <span style={{
        position: "absolute",
        top: 6,
        right: 8,
        fontSize: 10,
        lineHeight: 1,
        color: palette.spicyPaprika,
      }}>
        {open ? "◀" : "▼"}
      </span>
      <div style={{
        maxHeight: open ? 1000 : 0,
        opacity: open ? 1 : 0,
        overflow: "hidden",
        transition: "max-height 0.2s ease, opacity 0.15s ease",
      }}>
        {children}
      </div>
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
            <CollapsibleBlock>
              {chunk.details.map((line, j) => <div key={j}>{line}</div>)}
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
                    <span style={{ fontSize: 13, opacity: 0.8 }}>{line.account_name}</span>
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
  const [result, setResult] = useState<LLMInteractionResponse | null>({
    input_text: "Bought a laptop from Apple for $2,400",
    detected_language: "en",
    english_text: "Bought a laptop from Apple for $2,400",
    english_entry: {
      description: "Purchase of laptop from Apple",
      lines: [
        { account_code: "1520", account_name: "Computer Equipment", type: "debit", amount: 2400.00 },
        { account_code: "2310", account_name: "HST Receivable", type: "debit", amount: 312.00 },
        { account_code: "1000", account_name: "Cash", type: "credit", amount: 2712.00 },
      ],
    },
    korean_entry: null,
  });
  const [showEnglish, setShowEnglish] = useState(false);
  const [showReasoning, setShowReasoning] = useState(true);
  const [reasoningSections, setReasoningSections] = useState<Record<SectionId, ReasoningChunk[]>>(
    () => ({
      ambiguity: [
        { type: "line" as const, label: "No ambiguity detected", content: ["Transaction text is clear and unambiguous."], done: true },
      ],
      gap: [
        { type: "line" as const, label: "No capability gaps", content: [], done: true },
      ],
      proceed: [
        { type: "line" as const, label: "Proceeding to classify", content: ["All checks passed."], done: true },
      ],
      debit: [
        { type: "collapsible" as const, label: "Asset increase: Computer Equipment", details: [
          "Purchased a physical asset (laptop)",
          "Classified as PP&E under IAS 16.7",
          "Debit: 1520 Computer Equipment $2,400.00",
        ], done: true },
        { type: "collapsible" as const, label: "Tax asset: HST Receivable", details: [
          "Input tax credit recoverable",
          "Debit: 2310 HST Receivable $312.00",
        ], done: false },
      ],
      credit: [
        { type: "collapsible" as const, label: "Asset decrease: Cash", details: [
          "Payment made from operating account",
        ], done: false },
      ],
      tax: [
        { type: "line" as const, label: "HST 13% applicable", content: ["Ontario — standard rate applies to electronic equipment."], done: true },
      ],
      entry: [
        { type: "line" as const, label: "Entry drafted", content: ["3 lines, balanced at $2,712.00"], done: true },
      ],
    }) as Record<SectionId, ReasoningChunk[]>
  );
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

  async function handleSubmit() {
    const trimmed = inputText.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await submitLLMInteraction(trimmed));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  const DUR = "0.25s";
  const DELAY = "0.25s";

  const grid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: showEnglish ? "1fr 1fr" : "1fr 0fr",
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
        background: T.pageBg,
        padding: "24px 24px",
        boxSizing: "border-box",
        fontFamily: T.pageFont,
        color: T.pageText,
        overflow: "hidden",
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
        <div style={{ display: "flex", gap: 20, flex: 1, minHeight: 0 }}>

        {/* Panels wrapper (left) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20, flex: 1, minHeight: 0 }}>

        {/* Row 1: Entry (fills remaining space) */}
        <div className="llm-grid-animated" style={{ ...grid, flex: 1, minHeight: 0 }}>
          {/* Entry in detected language */}
          <section style={{ ...panel, overflow: "hidden" }}>
            <PanelHeader
              title="Entry"
              help={result
                ? result.detected_language === "ko"
                  ? "Entry translated back to Korean."
                  : "Entry in the detected language."
                : "Entry in the detected language will appear here."}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1, minHeight: 0 }}>
              {/* Entry section */}
              <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                {(() => {
                  const entry = result?.detected_language === "ko" ? result.korean_entry : result?.english_entry;
                  return (
                    <>
                      {entry?.description && (
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: T.textSecondary }}>
                          {entry.description}
                        </p>
                      )}
                      <EntryTable lines={entry?.lines ?? []} scrollRef={entryScrollRef} onScroll={() => syncScroll("entry")} />
                    </>
                  );
                })()}
              </div>

            </div>
          </section>

          {/* English Entry (toggled) */}
          <section className={`llm-english-panel${showEnglish ? " visible" : ""}`} style={{ ...panel, padding: undefined }}>
            <div className="llm-english-content" style={{ display: "flex", flexDirection: "column", gap: T.panelGap, flex: 1, minHeight: 0 }}>
              <PanelHeader title="English Entry" help="Journal entry generated from the English text." />
              <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1, minHeight: 0 }}>
                <EntryTable lines={result?.english_entry?.lines ?? []} scrollRef={englishEntryScrollRef} onScroll={() => syncScroll("english")} />
              </div>
            </div>
          </section>
        </div>

        {/* Row 2: Input (fixed at bottom) */}
        <div className="llm-grid-animated" style={{ ...grid, flexShrink: 0 }}>
          {/* Input Panel */}
          <section style={panel}>
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
          <section className={`llm-english-panel${showEnglish ? " visible" : ""}`} style={{ ...panel, padding: undefined }}>
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
          width: showReasoning ? 320 : 0,
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
          transition: showReasoning
            ? "width 0.2s ease, padding 0.2s ease, background 0.2s ease, box-shadow 0.2s ease, border 0.2s ease"
            : "width 0.2s ease 0.2s, padding 0.2s ease 0.2s, background 0.2s ease 0.2s, box-shadow 0.2s ease 0.2s, border 0.2s ease 0.2s",
        }}>
          <div style={{
            opacity: showReasoning ? 1 : 0,
            transform: showReasoning ? "translateX(0)" : "translateX(16px)",
            transition: showReasoning
              ? "opacity 0.2s ease 0.2s, transform 0.2s ease 0.2s"
              : "opacity 0.2s ease, transform 0.2s ease",
            minWidth: 280,
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
