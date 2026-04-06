from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth.deps import AuthContext, get_current_user
from db.connection import get_db
from db.dao.taxonomy import TaxonomyDAO
from schemas.taxonomy import (
    TaxonomyCreateRequest,
    TaxonomyCreateResponse,
    TaxonomyResponse,
)

router = APIRouter(prefix="/api/v1")


@router.get("/taxonomy", response_model=TaxonomyResponse)
async def get_taxonomy(
    db: Session = Depends(get_db),
    current_user: AuthContext = Depends(get_current_user),
):
    grouped = TaxonomyDAO.list_grouped(db)
    return TaxonomyResponse(taxonomy=grouped)


@router.post("/taxonomy", response_model=TaxonomyCreateResponse, status_code=201)
async def create_taxonomy_entry(
    body: TaxonomyCreateRequest,
    db: Session = Depends(get_db),
    current_user: AuthContext = Depends(get_current_user),
):
    existing = TaxonomyDAO.get_by_name_and_type(db, body.name, body.account_type)
    if existing:
        raise HTTPException(status_code=409, detail="Taxonomy entry already exists")

    entry = TaxonomyDAO.create(db, body.name, body.account_type, current_user.user.id)
    db.commit()
    return TaxonomyCreateResponse(
        id=str(entry.id),
        name=entry.name,
        account_type=entry.account_type,
        is_default=entry.is_default,
    )
