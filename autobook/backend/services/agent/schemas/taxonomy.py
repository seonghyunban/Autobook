"""IFRS taxonomy categories — shared Literal types for classifier schemas."""
from typing import Literal

ASSET_CATEGORIES = Literal[
    "Land", "Buildings", "Machinery", "Motor vehicles", "Office equipment",
    "Fixtures and fittings", "Construction in progress", "Site improvements",
    "Right-of-use assets", "Goodwill", "Intangible assets", "Investment property",
    "Investments — equity method", "Investments — FVTPL", "Investments — FVOCI",
    "Deferred tax assets", "Non-current loans receivable", "Long-term deposits",
    "Non-current prepayments", "Inventories — raw materials",
    "Inventories — work in progress", "Inventories — finished goods",
    "Inventories — merchandise", "Cash and cash equivalents", "Trade receivables",
    "Contract assets", "Prepaid expenses", "Tax assets",
    "Short-term loans receivable", "Short-term deposits", "Restricted cash",
]

LIABILITY_CATEGORIES = Literal[
    "Trade payables", "Other payables", "Credit card payable",
    "Accrued liabilities", "Employee benefits payable",
    "Statutory withholdings payable",
    "Warranty provisions", "Legal and restructuring provisions", "Tax liabilities",
    "Short-term borrowings", "Current lease liabilities", "Deferred income",
    "Contract liabilities", "Dividends payable", "Long-term borrowings",
    "Non-current lease liabilities", "Pension obligations",
    "Decommissioning provisions", "Deferred tax liabilities",
]

EQUITY_CATEGORIES = Literal[
    "Issued capital", "Share premium", "Retained earnings", "Treasury shares",
    "Revaluation surplus", "Translation reserve", "Hedging reserve",
]

REVENUE_CATEGORIES = Literal[
    "Revenue from sale of goods", "Revenue from rendering of services",
    "Interest income", "Dividend income", "Share of profit of associates",
    "Gains (losses) on disposals", "Fair value gains (losses)",
    "Foreign exchange gains (losses)", "Rental income", "Government grant income",
]

EXPENSE_CATEGORIES = Literal[
    "Cost of sales", "Employee benefits expense", "Depreciation expense",
    "Amortisation expense", "Impairment loss", "Advertising expense",
    "Professional fees expense", "Travel expense", "Utilities expense",
    "Warranty expense", "Repairs and maintenance expense", "Services expense", "Insurance expense",
    "Communication expense", "Transportation expense", "Warehousing expense",
    "Occupancy expense", "Rent expense", "Interest expense", "Income tax expense",
    "Property tax expense", "Payroll tax expense",
    "Research and development expense", "Entertainment expense",
    "Meeting expense", "Donations expense", "Royalty expense", "Casualty loss",
    "Penalties and fines",
]
