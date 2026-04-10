from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from db.models.base import Base


class JurisdictionConfig(Base):
    """Per-jurisdiction configuration: taxonomy tree + tax rules + jurisdiction rules.

    taxonomy_tree: Full L1→L5 JSONB tree. Classifier reads L4,
    entry drafter reads L5. Contains both EN and localized names.

    tax_rules: JSONB with jurisdiction-specific tax config
    (default_tax_rate, tax_name, always_split, exempt_categories, etc.)
    Injected into tax specialist prompt.

    jurisdiction_rules: JSONB with jurisdiction-specific accounting rules
    (payable classification, current/non-current split, manufacturing costs, etc.)
    Injected into shared prompt for all nodes.
    """

    __tablename__ = "jurisdiction_configs"

    jurisdiction: Mapped[str] = mapped_column(
        String(10), primary_key=True
    )
    language_key: Mapped[str] = mapped_column(
        String(5), nullable=False, server_default="en"
    )
    taxonomy_tree: Mapped[dict] = mapped_column(JSONB, nullable=False)
    tax_rules: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    jurisdiction_rules: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
