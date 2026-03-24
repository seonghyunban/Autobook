import json
import logging

from services.ml_inference.service import execute

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def handler(event, context):
    for record in event["Records"]:
        execute(json.loads(record["body"]))
