/**
 * Diff helpers for the review panel.
 *
 * The review panel renders two parallel traces — `attempted` (the agent's
 * output) and `corrected` (what the human says the agent should have
 * produced). Every per-row visual (background color, arrow color, label,
 * opacity) is derived from comparing the two.
 *
 * Status is *not* stored in the store. It is recomputed during render
 * from the (attempted, corrected) pair. The store only holds the data;
 * the visuals are pure functions of the data.
 *
 * For lists (graph edges, ambiguities, cases, entry lines) the diff
 * aligns items by stable id, assigned at ingest by `store.ts`.
 */
import type React from "react";
import { palette, T } from "../../shared/tokens";

// ── Status type ───────────────────────────────────────────

/**
 * Per-item or per-field status, derived from the (attempted, corrected) pair.
 *
 *   kept     — present in both, identical content
 *   updated  — present in both, content differs
 *   added    — present only in corrected (user added it)
 *   disabled — present only in attempted (user removed it)
 */
export type DiffStatus = "kept" | "updated" | "added" | "disabled";

// ── Per-status visual mapping ─────────────────────────────

const SILVER_BG = "rgba(204, 197, 185, 0.2)";

export type StatusVisual = {
  bg: string;
  arrowColor: string;
  arrowLabel: string;
  opacity: number;
};

/**
 * Single source of truth for the row visuals. The four status values
 * map to four (bg, arrowColor, arrowLabel, opacity) tuples — every
 * per-row "Keep / Update / Add / Disable" appearance flows through here.
 */
export const STATUS_VISUAL: Record<DiffStatus, StatusVisual> = {
  kept: {
    bg: SILVER_BG,
    arrowColor: palette.charcoalBrown,
    arrowLabel: "Keep",
    opacity: 1,
  },
  updated: {
    bg: T.correctedItem,
    arrowColor: palette.fern,
    arrowLabel: "Update",
    opacity: 1,
  },
  added: {
    bg: T.correctedItem,
    arrowColor: palette.fern,
    arrowLabel: "Add",
    opacity: 1,
  },
  disabled: {
    bg: SILVER_BG,
    arrowColor: palette.burntOrange,
    arrowLabel: "Disable",
    opacity: 0.5,
  },
};

// ── Generic diff helpers ──────────────────────────────────

/**
 * Compare two items (which may be undefined on either side, indicating
 * "missing from that trace") and return their status. Uses shallow
 * equality on object fields ignoring `id` — see `shallowEqualIgnoringId`
 * for the limitations. Suitable for items with only scalar fields
 * (e.g. tax). For items with nested arrays/objects (e.g. ambiguities
 * with `cases`), derive status from explicit per-field comparisons
 * instead.
 */
export function computeStatus<T extends object>(
  attempted: T | undefined,
  corrected: T | undefined
): DiffStatus {
  if (attempted == null && corrected != null) return "added";
  if (attempted != null && corrected == null) return "disabled";
  if (attempted == null && corrected == null) return "kept";
  return shallowEqualIgnoringId(attempted!, corrected!) ? "kept" : "updated";
}

/**
 * Shallow object equality. Compares own enumerable keys with `===`,
 * skipping any key named `id` (the frontend-assigned alignment id is
 * not part of the user's "correction" — only the content fields are).
 *
 * IMPORTANT: nested objects/arrays are compared by reference. After the
 * store does a `structuredClone` of attempted into corrected on ingest,
 * those nested references differ even though the content is identical —
 * which would make this function falsely report "updated". Use it only
 * on objects whose fields are all scalars; for nested shapes do explicit
 * per-field comparisons at the call site.
 */
export function shallowEqualIgnoringId<T extends object>(a: T, b: T): boolean {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const key of ka) {
    if (key === "id") continue;
    if ((a as Record<string, unknown>)[key] !== (b as Record<string, unknown>)[key]) {
      return false;
    }
  }
  return true;
}

/**
 * Get the inline style for a row given its status. Convenience wrapper
 * over STATUS_VISUAL for the common case of styling the corrected box.
 */
export function statusBoxStyle(status: DiffStatus): React.CSSProperties {
  const v = STATUS_VISUAL[status];
  return {
    background: v.bg,
    opacity: v.opacity,
    transition: "opacity 0.15s ease, background 0.15s ease",
  };
}

// ── List-level diff (used by the summary) ────────────────

export type DiffEntry<T> = {
  id: string;
  status: DiffStatus;
  attempted?: T;
  corrected?: T;
};

/**
 * Diff two lists by stable id. Returns one DiffEntry per unique id
 * across both lists, in attempted-then-added order:
 *
 *   1. For each item in attempted (in order): kept | updated | disabled
 *   2. Then each item present only in corrected: added
 *
 * Used by the Correction Summary panel which needs the full list of
 * changes. Per-row rendering inside the review modal uses single-item
 * `computeStatus` selectors instead — see `STATUS_VISUAL`.
 */
export function diffList<T extends { id: string }>(
  attempted: T[],
  corrected: T[]
): DiffEntry<T>[] {
  const correctedById = new Map(corrected.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const out: DiffEntry<T>[] = [];

  for (const a of attempted) {
    const c = correctedById.get(a.id);
    seen.add(a.id);
    if (!c) {
      out.push({ id: a.id, status: "disabled", attempted: a });
    } else {
      const status = shallowEqualIgnoringId(a, c) ? "kept" : "updated";
      out.push({ id: a.id, status, attempted: a, corrected: c });
    }
  }
  for (const c of corrected) {
    if (seen.has(c.id)) continue;
    out.push({ id: c.id, status: "added", corrected: c });
  }
  return out;
}
