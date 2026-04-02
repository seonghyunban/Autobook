from __future__ import annotations

import json
import logging

import boto3

from config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()
_client = boto3.client(
    "sqs",
    region_name=settings.AWS_DEFAULT_REGION,
    **({"endpoint_url": settings.SQS_ENDPOINT_URL} if settings.SQS_ENDPOINT_URL else {}),
)


def send(queue_url: str, payload: dict) -> str:
    response = _client.send_message(
        QueueUrl=queue_url,
        MessageBody=json.dumps(payload),
    )
    return response["MessageId"]


def receive(queue_url: str, wait_seconds: int = 20) -> tuple[dict, str] | None:
    """Receive one message. Returns (body, receipt_handle) or None.

    Caller must call delete() after successful processing.
    """
    response = _client.receive_message(
        QueueUrl=queue_url,
        MaxNumberOfMessages=1,
        WaitTimeSeconds=wait_seconds,
    )
    messages = response.get("Messages", [])
    if not messages:
        return None

    msg = messages[0]
    return json.loads(msg["Body"]), msg["ReceiptHandle"]


def delete(queue_url: str, receipt_handle: str) -> None:
    """Delete a message after successful processing."""
    _client.delete_message(QueueUrl=queue_url, ReceiptHandle=receipt_handle)
