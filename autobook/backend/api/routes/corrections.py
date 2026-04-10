"""Correction auto-save route — full replace of corrected state on each save.

The review panel sends the entire corrected trace on each debounced save.
Backend replaces everything atomically: trace fields, entry lines, graph
nodes+edges, ambiguities+cases.

On first save, clones the attempt's graph and entry as the correction's own.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth.deps import AuthContext, get_current_entity, get_current_user
from db.connection import get_db
from db.dao.drafted_entries import DraftedEntryDAO
from db.dao.drafted_entry_lines import DraftedEntryLineDAO
from db.dao.trace_ambiguities import TraceAmbiguityDAO
from db.dao.trace_ambiguity_cases import TraceAmbiguityCaseDAO
from db.dao.trace_classifications import TraceClassificationDAO
from db.dao.traces import AttemptedTraceDAO, CorrectedTraceDAO
from db.dao.transaction_graphs import TransactionGraphDAO

router = APIRouter(prefix="/api/v1")


# ── Request schemas ───────────────────────────────────────

class CorrectionLineIn(BaseModel):
    account_code: str
    account_name: str
    type: str
    amount: float
    currency: str = "CAD"


class CorrectionNodeIn(BaseModel):
    index: int
    name: str
    role: str


class CorrectionEdgeIn(BaseModel):
    source_index: int
    target_index: int
    nature: str
    kind: str
    amount: float | None = None
    currency: str | None = None


class CorrectionGraphIn(BaseModel):
    nodes: list[CorrectionNodeIn]
    edges: list[CorrectionEdgeIn]


class CorrectionAmbiguityCaseIn(BaseModel):
    case_text: str
    proposed_entry_json: dict | None = None


class CorrectionAmbiguityIn(BaseModel):
    aspect: str
    ambiguous: bool
    conventional_default: str | None = None
    ifrs_default: str | None = None
    clarification_question: str | None = None
    cases: list[CorrectionAmbiguityCaseIn] = []


class CorrectionClassificationIn(BaseModel):
    account_name: str
    type: str
    direction: str
    taxonomy: str


class CorrectionPatch(BaseModel):
    # Trace fields
    decision_kind: str | None = None
    decision_rationale: str | None = None
    tax_classification: str | None = None
    tax_rate: float | None = None
    tax_context: str | None = None
    tax_itc_eligible: bool | None = None
    tax_amount_inclusive: bool | None = None
    tax_mentioned: bool | None = None
    note_tx_analysis: str | None = None
    note_ambiguity: str | None = None
    note_tax: str | None = None
    note_entry: str | None = None
    # Entry
    entry_reason: str | None = None
    lines: list[CorrectionLineIn] | None = None
    # Graph
    graph: CorrectionGraphIn | None = None
    # Ambiguities
    ambiguities: list[CorrectionAmbiguityIn] | None = None
    # Classifications
    classifications: list[CorrectionClassificationIn] | None = None


class CorrectionResponse(BaseModel):
    trace_id: str
    kind: str


# ── Routes ────────────────────────────────────────────────


@router.patch("/drafts/{draft_id}/correction", response_model=CorrectionResponse)
def upsert_correction(
    draft_id: UUID,
    body: CorrectionPatch,
    current_user: AuthContext = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: Session = Depends(get_db),
):
    # Verify attempt exists
    attempt = AttemptedTraceDAO.get_by_draft(db, draft_id)
    if attempt is None or attempt.entity_id != entity_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No attempt for this draft.")

    # Get or create correction (with its own graph + entry cloned from attempt)
    correction = CorrectedTraceDAO.get_by_draft(db, draft_id)
    if correction is None:
        corrected_graph = TransactionGraphDAO.clone(db, attempt.graph_id, entity_id)
        corrected_entry = DraftedEntryDAO.create(
            db, entity_id=entity_id, entry_reason=body.entry_reason,
        )
        correction = CorrectedTraceDAO.create(
            db,
            entity_id=entity_id,
            draft_id=draft_id,
            graph_id=corrected_graph.id,
            drafted_entry_id=corrected_entry.id,
            corrected_by=current_user.user.id,
        )

    # ── Replace trace fields ──────────────────────────
    trace_fields = body.model_dump(
        exclude_none=True,
        exclude={"lines", "entry_reason", "graph", "ambiguities", "classifications"},
    )
    if trace_fields:
        CorrectedTraceDAO.update(db, correction.id, **trace_fields)

    # ── Replace entry ─────────────────────────────────
    if body.entry_reason is not None:
        DraftedEntryDAO.update(db, correction.drafted_entry_id, entry_reason=body.entry_reason)

    if body.lines is not None:
        DraftedEntryLineDAO.delete_by_drafted_entry(db, correction.drafted_entry_id)
        DraftedEntryLineDAO.bulk_create(
            db,
            entity_id=entity_id,
            drafted_entry_id=correction.drafted_entry_id,
            lines=[
                {
                    "line_order": i,
                    "account_code": l.account_code,
                    "account_name": l.account_name,
                    "type": l.type,
                    "amount": l.amount,
                    "currency": l.currency,
                }
                for i, l in enumerate(body.lines)
            ],
        )

    # ── Replace graph ─────────────────────────────────
    if body.graph is not None:
        TransactionGraphDAO.replace_nodes_and_edges(
            db,
            graph_id=correction.graph_id,
            entity_id=entity_id,
            nodes=[
                {"node_index": n.index, "name": n.name, "role": n.role}
                for n in body.graph.nodes
            ],
            edges=[
                {
                    "source_index": e.source_index,
                    "target_index": e.target_index,
                    "nature": e.nature,
                    "edge_kind": e.kind,
                    "amount": e.amount,
                    "currency": e.currency,
                }
                for e in body.graph.edges
            ],
        )

    # ── Replace ambiguities ───────────────────────────
    if body.ambiguities is not None:
        # Delete old
        old_ambs = TraceAmbiguityDAO.list_by_trace(db, correction.id)
        for amb in old_ambs:
            for case in amb.cases:
                db.delete(case)
            db.delete(amb)
        db.flush()

        # Insert new
        for amb in body.ambiguities:
            amb_row = TraceAmbiguityDAO.create(
                db,
                entity_id=entity_id,
                trace_id=correction.id,
                aspect=amb.aspect,
                ambiguous=amb.ambiguous,
                conventional_default=amb.conventional_default,
                ifrs_default=amb.ifrs_default,
                clarification_question=amb.clarification_question,
            )
            for case in amb.cases:
                TraceAmbiguityCaseDAO.create(
                    db,
                    entity_id=entity_id,
                    ambiguity_id=amb_row.id,
                    case_text=case.case_text,
                    proposed_entry_json=case.proposed_entry_json,
                )

    # ── Replace classifications ───────────────────────
    if body.classifications is not None and body.lines is not None:
        # Get the just-created lines to match classifications
        lines = DraftedEntryLineDAO.list_by_drafted_entry(db, correction.drafted_entry_id)
        cls_by_name = {c.account_name: c for c in body.classifications}
        for line in lines:
            cls = cls_by_name.get(line.account_name)
            if cls:
                # Delete existing if any
                existing = TraceClassificationDAO.get_by_drafted_entry_line(db, line.id)
                if existing:
                    db.delete(existing)
                    db.flush()
                TraceClassificationDAO.create(
                    db,
                    entity_id=entity_id,
                    drafted_entry_line_id=line.id,
                    type=cls.type,
                    direction=cls.direction,
                    taxonomy=cls.taxonomy,
                )

    db.commit()
    return CorrectionResponse(trace_id=str(correction.id), kind="correction")


@router.post("/drafts/{draft_id}/correction/submit", response_model=CorrectionResponse)
def submit_correction(
    draft_id: UUID,
    request: Request,
    current_user: AuthContext = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: Session = Depends(get_db),
):
    correction = CorrectedTraceDAO.get_by_draft(db, draft_id)
    if correction is None or correction.entity_id != entity_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No correction for this draft.")

    from datetime import datetime, timezone
    correction.submitted_at = datetime.now(timezone.utc)
    db.flush()

    from services.resolution.service import submit as resolution_submit
    human_tier = request.app.state.human_tier
    resolution_submit(db, draft_id, entity_id, human_tier)

    db.commit()
    return CorrectionResponse(trace_id=str(correction.id), kind="correction")
