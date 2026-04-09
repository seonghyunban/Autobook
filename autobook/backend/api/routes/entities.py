from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth.deps import AuthContext, get_current_user
from db.connection import get_db
from db.dao.entities import EntityDAO
from db.dao.entity_memberships import EntityMembershipDAO

router = APIRouter(prefix="/api/v1")


class EntityItem(BaseModel):
    id: str
    name: str
    jurisdiction: str
    fiscal_year_end: str


class EntitiesResponse(BaseModel):
    entities: list[EntityItem]


class CreateEntityRequest(BaseModel):
    name: str


def _to_item(e) -> EntityItem:
    return EntityItem(
        id=str(e.id),
        name=e.name,
        jurisdiction=e.jurisdiction,
        fiscal_year_end=e.fiscal_year_end.isoformat(),
    )


@router.get("/entities", response_model=EntitiesResponse)
def list_entities(
    current_user: AuthContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = EntityDAO.list_for_user(db, current_user.user.id)
    return EntitiesResponse(entities=[_to_item(e) for e in rows])


@router.post("/entities", response_model=EntityItem, status_code=status.HTTP_201_CREATED)
def create_entity(
    body: CreateEntityRequest,
    current_user: AuthContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    name = body.name.strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Organization name must not be empty.",
        )
    entity = EntityDAO.create(
        db,
        name=name,
        jurisdiction="CA",
        fiscal_year_end=date(date.today().year, 12, 31),
    )
    EntityMembershipDAO.create(
        db, user_id=current_user.user.id, entity_id=entity.id, role="owner"
    )
    db.commit()
    return _to_item(entity)
