"""The keys and settings in .env, editable from the dashboard (Settings -> Keys) and the first-run setup page.

Secrets never leave the server: reading gives only whether a key is set and its last 4 characters.
Saving rewrites .env in place (comments and order kept), then applies the new values without a restart
where it can; the few that need one are marked restart=True.
"""
import importlib
import json
import os
import re
import tempfile
import threading
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from . import config

ENV = config.ENV_FILE
_lock = threading.Lock()

# name, group, kind (text | secret | url | int | number | bool), required, restart, default
FIELDS = [
    ("SUPABASE_URL", "supabase", "url", True, False, ""),
    ("SUPABASE_PUBLISHABLE_KEY", "supabase", "text", True, False, ""),
    ("SUPABASE_SECRET_KEY", "supabase", "secret", True, False, ""),
    ("ANTHROPIC_API_KEY", "claude", "secret", False, False, ""),
    ("AGENT_BASE_URL", "claude", "url", False, False, ""),
    ("AGENT_MODEL", "claude", "text", False, False, "claude-opus-5-5"),
    ("SERPAPI_KEY", "search", "secret", False, False, ""),
    ("UAEPASS_BASE_URL", "uaepass", "url", False, True, ""),
    ("UAEPASS_CLIENT_ID", "uaepass", "text", False, True, ""),
    ("UAEPASS_CLIENT_SECRET", "uaepass", "secret", False, True, ""),
    ("ANALYST_EMAIL_DOMAINS", "uaepass", "text", False, True, "adpolice.gov.ae"),
    ("ANALYST_EMAILS", "uaepass", "text", False, True, ""),
    ("PUBLIC_URL", "uaepass", "url", False, False, ""),
    ("AGENT_COUNT", "agents", "int", False, True, "50"),
    ("AGENT_MIN_RULE_SCORE", "agents", "int", False, False, "0"),
    ("AI_MAX_PER_HOUR", "agents", "int", False, False, "0"),
    ("SERP_MAX_PER_HOUR", "agents", "int", False, False, "0"),
    ("PATROL_INTERVAL_SEC", "agents", "int", False, False, "90"),
    ("DISCOVERY_INTERVAL_MIN", "agents", "number", False, False, "0"),
    ("SEARCH_COOLDOWN_HOURS", "agents", "number", False, False, "24"),
    ("AGENT_SEARCH_CACHE_HOURS", "agents", "number", False, False, "168"),
    ("RECHECK_AFTER_HOURS", "agents", "number", False, False, "24"),
    ("EVIDENCE_AUTO", "evidence", "bool", False, False, "true"),
    ("CHROME_PATH", "evidence", "text", False, True, ""),
    ("ALLOW_LOCAL_TEST_SITES", "evidence", "bool", False, False, "true"),
    ("KASHSHAF_SESSION_SECRET", "evidence", "secret", False, True, ""),
]
BY_NAME = {f[0]: f for f in FIELDS}


def _hint(value: str) -> str:
    return "••••" + value[-4:] if len(value) > 8 else "••••"


def status() -> list[dict]:
    """Every field with its current state. A secret's value is never returned, only its last 4 characters."""
    out = []
    for name, group, kind, required, restart, default in FIELDS:
        value = os.environ.get(name, "")
        out.append({"name": name, "group": group, "kind": kind, "required": required, "restart": restart,
                    "default": default, "set": bool(value),
                    "value": None if kind == "secret" else value, "hint": _hint(value) if kind == "secret" and value else ""})
    return out


def missing_required() -> list[str]:
    return [f[0] for f in FIELDS if f[3] and not os.environ.get(f[0])]


def _check(name: str, value: str) -> str | None:
    """Why a value is refused, or None."""
    kind = BY_NAME[name][2]
    if any(c in value for c in "\r\n\0") or len(value) > 2000:
        return "one line, at most 2000 characters"
    if not value:
        return "required" if BY_NAME[name][3] else None
    if kind == "url" and not re.match(r"^https?://[^\s/]+", value):
        return "must start with http:// or https://"
    if kind == "int" and not re.fullmatch(r"\d+", value):
        return "a whole number"
    if kind == "number" and not re.fullmatch(r"\d+(\.\d+)?", value):
        return "a number"
    if kind == "bool" and value not in ("true", "false"):
        return "true or false"
    return None


def clean(updates: dict) -> tuple[dict, dict]:
    """(changes, errors). An empty secret means "keep the current one"; clear=[names] empties a secret on purpose."""
    changes, errors = {}, {}
    clear = set((updates or {}).pop("_clear", []) or [])
    for name, raw in (updates or {}).items():
        if name not in BY_NAME:
            errors[name] = "unknown setting"
            continue
        value = str(raw if raw is not None else "").strip()
        if BY_NAME[name][0] == "SUPABASE_URL" or BY_NAME[name][2] == "url":
            value = value.rstrip("/")
        if BY_NAME[name][2] == "secret" and not value and name not in clear:
            continue  # untouched
        current = os.environ.get(name, "")
        if value == current or (not current and value == BY_NAME[name][5]):
            continue  # unchanged (an unset setting shown with its default counts as unchanged)
        why = _check(name, value)
        if why:
            errors[name] = why
        else:
            changes[name] = value
    for name, *_ in (f for f in FIELDS if f[3]):  # a required key that would still be empty
        if name not in errors and not changes.get(name, os.environ.get(name, "")):
            errors[name] = "required"
    return changes, errors


def write(changes: dict) -> None:
    """Rewrite .env with the changes: an existing line (or a commented-out example) is replaced, a new key appended."""
    with _lock:
        lines = ENV.read_text(encoding="utf-8").splitlines() if ENV.exists() else []
        todo = dict(changes)
        # 1) the live line of each key; 2) else its commented-out example ("# KEY=..."); 3) else appended
        for pattern in (r"^\s*([A-Z][A-Z0-9_]*)\s*=", r"^\s*#\s*([A-Z][A-Z0-9_]*)\s*="):
            for i, line in enumerate(lines):
                m = re.match(pattern, line)
                if m and m.group(1) in todo:
                    lines[i] = f"{m.group(1)}={todo.pop(m.group(1))}"
        if todo:
            lines += ["", "# Set from the dashboard (Settings -> Keys)"] + [f"{k}={v}" for k, v in todo.items()]
        # write next to .env and swap in, so a crash never leaves half a file
        fd, tmp = tempfile.mkstemp(prefix=".env.", dir=str(ENV.parent))
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
            f.write("\n".join(lines).rstrip("\n") + "\n")
        os.replace(tmp, ENV)
        for k, v in changes.items():
            os.environ[k] = v


def apply() -> None:
    """Use the new values now, without a restart (the restart=True ones wait for the next start)."""
    importlib.reload(config)  # every module reads config.X when it runs, so this reaches them all
    from . import agent, evidence, fetcher, health, store
    fetcher.ALLOW_TEST_SITES = os.environ.get("ALLOW_LOCAL_TEST_SITES", "true").lower() == "true"
    agent.MODEL = health.MODEL = os.environ.get("AGENT_MODEL", "claude-opus-5-5")
    agent._client = None  # rebuilt with the new key / gateway on the next call
    evidence.AUTO = os.environ.get("EVIDENCE_AUTO", "true").lower() == "true"
    store._registry["at"] = 0  # reload the registry (maybe from another database)


# ---- connection tests, with values not saved yet (blank = the current one) --------------------------------
def _get(url: str, headers: dict, timeout: int = 12) -> tuple[int, str]:
    req = urllib.request.Request(url, headers={"User-Agent": "Kashshaf/1.0", **headers})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read(4000).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read(4000).decode("utf-8", "replace")


def test(group: str, values: dict) -> dict:
    """Try a group's keys without saving them. Free calls only (no Claude message, no Google search)."""
    v = {k: (str(values.get(k) or "").strip() or os.environ.get(k, "")) for k, f in BY_NAME.items() if f[1] == group}
    try:
        if group == "supabase":
            url = v["SUPABASE_URL"].rstrip("/")
            if not url or not v["SUPABASE_SECRET_KEY"] or not v["SUPABASE_PUBLISHABLE_KEY"]:
                return {"ok": False, "code": "incomplete"}
            code, _ = _get(f"{url}/auth/v1/settings", {"apikey": v["SUPABASE_PUBLISHABLE_KEY"]})
            if code != 200:
                return {"ok": False, "code": "publishable", "detail": f"HTTP {code}"}
            code, body = _get(f"{url}/rest/v1/entities?select=id&limit=1",
                              {"apikey": v["SUPABASE_SECRET_KEY"], "Authorization": f"Bearer {v['SUPABASE_SECRET_KEY']}"})
            if code in (401, 403):
                return {"ok": False, "code": "secret", "detail": f"HTTP {code}"}
            if code == 404 or "PGRST205" in body or "does not exist" in body:
                return {"ok": False, "code": "schema"}  # a new project: the tables are not there yet
            if code != 200:
                return {"ok": False, "code": "other", "detail": f"HTTP {code}"}
            return {"ok": True, "detail": urllib.parse.urlsplit(url).hostname}
        if group == "claude":
            if not v["ANTHROPIC_API_KEY"]:
                return {"ok": False, "code": "incomplete"}
            base = (v["AGENT_BASE_URL"] or "https://api.anthropic.com").rstrip("/")
            code, _ = _get(f"{base}/v1/models?limit=1", {"x-api-key": v["ANTHROPIC_API_KEY"], "anthropic-version": "2023-06-01"})
            return {"ok": code == 200, "code": None if code == 200 else "key", "detail": f"HTTP {code}"}
        if group == "search":
            if not v["SERPAPI_KEY"]:
                return {"ok": False, "code": "incomplete"}
            code, body = _get("https://serpapi.com/account.json?" + urllib.parse.urlencode({"api_key": v["SERPAPI_KEY"]}), {})
            if code != 200:
                return {"ok": False, "code": "key", "detail": f"HTTP {code}"}
            left = json.loads(body).get("total_searches_left")
            return {"ok": True, "detail": f"{left} searches left" if left is not None else None}
    except (urllib.error.URLError, OSError, ValueError) as e:
        return {"ok": False, "code": "unreachable", "detail": str(e)[:200]}
    return {"ok": False, "code": "untestable"}
