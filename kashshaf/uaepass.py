"""UAE PASS, the UAE digital identity: analysts log in with it, and victims report a scam with it.

Kashshaf's side follows the real UAE PASS OpenID Connect flow: authorize -> code -> token -> userinfo, with the
same parameters, verification levels (SOP1 unverified, SOP2 verified, SOP3 verified with Emirates ID) and
identity fields (uuid, idn, fullnameAR, fullnameEN, email, mobile, userType). Until the police receive real
client credentials, a built-in simulation stands in for UAE PASS (the /mock-uaepass pages and MOCK_USERS below).
Moving to UAE PASS staging or production means setting UAEPASS_BASE_URL, UAEPASS_CLIENT_ID and
UAEPASS_CLIENT_SECRET, with no code change.
"""
import base64
import hashlib
import hmac
import html
import json
import os
import secrets
import threading
import time
import urllib.parse
import urllib.request

from . import config

SCOPE = "urn:uae:digitalid:profile:general"
ACR = "urn:safelayer:tws:policies:authentication:level:low"
BASE_URL = os.environ.get("UAEPASS_BASE_URL", "").rstrip("/")  # e.g. https://stg-id.uaepass.ae/idshub
MOCK = not BASE_URL
CLIENT_ID = os.environ.get("UAEPASS_CLIENT_ID", "kashshaf_mock")
CLIENT_SECRET = os.environ.get("UAEPASS_CLIENT_SECRET", "kashshaf_mock_secret")
# who may log in as an analyst: a fully verified identity (SOP3) whose email is police email, or listed
ANALYST_DOMAINS = tuple(d.strip().lower() for d in os.environ.get("ANALYST_EMAIL_DOMAINS", "adpolice.gov.ae").split(",")
                        if d.strip())
ANALYST_EMAILS = {e.strip().lower() for e in os.environ.get("ANALYST_EMAILS", "").split(",") if e.strip()}
SESSION_HOURS = 8
LEVEL_AR = {"SOP1": "غير موثّق", "SOP2": "موثّق", "SOP3": "موثّق بالهوية الإماراتية"}

# Fictional test identities for the simulation. Never real people.
MOCK_USERS = [
    {"sub": "mock-0001", "uuid": "mock-0001", "userType": "SOP3", "idType": "ID", "idn": "784198812345671",
     "fullnameAR": "سالم راشد الكتبي", "fullnameEN": "Salem Rashed Al Ketbi", "firstnameEN": "Salem",
     "lastnameEN": "Al Ketbi", "email": "salem.alketbi@adpolice.gov.ae", "mobile": "971500000101",
     "nationalityEN": "ARE", "gender": "Male", "role_ar": "محلل في شرطة أبوظبي"},
    {"sub": "mock-0002", "uuid": "mock-0002", "userType": "SOP3", "idType": "ID", "idn": "784199212345672",
     "fullnameAR": "مريم علي الحمادي", "fullnameEN": "Mariam Ali Al Hammadi", "firstnameEN": "Mariam",
     "lastnameEN": "Al Hammadi", "email": "mariam.test@example.com", "mobile": "971500000102",
     "nationalityEN": "ARE", "gender": "Female", "role_ar": "مواطنة"},
    {"sub": "mock-0003", "uuid": "mock-0003", "userType": "SOP2", "idType": "ID", "idn": "784198512345673",
     "fullnameAR": "راڤي كومار", "fullnameEN": "Ravi Kumar", "firstnameEN": "Ravi", "lastnameEN": "Kumar",
     "email": "ravi.test@example.com", "mobile": "971500000103", "nationalityEN": "IND", "gender": "Male",
     "role_ar": "مقيم"},
    {"sub": "mock-0004", "uuid": "mock-0004", "userType": "SOP1", "idType": None, "idn": None,
     "fullnameAR": "حساب جديد", "fullnameEN": "New account", "firstnameEN": "New", "lastnameEN": "Account",
     "email": "new.user@example.com", "mobile": "971500000104", "nationalityEN": None, "gender": None,
     "role_ar": "حساب لم يُوثّق بعد"},
]

_lock = threading.Lock()
_states: dict[str, dict] = {}   # our side: state -> purpose (login / report) and what comes back with it
_codes: dict[str, dict] = {}    # simulation: authorization code -> identity
_tokens: dict[str, dict] = {}   # simulation: access token -> identity
_tickets: dict[str, dict] = {}  # a verified identity waiting to file one report
_local_api = "http://127.0.0.1:8080/mock-uaepass"  # set by the server at start (its own port)


def configure(port: int) -> None:
    global _local_api
    _local_api = f"http://127.0.0.1:{port}/mock-uaepass"


def _put(store: dict, key: str, value: dict, seconds: int) -> None:
    with _lock:
        now = time.time()
        for k in [k for k, v in store.items() if v["exp"] < now]:
            del store[k]  # forget what expired
        store[key] = {**value, "exp": now + seconds}


def _take(store: dict, key: str, keep: bool = False) -> dict | None:
    with _lock:
        rec = store.get(key) if keep else store.pop(key, None)
    return rec if rec and rec["exp"] > time.time() else None


# ---- Kashshaf's side (the "relying party") --------------------------------------------------------------
def authorize_url(origin: str, purpose: str, extra: dict | None = None) -> str:
    state = secrets.token_urlsafe(24)
    _put(_states, state, {"purpose": purpose, "extra": extra or {}}, 600)
    params = {"response_type": "code", "client_id": CLIENT_ID, "scope": SCOPE, "state": state,
              "redirect_uri": f"{origin}/auth/uaepass/callback", "acr_values": ACR, "ui_locales": "ar"}
    return f"{BASE_URL or origin + '/mock-uaepass'}/authorize?{urllib.parse.urlencode(params)}"


def drop_state(state: str) -> dict | None:
    """Forget a sign-in request (the person cancelled in UAE PASS) and say what it was for."""
    return _take(_states, state)


def finish(origin: str, code: str, state: str) -> tuple[dict, dict]:
    """Exchange the code for a token and the token for the person's identity. Returns (state record, identity)."""
    rec = _take(_states, state)
    if not rec:
        raise PermissionError("expired or unknown sign-in request")
    api = BASE_URL or _local_api
    basic = base64.b64encode(f"{CLIENT_ID}:{CLIENT_SECRET}".encode()).decode()
    req = urllib.request.Request(f"{api}/token", method="POST", data=urllib.parse.urlencode({
        "grant_type": "authorization_code", "code": code, "redirect_uri": f"{origin}/auth/uaepass/callback"}).encode(),
        headers={"Content-Type": "application/x-www-form-urlencoded", "Authorization": f"Basic {basic}"})
    with urllib.request.urlopen(req, timeout=20) as r:
        token = json.loads(r.read())["access_token"]
    req = urllib.request.Request(f"{api}/userinfo", headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return rec, json.loads(r.read())


def analyst_refusal(identity: dict) -> str | None:
    """Why this identity may not log in as an analyst (Arabic), or None if it may."""
    if identity.get("userType") != "SOP3":
        return "حساب UAE PASS غير موثّق بالكامل: الدخول للمحللين يتطلب المستوى الأعلى (SOP3)."
    email = (identity.get("email") or "").lower()
    if email in ANALYST_EMAILS or any(email.endswith("@" + d) for d in ANALYST_DOMAINS):
        return None
    return "هذه الهوية ليست لموظف مصرّح له في شرطة أبوظبي."


def _secret() -> bytes:
    raw = os.environ.get("KASHSHAF_SESSION_SECRET") or config.SUPABASE_SECRET_KEY
    return hashlib.sha256(b"kashshaf-session:" + raw.encode()).digest()


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def issue_session(identity: dict) -> str:
    """A signed Kashshaf session for an analyst who logged in with UAE PASS: ksf1.<payload>.<signature>."""
    payload = _b64(json.dumps({"sub": identity["sub"], "email": identity.get("email"),
                               "name_ar": identity.get("fullnameAR"), "name_en": identity.get("fullnameEN"),
                               "level": identity.get("userType"), "exp": int(time.time()) + SESSION_HOURS * 3600},
                              ensure_ascii=False).encode())
    return f"ksf1.{payload}.{_b64(hmac.new(_secret(), payload.encode(), hashlib.sha256).digest())}"


def session_user(token: str) -> dict | None:
    try:
        _, payload, sig = token.split(".")
        if not hmac.compare_digest(sig, _b64(hmac.new(_secret(), payload.encode(), hashlib.sha256).digest())):
            return None
        data = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    except (ValueError, json.JSONDecodeError):
        return None
    if data["exp"] < time.time():
        return None
    return {"id": f"uaepass:{data['sub']}", "email": data["email"], "name_ar": data["name_ar"],
            "name_en": data["name_en"], "level": data["level"], "via": "uaepass"}


def issue_ticket(identity: dict, url: str) -> str:
    """One report, for 30 minutes, from this verified identity."""
    ticket = secrets.token_urlsafe(24)
    _put(_tickets, ticket, {"identity": identity, "url": url}, 1800)
    return ticket


def ticket(t: str, use: bool = False) -> dict | None:
    return _take(_tickets, t, keep=not use)


def masked_idn(idn: str | None) -> str:
    return f"784-****-*****{idn[-3:-1]}-{idn[-1]}" if idn and len(idn) == 15 else "—"


# ---- the simulation (stands in for UAE PASS until real credentials) -------------------------------------
def mock_issue_code(sub: str, client_id: str, redirect_uri: str) -> str | None:
    identity = next((u for u in MOCK_USERS if u["sub"] == sub), None)
    if not identity or client_id != CLIENT_ID:
        return None
    code = secrets.token_urlsafe(24)
    _put(_codes, code, {"identity": identity, "redirect_uri": redirect_uri}, 120)
    return code


def mock_token(code: str, redirect_uri: str, basic_auth: str) -> dict | None:
    try:
        client_id, _, secret = base64.b64decode(basic_auth.removeprefix("Basic ").strip()).decode().partition(":")
    except ValueError:
        return None
    rec = _take(_codes, code)
    if not rec or (client_id, secret) != (CLIENT_ID, CLIENT_SECRET) or rec["redirect_uri"] != redirect_uri:
        return None
    access = secrets.token_urlsafe(32)
    _put(_tokens, access, {"identity": rec["identity"]}, 3600)
    return {"access_token": access, "token_type": "Bearer", "expires_in": 3600, "scope": SCOPE}


def mock_userinfo(bearer: str) -> dict | None:
    rec = _take(_tokens, bearer.removeprefix("Bearer ").strip(), keep=True)
    return {k: v for k, v in rec["identity"].items() if k != "role_ar"} if rec else None


def mock_page(q: dict) -> str:
    """The simulated UAE PASS sign-in page: pick a test identity, then approve as on the phone app."""
    esc = lambda x: html.escape(str(x or ""))  # noqa: E731
    cards = "".join(f"""
      <button type="button" class="who" data-sub="{esc(u['sub'])}" data-name="{esc(u['fullnameAR'])}">
        <b>{esc(u['fullnameAR'])}</b><span dir="ltr">{esc(u['fullnameEN'])}</span>
        <small>{esc(u['role_ar'])} · <span dir="ltr">{esc(u['email'])}</span></small>
        <em class="lvl {esc(u['userType'])}">{esc(u['userType'])} · {LEVEL_AR[u['userType']]}</em>
      </button>""" for u in MOCK_USERS)
    hidden = "".join(f'<input type="hidden" name="{k}" value="{esc(q.get(k))}">'
                     for k in ("client_id", "redirect_uri", "state"))
    cancel = f"{esc(q.get('redirect_uri'))}?error=access_denied&amp;state={esc(q.get('state'))}"
    return f"""<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>UAE PASS (محاكاة) | كشّاف</title>
<style>
 body {{ margin: 0; font: 15px/1.7 "Noto Kufi Arabic", "Geeza Pro", Tahoma, sans-serif; background: #f2f4f7; color: #1d2939; }}
 .bar {{ background: #1d2939; color: #fff; padding: 10px 16px; font-size: 13px; text-align: center; }}
 main {{ max-width: 520px; margin: 24px auto; background: #fff; border-radius: 16px; padding: 24px; box-shadow: 0 10px 40px rgba(0,0,0,.08); }}
 h1 {{ font-size: 22px; margin: 0; }} .sub {{ color: #667085; margin: 4px 0 18px; }}
 .who {{ display: grid; width: 100%; text-align: start; gap: 2px; border: 1px solid #d0d5dd; background: #fff; border-radius: 12px;
         padding: 12px 14px; margin: 8px 0; cursor: pointer; font: inherit; }}
 .who:hover, .who:focus-visible {{ border-color: #0b7a53; outline: none; box-shadow: 0 0 0 3px rgba(11,122,83,.15); }}
 .who span, .who small {{ color: #667085; font-size: 13px; }} .lvl {{ font-style: normal; font-size: 12px; font-weight: 700; }}
 .SOP3 {{ color: #0b7a53; }} .SOP2 {{ color: #b54708; }} .SOP1 {{ color: #b42318; }}
 .approve {{ display: none; text-align: center; padding: 10px 0; }} .phone {{ font-size: 46px; }}
 .btn {{ display: inline-block; border: 0; border-radius: 10px; padding: 12px 22px; font: 700 15px inherit; cursor: pointer; }}
 .ok {{ background: #0b7a53; color: #fff; }} .no {{ background: none; color: #667085; text-decoration: underline; }}
</style></head><body>
<div class="bar">محاكاة UAE PASS لبيئة كشّاف التجريبية · ليست خدمة UAE PASS الحقيقية · الهويات أدناه تجريبية</div>
<main>
 <h1>UAE PASS</h1>
 <p class="sub">خدمة <b>كشّاف · شرطة أبوظبي</b> تطلب التحقق من هويتك. اختر هوية تجريبية:</p>
 <div id="pick">{cards}</div>
 <form id="approve" class="approve" method="get" action="/mock-uaepass/approve">{hidden}
   <input type="hidden" name="sub" id="sub">
   <div class="phone" aria-hidden="true">📱</div>
   <p>أرسلنا طلب موافقة إلى تطبيق UAE PASS على هاتف <b id="who"></b>.<br>وافق عليه من التطبيق للمتابعة.</p>
   <button class="btn ok" type="submit">موافقة (من التطبيق)</button>
 </form>
 <p><a class="btn no" href="{cancel}">إلغاء</a></p>
</main>
<script>
 document.querySelectorAll(".who").forEach((b) => b.addEventListener("click", () => {{
   document.getElementById("sub").value = b.dataset.sub;
   document.getElementById("who").textContent = b.dataset.name;
   document.getElementById("pick").style.display = "none";
   document.getElementById("approve").style.display = "block";
 }}));
</script>
</body></html>"""
