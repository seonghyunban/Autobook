import s from "../panels.module.css";
import { T, palette, FIELD_BASE_STYLE } from "./tokens";
import type { ReviewFieldBgPair } from "./ReviewTextField";

const DEFAULT_BG: ReviewFieldBgPair = {
  display: T.fieldBg,
  editing: T.fieldBgEditing,
};

/**
 * Segmented control — N option buttons sharing one container.
 *
 * Each button uses FIELD_BASE_STYLE so the segmented row's height/padding/font
 * matches the other field types. Within the wrapper, the SELECTED button is
 * rendered at full opacity; unselected buttons are dimmed to 0.3 so the
 * active choice stays obvious.
 *
 * Interaction:
 *   - onChange provided → clickable, :hover bumps wrapper opacity via .fieldHighlight
 *   - onChange omitted  → static (attempted side display)
 *   - disabled          → 0.4 opacity, no pointer events
 */
export function SegmentedControl({
  value,
  options,
  onChange,
  disabled = false,
  bg = DEFAULT_BG,
  style,
}: {
  value: string;
  options: string[];
  /** When omitted, control is read-only (no click, no hover bump). */
  onChange?: (value: string) => void;
  disabled?: boolean;
  bg?: ReviewFieldBgPair;
  style?: React.CSSProperties;
}) {
  const selectedBg = (bg.editing.background as string) ?? palette.charcoalBrown;
  const unselectedBg = (bg.display.background as string) ?? palette.charcoalBrown;
  const interactive = !!onChange && !disabled;

  const wrapperClass = disabled
    ? `${s.fieldHighlight} ${s.disabled}`
    : interactive
      ? s.fieldHighlight
      : s.fieldDisplay;

  return (
    <div
      className={wrapperClass}
      style={{
        display: "flex",
        borderRadius: 6,
        overflow: "hidden",
        width: "100%",
        ...style,
      }}
    >
      {options.map((opt) => {
        const selected = opt === value;
        return (
          <button
            key={opt}
            className={s.buttonTransition}
            onClick={() => { if (interactive) onChange?.(opt); }}
            disabled={!interactive}
            style={{
              ...FIELD_BASE_STYLE,
              flex: 1,
              background: selected ? selectedBg : unselectedBg,
              color: T.buttonText,
              // Selected button at full crispness, unselected strongly dimmed.
              // Wrapper-level .fieldHighlight bumps opacity on hover/focus.
              opacity: selected ? 1 : 0.3,
              border: "none",
              borderRadius: 0,
              fontWeight: 600,
              textAlign: "center",
              cursor: interactive ? "pointer" : "default",
            }}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
