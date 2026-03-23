"""Prompt builder for Agent 2 — Credit Classifier.

Classifies how many credit-side journal lines fall into each of the 6
directional categories. Output: 6-tuple (a,b,c,d,e,f).
"""
from services.agent.graph.state import PipelineState

_CACHE_POINT = {"cachePoint": {"type": "default"}}

_PREAMBLE = """\
You are an accounting classifier in a Canadian automated bookkeeping system."""

_ROLE = """
## Your Role

Given a transaction description, classify the CREDIT side only. Count how many \
credit-side journal lines fall into each of the 6 directional categories. \
Output a 6-tuple of non-negative integers."""

_RULES = """
## Double-Entry Bookkeeping

Every transaction has debit lines and credit lines. Total debits = total credits \
in dollar amounts. You are classifying the CREDIT side only — a separate agent \
handles the debit side.

Account types and their credit behavior:
| Account Type | Credit Effect |
|-------------|--------------|
| Liability   | Increase     |
| Equity      | Increase     |
| Revenue     | Increase     |
| Asset       | Decrease     |
| Dividend    | Decrease     |
| Expense     | Decrease     |"""

_TUPLE_DEF = """
## Credit Tuple (a, b, c, d, e, f)

Each slot counts the number of credit-side journal lines in that category:

| Slot | Category             | Meaning                         |
|------|---------------------|---------------------------------|
| a    | Liability increase   | Taking on new obligations       |
| b    | Equity increase      | Increasing owner's equity       |
| c    | Revenue increase     | Earning income                  |
| d    | Asset decrease       | Giving up or consuming assets   |
| e    | Dividend decrease    | Reversing owner withdrawals     |
| f    | Expense decrease     | Reversing or reducing expenses  |

Each value is a LINE COUNT, not a dollar amount."""

_EXAMPLES = """
## Examples

<example>
Transaction: "Sell inventory (cost $100k) for $150k cash"
Credit tuple: (0,0,1,1,0,0)
— 1 revenue increase (Sales Revenue $150k), 1 asset decrease (Inventory $100k)
</example>

<example>
Transaction: "Pay monthly rent $2,000"
Credit tuple: (0,0,0,1,0,0)
— 1 asset decrease (Cash paid out)
</example>

<example>
Transaction: "Owner invests $50,000 into business"
Credit tuple: (0,1,0,0,0,0)
— 1 equity increase (Owner's Capital)
</example>

<example>
Transaction: "Take out $25,000 bank loan"
Credit tuple: (1,0,0,0,0,0)
— 1 liability increase (Loan Payable)
</example>

<example>
Transaction: "Purchase equipment for $20,000 on credit"
Credit tuple: (1,0,0,0,0,0)
— 1 liability increase (Accounts Payable)
</example>

<example>
Transaction: "Receive refund of $300 for returned supplies"
Credit tuple: (0,0,0,0,0,1)
— 1 expense decrease (Supplies Expense reversed)
</example>"""

_OUTPUT_FORMAT = """
## Output Format

Return ONLY the 6-tuple as (a,b,c,d,e,f) with no explanation. \
Each value must be a non-negative integer. Verify that each slot \
corresponds to the correct category before outputting."""

SYSTEM_INSTRUCTION = "\n".join([
    _PREAMBLE, _ROLE, _RULES, _TUPLE_DEF, _EXAMPLES, _OUTPUT_FORMAT,
])


def build_prompt(state: PipelineState, rag_examples: list[dict]) -> dict:
    """Build the credit classifier prompt with cache breakpoints."""
    system = [{"text": SYSTEM_INSTRUCTION}, _CACHE_POINT]

    text = state.get("enriched_text") or state["transaction_text"]
    transaction_block = f"<transaction>{text}</transaction>"

    parts = [{"text": transaction_block}, _CACHE_POINT]

    if rag_examples:
        examples_text = "These are similar past transactions with correct credit tuples for reference:\n<examples>\n"
        for ex in rag_examples:
            examples_text += (
                f"  Transaction: {ex.get('transaction', '')}\n"
                f"  Credit tuple: {ex.get('credit_tuple', '')}\n\n"
            )
        examples_text += "</examples>"
        parts.append({"text": examples_text})

    return {
        "system": system,
        "messages": [{"role": "user", "content": parts}],
    }
