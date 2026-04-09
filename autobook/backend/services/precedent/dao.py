"""Data access for precedent_entries table.

Read-heavy: the matcher queries by vendor + time window.
Write: only the flywheel after human approval.
Invalidate: on CoA/tax structure changes.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from db.models.precedent_entry import PrecedentEntry
from services.precedent.models import compute_structure_hash


class PrecedentDAO:
    @staticmethod
    def get_by_vendor(
        db: Session,
        entity_id: UUID,
        vendor: str,
        time_window_days: int = 365,
    ) -> list[PrecedentEntry]:
        cutoff = datetime.now(timezone.utc) - timedelta(days=time_window_days)
        stmt = (
            select(PrecedentEntry)
            .where(
                PrecedentEntry.entity_id == entity_id,
                PrecedentEntry.vendor == vendor,
                PrecedentEntry.created_at >= cutoff,
            )
            .order_by(PrecedentEntry.created_at.desc())
        )
        return list(db.execute(stmt).scalars().all())

    @staticmethod
    def create(
        db: Session,
        *,
        entity_id: UUID,
        vendor: str,
        amount: Decimal,
        structure: dict,
        ratio: dict,
        source_posted_entry_id: UUID | None = None,
    ) -> PrecedentEntry:
        entry = PrecedentEntry(
            entity_id=entity_id,
            vendor=vendor,
            amount=amount,
            structure_hash=compute_structure_hash(structure),
            structure=structure,
            ratio=ratio,
            source_posted_entry_id=source_posted_entry_id,
        )
        db.add(entry)
        db.flush()
        return entry

    @staticmethod
    def invalidate_by_accounts(
        db: Session,
        entity_id: UUID,
        account_codes: list[str],
    ) -> int:
        """Delete precedent entries whose structure references any of the
        given account codes.
        """
        entries = db.execute(
            select(PrecedentEntry).where(PrecedentEntry.entity_id == entity_id)
        ).scalars().all()

        deleted = 0
        for entry in entries:
            entry_codes = {
                line["account_code"] for line in entry.structure.get("lines", [])
            }
            if entry_codes & set(account_codes):
                db.delete(entry)
                deleted += 1
        db.flush()
        return deleted
