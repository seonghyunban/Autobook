from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from db.models.jurisdiction_config import JurisdictionConfig

DEFAULT_JURISDICTION = "IFRS"


class JurisdictionConfigDAO:
    """CRUD + cached access for jurisdiction configs."""

    @staticmethod
    def get(db: Session, jurisdiction: str) -> JurisdictionConfig | None:
        return db.get(JurisdictionConfig, jurisdiction)

    @staticmethod
    def get_or_default(db: Session, jurisdiction: str) -> JurisdictionConfig | None:
        """Get config for jurisdiction, falling back to IFRS default."""
        config = db.get(JurisdictionConfig, jurisdiction)
        if config is None and jurisdiction != DEFAULT_JURISDICTION:
            config = db.get(JurisdictionConfig, DEFAULT_JURISDICTION)
        return config

    @staticmethod
    def upsert(
        db: Session,
        *,
        jurisdiction: str,
        language_key: str = "en",
        taxonomy_tree: dict | None = None,
        tax_rules: dict | None = None,
        jurisdiction_rules: dict | None = None,
    ) -> JurisdictionConfig:
        """Insert or update a jurisdiction config."""
        config = db.get(JurisdictionConfig, jurisdiction)
        if config is None:
            config = JurisdictionConfig(
                jurisdiction=jurisdiction,
                language_key=language_key,
                taxonomy_tree=taxonomy_tree or {},
                tax_rules=tax_rules or {},
                jurisdiction_rules=jurisdiction_rules or {},
            )
            db.add(config)
        else:
            if taxonomy_tree is not None:
                config.taxonomy_tree = taxonomy_tree
            if tax_rules is not None:
                config.tax_rules = tax_rules
            if jurisdiction_rules is not None:
                config.jurisdiction_rules = jurisdiction_rules
        db.flush()
        return config

    @staticmethod
    def list_all(db: Session) -> list[JurisdictionConfig]:
        stmt = select(JurisdictionConfig).order_by(JurisdictionConfig.jurisdiction)
        return list(db.execute(stmt).scalars().all())

    @staticmethod
    def delete(db: Session, jurisdiction: str) -> bool:
        config = db.get(JurisdictionConfig, jurisdiction)
        if config is None:
            return False
        db.delete(config)
        db.flush()
        return True
