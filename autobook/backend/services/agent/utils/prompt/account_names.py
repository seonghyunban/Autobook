"""Build <account_names> block for the entry drafter prompt.

Given classifier output (which L4 categories were classified) and
the jurisdiction config, extracts the L5 children for each classified
L4 and renders them as a prompt block.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from utils.taxonomy import extract_l4_to_l5

if TYPE_CHECKING:
    from db.models.jurisdiction_config import JurisdictionConfig


def render_account_names(
    classified_categories: list[str],
    jurisdiction_config: JurisdictionConfig | None,
) -> str:
    """Render L5 account name suggestions for the classified L4 categories.

    Args:
        classified_categories: L4 category names from classifier output.
        jurisdiction_config: JurisdictionConfig with taxonomy_tree + language_key.

    Returns:
        Rendered <account_names> block, or "" if no config or no matches.
    """
    if jurisdiction_config is None or not classified_categories:
        return ""

    tree = jurisdiction_config.taxonomy_tree
    lang = jurisdiction_config.language_key

    # Build L4 → L5 children lookup from the shared taxonomy utility
    l4_to_l5 = extract_l4_to_l5(tree, lang)

    # Render only the classified categories
    sections = []
    seen: set[str] = set()
    for cat in classified_categories:
        if cat in seen:
            continue
        seen.add(cat)
        l5_names = l4_to_l5.get(cat, [])
        if l5_names:
            lines = [f"[{cat}]"]
            for name in l5_names:
                lines.append(f"- {name}")
            sections.append("\n".join(lines))

    if not sections:
        return ""

    header = "For each journal line, the subcategories below show the taxonomy breakdown for each classified category. Use these as safe fallback defaults when no more specific widely-recognized account name exists."
    body = "\n\n".join(sections)
    return f"<classification_subcategories>\n{header}\n\n{body}\n</classification_subcategories>"
