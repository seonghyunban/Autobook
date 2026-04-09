"""Resolve the Qdrant API key from whichever source the current environment
provides — Lambda, ECS, or local docker-compose. Mirrors the pattern in
`db/credentials.py`.

Resolution order:

1. Lambda deployed (`QDRANT_API_KEY_SECRET_ARN` env var present)
   → fetch the secret value from AWS Secrets Manager via boto3 once,
   cache for the container lifetime via `@lru_cache`.

2. ECS deployed
   → ECS task agent has already injected `QDRANT_API_KEY` from the task
   definition's `secrets` block; we just read the env var.

3. Local docker-compose
   → `QDRANT_API_KEY` is set to "" by compose because the local Qdrant
   container needs no auth. Returning `None` here makes the Qdrant
   client connect unauthenticated.

Application code calls `get_qdrant_api_key()` and never sees which
branch fired.
"""
from __future__ import annotations

import json
import os
from functools import lru_cache


@lru_cache
def get_qdrant_api_key() -> str | None:
    """Return the Qdrant API key for the current environment, or None.

    Returns None when no key is configured (local Qdrant container) so
    the Qdrant client connects without auth.
    """
    secret_arn = os.environ.get("QDRANT_API_KEY_SECRET_ARN")
    if secret_arn:
        return _fetch_from_secrets_manager(secret_arn)

    # ECS / local: env var is either injected by the ECS task `secrets`
    # block or set by docker-compose. Empty string → no key.
    value = os.environ.get("QDRANT_API_KEY")
    return value or None


def _fetch_from_secrets_manager(secret_arn: str) -> str:  # pragma: no cover
    """Fetch the Qdrant API key from AWS Secrets Manager.

    Called only on Lambda cold start. The result is cached for the
    container lifetime by the `@lru_cache` on `get_qdrant_api_key`.
    """
    import boto3

    client = boto3.client(
        "secretsmanager",
        region_name=os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION"),
    )
    response = client.get_secret_value(SecretId=secret_arn)
    secret_string = response["SecretString"]

    # The secret may be stored as a plain string or as a JSON object with
    # a single field. Handle both shapes for forward compatibility.
    try:
        parsed = json.loads(secret_string)
        if isinstance(parsed, dict) and "api_key" in parsed:
            return parsed["api_key"]
    except (ValueError, TypeError):
        pass
    return secret_string
