import type React from "react";

// ── Motion constants (ms) — source of truth for CSS tokens + JS timeouts ──
export const MOTION = {
  fast: 150,      // hover, button feedback
  normal: 200,    // content fade in/out
  expand: 400,    // resize, expand/collapse
  pulse: 1500,    // star pulse loop
} as const;

// ── Palette (raw hex only) ────────────────────────────────
export const palette = {
  floralWhite: "#FFFCF2",
  silver: "#CCC5B9",
  charcoalBrown: "#403D39",
  carbonBlack: "#252422",
  spicyPaprika: "#EB5E28",
  hunterGreen: "#31572C",
  fern: "#4F772D",
  palmLeaf: "#90A955",
  alabaster: "#E5E4E2",
  airForceBlue: "#5D8AA8",
  burntOrange: "#C04000",
  deepSaffron: "#FF8F00",
  orange: "#FFA500",
  amberGold: "#FFBF00",
  darkTeal: "#004953",
  sunflower: "#FFB32C",
  claudeWhite: "#CFCDC1",
} as const;

// ── Component tokens ─────────────────────────────────────
export const T = {
  pageBg: palette.floralWhite,
  pageText: palette.charcoalBrown,
  pageFont: "system-ui, sans-serif",

  panelBg: "rgba(204, 197, 185, 0.3)",
  panelRadius: 12,
  panelPadding: "20px 22px",
  panelShadow: "0 2px 6px rgba(0, 0, 0, 0.2), 0 6px 16px rgba(0, 0, 0, 0.15)",
  panelGap: 12,

  textPrimary: palette.carbonBlack,
  textSecondary: palette.charcoalBrown,
  textMuted: "rgba(204, 197, 185, 0.6)",

  inputBorder: "rgba(204, 197, 185, 0.35)",
  inputBg: palette.charcoalBrown,
  inputRadius: 6,

  buttonBg: palette.spicyPaprika,
  buttonBgDisabled: "rgba(204, 197, 185, 0.4)",
  buttonText: "#fff",
  buttonRadius: 6,

  badgeBg: palette.spicyPaprika,
  badgeText: "#fff",

  debitBg: "rgba(235, 94, 40, 0.15)",
  debitText: "#F4845F",
  creditBg: "rgba(45, 122, 58, 0.15)",
  creditText: "#6BCB77",

  errorBg: "rgba(192, 57, 43, 0.15)",
  errorText: "#F4845F",

  eyebrow: palette.spicyPaprika,

  tableBorder: "rgba(204, 197, 185, 0.3)",
  tableRowBorder: "rgba(204, 197, 185, 0.18)",

  fieldLabel: { fontSize: 12, fontWeight: 500, color: palette.carbonBlack, opacity: 1 } as React.CSSProperties,
  fieldText: { fontSize: 12, color: palette.floralWhite } as React.CSSProperties,
  fieldBg: { background: palette.charcoalBrown, opacity: 0.8, borderRadius: 6 } as React.CSSProperties,
  fieldBgEditing: { background: palette.charcoalBrown, opacity: 0.9, borderRadius: 6 } as React.CSSProperties,

  attemptedItem: "rgba(255, 143, 0, 0.2)",
  attemptedSupplement: "rgba(255, 165, 0, 0.3)",
  correctedItem: "rgba(79, 119, 45, 0.2)",
  correctedSupplement: "rgba(144, 169, 85, 0.3)",
} as const;

// ── Review-panel field textarea style ────────────────────
// Universal base for inline editable text fields in the review panel
// (excludes the Additional Notes textarea, which has its own large style).
// Spread first, then add the background (e.g. T.fieldBgEditing) and any
// per-field overrides on top.
export const reviewTextareaStyle: React.CSSProperties = {
  ...T.fieldText,
  lineHeight: "16px",
  padding: "4px 10px",
  width: "100%",
  border: "none",
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
  resize: "none",
  overflow: "hidden",
  fieldSizing: "content",
  minHeight: 24, // 16px line + 8px vertical padding (border-box)
};

// ── Shared panel style ───────────────────────────────────
export const panel: React.CSSProperties = {
  background: T.panelBg,
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  borderRadius: T.panelRadius,
  padding: T.panelPadding,
  display: "flex",
  flexDirection: "column",
  gap: T.panelGap,
  boxShadow: T.panelShadow,
  border: "1px solid rgba(204, 197, 185, 0.2)",
};

// ── Currency symbols ─────────────────────────────────────
export const CURRENCY_SYM: Record<string, string> = {
  CAD: "$", USD: "$", EUR: "€", GBP: "£", JPY: "¥", KRW: "₩", CNY: "¥",
};

// ── Entry table column colors ────────────────────────────
export type EntryColorTheme = {
  headerBg: readonly string[];
  cellBg: readonly string[];
  cellBgFilled: readonly string[];
  cellBgSolid: readonly string[];
  totalBg: readonly string[];
  totalBgFilled: readonly string[];
  totalBgSolid: readonly string[];
};

export const entryColors: EntryColorTheme = {
  headerBg: [`${palette.hunterGreen}B3`, `${palette.fern}B3`, `${palette.palmLeaf}B3`],
  cellBg: [`${palette.hunterGreen}1A`, `${palette.fern}1A`, `${palette.palmLeaf}1A`],
  cellBgFilled: [`${palette.hunterGreen}33`, `${palette.fern}33`, `${palette.palmLeaf}33`],
  cellBgSolid: [palette.hunterGreen, palette.fern, palette.palmLeaf],
  totalBg: ["#7F7F7F1A", "#A5A5A51A", "#CCCCCC1A"],
  totalBgFilled: ["#7F7F7F4D", "#A5A5A54D", "#CCCCCC4D"],
  totalBgSolid: ["#7F7F7F", "#A5A5A5", "#CCCCCC"],
};

export const attemptedEntryColors: EntryColorTheme = {
  headerBg: [`${palette.deepSaffron}B3`, `${palette.orange}B3`, `${palette.amberGold}B3`],
  cellBg: [`${palette.deepSaffron}1A`, `${palette.orange}1A`, `${palette.amberGold}1A`],
  cellBgFilled: [`${palette.deepSaffron}33`, `${palette.orange}33`, `${palette.amberGold}33`],
  cellBgSolid: [palette.deepSaffron, palette.orange, palette.amberGold],
  totalBg: ["#7F7F7F1A", "#A5A5A51A", "#CCCCCC1A"],
  totalBgFilled: ["#7F7F7F4D", "#A5A5A54D", "#CCCCCC4D"],
  totalBgSolid: ["#7F7F7F", "#A5A5A5", "#CCCCCC"],
};
