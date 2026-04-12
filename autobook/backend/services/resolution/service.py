"""Resolution service — handles correction submission.

Called when the user clicks Submit on the review panel.
Loads attempted + corrected traces from DB, builds RAG payloads,
and calls human_tier.backward() to write to Qdrant collections.
"""
from __future__ import annotations

import logging
from uuid import UUID

from sqlalchemy.orm import Session

from db.dao.drafts import DraftDAO
from db.dao.drafted_entries import DraftedEntryDAO
from db.dao.trace_ambiguities import TraceAmbiguityDAO
from db.dao.trace_classifications import TraceClassificationDAO
from db.dao.traces import AttemptedTraceDAO, CorrectedTraceDAO
from db.dao.transaction_graphs import TransactionGraphDAO
from db.dao.transactions import TransactionDAO
from ripple_through import Tier
from services.shared.template import template_graph
from vectordb.payloads import build_normalizer_payload, build_agent_payload

logger = logging.getLogger(__name__)


def submit(
    db: Session,
    draft_id: UUID,
    entity_id: UUID,
    human_tier: Tier,
) -> None:
    """Finalize a correction and propagate backward via RAG.

    1. Set submitted_at on correction trace
    2. Load attempted + corrected data from DB
    3. Build RAG payloads
    4. Call human_tier.backward() to write to Qdrant
    """
    # 1. Mark as submitted
    correction = CorrectedTraceDAO.get_by_draft(db, draft_id)
    if correction is None:
        logger.warning("No correction for draft=%s, skipping", draft_id)
        return

    CorrectedTraceDAO.submit(db, correction.id)
    db.commit()

    # 2. Load data
    attempt = AttemptedTraceDAO.get_by_draft(db, draft_id)
    if attempt is None:
        logger.warning("No attempt for draft=%s, skipping RAG", draft_id)
        return

    draft = DraftDAO.get_by_id(db, draft_id)
    raw_text = TransactionDAO.get_by_id(db, draft.transaction_id).raw_text

    attempted_graph = _load_graph(db, attempt.graph_id)
    corrected_graph = _load_graph(db, correction.graph_id)
    attempted_entry = _load_entry(db, attempt.drafted_entry_id)
    corrected_entry = _load_entry(db, correction.drafted_entry_id)
    attempted_ambiguities = _load_ambiguities(db, attempt.id)
    corrected_ambiguities = _load_ambiguities(db, correction.id)
    attempted_classifications = _load_classifications(db, attempt.drafted_entry_id)
    corrected_classifications = _load_classifications(db, correction.drafted_entry_id)

    # 3. Build payloads
    result: dict = {}
    notes = correction.notes or {}

    # Normalizer — only if graph was actually corrected
    graph_changed = attempted_graph != corrected_graph
    if graph_changed:
        result["normalizer"] = {
            "key": raw_text,
            "point_id": str(draft_id),
            "payload": build_normalizer_payload(
                raw_text=raw_text,
                attempted_graph=attempted_graph,
                corrected_graph=corrected_graph,
                note_parties=notes.get("parties"),
                note_value_flow=notes.get("valueFlow"),
                entity_id=str(entity_id),
                draft_id=str(draft_id),
            ),
        }

    # Agent — conditional on decision, only include changed sections
    corrected_decision = correction.decision_kind
    is_proceed = corrected_decision == "PROCEED"

    attempted_tax = _extract_tax(attempt)
    corrected_tax = _extract_tax(correction)

    ambiguity_changed = attempted_ambiguities != corrected_ambiguities
    decision_changed = (
        attempt.decision_kind != corrected_decision
        or attempt.decision_rationale != correction.decision_rationale
    )
    tax_changed = attempted_tax != corrected_tax
    entry_changed = attempted_entry != corrected_entry
    classifications_changed = attempted_classifications != corrected_classifications

    # For PROCEED: include all changed sections
    # For MISSING_INFO/STUCK: only ambiguity + decision
    include_ambiguity = ambiguity_changed
    include_decision = decision_changed
    include_tax = is_proceed and tax_changed
    include_entry = is_proceed and entry_changed
    include_classifications = is_proceed and classifications_changed

    has_any_change = (
        include_ambiguity or include_decision
        or include_tax or include_entry or include_classifications
    )

    if has_any_change:
        templated_text = template_graph(corrected_graph)
        result["agent"] = {
            "key": templated_text,
            "point_id": str(draft_id),
            "payload": build_agent_payload(
                templated_text=templated_text,
                attempted_ambiguities=attempted_ambiguities if include_ambiguity else None,
                corrected_ambiguities=corrected_ambiguities if include_ambiguity else None,
                note_conclusion=notes.get("conclusion") if include_ambiguity else None,
                note_ambiguities={k: v for k, v in notes.items() if k.startswith("ambiguity-")} if include_ambiguity else None,
                attempted_decision=attempt.decision_kind if include_decision else None,
                corrected_decision=corrected_decision if include_decision else None,
                attempted_rationale=attempt.decision_rationale if include_decision else None,
                corrected_rationale=correction.decision_rationale if include_decision else None,
                attempted_tax=attempted_tax if include_tax else None,
                corrected_tax=corrected_tax if include_tax else None,
                note_tax=notes.get("tax") if include_tax else None,
                attempted_classifications=attempted_classifications if include_classifications else None,
                corrected_classifications=corrected_classifications if include_classifications else None,
                attempted_entry=attempted_entry if include_entry else None,
                corrected_entry=corrected_entry if include_entry else None,
                note_entry=notes.get("entry") if include_entry else None,
                note_relationship=notes.get("relationship") if include_entry else None,
                entity_id=str(entity_id),
                draft_id=str(draft_id),
            ),
        }

    # 4. Backward
    if result:
        human_tier.backward(result)
        logger.info("Resolution complete for draft=%s (%s)", draft_id, list(result.keys()))
    else:
        logger.info("No corrections differ for draft=%s, skipping RAG", draft_id)


# ── Helpers ───────────────────────────────────────────────


def _load_graph(db: Session, graph_id: UUID) -> dict:
    graph = TransactionGraphDAO.get_by_id(db, graph_id)
    if graph is None:
        return {"nodes": [], "edges": []}
    return {
        "nodes": [
            {"index": n.node_index, "name": n.name, "role": n.role}
            for n in graph.nodes
        ],
        "edges": [
            {
                "source_index": e.source_index,
                "target_index": e.target_index,
                "nature": e.nature,
                "kind": e.edge_kind,
                "amount": float(e.amount) if e.amount is not None else None,
                "currency": e.currency,
            }
            for e in graph.edges
        ],
    }


def _load_entry(db: Session, entry_id: UUID) -> dict:
    entry = DraftedEntryDAO.get_by_id(db, entry_id)
    if entry is None:
        return {"reason": "", "lines": []}
    return {
        "reason": entry.entry_reason or "",
        "lines": [
            {
                "account_code": l.account_code,
                "account_name": l.account_name,
                "type": l.type,
                "amount": float(l.amount),
                "currency": l.currency,
            }
            for l in entry.lines
        ],
    }


def _load_ambiguities(db: Session, trace_id: UUID) -> list[dict]:
    ambs = TraceAmbiguityDAO.list_by_trace(db, trace_id)
    return [
        {
            "aspect": a.aspect,
            "ambiguous": a.ambiguous,
            "conventional_default": a.conventional_default,
            "ifrs_default": a.ifrs_default,
            "clarification_question": a.clarification_question,
            "cases": [
                {"case_text": c.case_text, "proposed_entry_json": c.proposed_entry_json}
                for c in a.cases
            ],
        }
        for a in ambs
    ]


def _load_classifications(db: Session, entry_id: UUID) -> list[dict]:
    return [
        {"type": c.type, "direction": c.direction, "taxonomy": c.taxonomy}
        for c in TraceClassificationDAO.list_for_drafted_entry(db, entry_id)
    ]


def _extract_tax(trace) -> dict:
    return {
        "classification": trace.tax_classification,
        "tax_rate": float(trace.tax_rate) if trace.tax_rate is not None else None,
        "tax_context": trace.tax_context,
        "itc_eligible": trace.tax_itc_eligible,
        "amount_tax_inclusive": trace.tax_amount_inclusive,
        "tax_mentioned": trace.tax_mentioned,
    }
