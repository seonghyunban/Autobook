/**
 * Validation types shared by all rule modules and the banner.
 *
 * - Severity "error" blocks the summary body from rendering.
 * - Severity "warning" allows the summary but is displayed in the banner.
 */
export type Severity = "error" | "warning";

export type Section = "transaction" | "ambiguity" | "tax" | "entry";

export type ValidationIssue = {
  section: Section;
  severity: Severity;
  message: string;
};
