"""Probe live SARAS HTML structure."""
import json
from pathlib import Path

import httpx

OUT = Path(__file__).resolve().parents[1] / "saras_probe_output.json"

URLS = [
    "https://saras.cbse.gov.in/saras/AffiliatedList/ListOfSchdirReport",
    "https://saras.cbse.gov.in/SARAS/AffiliatedList/ListOfSchdirReport",
    "https://saras.cbse.gov.in/saras/AffiliatedList/AfflicationDetails/530396",
    "https://saras.cbse.gov.in/SARAS/AffiliatedList/AfflicationDetails/530396",
]

headers = {
    "User-Agent": "CapabbleSchoolIntel/0.3 (+https://capabble.cloud)",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

results = {}
with httpx.Client(timeout=60, headers=headers, follow_redirects=True) as client:
    for url in URLS:
        try:
            r = client.get(url)
            results[url] = {
                "status": r.status_code,
                "content_type": r.headers.get("content-type"),
                "length": len(r.text),
                "snippet": r.text[:3000],
                "has_table": "<table" in r.text.lower(),
                "has_himalyan": "himalyan" in r.text.lower() or "himalayan" in r.text.lower(),
            }
        except Exception as e:
            results[url] = {"error": str(e)}

    # Try POST for directory if GET returns form
    post_url = "https://saras.cbse.gov.in/saras/AffiliatedList/ListOfSchdirReport"
    for payload in [
        {},
        {"State": "HARYANA"},
        {"state": "HARYANA", "district": "ROHTAK"},
    ]:
        try:
            r = client.post(post_url, data=payload)
            key = f"POST {post_url} {payload}"
            results[key] = {
                "status": r.status_code,
                "length": len(r.text),
                "has_himalyan": "himalyan" in r.text.lower() or "himalayan" in r.text.lower(),
                "snippet": r.text[:2000],
            }
        except Exception as e:
            results[f"POST {payload}"] = {"error": str(e)}

OUT.write_text(json.dumps(results, indent=2), encoding="utf-8")
print(f"Wrote {OUT}")
