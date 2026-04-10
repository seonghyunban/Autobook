"""Credit Classifier — classifies credit-side journal lines.

Each detection gets a reason, IFRS taxonomy category, and count.
Output: CreditClassifierOutput with list per directional slot.
"""
from langchain_core.runnables import RunnableConfig
from pydantic import BaseModel, Field

from services.agent.graph.state import PipelineState, CREDIT_CLASSIFIER
from services.agent.prompts.credit_classifier import build_prompt
from services.agent.schemas.taxonomy import (
    ASSET_CATEGORIES, EXPENSE_CATEGORIES, LIABILITY_CATEGORIES,
    EQUITY_CATEGORIES, REVENUE_CATEGORIES,
)
from langgraph.config import get_stream_writer

from services.agent.utils.llm import get_llm, invoke_structured


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


# ── Stream helpers ──────────────────────────────────────────────────────

def _write_start(writer) -> None:
    if writer is None:
        return
    writer({"action": "chunk.create", "section": "credit", "label": "Identifying credit relationship..."})


def _write_complete(writer, output: dict) -> None:
    """Stream classifier output leaf by leaf: slot_and_count, reason, taxonomy per detection."""
    if writer is None:
        return
    from services.agent.utils.slots import CREDIT_SLOTS
    from services.agent.utils.tracing.renderers import (
        render_slot_and_count, render_slot_reason, render_taxonomy,
    )
    has_detections = any(output.get(slot) for slot in CREDIT_SLOTS)
    writer({"action": "chunk.label", "section": "credit", "label": "Credit relationship identified" if has_detections else "No credit relationship identified"})
    for slot in CREDIT_SLOTS:
        for det in output.get(slot, []):
            writer({"action": "block.collapsible", "section": "credit", "text": render_slot_and_count(slot, det.get("count", 1))})
            writer({"action": "line", "section": "credit", "tag": "Reason", "text": render_slot_reason(det.get("reason", ""))})
            writer({"action": "line", "section": "credit", "tag": "IFRS category", "text": render_taxonomy(det.get("category", ""))})
    writer({"action": "chunk.done", "section": "credit"})


# ── Node ────────────────────────────────────────────────────────────────

def credit_classifier_node(state: PipelineState, config: RunnableConfig) -> dict:
    """Classify credit lines into per-slot directional categories."""
    writer = get_stream_writer() if config.get("configurable", {}).get("streaming") else None

    _write_start(writer)

    rag_examples = state.get("rag_local_hits", []) + state.get("rag_pop_hits", [])

    from services.agent.utils.prompt.corrections import render_corrections
    corrections = render_corrections(
        state.get("rag_local_hits", []),
        state.get("rag_pop_hits", []),
        attempted_key="attempted_classifications",
        corrected_key="corrected_classifications",
        label="credit classifications",
    )

    jc = config.get("configurable", {}).get("jurisdiction_config")
    messages = build_prompt(state, rag_examples, corrections=corrections or None, jurisdiction_config=jc)

    # Use dynamic schema if jurisdiction config available, otherwise static
    if jc:
        from services.agent.schemas.dynamic import get_credit_schema
        schema = get_credit_schema(jc)
    else:
        schema = CreditClassifierOutput

    output = invoke_structured(get_llm(CREDIT_CLASSIFIER, config), schema, messages)

    _write_complete(writer, output)

    return {
        "output_credit_classifier": output,
    }
