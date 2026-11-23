"""Kashshaf server: analyst dashboard, API, agent pool, safe-link gateway and warning page.

Run:  .venv/bin/python server.py      then open http://localhost:8080
"""
import argparse
import json
import mimetypes
import re
import threading
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlsplit

from kashshaf import config  # loads .env first
from kashshaf import agent, control, discovery, pipeline, store, supa
from kashshaf.workers import Pool

WEB = Path(__file__).resolve().parent / "web"
URL_RE = re.compile(r"https?://[^\s<>\"'،]+", re.IGNORECASE)
pool: Pool | None = None
discovery_state = {"running": None, "last": None}


def extract_urls(text: str) -> list[str]:
    return list(dict.fromkeys(u.rstrip(".,);]") for u in URL_RE.findall(text)))


def run_discovery(kind: str, actor: str, **kw) -> None:
    if discovery_state["running"]:
        return
    discovery_state["running"] = kind
    control.cancel.clear()

    def job():
        try:
            fn = {"google": lambda: discovery.run_personas(kw.get("limit")),
                  "ct": discovery.run_ct_logs, "feed": discovery.run_phish_feed}[kind]
            n = fn()
            discovery_state["last"] = {"kind": kind, "queued": n, "at": time.time(), "error": None}
        except Exception as e:
            discovery_state["last"] = {"kind": kind, "queued": 0, "at": time.time(), "error": str(e)[:300]}
        finally:
            discovery_state["running"] = None
            pool.notify()

    store.audit(actor, f"discovery_{kind}")
    threading.Thread(target=job, daemon=True).start()


class Handler(BaseHTTPRequestHandler):
    # ---- helpers -------------------------------------------------------------
    def _send(self, code, body: bytes, ctype: str, extra=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def json(self, data, code=200):
        self._send(code, json.dumps(data, ensure_ascii=False, default=str).encode(), "application/json; charset=utf-8")

    def static(self, name: str):
        path = (WEB / name).resolve()
        if WEB.resolve() not in path.parents or not path.is_file():
            return self.json({"error": "not found"}, 404)
        ctype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype.endswith("javascript"):
            ctype += "; charset=utf-8"
        self._send(200, path.read_bytes(), ctype)

    def body(self) -> dict:
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}") if n else {}

    def user(self) -> dict | None:
        token = (self.headers.get("Authorization") or "").removeprefix("Bearer ").strip()
        return supa.user_from_token(token)

    def log_message(self, *args):
        pass

    def do_OPTIONS(self):
        self._send(204, b"", "text/plain", {"Access-Control-Allow-Methods": "GET, POST"})

    # ---- routes -----------------------------------------------------------------
    def do_GET(self):
        try:
            self.route_get()
        except (BrokenPipeError, ConnectionResetError):
            pass  # the browser left before the answer was sent (page reload, tab closed)
        except Exception as e:
            traceback.print_exc()
            try:
                self.json({"error": f"{type(e).__name__}: {e}"}, 500)
            except (BrokenPipeError, ConnectionResetError):
                pass

    def do_POST(self):
        try:
            self.route_post()
        except (BrokenPipeError, ConnectionResetError):
            pass  # the browser left before the answer was sent (page reload, tab closed)
        except Exception as e:
            traceback.print_exc()
            try:
                self.json({"error": f"{type(e).__name__}: {e}"}, 500)
            except (BrokenPipeError, ConnectionResetError):
                pass

    def route_get(self):
        parts = urlsplit(self.path)
        path, q = parts.path, {k: v[0] for k, v in parse_qs(parts.query).items()}

        # Public: pages, blocklist feed, lookup and gateway
        if path in ("/", "/index.html"):
            return self.static("index.html")
        if path == "/room":
            return self.static("room.html")
        if path == "/blocked":
            return self.static("blocked.html")
        if path.startswith("/assets/") or path == "/blocked.js":
            return self.static(path.lstrip("/"))
        if path == "/api/config":
            return self.json({"supabase_url": config.SUPABASE_URL, "supabase_key": config.SUPABASE_PUBLISHABLE_KEY})
        if path == "/api/blocklist":
            return self.json({"domains": store.blocklist()})
        if path == "/api/check":
            return self.json(self.check(q.get("url", "")))
        if path == "/go":
            url = q.get("url", "")
            if not url.startswith(("http://", "https://")):
                return self.json({"error": "url must start with http:// or https://"}, 400)
            result = self.check(url, inspect_unknown=True)
            if result["blocked"]:
                store.queue_url(url, "gateway")  # remember the click; a known link is not checked again
                pool.notify()
            target = f"/blocked?url={quote(url, safe='')}" if result["blocked"] else url
            return self._send(302, b"", "text/plain", {"Location": target})

        # Analysts only
        user = self.user()
        if not user:
            return self.json({"error": "login required"}, 401)
        sort = q.get("sort") if q.get("sort") in store.SORTS else "new"
        if path == "/api/state":
            return self.json({"stats": store.stats(), "agents": pool.state(), "discovery": discovery_state,
                              "control": control.snapshot(),
                              "ai": agent.enabled(), "model": agent.MODEL if agent.enabled() else None,
                              "google": bool(config.SERPAPI_KEY), "user": user.get("email")})
        if path == "/api/findings":
            return self.json(store.findings(q.get("verdict") or None, q.get("q") or None, int(q.get("limit", 200)), sort))
        if path == "/api/scan_result":
            ids = [int(x) for x in q.get("ids", "").split(",") if x.strip().isdigit()][:50]
            return self.json(store.scan_result(ids))
        if path == "/api/finding":
            return self.json(store.finding_detail(int(q["id"])))
        if path == "/api/blocked":
            return self.json(store.blocked_list(sort))
        if path == "/api/searches":
            return self.json(store.searches(sort=sort))
        if path == "/api/gangs":
            return self.json(store.gangs(sort))
        if path == "/api/audit":
            if q.get("kind") == "search":
                return self.json(store.audit_log(40, ["google_search", "phish_feed", "ct_logs", "budget_reached",
                                                      "google_error", "search_stop", "patrol_start"], sort))
            return self.json(store.audit_log(sort=sort))
        if path == "/api/registry":
            return self.json(store.registry()["entities"])
        return self.json({"error": "not found"}, 404)

    def route_post(self):
        path = urlsplit(self.path).path
        user = self.user()
        if not user:
            return self.json({"error": "login required"}, 401)
        actor, data = user.get("email") or user["id"], self.body()

        if path == "/api/scan":
            text = (data.get("text") or "").strip()
            if not text:
                return self.json({"error": "text is required"}, 400)
            urls = extract_urls(text)
            msg_id = store.add_message(text, data.get("channel", "analyst"), user["id"]) if text not in urls else None
            # A link checked in the last RECHECK_AFTER_HOURS is answered from the database; an older one is checked again.
            links = []
            for u in urls:
                row = store.queue_url(u, "message" if msg_id else "analyst", message_id=msg_id, priority=10)
                from_db = not row["_new"] and store.recently_checked(row, config.RECHECK_AFTER_HOURS)
                if not row["_new"] and not from_db:
                    store.requeue_url(row, priority=10)
                links.append({"url_id": row["id"], "url": u, "from_db": from_db})
            store.audit(actor, "scan", None, {"urls": urls, "known": sum(x["from_db"] for x in links)})
            pool.notify()
            return self.json({"at": store.now(), "links": links})
        if path == "/api/discover":
            kind = data.get("kind")
            if kind not in ("google", "ct", "feed"):
                return self.json({"error": "kind must be google, ct or feed"}, 400)
            if kind == "google" and not config.SERPAPI_KEY:
                return self.json({"error": "SERPAPI_KEY is missing in .env"}, 400)
            if kind == "google" and data.get("query"):
                store.audit(actor, "discovery_google_query", data["query"])
                hl, force = data.get("hl", "en"), bool(data.get("force"))
                prev = None if force else store.recent_search(data["query"].strip(), hl, "discovery",
                                                              config.SEARCH_COOLDOWN_HOURS)
                if prev:
                    control.saved("serp")
                    return self.json({"cached": True, "searched_at": prev["searched_at"], "new": prev["new_links"],
                                      "known": prev["known_links"], "known_blocked": prev["known_blocked"]})

                def one():
                    discovery_state["running"] = "query"
                    try:
                        r = discovery.search_google(data["query"], hl=hl, force=force, by=actor)
                        discovery_state["last"] = {"kind": "query", "queued": r["new"], "known": r["known"],
                                                   "known_blocked": r["known_blocked"], "at": time.time(), "error": None}
                    except control.BudgetExceeded as e:
                        discovery_state["last"] = {"kind": "query", "queued": 0, "at": time.time(),
                                                   "error": "انتهى رصيد البحث في SerpAPI أو وصلنا الحد بالساعة" if "429" in str(e) or "used up" in str(e)
                                                   else f"وصلنا حد البحث بالساعة ({config.SERP_MAX_PER_HOUR})"}
                    except Exception as e:
                        discovery_state["last"] = {"kind": "query", "queued": 0, "at": time.time(), "error": str(e)[:300]}
                    finally:
                        discovery_state["running"] = None
                        pool.notify()
                if discovery_state["running"]:
                    return self.json({"error": "a search is already running"}, 409)
                threading.Thread(target=one, daemon=True).start()
                return self.json({"started": True})
            run_discovery(kind, actor, limit=data.get("limit"))
            return self.json({"started": True, "running": discovery_state["running"]})
        if path == "/api/control":
            action = data.get("action")
            fn = {"start": control.start, "stop": control.stop, "patrol": control.patrol_on,
                  "stop_search": control.stop_search}.get(action)
            if not fn:
                return self.json({"error": "action must be start, stop, stop_search or patrol"}, 400)
            if "count" in data:
                pool.resize(int(data["count"]))
            fn(pool, actor)
            return self.json(control.snapshot())
        if path == "/api/agents":
            pool.resize(int(data.get("count", config.AGENT_COUNT)))
            store.audit(actor, "agents_resize", None, {"count": data.get("count")})
            return self.json(pool.state())
        if path == "/api/override":
            action = data.get("action") or None
            if action not in (None, "block", "allow") or not data.get("domain"):
                return self.json({"error": "domain and action (block, allow or null) required"}, 400)
            store.set_override(data["domain"].lower(), action, actor, data.get("note"))
            return self.json({"ok": True})
        if path == "/api/rescan":
            row = store.queue_url(data["url"], "analyst", priority=10, requeue=True)
            pool.notify()
            return self.json({"queued": row["url"]})
        return self.json({"error": "not found"}, 404)

    def check(self, url: str, inspect_unknown: bool = False) -> dict:
        domain = store.host_of(url)
        row = store.domain_status(domain)
        if row is None and inspect_unknown and store.official_entity(domain) is None and not store.gov_namespace(domain):
            url_row = store.queue_url(url, "gateway", priority=10)
            # inspect right away so the person clicking waits seconds, not minutes
            supa.update("urls", {"status": "checking", "claimed_by": "gateway"}, id=f"eq.{url_row['id']}")
            pipeline.inspect(url_row, "gateway")
            row = store.domain_status(domain)
        if store.official_entity(domain) or store.gov_namespace(domain):
            return {"domain": domain, "known": True, "verdict": "official", "blocked": False}
        if row is None:
            return {"domain": domain, "known": False, "blocked": False}
        return {"domain": domain, "known": True, "verdict": row["verdict"], "blocked": store.is_blocked(row),
                "warning_url": f"/blocked?url={quote(url, safe='')}"}


def discovery_loop():
    while True:
        time.sleep(config.DISCOVERY_INTERVAL_MIN * 60)
        for kind in ("feed", "ct", "google"):
            if kind == "google" and not config.SERPAPI_KEY:
                continue
            run_discovery(kind, "scheduler")
            while discovery_state["running"]:
                time.sleep(5)


def main():
    global pool
    missing = config.missing()
    if missing:
        raise SystemExit(f"Missing in .env: {', '.join(missing)}")
    ap = argparse.ArgumentParser()
    ap.add_argument("--agents", type=int, default=config.AGENT_COUNT)
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("--host", default="127.0.0.1")
    args = ap.parse_args()
    store.registry()  # fail fast if the database is unreachable
    pool = Pool(args.agents)
    if config.DISCOVERY_INTERVAL_MIN > 0:
        threading.Thread(target=discovery_loop, daemon=True).start()
    print(f"Kashshaf on http://localhost:{args.port} | {args.agents} agents | "
          f"Claude agent {'ON (' + agent.MODEL + ')' if agent.enabled() else 'OFF'} | "
          f"Google {'ON' if config.SERPAPI_KEY else 'OFF'}")
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
