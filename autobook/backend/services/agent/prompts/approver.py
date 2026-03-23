"""Prompt builder for Agent 6 — Approver.

Judges whether the journal entry produced by the generator is correct.
Output: JSON with approved (bool), confidence (float), reason (str).
"""
from services.agent.graph.state import PipelineState

_CACHE_POINT = {"cachePoint": {"type": "default"}}

_PREAMBLE = """\
You are an accounting auditor in a Canadian automated bookkeeping system."""

_ROLE = """
## Your Role

Review a journal entry produced by an automated generator. Determine whether \
the entry is correct. Output your judgment as JSON with approved, confidence, \
and reason fields."""

_CRITERIA = """
## What to Check

1. **Balance**: Total debits = total credits.
2. **Account selection**: Accounts match the transaction description. No
   invented or nonsensical account names.
3. **Amount accuracy**: Amounts are reasonable given the transaction text.
   Dollar amounts inferred correctly.
4. **Line completeness**: All necessary lines present. No missing tax lines
   (if taxable), no missing expense or revenue lines.
5. **Directional correctness**: Debits and credits are on the correct side
   for each account type (assets increase on debit, liabilities on credit, etc.).
6. **Tax correctness**: If tax lines present, the tax amount is plausible
   given the base amount and applicable rate."""

_CONFIDENCE = """
## Confidence Scoring

Output an honest confidence score between 0.0 and 1.0:
- 0.95+: Entry is clearly correct, no issues found.
- 0.80-0.94: Entry looks correct but minor uncertainty exists.
- 0.50-0.79: Significant uncertainty — some aspect may be wrong.
- Below 0.50: Entry is likely wrong.

Do not try to calibrate your own confidence. Just report how certain you are. \
A downstream system adjusts your score."""

_COMMON_ERRORS = """
## Common Errors to Watch For

- COGS classified as asset increase instead of expense increase
- Owner withdrawals classified as expenses instead of dividends
- Loan payments classified as expenses instead of liability decrease
- Missing tax lines on taxable transactions
- Tax computed on wrong base amount
- Amounts that don't match the transaction text
- Debits and credits on wrong sides"""

_EXAMPLES = """
## Examples

<example>
Entry is correct:
{"approved": true, "confidence": 0.96, "reason": "Entry correctly records inventory sale with COGS and revenue. Amounts match transaction text. Balance verified."}
</example>

<example>
Entry has wrong account:
{"approved": false, "confidence": 0.15, "reason": "COGS recorded as asset increase instead of expense increase. Inventory leaving should create an expense, not acquire a new asset."}
</example>

<example>
Entry is missing tax:
{"approved": false, "confidence": 0.30, "reason": "Transaction is in Ontario (HST applicable) but no HST lines present in the journal entry."}
</example>

<example>
Entry has wrong amount:
{"approved": false, "confidence": 0.10, "reason": "Transaction text says $2,000 but journal entry records $200. Off by factor of 10."}
</example>"""

_OUTPUT_FORMAT = """
## Output Format

Return ONLY valid JSON:
{"approved": true/false, "confidence": 0.0-1.0, "reason": "brief explanation"}

No markdown, no preamble."""

SYSTEM_INSTRUCTION = "\n".join([
    _PREAMBLE, _ROLE, _CRITERIA, _CONFIDENCE, _COMMON_ERRORS,
    _EXAMPLES, _OUTPUT_FORMAT,
])


def build_prompt(state: PipelineState, rag_examples: list[dict]) -> dict:
    """Build the approver prompt with cache breakpoints."""
    system = [{"text": SYSTEM_INSTRUCTION}, _CACHE_POINT]

    text = state.get("enriched_text") or state["transaction_text"]
    transaction_block = f"<transaction>{text}</transaction>"

    # Dynamic block: journal entry + generator trace
    import json
    journal = state.get("journal_entry", {})
    journal_text = json.dumps(journal, indent=2) if journal else "No journal entry produced."

    trace_parts = []
    for field in ["output_disambiguator", "output_debit_classifier",
                  "output_credit_classifier", "output_debit_corrector",
                  "output_credit_corrector", "output_entry_builder"]:
        val = state.get(field)
        if val is not None:
            trace_parts.append(f"{field}: {val}")
    trace_text = "\n".join(trace_parts) if trace_parts else "No trace available."

    dynamic_block = (
        f"<journal_entry>\n{journal_text}\n</journal_entry>\n"
        f"<generator_trace>\n{trace_text}\n</generator_trace>"
    )

    parts = [{"text": transaction_block}, _CACHE_POINT, {"text": dynamic_block}]

    if rag_examples:
        examples_text = "These are similar past corrections for reference:\n<examples>\n"
        for ex in rag_examples:
            examples_text += f"  {ex}\n\n"
        examples_text += "</examples>"
        parts.append({"text": examples_text})

    return {
        "system": system,
        "messages": [{"role": "user", "content": parts}],
    }
