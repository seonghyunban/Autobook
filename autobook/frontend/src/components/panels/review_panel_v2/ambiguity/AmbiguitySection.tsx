/**
 * Single ambiguity step (index-parameterized).
 * Header: Aspect name
 * Body: Attempted vs corrected fields
 * Footer: —
 */
import { ReviewSectionLayout } from "../shared/ReviewSectionLayout";
import { ReviewSubsection } from "../shared/ReviewSubsection";
import { useDraftStore } from "../../store";

export function AmbiguitySection({ index }: { index: number }) {
  const aspect = useDraftStore((st) =>
    st.corrected.output_decision_maker?.ambiguities?.[index]?.aspect ?? `Ambiguity ${index + 1}`
  );

  return (
    <ReviewSectionLayout>
      <ReviewSubsection title={aspect}>
        {/* TODO: extract AmbiguityFields from AmbiguityReviewContainer */}
        <div>Ambiguity fields placeholder for index {index}</div>
      </ReviewSubsection>
    </ReviewSectionLayout>
  );
}
