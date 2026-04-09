import { useEffect, useRef } from "react";
import { useLLMInteractionStore } from "../components/panels/store";
import { patchCorrection, type CorrectionPatch } from "../api/corrections";
import type { HumanCorrectedTrace } from "../api/types";

const DEBOUNCE_MS = 1500;

/**
 * Watches the Zustand corrected state and auto-saves to the backend
 * via PATCH /drafts/:id/correction on a debounced interval.
 *
 * Skips if no draftId is set (e.g. before first pipeline result).
 */
export function useAutoSave() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevRef = useRef<string>("");

  useEffect(() => {
    const unsub = useLLMInteractionStore.subscribe((state) => {
      const draftId = state.draftId;
      if (!draftId) return;

      const snapshot = serializeCorrected(state.corrected);
      if (snapshot === prevRef.current) return;
      prevRef.current = snapshot;

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

function serializeCorrected(c: HumanCorrectedTrace): string {
  return JSON.stringify({
    decision: c.decision,
    dm: c.output_decision_maker,
    tax: c.output_tax_specialist,
    entry: c.output_entry_drafter,
    notes: c.notes,
    graph: c.transaction_graph,
    debit_rel: c.debit_relationship,
    credit_rel: c.credit_relationship,
  });
}

function buildPatch(c: HumanCorrectedTrace): CorrectionPatch {
  const tax = c.output_tax_specialist;
  const dm = c.output_decision_maker;
  const entry = c.output_entry_drafter;

  return {
    decision_kind: c.decision,
    decision_rationale: dm?.rationale,
    tax_classification: tax?.classification,
    tax_rate: tax?.tax_rate,
    tax_context: tax?.tax_context,
    tax_itc_eligible: tax?.itc_eligible,
    tax_amount_inclusive: tax?.amount_tax_inclusive,
    tax_mentioned: tax?.tax_mentioned,
    note_tx_analysis: c.notes.transactionAnalysis || null,
    note_ambiguity: c.notes.ambiguity || null,
    note_tax: c.notes.tax || null,
    note_entry: c.notes.finalEntry || null,
    entry_reason: entry?.reason || null,
    lines: entry?.lines?.map((l) => ({
      account_code: l.account_code,
      account_name: l.account_name,
      type: l.type,
      amount: l.amount,
      currency: entry.currency || "CAD",
    })) ?? null,
  };
}
