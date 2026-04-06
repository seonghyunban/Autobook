"""LLM Interaction service — enqueues to the normalization worker.

The API generates no LLM calls. It enqueues the raw input to the normalizer
queue. The normalization worker normalizes (with SSE streaming), then enqueues
to SQS-agent.
"""

from __future__ import annotations

import logging

from config import get_settings
from queues.sqs.client import send

logger = logging.getLogger(__name__)

settings = get_settings()


def enqueue(parse_id: str, input_text: str, user_id: str, live_review: bool = False,
            user_context: dict | None = None) -> dict:
    """Enqueue to normalization worker, return parse_id."""
    message = {
        "parse_id": parse_id,
        "user_id": user_id,
        "input_text": input_text,
        "user_context": user_context or {},
        "source": "llm_interaction",
        "streaming": True,
        "live_review": live_review,
    }

    send(settings.SQS_QUEUE_NORMALIZER, message)

    return {
        "parse_id": parse_id,
    }
