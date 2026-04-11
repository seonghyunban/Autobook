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
      <ReviewSubsection title="Reporting Entity">
        <ReportingEntity />
      </ReviewSubsection>
      <ReviewSubsection title="Parties Involved">
        <PartiesList />
      </ReviewSubsection>
    </ReviewSectionLayout>
  );
}
