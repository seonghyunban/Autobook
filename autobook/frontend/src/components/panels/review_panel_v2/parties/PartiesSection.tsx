import { ReviewSectionLayout } from "../shared/ReviewSectionLayout";
import { ReviewSubsection } from "../shared/ReviewSubsection";
import { TransactionGraph } from "../shared/TransactionGraph";
import { ReportingEntity } from "./ReportingEntity";
import { PartiesList } from "./PartiesList";

export function PartiesSection() {
  return (
    <ReviewSectionLayout
      header={<TransactionGraph />}
      notesKey="transactionAnalysis"
      notesPlaceholder="Any additional notes about the transaction structure — such as missing parties, incorrect relationships, or value flow errors."
    >
      <ReviewSubsection title="Parties Involved" explanation="Rename, add, or remove parties involved in this transaction.">
        <ReportingEntity />
        <PartiesList />
      </ReviewSubsection>
    </ReviewSectionLayout>
  );
}
