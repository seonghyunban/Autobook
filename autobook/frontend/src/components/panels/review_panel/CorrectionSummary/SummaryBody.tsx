import { TransactionSummary } from "./sections/TransactionSummary";
import { AmbiguitySummary } from "./sections/AmbiguitySummary";
import { TaxSummary } from "./sections/TaxSummary";
import { FinalEntrySummary } from "./sections/FinalEntrySummary";

/**
 * Read-only summary of the corrected state.
 *
 * Each section reads its own slice from the store — no props, no coordination
 * at this level. SummaryBody is just the composition order of the 4 sections.
 *
 * Only rendered by CorrectionSummaryContainer when validation has no errors.
 */
export function SummaryBody() {
  return (
    <>
      <TransactionSummary />
      <AmbiguitySummary />
      <TaxSummary />
      <FinalEntrySummary />
    </>
  );
}
