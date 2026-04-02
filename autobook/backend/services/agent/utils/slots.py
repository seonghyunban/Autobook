"""Slot definitions and tuple extraction for classifier outputs."""

DEBIT_SLOTS = ["asset_increase", "expense_increase",
               "liability_decrease", "equity_decrease", "revenue_decrease"]
CREDIT_SLOTS = ["liability_increase", "equity_increase", "revenue_increase",
                "asset_decrease", "expense_decrease"]


def extract_tuple(output: dict, slots: list[str]) -> tuple[int, ...]:
    """Extract a count tuple from classifier output."""
    counts = []
    for s in slots:
        val = output.get(s)
        if isinstance(val, list):
            counts.append(sum(item.get("count", 1) for item in val if isinstance(item, dict)))
        elif isinstance(val, dict):
            counts.append(val.get("count", 0))
        elif f"{s}_count" in output:
            counts.append(output[f"{s}_count"])
        else:
            counts.append(0)
    return tuple(counts)


def extract_debit_tuple(output: dict) -> tuple[int, ...]:
    return extract_tuple(output, DEBIT_SLOTS)


def extract_credit_tuple(output: dict) -> tuple[int, ...]:
    return extract_tuple(output, CREDIT_SLOTS)
