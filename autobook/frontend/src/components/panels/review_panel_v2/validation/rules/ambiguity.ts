import type { HumanCorrectedTrace, AmbiguityOutput } from "../../../../../api/types";
import type { ValidationIssue } from "../types";
import { isBlank } from "../helpers";

/**
 * Validates ambiguities, the decision rationale, and decision/ambiguity coherence.
 */
export function validateAmbiguity(corrected: HumanCorrectedTrace, issues: ValidationIssue[]): void {
  const dm = corrected.output_decision_maker;
  const ambiguities = (dm?.ambiguities ?? []) as AmbiguityOutput[];

  validateEachAmbiguity(ambiguities, issues);
  validateDecision(corrected, issues);
  validateDecisionCoherence(corrected, ambiguities, issues);
}

// ── Per-ambiguity rules ──────────────────────────────────

function validateEachAmbiguity(ambiguities: AmbiguityOutput[], issues: ValidationIssue[]): void {
  ambiguities.forEach((amb, i) => {
    const label = `Ambiguity ${i + 1}`;

    // Aspect is mandatory
    if (isBlank(amb.aspect)) {
      issues.push({ section: "ambiguity", severity: "error", message: `${label}: empty aspect` });
    }

    // For marked-ambiguous items, additional soft rules
    if (amb.ambiguous === true) {
      // At least one default interpretation should exist
      if (isBlank(amb.input_contextualized_conventional_default) && isBlank(amb.input_contextualized_ifrs_default)) {
        issues.push({
          section: "ambiguity",
          severity: "warning",
          message: `${label}: no default interpretation (conventional or IFRS)`,
        });
      }

      // Clarification question should exist
      if (isBlank(amb.clarification_question)) {
        issues.push({
          section: "ambiguity",
          severity: "warning",
          message: `${label}: missing clarification question`,
        });
      }

      // Cases array should be non-empty
      if (!amb.cases || amb.cases.length === 0) {
        issues.push({
          section: "ambiguity",
          severity: "warning",
          message: `${label}: no possible cases listed`,
        });
      }
    }

    // Case text non-empty (regardless of ambiguous flag)
    (amb.cases ?? []).forEach((c, ci) => {
      if (isBlank(c.case)) {
        issues.push({
          section: "ambiguity",
          severity: "warning",
          message: `${label}, case ${ci + 1}: empty case text`,
        });
      }
    });
  });
}

// ── Decision rules ────────────────────────────────────────

function validateDecision(corrected: HumanCorrectedTrace, issues: ValidationIssue[]): void {
  const rationale = corrected.output_decision_maker?.rationale ?? "";
  if (isBlank(rationale)) {
    issues.push({ section: "ambiguity", severity: "warning", message: "Decision rationale is empty" });
  }
}

// ── Decision ↔ ambiguity coherence ────────────────────────

function validateDecisionCoherence(
  corrected: HumanCorrectedTrace,
  ambiguities: AmbiguityOutput[],
  issues: ValidationIssue[]
): void {
  const decision = corrected.decision;

  // PROCEED implies no unresolved ambiguity
  if (decision === "PROCEED") {
    const unresolved = ambiguities.filter((a) => a.ambiguous === true);
    if (unresolved.length > 0) {
      issues.push({
        section: "ambiguity",
        severity: "warning",
        message: `Decision is PROCEED but ${unresolved.length} ambiguit${unresolved.length === 1 ? "y is" : "ies are"} still marked ambiguous`,
      });
    }
  }

  // MISSING_INFO implies at least one unresolved ambiguity with a clarification question
  if (decision === "MISSING_INFO") {
    const actionable = ambiguities.filter(
      (a) => a.ambiguous === true && !isBlank(a.clarification_question)
    );
    if (actionable.length === 0) {
      issues.push({
        section: "ambiguity",
        severity: "warning",
        message: "Decision is MISSING_INFO but no ambiguity has an unresolved clarification question",
      });
    }
  }

  // STUCK implies a non-empty rationale
  if (decision === "STUCK") {
    const rationale = corrected.output_decision_maker?.rationale ?? "";
    if (isBlank(rationale)) {
      issues.push({
        section: "ambiguity",
        severity: "warning",
        message: "Decision is STUCK but no rationale is provided",
      });
    }
  }
}
