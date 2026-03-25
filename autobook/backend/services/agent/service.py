import logging
from datetime import datetime, timezone

from config import get_settings
from queues import sqs
from queues.pubsub import pub
from services.agent.graph.graph import app
from services.agent.graph.state import NOT_RUN, AGENT_NAMES
from services.shared.parse_status import set_status_sync

logger = logging.getLogger(__name__)
settings = get_settings()

# Default ablation config: classify_and_build (best Stage 1 accuracy at lowest cost)
DEFAULT_PIPELINE_CONFIG = {
    "correction_pass": False,
    "evaluation_active": False,
}


def _build_initial_state(message: dict) -> dict:
    """Build PipelineState from incoming queue message."""
    state: dict = {
        "transaction_text": message.get("input_text") or message.get("description") or "",
        "user_context": {
            "province": "ON",
            "entity_type": "corporation",
        },
        "ml_enrichment": {
            "intent_label": message.get("intent_label"),
            "bank_category": message.get("bank_category"),
            "entities": message.get("entities"),
        },
        "iteration": 0,
    }
    for name in AGENT_NAMES:
        state[f"output_{name}"] = []
        state[f"status_{name}"] = NOT_RUN
        state[f"fix_context_{name}"] = []
        state[f"rag_cache_{name}"] = []
    state["embedding_transaction"] = None
    state["embedding_error"] = None
    state["embedding_rejection"] = None
    state["route"] = "error"
    state["validation_error"] = None
    return state


def _extract_result(final_state: dict, message: dict) -> dict:
    """Extract proposed entry and confidence from pipeline output."""
    i = final_state["iteration"]
    entry_out = final_state.get("output_entry_builder", [])
    journal_entry = entry_out[i] if i < len(entry_out) else None

    route = final_state.get("route", "error")
    if final_state.get("validation_error"):
        route = "validation_failed"

    # Determine confidence from approver if available, otherwise default
    approver_out = final_state.get("output_approver", [])
    if approver_out and i < len(approver_out) and approver_out[i]:
        confidence = approver_out[i].get("confidence", 0.0)
    else:
        # No approver (classify_and_build skips evaluation) — use high confidence if entry exists
        confidence = 0.95 if journal_entry and journal_entry.get("lines") else 0.0

    confidence_payload = dict(message.get("confidence") or {})
    confidence_payload["overall"] = confidence

    return {
        **message,
        "confidence": confidence_payload,
        "explanation": f"LLM pipeline ({route})",
        "proposed_entry": journal_entry,
        "clarification": {
            "required": confidence < settings.AUTO_POST_THRESHOLD,
            "clarification_id": None,
            "reason": f"LLM pipeline: {route}" if confidence < settings.AUTO_POST_THRESHOLD else None,
            "status": "pending" if confidence < settings.AUTO_POST_THRESHOLD else None,
        },
    }


def execute(message: dict) -> None:
    logger.info("Processing: %s", message.get("parse_id"))
    set_status_sync(
        parse_id=message["parse_id"],
        user_id=message["user_id"],
        status="processing",
        stage="agent",
        input_text=message.get("input_text") or message.get("description"),
    )

    initial_state = _build_initial_state(message)
    config = {"configurable": DEFAULT_PIPELINE_CONFIG}

    final_state = app.invoke(initial_state, config)

    enriched = _extract_result(final_state, message)
    run_type = message.get("run_type", "full_pipeline")
    auto_post = message.get("auto_post", True)

    if run_type == "llm":
        pub.pipeline_result(
            parse_id=message["parse_id"],
            user_id=message["user_id"],
            stage="llm",
            result=enriched,
        )
        if auto_post and not enriched["clarification"]["required"]:
            sqs.enqueue.posting(enriched)
        return

    if not enriched["clarification"]["required"]:
        if auto_post:
            sqs.enqueue.posting(enriched)
        return

    set_status_sync(
        parse_id=message["parse_id"],
        user_id=message["user_id"],
        status="processing",
        stage="clarification_pending",
        input_text=enriched.get("input_text"),
        explanation=enriched.get("explanation"),
        confidence=enriched.get("confidence"),
        proposed_entry=enriched.get("proposed_entry"),
    )
    pub.clarification_created(
        parse_id=enriched.get("parse_id"),
        user_id=enriched.get("user_id"),
        input_text=enriched.get("input_text"),
        confidence=enriched.get("confidence"),
        explanation=enriched.get("explanation"),
        proposed_entry=enriched.get("proposed_entry"),
    )
    sqs.enqueue.resolution(enriched)
