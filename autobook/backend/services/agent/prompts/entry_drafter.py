"""Prompt builder for Entry Drafter.

Simple composer. Trusts upstream classifications and tax treatment.
Builds the journal entry from classified lines + tax context.
Output: EntryDrafterOutput {reason, lines: [...]}
"""
import json
from services.agent.graph.state import PipelineState
from services.agent.prompts.shared import SHARED_INSTRUCTION
from services.agent.utils.prompt import (
    CACHE_POINT, build_transaction, build_user_context,
    build_input_section, to_bedrock_messages,
)
from services.agent.utils.slots import DEBIT_SLOTS, CREDIT_SLOTS

# ── Role ─────────────────────────────────────────────────────────────────

_ROLE = """
## Role

Confidently build the best possible double-entry journal entry from the \
given classifications and tax context. The transaction has already been \
approved by the decision maker — commit to the entry without hedging."""

# ── Procedure ────────────────────────────────────────────────────────────

_PROCEDURE = """
## Procedure

### Authority of inputs

Each upstream agent is authoritative for its domain:
- <debit_classification> and <credit_classification> are authoritative \
for what happened: how many lines, which directional slots, and the \
specificity of account classification. Your account name should be \
equally or more specific than the classifier's category. You may use \
the classifier's category directly when it is already the best \
accounting practice name for the transaction.
- <tax_context> is authoritative for tax treatment. \
Only add tax lines if classification is "taxable" AND tax_rate is provided. \
For zero_rated, exempt, or out_of_scope — never add tax lines.
- <decision_maker_context> is authoritative for resolving ambiguities \
and providing disambiguating context. Use it for account naming \
and treatment decisions when available.

### Steps

1. Map each classified detection to an account name based on the \
transaction text and business purpose. Use the classifier's category \
when it is already the appropriate account name. Refine to a more \
specific name when the transaction context warrants it. Do not \
generalize to a broader name than the classifier provided.
2. Infer amounts from the transaction text. For calculations \
(PV, interest, allocation), use the calculator tool.
3. Check the tax_context classification and tax_rate fields. \
If classification is "taxable" and tax_rate is provided, add tax lines: \
compute the tax amount with the calculator tool (apply the rate to the \
correct base amount from the entry, not from fair values). \
If itc_eligible is true, record tax as a receivable (e.g. HST Receivable). \
If itc_eligible is false, include tax in the expense amount. \
If amount_tax_inclusive is true, back-calculate tax from the total. \
If classification is not "taxable" or tax_rate is null, do NOT add any \
tax lines. The tax specialist has already determined the classification.
4. Verify total debits = total credits."""

# ── Examples ─────────────────────────────────────────────────────────────

_EXAMPLES = """
## Examples

<example>
Transaction: "Purchase equipment $20,000 — $5,000 cash, $15,000 loan"
Output: {"reason": "Equipment acquired with cash and loan funding", \
"lines": [{"type": "debit", "account_name": "Equipment", "amount": 20000.00}, \
{"type": "credit", "account_name": "Cash", "amount": 5000.00}, \
{"type": "credit", "account_name": "Loan Payable", "amount": 15000.00}]}
</example>

<example>
Transaction: "Sold products for $5,000 plus 10% tax, cost $3,000"
Tax: add_tax_lines=true, rate=0.10, amount=500
Output: {"reason": "Product sale with COGS and tax collected", \
"lines": [{"type": "debit", "account_name": "Cash", "amount": 5500.00}, \
{"type": "debit", "account_name": "Cost of Goods Sold", "amount": 3000.00}, \
{"type": "credit", "account_name": "Sales Revenue", "amount": 5000.00}, \
{"type": "credit", "account_name": "Inventory", "amount": 3000.00}, \
{"type": "credit", "account_name": "Tax Payable", "amount": 500.00}]}
</example>

<example>
Transaction: "Record monthly depreciation on equipment $500"
Output: {"reason": "Monthly depreciation recognized on equipment", \
"lines": [{"type": "debit", "account_name": "Depreciation Expense", "amount": 500.00}, \
{"type": "credit", "account_name": "Accumulated Depreciation", "amount": 500.00}]}
</example>

<example>
Transaction: "Issued bonds $3,000,000 face, 3-year term, 10% coupon annual, market rate 15%"
Output: {"reason": "Bonds issued at discount — cash at PV of coupons plus principal", \
"lines": [{"type": "debit", "account_name": "Cash", "amount": 2657510.00}, \
{"type": "debit", "account_name": "Discount on Bonds Payable", "amount": 342490.00}, \
{"type": "credit", "account_name": "Bonds Payable", "amount": 3000000.00}]}
</example>

<example>
Transaction: "Paid $8,000 in cash and $12,000 by cheque for consulting services"
Classifier: 2 credit asset_decrease, both category "Cash and cash equivalents"
Note: Transaction specifies two distinct payment methods. Name each credit \
line from the transaction text, not the classifier category.
Output: {"reason": "Consulting services paid by cash and cheque", \
"lines": [{"type": "debit", "account_name": "Consulting Expense", "amount": 20000.00}, \
{"type": "credit", "account_name": "Cash", "amount": 8000.00}, \
{"type": "credit", "account_name": "Cash — chequing", "amount": 12000.00}]}
</example>

<example>
Transaction: "Sold corporate bonds to a broker. Management classified this as a disposal."
Classifier: expense_increase "Interest expense", asset_decrease "Short-term loans receivable"
Decision maker context: "Resolved as disposal per management determination"
Note: The decision maker resolved this as disposal, but the classifier used \
different categories. Use the decision maker's resolved treatment for naming.
Output: {"reason": "Bond investment disposed per management classification", \
"lines": [{"type": "debit", "account_name": "Cash", "amount": 95000.00}, \
{"type": "debit", "account_name": "Loss on Disposal", "amount": 5000.00}, \
{"type": "credit", "account_name": "Investments — FVOCI", "amount": 100000.00}]}
</example>

<example>
Transaction: "Purchased office furniture for $2,500"
Tax context: add_tax_lines=false, taxable=true
Note: The tax specialist determined no tax lines should be added. \
Do not add tax lines even though taxable=true and you may know the rate.
Output: {"reason": "Office furniture purchased at stated amount", \
"lines": [{"type": "debit", "account_name": "Office Furniture", "amount": 2500.00}, \
{"type": "credit", "account_name": "Cash", "amount": 2500.00}]}
</example>"""

# ── Input Format ─────────────────────────────────────────────────────────

_INPUT_FORMAT = """
## Input Format

You will receive these blocks in the user message:

1. <transaction> — The raw transaction description.
2. <context> — The user's business context.
3. <debit_classification> — Classified debit detections with reasons \
and IFRS taxonomy categories.
4. <credit_classification> — Classified credit detections with reasons \
and IFRS taxonomy categories.
5. <tax_context> — Tax treatment from the tax specialist. \
The key field is add_tax_lines (true/false). The taxable field is \
supplementary metadata about whether the supply category is subject \
to tax — it is NOT an instruction to add tax lines.
6. <decision_maker_context> — Decision maker's resolved ambiguities \
and proceed reason (if available)."""

# ── Task Reminder ────────────────────────────────────────────────────────

_TASK_REMINDER = """
## Task

Confidently build the journal entry from the given classifications \
and transaction text. Name accounts from business purpose. \
Use the calculator tool for computations. \
Only add tax lines if add_tax_lines is true in the tax context. \
Verify total debits = total credits.

Output all free-text fields in the same language as the transaction text."""

AGENT_INSTRUCTION = "\n".join([_ROLE, _PROCEDURE, _EXAMPLES, _INPUT_FORMAT, ])

# Legacy — for warmup compatibility
SYSTEM_INSTRUCTION = "\n".join([SHARED_INSTRUCTION, AGENT_INSTRUCTION])


def _extract_classified_lines(state: PipelineState) -> tuple[dict, dict]:
    """Extract classified detections from classifier outputs."""
    debit_out = state.get("output_debit_classifier") or {}
    credit_out = state.get("output_credit_classifier") or {}

    debit_lines = {}
    for slot in DEBIT_SLOTS:
        debit_lines[slot] = debit_out.get(slot, [])
    credit_lines = {}
    for slot in CREDIT_SLOTS:
        credit_lines[slot] = credit_out.get(slot, [])

    return debit_lines, credit_lines


def _extract_decision_maker_context(state: PipelineState) -> str | None:
    """Extract decision maker v4 context (proceed_reason + resolved ambiguities)."""
    dm_out = state.get("output_decision_maker")
    if not dm_out:
        return None

    parts = []
    proceed_reason = dm_out.get("proceed_reason")
    if proceed_reason:
        parts.append(f"Proceed reason: {proceed_reason}")

    rationale = dm_out.get("overall_final_rationale")
    if rationale:
        parts.append(f"Rationale: {rationale}")

    ambiguities = dm_out.get("ambiguities", [])
    resolved = [a for a in ambiguities if not a.get("ambiguous")]
    if resolved:
        for a in resolved:
            conv = a.get("input_contextualized_conventional_default")
            ifrs = a.get("input_contextualized_ifrs_default")
            resolution = conv or ifrs or "resolved"
            parts.append(f"Resolved: {a['aspect']} — {resolution}")

    complexity_flags = dm_out.get("complexity_flags", [])
    for flag in complexity_flags:
        best = flag.get("best_attempt")
        if best and best.get("reason"):
            parts.append(f"Assessment: {flag['aspect']} — {best['reason']}")

    return "\n".join(parts) if parts else None


def build_prompt(state: PipelineState, tax_output: dict | None = None) -> dict:
    """Build the entry drafter prompt with classified detections and decision context."""
    if tax_output is None:
        tax_output = state.get("output_tax_specialist")

    debit_lines, credit_lines = _extract_classified_lines(state)

    context = f"<debit_classification>{json.dumps(debit_lines, indent=2)}</debit_classification>\n"
    context += f"<credit_classification>{json.dumps(credit_lines, indent=2)}</credit_classification>\n"
    if tax_output:
        context += f"<tax_context>{json.dumps(tax_output)}</tax_context>\n"

    dm_context = _extract_decision_maker_context(state)
    if dm_context:
        context += f"<decision_maker_context>\n{dm_context}\n</decision_maker_context>\n"

    system_blocks = [
        {"text": SHARED_INSTRUCTION}, CACHE_POINT,
        {"text": AGENT_INSTRUCTION}, CACHE_POINT,
    ]
    transaction = build_transaction(state=state)
    user_ctx = build_user_context(state=state)
    context_block = [{"text": context}]
    task = [{"text": _TASK_REMINDER}]
    message_blocks = transaction + user_ctx + context_block + task

    return to_bedrock_messages(system_blocks, message_blocks)
