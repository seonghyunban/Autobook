from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams

# Collection name constants
DISAMBIGUATION_EXAMPLES = "disambiguation_examples"
DEBIT_TUPLES = "debit_tuples"
CREDIT_TUPLES = "credit_tuples"
DEBIT_CORRECTIONS = "debit_corrections"
CREDIT_CORRECTIONS = "credit_corrections"
JOURNAL_ENTRIES = "journal_entries"
ENTRY_CORRECTIONS = "entry_corrections"
FIX_HISTORY = "fix_history"

COLLECTION_NAMES = [
    DISAMBIGUATION_EXAMPLES,
    DEBIT_TUPLES,
    CREDIT_TUPLES,
    DEBIT_CORRECTIONS,
    CREDIT_CORRECTIONS,
    JOURNAL_ENTRIES,
    ENTRY_CORRECTIONS,
    FIX_HISTORY,
]

# Vector params shared by all collections: Cohere Embed v4, cosine similarity
_VECTOR_PARAMS = VectorParams(size=1536, distance=Distance.COSINE)

# Payload schemas (documentation — Qdrant is schema-less, these describe what each stores)
#
# disambiguation_examples:  transaction_text, user_context, enriched_text, resolution_notes
# debit_tuples:             transaction_text, debit_tuple, account_types
# credit_tuples:            transaction_text, credit_tuple, account_types
# debit_corrections:        transaction_text, initial_tuple, corrected_tuple, reasoning
# credit_corrections:       transaction_text, initial_tuple, corrected_tuple, reasoning
# journal_entries:          transaction_text, debit_tuple, credit_tuple, journal_entry
# entry_corrections:        wrong_entry, corrected_entry, error_type, correction_notes
# fix_history:              error_description, fix_plan, outcome, agents_involved


def init_collections(client: QdrantClient) -> None:
    existing = {c.name for c in client.get_collections().collections}
    for name in COLLECTION_NAMES:
        if not client.collection_exists(name):
            client.create_collection(
                collection_name=name,
                vectors_config=_VECTOR_PARAMS,
            )
