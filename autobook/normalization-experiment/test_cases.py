"""Test cases for the normalization agent — transaction text → graph.

6 cases ranging from simple to complex, drawn from the LLM experiment test suite.
"""

NORMALIZATION_TEST_CASES = [

    # ── 1. Multi-component asset purchase (int_03) ─────────────────────────
    # Multiple cost components, mixed payment methods (on account + cheque)
    {
        "id": "norm_01_machinery_purchase",
        "text": "Clorox purchased machinery from Ford for $700,000 on account for factory expansion. Clorox also paid by cheque $30,000 in freight, $20,000 in installation, and $50,000 in testing and commissioning costs.",
        "expected_graph": {
            "nodes": [
                {"index": 0, "name": "Clorox", "role": "reporting_entity"},
                {"index": 1, "name": "Ford", "role": "counterparty"},
            ],
            "edges": [
                {"source": "Ford", "source_index": 1, "target": "Clorox", "target_index": 0, "nature": "sold machinery", "amount": 700000, "currency": "USD", "kind": "reciprocal_exchange"},
                {"source": "Clorox", "source_index": 0, "target": "Ford", "target_index": 1, "nature": "owed on account", "amount": 700000, "currency": "USD", "kind": "reciprocal_exchange"},
                {"source": "Clorox", "source_index": 0, "target": "Ford", "target_index": 1, "nature": "paid freight by cheque", "amount": 30000, "currency": "USD", "kind": "reciprocal_exchange"},
                {"source": "Clorox", "source_index": 0, "target": "Ford", "target_index": 1, "nature": "paid installation by cheque", "amount": 20000, "currency": "USD", "kind": "reciprocal_exchange"},
                {"source": "Clorox", "source_index": 0, "target": "Ford", "target_index": 1, "nature": "paid testing and commissioning by cheque", "amount": 50000, "currency": "USD", "kind": "reciprocal_exchange"},
            ],
        },
    },

    # ── 2. Compound sale with tax + mixed payment (int_22) ─────────────────
    # Sale of goods with COGS, sales tax, partial cash + credit
    {
        "id": "norm_02_compound_sale_tax",
        "text": "Mondelez sold 300 cases of snack products to a customer at $230 per case (cost: $185 per case). The total selling price of $69,000 plus 10% sales tax resulted in a gross amount of $75,900. Mondelez received $45,900 via bank transfer to its chequing account, with the remainder on credit.",
        "expected_graph": {
            "nodes": [
                {"index": 0, "name": "Mondelez", "role": "reporting_entity"},
                {"index": 1, "name": "Customer", "role": "counterparty"},
            ],
            "edges": [
                {"source": "Mondelez", "source_index": 0, "target": "Customer", "target_index": 1, "nature": "sold snack products", "amount": 69000, "currency": "USD", "kind": "reciprocal_exchange"},
                {"source": "Customer", "source_index": 1, "target": "Mondelez", "target_index": 0, "nature": "paid via bank transfer", "amount": 45900, "currency": "USD", "kind": "reciprocal_exchange"},
                {"source": "Customer", "source_index": 1, "target": "Mondelez", "target_index": 0, "nature": "owes remainder on credit", "amount": 30000, "currency": "USD", "kind": "reciprocal_exchange"},
                {"source": "Customer", "source_index": 1, "target": "Mondelez", "target_index": 0, "nature": "owes sales tax", "amount": 6900, "currency": "USD", "kind": "reciprocal_exchange"},
            ],
        },
    },

    # ── 3. Payroll with multiple parties (int_26a) ─────────────────────────
    # Employer, employees, government — withholdings create implicit parties
    {
        "id": "norm_03_payroll_recognition",
        "text": "Mondelez recognized January payroll: production worker wages of $25,000 (5 employees) and administrative salaries of $20,000 (5 employees). The following employee-borne statutory deductions were withheld: pension contributions $2,000, health insurance premiums $3,250, employment insurance premiums $1,050, and income tax withholdings $1,450. The net amount was transferred from the chequing account to employees' personal accounts.",
        "expected_graph": {
            "nodes": [
                {"index": 0, "name": "Mondelez", "role": "reporting_entity"},
                {"index": 1, "name": "Employees", "role": "counterparty"},
                {"index": 2, "name": "Government", "role": "counterparty"},
            ],
            "edges": [
                {"source": "Mondelez", "source_index": 0, "target": "Employees", "target_index": 1, "nature": "paid production wages", "amount": 25000, "currency": "USD", "kind": "reciprocal_exchange"},
                {"source": "Mondelez", "source_index": 0, "target": "Employees", "target_index": 1, "nature": "paid administrative salaries", "amount": 20000, "currency": "USD", "kind": "reciprocal_exchange"},
                {"source": "Mondelez", "source_index": 0, "target": "Government", "target_index": 2, "nature": "withheld pension contributions", "amount": 2000, "currency": "USD", "kind": "chained_exchange"},
                {"source": "Mondelez", "source_index": 0, "target": "Government", "target_index": 2, "nature": "withheld health insurance", "amount": 3250, "currency": "USD", "kind": "chained_exchange"},
                {"source": "Mondelez", "source_index": 0, "target": "Government", "target_index": 2, "nature": "withheld employment insurance", "amount": 1050, "currency": "USD", "kind": "chained_exchange"},
                {"source": "Mondelez", "source_index": 0, "target": "Government", "target_index": 2, "nature": "withheld income tax", "amount": 1450, "currency": "USD", "kind": "chained_exchange"},
                {"source": "Mondelez", "source_index": 0, "target": "Employees", "target_index": 1, "nature": "transferred net pay", "amount": 37250, "currency": "USD", "kind": "reciprocal_exchange"},
            ],
        },
    },

    # ── 4. Donation — non-exchange transfer (int_13) ───────────────────────
    # One-way value flow, promissory note as payment method
    {
        "id": "norm_04_donation",
        "text": "Target pledged a donation of $1,000,000 to a humanitarian food aid program in Somalia and issued a 1-month promissory note for the full amount.",
        "expected_graph": {
            "nodes": [
                {"index": 0, "name": "Target", "role": "reporting_entity"},
                {"index": 1, "name": "Humanitarian food aid program", "role": "counterparty"},
            ],
            "edges": [
                {"source": "Target", "source_index": 0, "target": "Humanitarian food aid program", "target_index": 1, "nature": "pledged donation via promissory note", "amount": 1000000, "currency": "USD", "kind": "non_exchange"},
            ],
        },
    },

    # ── 5. Decommissioning provision — asset + indirect obligation (int_07) ─
    # Purchase creates both a direct payable and an indirect future obligation
    {
        "id": "norm_05_decommissioning",
        "text": "Tidewater acquired an offshore marine structure for $4,000,000 on account. The structure is subject to a 10-year operating permit, which requires full site restoration at the end of the permit term. Tidewater estimated the future restoration cost and determined its present value to be $1,950,000.",
        "expected_graph": {
            "nodes": [
                {"index": 0, "name": "Tidewater", "role": "reporting_entity"},
                {"index": 1, "name": "Vendor", "role": "counterparty"},
            ],
            "edges": [
                {"source": "Vendor", "source_index": 1, "target": "Tidewater", "target_index": 0, "nature": "sold offshore marine structure", "amount": 4000000, "currency": "USD", "kind": "reciprocal_exchange"},
                {"source": "Tidewater", "source_index": 0, "target": "Vendor", "target_index": 1, "nature": "owed on account", "amount": 4000000, "currency": "USD", "kind": "reciprocal_exchange"},
            ],
        },
        "note": "The decommissioning obligation ($1,950,000) is an internal provision, not a transfer to another party. The normalizer should NOT create a node for it.",
    },

    # ── 6. Note discounting — ambiguous, multi-party (hard_01) ─────────────
    # Reporting entity, original debtor (implicit), and bank
    {
        "id": "norm_06_note_discounting",
        "text": "Ford received a 90-day, non-interest-bearing promissory note with a face value of $100,000 as settlement of a trade receivable. Fifty days after the note's issue date, Ford discounted the note at the bank at an annual discount rate of 15%, receiving the net proceeds in cash after deducting the discount charges.",
        "expected_graph": {
            "nodes": [
                {"index": 0, "name": "Ford", "role": "reporting_entity"},
                {"index": 1, "name": "Customer", "role": "counterparty"},
                {"index": 2, "name": "Bank", "role": "counterparty"},
            ],
            "edges": [
                {"source": "Customer", "source_index": 1, "target": "Ford", "target_index": 0, "nature": "issued promissory note as settlement", "amount": 100000, "currency": "USD", "kind": "reciprocal_exchange"},
                {"source": "Ford", "source_index": 0, "target": "Bank", "target_index": 2, "nature": "discounted note", "amount": 100000, "currency": "USD", "kind": "reciprocal_exchange"},
                {"source": "Bank", "source_index": 2, "target": "Ford", "target_index": 0, "nature": "paid net proceeds in cash", "amount": None, "currency": "USD", "kind": "reciprocal_exchange"},
            ],
        },
        "note": "The net proceeds amount is not directly stated — it requires calculation. The normalizer extracts the face value and leaves the computation to downstream agents.",
    },
]
