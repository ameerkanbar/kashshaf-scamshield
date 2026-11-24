"""A file import with the agents off: they start for the file and stop after it. Dead lookalike links,
bare-IP links and decoy@ links are judged from the link itself. Local emulator only, no paid services."""
import base64
import json
import time
import urllib.request
from pathlib import Path

API, AUTH, HERE = "http://localhost:8095", "http://localhost:54321", Path(__file__).resolve().parent
ok = lambda cond, label: print(("PASS " if cond else "FAIL ") + label)  # noqa: E731


def call(path, body=None, tok=None, base=API):
    h = {"Content-Type": "application/json", "apikey": "sb_publishable_local_emulator"}
    if tok:
        h["Authorization"] = f"Bearer {tok}"
    r = urllib.request.Request(base + path, data=json.dumps(body).encode() if body is not None else None, headers=h,
                               method="POST" if body is not None else "GET")
    return json.loads(urllib.request.urlopen(r, timeout=120).read() or b"null")


user = json.loads((HERE / "emulator_users.json").read_text(encoding="utf-8"))[0]
tok = call("/auth/v1/token?grant_type=password", user, base=AUTH)["access_token"]
running = lambda: call("/api/state", tok=tok)["control"]["running"]  # noqa: E731

call("/api/control", {"action": "stop"}, tok)
ok(not running(), "agents are off before the file")

stamp = int(time.time())
rows = [
    (f"http://adpolice-fines-pay-dead{stamp}.com/pay", "phishing"),        # dead, imitates Abu Dhabi Police
    (f"http://paypal-secure-login-dead{stamp}.com/", "phishing"),          # dead, imitates PayPal
    ("http://192.0.2.10/pay", "phishing"),                                 # bare IP (a documentation address: never opened)
    ("http://www.aramex.com@aramex-redelivery.localhost:8081/t", "phishing"),  # decoy@ before the real host
    (f"http://quiet-garden-blog-dead{stamp}.com/post", "legitimate"),      # dead, ordinary name
    ("http://karak-cafe.localhost:8081/", "legitimate"),                   # a normal live page
]
csv = "url,label\n" + "".join(f"{u},{label}\n" for u, label in rows)
imp = call("/api/import", {"file_name": "auto.csv", "data": base64.b64encode(csv.encode()).decode()}, tok)
ok(imp["import"]["total"] == len(rows), f"all {len(rows)} links read, IP and @ links included: total={imp['import']['total']}")
ok(imp.get("agents_started") is True, "the server started the agents for this file")
ok(running(), "agents are on while the file is checked")

for _ in range(180):
    r = call(f"/api/import_result?id={imp['import']['id']}", tok=tok)
    if r["done"] == r["total"]:
        break
    time.sleep(1)
ok(r["done"] == r["total"], f"file checked: {r['done']}/{r['total']}")
by_url = {x["url"]: x for x in r["rows"]}
for u, label in rows:
    x = by_url.get(u) or {}
    print(f"   {label:10s} {x.get('verdict')!s:12s} blocked={x.get('blocked')!s:5s} {u}")
dead_fake = [by_url[u] for u, _ in rows[:2]]
ok(all(x["verdict"] == "suspicious" and x["blocked"] for x in dead_fake), "dead lookalike links: suspicious and blocked, not 'safe'")
ok(by_url[rows[2][0]]["verdict"] == "suspicious" and by_url[rows[2][0]]["blocked"], "bare IP link: suspicious and blocked")
ok(by_url[rows[3][0]]["blocked"], f"decoy@ link opened at the real host and blocked: {by_url[rows[3][0]]['verdict']}")
ok(by_url[rows[4][0]]["verdict"] == "unreachable" and not by_url[rows[4][0]]["blocked"], "dead ordinary link: unreachable, not blocked")
ok(by_url[rows[5][0]]["verdict"] == "safe", "live ordinary page: safe")
m = r["metrics"] or {}
print("   metrics:", {k: m.get(k) for k in ("tp", "fp", "tn", "fn", "precision", "recall")})
ok(m.get("recall") == 1.0 and m.get("precision") == 1.0, "precision and recall 100% on this file")

for _ in range(30):  # the watcher looks every 10 s
    if not running():
        break
    time.sleep(1)
ok(not running(), "agents switched off again after the file, as they were before")

# agents already on: an import leaves them on
call("/api/control", {"action": "start"}, tok)
imp2 = call("/api/import", {"file_name": "on.csv", "data": base64.b64encode(b"url\nhttp://karak-cafe.localhost:8081/menu\n").decode()}, tok)
ok(imp2.get("agents_started") is False, "agents already on: the import does not take them over")
time.sleep(15)
ok(running(), "and they stay on after it")
