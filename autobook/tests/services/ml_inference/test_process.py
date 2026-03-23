from __future__ import annotations

import services.ml_inference.process as ml_process


def test_process_enriches(monkeypatch):
    enqueued = []
    monkeypatch.setattr(ml_process, "enqueue", lambda q, p: enqueued.append((q, p)))
    ml_process.process({"parse_id": "p1", "input_text": "Bought printer for $500", "source": "manual", "currency": "CAD", "user_id": "user-1"})
    assert len(enqueued) == 1
    assert "agent" in enqueued[0][0]
    assert enqueued[0][1]["intent_label"] is not None
