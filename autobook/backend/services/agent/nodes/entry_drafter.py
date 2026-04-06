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

def _write_start(writer) -> None:
    if writer is None:
        return
    writer({"action": "chunk.create", "section": "entry", "label": "Drafting journal entry..."})


def _write_complete(writer, output: dict) -> None:
    """Stream entry drafter output as structured entry data."""
    if writer is None:
        return
    writer({"action": "block.entry", "section": "entry", "tag": "Final entry", "data": output})
    writer({"action": "chunk.done", "section": "entry", "label": "Journal entry drafted"})


# ── Node ────────────────────────────────────────────────────────────────

def entry_drafter_node(state: PipelineState, config: RunnableConfig) -> dict:
    """Build journal entry from upstream classifications."""
    writer = get_stream_writer() if config.get("configurable", {}).get("streaming") else None

    _write_start(writer)

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

    _write_complete(writer, output)

    update = {
        "output_entry_drafter": output,
    }

    if not state.get("decision"):
        update["decision"] = "PROCEED"

    return update
