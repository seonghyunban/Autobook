import { useMemo } from "react";
import { useLLMInteractionStore } from "../../store";
import { validateCorrected } from "../validation";
import { ValidationBanner } from "./ValidationBanner";
import { SummaryBody } from "./SummaryBody";
import { summaryTokens } from "./tokens";

/**
 * Step 5 of the review modal: the Correction Summary.
 *
 * - Reads `corrected` from the Zustand store (single source of truth).
 * - Runs `validateCorrected` via useMemo; re-runs only when corrected changes.
 * - Banner always renders; summary body is gated by errors.
 */
export function CorrectionSummaryContainer() {
  const corrected = useLLMInteractionStore((st) => st.corrected);
  const issues = useMemo(() => validateCorrected(corrected), [corrected]);
  const hasErrors = issues.some((i) => i.severity === "error");

  return (
    <div style={summaryTokens.container}>
      <ValidationBanner issues={issues} />
      {!hasErrors && <SummaryBody />}
    </div>
  );
}
