from __future__ import annotations

import runpy
import sys
import warnings

import pandas as pd
import pytest

from common.ids import stable_txn_id
from jobs.normalize_transactions.job import (
    build_canonical_records,
    clean_transactions_dataframe,
    deduplicate_records,
    normalize_columns,
    normalize_text,
    run,
    validate_required_columns,
)

def test_normalize_text_collapses_whitespace() -> None:
    assert normalize_text("  Paid   contractor   invoice  ") == "Paid contractor invoice"


def test_normalize_text_handles_none_as_empty_string() -> None:
    assert normalize_text(None) == ""


def test_normalize_columns_lowercases_and_trims_headers() -> None:
    raw = pd.DataFrame(columns=[" Date ", "Description", "AMOUNT "])
    normalized = normalize_columns(raw)
    assert list(normalized.columns) == ["date", "description", "amount"]


def test_validate_required_columns_raises_for_missing_schema() -> None:
    with pytest.raises(ValueError, match="Missing required columns"):
        validate_required_columns(pd.DataFrame(columns=["date", "description"]))


def test_clean_transactions_dataframe_drops_invalid_amount_rows() -> None:
    raw = pd.DataFrame(
        [
          {"date": "2026-03-17", "description": "Good row", "amount": "10.00"},
          {"date": "2026-03-17", "description": "Bad amount", "amount": "oops"},
        ]
    )

    cleaned = clean_transactions_dataframe(raw)
    assert cleaned["description"].tolist() == ["Good row"]


def test_clean_transactions_dataframe_drops_invalid_date_rows() -> None:
    raw = pd.DataFrame(
        [
          {"date": "2026-03-17", "description": "Good row", "amount": "10.00"},
          {"date": "not-a-date", "description": "Bad date", "amount": "15.00"},
        ]
    )

    cleaned = clean_transactions_dataframe(raw)
    assert cleaned["description"].tolist() == ["Good row"]


def test_clean_transactions_dataframe_drops_blank_descriptions() -> None:
    raw = pd.DataFrame(
        [
          {"date": "2026-03-17", "description": "   ", "amount": "10.00"},
          {"date": "2026-03-17", "description": "Coffee beans", "amount": "15.00"},
        ]
    )

    cleaned = clean_transactions_dataframe(raw)
    assert cleaned["description"].tolist() == ["Coffee beans"]


def test_build_canonical_records_sets_metadata_and_normalized_description() -> None:
    raw = pd.DataFrame(
        [{"date": "2026-03-17", "description": "Paid Contractor", "amount": "600.00"}]
    )
    cleaned = clean_transactions_dataframe(raw)

    records = build_canonical_records(cleaned, source_system="manual_csv", currency="USD")

    assert records[0]["normalized_description"] == "paid contractor"
    assert records[0]["source_system"] == "manual_csv"
    assert records[0]["currency"] == "USD"


def test_build_canonical_records_uses_stable_transaction_ids() -> None:
    raw = pd.DataFrame(
        [{"date": "2026-03-17", "description": "Paid Contractor", "amount": "600.00"}]
    )
    cleaned = clean_transactions_dataframe(raw)

    records = build_canonical_records(cleaned, source_system="manual_csv", currency="CAD")

    expected_id = stable_txn_id("manual_csv", "2026-03-17", "600.00", "Paid Contractor")
    assert records[0]["transaction_id"] == expected_id
    assert len(records[0]["transaction_id"]) == 24


def test_deduplicate_records_keeps_first_duplicate() -> None:
    duplicate_id = "same-id"
    records = [
        {"transaction_id": duplicate_id, "raw_description": "First"},
        {"transaction_id": duplicate_id, "raw_description": "Second"},
    ]

    deduped = deduplicate_records(records)
    assert len(deduped) == 1
    assert deduped.iloc[0]["raw_description"] == "First"


def test_deduplicate_records_returns_empty_dataframe_for_empty_input() -> None:
    deduped = deduplicate_records([])
    assert deduped.empty


def test_run_writes_parquet_and_prints_summary(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    raw_df = pd.DataFrame(
        [{"date": "2026-03-17", "description": "Bought laptop", "amount": "2400.00"}]
    )
    captured: dict[str, object] = {}

    monkeypatch.setattr(pd, "read_csv", lambda _: raw_df)

    def fake_to_parquet(self: pd.DataFrame, path: str, index: bool = False) -> None:
        captured["path"] = path
        captured["index"] = index
        captured["frame"] = self.copy()

    monkeypatch.setattr(pd.DataFrame, "to_parquet", fake_to_parquet)

    run("input.csv", "output.parquet", source_system="bank_csv", currency="CAD")

    written = captured["frame"]
    assert isinstance(written, pd.DataFrame)
    assert len(written) == 1
    assert written.iloc[0]["raw_description"] == "Bought laptop"
    assert captured["path"] == "output.parquet"
    assert "[normalize] wrote 1 records" in capsys.readouterr().out


def test_run_accepts_case_insensitive_headers(monkeypatch: pytest.MonkeyPatch) -> None:
    raw_df = pd.DataFrame(
        [{" Date ": "2026-03-17", "Description": "Software", "AMOUNT": "89.00"}]
    )
    captured: dict[str, object] = {}

    monkeypatch.setattr(pd, "read_csv", lambda _: raw_df)

    def fake_to_parquet(self: pd.DataFrame, path: str, index: bool = False) -> None:
        captured["frame"] = self.copy()

    monkeypatch.setattr(pd.DataFrame, "to_parquet", fake_to_parquet)

    run("input.csv", "output.parquet", source_system="card_csv", currency="CAD")

    written = captured["frame"]
    assert isinstance(written, pd.DataFrame)
    assert written.iloc[0]["normalized_description"] == "software"


def test_run_raises_for_missing_required_columns(monkeypatch: pytest.MonkeyPatch) -> None:
    raw_df = pd.DataFrame([{"date": "2026-03-17", "amount": "10.00"}])
    monkeypatch.setattr(pd, "read_csv", lambda _: raw_df)

    with pytest.raises(ValueError, match="Missing required columns"):
        run("input.csv", "output.parquet", source_system="bank_csv", currency="CAD")


def test_run_deduplicates_duplicate_rows_by_stable_transaction_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    raw_df = pd.DataFrame(
        [
            {"date": "2026-03-17", "description": "Bought laptop", "amount": "2400.00"},
            {"date": "2026-03-17", "description": "Bought laptop", "amount": "2400.00"},
        ]
    )
    captured: dict[str, object] = {}

    monkeypatch.setattr(pd, "read_csv", lambda _: raw_df)

    def fake_to_parquet(self: pd.DataFrame, path: str, index: bool = False) -> None:
        captured["frame"] = self.copy()

    monkeypatch.setattr(pd.DataFrame, "to_parquet", fake_to_parquet)

    run("input.csv", "output.parquet", source_system="bank_csv", currency="CAD")

    written = captured["frame"]
    assert isinstance(written, pd.DataFrame)
    assert len(written) == 1


def test_module_main_guard_executes_main(monkeypatch: pytest.MonkeyPatch) -> None:
    raw_df = pd.DataFrame(
        [{"date": "2026-03-17", "description": "Bought laptop", "amount": "2400.00"}]
    )
    captured: dict[str, object] = {}

    monkeypatch.setattr(pd, "read_csv", lambda _: raw_df)

    def fake_to_parquet(self: pd.DataFrame, path: str, index: bool = False) -> None:
        captured["path"] = path
        captured["frame"] = self.copy()

    monkeypatch.setattr(pd.DataFrame, "to_parquet", fake_to_parquet)
    monkeypatch.setattr(
        sys,
        "argv",
        ["job.py", "--input", "input.csv", "--output", "output.parquet", "--source-system", "bank_csv"],
    )

    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        runpy.run_module("jobs.normalize_transactions.job", run_name="__main__")

    written = captured["frame"]
    assert isinstance(written, pd.DataFrame)
    assert captured["path"] == "output.parquet"
