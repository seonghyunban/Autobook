from __future__ import annotations

from collections.abc import Sequence
from decimal import Decimal
from uuid import UUID

from sqlalchemy import exists, select
from sqlalchemy.orm import Session, selectinload

from db.models.posted_entry import PostedEntry
from db.models.posted_entry_line import PostedEntryLine


class PostedEntryDAO:
    """Append-only DAO for the ledger.

    - ``create_original`` inserts an original posting (reverses IS NULL)
      with the provided lines.
    - ``create_reversal`` reads the target row + lines, writes a new
      row with ``reverses = original_id`` and mirrored lines (debit ↔
      credit, same amounts).
    - ``has_active_posting`` is a pure read used by the service layer
      to enforce "no double-active-original per transaction".

    DAO does NOT validate business rules (no reverse-of-reverse, no
    double-active, period-closed checks). Those live in the posting
    service. DAO writes what it's told, reads what it's asked, nothing
    else. The DB's partial unique index
    ``uq_posted_entries_one_reversal_per_original`` is the structural
    backstop against double reversals.
    """

    # ── writes ─────────────────────────────────────────────────

    @staticmethod
    def create_original(
        db: Session,
        *,
        entity_id: UUID,
        transaction_id: UUID,
        posted_by: UUID,
        lines: Sequence[dict],
    ) -> PostedEntry:
        """Insert an ORIGINAL posting (reverses IS NULL) plus its lines.

        Each line dict must contain: line_order, account_code,
        account_name, type ('debit'|'credit'), amount, currency.
        """
        posted = PostedEntry(
            entity_id=entity_id,
            transaction_id=transaction_id,
            reverses=None,
            posted_by=posted_by,
        )
        db.add(posted)
        db.flush()

        for line in lines:
            db.add(
                PostedEntryLine(
                    posted_entry_id=posted.id,
                    entity_id=entity_id,
                    line_order=int(line["line_order"]),
                    account_code=str(line["account_code"]),
                    account_name=str(line["account_name"]),
                    type=str(line["type"]),
                    amount=Decimal(str(line["amount"])),
                    currency=str(line["currency"]),
                )
            )
        db.flush()
        return posted

    @staticmethod
    def create_reversal(
        db: Session,
        *,
        original_id: UUID,
        posted_by: UUID,
    ) -> PostedEntry:
        """Insert a REVERSAL of an existing posting. Reads the original's
        lines, flips each line's ``type`` (debit ↔ credit) while keeping
        the amount unchanged, and writes a new row with
        ``reverses = original_id``.

        Raises ``ValueError`` if the original doesn't exist. Service layer
        is responsible for rejecting reverse-of-reverse, same-entity
        checks, and any other business rule BEFORE calling this method.
        """
        original = db.get(PostedEntry, original_id)
        if original is None:
            raise ValueError(f"posted_entries row {original_id} does not exist")

        original_lines = (
            db.execute(
                select(PostedEntryLine)
                .where(PostedEntryLine.posted_entry_id == original_id)
                .order_by(PostedEntryLine.line_order)
            )
            .scalars()
            .all()
        )

        reversal = PostedEntry(
            entity_id=original.entity_id,
            transaction_id=original.transaction_id,
            reverses=original_id,
            posted_by=posted_by,
        )
        db.add(reversal)
        db.flush()

        for line in original_lines:
            db.add(
                PostedEntryLine(
                    posted_entry_id=reversal.id,
                    entity_id=original.entity_id,
                    line_order=line.line_order,
                    account_code=line.account_code,
                    account_name=line.account_name,
                    type="credit" if line.type == "debit" else "debit",
                    amount=line.amount,
                    currency=line.currency,
                )
            )
        db.flush()
        return reversal

    # ── reads ──────────────────────────────────────────────────

    @staticmethod
    def get_by_id(db: Session, posted_entry_id: UUID) -> PostedEntry | None:
        stmt = (
            select(PostedEntry)
            .options(selectinload(PostedEntry.lines))
            .where(PostedEntry.id == posted_entry_id)
        )
        return db.execute(stmt).scalar_one_or_none()

    @staticmethod
    def list_by_transaction(
        db: Session, transaction_id: UUID
    ) -> list[PostedEntry]:
        """All posted entries for a transaction, in posting order.
        Includes originals and reversals.
        """
        stmt = (
            select(PostedEntry)
            .where(PostedEntry.transaction_id == transaction_id)
            .order_by(PostedEntry.posted_at)
        )
        return list(db.execute(stmt).scalars().all())

    @staticmethod
    def has_active_posting(db: Session, transaction_id: UUID) -> bool:
        """True if an ORIGINAL (non-reversed) posting exists for this
        transaction. Used by the service layer to enforce "no
        double-active-original per transaction" before inserting a new
        original.

        An original P is "active" iff no row in posted_entries has
        ``reverses = P.id``.
        """
        # Alias the "reversal" side of the self-join.
        original = PostedEntry.__table__.alias("p_original")
        reversal = PostedEntry.__table__.alias("p_reversal")

        stmt = select(original.c.id).where(
            original.c.transaction_id == transaction_id,
            original.c.reverses.is_(None),
            ~exists().where(reversal.c.reverses == original.c.id),
        )
        return db.execute(stmt).first() is not None

    @staticmethod
    def get_reversal_for(
        db: Session, original_id: UUID
    ) -> PostedEntry | None:
        """Return the reversal that cancels the given original, or None
        if it hasn't been reversed yet.
        """
        stmt = select(PostedEntry).where(PostedEntry.reverses == original_id)
        return db.execute(stmt).scalar_one_or_none()
