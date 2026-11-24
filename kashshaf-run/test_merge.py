"""End-to-end test of the merged branch against the test instance on :8095 (local emulator, no paid services)."""
import base64
import json
import time
import urllib.request
from pathlib import Path

API, AUTH = "http://localhost:8095", "http://localhost:54321"
HERE = Path(__file__).resolve().parent


def call(path, body=None, token=None, raw=False, base=API):
    h = {"Content-Type": "application/json", "apikey": "sb_publishable_local_emulator"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(base + path, data=json.dumps(body).encode() if body is not None else None, headers=h,
                                 method="POST" if body is not None else "GET")
    with urllib.request.urlopen(req, timeout=120) as r:
        data = r.read()
        return (data, r.headers) if raw else json.loads(data or b"null")


ok = lambda cond, label: print(("PASS " if cond else "FAIL ") + label)
user = json.loads((HERE / "emulator_users.json").read_text(encoding="utf-8"))[0]
tok = call("/auth/v1/token?grant_type=password", user, base=AUTH)["access_token"]

# 1. scan: fraud, grey area (du rewards -> suspicious -> review), safe, official
links = call("/api/scan", {"text": "http://adpolice-fines-pay.localhost:8081/pay http://du-uae-rewards.localhost:8081/promo "
                                   "http://karak-cafe.localhost:8081/ https://www.adpolice.gov.ae"}, tok)["links"]
ids = [l["url_id"] for l in links]
for _ in range(90):
    res = call(f"/api/scan_result?ids={','.join(map(str, ids))}", token=tok)
    if not any(r["pending"] for r in res):
        break
    time.sleep(1)
v = {r["url"].split("//")[1].split("/")[0].split(":")[0]: (r["result"] or {}) for r in res}
print({k: (x.get("verdict"), x.get("score"), x.get("blocked")) for k, x in v.items()})
ok(v["adpolice-fines-pay.localhost"]["verdict"] == "fraud", "police scam page judged fraud")
ok(v["du-uae-rewards.localhost"]["verdict"] == "suspicious" and v["du-uae-rewards.localhost"]["blocked"], "du grey-area page: suspicious and blocked pending review")
ok(v["karak-cafe.localhost"]["verdict"] == "safe", "karak cafe safe")
ok(v["www.adpolice.gov.ae"]["verdict"] == "official", "official site official")

# 2. review queue
st = call("/api/state", token=tok)
ok(st["stats"].get("review", 0) >= 1, f"stats.review = {st['stats'].get('review')}")
rq = call("/api/findings?verdict=review", token=tok)
ok(any(f["domain"] == "du-uae-rewards.localhost" for f in rq), "du site in the review queue")
blocked = call("/api/blocked", token=tok)
ok(any(b["domain"] == "du-uae-rewards.localhost" and b["pending_review"] for b in blocked), "blocked list marks it pending review")
chk = call("/api/check?url=http://du-uae-rewards.localhost:8081/x")
ok(chk.get("pending_review") and "review=1" in chk.get("warning_url", ""), "warning page says 'under review'")

# 3. company + live reports still work on the merged pipeline
org = st["org"]
# a link checked recently is answered from the database (no new case): any finished case shows the departments
case = next((c for c in org["cases"] if c["domain"] == "du-uae-rewards.localhost"), None)
if not case:  # every link came from the database: send a new one through the company
    fresh = f"http://karak-cafe.localhost:8081/menu?t={int(time.time())}"
    fid = call("/api/scan", {"text": fresh}, tok)["links"][0]["url_id"]
    for _ in range(90):
        if not call(f"/api/scan_result?ids={fid}", token=tok)[0]["pending"]:
            break
        time.sleep(1)
    case = next(c for c in call("/api/state", token=tok)["org"]["cases"] if c["domain"] == "karak-cafe.localhost")
ok("chief" in case["stages"] and "content" in case["stages"], f"case went through departments: {list(case['stages'])}")

# 4. evidence captured automatically for the fraud page (Chrome screenshot, page copy, hashes)
fraud_id = next(l["url_id"] for l in links if "adpolice-fines-pay" in l["url"])
for _ in range(60):
    evs = call(f"/api/evidence?url_id={fraud_id}", token=tok)
    if evs["items"]:
        break
    time.sleep(1)
ok(evs["chrome"], "Chrome found for screenshots")
ok(bool(evs["items"]), "evidence captured automatically")
if evs["items"]:
    e = evs["items"][0]
    print("   evidence:", {k: e.get(k) for k in ("page_title", "screenshot_sha256", "html_sha256")}, "errors:", e.get("errors"))
    ok(bool(e.get("screenshot_path")), "screenshot stored")
    shot, hdr = call(f"/api/evidence_file?id={e['id']}&kind=screenshot", token=tok, raw=True)
    ok(shot[:8] == b"\x89PNG\r\n\x1a\n", f"screenshot is a PNG ({len(shot)} bytes)")
    pack, hdr = call(f"/api/evidence_pack?url_id={fraud_id}", token=tok, raw=True)
    ok(pack[:2] == b"PK", f"evidence pack is a ZIP ({len(pack)} bytes)")
    rep, hdr = call(f"/api/evidence_report?url_id={fraud_id}", token=tok, raw=True)
    ok(b"<html" in rep[:300].lower(), "printable report is HTML")

# 5. import a labelled CSV
csv = ("url,label\nhttp://tamm-refund-uae.localhost:8081/claim,phishing\nhttp://aramex-redelivery.localhost:8081/t,phishing\n"
       "http://karak-cafe.localhost:8081/menu,legitimate\nhxxp://etisalat-points[.]localhost:8081/redeem,phishing\n").encode()
imp = call("/api/import", {"file_name": "eval.csv", "data": base64.b64encode(csv).decode()}, tok)
print("   import:", imp["import"]["total"], "links, url column", imp["url_column"], "label column", imp["label_column"])
for _ in range(90):
    r = call(f"/api/import_result?id={imp['import']['id']}", token=tok)
    if r["done"] == r["total"]:
        break
    time.sleep(1)
ok(r["done"] == r["total"] == 4, f"import checked {r['done']}/{r['total']} (defanged link restored)")
ok(r["metrics"] and r["metrics"]["checked"] == 4, f"metrics: {r['metrics']}")

# 6. analyst decision on the review queue: allow -> unblocked
call("/api/override", {"domain": "du-uae-rewards.localhost", "action": "allow"}, tok)
ok(not call("/api/check?url=http://du-uae-rewards.localhost:8081/x")["blocked"], "allow lifts the block")
call("/api/override", {"domain": "du-uae-rewards.localhost", "action": None}, tok)

# 7. settings + insights still answer
ok(len(call("/api/integrations", token=tok)["services"]) == 9, "settings: 9 service checks")
ok("verdicts" in call("/api/insights", token=tok), "insights ok")

# 8. master's new work: verified victim reports (UAE PASS) and the UAE PASS registry entry
req = urllib.request.Request(AUTH + "/rest/v1/citizen_reports", method="POST", data=json.dumps({
    "url_id": fraud_id, "url": "http://adpolice-fines-pay.localhost:8081/pay", "domain": "adpolice-fines-pay.localhost",
    "reporter_uuid": "test-uuid", "reporter_name_ar": "مواطن تجريبي", "reporter_name_en": "Test citizen", "reporter_idn": "784-****-*******-1",
    "reporter_level": "SOP3", "what_happened": ["card", "paid"], "amount_aed": 350, "channel": "sms", "contact_ok": False}).encode(),
    headers={"Content-Type": "application/json", "apikey": "sb_secret_local_emulator", "Authorization": "Bearer sb_secret_local_emulator"})
urllib.request.urlopen(req, timeout=30).read()
reps = call("/api/reports?domain=adpolice-fines-pay.localhost", token=tok)
ok(len(reps) >= 1 and reps[0]["what_happened"] == ["card", "paid"], "victim report listed for the site")
ok(call("/api/state", token=tok)["stats"].get("reports", 0) >= 1, "stats.reports counts it")
fr = call("/api/findings?limit=50", token=tok)
ok(any(f["domain"] == "adpolice-fines-pay.localhost" and f.get("reports", 0) >= 1 for f in fr), "findings show the report count")
page, _ = call("/report", raw=True)
ok(b"<html" in page[:400].lower(), "citizen report page served")
