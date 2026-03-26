from __future__ import annotations

from services.ml_inference.service import execute


def test_execute_enriches():
    result = execute({
        "parse_id": "p1",
        "input_text": "Bought printer for $500",
        "source": "manual",
        "currency": "CAD",
        "user_id": "user-1",
    })
    assert result["intent_label"] is not None
    assert "confidence" in result
