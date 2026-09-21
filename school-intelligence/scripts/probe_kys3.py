"""Probe social data and enrollment endpoints."""
import json
from pathlib import Path

import httpx

SCHOOL_ID = "1519942"
YEAR_ID = 7
OUT = Path(__file__).resolve().parents[1] / "kys_probe_output3.json"

bases = [
    "https://kys.udiseplus.gov.in/web-app/api/school",
    "https://kys.udiseplus.gov.in/web-app/api",
    "https://kys.udiseplus.gov.in/api/school",
]

headers = {"Accept": "application/json", "User-Agent": "CapabbleSchoolIntel/0.1"}
results: dict = {}

with httpx.Client(timeout=30, headers=headers, follow_redirects=True) as client:
    paths = [
        "getSocialData",
        "get-social-data",
        "socialData",
        "student-social-data",
        "studentData",
        "getStudentData",
        "enrolment",
        "enrollment",
        "student-enrolment",
        "stu-enrolment",
        "report-card/student",
        "report-card/enrollment",
    ]
    for base in bases:
        for path in paths:
            for params in [
                {"flag": 1, "schoolId": SCHOOL_ID, "yearId": YEAR_ID},
                {"schoolId": SCHOOL_ID, "yearId": YEAR_ID},
                {"schoolId": SCHOOL_ID, "year": YEAR_ID, "flag": 3},
            ]:
                url = f"{base}/{path}"
                r = client.get(url, params=params)
                if r.status_code not in (404, 405):
                    key = f"{url}?{params}"
                    entry = {"status": r.status_code, "ct": r.headers.get("content-type")}
                    try:
                        entry["json"] = r.json()
                    except Exception:
                        entry["text"] = r.text[:400]
                    results[key] = entry

    # Full report-card dump for year 7
    r = client.get(
        f"{bases[0]}/report-card",
        params={"schoolId": SCHOOL_ID, "yearId": YEAR_ID},
    )
    results["full_report_card_7"] = r.json()

    # Try action=2 with year param for each year 6-12
    for year_id in range(6, 13):
        r = client.get(
            f"{bases[0]}/by-year",
            params={"schoolId": SCHOOL_ID, "year": year_id, "action": 2},
        )
        data = r.json().get("data", {}) if r.status_code == 200 else {}
        results[f"by-year-action2-year-{year_id}"] = {
            "status": r.status_code,
            "yearId": data.get("yearId"),
            "yearDesc": data.get("yearDesc"),
            "keys": list(data.keys())[:20] if isinstance(data, dict) else None,
        }

OUT.write_text(json.dumps(results, indent=2, default=str), encoding="utf-8")
print(f"Wrote {OUT}, entries={len(results)}")
