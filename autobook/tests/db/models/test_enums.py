from __future__ import annotations

from db.models.enums import AccountType, AccountSubType


def test_enum_account_type():
    assert AccountType.ASSET == "asset"
    assert len(AccountType) == 5


def test_enum_account_subtype():
    assert AccountSubType.CURRENT_ASSET == "current_asset"
    assert len(AccountSubType) >= 10
