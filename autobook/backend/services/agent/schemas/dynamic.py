"""Dynamic classifier schema generation per jurisdiction.

Builds Pydantic schemas with jurisdiction-specific Literal types
from the taxonomy tree. Cached per jurisdiction — built once, reused.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, create_model

from services.agent.utils.taxonomy import extract_l4_by_category

# ── Cache ─────────────────────────────────────────────────

_debit_schema_cache: dict[str, type[BaseModel]] = {}
_credit_schema_cache: dict[str, type[BaseModel]] = {}


def get_debit_schema(jurisdiction_config) -> type[BaseModel]:
    key = jurisdiction_config.jurisdiction
    if key not in _debit_schema_cache:
        cats = extract_l4_by_category(
            jurisdiction_config.taxonomy_tree,
            jurisdiction_config.language_key,
        )
        _debit_schema_cache[key] = _build_debit_schema(cats)
    return _debit_schema_cache[key]


def get_credit_schema(jurisdiction_config) -> type[BaseModel]:
    key = jurisdiction_config.jurisdiction
    if key not in _credit_schema_cache:
        cats = extract_l4_by_category(
            jurisdiction_config.taxonomy_tree,
            jurisdiction_config.language_key,
        )
        _credit_schema_cache[key] = _build_credit_schema(cats)
    return _credit_schema_cache[key]


def invalidate_cache(jurisdiction: str) -> None:
    _debit_schema_cache.pop(jurisdiction, None)
    _credit_schema_cache.pop(jurisdiction, None)


# ── Schema builders ───────────────────────────────────────

def _make_literal(values: list[str]):
    """Create a Literal type from a list of strings."""
    if not values:
        return str  # fallback to free text if no categories
    return Literal[tuple(values)]


def _make_detection(name: str, literal_type, description: str) -> type[BaseModel]:
    return create_model(
        name,
        reason=(str, Field(description="One sentence: what causes this change")),
        category=(literal_type, Field(description=description)),
        count=(int, Field(description="Number of journal lines for this category")),
    )


def _build_debit_schema(cats: dict[str, list[str]]) -> type[BaseModel]:
    asset_lit = _make_literal(cats["asset"])
    expense_lit = _make_literal(cats["expense"])
    liability_lit = _make_literal(cats["liability"])
    equity_lit = _make_literal(cats["equity"])
    revenue_lit = _make_literal(cats["revenue"])

    AssetIncrease = _make_detection("AssetIncreaseDetection", asset_lit, "Asset category")
    ExpenseIncrease = _make_detection("ExpenseIncreaseDetection", expense_lit, "Expense category")
    LiabilityDecrease = _make_detection("LiabilityDecreaseDetection", liability_lit, "Liability category")
    EquityDecrease = _make_detection("EquityDecreaseDetection", equity_lit, "Equity category")
    RevenueDecrease = _make_detection("RevenueDecreaseDetection", revenue_lit, "Revenue category")

    return create_model(
        "DebitClassifierOutput",
        asset_increase=(list[AssetIncrease], Field(default_factory=list, description="Detected asset balance increases")),
        expense_increase=(list[ExpenseIncrease], Field(default_factory=list, description="Detected expense balance increases")),
        liability_decrease=(list[LiabilityDecrease], Field(default_factory=list, description="Detected liability balance decreases")),
        equity_decrease=(list[EquityDecrease], Field(default_factory=list, description="Detected equity balance decreases")),
        revenue_decrease=(list[RevenueDecrease], Field(default_factory=list, description="Detected revenue balance decreases")),
    )


def _build_credit_schema(cats: dict[str, list[str]]) -> type[BaseModel]:
    asset_lit = _make_literal(cats["asset"])
    expense_lit = _make_literal(cats["expense"])
    liability_lit = _make_literal(cats["liability"])
    equity_lit = _make_literal(cats["equity"])
    revenue_lit = _make_literal(cats["revenue"])

    LiabilityIncrease = _make_detection("LiabilityIncreaseDetection", liability_lit, "Liability category")
    EquityIncrease = _make_detection("EquityIncreaseDetection", equity_lit, "Equity category")
    RevenueIncrease = _make_detection("RevenueIncreaseDetection", revenue_lit, "Revenue category")
    AssetDecrease = _make_detection("AssetDecreaseDetection", asset_lit, "Asset category")
    ExpenseDecrease = _make_detection("ExpenseDecreaseDetection", expense_lit, "Expense category")

    return create_model(
        "CreditClassifierOutput",
        liability_increase=(list[LiabilityIncrease], Field(default_factory=list, description="Detected liability balance increases")),
        equity_increase=(list[EquityIncrease], Field(default_factory=list, description="Detected equity balance increases")),
        revenue_increase=(list[RevenueIncrease], Field(default_factory=list, description="Detected revenue balance increases")),
        asset_decrease=(list[AssetDecrease], Field(default_factory=list, description="Detected asset balance decreases")),
        expense_decrease=(list[ExpenseDecrease], Field(default_factory=list, description="Detected expense balance decreases")),
    )
