"""ripple-through — a tiered cascade framework for correction-driven learning.

Five protocols: Memory, Gate, Processor, Downstream, Upstream.
One container: Tier.
One chain operator: >>.

Usage:
    from ripple_through import Tier
    from ripple_through.protocols import Memory, Gate, Processor, Upstream, Downstream
    from ripple_through.result import Result
    from ripple_through.builtins import PassThroughGate, ConfidenceGate, InMemoryMemory

    tier = Tier(processor=..., gate=..., memories={...})
    result = tier.run(input)

    chain = stat >> ml >> llm
    result = chain.run(input)
"""
from ripple_through.chain import Chain
from ripple_through.result import Result
from ripple_through.tier import Tier

__all__ = [
    "Chain",
    "Result",
    "Tier",
]
