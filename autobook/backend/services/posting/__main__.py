import logging

from config import get_settings
from queues import dequeue

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("posting")


def process(message: dict) -> None:
    logger.info("Processing: %s", message.get("parse_id"))
    # TODO: write journal entry to database


def main() -> None:
    settings = get_settings()
    queue_url = settings.SQS_QUEUE_POSTING
    logger.info("Posting worker starting, polling %s", queue_url)

    while True:
        message = dequeue(queue_url)
        if message is not None:
            process(message)


if __name__ == "__main__":
    main()
