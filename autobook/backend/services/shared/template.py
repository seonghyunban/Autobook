"""Template function: TransactionGraph dict → domain-stripped prose.

Converts a graph to natural language using role labels instead of entity
names, so similarity search matches on transaction *pattern*, not identity.

Example:
    nodes: [{index: 0, name: "Acme Corp", role: "reporting_entity"},
            {index: 1, name: "Apple", role: "counterparty"}]
    edges: [{source_index: 0, target_index: 1, nature: "purchased equipment",
             amount: 2400, currency: "CAD", kind: "reciprocal_exchange"}]

    → "Reporting entity purchased equipment from counterparty 1
       for 2,400 CAD (reciprocal exchange)."
"""
from __future__ import annotations

from typing import Any

# Role label mapping — plural forms for disambiguation
_ROLE_LABELS: dict[str, str] = {
    "reporting_entity": "reporting entity",
    "counterparty": "counterparty",
    "indirect_party": "indirect party",
}


def template_graph(graph: dict[str, Any]) -> str:
    """Convert a TransactionGraph dict to domain-stripped prose.

    Args:
        graph: Dict with "nodes" and "edges" lists.

    Returns:
        Prose string with role labels replacing entity names.
    """
    if not graph:
        return ""

    nodes = graph.get("nodes") or []
    edges = graph.get("edges") or []

    if not nodes:
        return ""

    # Build index → label mapping
    node_labels = _build_node_labels(nodes)

    # Build prose from edges
    lines: list[str] = []
    for edge in edges:
        source = node_labels.get(edge.get("source_index", -1), "unknown")
        target = node_labels.get(edge.get("target_index", -1), "unknown")
        nature = edge.get("nature", "transacted with")
        kind = edge.get("kind", "")
        amount = edge.get("amount")
        currency = edge.get("currency")

        # Nature is a verb phrase from the normalizer (e.g. "purchased equipment from")
        # It may or may not contain a preposition — just concatenate directly.
        line = f"{source} {nature} {target}"

        if amount is not None:
            formatted_amount = f"{amount:,.0f}" if amount == int(amount) else f"{amount:,.2f}"
            if currency:
                line += f" for {formatted_amount} {currency}"
            else:
                line += f" for {formatted_amount}"

        if kind:
            line += f" ({kind.replace('_', ' ')})"

        lines.append(line + ".")

    if not lines:
        # No edges — describe nodes only
        node_descriptions = [f"{label} ({n.get('role', '')})" for n, label in zip(nodes, node_labels.values())]
        return "Transaction involves " + ", ".join(node_descriptions) + "."

    return " ".join(lines)


def _build_node_labels(nodes: list[dict]) -> dict[int, str]:
    """Map node index → role-based label.

    If multiple nodes share a role, they get numbered labels:
    counterparty 1, counterparty 2, etc.
    If a role appears only once, no number is added.
    """
    # Count roles
    role_counts: dict[str, int] = {}
    for node in nodes:
        role = node.get("role", "unknown")
        role_counts[role] = role_counts.get(role, 0) + 1

    # Assign labels
    role_seen: dict[str, int] = {}
    labels: dict[int, str] = {}

    for node in nodes:
        index = node.get("index", 0)
        role = node.get("role", "unknown")
        base_label = _ROLE_LABELS.get(role, role)

        if role_counts[role] > 1:
            role_seen[role] = role_seen.get(role, 0) + 1
            labels[index] = f"{base_label} {role_seen[role]}"
        else:
            labels[index] = base_label

    return labels
