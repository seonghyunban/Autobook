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
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db.models.base import Base

if TYPE_CHECKING:
    from db.models.entity import Entity
    from db.models.trace import Trace
    from db.models.transaction import Transaction


class TransactionGraph(Base):
    """Normalized transaction graph header (one per agent run).

    Produced by the normalization service from the raw transaction text.
    Owns a list of nodes (the parties involved) and edges (the value
    flows between them). Referenced by traces via graph_id.
    """

    __tablename__ = "transaction_graphs"

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
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # ── relationships ──────────────────────────────────────────
    entity: Mapped["Entity"] = relationship("Entity")
    transaction: Mapped["Transaction"] = relationship(
        "Transaction", back_populates="graphs"
    )
    nodes: Mapped[list["TransactionGraphNode"]] = relationship(
        "TransactionGraphNode",
        back_populates="graph",
        cascade="all, delete-orphan",
        order_by="TransactionGraphNode.node_index",
    )
    edges: Mapped[list["TransactionGraphEdge"]] = relationship(
        "TransactionGraphEdge", back_populates="graph", cascade="all, delete-orphan"
    )
    traces: Mapped[list["Trace"]] = relationship("Trace", back_populates="graph")


class TransactionGraphNode(Base):
    """A node in the transaction graph — a party involved in the
    transaction (reporting entity, counterparty, or indirect party).

    Composite PK on (graph_id, node_index) — node_index is 0, 1, 2, ...
    in emission order and serves as the join key for edges.
    """

    __tablename__ = "transaction_graph_nodes"
    __table_args__ = (
        CheckConstraint(
            "role IN ('reporting_entity', 'counterparty', 'indirect_party')",
            name="ck_graph_nodes_role",
        ),
    )

    graph_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("transaction_graphs.id", ondelete="CASCADE"),
        primary_key=True,
    )
    node_index: Mapped[int] = mapped_column(Integer, primary_key=True)
    entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("entities.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(30), nullable=False)

    # ── relationships ──────────────────────────────────────────
    graph: Mapped["TransactionGraph"] = relationship(
        "TransactionGraph", back_populates="nodes"
    )


class TransactionGraphEdge(Base):
    """A directed edge between two graph nodes — one value flow.

    References nodes by their composite key (graph_id, source_index)
    and (graph_id, target_index). Edge kind distinguishes reciprocal
    exchanges, chained exchanges, non-exchanges, and relationships.
    """

    __tablename__ = "transaction_graph_edges"
    __table_args__ = (
        CheckConstraint(
            "edge_kind IN ('reciprocal_exchange', 'chained_exchange', "
            "'non_exchange', 'relationship')",
            name="ck_graph_edges_kind",
        ),
        CheckConstraint(
            "currency IS NULL OR currency ~ '^[A-Z]{3}$'",
            name="ck_graph_edges_currency_iso4217",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.uuidv7()
    )
    graph_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("transaction_graphs.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("entities.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    source_index: Mapped[int] = mapped_column(Integer, nullable=False)
    target_index: Mapped[int] = mapped_column(Integer, nullable=False)
    nature: Mapped[str] = mapped_column(String(100), nullable=False)
    edge_kind: Mapped[str] = mapped_column(String(30), nullable=False)
    amount: Mapped[float | None] = mapped_column(Numeric(15, 2))
    currency: Mapped[str | None] = mapped_column(String(3))

    # ── relationships ──────────────────────────────────────────
    graph: Mapped["TransactionGraph"] = relationship(
        "TransactionGraph", back_populates="edges"
    )
