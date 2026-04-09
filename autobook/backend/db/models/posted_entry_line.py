from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Integer,
    Numeric,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db.models.base import Base

if TYPE_CHECKING:
    from db.models.posted_entry import PostedEntry


class PostedEntryLine(Base):
    """One debit or credit line of a posted ledger entry. Immutable —
    never updated, never deleted. Snapshotted from a `DraftedEntryLine`
    at posting time; any correction after posting happens by appending
    new `posted_entries` + `posted_entry_lines` rows (reverse + re-post).

    `account_name` is an immutable snapshot at posting time — frozen so
    renaming the COA later does not rewrite ledger history.
    """

    __tablename__ = "posted_entry_lines"
    __table_args__ = (
        CheckConstraint(
            "type IN ('debit', 'credit')", name="ck_posted_entry_lines_type"
        ),
        CheckConstraint(
            "amount > 0", name="ck_posted_entry_lines_amount_positive"
        ),
        CheckConstraint(
            "currency ~ '^[A-Z]{3}$'",
            name="ck_posted_entry_lines_currency_iso4217",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.uuidv7()
    )
    posted_entry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("posted_entries.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )
    entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("entities.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )
    line_order: Mapped[int] = mapped_column(Integer, nullable=False)
    account_code: Mapped[str] = mapped_column(String(20), nullable=False)
    account_name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(10), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)

    # ── relationships ──────────────────────────────────────────
    posted_entry: Mapped["PostedEntry"] = relationship(
        "PostedEntry", back_populates="lines"
    )
