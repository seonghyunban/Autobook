from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from db.models.trace_ambiguity import TraceAmbiguity


class TraceAmbiguityDAO:
    """Dumb CRUD for ambiguities (the `aspect` rows under a trace)."""

    @staticmethod
    def create(
        db: Session,
        *,
        entity_id: UUID,
        trace_id: UUID,
        aspect: str,
        ambiguous: bool,
        conventional_default: str | None = None,
        ifrs_default: str | None = None,
        clarification_question: str | None = None,
    ) -> TraceAmbiguity:
        row = TraceAmbiguity(
            entity_id=entity_id,
            trace_id=trace_id,
            aspect=aspect,
            ambiguous=ambiguous,
            conventional_default=conventional_default,
            ifrs_default=ifrs_default,
            clarification_question=clarification_question,
        )
        db.add(row)
        db.flush()
        return row

    @staticmethod
    def bulk_create(
        db: Session,
        *,
        entity_id: UUID,
        trace_id: UUID,
        ambiguities: Sequence[dict],
    ) -> list[TraceAmbiguity]:
        """Insert multiple ambiguities in one flush.

        Each dict must contain: aspect, ambiguous, and optionally
        conventional_default, ifrs_default, clarification_question.
        """
        created: list[TraceAmbiguity] = []
        for amb in ambiguities:
            row = TraceAmbiguity(
                entity_id=entity_id,
                trace_id=trace_id,
                aspect=amb["aspect"],
                ambiguous=amb["ambiguous"],
                conventional_default=amb.get("conventional_default"),
                ifrs_default=amb.get("ifrs_default"),
                clarification_question=amb.get("clarification_question"),
            )
            db.add(row)
            created.append(row)
        db.flush()
        return created

    @staticmethod
    def get_by_id(db: Session, ambiguity_id: UUID) -> TraceAmbiguity | None:
        return db.get(TraceAmbiguity, ambiguity_id)

    @staticmethod
    def list_by_trace(db: Session, trace_id: UUID) -> list[TraceAmbiguity]:
        """Return all ambiguities for a trace with cases eagerly loaded."""
        stmt = (
            select(TraceAmbiguity)
            .options(selectinload(TraceAmbiguity.cases))
            .where(TraceAmbiguity.trace_id == trace_id)
        )
        return list(db.execute(stmt).scalars().all())
