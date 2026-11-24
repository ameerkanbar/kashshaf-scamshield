"""Which outside services Kashshaf is connected to, checked live for the Settings page.

Every check is free except the optional Claude test (one tiny message), which only runs when an analyst presses
"test" for it. Keys are never returned, only whether they are set and their last four characters.
"""
import json
import os
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlsplit

from . import config, control, fetcher, supa

MODEL = os.environ.get("AGENT_MODEL", "claude-opus-5-5")  # same default as agent.py

# Last real result of the paid APIs, updated by agent.py and discovery.py as they are used.
USAGE = {"claude": {"ok_at": None, "error": None, "error_at": None}, "serpapi": {"ok_at": None, "error": None, "error_at": None}}


def record(service: str, error: str | None = None) -> None:
    u = USAGE[service]
    if error:
        u.update(error=error[:300], error_at=time.time())
    else:
        u.update(ok_at=time.time())


def _mask(key: str) -> str | None:
    return f"…{key[-4:]}" if key else None


def _get(url: str, timeout: int = 10, headers: dict | None = None) -> tuple[int, bytes]:
    req = urllib.request.Request(url, headers={"User-Agent": "Kashshaf/1.0 (health check)", **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.read(4000)


def _run(fn) -> dict:
    """Time a check. fn returns details (a dict) or raises."""
    t0 = time.time()
    try:
        detail = fn() or {}
        status = detail.pop("_status", "ok")
        return {"status": status, "ms": int((time.time() - t0) * 1000), "detail": detail}
    except Exception as e:
        return {"status": "error", "ms": int((time.time() - t0) * 1000), "error": f"{type(e).__name__}: {e}"[:300]}


# ---- checks -------------------------------------------------------------------
def _supabase_db():
    return {"entities": supa.count("entities"), "official_domains": supa.count("official_domains"), "host": urlsplit(config.SUPABASE_URL).hostname}


def _supabase_auth():
    _get(f"{config.SUPABASE_URL}/auth/v1/settings", headers={"apikey": config.SUPABASE_PUBLISHABLE_KEY})
    return {"host": urlsplit(config.SUPABASE_URL).hostname}


def _claude(test: bool):
    if not config.ANTHROPIC_API_KEY:
        return {"_status": "off"}
    detail = {"model": MODEL, "endpoint": urlsplit(config.AGENT_BASE_URL).hostname if config.AGENT_BASE_URL else "api.anthropic.com",
              "key": _mask(config.ANTHROPIC_API_KEY), "calls_hour": control.snapshot()["ai_hour"], "cap_hour": config.AI_MAX_PER_HOUR}
    if test:  # one tiny real request
        import anthropic
        client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY, base_url=config.AGENT_BASE_URL or None)
        r = client.messages.create(model=MODEL, max_tokens=8, messages=[{"role": "user", "content": "Reply with: ok"}])
        record("claude")
        detail["answered_by"] = r.model
        return detail
    u = USAGE["claude"]  # no request: report what the real investigations did
    if u["error_at"] and (not u["ok_at"] or u["error_at"] > u["ok_at"]):
        raise RuntimeError(u["error"])
    detail["_status"] = "ok" if u["ok_at"] else "configured"
    detail["last_ok"] = u["ok_at"]
    return detail


def _serpapi():
    if not config.SERPAPI_KEY:
        return {"_status": "off"}
    _, body = _get("https://serpapi.com/account.json?" + urllib.parse.urlencode({"api_key": config.SERPAPI_KEY}))
    a = json.loads(body)  # account info; does not use a search
    if a.get("error"):
        raise RuntimeError(a["error"])
    snap = control.snapshot()
    return {"plan": a.get("plan_name"), "searches_left": a.get("total_searches_left", a.get("plan_searches_left")),
            "searches_month": a.get("searches_per_month"), "key": _mask(config.SERPAPI_KEY),
            "calls_hour": snap["serp_hour"], "cap_hour": config.SERP_MAX_PER_HOUR, "exhausted": snap["serp_exhausted"]}


def _crtsh():
    status, _ = _get("https://crt.sh/?q=adpolice.gov.ae&output=json&exclude=expired", timeout=20)
    return {"http": status, "host": "crt.sh"}


def _openphish():
    status, body = _get("https://openphish.com/feed.txt")
    return {"http": status, "host": "openphish.com", "sample_lines": body.count(b"\n")}


def _rdap():
    status, _ = _get("https://rdap.org/domain/google.com")
    return {"http": status, "host": "rdap.org"}


def _test_sites():
    if not fetcher.ALLOW_TEST_SITES:
        return {"_status": "off"}
    page = fetcher.fetch("http://karak-cafe.localhost:8081/", fetcher.BOT_UA)
    if page["error"]:
        raise RuntimeError(page["error"])
    return {"http": page["status"], "host": "*.localhost:8081"}


def _peers():
    """Other machines whose agents checked links in this database in the last 15 minutes. They share the queue
    (claim_url), so every link goes to whichever agent claims it first: this server may then look idle."""
    from datetime import datetime, timedelta, timezone
    from . import org
    me = org.current().host if org.current() else None
    since = (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()
    hosts: dict[str, dict] = {}
    for r in supa.select("scans", select="agent,finished_at", finished_at=f"gte.{since}", order="finished_at.desc", limit="1000"):
        host = r["agent"].split("@", 1)[1] if "@" in r["agent"] else r["agent"]
        h = hosts.setdefault(host, {"host": host, "scans": 0, "last": r["finished_at"]})
        h["scans"] += 1
    others = [h for h in hosts.values() if h["host"] not in (me, "gateway", "manual-recheck")]
    detail = {"this_server": me, "this_scans": hosts.get(me, {}).get("scans", 0),
              "others": ", ".join(f"{h['host']} ({h['scans']})" for h in others) or None}
    detail["_status"] = "warn" if others else "ok"
    return detail


CHECKS = {
    "peers": lambda test: _peers(),
    "supabase_db": lambda test: _supabase_db(), "supabase_auth": lambda test: _supabase_auth(), "claude": _claude,
    "serpapi": lambda test: _serpapi(), "crtsh": lambda test: _crtsh(), "openphish": lambda test: _openphish(),
    "rdap": lambda test: _rdap(), "test_sites": lambda test: _test_sites(),
}
_pool = ThreadPoolExecutor(max_workers=len(CHECKS), thread_name_prefix="health")


def check(service: str | None = None, test: bool = False) -> list[dict]:
    """Run every check side by side (or one). `test` lets the Claude check send its one small request."""
    ids = [service] if service else list(CHECKS)
    jobs = {i: _pool.submit(_run, lambda i=i: CHECKS[i](test)) for i in ids if i in CHECKS}
    return [{"id": i, "checked_at": time.time(), **j.result()} for i, j in jobs.items()]


def settings() -> dict:
    """The non-secret settings, for the same page."""
    return {
        "agent_count": config.AGENT_COUNT, "agent_model": MODEL, "agent_min_rule_score": config.AGENT_MIN_RULE_SCORE,
        "agent_base_url": urlsplit(config.AGENT_BASE_URL).hostname if config.AGENT_BASE_URL else None,
        "discovery_interval_min": config.DISCOVERY_INTERVAL_MIN, "patrol_interval_sec": config.PATROL_INTERVAL_SEC,
        "serp_max_per_hour": config.SERP_MAX_PER_HOUR, "ai_max_per_hour": config.AI_MAX_PER_HOUR,
        "search_cooldown_hours": config.SEARCH_COOLDOWN_HOURS, "agent_search_cache_hours": config.AGENT_SEARCH_CACHE_HOURS,
        "recheck_after_hours": config.RECHECK_AFTER_HOURS, "allow_local_test_sites": fetcher.ALLOW_TEST_SITES,
        "supabase_host": urlsplit(config.SUPABASE_URL).hostname,
    }
