import type { HumanCorrectedTrace } from "../../../../../api/types";
import type { ValidationIssue } from "../types";
import {
  readGraphNodes,
  readGraphEdges,
  isBlank,
  isFiniteNumber,
  approxEqual,
  type GraphNode,
  type GraphEdge,
} from "../helpers";

const VALID_ROLES = new Set(["reporting_entity", "counterparty", "indirect_party"]);
const VALID_KINDS = new Set(["reciprocal_exchange", "chained_exchange", "non_exchange", "relationship"]);
// Reciprocal/chained must have a positive amount.
// non_exchange may have null amount (e.g., VAT where rate is given but base is uncertain — left for tax_specialist).
const STRICT_AMOUNT_KINDS = new Set(["reciprocal_exchange", "chained_exchange"]);

/**
 * Validates the transaction graph: nodes, edges, cardinality, and conservation.
 * Appends to the shared issues array.
 */
export function validateTransactionGraph(corrected: HumanCorrectedTrace, issues: ValidationIssue[]): void {
  const nodes = readGraphNodes(corrected.transaction_graph);
  const edges = readGraphEdges(corrected.transaction_graph);

  validateNodes(nodes, issues);
  validateEdges(nodes, edges, issues);
  validateCardinality(nodes, edges, issues);
  validateConservation(edges, issues);
}

// ── Node-level rules ──────────────────────────────────────

function validateNodes(nodes: GraphNode[], issues: ValidationIssue[]): void {
  const seenIndices = new Set<number>();

  nodes.forEach((node, i) => {
    if (isBlank(node.name)) {
      issues.push({
        section: "transaction",
        severity: "error",
        message: `Node ${i + 1}: empty name`,
      });
    }

    if (isBlank(node.role) || !VALID_ROLES.has(node.role)) {
      issues.push({
        section: "transaction",
        severity: "error",
        message: `Node "${node.name || i + 1}": invalid role "${node.role}"`,
      });
    }

    if (!isFiniteNumber(node.index)) {
      issues.push({
        section: "transaction",
        severity: "error",
        message: `Node "${node.name || i + 1}": missing or invalid index`,
      });
    } else if (seenIndices.has(node.index)) {
      issues.push({
        section: "transaction",
        severity: "error",
        message: `Duplicate node index ${node.index}`,
      });
    } else {
      seenIndices.add(node.index);
    }
  });
}

// ── Edge-level rules ──────────────────────────────────────

function validateEdges(nodes: GraphNode[], edges: GraphEdge[], issues: ValidationIssue[]): void {
  const nodeIndices = new Set(nodes.map((n) => n.index));
  const partyNames = nodes.map((n) => n.name).join(", ");
  const desc = (e: GraphEdge) => e.nature || `${e.source} → ${e.target}`;

  edges.forEach((edge) => {
    // Reference integrity — source (by index)
    if (edge.source_index == null || !nodeIndices.has(edge.source_index)) {
      issues.push({
        section: "transaction",
        severity: "error",
        message: `"${desc(edge)}": source "${edge.source}" does not match any of the existing parties in [${partyNames}]`,
      });
    }

    // Reference integrity — target (by index)
    if (edge.target_index == null || !nodeIndices.has(edge.target_index)) {
      issues.push({
        section: "transaction",
        severity: "error",
        message: `"${desc(edge)}": target "${edge.target}" does not match any of the existing parties in [${partyNames}]`,
      });
    }

    // Self-loop
    if (edge.source_index != null && edge.source_index === edge.target_index) {
      issues.push({
        section: "transaction",
        severity: "error",
        message: `"${desc(edge)}": self-loop (source and target are both "${edge.source}")`,
      });
    }

    // Nature (verb phrase) — warning if missing
    if (isBlank(edge.nature)) {
      issues.push({ section: "transaction", severity: "warning", message: `"${desc(edge)}": empty nature (verb phrase)` });
    }

    // Kind — must be one of the four enum values
    if (isBlank(edge.kind) || !VALID_KINDS.has(edge.kind)) {
      issues.push({
        section: "transaction",
        severity: "error",
        message: `"${desc(edge)}": invalid kind "${edge.kind}"`,
      });
      return; // Downstream amount/currency checks depend on valid kind
    }

    // Amount + currency coherence
    if (STRICT_AMOUNT_KINDS.has(edge.kind)) {
      if (!isFiniteNumber(edge.amount) || edge.amount <= 0) {
        issues.push({
          section: "transaction",
          severity: "error",
          message: `"${desc(edge)}": ${edge.kind} requires a positive amount`,
        });
      }
      if (isFiniteNumber(edge.amount) && isBlank(edge.currency)) {
        issues.push({
          section: "transaction",
          severity: "error",
          message: `"${desc(edge)}": amount ${edge.amount} has no currency`,
        });
      }
    } else if (edge.kind === "non_exchange") {
      if (edge.amount != null) {
        if (!isFiniteNumber(edge.amount) || edge.amount <= 0) {
          issues.push({
            section: "transaction",
            severity: "error",
            message: `"${desc(edge)}": non_exchange amount must be positive when set`,
          });
        }
        if (isFiniteNumber(edge.amount) && isBlank(edge.currency)) {
          issues.push({
            section: "transaction",
            severity: "error",
            message: `"${desc(edge)}": amount ${edge.amount} has no currency`,
          });
        }
      }
    } else {
      if (edge.amount != null) {
        issues.push({
          section: "transaction",
          severity: "warning",
          message: `"${desc(edge)}": relationship edge has an amount (${edge.amount}); relationships are value-less`,
        });
      }
    }
  });
}

// ── Cardinality rules ─────────────────────────────────────

function validateCardinality(nodes: GraphNode[], edges: GraphEdge[], issues: ValidationIssue[]): void {
  const reporting = nodes.filter((n) => n.role === "reporting_entity");

  if (reporting.length === 0) {
    issues.push({ section: "transaction", severity: "error", message: "No reporting entity in the graph" });
    return;
  }
  if (reporting.length > 1) {
    issues.push({
      section: "transaction",
      severity: "error",
      message: `Multiple reporting entities: ${reporting.map((n) => n.name).join(", ")}`,
    });
    return;
  }

  // Exactly one reporting entity — check that at least one edge involves it
  const reName = reporting[0].name;
  if (edges.length > 0) {
    const touches = edges.some((e) => e.source === reName || e.target === reName);
    if (!touches) {
      issues.push({
        section: "transaction",
        severity: "warning",
        message: "No edge involves the reporting entity",
      });
    }
  }
}

// ── Conservation rules (ported from backend validate_graph) ──

function validateConservation(edges: GraphEdge[], issues: ValidationIssue[]): void {
  // Reciprocal exchange pairwise balance
  const reciprocals = edges.filter(
    (e) => e.kind === "reciprocal_exchange" && isFiniteNumber(e.amount)
  );
  const pairFlows = new Map<string, Map<string, number>>();
  for (const e of reciprocals) {
    const key = [e.source, e.target].sort().join("↔");
    if (!pairFlows.has(key)) pairFlows.set(key, new Map());
    const flows = pairFlows.get(key)!;
    const dirKey = `${e.source}→${e.target}`;
    flows.set(dirKey, (flows.get(dirKey) ?? 0) + (e.amount as number));
  }
  for (const [pairKey, flows] of pairFlows) {
    if (flows.size === 2) {
      const amounts = Array.from(flows.values());
      if (!approxEqual(amounts[0], amounts[1])) {
        issues.push({
          section: "transaction",
          severity: "warning",
          message: `Reciprocal exchange imbalance (${pairKey}): ${amounts[0].toFixed(2)} vs ${amounts[1].toFixed(2)}`,
        });
      }
    }
  }

  // Chained exchange per-node balance
  const chained = edges.filter(
    (e) => e.kind === "chained_exchange" && isFiniteNumber(e.amount)
  );
  if (chained.length > 0) {
    const inflow = new Map<string, number>();
    const outflow = new Map<string, number>();
    for (const e of chained) {
      outflow.set(e.source, (outflow.get(e.source) ?? 0) + (e.amount as number));
      inflow.set(e.target, (inflow.get(e.target) ?? 0) + (e.amount as number));
    }
    const allNodes = new Set([...inflow.keys(), ...outflow.keys()]);
    for (const name of allNodes) {
      const inn = inflow.get(name) ?? 0;
      const out = outflow.get(name) ?? 0;
      if (!approxEqual(inn, out)) {
        issues.push({
          section: "transaction",
          severity: "warning",
          message: `Chained exchange imbalance at "${name}": inflow ${inn.toFixed(2)}, outflow ${out.toFixed(2)}`,
        });
      }
    }
  }
}
