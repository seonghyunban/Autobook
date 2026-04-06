"""Agent worker — Lambda handler (SnapStart) for LLM processing.

Flow:
  LLM (agent service) → posting + flywheel (if PROCEED)
                       → resolution (if MISSING_INFO or STUCK)

Supports streaming: if message has "streaming": true, publishes
per-chunk stream events to Redis for SSE delivery.
"""

import asyncio
import json
import logging

from queues.pubsub import pub
from services.agent.service import execute as agent_execute, execute_stream
from services.flywheel.service import execute as flywheel_execute
from services.posting.service import execute as posting_execute
from services.shared.parse_status import record_batch_result_sync, set_status_sync

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

STAGE = "llm"


def _run_streaming(message: dict) -> dict:
    """Run agent with streaming, publish chunks to Redis. Returns final result."""
    parse_id = message["parse_id"]
    user_id = message["user_id"]
    result = None

    async def _stream():
        nonlocal result
        async for chunk in execute_stream(message):
            if chunk.get("phase") == "result":
                result = chunk["result"]
            else:
                pub.agent_stream(parse_id=parse_id, user_id=user_id, chunk=chunk)

    asyncio.run(_stream())
    return result


def _handle_result(result: dict, message: dict) -> None:
    """Route agent result to posting/resolution or publish for LLM interaction."""
    decision = result.get("decision", "PROCEED")
    source = message.get("source")

    if source == "llm_interaction":
        pub.pipeline_result(
            parse_id=result.get("parse_id") or message["parse_id"],
            user_id=result.get("user_id") or message["user_id"],
            stage="agent",
            result=result,
        )
        return

    if decision == "PROCEED":
        pub.stage_started(
            parse_id=result["parse_id"],
            user_id=result["user_id"],
            stage="post-llm",
        )
        posted = posting_execute(result)
        if posted is not None:
            flywheel_execute(posted)

    elif decision in {"MISSING_INFO", "STUCK"}:
        set_status_sync(
            parse_id=result["parse_id"],
            user_id=result["user_id"],
            status="processing",
            stage="clarification_pending",
            input_text=result.get("input_text"),
        )


def handler(event, context):
    for record in event["Records"]:
        message = json.loads(record["body"])
        try:
            set_status_sync(
                parse_id=message["parse_id"],
                user_id=message["user_id"],
                status="processing",
                stage="agent",
                input_text=message.get("input_text") or message.get("description"),
            )
            pub.stage_started(
                parse_id=message["parse_id"],
                user_id=message["user_id"],
                stage=STAGE,
            )

            if message.get("streaming"):
                result = _run_streaming(message)
            else:
                result = agent_execute(message)

            _handle_result(result, message)

        except Exception as exc:
            logger.exception("Agent failed for %s", message.get("parse_id"))
            if message.get("parse_id") and message.get("user_id"):
                set_status_sync(
                    parse_id=message["parse_id"],
                    user_id=message["user_id"],
                    status="failed",
                    stage="agent",
                    input_text=message.get("input_text") or message.get("description"),
                    error=str(exc),
                )
                pub.pipeline_error(
                    parse_id=message["parse_id"],
                    user_id=message["user_id"],
                    stage="agent",
                    error=str(exc),
                )
                if message.get("parent_parse_id"):
                    record_batch_result_sync(
                        parent_parse_id=message["parent_parse_id"],
                        child_parse_id=message["parse_id"],
                        user_id=message["user_id"],
                        statement_index=int(message.get("statement_index") or 0),
                        total_statements=int(message.get("statement_total") or 1),
                        status="failed",
                        input_text=message.get("input_text") or message.get("description"),
                        error=str(exc),
                    )
                raise


# ── Local dev polling mode ────────────────────────────────────
def main() -> None:
    """Poll SQS-agent locally (docker-compose). In prod, Lambda event source does this."""
    import signal

    from config import get_settings
    from queues.sqs import client as sqs_client

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

    settings = get_settings()
    queue_url = settings.SQS_QUEUE_AGENT
    logger.info("Agent worker starting (local mode), polling %s", queue_url)

    shutdown = False

    def _handle_sigterm(signum, frame):
        nonlocal shutdown
        logger.info("SIGTERM received, shutting down...")
        shutdown = True

    signal.signal(signal.SIGTERM, _handle_sigterm)
    signal.signal(signal.SIGINT, _handle_sigterm)

    while not shutdown:
        received = sqs_client.receive(queue_url, wait_seconds=20)
        if received is None:
            continue
        body, receipt_handle = received
        try:
            handler({"Records": [{"body": json.dumps(body)}]}, None)
            sqs_client.delete(queue_url, receipt_handle)
        except Exception:
            logger.error("Message will be redelivered by SQS after visibility timeout")

    logger.info("Agent worker shut down cleanly")


if __name__ == "__main__":
    main()
