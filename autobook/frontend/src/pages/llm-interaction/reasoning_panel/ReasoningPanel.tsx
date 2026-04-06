import { useMemo, useState } from "react";
import { RiArrowLeftSLine, RiArrowDownSLine } from "react-icons/ri";
import { palette, T, CURRENCY_SYM, attemptedEntryColors } from "../shared/tokens";
import { ForceGraph, toGraphData } from "../../../components/force-graph";
import { EntryTable } from "../entry_panel/EntryPanel";
import s from "../../LLMInteractionPage.module.css";

// ── Reasoning types ──────────────────────────────────────

export type TaggedLine = { kind: "text"; tag: string; text: string };
export type EntryLineData = {
  kind: "entry";
  tag: string;
  entry: { reason?: string; currency?: string; lines?: Array<{ type: "debit" | "credit"; account_name: string; amount: number; reason?: string }> };
};
export type CollapsibleItem = TaggedLine | EntryLineData;

export type GraphBlockData = {
  nodes: Array<{ index: number; name: string; role: string }>;
  edges: Array<{ source: string; source_index: number; target: string; target_index: number; nature: string; amount?: number | null; currency?: string | null; kind: string }>;
};

export type ReasoningBlock =
  | { type: "text"; content: string }
  | { type: "collapsible"; header: string; lines: CollapsibleItem[] }
  | { type: "entry"; tag: string; entry: EntryLineData["entry"] }
  | { type: "graph"; tag: string; graph: GraphBlockData };

export type ReasoningChunk = {
  label: string;
  done: boolean;
  blocks: ReasoningBlock[];
};

export type SectionId = "normalization" | "ambiguity" | "gap" | "proceed" | "debit" | "credit" | "tax" | "entry";

export const SECTION_ORDER: SectionId[] = ["normalization", "ambiguity", "gap", "proceed", "debit", "credit", "tax", "entry"];

// ── Reasoning chunk components ───────────────────────────

function ChunkIcon({ done }: { done: boolean }) {
  return (
    <span
      className={done ? undefined : s.starPulse}
      style={{ fontSize: 11, lineHeight: 1, flexShrink: 0, color: palette.spicyPaprika }}
    >
      {done ? "✦" : "✧"}
    </span>
  );
}

const blockStyle: React.CSSProperties = {
  background: "rgba(229, 228, 226, 0.25)",
  borderRadius: 4,
  padding: "6px 8px",
  fontSize: 12,
  lineHeight: 1.5,
  color: T.textSecondary,
  wordBreak: "break-word",
};

function Chunk({ label, done, children }: {
  label: string;
  done: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={s.chunkAppear} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <ChunkIcon done={done} />
        <span style={{ fontSize: 12, fontWeight: 600, color: T.textPrimary }}>{label}</span>
      </div>
      {children && <div style={{ paddingLeft: 10, display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>}
    </div>
  );
}

function Block({ children }: { children: React.ReactNode }) {
  return <div className={`${s.hoverableBlock} ${s.blockAppear}`} style={blockStyle}>{children}</div>;
}

function CollapsibleBlock({ header, children, defaultOpen = false }: {
  header: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`${s.hoverableBlock} ${s.blockAppear}`} style={blockStyle}>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none" }}
      >
        <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: T.textPrimary }}>{header}</span>
        <span style={{ fontSize: 12, lineHeight: 1, flexShrink: 0, color: palette.spicyPaprika, display: "flex" }}>
          {open ? <RiArrowLeftSLine /> : <RiArrowDownSLine />}
        </span>
      </div>
      <div className={`${s.collapsibleWrapper} ${open ? s.collapsibleWrapperOpen : ""}`} style={{ marginTop: open ? 4 : 0 }}>
        <div className={s.collapsibleInner} style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function BulletLine({ tag, text }: { tag: string; text: string }) {
  return (
    <div className={`${s.hoverableLine} ${s.lineAppear}`} style={{ display: "flex", gap: 6, background: "rgba(229, 228, 226, 0.3)", borderRadius: 3, padding: "3px 6px" }}>
      <span style={{ width: 12, flexShrink: 0, textAlign: "center", color: palette.charcoalBrown, fontSize: 8, lineHeight: "18px" }}>●</span>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: T.textSecondary, textTransform: "uppercase", letterSpacing: "0.04em" }}>{tag}</span>
        <span style={{ fontSize: 12, color: T.textSecondary, wordBreak: "break-word" }}>{text}</span>
      </div>
    </div>
  );
}


function GraphBlockLine({ tag, graph, layoutVersion }: { tag: string; graph: GraphBlockData; layoutVersion?: number }) {
  const graphData = useMemo(() => toGraphData(graph as Parameters<typeof toGraphData>[0]), [graph]);
  return (
    <div className={s.lineAppear} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", gap: 6, background: "rgba(229, 228, 226, 0.3)", borderRadius: 3, padding: "3px 6px" }}>
        <span style={{ width: 12, flexShrink: 0, textAlign: "center", color: palette.charcoalBrown, fontSize: 8, lineHeight: "18px" }}>●</span>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: T.textSecondary, textTransform: "uppercase", letterSpacing: "0.04em" }}>{tag}</span>
          <div style={{ width: "100%", height: 250 }}>
            <ForceGraph data={graphData} layoutVersion={layoutVersion} />
          </div>
        </div>
      </div>
    </div>
  );
}

function EntryBlockLine({ tag, entry }: { tag: string; entry: EntryLineData["entry"] }) {
  const lines = entry.lines || [];
  const sym = CURRENCY_SYM[entry.currency || ""] || "";

  return (
    <div className={s.lineAppear} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {/* Entry table with dot and tag */}
      <div className={s.hoverableLine} style={{ display: "flex", gap: 6, background: "rgba(229, 228, 226, 0.3)", borderRadius: 3, padding: "3px 6px" }}>
        <span style={{ width: 12, flexShrink: 0, textAlign: "center", color: palette.charcoalBrown, fontSize: 8, lineHeight: "18px" }}>●</span>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: T.textSecondary, textTransform: "uppercase", letterSpacing: "0.04em" }}>{tag}</span>
          <EntryTable
            lines={lines as import("../../../api/types").JournalLine[]}
            currencySymbol={sym}
            colors={attemptedEntryColors}
            compact
            showTotal={false}
          />
        </div>
      </div>
      {/* Per-line reasons */}
      {lines.map((line, i) =>
        line.reason ? <BulletLine key={`r-${i}`} tag={`Reason for ${line.account_name}`} text={line.reason} /> : null
      )}
      {/* Overall reason */}
      {entry.reason && <BulletLine tag="Overall reason" text={entry.reason} />}
    </div>
  );
}

export function ReasoningSection({ chunks, graphLayoutVersion }: { chunks: ReasoningChunk[]; graphLayoutVersion?: number }) {
  if (chunks.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {chunks.map((chunk, i) => (
        <Chunk key={i} label={chunk.label} done={chunk.done}>
          {chunk.blocks.map((block, j) =>
            block.type === "text" ? (
              <Block key={j}><div>{block.content}</div></Block>
            ) : block.type === "entry" ? (
              <EntryBlockLine key={j} tag={block.tag} entry={block.entry} />
            ) : block.type === "graph" ? (
              <GraphBlockLine key={j} tag={block.tag} graph={block.graph} layoutVersion={graphLayoutVersion} />
            ) : (
              <CollapsibleBlock key={j} header={block.header}>
                {block.lines.map((line, k) =>
                  line.kind === "entry"
                    ? <EntryBlockLine key={k} tag={line.tag} entry={line.entry} />
                    : <BulletLine key={k} tag={line.tag} text={line.text} />
                )}
              </CollapsibleBlock>
            )
          )}
        </Chunk>
      ))}
    </div>
  );
}
