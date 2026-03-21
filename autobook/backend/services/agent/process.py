import logging
from datetime import datetime, timezone

from config import get_settings
from queues import enqueue, publish_sync

logger = logging.getLogger(__name__)
settings = get_settings()


def _stub_confidence(message: dict) -> float:
    """Stub: assign low confidence when no dollar amount is found in input."""
    existing = message.get("confidence", {}).get("overall")
    if existing is not None:
        return existing
    if message.get("source") == "upload":
        return 0.97
    import re
    text = message.get("input_text", "")
    return 0.97 if re.search(r"\$[\d,]+", text) else 0.45


def process(message: dict) -> None:
    logger.info("Processing: %s", message.get("parse_id"))
    # TODO: call Bedrock LLM for classification (tier 3)
    confidence = _stub_confidence(message)
    enriched = {**message, "confidence": {"overall": confidence}, "explanation": message.get("explanation", "Stub explanation.")}

    if confidence >= settings.AUTO_POST_THRESHOLD:
        enqueue(settings.SQS_QUEUE_POSTING, enriched)
    else:
        publish_sync("clarification.created", {
            "type": "clarification.created",
            "parse_id": message.get("parse_id"),
            "input_text": message.get("input_text"),
            "occurred_at": datetime.now(timezone.utc).isoformat(),
            "journal_entry_id": "",
        })
        enqueue(settings.SQS_QUEUE_RESOLUTION, message)
