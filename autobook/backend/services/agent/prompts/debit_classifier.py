"""Prompt builder for Debit Classifier.

Classifies debit-side journal lines into 6 directional slots.
Each line gets a reason and an IFRS taxonomy category.
Output: DebitClassifierOutput with list[ClassifiedLine] per slot.
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

Given a transaction description, classify the DEBIT side only. For each \
debit-side journal line, identify which directional slot it belongs to and \
assign an IFRS taxonomy category from the list in Domain Knowledge.

Same category = combine into one line. Different category = separate lines."""

# ── Procedure ────────────────────────────────────────────────────────────

_PROCEDURE = """
## Procedure

1. Read the transaction text carefully. The transaction text is the \
primary source of truth. If the text states management's determination, \
accounting treatment, or classification, you MUST use that interpretation \
— do not independently re-interpret the transaction.
2. Classify only DEBIT-side events. Do not classify credit-side \
events — the credit classifier handles those separately.
3. Classify each debit-side event into the correct directional slot. \
Each slot only accepts categories from its own taxonomy.
4. Same IFRS category = combine into one detection with count. \
Different categories = separate detections.
5. For each detection: reason, IFRS category, count."""

# ── Examples ─────────────────────────────────────────────────────────────

_EXAMPLES = """
## Examples

<example>
Transaction: "Purchase land $2M and build fencing $500K"
asset_increase: [
  {"reason": "Land purchased as non-depreciable asset", "category": "Land", "count": 1},
  {"reason": "Fencing purchased as depreciable site improvement", "category": "Site improvements", "count": 1}
]
</example>

<example>
Transaction: "Purchase office desks $2,000 and computers $3,500 cash"
asset_increase: [{"reason": "Desks and computers acquired as office equipment", "category": "Office equipment", "count": 1}]
</example>

<example>
Transaction: "Pay monthly rent $2,000"
expense_increase: [{"reason": "Monthly rent incurred for occupancy", "category": "Occupancy expense", "count": 1}]
</example>

<example>
Transaction: "Owner withdraws $5,000 from business"
equity_decrease: [{"reason": "Owner withdrew cash, reducing retained earnings", "category": "Retained earnings", "count": 1}]
</example>

<example>
Transaction: "Record payroll: production wages $25K, office salaries $20K"
asset_increase: [{"reason": "Production wages capitalized as manufacturing cost", "category": "Inventories — work in progress", "count": 1}]
expense_increase: [{"reason": "Office salaries incurred as period cost", "category": "Employee benefits expense", "count": 1}]
</example>

<example>
Transaction: "Purchased warehouse for $500K, paid with a 5-year note at face value, market rate 8%"
asset_increase: [{"reason": "Warehouse acquired at present value of note", "category": "Buildings", "count": 1}]
liability_decrease: [{"reason": "Discount on note reflects difference between face and present value", "category": "Long-term borrowings", "count": 1}]
</example>

<example>
Transaction: "Company sold its investment in bonds, receiving $480K cash. \
Management has classified this as a disposal of a financial asset."
Note: Text says "disposal" — use that interpretation. Do not re-classify as redemption or maturity.
asset_increase: [{"reason": "Cash received from disposal of bond investment", "category": "Cash and cash equivalents", "count": 1}]
expense_increase: [{"reason": "Loss on disposal of financial asset (if carrying value > proceeds)", "category": "Losses on disposals", "count": 1}]
</example>

<example>
Transaction: "Sold 300 cases at $230/case (cost $185/case), plus 10% tax. \
Received $45,900 by bank transfer, remainder on credit."
asset_increase: [
  {"reason": "Cash received via bank transfer", "category": "Cash and cash equivalents", "count": 1},
  {"reason": "Remaining amount owed by customer", "category": "Trade receivables", "count": 1}
]
expense_increase: [{"reason": "Cost of inventory sold", "category": "Cost of sales", "count": 1}]
</example>"""

# ── Task Reminder ────────────────────────────────────────────────────────

_TASK_REMINDER = """
## Task

Classify ONLY the debit side. For each line, provide the reason and \
IFRS taxonomy category. Same category = combine. Different = separate.

Output all free-text fields in the same language as the transaction text."""

AGENT_INSTRUCTION = "\n".join([_ROLE, _PROCEDURE, _EXAMPLES])

# Legacy — for warmup compatibility
SYSTEM_INSTRUCTION = "\n".join([SHARED_INSTRUCTION, AGENT_INSTRUCTION])


def build_prompt(state: PipelineState, rag_examples: list[dict],
                 fix_context: str | None = None,
                 corrections: str | None = None,
                 jurisdiction_config=None) -> dict:
    """Build the debit classifier prompt with two cache points."""
    fix = build_fix_context(fix_context=fix_context)
    rag = build_rag_examples(rag_examples=rag_examples,
                             label="similar past transactions with correct debit structures",
                             fields=["transaction", "debit_tuple"])
    context = build_context_section(fix, rag)

    transaction = build_transaction(state=state)
    input_section = build_input_section(transaction)

    task = [{"text": _TASK_REMINDER}]

    # RAG corrections — after input, before task reminder
    corrections_block = [{"text": corrections}] if corrections else []

    system_blocks = [
        {"text": build_shared_instruction(jurisdiction_config)}, CACHE_POINT,
        {"text": AGENT_INSTRUCTION}, CACHE_POINT,
    ]
    message_blocks = context + input_section + corrections_block + task

    return to_bedrock_messages(system_blocks, message_blocks)
