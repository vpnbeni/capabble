"""Parse SARAS table rows for Himalyan."""
import json
import re
from pathlib import Path

import httpx
from bs4 import BeautifulSoup

OUT = Path(__file__).resolve().parents[1] / "saras_probe_output3.json"
BASE = "https://saras.cbse.gov.in/saras/AffiliatedList/ListOfSchdirReport"

headers = {
    "User-Agent": "CapabbleSchoolIntel/0.3 (+https://capabble.cloud)",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": "https://saras.cbse.gov.in/saras/Home/Category_Wise",
}

results = {}
with httpx.Client(timeout=120, headers=headers, follow_redirects=True) as client:
    r = client.get(BASE)
    soup = BeautifulSoup(r.text, "html.parser")
    token = soup.find("input", {"name": "__RequestVerificationToken"})
    ncform = soup.find("input", {"name": "__ncforminfo"})
    token_val = token.get("value") if token else ""
    ncform_val = ncform.get("value") if ncform else ""

    def post_search(payload: dict) -> BeautifulSoup:
        data = {
            "__RequestVerificationToken": token_val,
            "__ncforminfo": ncform_val,
            **payload,
        }
        r2 = client.post(BASE, data=data)
        return BeautifulSoup(r2.text, "html.parser"), r2.status_code, len(r2.text)

    # Keyword search - specific
    for term in ["HIMALYAN PUBLIC SCHOOL", "HIMALYAN ROHTAK", "HIMALYAN"]:
        soup2, status, length = post_search({
            "MainRadioValue": "Keyword_wise",
            "InstName_orAddress": term,
            "RegiAffNo": "0",
        })
        rows = []
        table = soup2.find("table", {"id": "myTable"}) or soup2.find("table")
        if table:
            for tr in table.find_all("tr")[:5]:
                cells = [c.get_text(" ", strip=True) for c in tr.find_all(["td", "th"])]
                links = [a.get("href") for a in tr.find_all("a", href=True)]
                if cells:
                    rows.append({"cells": cells, "links": links})
        # Find himalyan rows in full text
        matches = []
        for tr in soup2.find_all("tr"):
            text = tr.get_text(" ", strip=True).lower()
            if "himalyan" in text and "rohtak" in text:
                matches.append({
                    "text": tr.get_text(" ", strip=True)[:300],
                    "links": [a.get("href") for a in tr.find_all("a", href=True)],
                    "html": str(tr)[:800],
                })
        results[f"keyword_{term}"] = {
            "status": status,
            "length": length,
            "sample_rows": rows[:3],
            "himalyan_rohtak_matches": matches[:5],
        }

    # State wise Haryana - need district ID
    dist_r = client.get("https://saras.cbse.gov.in/saras/AffiliatedList/Dist_Bind", params={"stateId": "5"})
    results["dist_bind_haryana"] = {
        "status": dist_r.status_code,
        "body": dist_r.text[:2000],
    }

    # Parse district options if HTML
    if dist_r.status_code == 200:
        dist_soup = BeautifulSoup(dist_r.text, "html.parser")
        options = [
            {"value": o.get("value"), "text": o.get_text(strip=True)}
            for o in dist_soup.find_all("option")
        ]
        results["haryana_districts"] = [o for o in options if "rohtak" in o.get("text", "").lower()]

        rohtak_id = next((o["value"] for o in options if o.get("text", "").upper() == "ROHTAK"), None)
        if rohtak_id:
            soup3, status, length = post_search({
                "MainRadioValue": "State_wise",
                "State": "5",
                "District": rohtak_id,
                "RegiAffNo": "0",
            })
            matches = []
            for tr in soup3.find_all("tr"):
                text = tr.get_text(" ", strip=True).lower()
                if "himalyan" in text:
                    matches.append({
                        "text": tr.get_text(" ", strip=True)[:400],
                        "links": [a.get("href") for a in tr.find_all("a", href=True)],
                        "html": str(tr)[:1200],
                    })
            results["state_haryana_rohtak"] = {
                "status": status,
                "length": length,
                "himalyan_matches": matches[:10],
            }

OUT.write_text(json.dumps(results, indent=2, default=str), encoding="utf-8")
print(f"Wrote {OUT}")
