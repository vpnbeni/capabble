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


# Common school-name token expansions for cross-source matching (SARAS ↔ KYS).
_SCHOOL_NAME_ABBREVIATIONS: dict[str, str] = {
    "SR": "SENIOR",
    "SEC": "SECONDARY",
    "SSEC": "SECONDARY",
    "HS": "HIGH",
    "HSS": "HIGH",
    "H S": "HIGH",
    "H S S": "HIGH",
    "PUB": "PUBLIC",
    "PUBL": "PUBLIC",
    "INTL": "INTERNATIONAL",
    "INT": "INTERNATIONAL",
    "MOD": "MODERN",
    "GOVT": "GOVERNMENT",
    "GOVT.": "GOVERNMENT",
    "VID": "VIDYALAYA",
    "VIDY": "VIDYALAYA",
    "SCH": "SCHOOL",
    "SCH.": "SCHOOL",
}


def _collapse_dotted_initials(text: str) -> str:
    """A.V.N. GLOBAL -> AVN GLOBAL"""
    return re.sub(
        r"\b(?:[A-Z]\.){1,}[A-Z]\.?",
        lambda m: re.sub(r"[^A-Z]", "", m.group(0)),
        text,
    )


def normalize_school_name_for_matching(value: str) -> str:
    """Normalize school name for SARAS ↔ KYS comparison."""
    text = unicodedata.normalize("NFKD", value or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.upper()
    text = _collapse_dotted_initials(text)
    text = re.sub(r"[^\w\s]", " ", text)
    tokens = [t for t in text.split() if t]
    expanded: list[str] = []
    for token in tokens:
        expanded.append(_SCHOOL_NAME_ABBREVIATIONS.get(token, token))
    return " ".join(expanded)


def normalize_state_for_matching(value: str | None) -> str:
    if not value:
        return ""
    text = unicodedata.normalize("NFKD", str(value))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.upper().strip()
    text = re.sub(r"[^\w\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    # Strip common suffix noise
    for suffix in (" STATE", " INDIA"):
        if text.endswith(suffix):
            text = text[: -len(suffix)].strip()
    return text


def normalize_district_for_matching(value: str | None) -> str:
    if not value:
        return ""
    text = unicodedata.normalize("NFKD", str(value))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.upper().strip()
    text = re.sub(r"[^\w\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    for prefix in ("DISTRICT", "DIST", "DIST."):
        if text.startswith(prefix + " "):
            text = text[len(prefix) + 1 :].strip()
    return text


_ADDRESS_TOKEN_MAP: dict[str, str] = {
    "VILLAGE": "VPO",
    "VILL": "VPO",
    "VPO": "VPO",
    "PO": "VPO",
    "P.O": "VPO",
    "P O": "VPO",
    "POST OFFICE": "VPO",
    "POSTOFFICE": "VPO",
    "NEAR": "NR",
    "ROAD": "RD",
    "MARG": "RD",
}


def extract_pin_from_text(value: str) -> str | None:
    return _extract_pin_from_text(value)


def _extract_pin_from_text(value: str) -> str | None:
    match = re.search(r"\b(\d{6})\b", value or "")
    return match.group(1) if match else None


def normalize_address_for_matching(value: str) -> str:
    """Normalize address tokens for SARAS ↔ KYS comparison."""
    text = unicodedata.normalize("NFKD", value or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.upper()
    # Remove embedded PIN (compared separately)
    text = re.sub(r"\b\d{6}\b", " ", text)
    text = re.sub(r"[^\w\s]", " ", text)
    tokens = [t for t in text.split() if t and t not in {"INDIA"}]
    mapped = [_ADDRESS_TOKEN_MAP.get(token, token) for token in tokens]
    return " ".join(mapped)


def address_for_matching(value: str) -> str:
    return normalize_address_for_matching(value)


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


def title_case_location(value: str | None) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return text.title()
