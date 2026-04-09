from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db.models.base import Base

if TYPE_CHECKING:
    from db.models.draft import Draft
    from db.models.entity import Entity
    from db.models.posted_entry import PostedEntry
    from db.models.transaction_graph import TransactionGraph
    from db.models.user import User


class Transaction(Base):
    """A user submission of raw transaction text.

    Owned by an entity (the company whose books this transaction affects).
    `submitted_by` is an audit FK to the user who typed it in — not a
    tenancy axis.
    """

    __tablename__ = "transactions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.uuidv7()
    )
    entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("entities.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    submitted_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )
    raw_text: Mapped[str] = mapped_column(Text, nullable=False)
    raw_file_s3_key: Mapped[str | None] = mapped_column(String(500))
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # ── relationships ──────────────────────────────────────────
    entity: Mapped["Entity"] = relationship("Entity", back_populates="transactions")
    submitter: Mapped["User"] = relationship("User", foreign_keys=[submitted_by])
    drafts: Mapped[list["Draft"]] = relationship(
        "Draft", back_populates="transaction", cascade="all, delete-orphan"
    )
    graphs: Mapped[list["TransactionGraph"]] = relationship(
        "TransactionGraph", back_populates="transaction", cascade="all, delete-orphan"
    )
    # Zero or many posted entries per transaction over time:
    # at most one active original, plus optional reversals/corrections.
    # Current state is always derived by summing lines, never stored.
    posted_entries: Mapped[list["PostedEntry"]] = relationship(
        "PostedEntry",
        primaryjoin="Transaction.id == PostedEntry.transaction_id",
        order_by="PostedEntry.posted_at",
    )
