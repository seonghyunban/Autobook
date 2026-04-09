import type { HumanCorrectedTrace } from "../../../../api/types";
import type { ValidationIssue } from "./types";
import {
  validateTransactionGraph,
  validateAmbiguity,
  validateTax,
  validateEntry,
} from "./rules";

/**
 * Run all validation rules on the user's corrected state.
 * Pure function — no side effects, no hooks, no I/O.
 *
 * Returns a flat list of ValidationIssues. Consumers (the summary banner)
 * filter by severity to decide what to show and whether to block the summary.
 */
export function validateCorrected(corrected: HumanCorrectedTrace): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  validateTransactionGraph(corrected, issues);
  validateAmbiguity(corrected, issues);
  validateTax(corrected, issues);
  validateEntry(corrected, issues);
  return issues;
}
