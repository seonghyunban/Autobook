/**
 * Reconstruct reasoning sections from an AgentAttemptedTrace + chunk manifest.
 *
 * Unified function for both:
 *   - Entry drafter (after refresh, from sessionStorage)
 *   - Entry viewer (loaded from DB)
 *
 * The manifest provides the ordering (seq, doneSeq). The attempted trace
 * provides the content. Together they reproduce the exact SSE stream.
 */
import type { AgentAttemptedTrace } from "../../../api/types";
import type { ReasoningChunk, SectionId, GraphBlockData } from "./ReasoningPanel";

/** Compact ordering metadata captured when SSE completes. */
export type ChunkManifestEntry = {
  section: SectionId;
  kind: string;
  label: string;
  seq: number;
  doneSeq: number;
};

export type ChunkManifest = ChunkManifestEntry[];

/** All known chunk kinds and the sections they belong to. */
const CHUNK_KINDS = [
  "rag_normalizer",   // normalization
  "rag_corrections",  // normalization
  "graph",            // normalization
  "ambiguity",        // ambiguity
  "complexity",       // gap
  "proceed",          // proceed
  "debit",            // debit
  "credit",           // credit
  "tax",              // tax
  "entry",            // entry
] as const;

type ChunkKind = typeof CHUNK_KINDS[number];

/** Map a chunk kind to the section it belongs to. */
const KIND_TO_SECTION: Record<ChunkKind, SectionId> = {
  rag_normalizer: "normalization",
  rag_corrections: "normalization",
  graph: "normalization",
  ambiguity: "ambiguity",
  complexity: "gap",
  proceed: "proceed",
  debit: "debit",
  credit: "credit",
  tax: "tax",
  entry: "entry",
};

/**
 * Build a default manifest from attempted trace data.
 * Uses deterministic pipeline execution order.
 * Used when no SSE manifest is available (entry viewer from DB).
 */
export function defaultManifest(trace: AgentAttemptedTrace): ChunkManifest {
  const manifest: ChunkManifest = [];
  let seq = 0;

  const add = (kind: ChunkKind, label: string) => {
    manifest.push({ section: KIND_TO_SECTION[kind], kind, label, seq, doneSeq: seq });
    seq++;
  };

  // RAG
  const nNorm = (trace.rag_normalizer_hits ?? []).length;
  add("rag_normalizer", nNorm > 0 ? "Recalled past similar transactions" : "Novel transaction");

  const nCorr = (trace.rag_local_hits ?? []).length + (trace.rag_pop_hits ?? []).length;
  add("rag_corrections", nCorr > 0 ? "Recalled past corrections" : "No past corrections found");

  // Graph
  if (trace.transaction_graph) {
    add("graph", "Transaction analyzed");
  }

  // Decision maker
  const dm = trace.output_decision_maker;
  if (dm) {
    const ambiguities = dm.ambiguities || [];
    const ambiguous = ambiguities.filter((a) => a.ambiguous);
    const resolved = ambiguities.filter((a) => !a.ambiguous);

    if (ambiguous.length > 0) {
      add("ambiguity", `${ambiguous.length} ambiguit${ambiguous.length === 1 ? "y" : "ies"} detected`);
    } else {
      add("ambiguity", "No ambiguity detected");
    }

    const flags = (dm as Record<string, unknown>).complexity_flags as unknown[] | undefined;
    const hasComplexity = flags?.some((f: unknown) => (f as Record<string, unknown>).beyond_llm_capability);
    add("complexity", hasComplexity ? "Complexity detected" : "No complexity detected");

    add("proceed", resolved.length > 0 ? `${resolved.length} resolved` : (trace.decision || "Decision made"));
  }

  // Classifiers
  if (trace.output_debit_classifier) {
    add("debit", "Debit relationship identified");
  }
  if (trace.output_credit_classifier) {
    add("credit", "Credit relationship identified");
  }

  // Tax
  if (trace.output_tax_specialist) {
    add("tax", "Tax consideration determined");
  }

  // Entry
  if (trace.output_entry_drafter?.lines?.length) {
    add("entry", "Journal entry drafted");
  }

  return manifest;
}

/**
 * Capture a manifest from the current reasoning sections in the store.
 * Called after SSE pipeline.result to preserve the exact streaming order.
 */
export function captureManifest(
  sections: Record<SectionId, ReasoningChunk[]>,
): ChunkManifest {
  const manifest: ChunkManifest = [];

  // Map section chunks to kinds by position
  const sectionKinds: Record<SectionId, ChunkKind[]> = {
    normalization: ["rag_normalizer", "rag_corrections", "graph"],
    ambiguity: ["ambiguity"],
    gap: ["complexity"],
    proceed: ["proceed"],
    debit: ["debit"],
    credit: ["credit"],
    tax: ["tax"],
    entry: ["entry"],
  };

  for (const [section, kinds] of Object.entries(sectionKinds) as [SectionId, ChunkKind[]][]) {
    const chunks = sections[section];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      manifest.push({
        section,
        kind: kinds[Math.min(i, kinds.length - 1)],
        label: chunk.label,
        seq: chunk.seq ?? i,
        doneSeq: chunk.doneSeq ?? i,
      });
    }
  }

  return manifest;
}

/**
 * Reconstruct full reasoning sections from attempted trace + manifest.
 * Content comes from the trace, ordering from the manifest.
 */
export function reconstructReasoning(
  trace: AgentAttemptedTrace,
  manifest: ChunkManifest,
): Record<SectionId, ReasoningChunk[]> {
  const sections: Record<SectionId, ReasoningChunk[]> = {
    normalization: [], ambiguity: [], gap: [], proceed: [],
    debit: [], credit: [], tax: [], entry: [],
  };

  for (const entry of manifest) {
    const chunk = buildChunk(trace, entry);
    if (chunk) {
      sections[entry.section].push(chunk);
    }
  }

  return sections;
}

function buildChunk(
  trace: AgentAttemptedTrace,
  entry: ChunkManifestEntry,
): ReasoningChunk | null {
  const base = { label: entry.label, done: true, seq: entry.seq, doneSeq: entry.doneSeq };
  const kind = entry.kind as ChunkKind;

  switch (kind) {
    case "rag_normalizer": {
      const n = (trace.rag_normalizer_hits ?? []).length;
      return { ...base, blocks: [{ type: "text", content: `Found ${n} similar transaction${n !== 1 ? "s" : ""}` }] };
    }

    case "rag_corrections": {
      const n = (trace.rag_local_hits ?? []).length + (trace.rag_pop_hits ?? []).length;
      return { ...base, blocks: [{ type: "text", content: `Found ${n} correction${n !== 1 ? "s" : ""}` }] };
    }

    case "graph": {
      if (!trace.transaction_graph) return null;
      return { ...base, blocks: [{ type: "graph", tag: "Transaction structure", graph: trace.transaction_graph as GraphBlockData }] };
    }

    case "ambiguity": {
      const dm = trace.output_decision_maker;
      if (!dm) return { ...base, blocks: [{ type: "text", content: "No ambiguity detected" }] };
      const ambiguous = (dm.ambiguities || []).filter((a) => a.ambiguous);
      if (ambiguous.length === 0) return { ...base, blocks: [{ type: "text", content: "No ambiguities identified." }] };
      return {
        ...base,
        blocks: [
          ...(dm.rationale && trace.decision === "MISSING_INFO" ? [{ type: "text" as const, content: dm.rationale }] : []),
          ...ambiguous.map((a) => ({
            type: "collapsible" as const,
            header: a.aspect,
            lines: [
              ...(a.input_contextualized_conventional_default
                ? [{ kind: "text" as const, tag: "Conventional default", text: a.input_contextualized_conventional_default }]
                : []),
              ...(a.input_contextualized_ifrs_default
                ? [{ kind: "text" as const, tag: "IFRS default", text: a.input_contextualized_ifrs_default }]
                : []),
              ...(a.clarification_question
                ? [{ kind: "text" as const, tag: "Question", text: a.clarification_question }]
                : []),
            ],
          })),
        ],
      };
    }

    case "complexity": {
      const dm = trace.output_decision_maker;
      const flags = (dm as Record<string, unknown> | null)?.complexity_flags as Array<{
        aspect?: string;
        beyond_llm_capability?: boolean;
        gap?: string;
      }> | undefined;
      if (!flags || flags.length === 0) return { ...base, blocks: [{ type: "text", content: "No complexity identified." }] };
      return {
        ...base,
        blocks: [
          ...flags.map((f) => ({
            type: "collapsible" as const,
            header: f.aspect ?? "Aspect",
            lines: [
              ...(f.gap ? [{ kind: "text" as const, tag: "Gap", text: f.gap }] : []),
              { kind: "text" as const, tag: "Status", text: f.beyond_llm_capability ? "Beyond capability" : "Within capability" },
            ],
          })),
          { type: "text" as const, content: `${flags.filter((f) => f.beyond_llm_capability).length} of ${flags.length} aspects beyond capability` },
        ],
      };
    }

    case "proceed": {
      const dm = trace.output_decision_maker;
      if (!dm) return { ...base, blocks: [] };
      const resolved = (dm.ambiguities || []).filter((a) => !a.ambiguous);
      const blocks: ReasoningChunk["blocks"] = [];
      if (dm.rationale && trace.decision === "PROCEED") {
        blocks.push({ type: "text", content: dm.rationale });
      }
      for (const a of resolved) {
        blocks.push({
          type: "collapsible",
          header: a.aspect,
          lines: [
            ...(a.input_contextualized_conventional_default
              ? [{ kind: "text" as const, tag: "Resolution", text: a.input_contextualized_conventional_default }]
              : []),
          ],
        });
      }
      return { ...base, blocks };
    }

    case "debit": {
      const output = trace.output_debit_classifier;
      if (!output) return null;
      return { ...base, blocks: classifierBlocks(output) };
    }

    case "credit": {
      const output = trace.output_credit_classifier;
      if (!output) return null;
      return { ...base, blocks: classifierBlocks(output) };
    }

    case "tax": {
      const tax = trace.output_tax_specialist;
      if (!tax) return null;
      const blocks: ReasoningChunk["blocks"] = [];
      if (tax.reasoning) blocks.push({ type: "text", content: tax.reasoning });
      blocks.push({
        type: "text",
        content: `Classification: ${tax.classification}${tax.tax_rate != null ? ` (${(tax.tax_rate * 100).toFixed(0)}%)` : ""} | ITC eligible: ${tax.itc_eligible ? "yes" : "no"} | Tax inclusive: ${tax.amount_tax_inclusive ? "yes" : "no"}`,
      });
      if (tax.tax_context) blocks.push({ type: "text", content: tax.tax_context });
      return { ...base, blocks };
    }

    case "entry": {
      const ed = trace.output_entry_drafter;
      if (!ed?.lines?.length) return null;
      return {
        ...base,
        blocks: [{
          type: "entry",
          tag: "Journal entry",
          entry: { reason: ed.reason, currency: ed.currency, lines: ed.lines },
        }],
      };
    }

    default:
      return null;
  }
}

function classifierBlocks(output: Record<string, unknown[]>): ReasoningChunk["blocks"] {
  const blocks: ReasoningChunk["blocks"] = [];
  for (const [slot, detections] of Object.entries(output)) {
    if (!Array.isArray(detections)) continue;
    for (const det of detections) {
      const d = det as { reason?: string; category?: string; count?: number };
      if (!d.category) continue;
      const header = `${slot.replace(/_/g, " ")} — ${d.category}${d.count && d.count > 1 ? ` (×${d.count})` : ""}`;
      blocks.push({
        type: "collapsible",
        header,
        lines: d.reason
          ? [{ kind: "text", tag: "Reason", text: d.reason }]
          : [],
      });
    }
  }
  return blocks;
}
