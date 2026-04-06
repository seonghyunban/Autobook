from __future__ import annotations

import uuid
from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from db.models.taxonomy import Taxonomy


class TaxonomyDAO:
    @staticmethod
    def list_grouped(db: Session) -> dict[str, list[str]]:
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

    @staticmethod
    def create(
        db: Session, name: str, account_type: str, user_id: uuid.UUID
    ) -> Taxonomy:
        entry = Taxonomy(
            name=name,
            account_type=account_type,
            is_default=False,
            user_id=user_id,
        )
        db.add(entry)
        db.flush()
        return entry
