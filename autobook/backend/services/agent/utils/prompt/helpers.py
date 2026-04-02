"""Prompt message part builders.

Each function returns list[dict] — content blocks for Bedrock Converse API.
All are pure functions with no side effects.
"""
import json

CACHE_POINT = {"cachePoint": {"type": "default", "ttl": "1h"}}


def build_transaction(state: dict) -> list[dict]:
    """Transaction text (always raw, not enriched — stable for RAG + caching)."""
    return [{"text": f"<transaction>{state['transaction_text']}</transaction>"}]


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


def build_fix_context(fix_context: str | None) -> list[dict]:
    """Fix context block (rerun guidance from diagnostician)."""
    if not fix_context:
        return []
    return [{"text": (
        "A previous review rejected this classification. "
        "The following guidance explains what to fix:\n"
        f"<fix_context>{fix_context}</fix_context>"
    )}]


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

    text = f"Reference: {label}:\n<examples>\n"
    for ex in rag_examples:
        for field in fields:
            val = ex.get(field, "")
            text += f"  {field}: {val}\n"
        text += "\n"
    text += "</examples>"
    return [{"text": text}]


# ── Section builders for HumanMessage structure ─────────────────────────

def build_context_section(fix: list[dict], rag: list[dict]) -> list[dict]:
    """## Context section — only present when fix_context or rag_examples exist."""
    if not fix and not rag:
        return []
    return [{"text": "## Context"}] + fix + rag


def build_input_section(*content_blocks: list[dict]) -> list[dict]:
    """## Input section — wraps transaction + tuples or other input data."""
    blocks: list[dict] = [{"text": "## Input"}]
    for block in content_blocks:
        blocks.extend(block)
    return blocks


