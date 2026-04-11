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
  nodes.forEach((node, i) => {
    if (isBlank(node.name)) {
      issues.push({
        section: "transaction",
        severity: "error",
        message: `Node ${i + 1}: empty name`,
      });
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
        message: `"${desc(edge)}": source and target are the same party — a flow must be between two different parties`,
      });
    }

    // Nature — warning if missing
    if (isBlank(edge.nature)) {
      issues.push({ section: "transaction", severity: "warning", message: `A value flow between ${edge.source} and ${edge.target} has no description` });
    }

    // Amount + currency coherence
    if (STRICT_AMOUNT_KINDS.has(edge.kind)) {
      if (!isFiniteNumber(edge.amount) || edge.amount <= 0) {
        issues.push({
          section: "transaction",
          severity: "error",
          message: `"${desc(edge)}": a direct exchange must have a positive amount`,
        });
      }
      if (isFiniteNumber(edge.amount) && isBlank(edge.currency)) {
        issues.push({
          section: "transaction",
          severity: "error",
          message: `"${desc(edge)}": amount is set but no currency is specified`,
        });
      }
    } else if (edge.kind === "non_exchange") {
      if (edge.amount != null) {
        if (!isFiniteNumber(edge.amount) || edge.amount <= 0) {
          issues.push({
            section: "transaction",
            severity: "error",
            message: `"${desc(edge)}": amount must be positive if specified`,
          });
        }
        if (isFiniteNumber(edge.amount) && isBlank(edge.currency)) {
          issues.push({
            section: "transaction",
            severity: "error",
            message: `"${desc(edge)}": amount is set but no currency is specified`,
          });
        }
      }
    } else {
      if (edge.amount != null) {
        issues.push({
          section: "transaction",
          severity: "warning",
          message: `"${desc(edge)}": this is a relationship — remove the amount or change the type`,
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
        message: "No value flow involves the reporting entity",
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
        const [a, b] = pairKey.split("↔");
        issues.push({
          section: "transaction",
          severity: "warning",
          message: `Value exchanged between ${a} and ${b} doesn't match: ${amounts[0].toFixed(2)} given vs ${amounts[1].toFixed(2)} received`,
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
          message: `Amounts passing through "${name}" don't balance: ${inn.toFixed(2)} in vs ${out.toFixed(2)} out`,
        });
      }
    }
  }
}
