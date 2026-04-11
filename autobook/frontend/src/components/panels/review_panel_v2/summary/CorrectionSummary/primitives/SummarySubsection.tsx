import type React from "react";
import { summaryTokens } from "../tokens";

/**
 * Nested block within a SummarySection (e.g., Reporting Entity, Conclusion).
 * Smaller uppercase title + indented content column.
 *
 * Title is optional — when omitted, the wrapper renders just the content
 * column with the same tight field gap. Used by Tax (which has no real
 * subsection structure but still wants the tight field spacing).
 */
export function SummarySubsection({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {title && <h3 style={summaryTokens.subsectionTitle}>{title}</h3>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 8 }}>
        {children}
      </div>
    </div>
  );
}
