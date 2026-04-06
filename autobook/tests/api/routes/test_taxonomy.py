from __future__ import annotations

import uuid
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes import taxonomy as taxonomy_route
from auth.deps import AuthContext, get_current_user
from auth.schemas import UserRole
from db.connection import get_db


USER_ID = uuid.UUID("11111111-1111-1111-1111-111111111111")


def _make_client(monkeypatch, grouped=None, existing=None, created=None):
    app = FastAPI()
    app.include_router(taxonomy_route.router)

    auth = AuthContext(
        user=SimpleNamespace(id=USER_ID),
        claims=SimpleNamespace(token_use="access"),
        role=UserRole.REGULAR,
        role_source="cognito:groups",
    )
    app.dependency_overrides[get_current_user] = lambda: auth
    app.dependency_overrides[get_db] = lambda: SimpleNamespace(commit=lambda: None)

    monkeypatch.setattr(
        taxonomy_route.TaxonomyDAO,
        "list_grouped",
        staticmethod(lambda _db: grouped if grouped is not None else {}),
    )
    monkeypatch.setattr(
        taxonomy_route.TaxonomyDAO,
        "get_by_name_and_type",
        staticmethod(lambda _db, _n, _t: existing),
    )
    monkeypatch.setattr(
        taxonomy_route.TaxonomyDAO,
        "create",
        staticmethod(lambda _db, name, account_type, user_id: created or SimpleNamespace(
            id=uuid.uuid4(), name=name, account_type=account_type, is_default=False,
        )),
    )

    return TestClient(app)


def test_get_taxonomy_empty(monkeypatch):
    client = _make_client(monkeypatch, grouped={})
    response = client.get("/api/v1/taxonomy")
    assert response.status_code == 200
    assert response.json()["taxonomy"] == {}


def test_get_taxonomy_with_data(monkeypatch):
    grouped = {
        "asset": ["Cash and cash equivalents", "Trade receivables"],
        "expense": ["Rent expense"],
    }
    client = _make_client(monkeypatch, grouped=grouped)
    response = client.get("/api/v1/taxonomy")
    assert response.status_code == 200
    data = response.json()["taxonomy"]
    assert data["asset"] == ["Cash and cash equivalents", "Trade receivables"]
    assert data["expense"] == ["Rent expense"]


def test_create_taxonomy_entry(monkeypatch):
    client = _make_client(monkeypatch, existing=None)
    response = client.post("/api/v1/taxonomy", json={"name": "Custom", "account_type": "asset"})
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Custom"
    assert data["account_type"] == "asset"
    assert data["is_default"] is False


def test_create_taxonomy_duplicate(monkeypatch):
    existing = SimpleNamespace(id=uuid.uuid4(), name="Cash", account_type="asset", is_default=True)
    client = _make_client(monkeypatch, existing=existing)
    response = client.post("/api/v1/taxonomy", json={"name": "Cash", "account_type": "asset"})
    assert response.status_code == 409


def test_create_taxonomy_invalid_type(monkeypatch):
    client = _make_client(monkeypatch, existing=None)
    response = client.post("/api/v1/taxonomy", json={"name": "Test", "account_type": "invalid"})
    assert response.status_code == 422
