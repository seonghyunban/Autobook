from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class UserRole(StrEnum):
    REGULAR = "regular"
    MANAGER = "manager"
    SUPERUSER = "superuser"


class TokenPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    sub: str
    exp: int
    iat: int
    iss: str
    token_use: str
    email: str | None = None
    username: str | None = Field(default=None, alias="cognito:username")
    cognito_groups: list[str] = Field(default_factory=list, alias="cognito:groups")
    custom_role: str | None = Field(default=None, alias="custom:role")
    aud: str | None = None
    client_id: str | None = None
    name: str | None = None


class AuthMeResponse(BaseModel):
    id: str
    cognito_sub: str
    email: str
    username: str | None = None
    role: str
    role_source: str
    token_use: str


class AuthLogoutUrlResponse(BaseModel):
    logout_url: str


class AuthRefreshRequest(BaseModel):
    refresh_token: str


class PasswordLoginRequest(BaseModel):
    email: str
    password: str


class AuthTokenResponse(BaseModel):
    access_token: str
    token_type: str
    expires_in: int
    id_token: str | None = None
    refresh_token: str | None = None


class AuthValidateResponse(BaseModel):
    authenticated: bool
    user: AuthMeResponse
