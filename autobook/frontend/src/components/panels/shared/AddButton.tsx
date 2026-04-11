import { RiAddCircleLine } from "react-icons/ri";
import { motion } from "motion/react";
import { T } from "./tokens";
import { useProximityOpacity } from "./useProximityOpacity";

/**
 * Inline add + button.
 *
 * When `proximity` is true and inside a ProximityProvider:
 *   - opacity scales smoothly based on distance from cursor
 *   - direct hover snaps to 0.9
 *
 * When `proximity` is false (default):
 *   - idle: opacity 0.6, hover: opacity 0.9
 */
export function AddButton({ onClick, title, proximity }: { onClick: () => void; title?: string; proximity?: boolean }) {
  const { ref, opacity, onHoverEnter, onHoverLeave } = useProximityOpacity();

  if (proximity && opacity) {
    return (
      <motion.button
        ref={ref}
        type="button"
        onClick={onClick}
        title={title}
        onMouseEnter={onHoverEnter}
        onMouseLeave={onHoverLeave}
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
          opacity,
        }}
      >
        <RiAddCircleLine />
      </motion.button>
    );
  }

  return (
    <motion.button
      type="button"
      onClick={onClick}
      title={title}
      whileHover={{ opacity: 0.9 }}
      transition={{ duration: 0.15 }}
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
    >
      <RiAddCircleLine />
    </motion.button>
  );
}
