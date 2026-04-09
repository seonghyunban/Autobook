from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from db.models.drafted_entry import DraftedEntryLine
from db.models.trace_classification import TraceClassification


class TraceClassificationDAO:
    """Dumb CRUD for per-line D/C classifications (1:1 with
    drafted_entry_lines via primary key).
    """

    @staticmethod
    def create(
        db: Session,
        *,
        entity_id: UUID,
        drafted_entry_line_id: UUID,
        type: str,
        direction: str,
        taxonomy: str,
    ) -> TraceClassification:
        row = TraceClassification(
            drafted_entry_line_id=drafted_entry_line_id,
            entity_id=entity_id,
            type=type,
            direction=direction,
            taxonomy=taxonomy,
        )
        db.add(row)
        db.flush()
        return row

    @staticmethod
    def bulk_create(
        db: Session,
        *,
        entity_id: UUID,
        classifications: Sequence[dict],
    ) -> list[TraceClassification]:
        """Insert multiple classifications in one flush.

        Each dict must contain: drafted_entry_line_id, type, direction, taxonomy.
        """
        created: list[TraceClassification] = []
        for c in classifications:
            row = TraceClassification(
                drafted_entry_line_id=c["drafted_entry_line_id"],
                entity_id=entity_id,
                type=c["type"],
                direction=c["direction"],
                taxonomy=c["taxonomy"],
            )
            db.add(row)
            created.append(row)
        db.flush()
        return created

    @staticmethod
    def get_by_drafted_entry_line(
        db: Session, drafted_entry_line_id: UUID
    ) -> TraceClassification | None:
        return db.get(TraceClassification, drafted_entry_line_id)

    @staticmethod
    def list_for_drafted_entry(
        db: Session, drafted_entry_id: UUID
    ) -> list[TraceClassification]:
        stmt = (
            select(TraceClassification)
            .join(
                DraftedEntryLine,
                DraftedEntryLine.id == TraceClassification.drafted_entry_line_id,
            )
            .where(DraftedEntryLine.drafted_entry_id == drafted_entry_id)
            .order_by(DraftedEntryLine.line_order)
        )
        return list(db.execute(stmt).scalars().all())
