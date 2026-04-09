from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from db.models.transaction_graph import (
    TransactionGraph,
    TransactionGraphEdge,
    TransactionGraphNode,
)


class TransactionGraphDAO:
    """Dumb CRUD for transaction graphs. The `create_with_nodes_and_edges`
    method is the primary entry point — the normalization service calls it
    after the LLM has produced the graph.
    """

    @staticmethod
    def create_with_nodes_and_edges(
        db: Session,
        *,
        entity_id: UUID,
        transaction_id: UUID,
        nodes: Sequence[dict],
        edges: Sequence[dict],
    ) -> TransactionGraph:
        """Insert a graph header + its nodes + its edges in one flush.

        `nodes` items must contain: node_index, name, role.
        `edges` items must contain: source_index, target_index, nature,
        edge_kind, amount (optional), currency (optional).
        """
        graph = TransactionGraph(
            entity_id=entity_id,
            transaction_id=transaction_id,
        )
        db.add(graph)
        db.flush()

        for node in nodes:
            db.add(
                TransactionGraphNode(
                    graph_id=graph.id,
                    entity_id=entity_id,
                    node_index=node["node_index"],
                    name=node["name"],
                    role=node["role"],
                )
            )

        for edge in edges:
            db.add(
                TransactionGraphEdge(
                    graph_id=graph.id,
                    entity_id=entity_id,
                    source_index=edge["source_index"],
                    target_index=edge["target_index"],
                    nature=edge["nature"],
                    edge_kind=edge["edge_kind"],
                    amount=edge.get("amount"),
                    currency=edge.get("currency"),
                )
            )

        db.flush()
        return graph

    @staticmethod
    def get_by_id(db: Session, graph_id: UUID) -> TransactionGraph | None:
        stmt = (
            select(TransactionGraph)
            .options(
                selectinload(TransactionGraph.nodes),
                selectinload(TransactionGraph.edges),
            )
            .where(TransactionGraph.id == graph_id)
        )
        return db.execute(stmt).scalar_one_or_none()

    @staticmethod
    def get_latest_for_transaction(
        db: Session, transaction_id: UUID
    ) -> TransactionGraph | None:
        stmt = (
            select(TransactionGraph)
            .where(TransactionGraph.transaction_id == transaction_id)
            .order_by(TransactionGraph.created_at.desc())
            .limit(1)
        )
        return db.execute(stmt).scalar_one_or_none()

    @staticmethod
    def list_by_transaction(
        db: Session, transaction_id: UUID
    ) -> list[TransactionGraph]:
        stmt = (
            select(TransactionGraph)
            .where(TransactionGraph.transaction_id == transaction_id)
            .order_by(TransactionGraph.created_at.desc())
        )
        return list(db.execute(stmt).scalars().all())
