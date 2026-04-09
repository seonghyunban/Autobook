import type { ValidationIssue, Section } from "../validation";
import { summaryTokens } from "./tokens";

const SECTION_LABELS: Record<Section, string> = {
  transaction: "Transaction",
  ambiguity: "Ambiguity",
  tax: "Tax",
  entry: "Entry",
};

/**
 * Banner shown at the top of the Correction Summary step.
 *
 * Three states:
 *   - Errors present  → red bar, lists errors (summary body hidden by parent)
 *   - Warnings only   → orange bar, lists warnings (summary body shown by parent)
 *   - Clean           → green bar, "All checks passed" (summary body shown by parent)
 */
export function ValidationBanner({ issues }: { issues: ValidationIssue[] }) {
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  if (errors.length === 0 && warnings.length === 0) {
    return (
      <div style={{ ...summaryTokens.bannerBase, ...summaryTokens.bannerClean }}>
        <span style={summaryTokens.bannerTitle}>✓ All checks passed — ready to submit</span>
      </div>
    );
  }

  if (errors.length > 0) {
    return (
      <div style={{ ...summaryTokens.bannerBase, ...summaryTokens.bannerError }}>
        <span style={summaryTokens.bannerTitle}>
          {errors.length} {errors.length === 1 ? "error" : "errors"} must be fixed before submitting
        </span>
        <IssueList issues={errors} />
        {warnings.length > 0 && (
          <span style={{ fontSize: 12, opacity: 0.8 }}>
            Plus {warnings.length} warning{warnings.length === 1 ? "" : "s"}.
          </span>
        )}
      </div>
    );
  }

  // Warnings only
  return (
    <div style={{ ...summaryTokens.bannerBase, ...summaryTokens.bannerWarning }}>
      <span style={summaryTokens.bannerTitle}>
        {warnings.length} warning{warnings.length === 1 ? "" : "s"} — review before submitting
      </span>
      <IssueList issues={warnings} />
    </div>
  );
}

function IssueList({ issues }: { issues: ValidationIssue[] }) {
  return (
    <ul style={summaryTokens.bannerList}>
      {issues.map((issue, i) => (
        <li key={i}>
          <span style={summaryTokens.sectionTag}>{SECTION_LABELS[issue.section]}</span>
          {issue.message}
        </li>
      ))}
    </ul>
  );
}
