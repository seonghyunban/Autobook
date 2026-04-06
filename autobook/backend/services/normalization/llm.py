"""LLM client for the normalization agent."""
import logging

from langchain_aws import ChatBedrockConverse
from pydantic import BaseModel

from config import get_settings

logger = logging.getLogger(__name__)

MAX_TOKENS = 4000


def get_llm() -> ChatBedrockConverse:
    """Return a configured Bedrock client for the normalization agent."""
    settings = get_settings()
    return ChatBedrockConverse(
        model=settings.BEDROCK_MODEL_ROUTING["normalization"],
        region_name=settings.AWS_DEFAULT_REGION,
        temperature=0,
        max_tokens=MAX_TOKENS,
    )


def invoke_structured(llm: ChatBedrockConverse, schema: type[BaseModel], messages: list) -> dict:
    """Invoke LLM with structured output, falling back to raw args on validation error."""
    structured_llm = llm.with_structured_output(schema, include_raw=True)
    result = structured_llm.invoke(messages)

    if result["parsing_error"]:
        logger.warning("Structured output validation failed for %s: %s",
                       schema.__name__, result["parsing_error"])
        output = result["raw"].tool_calls[0]["args"]
        output["_parse_error"] = str(result["parsing_error"])
        return output

    return result["parsed"].model_dump()
