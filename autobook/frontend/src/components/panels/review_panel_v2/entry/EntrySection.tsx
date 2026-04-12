/**
 * Entry section (conditional: corrected decision = PROCEED).
 * Body: Editable entry table (attempted vs corrected) with reason field.
 * Footer: Notes (entry)
 *
 * Does NOT include DebitCreditRelationshipView — that lives in RelationshipSection.
 */
import { useEffect, useState } from "react";
import { SectionSubheader } from "../../shared/SectionSubheader";
import { palette, T, entryColors, attemptedEntryColors, CURRENCY_SYM } from "../../shared/tokens";
import { ReviewTextField } from "../../shared/ReviewTextField";
import { EntryTable } from "../../entry_panel/EntryPanel";
import { AttemptedCorrectedRow } from "../shared/AttemptedCorrectedRow";
import type { JournalLine } from "../../../../api/types";
import { getTaxonomy } from "../../../../api/taxonomy";
import type { TaxonomyDict } from "../../../../api/taxonomy";
import { useDraftStore } from "../../store";
import { ReviewSectionLayout } from "../shared/ReviewSectionLayout";
import { AttemptedCorrectedLabels } from "../shared/AttemptedCorrectedLabels";
import { CorrectedActionBar } from "../shared/CorrectedActionBar";
import { ReviewSubsection } from "../shared/ReviewSubsection";
import { ProximityProvider } from "../../shared/ProximityContext";

// ── Types ───────────────────────────────────────────────

type EntryData = {
  reason: string;
  currency: string;
  lines: JournalLine[];
};

// ── Line-id helper ──────────────────────────────────────

let _newLineCounter = 0;
function newLineId(): string {
  _newLineCounter += 1;
  return `l-new-${Date.now()}-${_newLineCounter}`;
}

// ── FinalEntryItemView (controlled) ─────────────────────

function FinalEntryItemView({ data, correctedLines, lineKeys, correctedReason, changed, sym, onLineChange, onAddLine, onDeleteLine, onReasonChange, onReset }: {
  data: EntryData;
  correctedLines: JournalLine[];
  lineKeys: string[];
  correctedReason: string;
  changed: boolean;
  sym: string;
  onLineChange: (i: number, line: JournalLine) => void;
  onAddLine: (i: number) => void;
  onDeleteLine: (i: number) => void;
  onReasonChange: (reason: string) => void;
  onReset: () => void;
}) {
  const arrowColor = changed ? palette.fern : palette.charcoalBrown;
  const arrowLabel = changed ? "Update" : "Keep";
  const suppBgCorrected = changed ? T.correctedSupplement : T.attemptedSupplement;
  const corrSubColor = T.textSecondary;

  return (
    <AttemptedCorrectedRow
      changed={changed}
      attempted={
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 20, height: "100%" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <SectionSubheader style={{ fontSize: 10 }}>Entry</SectionSubheader>
            <EntryTable lines={data.lines} currencySymbol={sym} minRows={0} colors={attemptedEntryColors} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <SectionSubheader style={{ fontSize: 10 }}>Reason</SectionSubheader>
            <ReviewTextField value={data.reason} />
          </div>
          <div style={{ height: 18 }} />
        </div>
      }
      corrected={
        <ProximityProvider>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 20, borderRadius: 4 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <SectionSubheader style={{ fontSize: 10 }}>Entry</SectionSubheader>
            <EntryTable
              lines={correctedLines}
              currencySymbol={sym}
              colors={entryColors}
              editable
              lineKeys={lineKeys}
              onLineChange={onLineChange}
              onAddLine={onAddLine}
              onDeleteLine={onDeleteLine}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <SectionSubheader style={{ fontSize: 10 }}>Reason</SectionSubheader>
            <ReviewTextField value={correctedReason} onChange={onReasonChange} />
          </div>
          <CorrectedActionBar variant={changed ? "corrected" : "attempted"} actions={[
            { label: "Reset", onClick: onReset },
          ]} />
        </div>
        </ProximityProvider>
      }
    />
  );
}

// ── EntrySection ────────────────────────────────────────

export function EntrySection() {
  const attemptedEntry = useDraftStore(
    (st) => st.attempted.output_entry_drafter
  );
  const correctedEntry = useDraftStore(
    (st) => st.corrected.output_entry_drafter
  );
  const setCorrected = useDraftStore((st) => st.setCorrected);

  const attemptedData: EntryData = attemptedEntry
    ? { reason: attemptedEntry.reason, currency: attemptedEntry.currency || "CAD", lines: attemptedEntry.lines }
    : { reason: "", currency: "CAD", lines: [] };
  const correctedLines: JournalLine[] = correctedEntry?.lines ?? [];
  const correctedReason: string = correctedEntry?.reason ?? "";

  // The line.id field IS the React key now — no separate `lineKeys` state.
  const lineKeys = correctedLines.map((l) => l.id ?? "");
  const jurisdiction = useDraftStore((st) => st.attempted.jurisdiction);
  const [taxonomyDict, setTaxonomyDict] = useState<TaxonomyDict>({});

  useEffect(() => {
    getTaxonomy(jurisdiction).then(setTaxonomyDict).catch(() => {});
  }, [jurisdiction]);

  const sym = CURRENCY_SYM[attemptedData.currency] || "";
  const changed = correctedReason !== attemptedData.reason
    || JSON.stringify(correctedLines) !== JSON.stringify(attemptedData.lines);

  // Mutation helpers — write through the store.
  // On first entry change (lines differ but reason still matches attempted),
  // wipe the reason so the user writes a fresh one.
  function mutateEntry(updater: (entry: { reason: string; currency: string; lines: JournalLine[]; currency_symbol?: string }) => void) {
    setCorrected((draft) => {
      const target = draft.output_entry_drafter;
      if (!target) return;
      const attemptedReason = useDraftStore.getState().attempted.output_entry_drafter?.reason ?? "";
      const shouldWipeReason = target.reason === attemptedReason;
      updater(target);
      if (shouldWipeReason) {
        target.reason = "";
      }
    });
  }

  function handleReset() {
    setCorrected((draft) => {
      const attempted = useDraftStore.getState().attempted;
      const source = attempted.output_entry_drafter;
      const target = draft.output_entry_drafter;
      if (!source || !target) return;
      target.reason = source.reason;
      target.currency = source.currency;
      target.lines = structuredClone(source.lines);
      // Reset the per-line debit/credit relationship maps too
      draft.debit_relationship = structuredClone(attempted.debit_relationship);
      draft.credit_relationship = structuredClone(attempted.credit_relationship);
    });
  }

  function handleAddLine(index: number) {
    const newLine: JournalLine = { id: newLineId(), account_code: "", account_name: "", type: "debit", amount: 0 };
    mutateEntry((entry) => {
      entry.lines.splice(index, 0, newLine);
    });
  }

  function handleDeleteLine(index: number) {
    setCorrected((draft) => {
      const target = draft.output_entry_drafter;
      if (!target) return;
      const removed = target.lines[index];
      target.lines.splice(index, 1);
      // Drop the corresponding classification from both buckets (it lives
      // in only one, but checking both is harmless and avoids a branch).
      if (removed?.id) {
        delete draft.debit_relationship[removed.id];
        delete draft.credit_relationship[removed.id];
      }
    });
  }

  function handleLineChange(i: number, line: JournalLine) {
    setCorrected((draft) => {
      const target = draft.output_entry_drafter;
      if (!target) return;
      const oldLine = target.lines[i];
      const id = oldLine?.id ?? line.id;
      // If the line's debit/credit type flipped, move its classification
      // between the two relationship buckets so it stays aligned with the
      // line's current type.
      if (id && oldLine && oldLine.type !== line.type) {
        const fromBucket = oldLine.type === "debit" ? draft.debit_relationship : draft.credit_relationship;
        const toBucket = line.type === "debit" ? draft.debit_relationship : draft.credit_relationship;
        const cls = fromBucket[id];
        if (cls) {
          delete fromBucket[id];
          toBucket[id] = cls;
        }
      }
      target.lines[i] = { ...line, id };
    });
  }

  function handleReasonChange(reason: string) {
    mutateEntry((entry) => {
      entry.reason = reason;
    });
  }

  return (
    <ReviewSectionLayout notesKey="entry"
      notesPlaceholder="Any additional notes about the final entry — such as incorrect accounts, wrong amounts, or missing lines."
    >
      <ReviewSubsection title="Final Entry" explanation="Review the journal entry and reason drafted by the agent. Edit accounts, amounts, or add/remove lines.">
        <AttemptedCorrectedLabels />
        <FinalEntryItemView
          data={attemptedData}
          correctedLines={correctedLines}
          lineKeys={lineKeys}
          correctedReason={correctedReason}
          changed={changed}
          sym={sym}
          onLineChange={handleLineChange}
          onAddLine={handleAddLine}
          onDeleteLine={handleDeleteLine}
          onReasonChange={handleReasonChange}
          onReset={handleReset}
        />
      </ReviewSubsection>
    </ReviewSectionLayout>
  );
}
