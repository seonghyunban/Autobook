from __future__ import annotations

import os
import pytest

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("COGNITO_USER_POOL_ID", "us-east-1_test")
os.environ.setdefault("COGNITO_CLIENT_ID", "test-client")

from auth.deps import _resolve_role
from schemas.auth import TokenPayload, UserRole
from tests.auth.mock_cognito import MockCognito, MockCognitoConfig
from auth import token_service
from config import get_settings


MOCK = MockCognito(MockCognitoConfig(region="us-east-1", user_pool_id="us-east-1_test", client_id="test-client", key_id="test-key"))


@pytest.fixture(autouse=True)
def setup_env(monkeypatch):
    for key, value in MOCK.env_vars.items():
        monkeypatch.setenv(key, value)
    get_settings.cache_clear()
    token_service.clear_caches()


def test_resolve_role_default():
    claims = TokenPayload(sub="u", exp=0, iat=0, iss="x", token_use="access")
    role, source = _resolve_role(claims)
    assert role == UserRole.REGULAR
    assert source == "default"


def test_resolve_role_custom_role_priority(monkeypatch):
    monkeypatch.setenv("COGNITO_ROLE_CLAIM_SOURCE", "custom:role")
    get_settings.cache_clear()
    claims = TokenPayload(sub="u", exp=0, iat=0, iss="x", token_use="access", **{"custom:role": "superuser"})
    role, source = _resolve_role(claims)
    assert role == UserRole.SUPERUSER
    assert source == "custom:role"


def test_resolve_role_custom_source_falls_to_group(monkeypatch):
    monkeypatch.setenv("COGNITO_ROLE_CLAIM_SOURCE", "custom:role")
    get_settings.cache_clear()
    claims = TokenPayload(sub="u", exp=0, iat=0, iss="x", token_use="access", **{"cognito:groups": ["manager"]})
    role, source = _resolve_role(claims)
    assert role == UserRole.MANAGER
    assert source == "cognito:groups"
