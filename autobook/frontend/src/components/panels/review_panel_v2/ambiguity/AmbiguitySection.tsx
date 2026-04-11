import { ReviewSectionLayout } from "../shared/ReviewSectionLayout";
import { AmbiguityFields } from "./AmbiguityFields";

export function AmbiguitySection({ ambiguityId = "" }: { ambiguityId?: string }) {
  if (!ambiguityId) return null;
  return (
    <ReviewSectionLayout notesKey={`ambiguity-${ambiguityId}`} notesPlaceholder="Any additional notes about this ambiguity.">
      <AmbiguityFields id={ambiguityId} />
    </ReviewSectionLayout>
  );
}
