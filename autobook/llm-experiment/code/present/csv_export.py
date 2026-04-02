"""Export a single test case result as a comparison CSV.

Usage:
    cd llm-experiment
    DATABASE_URL=sqlite:///:memory: PYTHONPATH=../backend:code/run:test_cases:. \
    /opt/anaconda3/bin/uv run --extra agent python code/present/csv_export.py \
        --experiment v4-dualtrack-8 --variant baseline_v4_dualtrack \
        --test-case int_26a_payroll_recognition
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from io import StringIO
from pathlib import Path

DEBIT_SLOTS = ["asset_increase", "expense_increase",
               "liability_decrease", "equity_decrease", "revenue_decrease"]
CREDIT_SLOTS = ["liability_increase", "equity_increase", "revenue_increase",
                "asset_decrease", "expense_decrease"]

_SLOT_KEYWORDS = {
    "asset_increase": ["cash", "receivable", "inventor", "land", "building", "equipment",
                       "vehicle", "prepaid", "wip", "work in process", "tax asset", "hst",
                       "vat", "deposit", "investment", "machinery", "right-of-use"],
    "expense_increase": ["expense", "cost of", "loss", "depreciation", "amortisation",
                         "impairment", "casualty", "penalty", "fine", "warranty expense"],
    "liability_decrease": ["payable", "provision", "borrowing", "loan", "withholding", "dividend"],
    "equity_decrease": ["capital", "share", "retained", "treasury", "reserve", "premium"],
    "revenue_decrease": ["revenue", "income", "gain", "sales"],
    "liability_increase": ["payable", "provision", "borrowing", "loan", "withholding",
                           "deposit received", "deferred", "contract", "dividend", "tax liab"],
    "equity_increase": ["capital", "share", "premium", "retained", "reserve", "treasury"],
    "revenue_increase": ["revenue", "income", "gain", "sales"],
    "asset_decrease": ["cash", "receivable", "inventor", "land", "building", "equipment",
                       "vehicle", "investment", "deposit"],
    "expense_decrease": ["expense", "cost"],
}


# ── Step 1: Extract ─────────────────────────────────────────────────────

def load_test_case(test_case_id: str):
    from test_cases_basic import TEST_CASES as BASIC
    from test_cases_intermediate import INTERMEDIATE_TEST_CASES
    from test_cases_hard import HARD_TEST_CASES
    from test_cases_intermediate_from_hard import INTERMEDIATE_FROM_HARD_TEST_CASES
    for tc in BASIC + INTERMEDIATE_TEST_CASES + HARD_TEST_CASES + INTERMEDIATE_FROM_HARD_TEST_CASES:
        if tc.id == test_case_id:
            return tc
    return None


def load_result(experiment: str, variant: str, test_case_id: str) -> dict:
    path = Path(f"results/{experiment}/{variant}/{test_case_id}.json")
    return json.loads(path.read_text())


# ── Step 2: Build meta ──────────────────────────────────────────────────

def build_meta(tc, result: dict) -> dict:
    return {
        "test_case_id": tc.id,
        "tier": tc.tier,
        "transaction_text": tc.transaction_text,
        "actual_cost_usd": f"{result.get('actual_cost_usd', 0):.4f}",
        "total_latency_s": f"{result.get('total_latency_ms', 0) / 1000:.1f}",
    }


# ── Step 3: Build expected table ────────────────────────────────────────

def _guess_slot(account_name: str, slots: list[str], remaining: dict) -> str:
    name_lower = account_name.lower()
    for slot in slots:
        if remaining.get(slot, 0) <= 0:
            continue
        for kw in _SLOT_KEYWORDS.get(slot, []):
            if kw in name_lower:
                return slot
    for slot in slots:
        if remaining.get(slot, 0) > 0:
            return slot
    return ""


def build_expected_table(tc) -> tuple[list[dict], list[dict]]:
    """Returns (debit_rows, credit_rows) each as list of {relationship, account, amount}."""
    entry = tc.expected_entry
    if not entry or not entry.get("lines"):
        return [], []

    debit_lines = [l for l in entry["lines"] if l["type"] == "debit"]
    credit_lines = [l for l in entry["lines"] if l["type"] == "credit"]

    # Assign slots
    remaining = {DEBIT_SLOTS[i]: (tc.expected_debit_tuple[i] if i < len(tc.expected_debit_tuple) else 0)
                 for i in range(len(DEBIT_SLOTS))}
    debit_rows = []
    for line in debit_lines:
        slot = _guess_slot(line["account_name"], DEBIT_SLOTS, remaining)
        if slot:
            remaining[slot] -= 1
        debit_rows.append({"relationship": slot, "account": line["account_name"], "amount": line["amount"]})

    remaining = {CREDIT_SLOTS[i]: (tc.expected_credit_tuple[i] if i < len(tc.expected_credit_tuple) else 0)
                 for i in range(len(CREDIT_SLOTS))}
    credit_rows = []
    for line in credit_lines:
        slot = _guess_slot(line["account_name"], CREDIT_SLOTS, remaining)
        if slot:
            remaining[slot] -= 1
        credit_rows.append({"relationship": slot, "account": line["account_name"], "amount": line["amount"]})

    debit_rows.sort(key=lambda r: r["amount"], reverse=True)
    credit_rows.sort(key=lambda r: r["amount"], reverse=True)

    return debit_rows, credit_rows


# ── Step 4: Build actual table ──────────────────────────────────────────

def build_actual_table(result_data: dict) -> tuple[list[dict], list[dict]]:
    """Returns (debit_rows, credit_rows) each as list of {relationship, category, count, account, amount}.

    One row per classifier detection (not expanded by count).
    Entry lines matched by name similarity.
    """
    ps = result_data.get("pipeline_state", {})
    je = result_data.get("journal_entry")

    if not je or not je.get("lines"):
        return [], []

    debit_lines = sorted([l for l in je["lines"] if l["type"] == "debit"],
                         key=lambda l: l["amount"], reverse=True)
    credit_lines = sorted([l for l in je["lines"] if l["type"] == "credit"],
                          key=lambda l: l["amount"], reverse=True)

    # Get detections (one per detection, NOT expanded by count)
    debit_dets = _get_detections(ps, "output_debit_classifier", DEBIT_SLOTS)
    credit_dets = _get_detections(ps, "output_credit_classifier", CREDIT_SLOTS)

    # Match detections to entry lines
    debit_rows = _match_detections_to_lines(debit_dets, debit_lines)
    credit_rows = _match_detections_to_lines(credit_dets, credit_lines)

    debit_rows.sort(key=lambda r: float(r["amount"]) if r.get("amount") not in ("", None) else 0, reverse=True)
    credit_rows.sort(key=lambda r: float(r["amount"]) if r.get("amount") not in ("", None) else 0, reverse=True)

    return debit_rows, credit_rows


def _get_detections(ps: dict, key: str, slots: list[str]) -> list[dict]:
    """One row per detection, keeping original count."""
    output = (ps.get(key) or [None])[-1] or {}
    dets = []
    for slot in slots:
        for det in output.get(slot, []):
            dets.append({
                "slot": slot,
                "category": det.get("category", ""),
                "count": det.get("count", 1),
            })
    return dets


def _match_detections_to_lines(dets: list[dict], lines: list[dict]) -> list[dict]:
    """Match each detection to entry lines by name similarity.

    For count > 1, consume multiple entry lines for that detection.
    """
    available = list(range(len(lines)))
    result = []

    for det in dets:
        cat_lower = det["category"].lower()
        count = det["count"]
        matched_lines = []

        for _ in range(count):
            best_idx = None
            best_score = -1
            for idx in available:
                acct_lower = lines[idx]["account_name"].lower()
                score = sum(1 for w in cat_lower.split() if len(w) > 2 and w in acct_lower)
                score += sum(1 for w in acct_lower.split() if len(w) > 2 and w in cat_lower)
                if score > best_score:
                    best_score = score
                    best_idx = idx
            if best_idx is not None and best_score > 0:
                available.remove(best_idx)
                matched_lines.append(lines[best_idx])

        if matched_lines:
            # Multiple matched lines → multiple rows sharing the detection info
            for i, ml in enumerate(matched_lines):
                result.append({
                    "slot": det["slot"] if i == 0 else "",
                    "category": det["category"] if i == 0 else "",
                    "count": count if i == 0 else "",
                    "account": ml["account_name"],
                    "amount": ml["amount"],
                })
        else:
            # No match — phantom detection
            result.append({
                "slot": det["slot"],
                "category": det["category"],
                "count": count,
                "account": "",
                "amount": "",
            })

    # Unmatched entry lines
    for idx in available:
        result.append({
            "slot": "?",
            "category": "?",
            "count": "",
            "account": lines[idx]["account_name"],
            "amount": lines[idx]["amount"],
        })

    return result


# ── Step 5: Align and output ────────────────────────────────────────────

def fmt(val) -> str:
    if val == "" or val is None:
        return ""
    if isinstance(val, (int, float)):
        return f"{float(val):,.2f}"
    return str(val)


def generate_csv(test_case_id: str, experiment: str, variant: str) -> str:
    result_data = load_result(experiment, variant, test_case_id)
    tc = load_test_case(test_case_id)
    if not tc:
        print(f"Error: test case {test_case_id} not found", file=sys.stderr)
        sys.exit(1)
    meta = build_meta(tc, result_data)

    exp_debits, exp_credits = build_expected_table(tc)
    act_debits, act_credits = build_actual_table(result_data)

    # Align debit rows
    max_debit = max(len(exp_debits), len(act_debits), 1)
    # Align credit rows
    max_credit = max(len(exp_credits), len(act_credits), 1)

    output = StringIO()
    writer = csv.writer(output)

    # Header
    writer.writerow([
        "test_case_id", "tier", "transaction_text", "actual_cost_usd", "total_latency_s",
        "exp_relationship", "exp_account", "exp_debit", "exp_credit",
        "act_account", "act_debit", "act_credit", "act_relationship", "act_category", "act_count",
    ])

    empty_meta = [""] * 5
    row_num = 0

    # Debit rows
    for i in range(max_debit):
        exp = exp_debits[i] if i < len(exp_debits) else None
        act = act_debits[i] if i < len(act_debits) else None

        row = (
            [meta["test_case_id"], meta["tier"], meta["transaction_text"],
             meta["actual_cost_usd"], meta["total_latency_s"]] if row_num == 0 else empty_meta
        ) + [
            exp["relationship"] if exp else "",
            exp["account"] if exp else "",
            fmt(exp["amount"]) if exp else "",
            "",
            act["account"] if act else "",
            fmt(act["amount"]) if act else "",
            "",
            act["slot"] if act else "",
            act["category"] if act else "",
            act["count"] if act else "",
        ]
        writer.writerow(row)
        row_num += 1

    # Credit rows
    for i in range(max_credit):
        exp = exp_credits[i] if i < len(exp_credits) else None
        act = act_credits[i] if i < len(act_credits) else None

        row = empty_meta + [
            exp["relationship"] if exp else "",
            exp["account"] if exp else "",
            "",
            fmt(exp["amount"]) if exp else "",
            act["account"] if act else "",
            "",
            fmt(act["amount"]) if act else "",
            act["slot"] if act else "",
            act["category"] if act else "",
            act["count"] if act else "",
        ]
        writer.writerow(row)
        row_num += 1

    # Total row — both debit and credit totals side by side
    exp_debit_total = sum(r["amount"] for r in exp_debits)
    exp_credit_total = sum(r["amount"] for r in exp_credits)
    act_debit_total = sum(float(r["amount"]) for r in act_debits if r.get("amount") not in ("", None))
    act_credit_total = sum(float(r["amount"]) for r in act_credits if r.get("amount") not in ("", None))

    writer.writerow(empty_meta + [
        "", "TOTAL",
        fmt(exp_debit_total), fmt(exp_credit_total),
        "TOTAL",
        fmt(act_debit_total), fmt(act_credit_total),
        "", "", "",
    ])

    return output.getvalue()


def main():
    parser = argparse.ArgumentParser(description="Export single test case as comparison CSV")
    parser.add_argument("--experiment", required=True)
    parser.add_argument("--variant", required=True)
    parser.add_argument("--test-case", required=True)
    parser.add_argument("--output", default=None)
    args = parser.parse_args()

    csv_text = generate_csv(args.test_case, args.experiment, args.variant)
    if args.output:
        Path(args.output).write_text(csv_text)
        print(f"Written to {args.output}", file=sys.stderr)
    else:
        print(csv_text, end="")


if __name__ == "__main__":
    main()
