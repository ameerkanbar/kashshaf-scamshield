"""Feed data/seeds.json through the running Kashshaf server and print every verdict.

Run after the emulator, test_sites/server.py and server.py are up:
    python run_demo.py <path-to-kashshaf-repo>
"""
import json
import sys
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
API, AUTH = "http://localhost:8080", "http://localhost:54321"


def call(url, body=None, token=None, method=None):
    h = {"Content-Type": "application/json", "apikey": "sb_publishable_local_emulator"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None,
                                 headers=h, method=method or ("POST" if body is not None else "GET"))
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read() or b"null")


def main():
    repo = Path(sys.argv[1])
    user = json.loads((HERE / "emulator_users.json").read_text(encoding="utf-8"))[0]
    tok = call(f"{AUTH}/auth/v1/token?grant_type=password", user)["access_token"]
    seeds = json.loads((repo / "data/seeds.json").read_text(encoding="utf-8"))
    ids = []
    for text in seeds["messages"] + seeds["urls"]:
        ids += [l["url_id"] for l in call(f"{API}/api/scan", {"text": text}, tok)["links"]]
    for _ in range(90):
        res = call(f"{API}/api/scan_result?ids={','.join(map(str, ids))}", token=tok)
        if not any(r["pending"] for r in res):
            break
        time.sleep(1)
    out = []
    for r in res:
        v = r["result"] or {}
        out.append({"url": r["url"], "verdict": v.get("verdict"), "score": v.get("score"), "by": v.get("model"),
                    "entity": v.get("entity_ar"), "blocked": v.get("blocked"), "cloaked": v.get("cloaked"),
                    "reasons": [x["en"] for x in v.get("reasons") or []]})
        print(f"{(v.get('verdict') or 'pending'):12} {v.get('score', ''):>3}  {r['url']}")
        for x in out[-1]["reasons"]:
            print(f"{'':17}- {x}")
    st = call(f"{API}/api/state", token=tok)
    extra = {"stats": st["stats"], "gangs": call(f"{API}/api/gangs", token=tok),
             "blocklist": call(f"{API}/api/blocklist"),
             "check_official": call(f"{API}/api/check?url=https://www.adpolice.gov.ae"),
             "check_fraud": call(f"{API}/api/check?url=http://aramex-redelivery.localhost:8081/x")}
    print(json.dumps(extra, ensure_ascii=False, indent=1))
    (HERE / "demo_results.json").write_text(json.dumps({"results": out, **extra}, ensure_ascii=False, indent=1),
                                            encoding="utf-8")


if __name__ == "__main__":
    main()
