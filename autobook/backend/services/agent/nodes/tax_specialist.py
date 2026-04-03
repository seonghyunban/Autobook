"""Tax Specialist — determines tax treatment from transaction text.

Output: TaxSpecialistOutput {reasoning, tax_mentioned, taxable, tax_context, tax_rate, add_tax_lines, treatment}
"""
from typing import Literal

from langchain_core.runnables import RunnableConfig
from pydantic import BaseModel, Field

from langgraph.config import get_stream_writer

from services.agent.graph.state import PipelineState, TAX_SPECIALIST
from services.agent.prompts.tax_specialist import build_prompt
from services.agent.utils.llm import get_llm, invoke_structured


# ── Output schema ───────────────────────────────────────────────────────

class TaxSpecialistOutput(BaseModel):
    reasoning: str = Field(description="Concise: what the transaction text says about tax and what treatment applies")
    tax_mentioned: bool = Field(description="True if the transaction text explicitly mentions tax")
    taxable: bool = Field(description="Supplementary metadata: true if this supply category is subject to tax. Not an instruction to add tax lines.")
    tax_context: str | None = Field(default=None, description="Brief tax context for the entry drafter: what tax applies, which components are taxable, any special rules")
    tax_rate: float | None = Field(default=None, description="Tax rate from the transaction text, e.g. 0.10 for 10%")
    add_tax_lines: bool = Field(description="True if the entry should include separate tax lines. False means no tax lines regardless of taxability.")
    treatment: Literal["recoverable", "non_recoverable", "not_applicable"] = Field(description="How to record the tax: as receivable, as part of expense, or not applicable")


# ── Stream helpers ──────────────────────────────────────────────────────

def _write_start(writer, agent: str) -> None:
    if writer is None:
        return
    writer({"agent": agent, "phase": "started"})


def _write_complete(writer, agent: str, output: dict) -> None:
    """Stream the tax output leaf by leaf in display order."""
    if writer is None:
        return
    from services.agent.utils.tracing.renderers import (
        render_tax_detection, render_tax_context,
        render_tax_reasoning, render_tax_decision,
    )
    writer({"agent": agent, "phase": "tax_detection", "text": render_tax_detection(output.get("tax_mentioned", False), output.get("taxable", False))})
    ctx = render_tax_context(output.get("tax_context"))
    if ctx:
        writer({"agent": agent, "phase": "tax_context", "text": ctx})
    reasoning = render_tax_reasoning(output.get("reasoning", ""))
    if reasoning:
        writer({"agent": agent, "phase": "tax_reasoning", "text": reasoning})
    writer({"agent": agent, "phase": "tax_decision", "text": render_tax_decision(output.get("add_tax_lines", False), output.get("tax_rate"), output.get("treatment", ""))})
    writer({"agent": agent, "phase": "done"})


# ── Node ────────────────────────────────────────────────────────────────

def tax_specialist_node(state: PipelineState, config: RunnableConfig) -> dict:
    """Determine tax treatment for the transaction."""
    writer = get_stream_writer() if config.get("configurable", {}).get("streaming") else None

    _write_start(writer, "tax_specialist")

    messages = build_prompt(state)
    output = invoke_structured(get_llm(TAX_SPECIALIST, config), TaxSpecialistOutput, messages)

    _write_complete(writer, "tax_specialist", output)

    return {
        "output_tax_specialist": output,
    }
