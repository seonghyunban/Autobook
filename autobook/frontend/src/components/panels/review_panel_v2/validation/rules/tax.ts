import type { HumanCorrectedTrace } from "../../../../../api/types";
import type { ValidationIssue } from "../types";
import { isFiniteNumber } from "../helpers";

/**
 * Validates the tax specialist output: field types, rate range,
 * and classification/rate/ITC coherence.
 *
 * Operates on the user-editable subset (HumanEditableTax) — the
 * agent-generated `reasoning` field is intentionally not validated
 * here because there is no UI control for it.
 */
export function validateTax(corrected: HumanCorrectedTrace, issues: ValidationIssue[]): void {
  const tax = corrected.output_tax_specialist;
  if (!tax) return; // Silently skip if no tax data (warning handled elsewhere if desired)

  validateRate(tax, issues);
  validateCoherence(tax, issues);
}

type TaxLike = {
  tax_mentioned?: boolean;
  classification?: string;
  itc_eligible?: boolean;
  amount_tax_inclusive?: boolean;
  tax_rate?: number | null;
  tax_context?: string | null;
};

// ── Tax rate range ────────────────────────────────────────

function validateRate(tax: TaxLike, issues: ValidationIssue[]): void {
  if (tax.tax_rate == null) return;
  if (tax.tax_rate < 0 || tax.tax_rate > 1) {
    issues.push({
      section: "tax",
      severity: "error",
      message: `Tax rate ${tax.tax_rate} is outside [0, 1] (expected a decimal like 0.13 for 13%)`,
    });
  }
}

// ── Cross-field coherence ─────────────────────────────────

function validateCoherence(tax: TaxLike, issues: ValidationIssue[]): void {
  const cls = tax.classification;
  const rate = tax.tax_rate;

  // taxable supply should have a rate
  if (cls === "taxable" && rate == null) {
    issues.push({
      section: "tax",
      severity: "warning",
      message: "Classified as taxable but no tax rate is provided",
    });
  }

  // zero_rated should have rate === 0
  if (cls === "zero_rated" && rate != null && rate !== 0) {
    issues.push({
      section: "tax",
      severity: "warning",
      message: `Classified as zero-rated but tax rate is ${rate} (expected 0)`,
    });
  }

  // exempt / out_of_scope should not have a rate
  if ((cls === "exempt" || cls === "out_of_scope") && rate != null) {
    issues.push({
      section: "tax",
      severity: "warning",
      message: `Classified as ${cls === "out_of_scope" ? "out of scope" : cls} — tax rate should be empty`,
    });
  }

  // ITC eligible requires a taxable or zero-rated supply
  if (tax.itc_eligible === true && (cls === "exempt" || cls === "out_of_scope")) {
    issues.push({
      section: "tax",
      severity: "warning",
      message: `ITC eligible but classified as ${cls === "out_of_scope" ? "out of scope" : cls} — ITC typically requires taxable or zero-rated`,
    });
  }

  // Tax-inclusive flag only meaningful with a rate
  if (tax.amount_tax_inclusive === true && rate == null) {
    issues.push({
      section: "tax",
      severity: "warning",
      message: "Marked as tax-inclusive but no tax rate is provided",
    });
  }
}

