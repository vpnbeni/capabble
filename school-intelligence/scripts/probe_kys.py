"""One-off KYS API probe script."""
import json
import sys
from pathlib import Path

import httpx

BASE = "https://kys.udiseplus.gov.in/web-app/api/school"
SCHOOL_ID = "1519942"
OUT = Path(__file__).resolve().parents[1] / "kys_probe_output.json"

headers = {
    "Accept": "application/json",
    "User-Agent": "CapabbleSchoolIntel/0.1 (research)",
}

results: dict = {"by_year": [], "endpoints": {}}

with httpx.Client(timeout=30, headers=headers, follow_redirects=True) as client:
    for year_id in range(1, 15):
        r = client.get(
            f"{BASE}/by-year",
            params={"schoolId": SCHOOL_ID, "year": year_id, "action": 2},
        )
        entry = {
            "year_id": year_id,
            "status": r.status_code,
            "content_type": r.headers.get("content-type"),
        }
        try:
            entry["json"] = r.json()
        except Exception:
            entry["text"] = r.text[:500]
        results["by_year"].append(entry)

    year_id = 7
    endpoints = [
        ("report-card", {"schoolId": SCHOOL_ID, "yearId": year_id}),
        ("profile", {"schoolId": SCHOOL_ID, "yearId": year_id}),
        ("facility", {"schoolId": SCHOOL_ID, "yearId": year_id}),
        ("getSocialData", {"flag": 1, "schoolId": SCHOOL_ID, "yearId": year_id}),
        ("getSocialData", {"flag": 2, "schoolId": SCHOOL_ID, "yearId": year_id}),
        ("getSocialData", {"flag": 3, "schoolId": SCHOOL_ID, "yearId": year_id}),
        ("getSocialData", {"flag": 4, "schoolId": SCHOOL_ID, "yearId": year_id}),
        ("getSocialData", {"flag": 5, "schoolId": SCHOOL_ID, "yearId": year_id}),
    ]
    for name, params in endpoints:
        key = f"{name}?{params}"
        r = client.get(f"{BASE}/{name}", params=params)
        entry = {
            "status": r.status_code,
            "content_type": r.headers.get("content-type"),
            "params": params,
        }
        try:
            entry["json"] = r.json()
        except Exception:
            entry["text"] = r.text[:500]
        results["endpoints"][key] = entry

OUT.write_text(json.dumps(results, indent=2, default=str), encoding="utf-8")
print(f"Wrote {OUT}")
