/**
 * Build reasoning sections from an AgentAttemptedTrace (static mode).
 *
 * Used when SSE streaming data is not available:
 * - Entry viewer page (loaded from DB)
 * - Draft page after tab switch (data in Zustand store)
 *
 * Produces the same ReasoningChunk structure as SSE streaming,
 * but all at once from the final pipeline state.
 */
import type { AgentAttemptedTrace } from "../../../api/types";
import type { ReasoningChunk, SectionId, GraphBlockData } from "./ReasoningPanel";

export function buildFromTrace(
  trace: AgentAttemptedTrace,
): Record<SectionId, ReasoningChunk[]> {
  let seq = 0;
  /** In static mode all chunks are done; doneSeq mirrors seq. */
  const s = () => { const v = seq++; return { seq: v, doneSeq: v }; };
  const sections: Record<SectionId, ReasoningChunk[]> = {
    normalization: [],
    ambiguity: [],
    gap: [],
    proceed: [],
    debit: [],
    credit: [],
    tax: [],
    entry: [],
  };

  // ── RAG recall: similar transactions ──
  const nNorm = (trace.rag_normalizer_hits ?? []).length;
  sections.normalization.push({
    label: nNorm > 0 ? "Recalled past similar transactions" : "Novel transaction",
    done: true,
    blocks: [{ type: "text", content: `Found ${nNorm} similar transaction${nNorm !== 1 ? "s" : ""}` }],
    ...s(),
  });

  // ── RAG recall: corrections ──
  const nCorr = (trace.rag_local_hits ?? []).length + (trace.rag_pop_hits ?? []).length;
  sections.normalization.push({
    label: nCorr > 0 ? "Recalled past corrections" : "No past corrections found",
    done: true,
    blocks: [{ type: "text", content: `Found ${nCorr} correction${nCorr !== 1 ? "s" : ""}` }],
    ...s(),
  });

  // ── Normalization: graph ──
  if (trace.transaction_graph) {
    sections.normalization.push({
      label: "Transaction analyzed",
      done: true,
      blocks: [{
        type: "graph",
        tag: "Transaction structure",
        graph: trace.transaction_graph as GraphBlockData,
      }],
      ...s(),
    });
  }

  // ── Decision maker: ambiguity / gap / proceed ──
  const dm = trace.output_decision_maker;
  if (dm) {
    const ambiguities = dm.ambiguities || [];
    const ambiguous = ambiguities.filter((a) => a.ambiguous);
    const resolved = ambiguities.filter((a) => !a.ambiguous);

    if (ambiguous.length > 0) {
      sections.ambiguity = [{
        label: `${ambiguous.length} ambiguit${ambiguous.length === 1 ? "y" : "ies"} detected`,
        done: true,
        blocks: ambiguous.map((a) => ({
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
        ...s(),
      }];
    }

    if (resolved.length > 0) {
      sections.proceed = [{
        label: `${resolved.length} resolved`,
        done: true,
        blocks: resolved.map((a) => ({
          type: "collapsible" as const,
          header: a.aspect,
          lines: [
            ...(a.input_contextualized_conventional_default
              ? [{ kind: "text" as const, tag: "Resolution", text: a.input_contextualized_conventional_default }]
              : []),
          ],
        })),
        ...s(),
      }];
    }

    if (dm.rationale) {
      const decisionSection = trace.decision === "PROCEED" ? "proceed" : trace.decision === "MISSING_INFO" ? "ambiguity" : "gap";
      if (sections[decisionSection].length === 0) {
        sections[decisionSection] = [{ label: trace.decision || "Decision", done: true, blocks: [], ...s() }];
      }
      sections[decisionSection][0].blocks.unshift({
        type: "text",
        content: dm.rationale,
      });
    }
  }

  // ── Debit classifier ──
  const debit = trace.output_debit_classifier;
  if (debit && typeof debit === "object") {
    const blocks = _classifierBlocks(debit);
    if (blocks.length > 0) {
      sections.debit = [{
        label: "Debit relationship identified",
        done: true,
        blocks,
        ...s(),
      }];
    }
  }

  // ── Credit classifier ──
  const credit = trace.output_credit_classifier;
  if (credit && typeof credit === "object") {
    const blocks = _classifierBlocks(credit);
    if (blocks.length > 0) {
      sections.credit = [{
        label: "Credit relationship identified",
        done: true,
        blocks,
        ...s(),
      }];
    }
  }

  // ── Tax specialist ──
  const tax = trace.output_tax_specialist;
  if (tax) {
    const blocks: ReasoningChunk["blocks"] = [];
    if (tax.reasoning) {
      blocks.push({ type: "text", content: tax.reasoning });
    }
    blocks.push({
      type: "text",
      content: `Classification: ${tax.classification}${tax.tax_rate != null ? ` (${(tax.tax_rate * 100).toFixed(0)}%)` : ""} | ITC eligible: ${tax.itc_eligible ? "yes" : "no"} | Tax inclusive: ${tax.amount_tax_inclusive ? "yes" : "no"}`,
    });
    if (tax.tax_context) {
      blocks.push({ type: "text", content: tax.tax_context });
    }
    sections.tax = [{
      label: "Tax consideration determined",
      done: true,
      blocks,
      ...s(),
    }];
  }

  // ── Entry drafter ──
  const entry = trace.output_entry_drafter;
  if (entry && entry.lines && entry.lines.length > 0) {
    sections.entry = [{
      label: "Entry drafted",
      done: true,
      blocks: [
        {
          type: "entry",
          tag: "Journal entry",
          entry: {
            reason: entry.reason,
            currency: entry.currency,
            lines: entry.lines,
          },
        },
      ],
      ...s(),
    }];
  }

  return sections;
}


function _classifierBlocks(output: Record<string, unknown>): ReasoningChunk["blocks"] {
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
