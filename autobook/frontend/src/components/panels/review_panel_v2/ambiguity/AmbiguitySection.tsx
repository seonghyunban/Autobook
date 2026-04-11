import { ReviewSectionLayout } from "../shared/ReviewSectionLayout";
import { useDraftStore } from "../../store";
import { AmbiguityFields } from "./AmbiguityFields";

export function AmbiguitySection({ index }: { index: number }) {
  const ambiguityId = useDraftStore((st) =>
    st.corrected.output_decision_maker?.ambiguities?.[index]?.id ?? ""
  );

  if (!ambiguityId) return null;

  return (
    <ReviewSectionLayout>
      <AmbiguityFields id={ambiguityId} />
    </ReviewSectionLayout>
  );
}
