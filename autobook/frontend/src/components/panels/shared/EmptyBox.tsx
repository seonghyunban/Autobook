import type React from "react";
import { palette } from "./tokens";

/**
 * Dashed-border empty-state placeholder.
 *
 * Used for empty review subsections and empty sibling cells in
 * attempted/corrected diff rows. Override `style` to set flex, height,
 * or padding per call site.
 */
export function EmptyBox({
  label = "Empty",
  style,
}: {
  label?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "8px 10px",
        borderRadius: 4,
        border: `1.5px dashed ${palette.silver}`,
        background: "transparent",
        minWidth: 0,
        ...style,
      }}
    >
      <span style={{ fontSize: 11, color: palette.silver, fontStyle: "italic" }}>
        {label}
      </span>
    </div>
  );
}
