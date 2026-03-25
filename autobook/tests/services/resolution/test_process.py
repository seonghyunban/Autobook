from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import services.resolution.process as resolution_process


def _setup_resolution(monkeypatch):
    db = SimpleNamespace(commit=lambda: None, rollback=lambda: None, close=lambda: None)
    user = SimpleNamespace(id=uuid4())
    transaction = SimpleNamespace(id=uuid4())
    task = SimpleNamespace(id=uuid4())
    enqueued, published = [], []

    monkeypatch.setattr(resolution_process, "SessionLocal", lambda: db)
    monkeypatch.setattr(resolution_process, "ensure_transaction_for_message", lambda _db, _msg: (user, transaction))
    monkeypatch.setattr(resolution_process.ClarificationDAO, "insert", staticmethod(
        lambda db, user_id, transaction_id, source_text, explanation, confidence, proposed_entry, verdict: task
    ))
    monkeypatch.setattr(resolution_process, "publish_sync", lambda ch, p: published.append((ch, p)))
    monkeypatch.setattr(resolution_process, "enqueue", lambda q, p: enqueued.append((q, p)))

    return {"enqueued": enqueued, "published": published, "task": task}


def test_process_creates_task(monkeypatch):
    ctx = _setup_resolution(monkeypatch)
    resolution_process.process({"parse_id": "p1", "input_text": "unclear", "user_id": "u1"})
    assert len(ctx["enqueued"]) == 0
    assert len(ctx["published"]) == 0


def test_process_routes_resolved(monkeypatch):
    ctx = _setup_resolution(monkeypatch)
    resolution_process.process({"parse_id": "p1", "input_text": "approved", "user_id": "u1", "clarification": {"status": "approved"}})
    assert len(ctx["enqueued"]) == 1
    assert "posting" in ctx["enqueued"][0][0]


def test_process_event_created(monkeypatch):
    ctx = _setup_resolution(monkeypatch)
    resolution_process.process({"parse_id": "p1", "input_text": "unclear", "user_id": "u1"})
    assert len(ctx["published"]) == 0


def test_process_event_resolved(monkeypatch):
    ctx = _setup_resolution(monkeypatch)
    resolution_process.process({"parse_id": "p1", "input_text": "approved", "user_id": "u1", "clarification": {"status": "resolved"}})
    assert ctx["published"][0][0] == "clarification.resolved"
    assert ctx["published"][0][1]["status"] == "resolved"


def test_process_skips_rejected(monkeypatch):
    ctx = _setup_resolution(monkeypatch)
    resolution_process.process({"parse_id": "p1", "input_text": "rejected", "user_id": "u1", "clarification": {"status": "rejected"}})
    assert len(ctx["enqueued"]) == 0
    assert ctx["published"][0][1]["status"] == "rejected"
