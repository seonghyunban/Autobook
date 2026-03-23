"""Prompt builder for Agent 0 — Disambiguator.

Resolves ambiguous transactions using user context before tuple classification.
Output: enriched text string (plain text, no JSON).
"""
from services.agent.graph.state import PipelineState

_CACHE_POINT = {"cachePoint": {"type": "default"}}

# ── System prompt sections ────────────────────────────────────────────────

_PREAMBLE = """\
You are a business context expert in a Canadian automated bookkeeping system."""

_ROLE = """
## Your Role

You resolve ambiguous transaction descriptions by using the user's business \
context (business type, province, ownership structure) to produce a clear, \
unambiguous description that downstream accounting agents can classify correctly."""

# (1) _WHY removed — model doesn't need motivation, only instructions.

_HOW = """
## How to Disambiguate

Use the user's business context to resolve ambiguity:

1. **Business type** — determines likely expense categories and revenue sources
   - Restaurant: food supplies, contractor services, equipment
   - Retail: inventory, shipping, point-of-sale
   - Consulting: professional services, software, travel
   - Construction: materials, subcontractors, equipment rental

2. **Ownership structure** — affects how owner transactions are classified
   - Sole proprietor: owner draws are equity withdrawals
   - Corporation: shareholder loans, dividends
   - Partnership: partner distributions"""

# (2) Province→tax mapping removed — tax determination is Agent 5's job
#     via tax_rules_lookup. Disambiguator only clarifies what the transaction is.

_EXAMPLES = """
## Examples

Each example shows a distinct ambiguity type.

Input: "Paid $200 to Tim" + (restaurant, sole proprietor, ON)
Output: "Contractor payment to Tim for restaurant services, $200"
— Vague vendor name resolved using business type.

Input: "TRANSFER 500" + (consulting, corporation, AB)
Output: "Inter-account transfer of $500 between business bank accounts"
— Transfer vs payment resolved using ownership structure.

Input: "DEPOSIT 3000" + (retail, sole proprietor, QC)
Output: "Cash deposit of $3,000 from retail sales revenue"
— Deposit type resolved using business type.

Input: "COSTCO 450.00" + (restaurant, corporation, ON)
Output: "Purchase of food supplies and restaurant inventory from Costco, $450.00"
— Mixed-use vendor resolved using business type.

Input: "INSURANCE 350 MONTHLY" + (construction, corporation, AB)
Output: "Monthly business insurance premium of $350, commercial liability"
— Recurring charge clarified using business type.

Input: "TXN REF 449281" + (consulting, sole proprietor, ON)
Output: "TXN REF 449281"
— Uninterpretable even with context. Returned unchanged."""

# (5) _AMBIGUITY_PATTERNS removed — redundant with annotated examples above.

_OUTPUT_FORMAT = """
## Output Format

Return ONLY the enriched transaction description in a single sentence. \
Do not include:
- JSON formatting
- Explanations of your reasoning
- Multiple options or alternatives
- Tax applicability (handled downstream)

If the transaction is already clear, return it with minor improvements.
If the transaction is uninterpretable even with context, return it unchanged."""

SYSTEM_INSTRUCTION = "\n".join([
    _PREAMBLE, _ROLE, _HOW, _EXAMPLES, _OUTPUT_FORMAT,
])


# ── Prompt builder ────────────────────────────────────────────────────────

def build_prompt(state: PipelineState, rag_examples: list[dict]) -> dict:
    """Build the disambiguator prompt with cache breakpoints.

    Args:
        state: Current pipeline state with transaction_text and user_context.
        rag_examples: Similar past disambiguations from RAG.

    Returns:
        Dict with 'system' and 'messages' keys for ChatBedrockConverse.
    """
    # ── System block (BP1: cached per agent) ──────────────────────────
    system = [
        {"text": SYSTEM_INSTRUCTION},
        _CACHE_POINT,
    ]

    # ── Transaction block ─────────────────────────────────────────────
    user_ctx = state.get("user_context", {})
    transaction_block = (
        f"<transaction>{state['transaction_text']}</transaction>\n"
        f"<context>\n"
        f"  Business type: {user_ctx.get('business_type', 'unknown')}\n"
        f"  Province: {user_ctx.get('province', 'unknown')}\n"
        f"  Ownership: {user_ctx.get('ownership', 'unknown')}\n"
        f"</context>"
    )

    # ── Dynamic block (RAG examples, no cache) ────────────────────────
    parts = [{"text": transaction_block}, _CACHE_POINT]

    if rag_examples:
        examples_text = "These are similar past disambiguations for reference:\n<examples>\n"
        for ex in rag_examples:
            examples_text += (
                f"  Input: {ex.get('input', '')}\n"
                f"  Output: {ex.get('output', '')}\n\n"
            )
        examples_text += "</examples>"
        parts.append({"text": examples_text})

    return {
        "system": system,
        "messages": [{"role": "user", "content": parts}],
    }
