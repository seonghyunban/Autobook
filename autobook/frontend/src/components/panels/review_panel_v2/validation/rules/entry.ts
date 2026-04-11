import type {
  HumanCorrectedTrace,
  JournalLine,
  RelationshipMap,
} from "../../../../../api/types";
import type { ValidationIssue } from "../types";
import { isBlank, isFiniteNumber, approxEqual } from "../helpers";

/**
 * Validates the final journal entry: top-level reason/currency, lines,
 * per-line fields, balance, and the per-line debit/credit relationship
 * the user assigned in the Final Entry review step.
 */
export function validateEntry(corrected: HumanCorrectedTrace, issues: ValidationIssue[]): void {
  const entry = corrected.output_entry_drafter;
  if (!entry) {
    issues.push({ section: "entry", severity: "error", message: "No journal entry to submit" });
    return;
  }

  validateTopLevel(entry, issues);
  validateLines(entry.lines ?? [], issues);
  validateBalance(entry.lines ?? [], issues);
  validateDcRelationships(
    entry.lines ?? [],
    corrected.debit_relationship,
    corrected.credit_relationship,
    issues
  );
}

type EntryLike = {
  reason?: string;
  currency?: string;
  lines?: JournalLine[];
};

// ── Top-level entry fields ────────────────────────────────

function validateTopLevel(entry: EntryLike, issues: ValidationIssue[]): void {
  if (isBlank(entry.reason)) {
    issues.push({ section: "entry", severity: "warning", message: "Entry reason is empty" });
  }
  if (isBlank(entry.currency)) {
    issues.push({ section: "entry", severity: "warning", message: "Entry currency is empty" });
  }
}

// ── Per-line rules ────────────────────────────────────────

function validateLines(lines: JournalLine[], issues: ValidationIssue[]): void {
  if (lines.length === 0) {
    issues.push({ section: "entry", severity: "error", message: "Entry has no lines" });
    return;
  }

  const hasDebit = lines.some((l) => l.type === "debit");
  const hasCredit = lines.some((l) => l.type === "credit");

  if (!hasDebit) {
    issues.push({ section: "entry", severity: "error", message: "Entry has no debit line" });
  }
  if (!hasCredit) {
    issues.push({ section: "entry", severity: "error", message: "Entry has no credit line" });
  }

  lines.forEach((line, i) => {
    const label = `Line ${i + 1}`;

    if (isBlank(line.account_name)) {
      issues.push({ section: "entry", severity: "error", message: `${label}: empty account name` });
    }

    if (line.type !== "debit" && line.type !== "credit") {
      issues.push({
        section: "entry",
        severity: "error",
        message: `${label}: invalid type "${line.type}" (must be "debit" or "credit")`,
      });
    }

    if (!isFiniteNumber(line.amount)) {
      issues.push({ section: "entry", severity: "error", message: `${label}: amount is not a number` });
    } else if (line.amount <= 0) {
      issues.push({
        section: "entry",
        severity: "error",
        message: `${label}: amount ${line.amount} must be positive`,
      });
    }
  });
}

// ── Per-line debit/credit relationship ───────────────────

/**
 * Each entry line should have a complete D/C relationship: type
 * (Asset/Liability/...), direction (Increase/Decrease), and taxonomy.
 * Looked up in the debit or credit map according to the line's type.
 *
 * Reported as warnings — the entry itself can balance and submit
 * without these annotations, but the user is expected to fill them in
 * during the Final Entry review step.
 */
function validateDcRelationships(
  lines: JournalLine[],
  debitRel: RelationshipMap,
  creditRel: RelationshipMap,
  issues: ValidationIssue[]
): void {
  lines.forEach((line, i) => {
    const label = `Line ${i + 1}${line.account_name ? ` (${line.account_name})` : ""}`;
    const bucket = line.type === "debit" ? debitRel : creditRel;
    const cell = line.id ? bucket[line.id] : undefined;
    const missing: string[] = [];
    if (!cell?.type) missing.push("type");
    if (!cell?.direction) missing.push("direction");
    if (!cell?.taxonomy) missing.push("taxonomy");
    if (missing.length === 3) {
      issues.push({
        section: "entry",
        severity: "warning",
        message: `${label}: no debit/credit relationship entered`,
      });
    } else if (missing.length > 0) {
      issues.push({
        section: "entry",
        severity: "warning",
        message: `${label}: missing ${missing.join(", ")} in debit/credit relationship`,
      });
    }
  });
}

// ── Entry balance (debits === credits) ────────────────────

function validateBalance(lines: JournalLine[], issues: ValidationIssue[]): void {
  if (lines.length === 0) return; // Already flagged by validateLines

  const debits = lines
    .filter((l) => l.type === "debit" && isFiniteNumber(l.amount))
    .reduce((sum, l) => sum + l.amount, 0);
  const credits = lines
    .filter((l) => l.type === "credit" && isFiniteNumber(l.amount))
    .reduce((sum, l) => sum + l.amount, 0);

  if (!approxEqual(debits, credits)) {
    issues.push({
      section: "entry",
      severity: "error",
      message: `Entry doesn't balance: $${debits.toFixed(2)} debit vs $${credits.toFixed(2)} credit (Δ $${Math.abs(debits - credits).toFixed(2)})`,
    });
  }
}
