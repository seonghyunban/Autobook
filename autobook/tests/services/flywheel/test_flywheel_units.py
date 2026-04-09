"""Unit tests for flywheel sub-modules: pattern_store.

Covers:
- pattern_store.write_pattern: happy path + all skip conditions + _safe_ratio edge cases
"""
from __future__ import annotations

import uuid
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# pattern_store tests
# ---------------------------------------------------------------------------

VALID_MESSAGE = {
    "counterparty": "Apple Inc.",
    "amount": 1000.0,
    "proposed_entry": {
        "lines": [
            {"account_code": "5200", "type": "debit", "amount": 600.0},
            {"account_code": "1000", "type": "credit", "amount": 400.0},
        ]
    },
    "journal_entry_id": str(uuid.uuid4()),
}


class TestWritePattern:
    """Tests for services.flywheel.pattern_store.write_pattern."""

    @patch("services.flywheel.pattern_store.PrecedentDAO")
    @patch("services.flywheel.pattern_store.normalize_vendor", return_value="apple")
    def test_happy_path_calls_insert(self, mock_norm, mock_dao):
        from services.flywheel.pattern_store import write_pattern

        db = MagicMock()
        user_id = uuid.uuid4()
        write_pattern(db, user_id, VALID_MESSAGE)

        mock_dao.insert.assert_called_once()
        kwargs = mock_dao.insert.call_args
        assert kwargs.kwargs["vendor"] == "apple"
        assert kwargs.kwargs["amount"] == Decimal("1000.0")
        assert kwargs.kwargs["db"] is db
        assert kwargs.kwargs["user_id"] is user_id

    @patch("services.flywheel.pattern_store.PrecedentDAO")
    @patch("services.flywheel.pattern_store.normalize_vendor", return_value="apple")
    def test_happy_path_structure_and_ratio(self, mock_norm, mock_dao):
        from services.flywheel.pattern_store import write_pattern

        db = MagicMock()
        write_pattern(db, uuid.uuid4(), VALID_MESSAGE)

        kwargs = mock_dao.insert.call_args.kwargs
        structure = kwargs["structure"]
        ratio = kwargs["ratio"]

        assert len(structure["lines"]) == 2
        assert structure["lines"][0]["account_code"] == "5200"
        assert structure["lines"][0]["side"] == "debit"

        # ratio = line_amount / total_amount
        assert ratio["lines"][0]["ratio"] == round(600.0 / 1000.0, 6)
        assert ratio["lines"][1]["ratio"] == round(400.0 / 1000.0, 6)

    @patch("services.flywheel.pattern_store.PrecedentDAO")
    @patch("services.flywheel.pattern_store.normalize_vendor", return_value="")
    def test_skip_no_vendor(self, mock_norm, mock_dao):
        from services.flywheel.pattern_store import write_pattern

        write_pattern(MagicMock(), uuid.uuid4(), {"counterparty": ""})
        mock_dao.insert.assert_not_called()

    @patch("services.flywheel.pattern_store.PrecedentDAO")
    @patch("services.flywheel.pattern_store.normalize_vendor", return_value="apple")
    def test_skip_no_amount(self, mock_norm, mock_dao):
        from services.flywheel.pattern_store import write_pattern

        msg = {**VALID_MESSAGE, "amount": None}
        write_pattern(MagicMock(), uuid.uuid4(), msg)
        mock_dao.insert.assert_not_called()

    @patch("services.flywheel.pattern_store.PrecedentDAO")
    @patch("services.flywheel.pattern_store.normalize_vendor", return_value="apple")
    def test_skip_zero_amount(self, mock_norm, mock_dao):
        from services.flywheel.pattern_store import write_pattern

        msg = {**VALID_MESSAGE, "amount": 0}
        write_pattern(MagicMock(), uuid.uuid4(), msg)
        mock_dao.insert.assert_not_called()

    @patch("services.flywheel.pattern_store.PrecedentDAO")
    @patch("services.flywheel.pattern_store.normalize_vendor", return_value="apple")
    def test_skip_no_proposed_entry(self, mock_norm, mock_dao):
        from services.flywheel.pattern_store import write_pattern

        msg = {"counterparty": "Apple", "amount": 100.0}
        write_pattern(MagicMock(), uuid.uuid4(), msg)
        mock_dao.insert.assert_not_called()

    @patch("services.flywheel.pattern_store.PrecedentDAO")
    @patch("services.flywheel.pattern_store.normalize_vendor", return_value="apple")
    def test_skip_empty_lines(self, mock_norm, mock_dao):
        from services.flywheel.pattern_store import write_pattern

        msg = {
            "counterparty": "Apple",
            "amount": 100.0,
            "proposed_entry": {"lines": []},
        }
        write_pattern(MagicMock(), uuid.uuid4(), msg)
        mock_dao.insert.assert_not_called()

    @patch("services.flywheel.pattern_store.PrecedentDAO")
    @patch("services.flywheel.pattern_store.normalize_vendor", return_value="apple")
    def test_vendor_field_fallback(self, mock_norm, mock_dao):
        """Falls back to 'vendor' key when 'counterparty' is absent."""
        from services.flywheel.pattern_store import write_pattern

        msg = {
            "vendor": "Google LLC",
            "amount": 500.0,
            "proposed_entry": {
                "lines": [
                    {"account_code": "5100", "type": "debit", "amount": 500.0},
                    {"account_code": "1000", "type": "credit", "amount": 500.0},
                ]
            },
        }
        write_pattern(MagicMock(), uuid.uuid4(), msg)
        # normalize_vendor should have been called with 'Google LLC'
        mock_norm.assert_called_once_with("Google LLC")
        mock_dao.insert.assert_called_once()


class TestSafeRatio:
    """Tests for pattern_store._safe_ratio edge cases."""

    def test_normal_ratio(self):
        from services.flywheel.pattern_store import _safe_ratio

        line = {"amount": 250.0}
        assert _safe_ratio(line, 1000.0) == 0.25

    def test_zero_division(self):
        from services.flywheel.pattern_store import _safe_ratio

        line = {"amount": 100.0}
        assert _safe_ratio(line, 0) == 0.0

    def test_missing_amount_in_line(self):
        from services.flywheel.pattern_store import _safe_ratio

        line = {}
        assert _safe_ratio(line, 500.0) == 0.0

    def test_none_total_amount(self):
        from services.flywheel.pattern_store import _safe_ratio

        line = {"amount": 100.0}
        assert _safe_ratio(line, None) == 0.0

    def test_string_amounts(self):
        from services.flywheel.pattern_store import _safe_ratio

        line = {"amount": "300"}
        assert _safe_ratio(line, "1000") == 0.3

    def test_non_numeric_string(self):
        from services.flywheel.pattern_store import _safe_ratio

        line = {"amount": "abc"}
        assert _safe_ratio(line, 1000) == 0.0
