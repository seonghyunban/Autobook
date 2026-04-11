/**
 * Summary section (always visible).
 * Header: Validation banner
 * Body: Summary fields per section (gated by no errors)
 * Footer: none
 */
import { useMemo } from "react";
import { useDraftStore } from "../../store";
import { validateCorrected } from "../validation";
import { ValidationBanner } from "./CorrectionSummary/ValidationBanner";
import { SummaryBody } from "./CorrectionSummary/SummaryBody";
import { summaryTokens } from "./CorrectionSummary/tokens";
import { ReviewSectionLayout } from "../shared/ReviewSectionLayout";

export function SummarySection() {
  const corrected = useDraftStore((st) => st.corrected);
  const decision = useDraftStore((st) => st.attempted.decision);
  const activeSections = useMemo(
    () => decision === "PROCEED" || !decision
      ? [{ key: "transaction_analysis" }, { key: "ambiguity" }, { key: "tax" }, { key: "final_entry" }]
      : [{ key: "transaction_analysis" }, { key: "ambiguity" }],
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
