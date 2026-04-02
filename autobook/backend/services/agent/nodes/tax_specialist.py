"""Tax Specialist — determines tax treatment from transaction text.

Output: TaxSpecialistOutput {reasoning, tax_mentioned, taxable, tax_context, tax_rate, add_tax_lines, treatment}
"""
from typing import Literal

from langchain_core.runnables import RunnableConfig
from pydantic import BaseModel, Field

from services.agent.graph.state import PipelineState, TAX_SPECIALIST, COMPLETE
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


# ── Node ────────────────────────────────────────────────────────────────

def tax_specialist_node(state: PipelineState, config: RunnableConfig) -> dict:
    """Determine tax treatment for the transaction."""
    i = state["iteration"]
    history = list(state.get("output_tax_specialist", []))

    if state.get("status_tax_specialist") == COMPLETE:
        history.append(history[i - 1])
        return {"output_tax_specialist": history, "status_tax_specialist": COMPLETE}

    messages = build_prompt(state)
    output = invoke_structured(get_llm(TAX_SPECIALIST, config), TaxSpecialistOutput, messages)
    history.append(output)

    return {
        "output_tax_specialist": history,
        "status_tax_specialist": COMPLETE,
    }
