from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db.models.base import Base

if TYPE_CHECKING:
    from db.models.entity import Entity
    from db.models.trace import Trace
    from db.models.trace_classification import TraceClassification


class DraftedEntry(Base):
    """A working (pre-ledger) journal entry. Mutable. Owned by a trace
    (1:1 via `traces.drafted_entry_id`). Never referenced by the
    posted ledger — posting snapshots the lines into `posted_entry_lines`
    as a separate, immutable copy.
    """

    __tablename__ = "drafted_entries"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.uuidv7()
    )
    entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("entities.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    entry_reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # ── relationships ──────────────────────────────────────────
    entity: Mapped["Entity"] = relationship("Entity")
    lines: Mapped[list["DraftedEntryLine"]] = relationship(
        "DraftedEntryLine",
        back_populates="drafted_entry",
        cascade="all, delete-orphan",
        order_by="DraftedEntryLine.line_order",
    )
    traces: Mapped[list["Trace"]] = relationship(
        "Trace", back_populates="drafted_entry"
    )


class DraftedEntryLine(Base):
    """One debit or credit line of a working (pre-ledger) entry.

    `account_name` is a deliberate snapshot of `chart_of_accounts.account_name`
    at insert time — frozen so renaming the COA later does not retroactively
    rewrite the user's saved draft. DAOs MUST source it from the current
    COA on insert.
    """

    __tablename__ = "drafted_entry_lines"
    __table_args__ = (
        CheckConstraint(
            "type IN ('debit', 'credit')", name="ck_drafted_entry_lines_type"
        ),
        CheckConstraint(
            "amount > 0", name="ck_drafted_entry_lines_amount_positive"
        ),
        CheckConstraint(
            "currency ~ '^[A-Z]{3}$'",
            name="ck_drafted_entry_lines_currency_iso4217",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.uuidv7()
    )
    drafted_entry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("drafted_entries.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("entities.id", ondelete="CASCADE"),
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
    drafted_entry: Mapped["DraftedEntry"] = relationship(
        "DraftedEntry", back_populates="lines"
    )
    classification: Mapped["TraceClassification | None"] = relationship(
        "TraceClassification",
        back_populates="drafted_entry_line",
        uselist=False,
        cascade="all, delete-orphan",
    )
