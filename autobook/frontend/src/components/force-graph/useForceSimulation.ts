import { useEffect, useRef, useState } from "react";
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceRadial,
  forceCollide,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import type { GraphData, NodeRole } from "./types";

type SimNode = {
  id: string;
  index: number;
  role: NodeRole;
  isLabel?: boolean;
  parentIndex?: number;
} & SimulationNodeDatum;

type SimLink = SimulationLinkDatum<SimNode>;

export type NodePosition = { x: number; y: number };

const TIER_RADIUS: Record<NodeRole, number> = {
  reporting_entity: 0,
  counterparty: 0.25,
  indirect_party: 0.42,
};

const NODE_CHARGE: Record<NodeRole, number> = {
  reporting_entity: -400,
  counterparty: -250,
  indirect_party: -150,
};

const LABEL_ID_PREFIX = "label-";

const SIZE_THRESHOLD = 100;

export function useForceSimulation(data: GraphData, width: number, height: number, layoutVersion: number = 0) {
  const [positions, setPositions] = useState<Map<number, NodePosition>>(new Map());
  const [labelPositions, setLabelPositions] = useState<Map<number, NodePosition>>(new Map());
  const [stabilized, setStabilized] = useState(false);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const frozen = useRef(false);
  const prevSize = useRef({ width: 0, height: 0 });
  const prevData = useRef(data);
  const prevLayoutVersion = useRef(layoutVersion);

  useEffect(() => {
    if (width === 0 || height === 0 || data.nodes.length === 0) return;

    // Data changed → always unfreeze
    if (data !== prevData.current) {
      frozen.current = false;
      prevData.current = data;
    }

    // Layout version changed → always unfreeze (fullscreen toggle, modal open, etc.)
    if (layoutVersion !== prevLayoutVersion.current) {
      frozen.current = false;
      prevLayoutVersion.current = layoutVersion;
    }

    // If frozen → skip (size changes ignored when frozen)
    if (frozen.current) return;

    prevSize.current = { width, height };
    frozen.current = false;
    setStabilized(false);

    const cx = width / 2;
    const cy = height / 2;
    const minDim = Math.min(width, height);

    // Create real nodes
    const realNodes: SimNode[] = data.nodes.map((n) => ({
      id: `node-${n.index}`,
      index: n.index,
      role: n.role,
      x: cx + (Math.random() - 0.5) * 20,
      y: cy + (Math.random() - 0.5) * 20,
    }));

    // Pin reporting entity to center
    for (const n of realNodes) {
      if (n.role === "reporting_entity") {
        n.fx = cx;
        n.fy = cy;
      }
    }

    // Create label nodes
    const labelNodes: SimNode[] = data.nodes.map((n) => ({
      id: `${LABEL_ID_PREFIX}${n.index}`,
      index: n.index + 1000,
      role: n.role,
      isLabel: true,
      parentIndex: n.index,
      x: cx + (Math.random() - 0.5) * 20,
      y: cy + (Math.random() - 0.5) * 20 + minDim * 0.03,
    }));

    const allNodes: SimNode[] = [...realNodes, ...labelNodes];

    // Create edge links
    const nodeById = new Map(realNodes.map((n) => [n.id, n]));
    const edgeLinks: SimLink[] = data.edges
      .map((e) => {
        const source = nodeById.get(`node-${e.sourceIndex}`);
        const target = nodeById.get(`node-${e.targetIndex}`);
        if (!source || !target) return null;
        return { source, target } as SimLink;
      })
      .filter((l): l is SimLink => l != null);

    // Create label-to-parent links
    const allNodeById = new Map(allNodes.map((n) => [n.id, n]));
    const labelLinks: SimLink[] = data.nodes.map((n) => ({
      source: allNodeById.get(`node-${n.index}`)!,
      target: allNodeById.get(`${LABEL_ID_PREFIX}${n.index}`)!,
    }));

    const allLinks: SimLink[] = [...edgeLinks, ...labelLinks];

    // Build simulation
    const sim = forceSimulation<SimNode>(allNodes)
      .force("charge", forceManyBody<SimNode>().strength((d) =>
        d.isLabel ? -30 : NODE_CHARGE[d.role]
      ))
      .force("link", forceLink<SimNode, SimLink>(allLinks)
        .id((d) => d.id)
        .distance((l) => {
          const s = l.source as SimNode;
          const t = l.target as SimNode;
          if (s.isLabel || t.isLabel) return minDim * 0.06;
          return minDim * 0.12;
        })
        .strength((l) => {
          const s = l.source as SimNode;
          const t = l.target as SimNode;
          if (s.isLabel || t.isLabel) return 1.5;
          return 0.5;
        })
      )
      .force("radial", forceRadial<SimNode>(
        (d) => d.isLabel ? 0 : TIER_RADIUS[d.role] * minDim,
        cx, cy
      ).strength((d) => d.isLabel ? 0 : 0.8))
      .force("collide", forceCollide<SimNode>((d) =>
        d.isLabel ? minDim * 0.025 : minDim * 0.04
      ))
      .alphaDecay(0.02)
      .velocityDecay(0.3);

    sim.on("tick", () => {
      const nextPositions = new Map<number, NodePosition>();
      const nextLabels = new Map<number, NodePosition>();
      for (const n of allNodes) {
        const pos = { x: n.x ?? cx, y: n.y ?? cy };
        if (n.isLabel) {
          nextLabels.set(n.parentIndex!, pos);
        } else {
          nextPositions.set(n.index, pos);
        }
      }
      setPositions(nextPositions);
      setLabelPositions(nextLabels);

      if (sim.alpha() < 0.05) {
        sim.stop();
        frozen.current = true;
        setStabilized(true);
      }
    });

    simRef.current = sim;

    return () => {
      sim.stop();
      simRef.current = null;
    };
  }, [data, width, height, layoutVersion]);

  return { positions, labelPositions, stabilized };
}
