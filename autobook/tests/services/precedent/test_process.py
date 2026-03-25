from __future__ import annotations

import services.precedent.process as precedent_process


def test_process_dummy_match(monkeypatch):
    enqueued = []
    monkeypatch.setattr(precedent_process, "enqueue", lambda q, p: enqueued.append((q, p)))
    precedent_process.process({"parse_id": "p1", "input_text": "test"})
    result = enqueued[0][1]
    assert result["precedent_match"]["matched"] is False
    assert result["precedent_match"]["pattern_id"] is None


def test_process_forwards(monkeypatch):
    enqueued = []
    monkeypatch.setattr(precedent_process, "enqueue", lambda q, p: enqueued.append((q, p)))
    precedent_process.process({"parse_id": "p1"})
    assert len(enqueued) == 1
    assert "ml-inference" in enqueued[0][0]
