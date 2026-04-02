"""Entry Drafter — builds journal entry from upstream classifications.

Trusts upstream classifications and tax treatment.
Output: JournalEntry {reason, lines: [...]}
"""
from langchain_core.runnables import RunnableConfig

from langgraph.config import get_stream_writer

from services.agent.graph.state import PipelineState, ENTRY_DRAFTER
from services.agent.prompts.entry_drafter import build_prompt
from services.agent.schemas.journal import JournalEntry
from services.agent.utils.llm import get_llm, invoke_structured
from services.agent.utils.tracing.renderers import render_entry_rationale, render_final_entry


# ── Calculator (disabled for now) ───────────────────────────────────────

from services.agent.utils.calculator import CALCULATOR_TOOLS, safe_eval


def _run_calculator_step(llm, messages):
    try:
        calc_llm = llm.bind_tools(CALCULATOR_TOOLS)
        response = calc_llm.invoke(messages)
        if not response.tool_calls:
            return None
        results = []
        for tc in response.tool_calls:
            expr = tc["args"].get("expression", "")
            value = safe_eval(expr)
            results.append(f"{expr} = {round(value, 2)}")
        return "\n".join(results) if results else None
    except Exception:
        return None


# ── COA mapping (disabled for now) ──────────────────────────────────────

from db.dao.chart_of_accounts import DEFAULT_COA

_ACCOUNT_CODE_BY_NAME = {
    account_name.casefold(): account_code
    for account_code, account_name, _account_type in DEFAULT_COA
}


def _map_account_codes(output: dict) -> None:
    """Map account names to codes from COA. Mutates output in place."""
    for line in output.get("lines", []):
        name = str(line.get("account_name") or "").strip().casefold()
        line["account_code"] = _ACCOUNT_CODE_BY_NAME.get(name, "")


# ── Stream helpers ──────────────────────────────────────────────────────

def _write_start(writer, agent: str) -> None:
    writer({"agent": agent, "phase": "started"})


def _write_complete(writer, agent: str, output: dict) -> None:
    """Stream entry drafter output: rationale then final entry."""
    reason = output.get("reason", "")
    if reason:
        writer({"agent": agent, "phase": "entry_rationale", "text": render_entry_rationale(reason)})
    writer({"agent": agent, "phase": "final_entry", "text": render_final_entry(output)})


# ── Node ────────────────────────────────────────────────────────────────

def entry_drafter_node(state: PipelineState, config: RunnableConfig) -> dict:
    """Build journal entry from upstream classifications."""
    writer = get_stream_writer()

    _write_start(writer, "entry_drafter")

    messages = build_prompt(state)
    llm = get_llm(ENTRY_DRAFTER, config)

    # Step 1: calculator — disabled for now
    # computed = _run_calculator_step(llm, messages)
    # if computed:
    #     messages.append(
    #         HumanMessage(content=[{"text": f"<computed_values>\n{computed}\n</computed_values>\nNow build the journal entry using these computed values."}])
    #     )

    # Step 2: structured output
    output = invoke_structured(llm, JournalEntry, messages)

    # Step 3: COA mapping — disabled for now
    # _map_account_codes(output)

    _write_complete(writer, "entry_drafter", output)

    update = {
        "output_entry_drafter": output,
    }

    if not state.get("decision"):
        update["decision"] = "PROCEED"

    return update
