from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from db.models.user import User


class UserDAO:
    """Dumb CRUD for users. Tenancy is handled by entities / memberships,
    not here — this table just holds the human identity record.
    """

    @staticmethod
    def create(db: Session, *, email: str, cognito_sub: str) -> User:
        user = User(email=email, cognito_sub=cognito_sub)
        db.add(user)
        db.flush()
        return user

    @staticmethod
    def get_by_id(db: Session, user_id: UUID) -> User | None:
        return db.get(User, user_id)

    @staticmethod
    def get_by_email(db: Session, email: str) -> User | None:
        stmt = select(User).where(User.email == email)
        return db.execute(stmt).scalar_one_or_none()

    @staticmethod
    def get_by_cognito_sub(db: Session, cognito_sub: str) -> User | None:
        stmt = select(User).where(User.cognito_sub == cognito_sub)
        return db.execute(stmt).scalar_one_or_none()
