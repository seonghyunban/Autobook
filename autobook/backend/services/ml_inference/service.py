import logging

from config import get_settings
from services.ml_inference.logic import (
    HybridInferenceService,
    build_inference_service,
    enrich_message,
    get_inference_service,
)
from services.ml_inference.providers.heuristic import BaselineInferenceService
from queues import sqs
from services.shared.parse_status import set_status_sync

logger = logging.getLogger(__name__)
settings = get_settings()

__all__ = [
    "BaselineInferenceService",
    "HybridInferenceService",
    "build_inference_service",
    "enrich_message",
    "execute",
    "get_inference_service",
]


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
