"""Shared prompt components — cached across all pipeline agents.

Composes shared_base (all agents) + shared_pipeline (classifiers/tax/drafter)
into SHARED_INSTRUCTION with a single cache point.

Structure:
  shared_base.py      — fundamentals, resolution rules, ambiguities
  shared_pipeline.py  — taxonomy, tax, detection schema, slots, pipeline
  shared.py (this)    — composes both into SHARED_INSTRUCTION

Usage:
  Classifiers/tax/drafter: import SHARED_INSTRUCTION from here
  Decision_maker_v4:       import from shared_base.py directly
"""

from services.agent.prompts.shared_base import (
    SHARED_BASE_PREAMBLE,
    SHARED_BASE_DOMAIN,
)
from services.agent.prompts.shared_pipeline import SHARED_PIPELINE

# ── Legacy exports (backward compatibility) ──────────────────────────────

SHARED_PREAMBLE = SHARED_BASE_PREAMBLE
SHARED_DOMAIN = SHARED_BASE_DOMAIN
SHARED_SYSTEM = SHARED_PIPELINE

# Static fallback — no jurisdiction rules
SHARED_INSTRUCTION = "\n".join([SHARED_BASE_PREAMBLE, SHARED_BASE_DOMAIN, SHARED_PIPELINE])

# ── Jurisdiction-aware builder ───────────────────────────────────────────

_jurisdiction_instruction_cache: dict[str, str] = {}


def build_shared_instruction(jurisdiction_config=None) -> str:
    """Build SHARED_INSTRUCTION with optional jurisdiction-specific content.

    Structure: PREAMBLE + DOMAIN + jurisdiction_domain + PIPELINE + jurisdiction_pipeline

    jurisdiction_domain: accounting rules (payable classification, share cancellation, etc.)
    jurisdiction_pipeline: dynamic taxonomy (L4 categories with definitions)

    Cached per jurisdiction. Falls back to static SHARED_INSTRUCTION
    if no jurisdiction config is provided.
    """
    if jurisdiction_config is None:
        return SHARED_INSTRUCTION

    key = jurisdiction_config.jurisdiction
    if key in _jurisdiction_instruction_cache:
        return _jurisdiction_instruction_cache[key]

    # Jurisdiction-specific domain knowledge
    rules = jurisdiction_config.jurisdiction_rules or {}
    domain_text = rules.get("prompt_text", "")

    # Jurisdiction-specific pipeline (dynamic taxonomy)
    from services.agent.utils.taxonomy import extract_l4_by_category
    lang = jurisdiction_config.language_key
    taxonomy_text = _render_taxonomy(jurisdiction_config.taxonomy_tree, lang)

    parts = [SHARED_BASE_PREAMBLE, SHARED_BASE_DOMAIN]

    if domain_text:
        parts.append(f"\n<jurisdiction_knowledge>\n{domain_text}\n</jurisdiction_knowledge>")

    parts.append(SHARED_PIPELINE)

    if taxonomy_text:
        parts.append(f"\n{taxonomy_text}")

    result = "\n".join(parts)
    _jurisdiction_instruction_cache[key] = result
    return result


def _render_taxonomy(tree: dict, lang: str) -> str:
    """Render taxonomy hierarchy (L2 → L3 → L4 with definitions).

    Shows the full path from the 5 top-level categories down to L4,
    so the LLM understands the branching structure.
    """
    _L2_TO_LABEL = {
        "Assets [abstract]": "Assets",
        "Liabilities [abstract]": "Liabilities",
        "Equity [abstract]": "Equity",
        "Revenue": "Revenue/Income",
        "Expense": "Expenses",
    }

    lines = ["<taxonomy>"]

    for sheet_key in ["BS1", "IS1"]:
        for l1 in tree.get(sheet_key, []):
            for l2 in l1.get("children", []):
                label = _L2_TO_LABEL.get(l2.get("en"))
                if label is None:
                    continue

                lines.append(f"\n{label}:")

                for l3 in l2.get("children", []):
                    l3_name = l3.get(lang) or l3.get("en")
                    l4s = l3.get("children", [])

                    if not l4s:
                        # L3 is a leaf (no L4 children)
                        defn = l3.get("definition", "")
                        if defn:
                            lines.append(f"  {l3_name} — {defn}")
                        else:
                            lines.append(f"  {l3_name}")
                    else:
                        # L3 has L4 children — show as sub-group
                        lines.append(f"  {l3_name}:")
                        for l4 in l4s:
                            l4_name = l4.get(lang) or l4.get("en")
                            defn = l4.get("definition", "")
                            if defn:
                                lines.append(f"    {l4_name} — {defn}")
                            else:
                                lines.append(f"    {l4_name}")

    lines.append("</taxonomy>")
    return "\n".join(lines)
