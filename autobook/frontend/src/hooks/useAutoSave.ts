import { useEffect, useRef } from "react";
import { useLLMInteractionStore } from "../components/panels/store";
import { patchCorrection, type CorrectionPatch } from "../api/corrections";
import type { HumanCorrectedTrace } from "../api/types";

const DEBOUNCE_MS = 2000;

/**
 * Watches the Zustand corrected state and auto-saves the full corrected
 * trace to the backend via PATCH /drafts/:id/correction, debounced at 2s.
 *
 * Sends the entire corrected state on each save (full replace, no diffing).
 * Skips if no draftId is set.
 */
export function useAutoSave() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevRef = useRef<string>("");
  const skipCount = useRef(0);

  useEffect(() => {
    // Skip the first few store changes (rehydration + resetAll + hydrateCorrected)
    // to prevent auto-save from overwriting DB corrections on page load.
    skipCount.current = 3;

    const unsub = useLLMInteractionStore.subscribe((state) => {
      const draftId = state.draftId;
      if (!draftId) return;

      const snapshot = JSON.stringify(state.corrected);
      if (snapshot === prevRef.current) return;
      prevRef.current = snapshot;

      if (skipCount.current > 0) {
        skipCount.current--;
        return;
      }

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const patch = buildPatch(state.corrected);
        patchCorrection(draftId, patch).catch((err) => {
          console.error("Auto-save failed:", err);
        });
      }, DEBOUNCE_MS);
    });

    return () => {
      unsub();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);
}

function buildPatch(c: HumanCorrectedTrace): CorrectionPatch {
  const tax = c.output_tax_specialist;
  const dm = c.output_decision_maker;
  const entry = c.output_entry_drafter;
  const graph = c.transaction_graph;

  return {
    // Trace fields
    decision_kind: c.decision,
    decision_rationale: dm?.rationale ?? null,
    tax_classification: tax?.classification ?? null,
    tax_rate: tax?.tax_rate ?? null,
    tax_context: tax?.tax_context ?? null,
    tax_itc_eligible: tax?.itc_eligible ?? null,
    tax_amount_inclusive: tax?.amount_tax_inclusive ?? null,
    tax_mentioned: tax?.tax_mentioned ?? null,
    note_tx_analysis: c.notes.transactionAnalysis || null,
    note_ambiguity: c.notes.ambiguity || null,
    note_tax: c.notes.tax || null,
    note_entry: c.notes.finalEntry || null,

    // Entry
    entry_reason: entry?.reason ?? null,
    lines: entry?.lines?.map((l) => ({
      account_code: l.account_code,
      account_name: l.account_name,
      type: l.type,
      amount: l.amount,
      currency: entry.currency || "CAD",
    })) ?? null,

    // Graph
    graph: graph
      ? {
          nodes: graph.nodes.map((n) => ({
            index: n.index,
            name: n.name,
            role: n.role,
          })),
          edges: graph.edges.map((e) => ({
            source_index: e.source_index,
            target_index: e.target_index,
            nature: e.nature,
            kind: e.kind,
            amount: e.amount,
            currency: e.currency,
          })),
        }
      : null,

    // Ambiguities
    ambiguities: dm?.ambiguities?.map((a) => ({
      aspect: a.aspect,
      ambiguous: a.ambiguous,
      conventional_default: a.input_contextualized_conventional_default ?? null,
      ifrs_default: a.input_contextualized_ifrs_default ?? null,
      clarification_question: a.clarification_question ?? null,
      cases: (a.cases ?? []).map((ca) => ({
        case_text: ca.case,
        proposed_entry_json: (ca.possible_entry as Record<string, unknown>) ?? null,
      })),
    })) ?? null,

    // Classifications (from debit + credit relationship maps)
    classifications: entry?.lines
      ? entry.lines
          .map((l) => {
            const cls = c.debit_relationship[l.id ?? ""] ?? c.credit_relationship[l.id ?? ""];
            if (!cls || !cls.type) return null;
            return {
              account_name: l.account_name,
              type: cls.type,
              direction: cls.direction ?? "",
              taxonomy: cls.taxonomy ?? "",
            };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null)
      : null,
  };
}
