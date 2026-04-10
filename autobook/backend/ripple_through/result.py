"""Result base class — user-extensible, framework-readable."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Result:
    """Base result returned by Processor.forward().

    Users extend this with domain-specific fields. The framework
    only reads `confidence` (for gating). Everything else goes
    in `payload` or subclass fields.
    """

    confidence: float | None = None
    payload: dict[str, Any] = field(default_factory=dict)
