from __future__ import annotations

from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from db.models.taxonomy import Taxonomy


class TaxonomyDAO:
    """Dumb read-only CRUD for the global IFRS taxonomy. The table is
    seeded from init.sql with ~96 default categories and never mutated
    at runtime — no ``create`` method.
    """

    @staticmethod
    def list_grouped(db: Session) -> dict[str, list[str]]:
        """Return taxonomy names grouped by account_type."""
        stmt = select(Taxonomy).order_by(Taxonomy.account_type, Taxonomy.name)
        rows = db.execute(stmt).scalars().all()
        grouped: dict[str, list[str]] = defaultdict(list)
        for row in rows:
            grouped[row.account_type].append(row.name)
        return dict(grouped)

    @staticmethod
    def get_by_name_and_type(
        db: Session, name: str, account_type: str
    ) -> Taxonomy | None:
        stmt = select(Taxonomy).where(
            Taxonomy.name == name,
            Taxonomy.account_type == account_type,
        )
        return db.execute(stmt).scalar_one_or_none()
