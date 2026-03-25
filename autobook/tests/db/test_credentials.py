from __future__ import annotations

from db.credentials import get_database_url


def test_get_database_url_env_var(monkeypatch):
    get_database_url.cache_clear()
    monkeypatch.delenv("DB_SECRET_ARN", raising=False)
    monkeypatch.setenv("DATABASE_URL", "postgresql://test:test@localhost/testdb")
    result = get_database_url()
    assert result == "postgresql://test:test@localhost/testdb"
    get_database_url.cache_clear()


def test_get_database_url_cached(monkeypatch):
    get_database_url.cache_clear()
    monkeypatch.delenv("DB_SECRET_ARN", raising=False)
    monkeypatch.setenv("DATABASE_URL", "postgresql://cached@localhost/db")
    r1 = get_database_url()
    r2 = get_database_url()
    assert r1 is r2
    assert get_database_url.cache_info().hits >= 1
    get_database_url.cache_clear()
