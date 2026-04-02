"""LLM Interaction service — bilingual entry builder.

Orchestrates:
1. Regex language detection (Korean vs English)
2. Translation prompt (Korean → English, only if needed)
3. Agent service (English text → journal entry)
4. Translate-back prompt (English entry → Korean, only if input was Korean)

Called synchronously from the API route — not a queue worker.
"""

from __future__ import annotations

import json
import logging
import re

import boto3

from config import get_settings
from services.agent.service import execute as agent_execute

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


def _build_entry_via_agent(english_text: str) -> dict | None:
    """Call the agent service and reshape its output to {description, lines}."""
    message = {"input_text": english_text}
    result = agent_execute(message)

    if result.get("decision") != "PROCEED":
        return None

    entry = result.get("entry")
    if not entry or not entry.get("lines"):
        return None

    return {
        "description": english_text,
        "lines": [
            {
                "account_code": line.get("account_code", ""),
                "account_name": line.get("account_name", ""),
                "type": line.get("type", "debit"),
                "amount": float(line.get("amount", 0)),
            }
            for line in entry["lines"]
        ],
    }


def _translate_entry_to_korean(client, model_id: str, entry: dict) -> dict:
    raw = _invoke(
        client,
        model_id,
        "You are a translator. Translate the following accounting journal entry "
        "from English to Korean. Translate the description and all account_name values. "
        "Keep account_code, type, and amount unchanged.\n\n"
        "Return ONLY a JSON object with the same structure, nothing else.",
        json.dumps(entry, ensure_ascii=False),
    )
    return json.loads(_strip_fences(raw))


def execute(input_text: str) -> dict:
    """Run the bilingual entry builder pipeline."""
    lang = detect_language(input_text)
    client = _get_client()
    model_id = _get_model_id()

    # Step 1: Get English text
    if lang == "ko":
        english_text = _translate_to_english(client, model_id, input_text)
    else:
        english_text = input_text

    # Step 2: Build entry via agent service
    english_entry = _build_entry_via_agent(english_text)

    # Step 3: Translate entry back to Korean if needed
    korean_entry = None
    if lang == "ko" and english_entry:
        korean_entry = _translate_entry_to_korean(client, model_id, english_entry)

    return {
        "input_text": input_text,
        "detected_language": lang,
        "english_text": english_text,
        "english_entry": english_entry,
        "korean_entry": korean_entry,
    }
