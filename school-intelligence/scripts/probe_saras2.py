"""Extended SARAS probe - form fields and keyword search."""
import json
import re
from pathlib import Path

import httpx
from bs4 import BeautifulSoup

OUT = Path(__file__).resolve().parents[1] / "saras_probe_output2.json"
BASE = "https://saras.cbse.gov.in/saras/AffiliatedList/ListOfSchdirReport"

headers = {
    "User-Agent": "CapabbleSchoolIntel/0.3 (+https://capabble.cloud)",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://saras.cbse.gov.in/saras/Home/Category_Wise",
}

results = {}
with httpx.Client(timeout=60, headers=headers, follow_redirects=True) as client:
    # GET form page
    r = client.get(BASE)
    soup = BeautifulSoup(r.text, "html.parser")
    form = soup.find("form")
    inputs = {}
    if form:
        for inp in form.find_all(["input", "select", "textarea"]):
            name = inp.get("name")
            if name:
                inputs[name] = {
                    "type": inp.get("type"),
                    "value": inp.get("value"),
                    "id": inp.get("id"),
                }
    results["form_inputs"] = inputs
    results["form_action"] = form.get("action") if form else None

    # Extract select options for state
    state_select = soup.find("select", {"id": re.compile("state", re.I)}) or soup.find("select", {"name": re.compile("state", re.I)})
    if state_select:
        results["state_options"] = [
            {"value": o.get("value"), "text": o.get_text(strip=True)}
            for o in state_select.find_all("option")[:20]
        ]

    # Find all input names in page
    all_inputs = [inp.get("name") for inp in soup.find_all("input") if inp.get("name")]
    results["all_input_names"] = sorted(set(all_inputs))

    # Try keyword search POST with session cookie from GET
    cookies = dict(r.cookies)
    search_payloads = [
        {
            "MainRadioValue": "Keyword_wise",
            "Keyword": "HIMALYAN",
            "__RequestVerificationToken": None,
        },
        {
            "MainRadioValue": "State_wise",
            "State": "HARYANA",
            "District": "ROHTAK",
        },
    ]
    token = soup.find("input", {"name": "__RequestVerificationToken"})
    token_val = token.get("value") if token else None
    results["csrf_token_present"] = token_val is not None

    for i, base_payload in enumerate(search_payloads):
        payload = {k: v for k, v in base_payload.items() if v is not None}
        if token_val:
            payload["__RequestVerificationToken"] = token_val
        r2 = client.post(BASE, data=payload, cookies=cookies)
        results[f"search_{i}"] = {
            "payload": payload,
            "status": r2.status_code,
            "length": len(r2.text),
            "has_himalyan": "himalyan" in r2.text.lower() or "himalayan" in r2.text.lower(),
            "has_table_rows": "<tr" in r2.text.lower(),
            "snippet": r2.text[r2.text.lower().find("himal"): r2.text.lower().find("himal") + 500] if "himal" in r2.text.lower() else r2.text[:1500],
        }

    # Look for DataTables ajax URL in scripts
    scripts = soup.find_all("script")
    ajax_urls = []
    for script in scripts:
        text = script.string or ""
        for match in re.findall(r'url\s*:\s*["\']([^"\']+)["\']', text):
            ajax_urls.append(match)
        for match in re.findall(r'["\'](/saras/[^"\']+)["\']', text):
            if "affil" in match.lower() or "list" in match.lower() or "search" in match.lower():
                ajax_urls.append(match)
    results["ajax_urls_in_page"] = list(set(ajax_urls))[:30]

    # Check for datatables id
    tables = soup.find_all("table")
    results["table_ids"] = [t.get("id") for t in tables]

OUT.write_text(json.dumps(results, indent=2, default=str), encoding="utf-8")
print(f"Wrote {OUT}")
