/**
 * Tax section (conditional: corrected decision = PROCEED).
 * Header: —
 * Body: Tax fields (attempted vs corrected)
 * Footer: Notes (tax)
 */
import { ReviewSectionLayout } from "../shared/ReviewSectionLayout";
// TODO: extract TaxFields from TaxReviewContainer

export function TaxSection() {
  return (
    <ReviewSectionLayout
      notesKey="tax"
      notesPlaceholder="Any additional notes about the tax treatment."
    >
      {/* TODO: wire TaxFields */}
      <div>Tax fields placeholder</div>
    </ReviewSectionLayout>
  );
}
