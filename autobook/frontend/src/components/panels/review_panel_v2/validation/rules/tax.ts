import type { HumanCorrectedTrace } from "../../../../../api/types";
import type { ValidationIssue } from "../types";
import { isFiniteNumber } from "../helpers";

const VALID_CLASSIFICATIONS = new Set(["taxable", "zero_rated", "exempt", "out_of_scope"]);

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

  validateTypes(tax, issues);
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

// ── Type + enum checks ────────────────────────────────────

function validateTypes(tax: TaxLike, issues: ValidationIssue[]): void {
  if (typeof tax.tax_mentioned !== "boolean") {
    issues.push({ section: "tax", severity: "error", message: "tax_mentioned must be a boolean" });
  }
  if (!tax.classification || !VALID_CLASSIFICATIONS.has(tax.classification)) {
    issues.push({
      section: "tax",
      severity: "error",
      message: `Invalid classification "${tax.classification}"`,
    });
  }
  if (typeof tax.itc_eligible !== "boolean") {
    issues.push({ section: "tax", severity: "error", message: "itc_eligible must be a boolean" });
  }
  if (typeof tax.amount_tax_inclusive !== "boolean") {
    issues.push({ section: "tax", severity: "error", message: "amount_tax_inclusive must be a boolean" });
  }
}

// ── Tax rate range ────────────────────────────────────────

function validateRate(tax: TaxLike, issues: ValidationIssue[]): void {
  if (tax.tax_rate == null) return;
  if (!isFiniteNumber(tax.tax_rate)) {
    issues.push({ section: "tax", severity: "error", message: `Tax rate must be a number` });
    return;
  }
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
      message: "Classification is taxable but tax_rate is not set",
    });
  }

  // zero_rated should have rate === 0
  if (cls === "zero_rated" && rate != null && rate !== 0) {
    issues.push({
      section: "tax",
      severity: "warning",
      message: `Classification is zero_rated but tax_rate is ${rate} (expected 0)`,
    });
  }

  // exempt / out_of_scope should not have a rate
  if ((cls === "exempt" || cls === "out_of_scope") && rate != null) {
    issues.push({
      section: "tax",
      severity: "warning",
      message: `Classification is ${cls} but tax_rate is set (expected null)`,
    });
  }

  // ITC eligible requires a taxable or zero-rated supply
  if (tax.itc_eligible === true && (cls === "exempt" || cls === "out_of_scope")) {
    issues.push({
      section: "tax",
      severity: "warning",
      message: `ITC eligible but classification is ${cls} (ITC usually requires taxable/zero_rated)`,
    });
  }

  // Tax-inclusive flag only meaningful with a rate
  if (tax.amount_tax_inclusive === true && rate == null) {
    issues.push({
      section: "tax",
      severity: "warning",
      message: "Amount is marked tax-inclusive but tax_rate is not set",
    });
  }
}

