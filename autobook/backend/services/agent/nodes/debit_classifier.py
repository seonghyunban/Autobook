"""Debit Classifier — classifies debit-side journal lines.

Each detection gets a reason, IFRS taxonomy category, and count.
Output: DebitClassifierOutput with list per directional slot.
"""
from langchain_core.runnables import RunnableConfig
from pydantic import BaseModel, Field

from services.agent.graph.state import PipelineState, DEBIT_CLASSIFIER
from services.agent.prompts.debit_classifier import build_prompt
from services.agent.rag.transaction import retrieve_transaction_examples
from services.agent.schemas.taxonomy import (
    ASSET_CATEGORIES, EXPENSE_CATEGORIES, LIABILITY_CATEGORIES,
    EQUITY_CATEGORIES, REVENUE_CATEGORIES,
)
from langgraph.config import get_stream_writer

from services.agent.utils.llm import get_llm, invoke_structured


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


# ── Stream helpers ──────────────────────────────────────────────────────

def _write_start(writer) -> None:
    if writer is None:
        return
    writer({"action": "chunk.create", "section": "debit", "label": "Identifying debit relationship..."})


def _write_complete(writer, output: dict) -> None:
    """Stream classifier output leaf by leaf: slot_and_count, reason, taxonomy per detection."""
    if writer is None:
        return
    from services.agent.utils.slots import DEBIT_SLOTS
    from services.agent.utils.tracing.renderers import (
        render_slot_and_count, render_slot_reason, render_taxonomy,
    )
    has_detections = any(output.get(slot) for slot in DEBIT_SLOTS)
    writer({"action": "chunk.label", "section": "debit", "label": "Debit relationship identified" if has_detections else "No debit relationship identified"})
    for slot in DEBIT_SLOTS:
        for det in output.get(slot, []):
            writer({"action": "block.collapsible", "section": "debit", "text": render_slot_and_count(slot, det.get("count", 1))})
            writer({"action": "line", "section": "debit", "tag": "Reason", "text": render_slot_reason(det.get("reason", ""))})
            writer({"action": "line", "section": "debit", "tag": "IFRS category", "text": render_taxonomy(det.get("category", ""))})
    writer({"action": "chunk.done", "section": "debit"})


# ── Node ────────────────────────────────────────────────────────────────

def debit_classifier_node(state: PipelineState, config: RunnableConfig) -> dict:
    """Classify debit lines into per-slot directional categories."""
    writer = get_stream_writer() if config.get("configurable", {}).get("streaming") else None

    _write_start(writer)

    rag_examples = retrieve_transaction_examples(state, "rag_cache_debit_classifier", config)

    messages = build_prompt(state, rag_examples)
    output = invoke_structured(get_llm(DEBIT_CLASSIFIER, config), DebitClassifierOutput, messages)

    _write_complete(writer, output)

    return {
        "output_debit_classifier": output,
        "rag_cache_debit_classifier": rag_examples,
    }
