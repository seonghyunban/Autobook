import type React from "react";
import { useState } from "react";
import { T, palette } from "./tokens";
import s from "../panels.module.css";

type Size = "sm" | "md";

type Props = {
  children: React.ReactNode;
  /** When true, button is non-interactive, silver background, charcoal text. */
  disabled?: boolean;
  /** "sm" = review-modal buttons, "md" = main input submit button. Default: "md". */
  size?: Size;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  type?: "button" | "submit" | "reset";
  title?: string;
  style?: React.CSSProperties;
};

const SIZE_STYLES: Record<Size, { padding: string; fontSize: number }> = {
  sm: { padding: "8px 18px", fontSize: 13 },
  md: { padding: "9px 22px", fontSize: 14 },
};

// Paprika + silver, both at 80% baseline, bump to 100% on hover.
const PAPRIKA_BG = "rgba(235, 94, 40, 0.8)";
const PAPRIKA_BG_HOVER = "rgba(235, 94, 40, 1)";
const SILVER_BG = "rgba(204, 197, 185, 0.8)";
const SILVER_BG_HOVER = "rgba(204, 197, 185, 1)";

/**
 * The primary action button for the LLM interaction page.
 *
 * Used for:
 *   - Input panel Submit button (md)
 *   - Review modal Back / Next / Submit buttons (sm)
 *
 * Active state: paprika 80% → 100% on hover, white text.
 * Disabled state: silver 80% → 100% on hover, charcoal text, no pointer.
 */
export function PrimaryButton({
  children,
  disabled = false,
  size = "md",
  onClick,
  type = "button",
  title,
  style,
}: Props) {
  const [hovered, setHovered] = useState(false);

  const bg = disabled
    ? (hovered ? SILVER_BG_HOVER : SILVER_BG)
    : (hovered ? PAPRIKA_BG_HOVER : PAPRIKA_BG);
  const color = disabled ? palette.charcoalBrown : palette.floralWhite;
  const sizing = SIZE_STYLES[size];

  return (
    <button
      className={s.buttonTransition}
      type={type}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={title}
      style={{
        ...sizing,
        borderRadius: T.buttonRadius,
        border: "none",
        background: bg,
        color,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        ...style,
      }}
    >
      {children}
    </button>
  );
}
