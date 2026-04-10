"""Tax Specialist — determines tax treatment from transaction text.

Output: TaxSpecialistOutput {reasoning, tax_mentioned, classification, itc_eligible, amount_tax_inclusive, tax_rate, tax_context}
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
    classification: Literal["taxable", "zero_rated", "exempt", "out_of_scope"] = Field(description="Tax classification of the supply: taxable (standard rate), zero_rated (0% but ITC claimable), exempt (no tax, no ITC), out_of_scope (not a taxable supply)")
    itc_eligible: bool = Field(description="True if the business can claim an Input Tax Credit on this tax")
    amount_tax_inclusive: bool = Field(description="True if the stated transaction amount already includes tax")
    tax_rate: float | None = Field(default=None, description="Applicable tax rate as decimal, e.g. 0.10 for 10%")
    tax_context: str | None = Field(default=None, description="Brief tax context for the entry drafter: what tax applies, which components are taxable, any special rules")


# ── Stream helpers ──────────────────────────────────────────────────────

def _write_start(writer) -> None:
    if writer is None:
        return
    writer({"action": "chunk.create", "section": "tax", "label": "Considering tax applicability..."})


def _write_complete(writer, output: dict) -> None:
    """Stream the tax output leaf by leaf in display order."""
    if writer is None:
        return
    from services.agent.utils.tracing.renderers import (
        render_tax_detection, render_tax_context,
        render_tax_reasoning, render_tax_decision,
    )
    writer({"action": "block.text", "section": "tax", "text": render_tax_detection(output.get("tax_mentioned", False), output.get("classification", "out_of_scope"))})
    ctx = render_tax_context(output.get("tax_context"))
    if ctx:
        writer({"action": "block.text", "section": "tax", "text": ctx})
    reasoning = render_tax_reasoning(output.get("reasoning", ""))
    if reasoning:
        writer({"action": "block.text", "section": "tax", "text": reasoning})
    writer({"action": "block.text", "section": "tax", "text": render_tax_decision(output.get("classification", "out_of_scope"), output.get("itc_eligible", False), output.get("amount_tax_inclusive", False), output.get("tax_rate"))})
    writer({"action": "chunk.done", "section": "tax", "label": "Tax consideration determined"})


# ── Node ────────────────────────────────────────────────────────────────

def tax_specialist_node(state: PipelineState, config: RunnableConfig) -> dict:
    """Determine tax treatment for the transaction."""
    writer = get_stream_writer() if config.get("configurable", {}).get("streaming") else None

    _write_start(writer)

    from services.agent.utils.prompt.corrections import render_corrections
    corrections = render_corrections(
        state.get("rag_local_hits", []),
        state.get("rag_pop_hits", []),
        attempted_key="attempted_tax",
        corrected_key="corrected_tax",
        note_key="note_tax",
        label="tax treatment",
    )

    jc = config.get("configurable", {}).get("jurisdiction_config")

    from services.agent.utils.prompt.tax_context import render_tax_jurisdiction
    tax_jurisdiction = render_tax_jurisdiction(jc.tax_rules if jc else None)

    messages = build_prompt(
        state,
        corrections=corrections or None,
        jurisdiction_config=jc,
        tax_jurisdiction=tax_jurisdiction or None,
    )
    output = invoke_structured(get_llm(TAX_SPECIALIST, config), TaxSpecialistOutput, messages)

    _write_complete(writer, output)

    return {
        "output_tax_specialist": output,
    }
