import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

logging.basicConfig(level=logging.INFO)
from fastapi.middleware.cors import CORSMiddleware

from auth.token_service import decode_access_token
from config import get_settings
from queues.pubsub.client import get_redis


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    app.state.redis = await get_redis(settings.REDIS_URL)
    yield
    await app.state.redis.aclose()


settings = get_settings()
app = FastAPI(title="Autobook API", version="0.1.0", lifespan=lifespan)

# ── Default-deny auth ────────────────────────────────────
# Every request must carry a valid Cognito JWT. Paths in PUBLIC_PATHS
# are exempt: health checks, OpenAPI docs, the Cognito hosted UI URL
# builders (pre-login), the token exchange endpoint, and the signup
# endpoint (which returns its own 403 to anyone who reaches it).
#
# Route handlers that need the user object keep `Depends(get_current_user)`
# — FastAPI deduplicates dependencies per request, so the token is only
# decoded once.

PUBLIC_PATHS = frozenset({
    "/health",
    "/docs",
    "/redoc",
    "/openapi.json",
    "/api/v1/auth/logout-url",
    "/api/v1/auth/refresh",
    "/api/v1/auth/password-login",
    # SSE — the events route does its own auth via the access_token
    # query param because EventSource can't send custom headers.
    "/api/v1/events",
})


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    # CORS preflights always allowed — the CORS middleware handles them,
    # but it runs after this one. Letting OPTIONS through avoids blocking
    # the preflight with a 401.
    if request.method == "OPTIONS":
        return await call_next(request)

    if request.url.path in PUBLIC_PATHS:
        return await call_next(request)

    auth_header = request.headers.get("authorization")
    if not auth_header or not auth_header.lower().startswith("bearer "):
        return JSONResponse(
            {"detail": "Missing bearer token."},
            status_code=401,
        )

    token = auth_header[len("bearer "):].strip()
    if not token:
        return JSONResponse(
            {"detail": "Missing bearer token."},
            status_code=401,
        )

    try:
        decode_access_token(token)
    except ValueError as exc:
        return JSONResponse(
            {"detail": str(exc)},
            status_code=401,
        )

    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from api.routes.health import router as health_router
from api.routes.auth import router as auth_router
from api.routes.events import router as events_router
from api.routes.llm import router as llm_router
from api.routes.corrections import router as corrections_router
from api.routes.drafts import router as drafts_router
from api.routes.entities import router as entities_router
from api.routes.taxonomy import router as taxonomy_router
app.include_router(health_router)
app.include_router(auth_router)
app.include_router(corrections_router)
app.include_router(drafts_router)
app.include_router(entities_router)
app.include_router(events_router)
app.include_router(llm_router)
app.include_router(taxonomy_router)
