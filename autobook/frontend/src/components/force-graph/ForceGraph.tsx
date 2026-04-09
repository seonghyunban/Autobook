import { memo, useMemo, useRef, useState } from "react";
import type { GraphData, GraphNode as GraphNodeType, GraphEdge as GraphEdgeType, NodeRole } from "./types";
import { GraphNode } from "./GraphNode";
import { GraphEdge } from "./GraphEdge";
import { useContainerSize } from "./useContainerSize";
import { useForceSimulation } from "./useForceSimulation";
import { ROLE_COLORS } from "../panels/shared/tokens";

// ── Connected IDs for highlighting ──────────────────────────

function getHighlightedFromNode(node: GraphNodeType, data: GraphData) {
  const nodeIds = new Set([node.index]);
  const edgeIndices = new Set<number>();
  data.edges.forEach((e, i) => {
    if (e.sourceIndex === node.index || e.targetIndex === node.index) {
      nodeIds.add(e.sourceIndex);
      nodeIds.add(e.targetIndex);
      edgeIndices.add(i);
    }
  });
  return { nodeIds, edgeIndices };
}

function getHighlightedFromEdge(edgeIndex: number, data: GraphData) {
  const edge = data.edges[edgeIndex];
  if (!edge) return { nodeIds: new Set<number>(), edgeIndices: new Set<number>() };
  return {
    nodeIds: new Set([edge.sourceIndex, edge.targetIndex]),
    edgeIndices: new Set([edgeIndex]),
  };
}

// ── Bidirectional edge curvature ─────────────────────────────

const BASE_CURVATURE = 0.08;

function computeEdgeCurvatures(edges: GraphEdgeType[]): number[] {
  const pairCount = new Map<string, number>();
  const pairSeen = new Map<string, number>();

  for (const e of edges) {
    const key = [Math.min(e.sourceIndex, e.targetIndex), Math.max(e.sourceIndex, e.targetIndex)].join("-");
    pairCount.set(key, (pairCount.get(key) || 0) + 1);
  }

  return edges.map((e) => {
    const key = [Math.min(e.sourceIndex, e.targetIndex), Math.max(e.sourceIndex, e.targetIndex)].join("-");
    const total = pairCount.get(key) || 1;
    if (total === 1) return 0;

    const seen = pairSeen.get(key) || 0;
    pairSeen.set(key, seen + 1);

    const magnitude = BASE_CURVATURE * (Math.floor(seen / 2) + 1);
    const sign = seen % 2 === 0 ? 1 : -1;
    return sign * magnitude;
  });
}

// ── Particle colors by source role ──────────────────────────
// Sourced from shared ROLE_COLORS so the graph particles match the
// review panel's role-themed field backgrounds and value-flow boxes.
const PARTICLE_COLORS: Record<NodeRole, string> = ROLE_COLORS as Record<NodeRole, string>;

// ── Main component ──────────────────────────────────────────

export const ForceGraph = memo(function ForceGraph({ data, layoutVersion = 0, highlightedEdge, onEdgeHover, onNodeHover }: {
  data: GraphData;
  layoutVersion?: number;
  highlightedEdge?: number | null;
  onEdgeHover?: (index: number | null) => void;
  onNodeHover?: (index: number | null) => void;
}) {
  const { ref, width, height } = useContainerSize();
  const { positions, labelPositions, stabilized } = useForceSimulation(data, width, height, layoutVersion);
  const [hoveredNode, setHoveredNode] = useState<GraphNodeType | null>(null);
  const [hoveredEdgeIdx, setHoveredEdgeIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const edgeCurvatures = useMemo(() => computeEdgeCurvatures(data.edges), [data.edges]);
  const scale = useMemo(() => Math.min(width, height) / 20, [width, height]);
  const nodeRoleById = useMemo(() => new Map(data.nodes.map((n) => [n.index, n.role])), [data.nodes]);

  // Compute viewBox from all positions with padding
  const viewBox = useMemo(() => {
    const allPoints: { x: number; y: number }[] = [];
    for (const pos of positions.values()) allPoints.push(pos);
    for (const pos of labelPositions.values()) allPoints.push(pos);
    if (allPoints.length === 0) return `0 0 ${width} ${height}`;

    const padding = scale * 2;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of allPoints) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    // Maintain aspect ratio of container
    const contentW = maxX - minX;
    const contentH = maxY - minY;
    const containerRatio = (width || 1) / (height || 1);
    const contentRatio = contentW / contentH;

    if (contentRatio > containerRatio) {
      const newH = contentW / containerRatio;
      const dy = (newH - contentH) / 2;
      minY -= dy;
      maxY += dy;
    } else {
      const newW = contentH * containerRatio;
      const dx = (newW - contentW) / 2;
      minX -= dx;
      maxX += dx;
    }

    return `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;
  }, [positions, labelPositions, width, height, scale]);

  // Highlight sets
  const activeEdge = highlightedEdge ?? hoveredEdgeIdx;
  const highlight = useMemo(() => {
    if (hoveredNode) return getHighlightedFromNode(hoveredNode, data);
    if (activeEdge != null) return getHighlightedFromEdge(activeEdge, data);
    return null;
  }, [hoveredNode, activeEdge, data]);

  const hasHighlight = highlight != null;

  function handleNodeHover(node: GraphNodeType | null) {
    setHoveredNode(node);
    onNodeHover?.(node?.index ?? null);
  }

  function handleEdgeHover(edge: GraphEdgeType | null) {
    const idx = edge ? data.edges.indexOf(edge) : null;
    setHoveredEdgeIdx(idx);
    onEdgeHover?.(idx);
  }

  if (width === 0 || height === 0 || data.nodes.length === 0) {
    return <div ref={ref} style={{ width: "100%", height: "100%", minWidth: 0, minHeight: 0, overflow: "hidden" }} />;
  }

  return (
    <div ref={ref} style={{ width: "100%", height: "100%", minWidth: 0, minHeight: 0, overflow: "hidden", position: "relative" }}>
      <svg ref={svgRef} viewBox={viewBox} preserveAspectRatio="xMidYMid meet" style={{ display: "block", width: "100%", height: "100%" }}>
        {/* Edges */}
        {data.edges.map((edge, i) => {
          const sp = positions.get(edge.sourceIndex);
          const tp = positions.get(edge.targetIndex);
          if (!sp || !tp) return null;

          const isHighlighted = highlight?.edgeIndices.has(i) ?? false;
          const isDimmed = hasHighlight && !isHighlighted;

          return (
            <GraphEdge
              key={`edge-${i}`}
              edge={edge}
              x1={sp.x} y1={sp.y}
              x2={tp.x} y2={tp.y}
              curvature={edgeCurvatures[i]}
              sourceColor={PARTICLE_COLORS[nodeRoleById.get(edge.sourceIndex) || "indirect_party"]}
              highlighted={isHighlighted}
              dimmed={isDimmed}
              showParticle={stabilized}
              onHover={handleEdgeHover}
            />
          );
        })}

        {/* Node circles */}
        {data.nodes.map((node) => {
          const pos = positions.get(node.index);
          if (!pos) return null;

          const isHighlighted = highlight?.nodeIds.has(node.index) ?? false;
          const isDimmed = hasHighlight && !isHighlighted;

          return (
            <GraphNode
              key={`node-${node.index}`}
              node={node}
              x={pos.x}
              y={pos.y}
              labelX={0}
              labelY={0}
              scale={scale}
              highlighted={isHighlighted}
              dimmed={isDimmed}
              onHover={handleNodeHover}
              hideLabel
            />
          );
        })}

        {/* Labels (rendered last = on top) */}
        {data.nodes.map((node) => {
          const pos = positions.get(node.index);
          const lpos = labelPositions.get(node.index);
          if (!pos) return null;

          const isHighlighted = highlight?.nodeIds.has(node.index) ?? false;
          const isDimmed = hasHighlight && !isHighlighted;
          const fontSize = Math.max(8, scale * 0.35);

          return (
            <text
              key={`label-${node.index}`}
              x={lpos?.x ?? pos.x}
              y={lpos?.y ?? pos.y}
              textAnchor="middle"
              dominantBaseline="central"
              fill={isHighlighted ? "rgba(64, 61, 57, 1)" : "rgba(64, 61, 57, 0.5)"}
              fontSize={fontSize}
              fontWeight={node.role === "reporting_entity" ? 600 : 400}
              opacity={isDimmed ? 0.2 : 1}
              style={{ cursor: "pointer", transition: "opacity 0.2s ease, fill 0.2s ease" }}
            >
              {node.name}
            </text>
          );
        })}
      </svg>
    </div>
  );
});
