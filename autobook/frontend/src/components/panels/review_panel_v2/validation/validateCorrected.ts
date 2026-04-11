import type { HumanCorrectedTrace } from "../../../../api/types";
import type { ValidationIssue } from "./types";
import {
  validateTransactionGraph,
  validateAmbiguity,
  validateTax,
  validateEntry,
} from "./rules";

/** Section keys that map to validation rule sets. */
type SectionKey = "transaction_analysis" | "ambiguity" | "tax" | "final_entry" | "summary";

const SECTION_VALIDATORS: Record<string, (c: HumanCorrectedTrace, i: ValidationIssue[]) => void> = {
  transaction_analysis: validateTransactionGraph,
  ambiguity: validateAmbiguity,
  tax: validateTax,
  final_entry: validateEntry,
};

/**
 * Run validation rules on the user's corrected state.
 * Pure function — no side effects, no hooks, no I/O.
 *
 * When `activeSections` is provided, only rules for those sections run.
 * When omitted, all rules run (backwards compatible).
 *
 * Returns a flat list of ValidationIssues. Consumers (the summary banner)
 * filter by severity to decide what to show and whether to block the summary.
 */
export function validateCorrected(
  corrected: HumanCorrectedTrace,
  activeSections?: readonly { key: SectionKey | string }[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (activeSections) {
    const keys = new Set(activeSections.map((s) => s.key));
    for (const [key, fn] of Object.entries(SECTION_VALIDATORS)) {
      if (keys.has(key)) fn(corrected, issues);
    }
  } else {
    validateTransactionGraph(corrected, issues);
    validateAmbiguity(corrected, issues);
    validateTax(corrected, issues);
    validateEntry(corrected, issues);
  }
  return issues;
}
