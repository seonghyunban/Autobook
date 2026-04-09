"""Agent service — runs the dual-track pipeline.

Provides sync execute() for SQS workers and async execute_stream() for SSE.
"""
import logging

from services.agent.graph.graph import app

logger = logging.getLogger(__name__)


def _build_initial_state(message: dict) -> dict:
    """Build PipelineState from incoming queue message.

    Expects message["graph"] to already be loaded (by the handler).
    """
    return {
        "transaction_text": message.get("input_text") or message.get("description") or "",
        "transaction_graph": message.get("graph"),
        "user_context": message.get("user_context"),
        "output_decision_maker": None,
        "output_debit_classifier": None,
        "output_credit_classifier": None,
        "output_tax_specialist": None,
        "output_entry_drafter": None,
        "rag_cache_debit_classifier": [],
        "rag_cache_credit_classifier": [],
        "decision": None,
        "clarification_questions": None,
        "stuck_reason": None,
    }


def _build_result(final_state: dict, message: dict) -> dict:
    """Build decision-specific result from graph output.

    Returns one of three shapes:
    - PROCEED:      {decision, entry, proceed_reason, resolved_ambiguities, complexity_assessments}
    - MISSING_INFO: {decision, questions, ambiguities}
    - STUCK:        {decision, stuck_reason, capability_gaps}

    If live_review is true, includes full pipeline state and graph for the review panel.
    """
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
    """Route agent result based on decision. Business logic only — no side-effects.

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


def execute(message: dict, configurable: dict | None = None) -> dict:
    """Run the agent pipeline (sync — for SQS workers and sync callers).

    Args:
        message: SQS message dict with input_text, graph, etc.
        configurable: Extra keys merged into LangGraph config["configurable"].
                      Use to inject bedrock_client, memory, etc.
    """
    logger.info("Processing: %s", message.get("parse_id"))
    initial_state = _build_initial_state(message)
    cfg = {"streaming": False, **(configurable or {})}
    final_state = app.invoke(initial_state, {"configurable": cfg})
    return _build_result(final_state, message)


async def execute_stream(message: dict, configurable: dict | None = None):
    """Run the agent pipeline with streaming.

    Yields stream chunks, then a final {"phase": "result", "result": ...} event.
    """
    logger.info("Processing (stream): %s", message.get("parse_id"))
    initial_state = _build_initial_state(message)
    cfg = {"streaming": True, **(configurable or {})}
    final_state = None
    async for event in app.astream(initial_state, {"configurable": cfg}, stream_mode=["custom", "values"]):
        mode, payload = event
        if mode == "custom":
            yield payload
        elif mode == "values":
            final_state = payload
    if final_state is not None:
        yield {"phase": "result", "result": _build_result(final_state, message)}
