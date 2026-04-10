"""Shared taxonomy tree utilities.

Walks the jurisdiction taxonomy tree to extract L4 categories and
L5 account names. Used by both the dynamic schema builder (classifiers)
and the account name renderer (entry drafter).
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from db.models.jurisdiction_config import JurisdictionConfig

SHEET_KEYS = ["BS1", "IS1"]
L4_DEPTH = 3  # L4 nodes sit at tree depth 3 (root=0, L2=1, L3=2, L4=3)

# Maps L2 abstract names (always English in the tree) to the 5 top-level categories
_L2_TO_CATEGORY: dict[str, str] = {
    "Assets [abstract]": "asset",
    "Liabilities [abstract]": "liability",
    "Equity [abstract]": "equity",
    "Revenue": "revenue",
    "Expense": "expense",
}


def extract_l4_by_category(
    tree: dict,
    lang: str,
) -> dict[str, list[str]]:
    """Extract L4 category names grouped by the 5 top-level types.

    Returns: {"asset": ["Cash and cash equivalents", ...], "liability": [...], ...}
    """
    categories: dict[str, list[str]] = {
        "asset": [], "liability": [], "equity": [],
        "revenue": [], "expense": [],
    }

    for sheet_key in SHEET_KEYS:
        sheet = tree.get(sheet_key, [])
        for l1 in sheet:
            for l2 in l1.get("children", []):
                cat_key = _L2_TO_CATEGORY.get(l2.get("en"))
                if cat_key is None:
                    continue
                for l3 in l2.get("children", []):
                    for l4 in l3.get("children", []):
                        name = l4.get(lang) or l4.get("en")
                        if name:
                            categories[cat_key].append(name)
                    # L3 leaf (no L4 children) — the L3 itself is the category
                    if not l3.get("children"):
                        name = l3.get(lang) or l3.get("en")
                        if name:
                            categories[cat_key].append(name)

    return categories


def extract_l4_to_l5(tree: dict, lang: str) -> dict[str, list[str]]:
    """Build a map of L4 name → list of L5 account names.

    Returns: {"현금및현금성자산": ["현금", "현금성자산"], ...}
    """
    l4_map: dict[str, list[str]] = {}

    for sheet_key in SHEET_KEYS:
        sheet = tree.get(sheet_key, [])
        _walk_for_l4_l5(sheet, lang, l4_map, depth=0)

    return l4_map


def extract_classified_categories(state: dict) -> list[str]:
    """Extract all L4 category names from classifier output in the pipeline state."""
    categories: list[str] = []

    for slot_key in ["output_debit_classifier", "output_credit_classifier"]:
        output = state.get(slot_key)
        if not output or not isinstance(output, dict):
            continue
        for slot_name, detections in output.items():
            if not isinstance(detections, list):
                continue
            for det in detections:
                cat = det.get("category")
                if cat and cat not in categories:
                    categories.append(cat)

    return categories


def _walk_for_l4_l5(
    nodes: list[dict],
    lang: str,
    l4_map: dict[str, list[str]],
    depth: int,
) -> None:
    """Recursively walk the tree. At L4_DEPTH, collect children as L5 names."""
    for node in nodes:
        children = node.get("children", [])
        if depth == L4_DEPTH:
            l4_name = node.get(lang) or node.get("en")
            l5_names = [
                child.get(lang) or child.get("en")
                for child in children
                if child.get(lang) or child.get("en")
            ]
            if l4_name and l5_names:
                l4_map[l4_name] = l5_names
        else:
            _walk_for_l4_l5(children, lang, l4_map, depth + 1)
