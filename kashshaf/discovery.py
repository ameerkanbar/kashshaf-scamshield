"""Find URLs to inspect from real sources.

- Google (via SerpAPI): organic results, ads, AI Overview references and local/Maps
  results, searched as Abu Dhabi residents on a phone.
- Certificate Transparency logs (crt.sh): new certificates for domains that
  contain an official brand name, e.g. "adpolice-pay".
- OpenPhish community feed: live phishing URLs, filtered to UAE brands.
"""
import json
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

from . import config, control, health, store

LOCATION = "Abu Dhabi,Abu Dhabi,United Arab Emirates"


def _get_json(url: str, timeout: int = 30):
    req = urllib.request.Request(url, headers={"User-Agent": "Kashshaf/1.0 (fraud research)"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def serp(query: str, *, engine: str = "google", hl: str = "en") -> dict:
    if not config.SERPAPI_KEY:
        raise RuntimeError("SERPAPI_KEY is not set in .env")
    control.take("serp")  # raises BudgetExceeded past the hourly cap
    params = {"engine": engine, "q": query, "api_key": config.SERPAPI_KEY, "hl": hl, "gl": "ae"}
    if engine == "google":
        params.update(location=LOCATION, device="mobile", num="20")
    else:  # google_maps
        params.update(ll="@24.4539,54.3773,12z", type="search")
    try:
        data = _get_json("https://serpapi.com/search.json?" + urllib.parse.urlencode(params), timeout=60)
        health.record("serpapi", data.get("error"))
        return data
    except urllib.error.HTTPError as e:
        health.record("serpapi", f"HTTP {e.code}")
        if e.code == 429:  # plan used up (or rate limited): stop trying for an hour
            control.mark_exhausted("serp")
            raise control.BudgetExceeded("SerpAPI searches are used up (HTTP 429)") from None
        raise


def _places(data) -> list[dict]:
    lr = data.get("local_results")
    if isinstance(lr, dict):
        lr = lr.get("places", [])
    return lr or []


def search_google(query: str, *, persona: dict | None = None, hl: str = "en", maps: bool = True,
                  force: bool = False, by: str = "discovery") -> dict:
    """Run one resident search and queue every link it shows.

    A search already run in the last SEARCH_COOLDOWN_HOURS is not paid for again (unless force):
    the result says cached=True. Links already in the database are recorded as seen again,
    but not checked again.
    """
    query = query.strip()
    if not force:
        prev = store.recent_search(query, hl, "discovery", config.SEARCH_COOLDOWN_HOURS)
        if prev:
            control.saved("serp")
            return {"cached": True, "searched_at": prev["searched_at"], "new": prev["new_links"],
                    "known": prev["known_links"], "known_blocked": prev["known_blocked"], "queued": 0}
    pid = persona["id"] if persona else None
    blocked = set(store.blocklist())
    counts = {"new": 0, "known": 0, "known_blocked": 0}
    links = []

    def q(url, source, position=None, phone=None, raw=None):
        if url and url.startswith(("http://", "https://")):
            row = store.queue_url(url, source, query=query, persona_id=pid, position=position, phone=phone, raw=raw,
                                  priority=5 if source in ("serp_ad", "serp_ai_overview") else 1)
            counts["new" if row["_new"] else "known"] += 1
            if row["domain"] in blocked:
                counts["known_blocked"] += 1
            links.append(url)

    data = serp(query, hl=hl)
    for ad in data.get("ads", []) or []:
        q(ad.get("link"), "serp_ad", ad.get("position"), raw={"title": ad.get("title")})
    for r in data.get("organic_results", []) or []:
        q(r.get("link"), "serp_organic", r.get("position"), raw={"title": r.get("title")})
    for i, ref in enumerate((data.get("ai_overview") or {}).get("references", []) or []):
        q(ref.get("link"), "serp_ai_overview", i + 1, raw={"title": ref.get("title")})
    for i, p in enumerate(_places(data)):
        site = p.get("website") or (p.get("links") or {}).get("website")
        q(site, "maps", i + 1, p.get("phone"), {"title": p.get("title"), "address": p.get("address")})
    if maps:
        for i, p in enumerate(_places(serp(query, engine="google_maps", hl=hl))):
            q(p.get("website"), "maps", i + 1, p.get("phone"), {"title": p.get("title"), "address": p.get("address")})
    store.save_search(query, hl, "discovery", maps=maps, results=links[:60], by=by, **counts)
    store.audit(by, "google_search", query, {"persona": pid, "queued": counts["new"], **counts})
    return {"cached": False, "queued": counts["new"], **counts}


def run_personas(limit_queries: int | None = None) -> int:
    total, done = 0, 0
    for persona in store.personas():
        hl = {"ar": "ar", "hi": "hi", "ur": "ur", "tl": "tl"}.get(persona["language"], "en")
        for query in persona["queries"]:
            if (limit_queries is not None and done >= limit_queries) or control.cancel.is_set():
                return total
            try:
                total += search_google(query, persona=persona, hl=hl)["new"]
            except control.BudgetExceeded as e:
                store.audit("discovery", "budget_reached", query, {"error": str(e)})
                return total
            except Exception as e:
                store.audit("discovery", "google_error", query, {"error": str(e)[:300]})
            done += 1
    return total


def run_ct_logs(days: int = 14) -> int:
    """New certificates whose domain contains an official brand token."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    official = store.registry()["domains"]
    queued = 0
    for entity in store.registry()["entities"]:
        for token in entity["brand_tokens"]:
            if control.cancel.is_set():
                break
            token = token.strip("-")
            if len(token) < 4:
                continue
            try:
                certs = _get_json(f"https://crt.sh/?q=%25{urllib.parse.quote(token)}%25&output=json&exclude=expired",
                                  timeout=60)
            except Exception as e:
                store.audit("discovery", "ct_error", token, {"error": str(e)[:200]})
                continue
            for c in certs:
                try:
                    issued = datetime.fromisoformat(c["not_before"]).replace(tzinfo=timezone.utc)
                except (KeyError, ValueError):
                    continue
                if issued < since:
                    continue
                for name in set(c.get("name_value", "").lower().split("\n")):
                    name = name.strip().lstrip("*.")
                    if not name or any(name == d or name.endswith("." + d) for d in official):
                        continue
                    store.queue_url(f"https://{name}/", "ct_log", priority=3,
                                    raw={"brand": entity["id"], "issued": c["not_before"], "issuer": c.get("issuer_name")})
                    queued += 1
    store.audit("discovery", "ct_logs", None, {"queued": queued})
    return queued


def run_phish_feed() -> int:
    """OpenPhish community feed, filtered to UAE brands and .ae domains."""
    req = urllib.request.Request("https://openphish.com/feed.txt", headers={"User-Agent": "Kashshaf/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        lines = r.read().decode("utf-8", "replace").split()
    tokens = {t.strip("-") for e in store.registry()["entities"] for t in e["brand_tokens"] if len(t.strip("-")) >= 4}
    tokens |= {"uae", "abudhabi", "abu-dhabi", "dubai", "emirates"}
    queued = 0
    for url in lines:
        host = store.host_of(url)
        if host.endswith(".ae") or any(t in url.lower() for t in tokens):
            store.queue_url(url, "phish_feed", priority=4)
            queued += 1
    store.audit("discovery", "phish_feed", None, {"queued": queued, "feed_size": len(lines)})
    return queued


def web_search(query: str) -> list[dict]:
    """Top results for the agent's own research. Same question within a week: answered from the database."""
    query = query.strip()
    prev = store.recent_search(query, "en", "agent", config.AGENT_SEARCH_CACHE_HOURS)
    if prev and prev.get("results") is not None:
        control.saved("serp")
        return prev["results"]
    data = serp(query, hl="en")
    results = [{"title": r.get("title"), "link": r.get("link"), "snippet": r.get("snippet")}
               for r in (data.get("organic_results") or [])[:6]]
    store.save_search(query, "en", "agent", results=results, by="agent")
    return results
