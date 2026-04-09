from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from db.models.drafted_entry import DraftedEntry


class DraftedEntryDAO:
    """Dumb CRUD for working (pre-ledger) journal entries."""

    @staticmethod
    def create(
        db: Session,
        *,
        entity_id: UUID,
        entry_reason: str | None = None,
    ) -> DraftedEntry:
        entry = DraftedEntry(
            entity_id=entity_id,
            entry_reason=entry_reason,
        )
        db.add(entry)
        db.flush()
        return entry

    @staticmethod
    def get_by_id(db: Session, drafted_entry_id: UUID) -> DraftedEntry | None:
        stmt = (
            select(DraftedEntry)
            .options(selectinload(DraftedEntry.lines))
            .where(DraftedEntry.id == drafted_entry_id)
        )
        return db.execute(stmt).scalar_one_or_none()

    @staticmethod
    def update(
        db: Session,
        drafted_entry_id: UUID,
        *,
        entry_reason: str | None = None,
    ) -> DraftedEntry | None:
        entry = db.get(DraftedEntry, drafted_entry_id)
        if entry is None:
            return None
        if entry_reason is not None:
            entry.entry_reason = entry_reason
        db.flush()
        return entry
