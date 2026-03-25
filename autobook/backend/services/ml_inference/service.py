import logging

from config import get_settings
from services.ml_inference.logic import get_inference_service
from queues import sqs

logger = logging.getLogger(__name__)
settings = get_settings()


def execute(message: dict) -> None:
    logger.info("Processing: %s", message.get("parse_id"))
    result = get_inference_service().enrich(message)
    sqs.enqueue.agent(result)
