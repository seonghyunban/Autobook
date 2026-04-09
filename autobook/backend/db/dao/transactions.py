from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from db.models.transaction import Transaction


class TransactionDAO:
    """Dumb CRUD for transactions. The `transactions` table holds the
    raw user submission (raw text + optional file). All ML / agent /
    ledger data lives in the downstream tables, not here.
    """

    @staticmethod
    def create(
        db: Session,
        *,
        entity_id: UUID,
        submitted_by: UUID,
        raw_text: str,
        raw_file_s3_key: str | None = None,
    ) -> Transaction:
        transaction = Transaction(
            entity_id=entity_id,
            submitted_by=submitted_by,
            raw_text=raw_text,
            raw_file_s3_key=raw_file_s3_key,
        )
        db.add(transaction)
        db.flush()
        return transaction

    @staticmethod
    def get_by_id(db: Session, transaction_id: UUID) -> Transaction | None:
        return db.get(Transaction, transaction_id)

    @staticmethod
    def list_by_entity(
        db: Session,
        entity_id: UUID,
        *,
        limit: int | None = None,
    ) -> list[Transaction]:
        stmt = (
            select(Transaction)
            .where(Transaction.entity_id == entity_id)
            .order_by(Transaction.submitted_at.desc())
        )
        if limit is not None:
            stmt = stmt.limit(limit)
        return list(db.execute(stmt).scalars().all())
