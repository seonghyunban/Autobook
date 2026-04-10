"""Prompt builder for Tax Specialist.

Determines tax treatment from transaction text.
Output: TaxSpecialistOutput {reasoning, tax_mentioned, classification, itc_eligible, amount_tax_inclusive, tax_rate, tax_context}
"""
from services.agent.graph.state import PipelineState
from services.agent.prompts.shared import SHARED_INSTRUCTION, build_shared_instruction
from services.agent.utils.prompt import (
    CACHE_POINT, build_transaction, build_user_context,
    build_input_section, to_bedrock_messages,
)

# ── Role ─────────────────────────────────────────────────────────────────

_ROLE = """
## Role

Determine the tax treatment for this transaction. Your output tells the \
entry drafter whether to add tax lines and how to record them.

You do NOT:
- Build the journal entry (entry drafter handles that)
- Classify debit/credit lines (classifiers handle that)
- Assess ambiguity (ambiguity detector handles that)"""

# ── Procedure ────────────────────────────────────────────────────────────

_PROCEDURE = """
## Procedure

1. Read the transaction text. Does it explicitly mention tax?
   - "plus 10% tax", "$6,900 tax", "inclusive of sales tax" → tax_mentioned = true
   - No mention of tax at all → tax_mentioned = false

2. Classify the supply:
   - taxable: standard-rated, GST/HST/VAT applies at a positive rate
   - zero_rated: taxable at 0% (exports, basic groceries, prescription drugs)
   - exempt: not subject to tax (financial services, medical, education)
   - out_of_scope: not a taxable supply (salary, dividends, interest, bank transfers)

3. Is the business eligible to claim an Input Tax Credit (ITC)?
   - Purchases for commercial activities with valid tax invoice → itc_eligible = true
   - Personal use, exempt activities, or unregistered business → itc_eligible = false
   - For zero_rated/exempt/out_of_scope, set itc_eligible = false

4. Does the stated amount already include tax?
   - "inclusive of tax", "$565 including HST" → amount_tax_inclusive = true
   - "plus 13% tax", "$500 + tax" → amount_tax_inclusive = false
   - If no tax is mentioned → amount_tax_inclusive = false

5. Extract the tax rate if mentioned. If the transaction text does not \
state a rate, check the <tax_jurisdiction> block — if a default rate \
is specified there, apply it for taxable supplies. Otherwise do not \
infer a rate."""

# ── Examples ─────────────────────────────────────────────────────────────

_EXAMPLES = """
## Examples

<example>
Transaction: "Purchased supplies for $500 plus 10% tax"
Output: {"reasoning": "Text states 10% tax on $500 purchase", \
"tax_mentioned": true, "classification": "taxable", \
"itc_eligible": true, "amount_tax_inclusive": false, \
"tax_rate": 0.10, "tax_context": "10% tax on the full $500 purchase amount"}
</example>

<example>
Transaction: "Paid employee salaries of $3,000 in cash"
Output: {"reasoning": "Payroll is not a taxable supply — out of scope of GST/HST", \
"tax_mentioned": false, "classification": "out_of_scope", \
"itc_eligible": false, "amount_tax_inclusive": false, \
"tax_rate": null, "tax_context": null}
</example>

<example>
Transaction: "Paid monthly rent $2,000 (no tax mentioned)"
Output: {"reasoning": "Commercial rent is taxable but text does not mention tax — do not infer", \
"tax_mentioned": false, "classification": "taxable", \
"itc_eligible": false, "amount_tax_inclusive": false, \
"tax_rate": null, "tax_context": null}
</example>

<example>
Transaction: "Sold products for $5,000 plus 13% HST"
Output: {"reasoning": "Sale with 13% HST collected from customer", \
"tax_mentioned": true, "classification": "taxable", \
"itc_eligible": false, "amount_tax_inclusive": false, \
"tax_rate": 0.13, "tax_context": "13% HST collected on the $5,000 sale — record as Tax Payable"}
</example>

<example>
Transaction: "Purchased land and building for $9M. 10% sales tax on the building."
Output: {"reasoning": "10% tax applies to building component only, land is exempt from tax", \
"tax_mentioned": true, "classification": "taxable", \
"itc_eligible": true, "amount_tax_inclusive": false, \
"tax_rate": 0.10, "tax_context": "10% tax on building component only; land is tax-exempt. Apply rate to the allocated building cost, not fair value."}
</example>"""

# ── Task Reminder ────────────────────────────────────────────────────────

_TASK_REMINDER = """
## Task

Determine the tax treatment for this transaction. \
Classify the supply, determine ITC eligibility, and extract the rate if mentioned. \
Do not compute the tax amount — the entry drafter will compute it from the correct base. \
If tax is not mentioned and no jurisdiction default rate applies, do not infer a tax rate.

Output all free-text fields in the same language as the transaction text."""

AGENT_INSTRUCTION = "\n".join([_ROLE, _PROCEDURE, _EXAMPLES, ])

# Legacy — for warmup compatibility
SYSTEM_INSTRUCTION = "\n".join([SHARED_INSTRUCTION, AGENT_INSTRUCTION])


def build_prompt(state: PipelineState, rag_examples: list[dict] | None = None,
                 corrections: str | None = None,
                 jurisdiction_config=None,
                 tax_jurisdiction: str | None = None) -> dict:
    """Build the tax specialist prompt."""
    system_blocks = [
        {"text": build_shared_instruction(jurisdiction_config)}, CACHE_POINT,
        {"text": AGENT_INSTRUCTION}, CACHE_POINT,
    ]
    transaction = build_transaction(state=state)
    user_ctx = build_user_context(state=state)
    input_section = build_input_section(transaction, user_ctx)
    tax_jurisdiction_block = [{"text": tax_jurisdiction}] if tax_jurisdiction else []
    corrections_block = [{"text": corrections}] if corrections else []
    task = [{"text": _TASK_REMINDER}]
    message_blocks = input_section + tax_jurisdiction_block + corrections_block + task

    return to_bedrock_messages(system_blocks, message_blocks)
