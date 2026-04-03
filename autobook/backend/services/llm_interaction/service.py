"""LLM Interaction service — bilingual entry builder.

Orchestrates:
1. Regex language detection (Korean vs English)
2. Translation prompt (Korean → English, only if needed)
3. Enqueue to SQS-agent (with streaming flag)
4. Translate-back prompt (English entry → Korean, called by worker after agent completes)

API server calls enqueue(). Worker calls translate_entry_to_korean() post-agent.
"""

from __future__ import annotations

import json
import logging
import re
import uuid

import boto3

from config import get_settings
from queues.sqs.enqueue import agent as enqueue_agent

logger = logging.getLogger(__name__)

_HANGUL_RE = re.compile(r"[\uac00-\ud7af]")

_AGENT_KEY = "entry_drafter"


def detect_language(text: str) -> str:
    if _HANGUL_RE.search(text):
        return "ko"
    return "en"


def _get_client():
    settings = get_settings()
    return boto3.client("bedrock-runtime", region_name=settings.AWS_DEFAULT_REGION)


def _get_model_id() -> str:
    settings = get_settings()
    return settings.BEDROCK_MODEL_ROUTING[_AGENT_KEY]


def _invoke(client, model_id: str, system: str, user: str) -> str:
    response = client.converse(
        modelId=model_id,
        system=[{"text": system}],
        messages=[{"role": "user", "content": [{"text": user}]}],
        inferenceConfig={"temperature": 0, "maxTokens": 4000},
    )
    return response["output"]["message"]["content"][0]["text"].strip()


def _strip_fences(raw: str) -> str:
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    return raw


def _translate_to_english(client, model_id: str, korean_text: str) -> str:
    return _invoke(
        client,
        model_id,
        "You are a translator. Translate the following Korean text to English. "
        "Return ONLY the English translation, nothing else.",
        korean_text,
    )


def translate_entry_to_korean(english_entry: dict) -> dict:
    """Translate an English journal entry to Korean. Called by worker post-agent."""
    client = _get_client()
    model_id = _get_model_id()
    raw = _invoke(
        client,
        model_id,
        "You are a translator. Translate the following accounting journal entry "
        "from English to Korean. Translate the description and all account_name values. "
        "Keep account_code, type, and amount unchanged.\n\n"
        "Return ONLY a JSON object with the same structure, nothing else.",
        json.dumps(english_entry, ensure_ascii=False),
    )
    return json.loads(_strip_fences(raw))


def enqueue(input_text: str, user_id: str) -> dict:
    """Detect language, translate if needed, enqueue to agent, return metadata."""
    lang = detect_language(input_text)
    parse_id = f"llm_{uuid.uuid4().hex[:12]}"

    if lang == "ko":
        client = _get_client()
        model_id = _get_model_id()
        english_text = _translate_to_english(client, model_id, input_text)
    else:
        english_text = input_text

    enqueue_agent({
        "parse_id": parse_id,
        "user_id": user_id,
        "input_text": english_text,
        "source": "llm_interaction",
        "streaming": True,
        "original_input_text": input_text,
        "detected_language": lang,
    })

    return {
        "parse_id": parse_id,
        "detected_language": lang,
        "english_text": english_text,
    }
