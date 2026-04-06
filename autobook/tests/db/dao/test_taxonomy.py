from __future__ import annotations

import pytest
from typing import get_args

from db.dao.taxonomy import TaxonomyDAO
from db.dao.users import UserDAO
from db.models.taxonomy import Taxonomy
from services.agent.schemas.taxonomy import (
    ASSET_CATEGORIES,
    LIABILITY_CATEGORIES,
    EQUITY_CATEGORIES,
    REVENUE_CATEGORIES,
    EXPENSE_CATEGORIES,
)

DEFAULT_TAXONOMY: list[tuple[str, str]] = [
    *((name, "asset") for name in get_args(ASSET_CATEGORIES)),
    *((name, "liability") for name in get_args(LIABILITY_CATEGORIES)),
    *((name, "equity") for name in get_args(EQUITY_CATEGORIES)),
    *((name, "revenue") for name in get_args(REVENUE_CATEGORIES)),
    *((name, "expense") for name in get_args(EXPENSE_CATEGORIES)),
]


def _make_user(db):
    return UserDAO.create(db, email=f"tax-{id(db)}@example.com")


def _seed(db):
    """Insert all default taxonomy rows."""
    for name, account_type in DEFAULT_TAXONOMY:
        db.add(Taxonomy(name=name, account_type=account_type, is_default=True))
    db.flush()


def test_taxonomy_list_grouped_empty(db_session):
    grouped = TaxonomyDAO.list_grouped(db_session)
    assert grouped == {}


def test_taxonomy_list_grouped(db_session):
    _seed(db_session)
    grouped = TaxonomyDAO.list_grouped(db_session)
    assert set(grouped.keys()) == {"asset", "liability", "equity", "revenue", "expense"}
    assert "Cash and cash equivalents" in grouped["asset"]
    assert "Trade payables" in grouped["liability"]
    assert "Retained earnings" in grouped["equity"]
    assert "Interest income" in grouped["revenue"]
    assert "Cost of sales" in grouped["expense"]


def test_taxonomy_list_grouped_count(db_session):
    _seed(db_session)
    grouped = TaxonomyDAO.list_grouped(db_session)
    total = sum(len(v) for v in grouped.values())
    assert total == len(DEFAULT_TAXONOMY)


def test_taxonomy_get_by_name_and_type_found(db_session):
    _seed(db_session)
    result = TaxonomyDAO.get_by_name_and_type(db_session, "Cash and cash equivalents", "asset")
    assert result is not None
    assert result.is_default is True


def test_taxonomy_get_by_name_and_type_not_found(db_session):
    _seed(db_session)
    result = TaxonomyDAO.get_by_name_and_type(db_session, "Nonexistent", "asset")
    assert result is None


def test_taxonomy_create(db_session):
    user = _make_user(db_session)
    entry = TaxonomyDAO.create(db_session, "Custom Category", "expense", user.id)
    assert entry.name == "Custom Category"
    assert entry.account_type == "expense"
    assert entry.is_default is False
    assert entry.user_id == user.id


def test_taxonomy_create_shows_in_grouped(db_session):
    _seed(db_session)
    user = _make_user(db_session)
    TaxonomyDAO.create(db_session, "Cryptocurrency holdings", "asset", user.id)
    grouped = TaxonomyDAO.list_grouped(db_session)
    assert "Cryptocurrency holdings" in grouped["asset"]
