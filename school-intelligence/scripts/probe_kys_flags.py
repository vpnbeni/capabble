"""Probe all social data flags for year 7."""
import json
from pathlib import Path

import httpx

SCHOOL_ID = "1519942"
YEAR_ID = 7
BASE = "https://kys.udiseplus.gov.in/web-app/api"
OUT = Path(__file__).resolve().parents[1] / "kys_probe_flags.json"

headers = {"Accept": "application/json", "User-Agent": "CapabbleSchoolIntel/0.1"}
results = {}

with httpx.Client(timeout=30, headers=headers) as client:
    for flag in range(1, 6):
        r = client.get(
            f"{BASE}/getSocialData",
            params={"flag": flag, "schoolId": SCHOOL_ID, "yearId": YEAR_ID},
        )
        body = r.json()
        data = body.get("data", {})
        total = data.get("schEnrollmentYearDataTotal", {}) if isinstance(data, dict) else {}
        results[f"flag_{flag}"] = {
            "status": r.status_code,
            "api_status": body.get("status"),
            "total_keys": list(total.keys()) if total else None,
            "finalTotal": total.get("finalTotal"),
            "rowBoyTotal": total.get("rowBoyTotal"),
            "rowGirlTotal": total.get("rowGirlTotal"),
            "rowTotal": total.get("rowTotal"),
            "dto_count": len(data.get("schEnrollmentYearDataDTOS", [])) if isinstance(data, dict) else 0,
            "first_dto": (data.get("schEnrollmentYearDataDTOS") or [{}])[0] if isinstance(data, dict) else None,
        }

OUT.write_text(json.dumps(results, indent=2, default=str), encoding="utf-8")
print(f"Wrote {OUT}")
