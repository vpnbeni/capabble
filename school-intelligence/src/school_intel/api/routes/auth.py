from __future__ import annotations

import hmac

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from school_intel.api.auth_tokens import create_session_token
from school_intel.api.deps import AuthUser, require_auth_user
from school_intel.config import Settings, get_settings

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class LoginResponse(BaseModel):
    token: str
    token_type: str = "bearer"
    username: str
    role: str
    expires_in: int


class MeResponse(BaseModel):
    username: str
    role: str
    auth_enabled: bool


def _secure_eq(left: str, right: str) -> bool:
    return hmac.compare_digest(left.encode("utf-8"), right.encode("utf-8"))


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, settings: Settings = Depends(get_settings)) -> LoginResponse:
    if not settings.schol_auth_enabled:
        raise HTTPException(
            status_code=503,
            detail="SCHOL login is not configured. Set SCHOL_DEV_PASSWORD in school-intelligence/.env",
        )

    expected_user = settings.schol_dev_username.strip()
    expected_pass = settings.schol_dev_password
    user_ok = _secure_eq(body.username.strip(), expected_user)
    pass_ok = _secure_eq(body.password, expected_pass)
    if not (user_ok and pass_ok):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    role = "admin"
    token = create_session_token(
        username=expected_user,
        role=role,
        secret=settings.schol_token_secret,
        ttl_seconds=settings.schol_dev_token_ttl_seconds,
    )
    return LoginResponse(
        token=token,
        username=expected_user,
        role=role,
        expires_in=settings.schol_dev_token_ttl_seconds,
    )


@router.get("/me", response_model=MeResponse)
def me(user: AuthUser = Depends(require_auth_user), settings: Settings = Depends(get_settings)) -> MeResponse:
    return MeResponse(
        username=user["username"],
        role=user["role"],
        auth_enabled=settings.schol_auth_enabled,
    )
