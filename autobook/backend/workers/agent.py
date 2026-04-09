"""Agent worker — Lambda handler (SnapStart) for LLM processing.

Infrastructure-only entry point. Responsibilities:
  - Receive SQS/Lambda event, deserialize
  - Load graph from DB (data access)
  - Call service (business logic)
  - Publish side-effects (Redis, parse status)
  - Error handling, SQS message deletion
"""

import asyncio
import json
import logging
from uuid import UUID

import boto3
from botocore.config import Config as BotoConfig

from config import get_settings
from db.connection import SessionLocal
from db.dao.transaction_graphs import TransactionGraphDAO
from queues.pubsub import pub
from services.agent.persist import persist_attempt
from services.agent.service import execute as agent_execute, execute_stream, handle_result
from services.shared.parse_status import record_batch_result_sync, set_status_sync

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

STAGE = "llm"

# Module-level: created once on cold start, reused across warm invocations.
_settings = get_settings()
_bedrock_client = boto3.client(
    "bedrock-runtime",
    region_name=_settings.AWS_DEFAULT_REGION,
    config=BotoConfig(connect_timeout=5, read_timeout=120, retries={"max_attempts": 2}),
)
_configurable = {"bedrock_client": _bedrock_client}


def _load_graph(graph_id: str) -> dict | None:
    """Load graph from DB and convert to the dict shape the service expects."""
    db = SessionLocal()
    try:
        row = TransactionGraphDAO.get_by_id(db, UUID(graph_id))
        if row is None:
            return None
        node_names = {n.node_index: n.name for n in row.nodes}
        return {
            "nodes": [
                {"index": n.node_index, "name": n.name, "role": n.role}
                for n in row.nodes
            ],
            "edges": [
                {
                    "source": node_names.get(e.source_index, ""),
                    "source_index": e.source_index,
                    "target": node_names.get(e.target_index, ""),
                    "target_index": e.target_index,
                    "nature": e.nature,
                    "kind": e.edge_kind,
                    "amount": float(e.amount) if e.amount is not None else None,
                    "currency": e.currency,
                }
                for e in row.edges
            ],
        }
    finally:
        db.close()


def _enrich_message(message: dict) -> dict:
    """Load graph from DB if graph_id is present but graph is not."""
    if message.get("graph") is None and message.get("graph_id"):
        message["graph"] = _load_graph(message["graph_id"])
    return message


def _run_streaming(message: dict) -> dict:
    """Run agent with streaming, publish chunks to Redis. Returns final result."""
    parse_id = message["parse_id"]
    user_id = message["user_id"]
    result = None

    async def _stream():
        nonlocal result
        async for chunk in execute_stream(message, _configurable):
            if chunk.get("phase") == "result":
                result = chunk["result"]
            else:
                pub.agent_stream(parse_id=parse_id, user_id=user_id, chunk=chunk)

    asyncio.run(_stream())
    return result


def _publish_result(result: dict, message: dict) -> None:
    """Publish side-effects after service has routed the result."""
    source = message.get("source")

    if source == "llm_interaction":
        persist_attempt(message, result)
        pub.pipeline_result(
            parse_id=result.get("parse_id") or message["parse_id"],
            user_id=result.get("user_id") or message["user_id"],
            stage="agent",
            result=result,
        )
        return

    # Non-interactive: service's handle_result already decided the action.
    # We just publish the stage event.
    decision = result.get("decision", "PROCEED")
    if decision == "PROCEED":
        pub.stage_started(
            parse_id=result.get("parse_id") or message["parse_id"],
            user_id=result.get("user_id") or message["user_id"],
            stage="post-llm",
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

            _enrich_message(message)

            if message.get("streaming"):
                result = _run_streaming(message)
            else:
                result = agent_execute(message, _configurable)

            handle_result(result, message)
            _publish_result(result, message)

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
