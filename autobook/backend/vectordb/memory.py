"""QdrantMemory — implements ripple-through Memory protocol.

Wraps Qdrant client + Cohere embedding. Handles embed + query/upsert
internally. Supports entity_id filtering for localized vs population queries.
"""
from __future__ import annotations

import logging
from typing import Any

from qdrant_client import QdrantClient
from qdrant_client.models import Filter, FieldCondition, MatchValue, PointStruct

from vectordb.embeddings import embed_text

logger = logging.getLogger(__name__)


class QdrantMemory:
    """Qdrant-backed memory for ripple-through.

    Args:
        client: QdrantClient instance (shared, thread-safe).
        collection: Qdrant collection name.
        entity_id: If set, read() filters by this entity_id (localized).
                   If None, read() returns all (population).
        k: Default number of results for read().

    Usage:
        local = QdrantMemory(client, "agent_corrections", entity_id="abc-123")
        pop   = QdrantMemory(client, "agent_corrections", entity_id=None)

        hits = local.read("some transaction text", k=5)
        pop.write(result, key="some text", point_id="draft-uuid")
    """

    def __init__(
        self,
        client: QdrantClient,
        collection: str,
        entity_id: str | None = None,
        k: int = 5,
        score_threshold: float = 0.60,
    ):
        self.client = client
        self.collection = collection
        self.entity_id = entity_id
        self.k = k
        self.score_threshold = score_threshold

    def read(self, key: Any, **kwargs: Any) -> list[dict]:
        """Embed key text, query Qdrant, return payloads.

        Args:
            key: Text to embed as search query.
            **kwargs: Optional overrides — k (int).

        Returns:
            List of payload dicts from top-k similar points.
        """
        k = kwargs.get("k", self.k)

        try:
            vector = embed_text(str(key), input_type="search_query")

            query_filter = None
            if self.entity_id is not None:
                query_filter = Filter(
                    must=[
                        FieldCondition(
                            key="entity_id",
                            match=MatchValue(value=self.entity_id),
                        )
                    ]
                )

            threshold = kwargs.get("score_threshold", self.score_threshold)

            results = self.client.query_points(
                collection_name=self.collection,
                query=vector,
                query_filter=query_filter,
                limit=k,
                score_threshold=threshold,
            )
            return [point.payload for point in results.points]
        except Exception:
            logger.exception("QdrantMemory.read failed for collection=%s", self.collection)
            return []

    def write(self, value: Any, **kwargs: Any) -> None:
        """Embed key text, upsert point with payload.

        Args:
            value: The payload dict to store.
            **kwargs:
                key (str): Text to embed as search_document. Required.
                point_id (str): Qdrant point ID (UUID string). Required.

        Raises:
            ValueError: If key or point_id not provided.
        """
        key = kwargs.get("key")
        point_id = kwargs.get("point_id")

        if not key or not point_id:
            raise ValueError("QdrantMemory.write requires key and point_id in kwargs")

        try:
            vector = embed_text(str(key), input_type="search_document")

            self.client.upsert(
                collection_name=self.collection,
                points=[
                    PointStruct(
                        id=point_id,
                        vector=vector,
                        payload=value if isinstance(value, dict) else {"data": value},
                    )
                ],
            )
        except Exception:
            logger.exception("QdrantMemory.write failed for collection=%s", self.collection)
            raise
