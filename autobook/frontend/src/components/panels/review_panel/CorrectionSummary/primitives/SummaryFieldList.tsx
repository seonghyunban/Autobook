import type React from "react";
import { summaryTokens } from "../tokens";

type Props = {
  label: string;
  items: React.ReactNode[];
  /** When true, renders a numbered <ol> instead of a bulleted <ul>. */
  ordered?: boolean;
};

/**
 * Label on the left (fixed column like SummaryField), vertical list of items
 * on the right. Renders "—" inline if the list is empty.
 *
 * Layout:
 *   LABEL          1. item 1
 *                  2. item 2
 *                  3. item 3
 *
 * The label column aligns with SummaryField rows above/below this component.
 */
export function SummaryFieldList({ label, items, ordered = false }: Props) {
  const ListTag = ordered ? "ol" : "ul";
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
      <span style={{ ...summaryTokens.fieldLabel, minWidth: 160, flexShrink: 0 }}>
        {label}
        {items.length > 0 && ` (${items.length})`}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {items.length === 0 ? (
          <span style={{ ...summaryTokens.fieldValue, opacity: 0.4 }}>—</span>
        ) : (
          <ListTag style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 2 }}>
            {items.map((item, i) => (
              <li key={i} style={summaryTokens.fieldValue}>
                {typeof item === "string"
                  ? (item || <span style={{ opacity: 0.4 }}>(empty)</span>)
                  : item}
              </li>
            ))}
          </ListTag>
        )}
      </div>
    </div>
  );
}
