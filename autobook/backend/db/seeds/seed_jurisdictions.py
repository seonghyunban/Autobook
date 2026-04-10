"""Seed jurisdiction configs from JSON files.

Inserts IFRS and KR configs if they don't already exist.
Does NOT overwrite existing rows — safe to run repeatedly.

Works for both local (docker-compose) and deployed (ECS/Lambda).

Usage:
    python -m db.seeds.seed_jurisdictions
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

from db.connection import SessionLocal
from db.dao.jurisdiction_configs import JurisdictionConfigDAO

logger = logging.getLogger(__name__)

SEEDS_DIR = Path(__file__).parent


def seed() -> None:
    """Load all seed JSON files and insert if not exists."""
    db = SessionLocal()
    try:
        for path in sorted(SEEDS_DIR.glob("*.json")):
            with open(path, encoding="utf-8") as f:
                data = json.load(f)

            jurisdiction = data["jurisdiction"]
            existing = JurisdictionConfigDAO.get(db, jurisdiction)

            if existing is not None:
                logger.info("Jurisdiction %s already exists, skipping", jurisdiction)
                continue

            JurisdictionConfigDAO.upsert(
                db,
                jurisdiction=jurisdiction,
                language_key=data.get("language_key", "en"),
                taxonomy_tree=data["taxonomy_tree"],
                tax_rules=data.get("tax_rules", {}),
                jurisdiction_rules=data.get("jurisdiction_rules", {}),
            )
            logger.info("Seeded jurisdiction %s from %s", jurisdiction, path.name)

        db.commit()
        logger.info("Jurisdiction seed complete")
    except Exception:
        db.rollback()
        logger.exception("Jurisdiction seed failed")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    seed()
