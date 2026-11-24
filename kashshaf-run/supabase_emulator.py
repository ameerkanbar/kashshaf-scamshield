"""Local, in-memory stand-in for the Supabase project Kashshaf uses.

It implements only what kashshaf/supa.py and supabase-js (login) call:
PostgREST select/insert/update/delete/HEAD count, the claim_url RPC, the
views from supabase/migrations, and /auth/v1 password login + /auth/v1/user.
The registry is loaded from the repo's own 0003_seed_registry.sql.

Run:  python supabase_emulator.py <path-to-kashshaf-repo>   (port 54321)
Test analyst login is read from emulator_users.json next to this file.
"""
import ast
import json
import re
import secrets
import sys
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qsl, urlsplit

HERE = Path(__file__).resolve().parent
PORT = 54321
LOCK = threading.RLock()


def now():
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


# ---- schema: identity tables, primary keys and column defaults --------------------
PK = {"entities": "id", "official_domains": "domain", "official_phones": None, "personas": "id",
      "messages": "id", "urls": "id", "url_sightings": "id", "scans": "id", "verdicts": "id",
      "fingerprints": "id", "url_fingerprints": None, "domains": "domain", "audit_log": "id", "searches": "id",
      "imports": "id", "import_items": None, "evidence": "id", "citizen_reports": "id", "fake_phones": "id"}
IDENTITY = {"personas", "messages", "urls", "url_sightings", "scans", "verdicts", "fingerprints", "audit_log", "searches", "imports", "evidence", "citizen_reports", "fake_phones"}
UNIQUE = {"urls": ["url"], "fingerprints": ["kind", "value"], "url_fingerprints": ["url_id", "fingerprint_id"], "import_items": ["import_id", "url_id"], "official_phones": ["phone", "entity_id"], "fake_phones": ["phone", "entity_id", "place_name"]}
DEFAULTS = {
    "entities": lambda: {"category": "government", "keywords": [], "brand_tokens": [], "created_at": now()},
    "official_domains": lambda: {"verified": False, "source": None, "created_at": now()},
    "personas": lambda: {"queries": [], "active": True, "created_at": now()},
    "messages": lambda: {"channel": "analyst", "submitted_by": None, "created_at": now()},
    "urls": lambda: {"status": "queued", "priority": 0, "attempts": 0, "claimed_by": None, "claimed_at": None,
                     "first_seen": now(), "last_checked": None},
    "url_sightings": lambda: {"query": None, "persona_id": None, "message_id": None, "position": None, "phone": None,
                              "raw": None, "seen_at": now()},
    "scans": lambda: {"started_at": now(), "finished_at": None, "phone_view": None, "bot_view": None,
                      "similarity": None, "cloaked": False, "domain_created": None, "error": None},
    "verdicts": lambda: {"scan_id": None, "claimed_entity_id": None, "reasons": [], "ai": None, "model": None,
                         "created_at": now()},
    "fingerprints": lambda: {},
    "url_fingerprints": lambda: {},
    "domains": lambda: {"score": 0, "claimed_entity_id": None, "override": None, "override_by": None,
                        "override_note": None, "first_seen": now(), "updated_at": now(), "blocked_at": None, "platform": False},
    "imports": lambda: {"total": 0, "labelled": 0, "skipped": 0, "at": now()},
    "import_items": lambda: {"expected": None},
    "evidence": lambda: {"captured_at": now(), "final_url": None, "page_title": None, "screenshot_path": None, "screenshot_sha256": None,
                         "html_path": None, "html_sha256": None, "html_bytes": None, "whois": None, "hosting": None, "errors": None},
    "official_phones": lambda: {"verified": False, "source": None, "label": None},
    "fake_phones": lambda: {"phone_raw": None, "address": None, "query": None, "website": None, "url_id": None,
                            "sightings": 1, "first_seen": now(), "last_seen": now()},
    "citizen_reports": lambda: {"url_id": None, "reporter_name_ar": None, "reporter_name_en": None, "reporter_idn": None,
                                "reporter_mobile": None, "reporter_email": None, "what_happened": [], "amount_aed": None,
                                "channel": None, "notes": None, "contact_ok": False, "created_at": now()},
    "audit_log": lambda: {"target": None, "details": None, "at": now()},
    "searches": lambda: {"hl": "en", "purpose": "discovery", "maps": False, "results": None, "new_links": 0,
                         "known_links": 0, "known_blocked": 0, "searched_by": None, "searched_at": now()},
}
DB = {t: [] for t in PK}
SEQ = {t: 0 for t in IDENTITY}


def load_registry(repo: Path):
    sql = (repo / "supabase/migrations/0003_seed_registry.sql").read_text(encoding="utf-8")
    py = re.sub(r"array\[", "[", sql).replace("]::text[]", "]").replace("false", "False").replace("true", "True")
    for table, cols in (("entities", ["id", "name_en", "name_ar", "category", "keywords", "brand_tokens"]),
                        ("official_domains", ["domain", "entity_id", "verified", "source"])):
        block = py.split(f"insert into public.{table}", 1)[1].split(" values", 1)[1].split("on conflict", 1)[0]
        for tup in ast.literal_eval("[" + block.strip().rstrip(",") + "]"):
            insert_row(table, dict(zip(cols, tup)))


def load_phones(repo: Path):
    f = repo / "supabase/migrations/0013_official_phones.sql"
    if not f.exists():
        return
    sql = f.read_text(encoding="utf-8")
    block = sql.split("insert into public.official_phones", 1)[1].split(" values", 1)[1].split("on conflict", 1)[0]
    block = "\n".join(line.split("--", 1)[0] if line.strip().startswith("--") else line for line in block.splitlines())
    py = block.replace("true", "True").replace("false", "False")
    for tup in ast.literal_eval("[" + py.strip().rstrip(",") + "]"):
        insert_row("official_phones", dict(zip(["phone", "entity_id", "label", "verified", "source"], tup)))


def insert_row(table, row):
    full = {**DEFAULTS[table](), **row}
    if table in IDENTITY:
        SEQ[table] += 1
        full["id"] = SEQ[table]
    DB[table].append(full)
    return full


# ---- views --------------------------------------------------------------------
def is_block(d):
    return d is not None and (d.get("override") == "block" or
                              (d.get("override") is None and not d.get("platform") and d.get("verdict") in ("fraud", "suspicious")))


def is_review(d):
    return d is not None and d.get("override") is None and not d.get("platform") and d.get("verdict") == "suspicious"


def view(name):
    urls = {u["id"]: u for u in DB["urls"]}
    doms = {d["domain"]: d for d in DB["domains"]}
    ents = {e["id"]: e for e in DB["entities"]}
    if name == "findings":
        scans = {s["id"]: s for s in DB["scans"]}
        latest = {}
        for v in sorted(DB["verdicts"], key=lambda v: (v["created_at"], v["id"])):
            latest[v["url_id"]] = v
        out = []
        sev = {"fraud": 4, "suspicious": 3, "unreachable": 1, "safe": 0}
        for uid, v in latest.items():
            u, s, d = urls[uid], scans.get(v["scan_id"]) or {}, doms.get(urls[uid]["domain"])
            e = ents.get(v["claimed_entity_id"]) or {}
            sights = [x for x in DB["url_sightings"] if x["url_id"] == uid]
            out.append({"verdict_id": v["id"], "url_id": uid, "url": u["url"], "domain": u["domain"],
                        "verdict": v["verdict"], "score": v["score"], "claimed_entity_id": v["claimed_entity_id"],
                        "entity_en": e.get("name_en"), "entity_ar": e.get("name_ar"), "reasons": v["reasons"],
                        "ai": v["ai"], "model": v["model"], "created_at": v["created_at"],
                        "cloaked": s.get("cloaked"), "similarity": s.get("similarity"),
                        "domain_created": s.get("domain_created"), "agent": s.get("agent"),
                        "title": (s.get("phone_view") or {}).get("title"),
                        "override": d.get("override") if d else None, "blocked": is_block(d) if d else None,
                        "sightings": len(sights), "sources": sorted({x["source"] for x in sights}) or None,
                        "severity": sev.get(v["verdict"], -1), "pending_review": is_review(d)})
        return out
    if name == "blocklist":
        return [{k: d[k] for k in ("domain", "verdict", "score", "claimed_entity_id", "updated_at")}
                for d in DB["domains"] if is_block(d)]
    if name == "blocked_list":
        out = []
        for d in DB["domains"]:
            if not is_block(d):
                continue
            ids = {u["id"] for u in DB["urls"] if u["domain"] == d["domain"]}
            sights = [x for x in DB["url_sightings"] if x["url_id"] in ids]
            e = ents.get(d["claimed_entity_id"]) or {}
            out.append({**{k: d[k] for k in ("domain", "verdict", "score", "override", "override_by",
                                             "claimed_entity_id", "first_seen")},
                        "entity_ar": e.get("name_ar"), "entity_en": e.get("name_en"),
                        "blocked_at": d["blocked_at"] or d["updated_at"], "links": len(ids), "sightings": len(sights),
                        "last_seen": max((x["seen_at"] for x in sights), default=None), "pending_review": is_review(d)})
        return out
    if name == "review_queue":
        return [{"domain": d["domain"], "score": d["score"], "claimed_entity_id": d["claimed_entity_id"],
                 "blocked_at": d["blocked_at"] or d["updated_at"]} for d in DB["domains"] if is_review(d)]
    if name == "shared_indicators":
        out = []
        for f in DB["fingerprints"]:
            ds = sorted({urls[uf["url_id"]]["domain"] for uf in DB["url_fingerprints"] if uf["fingerprint_id"] == f["id"]})
            if len(ds) > 1:
                out.append({"kind": f["kind"], "value": f["value"], "domains": ds})
        return out
    if name == "search_hits":
        groups = {}
        blocked = {d["domain"] for d in DB["domains"] if is_block(d)}
        for s in DB["url_sightings"]:
            if s["query"] is None:
                continue
            g = groups.setdefault(s["query"].lower(), {"all": set(), "b": set(), "s": set()})
            u = urls[s["url_id"]]
            d = doms.get(u["domain"])
            g["all"].add(u["id"])
            if u["domain"] in blocked:
                g["b"].add(u["id"])
            elif d and d["verdict"] == "suspicious" and d["override"] is None:
                g["s"].add(u["id"])
        return [{"query": q, "links": len(g["all"]), "blocked_links": len(g["b"]), "suspicious_links": len(g["s"])}
                for q, g in groups.items()]
    return None


def rows_of(name):
    v = view(name)
    if v is not None:
        return v
    if name not in DB:
        raise KeyError(name)
    if name == "url_fingerprints":  # support the embedded fingerprints(kind,value) select
        fps = {f["id"]: f for f in DB["fingerprints"]}
        return [{**r, "fingerprints": {"kind": fps[r["fingerprint_id"]]["kind"],
                                       "value": fps[r["fingerprint_id"]]["value"]}} for r in DB[name]]
    return DB[name]


# ---- PostgREST filters --------------------------------------------------------------
def as_str(v):
    if isinstance(v, bool):
        return "true" if v else "false"
    return "" if v is None else str(v)


def cmp_val(v, lit):
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        try:
            return v, float(lit)
        except ValueError:
            pass
    return as_str(v), lit


def like(pattern, value, ci):
    rx, i = "", 0
    while i < len(pattern):
        c = pattern[i]
        if c == "\\" and i + 1 < len(pattern):
            rx += re.escape(pattern[i + 1]); i += 2; continue
        rx += ".*" if c in "*%" else "." if c == "_" else re.escape(c)
        i += 1
    return re.fullmatch(rx, as_str(value), re.I | re.S if ci else re.S) is not None


def match(row, col, expr):
    op, _, lit = expr.partition(".")
    v = row.get(col)
    if op == "eq":
        a, b = cmp_val(v, lit); return a == b
    if op == "neq":
        a, b = cmp_val(v, lit); return a != b
    if op in ("gt", "gte", "lt", "lte"):
        if v is None:
            return False
        a, b = cmp_val(v, lit)
        return {"gt": a > b, "gte": a >= b, "lt": a < b, "lte": a <= b}[op]
    if op == "in":
        return as_str(v) in [x.strip().strip('"') for x in lit.strip("()").split(",")]
    if op == "is":
        return (v is None) if lit == "null" else (v is True if lit == "true" else v is False)
    if op in ("like", "ilike"):
        return v is not None and like(lit, v, op == "ilike")
    raise ValueError(f"unsupported filter {expr}")


def apply_filters(rows, params):
    for col, expr in params:
        if col in ("select", "order", "limit", "offset", "on_conflict"):
            continue
        if col == "or":
            parts = [p.split(".", 1) for p in expr.strip("()").split(",")]
            rows = [r for r in rows if any(match(r, c, e) for c, e in parts)]
        else:
            rows = [r for r in rows if match(r, col, expr)]
    return rows


def apply_order(rows, order):
    for part in reversed(order.split(",")):
        col, _, direction = part.partition(".")
        desc = direction.startswith("desc")
        present = [r for r in rows if r.get(col) is not None]
        nulls = [r for r in rows if r.get(col) is None]
        present.sort(key=lambda r: r[col], reverse=desc)
        rows = nulls + present if desc else present + nulls  # Postgres: NULLS FIRST on desc, LAST on asc
    return rows


def project(rows, select):
    if not select or select == "*":
        return [dict(r) for r in rows]
    cols = [c.split("(")[0] for c in re.split(r",(?![^()]*\))", select)]
    return [{c: r.get(c) for c in cols} for r in rows]


# ---- RPC ----------------------------------------------------------------------
def claim_url(agent_name, stale_after=300):
    cutoff = (datetime.now(timezone.utc) - timedelta(seconds=stale_after)).isoformat()
    for u in DB["urls"]:
        if u["status"] == "checking" and (u["claimed_at"] or "") < cutoff and u["attempts"] >= 3:
            u.update(status="error", claimed_by=None)
    cands = [u for u in DB["urls"] if u["status"] == "queued"
             or (u["status"] == "checking" and (u["claimed_at"] or "") < cutoff and u["attempts"] < 3)]
    if not cands:
        return []
    u = sorted(cands, key=lambda u: (-u["priority"], u["first_seen"]))[0]
    u.update(status="checking", claimed_by=agent_name, claimed_at=now(), attempts=u["attempts"] + 1)
    return [dict(u)]


# ---- auth ---------------------------------------------------------------------
USERS = {}    # email -> {id, email, password}
STORAGE = {}  # "bucket/path" -> (bytes, content type)
TOKENS = {}   # access token -> user


def user_json(u):
    return {"id": u["id"], "aud": "authenticated", "role": "authenticated", "email": u["email"],
            "app_metadata": {"provider": "email"}, "user_metadata": {}, "created_at": now()}


def session_for(u):
    tok = "local-" + secrets.token_urlsafe(24)
    TOKENS[tok] = u
    return {"access_token": tok, "token_type": "bearer", "expires_in": 3600, "expires_at": int(time.time()) + 3600,
            "refresh_token": tok + "-r", "user": user_json(u)}


# ---- HTTP ---------------------------------------------------------------------
class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, code, data=None, extra=None):
        body = b"" if data is None else json.dumps(data, ensure_ascii=False, default=str).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,HEAD,OPTIONS")
        self.send_header("Access-Control-Expose-Headers", "Content-Range")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n)) if n else None

    def do_OPTIONS(self):
        self.send(204)

    def handle_any(self):
        parts = urlsplit(self.path)
        params = parse_qsl(parts.query, keep_blank_values=True)
        q = dict(params)
        path = parts.path
        try:
            with LOCK:
                if path.startswith("/storage/v1/object/"):
                    return self.storage(path)
                if path.startswith("/auth/v1/"):
                    return self.auth(path, q)
                if path.startswith("/rest/v1/rpc/"):
                    args = self.body() or {}
                    if path.endswith("claim_url"):
                        return self.send(200, claim_url(args["agent_name"]))
                    return self.send(404, {"message": "no such function"})
                if not path.startswith("/rest/v1/"):
                    return self.send(404, {"message": "not found"})
                if self.headers.get("apikey") != "sb_secret_local_emulator":
                    return self.send(401, {"message": "secret key required"})
                table = path[len("/rest/v1/"):]
                return self.rest(table, params, q)
        except KeyError as e:
            return self.send(404, {"message": f"relation {e} does not exist"})
        except Exception as e:  # report like PostgREST would
            return self.send(400, {"message": f"{type(e).__name__}: {e}"})

    do_GET = do_POST = do_PATCH = do_DELETE = do_HEAD = handle_any

    def rest(self, table, params, q):
        prefer = self.headers.get("Prefer") or ""
        if self.command in ("GET", "HEAD"):
            rows = apply_filters(rows_of(table), params)
            total = len(rows)
            if "order" in q:
                rows = apply_order(rows, q["order"])
            if "limit" in q:
                rows = rows[: int(q["limit"])]
            extra = {"Content-Range": f"0-{max(total - 1, 0)}/{total}" if total else "*/0"}
            return self.send(200, project(rows, q.get("select")), extra)
        if self.command == "POST":
            data = self.body()
            rows = data if isinstance(data, list) else [data]
            keys = q.get("on_conflict", "").split(",") if q.get("on_conflict") else (
                UNIQUE.get(table) or ([PK[table]] if PK[table] else []))
            out = []
            for r in rows:
                existing = next((x for x in DB[table] if keys and all(as_str(x.get(k)) == as_str(r.get(k)) for k in keys)), None)
                if existing is None and PK[table] and PK[table] in r:
                    existing = next((x for x in DB[table] if x[PK[table]] == r[PK[table]]), None)
                if existing is not None:
                    if "on_conflict" not in q:
                        return self.send(409, {"message": "duplicate key value violates unique constraint"})
                    if "ignore-duplicates" in prefer:
                        continue
                    existing.update(r)
                    out.append(existing)
                else:
                    out.append(insert_row(table, r))
            return self.send(201, [dict(x) for x in out] if "return=representation" in prefer else None)
        if self.command == "PATCH":
            values = self.body() or {}
            rows = apply_filters(DB[table], params)
            for r in rows:
                r.update(values)
            return self.send(200, [dict(r) for r in rows])
        if self.command == "DELETE":
            doomed = {id(r) for r in apply_filters(DB[table], params)}
            DB[table] = [r for r in DB[table] if id(r) not in doomed]
            return self.send(204)

    def storage(self, path):
        key = path[len("/storage/v1/object/"):]
        if self.command == "POST":
            n = int(self.headers.get("Content-Length") or 0)
            STORAGE[key] = (self.rfile.read(n), self.headers.get("Content-Type") or "application/octet-stream")
            return self.send(200, {"Key": key})
        if key not in STORAGE:
            return self.send(404, {"message": "not found"})
        data, ctype = STORAGE[key]
        self.send_response(200); self.send_header("Content-Type", ctype); self.send_header("Content-Length", str(len(data)))
        self.end_headers(); self.wfile.write(data)

    def auth(self, path, q):
        if path == "/auth/v1/token" and self.command == "POST":
            b = self.body() or {}
            if q.get("grant_type") == "password":
                u = USERS.get((b.get("email") or "").lower())
                if not u or u["password"] != b.get("password"):
                    return self.send(400, {"error": "invalid_grant", "error_description": "Invalid login credentials",
                                           "code": "invalid_credentials", "msg": "Invalid login credentials"})
                return self.send(200, session_for(u))
            if q.get("grant_type") == "refresh_token":
                u = TOKENS.get((b.get("refresh_token") or "").removesuffix("-r"))
                return self.send(200, session_for(u)) if u else self.send(400, {"error": "invalid_grant"})
        if path == "/auth/v1/user":
            tok = (self.headers.get("Authorization") or "").removeprefix("Bearer ").strip()
            u = TOKENS.get(tok)
            return self.send(200, user_json(u)) if u else self.send(401, {"msg": "invalid JWT"})
        if path == "/auth/v1/logout":
            return self.send(204)
        if path == "/auth/v1/settings":  # like Supabase: answers with the publishable key
            ok = (self.headers.get("apikey") or "") == "sb_publishable_local_emulator"
            return self.send(200, {"external": {"email": True}, "disable_signup": False}) if ok else self.send(401, {"message": "Invalid API key"})
        return self.send(404, {"msg": "not found"})


def main():
    repo = Path(sys.argv[1]).resolve()
    load_registry(repo)
    load_phones(repo)
    users_file = HERE / "emulator_users.json"
    if not users_file.exists():
        users_file.write_text(json.dumps([{"email": "analyst@kashshaf.test", "password": secrets.token_urlsafe(12)}],
                                         indent=2), encoding="utf-8")
    for u in json.loads(users_file.read_text(encoding="utf-8")):
        USERS[u["email"].lower()] = {"id": str(uuid.uuid4()), **u}
    print(f"Supabase emulator on http://localhost:{PORT} | {len(DB['entities'])} entities, "
          f"{len(DB['official_domains'])} official domains | users from {users_file.name}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()


if __name__ == "__main__":
    main()
