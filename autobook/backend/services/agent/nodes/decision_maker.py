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

def _write_start(writer) -> None:
    """Emit pending labels before LLM call."""
    if writer is None:
        return
    writer({"action": "chunk.create", "section": "ambiguity", "label": "Assessing ambiguity..."})
    writer({"action": "chunk.create", "section": "gap", "label": "Assessing complexity..."})
    writer({"action": "chunk.create", "section": "proceed", "label": "Determining whether to proceed..."})


def _write_complete(writer, output: dict) -> None:
    """Stream the DM output leaf by leaf in display order."""
    if writer is None:
        return
    from services.agent.utils.tracing.renderers import (
        render_ambiguity_summary, render_ambiguity_aspect,
        render_conventional_default, render_ifrs_default,
        render_clarification_question, render_case_label,
        render_ambiguity_status,
        render_complexity_summary, render_complexity_aspect,
        render_gap_description, render_complexity_status,
        render_proceed_reason, render_rationale, render_decision,
    )

    ambiguities = output.get("ambiguities", [])
    flags = output.get("complexity_flags", [])

    # 1. Ambiguity — detected + items + done
    writer({"action": "chunk.label", "section": "ambiguity", "label": "Ambiguity detected" if ambiguities else "No ambiguity detected"})
    for a in ambiguities:
        writer({"action": "block.collapsible", "section": "ambiguity", "text": render_ambiguity_aspect(a.get("aspect", ""))})
        conv = render_conventional_default(a.get("input_contextualized_conventional_default"))
        if conv:
            writer({"action": "line", "section": "ambiguity", "tag": "Conventional default", "text": conv})
        ifrs = render_ifrs_default(a.get("input_contextualized_ifrs_default"))
        if ifrs:
            writer({"action": "line", "section": "ambiguity", "tag": "IFRS default", "text": ifrs})
        q = render_clarification_question(a.get("clarification_question"))
        if q:
            writer({"action": "line", "section": "ambiguity", "tag": "Question", "text": q})
        for case in (a.get("cases") or []):
            writer({"action": "line", "section": "ambiguity", "tag": "Case", "text": render_case_label(case.get("case", ""))})
            pe = case.get("possible_entry")
            if pe and pe.get("lines"):
                writer({"action": "line.entry", "section": "ambiguity", "tag": "Possible entry", "data": pe})
        writer({"action": "line", "section": "ambiguity", "tag": "Status", "text": render_ambiguity_status(a.get("ambiguous", False))})
    writer({"action": "block.text", "section": "ambiguity", "text": render_ambiguity_summary(ambiguities)})
    writer({"action": "chunk.done", "section": "ambiguity"})

    # 2. Complexity — detected + items + done
    writer({"action": "chunk.label", "section": "gap", "label": "Complexity detected" if flags else "No complexity detected"})
    for f in flags:
        writer({"action": "block.collapsible", "section": "gap", "text": render_complexity_aspect(f.get("aspect", ""))})
        ba = f.get("best_attempt")
        if ba and ba.get("lines"):
            writer({"action": "line.entry", "section": "gap", "tag": "Best attempt", "data": ba})
        gap = render_gap_description(f.get("gap"))
        if gap:
            writer({"action": "line", "section": "gap", "tag": "Gap", "text": gap})
        writer({"action": "line", "section": "gap", "tag": "Status", "text": render_complexity_status(f.get("beyond_llm_capability", False))})
    writer({"action": "block.text", "section": "gap", "text": render_complexity_summary(flags)})
    writer({"action": "chunk.done", "section": "gap"})

    # 3. Decision — items + done (with final label)
    pr = render_proceed_reason(output.get("proceed_reason"))
    if pr:
        writer({"action": "block.text", "section": "proceed", "text": pr})
    writer({"action": "block.text", "section": "proceed", "text": render_rationale(output.get("overall_final_rationale", ""))})
    writer({"action": "block.text", "section": "proceed", "text": render_decision(output.get("decision", ""))})
    writer({"action": "chunk.done", "section": "proceed", "label": "Decision made"})


def decision_maker_node(state: PipelineState, config: RunnableConfig) -> dict:
    """One LLM call: gating decision with ambiguity cases and capability gaps."""
    writer = get_stream_writer() if config.get("configurable", {}).get("streaming") else None

    _write_start(writer)

    from services.agent.utils.prompt.corrections import render_corrections
    corrections = render_corrections(
        state.get("rag_local_hits", []),
        state.get("rag_pop_hits", []),
        attempted_key="attempted_ambiguities",
        corrected_key="corrected_ambiguities",
        note_key="note_ambiguity",
        label="ambiguity analysis",
    )

    jc = config.get("configurable", {}).get("jurisdiction_config")
    messages = build_prompt(state, corrections=corrections or None, jurisdiction_config=jc)
    output = invoke_structured(get_llm("decision_maker", config), DecisionMakerOutput, messages)

    _write_complete(writer, output)

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
