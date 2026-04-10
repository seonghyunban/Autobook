"""Built-in gate implementations."""
from __future__ import annotations

from typing import Any

from ripple_through.result import Result


class PassThroughGate:
    """Always passes. Every result is accepted."""

    def passed(self, result: Any) -> bool:
        return True


class ConfidenceGate:
    """Passes if result.confidence >= threshold.

    If result has no confidence attribute or confidence is None, fails.
    """

    def __init__(self, threshold: float):
        self.threshold = threshold

    def passed(self, result: Any) -> bool:
        confidence = getattr(result, "confidence", None)
        if confidence is None and isinstance(result, dict):
            confidence = result.get("confidence")
        if confidence is None:
            return False
        return confidence >= self.threshold
