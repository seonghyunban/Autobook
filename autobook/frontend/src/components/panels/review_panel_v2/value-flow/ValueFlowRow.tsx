/**
 * Value Flow components — copied from review_panel/ReviewPanel.tsx lines 866-1258.
 * Contains: KIND_LABELS, useEdgeRowMeasurements, FanOutArrowOverlay,
 * ValueHeaderRow, EdgeRow, ValueFlowRow.
 */
import { useEffect, useRef, useState } from "react";
import { useDraftStore } from "../../store";
import { useShallow } from "zustand/react/shallow";
import { palette, T, CURRENCY_SYM, roleFieldBg, roleFieldBgEditing } from "../../shared/tokens";
import { ReviewTextField } from "../../shared/ReviewTextField";
import { NumberField } from "../../shared/NumberField";
import { DropdownSelect } from "../../shared/DropdownSelect";
import { DeleteButton } from "../../shared/DeleteButton";
import { AddButton } from "../../shared/AddButton";
import { SectionSubheader } from "../../shared/SectionSubheader";
import { readGraphNodes, readGraphEdges, type GraphNode, type GraphEdgeData } from "../shared/graphHelpers";
import { CorrectedActionBar } from "../shared/CorrectedActionBar";
import type { EdgeKind } from "../../../../api/types";
import s from "../../panels.module.css";

const SILVER_BG = "rgba(204, 197, 185, 0.2)";

const KIND_LABELS: Record<EdgeKind, string> = {
  reciprocal_exchange: "Reciprocal exchange",
  chained_exchange: "Chained exchange",
  non_exchange: "Non-exchange",
  relationship: "Relationship",
};
const KIND_OPTIONS = Object.values(KIND_LABELS);

function labelToKind(label: string): EdgeKind {
  const entry = (Object.entries(KIND_LABELS) as [EdgeKind, string][]).find(([, v]) => v === label);
  return entry?.[0] ?? "reciprocal_exchange";
}

const CURRENCY_OPTIONS = Object.keys(CURRENCY_SYM);

const ARROW_DIRECTION_WIDTH = 128;
const ARROW_GAP = 32;
const ARROW_SOURCE_X = ARROW_DIRECTION_WIDTH;
const ARROW_TARGET_X = ARROW_DIRECTION_WIDTH + ARROW_GAP;

function useEdgeRowMeasurements(edgeCount: number) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [measurements, setMeasurements] = useState<{
    bodyHeight: number;
    sourceY: number;
    targetYs: number[];
  }>({ bodyHeight: 0, sourceY: 0, targetYs: [] });

  useEffect(() => {
    function measure() {
      const container = containerRef.current;
      if (!container) return;
      const cRect = container.getBoundingClientRect();
      const sRect = sourceRef.current?.getBoundingClientRect();
      const sourceY = sRect
        ? (sRect.top + sRect.bottom) / 2 - cRect.top
        : cRect.height / 2;
      const targetYs = rowRefs.current.slice(0, edgeCount).map((row) => {
        if (!row) return 0;
        const r = row.getBoundingClientRect();
        return (r.top + r.bottom) / 2 - cRect.top;
      });
      setMeasurements({ bodyHeight: cRect.height, sourceY, targetYs });
    }
    measure();
    const obs = new ResizeObserver(measure);
    if (containerRef.current) obs.observe(containerRef.current);
    if (sourceRef.current) obs.observe(sourceRef.current);
    rowRefs.current.slice(0, edgeCount).forEach((r) => { if (r) obs.observe(r); });
    return () => obs.disconnect();
  }, [edgeCount]);

  return { containerRef, sourceRef, rowRefs, measurements };
}

function FanOutArrowOverlay({ bodyHeight, sourceY, targetYs }: {
  bodyHeight: number;
  sourceY: number;
  targetYs: number[];
}) {
  if (targetYs.length === 0 || bodyHeight === 0) return null;
  const svgWidth = ARROW_GAP;
  return (
    <svg
      style={{
        position: "absolute",
        left: ARROW_DIRECTION_WIDTH,
        top: 0,
        width: svgWidth,
        height: bodyHeight,
        pointerEvents: "none",
        overflow: "visible",
      }}
    >
      {targetYs.map((ty, i) => {
        const sx = 0;
        const sy = sourceY;
        const tx = svgWidth;
        const cx = svgWidth * 0.5;
        const d = `M ${sx},${sy} C ${cx},${sy} ${cx},${ty} ${tx},${ty}`;
        return (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={palette.charcoalBrown}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            opacity={0.7}
          >
            <animate attributeName="stroke-dashoffset" from="7" to="0" dur="0.6s" repeatCount="indefinite" />
          </path>
        );
      })}
    </svg>
  );
}

const valueHeaderStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 600,
  color: T.textSecondary,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  padding: "2px 0",
  textAlign: "center",
};

function ValueHeaderRow() {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <div style={{ flex: 1, minWidth: 0 }}><span style={valueHeaderStyle}>Target</span></div>
      <div style={{ flex: 2, minWidth: 0 }}><span style={valueHeaderStyle}>Nature</span></div>
      <div style={{ flex: 1, minWidth: 0 }}><span style={valueHeaderStyle}>Kind</span></div>
      <div style={{ flex: 0.8, minWidth: 0 }}><span style={valueHeaderStyle}>Amount</span></div>
      <div style={{ flex: 0.6, minWidth: 0 }}><span style={valueHeaderStyle}>Currency</span></div>
      <div style={{ width: 14, flexShrink: 0 }} />
    </div>
  );
}

function EdgeRow({ edge, allNodes, onChange, onDelete, rowRef }: {
  edge: GraphEdgeData;
  allNodes: GraphNode[];
  onChange: (patch: Partial<GraphEdgeData>) => void;
  onDelete: () => void;
  rowRef: (el: HTMLDivElement | null) => void;
}) {
  const targetOptions = allNodes.map((n) => n.name);
  const kindLabel = KIND_LABELS[edge.kind as EdgeKind] ?? edge.kind;
  const isRelationship = edge.kind === "relationship";

  return (
    <div ref={rowRef} style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <DropdownSelect
          value={edge.target || null}
          options={targetOptions}
          placeholder="Select..."
          onChange={(v) => {
            const node = allNodes.find((n) => n.name === v);
            onChange({ target: v, target_index: node?.index ?? -1 });
          }}
          style={{ width: "100%" }}
        />
      </div>
      <div style={{ flex: 2, minWidth: 0 }}>
        <ReviewTextField value={edge.nature} onChange={(v) => onChange({ nature: v })} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <DropdownSelect
          value={kindLabel}
          options={KIND_OPTIONS}
          placeholder="Select..."
          onChange={(v) => onChange({ kind: labelToKind(v) })}
          style={{ width: "100%" }}
        />
      </div>
      <div style={{ flex: 0.8, minWidth: 0 }}>
        <NumberField
          value={edge.amount}
          onChange={(v) => onChange({ amount: v })}
          disabled={isRelationship}
        />
      </div>
      <div style={{ flex: 0.6, minWidth: 0 }}>
        <DropdownSelect
          value={edge.currency || null}
          options={CURRENCY_OPTIONS}
          placeholder="—"
          onChange={(v) => onChange({ currency: v })}
          disabled={isRelationship}
          style={{ width: "100%" }}
        />
      </div>
      <div style={{ width: 14, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <DeleteButton onClick={onDelete} />
      </div>
    </div>
  );
}

let _edgeIdCounter = 0;
function newEdgeId(): string {
  _edgeIdCounter += 1;
  return `e-new-${Date.now()}-${_edgeIdCounter}`;
}

export function ValueFlowRow({ nodeIndex }: { nodeIndex: number }) {
  const node = useDraftStore((st) =>
    readGraphNodes(st.corrected.transaction_graph).find((n) => n.index === nodeIndex)
  );
  const allNodes = useDraftStore(
    useShallow((st) => readGraphNodes(st.corrected.transaction_graph))
  );
  const attemptedEdges = useDraftStore(
    useShallow((st) =>
      readGraphEdges(st.attempted.transaction_graph).filter((e) => e.source_index === nodeIndex)
    )
  );
  const correctedEdges = useDraftStore(
    useShallow((st) =>
      readGraphEdges(st.corrected.transaction_graph).filter((e) => e.source_index === nodeIndex)
    )
  );
  const setCorrected = useDraftStore((st) => st.setCorrected);

  const { containerRef, sourceRef, rowRefs, measurements } = useEdgeRowMeasurements(correctedEdges.length);

  if (!node) return null;

  const changed = JSON.stringify(correctedEdges) !== JSON.stringify(attemptedEdges);
  const sourceBg = roleFieldBg(node.role);
  const sourceBgEditing = roleFieldBgEditing(node.role);

  function addEdge() {
    setCorrected((draft) => {
      const graph = draft.transaction_graph;
      if (!graph) return;
      graph.edges.push({
        id: newEdgeId(),
        source: node!.name,
        source_index: nodeIndex,
        target: "",
        target_index: -1,
        nature: "",
        kind: "reciprocal_exchange",
        amount: null,
        currency: null,
      });
    });
  }

  function updateEdge(edgeId: string, patch: Partial<GraphEdgeData>) {
    setCorrected((draft) => {
      const graph = draft.transaction_graph;
      if (!graph) return;
      const target = graph.edges.find((e) => e.id === edgeId);
      if (target) Object.assign(target, patch);
    });
  }

  function deleteEdge(edgeId: string) {
    setCorrected((draft) => {
      const graph = draft.transaction_graph;
      if (!graph) return;
      const idx = graph.edges.findIndex((e) => e.id === edgeId);
      if (idx >= 0) graph.edges.splice(idx, 1);
    });
  }

  function handleReset() {
    setCorrected((draft) => {
      const draftGraph = draft.transaction_graph;
      if (!draftGraph) return;
      draftGraph.edges = draftGraph.edges.filter((e) => e.source_index !== nodeIndex);
      const validIndices = new Set(draftGraph.nodes.map((n) => n.index));
      const attempted = useDraftStore.getState().attempted;
      const restored = readGraphEdges(attempted.transaction_graph)
        .filter((e) => e.source_index === nodeIndex && validIndices.has(e.target_index))
        .map((e) => structuredClone(e));
      draftGraph.edges.push(...restored);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{
        background: SILVER_BG, borderRadius: 4, padding: "8px 10px",
        display: "flex", flexDirection: "column", gap: 8,
      }}>
        {correctedEdges.length > 0 && (
          <div ref={containerRef} style={{ position: "relative", display: "flex", gap: ARROW_GAP, alignItems: "stretch" }}>
            <FanOutArrowOverlay
              bodyHeight={measurements.bodyHeight}
              sourceY={measurements.sourceY}
              targetYs={measurements.targetYs}
            />
            <div style={{
              width: ARROW_DIRECTION_WIDTH, flexShrink: 0,
              display: "flex", flexDirection: "column", gap: 4,
            }}>
              <div style={{ display: "flex", alignItems: "flex-end", height: 24 }}><span style={valueHeaderStyle}>Source</span></div>
              <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
                <div ref={sourceRef} style={{ width: "100%" }}>
                  <ReviewTextField value={node.name} bg={{ display: sourceBg, editing: sourceBgEditing }} />
                </div>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
              <ValueHeaderRow />
              {correctedEdges.map((edge, i) => (
                <EdgeRow
                  key={edge.id}
                  edge={edge}
                  allNodes={allNodes}
                  onChange={(patch) => updateEdge(edge.id, patch)}
                  onDelete={() => deleteEdge(edge.id)}
                  rowRef={(el) => { rowRefs.current[i] = el; }}
                />
              ))}
            </div>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <AddButton onClick={addEdge} title="Add edge" />
        </div>
        <CorrectedActionBar muted={!changed} variant={changed ? "corrected" : "attempted"} actions={[
          { label: "Reset", onClick: handleReset },
        ]} />
      </div>
    </div>
  );
}
