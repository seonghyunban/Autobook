"""Post-LLM validation for the transaction graph.

Structural checks + value conservation checks on exchange edges.
"""
from collections import defaultdict


def validate_graph(graph: dict) -> list[str]:
    """Validate a TransactionGraph dict. Returns list of warnings (empty = valid)."""
    warnings = []
    nodes = graph.get("nodes", [])
    edges = graph.get("edges", [])

    # ── Structural checks ────────────────────────────────────────────

    # Exactly one reporting_entity
    re_nodes = [n for n in nodes if n.get("role") == "reporting_entity"]
    if len(re_nodes) == 0:
        warnings.append("No reporting_entity node found.")
    elif len(re_nodes) > 1:
        warnings.append(f"Multiple reporting_entity nodes found: {[n['name'] for n in re_nodes]}.")

    # Edge references valid nodes
    node_names = {n["name"] for n in nodes}
    node_indices = {n["index"] for n in nodes}
    for i, e in enumerate(edges):
        if e["source"] not in node_names and e["source_index"] not in node_indices:
            warnings.append(f"Edge {i}: source '{e['source']}' (index {e['source_index']}) not found in nodes.")
        if e["target"] not in node_names and e["target_index"] not in node_indices:
            warnings.append(f"Edge {i}: target '{e['target']}' (index {e['target_index']}) not found in nodes.")

    # At least one edge involves the reporting entity
    if re_nodes:
        re_name = re_nodes[0]["name"]
        re_index = re_nodes[0]["index"]
        touches_re = any(
            e["source"] == re_name or e["target"] == re_name
            or e["source_index"] == re_index or e["target_index"] == re_index
            for e in edges
        )
        if not touches_re:
            warnings.append("No edge involves the reporting entity.")

    # ── Reciprocal exchange: pairwise amount match ───────────────────

    reciprocal = [e for e in edges if e.get("kind") == "reciprocal_exchange" and e.get("amount") is not None]

    # Group by (source, target) pair — normalize to sorted tuple
    pair_flows: dict[tuple[str, str], dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for e in reciprocal:
        src, tgt = e["source"], e["target"]
        pair_key = tuple(sorted([src, tgt]))
        pair_flows[pair_key][f"{src}->{tgt}"] += e["amount"]

    for pair, directions in pair_flows.items():
        amounts = list(directions.values())
        if len(amounts) == 2:
            a, b = amounts
            if abs(a - b) > 0.01:
                labels = list(directions.keys())
                warnings.append(
                    f"Reciprocal exchange imbalance between {pair[0]} and {pair[1]}: "
                    f"{labels[0]} = {a:,.2f}, {labels[1]} = {b:,.2f}, "
                    f"difference = {abs(a - b):,.2f}."
                )

    # ── Chained exchange: per-node balance ───────────────────────────

    chained = [e for e in edges if e.get("kind") == "chained_exchange" and e.get("amount") is not None]

    if chained:
        node_inflow: dict[str, float] = defaultdict(float)
        node_outflow: dict[str, float] = defaultdict(float)

        for e in chained:
            node_outflow[e["source"]] += e["amount"]
            node_inflow[e["target"]] += e["amount"]

        all_nodes_in_chain = set(node_inflow.keys()) | set(node_outflow.keys())
        for name in all_nodes_in_chain:
            inflow = node_inflow.get(name, 0)
            outflow = node_outflow.get(name, 0)
            if abs(inflow - outflow) > 0.01:
                warnings.append(
                    f"Chained exchange imbalance at node '{name}': "
                    f"inflow = {inflow:,.2f}, outflow = {outflow:,.2f}, "
                    f"difference = {abs(inflow - outflow):,.2f}."
                )

    return warnings
