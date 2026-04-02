"""Baseline V4 Dual-Track — decision maker + classifiers in parallel.

4-way parallel fan-out:
  - decision_maker_v4 (gating: PROCEED / MISSING_INFO / STUCK)
  - debit_classifier
  - credit_classifier
  - tax_specialist

After join:
  - If PROCEED → entry_drafter (with decision_maker context) → merge_lines → END
  - If MISSING_INFO or STUCK → END (no entry)
"""
from langgraph.graph import StateGraph, END
from langgraph.types import RetryPolicy

from services.agent.graph.state import PipelineState

# ── Track 1: Decision Maker V4 (gating) ─────────────────────────────────
from variants.decision_maker_v4.graph import decision_maker_v4_node

# ── Track 2: Classifiers + Tax (from production pipeline) ───────────────
from services.agent.nodes.debit_classifier import debit_classifier_node
from services.agent.nodes.credit_classifier import credit_classifier_node
from services.agent.nodes.tax_specialist import tax_specialist_node

# ── Entry Drafter + Merge (runs only on PROCEED) ────────────────────────
from services.agent.nodes.entry_drafter import entry_drafter_node
from services.agent.nodes.non_llm.merge_lines import merge_lines_node


# ── Retry policy ─────────────────────────────────────────────────────────
_RETRY = RetryPolicy(max_attempts=3)


# ── Routers ──────────────────────────────────────────────────────────────

def route_start(state: PipelineState) -> list[str]:
    """Fan out to all 4 tracks in parallel."""
    return [
        "decision_maker_v4",
        "debit_classifier",
        "credit_classifier",
        "tax_specialist",
    ]


def route_after_join(state: PipelineState) -> str:
    """Route based on decision maker output."""
    decision = state.get("decision")
    if decision == "APPROVED":
        return "entry_drafter"
    return "end"


# ── Build graph ──────────────────────────────────────────────────────────

builder = StateGraph(PipelineState)

# ── Nodes ────────────────────────────────────────────────────────────────
builder.add_node("decision_maker_v4", decision_maker_v4_node, retry=_RETRY)
builder.add_node("debit_classifier", debit_classifier_node, retry=_RETRY)
builder.add_node("credit_classifier", credit_classifier_node, retry=_RETRY)
builder.add_node("tax_specialist", tax_specialist_node, retry=_RETRY)
builder.add_node("entry_drafter", entry_drafter_node, retry=_RETRY)
builder.add_node("merge_lines", merge_lines_node)


def join_node(state: PipelineState) -> dict:
    """No-op join point. All 4 parallel tracks must complete before this."""
    return {}

builder.add_node("join", join_node)

# ── Edges: START → 4-way parallel ────────────────────────────────────────
builder.add_conditional_edges("__start__", route_start, {
    "decision_maker_v4": "decision_maker_v4",
    "debit_classifier": "debit_classifier",
    "credit_classifier": "credit_classifier",
    "tax_specialist": "tax_specialist",
})

# ── Edges: all 4 → join ─────────────────────────────────────────────────
builder.add_edge("decision_maker_v4", "join")
builder.add_edge("debit_classifier", "join")
builder.add_edge("credit_classifier", "join")
builder.add_edge("tax_specialist", "join")

# ── Edges: join → entry_drafter or END ───────────────────────────────────
builder.add_conditional_edges("join", route_after_join, {
    "entry_drafter": "entry_drafter",
    "end": END,
})

# ── Edges: entry_drafter → merge_lines → END ────────────────────────────
builder.add_edge("entry_drafter", "merge_lines")
builder.add_edge("merge_lines", END)

# ── Compile ──────────────────────────────────────────────────────────────
app = builder.compile()
