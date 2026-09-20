"""Probe KYS public frontend for legitimate school-search API contracts.

Investigation date: 2026-09-08. Re-verified 2026-09-21 via a manual, human-solved
browser session (see below) — the 2026-09-08 finding below was WRONG about a
search endpoint not existing; it was only probing the wrong paths.

Public app: https://kys.udiseplus.gov.in/

2026-09-08 finding (superseded): "Angular SPA bundles reference search UI tokens
(SearchKeyword, searchKeywordUdiseCode) but no unauthenticated JSON search
endpoints were discovered." The paths guessed in `_PROBED_SEARCH_PATHS` below
(all under `/web-app/api/school/...`) do all genuinely 404 — but they are not
the real search paths, so this was the wrong conclusion from a correct probe.

2026-09-21 correction: a real search API does exist, confirmed live via the
browser network log while a human manually solved the CAPTCHA on the KYS
frontend:
  - `GET /web-app/api/getCaptcha` → returns `{"data": "<base64 PNG>"}`, a real
    image CAPTCHA (not a decorative/plaintext check).
  - `GET /web-app/api/verifyCaptcha?captcha=<value>` → verifies the human's
    solved value against the current session's issued CAPTCHA.
  - `GET /web-app/api/search-schools?searchType=1&searchParam=<name>&captcha=<value>`
    → the actual search endpoint (also a typeahead at
    `/web-app/api/search-school/by-keyword?schoolName=<partial>`).

Because the CAPTCHA is a genuine image challenge validated server-side per
search, this is NOT something to automate — solving it programmatically would
be a CAPTCHA bypass. `_PROBED_SEARCH_PATHS` below is deliberately left as the
(non-existent, 404) paths from the original investigation, not the real
endpoint, so this module's `availability()`/`search()` continue to correctly
report "unavailable" rather than accidentally wiring up an automated call
against the CAPTCHA-gated endpoint. If a human-in-the-loop search feature is
ever built (a person solves the CAPTCHA themselves and the result is fed to
the KYS mapping resolver's injected-candidate path), it belongs in a separate,
explicitly manual code path — not here.

This module does NOT bypass CAPTCHA or invent endpoints.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Any, Protocol

import httpx

from school_intel.domain.kys_mapping import KysSearchCandidate

logger = logging.getLogger("school_intel.kys_search")

KYS_FRONTEND_BASE = "https://kys.udiseplus.gov.in"

# Paths probed from frontend bundle analysis — all genuinely 404 (they are not
# the real search paths). The real search endpoint is
# `/web-app/api/search-schools` (plural, no `/school/` prefix), gated by a
# real per-request image CAPTCHA (see module docstring) — deliberately NOT
# listed here, so this client keeps reporting "unavailable" instead of
# silently attempting a CAPTCHA-gated call.
_PROBED_SEARCH_PATHS = (
    "/web-app/api/school/searchSchool",
    "/web-app/api/school/search-school",
    "/web-app/api/search-school",
    "/web-app/api/school/search",
    "/web-app/api/school/searchByUdise",
    "/web-app/api/school/searchByName",
)


@dataclass
class KysSearchAvailability:
    programmatic_search_available: bool
    reason: str
    probed_paths: list[str]


class KysSearchClientProtocol(Protocol):
    def availability(self) -> KysSearchAvailability: ...

    def search(
        self,
        *,
        school_name: str | None = None,
        state: str | None = None,
        district: str | None = None,
        pin_code: str | None = None,
        udise: str | None = None,
    ) -> list[KysSearchCandidate]: ...


class KysSearchClient:
    """Best-effort KYS search client; returns empty when no public contract exists."""

    def __init__(self, client: httpx.Client | None = None) -> None:
        self._client = client or httpx.Client(
            timeout=15.0,
            headers={
                "Accept": "application/json",
                "User-Agent": "CapabbleSchoolIntel/0.3 (+https://capabble.cloud)",
            },
            follow_redirects=True,
        )
        self._availability: KysSearchAvailability | None = None

    def close(self) -> None:
        self._client.close()

    def availability(self) -> KysSearchAvailability:
        if self._availability is not None:
            return self._availability

        hits: list[str] = []
        for path in _PROBED_SEARCH_PATHS:
            url = f"{KYS_FRONTEND_BASE}{path}"
            try:
                response = self._client.get(url, params={"q": "test"})
                if response.status_code == 200:
                    hits.append(path)
            except httpx.HTTPError:
                continue

        if hits:
            self._availability = KysSearchAvailability(
                programmatic_search_available=True,
                reason=f"Responsive search paths: {hits}",
                probed_paths=list(_PROBED_SEARCH_PATHS),
            )
        else:
            self._availability = KysSearchAvailability(
                programmatic_search_available=False,
                reason=(
                    "A KYS school-search API exists (/web-app/api/search-schools) but requires "
                    "solving a real per-request image CAPTCHA, verified server-side — not safely "
                    "automatable. Only schoolId-based endpoints (report-card/profile) are used "
                    "programmatically; search remains a manual, human-in-the-loop step."
                ),
                probed_paths=list(_PROBED_SEARCH_PATHS),
            )
        return self._availability

    def search(
        self,
        *,
        school_name: str | None = None,
        state: str | None = None,
        district: str | None = None,
        pin_code: str | None = None,
        udise: str | None = None,
    ) -> list[KysSearchCandidate]:
        availability = self.availability()
        if not availability.programmatic_search_available:
            logger.info("kys_search_unavailable reason=%s", availability.reason)
            return []

        candidates: list[KysSearchCandidate] = []
        params: dict[str, Any] = {}
        if school_name:
            params["schoolName"] = school_name
        if state:
            params["stateName"] = state
        if district:
            params["districtName"] = district
        if pin_code:
            params["pincode"] = pin_code
        if udise:
            params["udiseCode"] = udise

        for path in _PROBED_SEARCH_PATHS:
            url = f"{KYS_FRONTEND_BASE}{path}"
            try:
                response = self._client.get(url, params=params)
            except httpx.HTTPError:
                continue
            if response.status_code != 200:
                continue
            try:
                payload = response.json()
            except Exception:
                continue
            candidates.extend(self._parse_candidates(payload))
            if candidates:
                break

        return candidates

    @staticmethod
    def _parse_candidates(payload: Any) -> list[KysSearchCandidate]:
        if not isinstance(payload, dict):
            return []
        rows = payload.get("data") or payload.get("schools") or payload.get("result")
        if not isinstance(rows, list):
            return []

        out: list[KysSearchCandidate] = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            school_id = row.get("schoolId") or row.get("school_id")
            if school_id is None:
                continue
            out.append(
                KysSearchCandidate(
                    kys_school_id=str(school_id).strip(),
                    udise=str(row.get("udiseschCode") or row.get("udise") or "").strip() or None,
                    school_name=str(row.get("schoolName") or row.get("schName") or "").strip() or None,
                    district=str(row.get("districtName") or "").strip() or None,
                    state=str(row.get("stateName") or "").strip() or None,
                    pin_code=str(row.get("pincode") or row.get("pinCode") or "").strip() or None,
                    address_line=str(row.get("address") or "").strip() or None,
                    raw=row,
                )
            )
        return out


def is_valid_kys_school_id(value: str) -> bool:
    return bool(re.fullmatch(r"\d+", value.strip()))
