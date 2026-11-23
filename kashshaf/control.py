"""On/off switch, spending caps and the patrol loop.

- stop(): agents stop taking links, the running search round is cancelled, patrol stops.
- Caps: Google searches and Claude investigations per hour (and in total since the server
  started). Past a cap, searches pause and links are judged by the rules only.
- Patrol: while on, picks a random resident search every PATROL_INTERVAL_SEC seconds and,
  between searches, checks the free sources (phishing feed, certificate logs).
"""
import random
import threading
import time

from . import config, store


class BudgetExceeded(RuntimeError):
    pass


_lock = threading.Lock()
state = {
    "running": True,          # agents take links from the queue
    "patrol": False,          # continuous random search
    "patrol_since": None,
    "patrol_rounds": 0,
    "patrol_last": None,      # last thing patrol did
}
cancel = threading.Event()    # set to cancel a running discovery round
_wake = threading.Event()
_patrol_thread: threading.Thread | None = None

_usage = {"serp": [], "ai": []}  # timestamps in the last hour
totals = {"serp": 0, "ai": 0, "input_tokens": 0, "output_tokens": 0, "serp_saved": 0, "ai_saved": 0}
LIMITS = {"serp": lambda: config.SERP_MAX_PER_HOUR, "ai": lambda: config.AI_MAX_PER_HOUR}


def _recent(kind: str) -> list[float]:
    cutoff = time.time() - 3600
    _usage[kind] = [t for t in _usage[kind] if t > cutoff]
    return _usage[kind]


def take(kind: str) -> None:
    """Count one paid call. Raises BudgetExceeded when the hourly cap is reached."""
    with _lock:
        if exhausted.get(kind, 0) > time.time():
            raise BudgetExceeded(f"{kind} provider quota is used up; retry after {time.strftime('%H:%M', time.localtime(exhausted[kind]))}")
        if len(_recent(kind)) >= LIMITS[kind]():
            raise BudgetExceeded(f"{kind} hourly cap reached ({LIMITS[kind]()}/h)")
        _usage[kind].append(time.time())
        totals[kind] += 1


# Set when SerpAPI says the plan is used up (HTTP 429); no more search attempts until then.
exhausted = {"serp": 0.0}


def mark_exhausted(kind: str, seconds: int = 3600) -> None:
    exhausted[kind] = time.time() + seconds


def available(kind: str) -> bool:
    with _lock:
        return exhausted.get(kind, 0) < time.time() and len(_recent(kind)) < LIMITS[kind]()


def saved(kind: str) -> None:
    """A paid call we did not need: answered from the database instead."""
    with _lock:
        totals[f"{kind}_saved"] += 1


def add_tokens(inp: int, out: int) -> None:
    with _lock:
        totals["input_tokens"] += inp or 0
        totals["output_tokens"] += out or 0


def snapshot() -> dict:
    with _lock:
        return {**state, "serp_hour": len(_recent("serp")), "serp_cap": config.SERP_MAX_PER_HOUR,
                "serp_exhausted": exhausted["serp"] > time.time(),
                "ai_hour": len(_recent("ai")), "ai_cap": config.AI_MAX_PER_HOUR,
                "patrol_interval": config.PATROL_INTERVAL_SEC, **totals}


# ---- switches ----------------------------------------------------------------
def start(pool, actor: str) -> None:
    state["running"] = True
    cancel.clear()
    pool.notify()
    store.audit(actor, "agents_start")


def stop(pool, actor: str) -> None:
    """Stop everything that spends: agents, the running search round and patrol."""
    state["running"] = False
    state["patrol"] = False
    cancel.set()
    _wake.set()
    store.audit(actor, "agents_stop")


def stop_search(pool, actor: str) -> None:
    """Stop searching (running round and patrol). Agents keep checking links already found."""
    state["patrol"] = False
    cancel.set()
    _wake.set()
    store.audit(actor, "search_stop")


def patrol_on(pool, actor: str) -> None:
    global _patrol_thread
    start(pool, actor)
    _wake.clear()  # a stop() earlier leaves it set; don't skip the first wait
    state["patrol"] = True
    state["patrol_since"] = time.time()
    store.audit(actor, "patrol_start")
    if _patrol_thread is None or not _patrol_thread.is_alive():
        _patrol_thread = threading.Thread(target=_patrol, args=(pool,), daemon=True)
        _patrol_thread.start()


# ---- patrol loop -------------------------------------------------------------------
def _queries() -> list[tuple[dict, str]]:
    return [(p, q) for p in store.personas() for q in p["queries"]]


def _patrol(pool) -> None:
    from . import discovery  # avoid import cycle
    free_sources = [("feed", discovery.run_phish_feed), ("ct", lambda: discovery.run_ct_logs(days=3))]
    while state["patrol"]:
        state["patrol_rounds"] += 1
        did = None
        try:
            fresh = []
            if config.SERPAPI_KEY and available("serp") and state["patrol_rounds"] % 4:
                done = store.recent_queries(config.SEARCH_COOLDOWN_HOURS)
                fresh = [(p, q) for p, q in _queries() if q.strip().lower() not in done]
            if fresh:
                persona, query = random.choice(fresh)
                hl = {"ar": "ar", "hi": "hi", "ur": "ur", "tl": "tl"}.get(persona["language"], "en")
                r = discovery.search_google(query, persona=persona, hl=hl, maps=random.random() < 0.3, by="patrol")
                did = {"kind": "google", "query": query, "persona": persona["name"], "queued": r["new"],
                       "known": r["known"], "known_blocked": r["known_blocked"]}
            else:  # every 4th round, when the cap is reached, or every search was run in the last day: free sources
                kind, fn = free_sources[state["patrol_rounds"] % 2]
                did = {"kind": kind, "queued": fn()}
        except BudgetExceeded as e:
            did = {"kind": "paused", "error": str(e)}
        except Exception as e:
            did = {"kind": "error", "error": f"{type(e).__name__}: {e}"[:200]}
        state["patrol_last"] = {**(did or {}), "at": time.time()}
        pool.notify()
        _wake.wait(config.PATROL_INTERVAL_SEC)
        _wake.clear()
