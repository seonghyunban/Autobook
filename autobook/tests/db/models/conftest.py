import pytest


@pytest.fixture(autouse=True)
def _load_all_models():
    """Import all models so SQLAlchemy relationships resolve."""
    import db.models  # noqa: F401
