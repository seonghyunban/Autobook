import type React from "react";
import { palette } from "../../../shared/tokens";

/**
 * Style tokens local to the Correction Summary step.
 *
 * Transparent backgrounds, carbon black text, vertical report feel.
 * Kept separate from shared/tokens.ts because these are summary-specific.
 */
export const summaryTokens = {
  container: {
    padding: "20px 24px",
    display: "flex",
    flexDirection: "column",
    gap: 32,
    color: palette.carbonBlack,
  } as React.CSSProperties,

  sectionTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: palette.carbonBlack,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  } as React.CSSProperties,

  subsectionTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: palette.carbonBlack,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  } as React.CSSProperties,

  fieldLabel: {
    fontSize: 11,
    fontWeight: 500,
    color: palette.carbonBlack,
    opacity: 0.7,
  } as React.CSSProperties,

  fieldValue: {
    fontSize: 13,
    color: palette.carbonBlack,
    fontWeight: 400,
  } as React.CSSProperties,

  // ── Banner styles ────────────────────────────────────
  bannerBase: {
    padding: "12px 16px",
    borderRadius: 6,
    fontSize: 13,
    color: palette.carbonBlack,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } as React.CSSProperties,

  bannerError: {
    background: "rgba(192, 57, 43, 0.12)",
    border: "1px solid rgba(192, 57, 43, 0.35)",
  } as React.CSSProperties,

  bannerWarning: {
    background: "rgba(235, 94, 40, 0.12)",
    border: "1px solid rgba(235, 94, 40, 0.35)",
  } as React.CSSProperties,

  bannerClean: {
    background: "rgba(79, 119, 45, 0.12)",
    border: "1px solid rgba(79, 119, 45, 0.35)",
  } as React.CSSProperties,

  bannerTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: palette.carbonBlack,
  } as React.CSSProperties,

  bannerList: {
    margin: 0,
    paddingLeft: 20,
    fontSize: 12,
    color: palette.carbonBlack,
    lineHeight: 1.6,
  } as React.CSSProperties,

  sectionTag: {
    display: "inline-block",
    fontSize: 9,
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    padding: "2px 6px",
    borderRadius: 3,
    background: "rgba(37, 36, 34, 0.1)",
    color: palette.carbonBlack,
    marginRight: 6,
  } as React.CSSProperties,
};
