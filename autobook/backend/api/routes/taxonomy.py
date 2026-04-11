from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from auth.deps import AuthContext, get_current_user
from db.connection import get_db
from db.dao.jurisdiction_configs import JurisdictionConfigDAO
from db.dao.taxonomy import TaxonomyDAO
from schemas.taxonomy import TaxonomyResponse
from utils.taxonomy import extract_l4_by_category

router = APIRouter(prefix="/api/v1")


@router.get("/taxonomy", response_model=TaxonomyResponse)
async def get_taxonomy(
    db: Session = Depends(get_db),
    current_user: AuthContext = Depends(get_current_user),
    jurisdiction: str | None = Query(default=None),
):
    """Return taxonomy categories grouped by account type.

    Accepts optional ?jurisdiction=KR query param to load
    jurisdiction-specific L4 categories. Falls back to the
    old global taxonomy table if no jurisdiction config exists.
    """
    if jurisdiction:
        config = JurisdictionConfigDAO.get_or_default(db, jurisdiction)
        if config:
            grouped = extract_l4_by_category(config.taxonomy_tree, config.language_key)
            return TaxonomyResponse(taxonomy=grouped)

    # Fallback: old flat taxonomy table
    grouped = TaxonomyDAO.list_grouped(db)
    return TaxonomyResponse(taxonomy=grouped)
