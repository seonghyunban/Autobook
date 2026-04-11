/**
 * D/C Relationship section (conditional: corrected decision = PROCEED).
 * Header: —
 * Body: Per-line classification dropdowns (driven by corrected entry lines)
 * Footer: —
 */
import { ReviewSectionLayout } from "../shared/ReviewSectionLayout";
// TODO: extract DebitCreditRelationshipView from ReviewPanel.tsx

export function RelationshipSection() {
  return (
    <ReviewSectionLayout>
      {/* TODO: wire DebitCreditRelationshipView */}
      <div>D/C Relationship placeholder</div>
    </ReviewSectionLayout>
  );
}
