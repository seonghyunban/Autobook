import type React from "react";
import { summaryTokens } from "../tokens";

type Props = {
  label: string;
  value: React.ReactNode;
};

/**
 * A single labeled value in the summary report.
 * Horizontal layout: label left (fixed column), value right (fills remaining).
 * Read-only — no inputs, no buttons, just text.
 */
export function SummaryField({ label, value }: Props) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
      <span style={{ ...summaryTokens.fieldLabel, minWidth: 160, flexShrink: 0 }}>{label}</span>
      <span style={{ ...summaryTokens.fieldValue, flex: 1 }}>
        {value || <span style={{ opacity: 0.4 }}>—</span>}
      </span>
    </div>
  );
}
