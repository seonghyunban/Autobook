/**
 * Parties Involved section.
 * Header: Transaction graph
 * Body: Reporting Entity + Direct Parties + Indirect Parties
 * Footer: Notes (transactionAnalysis)
 */
import { ReviewSectionLayout } from "../shared/ReviewSectionLayout";
import { ReviewSubsection } from "../shared/ReviewSubsection";
import { TransactionGraph } from "../shared/TransactionGraph";
import { ReportingEntity } from "./ReportingEntity";
// TODO: import DirectParties and IndirectParties once extracted
// For now, reuse the existing PartiesInvolvedItemView from review_panel

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
      {/* TODO: split DirectParties + IndirectParties from PartiesInvolvedItemView */}
    </ReviewSectionLayout>
  );
}
