from __future__ import annotations

from common.ids import stable_txn_id


def test_stable_txn_id_is_deterministic() -> None:
    first = stable_txn_id("bank_csv", "2026-03-17", "15.00", "Coffee")
    second = stable_txn_id("bank_csv", "2026-03-17", "15.00", "Coffee")
    assert first == second


def test_stable_txn_id_ignores_none_and_trims_whitespace() -> None:
    compact = stable_txn_id("bank_csv", "2026-03-17", "15.00", "Coffee")
    padded = stable_txn_id(" bank_csv ", "2026-03-17", "15.00", " Coffee ", None)
    assert compact == padded
