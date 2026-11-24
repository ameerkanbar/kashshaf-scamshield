"""Kashshaf server: analyst dashboard, API, agent pool, safe-link gateway and warning page.

Run:  .venv/bin/python server.py      then open http://localhost:8080 (the HQ game is at /hq)
"""
import argparse
import base64
import json
import mimetypes
import os
import re
import threading
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlsplit

from kashshaf import config  # loads .env first
from kashshaf import agent, control, discovery, evidence, health, importer, org, pipeline, store, supa, uaepass
from kashshaf.workers import Pool

# What a victim can tell us in a verified report (the page shows the Arabic labels)
REPORT_WHAT = ("card", "otp", "id", "password", "paid", "nothing")
REPORT_CHANNELS = ("sms", "whatsapp", "email", "search", "ad", "social", "other")

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
            with org.current().dept("discovery").work(kind, "discovery") as m:  # a discovery agent runs the round
                n = fn()
                org.current().report(m, "ok" if n else "info", f"أضاف {n} رابط للطابور", f"Queued {n} links")
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
        if token.startswith("ksf1."):  # an analyst who logged in with UAE PASS
            return uaepass.session_user(token)
        return supa.user_from_token(token)

    def origin(self) -> str:
        """This server's address as the browser sees it (PUBLIC_URL pins it on a real deployment)."""
        return os.environ.get("PUBLIC_URL", "").rstrip("/") or f"http://{self.headers.get('Host', 'localhost:8080')}"

    def redirect(self, location: str):
        return self._send(302, b"", "text/plain", {"Location": location})

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
        if path == "/room":  # the operations room is now the dashboard's home page
            return self._send(302, b"", "text/plain", {"Location": "/#ops"})
        if path == "/hq":
            return self.static("hq.html")
        if path == "/blocked":
            return self.static("blocked.html")
        if path == "/report":
            return self.static("report.html")
        if path.startswith("/assets/") or path in ("/blocked.js", "/report.js"):
            return self.static(path.lstrip("/"))

        # UAE PASS: Kashshaf's sign-in (analysts) and verified reports (victims) ...
        if path == "/auth/uaepass/start":
            return self.redirect(uaepass.authorize_url(self.origin(), "login"))
        if path == "/report/start":
            url = q.get("url", "")
            if not url.startswith(("http://", "https://")):
                return self.json({"error": "url must start with http:// or https://"}, 400)
            return self.redirect(uaepass.authorize_url(self.origin(), "report", {"url": url}))
        if path == "/auth/uaepass/callback":
            return self.uaepass_callback(q)
        if path == "/api/report_ticket":
            rec = uaepass.ticket(q.get("ticket", ""))
            if not rec:
                return self.json({"error": "انتهت صلاحية التحقق. ابدأ البلاغ من جديد عبر UAE PASS."}, 410)
            who = rec["identity"]
            return self.json({"name_ar": who.get("fullnameAR"), "name_en": who.get("fullnameEN"),
                              "level": who.get("userType"), "level_ar": uaepass.LEVEL_AR.get(who.get("userType")),
                              "idn": uaepass.masked_idn(who.get("idn")), "url": rec["url"]})
        # ... and the simulation that stands in for UAE PASS until the police have real client credentials
        if uaepass.MOCK and path == "/mock-uaepass/authorize":
            if q.get("client_id") != uaepass.CLIENT_ID or \
                    not q.get("redirect_uri", "").startswith(self.origin() + "/auth/uaepass/callback"):
                return self.json({"error": "unknown client or redirect_uri"}, 400)
            return self._send(200, uaepass.mock_page(q).encode(), "text/html; charset=utf-8")
        if uaepass.MOCK and path == "/mock-uaepass/approve":
            code = uaepass.mock_issue_code(q.get("sub", ""), q.get("client_id", ""), q.get("redirect_uri", ""))
            if not code:
                return self.json({"error": "invalid request"}, 400)
            return self.redirect(f"{q['redirect_uri']}?code={code}&state={quote(q.get('state', ''), safe='')}")
        if uaepass.MOCK and path == "/mock-uaepass/userinfo":
            info = uaepass.mock_userinfo(self.headers.get("Authorization") or "")
            return self.json(info) if info else self.json({"error": "invalid_token"}, 401)
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
            target = result["warning_url"] if result["blocked"] else url
            return self._send(302, b"", "text/plain", {"Location": target})

        # Analysts only
        user = self.user()
        if not user:
            return self.json({"error": "login required"}, 401)
        sort = q.get("sort") if q.get("sort") in store.SORTS else "new"
        if path == "/api/state":
            return self.json({"stats": store.stats(), "agents": pool.state(), "org": pool.org.snapshot(), "discovery": discovery_state,
                              "control": control.snapshot(),
                              "ai": agent.enabled(), "model": agent.MODEL if agent.enabled() else None,
                              "google": bool(config.SERPAPI_KEY), "user": user.get("email")})
        if path == "/api/findings":
            return self.json(store.findings(q.get("verdict") or None, q.get("q") or None, int(q.get("limit", 200)), sort))
        if path == "/api/scan_result":
            ids = [int(x) for x in q.get("ids", "").split(",") if x.strip().isdigit()][:50]
            return self.json(store.scan_result(ids))
        if path == "/api/reports":
            return self.json(store.citizen_reports(q.get("domain", "").lower()))
        if path == "/api/import_result":
            return self.json(store.import_result(int(q["id"])))
        # Evidence for police use and takedown requests
        if path == "/api/evidence":
            return self.json({"items": evidence.for_url(int(q["url_id"])), "chrome": bool(evidence.chrome())})
        if path == "/api/evidence_file":
            got = evidence.file_bytes(int(q["id"]), q.get("kind", ""))
            if not got:
                return self.json({"error": "not found"}, 404)
            # the page copy is the scammer's own HTML: always a text download, never rendered here
            extra = {"Content-Disposition": 'attachment; filename="page-copy.txt"'} if q.get("kind") == "page" else None
            return self._send(200, got[0], got[1], extra)
        if path == "/api/evidence_report":
            g = evidence.gather(int(q["url_id"]))
            ev = g["evidence"] or {}
            shot = supa.storage_get(evidence.BUCKET, ev["screenshot_path"]) if ev.get("screenshot_path") else None
            body = evidence.report_html(g, user.get("email") or user["id"], shot).encode("utf-8")
            return self._send(200, body, "text/html; charset=utf-8",
                              {"Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'"})
        if path == "/api/evidence_pack":
            actor = user.get("email") or user["id"]
            name, data = evidence.pack(int(q["url_id"]), actor)
            store.audit(actor, "evidence_export", name)
            return self._send(200, data, "application/zip", {"Content-Disposition": f'attachment; filename="{name}"'})
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
        if path == "/api/integrations":  # Settings page: live status of every outside service
            return self.json({"services": health.check(), "settings": health.settings()})
        if path == "/api/insights":
            return self.json(store.insights())
        if path == "/api/registry":
            return self.json(store.registry()["entities"])
        return self.json({"error": "not found"}, 404)

    def route_post(self):
        path = urlsplit(self.path).path
        if uaepass.MOCK and path == "/mock-uaepass/token":
            n = int(self.headers.get("Content-Length") or 0)
            form = {k: v[0] for k, v in parse_qs(self.rfile.read(n).decode()).items()}
            token = uaepass.mock_token(form.get("code", ""), form.get("redirect_uri", ""),
                                       self.headers.get("Authorization") or "")
            return self.json(token) if token else self.json({"error": "invalid_grant"}, 400)
        if path == "/api/report":  # a victim's report, from a UAE PASS-verified identity (no analyst login)
            return self.file_report(self.body())
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
        if path == "/api/import":
            # A file of links (CSV, Excel, TXT or JSON), sent as base64. Every link gets the full check.
            name = (data.get("file_name") or "links.csv").strip()
            try:
                raw = base64.b64decode(data.get("data") or "", validate=True)
                parsed = importer.parse(name, raw)
            except Exception:
                return self.json({"error": "تعذّرت قراءة الملف. الصيغ المدعومة: CSV أو Excel (.xlsx) أو TXT أو JSON"}, 400)
            if not parsed["items"]:
                return self.json({"error": "لم نجد أي روابط في الملف"}, 400)
            batch = store.create_import(name, actor, parsed, config.RECHECK_AFTER_HOURS)
            pool.notify()
            return self.json({"import": batch, "url_column": parsed["url_column"], "label_column": parsed["label_column"]})
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
                        with org.current().dept("discovery").work(data["query"], "discovery") as m:
                            r = discovery.search_google(data["query"], hl=hl, force=force, by=actor)
                            org.current().report(m, "ok", f"«{data['query']}»: {r['new']} جديد · {r['known_blocked']} محظور",
                                                 f"“{data['query']}”: {r['new']} new · {r['known_blocked']} blocked")
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
            if action not in (None, "block", "allow", "official") or not data.get("domain"):
                return self.json({"error": "domain and action (block, allow, official or null) required"}, 400)
            try:
                store.set_override(data["domain"].lower(), action, actor, data.get("note"))
            except ValueError:
                return self.json({"error": "لا توجد جهة منتحَلة لهذا النطاق، فلا يمكن تسجيله كرسمي"}, 400)
            pool.notify()
            return self.json({"ok": True})
        if path == "/api/evidence_capture":
            rows = supa.select("urls", id=f"eq.{int(data['url_id'])}", select="*")
            if not rows:
                return self.json({"error": "not found"}, 404)
            return self.json(evidence.capture(rows[0], actor))
        if path == "/api/integrations/test":  # one service, with a real request where that costs (Claude)
            sid = data.get("id")
            if sid not in health.CHECKS:
                return self.json({"error": "unknown service"}, 400)
            store.audit(actor, "integration_test", sid)
            return self.json(health.check(sid, test=True)[0])
        if path == "/api/rescan":
            row = store.queue_url(data["url"], "analyst", priority=10, requeue=True)
            pool.notify()
            return self.json({"queued": row["url"]})
        return self.json({"error": "not found"}, 404)

    def uaepass_callback(self, q: dict):
        """UAE PASS sends the person back here with a code (or an error)."""
        if q.get("error"):  # cancelled in UAE PASS
            rec = uaepass.drop_state(q.get("state", "")) or {"purpose": "login", "extra": {}}
            if rec["purpose"] == "report":
                return self.redirect("/report#error=cancelled&url=" + quote(rec["extra"].get("url", ""), safe=""))
            return self.redirect("/#login_error=cancelled")
        try:
            rec, identity = uaepass.finish(self.origin(), q.get("code", ""), q.get("state", ""))
        except Exception as e:
            print(f"[uaepass] sign-in failed: {e}")
            return self.redirect("/#login_error=failed")
        who = identity.get("email") or identity.get("sub")
        if rec["purpose"] == "login":
            refusal = uaepass.analyst_refusal(identity)
            if refusal:
                store.audit(f"uaepass:{who}", "login_denied", None, {"level": identity.get("userType"), "reason": refusal})
                return self.redirect("/#login_error=" + quote(refusal, safe=""))
            store.audit(who, "login_uaepass", None, {"level": identity.get("userType")})
            return self.redirect("/#session=" + uaepass.issue_session(identity))
        url = rec["extra"].get("url", "")
        if identity.get("userType") not in ("SOP2", "SOP3"):  # a report needs a verified identity
            return self.redirect("/report#error=unverified&url=" + quote(url, safe=""))
        return self.redirect("/report#ticket=" + uaepass.issue_ticket(identity, url))

    def file_report(self, data: dict):
        rec = uaepass.ticket(data.get("ticket", ""), use=True)
        if not rec:
            return self.json({"error": "انتهت صلاحية التحقق. ابدأ البلاغ من جديد عبر UAE PASS."}, 410)
        who, url = rec["identity"], rec["url"]
        what = [w for w in data.get("what") or [] if w in REPORT_WHAT]
        try:
            amount = round(float(data["amount"]), 2) if data.get("amount") not in (None, "") else None
        except (TypeError, ValueError):
            amount = None
        if amount is not None and not 0 <= amount < 1e9:
            amount = None
        channel = data.get("channel") if data.get("channel") in REPORT_CHANNELS else None
        row = store.queue_url(url, "citizen_report", priority=10)
        if not row["_new"] and not store.recently_checked(row, config.RECHECK_AFTER_HOURS):
            store.requeue_url(row, priority=10)
        report = store.add_citizen_report(row, url, who, what, amount, channel,
                                          (data.get("notes") or "").strip()[:2000], bool(data.get("contact_ok")))
        pool.notify()
        store.audit(f"uaepass:{who.get('sub')}", "citizen_report", url, {"report_id": report["id"], "what": what})
        return self.json({"ref": f"KSF-R-{report['id']}"})

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
        review = store.pending_review(row)
        return {"domain": domain, "known": True, "verdict": row["verdict"], "blocked": store.is_blocked(row),
                "pending_review": review,
                "warning_url": f"/blocked?url={quote(url, safe='')}" + ("&review=1" if review else "")}


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
    uaepass.configure(args.port)  # the simulated UAE PASS is served by this same server
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
