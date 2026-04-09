from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db.models.base import Base

if TYPE_CHECKING:
    from db.models.trace import Trace


class TraceAmbiguity(Base):
    """A single ambiguity flagged by the decision-maker agent during
    a parse. Each ambiguity names an aspect (e.g., "capital vs expense"),
    carries the conventional + IFRS defaults, and may list zero or more
    candidate cases (interpretations) under it.
    """

    __tablename__ = "trace_ambiguities"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.uuidv7()
    )
    trace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("traces.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("entities.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    aspect: Mapped[str] = mapped_column(String(255), nullable=False)
    ambiguous: Mapped[bool] = mapped_column(Boolean, nullable=False)
    conventional_default: Mapped[str | None] = mapped_column(Text)
    ifrs_default: Mapped[str | None] = mapped_column(Text)
    clarification_question: Mapped[str | None] = mapped_column(Text)

    # ── relationships ──────────────────────────────────────────
    trace: Mapped["Trace"] = relationship("Trace", back_populates="ambiguities")
    cases: Mapped[list["TraceAmbiguityCase"]] = relationship(
        "TraceAmbiguityCase",
        back_populates="ambiguity",
        cascade="all, delete-orphan",
    )


class TraceAmbiguityCase(Base):
    """One possible interpretation of an ambiguity.

    `proposed_entry_json` is an optional structured sketch of the journal
    entry under this interpretation. It's the only deliberate JSONB
    column in the pre-ledger layer — justified because it's variable-shape,
    read-whole (never queried field-by-field), never mutated after creation,
    never posted to the ledger, and only used for display in the review
    panel. Previously modeled as a separate `proposed_entries` +
    `proposed_entry_lines` pair; collapsed because the two tables bought
    nothing over the JSONB blob for a display-only proposal.
    """

    __tablename__ = "trace_ambiguity_cases"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.uuidv7()
    )
    ambiguity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("trace_ambiguities.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("entities.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    case_text: Mapped[str] = mapped_column(Text, nullable=False)
    proposed_entry_json: Mapped[dict | None] = mapped_column(JSONB)

    # ── relationships ──────────────────────────────────────────
    ambiguity: Mapped["TraceAmbiguity"] = relationship(
        "TraceAmbiguity", back_populates="cases"
    )
