from qdrant_client import QdrantClient
from qdrant_client.models import Distance, PayloadSchemaType, VectorParams

# Two collections by correction scope
NORMALIZER_CORRECTIONS = "normalizer_corrections"
AGENT_CORRECTIONS = "agent_corrections"

COLLECTION_NAMES = [
    NORMALIZER_CORRECTIONS,
    AGENT_CORRECTIONS,
]

# Cohere Embed v4, 1536 dimensions, cosine similarity
_VECTOR_PARAMS = VectorParams(size=1536, distance=Distance.COSINE)


def init_collections(client: QdrantClient) -> None:
    """Create collections if they don't exist, with entity_id payload index."""
    for name in COLLECTION_NAMES:
        if not client.collection_exists(name):
            client.create_collection(
                collection_name=name,
                vectors_config=_VECTOR_PARAMS,
            )
            # Index entity_id for filtered (localized) queries
            client.create_payload_index(
                collection_name=name,
                field_name="entity_id",
                field_schema=PayloadSchemaType.KEYWORD,
            )
