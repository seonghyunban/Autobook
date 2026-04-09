import type { CSSProperties } from "react";
import { palette } from "./panels/shared/tokens";

/**
 * Autobook brand icon — 2×2 grid of colored squares/circles.
 *
 *   F ●        F = fern         (top-left,     square)
 *   ● S        ● = darkTeal     (top-right,    circle)
 *              ● = deepSaffron  (bottom-left,  circle)
 *              S = spicyPaprika (bottom-right, square)
 *
 * Used in the App header next to the "Autobook" label, on the login
 * page, and anywhere else the brand mark needs to appear. `size` scales
 * the whole icon uniformly; internal cell size and gap scale with it.
 */
type Props = {
  /** Overall width/height of the icon in px. Default 32. */
  size?: number;
  /** Gap between cells in px. Default scales with size (size / 10). */
  gap?: number;
  /** Corner radius for the square cells in px. Default scales with size. */
  squareRadius?: number;
  style?: CSSProperties;
};

type IconCell = { color: string; circle: boolean };

const ICON_CELLS: IconCell[] = [
  { color: palette.fern,         circle: false }, // top-left
  { color: palette.darkTeal,     circle: true  }, // top-right
  { color: palette.deepSaffron,  circle: true  }, // bottom-left
  { color: palette.spicyPaprika, circle: false }, // bottom-right
];

export function BrandIcon({ size = 32, gap, squareRadius, style }: Props) {
  const resolvedGap = gap ?? Math.max(2, Math.round(size / 10));
  const resolvedRadius = squareRadius ?? Math.max(2, Math.round(size / 8));
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gridTemplateRows: "repeat(2, 1fr)",
        gap: resolvedGap,
        flexShrink: 0,
        ...style,
      }}
    >
      {ICON_CELLS.map((cell, i) => (
        <div
          key={i}
          style={{
            background: cell.color,
            borderRadius: cell.circle ? "50%" : resolvedRadius,
          }}
        />
      ))}
    </div>
  );
}
