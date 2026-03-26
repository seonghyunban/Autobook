from __future__ import annotations

from config import get_settings
from services.shared.parse_status import _merge_status


def test_merge_status_adds_auto_post_threshold_to_confidence() -> None:
    payload = _merge_status(
        None,
        {
            "parse_id": "parse-status-1",
            "user_id": "user-1",
            "status": "auto_posted",
            "confidence": {"overall": 0.97, "ml": 0.97},
        },
    )

    assert payload["confidence"]["overall"] == 0.97
    assert payload["confidence"]["ml"] == 0.97
    assert payload["confidence"]["auto_post_threshold"] == get_settings().AUTO_POST_THRESHOLD
