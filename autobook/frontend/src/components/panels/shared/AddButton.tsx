import { RiAddCircleLine } from "react-icons/ri";
import s from "../panels.module.css";
import { T } from "./tokens";

/**
 * Inline add + button — used wherever an item can be appended to a list:
 * parties, edges, ambiguity cases, etc.
 *
 * Visual: 14×14 bare icon, no background, no border. Same shape as
 * DeleteButton but with a + icon and no paprika hover color (color stays).
 *
 * State:
 *   - idle:  opacity 0.6, color T.textPrimary
 *   - hover: opacity 0.9, color unchanged
 */
export function AddButton({ onClick, title }: { onClick: () => void; title?: string }) {
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
      onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.9"; }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.6"; }}
    >
      <RiAddCircleLine />
    </button>
  );
}
