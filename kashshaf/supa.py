"""Minimal Supabase client over HTTPS (PostgREST + Auth), standard library only.

The server uses the secret key, so it bypasses row level security. Browsers
never see that key: they log in with Supabase Auth and call our API, which
checks their access token with `user_from_token`.
"""
import json
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

from . import config


class SupabaseError(RuntimeError):
    pass


def _headers(key: str, extra: dict | None = None) -> dict:
    h = {"apikey": key, "Content-Type": "application/json"}
    if not key.startswith(("sb_secret_", "sb_publishable_")):  # legacy JWT keys also go in Authorization
        h["Authorization"] = f"Bearer {key}"
    h.update(extra or {})
    return h


def _request(method: str, path: str, *, params: dict | None = None, body=None,
             headers: dict | None = None, key: str | None = None, timeout: int = 20):
    url = f"{config.SUPABASE_URL}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params, safe=",.()*:")
    data = None if body is None else json.dumps(body, ensure_ascii=False, default=str).encode()
    req = urllib.request.Request(url, data=data, method=method,
                                 headers=_headers(key or config.SUPABASE_SECRET_KEY, headers))
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raise SupabaseError(f"{method} {path} -> {e.code}: {e.read().decode('utf-8', 'replace')[:400]}") from None


def select(table: str, **params) -> list[dict]:
    return _request("GET", f"/rest/v1/{table}", params=params) or []


def insert(table: str, rows, *, on_conflict: str | None = None, ignore_duplicates: bool = False,
           returning: bool = True) -> list[dict]:
    prefer = ["return=representation" if returning else "return=minimal"]
    params = {}
    if on_conflict:
        params["on_conflict"] = on_conflict
        prefer.append("resolution=ignore-duplicates" if ignore_duplicates else "resolution=merge-duplicates")
    return _request("POST", f"/rest/v1/{table}", params=params, body=rows,
                    headers={"Prefer": ",".join(prefer)}) or []


def update(table: str, values: dict, **filters) -> list[dict]:
    return _request("PATCH", f"/rest/v1/{table}", params=filters, body=values,
                    headers={"Prefer": "return=representation"}) or []


def delete(table: str, **filters) -> None:
    _request("DELETE", f"/rest/v1/{table}", params=filters, headers={"Prefer": "return=minimal"})


def rpc(fn: str, args: dict | None = None):
    return _request("POST", f"/rest/v1/rpc/{fn}", body=args or {})


def count(table: str, **filters) -> int:
    url_params = {"select": "*", **filters}
    req = urllib.request.Request(
        f"{config.SUPABASE_URL}/rest/v1/{table}?" + urllib.parse.urlencode(url_params, safe=",.()*:"),
        method="HEAD", headers=_headers(config.SUPABASE_SECRET_KEY, {"Prefer": "count=exact"}))
    with urllib.request.urlopen(req, timeout=20) as resp:
        return int(resp.headers.get("Content-Range", "*/0").split("/")[-1] or 0)


_users: dict[str, tuple[float, dict]] = {}
_users_lock = threading.Lock()


def user_from_token(token: str) -> dict | None:
    """Return the logged-in Supabase user for an access token, or None.
    A valid token is remembered for 60 seconds, so the dashboard's polling does not ask Supabase Auth every time.
    (A token signed out elsewhere can keep working here for up to that minute.)"""
    if not token:
        return None
    with _users_lock:
        hit = _users.get(token)
        if hit and hit[0] > time.time():
            return hit[1]
    try:
        user = _request("GET", "/auth/v1/user", key=config.SUPABASE_PUBLISHABLE_KEY,
                        headers={"Authorization": f"Bearer {token}"})
    except SupabaseError:
        return None
    with _users_lock:
        if len(_users) > 500:
            _users.clear()
        _users[token] = (time.time() + 60, user)
    return user
