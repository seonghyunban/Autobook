import { useLLMInteractionStore } from "../../../store";
import { useShallow } from "zustand/react/shallow";
import { readGraphNodes, readGraphEdges, type GraphEdge } from "../../validation/helpers";
import { SummarySection } from "../primitives/SummarySection";
import { SummarySubsection } from "../primitives/SummarySubsection";
import { SummaryField } from "../primitives/SummaryField";
import { SummaryFieldList } from "../primitives/SummaryFieldList";
import { summaryTokens } from "../tokens";
import { CURRENCY_SYM } from "../../../shared/tokens";

const KIND_LABELS: Record<string, string> = {
  reciprocal_exchange: "Reciprocal",
  chained_exchange: "Chained",
  non_exchange: "Non-exchange",
  relationship: "Relationship",
};

/**
 * Section 1 — Transaction Analysis.
 * Reports on the corrected transaction_graph: reporting entity, parties, value flows.
 */
export function TransactionSummary() {
  const nodes = useLLMInteractionStore(
    useShallow((st) => readGraphNodes(st.corrected.transaction_graph))
  );
  const edges = useLLMInteractionStore(
    useShallow((st) => readGraphEdges(st.corrected.transaction_graph))
  );
  const notes = useLLMInteractionStore((st) => st.corrected.notes.transactionAnalysis);

  const reportingEntity = nodes.find((n) => n.role === "reporting_entity");
  const directParties = nodes.filter((n) => n.role === "counterparty").map((n) => n.name);
  const indirectParties = nodes.filter((n) => n.role === "indirect_party").map((n) => n.name);

  // Group edges by source, preserving node order for the groups
  const edgesBySource = new Map<string, GraphEdge[]>();
  for (const node of nodes) {
    const outgoing = edges.filter((e) => e.source === node.name);
    if (outgoing.length > 0) edgesBySource.set(node.name, outgoing);
  }

  return (
    <SummarySection title="Transaction Analysis">
      <SummarySubsection title="Reporting Entity">
        <SummaryField label="Name" value={reportingEntity?.name ?? ""} />
      </SummarySubsection>

      <SummarySubsection title="Direct Parties">
        <SummaryFieldList label="Direct Parties" items={directParties} />
      </SummarySubsection>

      <SummarySubsection title="Indirect Parties">
        <SummaryFieldList label="Indirect Parties" items={indirectParties} />
      </SummarySubsection>

      <SummarySubsection title="Value Flows">
        {edgesBySource.size === 0 ? (
          <span style={{ ...summaryTokens.fieldValue, opacity: 0.4 }}>—</span>
        ) : (
          Array.from(edgesBySource.entries()).map(([source, outgoing]) => (
            <SummaryFieldList
              key={source}
              label={source}
              items={outgoing.map((edge) => <EdgeDestination key={edge.id} edge={edge} />)}
            />
          ))
        )}
      </SummarySubsection>

      <SummarySubsection title="Notes">
        <SummaryField label="Additional notes" value={notes} />
      </SummarySubsection>
    </SummarySection>
  );
}

/**
 * Renders the destination side of an edge (everything after the source name):
 *   → target — nature — amount currency  [kind]
 */
function EdgeDestination({ edge }: { edge: GraphEdge }) {
  const amount =
    edge.amount != null
      ? `${CURRENCY_SYM[edge.currency ?? ""] ?? ""}${edge.amount.toLocaleString()}${edge.currency ? ` ${edge.currency}` : ""}`
      : null;
  const kind = KIND_LABELS[edge.kind] ?? edge.kind;

  return (
    <span>
      → <strong>{edge.target}</strong>
      {edge.nature && <> — {edge.nature}</>}
      {amount && <> — {amount}</>}
      <span style={{ ...summaryTokens.sectionTag, marginLeft: 8 }}>{kind}</span>
    </span>
  );
}
