from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db.models.base import Base

if TYPE_CHECKING:
    from db.models.draft import Draft
    from db.models.drafted_entry import DraftedEntry
    from db.models.entity import Entity
    from db.models.trace_ambiguity import TraceAmbiguity
    from db.models.transaction_graph import TransactionGraph
    from db.models.user import User


class Trace(Base):
    """Single-table inheritance root. Every row is either an
    AttemptedTrace or a CorrectedTrace, distinguished by the `kind`
    discriminator. Subclasses below add their kind-specific semantics
    via the same physical table — no extra DDL.

    UNIQUE(draft_id, kind) enforces at most one attempt + one correction
    per draft. Re-running the agent creates a new draft, not a new trace.
    """

    __tablename__ = "traces"
    __table_args__ = (
        UniqueConstraint("draft_id", "kind", name="uq_traces_draft_kind"),
        CheckConstraint(
            "kind IN ('attempt', 'correction')", name="ck_traces_kind"
        ),
        CheckConstraint(
            "origin_tier IS NULL OR origin_tier BETWEEN 1 AND 4",
            name="ck_traces_origin_tier",
        ),
        CheckConstraint(
            "decision_kind IS NULL OR decision_kind IN "
            "('PROCEED', 'MISSING_INFO', 'STUCK')",
            name="ck_traces_decision_kind",
        ),
        CheckConstraint(
            "tax_classification IS NULL OR tax_classification IN "
            "('taxable', 'zero_rated', 'exempt', 'out_of_scope')",
            name="ck_traces_tax_classification",
        ),
    )
    __mapper_args__ = {
        "polymorphic_on": "kind",
        "polymorphic_identity": "trace",  # never used directly
    }

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.uuidv7()
    )
    entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("entities.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    draft_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("drafts.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    graph_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("transaction_graphs.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )
    drafted_entry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("drafted_entries.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )
    kind: Mapped[str] = mapped_column(String(10), nullable=False)

    # ── attempt-only columns ──────────────────────────────────
    origin_tier: Mapped[int | None] = mapped_column(SmallInteger)
    tax_reasoning: Mapped[str | None] = mapped_column(Text)

    # ── correction-only columns ───────────────────────────────
    corrected_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        index=True,
    )
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    note_tx_analysis: Mapped[str | None] = mapped_column(Text)
    note_ambiguity: Mapped[str | None] = mapped_column(Text)
    note_tax: Mapped[str | None] = mapped_column(Text)
    note_entry: Mapped[str | None] = mapped_column(Text)

    # ── shared reasoning ──────────────────────────────────────
    decision_kind: Mapped[str | None] = mapped_column(String(20))
    decision_rationale: Mapped[str | None] = mapped_column(Text)
    tax_classification: Mapped[str | None] = mapped_column(String(20))
    tax_rate: Mapped[float | None] = mapped_column(Numeric(5, 4))
    tax_context: Mapped[str | None] = mapped_column(Text)
    tax_itc_eligible: Mapped[bool | None] = mapped_column(Boolean)
    tax_amount_inclusive: Mapped[bool | None] = mapped_column(Boolean)
    tax_mentioned: Mapped[bool | None] = mapped_column(Boolean)

    # ── lifecycle ─────────────────────────────────────────────
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # ── relationships ─────────────────────────────────────────
    entity: Mapped["Entity"] = relationship("Entity")
    draft: Mapped["Draft"] = relationship("Draft", back_populates="traces")
    graph: Mapped["TransactionGraph"] = relationship(
        "TransactionGraph", back_populates="traces"
    )
    drafted_entry: Mapped["DraftedEntry"] = relationship(
        "DraftedEntry", back_populates="traces"
    )
    corrector: Mapped["User | None"] = relationship(
        "User", foreign_keys=[corrected_by]
    )
    ambiguities: Mapped[list["TraceAmbiguity"]] = relationship(
        "TraceAmbiguity", back_populates="trace", cascade="all, delete-orphan"
    )


class AttemptedTrace(Trace):
    """Agent's attempt at a draft. Owns origin_tier + tax_reasoning
    (agent-generated fields). SQLAlchemy auto-sets kind='attempt' on
    insert via polymorphic_identity, and SELECT queries against
    AttemptedTrace auto-filter by kind='attempt'.
    """

    __mapper_args__ = {"polymorphic_identity": "attempt"}


class CorrectedTrace(Trace):
    """User's correction of an agent attempt. Owns the note_* fields,
    corrected_by, and submitted_at. Mutable until submitted_at is set,
    then immutable until the owning draft's entry is posted.
    """

    __mapper_args__ = {"polymorphic_identity": "correction"}
