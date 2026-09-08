"""Extended KYS API probe."""
import json
from pathlib import Path

import httpx

BASE = "https://kys.udiseplus.gov.in/web-app/api/school"
SCHOOL_ID = "1519942"
OUT = Path(__file__).resolve().parents[1] / "kys_probe_output2.json"

headers = {"Accept": "application/json", "User-Agent": "CapabbleSchoolIntel/0.1"}
results: dict = {}

with httpx.Client(timeout=30, headers=headers, follow_redirects=True) as client:
    # Year discovery variants
    for params in [
        {"schoolId": SCHOOL_ID, "action": 2},
        {"schoolId": SCHOOL_ID, "yearId": 7, "action": 2},
        {"schoolId": SCHOOL_ID, "year": 7, "action": 1},
        {"schoolId": SCHOOL_ID, "yearId": 7, "action": 1},
    ]:
        r = client.get(f"{BASE}/by-year", params=params)
        results[f"by-year?{params}"] = {"status": r.status_code, "json": r.json() if r.status_code == 200 else r.text[:300]}

    # Try year list endpoints
    for path in ["years", "year-list", "academic-years", "getYears", "getYearList"]:
        r = client.get(f"{BASE}/{path}", params={"schoolId": SCHOOL_ID})
        if r.status_code != 404:
            results[path] = {"status": r.status_code, "body": r.text[:500]}

    # Social data path variants
    for path in [
        "getSocialData",
        "getsocialdata",
        "social-data",
        "socialData",
        "get-social-data",
    ]:
        for flag in [1, 3]:
            r = client.get(
                f"{BASE}/{path}",
                params={"flag": flag, "schoolId": SCHOOL_ID, "yearId": 7},
            )
            key = f"{path}?flag={flag}"
            results[key] = {"status": r.status_code, "ct": r.headers.get("content-type")}
            if r.status_code == 200:
                results[key]["json"] = r.json()
            elif r.text:
                results[key]["text"] = r.text[:300]

    # Report card for multiple yearIds to find enrollment fields
    for year_id in range(6, 13):
        r = client.get(f"{BASE}/report-card", params={"schoolId": SCHOOL_ID, "yearId": year_id})
        if r.status_code == 200:
            data = r.json().get("data", {})
            results[f"report-card-yearId-{year_id}"] = {
                "yearDesc": data.get("yearDesc"),
                "keys_with_enroll": [k for k in data.keys() if "enrol" in k.lower() or "stu" in k.lower() or "rte" in k.lower() or "boy" in k.lower() or "girl" in k.lower() or "total" in k.lower()],
                "sample": {k: data[k] for k in list(data.keys())[:5]},
            }

    # Try enrollment-specific endpoints
    for ep in ["enrollment", "student-enrollment", "getEnrollment", "stu-enrollment"]:
        r = client.get(f"{BASE}/{ep}", params={"schoolId": SCHOOL_ID, "yearId": 7})
        if r.status_code != 404:
            results[ep] = {"status": r.status_code, "body": r.text[:500]}

OUT.write_text(json.dumps(results, indent=2, default=str), encoding="utf-8")
print(f"Wrote {OUT}")
