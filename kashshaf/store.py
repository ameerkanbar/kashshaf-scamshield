"""All reads and writes to the Kashshaf database (Supabase Postgres)."""
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit

from . import supa

def now() -> str:
    return datetime.now(timezone.utc).isoformat()


SEVERITY = {"fraud": 4, "suspicious": 3, "unreachable": 1, "safe": 0, "official": -1}

# Every list can be sorted three ways: newest first (default), oldest first, or most dangerous first.
SORTS = ("new", "old", "risk")

# ---- official registry (cached, refreshed every minute) ------------------
_registry_lock = threading.Lock()
_registry: dict = {"at": 0, "entities": [], "domains": {}}


def registry() -> dict:
    with _registry_lock:
        if time.time() - _registry["at"] > 60:
            entities = supa.select("entities", select="*")
            domains = supa.select("official_domains", select="domain,entity_id")
            by_id = {e["id"]: {**e, "domains": []} for e in entities}
            for d in domains:
                by_id[d["entity_id"]]["domains"].append(d["domain"])
            _registry.update(at=time.time(), entities=list(by_id.values()),
                             domains={d["domain"]: d["entity_id"] for d in domains})
        return _registry


def host_of(url: str) -> str:
    return (urlsplit(url).hostname or "").lower().removeprefix("www.")


def official_entity(host: str) -> dict | None:
    reg = registry()
    for domain, entity_id in reg["domains"].items():
        if host == domain or host.endswith("." + domain):
            return next(e for e in reg["entities"] if e["id"] == entity_id)
    return None


# Only government bodies can register names under these, so a page here cannot be an impostor site.
GOV_NAMESPACES = ("gov.ae", "mil.ae", "abudhabi")


def gov_namespace(host: str) -> str | None:
    return next((ns for ns in GOV_NAMESPACES if host == ns or host.endswith("." + ns)), None)


# ---- queue ----------------------------------------------------------------
def queue_url(url: str, source: str, *, priority: int = 0, query: str | None = None,
              persona_id: int | None = None, message_id: int | None = None, position: int | None = None,
              phone: str | None = None, raw: dict | None = None, requeue: bool = False) -> dict:
    """Add a URL to the work queue (once) and record where it was seen."""
    url = url.strip()
    rows = supa.insert("urls", {"url": url, "domain": host_of(url), "priority": priority},
                       on_conflict="url", ignore_duplicates=True)
    row = rows[0] if rows else supa.select("urls", url=f"eq.{url}", select="*")[0]
    row["_new"] = bool(rows)  # False: already in the database, not checked again
    if requeue:
        row = {**requeue_url(row, priority), "_new": row["_new"]}
    supa.insert("url_sightings", {"url_id": row["id"], "source": source, "query": query, "persona_id": persona_id,
                                  "message_id": message_id, "position": position, "phone": phone, "raw": raw},
                returning=False)
    return row


def requeue_url(row: dict, priority: int = 10) -> dict:
    """Send a link that was already checked back to the agents (no new sighting)."""
    if row["status"] in ("done", "error"):
        return supa.update("urls", {"status": "queued", "priority": priority, "attempts": 0}, id=f"eq.{row['id']}")[0]
    return row


def recently_checked(row: dict, hours: float) -> bool:
    if not row.get("last_checked"):
        return False
    return datetime.fromisoformat(row["last_checked"]) > datetime.now(timezone.utc) - timedelta(hours=hours)


# ---- search memory ----------------------------------------------------------
def recent_search(query: str, hl: str, purpose: str, hours: float) -> dict | None:
    """The last time this search ran within `hours`: same words, any letter case or interface language.
    (`hl` is kept for the record; the same words in another language mostly return the same links.)"""
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    pattern = re.sub(r"([\\%_*])", r"\\\1", " ".join(query.split()))  # escape LIKE wildcards: exact match
    rows = supa.select("searches", select="*", purpose=f"eq.{purpose}", query=f"ilike.{pattern}",
                       searched_at=f"gte.{since}", order="searched_at.desc", limit="1")
    return rows[0] if rows else None


def recent_queries(hours: float) -> set[str]:
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    return {r["query"].strip().lower() for r in supa.select("searches", select="query", purpose="eq.discovery",
                                                    searched_at=f"gte.{since}", limit="2000")}


def save_search(query: str, hl: str, purpose: str, *, maps: bool = False, results=None, new: int = 0,
                known: int = 0, known_blocked: int = 0, by: str | None = None) -> None:
    supa.insert("searches", {"query": query, "hl": hl, "purpose": purpose, "maps": maps, "results": results,
                             "new_links": new, "known_links": known, "known_blocked": known_blocked,
                             "searched_by": by}, returning=False)


def searches(limit: int = 60, sort: str = "new") -> list[dict]:
    """The search log. Each search also gets blocked_now / suspicious_now: how many links that phrase surfaced
    are blocked (or suspicious) today. risk = searches that lead people to blocked, then suspicious, sites first."""
    rows = supa.select("searches", select="id,query,hl,purpose,maps,new_links,known_links,known_blocked,searched_by,searched_at",
                       order="searched_at.asc" if sort == "old" else "searched_at.desc",
                       limit="1000" if sort == "risk" else str(limit))
    hits = {h["query"]: h for h in supa.select("search_hits", select="query,blocked_links,suspicious_links")}
    for r in rows:
        h = hits.get(r["query"].lower()) if r["purpose"] == "discovery" else None
        r["blocked_now"] = h["blocked_links"] if h else None
        r["suspicious_now"] = h["suspicious_links"] if h else None
    if sort == "risk":  # stable sort: newest first among equals
        rows.sort(key=lambda r: (r["blocked_now"] or 0, r["suspicious_now"] or 0), reverse=True)
    return rows[:limit]


def add_message(text: str, channel: str, user_id: str | None) -> int:
    return supa.insert("messages", {"text": text, "channel": channel, "submitted_by": user_id})[0]["id"]


def claim(agent: str) -> dict | None:
    rows = supa.rpc("claim_url", {"agent_name": agent})
    return rows[0] if rows else None


def queue_size() -> int:
    return supa.count("urls", status="eq.queued")


# ---- results ----------------------------------------------------------------
def save_result(url_row: dict, agent: str, scan: dict | None, verdict: dict) -> None:
    scan_id = None
    if scan is not None:
        scan_id = supa.insert("scans", {**scan, "url_id": url_row["id"], "agent": agent,
                                        "finished_at": now()})[0]["id"]
    supa.insert("verdicts", {"url_id": url_row["id"], "scan_id": scan_id, "verdict": verdict["verdict"],
                             "score": verdict["score"], "claimed_entity_id": verdict.get("claimed_entity_id"),
                             "reasons": verdict["reasons"], "ai": verdict.get("ai"), "model": verdict.get("model")},
                returning=False)
    fps = verdict.get("fingerprints") or []
    if fps:
        saved = supa.insert("fingerprints", [{"kind": f["kind"], "value": f["value"]} for f in fps],
                            on_conflict="kind,value")
        supa.insert("url_fingerprints", [{"url_id": url_row["id"], "fingerprint_id": f["id"]} for f in saved],
                    on_conflict="url_id,fingerprint_id", ignore_duplicates=True, returning=False)
    supa.update("urls", {"status": "done", "last_checked": now(), "claimed_by": None}, id=f"eq.{url_row['id']}")
    _update_domain(url_row["domain"], verdict)


def mark_error(url_row: dict, error: str) -> None:
    supa.update("urls", {"status": "error" if url_row.get("attempts", 0) >= 3 else "queued",
                         "claimed_by": None}, id=f"eq.{url_row['id']}")
    audit("system", "scan_error", url_row["url"], {"error": error[:300]})


def _update_domain(domain: str, verdict: dict | None = None) -> None:
    """A domain takes the most severe *current* verdict among its URLs, so a rescan can clear it.
    Shared platforms (facebook.com, x.com...) are never blocked as a whole: capped at suspicious."""
    from .rules import is_platform
    ids = [str(u["id"]) for u in supa.select("urls", select="id", domain=f"eq.{domain}")]
    latest: dict = {}
    if ids:
        for v in supa.select("verdicts", select="url_id,verdict,score,claimed_entity_id",
                             url_id=f"in.({','.join(ids)})", order="created_at.desc"):
            latest.setdefault(v["url_id"], v)
    if not latest:
        return
    worst = max(latest.values(), key=lambda v: (SEVERITY[v["verdict"]], v["score"]))
    worst = dict(worst)
    platform = is_platform(domain)
    if worst["verdict"] == "fraud" and platform:
        worst["verdict"] = "suspicious"
    current = domain_status(domain) or {}
    blocked_at = current.get("blocked_at")
    # fraud, and suspicious pending review, are blocked straight away (never a whole shared platform)
    if worst["verdict"] in BLOCKING and not platform:
        blocked_at = blocked_at or now()  # first time it became blocked
    elif current.get("override") != "block":
        blocked_at = None
    supa.insert("domains", {"domain": domain, "verdict": worst["verdict"], "score": worst["score"],
                            "claimed_entity_id": worst.get("claimed_entity_id"), "updated_at": now(),
                            "blocked_at": blocked_at, "platform": platform},
                on_conflict="domain", returning=False)


# ---- reads for the dashboard and public API ------------------------------------
def findings(verdict: str | None = None, search: str | None = None, limit: int = 200, sort: str = "new") -> list[dict]:
    """The latest verdict of each link. risk = fraud, then suspicious, then the rest; higher score first."""
    order = {"new": "created_at.desc", "old": "created_at.asc", "risk": "severity.desc,score.desc,created_at.desc"}[sort]
    params = {"select": "*", "order": order, "limit": str(limit)}
    if verdict == "review":  # blocked as suspicious, waiting for an analyst
        params["pending_review"] = "is.true"
    elif verdict:
        params["verdict"] = f"eq.{verdict}"
    if search:
        params["or"] = f"(url.ilike.*{search}*,title.ilike.*{search}*)"
    return supa.select("findings", **params)


def scan_result(ids: list[int]) -> list[dict]:
    """Where each link of one check stands: waiting, being checked, or its latest verdict."""
    if not ids:
        return []
    ids_in = f"in.({','.join(str(i) for i in ids)})"
    urls = {u["id"]: u for u in supa.select("urls", select="id,url,status,claimed_by", id=ids_in)}
    found = {f["url_id"]: f for f in supa.select(
        "findings", select="url_id,verdict,score,entity_ar,reasons,ai,model,created_at,blocked,cloaked", url_id=ids_in)}
    out = []
    for i in ids:
        u = urls.get(i)
        if u:
            pending = u["status"] in ("queued", "checking")
            out.append({"url_id": i, "url": u["url"], "status": u["status"], "agent": u["claimed_by"],
                        "pending": pending, "result": None if pending else found.get(i)})
    return out


def finding_detail(url_id: int) -> dict:
    url = supa.select("urls", id=f"eq.{url_id}", select="*")[0]
    return {
        "url": url,
        "verdicts": supa.select("verdicts", url_id=f"eq.{url_id}", select="*", order="created_at.desc", limit="5"),
        "scans": supa.select("scans", url_id=f"eq.{url_id}", select="*", order="started_at.desc", limit="3"),
        "sightings": supa.select("url_sightings", url_id=f"eq.{url_id}", select="*", order="seen_at.desc", limit="50"),
        "fingerprints": supa.select("url_fingerprints", url_id=f"eq.{url_id}", select="fingerprints(kind,value)"),
    }


def domain_status(domain: str) -> dict | None:
    rows = supa.select("domains", domain=f"eq.{domain}", select="*")
    return rows[0] if rows else None


BLOCKING = ("fraud", "suspicious")  # suspicious = blocked until an analyst reviews it


def is_blocked(row: dict | None) -> bool:
    """Blocked for the public: confirmed fraud, a manual block, or suspicious waiting for review."""
    if not row or row.get("override") == "allow":
        return False
    return row.get("override") == "block" or (row.get("verdict") in BLOCKING and not row.get("platform"))


def pending_review(row: dict | None) -> bool:
    return bool(row) and row.get("override") is None and row.get("verdict") == "suspicious" and not row.get("platform")


def is_confirmed_fraud(row: dict | None) -> bool:
    if not row or row.get("override") == "allow":
        return False
    return row.get("override") == "block" or row.get("verdict") == "fraud"


def review_queue() -> list[dict]:
    return supa.select("review_queue", select="domain")


def blocked_list(sort: str = "new") -> list[dict]:
    """Blocked domains. risk = highest score first, then the most seen."""
    order = {"new": "blocked_at.desc", "old": "blocked_at.asc", "risk": "score.desc,sightings.desc,blocked_at.desc"}[sort]
    rows = supa.select("blocked_list", select="*", order=order)
    # takedown contacts from each domain's latest evidence, for the CSV export
    latest: dict = {}
    domains = [r["domain"] for r in rows]
    for part in _chunks(domains, 50):
        quoted = ",".join(f'"{d}"' for d in part)
        for ev in supa.select("evidence", select="domain,captured_at,whois,hosting", domain=f"in.({quoted})",
                              order="captured_at.desc"):
            latest.setdefault(ev["domain"], ev)
    for r in rows:
        ev = latest.get(r["domain"]) or {}
        w, h = ev.get("whois") or {}, ev.get("hosting") or {}
        r.update(evidence_at=ev.get("captured_at"), registrar=w.get("registrar"), registrar_abuse=w.get("abuse_email"),
                 domain_created=w.get("created"), ip=h.get("ip"), hosting=h.get("as_name") or h.get("owner"),
                 hosting_abuse=h.get("abuse_email"))
    return rows


def blocklist() -> list[str]:
    return [r["domain"] for r in supa.select("blocklist", select="domain", order="domain")]


_counts = ThreadPoolExecutor(max_workers=10, thread_name_prefix="stats")


def stats() -> dict:
    """Dashboard numbers. The ten counts run at the same time (one after another took over 2 seconds)."""
    jobs = {"urls": ("urls", {}), "queued": ("urls", {"status": "eq.queued"}), "checking": ("urls", {"status": "eq.checking"}),
            "fraud": ("domains", {"verdict": "eq.fraud"}), "suspicious": ("domains", {"verdict": "eq.suspicious"}),
            "safe": ("domains", {"verdict": "eq.safe"}), "official": ("domains", {"verdict": "eq.official"}),
            "blocked": ("blocklist", {}), "review": ("review_queue", {}), "cloaked": ("scans", {"cloaked": "is.true"}), "messages": ("messages", {})}
    running = {k: _counts.submit(supa.count, table, **f) for k, (table, f) in jobs.items()}
    return {k: f.result() for k, f in running.items()}


def gangs(sort: str = "new") -> list[dict]:
    """Union sites that share any indicator into gangs. Time sorts use the last activity; risk = most sites first."""
    groups: list[dict] = []
    # only sites judged fraud or suspicious form gangs (legit sister sites share analytics IDs)
    risky = {r["domain"] for r in supa.select("domains", select="domain", verdict="in.(fraud,suspicious)")}
    for ind in supa.select("shared_indicators", select="*"):
        domains = set(ind["domains"]) & risky
        if len(domains) < 2:
            continue
        hits = [g for g in groups if g["domains"] & domains]
        merged = {"domains": domains, "indicators": [f"{ind['kind']}:{ind['value']}"]}
        for g in hits:
            merged["domains"] |= g["domains"]
            merged["indicators"] += g["indicators"]
            groups.remove(g)
        groups.append(merged)
    all_domains = sorted({d for g in groups for d in g["domains"]})
    seen = {r["domain"]: r for r in supa.select("domains", select="domain,first_seen,updated_at",
                                                 domain=f"in.({','.join(all_domains)})")} if all_domains else {}
    latest = lambda d: (seen.get(d) or {}).get("updated_at") or ""
    out = []
    for g in groups:
        rows = [seen[d] for d in g["domains"] if d in seen]
        out.append({"domains": sorted(g["domains"], key=latest, reverse=True), "indicators": g["indicators"],
                    "first_seen": min((r["first_seen"] for r in rows), default=None),
                    "last_seen": max((r["updated_at"] for r in rows), default=None)})
    out.sort(key=lambda g: g["last_seen"] or "", reverse=sort != "old")
    if sort == "risk":  # stable sort: the most recently active first among gangs of the same size
        out.sort(key=lambda g: len(g["domains"]), reverse=True)
    return out


def set_override(domain: str, action: str | None, actor: str, note: str | None = None) -> None:
    """An analyst's decision. block = fraud, keep blocked; allow = safe, unblock;
    official = add the domain to the registry under the body it presents as, unblock, and re-check its links."""
    if not domain_status(domain):
        supa.insert("domains", {"domain": domain, "verdict": "suspicious", "score": 0}, returning=False)
    if action == "official":
        entity_id = (domain_status(domain) or {}).get("claimed_entity_id")
        if not entity_id:
            raise ValueError("no claimed entity for this domain")
        supa.insert("official_domains", {"domain": domain, "entity_id": entity_id, "verified": False,
                                         "source": f"analyst {actor}"}, on_conflict="domain", returning=False)
        _registry["at"] = 0  # reload the registry now
        audit(actor, "override_official", domain, {"note": note, "entity": entity_id})
        for row in supa.select("urls", select="*", domain=f"eq.{domain}"):
            requeue_url(row, priority=10)
        action = "allow"
        patch = {"override": action, "override_by": actor, "override_note": note or "رسمي", "updated_at": now()}
        supa.update("domains", patch, domain=f"eq.{domain}")
        return
    patch = {"override": action, "override_by": actor if action else None, "override_note": note, "updated_at": now()}
    if action == "block" and not (domain_status(domain) or {}).get("blocked_at"):
        patch["blocked_at"] = now()
    supa.update("domains", patch, domain=f"eq.{domain}")
    audit(actor, f"override_{action or 'clear'}", domain, {"note": note})


def audit(actor: str, action: str, target: str | None = None, details: dict | None = None) -> None:
    try:
        supa.insert("audit_log", {"actor": actor, "action": action, "target": target, "details": details},
                    returning=False)
    except supa.SupabaseError as e:
        print(f"[audit] {e}")


# "Most dangerous first" in the audit log: analyst decisions that change what is blocked, then errors.
AUDIT_RISK = {"override_block": 2, "override_allow": 2, "override_clear": 2, "override_official": 2,
              "budget_reached": 1, "google_error": 1, "ct_error": 1, "scan_error": 1, "evidence_error": 1}


def audit_log(limit: int = 100, actions: list[str] | None = None, sort: str = "new") -> list[dict]:
    params = {"select": "*", "order": "at.asc" if sort == "old" else "at.desc",
              "limit": "1000" if sort == "risk" else str(limit)}
    if actions:
        params["action"] = f"in.({','.join(actions)})"
    rows = supa.select("audit_log", **params)
    if sort == "risk":  # stable sort: newest first within each rank
        rows.sort(key=lambda r: AUDIT_RISK.get(r["action"], 0), reverse=True)
    return rows[:limit]


def personas() -> list[dict]:
    return supa.select("personas", active="is.true", select="*")


# ---- file imports (e.g. an evaluation set from the organisers) --------------------------------
def _chunks(items: list, size: int = 200):
    for i in range(0, len(items), size):
        yield items[i:i + size]


def create_import(file_name: str, actor: str, parsed: dict, recheck_hours: float) -> dict:
    """Queue every link of an imported file in bulk and remember the batch.
    A link checked within recheck_hours keeps its verdict; an older one is checked again."""
    items = parsed["items"]
    batch = supa.insert("imports", {"file_name": file_name[:200], "imported_by": actor, "total": len(items),
                                    "labelled": sum(1 for x in items if x["expected"]),
                                    "skipped": parsed["skipped"]})[0]
    ids: dict[str, dict] = {}
    for part in _chunks(items, 50):  # links go in the query string, so keep each request short
        supa.insert("urls", [{"url": x["url"], "domain": host_of(x["url"]), "priority": 5} for x in part],
                    on_conflict="url", ignore_duplicates=True, returning=False)
        quoted = ",".join('"' + x["url"].replace('"', '\\"') + '"' for x in part)
        for row in supa.select("urls", select="id,url,status,last_checked", url=f"in.({quoted})"):
            ids[row["url"]] = row
    stale = [r["id"] for r in ids.values()
             if r["status"] in ("done", "error") and not recently_checked(r, recheck_hours)]
    for part in _chunks(stale):
        supa.update("urls", {"status": "queued", "priority": 5, "attempts": 0},
                    id=f"in.({','.join(map(str, part))})")
    rows = [(x, ids[x["url"]]) for x in items if x["url"] in ids]
    for part in _chunks(rows):
        supa.insert("url_sightings", [{"url_id": r["id"], "source": "import", "position": x["line"],
                                       "raw": {"import_id": batch["id"], "file": file_name[:200]}} for x, r in part],
                    returning=False)
        supa.insert("import_items", [{"import_id": batch["id"], "url_id": r["id"], "line": x["line"],
                                      "expected": x["expected"]} for x, r in part],
                    on_conflict="import_id,url_id", ignore_duplicates=True, returning=False)
    audit(actor, "import", file_name[:200], {"import_id": batch["id"], "links": len(rows), "skipped": parsed["skipped"],
                                             "labelled": batch["labelled"]})
    return batch


def import_result(import_id: int) -> dict:
    """Progress of one import, each link's verdict, and (when the file had labels) precision and recall.
    "Flagged" means blocked for the public: fraud, or suspicious pending review."""
    batch = supa.select("imports", id=f"eq.{import_id}", select="*")[0]
    items = supa.select("import_items", import_id=f"eq.{import_id}", select="url_id,line,expected", order="line")
    rows = []
    for part in _chunks(items):
        ids_in = f"in.({','.join(str(i['url_id']) for i in part)})"
        urls = {u["id"]: u for u in supa.select("urls", select="id,url,status", id=ids_in)}
        found = {f["url_id"]: f for f in supa.select(
            "findings", select="url_id,verdict,score,entity_ar,blocked,pending_review,created_at", url_id=ids_in)}
        for i in part:
            u, f = urls.get(i["url_id"], {}), found.get(i["url_id"])
            pending = u.get("status") in ("queued", "checking") or not f
            rows.append({"line": i["line"], "url_id": i["url_id"], "url": u.get("url"), "expected": i["expected"],
                         "pending": pending, "verdict": None if pending else f["verdict"],
                         "score": None if pending else f["score"], "entity_ar": None if pending else f["entity_ar"],
                         "blocked": bool(f and f["blocked"]) and not pending,
                         "pending_review": bool(f and f["pending_review"]) and not pending,
                         "checked_at": None if pending else f["created_at"]})
    done = [r for r in rows if not r["pending"]]
    counts = {v: sum(1 for r in done if r["verdict"] == v) for v in SEVERITY}
    metrics = None
    labelled = [r for r in done if r["expected"]]
    if labelled:
        tp = sum(1 for r in labelled if r["expected"] == "fraud" and r["blocked"])
        fn = sum(1 for r in labelled if r["expected"] == "fraud" and not r["blocked"])
        fp = sum(1 for r in labelled if r["expected"] == "legit" and r["blocked"])
        tn = sum(1 for r in labelled if r["expected"] == "legit" and not r["blocked"])
        precision = tp / (tp + fp) if tp + fp else None
        recall = tp / (tp + fn) if tp + fn else None
        f1 = 2 * precision * recall / (precision + recall) if precision and recall else None
        metrics = {"tp": tp, "fp": fp, "tn": tn, "fn": fn, "checked": len(labelled),
                   "precision": precision, "recall": recall, "f1": f1, "accuracy": (tp + tn) / len(labelled)}
    return {"import": batch, "done": len(done), "total": len(rows), "counts": counts,
            "blocked": sum(1 for r in done if r["blocked"]), "metrics": metrics, "rows": rows}
