from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db.models.base import Base

if TYPE_CHECKING:
    from db.models.drafted_entry import DraftedEntryLine


class TraceClassification(Base):
    """Per-line D/C classification produced by the agent's debit/credit
    classifier sub-agents.

    1:1 with `drafted_entry_lines` — the PK is `drafted_entry_line_id`.
    Each drafted line gets one classification (account type, direction,
    taxonomy). Conceptually this is agent reasoning output, not an
    entry-line attribute, which is why it lives in its own table — but
    physically it's keyed by the line because the relationship is exactly
    one-to-one.
    """

    __tablename__ = "trace_classifications"

    drafted_entry_line_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("drafted_entry_lines.id", ondelete="CASCADE"),
        primary_key=True,
    )
    entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("entities.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    type: Mapped[str] = mapped_column(String(30), nullable=False)
    direction: Mapped[str] = mapped_column(String(20), nullable=False)
    taxonomy: Mapped[str] = mapped_column(String(255), nullable=False)

    # ── relationships ──────────────────────────────────────────
    drafted_entry_line: Mapped["DraftedEntryLine"] = relationship(
        "DraftedEntryLine", back_populates="classification"
    )
