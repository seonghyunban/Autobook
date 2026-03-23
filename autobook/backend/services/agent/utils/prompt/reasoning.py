"""Compile the generator reasoning trace from pipeline state.

Rule-based: the agent output fields and their order are known at design time.
Used by Approver (Agent 6) and Diagnostician (Agent 7).
"""
from services.agent.graph.state import (
    DISAMBIGUATOR, DEBIT_CLASSIFIER, CREDIT_CLASSIFIER,
    DEBIT_CORRECTOR, CREDIT_CORRECTOR, ENTRY_BUILDER,
    PipelineState,
)

_AGENT_LABELS: list[tuple[str, str]] = [
    (f"output_{DISAMBIGUATOR}", "Agent 0 (Disambiguator)"),
    (f"output_{DEBIT_CLASSIFIER}", "Agent 1 (Debit Classifier)"),
    (f"output_{CREDIT_CLASSIFIER}", "Agent 2 (Credit Classifier)"),
    (f"output_{DEBIT_CORRECTOR}", "Agent 3 (Debit Corrector)"),
    (f"output_{CREDIT_CORRECTOR}", "Agent 4 (Credit Corrector)"),
    (f"output_{ENTRY_BUILDER}", "Agent 5 (Entry Builder)"),
]


def compile_reasoning_trace(state: PipelineState) -> str:
    """Compile a labeled reasoning trace from all generator agent outputs.

    Args:
        state: Pipeline state containing output_* fields.

    Returns:
        Formatted string with each agent's output labeled, e.g.:
        "Agent 1 (Debit Classifier): (1,0,1,0,0,0)"
    """
    lines = []
    for field, label in _AGENT_LABELS:
        val = state.get(field)
        if val is not None:
            lines.append(f"{label}: {val}")
    return "\n".join(lines)
