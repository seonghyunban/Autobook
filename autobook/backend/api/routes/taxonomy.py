from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from auth.deps import AuthContext, get_current_entity, get_current_user
from db.connection import get_db
from db.dao.entities import EntityDAO
from db.dao.jurisdiction_configs import JurisdictionConfigDAO
from db.dao.taxonomy import TaxonomyDAO
from schemas.taxonomy import TaxonomyResponse
from utils.taxonomy import extract_l4_by_category

router = APIRouter(prefix="/api/v1")


@router.get("/taxonomy", response_model=TaxonomyResponse)
async def get_taxonomy(
    db: Session = Depends(get_db),
    current_user: AuthContext = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
):
    """Return taxonomy categories grouped by account type.

    Uses the entity's jurisdiction to load jurisdiction-specific
    L4 categories from jurisdiction_configs. Falls back to the
    old global taxonomy table if no jurisdiction config exists.
    """
    entity = EntityDAO.get_by_id(db, entity_id)
    if entity:
        config = JurisdictionConfigDAO.get_or_default(db, entity.jurisdiction)
        if config:
            grouped = extract_l4_by_category(config.taxonomy_tree, config.language_key)
            return TaxonomyResponse(taxonomy=grouped)

    # Fallback: old flat taxonomy table
    grouped = TaxonomyDAO.list_grouped(db)
    return TaxonomyResponse(taxonomy=grouped)
