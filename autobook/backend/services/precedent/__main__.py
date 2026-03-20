import logging

from config import get_settings
from queues import dequeue

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("precedent")


def process(message: dict) -> None:
    logger.info("Processing: %s", message.get("parse_id"))
    # TODO: match transaction against precedent patterns (tier 1)


def main() -> None:
    settings = get_settings()
    queue_url = settings.SQS_QUEUE_PRECEDENT
    logger.info("Precedent worker starting, polling %s", queue_url)

    while True:
        message = dequeue(queue_url)
        if message is not None:
            process(message)


if __name__ == "__main__":
    main()
