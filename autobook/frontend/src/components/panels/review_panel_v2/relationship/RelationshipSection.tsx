/**
 * D/C Relationship section (conditional: corrected decision = PROCEED).
 * Body: Per-line classification dropdowns (driven by corrected entry lines).
 * Footer: none
 */
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { palette, entryColors, attemptedEntryColors, CURRENCY_SYM } from "../../shared/tokens";
import { DashedArrow } from "../../shared/DashedArrow";
import { DropdownSelect } from "../../shared/DropdownSelect";
import { EntryHeader, EntryRow, EntryTotalRow } from "../../entry_panel/EntryPanel";
import type { JournalLine, LineDcClassification } from "../../../../api/types";
import { getTaxonomy } from "../../../../api/taxonomy";
import type { TaxonomyDict } from "../../../../api/taxonomy";
import { useDraftStore } from "../../store";
import { useShallow } from "zustand/react/shallow";
import { ReviewSectionLayout } from "../shared/ReviewSectionLayout";
import { ReviewSubsection } from "../shared/ReviewSubsection";
import type { EntryColorTheme } from "../../shared/tokens";

// ── Constants ───────────────────────────────────────────

const ACCOUNT_TYPES = ["Asset", "Liability", "Equity", "Revenue", "Expense"];
const DIRECTIONS = ["Increase", "Decrease"];

// ── DebitCreditRelationshipView ─────────────────────────

function DebitCreditRelationshipView({ lines, lineKeys, currencySymbol, colors, taxonomyDict }: {
  lines: JournalLine[];
  lineKeys: string[];
  currencySymbol: string;
  colors: EntryColorTheme;
  taxonomyDict: TaxonomyDict;
}) {
  // Per-line D/C classifications live in two parallel maps on `corrected`,
  // split by the line's debit/credit type. Each line's classification is
  // looked up in the map matching its current type — see `getCell` and
  // `updateCell` below.
  const debitRel = useDraftStore(
    useShallow((st) => st.corrected.debit_relationship)
  );
  const creditRel = useDraftStore(
    useShallow((st) => st.corrected.credit_relationship)
  );
  const setCorrected = useDraftStore((st) => st.setCorrected);

  const getCell = (line: JournalLine): LineDcClassification => {
    if (!line.id) return { type: null, direction: null, taxonomy: null };
    const bucket = line.type === "debit" ? debitRel : creditRel;
    return bucket[line.id] ?? { type: null, direction: null, taxonomy: null };
  };

  const updateCell = (line: JournalLine, patch: Partial<LineDcClassification>) => {
    if (!line.id) return;
    setCorrected((draft) => {
      const bucket = line.type === "debit" ? draft.debit_relationship : draft.credit_relationship;
      const current = bucket[line.id!] ?? { type: null, direction: null, taxonomy: null };
      bucket[line.id!] = { ...current, ...patch };
    });
  };
  const rightCellStyle: React.CSSProperties = { padding: "8px 10px", borderRadius: 4, fontSize: 13, color: "rgba(37, 36, 34, 0.8)", background: "rgba(204, 197, 185, 0.15)", flex: 1, textAlign: "center", minHeight: 28, minWidth: 0 };
  const rightHeaderStyle: React.CSSProperties = { ...rightCellStyle, fontWeight: 600, color: "rgba(37, 36, 34, 0.9)", fontSize: 13, minHeight: undefined };

  const dur = 0.15;
  const outerInitial = { height: 0, overflow: "hidden" as const };
  const outerAnimate = { height: "auto", overflow: "visible" as const, transition: { duration: dur, ease: "easeOut" as const } };
  const outerExit = { height: 0, overflow: "hidden" as const, transition: { duration: dur, delay: dur, ease: "easeOut" as const } };
  const innerInitial = { opacity: 0 };
  const innerAnimate = { opacity: 1, transition: { duration: dur, delay: dur, ease: "easeOut" as const } };
  const innerExit = { opacity: 0, transition: { duration: dur, ease: "easeOut" as const } };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {/* Header */}
      <div style={{ display: "flex", gap: 0, alignItems: "stretch" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <EntryHeader colors={colors} />
        </div>
        <div style={{ width: 100, flexShrink: 0 }} />
        {(() => {
          const allFilled = lines.length > 0 && lines.every((line) => {
            const cell = getCell(line);
            return cell.type && cell.direction && cell.taxonomy;
          });
          const headerBg = allFilled ? "rgba(79, 119, 45, 0.7)" : rightHeaderStyle.background;
          return (
            <div style={{ flex: 1, display: "flex", gap: 5, minWidth: 0 }}>
              <div style={{ ...rightHeaderStyle, background: headerBg }}>Type</div>
              <div style={{ ...rightHeaderStyle, background: headerBg }}>Direction</div>
              <div style={{ ...rightHeaderStyle, background: headerBg }}>Taxonomy</div>
            </div>
          );
        })()}
      </div>
      {/* Rows */}
      <AnimatePresence initial={false}>
        {lines.map((line, i) => {
          const key = lineKeys[i];
          const cell = getCell(line);
          return (
          <motion.div key={key} initial={outerInitial} animate={outerAnimate} exit={outerExit}>
            <motion.div initial={innerInitial} animate={innerAnimate} exit={innerExit}
              style={{ display: "flex", gap: 0, alignItems: "stretch" }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <EntryRow line={line} index={i} currencySymbol={currencySymbol} colors={colors} />
              </div>
              <DashedArrow label="" color={palette.silver} />
              <div style={{ flex: 1, display: "flex", gap: 5, minWidth: 0 }}>
                <div style={{ ...rightCellStyle, background: cell.type ? "rgba(79, 119, 45, 0.15)" : rightCellStyle.background, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <DropdownSelect
                    value={cell.type}
                    options={ACCOUNT_TYPES}
                    placeholder="Select ..."
                    onChange={(v) => updateCell(line, { type: v, taxonomy: null })}
                    style={{ width: "100%" }}
                  />
                </div>
                <div style={{ ...rightCellStyle, background: cell.direction ? "rgba(79, 119, 45, 0.15)" : rightCellStyle.background, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <DropdownSelect
                    value={cell.direction}
                    options={DIRECTIONS}
                    placeholder="Select ..."
                    onChange={(v) => updateCell(line, { direction: v })}
                    style={{ width: "100%" }}
                  />
                </div>
                <div style={{ ...rightCellStyle, background: cell.taxonomy ? "rgba(79, 119, 45, 0.15)" : rightCellStyle.background, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <DropdownSelect
                    value={cell.taxonomy}
                    options={taxonomyDict[(cell.type ?? "").toLowerCase()] ?? []}
                    placeholder={cell.type ? "Select ..." : "Select type first"}
                    onChange={(v) => updateCell(line, { taxonomy: v })}
                    allowNew
                    style={{ width: "100%" }}
                  />
                </div>
              </div>
            </motion.div>
          </motion.div>
          );
        })}
      </AnimatePresence>
      {/* Total row (left side only) */}
      <div style={{ display: "flex", gap: 0, alignItems: "stretch" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <EntryTotalRow lines={lines} currencySymbol={currencySymbol} colors={colors} />
        </div>
        <div style={{ width: 100, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }} />
      </div>
    </div>
  );
}

// ── RelationshipSection ─────────────────────────────────

export function RelationshipSection() {
  const correctedEntry = useDraftStore(
    (st) => st.corrected.output_entry_drafter
  );
  const attemptedEntry = useDraftStore(
    (st) => st.attempted.output_entry_drafter
  );
  const jurisdiction = useDraftStore((st) => st.attempted.jurisdiction);
  const [taxonomyDict, setTaxonomyDict] = useState<TaxonomyDict>({});

  useEffect(() => {
    getTaxonomy(jurisdiction).then(setTaxonomyDict).catch(() => {});
  }, [jurisdiction]);

  const correctedLines: JournalLine[] = correctedEntry?.lines ?? [];
  const lineKeys = correctedLines.map((l) => l.id ?? "");

  const attemptedData = attemptedEntry
    ? { reason: attemptedEntry.reason, currency: attemptedEntry.currency || "CAD", lines: attemptedEntry.lines }
    : { reason: "", currency: "CAD", lines: [] as JournalLine[] };
  const correctedReason: string = correctedEntry?.reason ?? "";

  const sym = CURRENCY_SYM[attemptedData.currency] || "";
  const changed = correctedReason !== attemptedData.reason
    || JSON.stringify(correctedLines) !== JSON.stringify(attemptedData.lines);

  return (
    <ReviewSectionLayout notesKey="relationship" notesPlaceholder="Any additional notes about the debit/credit classification.">
      <ReviewSubsection title="D/C Relationship" explanation="Classify each journal line by account type, direction, and taxonomy category.">
        <DebitCreditRelationshipView
          lines={correctedLines}
          lineKeys={lineKeys}
          currencySymbol={sym}
          colors={changed ? entryColors : attemptedEntryColors}
          taxonomyDict={taxonomyDict}
        />
      </ReviewSubsection>
    </ReviewSectionLayout>
  );
}
