"""Typed enqueue functions — one per SQS queue.

After migration: only 2 queues remain (fast-path + agent).
"""

from __future__ import annotations

__all__ = ["fast_path", "agent"]

from config import get_settings
from queues.sqs.client import send
from schemas.parse import DEFAULT_POST_STAGES, DEFAULT_STAGES
from schemas.queue_messages import (
    AgentTask,
    NormalizationTask,
)

settings = get_settings()


def fast_path(
    *,
    parse_id: str,
    user_id: str,
    source: str,
    parent_parse_id: str | None = None,
    statement_index: int | None = None,
    statement_total: int | None = None,
    input_text: str | None = None,
    currency: str | None = None,
    filename: str | None = None,
    transaction_date: str | None = None,
    amount: float | None = None,
    counterparty: str | None = None,
    submitted_at: str | None = None,
    stages: list[str] | None = None,
    store: bool = True,
    post_stages: list[str] | None = None,
) -> str:
    msg = NormalizationTask(
        parse_id=parse_id,
        user_id=user_id,
        source=source,
        parent_parse_id=parent_parse_id,
        statement_index=statement_index,
        statement_total=statement_total,
        input_text=input_text,
        currency=currency,
        filename=filename,
        transaction_date=transaction_date,
        amount=amount,
        counterparty=counterparty,
        submitted_at=submitted_at,
        stages=stages if stages is not None else list(DEFAULT_STAGES),
        store=store,
        post_stages=post_stages if post_stages is not None else list(DEFAULT_POST_STAGES),
    )
    return send(settings.SQS_QUEUE_NORMALIZER, msg.model_dump(exclude_none=True))


def agent(message: dict) -> str:
    AgentTask.model_validate(message)
    return send(settings.SQS_QUEUE_AGENT, message)
