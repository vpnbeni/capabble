"""SARAS probe - Keyword field and affiliation search."""
import json
import re
from pathlib import Path

import httpx
from bs4 import BeautifulSoup

OUT = Path(__file__).resolve().parents[1] / "saras_probe_output4.json"
BASE = "https://saras.cbse.gov.in/saras/AffiliatedList/ListOfSchdirReport"

headers = {
    "User-Agent": "CapabbleSchoolIntel/0.3 (+https://capabble.cloud)",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": "https://saras.cbse.gov.in/saras/Home/Category_Wise",
}

def parse_rows(html: str, limit: int = 10) -> list:
    soup = BeautifulSoup(html, "html.parser")
    rows = []
    table = soup.find("table", {"id": "myTable"}) or soup.find("table")
    if not table:
        return rows
    for tr in table.find_all("tr"):
        cells = tr.find_all("td")
        if not cells:
            continue
        links = [a.get("href") for a in tr.find_all("a", href=True)]
        rows.append({
            "cells": [c.get_text(" ", strip=True) for c in cells],
            "links": links,
            "html": str(tr)[:1500],
        })
        if len(rows) >= limit:
            break
    return rows

results = {}
with httpx.Client(timeout=180, headers=headers, follow_redirects=True) as client:
    r = client.get(BASE)
    soup = BeautifulSoup(r.text, "html.parser")
    token = soup.find("input", {"name": "__RequestVerificationToken"}).get("value")
    ncform = soup.find("input", {"name": "__ncforminfo"}).get("value")

    def base_data():
        return {"__RequestVerificationToken": token, "__ncforminfo": ncform, "RegiAffNo": "0"}

    searches = [
        {"MainRadioValue": "Keyword_wise", "Keyword": "DELHI PUBLIC SCHOOL"},
        {"MainRadioValue": "Keyword_wise", "InstName_orAddress": "DELHI PUBLIC SCHOOL"},
        {"MainRadioValue": "Affiliation_wise", "RegiAffNo": "2730011"},
        {"MainRadioValue": "State_wise", "State": "5", "District": ""},
    ]
    for i, extra in enumerate(searches):
        data = {**base_data(), **extra}
        r2 = client.post(BASE, data=data)
        results[f"search_{i}"] = {
            "payload": extra,
            "status": r2.status_code,
            "length": len(r2.text),
            "row_count_estimate": r2.text.lower().count("<tr"),
            "rows": parse_rows(r2.text, 5),
        }

    # Fetch a detail page from first result with link
    for key, val in results.items():
        for row in val.get("rows", []):
            for link in row.get("links", []):
                if link and "AfflicationDetails" in link:
                    detail_url = f"https://saras.cbse.gov.in{link}" if link.startswith("/") else link
                    rd = client.get(detail_url)
                    results["detail_sample"] = {
                        "url": detail_url,
                        "status": rd.status_code,
                        "length": len(rd.text),
                        "snippet": rd.text[:4000],
                    }
                    # Parse detail fields
                    dsoup = BeautifulSoup(rd.text, "html.parser")
                    fields = {}
                    for tr in dsoup.find_all("tr"):
                        tds = tr.find_all("td")
                        if len(tds) >= 2:
                            k = tds[0].get_text(" ", strip=True)
                            v = tds[1].get_text(" ", strip=True)
                            if k:
                                fields[k] = v[:200]
                    results["detail_fields"] = dict(list(fields.items())[:30])
                    break
            if "detail_sample" in results:
                break
        if "detail_sample" in results:
            break

OUT.write_text(json.dumps(results, indent=2, default=str), encoding="utf-8")
print(f"Wrote {OUT}")
