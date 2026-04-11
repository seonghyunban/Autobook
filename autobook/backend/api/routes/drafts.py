"""Draft API routes — list + detail for the history/entry viewer pages."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session, selectinload

from auth.deps import AuthContext, get_current_entity, get_current_user
from db.connection import get_db
from db.models.draft import Draft
from db.models.drafted_entry import DraftedEntry, DraftedEntryLine
from db.models.trace import AttemptedTrace, CorrectedTrace, Trace
from db.models.trace_ambiguity import TraceAmbiguity, TraceAmbiguityCase
from db.models.trace_classification import TraceClassification
from db.models.transaction import Transaction
from db.models.transaction_graph import TransactionGraph

from sqlalchemy import case, select

router = APIRouter(prefix="/api/v1")


# ── Response schemas ──────────────────────────────────────


class DraftListItem(BaseModel):
    id: str
    transaction_id: str
    raw_text: str
    decision: str | None
    review_status: str
    created_at: str


class DraftListResponse(BaseModel):
    drafts: list[DraftListItem]


class GraphNodeOut(BaseModel):
    index: int
    name: str
    role: str


class GraphEdgeOut(BaseModel):
    source_index: int
    target_index: int
    source: str
    target: str
    nature: str
    kind: str
    amount: float | None
    currency: str | None


class GraphOut(BaseModel):
    nodes: list[GraphNodeOut]
    edges: list[GraphEdgeOut]


class EntryLineOut(BaseModel):
    id: str
    line_order: int
    account_code: str
    account_name: str
    type: str
    amount: float
    currency: str
    classification: dict | None = None


class EntryOut(BaseModel):
    id: str
    entry_reason: str | None
    lines: list[EntryLineOut]


class AmbiguityCaseOut(BaseModel):
    id: str
    case_text: str
    proposed_entry_json: dict | None = None


class AmbiguityOut(BaseModel):
    id: str
    aspect: str
    ambiguous: bool
    conventional_default: str | None = None
    ifrs_default: str | None = None
    clarification_question: str | None = None
    cases: list[AmbiguityCaseOut]


class TraceOut(BaseModel):
    id: str
    kind: str
    origin_tier: int | None = None
    decision_kind: str | None = None
    decision_rationale: str | None = None
    tax_reasoning: str | None = None
    tax_classification: str | None = None
    tax_rate: float | None = None
    tax_context: str | None = None
    tax_itc_eligible: bool | None = None
    tax_amount_inclusive: bool | None = None
    tax_mentioned: bool | None = None
    classifier_output: dict | None = None
    complexity_flags: list | None = None
    rag_hits: dict | None = None
    note_tx_analysis: str | None = None
    note_ambiguity: str | None = None
    note_tax: str | None = None
    note_entry: str | None = None
    ambiguities: list[AmbiguityOut]


class DraftDetailResponse(BaseModel):
    id: str
    transaction_id: str
    raw_text: str
    jurisdiction: str | None = None
    created_at: str
    graph: GraphOut | None
    entry: EntryOut | None
    correction_entry: EntryOut | None
    traces: list[TraceOut]


# ── Routes ────────────────────────────────────────────────


@router.get("/drafts", response_model=DraftListResponse)
def list_drafts(
    current_user: AuthContext = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: Session = Depends(get_db),
):
    # Alias correction trace to get review status
    attempt_trace = Trace.__table__.alias("attempt_trace")
    correction_trace = Trace.__table__.alias("correction_trace")

    review_status_col = case(
        (correction_trace.c.id.is_(None), "pending"),
        (correction_trace.c.submitted_at.isnot(None), "reviewed"),
        else_="in_review",
    ).label("review_status")

    stmt = (
        select(
            Draft,
            Transaction.raw_text,
            attempt_trace.c.decision_kind,
            review_status_col,
        )
        .join(Transaction, Transaction.id == Draft.transaction_id)
        .outerjoin(
            attempt_trace,
            (attempt_trace.c.draft_id == Draft.id) & (attempt_trace.c.kind == "attempt"),
        )
        .outerjoin(
            correction_trace,
            (correction_trace.c.draft_id == Draft.id) & (correction_trace.c.kind == "correction"),
        )
        .where(Draft.entity_id == entity_id)
        .order_by(Draft.created_at.desc())
    )
    rows = db.execute(stmt).all()
    return DraftListResponse(
        drafts=[
            DraftListItem(
                id=str(draft.id),
                transaction_id=str(draft.transaction_id),
                raw_text=raw_text,
                decision=decision_kind,
                review_status=review_status,
                created_at=draft.created_at.isoformat(),
            )
            for draft, raw_text, decision_kind, review_status in rows
        ]
    )


@router.get("/drafts/{draft_id}", response_model=DraftDetailResponse)
def get_draft(
    draft_id: UUID,
    current_user: AuthContext = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: Session = Depends(get_db),
):
    # Load draft + transaction
    draft = db.get(Draft, draft_id)
    if draft is None or draft.entity_id != entity_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Draft not found.")

    transaction = db.get(Transaction, draft.transaction_id)

    # Load traces with ambiguities + cases
    trace_stmt = (
        select(Trace)
        .options(
            selectinload(Trace.ambiguities).selectinload(TraceAmbiguity.cases),
        )
        .where(Trace.draft_id == draft_id)
        .order_by(Trace.kind)
    )
    traces = list(db.execute(trace_stmt).scalars().all())

    # Load graph from first trace's graph_id
    graph_out = None
    if traces:
        graph_row = db.get(TransactionGraph, traces[0].graph_id)
        if graph_row:
            # Eager load nodes/edges
            graph_row = (
                db.execute(
                    select(TransactionGraph)
                    .options(
                        selectinload(TransactionGraph.nodes),
                        selectinload(TransactionGraph.edges),
                    )
                    .where(TransactionGraph.id == graph_row.id)
                )
                .scalar_one()
            )
            node_names = {n.node_index: n.name for n in graph_row.nodes}
            graph_out = GraphOut(
                nodes=[
                    GraphNodeOut(index=n.node_index, name=n.name, role=n.role)
                    for n in graph_row.nodes
                ],
                edges=[
                    GraphEdgeOut(
                        source_index=e.source_index,
                        target_index=e.target_index,
                        source=node_names.get(e.source_index, ""),
                        target=node_names.get(e.target_index, ""),
                        nature=e.nature,
                        kind=e.edge_kind,
                        amount=float(e.amount) if e.amount is not None else None,
                        currency=e.currency,
                    )
                    for e in graph_row.edges
                ],
            )

    # Load entries — attempt's and correction's (if exists)
    def _load_entry(entry_id: UUID) -> EntryOut | None:
        row = (
            db.execute(
                select(DraftedEntry)
                .options(
                    selectinload(DraftedEntry.lines)
                    .selectinload(DraftedEntryLine.classification),
                )
                .where(DraftedEntry.id == entry_id)
            )
            .scalar_one_or_none()
        )
        if not row:
            return None
        return EntryOut(
            id=str(row.id),
            entry_reason=row.entry_reason,
            lines=[
                EntryLineOut(
                    id=str(line.id),
                    line_order=line.line_order,
                    account_code=line.account_code,
                    account_name=line.account_name,
                    type=line.type,
                    amount=float(line.amount),
                    currency=line.currency,
                    classification=(
                        {
                            "type": line.classification.type,
                            "direction": line.classification.direction,
                            "taxonomy": line.classification.taxonomy,
                        }
                        if line.classification
                        else None
                    ),
                )
                for line in row.lines
            ],
        )

    attempt = next((t for t in traces if t.kind == "attempt"), None)
    correction = next((t for t in traces if t.kind == "correction"), None)
    entry_out = _load_entry(attempt.drafted_entry_id) if attempt else None
    correction_entry_out = _load_entry(correction.drafted_entry_id) if correction else None

    # Build trace output
    trace_outs = []
    for t in traces:
        trace_outs.append(
            TraceOut(
                id=str(t.id),
                kind=t.kind,
                origin_tier=t.origin_tier,
                decision_kind=t.decision_kind,
                decision_rationale=t.decision_rationale,
                tax_reasoning=t.tax_reasoning,
                tax_classification=t.tax_classification,
                tax_rate=float(t.tax_rate) if t.tax_rate is not None else None,
                tax_context=t.tax_context,
                tax_itc_eligible=t.tax_itc_eligible,
                tax_amount_inclusive=t.tax_amount_inclusive,
                tax_mentioned=t.tax_mentioned,
                classifier_output=t.classifier_output,
                complexity_flags=t.complexity_flags,
                rag_hits=t.rag_hits,
                note_tx_analysis=t.note_tx_analysis,
                note_ambiguity=t.note_ambiguity,
                note_tax=t.note_tax,
                note_entry=t.note_entry,
                ambiguities=[
                    AmbiguityOut(
                        id=str(amb.id),
                        aspect=amb.aspect,
                        ambiguous=amb.ambiguous,
                        conventional_default=amb.conventional_default,
                        ifrs_default=amb.ifrs_default,
                        clarification_question=amb.clarification_question,
                        cases=[
                            AmbiguityCaseOut(
                                id=str(c.id),
                                case_text=c.case_text,
                                proposed_entry_json=c.proposed_entry_json,
                            )
                            for c in amb.cases
                        ],
                    )
                    for amb in t.ambiguities
                ],
            )
        )

    return DraftDetailResponse(
        id=str(draft.id),
        transaction_id=str(draft.transaction_id),
        raw_text=transaction.raw_text if transaction else "",
        jurisdiction=draft.jurisdiction,
        created_at=draft.created_at.isoformat(),
        graph=graph_out,
        entry=entry_out,
        correction_entry=correction_entry_out,
        traces=trace_outs,
    )
