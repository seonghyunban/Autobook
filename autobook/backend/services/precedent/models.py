"""Precedent matcher value objects.

The SQLAlchemy model for ``precedent_entries`` moved to
``backend/db/models/precedent_entry.py`` as part of the DB refactor
so the table is defined alongside the rest of the schema. Only the
value objects (``StructureLine``, ``RatioLine``, ``Label``) and the
helper functions remain here.

Re-exports ``PrecedentEntry`` for callers that still import it from
this module — they'll migrate to ``db.models.precedent_entry`` over
time, but keeping the re-export avoids breaking imports in the
breaking-fix PR.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass

from db.models.precedent_entry import PrecedentEntry

__all__ = [
    "PrecedentEntry",
    "StructureLine",
    "RatioLine",
    "Label",
    "compute_structure_hash",
    "extract_label",
]


# ── Value objects ────────────────────────────────────────────────────────


@dataclass(frozen=True)
class StructureLine:
    account_code: str
    side: str  # "debit" or "credit"


@dataclass(frozen=True)
class RatioLine:
    account_code: str
    ratio: float


@dataclass(frozen=True)
class Label:
    """The (structure, ratio) pair that identifies an equivalence class."""

    structure: tuple[StructureLine, ...]
    ratio: tuple[RatioLine, ...]
    structure_hash: str


def compute_structure_hash(structure: dict) -> str:
    """Deterministic hash of structure for fast equality checks."""
    canonical = json.dumps(structure, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def extract_label(entry: PrecedentEntry) -> Label:
    """Extract the (structure, ratio) label from a precedent entry."""
    structure_lines = tuple(
        StructureLine(account_code=line["account_code"], side=line["side"])
        for line in entry.structure.get("lines", [])
    )
    ratio_lines = tuple(
        RatioLine(account_code=line["account_code"], ratio=line["ratio"])
        for line in entry.ratio.get("lines", [])
    )
    return Label(
        structure=structure_lines,
        ratio=ratio_lines,
        structure_hash=entry.structure_hash,
    )
