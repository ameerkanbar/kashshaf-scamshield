"""Fake customer-service numbers on Google Maps, tested with a made-up Maps result (no SerpAPI call).

Run against the local emulator:  KASHSHAF_ENV_FILE=kashshaf-run/local.env python kashshaf-run/test_fake_phones.py
"""
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from kashshaf import config, discovery, phones, supa  # noqa: E402

assert "localhost:54321" in config.SUPABASE_URL, "this test writes data: run it against the local emulator only"
API, AUTH, HERE = "http://localhost:8095", "http://localhost:54321", Path(__file__).resolve().parent
ok = lambda cond, label: print(("PASS " if cond else "FAIL ") + label)  # noqa: E731

# 1. normalisation: every way the same number is written is one number
for raw in ("+971 2 446 1461", "00971-2-4461461", "02 4461461", "024461461", "+971 (2) 4461461"):
    ok(phones.normalize(raw) == "24461461", f"normalize {raw!r} -> {phones.normalize(raw)}")
ok(phones.normalize("800 3333") == "8003333", "toll-free 800 3333 -> 8003333")
ok(phones.normalize("+971 800 3333") == "8003333", "+971 800 3333 -> 8003333")

# 2. which place names are claims of an official body
claims = {"Abu Dhabi Police Customer Service": "adpolice", "شرطة أبوظبي خدمة العملاء": "adpolice",
          "Salik Customer Service": "salik", "Salik Car Wash": None, "Tamm Cafe": None, "Karak House Restaurant": None}
for name, want in claims.items():
    got = (phones.place_entity(name) or {}).get("id")
    ok(got == want, f"place {name!r} -> {got}")

# 3. the made-up Maps result
query = f"abu dhabi police customer service number {int(time.time())}"
site = f"http://quick-help-desk-{int(time.time())}.com/"  # a dead site with an ordinary name: the fake number alone must block it
maps = {"local_results": [
    {"title": "Abu Dhabi Police Customer Service", "phone": "+971 50 123 4567", "address": "Al Muroor, Abu Dhabi"},  # fake, no site
    {"title": "Abu Dhabi Police Call Center", "phone": "800 3333", "address": "Abu Dhabi"},                           # official number
    {"title": "Karak House Restaurant", "phone": "02 555 1234", "address": "Khalifa City"},                          # ordinary place
    {"title": "Salik Customer Service", "phone": "+971 4 111 2222", "website": site},                                 # fake, with site
]}
counts, links = discovery.ingest(query, {}, maps)
ok(counts["fake_phones"] == 2, f"two fake lines found: {counts}")
ok(links == [site], f"only the place with a website was queued as a link: {links}")
fakes = supa.select("fake_phones", select="*", place_name="in.(\"Abu Dhabi Police Customer Service\",\"Abu Dhabi Police Call Center\",\"Karak House Restaurant\",\"Salik Customer Service\")")  # a place seen again is one record
names = {f["place_name"]: f for f in fakes}
ok("Abu Dhabi Police Customer Service" in names and names["Abu Dhabi Police Customer Service"]["phone"] == "501234567",
   "police place with a non-official number kept, even without a website")
ok("Abu Dhabi Police Call Center" not in names, "police place with the official 800 3333 not flagged")
ok("Karak House Restaurant" not in names, "restaurant not flagged")
ok(names.get("Salik Customer Service", {}).get("url_id") is not None, "Salik fake line linked to its website's link")

# 4. through the server: the listing, the link's verdict, the evidence report
user = json.loads((HERE / "emulator_users.json").read_text(encoding="utf-8"))[0]
req = urllib.request.Request(AUTH + "/auth/v1/token?grant_type=password", data=json.dumps(user).encode(),
                             headers={"Content-Type": "application/json", "apikey": "sb_publishable_local_emulator"})
tok = json.loads(urllib.request.urlopen(req).read())["access_token"]


def get(path, raw=False):
    r = urllib.request.urlopen(urllib.request.Request(API + path, headers={"Authorization": f"Bearer {tok}"}), timeout=120)
    body = r.read()
    return body if raw else json.loads(body)


listing = get("/api/fake_phones")
ok(any(f["place_name"] == "Abu Dhabi Police Customer Service" and f["entity_ar"] == "شرطة أبوظبي" and "8003333" in f["official"]
       for f in listing), "dashboard listing shows the fake police line with the official numbers beside it")
url_id = names["Salik Customer Service"]["url_id"]
for _ in range(120):
    res = get(f"/api/scan_result?ids={url_id}")[0]
    if not res["pending"]:
        break
    time.sleep(1)
v = res["result"] or {}
reasons = get(f"/api/finding?id={url_id}")["verdicts"][0]["reasons"]
maps_reason = next((r for r in reasons if r.get("by") == "maps"), None)
ok(maps_reason is not None and "+971 4 111 2222" in maps_reason["ar"] and "Salik" in maps_reason["en"],
   f"the link's verdict carries the fake-number reason (AR and EN): {maps_reason and maps_reason['en'][:90]}")
time.sleep(2)  # the domain is updated right after the verdict is saved
chk = json.loads(urllib.request.urlopen(f"{API}/api/check?url={urllib.parse.quote(site, safe='')}").read())
ok(v.get("verdict") in ("suspicious", "fraud") and chk["blocked"],
   f"the link is not safe and is blocked: {v.get('verdict')} {v.get('score')} · blocked={chk['blocked']} review={chk.get('pending_review')}")
report = get(f"/api/evidence_report?url_id={url_id}", raw=True).decode("utf-8")
ok("رقم خدمة عملاء مزيّف على خرائط جوجل" in report and "+971 4 111 2222" in report and "الخرائط" in report,
   "evidence report shows the Maps source and the fake number")
