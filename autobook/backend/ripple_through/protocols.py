"""Core protocols — the five component interfaces of ripple-through.

Users implement these. The framework calls them.
"""
from __future__ import annotations

from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class Memory(Protocol):
    """Knowledge store. Read and write with any key/value shape."""

    def read(self, key: Any, **kwargs: Any) -> Any: ...
    def write(self, value: Any, **kwargs: Any) -> None: ...


@runtime_checkable
class Gate(Protocol):
    """Decides whether the processor's result is confident enough."""

    def passed(self, result: Any) -> bool: ...


@runtime_checkable
class Processor(Protocol):
    """Runs the forward pass. Reads from memories, produces a result."""

    def forward(self, input: Any, memories: dict[str, Memory]) -> Any: ...


@runtime_checkable
class Downstream(Protocol):
    """Receives escalation when gate fails. Runs the next tier."""

    def run(self, input: Any, result: Any) -> Any: ...


@runtime_checkable
class Upstream(Protocol):
    """Receives corrections. Writes to memories, optionally ripples further."""

    def backward(self, result: Any) -> None: ...
