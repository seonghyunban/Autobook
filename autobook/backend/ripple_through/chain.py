"""Chain — the result of >> operator. Entry point for running a cascade."""
from __future__ import annotations

from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from ripple_through.tier import Tier


class Chain:
    """An ordered sequence of tiers linked via >>.

    The first tier is the entry point. Escalation flows downstream
    through the chain automatically.

    Usage:
        chain = stat >> ml >> llm
        result = chain.run(input)
    """

    def __init__(self, tiers: list[Tier], pending_transport: Any = None):
        self.tiers = list(tiers)
        self._pending_transport = pending_transport

    def run(self, input: Any) -> Any:
        """Run the cascade starting from the first tier."""
        return self.tiers[0].run(input)

    def __rshift__(self, other: Any) -> Chain:
        """Extend the chain: chain >> next_tier or chain >> transport >> next_tier."""
        from ripple_through.tier import Tier

        if isinstance(other, Tier):
            last = self.tiers[-1]

            if self._pending_transport is not None:
                # chain >> SQS(url) >> tier
                # Wire transport between last tier and new tier
                transport = self._pending_transport
                if transport not in last.downstream:
                    last.downstream.append(transport)
                if transport not in other.upstream:
                    other.upstream.append(transport)
                self._pending_transport = None
            else:
                # chain >> tier (in-process)
                if other not in last.downstream:
                    last.downstream.append(other)
                if last not in other.upstream:
                    other.upstream.append(last)

            self.tiers.append(other)
            return self

        # chain >> transport (buffer for next >>)
        self._pending_transport = other
        return self
