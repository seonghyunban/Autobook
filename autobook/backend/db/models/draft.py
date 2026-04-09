from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db.models.base import Base

if TYPE_CHECKING:
    from db.models.entity import Entity
    from db.models.trace import Trace
    from db.models.transaction import Transaction


class Draft(Base):
    """One parse session of a transaction. A transaction can have many
    drafts; each draft owns at most one attempt trace and one correction
    trace via the UNIQUE(draft_id, kind) constraint on traces.

    Re-running the agent on the same transaction creates a new draft row.
    Drafts live entirely in the pre-ledger layer — the append-only
    ``posted_entries`` ledger does not reference drafts. When a draft's
    entry is posted, the posting snapshots the lines into
    ``posted_entry_lines`` and then the draft can continue to be edited
    freely (editing the draft has no effect on the already-posted rows).
    """

    __tablename__ = "drafts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.uuidv7()
    )
    entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("entities.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    transaction_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("transactions.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # ── relationships ──────────────────────────────────────────
    entity: Mapped["Entity"] = relationship("Entity")
    transaction: Mapped["Transaction"] = relationship(
        "Transaction", back_populates="drafts"
    )
    traces: Mapped[list["Trace"]] = relationship(
        "Trace", back_populates="draft", cascade="all, delete-orphan"
    )
