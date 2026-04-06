"""Normalization worker — polls SQS-normalizer for LLM interaction messages.

Flow:
  1. Receive message from SQS-normalizer (source=llm_interaction)
  2. Normalize transaction text → TransactionGraph (with SSE streaming)
  3. Enqueue to SQS-agent

For non-llm_interaction messages, delegates to the fast-path worker.
"""

import json
import logging
import signal
import threading
from concurrent.futures import ThreadPoolExecutor

from config import get_settings
from queues.pubsub import pub
from queues.sqs import client as sqs_client
from queues.sqs.enqueue import agent as enqueue_agent
from services.normalization.service import normalize, normalize_stream

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("normalization")

settings = get_settings()
QUEUE_URL = settings.SQS_QUEUE_NORMALIZER
MAX_THREADS = 4

_shutdown = threading.Event()


def _handle_shutdown(signum, frame):
    logger.info("Shutdown signal received")
    _shutdown.set()


signal.signal(signal.SIGTERM, _handle_shutdown)
signal.signal(signal.SIGINT, _handle_shutdown)


def process_message(message: dict) -> None:
    """Normalize and enqueue to agent."""
    source = message.get("source")

    # Only handle llm_interaction messages; others are for fast-path
    if source != "llm_interaction":
        logger.debug("Skipping non-llm_interaction message: %s", message.get("parse_id"))
        return

    parse_id = message["parse_id"]
    user_id = message["user_id"]
    input_text = message["input_text"]
    context = message.get("user_context") or {}
    live_review = message.get("live_review", False)

    try:
        pub.stage_started(parse_id=parse_id, user_id=user_id, stage="normalizer")

        if live_review:
            def publish(chunk: dict):
                pub.agent_stream(parse_id=parse_id, user_id=user_id, chunk=chunk)
            graph = normalize_stream(input_text, context, publish)
        else:
            graph = normalize(input_text, context)

        enqueue_agent({
            "parse_id": parse_id,
            "user_id": user_id,
            "input_text": input_text,
            "graph": graph,
            "user_context": context,
            "source": "llm_interaction",
            "streaming": message.get("streaming", True),
            "live_review": live_review,
        })

        logger.info("Normalized and enqueued to agent: %s", parse_id)

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
