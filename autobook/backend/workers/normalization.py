"""Normalization worker — polls SQS-normalization for LLM interaction messages.

Flow:
  1. Receive message from SQS-normalization (source=llm_interaction)
  2. Normalize transaction text → TransactionGraph (with SSE streaming)
  3. Persist Draft + TransactionGraph to DB
  4. Enqueue draft_id + graph_id to SQS-agent
"""

import json
import logging
import signal
import threading
from concurrent.futures import ThreadPoolExecutor
from uuid import UUID

from config import get_settings
from db.connection import SessionLocal
from db.dao.drafts import DraftDAO
from db.dao.transaction_graphs import TransactionGraphDAO
from queues.pubsub import pub
from queues.sqs import client as sqs_client
from queues.sqs.enqueue import agent as enqueue_agent
from services.normalization.service import normalize, normalize_stream
from vectordb.client import get_qdrant_client
from vectordb.collections import NORMALIZER_CORRECTIONS
from vectordb.memory import QdrantMemory

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("normalization")

settings = get_settings()
QUEUE_URL = settings.SQS_QUEUE_NORMALIZATION
MAX_THREADS = 4

# Module-level: Qdrant client + population memory (created once on startup)
_qdrant = get_qdrant_client()
_normalizer_pop = QdrantMemory(_qdrant, NORMALIZER_CORRECTIONS, entity_id=None)

_shutdown = threading.Event()


def _handle_shutdown(signum, frame):
    logger.info("Shutdown signal received")
    _shutdown.set()


signal.signal(signal.SIGTERM, _handle_shutdown)
signal.signal(signal.SIGINT, _handle_shutdown)


def _persist_graph(entity_id: str, transaction_id: str, graph: dict, jurisdiction: str | None = None) -> tuple[str, str]:
    """Create Draft + TransactionGraph rows. Returns (draft_id, graph_id)."""
    db = SessionLocal()
    try:
        eid = UUID(entity_id)
        tid = UUID(transaction_id)

        draft = DraftDAO.create(db, entity_id=eid, transaction_id=tid, jurisdiction=jurisdiction)

        nodes = [
            {"node_index": n["index"], "name": n["name"], "role": n["role"]}
            for n in graph.get("nodes", [])
        ]
        edges = [
            {
                "source_index": e["source_index"],
                "target_index": e["target_index"],
                "nature": e["nature"],
                "edge_kind": e.get("kind", e.get("edge_kind", "reciprocal_exchange")),
                "amount": e.get("amount"),
                "currency": e.get("currency"),
            }
            for e in graph.get("edges", [])
        ]

        graph_row = TransactionGraphDAO.create_with_nodes_and_edges(
            db, entity_id=eid, transaction_id=tid, nodes=nodes, edges=edges,
        )

        db.commit()
        return str(draft.id), str(graph_row.id)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def process_message(message: dict) -> None:
    """Normalize, persist, and enqueue to agent."""
    parse_id = message["parse_id"]
    user_id = message["user_id"]
    entity_id = message["entity_id"]
    transaction_id = message["transaction_id"]
    input_text = message["input_text"]
    context = message.get("user_context") or {}
    live_review = message.get("live_review", False)

    try:
        pub.stage_started(parse_id=parse_id, user_id=user_id, stage="normalization")

        # RAG read: localized (per-entity) + population (all entities)
        if live_review:
            pub.agent_stream(parse_id=parse_id, user_id=user_id, chunk={
                "action": "chunk.create", "section": "normalization",
                "label": "Recalling past similar transactions",
            })
        local_mem = QdrantMemory(_qdrant, NORMALIZER_CORRECTIONS, entity_id=entity_id)
        local_hits = local_mem.read(input_text)
        _local_ids = {h.get("draft_id") for h in local_hits if h.get("draft_id")}
        pop_hits = [h for h in _normalizer_pop.read(input_text) if h.get("draft_id") not in _local_ids]
        if live_review:
            n = len(local_hits) + len(pop_hits)
            pub.agent_stream(parse_id=parse_id, user_id=user_id, chunk={
                "action": "block.text", "section": "normalization",
                "text": f"Found {n} similar transaction{'s' if n != 1 else ''}",
            })
            pub.agent_stream(parse_id=parse_id, user_id=user_id, chunk={
                "action": "chunk.done", "section": "normalization",
                "label": "Recalled past similar transactions" if n > 0 else "Novel transaction",
            })

        if live_review:
            def publish(chunk: dict):
                pub.agent_stream(parse_id=parse_id, user_id=user_id, chunk=chunk)
            graph = normalize_stream(input_text, context, publish, local_hits=local_hits, pop_hits=pop_hits)
        else:
            graph = normalize(input_text, context, local_hits=local_hits, pop_hits=pop_hits)

        draft_id, graph_id = _persist_graph(entity_id, transaction_id, graph, jurisdiction=message.get("jurisdiction"))

        enqueue_agent({
            "parse_id": parse_id,
            "user_id": user_id,
            "entity_id": entity_id,
            "transaction_id": transaction_id,
            "input_text": input_text,
            "draft_id": draft_id,
            "graph_id": graph_id,
            "user_context": context,
            "source": "llm_interaction",
            "streaming": message.get("streaming", True),
            "live_review": live_review,
            "jurisdiction": message.get("jurisdiction"),
            "rag_normalizer_hits": local_hits + pop_hits,
        })

        logger.info("Normalized and enqueued to agent: %s (draft=%s)", parse_id, draft_id)

    except Exception:
        logger.exception("Normalization failed for %s", parse_id)
        pub.pipeline_error(parse_id=parse_id, user_id=user_id, error="Normalization failed")


def main() -> None:
    logger.info("Normalization worker starting, polling %s", QUEUE_URL)

    with ThreadPoolExecutor(max_workers=MAX_THREADS) as pool:
        while not _shutdown.is_set():
            received = sqs_client.receive(QUEUE_URL, wait_seconds=20)
            if received is None:
                continue

            body, receipt_handle = received

            def _handle(msg=body, rh=receipt_handle):
                try:
                    process_message(msg)
                    sqs_client.delete(QUEUE_URL, rh)
                except Exception:
                    logger.exception("Message processing failed, will be redelivered")

            pool.submit(_handle)

    logger.info("Normalization worker shut down cleanly")


if __name__ == "__main__":
    main()
