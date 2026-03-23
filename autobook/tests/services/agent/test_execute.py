from __future__ import annotations

import services.agent.execute as execute_mod


def test_execute_equipment():
    result = execute_mod._stub_classify({"input_text": "Bought printer for $500", "intent_label": "asset_purchase", "source": "manual"})
    lines = result["proposed_entry"]["lines"]
    assert result["confidence"] == 0.97
    assert lines[0]["account_name"] == "Equipment"
    assert lines[0]["type"] == "debit"
    assert lines[0]["amount"] == 500.0
    assert lines[1]["account_name"] == "Cash"
    assert lines[1]["type"] == "credit"


def test_execute_software():
    result = execute_mod._stub_classify({"input_text": "Paid Slack subscription", "intent_label": "software_subscription", "amount": 39})
    lines = result["proposed_entry"]["lines"]
    assert result["confidence"] == 0.95
    assert lines[0]["account_name"] == "Software & Subscriptions"
    assert lines[0]["amount"] == 39.0


def test_execute_rent():
    result = execute_mod._stub_classify({"input_text": "Monthly rent payment", "intent_label": "rent_expense", "amount": 1800})
    assert result["confidence"] == 0.95
    assert result["proposed_entry"]["lines"][0]["account_name"] == "Rent Expense"


def test_execute_meals():
    result = execute_mod._stub_classify({"input_text": "Team dinner", "intent_label": "meals_entertainment", "amount": 200})
    assert result["confidence"] == 0.9
    assert result["proposed_entry"]["lines"][0]["account_name"] == "Meals & Entertainment"


def test_execute_professional():
    result = execute_mod._stub_classify({"input_text": "Legal consultation", "intent_label": "professional_fees", "amount": 2000})
    assert result["confidence"] == 0.92
    assert result["proposed_entry"]["lines"][0]["account_name"] == "Professional Fees"


def test_execute_bank_fee():
    result = execute_mod._stub_classify({"input_text": "Monthly bank service fee", "intent_label": "bank_fee"})
    assert result["confidence"] == 0.45
    assert result["proposed_entry"]["lines"] == []


def test_process_high_confidence(monkeypatch):
    enqueued, published = [], []
    monkeypatch.setattr(execute_mod, "enqueue", lambda q, p: enqueued.append((q, p)))
    monkeypatch.setattr(execute_mod, "publish_sync", lambda ch, p: published.append((ch, p)))
    execute_mod.process({"parse_id": "p1", "input_text": "Bought printer for $500", "intent_label": "asset_purchase", "source": "manual"})
    assert len(enqueued) == 1
    assert "posting" in enqueued[0][0]
    assert len(published) == 0


def test_process_low_confidence(monkeypatch):
    enqueued, published = [], []
    monkeypatch.setattr(execute_mod, "enqueue", lambda q, p: enqueued.append((q, p)))
    monkeypatch.setattr(execute_mod, "publish_sync", lambda ch, p: published.append((ch, p)))
    execute_mod.process({"parse_id": "p2", "input_text": "Something unclear happened"})
    assert len(enqueued) == 1
    assert "resolution" in enqueued[0][0]


def test_process_threshold_boundary(monkeypatch):
    enqueued, published = [], []
    monkeypatch.setattr(execute_mod, "enqueue", lambda q, p: enqueued.append((q, p)))
    monkeypatch.setattr(execute_mod, "publish_sync", lambda ch, p: published.append((ch, p)))
    execute_mod.process({"parse_id": "p3", "input_text": "Paid Slack subscription", "intent_label": "software_subscription", "amount": 39})
    assert len(enqueued) == 1
    assert "posting" in enqueued[0][0]


def test_process_publishes_event(monkeypatch):
    enqueued, published = [], []
    monkeypatch.setattr(execute_mod, "enqueue", lambda q, p: enqueued.append((q, p)))
    monkeypatch.setattr(execute_mod, "publish_sync", lambda ch, p: published.append((ch, p)))
    execute_mod.process({"parse_id": "p4", "input_text": "Something unclear", "user_id": "user-1"})
    assert published[0][0] == "clarification.created"
    assert published[0][1]["parse_id"] == "p4"


def test_execute_unknown_intent():
    result = execute_mod._stub_classify({"input_text": "Something unclear happened"})
    assert result["confidence"] == 0.45
    assert result["proposed_entry"]["lines"] == []
