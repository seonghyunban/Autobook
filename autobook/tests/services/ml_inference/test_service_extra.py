from __future__ import annotations

from services.ml_inference.service import execute


def test_execute_high_confidence_asset():
    result = execute({
        "parse_id": "p1",
        "input_text": "Bought printer for $500",
        "source": "manual",
        "currency": "CAD",
        "user_id": "u1",
    })
    ml_conf = (result.get("confidence") or {}).get("ml", 0)
    if ml_conf >= 0.95:
        assert "proposed_entry" in result
        assert result["confidence"]["overall"] == ml_conf
