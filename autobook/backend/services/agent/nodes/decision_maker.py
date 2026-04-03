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

from langgraph.config import get_stream_writer

from services.agent.graph.state import PipelineState
from services.agent.prompts.decision_maker import build_prompt
from services.agent.utils.llm import get_llm, invoke_structured


# ── Shared journal entry schema ──────────────────────────────────────────

from services.agent.schemas.journal import JournalEntry


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

class DecisionMakerOutput(BaseModel):
    ambiguities: list[AmbiguousItem] = Field(description="All identified ambiguities from the transaction text")
    complexity_flags: list[CapabilityGapItem] = Field(description="All aspects assessed for capability gaps")
    proceed_reason: str | None = Field(default=None, description="One sentence: why the entry can proceed despite any flags")
    overall_final_rationale: str = Field(description="One sentence: final judgment synthesizing all assessments")
    decision: Literal["PROCEED", "MISSING_INFO", "STUCK"] = Field(description="Final decision")


# ── Node ─────────────────────────────────────────────────────────────────

def _write_start(writer, agent: str) -> None:
    if writer is None:
        return
    writer({"agent": agent, "phase": "started"})


def _write_complete(writer, agent: str, output: dict) -> None:
    """Stream the DM output leaf by leaf in display order."""
    if writer is None:
        return
    from services.agent.utils.tracing.renderers import (
        render_ambiguity_summary, render_ambiguity_aspect,
        render_conventional_default, render_ifrs_default,
        render_clarification_question, render_case_label,
        render_possible_entry, render_ambiguity_status,
        render_complexity_summary, render_complexity_aspect,
        render_best_attempt, render_gap_description, render_complexity_status,
        render_proceed_reason, render_rationale, render_decision,
    )

    ambiguities = output.get("ambiguities", [])
    flags = output.get("complexity_flags", [])

    # 1. Ambiguity
    writer({"agent": agent, "phase": "ambiguity_start"})
    for a in ambiguities:
        writer({"agent": agent, "phase": "ambiguity_aspect", "text": render_ambiguity_aspect(a.get("aspect", ""))})
        conv = render_conventional_default(a.get("input_contextualized_conventional_default"))
        if conv:
            writer({"agent": agent, "phase": "ambiguity_conventional", "text": conv})
        ifrs = render_ifrs_default(a.get("input_contextualized_ifrs_default"))
        if ifrs:
            writer({"agent": agent, "phase": "ambiguity_ifrs", "text": ifrs})
        q = render_clarification_question(a.get("clarification_question"))
        if q:
            writer({"agent": agent, "phase": "ambiguity_question", "text": q})
        for case in (a.get("cases") or []):
            writer({"agent": agent, "phase": "ambiguity_case_label", "text": render_case_label(case.get("case", ""))})
            pe = render_possible_entry(case.get("possible_entry"))
            if pe:
                writer({"agent": agent, "phase": "ambiguity_case_entry", "text": pe})
        writer({"agent": agent, "phase": "ambiguity_status", "text": render_ambiguity_status(a.get("ambiguous", False))})
    writer({"agent": agent, "phase": "ambiguity_summary", "text": render_ambiguity_summary(ambiguities)})
    writer({"agent": agent, "phase": "ambiguity_done"})

    # 2. Complexity
    writer({"agent": agent, "phase": "complexity_start"})
    for f in flags:
        writer({"agent": agent, "phase": "complexity_aspect", "text": render_complexity_aspect(f.get("aspect", ""))})
        ba = render_best_attempt(f.get("best_attempt"))
        if ba:
            writer({"agent": agent, "phase": "complexity_best_attempt", "text": ba})
        gap = render_gap_description(f.get("gap"))
        if gap:
            writer({"agent": agent, "phase": "complexity_gap", "text": gap})
        writer({"agent": agent, "phase": "complexity_status", "text": render_complexity_status(f.get("beyond_llm_capability", False))})
    writer({"agent": agent, "phase": "complexity_summary", "text": render_complexity_summary(flags)})
    writer({"agent": agent, "phase": "complexity_done"})

    # 3. Decision
    writer({"agent": agent, "phase": "decision_start"})
    pr = render_proceed_reason(output.get("proceed_reason"))
    if pr:
        writer({"agent": agent, "phase": "proceed_reason", "text": pr})
    writer({"agent": agent, "phase": "rationale", "text": render_rationale(output.get("overall_final_rationale", ""))})
    writer({"agent": agent, "phase": "decision", "text": render_decision(output.get("decision", ""))})
    writer({"agent": agent, "phase": "decision_done"})


def decision_maker_node(state: PipelineState, config: RunnableConfig) -> dict:
    """One LLM call: gating decision with ambiguity cases and capability gaps."""
    writer = get_stream_writer() if config.get("configurable", {}).get("streaming") else None

    _write_start(writer, "decision_maker")

    messages = build_prompt(state)
    output = invoke_structured(get_llm("decision_maker", config), DecisionMakerOutput, messages)

    _write_complete(writer, "decision_maker", output)

    # Extract clarification questions from unresolved ambiguities
    questions = [
        a["clarification_question"]
        for a in output.get("ambiguities", [])
        if a.get("ambiguous") and a.get("clarification_question")
    ]

    # Extract stuck reason from capability gaps
    stuck_reasons = [
        f["gap"]
        for f in output.get("complexity_flags", [])
        if f.get("beyond_llm_capability") and f.get("gap")
    ]

    update = {
        "output_decision_maker": output,
        "decision": output.get("decision", "PROCEED"),
    }
    if questions:
        update["clarification_questions"] = questions
    if stuck_reasons:
        update["stuck_reason"] = "; ".join(stuck_reasons)
    return update
