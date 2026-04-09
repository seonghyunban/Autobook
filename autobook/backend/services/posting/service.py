"""Posting — write a proposed entry to the append-only ledger.

Not a worker; called directly from `workers/agent.py` when the agent's
decision is PROCEED. Three responsibilities, nothing else:

  1. Call PostedEntryDAO.create_original (the one real DB op)
  2. Commit the transaction
  3. Publish an `entry_posted` event to Redis pub/sub (the frontend SSE
     stream consumes this)

Service-layer validation: `sum(debits) == sum(credits)`. The DB balance
trigger is a backstop, not the primary check.

No batch coordination, no parse-status tracking, no queue-worker glue.
Those concerns belong to the caller (the agent worker).
"""
from __future__ import annotations

import logging
from decimal import Decimal
from uuid import UUID

from db.connection import SessionLocal
from db.dao.posted_entries import PostedEntryDAO
from queues.pubsub import pub

logger = logging.getLogger(__name__)


def post(message: dict) -> dict | None:
    """Post the agent's proposed entry to the ledger.

    Expects `message` to contain:
      - transaction_id: UUID of the Autobook transaction
      - entity_id:      UUID of the owning entity
      - user_id:        UUID of the human who triggered the parse
                        (used as `posted_by` audit FK)
      - proposed_entry: dict with `lines: [...]`, each line carrying
                        `account_code`, `account_name`, `type`
                        ('debit'|'credit'), `amount`, `currency`,
                        `line_order`

    Returns the message enriched with `posted_entry_id`, or None if
    the posting fails validation (unbalanced) or is a no-op.
    """
    proposed_entry = _coerce_proposed_entry(message)
    if proposed_entry is None:
        logger.warning("posting: no proposed_entry in message %s", message.get("parse_id"))
        return None

    lines = list(proposed_entry.get("lines") or [])
    if not lines:
        logger.warning("posting: proposed_entry has no lines for %s", message.get("parse_id"))
        return None

    _validate_balance(lines)

    transaction_id = UUID(str(message["transaction_id"]))
    entity_id = UUID(str(message["entity_id"]))
    posted_by = UUID(str(message["user_id"]))

    db = SessionLocal()
    try:
        posted = PostedEntryDAO.create_original(
            db,
            entity_id=entity_id,
            transaction_id=transaction_id,
            posted_by=posted_by,
            lines=lines,
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    posted_entry_id = str(posted.id)

    pub.entry_posted(
        journal_entry_id=posted_entry_id,  # kept as wire-level field name for now
        parse_id=message.get("parse_id"),
        user_id=str(message["user_id"]),
        input_text=message.get("input_text"),
        confidence=message.get("confidence"),
        explanation=message.get("explanation"),
        proposed_entry=proposed_entry,
    )

    return {
        **message,
        "posted_entry_id": posted_entry_id,
    }


# ── helpers ───────────────────────────────────────────────────────────


def _coerce_proposed_entry(message: dict) -> dict | None:
    """The agent's result may carry the proposed entry in either the
    new `{lines: [...]}` shape or an older wrapped `{entry, lines}`
    shape. Return a dict with at least a `lines` key, or None.
    """
    proposed = message.get("proposed_entry")
    if proposed is None:
        return None
    if "lines" in proposed:
        return proposed
    return {"lines": []}


def _validate_balance(lines: list[dict]) -> None:
    """Enforce sum(debits) == sum(credits) at the service layer before
    handing the lines to the DAO. The DB balance trigger is a backstop.
    """
    debit_total = Decimal("0")
    credit_total = Decimal("0")
    for line in lines:
        amount = Decimal(str(line["amount"]))
        if amount <= 0:
            raise ValueError(f"line amount must be positive: {amount}")
        side = str(line["type"]).lower()
        if side == "debit":
            debit_total += amount
        elif side == "credit":
            credit_total += amount
        else:
            raise ValueError(f"invalid line type: {side!r}")

    if debit_total != credit_total:
        raise ValueError(
            f"posted entry is unbalanced: debits={debit_total} credits={credit_total}"
        )
