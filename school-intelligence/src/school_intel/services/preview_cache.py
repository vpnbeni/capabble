"""Short-TTL cache for the full (unpaginated) district preview result.

The preview flow pays for one SARAS directory fetch plus a per-school
identity/assessment pass over every row in the district. Paginating the
*response* alone would still re-pay that full cost on every page turn. This
cache lets a page-turn for the same geography/year/data-group combination
reuse the already-computed result and just re-slice it.
"""

from __future__ import annotations

import threading
import time


class PreviewCache:
    def __init__(self, ttl_seconds: float = 600.0) -> None:
        self._lock = threading.Lock()
        self._ttl = ttl_seconds
        self._store: dict[str, tuple[float, dict]] = {}

    @staticmethod
    def make_key(
        state_id: str,
        district_id: str,
        year_from: str,
        year_to: str,
        data_groups: list[str],
    ) -> str:
        return "|".join(
            [state_id, district_id, year_from, year_to, ",".join(sorted(data_groups))]
        )

    def get(self, key: str) -> dict | None:
        with self._lock:
            entry = self._store.get(key)
            if not entry:
                return None
            expires_at, value = entry
            if time.monotonic() > expires_at:
                del self._store[key]
                return None
            return value

    def set(self, key: str, value: dict) -> None:
        with self._lock:
            self._store[key] = (time.monotonic() + self._ttl, value)


_PREVIEW_CACHE = PreviewCache()


def get_preview_cache() -> PreviewCache:
    return _PREVIEW_CACHE
