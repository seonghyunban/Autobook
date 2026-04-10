"""Tier — the core container. Wires processor, gate, memories, upstream, downstream.

Implements both Upstream and Downstream protocols so it can be
used directly in another tier's upstream/downstream lists for
in-process linking.
"""
from __future__ import annotations

from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from ripple_through.protocols import Downstream, Gate, Memory, Processor, Upstream


class Tier:
    """A single tier in the cascade.

    Usage:
        tier = Tier(
            processor=MyProcessor(),
            gate=ConfidenceGate(0.9),
            memories={"local": QdrantMemory(...)},
        )
        result = tier.run(input)

    Chain with >>:
        chain = stat_tier >> ml_tier >> llm_tier
        result = chain.run(input)
    """

    def __init__(
        self,
        processor: Processor | None = None,
        gate: Gate | None = None,
        memories: dict[str, Memory] | None = None,
        downstream: list[Downstream] | None = None,
        upstream: list[Upstream] | None = None,
    ):
        self.processor = processor
        self.gate = gate
        self.memories: dict[str, Memory] = memories or {}
        self.downstream: list[Downstream] = downstream or []
        self.upstream: list[Upstream] = upstream or []

    def run(self, input: Any, result: Any = None) -> Any:
        """Forward pass → gate → escalate or propagate.

        Also satisfies Downstream.run() — when used as another tier's
        downstream for in-process escalation. The previous tier's result
        is ignored; this tier runs its own pipeline.

        Requires processor and gate. Tiers without a processor (e.g.
        human tier) should use backward() directly.
        """
        if self.processor is None:
            raise RuntimeError("This tier has no processor — use backward() directly")
        if self.gate is None:
            raise RuntimeError("This tier has no gate — use backward() directly")

        result = self.processor.forward(input, self.memories)

        if self.gate.passed(result):
            for up in self.upstream:
                up.backward(result)
        else:
            for down in self.downstream:
                down.run(input, result)

        return result

    def backward(self, result: Any) -> None:
        """Satisfies Upstream.backward().

        Writes to own memories, then ripples to own upstream.
        """
        for mem in self.memories.values():
            mem.write(result)
        for up in self.upstream:
            up.backward(result)

    # ── Chain operator ─────────────────────────────────

    def __rshift__(self, other: Any) -> Any:
        """Chain tiers: stat >> ml >> llm.

        Between two Tiers: wires in-process downstream/upstream.
        Between Tier and transport: buffers for next >>.
        """
        from ripple_through.chain import Chain

        if isinstance(other, Tier):
            if other not in self.downstream:
                self.downstream.append(other)
            if self not in other.upstream:
                other.upstream.append(self)
            return Chain([self, other])

        # Transport adapter (SQS, SSE, API, etc.)
        if other not in self.downstream:
            self.downstream.append(other)
        return Chain([self], pending_transport=other)
