"""Probe KYS frontend for search API patterns."""
import json
import re
from pathlib import Path

import httpx

OUT = Path(__file__).resolve().parents[1] / "kys_frontend_probe.json"
BASE = "https://kys.udiseplus.gov.in"
headers = {"User-Agent": "Mozilla/5.0", "Accept": "text/html,*/*"}

results: dict = {}
with httpx.Client(timeout=60, headers=headers, follow_redirects=True) as client:
    r = client.get(BASE + "/")
    html = r.text
    results["home_status"] = r.status_code
    scripts = re.findall(r'src="([^"]+\.js)"', html)
    results["script_count"] = len(scripts)
    api_hits: list[str] = []
    for script_path in scripts[:15]:
        if script_path.startswith("http"):
            url = script_path
        elif script_path.startswith("/"):
            url = BASE + script_path
        else:
            url = BASE + "/" + script_path.lstrip("/")
        try:
            js = client.get(url).text
            for m in re.finditer(r"/web-app/api/[a-zA-Z0-9_\-/]+", js):
                api_hits.append(m.group(0))
            for m in re.finditer(r"search[A-Za-z]*", js, re.I):
                if len(m.group(0)) < 40:
                    api_hits.append("token:" + m.group(0))
        except Exception as exc:
            results.setdefault("script_errors", []).append({script_path: str(exc)})
    results["api_hits_unique"] = sorted(set(api_hits))[:80]

    # try common frontend routes
    for path in [
        "/web-app/",
        "/web-app/api/school/searchSchool",
        "/web-app/api/school/search-school",
        "/web-app/api/search-school",
        "/web-app/api/school/search",
    ]:
        try:
            rr = client.get(BASE + path, params={"schoolName": "A.V.N. GLOBAL SCHOOL", "districtName": "ROHTAK"})
            results[path] = {"status": rr.status_code, "body": rr.text[:300]}
        except Exception as exc:
            results[path] = {"error": str(exc)}

OUT.write_text(json.dumps(results, indent=2), encoding="utf-8")
print(f"Wrote {OUT}")
