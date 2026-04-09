from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db.models.base import Base

if TYPE_CHECKING:
    from db.models.posted_entry_line import PostedEntryLine
    from db.models.transaction import Transaction
    from db.models.user import User


class PostedEntry(Base):
    """Append-only ledger header. Every row is either an ORIGINAL posting
    (``reverses IS NULL``) or a REVERSAL of another posting
    (``reverses`` = the cancelled row's id).

    A transaction can have many rows over time — original plus any number
    of correction cycles (reverse + re-post). Current state is always
    derived by summing lines, never stored.

    Invariants:

    - **DB-enforced**: at most one reversal per original (partial unique
      index ``uq_posted_entries_one_reversal_per_original``).
    - **Service-enforced**: no double-active-original per transaction;
      no reverse-of-reverse; reversal's lines are the swapped-type mirror
      of the target's lines.

    Modification is NOT a primitive — it's just "append a reversal +
    append a new original". Nothing in this table ever UPDATEs or DELETEs.
    """

    __tablename__ = "posted_entries"
    __table_args__ = (
        # At most one reversal per original row (partial unique).
        Index(
            "uq_posted_entries_one_reversal_per_original",
            "reverses",
            unique=True,
            postgresql_where=text("reverses IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.uuidv7()
    )
    entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("entities.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )
    transaction_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("transactions.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )
    reverses: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("posted_entries.id", ondelete="RESTRICT"),
        index=True,
    )
    posted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    posted_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )

    # ── relationships ──────────────────────────────────────────
    transaction: Mapped["Transaction"] = relationship("Transaction")
    poster: Mapped["User"] = relationship("User", foreign_keys=[posted_by])
    lines: Mapped[list["PostedEntryLine"]] = relationship(
        "PostedEntryLine",
        back_populates="posted_entry",
        order_by="PostedEntryLine.line_order",
    )
    # Self-referential: if this row is a reversal, walks to the original
    # posting it cancels. For originals (reverses IS NULL), this is None.
    # The reverse direction (original → its reversal) is not exposed here;
    # the DAO can query it explicitly when needed.
    reverses_entry: Mapped["PostedEntry | None"] = relationship(
        "PostedEntry",
        remote_side=[id],
    )
