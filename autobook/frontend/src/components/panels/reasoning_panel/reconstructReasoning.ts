/**
 * Reconstruct reasoning sections from an AgentAttemptedTrace + chunk manifest.
 *
 * Mirrors the SSE handlers exactly — same sections, same block types,
 * same text formatting (replicating the Python renderers in TypeScript).
 *
 * Used by both:
 *   - Entry drafter (fallback when store is empty)
 *   - Entry viewer (always, from DB data)
 */
import type { AgentAttemptedTrace } from "../../../api/types";
import type { ReasoningChunk, SectionId, GraphBlockData, CollapsibleItem } from "./ReasoningPanel";

// ── Manifest types ──────────────────────────────────────

export type ChunkManifestEntry = {
  section: SectionId;
  kind: string;
  label: string;
  seq: number;
  doneSeq: number;
};

export type ChunkManifest = ChunkManifestEntry[];

// ── Chunk kinds ─────────────────────────────────────────

const CHUNK_KINDS = [
  "rag_normalizer", "rag_corrections", "graph",
  "ambiguity", "complexity", "proceed",
  "debit", "credit", "tax", "entry",
] as const;

type ChunkKind = typeof CHUNK_KINDS[number];

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

// ── Text renderers (mirrors Python renderers.py exactly) ─

function renderAmbiguityStatus(ambiguous: boolean): string {
  return ambiguous ? "unresolved" : "resolved";
}

function renderAmbiguitySummary(ambiguities: unknown[]): string {
  const n = ambiguities.length;
  const unresolved = ambiguities.filter((a) => (a as Record<string, unknown>).ambiguous).length;
  if (n === 0) return "No ambiguities identified.";
  const nWord = `There ${n !== 1 ? "are" : "is"} ${n} potential ${n !== 1 ? "ambiguities" : "ambiguity"} identified`;
  const uWord = `${unresolved} out of ${n} of them ${unresolved !== 1 ? "are" : "is"} unresolved`;
  return `${nWord}, and ${uWord}.`;
}

function renderComplexityStatus(beyond: boolean): string {
  return beyond ? "beyond capability" : "within capability";
}

function renderComplexitySummary(flags: unknown[]): string {
  const n = flags.length;
  const beyond = flags.filter((f) => (f as Record<string, unknown>).beyond_llm_capability).length;
  if (n === 0) return "No complexity identified.";
  const nWord = `There ${n !== 1 ? "are" : "is"} ${n} potential ${n !== 1 ? "complexities" : "complexity"} identified`;
  const bWord = `${beyond} out of ${n} of them ${beyond !== 1 ? "are" : "is"} beyond LLM capability`;
  return `${nWord}, and ${bWord}.`;
}

function renderTaxDetection(mentioned: boolean, classification: string): string {
  const label = classification.replace(/_/g, " ");
  return mentioned
    ? `Tax is mentioned in the input. Classification: ${label}.`
    : `Tax is not mentioned in the input. Classification: ${label}.`;
}

function renderTaxDecision(classification: string, itcEligible: boolean, amountTaxInclusive: boolean, rate: number | null | undefined): string {
  if (["zero_rated", "exempt", "out_of_scope"].includes(classification)) {
    return `No tax lines will be added (${classification.replace(/_/g, " ")}).`;
  }
  const parts = ["Tax lines will be added"];
  const details: string[] = [];
  if (rate != null) details.push(`at ${Math.round(rate * 100)}%`);
  if (itcEligible) details.push("recoverable as Input Tax Credit");
  else details.push("non-recoverable, included in expense");
  if (amountTaxInclusive) details.push("amount is tax-inclusive");
  if (details.length) parts.push(": " + details.join(", ") + ".");
  else parts.push(".");
  return parts.join("");
}

function renderSlotAndCount(slot: string, count: number): string {
  const label = slot.replace(/_/g, " ");
  return `Identified ${count} ${count !== 1 ? "lines" : "line"} associated with ${label}`;
}

// ── Slot ordering (mirrors Python DEBIT_SLOTS / CREDIT_SLOTS) ─

const DEBIT_SLOTS = ["asset_increase", "expense_increase", "liability_decrease", "equity_decrease", "revenue_decrease"];
const CREDIT_SLOTS = ["asset_decrease", "expense_decrease", "liability_increase", "equity_increase", "revenue_increase"];

// ── Default manifest ────────────────────────────────────

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
    add("ambiguity", ambiguities.length > 0 ? "Ambiguity detected" : "No ambiguity detected");

    const flags = (dm as Record<string, unknown>).complexity_flags as unknown[] | undefined;
    const hasComplexity = flags?.some((f) => (f as Record<string, unknown>).beyond_llm_capability);
    add("complexity", hasComplexity ? "Complexity detected" : "No complexity detected");

    add("proceed", "Decision made");
  }

  // Classifiers
  if (trace.output_debit_classifier) {
    const output = trace.output_debit_classifier;
    const has = DEBIT_SLOTS.some((s) => (output[s] ?? []).length > 0);
    add("debit", has ? "Debit relationship identified" : "No debit relationship identified");
  }
  if (trace.output_credit_classifier) {
    const output = trace.output_credit_classifier;
    const has = CREDIT_SLOTS.some((s) => (output[s] ?? []).length > 0);
    add("credit", has ? "Credit relationship identified" : "No credit relationship identified");
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

// ── Capture manifest from live SSE reasoning ────────────

export function captureManifest(
  sections: Record<SectionId, ReasoningChunk[]>,
): ChunkManifest {
  const manifest: ChunkManifest = [];

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

// ── Main reconstruct function ───────────────────────────

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

// ── Per-kind chunk builders (mirrors SSE _write_complete) ─

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

    case "ambiguity":
      return buildAmbiguityChunk(trace, base);

    case "complexity":
      return buildComplexityChunk(trace, base);

    case "proceed":
      return buildProceedChunk(trace, base);

    case "debit":
      return buildClassifierChunk(trace.output_debit_classifier, DEBIT_SLOTS, base);

    case "credit":
      return buildClassifierChunk(trace.output_credit_classifier, CREDIT_SLOTS, base);

    case "tax":
      return buildTaxChunk(trace, base);

    case "entry":
      return buildEntryChunk(trace, base);

    default:
      return null;
  }
}

// ── Ambiguity: mirrors decision_maker.py lines 92-112 ───

function buildAmbiguityChunk(
  trace: AgentAttemptedTrace,
  base: { label: string; done: boolean; seq: number; doneSeq: number },
): ReasoningChunk {
  const dm = trace.output_decision_maker;
  const ambiguities = dm?.ambiguities ?? [];
  const blocks: ReasoningChunk["blocks"] = [];

  for (const a of ambiguities) {
    const lines: CollapsibleItem[] = [];

    if (a.input_contextualized_conventional_default) {
      lines.push({ kind: "text", tag: "Conventional default", text: a.input_contextualized_conventional_default });
    }
    if (a.input_contextualized_ifrs_default) {
      lines.push({ kind: "text", tag: "IFRS default", text: a.input_contextualized_ifrs_default });
    }
    if (a.clarification_question) {
      lines.push({ kind: "text", tag: "Question", text: a.clarification_question });
    }
    for (const c of a.cases ?? []) {
      lines.push({ kind: "text", tag: "Case", text: c.case ?? "" });
      const pe = c.possible_entry as { lines?: unknown[] } | undefined;
      if (pe?.lines?.length) {
        lines.push({ kind: "entry", tag: "Possible entry", entry: pe as CollapsibleItem & { kind: "entry" } extends { entry: infer E } ? E : never });
      }
    }
    lines.push({ kind: "text", tag: "Status", text: renderAmbiguityStatus(a.ambiguous ?? false) });

    blocks.push({ type: "collapsible", header: a.aspect, lines });
  }

  blocks.push({ type: "text", content: renderAmbiguitySummary(ambiguities) });

  return { ...base, blocks };
}

// ── Complexity: mirrors decision_maker.py lines 114-126 ─

function buildComplexityChunk(
  trace: AgentAttemptedTrace,
  base: { label: string; done: boolean; seq: number; doneSeq: number },
): ReasoningChunk {
  const dm = trace.output_decision_maker;
  const flags = ((dm as Record<string, unknown> | null)?.complexity_flags ?? []) as Array<Record<string, unknown>>;
  const blocks: ReasoningChunk["blocks"] = [];

  for (const f of flags) {
    const lines: CollapsibleItem[] = [];
    const ba = f.best_attempt as { lines?: unknown[] } | undefined;
    if (ba?.lines?.length) {
      lines.push({ kind: "entry", tag: "Best attempt", entry: ba as CollapsibleItem & { kind: "entry" } extends { entry: infer E } ? E : never });
    }
    const gap = f.gap as string | undefined;
    if (gap) {
      lines.push({ kind: "text", tag: "Gap", text: gap });
    }
    lines.push({ kind: "text", tag: "Status", text: renderComplexityStatus(!!f.beyond_llm_capability) });

    blocks.push({ type: "collapsible", header: (f.aspect as string) ?? "Aspect", lines });
  }

  blocks.push({ type: "text", content: renderComplexitySummary(flags) });

  return { ...base, blocks };
}

// ── Proceed: mirrors decision_maker.py lines 128-134 ────

function buildProceedChunk(
  trace: AgentAttemptedTrace,
  base: { label: string; done: boolean; seq: number; doneSeq: number },
): ReasoningChunk {
  const dm = trace.output_decision_maker;
  const blocks: ReasoningChunk["blocks"] = [];

  const proceedReason = (dm as Record<string, unknown> | null)?.proceed_reason as string | undefined;
  if (proceedReason) {
    blocks.push({ type: "text", content: proceedReason });
  }

  const rationale = (dm as Record<string, unknown> | null)?.overall_final_rationale as string | undefined;
  if (rationale) {
    blocks.push({ type: "text", content: rationale });
  }

  const decision = dm?.decision ?? trace.decision ?? "";
  if (decision) {
    blocks.push({ type: "text", content: decision });
  }

  return { ...base, blocks };
}

// ── Classifier: mirrors debit/credit_classifier.py ──────

function buildClassifierChunk(
  output: Record<string, unknown[]> | null,
  slots: string[],
  base: { label: string; done: boolean; seq: number; doneSeq: number },
): ReasoningChunk | null {
  if (!output) return null;
  const blocks: ReasoningChunk["blocks"] = [];

  for (const slot of slots) {
    for (const det of (output[slot] ?? []) as Array<Record<string, unknown>>) {
      const count = (det.count as number) ?? 1;
      const header = renderSlotAndCount(slot, count);
      const lines: CollapsibleItem[] = [];
      if (det.reason) lines.push({ kind: "text", tag: "Reason", text: det.reason as string });
      if (det.category) lines.push({ kind: "text", tag: "IFRS category", text: det.category as string });
      blocks.push({ type: "collapsible", header, lines });
    }
  }

  return { ...base, blocks };
}

// ── Tax: mirrors tax_specialist.py lines 45-53 ──────────

function buildTaxChunk(
  trace: AgentAttemptedTrace,
  base: { label: string; done: boolean; seq: number; doneSeq: number },
): ReasoningChunk | null {
  const tax = trace.output_tax_specialist;
  if (!tax) return null;
  const blocks: ReasoningChunk["blocks"] = [];

  blocks.push({ type: "text", content: renderTaxDetection(tax.tax_mentioned ?? false, tax.classification ?? "out_of_scope") });

  if (tax.tax_context) {
    blocks.push({ type: "text", content: tax.tax_context });
  }
  if (tax.reasoning) {
    blocks.push({ type: "text", content: tax.reasoning });
  }

  blocks.push({ type: "text", content: renderTaxDecision(tax.classification ?? "out_of_scope", tax.itc_eligible ?? false, tax.amount_tax_inclusive ?? false, tax.tax_rate) });

  return { ...base, blocks };
}

// ── Entry: mirrors entry_drafter.py lines 62-67 ─────────

function buildEntryChunk(
  trace: AgentAttemptedTrace,
  base: { label: string; done: boolean; seq: number; doneSeq: number },
): ReasoningChunk | null {
  const ed = trace.output_entry_drafter;
  if (!ed?.lines?.length) return null;

  return {
    ...base,
    blocks: [{
      type: "entry",
      tag: "Final entry",
      entry: { reason: ed.reason, currency: ed.currency, lines: ed.lines },
    }],
  };
}
