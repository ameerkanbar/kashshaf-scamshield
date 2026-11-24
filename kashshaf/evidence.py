"""Evidence for police use and takedown requests.

When a link is judged fraud or suspicious, Kashshaf captures at that moment (scam pages vanish within hours):
a screenshot as an iPhone in the UAE sees it, a copy of the page, who registered the domain (RDAP, or WHOIS
where RDAP is not offered, with the registrar's abuse contact) and who hosts it (IP, network, ASN, abuse
contact). The screenshot and the page copy go to private storage with their SHA-256 hashes. The evidence
pack (report, files, hashes and a draft takedown request) is built from that on demand.
"""
import base64
import hashlib
import html
import io
import ipaddress
import json
import os
import re
import shutil
import socket
import subprocess
import tempfile
import threading
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from urllib.parse import urlsplit

from . import fetcher, store, supa

UAE = timezone(timedelta(hours=4))
BUCKET = "evidence"
AUTO = os.environ.get("EVIDENCE_AUTO", "true").lower() == "true"
RECAPTURE_AFTER = timedelta(hours=6)
CHROME_CANDIDATES = (
    os.environ.get("CHROME_PATH", ""),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
)
SECOND_LEVEL = {"co", "com", "net", "org", "gov", "ac", "sch", "mil", "edu"}
SOURCE_AR = {"message": "رسالة", "serp_organic": "نتائج جوجل", "serp_ad": "إعلان جوجل",
             "serp_ai_overview": "ملخص الذكاء الاصطناعي", "maps": "الخرائط", "ct_log": "سجل الشهادات",
             "phish_feed": "قائمة تصيّد", "analyst": "محلل", "gateway": "رابط محمي", "seed": "تجربة",
             "import": "استيراد ملف"}

_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="evidence")  # at most two Chrome screenshots at once
_busy: set[int] = set()
_busy_lock = threading.Lock()


def chrome() -> str | None:
    return next((p for p in CHROME_CANDIDATES if p and os.path.exists(p)), None)


def registrable(host: str) -> str:
    """The name a registrar sells: emx.jwmwj.cfd -> jwmwj.cfd, shop.example.co.ae -> example.co.ae."""
    parts = host.lower().strip(".").split(".")
    if len(parts) >= 3 and parts[-2] in SECOND_LEVEL:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:])


# ---- lookups -----------------------------------------------------------------------------------
def _get_json(url: str, timeout: int = 12) -> dict:
    req = urllib.request.Request(url, headers={"Accept": "application/rdap+json, application/json",
                                               "User-Agent": "Kashshaf/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def _whois(server: str, query: str, timeout: int = 10) -> str:
    with socket.create_connection((server, 43), timeout=timeout) as s:
        s.sendall((query + "\r\n").encode())
        chunks: list[bytes] = []
        while sum(map(len, chunks)) < 200_000:
            b = s.recv(4096)
            if not b:
                break
            chunks.append(b)
    return b"".join(chunks).decode("utf-8", "replace")


def _entities(obj: dict, role: str) -> list[dict]:
    """Every RDAP entity with this role, nested ones included (a registrar's abuse contact sits inside it)."""
    found = []
    for e in obj.get("entities") or []:
        if role in (e.get("roles") or []):
            found.append(e)
        found += _entities(e, role)
    return found


def _vcard(entity: dict, field: str) -> str | None:
    for row in (entity.get("vcardArray") or [None, []])[1]:
        if row and row[0] == field and row[3]:
            return str(row[3]).removeprefix("tel:").removeprefix("mailto:")
    return None


def _event(obj: dict, action: str) -> str | None:
    return next((e.get("eventDate", "")[:10] for e in obj.get("events") or [] if e.get("eventAction") == action), None)


def _age(created: str | None) -> int | None:
    try:
        return (date.today() - date.fromisoformat(created)).days if created else None
    except ValueError:
        return None


def domain_record(host: str) -> dict:
    """Who registered the domain and when, with the registrar's abuse contact. RDAP first, WHOIS as fallback."""
    if host.endswith(".localhost"):
        return {"source": "local", "domain": host, "note": "local TEST page, no registration data"}
    name = registrable(host)
    try:
        j = _get_json(f"https://rdap.org/domain/{name}")
        registrar = (_entities(j, "registrar") or [{}])[0]
        abuse = (_entities(registrar, "abuse") or _entities(j, "abuse") or [{}])[0]
        created = _event(j, "registration")
        return {"source": "rdap", "domain": name, "registrar": _vcard(registrar, "fn"),
                "registrar_iana_id": next((p.get("identifier") for p in registrar.get("publicIds") or []), None),
                "abuse_email": _vcard(abuse, "email"), "abuse_phone": _vcard(abuse, "tel"),
                "created": created, "age_days": _age(created), "expires": _event(j, "expiration"),
                "updated": _event(j, "last changed"), "status": j.get("status") or [],
                "nameservers": [n.get("ldhName", "").lower() for n in j.get("nameservers") or []][:6]}
    except Exception as e:
        rdap_error = str(e)[:150]
    # Some endings have no RDAP (.ae among them): ask the registry's WHOIS server instead.
    try:
        tld = name.rsplit(".", 1)[-1]
        ref = re.search(r"^whois:\s*(\S+)", _whois("whois.iana.org", tld), re.MULTILINE)
        if not ref:
            return {"source": "none", "domain": name, "error": f"RDAP: {rdap_error}; no WHOIS server for .{tld}"}
        text = _whois(ref.group(1), name)
        if "BLACKLISTED" in text or (len(text) < 400 and "exceeded" in text.lower()):
            return {"source": "whois", "domain": name, "server": ref.group(1),
                    "error": "the registry limits WHOIS queries: " + " ".join(text.split())[:150]}

        def field(*labels):
            for label in labels:
                m = re.search(rf"^\s*{label}\s*:\s*(.+)$", text, re.IGNORECASE | re.MULTILINE)
                if m and m.group(1).strip():
                    return m.group(1).strip()
            return None
        created = (field("Creation Date", "Created", "Registered on") or "")[:10] or None
        return {"source": "whois", "domain": name, "server": ref.group(1),
                "registrar": field("Registrar Name", "Registrar"),
                "abuse_email": field("Registrar Abuse Contact Email"), "abuse_phone": field("Registrar Abuse Contact Phone"),
                "created": created, "age_days": _age(created),
                "expires": (field("Registry Expiry Date", "Expiry Date", "Expiration Date") or "")[:10] or None,
                "status": re.findall(r"^\s*(?:Domain )?Status\s*:\s*(\S+)", text, re.IGNORECASE | re.MULTILINE)[:6],
                "nameservers": [x.lower() for x in re.findall(r"^\s*Name Server\s*:\s*(\S+)", text,
                                                               re.IGNORECASE | re.MULTILINE)][:6],
                "raw": text[:3000]}
    except Exception as e:
        return {"source": "none", "domain": name, "error": f"RDAP: {rdap_error}; WHOIS: {str(e)[:150]}"}


def _in_thread(fn, timeout: float):
    """Run a blocking lookup with a time limit (getaddrinfo and gethostbyaddr take none)."""
    box: list = []
    t = threading.Thread(target=lambda: box.append(fn()), daemon=True)
    t.start()
    t.join(timeout)
    return box[0] if box else None


def _resolve(host: str) -> list[str]:
    def run():
        try:
            return sorted({ai[4][0] for ai in socket.getaddrinfo(host, None)})
        except OSError:
            return []
    return (_in_thread(run, 5) or [])[:4]


def _reverse(ip: str) -> str | None:
    def run():
        try:
            return socket.gethostbyaddr(ip)[0]
        except OSError:
            return None
    return _in_thread(run, 3)


def hosting(host: str) -> dict:
    """Where the site is hosted: its IP addresses, the network and ASN that own them, and an abuse contact."""
    ips = _resolve(host)
    rec: dict = {"ips": ips}
    public = [ip for ip in ips if ipaddress.ip_address(ip).is_global]
    if not public:
        rec["note"] = "local address (local TEST page)" if ips else "the domain does not resolve"
        return rec
    ip = rec["ip"] = public[0]
    rec["reverse_dns"] = _reverse(ip)
    try:  # Team Cymru: AS number, AS name, BGP prefix, country
        line = _whois("whois.cymru.com", f" -v {ip}").strip().splitlines()[-1]
        asn, _, prefix, cc, registry, _, as_name = [x.strip() for x in line.split("|")][:7]
        rec.update(asn=None if asn == "NA" else f"AS{asn}", prefix=None if prefix == "NA" else prefix,
                   country=cc or None, rir=registry or None, as_name=None if as_name == "NA" else as_name)
    except Exception as e:
        rec["asn_error"] = str(e)[:150]
    try:  # RDAP for the IP: network name, owner, abuse contact
        j = _get_json(f"https://rdap.org/ip/{ip}")
        owner = (_entities(j, "registrant") or [{}])[0]
        abuse = (_entities(j, "abuse") or [{}])[0]
        rec.update(network=j.get("name"), network_range=f"{j.get('startAddress')} - {j.get('endAddress')}",
                   owner=_vcard(owner, "fn"), abuse_email=_vcard(abuse, "email"))
        rec["country"] = rec.get("country") or j.get("country")
    except Exception as e:
        rec["rdap_error"] = str(e)[:150]
    return rec


def screenshot(url: str) -> tuple[bytes | None, str | None]:
    """A PNG of the page as an iPhone in the UAE sees it: headless Chrome with a throwaway profile."""
    exe = chrome()
    if not exe:
        return None, "Chrome was not found (set CHROME_PATH)"
    tmp = tempfile.mkdtemp(prefix="kashshaf-shot-")
    out = os.path.join(tmp, "shot.png")
    try:
        run = subprocess.run([exe, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--mute-audio", "--no-first-run",
                              "--no-default-browser-check", "--disable-extensions", "--disable-default-apps",
                              "--disable-sync", "--disable-background-networking",
                              # desktop Chrome keeps windows at least ~500px wide; narrower crops the page
                              f"--user-data-dir={os.path.join(tmp, 'profile')}", "--window-size=500,1000",
                              "--force-device-scale-factor=2", f"--user-agent={fetcher.PHONE_UA}", "--lang=ar-AE",
                              "--accept-lang=ar-AE,en-AE", "--virtual-time-budget=5000", f"--screenshot={out}", url],
                             capture_output=True, text=True, timeout=45)
        if os.path.exists(out) and os.path.getsize(out) > 0:
            with open(out, "rb") as f:
                return f.read(), None
        # Chrome takes no screenshot of a page that failed (an HTTP error, a dead site): say why
        failed = re.search(r"Page load failed: (\S+)", run.stderr or "")
        return None, f"the page did not load ({failed.group(1)})" if failed else "Chrome did not produce a screenshot"
    except subprocess.TimeoutExpired:
        return None, "the screenshot timed out"
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# ---- capture ----------------------------------------------------------------------------------
def capture(url_row: dict, by: str) -> dict:
    """Capture all evidence for one link now and store it. Returns the evidence row."""
    url = url_row["url"]
    host = urlsplit(url).hostname or url_row["domain"]
    is_test = host.endswith(".localhost")
    # the same rule as the fetcher: internal addresses are never opened
    allowed = (is_test and fetcher.ALLOW_TEST_SITES) or (not is_test and fetcher._public_host(host))
    at = datetime.now(timezone.utc)
    errors: dict = {}
    with ThreadPoolExecutor(max_workers=4) as ex:
        shot_job = ex.submit(screenshot, url) if allowed else None
        page_job = ex.submit(fetcher.fetch, url, fetcher.PHONE_UA) if allowed else None
        whois_job, host_job = ex.submit(domain_record, host), ex.submit(hosting, host)
        shot, shot_error = shot_job.result() if shot_job else (None, "internal address: not opened")
        page = page_job.result() if page_job else {"html": "", "final_url": url, "error": "internal address: not opened"}
        row = {"url_id": url_row["id"], "domain": url_row["domain"], "captured_at": at.isoformat(), "captured_by": by,
               "final_url": page.get("final_url"), "whois": whois_job.result(), "hosting": host_job.result()}
    base = f"{url_row['domain']}/{url_row['id']}/{at.strftime('%Y%m%dT%H%M%SZ')}"
    if shot:
        try:
            supa.storage_put(BUCKET, f"{base}-screenshot.png", shot, "image/png")
            row.update(screenshot_path=f"{base}-screenshot.png", screenshot_sha256=hashlib.sha256(shot).hexdigest())
        except supa.SupabaseError as e:
            errors["screenshot"] = f"could not store: {e}"[:300]
    else:
        errors["screenshot"] = shot_error
    body = (page.get("html") or "").encode("utf-8")
    if body:
        m = re.search(r"<title[^>]*>(.*?)</title>", page["html"], re.IGNORECASE | re.DOTALL)
        row["page_title"] = html.unescape(" ".join(m.group(1).split()))[:300] if m else None
        try:
            supa.storage_put(BUCKET, f"{base}-page.txt", body, "text/plain")
            row.update(html_path=f"{base}-page.txt", html_sha256=hashlib.sha256(body).hexdigest(), html_bytes=len(body))
        except supa.SupabaseError as e:
            errors["page"] = f"could not store: {e}"[:300]
    elif page.get("error"):
        errors["page"] = page["error"]
    if errors:
        row["errors"] = errors
    saved = supa.insert("evidence", row)[0]
    store.audit(by, "evidence_capture", url, {"evidence_id": saved["id"], "screenshot": bool(shot)})
    return saved


def latest(url_id: int) -> dict | None:
    rows = supa.select("evidence", url_id=f"eq.{url_id}", select="*", order="captured_at.desc", limit="1")
    return rows[0] if rows else None


def for_url(url_id: int) -> list[dict]:
    return supa.select("evidence", url_id=f"eq.{url_id}", select="*", order="captured_at.desc", limit="10")


def schedule(url_row: dict, by: str) -> None:
    """Capture in the background, at most once per link every few hours."""
    if not AUTO:
        return
    uid = url_row["id"]
    with _busy_lock:
        if uid in _busy:
            return
        _busy.add(uid)

    def job():
        try:
            last = latest(uid)
            if last and datetime.fromisoformat(last["captured_at"]) > datetime.now(timezone.utc) - RECAPTURE_AFTER:
                return
            capture(url_row, by)
        except Exception as e:
            store.audit("system", "evidence_error", url_row["url"], {"error": str(e)[:300]})
        finally:
            with _busy_lock:
                _busy.discard(uid)
    _pool.submit(job)


def file_bytes(evidence_id: int, kind: str) -> tuple[bytes, str] | None:
    """(bytes, content type) of a stored screenshot or page copy."""
    rows = supa.select("evidence", id=f"eq.{evidence_id}", select="screenshot_path,html_path")
    path = rows and rows[0].get({"screenshot": "screenshot_path", "page": "html_path"}.get(kind, ""))
    if not path:
        return None
    return supa.storage_get(BUCKET, path), ("image/png" if kind == "screenshot" else "text/plain; charset=utf-8")


# ---- the evidence pack ------------------------------------------------------------------------
def _uae(ts: str | None) -> str:
    return datetime.fromisoformat(ts).astimezone(UAE).strftime("%d/%m/%Y %H:%M:%S") if ts else "—"


def _utc(ts: str | None) -> str:
    return datetime.fromisoformat(ts).astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S") if ts else "—"


def gather(url_id: int) -> dict:
    """Everything the report, the pack and the takedown request need."""
    d = store.finding_detail(url_id)
    url, verdict = d["url"], (d["verdicts"] or [{}])[0]
    dom = store.domain_status(url["domain"]) or {}
    entity_id = verdict.get("claimed_entity_id") or dom.get("claimed_entity_id")
    entity = next((e for e in store.registry()["entities"] if e["id"] == entity_id), None)
    values = {f["fingerprints"]["value"] for f in d["fingerprints"]}
    linked = sorted({x for ind in supa.select("shared_indicators", select="value,domains") if ind["value"] in values
                     for x in ind["domains"]} - {url["domain"]})
    decisions = supa.select("audit_log", target=f"eq.{url['domain']}", action="like.override_*", select="*", order="at.asc")
    first = min([s["seen_at"] for s in d["sightings"]] + [url["first_seen"]])
    return {"url": url, "verdict": verdict, "domain": dom, "entity": entity, "evidence": latest(url_id),
            "sightings": d["sightings"], "fingerprints": [f["fingerprints"] for f in d["fingerprints"]],
            "linked_domains": linked, "decisions": decisions, "first_seen": first,
            "blocked": store.is_blocked(dom), "pending_review": store.pending_review(dom)}


def case_ref(g: dict) -> str:
    when = (g["evidence"] or {}).get("captured_at") or g["verdict"].get("created_at") or g["url"]["first_seen"]
    return f"KSF-{g['url']['id']}-{datetime.fromisoformat(when).astimezone(UAE).strftime('%Y%m%d')}"


def takedown_text(g: dict) -> str:
    """A draft abuse report for the registrar and the host, in English (the usual language of abuse desks)."""
    url, ev, e = g["url"], g["evidence"] or {}, g["entity"]
    w, h = ev.get("whois") or {}, ev.get("hosting") or {}
    to = [x for x in (w.get("abuse_email"), h.get("abuse_email")) if x]
    created_gap = ""
    if w.get("created"):
        try:
            days = (datetime.fromisoformat(g["first_seen"]).date() - date.fromisoformat(w["created"])).days
            created_gap = f" ({days} days before we detected it)"
        except ValueError:
            pass
    # the rules' findings, not a fetch error ("could not open") or the agent's longer notes
    reasons = [r["en"] for r in g["verdict"].get("reasons") or []
               if r.get("en") and r.get("by") not in ("ai", "fetch", "database")][:8]
    lines = [f"DRAFT for review by Abu Dhabi Police before sending. Case {case_ref(g)}"]
    if g["verdict"].get("verdict") not in store.BLOCKING:
        lines.append(f"CHECK FIRST: the latest verdict for this link is '{g['verdict'].get('verdict')}', not fraud.")
    lines += [
        "",
        f"To: {', '.join(to) or '[registrar and hosting abuse contacts]'}",
        f"Subject: Abuse report: fraudulent website{' impersonating ' + e['name_en'] if e else ''} ({url['domain']})",
        "",
        "Hello,",
        "",
        f"We report the domain {url['domain']}, which serves a fraudulent page"
        + (f" impersonating {e['name_en']} (official site: {', '.join(e['domains'])})" if e else "")
        + " to people in the United Arab Emirates.",
        "",
        f"URL: {url['url']}",
        f"First detected: {_utc(g['first_seen'])} UTC",
        f"Evidence captured: {_utc(ev.get('captured_at'))} UTC" if ev else "Evidence captured: not yet",
    ]
    if ev.get("screenshot_sha256"):
        lines.append(f"Screenshot SHA-256: {ev['screenshot_sha256']}")
    if ev.get("html_sha256"):
        lines.append(f"Page copy SHA-256: {ev['html_sha256']}")
    if w.get("registrar"):
        lines.append(f"Registrar: {w['registrar']}" + (f" (IANA ID {w['registrar_iana_id']})" if w.get("registrar_iana_id") else "")
                     + (f"; domain created {w['created']}{created_gap}" if w.get("created") else ""))
    if h.get("ip"):
        name = h.get("as_name") or h.get("network") or ""
        country = h.get("country") if h.get("country") and not name.endswith(h["country"]) else None
        net = ", ".join(x for x in (name, h.get("asn"), country) if x)
        lines.append(f"Hosting: {h['ip']}" + (f" ({net})" if net else ""))
    if reasons:
        lines += ["", "What the page does:"] + [f"- {r}" for r in reasons]
    lines += ["", "We ask you to suspend the domain or remove the content, and to preserve the related records.",
              "The evidence pack (screenshot, page copy, registration and hosting data, hashes) is attached.",
              "", "[Name, unit and contact details of the Abu Dhabi Police officer]"]
    return "\n".join(lines) + "\n"


def report_html(g: dict, by: str, screenshot: bytes | None) -> str:
    """A printable, self-contained report (Arabic, with the facts in their original form)."""
    e, url, v, ev = g["entity"], g["url"], g["verdict"], g["evidence"] or {}
    w, h = ev.get("whois") or {}, ev.get("hosting") or {}
    esc = lambda x: html.escape(str(x)) if x not in (None, "", []) else "—"  # noqa: E731
    verdict_ar = {"fraud": "احتيال", "suspicious": "مشبوه", "safe": "آمن", "official": "رسمي",
                  "unreachable": "تعذّر الفتح"}.get(v.get("verdict"), v.get("verdict") or "—")
    status = "محظور احترازياً بانتظار مراجعة محلل" if g["pending_review"] else "محظور" if g["blocked"] else "غير محظور"
    rows = lambda pairs: "".join(f"<tr><th>{k}</th><td>{val}</td></tr>" for k, val in pairs)  # noqa: E731
    ltr = lambda x: f'<span dir="ltr">{esc(x)}</span>'  # noqa: E731
    sightings = "".join(f"<li>{ltr(_uae(s['seen_at']))} · {esc(SOURCE_AR.get(s['source'], s['source']))}"
                        f"{' · «' + esc(s['query']) + '»' if s.get('query') else ''}</li>" for s in g["sightings"][:15])
    decisions = "".join(f"<li>{ltr(_uae(a['at']))} · {esc(a['actor'])} · {esc(a['action'])}</li>" for a in g["decisions"])
    reasons = "".join(f"<li>{esc(r.get('ar'))}<br><small dir=\"ltr\">{esc(r.get('en'))}</small></li>"
                      for r in v.get("reasons") or [])
    shot = (f'<img src="data:image/png;base64,{base64.b64encode(screenshot).decode()}" alt="لقطة شاشة كما يراها الهاتف">'
            if screenshot else '<p class="muted">لا توجد لقطة شاشة.</p>')
    return f"""<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<title>ملف أدلة {esc(case_ref(g))} · {esc(url['domain'])}</title>
<style>
 body {{ font: 14px/1.7 "Noto Kufi Arabic", "Geeza Pro", Tahoma, sans-serif; color: #1d2939; margin: 32px; }}
 h1 {{ font-size: 20px; margin: 0 0 4px; }} h2 {{ font-size: 15px; margin: 22px 0 8px; border-bottom: 2px solid #135BA6; padding-bottom: 4px; }}
 .muted {{ color: #667085; }} small {{ color: #667085; }}
 table {{ border-collapse: collapse; width: 100%; }} th, td {{ text-align: right; vertical-align: top; padding: 5px 8px; border-bottom: 1px solid #EAECF0; }}
 th {{ width: 30%; color: #344054; font-weight: 600; }} td {{ overflow-wrap: anywhere; }}
 .head {{ display: flex; justify-content: space-between; gap: 16px; border-bottom: 4px solid #135BA6; padding-bottom: 12px; }}
 .shot {{ display: flex; gap: 20px; align-items: flex-start; }} .shot img {{ width: 260px; border: 1px solid #D0D5DD; border-radius: 12px; }}
 pre {{ direction: ltr; text-align: left; white-space: pre-wrap; background: #F9FAFB; border: 1px solid #EAECF0; padding: 12px; font-size: 12px; }}
 .hash {{ font: 11px ui-monospace, Menlo, monospace; direction: ltr; overflow-wrap: anywhere; }}
 @media print {{ body {{ margin: 12mm; }} h2 {{ break-after: avoid; }} .shot, table {{ break-inside: avoid; }} }}
</style></head><body>
<div class="head"><div><h1>ملف أدلة · Evidence pack</h1>
 <div class="muted">كشّاف · لاستخدام شرطة أبوظبي · رقم الملف <b dir="ltr">{esc(case_ref(g))}</b></div></div>
 <div class="muted">أُعدّ {ltr(_uae(datetime.now(timezone.utc).isoformat()))} بتوقيت الإمارات<br>بواسطة {esc(by)}</div></div>

<h2>الخلاصة</h2>
<table>{rows([
    ("الرابط", ltr(url['url'])), ("النطاق", ltr(url['domain'])),
    ("الحكم", f"{esc(verdict_ar)} · الدرجة {esc(v.get('score'))}/100 · {ltr(_uae(v.get('created_at')))}"),
    ("الجهة المنتحَلة", f"{esc(e['name_ar'])} · {esc(e['name_en'])} · النطاق الرسمي: {ltr(', '.join(e['domains']))}" if e else "—"),
    ("حالة الحظر", esc(status)), ("أول ظهور", ltr(_uae(g['first_seen']))),
])}</table>

<h2>لقطة الشاشة كما يراها هاتف في الإمارات</h2>
<div class="shot">{shot}<table>{rows([
    ("وقت الالتقاط", ltr(_uae(ev.get('captured_at')))), ("الرابط النهائي", ltr(ev.get('final_url'))),
    ("عنوان الصفحة", esc(ev.get('page_title'))),
    ("بصمة اللقطة SHA-256", f'<span class="hash">{esc(ev.get("screenshot_sha256"))}</span>'),
    ("بصمة نسخة الصفحة SHA-256", f'<span class="hash">{esc(ev.get("html_sha256"))}</span>'),
])}</table></div>

<h2>أسباب الحكم</h2><ul>{reasons or '<li>—</li>'}</ul>

<h2>تسجيل النطاق (WHOIS / RDAP)</h2>
<table>{rows([
    ("المسجِّل", esc(w.get('registrar'))), ("رقم المسجِّل لدى IANA", ltr(w.get('registrar_iana_id'))),
    ("بريد البلاغات لدى المسجِّل", ltr(w.get('abuse_email'))), ("هاتف البلاغات", ltr(w.get('abuse_phone'))),
    ("تاريخ التسجيل", f"{ltr(w.get('created'))}{' · عمره ' + str(w['age_days']) + ' يوماً' if w.get('age_days') is not None else ''}"),
    ("تاريخ الانتهاء", ltr(w.get('expires'))), ("خوادم الأسماء", ltr(', '.join(w.get('nameservers') or []))),
    ("المصدر", esc(w.get('note') or w.get('error') or w.get('source'))),
])}</table>

<h2>الاستضافة</h2>
<table>{rows([
    ("عنوان IP", ltr(', '.join(h.get('ips') or []))), ("الشبكة", ltr(h.get('network'))),
    ("المالك / مزوّد الاستضافة", ltr(h.get('owner') or h.get('as_name'))), ("ASN", ltr(h.get('asn'))),
    ("الدولة", ltr(h.get('country'))), ("بريد البلاغات لدى الاستضافة", ltr(h.get('abuse_email'))),
    ("الاسم العكسي", ltr(h.get('reverse_dns'))), ("ملاحظة", esc(h.get('note'))),
])}</table>

<h2>الخط الزمني</h2>
<h3 class="muted">أين ظهر الرابط</h3><ul>{sightings or '<li>—</li>'}</ul>
<h3 class="muted">قرارات المحللين</h3><ul>{decisions or '<li>لا توجد قرارات يدوية.</li>'}</ul>

<h2>البصمات والمواقع المرتبطة</h2>
<p>{''.join(f'<span dir="ltr">{esc(f["kind"])}: {esc(f["value"])}</span><br>' for f in g['fingerprints']) or '—'}</p>
<p>مواقع تشترك معه في بصمة: {ltr(', '.join(g['linked_domains']) or '—')}</p>

<h2>مسودة طلب الإزالة</h2>
<pre>{html.escape(takedown_text(g))}</pre>
<p class="muted">نسخة الصفحة محفوظة كنص (page-copy.txt) ولا تُفتح في المتصفح. البصمات تثبت أن الملفات لم تتغير منذ الالتقاط.</p>
</body></html>"""


def pack(url_id: int, by: str) -> tuple[str, bytes]:
    """(file name, ZIP bytes): report.html, screenshot.png, page-copy.txt, evidence.json, takedown-request.txt
    and SHA256SUMS.txt with the hash of every file in the pack."""
    g = gather(url_id)
    ev = g["evidence"] or {}
    shot = supa.storage_get(BUCKET, ev["screenshot_path"]) if ev.get("screenshot_path") else None
    page = supa.storage_get(BUCKET, ev["html_path"]) if ev.get("html_path") else None
    files: dict[str, bytes] = {"report.html": report_html(g, by, shot).encode("utf-8"),
                               "takedown-request.txt": takedown_text(g).encode("utf-8"),
                               "evidence.json": json.dumps({"case": case_ref(g), **g}, ensure_ascii=False, indent=2,
                                                           default=str).encode("utf-8")}
    if shot:
        files["screenshot.png"] = shot
    if page:
        files["page-copy.txt"] = page
    files["SHA256SUMS.txt"] = "".join(f"{hashlib.sha256(b).hexdigest()}  {n}\n" for n, b in files.items()).encode()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in files.items():
            z.writestr(name, data)
    stamp = datetime.now(timezone.utc).astimezone(UAE).strftime("%Y%m%d-%H%M")
    safe = re.sub(r"[^A-Za-z0-9._-]", "_", g["url"]["domain"])  # a header carries the name: ASCII only
    return f"kashshaf-evidence-{safe}-{stamp}.zip", buf.getvalue()
