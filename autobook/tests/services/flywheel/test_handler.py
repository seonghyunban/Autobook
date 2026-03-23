from __future__ import annotations

import json
from unittest.mock import patch

from services.flywheel.handler import handler


def test_handler_delegates():
    processed = []
    with patch("services.flywheel.handler.process", side_effect=lambda msg: processed.append(msg)):
        handler(
            {"Records": [{"body": json.dumps({"parse_id": "p1", "input_text": "test"})}]},
            None,
        )
    assert len(processed) == 1
    assert processed[0]["parse_id"] == "p1"
