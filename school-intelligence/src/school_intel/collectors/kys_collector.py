from __future__ import annotations

import logging
import random
import time
from datetime import datetime, timezone
from typing import Any

import httpx

from school_intel.collectors.base import logger
from school_intel.collectors.endpoints import (
    KYS_API_PATH,
    KYS_SCHOOL_API_PATH,
    SCHOOL_BY_YEAR,
    SCHOOL_FACILITY,
    SCHOOL_PROFILE,
    SCHOOL_REPORT_CARD,
    SOCIAL_DATA,
    YEAR_DISCOVERY_MAX_YEAR_ID,
)
from school_intel.collectors.rate_limiter import get_kys_rate_limiter
from school_intel.config import get_settings
from school_intel.domain.collection import AcademicYearMapping
from school_intel.domain.enums import DataSource, KysEndpoint
from school_intel.domain.schemas import SourceFetchRequest, SourceFetchResult
from school_intel.utils.text import payload_checksum

RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}


class KysApiError(Exception):
    def __init__(self, message: str, http_status: int | None = None, payload: dict | None = None) -> None:
        super().__init__(message)
        self.http_status = http_status
        self.payload = payload or {}


class KysCollector:
    """Live KYS (UDISE+) collector. Stores raw JSON only; parsing is separate."""

    source = DataSource.KYS.value

    ANNUAL_ENDPOINTS: tuple[KysEndpoint, ...] = (
        KysEndpoint.REPORT_CARD,
        KysEndpoint.PROFILE,
        KysEndpoint.FACILITY,
        KysEndpoint.SOCIAL_DATA_1,
        KysEndpoint.SOCIAL_DATA_2,
        KysEndpoint.SOCIAL_DATA_3,
        KysEndpoint.SOCIAL_DATA_4,
        KysEndpoint.SOCIAL_DATA_5,
    )

    def __init__(self, client: httpx.Client | None = None) -> None:
        settings = get_settings()
        self._settings = settings
        base_url = settings.kys_base_url.rstrip("/")
        self._school_api_base = f"{base_url}/{KYS_SCHOOL_API_PATH}"
        self._api_base = f"{base_url}/{KYS_API_PATH}"
        self._client = client or httpx.Client(
            timeout=settings.http_timeout_seconds,
            headers={
                "Accept": "application/json",
                "User-Agent": "CapabbleSchoolIntel/0.2 (+https://capabble.cloud)",
            },
            follow_redirects=True,
        )

    def close(self) -> None:
        self._client.close()

    def build_idempotency_key(
        self,
        endpoint: str,
        school_id: str,
        year_id: int,
        flag: int | None = None,
    ) -> str:
        flag_part = f"|flag={flag}" if flag is not None else ""
        return f"kys|{endpoint}|{school_id}|yearId={year_id}{flag_part}"

    def _rate_limit(self) -> None:
        get_kys_rate_limiter().wait(self._settings.kys_request_delay_seconds)

    def _request_with_retry(self, url: str, params: dict[str, Any]) -> httpx.Response:
        max_attempts = max(self._settings.http_max_retries, 1)
        last_exc: Exception | None = None

        for attempt in range(1, max_attempts + 1):
            self._rate_limit()
            try:
                logger.info("kys_fetch url=%s params=%s attempt=%s", url, params, attempt)
                response = self._client.get(url, params=params)

                if response.status_code == 403:
                    logger.warning("kys_blocked_or_challenged url=%s params=%s", url, params)

                if response.status_code in RETRYABLE_STATUS_CODES and attempt < max_attempts:
                    backoff = min(2 ** attempt + random.uniform(0, 1), 30)
                    logger.warning(
                        "kys_retryable_status status=%s url=%s backoff=%.2fs",
                        response.status_code,
                        url,
                        backoff,
                    )
                    time.sleep(backoff)
                    continue

                return response
            except (httpx.TimeoutException, httpx.ConnectError, httpx.ReadError) as exc:
                last_exc = exc
                if attempt >= max_attempts:
                    raise
                backoff = min(2 ** attempt + random.uniform(0, 1), 30)
                logger.warning("kys_transient_error error=%s backoff=%.2fs", exc, backoff)
                time.sleep(backoff)

        if last_exc:
            raise last_exc
        raise RuntimeError("KYS request failed without response")

    def _parse_json_response(self, response: httpx.Response) -> dict[str, Any]:
        try:
            payload = response.json()
        except Exception:
            return {"_raw_text": response.text, "_parse_error": True}
        if not isinstance(payload, dict):
            return {"_raw_value": payload, "_parse_error": True}
        return payload

    def is_api_success(self, payload: dict[str, Any], http_status: int) -> bool:
        if http_status != 200:
            return False
        if payload.get("_parse_error"):
            return False
        if payload.get("status") is False:
            return False
        if payload.get("error"):
            return False
        return True

    def _fetch_latest_year_id(self, school_id: str) -> int | None:
        """Look up the school's current/latest yearId in a single call.

        `SCHOOL_BY_YEAR` with action=1 returns only the current year (no
        historical list), so this only bounds the probe range below — it
        does not replace the per-year report-card probing.
        """
        url = f"{self._school_api_base}/{SCHOOL_BY_YEAR}"
        response = self._request_with_retry(url, {"schoolId": school_id, "action": 1})
        if response.status_code != 200:
            return None
        payload = self._parse_json_response(response)
        if not self.is_api_success(payload, response.status_code):
            return None
        data = payload.get("data")
        if not isinstance(data, dict):
            return None
        year_id = data.get("yearId")
        try:
            return int(year_id)
        except (TypeError, ValueError):
            return None

    def discover_academic_years(self, school_id: str) -> list[AcademicYearMapping]:
        """Discover available academic years by probing report-card for candidate yearIds.

        Bounded by the school's latest known yearId (via SCHOOL_BY_YEAR) when
        available, instead of always probing all the way to
        YEAR_DISCOVERY_MAX_YEAR_ID — this avoids wasted rate-limited requests
        for schools whose latest year is well below the cap.
        """
        discovered: dict[str, AcademicYearMapping] = {}

        latest_year_id = self._fetch_latest_year_id(school_id)
        max_year_id = YEAR_DISCOVERY_MAX_YEAR_ID
        if latest_year_id is not None and 0 < latest_year_id < YEAR_DISCOVERY_MAX_YEAR_ID:
            max_year_id = latest_year_id

        consecutive_misses = 0
        for year_id in range(1, max_year_id + 1):
            url = f"{self._school_api_base}/{SCHOOL_REPORT_CARD}"
            response = self._request_with_retry(url, {"schoolId": school_id, "yearId": year_id})
            hit = False
            if response.status_code == 200:
                payload = self._parse_json_response(response)
                if self.is_api_success(payload, response.status_code):
                    data = payload.get("data")
                    if isinstance(data, dict):
                        year_desc = data.get("yearDesc")
                        response_year_id = data.get("yearId")
                        year_id_matches = response_year_id is None or int(response_year_id) == year_id
                        if year_desc and year_id_matches:
                            academic_year = str(year_desc).strip()
                            if academic_year not in discovered:
                                discovered[academic_year] = AcademicYearMapping(
                                    year_id=year_id,
                                    year_desc=academic_year,
                                    academic_year=academic_year,
                                )
                            hit = True

            if hit:
                consecutive_misses = 0
                continue

            consecutive_misses += 1
            # Academic years are contiguous in the normal case; once we've
            # found at least one and then miss a few in a row, further
            # probing is very unlikely to find more and just costs
            # rate-limited requests. If this cap is ever hit without an
            # early break, log it so a genuine gap-year case is diagnosable
            # rather than silently truncated.
            if discovered and consecutive_misses >= 3:
                break
        else:
            if discovered and max_year_id >= YEAR_DISCOVERY_MAX_YEAR_ID:
                logger.warning(
                    "kys_year_discovery_exhausted_range school_id=%s max_year_id=%s",
                    school_id,
                    max_year_id,
                )

        return sorted(discovered.values(), key=lambda y: y.year_id)

    def fetch_report_card(self, school_id: str, year_id: int) -> SourceFetchResult:
        return self._fetch_school_endpoint(SCHOOL_REPORT_CARD, school_id, year_id)

    def fetch_profile(self, school_id: str, year_id: int) -> SourceFetchResult:
        return self._fetch_school_endpoint(SCHOOL_PROFILE, school_id, year_id)

    def fetch_facility(self, school_id: str, year_id: int) -> SourceFetchResult:
        return self._fetch_school_endpoint(SCHOOL_FACILITY, school_id, year_id)

    def fetch_social_data(self, school_id: str, year_id: int, flag: int) -> SourceFetchResult:
        url = f"{self._api_base}/{SOCIAL_DATA}"
        params = {"flag": flag, "schoolId": school_id, "yearId": year_id}
        response = self._request_with_retry(url, params)
        payload = self._parse_json_response(response)
        return SourceFetchResult(
            raw_payload=payload,
            payload_checksum=payload_checksum(payload),
            http_status=response.status_code,
            fetched_at=datetime.now(timezone.utc),
            endpoint=f"getSocialData:{flag}",
            request_params=params,
        )

    def _fetch_school_endpoint(self, endpoint: str, school_id: str, year_id: int) -> SourceFetchResult:
        url = f"{self._school_api_base}/{endpoint}"
        params = {"schoolId": school_id, "yearId": year_id}
        response = self._request_with_retry(url, params)
        payload = self._parse_json_response(response)
        return SourceFetchResult(
            raw_payload=payload,
            payload_checksum=payload_checksum(payload),
            http_status=response.status_code,
            fetched_at=datetime.now(timezone.utc),
            endpoint=endpoint,
            request_params=params,
        )

    def fetch(self, request: SourceFetchRequest) -> SourceFetchResult:
        """Legacy interface — delegates to typed fetch methods."""
        params = request.request_params or {}
        school_id = str(params.get("schoolId") or params.get("school_id") or "")
        year_id = int(params.get("yearId") or params.get("year_id") or params.get("year") or 0)

        if request.endpoint == KysEndpoint.REPORT_CARD.value:
            return self.fetch_report_card(school_id, year_id)
        if request.endpoint == KysEndpoint.PROFILE.value:
            return self.fetch_profile(school_id, year_id)
        if request.endpoint == KysEndpoint.FACILITY.value:
            return self.fetch_facility(school_id, year_id)
        if request.endpoint.startswith("getSocialData:"):
            flag = int(request.endpoint.split(":", 1)[1])
            return self.fetch_social_data(school_id, year_id, flag)

        raise ValueError(f"Unsupported KYS endpoint: {request.endpoint}")

    def annual_requests(self, school_id: str, year_id: int, academic_year: str) -> list[SourceFetchRequest]:
        base_params = {"schoolId": school_id, "yearId": year_id}
        requests: list[SourceFetchRequest] = []
        for endpoint in self.ANNUAL_ENDPOINTS:
            params = dict(base_params)
            if endpoint.value.startswith("getSocialData:"):
                params["flag"] = int(endpoint.value.split(":", 1)[1])
            requests.append(
                SourceFetchRequest(
                    source=DataSource.KYS,
                    endpoint=endpoint.value,
                    academic_year=academic_year,
                    request_params=params,
                    idempotency_key=self.build_idempotency_key(
                        endpoint.value,
                        school_id,
                        year_id,
                        flag=params.get("flag"),
                    ),
                )
            )
        return requests

    def fetch_identity_reference(
        self, school_id: str
    ) -> tuple[AcademicYearMapping, list[AcademicYearMapping], SourceFetchResult, SourceFetchResult]:
        """Fetch authoritative identity payloads from the latest discovered academic year."""
        years = self.discover_academic_years(school_id)
        if not years:
            raise ValueError(f"No academic years discovered for KYS school {school_id}")

        latest = max(years, key=lambda mapping: mapping.year_id)
        report = self.fetch_report_card(school_id, latest.year_id)
        profile = self.fetch_profile(school_id, latest.year_id)
        if not self.is_api_success(report.raw_payload, report.http_status or 0):
            raise ValueError(f"KYS report-card unavailable for school {school_id} year {latest.academic_year}")
        if not self.is_api_success(profile.raw_payload, profile.http_status or 0):
            raise ValueError(f"KYS profile unavailable for school {school_id} year {latest.academic_year}")
        return latest, years, report, profile
