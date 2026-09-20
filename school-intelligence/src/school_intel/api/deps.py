from __future__ import annotations

from collections.abc import Generator
from typing import Annotated, Any, TypedDict

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from school_intel.api.auth_tokens import verify_session_token
from school_intel.config import get_settings
from school_intel.db.session import session_scope


class AuthUser(TypedDict):
    username: str
    role: str


def get_db() -> Generator[Session, None, None]:
    with session_scope() as session:
        yield session


DbSession = Annotated[Session, Depends(get_db)]


def get_schol_role(x_schol_role: Annotated[str | None, Header()] = None) -> str:
    return (x_schol_role or "viewer").lower()


ScholRole = Annotated[str, Depends(get_schol_role)]


def require_raw_access(role: ScholRole) -> str:
    if role not in {"admin", "analyst"}:
        raise HTTPException(status_code=403, detail="Unauthorized for raw data access")
    return role


def require_collection_access(role: ScholRole) -> str:
    if role not in {"admin", "analyst"}:
        raise HTTPException(status_code=403, detail="Unauthorized for collection operations")
    return role


def _extract_bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    return token.strip()


def require_auth_user(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
) -> AuthUser:
    settings = get_settings()
    if not settings.schol_auth_enabled:
        # Auth disabled: treat as local open mode for bootstrapping.
        return {"username": settings.schol_dev_username or "capabble", "role": "admin"}

    token = _extract_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required", headers={"WWW-Authenticate": "Bearer"})

    try:
        payload = verify_session_token(token, settings.schol_token_secret)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc), headers={"WWW-Authenticate": "Bearer"}) from exc

    # Stash for middleware / handlers that want the user without re-parsing.
    request.state.schol_user = payload
    return {"username": payload["username"], "role": payload["role"]}


def auth_is_public_path(path: str) -> bool:
    if path in {"/api/health", "/api/auth/login", "/docs", "/openapi.json", "/redoc"}:
        return True
    if path.startswith("/docs/") or path.startswith("/redoc/"):
        return True
    return False


async def enforce_schol_auth(request: Request, call_next: Any):
    settings = get_settings()
    if not settings.schol_auth_enabled or auth_is_public_path(request.url.path):
        return await call_next(request)

    token = _extract_bearer(request.headers.get("authorization"))
    if not token:
        from fastapi.responses import JSONResponse

        return JSONResponse(
            status_code=401,
            content={"detail": "Authentication required"},
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = verify_session_token(token, settings.schol_token_secret)
    except ValueError as exc:
        from fastapi.responses import JSONResponse

        return JSONResponse(
            status_code=401,
            content={"detail": str(exc)},
            headers={"WWW-Authenticate": "Bearer"},
        )

    request.state.schol_user = payload
    return await call_next(request)
