import { useRef, type CSSProperties } from "react";
import { FIELD_BASE_STYLE, T } from "./tokens";
import s from "../panels.module.css";

export type ReviewFieldBgPair = {
  display: CSSProperties;
  editing: CSSProperties;
};

const DEFAULT_BG: ReviewFieldBgPair = {
  display: T.fieldBg,
  editing: T.fieldBgEditing,
};

type Props = {
  value: string;
  /**
   * When provided, the field becomes interactive (renders an inner
   * <textarea> wrapped in a styled div). When omitted, the field renders
   * a static display <div> (read-only, e.g. the attempted side of a diff).
   */
  onChange?: (value: string) => void;
  /** Background pair. `display` is used for the container background; `editing` is kept only for backwards-compatible call sites. */
  bg?: ReviewFieldBgPair;
  /** Inert state — renders at 0.4 opacity with no pointer events. */
  disabled?: boolean;
  placeholder?: string;
  /** Display fallback shown when value is empty (e.g. "—"). */
  emptyText?: string;
  /** When set, applies `flex: <n>` to the wrapper. */
  flex?: number;
  /** Per-field style override. Spread last on the wrapper. */
  style?: CSSProperties;
};

/**
 * Universal review-panel text field.
 *
 * Architecture: a styled wrapper <div> carries the box (padding, bg,
 * border-radius, minHeight). Inside the wrapper:
 *   - Interactive (onChange provided): a transparent inner <textarea>
 *     with field-sizing: content and zero padding. Opacity is driven by
 *     the .fieldHighlight CSS class via :hover / :focus-within.
 *   - Read-only (no onChange): plain text. No :hover effect — static display.
 *
 * Both modes share the same wrapper dimensions so a row of mixed fields
 * lines up perfectly regardless of which are editable.
 */
export function ReviewTextField({
  value,
  onChange,
  bg = DEFAULT_BG,
  disabled = false,
  placeholder,
  emptyText,
  flex,
  style,
}: Props) {
  const innerRef = useRef<HTMLTextAreaElement>(null);
  const flexStyle = flex !== undefined ? { flex } : undefined;
  const wrapperStyle: CSSProperties = {
    ...FIELD_BASE_STYLE,
    ...bg.display,
    ...flexStyle,
    ...style,
  };

  // Read-only (no onChange) or disabled: static display.
  if (!onChange || disabled) {
    const className = disabled
      ? `${s.fieldHighlight} ${s.disabled}`
      : s.fieldDisplay;
    return (
      <div className={className} style={wrapperStyle}>
        {value || emptyText || ""}
      </div>
    );
  }

  // Interactive: wrapper + transparent textarea inside.
  return (
    <div
      className={s.fieldHighlight}
      onClick={() => innerRef.current?.focus()}
      style={{ ...wrapperStyle, cursor: "text" }}
    >
      <textarea
        ref={innerRef}
        rows={1}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={INNER_TEXTAREA_STYLE}
      />
    </div>
  );
}

const INNER_TEXTAREA_STYLE: CSSProperties = {
  display: "block",
  width: "100%",
  margin: 0,
  padding: 0,
  border: "none",
  outline: "none",
  background: "transparent",
  color: "inherit",
  font: "inherit",
  lineHeight: "16px",
  resize: "none",
  overflow: "hidden",
  fieldSizing: "content",
};
