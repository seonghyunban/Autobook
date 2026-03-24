"""Full agent pipeline graph.

Single flat StateGraph wiring all 8 agent nodes + validation + fix scheduler
+ confidence gate. No subgraphs — single shared PipelineState.

Flow (happy path):
  START → [disambiguator] → debit_classifier ‖ credit_classifier
        → debit_corrector ‖ credit_corrector → entry_builder
        → validation → approver → confidence_gate → END

Flow (fix loop):
  ... → approver (rejected) → diagnostician → fix_scheduler
      → [cycle back to disambiguator] → ... → approver (re-eval)
"""
from langgraph.graph import StateGraph, END
from langgraph.types import RetryPolicy

from config import get_settings
from services.agent.graph.state import (
    PipelineState, AGENT_NAMES, RERUN, COMPLETE,
)
from services.agent.nodes.disambiguator import disambiguator_node
from services.agent.nodes.debit_classifier import debit_classifier_node
from services.agent.nodes.credit_classifier import credit_classifier_node
from services.agent.nodes.debit_corrector import debit_corrector_node
from services.agent.nodes.credit_corrector import credit_corrector_node
from services.agent.nodes.entry_builder import entry_builder_node
from services.agent.nodes.approver import approver_node
from services.agent.nodes.diagnostician import diagnostician_node
from services.agent.utils.scheduler import compute_dirty_set, AGENT_INDEX_TO_NAME
from services.agent.utils.calibration import calibrate_confidence
from accounting_engine.validators import validate_journal_entry, validate_tax


# ── Retry policy for LLM nodes ───────────────────────────────────────────
_RETRY = RetryPolicy(max_attempts=3)


# ── Inline graph nodes (validation, fix scheduler, confidence gate) ───────

def validation_node(state: PipelineState) -> dict:
    """Validate journal entry between Agent 5 and Agent 6.

    Raises ValueError on failure — RetryPolicy retries entry_builder.
    """
    i = state["iteration"]
    entry = state["output_entry_builder"][i]

    validation = validate_journal_entry(entry)
    if not validation["valid"]:
        raise ValueError(f"Journal entry validation failed: {validation['errors']}")

    user_ctx = state.get("user_context", {})
    tax_validation = validate_tax(
        entry,
        province=user_ctx.get("province", "ON"),
        tax_rate=0.13,
    )
    if not tax_validation["valid"]:
        raise ValueError(f"Tax validation failed: {tax_validation['errors']}")

    return {}  # pass-through, no state changes


def fix_scheduler_node(state: PipelineState) -> dict:
    """Orchestrate fix loop: compute dirty set, increment iteration, distribute fix_context."""
    i = state["iteration"]
    diagnosis = state["output_diagnostician"][i]
    fix_plans = diagnosis["fix_plans"]

    # ── Compute dirty set (pure util) ─────────────────────────────
    dirty = compute_dirty_set(fix_plans)

    # ── Build state update ────────────────────────────────────────
    update: dict = {"iteration": i + 1}

    # Set RERUN for dirty agents, leave clean agents as COMPLETE
    for idx, name in AGENT_INDEX_TO_NAME.items():
        if idx in dirty:
            update[f"status_{name}"] = RERUN

    # Distribute fix_context to targeted agents
    for plan in fix_plans:
        idx = plan["agent"]
        name = AGENT_INDEX_TO_NAME.get(idx)
        if name:
            existing = list(state.get(f"fix_context_{name}", []))
            existing.append(plan.get("fix_context", ""))
            update[f"fix_context_{name}"] = existing

    # Clear stale embeddings (for multi-fix support)
    update["embedding_error"] = None
    update["embedding_rejection"] = None

    return update


def confidence_gate_node(state: PipelineState) -> dict:
    """Route based on calibrated confidence: post or clarify."""
    i = state["iteration"]
    approval = state["output_approver"][i]
    raw_confidence = approval["confidence"]

    calibrated = calibrate_confidence(raw_confidence)
    threshold = get_settings().AUTO_POST_THRESHOLD

    return {"route": "post" if calibrated >= threshold else "clarify"}


# ── Routing functions ─────────────────────────────────────────────────────

def route_after_start(state: PipelineState, config) -> str:
    """Skip disambiguator if inactive."""
    configurable = (config or {}).get("configurable", {})
    if configurable.get("disambiguator_active", True):
        return "disambiguator"
    return "classifiers"


def route_after_approver(state: PipelineState) -> str:
    """Approved → confidence gate. Rejected → diagnostician."""
    i = state["iteration"]
    approval = state["output_approver"][i]
    if approval["approved"]:
        return "confidence_gate"
    return "diagnostician"


def route_after_diagnostician(state: PipelineState) -> str:
    """FIX → fix scheduler. STUCK or max iterations → END."""
    i = state["iteration"]
    diagnosis = state["output_diagnostician"][i]
    if diagnosis["decision"] == "STUCK" or i >= 1:  # max 2 iterations (0 and 1)
        return END
    return "fix_scheduler"


def route_after_confidence_gate(state: PipelineState) -> str:
    """Route based on confidence gate result."""
    return state.get("route", "clarify")


# ── Build graph ───────────────────────────────────────────────────────────

builder = StateGraph(PipelineState)

# ── Add nodes ─────────────────────────────────────────────────────────────
builder.add_node("disambiguator", disambiguator_node, retry=_RETRY)
builder.add_node("debit_classifier", debit_classifier_node, retry=_RETRY)
builder.add_node("credit_classifier", credit_classifier_node, retry=_RETRY)
builder.add_node("debit_corrector", debit_corrector_node, retry=_RETRY)
builder.add_node("credit_corrector", credit_corrector_node, retry=_RETRY)
builder.add_node("entry_builder", entry_builder_node, retry=_RETRY)
builder.add_node("validation", validation_node)
builder.add_node("approver", approver_node, retry=_RETRY)
builder.add_node("diagnostician", diagnostician_node, retry=_RETRY)
builder.add_node("fix_scheduler", fix_scheduler_node)
builder.add_node("confidence_gate", confidence_gate_node)

# ── Edges: START → disambiguator or classifiers ──────────────────────────
builder.add_conditional_edges("__start__", route_after_start, {
    "disambiguator": "disambiguator",
    "classifiers": "debit_classifier",  # fan-out handled below
})

# ── Edges: disambiguator → classifiers (fan-out) ─────────────────────────
builder.add_edge("disambiguator", "debit_classifier")
builder.add_edge("disambiguator", "credit_classifier")

# ── Edges: classifiers → correctors (fan-out) ────────────────────────────
# Both classifiers must complete (superstep) before correctors start
builder.add_edge("debit_classifier", "debit_corrector")
builder.add_edge("debit_classifier", "credit_corrector")
builder.add_edge("credit_classifier", "debit_corrector")
builder.add_edge("credit_classifier", "credit_corrector")

# ── Edges: correctors → entry builder (fan-in) ───────────────────────────
builder.add_edge("debit_corrector", "entry_builder")
builder.add_edge("credit_corrector", "entry_builder")

# ── Edges: entry builder → validation → approver ─────────────────────────
builder.add_edge("entry_builder", "validation")
builder.add_edge("validation", "approver")

# ── Edges: approver → confidence gate or diagnostician ────────────────────
builder.add_conditional_edges("approver", route_after_approver, {
    "confidence_gate": "confidence_gate",
    "diagnostician": "diagnostician",
})

# ── Edges: diagnostician → fix scheduler or END ──────────────────────────
builder.add_conditional_edges("diagnostician", route_after_diagnostician, {
    "fix_scheduler": "fix_scheduler",
    END: END,
})

# ── Edges: fix scheduler → cycle back to disambiguator ────────────────────
builder.add_conditional_edges("fix_scheduler", route_after_start, {
    "disambiguator": "disambiguator",
    "classifiers": "debit_classifier",
})

# ── Edges: confidence gate → END ─────────────────────────────────────────
builder.add_edge("confidence_gate", END)

# ── Compile ───────────────────────────────────────────────────────────────
app = builder.compile()
