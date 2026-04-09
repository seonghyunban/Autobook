from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db.models.base import Base

if TYPE_CHECKING:
    from db.models.account import ChartOfAccounts
    from db.models.entity_membership import EntityMembership
    from db.models.transaction import Transaction


class Entity(Base):
    """A business entity (company). The tenant scope for almost all
    application data — chart of accounts, transactions, drafts, traces,
    entries, postings are all owned by an entity, not a user.

    A user can be a member of multiple entities via entity_memberships.
    """

    __tablename__ = "entities"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.uuidv7()
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    jurisdiction: Mapped[str] = mapped_column(String(50), nullable=False)
    fiscal_year_end: Mapped[date] = mapped_column(Date, nullable=False)
    incorporation_date: Mapped[date | None] = mapped_column(Date)
    hst_registration_number: Mapped[str | None] = mapped_column(String(50))
    business_number: Mapped[str | None] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # ── relationships ──────────────────────────────────────────
    memberships: Mapped[list["EntityMembership"]] = relationship(
        "EntityMembership", back_populates="entity", cascade="all, delete-orphan"
    )
    chart_of_accounts: Mapped[list["ChartOfAccounts"]] = relationship(
        "ChartOfAccounts", back_populates="entity", cascade="all, delete-orphan"
    )
    transactions: Mapped[list["Transaction"]] = relationship(
        "Transaction", back_populates="entity", cascade="all, delete-orphan"
    )
