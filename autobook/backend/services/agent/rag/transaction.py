"""Retriever for transaction examples.

Queries by transaction_text via an injected memory (config["configurable"]["memory"]).
Falls back to direct Qdrant access if no memory is injected (backwards compatible).
"""
from __future__ import annotations

from typing import Any

from services.agent.graph.state import PipelineState

_TOP_K = 5


def retrieve_transaction_examples(
    state: PipelineState,
    cache_key: str,
    config: dict[str, Any] | None = None,
) -> list[dict]:
    """Retrieve similar past transactions.

    Args:
        state: Pipeline state — checks cache first.
        cache_key: Agent-specific cache key (e.g. "rag_cache_debit_classifier").
        config: LangGraph RunnableConfig. If config["configurable"]["memory"]
                exists, uses it. Otherwise falls back to direct Qdrant import.

    Returns:
        List of payload dicts from top-k similar points.
    """
    cached = state.get(cache_key)
    if cached:
        return cached

    try:
        text = state["transaction_text"]
        memory = (config or {}).get("configurable", {}).get("memory")

        if memory is not None:
            return memory.read(text, _TOP_K)

        # Fallback: direct Qdrant access (backwards compatible)
        from vectordb.client import get_qdrant_client
        from vectordb.collections import AGENT_CORRECTIONS
        from vectordb.embeddings import embed_text

        vector = embed_text(text, input_type="search_query")
        results = get_qdrant_client().query_points(
            collection_name=AGENT_CORRECTIONS,
            query=vector,
            limit=_TOP_K,
        )
        return [point.payload for point in results.points]
    except Exception:
        return []
