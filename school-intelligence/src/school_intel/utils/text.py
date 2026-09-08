from __future__ import annotations

import hashlib
import json
import re
import unicodedata


def normalize_school_name(value: str) -> str:
    text = unicodedata.normalize("NFKD", value or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.upper()
    text = re.sub(r"[^\w\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def normalize_address(value: str) -> str:
    text = unicodedata.normalize("NFKD", value or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.upper()
    text = re.sub(r"[^\w\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def normalize_identifier(value: str) -> str:
    return re.sub(r"\s+", "", str(value or "").strip())


def payload_checksum(payload: dict | list | None) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def first_present(data: dict, *keys: str):
    """Return the first key present in data, preserving explicit zero values."""
    for key in keys:
        if key in data:
            return data[key]
    return None


def coerce_optional_int(value: object) -> int | None:
    if value is None:
        return None
    if isinstance(value, str) and value.strip() == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
