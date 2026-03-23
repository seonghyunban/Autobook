from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest
import services.posting.process as posting_process


def _setup(monkeypatch):
    db = SimpleNamespace(commit=lambda: None, rollback=lambda: None, close=lambda: None)
    user = SimpleNamespace(id=uuid4())
    transaction = SimpleNamespace(id=uuid4())
    journal_entry = SimpleNamespace(id=uuid4())
    enqueued, published, inserted = [], [], {}

    monkeypatch.setattr(posting_process, "SessionLocal", lambda: db)
    monkeypatch.setattr(posting_process, "ensure_transaction_for_message", lambda _db, _msg: (user, transaction))

    def fake_insert(_db, user_id, entry_payload, line_payload):
        inserted["user_id"] = user_id
        inserted["entry"] = entry_payload
        inserted["lines"] = line_payload
        return journal_entry

    monkeypatch.setattr(posting_process.JournalEntryDAO, "insert_with_lines", staticmethod(fake_insert))
    monkeypatch.setattr(posting_process, "publish_sync", lambda ch, p: published.append((ch, p)))
    monkeypatch.setattr(posting_process, "enqueue", lambda q, p: enqueued.append((q, p)))

    return {"user": user, "transaction": transaction, "journal_entry": journal_entry,
            "enqueued": enqueued, "published": published, "inserted": inserted}


MSG = {
    "parse_id": "p1", "input_text": "Bought printer for $500", "user_id": "user-1",
    "proposed_entry": {
        "entry": {"date": "2026-03-23", "description": "Bought printer"},
        "lines": [
            {"account_code": "1500", "type": "debit", "amount": 500},
            {"account_code": "1000", "type": "credit", "amount": 500},
        ],
    },
}


def test_process_inserts_entry(monkeypatch):
    ctx = _setup(monkeypatch)
    posting_process.process(MSG)
    assert ctx["inserted"]["user_id"] == ctx["user"].id
    assert len(ctx["inserted"]["lines"]) == 2


def test_process_publishes_event(monkeypatch):
    ctx = _setup(monkeypatch)
    posting_process.process(MSG)
    assert ctx["published"][0][0] == "entry.posted"
    assert ctx["published"][0][1]["journal_entry_id"] == str(ctx["journal_entry"].id)


def test_process_forwards_flywheel(monkeypatch):
    ctx = _setup(monkeypatch)
    posting_process.process(MSG)
    assert "flywheel" in ctx["enqueued"][0][0]
    assert ctx["enqueued"][0][1]["journal_entry_id"] == str(ctx["journal_entry"].id)


def test_process_with_parse_time(monkeypatch):
    from datetime import datetime, timezone
    ctx = _setup(monkeypatch)
    message = {**MSG, "submitted_at": datetime.now(timezone.utc).isoformat()}
    posting_process.process(message)
    assert ctx["published"][0][1]["parse_time_ms"] is not None


def test_process_no_proposed_entry(monkeypatch):
    ctx = _setup(monkeypatch)
    with pytest.raises(ValueError, match="proposed entry"):
        posting_process.process({**MSG, "proposed_entry": None})


def test_process_normalizes_entry(monkeypatch):
    ctx = _setup(monkeypatch)
    message = {**MSG, "proposed_entry": {"lines": [{"account_code": "1500", "type": "debit", "amount": 500}]}}
    posting_process.process(message)
    assert ctx["inserted"]["entry"]["description"] == "Bought printer for $500"
    assert ctx["inserted"]["entry"]["origin_tier"] == 3
