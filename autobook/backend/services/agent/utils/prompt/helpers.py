"""Prompt message part builders.

Each function returns list[dict] — content blocks for Bedrock Converse API.
All are pure functions with no side effects.
"""
import json

from services.agent.utils.prompt.reasoning import compile_reasoning_trace

CACHE_POINT = {"cachePoint": {"type": "default"}}


def build_transaction(state: dict) -> list[dict]:
    """Transaction text. Uses enriched text if available."""
    text = state.get("enriched_text") or state["transaction_text"]
    return [{"text": f"<transaction>{text}</transaction>"}]


def build_user_context(state: dict) -> list[dict]:
    """User business context (business type, province, ownership)."""
    ctx = state.get("user_context", {})
    return [{"text": (
        f"<context>\n"
        f"  Business type: {ctx.get('business_type', 'unknown')}\n"
        f"  Province: {ctx.get('province', 'unknown')}\n"
        f"  Ownership: {ctx.get('ownership', 'unknown')}\n"
        f"</context>"
    )}]


def build_tuples(state: dict, debit_key: str, credit_key: str) -> list[dict]:
    """Debit and credit tuples from state."""
    return [{"text": (
        f"<{debit_key}>{state.get(debit_key, '')}</{debit_key}>\n"
        f"<{credit_key}>{state.get(credit_key, '')}</{credit_key}>"
    )}]


def build_journal(state: dict) -> list[dict]:
    """Journal entry as formatted JSON."""
    return [{"text": (
        f"<journal_entry>\n{json.dumps(state['journal_entry'], indent=2)}\n</journal_entry>"
    )}]


def build_reasoning(state: dict) -> list[dict]:
    """Labeled reasoning trace from all generator agents."""
    return [{"text": (
        f"<generator_reasoning>\n{compile_reasoning_trace(state)}\n</generator_reasoning>"
    )}]


def build_rejection(state: dict) -> list[dict]:
    """Approver rejection output."""
    return [{"text": (
        f"<rejection>\n{json.dumps(state['approval'], indent=2)}\n</rejection>"
    )}]


def build_coa(coa_results: list[dict] | None) -> list[dict]:
    """Chart of accounts lookup results."""
    if not coa_results:
        return []
    coa_text = "\n".join(
        f"  {a['account_code']} — {a['account_name']} ({a['account_type']})"
        for a in coa_results
    )
    return [{"text": f"<chart_of_accounts>\n{coa_text}\n</chart_of_accounts>"}]


def build_tax(tax_results: dict | None) -> list[dict]:
    """Tax rules lookup results."""
    if not tax_results:
        return []
    return [{"text": (
        f"<tax_rules>rate={tax_results.get('rate', 0)}, "
        f"taxable={tax_results.get('taxable', False)}</tax_rules>"
    )}]


def build_vendor(vendor_results: list[dict] | None) -> list[dict]:
    """Vendor history lookup results."""
    if not vendor_results:
        return []
    vendor_text = "\n".join(
        f"  {v.get('account_name', '')} — {v.get('type', '')} ${v.get('amount', '')}"
        for v in vendor_results
    )
    return [{"text": f"<vendor_history>\n{vendor_text}\n</vendor_history>"}]


def build_fix_context(fix_context: str | None) -> list[dict]:
    """Fix context block (rerun guidance from diagnostician)."""
    if not fix_context:
        return []
    return [{"text": f"<fix_context>{fix_context}</fix_context>"}]


def build_rag_examples(rag_examples: list[dict], label: str,
                       fields: list[str]) -> list[dict]:
    """RAG examples content block.

    Args:
        rag_examples: List of example dicts from RAG retrieval.
        label: Description, e.g. "similar past transactions with correct debit tuples".
        fields: Keys to extract from each example dict.
    """
    if not rag_examples:
        return []

    text = f"These are {label}:\n<examples>\n"
    for ex in rag_examples:
        for field in fields:
            val = ex.get(field, "")
            text += f"  {field}: {val}\n"
        text += "\n"
    text += "</examples>"
    return [{"text": text}]
