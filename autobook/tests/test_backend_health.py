from __future__ import annotations

from backend.main import app
from backend.routes.health import health


def test_health_function_returns_ok() -> None:
    assert health() == {"status": "ok"}


def test_backend_app_registers_health_route() -> None:
    route_paths = {route.path for route in app.routes}
    assert "/health" in route_paths
