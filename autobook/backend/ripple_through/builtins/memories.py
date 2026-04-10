"""Built-in memory implementations for testing."""
from __future__ import annotations

from typing import Any


class InMemoryMemory:
    """Dict-backed memory for unit tests. No external dependencies.

    Stores values by key. Read returns the k most recent writes
    matching the key (or all if fewer than k exist).
    """

    def __init__(self) -> None:
        self._store: list[tuple[Any, Any]] = []

    def read(self, key: Any, **kwargs: Any) -> list[Any]:
        k = kwargs.get("k", 5)
        matches = [value for stored_key, value in self._store if stored_key == key]
        return matches[-k:]

    def write(self, value: Any, **kwargs: Any) -> None:
        key = kwargs.get("key")
        self._store.append((key, value))

    def clear(self) -> None:
        self._store.clear()

    def __len__(self) -> int:
        return len(self._store)
