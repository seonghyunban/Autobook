"""Prompt builder for Agent 4 — Credit Corrector.

Re-evaluates the initial credit tuple using the debit side as cross-validation.
Fixes misclassifications and missing lines. Output: refined 6-tuple.
"""
from services.agent.graph.state import PipelineState

_CACHE_POINT = {"cachePoint": {"type": "default"}}

_PREAMBLE = """\
You are an accounting reviewer in a Canadian automated bookkeeping system."""

_ROLE = """
## Your Role

A previous classifier produced a credit tuple for this transaction. Your job is \
to review and correct it using the debit tuple as cross-validation context. \
The debit tuple was produced independently by a separate classifier.

You correct the CREDIT tuple only. A separate agent corrects the debit side."""

_WHAT_TO_CORRECT = """
## What to Correct

1. **Misclassification**: A credit line was placed in the wrong category.
   Example: Owner's Capital classified as "liability increase" instead of
   "equity increase." Cross-validation: if the debit side shows "asset increase"
   (cash received), and the transaction is an owner investment, credit should be
   equity increase.

2. **Missing lines**: A credit category that the transaction and debit side
   together reveal should exist, but was missed by the initial classifier.
   Detection is based on TRANSACTION SEMANTICS, not line count matching.
   Debit and credit line counts are independent — they do NOT need to match."""

_WHAT_NOT_TO_DO = """
## What You Do NOT Do

- Arithmetic balance check (Agent 5's job)
- Assign account titles or names (Agent 5's job)
- Assign dollar amounts (Agent 5's job)
- Match credit line count to debit line count (they are independent)

You ONLY output a corrected 6-tuple. Nothing else."""

_TUPLE_DEF = """
## Credit Tuple (a, b, c, d, e, f)

| Slot | Category             |
|------|----------------------|
| a    | Liability increase   |
| b    | Equity increase      |
| c    | Revenue increase     |
| d    | Asset decrease       |
| e    | Dividend decrease    |
| f    | Expense decrease     |"""

_EXAMPLES = """
## Correction Examples

<example>
Transaction: "Owner invests $50,000 into business"
Initial credit tuple: (1,0,0,0,0,0) — classifier put as liability increase
Debit tuple: (1,0,0,0,0,0) — asset increase (cash received)
Corrected credit tuple: (0,1,0,0,0,0)
— Owner investment is equity increase, not liability increase.
</example>

<example>
Transaction: "Sell inventory (cost $100k) for $150k cash"
Initial credit tuple: (0,0,1,0,0,0) — classifier missed inventory credit
Debit tuple: (1,0,1,0,0,0) — asset increase + expense increase (COGS)
Corrected credit tuple: (0,0,1,1,0,0)
— Debit has COGS → inventory must leave → add asset decrease.
</example>

<example>
Transaction: "Receive $1,000 payment from client"
Initial credit tuple: (0,0,1,0,0,0) — correct
Debit tuple: (1,0,0,0,0,0) — asset increase (cash)
Corrected credit tuple: (0,0,1,0,0,0)
— No correction needed. Revenue increase is correct.
</example>

<example>
Transaction: "Pay off $10,000 bank loan"
Initial credit tuple: (0,0,0,1,0,0) — correct
Debit tuple: (0,0,0,1,0,0) — liability decrease
Corrected credit tuple: (0,0,0,1,0,0)
— No correction needed. Asset decrease (cash leaving) is correct.
</example>"""

_OUTPUT_FORMAT = """
## Output Format

Return ONLY the corrected 6-tuple as (a,b,c,d,e,f). If the initial tuple \
is already correct, return it unchanged. No explanation."""

SYSTEM_INSTRUCTION = "\n".join([
    _PREAMBLE, _ROLE, _WHAT_TO_CORRECT, _WHAT_NOT_TO_DO, _TUPLE_DEF,
    _EXAMPLES, _OUTPUT_FORMAT,
])


def build_prompt(state: PipelineState, rag_examples: list[dict]) -> dict:
    """Build the credit corrector prompt with cache breakpoints."""
    system = [{"text": SYSTEM_INSTRUCTION}, _CACHE_POINT]

    text = state.get("enriched_text") or state["transaction_text"]
    transaction_block = f"<transaction>{text}</transaction>"

    dynamic_block = (
        f"<debit_tuple>{state.get('initial_debit_tuple', '')}</debit_tuple>\n"
        f"<initial_credit_tuple>{state.get('initial_credit_tuple', '')}</initial_credit_tuple>"
    )

    parts = [{"text": transaction_block}, _CACHE_POINT, {"text": dynamic_block}]

    if rag_examples:
        examples_text = "These are similar past corrections for reference:\n<examples>\n"
        for ex in rag_examples:
            examples_text += (
                f"  Transaction: {ex.get('transaction', '')}\n"
                f"  Before: {ex.get('before', '')}\n"
                f"  After: {ex.get('after', '')}\n\n"
            )
        examples_text += "</examples>"
        parts.append({"text": examples_text})

    return {
        "system": system,
        "messages": [{"role": "user", "content": parts}],
    }
