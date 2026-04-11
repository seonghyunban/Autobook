/**
 * Tax section (conditional: corrected decision = PROCEED).
 * Body: Tax fields (attempted vs corrected) with per-field reset.
 * Footer: Notes (tax)
 */
import { SegmentedControl } from "../../shared/SegmentedControl";
import { SectionSubheader } from "../../shared/SectionSubheader";
import { palette, T } from "../../shared/tokens";
import { ReviewTextField } from "../../shared/ReviewTextField";
import { NumberField } from "../../shared/NumberField";
import type { HumanEditableTax } from "../../../../api/types";
import { useDraftStore } from "../../store";
import { ReviewSectionLayout } from "../shared/ReviewSectionLayout";
import { ReviewSubsection } from "../shared/ReviewSubsection";
import { AttemptedCorrectedLabels } from "../shared/AttemptedCorrectedLabels";
import { CorrectedActionBar } from "../shared/CorrectedActionBar";
import { AttemptedCorrectedRow } from "../shared/AttemptedCorrectedRow";

// ── Constants ───────────────────────────────────────────

const CLASSIFICATION_OPTIONS = ["Taxable", "Zero-rated", "Exempt", "Out of scope"];
const BOOL_OPTIONS = ["Yes", "No"];

function classificationToDisplay(c: string): string {
  return ({ taxable: "Taxable", zero_rated: "Zero-rated", exempt: "Exempt", out_of_scope: "Out of scope" }[c] ?? c);
}
function displayToClassification(d: string): HumanEditableTax["classification"] {
  return ({ "Taxable": "taxable", "Zero-rated": "zero_rated", "Exempt": "exempt", "Out of scope": "out_of_scope" }[d] ?? "out_of_scope") as HumanEditableTax["classification"];
}

// ── TaxFieldItemView ────────────────────────────────────

function TaxFieldItemView({ label, question, attemptedControl, correctedControl, changed, onReset }: {
  label: string;
  question: string;
  attemptedControl: React.ReactNode;
  correctedControl: React.ReactNode;
  changed: boolean;
  onReset: () => void;
}) {
  const SILVER_BG = "rgba(204, 197, 185, 0.2)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <AttemptedCorrectedLabels />
      <AttemptedCorrectedRow
        changed={changed}
        attempted={
          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "8px 10px", background: SILVER_BG, borderRadius: 4, height: "100%" }}>
            <div style={T.fieldLabel}>{question}</div>
            <div>{attemptedControl}</div>
            <div style={{ height: 18 }} />
          </div>
        }
        corrected={
          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "8px 10px", background: SILVER_BG, borderRadius: 4 }}>
            <div style={T.fieldLabel}>{question}</div>
            <div>{correctedControl}</div>
            <CorrectedActionBar variant={changed ? "corrected" : "attempted"} actions={[
              { label: "Reset", onClick: onReset },
            ]} />
          </div>
        }
      />
    </div>
  );
}

// ── TaxSection ──────────────────────────────────────────

export function TaxSection() {
  // Read attempted tax fields from store. Empty defaults if no tax data exists yet.
  const attemptedTax = useDraftStore((st) => st.attempted.output_tax_specialist) ?? null;
  const correctedTax = useDraftStore((st) => st.corrected.output_tax_specialist) ?? null;
  const setCorrected = useDraftStore((st) => st.setCorrected);

  const attemptedTaxMentioned = attemptedTax?.tax_mentioned ?? false;
  const attemptedClassification = attemptedTax?.classification ?? "out_of_scope";
  const attemptedItcEligible = attemptedTax?.itc_eligible ?? false;
  const attemptedAmountInclusive = attemptedTax?.amount_tax_inclusive ?? false;
  const attemptedTaxRate = attemptedTax?.tax_rate ?? null;
  const attemptedTaxContext = attemptedTax?.tax_context ?? "";

  const corrTaxMentioned = correctedTax?.tax_mentioned ?? false;
  const corrClassification = correctedTax?.classification ?? "out_of_scope";
  const corrItcEligible = correctedTax?.itc_eligible ?? false;
  const corrAmountInclusive = correctedTax?.amount_tax_inclusive ?? false;
  const corrTaxRate = correctedTax?.tax_rate ?? null;
  const corrTaxContext = correctedTax?.tax_context ?? "";

  // Mutate one field on the corrected tax_specialist via immer. The
  // corrected tax is HumanEditableTax (no `reasoning`) — only the 6
  // fields with UI controls live there.
  function mutateTax(updater: (tax: HumanEditableTax) => void) {
    setCorrected((draft) => {
      if (!draft.output_tax_specialist) return;
      updater(draft.output_tax_specialist);
    });
  }

  function resetField(field: string) {
    setCorrected((draft) => {
      const attempted = useDraftStore.getState().attempted.output_tax_specialist;
      const draftTax = draft.output_tax_specialist;
      if (!attempted || !draftTax) return;
      switch (field) {
        case "tax_mentioned": draftTax.tax_mentioned = attempted.tax_mentioned; break;
        case "classification": draftTax.classification = attempted.classification; break;
        case "itc_eligible": draftTax.itc_eligible = attempted.itc_eligible; break;
        case "amount_tax_inclusive": draftTax.amount_tax_inclusive = attempted.amount_tax_inclusive; break;
        case "tax_rate": draftTax.tax_rate = attempted.tax_rate; break;
        case "tax_context": draftTax.tax_context = attempted.tax_context; break;
      }
    });
  }

  return (
    <ReviewSectionLayout notesKey="tax"
      notesPlaceholder="Any additional notes about the tax treatment — such as special rules, mixed-use considerations, or jurisdiction-specific details."
    >
      <ReviewSubsection title="Tax Mentioned" explanation="Was tax mentioned in the transaction description?">
        <TaxFieldItemView label="Tax mentioned" question="Tax mentioned"
          attemptedControl={<SegmentedControl value={attemptedTaxMentioned ? "Yes" : "No"} options={BOOL_OPTIONS} />}
          correctedControl={<SegmentedControl value={corrTaxMentioned ? "Yes" : "No"} options={BOOL_OPTIONS} onChange={(v) => mutateTax((tax) => { tax.tax_mentioned = v === "Yes"; })} />}
          changed={corrTaxMentioned !== attemptedTaxMentioned} onReset={() => resetField("tax_mentioned")}
        />
      </ReviewSubsection>

      <ReviewSubsection title="Classification" explanation="What is the tax classification of this supply?">
        <TaxFieldItemView label="Classification" question="Classification"
          attemptedControl={<SegmentedControl value={classificationToDisplay(attemptedClassification)} options={CLASSIFICATION_OPTIONS} />}
          correctedControl={<SegmentedControl value={classificationToDisplay(corrClassification)} options={CLASSIFICATION_OPTIONS} onChange={(v) => mutateTax((tax) => { tax.classification = displayToClassification(v); })} />}
          changed={corrClassification !== attemptedClassification} onReset={() => resetField("classification")}
        />
      </ReviewSubsection>

      <ReviewSubsection title="ITC Eligible" explanation="Can the business claim an Input Tax Credit?">
        <TaxFieldItemView label="ITC eligible" question="ITC eligible"
          attemptedControl={<SegmentedControl value={attemptedItcEligible ? "Yes" : "No"} options={BOOL_OPTIONS} />}
          correctedControl={<SegmentedControl value={corrItcEligible ? "Yes" : "No"} options={BOOL_OPTIONS} onChange={(v) => mutateTax((tax) => { tax.itc_eligible = v === "Yes"; })} />}
          changed={corrItcEligible !== attemptedItcEligible} onReset={() => resetField("itc_eligible")}
        />
      </ReviewSubsection>

      <ReviewSubsection title="Amount Tax-Inclusive" explanation="Does the stated amount already include tax?">
        <TaxFieldItemView label="Amount tax-inclusive" question="Tax-inclusive"
          attemptedControl={<SegmentedControl value={attemptedAmountInclusive ? "Yes" : "No"} options={BOOL_OPTIONS} />}
          correctedControl={<SegmentedControl value={corrAmountInclusive ? "Yes" : "No"} options={BOOL_OPTIONS} onChange={(v) => mutateTax((tax) => { tax.amount_tax_inclusive = v === "Yes"; })} />}
          changed={corrAmountInclusive !== attemptedAmountInclusive} onReset={() => resetField("amount_tax_inclusive")}
        />
      </ReviewSubsection>

      <ReviewSubsection title="Tax Rate" explanation="What is the applicable tax rate?">
        <TaxFieldItemView label="Tax rate" question="Rate"
          attemptedControl={<NumberField value={attemptedTaxRate} formatDisplay={(v) => `${(v * 100).toFixed(0)}%`} style={{ fontWeight: 600 }} />}
          correctedControl={<NumberField value={corrTaxRate} step="0.01" min="0" max="1" formatDisplay={(v) => `${(v * 100).toFixed(0)}%`} onChange={(v) => mutateTax((tax) => { tax.tax_rate = v; })} style={{ fontWeight: 600 }} />}
          changed={corrTaxRate !== attemptedTaxRate} onReset={() => resetField("tax_rate")}
        />
      </ReviewSubsection>

      <ReviewSubsection title="Tax Context" explanation="What tax context is relevant for the entry drafter?">
        <TaxFieldItemView label="Tax context" question="Context"
          attemptedControl={<ReviewTextField value={attemptedTaxContext} emptyText="—" />}
          correctedControl={<ReviewTextField value={corrTaxContext} onChange={(v) => mutateTax((tax) => { tax.tax_context = v; })} emptyText="—" />}
          changed={corrTaxContext !== attemptedTaxContext} onReset={() => resetField("tax_context")}
        />
      </ReviewSubsection>
    </ReviewSectionLayout>
  );
}
