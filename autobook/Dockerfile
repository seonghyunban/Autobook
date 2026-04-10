# syntax=docker/dockerfile:1

# ── autobook-base ──────────────────────────────────────────────
# Shared by all services: pydantic, redis, boto3
FROM python:3.12-slim AS autobook-base

COPY --from=ghcr.io/astral-sh/uv:0.10 /uv /uvx /bin/

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy

# Deps layer (cached until pyproject.toml or uv.lock changes)
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

# Shared source
COPY backend/config.py backend/config.py
COPY backend/auth/ backend/auth/
COPY backend/db/ backend/db/
COPY backend/queues/ backend/queues/
COPY backend/cache/ backend/cache/
COPY backend/utils/ backend/utils/
COPY backend/schemas/ backend/schemas/
COPY backend/services/__init__.py backend/services/__init__.py
COPY backend/services/shared/ backend/services/shared/
COPY backend/vectordb/ backend/vectordb/
COPY backend/workers/ backend/workers/

RUN groupadd -g 1001 app && useradd -u 1001 -g app -s /bin/false app
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONPATH="/app/backend"

# ── autobook-accounting ────────────────────────────────────────
# Shared layer for services that need accounting engine
FROM autobook-base AS autobook-accounting

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project --extra accounting

COPY backend/accounting_engine/ backend/accounting_engine/

# ── API Service ────────────────────────────────────────────────
FROM autobook-base AS autobook-api

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project --extra api

COPY backend/api/ backend/api/
COPY backend/services/llm_interaction/ backend/services/llm_interaction/
COPY backend/services/resolution/ backend/services/resolution/
COPY backend/ripple_through/ backend/ripple_through/
USER app
EXPOSE 8000
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]

# ── Fast-Path Worker (ECS, normalization + SQS polling) ───────
FROM autobook-base AS autobook-fast-path

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project --extra fast-path

COPY backend/services/normalization/ backend/services/normalization/
USER app
CMD ["python", "-c", "from workers.normalization import main; main()"]

# ── Agent / LLM Worker (Lambda, SnapStart) ────────────────────
# Local dev uses this image. Prod uses zip deploy for SnapStart.
FROM autobook-accounting AS autobook-agent

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project --extra agent --extra flywheel

COPY backend/services/agent/ backend/services/agent/
COPY backend/services/normalization/ backend/services/normalization/
COPY backend/services/posting/ backend/services/posting/
COPY backend/services/flywheel/ backend/services/flywheel/
COPY backend/services/precedent/ backend/services/precedent/

ENTRYPOINT ["python", "-m", "awslambdaric"]
CMD ["workers.agent.handler"]
