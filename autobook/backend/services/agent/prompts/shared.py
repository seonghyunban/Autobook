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

# Combined shared instruction — cached once, reused by pipeline agents
SHARED_INSTRUCTION = "\n".join([SHARED_BASE_PREAMBLE, SHARED_BASE_DOMAIN, SHARED_PIPELINE])
