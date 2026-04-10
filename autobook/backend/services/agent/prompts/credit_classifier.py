"""Prompt builder for Credit Classifier.

Classifies credit-side journal lines into 6 directional slots.
Each line gets a reason and an IFRS taxonomy category.
Output: CreditClassifierOutput with list[ClassifiedLine] per slot.
"""
from services.agent.graph.state import PipelineState
from services.agent.prompts.shared import SHARED_INSTRUCTION, build_shared_instruction
from services.agent.utils.prompt import (
    CACHE_POINT, build_transaction,
    build_fix_context, build_rag_examples,
    build_context_section, build_input_section, to_bedrock_messages,
)

# ── Role ─────────────────────────────────────────────────────────────────

_ROLE = """
## Role

Given a transaction description, classify the CREDIT side only. For each \
credit-side journal line, identify which directional slot it belongs to and \
assign an IFRS taxonomy category from the list in Domain Knowledge.

Same category = combine into one line. Different category = separate lines."""

# ── Procedure ────────────────────────────────────────────────────────────

_PROCEDURE = """
## Procedure

1. Read the transaction text carefully. The transaction text is the \
primary source of truth. If the text states management's determination, \
accounting treatment, or classification, you MUST use that interpretation \
— do not independently re-interpret the transaction.
2. Classify only CREDIT-side events. Do not classify debit-side \
events — the debit classifier handles those separately.
3. Classify each credit-side event into the correct directional slot. \
Each slot only accepts categories from its own taxonomy.
4. Same IFRS category = combine into one detection with count. \
Different categories = separate detections.
5. For each detection: reason, IFRS category, count."""

# ── Examples ─────────────────────────────────────────────────────────────

_EXAMPLES = """
## Examples

<example>
Transaction: "Purchase equipment $20,000 cash plus $30,000 loan"
liability_increase: [
  {"reason": "Loan taken to fund equipment purchase", "category": "Long-term borrowings", "count": 1}
]
asset_decrease: [
  {"reason": "Cash paid for equipment", "category": "Cash and cash equivalents", "count": 1}
]
</example>

<example>
Transaction: "Pay monthly rent $2,000"
asset_decrease: [{"reason": "Cash paid for rent", "category": "Cash and cash equivalents", "count": 1}]
</example>

<example>
Transaction: "Owner invests $50,000 into business"
equity_increase: [{"reason": "Owner contributed capital to the business", "category": "Issued capital", "count": 1}]
</example>

<example>
Transaction: "Sell products $5,000 on account, cost $3,000"
revenue_increase: [{"reason": "Products sold to customer", "category": "Revenue from sale of goods", "count": 1}]
asset_decrease: [{"reason": "Inventory released to fulfill sale", "category": "Inventories — merchandise", "count": 1}]
</example>

<example>
Transaction: "Issue common stock for $180 cash ($100 par, $80 APIC)"
equity_increase: [
  {"reason": "Shares issued at par value", "category": "Issued capital", "count": 1},
  {"reason": "Premium received above par value", "category": "Share premium", "count": 1}
]
</example>

<example>
Transaction: "Sold 300 cases at $230/case (cost $185/case), plus 10% tax. \
Received $45,900 by bank transfer, remainder on credit."
liability_increase: [{"reason": "Sales tax collected from customer", "category": "Tax liabilities", "count": 1}]
revenue_increase: [{"reason": "Products sold to customer", "category": "Revenue from sale of goods", "count": 1}]
asset_decrease: [{"reason": "Inventory released to fulfill sale", "category": "Inventories — finished goods", "count": 1}]
</example>

<example>
Transaction: "Company sold its investment in bonds, receiving $480K cash. \
Management has classified this as a disposal of a financial asset."
Note: Text says "disposal" — the asset is removed from the books. Do not re-classify as redemption or maturity.
asset_decrease: [{"reason": "Bond investment disposed of per management classification", "category": "Investments — FVOCI", "count": 1}]
</example>"""

# ── Task Reminder ────────────────────────────────────────────────────────

_TASK_REMINDER = """
## Task

Classify the credit side. For each line, provide the reason and \
IFRS taxonomy category. Same category = combine. Different = separate.

Output all free-text fields in the same language as the transaction text."""

AGENT_INSTRUCTION = "\n".join([_ROLE, _PROCEDURE, _EXAMPLES, ])

# Legacy — for warmup compatibility
SYSTEM_INSTRUCTION = "\n".join([SHARED_INSTRUCTION, AGENT_INSTRUCTION])


def build_prompt(state: PipelineState, rag_examples: list[dict],
                 fix_context: str | None = None,
                 corrections: str | None = None,
                 jurisdiction_config=None) -> dict:
    """Build the credit classifier prompt."""
    fix = build_fix_context(fix_context=fix_context)
    rag = build_rag_examples(rag_examples=rag_examples,
                             label="similar past transactions with correct credit structures",
                             fields=["transaction", "credit_tuple"])
    context = build_context_section(fix, rag)

    transaction = build_transaction(state=state)
    input_section = build_input_section(transaction)

    task = [{"text": _TASK_REMINDER}]
    corrections_block = [{"text": corrections}] if corrections else []

    system_blocks = [
        {"text": build_shared_instruction(jurisdiction_config)}, CACHE_POINT,
        {"text": AGENT_INSTRUCTION}, CACHE_POINT,
    ]
    message_blocks = context + input_section + corrections_block + task

    return to_bedrock_messages(system_blocks, message_blocks)
