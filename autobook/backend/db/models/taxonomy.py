from __future__ import annotations

import uuid

from sqlalchemy import CheckConstraint, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from db.models.base import Base


class Taxonomy(Base):
    """Global IFRS category taxonomy. Shared across all tenants —
    no entity_id. Seeded by init.sql with ~96 default categories
    spanning asset/liability/equity/revenue/expense.
    """

    __tablename__ = "taxonomy"
    __table_args__ = (
        UniqueConstraint("name", "account_type", name="uq_taxonomy_name_type"),
        CheckConstraint(
            "account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')",
            name="ck_taxonomy_account_type",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.uuidv7()
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    account_type: Mapped[str] = mapped_column(String(20), nullable=False)
