from __future__ import annotations

from collections.abc import Sequence
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from db.models.drafted_entry import DraftedEntryLine


class DraftedEntryLineDAO:
    """Dumb CRUD for working (pre-ledger) entry lines."""

    @staticmethod
    def bulk_create(
        db: Session,
        *,
        entity_id: UUID,
        drafted_entry_id: UUID,
        lines: Sequence[dict],
    ) -> list[DraftedEntryLine]:
        """Insert multiple lines in one flush.

        Each line dict must contain: line_order, account_code, account_name,
        type ('debit'|'credit'), amount, currency.
        """
        created: list[DraftedEntryLine] = []
        for line in lines:
            row = DraftedEntryLine(
                drafted_entry_id=drafted_entry_id,
                entity_id=entity_id,
                line_order=int(line["line_order"]),
                account_code=str(line["account_code"]),
                account_name=str(line["account_name"]),
                type=str(line["type"]),
                amount=Decimal(str(line["amount"])),
                currency=str(line["currency"]),
            )
            db.add(row)
            created.append(row)
        db.flush()
        return created

    @staticmethod
    def list_by_drafted_entry(
        db: Session, drafted_entry_id: UUID
    ) -> list[DraftedEntryLine]:
        stmt = (
            select(DraftedEntryLine)
            .where(DraftedEntryLine.drafted_entry_id == drafted_entry_id)
            .order_by(DraftedEntryLine.line_order)
        )
        return list(db.execute(stmt).scalars().all())

    @staticmethod
    def delete_by_drafted_entry(db: Session, drafted_entry_id: UUID) -> int:
        """Delete all lines for a drafted entry. Used when the entry is
        being replaced by an edit (delete old lines, bulk-create new ones).
        """
        lines = DraftedEntryLineDAO.list_by_drafted_entry(db, drafted_entry_id)
        for line in lines:
            db.delete(line)
        db.flush()
        return len(lines)
