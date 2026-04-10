import { useMemo } from "react";
import { useLLMInteractionStore } from "../../store";
import { validateCorrected } from "../validation";
import { REVIEW_SECTIONS } from "../ReviewPanel";
import { ValidationBanner } from "./ValidationBanner";
import { SummaryBody } from "./SummaryBody";
import { summaryTokens } from "./tokens";

/**
 * Step 5 of the review modal: the Correction Summary.
 *
 * - Reads `corrected` from the Zustand store (single source of truth).
 * - Derives active sections from the decision (PROCEED → all, else → graph + ambiguity).
 * - Runs `validateCorrected` via useMemo; re-runs only when corrected changes.
 * - Banner always renders; summary body is gated by errors.
 */
export function CorrectionSummaryContainer() {
  const corrected = useLLMInteractionStore((st) => st.corrected);
  const decision = useLLMInteractionStore((st) => st.attempted.decision);
  const activeSections = useMemo(
    () => decision === "PROCEED" || !decision
      ? REVIEW_SECTIONS
      : REVIEW_SECTIONS.filter((s) => s.key === "transaction_analysis" || s.key === "ambiguity"),
    [decision],
  );
  const issues = useMemo(() => validateCorrected(corrected, activeSections), [corrected, activeSections]);
  const hasErrors = issues.some((i) => i.severity === "error");

  return (
    <div style={summaryTokens.container}>
      <ValidationBanner issues={issues} />
      {!hasErrors && <SummaryBody />}
    </div>
  );
}
