"""Shared pipeline prompt — used by classifiers, tax specialist, entry drafter.

Contains pipeline-specific content: double-entry rules, PV/contra rule,
IFRS taxonomy, tax categories, detection schema, directional slots,
pipeline architecture, and computation capability.

NOT used by decision_maker_v4 (it has its own agent-specific knowledge).
"""

SHARED_PIPELINE = """
### Double-Entry Rules

- Every entry must have total debits = total credits.
- All amounts must be positive (> 0).
- When face value and present value differ, the contra account \
is its own line.

### IFRS Taxonomy Categories

<ifrs_taxonomy>
Assets:
  Land, Buildings, Machinery, Motor vehicles, Office equipment,
  Fixtures and fittings, Construction in progress, Site improvements,
  Right-of-use assets, Goodwill, Intangible assets, Investment property,
  Investments — equity method, Investments — FVTPL, Investments — FVOCI,
  Deferred tax assets, Non-current loans receivable, Long-term deposits,
  Non-current prepayments, Inventories — raw materials,
  Inventories — work in progress, Inventories — finished goods,
  Inventories — merchandise, Cash and cash equivalents, Trade receivables,
  Contract assets, Prepaid expenses, Tax assets,
  Short-term loans receivable, Short-term deposits, Restricted cash

Liabilities:
  Trade payables, Accrued liabilities, Employee benefits payable,
  Warranty provisions, Legal and restructuring provisions, Tax liabilities,
  Short-term borrowings, Current lease liabilities, Deferred income,
  Contract liabilities, Dividends payable, Long-term borrowings,
  Non-current lease liabilities, Pension obligations,
  Decommissioning provisions, Deferred tax liabilities

Equity:
  Issued capital, Share premium, Retained earnings, Treasury shares,
  Revaluation surplus, Translation reserve, Hedging reserve

Revenue/Income:
  Revenue from sale of goods, Revenue from rendering of services,
  Interest income, Dividend income, Share of profit of associates,
  Gains (losses) on disposals, Fair value gains (losses),
  Foreign exchange gains (losses), Rental income, Government grant income

Expenses:
  Cost of sales, Employee benefits expense, Depreciation expense,
  Amortisation expense, Impairment loss, Advertising expense,
  Professional fees expense, Travel expense, Utilities expense,
  Repairs and maintenance expense, Services expense, Insurance expense,
  Communication expense, Transportation expense, Warehousing expense,
  Occupancy expense, Interest expense, Income tax expense,
  Property tax expense, Payroll tax expense,
  Research and development expense, Entertainment expense,
  Meeting expense, Donations expense, Royalty expense,
  Casualty loss, Penalties and fines

</ifrs_taxonomy>

### Tax Categories

<tax_categories>
- Taxable: purchases/sales of goods or services, rent, utilities, \
advertising, professional fees.
- Not taxable: equity, loans, payroll, provisions, depreciation, \
write-offs, casualty losses, prepayments/deposits.
</tax_categories>

## System Architecture

### Detection Schema

Each classifier outputs a list of detections per directional slot. \
Each detection has: reason (one sentence: what causes the change), \
category (IFRS taxonomy, constrained by schema), count (number of \
journal lines for this category). Same category = one detection \
with count. Different categories = separate detections.

### Directional Slots

<debit_slots>
Debit (balance increases for A/E, decreases for L/Eq/R):
- asset_increase, expense_increase
- liability_decrease, equity_decrease, revenue_decrease
</debit_slots>

<credit_slots>
Credit (balance increases for L/Eq/R, decreases for A/E):
- liability_increase, equity_increase, revenue_increase
- asset_decrease, expense_decrease
</credit_slots>

### Pipeline

Dual-track parallel execution:
- Track 1: Decision maker (gating: PROCEED / MISSING_INFO / STUCK)
- Track 2: Debit classifier, credit classifier, tax specialist
- After join: if PROCEED → entry drafter builds the journal entry. \
If MISSING_INFO or STUCK → no entry, return to user.

### Computation Capability

<computation_capability>
- The entry drafter has a dedicated calculator tool for PV, \
interest, annuity, amortization, and allocation computations.
- If the transaction states the inputs needed for a computation \
(rate, periods, amounts), resolve as computable.
</computation_capability>"""
