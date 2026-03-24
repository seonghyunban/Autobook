"""Agent 5 — Entry Builder node.

Constructs complete journal entry from refined tuples + tool results.
Most complex node — calls 3 accounting tools, validates output.
Output: EntryBuilderOutput {"date", "description", "rationale", "lines": [...]}
"""
from langchain_core.runnables import RunnableConfig

from services.agent.graph.state import (
    PipelineState, ENTRY_BUILDER, COMPLETE,
)
from services.agent.prompts.entry_builder import build_prompt
from services.agent.rag.transaction import retrieve_transaction_examples
from services.agent.utils.llm import get_llm
from services.agent.utils.parsers.json_output import EntryBuilderOutput
from accounting_engine.tools import coa_lookup, tax_rules_lookup, vendor_history_lookup


def entry_builder_node(state: PipelineState, config: RunnableConfig) -> dict:
    """Build complete journal entry from tuples, tools, and transaction text."""
    # ── Iteration + history ───────────────────────────────────────
    i = state["iteration"]
    history = list(state.get("output_entry_builder", []))

    # ── Skip if complete (copy previous for alignment) ────────────
    if state.get("status_entry_builder") == COMPLETE:
        history.append(history[i - 1])
        return {"output_entry_builder": history, "status_entry_builder": COMPLETE}

    # ── RAG retrieval ─────────────────────────────────────────────
    rag_examples = retrieve_transaction_examples(state, "rag_cache_entry_builder")
    fix_ctx = (state.get("fix_context_entry_builder") or [None])[-1]

    # ── Tool lookups ──────────────────────────────────────────────
    user_ctx = state.get("user_context", {})
    coa_results = coa_lookup(
        user_id=user_ctx.get("user_id", ""),
    )
    tax_results = tax_rules_lookup(
        province=user_ctx.get("province", "ON"),
        transaction_type="general",
    )
    vendor_results = vendor_history_lookup(
        user_id=user_ctx.get("user_id", ""),
        vendor_name=state["transaction_text"].split()[0] if state["transaction_text"] else "",
    )

    # ── Build prompt + call LLM ───────────────────────────────────
    messages = build_prompt(
        state, rag_examples,
        coa_results=coa_results,
        tax_results=tax_results,
        vendor_results=vendor_results,
        fix_context=fix_ctx,
    )
    structured_llm = get_llm(ENTRY_BUILDER, config).with_structured_output(EntryBuilderOutput)
    result = structured_llm.invoke(messages)
    history.append(result.model_dump())

    # ── Return state update ───────────────────────────────────────
    return {
        "output_entry_builder": history,
        "rag_cache_entry_builder": rag_examples,
        "status_entry_builder": COMPLETE,
    }
