"""RAG payload builders — construct self-contained Qdrant payloads
from attempted + corrected trace data.

Each payload contains everything needed to reconstruct a few-shot
example. No DB round-trip on read.
"""
from __future__ import annotations

from typing import Any


def build_normalizer_payload(
    *,
    raw_text: str,
    attempted_graph: dict | None,
    corrected_graph: dict | None,
    note_parties: str | None,
    note_value_flow: str | None,
    entity_id: str,
    draft_id: str,
) -> dict[str, Any]:
    """Build payload for the normalizer_corrections collection.

    Key (to embed): raw_text
    """
    return {
        "raw_text": raw_text,
        "attempted_graph": _strip_graph(attempted_graph),
        "corrected_graph": _strip_graph(corrected_graph),
        "note_parties": note_parties or "",
        "note_value_flow": note_value_flow or "",
        "entity_id": entity_id,
        "draft_id": draft_id,
    }


def build_agent_payload(
    *,
    templated_text: str,
    attempted_ambiguities: list[dict] | None,
    corrected_ambiguities: list[dict] | None,
    note_conclusion: str | None,
    note_ambiguities: dict[str, str] | None,
    attempted_decision: str | None,
    corrected_decision: str | None,
    attempted_rationale: str | None,
    corrected_rationale: str | None,
    attempted_tax: dict | None,
    corrected_tax: dict | None,
    note_tax: str | None,
    attempted_classifications: list[dict] | None,
    corrected_classifications: list[dict] | None,
    attempted_entry: dict | None,
    corrected_entry: dict | None,
    note_entry: str | None,
    note_relationship: str | None,
    entity_id: str,
    draft_id: str,
) -> dict[str, Any]:
    """Build payload for the agent_corrections collection.

    Key (to embed): templated_text (graph-as-prose from corrected graph)
    """
    return {
        "templated_text": templated_text,

        "attempted_ambiguities": attempted_ambiguities or [],
        "corrected_ambiguities": corrected_ambiguities or [],
        "note_conclusion": note_conclusion or "",
        "note_ambiguities": note_ambiguities or {},

        "attempted_decision": attempted_decision or "",
        "corrected_decision": corrected_decision or "",
        "attempted_rationale": attempted_rationale or "",
        "corrected_rationale": corrected_rationale or "",

        "attempted_tax": attempted_tax or {},
        "corrected_tax": corrected_tax or {},
        "note_tax": note_tax or "",

        "attempted_classifications": attempted_classifications or [],
        "corrected_classifications": corrected_classifications or [],

        "attempted_entry": attempted_entry or {},
        "corrected_entry": corrected_entry or {},
        "note_entry": note_entry or "",
        "note_relationship": note_relationship or "",

        "entity_id": entity_id,
        "draft_id": draft_id,
    }


def _strip_graph(graph: dict | None) -> dict:
    """Keep only structural fields from a graph dict (no IDs, no timestamps)."""
    if not graph:
        return {"nodes": [], "edges": []}
    return {
        "nodes": [
            {"index": n.get("index", 0), "name": n.get("name", ""), "role": n.get("role", "")}
            for n in graph.get("nodes") or []
        ],
        "edges": [
            {
                "source_index": e.get("source_index", 0),
                "target_index": e.get("target_index", 0),
                "nature": e.get("nature", ""),
                "kind": e.get("kind", e.get("edge_kind", "")),
                "amount": e.get("amount"),
                "currency": e.get("currency"),
            }
            for e in graph.get("edges") or []
        ],
    }
