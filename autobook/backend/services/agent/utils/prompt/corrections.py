"""Shared helper for rendering RAG correction hits into prompt blocks.

Each agent node calls `render_corrections()` with its field names to
extract its slice from the RAG hits and produce a <corrections> block
for the user message.
"""
from __future__ import annotations

import json
from typing import Any


def render_corrections(
    local_hits: list[dict],
    pop_hits: list[dict],
    *,
    attempted_key: str,
    corrected_key: str,
    note_key: str | None = None,
    label: str = "output",
) -> str:
    """Render RAG correction hits for a specific node's slice.

    Args:
        local_hits: Entity-specific correction hits from state["rag_local_hits"].
        pop_hits: Population correction hits from state["rag_pop_hits"].
        attempted_key: Payload key for the attempted output (e.g. "attempted_entry").
        corrected_key: Payload key for the corrected output (e.g. "corrected_entry").
        note_key: Optional payload key for the human note (e.g. "note_entry").
        label: Label for display (e.g. "entry", "tax", "ambiguities").

    Returns:
        Formatted <corrections> block string, or "" if no hits.
    """
    sections = []

    local_examples = _render_examples(local_hits, attempted_key, corrected_key, note_key, label)
    if local_examples:
        sections.append(
            "<entity-specific>\n"
            "Past corrections for your organization. Pay particular attention to avoid making similar mistakes.\n"
            + local_examples
            + "\n</entity-specific>"
        )

    pop_examples = _render_examples(pop_hits, attempted_key, corrected_key, note_key, label)
    if pop_examples:
        sections.append(
            "<general>\n"
            "Past corrections from similar transactions. Avoid repeating these mistakes.\n"
            + pop_examples
            + "\n</general>"
        )

    if not sections:
        return ""

    return "<corrections>\n" + "\n\n".join(sections) + "\n</corrections>"


def _render_examples(
    hits: list[dict],
    attempted_key: str,
    corrected_key: str,
    note_key: str | None,
    label: str,
) -> str:
    """Render individual examples from hits, skipping those without the needed keys."""
    examples = []
    for hit in hits:
        attempted = hit.get(attempted_key)
        corrected = hit.get(corrected_key)
        if attempted is None and corrected is None:
            continue

        lines = ["<example>"]
        if hit.get("templated_text"):
            lines.append(f"Input: {hit['templated_text']}")
        if attempted is not None:
            lines.append(f"Attempted {label}: {json.dumps(attempted, indent=None)}")
        if corrected is not None:
            lines.append(f"Corrected {label}: {json.dumps(corrected, indent=None)}")
        if note_key and hit.get(note_key):
            lines.append(f"Note: {hit[note_key]}")
        lines.append("</example>")
        examples.append("\n".join(lines))

    return "\n".join(examples)


def render_decision_corrections(
    local_hits: list[dict],
    pop_hits: list[dict],
) -> str:
    """Render RAG corrections for the decision maker.

    Packages ambiguities, decision, and rationale together as a single
    attempted/corrected pair per example, with conclusion + per-ambiguity notes.
    """
    sections = []

    local_examples = _render_decision_examples(local_hits)
    if local_examples:
        sections.append(
            "<entity-specific>\n"
            "Past corrections for your organization. Pay particular attention to avoid making similar mistakes.\n"
            + local_examples
            + "\n</entity-specific>"
        )

    pop_examples = _render_decision_examples(pop_hits)
    if pop_examples:
        sections.append(
            "<general>\n"
            "Past corrections from similar transactions. Avoid repeating these mistakes.\n"
            + pop_examples
            + "\n</general>"
        )

    if not sections:
        return ""

    return "<corrections>\n" + "\n\n".join(sections) + "\n</corrections>"


def _render_decision_examples(hits: list[dict]) -> str:
    examples = []
    for hit in hits:
        has_ambiguities = hit.get("attempted_ambiguities") or hit.get("corrected_ambiguities")
        has_decision = hit.get("attempted_decision") or hit.get("corrected_decision")
        if not has_ambiguities and not has_decision:
            continue

        lines = ["<example>"]
        if hit.get("templated_text"):
            lines.append(f"Input: {hit['templated_text']}")

        # Attempted: package ambiguities + decision + rationale
        attempted = {}
        if hit.get("attempted_ambiguities"):
            attempted["ambiguities"] = hit["attempted_ambiguities"]
        if hit.get("attempted_decision"):
            attempted["decision"] = hit["attempted_decision"]
        if hit.get("attempted_rationale"):
            attempted["rationale"] = hit["attempted_rationale"]
        if attempted:
            lines.append(f"Attempted: {json.dumps(attempted, indent=None)}")

        # Corrected: same structure
        corrected = {}
        if hit.get("corrected_ambiguities"):
            corrected["ambiguities"] = hit["corrected_ambiguities"]
        if hit.get("corrected_decision"):
            corrected["decision"] = hit["corrected_decision"]
        if hit.get("corrected_rationale"):
            corrected["rationale"] = hit["corrected_rationale"]
        if corrected:
            lines.append(f"Corrected: {json.dumps(corrected, indent=None)}")

        # Notes
        if hit.get("note_conclusion"):
            lines.append(f"Note (conclusion): {hit['note_conclusion']}")
        note_ambs = hit.get("note_ambiguities") or {}
        for key, note in note_ambs.items():
            if note:
                lines.append(f"Note ({key}): {note}")

        lines.append("</example>")
        examples.append("\n".join(lines))

    return "\n".join(examples)
