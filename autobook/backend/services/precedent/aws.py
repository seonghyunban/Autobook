import json
import logging

from services.precedent.service import execute
from queues.pubsub import pub
from services.shared.parse_status import set_status_sync

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def handler(event, context):
    for record in event["Records"]:
        message = json.loads(record["body"])
        try:
            execute(message)
        except Exception as exc:
            logger.exception("Precedent failed for %s", message.get("parse_id"))
            if message.get("parse_id") and message.get("user_id"):
                set_status_sync(
                    parse_id=message["parse_id"],
                    user_id=message["user_id"],
                    status="failed",
                    stage="precedent",
                    input_text=message.get("input_text") or message.get("description"),
                    error=str(exc),
                )
                pub.pipeline_error(
                    parse_id=message["parse_id"],
                    user_id=message["user_id"],
                    stage="precedent",
                    error=str(exc),
                )
            raise
