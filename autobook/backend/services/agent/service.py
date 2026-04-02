"""Agent service — runs the dual-track pipeline.

Provides sync execute() for SQS workers and async execute_stream() for SSE.
"""
import logging

from services.agent.graph.graph import app

logger = logging.getLogger(__name__)


def _build_initial_state(message: dict) -> dict:
    """Build PipelineState from incoming queue message."""
    return {
        "transaction_text": message.get("input_text") or message.get("description") or "",
        "user_context": {
            "province": "ON",
            "entity_type": "corporation",
        },
        "ml_enrichment": {
            "intent_label": message.get("intent_label"),
            "bank_category": message.get("bank_category"),
            "entities": message.get("entities"),
        },
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
    """
    decision = final_state.get("decision") or "PROCEED"
    dm = final_state.get("output_decision_maker") or {}

    base = {**message, "decision": decision}

    if decision == "PROCEED":
        return {
            **base,
            "entry": final_state.get("output_entry_drafter"),
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


def execute(message: dict) -> dict:
    """Run the agent pipeline (sync — for SQS workers and sync callers)."""
    logger.info("Processing: %s", message.get("parse_id"))
    initial_state = _build_initial_state(message)
    final_state = app.invoke(initial_state)
    return _build_result(final_state, message)


async def execute_stream(message: dict):
    """Run the agent pipeline with streaming (async generator — for SSE endpoint)."""
    logger.info("Processing (stream): %s", message.get("parse_id"))
    initial_state = _build_initial_state(message)
    async for chunk in app.astream(initial_state, stream_mode="custom"):
        yield chunk
