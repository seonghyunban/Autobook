import type { GraphNode, GraphEdge } from "./types";

type TooltipData =
  | { type: "node"; data: GraphNode; x: number; y: number }
  | { type: "edge"; data: GraphEdge; x: number; y: number };

export function GraphTooltip({ tooltip }: { tooltip: TooltipData }) {
  const { type, data, x, y } = tooltip;

  return (
    <div
      style={{
        position: "absolute",
        left: x + 12,
        top: y - 8,
        background: "rgba(64, 61, 57, 0.95)",
        color: "#FFFCF2",
        borderRadius: 6,
        padding: "6px 10px",
        fontSize: 11,
        lineHeight: 1.5,
        pointerEvents: "none",
        whiteSpace: "nowrap",
        zIndex: 10,
      }}
    >
      {type === "node" ? (
        <>
          <div style={{ fontWeight: 600 }}>{data.name}</div>
          <div style={{ opacity: 0.6, fontSize: 10 }}>{data.role.replace(/_/g, " ")}</div>
        </>
      ) : (
        <>
          <div style={{ fontWeight: 600 }}>{data.source} → {data.target}</div>
          <div style={{ opacity: 0.8 }}>{data.nature}</div>
          {data.amount != null && (
            <div style={{ opacity: 0.6, fontSize: 10 }}>
              {data.currency || ""} {data.amount.toLocaleString()}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export type { TooltipData };
