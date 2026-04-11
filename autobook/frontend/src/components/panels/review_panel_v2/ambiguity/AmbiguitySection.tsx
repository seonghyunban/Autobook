import { ReviewSectionLayout } from "../shared/ReviewSectionLayout";
import { AmbiguityFields } from "./AmbiguityFields";

export function AmbiguitySection({ ambiguityId = "" }: { ambiguityId?: string }) {
  if (!ambiguityId) return null;
  return (
    <ReviewSectionLayout>
      <AmbiguityFields id={ambiguityId} />
    </ReviewSectionLayout>
  );
}
