from __future__ import annotations

import json
import logging
import random
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import httpx
from bs4 import BeautifulSoup

from school_intel.collectors.rate_limiter import get_saras_rate_limiter
from school_intel.collectors.saras_endpoints import (
    KNOWN_STATE_IDS,
    SARAS_DETAIL_PATH,
    SARAS_DIRECTORY_PATH,
    SARAS_DISTRICT_BIND_PATH,
)
from school_intel.config import get_settings
from school_intel.domain.enums import SarasSearchMode
from school_intel.utils.text import payload_checksum

logger = logging.getLogger("school_intel.collectors.saras")

RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}


class SarasBlockedError(RuntimeError):
    """Raised when SARAS appears to be rate-limiting, challenging, or otherwise
    rejecting requests in a way that isn't a plain transient server error."""

    def __init__(self, message: str, http_status: int | None = None) -> None:
        super().__init__(message)
        self.http_status = http_status


@dataclass
class SarasFetchResult:
    html: str
    http_status: int
    url: str
    request_params: dict[str, Any]
    fetched_at: datetime
    payload_checksum: str


class SarasCollector:
    """CBSE SARAS affiliated-school directory collector."""

    source = "saras"

    def __init__(self, client: httpx.Client | None = None) -> None:
        settings = get_settings()
        self._settings = settings
        self._base_url = settings.saras_base_url.rstrip("/")
        self._client = client or httpx.Client(
            timeout=settings.http_timeout_seconds,
            headers={
                "User-Agent": "CapabbleSchoolIntel/0.3 (+https://capabble.cloud)",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Referer": f"{self._base_url}/saras/Home/Category_Wise",
            },
            follow_redirects=True,
        )
        self._form_tokens: dict[str, str] | None = None

    def close(self) -> None:
        self._client.close()

    def _rate_limit(self) -> None:
        get_saras_rate_limiter().wait(self._settings.saras_request_delay_seconds)

    def _request(self, method: str, url: str, **kwargs) -> httpx.Response:
        max_attempts = max(self._settings.http_max_retries, 1)
        for attempt in range(1, max_attempts + 1):
            self._rate_limit()
            try:
                response = self._client.request(method, url, **kwargs)
                if response.status_code in RETRYABLE_STATUS_CODES and attempt < max_attempts:
                    time.sleep(min(2 ** attempt + random.uniform(0, 1), 30))
                    continue
                return response
            except (httpx.TimeoutException, httpx.ConnectError, httpx.ReadError):
                if attempt >= max_attempts:
                    raise
                time.sleep(min(2 ** attempt + random.uniform(0, 1), 30))
        raise RuntimeError("SARAS request failed")

    def refresh_form_tokens(self) -> dict[str, str]:
        url = f"{self._base_url}{SARAS_DIRECTORY_PATH}"
        response = self._request("GET", url)
        if response.status_code != 200:
            logger.warning(
                "saras_blocked_or_challenged context=refresh_form_tokens status=%s",
                response.status_code,
            )
            raise SarasBlockedError(
                f"SARAS form fetch failed: HTTP {response.status_code}",
                http_status=response.status_code,
            )
        soup = BeautifulSoup(response.text, "html.parser")
        token = soup.find("input", {"name": "__RequestVerificationToken"})
        ncform = soup.find("input", {"name": "__ncforminfo"})
        if not token or not ncform:
            logger.warning(
                "saras_blocked_or_challenged context=refresh_form_tokens status=%s reason=tokens_not_found",
                response.status_code,
            )
            raise SarasBlockedError(
                "SARAS anti-forgery tokens not found — the site may be challenging or rate-limiting requests",
                http_status=response.status_code,
            )
        self._form_tokens = {
            "__RequestVerificationToken": token.get("value", ""),
            "__ncforminfo": ncform.get("value", ""),
        }
        return self._form_tokens

    def _base_form_data(self) -> dict[str, str]:
        if not self._form_tokens:
            self.refresh_form_tokens()
        return {
            **self._form_tokens,
            "RegiAffNo": "0",
        }

    def _looks_like_token_failure(self, response: httpx.Response) -> bool:
        if response.status_code == 403:
            return True
        if response.status_code == 200 and response.request.method == "POST":
            text_lower = response.text[:2000].lower()
            if "__requestverificationtoken" in text_lower and "invalid" in text_lower:
                return True
        return False

    def _post_directory_form(self, data: dict[str, str]) -> httpx.Response:
        url = f"{self._base_url}{SARAS_DIRECTORY_PATH}"
        return self._request("POST", url, data=data)

    def _post_directory_form_with_token_retry(self, data: dict[str, str]) -> httpx.Response:
        response = self._post_directory_form(data)
        if self._looks_like_token_failure(response):
            logger.warning(
                "saras_token_stale_retrying status=%s",
                response.status_code,
            )
            self.refresh_form_tokens()
            data = {**data, **(self._form_tokens or {})}
            response = self._post_directory_form(data)
            if self._looks_like_token_failure(response):
                logger.warning(
                    "saras_blocked_or_challenged context=directory_post status=%s reason=token_retry_failed",
                    response.status_code,
                )
                raise SarasBlockedError(
                    "SARAS appears to be rate-limiting or challenging requests right now.",
                    http_status=response.status_code,
                )
        return response

    def fetch_district_directory(self, state_id: str, district_id: str) -> SarasFetchResult:
        data = {
            **self._base_form_data(),
            "MainRadioValue": SarasSearchMode.STATE_WISE.value,
            "State": state_id,
            "District": district_id,
        }
        response = self._post_directory_form_with_token_retry(data)
        url = f"{self._base_url}{SARAS_DIRECTORY_PATH}"
        raw = {"html": response.text, "request": data, "url": url}
        return SarasFetchResult(
            html=response.text,
            http_status=response.status_code,
            url=url,
            request_params=data,
            fetched_at=datetime.now(timezone.utc),
            payload_checksum=payload_checksum(raw),
        )

    def fetch_state_options(self) -> list[dict[str, str]]:
        url = f"{self._base_url}{SARAS_DIRECTORY_PATH}"
        response = self._request("GET", url)
        if response.status_code != 200:
            logger.warning(
                "saras_blocked_or_challenged context=fetch_state_options status=%s",
                response.status_code,
            )
            raise SarasBlockedError(
                f"SARAS form fetch failed: HTTP {response.status_code}",
                http_status=response.status_code,
            )
        soup = BeautifulSoup(response.text, "html.parser")
        select = soup.find("select", {"id": "State"}) or soup.find("select", {"name": "State"})
        if not select:
            logger.warning(
                "saras_blocked_or_challenged context=fetch_state_options status=%s "
                "reason=state_select_missing falling_back_to_known_state_ids",
                response.status_code,
            )
            return [{"id": state_id, "name": state_id} for state_id in KNOWN_STATE_IDS]
        options = []
        for option in select.find_all("option"):
            value = (option.get("value") or "").strip()
            label = option.get_text(" ", strip=True)
            if value and label and label.lower() not in {"select", "select state"}:
                options.append({"id": value, "name": label})
        return options

    def fetch_district_options(self, state_id: str) -> list[dict[str, str]]:
        # SARAS binds districts via AJAX after loading the directory page.
        self.refresh_form_tokens()
        url = f"{self._base_url}{SARAS_DISTRICT_BIND_PATH}"
        directory_url = f"{self._base_url}{SARAS_DIRECTORY_PATH}"
        response = self._request(
            "GET",
            url,
            params={"state_id": state_id},
            headers={
                "Accept": "application/json, text/javascript, */*; q=0.01",
                "X-Requested-With": "XMLHttpRequest",
                "Referer": directory_url,
            },
        )
        if self._looks_like_token_failure(response):
            logger.warning(
                "saras_token_stale_retrying context=fetch_district_options status=%s",
                response.status_code,
            )
            self.refresh_form_tokens()
            response = self._request(
                "GET",
                url,
                params={"state_id": state_id},
                headers={
                    "Accept": "application/json, text/javascript, */*; q=0.01",
                    "X-Requested-With": "XMLHttpRequest",
                    "Referer": directory_url,
                },
            )
        if response.status_code != 200:
            logger.warning(
                "saras_blocked_or_challenged context=fetch_district_options status=%s",
                response.status_code,
            )
            raise SarasBlockedError(
                f"SARAS district bind failed: HTTP {response.status_code}",
                http_status=response.status_code,
            )
        return self._parse_district_options(response.text)

    def _parse_district_options(self, payload: str) -> list[dict[str, str]]:
        text = payload.strip()
        if text.startswith("["):
            items = json.loads(text)
            options: list[dict[str, str]] = []
            for item in items:
                value = str(item.get("value", "")).strip()
                label = str(item.get("text", "")).strip()
                if not value or value == "0":
                    continue
                if label.lower() in {"select", "select district", "--select--"}:
                    continue
                options.append({"id": value, "name": label})
            return options

        soup = BeautifulSoup(payload, "html.parser")
        options = []
        for option in soup.find_all("option"):
            value = (option.get("value") or "").strip()
            label = option.get_text(" ", strip=True)
            if value and value != "0" and label and label.lower() not in {"select", "select district", "--select--"}:
                options.append({"id": value, "name": label})
        return options

    def build_district_directory_idempotency_key(self, state_id: str, district_id: str) -> str:
        return f"saras|directory|state={state_id}|district={district_id}"

    def fetch_state_directory(self, state_id: str) -> SarasFetchResult:
        data = {
            **self._base_form_data(),
            "MainRadioValue": SarasSearchMode.STATE_WISE.value,
            "State": state_id,
            "District": "",
        }
        response = self._post_directory_form_with_token_retry(data)
        url = f"{self._base_url}{SARAS_DIRECTORY_PATH}"
        raw = {"html": response.text, "request": data, "url": url}
        return SarasFetchResult(
            html=response.text,
            http_status=response.status_code,
            url=url,
            request_params=data,
            fetched_at=datetime.now(timezone.utc),
            payload_checksum=payload_checksum(raw),
        )

    def fetch_keyword_directory(self, keyword: str) -> SarasFetchResult:
        data = {
            **self._base_form_data(),
            "MainRadioValue": SarasSearchMode.KEYWORD_WISE.value,
            "InstName_orAddress": keyword,
        }
        response = self._post_directory_form_with_token_retry(data)
        url = f"{self._base_url}{SARAS_DIRECTORY_PATH}"
        raw = {"html": response.text, "request": data, "url": url}
        return SarasFetchResult(
            html=response.text,
            http_status=response.status_code,
            url=url,
            request_params=data,
            fetched_at=datetime.now(timezone.utc),
            payload_checksum=payload_checksum(raw),
        )

    def fetch_detail_page(self, affiliation_number: str) -> SarasFetchResult:
        aff = re.sub(r"\s+", "", affiliation_number)
        path = SARAS_DETAIL_PATH.format(affiliation_number=aff)
        url = f"{self._base_url}{path}"
        response = self._request("GET", url)
        raw = {"html": response.text, "url": url, "affiliation_number": aff}
        return SarasFetchResult(
            html=response.text,
            http_status=response.status_code,
            url=url,
            request_params={"affiliation_number": aff},
            fetched_at=datetime.now(timezone.utc),
            payload_checksum=payload_checksum(raw),
        )

    def list_state_ids(self) -> list[str]:
        return list(KNOWN_STATE_IDS)

    def build_directory_idempotency_key(self, state_id: str) -> str:
        return f"saras|directory|state={state_id}"

    def build_detail_idempotency_key(self, affiliation_number: str) -> str:
        aff = re.sub(r"\s+", "", affiliation_number)
        return f"saras|detail|affiliation={aff}"
