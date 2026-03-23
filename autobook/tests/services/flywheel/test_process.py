from __future__ import annotations

from services.flywheel.process import process


def test_process_runs():
    process({"parse_id": "p1"})
