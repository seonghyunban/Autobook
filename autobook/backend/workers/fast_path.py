"""Fast-path worker — polls SQS-fast-path, orchestrates services in-process.

Flow:
  normalizer → precedent_v2 → ML inference → posting (if confident at any stage)
  If no tier is confident, enqueues to SQS-agent for LLM processing.
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
from services.flywheel.service import execute as flywheel_execute
from services.ml_inference.service import execute as ml_execute
from services.normalizer.service import execute as normalizer_execute
from services.posting.service import execute as posting_execute
from services.precedent_v2.service import execute as precedent_execute
from services.shared.parse_status import record_batch_result_sync, set_status_sync
from services.shared.routing import should_post

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("fast_path")

settings = get_settings()
QUEUE_URL = settings.SQS_QUEUE_NORMALIZER  # will be renamed to SQS_QUEUE_FAST_PATH
MAX_THREADS = int(getattr(settings, "FAST_PATH_THREADS", 50))

_shutdown = threading.Event()


def _handle_sigterm(signum, frame):
    logger.info("SIGTERM received, shutting down gracefully...")
    _shutdown.set()


signal.signal(signal.SIGTERM, _handle_sigterm)
signal.signal(signal.SIGINT, _handle_sigterm)


def _report_error(message: dict, stage: str, exc: Exception) -> None:
    parse_id = message.get("parse_id")
    user_id = message.get("user_id")
    if not parse_id or not user_id:
        return
    set_status_sync(
        parse_id=parse_id,
        user_id=user_id,
        status="failed",
        stage=stage,
        input_text=message.get("input_text") or message.get("filename"),
        error=str(exc),
    )
    pub.pipeline_error(
        parse_id=parse_id,
        user_id=user_id,
        stage=stage,
        error=str(exc),
    )
    if message.get("parent_parse_id"):
        record_batch_result_sync(
            parent_parse_id=message["parent_parse_id"],
            child_parse_id=parse_id,
            user_id=user_id,
            statement_index=int(message.get("statement_index") or 0),
            total_statements=int(message.get("statement_total") or 1),
            status="failed",
            input_text=message.get("input_text") or message.get("filename"),
            error=str(exc),
        )


def _post_and_flywheel(result: dict, stage: str) -> None:
    pub.stage_started(
        parse_id=result["parse_id"],
        user_id=result["user_id"],
        stage=f"post-{stage}",
    )
    posted = posting_execute(result)
    if posted is not None:
        flywheel_execute(posted)


def process_message(message: dict) -> None:
    parse_id = message.get("parse_id")
    user_id = message.get("user_id")

    try:
        # ── Normalizer ────────────────────────────────────────
        set_status_sync(
            parse_id=parse_id, user_id=user_id,
            status="processing", stage="normalizer",
            input_text=message.get("input_text") or message.get("filename"),
        )
        if message.get("parent_parse_id"):
            set_status_sync(
                parse_id=message["parent_parse_id"], user_id=user_id,
                status="processing", stage="normalizer",
            )
        pub.stage_started(parse_id=parse_id, user_id=user_id, stage="normalizer")
        result = normalizer_execute(message)

        if message.get("store", True):
            pub.stage_started(parse_id=result["parse_id"], user_id=result["user_id"], stage="store")

        # ── Precedent v2 ──────────────────────────────────────
        set_status_sync(
            parse_id=result["parse_id"], user_id=result["user_id"],
            status="processing", stage="precedent",
            input_text=result.get("input_text") or result.get("description"),
        )
        pub.stage_started(parse_id=result["parse_id"], user_id=result["user_id"], stage="precedent")
        result = precedent_execute(result)

        if should_post("precedent", result):
            _post_and_flywheel(result, "precedent")
            return

        if "precedent" in result.get("post_stages", []):
            pub.stage_skipped(parse_id=result["parse_id"], user_id=result["user_id"], stage="post-precedent")

        # ── ML Inference ──────────────────────────────────────
        if "ml" not in result.get("stages", ["precedent", "ml", "llm"]):
            # ML stage skipped by config
            pass
        else:
            set_status_sync(
                parse_id=result["parse_id"], user_id=result["user_id"],
                status="processing", stage="ml_inference",
                input_text=result.get("input_text") or result.get("description"),
            )
            pub.stage_started(parse_id=result["parse_id"], user_id=result["user_id"], stage="ml")
            result = ml_execute(result)

            if should_post("ml", result):
                _post_and_flywheel(result, "ml")
                return

            if "ml" in result.get("post_stages", []):
                pub.stage_skipped(parse_id=result["parse_id"], user_id=result["user_id"], stage="post-ml")

        # ── Enqueue to agent (LLM) ───────────────────────────
        if "llm" in result.get("stages", ["precedent", "ml", "llm"]):
            enqueue_agent(result)
        else:
            # No more stages — report as pipeline result
            if result.get("parent_parse_id"):
                record_batch_result_sync(
                    parent_parse_id=result["parent_parse_id"],
                    child_parse_id=result["parse_id"],
                    user_id=result["user_id"],
                    statement_index=int(result.get("statement_index") or 0),
                    total_statements=int(result.get("statement_total") or 1),
                    status="resolved",
                    input_text=result.get("input_text"),
                )
            pub.pipeline_result(
                parse_id=result["parse_id"],
                user_id=result["user_id"],
                stage="ml",
                result=result,
            )

    except Exception as exc:
        logger.exception("Fast-path failed for %s", parse_id)
        _report_error(message, "fast_path", exc)
        raise


def main() -> None:
    logger.info("Fast-path worker starting, polling %s (threads=%d)", QUEUE_URL, MAX_THREADS)

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
                    logger.error("Message will be redelivered by SQS after visibility timeout")

            pool.submit(_handle)

    logger.info("Fast-path worker shut down cleanly")


if __name__ == "__main__":
    main()
