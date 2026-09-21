from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Any


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def create_session_token(
    *,
    username: str,
    role: str,
    secret: str,
    ttl_seconds: int,
) -> str:
    now = int(time.time())
    payload = {
        "u": username,
        "r": role,
        "iat": now,
        "exp": now + max(60, ttl_seconds),
    }
    body = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    sig = hmac.new(secret.encode("utf-8"), body.encode("ascii"), hashlib.sha256).hexdigest()
    return f"{body}.{sig}"


def verify_session_token(token: str, secret: str) -> dict[str, Any]:
    try:
        body, sig = token.rsplit(".", 1)
    except ValueError as exc:
        raise ValueError("Malformed token") from exc

    expected = hmac.new(secret.encode("utf-8"), body.encode("ascii"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        raise ValueError("Invalid token signature")

    try:
        payload = json.loads(_b64url_decode(body).decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise ValueError("Invalid token payload") from exc

    exp = int(payload.get("exp") or 0)
    if exp < int(time.time()):
        raise ValueError("Token expired")

    username = str(payload.get("u") or "").strip()
    role = str(payload.get("r") or "admin").strip() or "admin"
    if not username:
        raise ValueError("Token missing username")

    return {"username": username, "role": role, "exp": exp}
