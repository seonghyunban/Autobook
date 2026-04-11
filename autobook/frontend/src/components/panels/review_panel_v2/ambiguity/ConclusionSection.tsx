/**
 * Ambiguity Conclusion step.
 * Header: —
 * Body: Decision view (attempted vs corrected decision + rationale)
 * Footer: Notes (ambiguity)
 */
import { ReviewSectionLayout } from "../shared/ReviewSectionLayout";
// TODO: extract DecisionItemView from ReviewPanel.tsx

export function ConclusionSection() {
  return (
    <ReviewSectionLayout
      notesKey="ambiguity"
      notesPlaceholder="Any additional notes about ambiguities or the decision."
    >
      {/* TODO: wire DecisionItemView */}
      <div>Conclusion placeholder</div>
    </ReviewSectionLayout>
  );
}
