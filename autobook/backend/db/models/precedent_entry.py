from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db.models.base import Base

if TYPE_CHECKING:
    from db.models.entity import Entity
    from db.models.posted_entry import PostedEntry


class PrecedentEntry(Base):
    """Precedent matcher (Tier 2 of the 4-tier cascade). Stores
    human-confirmed structural fingerprints of past posted entries.

    Moved from services/precedent/models.py and rewritten:
      - ``user_id`` → ``entity_id`` (tenancy moves to entity)
      - ``source_journal_entry_id`` → ``source_posted_entry_id``
        (FK now references ``posted_entries`` — the append-only ledger
        header — instead of the deleted ``journal_entries`` table)
      - Index renamed to ``ix_precedent_entries_entity_vendor_created``

    JSONB on ``structure`` + ``ratio`` is deliberate — these are
    variable-shape bags the matcher reads as a whole.
    """

    __tablename__ = "precedent_entries"
    __table_args__ = (
        Index(
            "ix_precedent_entries_entity_vendor_created",
            "entity_id",
            "vendor",
            "created_at",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.uuidv7()
    )
    entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("entities.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    vendor: Mapped[str] = mapped_column(Text, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    structure_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    structure: Mapped[dict] = mapped_column(JSONB, nullable=False)
    ratio: Mapped[dict] = mapped_column(JSONB, nullable=False)
    source_posted_entry_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("posted_entries.id", ondelete="SET NULL"),
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # ── relationships ──────────────────────────────────────────
    entity: Mapped["Entity"] = relationship("Entity")
    source_posted_entry: Mapped["PostedEntry | None"] = relationship("PostedEntry")
