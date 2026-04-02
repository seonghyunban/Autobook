"""Debit Classifier — classifies debit-side journal lines.

Each detection gets a reason, IFRS taxonomy category, and count.
Output: DebitClassifierOutput with list per directional slot.
"""
from langchain_core.runnables import RunnableConfig
from pydantic import BaseModel, Field

from services.agent.graph.state import PipelineState, DEBIT_CLASSIFIER, COMPLETE
from services.agent.prompts.debit_classifier import build_prompt
from services.agent.rag.transaction import retrieve_transaction_examples
from services.agent.schemas.taxonomy import (
    ASSET_CATEGORIES, EXPENSE_CATEGORIES, LIABILITY_CATEGORIES,
    EQUITY_CATEGORIES, REVENUE_CATEGORIES,
)
from services.agent.utils.llm import get_llm, invoke_structured
from services.agent.utils.slots import extract_debit_tuple


# ── Detection schemas ───────────────────────────────────────────────────

class AssetIncreaseDetection(BaseModel):
    reason: str = Field(description="One sentence: what causes the asset increase")
    category: ASSET_CATEGORIES = Field(description="IFRS asset category")
    count: int = Field(description="Number of journal lines for this category")


class ExpenseIncreaseDetection(BaseModel):
    reason: str = Field(description="One sentence: what causes the expense increase")
    category: EXPENSE_CATEGORIES = Field(description="IFRS expense category")
    count: int = Field(description="Number of journal lines for this category")


class LiabilityDecreaseDetection(BaseModel):
    reason: str = Field(description="One sentence: what causes the liability decrease")
    category: LIABILITY_CATEGORIES = Field(description="IFRS liability category")
    count: int = Field(description="Number of journal lines for this category")


class EquityDecreaseDetection(BaseModel):
    reason: str = Field(description="One sentence: what causes the equity decrease")
    category: EQUITY_CATEGORIES = Field(description="IFRS equity category")
    count: int = Field(description="Number of journal lines for this category")


class RevenueDecreaseDetection(BaseModel):
    reason: str = Field(description="One sentence: what causes the revenue decrease")
    category: REVENUE_CATEGORIES = Field(description="IFRS revenue/income category")
    count: int = Field(description="Number of journal lines for this category")


# ── Output schema ───────────────────────────────────────────────────────

class DebitClassifierOutput(BaseModel):
    asset_increase: list[AssetIncreaseDetection] = Field(default_factory=list, description="Detected asset balance increases")
    expense_increase: list[ExpenseIncreaseDetection] = Field(default_factory=list, description="Detected expense balance increases")
    liability_decrease: list[LiabilityDecreaseDetection] = Field(default_factory=list, description="Detected liability balance decreases")
    equity_decrease: list[EquityDecreaseDetection] = Field(default_factory=list, description="Detected equity balance decreases")
    revenue_decrease: list[RevenueDecreaseDetection] = Field(default_factory=list, description="Detected revenue balance decreases")


# ── Node ────────────────────────────────────────────────────────────────

def debit_classifier_node(state: PipelineState, config: RunnableConfig) -> dict:
    """Classify debit lines into per-slot directional categories."""
    i = state["iteration"]
    history = list(state.get("output_debit_classifier", []))

    if state.get("status_debit_classifier") == COMPLETE:
        history.append(history[i - 1])
        return {"output_debit_classifier": history, "status_debit_classifier": COMPLETE}

    rag_examples = retrieve_transaction_examples(state, "rag_cache_debit_classifier")
    fix_ctx = (state.get("fix_context_debit_classifier") or [None])[-1]

    messages = build_prompt(state, rag_examples, fix_context=fix_ctx)
    output = invoke_structured(get_llm(DEBIT_CLASSIFIER, config), DebitClassifierOutput, messages)

    output["tuple"] = list(extract_debit_tuple(output))
    history.append(output)

    return {
        "output_debit_classifier": history,
        "rag_cache_debit_classifier": rag_examples,
        "status_debit_classifier": COMPLETE,
    }
