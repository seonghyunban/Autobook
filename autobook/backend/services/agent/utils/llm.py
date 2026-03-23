from langchain_aws import ChatBedrockConverse
from langchain_core.runnables import RunnableConfig

from config import get_settings

# Per-agent max output tokens (from agent-pipeline.md Constrained Output table)
MAX_TOKENS: dict[str, int] = {
    "disambiguator":    50,
    "debit_classifier": 10,
    "credit_classifier": 10,
    "debit_corrector":  10,
    "credit_corrector": 10,
    "entry_builder":    200,
    "approver":         50,
    "diagnostician":    100,
}


def get_llm(agent_name: str, config: RunnableConfig | None = None) -> ChatBedrockConverse:
    """Return a configured ChatBedrockConverse client for the given agent.

    Args:
        agent_name: One of the 8 agent names (e.g. "debit_classifier").
        config: LangGraph RunnableConfig — experiment runner passes model/thinking
                overrides via config["configurable"]. Production passes nothing.

    Returns:
        Configured ChatBedrockConverse instance.
    """
    settings = get_settings()
    configurable = (config or {}).get("configurable", {})

    # Model: experiment override or per-agent deployment config from config.py
    model = (
        configurable.get("model_per_agent", {}).get(agent_name)
        or settings.BEDROCK_MODEL_ROUTING[agent_name]
    )

    # Thinking effort: experiment override only, omitted in production
    effort = configurable.get("thinking_effort_per_agent", {}).get(agent_name)
    additional_fields = {"thinking": {"type": "adaptive", "effort": effort}} if effort else None

    return ChatBedrockConverse(
        model=model,
        region_name=settings.AWS_DEFAULT_REGION,
        max_tokens=MAX_TOKENS[agent_name],
        additional_model_request_fields=additional_fields,
    )
