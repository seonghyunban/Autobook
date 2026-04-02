"""Cache key schemas for Redis result caching.

These define which message fields determine the output of each service.
Transport fields (parse_id, user_id, transaction_id) are excluded —
different transactions with the same content should hit cache.

User-agnostic for now. Add user_id when per-user chart of accounts is implemented.
"""

from __future__ import annotations

import hashlib
import json

from pydantic import BaseModel


class MLCacheKey(BaseModel):
    input_text: str
    source: str

    def cache_key(self) -> str:
        raw = json.dumps(self.model_dump(), sort_keys=True)
        return f"ml:{hashlib.sha256(raw.encode()).hexdigest()}"


class LLMCacheKey(BaseModel):
    input_text: str
    intent_label: str | None = None
    bank_category: str | None = None
    entities: dict | None = None

    def cache_key(self) -> str:
        raw = json.dumps(self.model_dump(), sort_keys=True)
        return f"llm:{hashlib.sha256(raw.encode()).hexdigest()}"
