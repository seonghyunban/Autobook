from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db.models.base import Base

if TYPE_CHECKING:
    from db.models.entity_membership import EntityMembership


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.uuidv7()
    )
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    username: Mapped[str | None] = mapped_column(String(100))
    cognito_sub: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_authenticated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # ── relationships ──────────────────────────────────────────
    memberships: Mapped[list["EntityMembership"]] = relationship(
        "EntityMembership", back_populates="user", cascade="all, delete-orphan"
    )
