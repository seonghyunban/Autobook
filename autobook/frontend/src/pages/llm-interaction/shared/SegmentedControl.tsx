import s from "../../LLMInteractionPage.module.css";
import { T, palette } from "./tokens";

export function SegmentedControl({
  value,
  options,
  onChange,
  disabled,
  editing,
  style,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
  editing?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", width: "100%", ...style }}>
      {options.map((opt) => {
        const selected = opt === value;
        return (
          <button
            key={opt}
            className={s.buttonTransition}
            onClick={() => { if (!disabled) onChange(opt); }}
            style={{
              flex: 1,
              background: selected ? palette.charcoalBrown : "rgba(64, 61, 57, 0.3)",
              color: T.buttonText,
              opacity: (selected ? 0.8 : 0.7) + (editing ? 0.1 : 0),
              border: "none",
              padding: "4px 10px",
              fontSize: 11,
              fontWeight: 600,
              cursor: disabled ? "default" : "pointer",
              pointerEvents: disabled ? "none" as const : "auto" as const,
            }}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
