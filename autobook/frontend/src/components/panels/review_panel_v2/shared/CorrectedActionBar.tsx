import { palette } from "../../shared/tokens";
import s from "../../panels.module.css";

const correctedActionBtn: React.CSSProperties = {
  background: "rgba(144, 169, 85, 0.15)",
  border: "none",
  borderRadius: 3,
  padding: "2px 8px",
  fontSize: 10,
  fontWeight: 600,
  color: palette.carbonBlack,
  cursor: "pointer",
};

export function CorrectedActionBar({ actions, muted, variant = "corrected" }: {
  actions: { label: string; onClick?: () => void; disabled?: boolean }[];
  muted?: boolean;
  variant?: "attempted" | "corrected";
}) {
  const colors = {
    attempted: { bg: "rgba(255, 165, 0, 0.15)", bgHover: "rgba(255, 165, 0, 0.25)" },
    corrected: { bg: "rgba(144, 169, 85, 0.15)", bgHover: "rgba(144, 169, 85, 0.25)" },
    muted: { bg: "rgba(204, 197, 185, 0.15)", bgHover: "rgba(204, 197, 185, 0.25)" },
  };
  const c = muted ? colors.muted : colors[variant];
  const bg = c.bg;
  const bgHover = c.bgHover;
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
      {actions.map((a) => (
        <button
          key={a.label}
          className={s.buttonTransition}
          style={{ ...correctedActionBtn, background: bg, opacity: a.disabled ? 0.6 : 1, cursor: a.disabled ? "default" : "pointer" }}
          onClick={a.disabled ? undefined : a.onClick}
          onMouseEnter={(e) => { if (!a.disabled) e.currentTarget.style.background = bgHover; }}
          onMouseLeave={(e) => { if (!a.disabled) e.currentTarget.style.background = bg; }}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}
