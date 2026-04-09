from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from db.models.entity_membership import EntityMembership


class EntityMembershipDAO:
    """Dumb CRUD for the user ↔ entity M:N join."""

    @staticmethod
    def create(
        db: Session,
        *,
        user_id: UUID,
        entity_id: UUID,
        role: str,
    ) -> EntityMembership:
        membership = EntityMembership(
            user_id=user_id,
            entity_id=entity_id,
            role=role,
        )
        db.add(membership)
        db.flush()
        return membership

    @staticmethod
    def get(
        db: Session, user_id: UUID, entity_id: UUID
    ) -> EntityMembership | None:
        return db.get(EntityMembership, {"user_id": user_id, "entity_id": entity_id})

    @staticmethod
    def is_member(db: Session, user_id: UUID, entity_id: UUID) -> bool:
        stmt = select(EntityMembership.user_id).where(
            EntityMembership.user_id == user_id,
            EntityMembership.entity_id == entity_id,
        )
        return db.execute(stmt).scalar_one_or_none() is not None

    @staticmethod
    def list_for_user(db: Session, user_id: UUID) -> list[EntityMembership]:
        stmt = (
            select(EntityMembership)
            .where(EntityMembership.user_id == user_id)
            .order_by(EntityMembership.joined_at)
        )
        return list(db.execute(stmt).scalars().all())

    @staticmethod
    def list_for_entity(db: Session, entity_id: UUID) -> list[EntityMembership]:
        stmt = (
            select(EntityMembership)
            .where(EntityMembership.entity_id == entity_id)
            .order_by(EntityMembership.joined_at)
        )
        return list(db.execute(stmt).scalars().all())

    @staticmethod
    def delete(db: Session, user_id: UUID, entity_id: UUID) -> bool:
        membership = EntityMembershipDAO.get(db, user_id, entity_id)
        if membership is None:
            return False
        db.delete(membership)
        db.flush()
        return True
