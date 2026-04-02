"""Decision Maker V4 — gating-only: ambiguity + complexity + decision.

One LLM call that decides whether a transaction can proceed to entry building
or needs clarification / human review. Does not produce the final journal entry.

If PROCEED, a downstream entry-building agent handles the entry.
If MISSING_INFO, returns clarification questions with possible cases.
If STUCK, returns the capability gap and best-attempt entry.
"""
from typing import Literal

from langgraph.graph import StateGraph, END
from langgraph.types import RetryPolicy
from langchain_core.runnables import RunnableConfig
from pydantic import BaseModel, Field

from services.agent.graph.state import PipelineState, COMPLETE
from services.agent.utils.llm import get_llm, invoke_structured


# ── Journal entry schema (for possible cases and best attempts) ──────────

from services.agent.schemas.journal import JournalLine


class JournalEntry(BaseModel):
    reason: str = Field(description="One sentence: why these accounts and amounts")
    lines: list[JournalLine] = Field(description="Journal entry lines")


# ── Ambiguity schema ─────────────────────────────────────────────────────

class PossibleCase(BaseModel):
    case: str = Field(description="One sentence: a possible answer to the clarification question")
    possible_entry: JournalEntry = Field(description="The journal entry under this interpretation")


class AmbiguousItem(BaseModel):
    aspect: str = Field(description="The ambiguous aspect in one phrase")
    input_contextualized_conventional_default: str | None = Field(default=None, description="One sentence: how conventions resolve this given the input, or null if they don't")
    input_contextualized_ifrs_default: str | None = Field(default=None, description="One sentence: how IFRS resolves this given the input, or null if it doesn't")
    clarification_question: str | None = Field(default=None, description="One sentence: question answerable by the person who initiated the transaction, if unresolved")
    cases: list[PossibleCase] | None = Field(default=None, description="Possible answers and how the entry changes for each")
    ambiguous: bool = Field(description="True only if neither conventional nor IFRS default resolves this aspect")


# ── Capability gap schema ────────────────────────────────────────────────

class CapabilityGapItem(BaseModel):
    aspect: str = Field(description="The assessed aspect in one phrase")
    best_attempt: JournalEntry | None = Field(default=None, description="The closest valid entry the system could produce despite the gap")
    gap: str | None = Field(default=None, description="One sentence: what is wrong or missing in the best attempt")
    beyond_llm_capability: bool = Field(description="True if the system cannot handle this correctly")


# ── Output schema ────────────────────────────────────────────────────────

class SingleAgentV31Output(BaseModel):
    ambiguities: list[AmbiguousItem] = Field(description="All identified ambiguities from the transaction text")
    complexity_flags: list[CapabilityGapItem] = Field(description="All aspects assessed for capability gaps")
    proceed_reason: str | None = Field(default=None, description="One sentence: why the entry can proceed despite any flags")
    clarification_questions: list[str] | None = Field(default=None, description="Questions to resolve missing business facts")
    stuck_reason: str | None = Field(default=None, description="One sentence: what prevents the system from producing a correct entry")
    overall_final_rationale: str = Field(description="One sentence: final judgment synthesizing all assessments")
    decision: Literal["PROCEED", "MISSING_INFO", "STUCK"] = Field(description="Final decision")


# ── Node ─────────────────────────────────────────────────────────────────

def decision_maker_node(state: PipelineState, config: RunnableConfig) -> dict:
    """One LLM call: gating decision with ambiguity cases and capability gaps."""
    from services.agent.prompts.decision_maker import build_prompt

    messages = build_prompt(state)
    output = invoke_structured(get_llm("decision_maker", config), SingleAgentV31Output, messages)

    # Map v4 decisions to pipeline state values
    _DECISION_MAP = {
        "PROCEED": "APPROVED",
        "MISSING_INFO": "INCOMPLETE_INFORMATION",
        "STUCK": "STUCK",
    }
    raw_decision = output.get("decision", "PROCEED")
    pipeline_decision = _DECISION_MAP.get(raw_decision, raw_decision)

    update = {
        "output_ambiguity_detector": [{"ambiguities": output.get("ambiguities", [])}],
        "output_disambiguator": [{"ambiguities": output.get("ambiguities", [])}],
        "output_complexity_detector": [{"flags": output.get("complexity_flags", [])}],
        "output_decision_maker": [output],
        "status_ambiguity_detector": COMPLETE,
        "status_disambiguator": COMPLETE,
        "status_complexity_detector": COMPLETE,
        "status_decision_maker": COMPLETE,
        "decision": pipeline_decision,
    }
    if output.get("clarification_questions"):
        update["clarification_questions"] = output["clarification_questions"]
    if output.get("stuck_reason"):
        update["stuck_reason"] = output["stuck_reason"]
    return update
