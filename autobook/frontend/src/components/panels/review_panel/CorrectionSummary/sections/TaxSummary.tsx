import { useLLMInteractionStore } from "../../../store";
import { SummarySection } from "../primitives/SummarySection";
import { SummarySubsection } from "../primitives/SummarySubsection";
import { SummaryField } from "../primitives/SummaryField";

const CLASSIFICATION_LABELS: Record<string, string> = {
  taxable: "Taxable",
  zero_rated: "Zero-rated",
  exempt: "Exempt",
  out_of_scope: "Out of scope",
};

/**
 * Section 3 — Tax.
 * Flat: 6 fields, no subsections.
 */
export function TaxSummary() {
  const tax = useLLMInteractionStore((st) => st.corrected.output_tax_specialist);
  const notes = useLLMInteractionStore((st) => st.corrected.notes.tax);

  if (!tax) {
    return (
      <SummarySection title="Tax">
        <SummarySubsection>
          <SummaryField label="Status" value="No tax data" />
        </SummarySubsection>
      </SummarySection>
    );
  }

  const rateDisplay = tax.tax_rate != null ? `${(tax.tax_rate * 100).toFixed(0)}%` : "";

  return (
    <SummarySection title="Tax">
      <SummarySubsection title="Tax Consideration">
        <SummaryField label="Tax mentioned" value={tax.tax_mentioned ? "Yes" : "No"} />
        <SummaryField
          label="Classification"
          value={CLASSIFICATION_LABELS[tax.classification] ?? tax.classification}
        />
        <SummaryField label="ITC eligible" value={tax.itc_eligible ? "Yes" : "No"} />
        <SummaryField label="Amount tax-inclusive" value={tax.amount_tax_inclusive ? "Yes" : "No"} />
        <SummaryField label="Tax rate" value={rateDisplay} />
        <SummaryField label="Tax context" value={tax.tax_context ?? ""} />
      </SummarySubsection>
      <SummarySubsection title="Notes">
        <SummaryField label="Additional notes" value={notes} />
      </SummarySubsection>
    </SummarySection>
  );
}
