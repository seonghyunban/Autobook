from enum import Enum


# ── Chart of Accounts ────────────────────────────────────────────

class AccountType(str, Enum):
    ASSET = "asset"
    LIABILITY = "liability"
    EQUITY = "equity"
    REVENUE = "revenue"
    EXPENSE = "expense"


class AccountSubType(str, Enum):
    # Assets
    CURRENT_ASSET = "current_asset"
    FIXED_ASSET = "fixed_asset"
    CCA_ASSET = "cca_asset"
    # Liabilities
    CURRENT_LIABILITY = "current_liability"
    LONG_TERM_LIABILITY = "long_term_liability"
    # Equity
    SHARE_CAPITAL = "share_capital"
    RETAINED_EARNINGS = "retained_earnings"
    DIVIDENDS = "dividends"
    # Revenue
    SALES_REVENUE = "sales_revenue"
    SERVICE_REVENUE = "service_revenue"
    # Expense
    OPERATING_EXPENSE = "operating_expense"
    COST_OF_GOODS_SOLD = "cost_of_goods_sold"
    CCA_EXPENSE = "cca_expense"
    # Other
    OTHER_INCOME = "other_income"
    OTHER_EXPENSE = "other_expense"


class AccountCreator(str, Enum):
    USER = "user"
    SYSTEM = "system"
