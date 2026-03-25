import logging

from config import get_settings
from services.ml_inference.logic import get_inference_service
from queues import sqs
from services.shared.parse_status import set_status_sync

logger = logging.getLogger(__name__)
settings = get_settings()


def execute(message: dict) -> None:
    logger.info("Processing: %s", message.get("parse_id"))
    set_status_sync(
        parse_id=message["parse_id"],
        user_id=message["user_id"],
        status="processing",
        stage="ml_inference",
        input_text=message.get("input_text") or message.get("description"),
    )
    result = get_inference_service().enrich(message)
    sqs.enqueue.agent(result)
