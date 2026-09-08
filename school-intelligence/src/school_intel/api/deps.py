from __future__ import annotations

from collections.abc import Generator
from typing import Annotated

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from school_intel.db.session import session_scope


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
