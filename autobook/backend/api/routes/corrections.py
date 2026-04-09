"""Correction auto-save route — PATCH a correction trace in place.

The review panel calls this on every debounced edit. If no correction
trace exists yet for the draft, one is created (upsert semantics).

Accepts trace-level fields (decision, tax, notes) and optionally
corrected entry lines. Lines are replaced wholesale on each save
(delete old + bulk insert new) — simpler than diffing.
"""
from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth.deps import AuthContext, get_current_entity, get_current_user
from db.connection import get_db
from db.dao.drafted_entries import DraftedEntryDAO
from db.dao.drafted_entry_lines import DraftedEntryLineDAO
from db.dao.traces import AttemptedTraceDAO, CorrectedTraceDAO

router = APIRouter(prefix="/api/v1")


class CorrectionLineIn(BaseModel):
    account_code: str
    account_name: str
    type: str  # "debit" | "credit"
    amount: float
    currency: str = "CAD"


class CorrectionPatch(BaseModel):
    # Trace-level fields
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
    # Entry lines — replaced wholesale when present
    entry_reason: str | None = None
    lines: list[CorrectionLineIn] | None = None


class CorrectionResponse(BaseModel):
    trace_id: str
    kind: str


@router.patch("/drafts/{draft_id}/correction", response_model=CorrectionResponse)
def upsert_correction(
    draft_id: UUID,
    body: CorrectionPatch,
    current_user: AuthContext = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: Session = Depends(get_db),
):
    # Check attempt exists for this draft
    attempt = AttemptedTraceDAO.get_by_draft(db, draft_id)
    if attempt is None or attempt.entity_id != entity_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No attempt for this draft.")

    # Get or create correction
    correction = CorrectedTraceDAO.get_by_draft(db, draft_id)
    if correction is None:
        # Create a new DraftedEntry for the correction (separate from attempt's)
        corrected_entry = DraftedEntryDAO.create(
            db, entity_id=entity_id, entry_reason=body.entry_reason,
        )
        correction = CorrectedTraceDAO.create(
            db,
            entity_id=entity_id,
            draft_id=draft_id,
            graph_id=attempt.graph_id,
            drafted_entry_id=corrected_entry.id,
            corrected_by=current_user.user.id,
        )

    # Apply trace-level fields
    trace_fields = body.model_dump(
        exclude_none=True,
        exclude={"lines", "entry_reason"},
    )
    if trace_fields:
        CorrectedTraceDAO.update(db, correction.id, **trace_fields)

    # Update entry reason if provided
    if body.entry_reason is not None:
        DraftedEntryDAO.update(
            db, correction.drafted_entry_id, entry_reason=body.entry_reason,
        )

    # Replace entry lines wholesale if provided
    if body.lines is not None:
        DraftedEntryLineDAO.delete_by_drafted_entry(db, correction.drafted_entry_id)
        line_dicts = [
            {
                "line_order": i,
                "account_code": line.account_code,
                "account_name": line.account_name,
                "type": line.type,
                "amount": line.amount,
                "currency": line.currency,
            }
            for i, line in enumerate(body.lines)
        ]
        DraftedEntryLineDAO.bulk_create(
            db,
            entity_id=entity_id,
            drafted_entry_id=correction.drafted_entry_id,
            lines=line_dicts,
        )

    db.commit()
    return CorrectionResponse(trace_id=str(correction.id), kind="correction")


@router.post("/drafts/{draft_id}/correction/submit", response_model=CorrectionResponse)
def submit_correction(
    draft_id: UUID,
    current_user: AuthContext = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: Session = Depends(get_db),
):
    correction = CorrectedTraceDAO.get_by_draft(db, draft_id)
    if correction is None or correction.entity_id != entity_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No correction for this draft.")

    CorrectedTraceDAO.submit(db, correction.id)
    db.commit()
    return CorrectionResponse(trace_id=str(correction.id), kind="correction")
