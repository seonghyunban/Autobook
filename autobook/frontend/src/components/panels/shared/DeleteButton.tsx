import { RiCloseCircleLine } from "react-icons/ri";
import s from "../panels.module.css";
import { T, palette } from "./tokens";

/**
 * Inline delete × button used wherever an item can be removed from a list:
 * ambiguity cases, direct/indirect parties, edge rows, etc.
 *
 * Visual: 14×14 bare icon, no background, no border.
 * State:
 *   - idle:  opacity 0.6, color T.textPrimary
 *   - hover: opacity 0.9, color spicyPaprika
 */
export function DeleteButton({ onClick, title }: { onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={s.buttonTransition}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        width: 14,
        height: 14,
        fontSize: 14,
        color: T.textPrimary,
        cursor: "pointer",
        lineHeight: 1,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: 0.6,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.opacity = "0.9";
        e.currentTarget.style.color = palette.spicyPaprika;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.opacity = "0.6";
        e.currentTarget.style.color = T.textPrimary;
      }}
    >
      <RiCloseCircleLine />
    </button>
  );
}
