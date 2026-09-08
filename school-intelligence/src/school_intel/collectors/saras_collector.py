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

from school_intel.collectors.saras_endpoints import (
    KNOWN_STATE_IDS,
    SARAS_BASE_URL,
    SARAS_DETAIL_PATH,
    SARAS_DIRECTORY_PATH,
    SARAS_DISTRICT_BIND_PATH,
)
from school_intel.config import get_settings
from school_intel.domain.enums import SarasSearchMode
from school_intel.utils.text import payload_checksum

logger = logging.getLogger("school_intel.collectors.saras")

RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}


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
        self._client = client or httpx.Client(
            timeout=settings.http_timeout_seconds,
            headers={
                "User-Agent": "CapabbleSchoolIntel/0.3 (+https://capabble.cloud)",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Referer": f"{SARAS_BASE_URL}/saras/Home/Category_Wise",
            },
            follow_redirects=True,
        )
        self._last_request_at = 0.0
        self._form_tokens: dict[str, str] | None = None

    def close(self) -> None:
        self._client.close()

    def _rate_limit(self) -> None:
        delay = max(self._settings.kys_request_delay_seconds, 0.0)
        elapsed = time.monotonic() - self._last_request_at
        if elapsed < delay:
            time.sleep(delay - elapsed)
        self._last_request_at = time.monotonic()

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
        url = f"{SARAS_BASE_URL}{SARAS_DIRECTORY_PATH}"
        response = self._request("GET", url)
        if response.status_code != 200:
            raise RuntimeError(f"SARAS form fetch failed: HTTP {response.status_code}")
        soup = BeautifulSoup(response.text, "html.parser")
        token = soup.find("input", {"name": "__RequestVerificationToken"})
        ncform = soup.find("input", {"name": "__ncforminfo"})
        if not token or not ncform:
            raise RuntimeError("SARAS anti-forgery tokens not found")
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

    def fetch_district_directory(self, state_id: str, district_id: str) -> SarasFetchResult:
        url = f"{SARAS_BASE_URL}{SARAS_DIRECTORY_PATH}"
        data = {
            **self._base_form_data(),
            "MainRadioValue": SarasSearchMode.STATE_WISE.value,
            "State": state_id,
            "District": district_id,
        }
        response = self._request("POST", url, data=data)
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
        url = f"{SARAS_BASE_URL}{SARAS_DIRECTORY_PATH}"
        response = self._request("GET", url)
        if response.status_code != 200:
            raise RuntimeError(f"SARAS form fetch failed: HTTP {response.status_code}")
        soup = BeautifulSoup(response.text, "html.parser")
        select = soup.find("select", {"id": "State"}) or soup.find("select", {"name": "State"})
        if not select:
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
        url = f"{SARAS_BASE_URL}{SARAS_DISTRICT_BIND_PATH}"
        directory_url = f"{SARAS_BASE_URL}{SARAS_DIRECTORY_PATH}"
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
            raise RuntimeError(f"SARAS district bind failed: HTTP {response.status_code}")
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
        url = f"{SARAS_BASE_URL}{SARAS_DIRECTORY_PATH}"
        data = {
            **self._base_form_data(),
            "MainRadioValue": SarasSearchMode.STATE_WISE.value,
            "State": state_id,
            "District": "",
        }
        response = self._request("POST", url, data=data)
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
        url = f"{SARAS_BASE_URL}{SARAS_DIRECTORY_PATH}"
        data = {
            **self._base_form_data(),
            "MainRadioValue": SarasSearchMode.KEYWORD_WISE.value,
            "InstName_orAddress": keyword,
        }
        response = self._request("POST", url, data=data)
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
        url = f"{SARAS_BASE_URL}{path}"
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
