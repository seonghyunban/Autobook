"""Persist agent pipeline results to DB.

Called by the agent worker after the pipeline completes.
Creates DraftedEntry + lines, AttemptedTrace, TraceClassifications,
TraceAmbiguities + cases — all in one transaction.
"""
from __future__ import annotations

import logging
from decimal import Decimal
from uuid import UUID

from sqlalchemy.orm import Session

from db.connection import SessionLocal
from db.dao.drafted_entries import DraftedEntryDAO
from db.dao.drafted_entry_lines import DraftedEntryLineDAO
from db.dao.trace_ambiguities import TraceAmbiguityDAO
from db.dao.trace_ambiguity_cases import TraceAmbiguityCaseDAO
from db.dao.trace_classifications import TraceClassificationDAO
from db.dao.traces import AttemptedTraceDAO

logger = logging.getLogger(__name__)


def persist_attempt(message: dict, result: dict) -> str | None:
    """Persist the agent's attempt to DB. Returns the trace ID or None on failure.

    Expects message to contain: entity_id, draft_id, graph_id.
    Expects result to contain: pipeline_state (with output_entry_drafter,
    output_decision_maker, output_tax_specialist, output_debit_classifier,
    output_credit_classifier), decision.
    """
    entity_id = message.get("entity_id")
    draft_id = message.get("draft_id")
    graph_id = message.get("graph_id")

    if not all([entity_id, draft_id, graph_id]):
        logger.warning("Missing entity_id/draft_id/graph_id — skipping persistence")
        return None

    db = SessionLocal()
    try:
        eid = UUID(entity_id)
        did = UUID(draft_id)
        gid = UUID(graph_id)

        ps = result.get("pipeline_state") or {}
        entry_data = ps.get("output_entry_drafter") or {}
        dm = ps.get("output_decision_maker") or {}
        tax = ps.get("output_tax_specialist") or {}
        debit_cls = ps.get("output_debit_classifier") or {}
        credit_cls = ps.get("output_credit_classifier") or {}

        # 1. DraftedEntry
        drafted_entry = DraftedEntryDAO.create(
            db, entity_id=eid, entry_reason=entry_data.get("reason"),
        )

        # 2. DraftedEntryLines
        lines_data = entry_data.get("lines") or []
        currency = entry_data.get("currency", "CAD")
        line_dicts = [
            {
                "line_order": i,
                "account_code": line.get("account_code", "0000"),
                "account_name": line.get("account_name", "Unknown"),
                "type": line.get("type", "debit"),
                "amount": line.get("amount", 0),
                "currency": currency,
            }
            for i, line in enumerate(lines_data)
        ]
        created_lines = DraftedEntryLineDAO.bulk_create(
            db, entity_id=eid, drafted_entry_id=drafted_entry.id, lines=line_dicts,
        )

        # 3. AttemptedTrace
        decision = result.get("decision", "PROCEED")
        trace = AttemptedTraceDAO.create(
            db,
            entity_id=eid,
            draft_id=did,
            graph_id=gid,
            drafted_entry_id=drafted_entry.id,
            origin_tier=3,  # agent tier
            tax_reasoning=tax.get("reasoning"),
            decision_kind=decision,
            decision_rationale=dm.get("rationale") or dm.get("proceed_reason"),
            tax_classification=tax.get("classification"),
            tax_rate=Decimal(str(tax["tax_rate"])) if tax.get("tax_rate") is not None else None,
            tax_context=tax.get("tax_context"),
            tax_itc_eligible=tax.get("itc_eligible"),
            tax_amount_inclusive=tax.get("amount_tax_inclusive"),
            tax_mentioned=tax.get("tax_mentioned"),
        )

        # 4. TraceClassifications (per-line)
        _persist_classifications(
            db, eid, created_lines, lines_data, debit_cls, credit_cls,
        )

        # 5. TraceAmbiguities + cases
        ambiguities = dm.get("ambiguities") or []
        for amb in ambiguities:
            amb_row = TraceAmbiguityDAO.create(
                db,
                entity_id=eid,
                trace_id=trace.id,
                aspect=amb.get("aspect", ""),
                ambiguous=amb.get("ambiguous", False),
                conventional_default=amb.get("input_contextualized_conventional_default"),
                ifrs_default=amb.get("input_contextualized_ifrs_default"),
                clarification_question=amb.get("clarification_question"),
            )
            for case in amb.get("cases") or []:
                TraceAmbiguityCaseDAO.create(
                    db,
                    entity_id=eid,
                    ambiguity_id=amb_row.id,
                    case_text=case.get("case", ""),
                    proposed_entry_json=case.get("possible_entry"),
                )

        db.commit()
        logger.info("Persisted attempt trace=%s for draft=%s", trace.id, draft_id)
        return str(trace.id)

    except Exception:
        db.rollback()
        logger.exception("Failed to persist attempt for draft=%s", draft_id)
        return None
    finally:
        db.close()


def _persist_classifications(
    db: Session,
    entity_id: UUID,
    created_lines: list,
    lines_data: list[dict],
    debit_cls: dict,
    credit_cls: dict,
) -> None:
    """Match classifier output to created lines and persist TraceClassifications."""
    debit_lines = debit_cls.get("lines") or []
    credit_lines = credit_cls.get("lines") or []
    cls_by_account: dict[str, dict] = {}
    for cl in debit_lines + credit_lines:
        key = cl.get("account_name", "")
        cls_by_account[key] = cl

    for line_row, line_data in zip(created_lines, lines_data):
        account_name = line_data.get("account_name", "")
        cls = cls_by_account.get(account_name)
        if cls:
            TraceClassificationDAO.create(
                db,
                entity_id=entity_id,
                drafted_entry_line_id=line_row.id,
                type=cls.get("type", ""),
                direction=cls.get("direction", ""),
                taxonomy=cls.get("taxonomy", ""),
            )
