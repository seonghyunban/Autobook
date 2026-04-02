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
  fern: "#4F772D",
  palmLeaf: "#90A955",
  limeCream: "#ECF39E",
} as const;

// ── Component tokens ─────────────────────────────────────
const T = {
  pageBg: palette.carbonBlack,
  pageText: palette.floralWhite,
  pageFont: "system-ui, sans-serif",

  panelBg: "rgba(64, 61, 57, 0.6)",
  panelRadius: 12,
  panelPadding: "20px 22px",
  panelShadow: "0 4px 12px rgba(0, 0, 0, 0.3), 0 16px 40px rgba(0, 0, 0, 0.2)",
  panelGap: 12,

  textPrimary: palette.floralWhite,
  textSecondary: palette.silver,
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

const MIN_ROWS = 12;

function EntryTable({ lines, scrollRef, onScroll }: {
  lines: JournalLine[];
  scrollRef?: React.Ref<HTMLDivElement>;
  onScroll?: React.UIEventHandler<HTMLDivElement>;
}) {
  const emptyRows = Math.max(0, MIN_ROWS - lines.length);
  const tableStyle: React.CSSProperties = {
    width: "100%",
    borderCollapse: "separate",
    borderSpacing: "5px 3px",
    fontSize: 13,
    tableLayout: "fixed",
  };
  const colWidths = ["50%", "25%", "25%"];
  const cellRadius = 4;
  const cellBg = [`${palette.fern}1A`, `${palette.palmLeaf}1A`, `${palette.limeCream}1A`];

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
                  color: palette.floralWhite,
                  background: [`${palette.fern}B3`, `${palette.palmLeaf}B3`, `${palette.limeCream}B3`][i],
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
                <td style={{ padding: "8px 10px", color: palette.floralWhite, borderRadius: cellRadius, background: cellBg[0] }}>
                  <span style={{ fontWeight: 500 }}>{line.account_code}</span>
                  <span style={{ display: "block", fontSize: 11, opacity: 0.7 }}>
                    {line.account_name}
                  </span>
                </td>
                <td
                  style={{
                    padding: "8px 10px",
                    textAlign: "right",
                    fontFamily: "monospace",
                    color: palette.floralWhite,
                                       borderRadius: cellRadius,
                    background: cellBg[1],
                  }}
                >
                  {line.type === "debit" ? `$${line.amount.toFixed(2)}` : ""}
                </td>
                <td
                  style={{
                    padding: "8px 10px",
                    textAlign: "right",
                    fontFamily: "monospace",
                    color: palette.floralWhite,
                                       borderRadius: cellRadius,
                    background: cellBg[2],
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
    </div>
  );
}

export function LLMInteractionPage() {
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LLMInteractionResponse | null>(null);
  const [showEnglish, setShowEnglish] = useState(false);
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
                    padding: "9px 18px",
                    borderRadius: T.buttonRadius,
                    border: `1px solid ${T.inputBorder}`,
                    background: "transparent",
                    color: T.textSecondary,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {showEnglish ? "Hide English" : "Show English"}
                </button>
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
          width: 320,
          flexShrink: 0,
          overflow: "hidden",
          background: "rgba(204, 197, 185, 0.2)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderRadius: T.panelRadius,
          padding: T.panelPadding,
          display: "flex",
          flexDirection: "column",
          gap: T.panelGap,
          border: "1px solid rgba(204, 197, 185, 0.1)",
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
            }}
          >
            {result ? "Processing complete." : "Agent reasoning and progress will appear here as the pipeline runs."}
          </div>
        </section>

        </div>{/* end main content */}

      </div>
    </div>
  );
}
