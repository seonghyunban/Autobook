from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from db.models.trace_ambiguity import TraceAmbiguityCase


class TraceAmbiguityCaseDAO:
    """Dumb CRUD for ambiguity cases (possible interpretations under
    an ambiguity row).
    """

    @staticmethod
    def create(
        db: Session,
        *,
        entity_id: UUID,
        ambiguity_id: UUID,
        case_text: str,
        proposed_entry_json: dict | None = None,
    ) -> TraceAmbiguityCase:
        row = TraceAmbiguityCase(
            entity_id=entity_id,
            ambiguity_id=ambiguity_id,
            case_text=case_text,
            proposed_entry_json=proposed_entry_json,
        )
        db.add(row)
        db.flush()
        return row

    @staticmethod
    def bulk_create(
        db: Session,
        *,
        entity_id: UUID,
        ambiguity_id: UUID,
        cases: Sequence[dict],
    ) -> list[TraceAmbiguityCase]:
        """Insert multiple cases under one ambiguity in one flush.

        Each dict must contain: case_text. Optional: proposed_entry_json.
        """
        created: list[TraceAmbiguityCase] = []
        for c in cases:
            row = TraceAmbiguityCase(
                entity_id=entity_id,
                ambiguity_id=ambiguity_id,
                case_text=c["case_text"],
                proposed_entry_json=c.get("proposed_entry_json"),
            )
            db.add(row)
            created.append(row)
        db.flush()
        return created

    @staticmethod
    def get_by_id(db: Session, case_id: UUID) -> TraceAmbiguityCase | None:
        return db.get(TraceAmbiguityCase, case_id)

    @staticmethod
    def list_by_ambiguity(
        db: Session, ambiguity_id: UUID
    ) -> list[TraceAmbiguityCase]:
        stmt = (
            select(TraceAmbiguityCase)
            .where(TraceAmbiguityCase.ambiguity_id == ambiguity_id)
        )
        return list(db.execute(stmt).scalars().all())
