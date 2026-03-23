import logging
import math

from db.connection import SessionLocal
from db.dao.calibration import CalibrationDAO

log = logging.getLogger(__name__)

# Identity parameters — no correction until flywheel fits from override data.
_DEFAULT_A = 1.0
_DEFAULT_B = 0.0
_MIN_SAMPLES = 30

# Module-level cache (loaded once per Lambda container)
_params: dict | None = None


def _load_params() -> tuple[float, float, int]:
    """Load calibration parameters from PostgreSQL.

    Returns (a, b, sample_count). Falls back to identity when DB is
    unavailable or no row exists yet.
    """
    global _params
    if _params is not None:
        return _params["a"], _params["b"], _params["sample_count"]

    try:
        db = SessionLocal()
        try:
            row = CalibrationDAO.get_latest(db)
            if row is not None:
                _params = {"a": row.a, "b": row.b, "sample_count": row.sample_count}
            else:
                _params = {"a": _DEFAULT_A, "b": _DEFAULT_B, "sample_count": 0}
        finally:
            db.close()
    except Exception:
        log.warning("Failed to load calibration params, using identity defaults")
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
