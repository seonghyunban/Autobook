from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from auth.deps import AuthContext, get_current_user
from db.connection import get_db
from db.dao.taxonomy import TaxonomyDAO
from schemas.taxonomy import TaxonomyResponse

router = APIRouter(prefix="/api/v1")


@router.get("/taxonomy", response_model=TaxonomyResponse)
async def get_taxonomy(
    db: Session = Depends(get_db),
    current_user: AuthContext = Depends(get_current_user),
):
    """Return the global IFRS taxonomy grouped by account_type.

    Taxonomy is seeded by init.sql and is read-only at runtime — there
    is no POST endpoint. Users cannot create custom taxonomy entries
    after the refactor; if per-entity overrides are needed later, a
    separate ``entity_taxonomy_overrides`` table will be added rather
    than muddying the global taxonomy table.
    """
    grouped = TaxonomyDAO.list_grouped(db)
    return TaxonomyResponse(taxonomy=grouped)
