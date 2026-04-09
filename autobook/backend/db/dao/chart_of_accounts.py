from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from db.models.account import ChartOfAccounts

# Default starter COA seeded for every new entity on first creation.
DEFAULT_COA: list[tuple[str, str, str]] = [
    ("1000", "Cash", "asset"),
    ("1100", "Accounts Receivable", "asset"),
    ("1200", "Prepaid Expenses", "asset"),
    ("1500", "Equipment", "asset"),
    ("9999", "Unknown Destination", "asset"),
    ("2000", "Accounts Payable", "liability"),
    ("2100", "HST/GST Payable", "liability"),
    ("2200", "Corporate Tax Payable", "liability"),
    ("2300", "Deferred Revenue", "liability"),
    ("2400", "Shareholder Loan", "liability"),
    ("3000", "Share Capital", "equity"),
    ("3100", "Retained Earnings", "equity"),
    ("4000", "Sales Revenue", "revenue"),
    ("4100", "Service Revenue", "revenue"),
    ("5000", "Cost of Goods Sold", "expense"),
    ("5200", "Rent Expense", "expense"),
    ("5300", "Software & Subscriptions", "expense"),
    ("5400", "Meals & Entertainment", "expense"),
    ("5430", "Professional Fees", "expense"),
    ("5500", "Bank Fees", "expense"),
    ("6200", "CCA Expense", "expense"),
]


class ChartOfAccountsDAO:
    """Dumb CRUD for entity-scoped chart of accounts."""

    @staticmethod
    def list_by_entity(db: Session, entity_id: UUID) -> list[ChartOfAccounts]:
        stmt = (
            select(ChartOfAccounts)
            .where(ChartOfAccounts.entity_id == entity_id)
            .order_by(ChartOfAccounts.account_code)
        )
        return list(db.execute(stmt).scalars().all())

    @staticmethod
    def get_by_code(
        db: Session, entity_id: UUID, account_code: str
    ) -> ChartOfAccounts | None:
        stmt = select(ChartOfAccounts).where(
            ChartOfAccounts.entity_id == entity_id,
            ChartOfAccounts.account_code == account_code,
        )
        return db.execute(stmt).scalar_one_or_none()

    @staticmethod
    def create(
        db: Session,
        *,
        entity_id: UUID,
        account_code: str,
        account_name: str,
        account_type: str,
        auto_created: bool = False,
    ) -> ChartOfAccounts:
        account = ChartOfAccounts(
            entity_id=entity_id,
            account_code=account_code,
            account_name=account_name,
            account_type=account_type,
            auto_created=auto_created,
        )
        db.add(account)
        db.flush()
        return account

    @staticmethod
    def get_or_create(
        db: Session,
        *,
        entity_id: UUID,
        account_code: str,
        account_name: str,
        account_type: str,
    ) -> ChartOfAccounts:
        existing = ChartOfAccountsDAO.get_by_code(db, entity_id, account_code)
        if existing is not None:
            return existing
        return ChartOfAccountsDAO.create(
            db,
            entity_id=entity_id,
            account_code=account_code,
            account_name=account_name,
            account_type=account_type,
            auto_created=True,
        )

    @staticmethod
    def seed_defaults(db: Session, entity_id: UUID) -> list[ChartOfAccounts]:
        """Seed the default starter COA for a brand-new entity. Idempotent —
        skips accounts that already exist for this entity.
        """
        seeded: list[ChartOfAccounts] = []
        for account_code, account_name, account_type in DEFAULT_COA:
            account = ChartOfAccountsDAO.get_by_code(db, entity_id, account_code)
            if account is None:
                account = ChartOfAccountsDAO.create(
                    db,
                    entity_id=entity_id,
                    account_code=account_code,
                    account_name=account_name,
                    account_type=account_type,
                    auto_created=True,
                )
            seeded.append(account)
        return seeded
