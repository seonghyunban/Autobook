import logging
from datetime import datetime, timezone

from config import get_settings
from queues import enqueue, publish_sync

logger = logging.getLogger(__name__)
settings = get_settings()


def process(message: dict) -> None:
    logger.info("Processing: %s", message.get("parse_id"))
    # TODO: call Bedrock LLM for classification (tier 3)
    confidence = message.get("confidence", {}).get("overall", 1.0)

    if confidence >= settings.AUTO_POST_THRESHOLD:
        enqueue(settings.SQS_QUEUE_POSTING, message)
    else:
        publish_sync("clarification.created", {
            "type": "clarification.created",
            "parse_id": message.get("parse_id"),
            "input_text": message.get("input_text"),
            "occurred_at": datetime.now(timezone.utc).isoformat(),
            "journal_entry_id": "",
        })
        enqueue(settings.SQS_QUEUE_RESOLUTION, message)
