"""Cache warmup — prime Bedrock prompt caches for selected variants.

Each variant uses different cache points:
  - v3 multi-agent (baseline_v3, v3_simple): SHARED_INSTRUCTION + 7 agent instructions
  - single_agent_v3: own _SYSTEM_INSTRUCTION (single cache point)
  - single_agent_v3_1: SHARED_INSTRUCTION + own AGENT_INSTRUCTION
  - naive_agent: own _SYSTEM_INSTRUCTION (single cache point)

Each loader returns: list[(label, llm_name, system_blocks, schema_cls)]
  - label: display name for deduplication
  - llm_name: agent name for get_llm() (controls model + max_tokens)
  - system_blocks: system message content blocks with cache points
  - schema_cls: Pydantic model for with_structured_output (must match what
    the variant actually uses, otherwise Bedrock sees different tool
    definitions and cache misses)
"""
from __future__ import annotations

from pydantic import BaseModel
from rich.console import Console

console = Console()


# ── Variant → cache point mapping ────────────────────────────────────────

def _v3_agents() -> list[tuple[str, str, list[dict], type[BaseModel]]]:
    """V3 multi-agent cache points: SHARED + per-agent."""
    from services.agent.prompts.shared import SHARED_INSTRUCTION
    from services.agent.prompts.disambiguator import AGENT_INSTRUCTION as AI_AMB
    from services.agent.prompts.complexity_detector import AGENT_INSTRUCTION as AI_COMP
    from services.agent.prompts.debit_classifier import AGENT_INSTRUCTION as AI_DC
    from services.agent.prompts.credit_classifier import AGENT_INSTRUCTION as AI_CC
    from services.agent.prompts.tax_specialist import AGENT_INSTRUCTION as AI_TAX
    from services.agent.prompts.decision_maker import AGENT_INSTRUCTION as AI_DM
    from services.agent.prompts.entry_drafter import AGENT_INSTRUCTION as AI_ED
    from services.agent.utils.prompt import CACHE_POINT
    from services.agent.utils.parsers.json_output import _MODELS

    agents = [
        ("ambiguity_detector", AI_AMB),
        ("complexity_detector", AI_COMP),
        ("debit_classifier", AI_DC),
        ("credit_classifier", AI_CC),
        ("tax_specialist", AI_TAX),
        ("decision_maker", AI_DM),
        ("entry_drafter", AI_ED),
    ]
    return [
        (name, name,
         [{"text": SHARED_INSTRUCTION}, CACHE_POINT,
          {"text": ai}, CACHE_POINT],
         _MODELS[name])
        for name, ai in agents
    ]


def _v3_simple_agents() -> list[tuple[str, str, list[dict], type[BaseModel]]]:
    """V3 simple: subset of v3 agents (no ambiguity/complexity/decision)."""
    from services.agent.prompts.shared import SHARED_INSTRUCTION
    from services.agent.prompts.debit_classifier import AGENT_INSTRUCTION as AI_DC
    from services.agent.prompts.credit_classifier import AGENT_INSTRUCTION as AI_CC
    from services.agent.prompts.tax_specialist import AGENT_INSTRUCTION as AI_TAX
    from services.agent.prompts.entry_drafter import AGENT_INSTRUCTION as AI_ED
    from services.agent.utils.prompt import CACHE_POINT
    from services.agent.utils.parsers.json_output import _MODELS

    agents = [
        ("debit_classifier", AI_DC),
        ("credit_classifier", AI_CC),
        ("tax_specialist", AI_TAX),
        ("entry_drafter", AI_ED),
    ]
    return [
        (name, name,
         [{"text": SHARED_INSTRUCTION}, CACHE_POINT,
          {"text": ai}, CACHE_POINT],
         _MODELS[name])
        for name, ai in agents
    ]


def _single_agent_v3() -> list[tuple[str, str, list[dict], type[BaseModel]]]:
    """Single agent V3: own system instruction, single cache point."""
    from variants.single_agent_v3.prompt import _SYSTEM_INSTRUCTION
    from variants.single_agent_v3.graph import SingleAgentV3Output
    from services.agent.utils.prompt import CACHE_POINT

    return [("single_agent_v3", "entry_builder",
             [{"text": _SYSTEM_INSTRUCTION}, CACHE_POINT],
             SingleAgentV3Output)]


def _single_agent_v3_1() -> list[tuple[str, str, list[dict], type[BaseModel]]]:
    """Single agent V3.1: own system instruction, single cache point."""
    from variants.single_agent_v3_1.prompt import SYSTEM_INSTRUCTION
    from variants.single_agent_v3_1.graph import SingleAgentV31Output
    from services.agent.utils.prompt import CACHE_POINT

    return [("single_agent_v3_1", "entry_builder",
             [{"text": SYSTEM_INSTRUCTION}, CACHE_POINT],
             SingleAgentV31Output)]


def _naive_agent() -> list[tuple[str, str, list[dict], type[BaseModel]]]:
    """Naive agent: own system instruction, single cache point."""
    from variants.naive_agent.prompt import _SYSTEM_INSTRUCTION
    from variants.naive_agent.graph import SingleAgentOutput
    from services.agent.utils.prompt import CACHE_POINT

    return [("naive_agent", "entry_builder",
             [{"text": _SYSTEM_INSTRUCTION}, CACHE_POINT],
             SingleAgentOutput)]


def _decision_maker_v4() -> list[tuple[str, str, list[dict], type[BaseModel]]]:
    """Decision maker V4: renamed v3.1 gating agent."""
    from variants.decision_maker_v4.prompt import SYSTEM_INSTRUCTION
    from variants.decision_maker_v4.graph import SingleAgentV31Output
    from services.agent.utils.prompt import CACHE_POINT

    return [("decision_maker_v4", "entry_builder",
             [{"text": SYSTEM_INSTRUCTION}, CACHE_POINT],
             SingleAgentV31Output)]


def _baseline_v4_dualtrack() -> list[tuple[str, str, list[dict], type[BaseModel]]]:
    """V4 Dual-Track: decision_maker_v4 + v3_simple classifiers + tax + entry_drafter."""
    return _decision_maker_v4() + _v3_simple_agents()


VARIANT_CACHE_MAP: dict[str, callable] = {
    "baseline_v3": _v3_agents,
    "v3_simple": _v3_simple_agents,
    "single_agent_v3": _single_agent_v3,
    "single_agent_v3_1": _single_agent_v3_1,
    "decision_maker_v4": _decision_maker_v4,
    "baseline_v4_dualtrack": _baseline_v4_dualtrack,
    "naive_agent": _naive_agent,
}


# ── Warmup logic ─────────────────────────────────────────────────────────

_MODEL_IDS = {
    "sonnet": "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
    "sonnet4.6": "us.anthropic.claude-sonnet-4-6",
    "haiku": "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    "opus": "us.anthropic.claude-opus-4-5-20251101-v1:0",
    "opus4.6": "us.anthropic.claude-opus-4-6-v1",
}


def warmup_caches(variants: list[str] | None = None, model: str = "sonnet",
                  agent_model_overrides: dict[str, str] | None = None) -> None:
    """Warm prompt caches for the given variants and model.

    Args:
        variants: List of variant names. If None, warms all known variants.
        model: Default model name (sonnet/haiku/opus). Caches are per-model.
        agent_model_overrides: Per-agent model overrides (e.g. {"decision_maker_v4": "opus"}).
    """
    from langchain_core.callbacks import BaseCallbackHandler
    from services.agent.utils.llm import get_llm
    from services.agent.utils.prompt import to_bedrock_messages

    model_id = _MODEL_IDS.get(model)
    if not model_id:
        console.print(f"[red]Unknown model: {model}. Choose from: {list(_MODEL_IDS.keys())}[/red]")
        return

    class CacheProbe(BaseCallbackHandler):
        def __init__(self):
            self.usage = {}
        def on_llm_end(self, response, **kwargs):
            if response.generations:
                msg = response.generations[0][0].message
                if hasattr(msg, "usage_metadata") and msg.usage_metadata:
                    self.usage = dict(msg.usage_metadata)

    targets = variants or list(VARIANT_CACHE_MAP.keys())
    seen_labels: set[str] = set()

    console.print(f"[dim]Model: {model} ({model_id})[/dim]")

    for variant in targets:
        loader = VARIANT_CACHE_MAP.get(variant)
        if not loader:
            console.print(f"  [yellow]Unknown variant: {variant} — skipping[/yellow]")
            continue

        console.print(f"\n[dim]Warming caches for variant: {variant}[/dim]")
        cache_points = loader()

        for label, llm_name, system_blocks, schema_cls in cache_points:
            if label in seen_labels:
                console.print(f"  {label:25s} [dim]already warmed[/dim]")
                continue
            seen_labels.add(label)

            message_blocks = [{"text": "Respond with one word: ready"}]
            messages = to_bedrock_messages(system_blocks, message_blocks)

            # Use per-agent override if specified, otherwise default model
            # Check both label (e.g. "decision_maker_v4") and llm_name (e.g. "entry_builder")
            agent_model_name = (agent_model_overrides or {}).get(label) or (agent_model_overrides or {}).get(llm_name)
            effective_model_id = _MODEL_IDS.get(agent_model_name, model_id) if agent_model_name else model_id

            config = {"configurable": {"model_per_agent": {llm_name: effective_model_id}}}
            llm = get_llm(llm_name, config)
            structured = llm.with_structured_output(schema_cls)

            probe = CacheProbe()
            try:
                structured.invoke(messages, config={"callbacks": [probe]})
            except Exception as e:
                console.print(f"  {label:25s} [red]error: {e}[/red]")
                continue

            details = probe.usage.get("input_token_details", {})
            cw = details.get("cache_creation", 0)
            cr = details.get("cache_read", 0)
            model_label = agent_model_name or model
            if cw > 0:
                status = f"cache_creation={cw}"
            elif cr > 0:
                status = f"cache_read={cr} (already warm)"
            else:
                status = "not cached (below threshold)"
            console.print(f"  {label:25s} [{model_label}] {status}")

    console.print("\n[dim]Warmup complete.[/dim]\n")
