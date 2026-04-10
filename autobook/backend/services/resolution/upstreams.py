"""Upstream implementations for the human tier.

Each upstream knows how to extract its slice from the result
and write to the correct Qdrant memory.
"""
from __future__ import annotations

import logging
from typing import Any

from vectordb.memory import QdrantMemory

logger = logging.getLogger(__name__)


class NormalizerUpstream:
    """Writes normalizer correction to the normalizer_corrections collection."""

    def __init__(self, memory: QdrantMemory):
        self.memory = memory

    def backward(self, result: Any) -> None:
        r = result.get("normalizer")
        if not r:
            return
        self.memory.write(r["payload"], key=r["key"], point_id=r["point_id"])
        logger.info("Wrote normalizer correction point_id=%s", r["point_id"])


class AgentUpstream:
    """Writes agent correction to the agent_corrections collection."""

    def __init__(self, memory: QdrantMemory):
        self.memory = memory

    def backward(self, result: Any) -> None:
        r = result.get("agent")
        if not r:
            return
        self.memory.write(r["payload"], key=r["key"], point_id=r["point_id"])
        logger.info("Wrote agent correction point_id=%s", r["point_id"])
