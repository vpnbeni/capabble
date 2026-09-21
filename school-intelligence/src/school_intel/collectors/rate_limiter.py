"""Process-wide rate limiters shared across all collector instances.

Each `KysCollector`/`SarasCollector` previously tracked its own "time since last
request" on the instance, so concurrent requests (e.g. an interactive preview
click overlapping a background collection run) could multiply the effective
request rate against the same external site. These module-level singletons make
the throttle process-wide instead.
"""

from __future__ import annotations

import threading
import time


class SharedRateLimiter:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._last_request_at = 0.0

    def wait(self, delay_seconds: float) -> None:
        with self._lock:
            delay = max(delay_seconds, 0.0)
            elapsed = time.monotonic() - self._last_request_at
            if elapsed < delay:
                time.sleep(delay - elapsed)
            self._last_request_at = time.monotonic()


_KYS_LIMITER = SharedRateLimiter()
_SARAS_LIMITER = SharedRateLimiter()


def get_kys_rate_limiter() -> SharedRateLimiter:
    return _KYS_LIMITER


def get_saras_rate_limiter() -> SharedRateLimiter:
    return _SARAS_LIMITER
