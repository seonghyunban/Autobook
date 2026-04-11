/**
 * Entry section (conditional: corrected decision = PROCEED).
 * Header: —
 * Body: Editable entry table
 * Footer: Notes (finalEntry)
 */
import { ReviewSectionLayout } from "../shared/ReviewSectionLayout";
// TODO: extract entry table logic from FinalEntryReviewContainer

export function EntrySection() {
  return (
    <ReviewSectionLayout
      notesKey="finalEntry"
      notesPlaceholder="Any additional notes about the journal entry."
    >
      {/* TODO: wire entry table */}
      <div>Entry table placeholder</div>
    </ReviewSectionLayout>
  );
}
