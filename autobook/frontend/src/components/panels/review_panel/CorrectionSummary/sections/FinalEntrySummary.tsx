import { useLLMInteractionStore } from "../../../store";
import { useShallow } from "zustand/react/shallow";
import { EntryTable } from "../../../entry_panel/EntryPanel";
import { CURRENCY_SYM, entryColors } from "../../../shared/tokens";
import { SummarySection } from "../primitives/SummarySection";
import { SummarySubsection } from "../primitives/SummarySubsection";
import { SummaryField } from "../primitives/SummaryField";

/**
 * Section 4 — Final Entry.
 *
 * Shows the corrected journal entry, the per-line debit/credit relationship
 * (Type / Direction / Taxonomy) the user assigned, and the section's notes.
 */
export function FinalEntrySummary() {
  const entry = useLLMInteractionStore((st) => st.corrected.output_entry_drafter);
  const debitRel = useLLMInteractionStore(
    useShallow((st) => st.corrected.debit_relationship)
  );
  const creditRel = useLLMInteractionStore(
    useShallow((st) => st.corrected.credit_relationship)
  );
  const notes = useLLMInteractionStore((st) => st.corrected.notes.finalEntry);

  if (!entry) {
    return (
      <SummarySection title="Final Entry">
        <SummaryField label="Status" value="No entry data" />
      </SummarySection>
    );
  }

  const sym = CURRENCY_SYM[entry.currency ?? ""] ?? "";

  // One D/C row per entry line — always rendered. Looks up the line's
  // classification in the debit or credit bucket according to its type.
  // Empty rows show an em-dash via SummaryField's built-in fallback.
  const dcRows = entry.lines.map((line) => {
    const bucket = line.type === "debit" ? debitRel : creditRel;
    const cell = line.id ? bucket[line.id] : undefined;
    const parts = [cell?.type, cell?.direction, cell?.taxonomy].filter(Boolean);
    return {
      id: line.id ?? line.account_name,
      label: line.account_name || "(unnamed)",
      value: parts.length > 0 ? parts.join(" · ") : "",
    };
  });

  return (
    <SummarySection title="Final Entry">
      <SummarySubsection title="Entry">
        <SummaryField label="Reason" value={entry.reason ?? ""} />
        <SummaryField label="Currency" value={entry.currency ?? ""} />
        <SummaryField
          label="Lines"
          value={
            <EntryTable
              lines={entry.lines ?? []}
              currencySymbol={sym}
              colors={entryColors}
              compact
              showTotal
            />
          }
        />
      </SummarySubsection>

      <SummarySubsection title="Debit / Credit Relationship">
        {dcRows.length === 0 ? (
          <SummaryField label="(no lines)" value="" />
        ) : (
          dcRows.map((row) => (
            <SummaryField key={row.id} label={row.label} value={row.value} />
          ))
        )}
      </SummarySubsection>

      <SummarySubsection title="Notes">
        <SummaryField label="Additional notes" value={notes} />
      </SummarySubsection>
    </SummarySection>
  );
}
