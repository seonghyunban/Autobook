from qdrant_client import QdrantClient

from config import get_settings
from vectordb.credentials import get_qdrant_api_key


def get_qdrant_client() -> QdrantClient:
    """Build a Qdrant client.

    URL is read from settings (plain config — same in every environment).
    API key is resolved via `get_qdrant_api_key()`, which transparently
    handles Lambda (Secrets Manager fetch), ECS (env var injected from
    secrets block), and local docker-compose (no key).
    """
    settings = get_settings()
    return QdrantClient(
        url=settings.QDRANT_URL,
        api_key=get_qdrant_api_key(),
    )
