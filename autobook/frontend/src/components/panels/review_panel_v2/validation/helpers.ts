/**
 * Shared helpers used by rule modules.
 *
 * Re-exports the canonical graph types from `api/types.ts` and provides
 * small null-safe extractors so rule modules don't have to worry about
 * `transaction_graph` being null.
 */
import type {
  TransactionGraph,
  TransactionGraphNode,
  TransactionGraphEdge,
} from "../../../../api/types";

export type GraphNode = TransactionGraphNode;
export type GraphEdge = TransactionGraphEdge;

/** Extract the `nodes` array from a transaction graph; returns [] if missing. */
export function readGraphNodes(graph: TransactionGraph | null | undefined): GraphNode[] {
  return graph?.nodes ?? [];
}

/** Extract the `edges` array from a transaction graph; returns [] if missing. */
export function readGraphEdges(graph: TransactionGraph | null | undefined): GraphEdge[] {
  return graph?.edges ?? [];
}

/** True if the value is null, undefined, empty string, or only whitespace. */
export function isBlank(value: string | null | undefined): boolean {
  return value == null || value.trim() === "";
}

/** True if the value is a finite number (not NaN, not Infinity). */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Float-equality with a small tolerance (for currency sums). */
export function approxEqual(a: number, b: number, tolerance = 0.01): boolean {
  return Math.abs(a - b) <= tolerance;
}
