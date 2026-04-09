from __future__ import annotations

import logging
from urllib.parse import urlencode

import boto3
import httpx
from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends, HTTPException, Query, status

from auth.deps import AuthContext, get_current_user
from config import Settings, get_settings
from schemas.auth import (
    AuthLogoutUrlResponse,
    AuthMeResponse,
    AuthRefreshRequest,
    AuthTokenResponse,
    AuthValidateResponse,
    PasswordLoginRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1")


@router.post("/auth/password-login", response_model=AuthTokenResponse)
async def password_login(body: PasswordLoginRequest):
    """Server-side email/password sign-in — the only live login path.

    Calls Cognito InitiateAuth with the USER_PASSWORD_AUTH flow on the
    user's behalf and returns the JWT bundle. The frontend's custom
    login page posts here. Errors collapse to a single 401 to avoid
    leaking whether the email exists.
    """
    settings = get_settings()
    client = boto3.client(
        "cognito-idp",
        region_name=settings.AWS_REGION or settings.AWS_DEFAULT_REGION,
    )
    try:
        response = client.initiate_auth(
            ClientId=settings.COGNITO_CLIENT_ID,
            AuthFlow="USER_PASSWORD_AUTH",
            AuthParameters={
                "USERNAME": body.email,
                "PASSWORD": body.password,
            },
        )
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code")
        if code in {"NotAuthorizedException", "UserNotFoundException", "UserNotConfirmedException"}:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password.",
            ) from exc
        logger.exception("Cognito password login failed: %s", code)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Authentication service unavailable.",
        ) from exc

    auth_result = response.get("AuthenticationResult")
    if not auth_result:
        # ChallengeName means Cognito wants something extra (MFA, password reset, etc.).
        # We don't support those flows in this minimal endpoint yet.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    return AuthTokenResponse(
        access_token=auth_result["AccessToken"],
        token_type=auth_result.get("TokenType", "Bearer"),
        expires_in=auth_result.get("ExpiresIn", 3600),
        id_token=auth_result.get("IdToken"),
        refresh_token=auth_result.get("RefreshToken"),
    )


@router.post("/auth/refresh", response_model=AuthTokenResponse)
async def refresh_token(body: AuthRefreshRequest):
    """Exchange a refresh token for a new access token."""
    payload = await _exchange_token(
        {
            "grant_type": "refresh_token",
            "client_id": get_settings().COGNITO_CLIENT_ID,
            "refresh_token": body.refresh_token,
        }
    )
    return AuthTokenResponse(**payload)


@router.get("/auth/logout-url", response_model=AuthLogoutUrlResponse)
async def get_logout_url(logout_uri: str = Query(...)):
    """Build the Cognito /logout URL that clears the server-side session
    cookie, then redirects the browser back to ``logout_uri``. The
    frontend's Logout button follows this URL to fully sign out."""
    settings = get_settings()
    cognito_domain = _get_cognito_domain(settings)
    params = {
        "client_id": settings.COGNITO_CLIENT_ID,
        "logout_uri": logout_uri,
    }
    return AuthLogoutUrlResponse(logout_url=f"{cognito_domain}/logout?{urlencode(params)}")


@router.get("/auth/validate", response_model=AuthValidateResponse)
async def validate_token(current_user: AuthContext = Depends(get_current_user)):
    return AuthValidateResponse(
        authenticated=True,
        user=_serialize_auth_me(current_user),
    )


@router.get("/auth/me", response_model=AuthMeResponse)
async def get_me(current_user: AuthContext = Depends(get_current_user)):
    return _serialize_auth_me(current_user)


# ── helpers ──────────────────────────────────────────────────────────────


def _serialize_auth_me(current_user: AuthContext) -> AuthMeResponse:
    return AuthMeResponse(
        id=str(current_user.user.id),
        cognito_sub=current_user.user.cognito_sub,
        email=current_user.user.email,
        role=current_user.role.value,
        role_source=current_user.role_source,
        token_use=current_user.claims.token_use,
    )


def _get_cognito_domain(settings: Settings) -> str:
    if not settings.COGNITO_DOMAIN:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cognito hosted domain is not configured.",
        )
    if settings.COGNITO_DOMAIN.startswith("http://") or settings.COGNITO_DOMAIN.startswith("https://"):
        return settings.COGNITO_DOMAIN.rstrip("/")
    return f"https://{settings.COGNITO_DOMAIN.rstrip('/')}"


async def _exchange_token(form_data: dict[str, str]) -> dict[str, object]:  # pragma: no cover
    settings = get_settings()
    cognito_domain = _get_cognito_domain(settings)
    token_url = f"{cognito_domain}/oauth2/token"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                token_url,
                data=form_data,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to reach Cognito token endpoint.",
        ) from exc

    if response.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Cognito token exchange failed.",
        )

    payload = response.json()
    payload.setdefault("token_type", "Bearer")
    return payload
