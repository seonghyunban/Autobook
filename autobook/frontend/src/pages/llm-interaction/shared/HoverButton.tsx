import s from "../../LLMInteractionPage.module.css";

export function HoverButton({
  bg = "transparent",
  bgHover,
  color,
  colorHover,
  borderColor,
  borderColorHover,
  children,
  ...rest
}: {
  bg?: string;
  bgHover: string;
  color?: string;
  colorHover?: string;
  borderColor?: string;
  borderColorHover?: string;
  children: React.ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "color">) {
  return (
    <button
      className={s.buttonTransition}
      {...rest}
      style={{
        background: bg,
        color,
        border: borderColor ? `1px solid ${borderColor}` : "none",
        cursor: "pointer",
        ...rest.style,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = bgHover;
        if (colorHover) e.currentTarget.style.color = colorHover;
        if (borderColorHover) e.currentTarget.style.borderColor = borderColorHover;
        rest.onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = bg;
        if (color) e.currentTarget.style.color = color;
        if (borderColor) e.currentTarget.style.borderColor = borderColor;
        rest.onMouseLeave?.(e);
      }}
    >
      {children}
    </button>
  );
}
