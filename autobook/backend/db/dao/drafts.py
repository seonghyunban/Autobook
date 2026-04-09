from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from db.models.draft import Draft


class DraftDAO:
    """Dumb CRUD for drafts (parse sessions)."""

    @staticmethod
    def create(
        db: Session,
        *,
        entity_id: UUID,
        transaction_id: UUID,
    ) -> Draft:
        draft = Draft(entity_id=entity_id, transaction_id=transaction_id)
        db.add(draft)
        db.flush()
        return draft

    @staticmethod
    def get_by_id(db: Session, draft_id: UUID) -> Draft | None:
        return db.get(Draft, draft_id)

    @staticmethod
    def list_by_transaction(db: Session, transaction_id: UUID) -> list[Draft]:
        stmt = (
            select(Draft)
            .where(Draft.transaction_id == transaction_id)
            .order_by(Draft.created_at.desc())
        )
        return list(db.execute(stmt).scalars().all())

    @staticmethod
    def latest_for_transaction(
        db: Session, transaction_id: UUID
    ) -> Draft | None:
        stmt = (
            select(Draft)
            .where(Draft.transaction_id == transaction_id)
            .order_by(Draft.created_at.desc())
            .limit(1)
        )
        return db.execute(stmt).scalar_one_or_none()
