"""Normalization service — transaction text → graph.

normalize(text, context) — core function, LLM only, returns graph.
normalize_stream(text, context, writer) — same but streams SSE events.
execute(message) — fast-path wrapper, extract → normalize → persist.
"""
import logging

from services.normalization.llm import get_llm, invoke_structured
from services.normalization.prompt import build_prompt
from services.normalization.schema import TransactionGraph
from services.normalization.validation import validate_graph

logger = logging.getLogger(__name__)

SECTION = "normalization"


def normalize(text: str, context: dict | None = None) -> dict:
    """Text → LLM → transaction graph. No side effects.

    Args:
        text: Raw transaction text.
        context: Optional dict with company_name, entity_type, location.

    Returns:
        TransactionGraph as a dict.
    """
    messages = build_prompt(text, context)
    llm = get_llm()
    graph = invoke_structured(llm, TransactionGraph, messages)
    graph["raw_text"] = text
    graph["validation_warnings"] = validate_graph(graph)
    return graph


def normalize_stream(text: str, context: dict | None, publish) -> dict:
    """Text → LLM → transaction graph, streaming SSE events via publish.

    Args:
        text: Raw transaction text.
        context: Optional dict with company_name, entity_type, location.
        publish: Callable that publishes an SSE chunk dict.

    Returns:
        TransactionGraph as a dict.
    """
    publish({"action": "chunk.create", "section": SECTION, "label": "Analyzing transaction..."})

    graph = normalize(text, context)

    # Emit full graph for the reasoning panel
    publish({"action": "block.graph", "section": SECTION, "tag": "Transaction structure", "data": graph})

    publish({"action": "chunk.done", "section": SECTION, "label": "Transaction analyzed"})

    return graph


def execute(message: dict) -> dict:
    """Fast-path entry point: extract text → normalize → persist → return.

    Args:
        message: Queue message with input_text, user_id, parse_id, etc.

    Returns:
        Enriched message with transaction_id and graph.
    """
    from db.connection import SessionLocal
    from db.dao.transactions import TransactionDAO
    from local_identity import resolve_local_user
    from services.normalization.extractors import extract
    from services.shared.transaction_persistence import coerce_transaction_date

    text = extract(message)

    context = {
        "company_name": message.get("company_name"),
        "entity_type": message.get("entity_type"),
        "location": message.get("location"),
    }

    graph = normalize(text, context)

    # Persist transaction to DB
    db = SessionLocal()
    try:
        user = resolve_local_user(db, message.get("user_id"))
        transaction = TransactionDAO.insert(
            db=db,
            user_id=user.id,
            description=text,
            normalized_description=text.lower(),
            amount=None,
            currency="USD",
            date=coerce_transaction_date(None),
            source=message.get("source", "manual_text"),
            counterparty=None,
        )
        db.commit()
        return {
            **message,
            "transaction_id": str(transaction.id),
            "graph": graph,
        }
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
