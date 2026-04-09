from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from db.models.posted_entry_line import PostedEntryLine


class PostedEntryLineDAO:
    """Dumb read-only DAO for ledger lines. There is NO public `create`
    method here — posted entry lines are only created via
    `PostedEntryDAO.create_original` and `PostedEntryDAO.create_reversal`,
    which create the header and its lines atomically and enforce the
    append-only invariant.
    """

    @staticmethod
    def list_by_posted_entry(
        db: Session, posted_entry_id: UUID
    ) -> list[PostedEntryLine]:
        stmt = (
            select(PostedEntryLine)
            .where(PostedEntryLine.posted_entry_id == posted_entry_id)
            .order_by(PostedEntryLine.line_order)
        )
        return list(db.execute(stmt).scalars().all())
