from __future__ import annotations

from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from db.models.entity import Entity
from db.models.entity_membership import EntityMembership


class EntityDAO:
    """Dumb CRUD for entities (the tenant rows)."""

    @staticmethod
    def create(
        db: Session,
        *,
        name: str,
        jurisdiction: str,
        fiscal_year_end: date,
        incorporation_date: date | None = None,
        hst_registration_number: str | None = None,
        business_number: str | None = None,
    ) -> Entity:
        entity = Entity(
            name=name,
            jurisdiction=jurisdiction,
            fiscal_year_end=fiscal_year_end,
            incorporation_date=incorporation_date,
            hst_registration_number=hst_registration_number,
            business_number=business_number,
        )
        db.add(entity)
        db.flush()
        return entity

    @staticmethod
    def get_by_id(db: Session, entity_id: UUID) -> Entity | None:
        return db.get(Entity, entity_id)

    @staticmethod
    def list_for_user(db: Session, user_id: UUID) -> list[Entity]:
        """All entities the given user is a member of."""
        stmt = (
            select(Entity)
            .join(EntityMembership, EntityMembership.entity_id == Entity.id)
            .where(EntityMembership.user_id == user_id)
            .order_by(EntityMembership.joined_at)
        )
        return list(db.execute(stmt).scalars().all())

    @staticmethod
    def update(
        db: Session,
        entity_id: UUID,
        *,
        name: str | None = None,
        jurisdiction: str | None = None,
        fiscal_year_end: date | None = None,
        incorporation_date: date | None = None,
        hst_registration_number: str | None = None,
        business_number: str | None = None,
    ) -> Entity | None:
        entity = db.get(Entity, entity_id)
        if entity is None:
            return None
        if name is not None:
            entity.name = name
        if jurisdiction is not None:
            entity.jurisdiction = jurisdiction
        if fiscal_year_end is not None:
            entity.fiscal_year_end = fiscal_year_end
        if incorporation_date is not None:
            entity.incorporation_date = incorporation_date
        if hst_registration_number is not None:
            entity.hst_registration_number = hst_registration_number
        if business_number is not None:
            entity.business_number = business_number
        db.flush()
        return entity
