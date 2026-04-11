import { RiCloseCircleLine } from "react-icons/ri";
import { motion, useTransform, useMotionValue } from "motion/react";
import { T, palette } from "./tokens";
import { useProximityOpacity } from "./useProximityOpacity";

/**
 * Inline delete × button.
 *
 * When `proximity` is true and inside a ProximityProvider:
 *   - opacity scales smoothly based on distance from cursor
 *   - direct hover: snap to 0.9 + paprika color
 *   - hover leave: smooth transition back to proximity opacity
 *
 * When `proximity` is false (default):
 *   - idle: opacity 0.6, hover: opacity 0.9 + paprika
 */
export function DeleteButton({ onClick, title, proximity }: { onClick: () => void; title?: string; proximity?: boolean }) {
  const { ref, opacity, onHoverEnter, onHoverLeave, hovered } = useProximityOpacity();
  const fallbackHovered = useMotionValue(0);
  const color = useTransform(hovered ?? fallbackHovered, (h: number) =>
    h > 0.5 ? palette.spicyPaprika : T.textPrimary
  );

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
          color,
          cursor: "pointer",
          lineHeight: 1,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity,
        }}
      >
        <RiCloseCircleLine />
      </motion.button>
    );
  }

  return (
    <motion.button
      type="button"
      onClick={onClick}
      title={title}
      initial={{ color: T.textPrimary }}
      whileHover={{ opacity: 0.9, color: palette.spicyPaprika }}
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
      <RiCloseCircleLine />
    </motion.button>
  );
}
