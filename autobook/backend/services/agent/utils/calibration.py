import math

# Identity parameters — no correction until flywheel fits from override data.
# In production, loaded from PostgreSQL calibration_params table on cold start.
_DEFAULT_A = 1.0
_DEFAULT_B = 0.0
_MIN_SAMPLES = 30

# Module-level cache (loaded once per Lambda container)
_params: dict | None = None


def _load_params() -> tuple[float, float, int]:
    """Load calibration parameters.

    Returns (a, b, sample_count). Falls back to identity when DB is
    unavailable or sample_count < _MIN_SAMPLES.
    """
    global _params
    if _params is not None:
        return _params["a"], _params["b"], _params["sample_count"]

    # TODO: read from PostgreSQL calibration_params table (flywheel writes here)
    # For now, return identity defaults — equivalent to no calibration.
    _params = {"a": _DEFAULT_A, "b": _DEFAULT_B, "sample_count": 0}
    return _params["a"], _params["b"], _params["sample_count"]


def calibrate_confidence(raw_confidence: float) -> float:
    """Apply Platt scaling to Agent 6's raw verbalized confidence.

    Global calibration (not per transaction type). Falls back to raw
    confidence when fewer than 30 calibration samples are available.

    Args:
        raw_confidence: Agent 6's verbalized confidence (0.0 to 1.0).

    Returns:
        Calibrated confidence (0.0 to 1.0).
    """
    a, b, sample_count = _load_params()

    if sample_count < _MIN_SAMPLES:
        return raw_confidence

    return 1.0 / (1.0 + math.exp(-(a * raw_confidence + b)))
