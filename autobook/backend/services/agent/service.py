"""Agent service — runs the dual-track pipeline.

Orchestration layer. Receives injected dependencies (db, DAO) from
the handler. Owns: load graph, build state, invoke graph, shape result,
route decision. No direct infra imports.
"""
import logging
from uuid import UUID

from db.dao.entities import EntityDAO
from db.dao.jurisdiction_configs import JurisdictionConfigDAO
from services.agent.graph.graph import app
from services.shared.template import template_graph

logger = logging.getLogger(__name__)

# In-memory cache for jurisdiction configs
_jurisdiction_cache: dict[str, object] = {}


def _load_jurisdiction_config(db, entity_id: str | None, jurisdiction_override: str | None = None):
    """Load jurisdiction config, preferring explicit override over entity default."""
    if db is None:
        return None

    jurisdiction = jurisdiction_override
    if not jurisdiction and entity_id:
        entity = EntityDAO.get_by_id(db, UUID(entity_id))
        jurisdiction = entity.jurisdiction if entity else None

    if not jurisdiction:
        return None

    if jurisdiction in _jurisdiction_cache:
        return _jurisdiction_cache[jurisdiction]

    config = JurisdictionConfigDAO.get_or_default(db, jurisdiction)
    if config is not None:
        _jurisdiction_cache[jurisdiction] = config
    return config


def _load_graph(db, graph_dao, graph_id: str) -> dict | None:
    """Load graph from DB via injected DAO and convert to pipeline dict shape."""
    row = graph_dao.get_by_id(db, UUID(graph_id))
    if row is None:
        return None
    node_names = {n.node_index: n.name for n in row.nodes}
    return {
        "nodes": [
            {"index": n.node_index, "name": n.name, "role": n.role}
            for n in row.nodes
        ],
        "edges": [
            {
                "source": node_names.get(e.source_index, ""),
                "source_index": e.source_index,
                "target": node_names.get(e.target_index, ""),
                "target_index": e.target_index,
                "nature": e.nature,
                "kind": e.edge_kind,
                "amount": float(e.amount) if e.amount is not None else None,
                "currency": e.currency,
            }
            for e in row.edges
        ],
    }


def _read_agent_rag(graph: dict | None, configurable: dict | None, entity_id: str | None) -> tuple[list[dict], list[dict]]:
    """Read RAG hits for the agent pipeline — localized + population."""
    if graph is None or configurable is None:
        return [], []

    templated = template_graph(graph)
    if not templated:
        return [], []

    local_hits = []
    pop_hits = []

    try:
        pop_memory = configurable.get("agent_pop_memory")
        if pop_memory:
            pop_hits = pop_memory.read(templated)

        qdrant_client = configurable.get("qdrant_client")
        if qdrant_client and entity_id:
            from vectordb.collections import AGENT_CORRECTIONS
            from vectordb.memory import QdrantMemory
            local_memory = QdrantMemory(qdrant_client, AGENT_CORRECTIONS, entity_id=entity_id)
            local_hits = local_memory.read(templated)

        # Dedup: remove pop hits already in local
        local_ids = {h.get("draft_id") for h in local_hits if h.get("draft_id")}
        pop_hits = [h for h in pop_hits if h.get("draft_id") not in local_ids]
    except Exception:
        logger.exception("Agent RAG read failed")

    return local_hits, pop_hits


def _build_initial_state(
    message: dict,
    graph: dict | None,
    local_hits: list[dict] | None = None,
    pop_hits: list[dict] | None = None,
) -> dict:
    """Build PipelineState from incoming queue message + loaded graph."""
    return {
        "transaction_text": message.get("input_text") or message.get("description") or "",
        "transaction_graph": graph,
        "user_context": message.get("user_context"),
        "output_decision_maker": None,
        "output_debit_classifier": None,
        "output_credit_classifier": None,
        "output_tax_specialist": None,
        "output_entry_drafter": None,
        "rag_normalizer_hits": message.get("rag_normalizer_hits") or [],
        "rag_local_hits": local_hits or [],
        "rag_pop_hits": pop_hits or [],
        "decision": None,
        "clarification_questions": None,
        "stuck_reason": None,
    }


def _build_result(final_state: dict, message: dict) -> dict:
    """Build decision-specific result from graph output."""
    decision = final_state.get("decision") or "PROCEED"
    dm = final_state.get("output_decision_maker") or {}

    base = {**message, "decision": decision}

    if message.get("live_review"):
        base["pipeline_state"] = {
            "transaction_text": final_state.get("transaction_text"),
            "transaction_graph": final_state.get("transaction_graph"),
            "output_decision_maker": dm,
            "output_debit_classifier": final_state.get("output_debit_classifier"),
            "output_credit_classifier": final_state.get("output_credit_classifier"),
            "output_tax_specialist": final_state.get("output_tax_specialist"),
            "output_entry_drafter": final_state.get("output_entry_drafter") or {},
            "rag_normalizer_hits": final_state.get("rag_normalizer_hits") or [],
            "rag_local_hits": final_state.get("rag_local_hits") or [],
            "rag_pop_hits": final_state.get("rag_pop_hits") or [],
        }

    if decision == "PROCEED":
        return {
            **base,
            "entry": final_state.get("output_entry_drafter") or {},
            "proceed_reason": dm.get("proceed_reason"),
            "resolved_ambiguities": [
                {
                    "aspect": a["aspect"],
                    "resolution": a.get("input_contextualized_conventional_default")
                              or a.get("input_contextualized_ifrs_default")
                              or "resolved",
                    "ambiguous": False,
                }
                for a in dm.get("ambiguities", [])
                if not a.get("ambiguous")
            ],
            "complexity_assessments": [
                {
                    "aspect": f["aspect"],
                    "beyond_llm_capability": False,
                }
                for f in dm.get("complexity_flags", [])
                if not f.get("beyond_llm_capability")
            ],
        }

    if decision == "MISSING_INFO":
        return {
            **base,
            "questions": final_state.get("clarification_questions") or [],
            "ambiguities": [
                {
                    "aspect": a["aspect"],
                    "default_interpretation": a.get("input_contextualized_conventional_default")
                                           or a.get("input_contextualized_ifrs_default"),
                    "clarification_question": a.get("clarification_question"),
                    "cases": [
                        {
                            "case": c["case"],
                            "possible_entry": c.get("possible_entry"),
                        }
                        for c in (a.get("cases") or [])
                    ],
                }
                for a in dm.get("ambiguities", [])
                if a.get("ambiguous")
            ],
        }

    # STUCK
    return {
        **base,
        "stuck_reason": final_state.get("stuck_reason"),
        "capability_gaps": [
            {
                "aspect": f["aspect"],
                "gap": f.get("gap"),
                "best_attempt": f.get("best_attempt"),
            }
            for f in dm.get("complexity_flags", [])
            if f.get("beyond_llm_capability")
        ],
    }


def handle_result(result: dict, message: dict) -> None:
    """Route agent result based on decision. Business logic only.

    For non-interactive sources:
    - PROCEED: call posting service
    - MISSING_INFO/STUCK: set clarification pending status
    For llm_interaction: no routing (handler publishes via Redis).
    """
    if message.get("source") == "llm_interaction":
        return

    decision = result.get("decision", "PROCEED")

    if decision == "PROCEED":
        from services.posting.service import post as posting_post
        posting_post(result)
    elif decision in {"MISSING_INFO", "STUCK"}:
        from services.shared.parse_status import set_status_sync
        set_status_sync(
            parse_id=result.get("parse_id") or message["parse_id"],
            user_id=result.get("user_id") or message["user_id"],
            status="processing",
            stage="clarification_pending",
            input_text=result.get("input_text"),
        )


def execute(message: dict, configurable: dict | None = None, db=None, graph_dao=None) -> dict:
    """Run the agent pipeline (sync).

    Args:
        message: SQS message dict.
        configurable: Extra keys for LangGraph config["configurable"].
        db: SQLAlchemy session (injected by handler).
        graph_dao: TransactionGraphDAO class (injected by handler).
    """
    logger.info("Processing: %s", message.get("parse_id"))

    graph = message.get("graph")
    if graph is None and message.get("graph_id") and db and graph_dao:
        graph = _load_graph(db, graph_dao, message["graph_id"])

    # Jurisdiction config lookup
    jurisdiction_config = _load_jurisdiction_config(db, message.get("entity_id"), message.get("jurisdiction"))

    local_hits, pop_hits = _read_agent_rag(graph, configurable, message.get("entity_id"))
    initial_state = _build_initial_state(message, graph, local_hits, pop_hits)
    cfg = {"streaming": False, "jurisdiction_config": jurisdiction_config, **(configurable or {})}
    final_state = app.invoke(initial_state, {"configurable": cfg})
    return _build_result(final_state, message)


async def execute_stream(message: dict, configurable: dict | None = None, db=None, graph_dao=None):
    """Run the agent pipeline with streaming.

    Yields stream chunks, then a final {"phase": "result", "result": ...} event.
    """
    logger.info("Processing (stream): %s", message.get("parse_id"))

    graph = message.get("graph")
    if graph is None and message.get("graph_id") and db and graph_dao:
        graph = _load_graph(db, graph_dao, message["graph_id"])

    # Jurisdiction config lookup
    jurisdiction_config = _load_jurisdiction_config(db, message.get("entity_id"), message.get("jurisdiction"))

    yield {"action": "chunk.create", "section": "normalization", "label": "Recalling past corrections"}
    local_hits, pop_hits = _read_agent_rag(graph, configurable, message.get("entity_id"))
    n = len(local_hits) + len(pop_hits)
    yield {"action": "block.text", "section": "normalization", "text": f"Found {n} correction{'s' if n != 1 else ''}"}
    yield {"action": "chunk.done", "section": "normalization", "label": "Recalled past corrections" if n > 0 else "No past corrections found"}

    initial_state = _build_initial_state(message, graph, local_hits, pop_hits)
    cfg = {"streaming": True, "jurisdiction_config": jurisdiction_config, **(configurable or {})}
    final_state = None
    async for event in app.astream(initial_state, {"configurable": cfg}, stream_mode=["custom", "values"]):
        mode, payload = event
        if mode == "custom":
            yield payload
        elif mode == "values":
            final_state = payload
    if final_state is not None:
        yield {"phase": "result", "result": _build_result(final_state, message)}
