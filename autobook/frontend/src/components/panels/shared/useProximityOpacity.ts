import { useRef, useEffect, useState, useCallback } from "react";
import { useTransform, useMotionValue, animate } from "motion/react";
import { useProximityMouseY } from "./ProximityContext";

/**
 * Returns a motion opacity value that fades based on distance from cursor.
 * Close = maxOpacity (0.9), far = 0, smooth falloff over `range` pixels.
 *
 * Hover behaviour:
 *   - enter: snap immediately to maxOpacity (no flicker)
 *   - leave: smooth transition back to proximity-based value
 *
 * Returns null values if no ProximityProvider is present (non-proximity mode).
 */
export function useProximityOpacity(range = 80, maxOpacity = 0.9) {
  const mouseY = useProximityMouseY();
  const fallback = useMotionValue(-1000);
  const hovered = useMotionValue(0);
  const ref = useRef<HTMLButtonElement>(null);
  const [centerY, setCenterY] = useState(0);

  useEffect(() => {
    function update() {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setCenterY(rect.top + rect.height / 2);
    }
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, []);

  const opacity = useTransform(
    [mouseY ?? fallback, hovered],
    ([y, h]: number[]) => {
      const el = ref.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const cy = rect.top + rect.height / 2;
        if (Math.abs(cy - centerY) > 2) setCenterY(cy);
      }
      const dist = Math.abs(y - centerY);
      const proximityVal = dist > range ? 0 : maxOpacity * (1 - dist / range);
      return Math.max(proximityVal, h * maxOpacity);
    }
  );

  const onHoverEnter = useCallback(() => hovered.set(1), [hovered]);
  const onHoverLeave = useCallback(() => animate(hovered, 0, { duration: 0.15 }), [hovered]);

  if (!mouseY) return { ref, opacity: null, onHoverEnter: undefined, onHoverLeave: undefined, hovered: null };
  return { ref, opacity, onHoverEnter, onHoverLeave, hovered };
}
