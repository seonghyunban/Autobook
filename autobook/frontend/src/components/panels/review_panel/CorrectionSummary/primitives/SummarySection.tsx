import type React from "react";
import { summaryTokens } from "../tokens";

/**
 * Top-level block for one review step (Transaction, Ambiguity, Tax, Entry).
 * Uppercase title + vertical content column.
 */
export function SummarySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h2 style={{ ...summaryTokens.sectionTitle, textAlign: "center" }}>{title}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingLeft: 4 }}>
        {children}
      </div>
    </section>
  );
}
