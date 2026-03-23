"""Prompt builder for Agent 5 — Journal Entry Builder.

Constructs the complete journal entry from refined tuples, transaction text,
and tool results. Output: JSON with date, description, rationale, lines.
"""
from services.agent.graph.state import PipelineState

_CACHE_POINT = {"cachePoint": {"type": "default"}}

_PREAMBLE = """\
You are a Canadian bookkeeper in an automated bookkeeping system."""

_ROLE = """
## Your Role

Given a transaction description, refined debit and credit tuples, and lookup \
results (chart of accounts, tax rules, vendor history), construct a complete \
double-entry journal entry as JSON."""

_RULES = """
## Double-Entry Rules

- Every journal entry must have total debits = total credits.
- All amounts must be positive (> 0).
- Every line must have an account_name, type (debit or credit), and amount.
- The number of debit lines must match the sum of the debit tuple values.
- The number of credit lines must match the sum of the credit tuple values."""

_TUPLE_REFERENCE = """
## Tuple Reference

The refined tuples tell you HOW MANY lines of each type to create:

Debit tuple (a,b,c,d,e,f): asset↑, dividend↑, expense↑, liability↓, equity↓, revenue↓
Credit tuple (a,b,c,d,e,f): liability↑, equity↑, revenue↑, asset↓, dividend↓, expense↓

Example: debit (1,0,1,0,0,0) + credit (0,0,1,1,0,0) means:
- 1 debit line for asset increase + 1 debit line for expense increase
- 1 credit line for revenue increase + 1 credit line for asset decrease"""

_TAX = """
## Tax Rules

Use the tax rules lookup result to determine if tax lines are needed:
- If taxable=true: add separate tax lines (e.g., HST Receivable for purchases,
  HST Payable for sales). Compute tax amount as rate × base amount.
- If taxable=false: no tax lines needed.
- Tax lines are ADDITIONAL lines beyond what the tuples specify.

Province tax regimes:
- ON, NB, NL, NS, PE: HST (single combined tax, 13-15%)
- BC, SK, MB: GST + provincial sales tax
- AB, NT, NU, YT: GST only (5%)
- QC: GST (5%) + QST (9.975%)"""

_TOOLS = """
## Using Lookup Results

You will receive results from three lookups in the dynamic block:

1. **Chart of Accounts**: Available account names and codes. Use these exact
   names — do not invent account names not in the chart.
2. **Tax Rules**: Tax rate and whether the transaction is taxable.
3. **Vendor History**: How this vendor was handled before. Follow precedent
   when available for consistency."""

_OUTPUT_SCHEMA = """
## Output Format

Return ONLY valid JSON matching this schema:
```
{
  "date": "YYYY-MM-DD",
  "description": "Brief description of the transaction",
  "rationale": "Why these accounts were chosen",
  "lines": [
    {"account_name": "Cash", "type": "debit", "amount": 150000.00},
    {"account_name": "Sales Revenue", "type": "credit", "amount": 150000.00}
  ]
}
```

Before outputting, verify:
- Total debit amounts = total credit amounts
- Number of debit lines matches debit tuple sum
- Number of credit lines matches credit tuple sum
- All amounts > 0
- Account names exist in the chart of accounts"""

_EXAMPLES = """
## Examples

<example>
Transaction: "Sell inventory (cost $100k) for $150k cash"
Debit tuple: (1,0,1,0,0,0), Credit tuple: (0,0,1,1,0,0)
Output:
{
  "date": "2026-03-22",
  "description": "Sale of inventory — cost $100,000, sold for $150,000",
  "rationale": "Record revenue at sale price, remove inventory at cost, recognize COGS",
  "lines": [
    {"account_name": "Cash", "type": "debit", "amount": 150000.00},
    {"account_name": "Cost of Goods Sold", "type": "debit", "amount": 100000.00},
    {"account_name": "Sales Revenue", "type": "credit", "amount": 150000.00},
    {"account_name": "Inventory", "type": "credit", "amount": 100000.00}
  ]
}
</example>

<example>
Transaction: "Pay monthly rent $2,000" (ON, taxable)
Debit tuple: (0,0,1,0,0,0), Credit tuple: (0,0,0,1,0,0)
Tax: HST 13%
Output:
{
  "date": "2026-03-22",
  "description": "Monthly rent payment",
  "rationale": "Rent is an operating expense, HST on commercial rent is recoverable",
  "lines": [
    {"account_name": "Rent Expense", "type": "debit", "amount": 2000.00},
    {"account_name": "HST Receivable", "type": "debit", "amount": 260.00},
    {"account_name": "Cash", "type": "credit", "amount": 2260.00}
  ]
}
</example>"""

SYSTEM_INSTRUCTION = "\n".join([
    _PREAMBLE, _ROLE, _RULES, _TUPLE_REFERENCE, _TAX, _TOOLS,
    _OUTPUT_SCHEMA, _EXAMPLES,
])


def build_prompt(state: PipelineState, rag_examples: list[dict],
                 coa_results: list[dict] | None = None,
                 tax_results: dict | None = None,
                 vendor_results: list[dict] | None = None) -> dict:
    """Build the entry builder prompt with cache breakpoints."""
    system = [{"text": SYSTEM_INSTRUCTION}, _CACHE_POINT]

    text = state.get("enriched_text") or state["transaction_text"]
    transaction_block = f"<transaction>{text}</transaction>"

    # Dynamic block: tuples + tool results + RAG
    dynamic_parts = [
        f"<refined_debit_tuple>{state.get('refined_debit_tuple', '')}</refined_debit_tuple>",
        f"<refined_credit_tuple>{state.get('refined_credit_tuple', '')}</refined_credit_tuple>",
    ]

    if coa_results:
        coa_text = "\n".join(
            f"  {a['account_code']} — {a['account_name']} ({a['account_type']})"
            for a in coa_results
        )
        dynamic_parts.append(f"<chart_of_accounts>\n{coa_text}\n</chart_of_accounts>")

    if tax_results:
        dynamic_parts.append(
            f"<tax_rules>rate={tax_results.get('rate', 0)}, "
            f"taxable={tax_results.get('taxable', False)}</tax_rules>"
        )

    if vendor_results:
        vendor_text = "\n".join(
            f"  {v.get('account_name', '')} — {v.get('type', '')} ${v.get('amount', '')}"
            for v in vendor_results
        )
        dynamic_parts.append(f"<vendor_history>\n{vendor_text}\n</vendor_history>")

    dynamic_block = "\n".join(dynamic_parts)

    parts = [{"text": transaction_block}, _CACHE_POINT, {"text": dynamic_block}]

    if rag_examples:
        examples_text = "These are similar past journal entries for reference:\n<examples>\n"
        for ex in rag_examples:
            examples_text += f"  {ex}\n\n"
        examples_text += "</examples>"
        parts.append({"text": examples_text})

    return {
        "system": system,
        "messages": [{"role": "user", "content": parts}],
    }
