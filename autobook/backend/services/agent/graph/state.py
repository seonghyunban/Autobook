"""Pipeline state for the dual-track agent graph."""
from typing import TypedDict

# ── Agent name constants ────────────────────────────────────────────────

DECISION_MAKER = "decision_maker"
DEBIT_CLASSIFIER = "debit_classifier"
CREDIT_CLASSIFIER = "credit_classifier"
TAX_SPECIALIST = "tax_specialist"
ENTRY_DRAFTER = "entry_drafter"

AGENT_NAMES = [
    DECISION_MAKER, DEBIT_CLASSIFIER, CREDIT_CLASSIFIER,
    TAX_SPECIALIST, ENTRY_DRAFTER,
]

# ── Agent status constants ──────────────────────────────────────────────

NOT_RUN = 0
COMPLETE = 1


# ── Transaction graph (mirrors normalization output) ─────────────────

class NodeState(TypedDict):
    index: int
    name: str
    role: str  # "reporting_entity" | "counterparty" | "indirect_party"


class EdgeState(TypedDict):
    source: str
    source_index: int
    target: str
    target_index: int
    nature: str
    amount: float | None
    currency: str | None
    kind: str  # "reciprocal_exchange" | "chained_exchange" | "non_exchange" | "relationship"


class TransactionGraphState(TypedDict):
    nodes: list[NodeState]
    edges: list[EdgeState]
    raw_text: str


class PipelineState(TypedDict):
    # ── Input ───────────────────────────────────────────────────────────
    transaction_text: str
    transaction_graph: TransactionGraphState
    user_context: dict | None

    # ── Agent outputs ───────────────────────────────────────────────────
    output_decision_maker: dict | None
    output_debit_classifier: dict | None
    output_credit_classifier: dict | None
    output_tax_specialist: dict | None
    output_entry_drafter: dict | None

    # ── RAG cache (classifiers only) ────────────────────────────────────
    rag_cache_debit_classifier: list
    rag_cache_credit_classifier: list

    # ── Pipeline decision ───────────────────────────────────────────────
    decision: str | None                      # "PROCEED" | "MISSING_INFO" | "STUCK" | None
    clarification_questions: list | None
    stuck_reason: str | None
