"""Fetch a page the way two different visitors would see it.

Scam sites often "cloak": they show the scam only to real phones in the
target country and a harmless page to scanners and servers. We fetch every
link twice and compare.

In this prototype the two views differ by device (iPhone vs. server bot).
In production the phone view also leaves through a UAE mobile IP
(SIM hotspot or mobile proxy) and the bot view through a cloud server.
"""
import ipaddress
import os
import socket
import urllib.error
import urllib.request
from urllib.parse import urlsplit, urlunsplit

from . import config  # noqa: F401  (loads .env before reading settings)

PHONE_UA = ("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 "
            "(KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1")
BOT_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0 Safari/537.36"
MAX_BYTES = 1_500_000
# Local TEST pages (*.localhost) are allowed only when this is on. Turn it off in production.
ALLOW_TEST_SITES = os.environ.get("ALLOW_LOCAL_TEST_SITES", "true").lower() == "true"
TIMEOUT = 8


def _public_host(host: str) -> bool:
    """Refuse internal addresses so a malicious link can't make us scan our own network."""
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return True  # unresolvable: let the request fail normally
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            return False
    return True


def fetch(url: str, user_agent: str) -> dict:
    """GET a page (read only: we never submit forms). Returns html, final_url, status and error."""
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        return {"html": "", "final_url": url, "status": None, "error": "unsupported URL"}
    is_test = parts.hostname.endswith(".localhost")
    if (is_test and not ALLOW_TEST_SITES) or (not is_test and not _public_host(parts.hostname)):
        return {"html": "", "final_url": url, "status": None, "error": "blocked: internal address"}
    headers = {"User-Agent": user_agent, "Accept-Language": "ar-AE,en-AE;q=0.9,en;q=0.8"}
    target = url
    # *.localhost names are our local TEST pages; connect to 127.0.0.1 and keep the Host header.
    if parts.hostname and parts.hostname.endswith(".localhost"):
        headers["Host"] = parts.netloc
        target = urlunsplit((parts.scheme, f"127.0.0.1:{parts.port or 80}", parts.path or "/", parts.query, ""))
    req = urllib.request.Request(target, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            raw = resp.read(MAX_BYTES)
            charset = resp.headers.get_content_charset() or "utf-8"
            final = resp.geturl() if "Host" not in headers else url
            return {"html": raw.decode(charset, "replace"), "final_url": final, "status": resp.status, "error": None}
    except urllib.error.HTTPError as e:
        body = e.read(MAX_BYTES).decode("utf-8", "replace") if e.fp else ""
        return {"html": body, "final_url": url, "status": e.code, "error": f"HTTP {e.code}"}
    except (urllib.error.URLError, TimeoutError, ValueError, OSError) as e:
        return {"html": "", "final_url": url, "status": None, "error": str(e)[:200]}


def fetch_two_views(url: str) -> tuple[dict, dict]:
    return fetch(url, PHONE_UA), fetch(url, BOT_UA)
