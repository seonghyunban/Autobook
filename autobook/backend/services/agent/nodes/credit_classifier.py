"""Credit Classifier — classifies credit-side journal lines.

Each detection gets a reason, IFRS taxonomy category, and count.
Output: CreditClassifierOutput with list per directional slot.
"""
from langchain_core.runnables import RunnableConfig
from pydantic import BaseModel, Field

from services.agent.graph.state import PipelineState, CREDIT_CLASSIFIER, COMPLETE
from services.agent.prompts.credit_classifier import build_prompt
from services.agent.rag.transaction import retrieve_transaction_examples
from services.agent.schemas.taxonomy import (
    ASSET_CATEGORIES, EXPENSE_CATEGORIES, LIABILITY_CATEGORIES,
    EQUITY_CATEGORIES, REVENUE_CATEGORIES,
)
from services.agent.utils.llm import get_llm, invoke_structured
from services.agent.utils.slots import extract_credit_tuple


# ── Detection schemas ───────────────────────────────────────────────────

class LiabilityIncreaseDetection(BaseModel):
    reason: str = Field(description="One sentence: what causes the liability increase")
    category: LIABILITY_CATEGORIES = Field(description="IFRS liability category")
    count: int = Field(description="Number of journal lines for this category")


class EquityIncreaseDetection(BaseModel):
    reason: str = Field(description="One sentence: what causes the equity increase")
    category: EQUITY_CATEGORIES = Field(description="IFRS equity category")
    count: int = Field(description="Number of journal lines for this category")


class RevenueIncreaseDetection(BaseModel):
    reason: str = Field(description="One sentence: what causes the revenue increase")
    category: REVENUE_CATEGORIES = Field(description="IFRS revenue/income category")
    count: int = Field(description="Number of journal lines for this category")


class AssetDecreaseDetection(BaseModel):
    reason: str = Field(description="One sentence: what causes the asset decrease")
    category: ASSET_CATEGORIES = Field(description="IFRS asset category")
    count: int = Field(description="Number of journal lines for this category")


class ExpenseDecreaseDetection(BaseModel):
    reason: str = Field(description="One sentence: what causes the expense decrease")
    category: EXPENSE_CATEGORIES = Field(description="IFRS expense category")
    count: int = Field(description="Number of journal lines for this category")


# ── Output schema ───────────────────────────────────────────────────────

class CreditClassifierOutput(BaseModel):
    liability_increase: list[LiabilityIncreaseDetection] = Field(default_factory=list, description="Detected liability balance increases")
    equity_increase: list[EquityIncreaseDetection] = Field(default_factory=list, description="Detected equity balance increases")
    revenue_increase: list[RevenueIncreaseDetection] = Field(default_factory=list, description="Detected revenue balance increases")
    asset_decrease: list[AssetDecreaseDetection] = Field(default_factory=list, description="Detected asset balance decreases")
    expense_decrease: list[ExpenseDecreaseDetection] = Field(default_factory=list, description="Detected expense balance decreases")


# ── Node ────────────────────────────────────────────────────────────────

def credit_classifier_node(state: PipelineState, config: RunnableConfig) -> dict:
    """Classify credit lines into per-slot directional categories."""
    i = state["iteration"]
    history = list(state.get("output_credit_classifier", []))

    if state.get("status_credit_classifier") == COMPLETE:
        history.append(history[i - 1])
        return {"output_credit_classifier": history, "status_credit_classifier": COMPLETE}

    rag_examples = retrieve_transaction_examples(state, "rag_cache_credit_classifier")
    fix_ctx = (state.get("fix_context_credit_classifier") or [None])[-1]

    messages = build_prompt(state, rag_examples, fix_context=fix_ctx)
    output = invoke_structured(get_llm(CREDIT_CLASSIFIER, config), CreditClassifierOutput, messages)

    output["tuple"] = list(extract_credit_tuple(output))
    history.append(output)

    return {
        "output_credit_classifier": history,
        "rag_cache_credit_classifier": rag_examples,
        "status_credit_classifier": COMPLETE,
    }
