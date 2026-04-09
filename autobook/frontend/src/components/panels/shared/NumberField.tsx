import type React from "react";
import { FIELD_BASE_STYLE, T } from "./tokens";
import type { ReviewFieldBgPair } from "./ReviewTextField";
import s from "../panels.module.css";

const DEFAULT_BG: ReviewFieldBgPair = {
  display: T.fieldBg,
  editing: T.fieldBgEditing,
};

type Props = {
  value: number | null;
  /**
   * When provided, the field becomes interactive (renders an <input type="number">).
   * When omitted, the field renders a static display <div> (read-only).
   */
  onChange?: (value: number | null) => void;
  /** Background pair. Only `display` is used; `editing` kept for API consistency. */
  bg?: ReviewFieldBgPair;
  /** Inert state — dims to 0.4 opacity, no pointer events. */
  disabled?: boolean;
  /** Display fallback shown when value is null. */
  emptyText?: string;
  flex?: number;
  step?: number | string;
  min?: number | string;
  max?: number | string;
  /** Optional formatter for display mode (e.g. percent). Default: String(value). */
  formatDisplay?: (value: number) => string;
  style?: React.CSSProperties;
};

/**
 * Universal number field. Shares FIELD_BASE_STYLE dimensions with the other
 * three field types. Opacity is driven by .fieldHighlight via :hover / :focus.
 */
export function NumberField({
  value,
  onChange,
  bg = DEFAULT_BG,
  disabled = false,
  emptyText = "—",
  flex,
  step,
  min,
  max,
  formatDisplay,
  style,
}: Props) {
  const flexStyle = flex !== undefined ? { flex } : undefined;
  const baseStyle: React.CSSProperties = {
    ...FIELD_BASE_STYLE,
    ...bg.display,
    ...flexStyle,
    ...style,
  };

  const displayText = value != null
    ? (formatDisplay ? formatDisplay(value) : String(value))
    : "";

  // Read-only (no onChange) or explicit disabled → static display div.
  if (!onChange || disabled) {
    const className = disabled
      ? `${s.fieldHighlight} ${s.disabled}`
      : s.fieldDisplay;
    return (
      <div className={className} style={baseStyle}>
        {displayText || emptyText}
      </div>
    );
  }

  // Interactive: raw input with the same box.
  return (
    <input
      type="number"
      className={s.fieldHighlight}
      value={value ?? ""}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === "" ? null : parseFloat(v));
      }}
      step={step}
      min={min}
      max={max}
      style={{
        ...baseStyle,
        border: "none",
        outline: "none",
        width: "100%",
      }}
    />
  );
}
