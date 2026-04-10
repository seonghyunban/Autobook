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
