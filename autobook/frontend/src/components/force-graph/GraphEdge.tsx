import type { GraphEdge as GraphEdgeType, EdgeType } from "./types";

const EDGE_COLOR = "rgba(64, 61, 57, 0.5)";

const EDGE_STYLES: Record<EdgeType, { color: string; width: number }> = {
  operational: { color: EDGE_COLOR, width: 1.5 },
  contextual: { color: EDGE_COLOR, width: 1 },
  deep: { color: EDGE_COLOR, width: 0.8 },
  deep_contextual: { color: EDGE_COLOR, width: 0.6 },
};

// Particle color now comes from sourceColor prop

function buildPath(x1: number, y1: number, x2: number, y2: number, curvature: number): string {
  if (curvature === 0) return `M${x1},${y1} L${x2},${y2}`;

  // Canonical direction: always compute perpendicular from smaller coords to larger
  // This ensures the normal is consistent regardless of source/target order
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;

  // Always use the same perpendicular direction for a given pair of points
  const canonicalDx = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? dx : -dx) : dx;
  const canonicalDy = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? dy : -dy) : (dy > 0 ? dy : -dy);
  const nx = -canonicalDy / len;
  const ny = canonicalDx / len;

  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const cx = mx + nx * curvature * len;
  const cy = my + ny * curvature * len;

  return `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`;
}

export function GraphEdge({ edge, x1, y1, x2, y2, curvature = 0, sourceColor, highlighted, dimmed, showParticle, onHover }: {
  edge: GraphEdgeType;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  curvature?: number;
  sourceColor: string;
  highlighted: boolean;
  dimmed: boolean;
  showParticle: boolean;
  onHover: (edge: GraphEdgeType | null) => void;
}) {
  const style = EDGE_STYLES[edge.edgeType];
  const pathD = buildPath(x1, y1, x2, y2, curvature);

  return (
    <g
      onMouseEnter={() => onHover(edge)}
      onMouseLeave={() => onHover(null)}
      style={{ cursor: "pointer", transition: "opacity 0.2s ease" }}
      opacity={dimmed ? 0.15 : 1}
    >
      {/* Invisible wider hit area */}
      <path
        d={pathD}
        fill="none"
        stroke="transparent"
        strokeWidth={12}
      />
      {/* Visible edge */}
      <path
        d={pathD}
        fill="none"
        stroke={highlighted ? "#FFFCF2" : style.color}
        strokeWidth={highlighted ? style.width * 1.5 : style.width}
        style={{ transition: "stroke 0.2s ease, stroke-width 0.2s ease" }}
      />
      {/* Particle */}
      {showParticle && (() => {
        const size = highlighted ? 5 : 3;
        return (
          <rect
            x={-size / 2} y={-size / 2}
            width={size} height={size}
            fill={sourceColor}
            opacity={0.9}
          >
            <animateMotion
              dur="2.5s"
              repeatCount="indefinite"
              rotate="auto"
              path={pathD}
            />
          </rect>
        );
      })()}
    </g>
  );
}
