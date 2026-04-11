/**
 * Entry section (conditional: corrected decision = PROCEED).
 * Body: Editable entry table (attempted vs corrected) with reason field.
 * Footer: Notes (finalEntry)
 *
 * Does NOT include DebitCreditRelationshipView — that lives in RelationshipSection.
 */
import { useEffect, useState } from "react";
import { SectionSubheader } from "../../shared/SectionSubheader";
import { palette, T, entryColors, attemptedEntryColors, CURRENCY_SYM } from "../../shared/tokens";
import { ReviewTextField } from "../../shared/ReviewTextField";
import { DashedArrow } from "../../shared/DashedArrow";
import { EntryTable } from "../../entry_panel/EntryPanel";
import type { JournalLine } from "../../../../api/types";
import { getTaxonomy } from "../../../../api/taxonomy";
import type { TaxonomyDict } from "../../../../api/taxonomy";
import { useDraftStore } from "../../store";
import { ReviewSectionLayout } from "../shared/ReviewSectionLayout";
import { AttemptedCorrectedLabels } from "../shared/AttemptedCorrectedLabels";
import { CorrectedActionBar } from "../shared/CorrectedActionBar";
import { ReviewSubsection } from "../shared/ReviewSubsection";

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
    <div style={{ display: "flex", gap: 0, alignItems: "stretch" }}>
      {/* Attempted */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, padding: "8px 10px", minWidth: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <SectionSubheader style={{ fontSize: 10 }}>Entry</SectionSubheader>
          <EntryTable lines={data.lines} currencySymbol={sym} minRows={0} colors={attemptedEntryColors} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <SectionSubheader style={{ fontSize: 10 }}>Reason</SectionSubheader>
          <ReviewTextField
            value={data.reason}
            bg={{
              display: { background: T.attemptedSupplement, borderRadius: 3 },
              editing: { background: T.attemptedSupplement, borderRadius: 3 },
            }}
            style={{ fontSize: 11, color: T.textSecondary, fontStyle: "italic", padding: "4px 6px" }}
          />
        </div>
        <div style={{ height: 18 }} />
      </div>
      {/* Arrow */}
      <DashedArrow label={arrowLabel} color={arrowColor} />
      {/* Corrected */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, minWidth: 0, padding: "8px 10px", borderRadius: 4 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <SectionSubheader style={{ fontSize: 10 }}>Entry</SectionSubheader>
          <EntryTable
            lines={correctedLines}
            currencySymbol={sym}
            colors={changed ? entryColors : attemptedEntryColors}
            editable
            lineKeys={lineKeys}
            onLineChange={onLineChange}
            onAddLine={onAddLine}
            onDeleteLine={onDeleteLine}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <SectionSubheader style={{ fontSize: 10 }}>Reason</SectionSubheader>
          <ReviewTextField
            value={correctedReason}
            onChange={onReasonChange}
            bg={{
              display: { background: suppBgCorrected, borderRadius: 3 },
              editing: { background: suppBgCorrected, borderRadius: 3 },
            }}
            style={{ fontSize: 11, color: corrSubColor, fontStyle: "italic", padding: "4px 6px" }}
          />
        </div>
        <CorrectedActionBar variant={changed ? "corrected" : "attempted"} actions={[
          { label: "Reset", onClick: onReset },
        ]} />
      </div>
    </div>
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

  // Mutation helpers — write through the store
  function mutateEntry(updater: (entry: { reason: string; currency: string; lines: JournalLine[]; currency_symbol?: string }) => void) {
    setCorrected((draft) => {
      const target = draft.output_entry_drafter;
      if (!target) return;
      updater(target);
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
    <ReviewSectionLayout notesKey="finalEntry"
      notesPlaceholder="Any additional notes about the final entry — such as incorrect accounts, wrong amounts, or missing lines."
    >
      <ReviewSubsection title="Final Entry">
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
