import type { GraphNode as GraphNodeType, NodeRole } from "./types";

const NODE_STYLES: Record<NodeRole, { color: string; radius: number }> = {
  reporting_entity: { color: "#FFA500", radius: 1 },
  counterparty: { color: "#004953", radius: 0.7 },
  indirect_party: { color: "#CFCDC1", radius: 0.5 },
};

export function GraphNode({ node, x, y, labelX, labelY, scale, highlighted, dimmed, onHover, hideLabel }: {
  node: GraphNodeType;
  x: number;
  y: number;
  labelX: number;
  labelY: number;
  scale: number;
  highlighted: boolean;
  dimmed: boolean;
  onHover: (node: GraphNodeType | null) => void;
  hideLabel?: boolean;
}) {
  const style = NODE_STYLES[node.role];
  const r = style.radius * scale;
  const fontSize = Math.max(8, scale * 0.35);

  return (
    <g
      onMouseEnter={() => onHover(node)}
      onMouseLeave={() => onHover(null)}
      style={{ cursor: "pointer", transition: "opacity 0.2s ease" }}
      opacity={dimmed ? 0.2 : 1}
    >
      <circle
        cx={x}
        cy={y}
        r={r}
        fill={style.color}
        stroke={highlighted ? "#FFFCF2" : "none"}
        strokeWidth={highlighted ? 2 : 0}
        style={{ transition: "stroke-width 0.2s ease, stroke 0.2s ease" }}
      />
      {!hideLabel && (
        <text
          x={labelX}
          y={labelY}
          textAnchor="middle"
          dominantBaseline="central"
          fill={highlighted ? "rgba(64, 61, 57, 1)" : "rgba(64, 61, 57, 0.5)"}
          fontSize={fontSize}
          fontWeight={node.role === "reporting_entity" ? 600 : 400}
        >
          {node.name}
        </text>
      )}
    </g>
  );
}
