from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from db.models.trace import AttemptedTrace, CorrectedTrace, Trace


class AttemptedTraceDAO:
    """Dumb CRUD for the agent's attempt traces. SQLAlchemy single-table
    inheritance auto-filters every query by `kind='attempt'`.
    """

    @staticmethod
    def create(
        db: Session,
        *,
        entity_id: UUID,
        draft_id: UUID,
        graph_id: UUID,
        drafted_entry_id: UUID,
        origin_tier: int | None = None,
        tax_reasoning: str | None = None,
        decision_kind: str | None = None,
        decision_rationale: str | None = None,
        tax_classification: str | None = None,
        tax_rate: Decimal | None = None,
        tax_context: str | None = None,
        tax_itc_eligible: bool | None = None,
        tax_amount_inclusive: bool | None = None,
        tax_mentioned: bool | None = None,
        classifier_output: dict | None = None,
        complexity_flags: list | None = None,
        rag_hits: dict | None = None,
    ) -> AttemptedTrace:
        trace = AttemptedTrace(
            entity_id=entity_id,
            draft_id=draft_id,
            graph_id=graph_id,
            drafted_entry_id=drafted_entry_id,
            origin_tier=origin_tier,
            tax_reasoning=tax_reasoning,
            decision_kind=decision_kind,
            decision_rationale=decision_rationale,
            tax_classification=tax_classification,
            tax_rate=tax_rate,
            tax_context=tax_context,
            tax_itc_eligible=tax_itc_eligible,
            tax_amount_inclusive=tax_amount_inclusive,
            tax_mentioned=tax_mentioned,
            classifier_output=classifier_output,
            complexity_flags=complexity_flags,
            rag_hits=rag_hits,
        )
        db.add(trace)
        db.flush()
        return trace

    @staticmethod
    def get_by_id(db: Session, trace_id: UUID) -> AttemptedTrace | None:
        return db.get(AttemptedTrace, trace_id)

    @staticmethod
    def get_by_draft(db: Session, draft_id: UUID) -> AttemptedTrace | None:
        stmt = select(AttemptedTrace).where(AttemptedTrace.draft_id == draft_id)
        return db.execute(stmt).scalar_one_or_none()


class CorrectedTraceDAO:
    """Dumb CRUD for the user's correction traces. SQLAlchemy single-table
    inheritance auto-filters every query by `kind='correction'`. Updates
    happen in place until `submitted_at` is set — service layer enforces
    that rule, DAO is dumb.
    """

    @staticmethod
    def create(
        db: Session,
        *,
        entity_id: UUID,
        draft_id: UUID,
        graph_id: UUID,
        drafted_entry_id: UUID,
        corrected_by: UUID | None = None,
        note_tx_analysis: str | None = None,
        note_ambiguity: str | None = None,
        note_tax: str | None = None,
        note_entry: str | None = None,
        decision_kind: str | None = None,
        decision_rationale: str | None = None,
        tax_classification: str | None = None,
        tax_rate: Decimal | None = None,
        tax_context: str | None = None,
        tax_itc_eligible: bool | None = None,
        tax_amount_inclusive: bool | None = None,
        tax_mentioned: bool | None = None,
    ) -> CorrectedTrace:
        trace = CorrectedTrace(
            entity_id=entity_id,
            draft_id=draft_id,
            graph_id=graph_id,
            drafted_entry_id=drafted_entry_id,
            corrected_by=corrected_by,
            note_tx_analysis=note_tx_analysis,
            note_ambiguity=note_ambiguity,
            note_tax=note_tax,
            note_entry=note_entry,
            decision_kind=decision_kind,
            decision_rationale=decision_rationale,
            tax_classification=tax_classification,
            tax_rate=tax_rate,
            tax_context=tax_context,
            tax_itc_eligible=tax_itc_eligible,
            tax_amount_inclusive=tax_amount_inclusive,
            tax_mentioned=tax_mentioned,
        )
        db.add(trace)
        db.flush()
        return trace

    @staticmethod
    def get_by_id(db: Session, trace_id: UUID) -> CorrectedTrace | None:
        return db.get(CorrectedTrace, trace_id)

    @staticmethod
    def get_by_draft(db: Session, draft_id: UUID) -> CorrectedTrace | None:
        stmt = select(CorrectedTrace).where(CorrectedTrace.draft_id == draft_id)
        return db.execute(stmt).scalar_one_or_none()

    @staticmethod
    def update(
        db: Session,
        trace_id: UUID,
        **fields,
    ) -> CorrectedTrace | None:
        """Mutate a correction row in place. Accepts any correction-only
        or shared-reasoning field as kwargs.
        """
        trace = db.get(CorrectedTrace, trace_id)
        if trace is None:
            return None
        for key, value in fields.items():
            if value is not None:
                setattr(trace, key, value)
        db.flush()
        return trace

    @staticmethod
    def submit(db: Session, trace_id: UUID) -> CorrectedTrace | None:
        """Mark a correction as submitted (sets submitted_at to now)."""
        trace = db.get(CorrectedTrace, trace_id)
        if trace is None:
            return None
        trace.submitted_at = datetime.now(tz=timezone.utc)
        db.flush()
        return trace


class TraceDAO:
    """Cross-kind queries (both attempt and correction). Used for ML
    training pair export and RAG ingestion.
    """

    @staticmethod
    def get_pair_for_draft(
        db: Session, draft_id: UUID
    ) -> tuple[AttemptedTrace | None, CorrectedTrace | None]:
        attempt = AttemptedTraceDAO.get_by_draft(db, draft_id)
        correction = CorrectedTraceDAO.get_by_draft(db, draft_id)
        return attempt, correction

    @staticmethod
    def list_by_transaction(
        db: Session, transaction_id: UUID
    ) -> list[Trace]:
        """All traces (both kinds) across all drafts of a transaction,
        ordered by the draft's creation time.
        """
        from db.models.draft import Draft

        stmt = (
            select(Trace)
            .join(Draft, Draft.id == Trace.draft_id)
            .where(Draft.transaction_id == transaction_id)
            .order_by(Draft.created_at, Trace.kind)
        )
        return list(db.execute(stmt).scalars().all())
