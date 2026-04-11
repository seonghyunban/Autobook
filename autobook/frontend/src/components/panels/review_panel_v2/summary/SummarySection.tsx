/**
 * Summary section (always visible).
 * Header: Validation banner
 * Body: Summary fields per section (gated by no errors)
 * Footer: none
 */
import { useMemo } from "react";
import { useDraftStore } from "../../store";
import { validateCorrected } from "../../review_panel/validation";
import { REVIEW_SECTIONS } from "../../review_panel/ReviewPanel";
import { ValidationBanner } from "../../review_panel/CorrectionSummary/ValidationBanner";
import { SummaryBody } from "../../review_panel/CorrectionSummary/SummaryBody";
import { summaryTokens } from "../../review_panel/CorrectionSummary/tokens";
import { ReviewSectionLayout } from "../shared/ReviewSectionLayout";

export function SummarySection() {
  const corrected = useDraftStore((st) => st.corrected);
  const decision = useDraftStore((st) => st.attempted.decision);
  const activeSections = useMemo(
    () => decision === "PROCEED" || !decision
      ? REVIEW_SECTIONS
      : REVIEW_SECTIONS.filter((s) => s.key === "transaction_analysis" || s.key === "ambiguity"),
    [decision],
  );
  const issues = useMemo(() => validateCorrected(corrected, activeSections), [corrected, activeSections]);
  const hasErrors = issues.some((i) => i.severity === "error");

  return (
    <ReviewSectionLayout>
      <div style={summaryTokens.container}>
        <ValidationBanner issues={issues} />
        {!hasErrors && <SummaryBody />}
      </div>
    </ReviewSectionLayout>
  );
}
