from __future__ import annotations

import logging

from config import get_settings
from queues import sqs
from services.ml_inference.logic import get_inference_service

logger = logging.getLogger(__name__)
settings = get_settings()


def enqueue(queue_url: str, payload: dict):
    if queue_url == settings.SQS_QUEUE_AGENT:
        return sqs.enqueue.agent(payload)
    raise ValueError(f"unsupported enqueue target {queue_url!r} for ml_inference.process")


def process(message: dict) -> None:
    logger.info("Processing: %s", message.get("parse_id"))
    result = get_inference_service().enrich(message)
    enqueue(settings.SQS_QUEUE_AGENT, result)
