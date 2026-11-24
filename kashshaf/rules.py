"""Fast, explainable first pass. Runs on every URL before the Claude agent.

Each signal adds points with a reason in Arabic and English. The agent sees
these as evidence; when Claude is off, these rules decide alone.
"""
import difflib
import ipaddress
import json
import re
import urllib.request
from contextlib import nullcontext
from datetime import date
from html.parser import HTMLParser
from urllib.parse import urlsplit

from . import store

FRAUD_AT, SUSPICIOUS_AT = 60, 30

PAYMENT = [r"card[_ -]?number", r"\bcvv\b", r"\bcvc\b", r"expiry", r"pay now", r"payment", r"رقم البطاقة",
           r"ادفع", r"دفع", r"\biban\b", r"bank transfer", r"\bfee\b", r"رسوم"]
CREDENTIALS = [r"\botp\b", r"password", r"emirates[_ ]?id", r"رمز التحقق", r"كلمة المرور", r"رقم الهوية",
               r"verification code", r"uae ?pass"]
URGENCY = [r"within \d+ hours", r"before midnight", r"expire[sd]? today", r"خلال \d+ ساع", r"تنتهي اليوم",
           r"ستنتهي اليوم", r"حجز المركبة", r"impound", r"will be returned", r"suspended", r"final notice", r"إنذار نهائي"]
# What a form field collects (matched on its name, id, placeholder, type, autocomplete).
CARD_FIELDS = r"card|cvv|cvc|expir|cc-?(num|exp|csc)|رقم البطاقة|البطاقة|iban"
ID_FIELDS = r"otp|\bpin\b|emirates.?id|\beid\b|رمز التحقق|الهوية|verification|uae.?pass|one.?time"
PASSWORD_FIELDS = r"password|passcode|كلمة المرور"  # many sites have their own login: weak on its own
CREDENTIAL_FIELDS = ID_FIELDS + "|" + PASSWORD_FIELDS
BLOCKED_PAGE = r"just a moment|access denied|attention required|captcha|forbidden|enable javascript|bad gateway|not found|error \d{3}"
# Shared platforms: a bad post there is reported to the platform; the whole domain is never blocked.
PLATFORMS = ("facebook.com", "x.com", "twitter.com", "instagram.com", "youtube.com", "tiktok.com", "linkedin.com",
             "google.com", "reddit.com", "medium.com", "t.me", "wa.me", "whatsapp.com", "snapchat.com", "pinterest.com")


def is_platform(host: str) -> bool:
    return any(host == p or host.endswith("." + p) for p in PLATFORMS)


FINGERPRINTS = {
    "telegram_bot": r"\b\d{8,10}:[A-Za-z0-9_-]{35}\b",
    "telegram_link": r"t\.me/[A-Za-z0-9_]{4,}",
    "whatsapp": r"wa\.me/\d{8,15}",
    "iban": r"\bAE\d{2}\s?(?:\d{4}\s?){4}\d{3}\b",
    "uae_phone": r"(?:\+971|00971)[\s-]?5\d[\s-]?\d{3}[\s-]?\d{4}",
    "analytics_id": r"\b(?:G-[A-Z0-9]{8,12}|UA-\d{4,10}-\d{1,3}|GTM-[A-Z0-9]{5,8})\b",
}


class _Text(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts, self.title, self.forms, self._skip, self._in_title = [], "", [], 0, False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ("script", "style", "noscript"):
            self._skip += 1
        if tag == "title":
            self._in_title = True
        if tag not in ("input", "select", "textarea"):
            return
        if (a.get("type") or "").lower() in ("checkbox", "radio", "hidden", "submit", "button", "search", "image", "reset"):
            return
        # every attribute that says what the field collects
        self.forms.append(" ".join(str(a.get(k) or "") for k in ("name", "id", "placeholder", "type", "autocomplete", "aria-label")).strip())
        for k in ("placeholder", "aria-label"):
            if a.get(k):
                self.parts.append(a[k])

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript") and self._skip:
            self._skip -= 1
        if tag == "title":
            self._in_title = False

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        elif not self._skip:
            self.parts.append(data)


def page_text(html: str) -> dict:
    p = _Text()
    try:
        p.feed(html)
    except Exception:
        pass
    return {"text": " ".join(" ".join(p.parts).split()), "title": " ".join(p.title.split()), "inputs": p.forms[:40]}


def any_match(patterns, text):
    return any(re.search(p, text, re.IGNORECASE) for p in patterns)


def fingerprints(html: str) -> list[dict]:
    out = []
    for kind, pattern in FINGERPRINTS.items():
        for value in sorted(set(re.findall(pattern, html))):
            out.append({"kind": kind, "value": value.replace(" ", "")})
    return out


def _mentions(term: str, low: str) -> int:
    """Whole-word matches only, so 'du' does not match inside 'during'."""
    term = term.lower().strip()
    if len(term) < 4 and not re.search(r"[؀-ۿ]", term):
        return 0  # too short to be a reliable brand mention
    return len(re.findall(rf"(?<![\w؀-ۿ]){re.escape(term)}(?![\w؀-ۿ])", low))


def claimed_entity(text: str, host: str) -> dict | None:
    """The entity a page presents itself as: several mentions, or a mention plus a brand-like domain."""
    low = text.lower()
    best, best_hits = None, 0
    for e in store.registry()["entities"]:
        hits = sum(_mentions(k, low) for k in {*e["keywords"], e["name_en"], e["name_ar"]})
        if hits and any(t in host for t in e["brand_tokens"]):
            hits += 2
        if hits >= 2 and hits > best_hits:
            best, best_hits = e, hits
    return best


def domain_created(host: str) -> date | None:
    """Registration date from RDAP (public WHOIS replacement). None if unknown."""
    parts = host.split(".")
    if len(parts) < 2 or host.endswith(".localhost"):
        return None
    for candidate in (".".join(parts[-2:]), ".".join(parts[-3:])):
        try:
            with urllib.request.urlopen(f"https://rdap.org/domain/{candidate}", timeout=8) as r:
                for ev in json.loads(r.read()).get("events", []):
                    if ev.get("eventAction") == "registration":
                        return date.fromisoformat(ev["eventDate"][:10])
        except Exception:
            continue
    return None


def evaluate(host: str, phone: dict, bot: dict, stage=None) -> dict:
    """Score a page from its phone view and bot view.

    `stage(name)` is a context manager from the agent company (org.py): the content, fingerprint and domain
    sections each run inside the department that does that work. The scoring is the same either way."""
    run = stage or (lambda _name: nullcontext())
    reasons, score = [], 0

    def add(points, ar, en):
        nonlocal score
        score += points
        reasons.append({"points": points, "ar": ar, "en": en, "by": "rules"})

    with run("content"):
        pv, bv = page_text(phone.get("html", "")), page_text(bot.get("html", ""))
        text = f"{pv['title']} {pv['text']}"
        bot_text = f"{bv['title']} {bv['text']}"
        fields = " | ".join(pv["inputs"]).lower()
        card_form = bool(re.search(CARD_FIELDS, fields, re.IGNORECASE))
        id_form = bool(re.search(ID_FIELDS, fields, re.IGNORECASE))
        password_form = bool(re.search(PASSWORD_FIELDS, fields, re.IGNORECASE))

        # Mentioning a body is not impersonating it (guides, news and blogs mention TAMM all the time).
        # A page presents itself as the body when the title names it or the domain imitates it.
        entity = claimed_entity(text, host)
        brand_domain = bool(entity) and any(t in host for t in entity["brand_tokens"])
        in_title = bool(entity) and any(_mentions(k, pv["title"].lower()) for k in {*entity["keywords"], entity["name_en"], entity["name_ar"]})
        presents_as = bool(entity) and (brand_domain or in_title)

        # Many legitimate sites (YouTube, news) serve phones a different layout. It only counts as
        # cloaking when the phone version carries the risky content and the scanner version hides it.
        similarity, cloaked = None, False
        if pv["text"] and bv["text"]:
            similarity = difflib.SequenceMatcher(None, pv["text"][:5000], bv["text"][:5000]).ratio()
            phone_risky = card_form or id_form
            bot_risky = bool(claimed_entity(bot_text, "")) or any_match(PAYMENT, bot_text) or any_match(CREDENTIALS, bot_text)
            # a scanner that got an error or a bot-check page is not being shown a decoy
            bot_decoy = bot.get("status") == 200 and not re.search(BLOCKED_PAGE, bot_text[:400], re.IGNORECASE)
            if similarity < 0.45 and phone_risky and not bot_risky and bot_decoy:
                cloaked = True
                add(30, "يُظهر للهواتف صفحة تطلب مالاً أو بيانات ويخفيها عن أدوات الفحص (إخفاء)",
                    f"Shows phones a page asking for money or data and hides it from scanners (cloaking, {similarity:.0%} similar)")

        if presents_as and (card_form or id_form or brand_domain or cloaked or (password_form and brand_domain)):
            add(40, f"يقدّم نفسه على أنه {entity['name_ar']} وهو ليس على نطاقها الرسمي ({', '.join(entity['domains'])})",
                f"Presents itself as {entity['name_en']} but is not on its official domain ({', '.join(entity['domains'])})")
            if brand_domain:
                add(20, "اسم النطاق يقلّد اسم الجهة", "Domain name imitates the brand")
        else:
            entity = None  # only mentions it; not a claim
        if card_form:
            add(25, "فيه نموذج يطلب بيانات البطاقة", "Has a form asking for card details")
        elif entity and any_match(PAYMENT, text):
            add(10, "يطلب الدفع باسم الجهة", "Asks for payment in the body's name")
        if id_form:
            add(15, "فيه نموذج يطلب رمز تحقق أو رقم الهوية", "Has a form asking for an OTP or Emirates ID")
        elif password_form and entity:
            add(10, "يطلب كلمة مرور باسم الجهة", "Asks for a password in the body's name")
        if (entity or card_form or id_form) and any_match(URGENCY, text):
            add(10, "يضغط على الضحية بمهلة قصيرة أو تهديد", "Pressures the victim with a deadline or threat")

    with run("fingerprints"):
        fps = fingerprints(phone.get("html", "") + bot.get("html", ""))
        if any(f["kind"] == "telegram_bot" for f in fps):
            add(20, "يرسل البيانات المسروقة إلى بوت تيليجرام", "Sends stolen data to a Telegram bot")

    with run("domain"):
        created = domain_created(host)
        new_domain = bool(created) and (date.today() - created).days < 30
        if new_domain and (entity or score):
            add(15, f"النطاق مسجّل منذ {(date.today() - created).days} يوماً فقط",
                f"Domain registered only {(date.today() - created).days} days ago")

    # A brand name in the domain and title is not enough for "fraud" on its own: a real site missing
    # from the registry looks exactly like that. Fraud needs something that harms: a form taking card,
    # OTP or ID details, cloaking, a Telegram exfil bot, or a domain registered days ago.
    harmful = card_form or id_form or cloaked or new_domain or any(f["kind"] == "telegram_bot" for f in fps)
    if score >= FRAUD_AT and not harmful:
        score = FRAUD_AT - 1
        reasons.append({"points": 0, "by": "rules",
                        "ar": "لا يطلب بيانات بطاقة أو رمز تحقق ولا يخفي نفسه: مشبوه فقط حتى يراجعه محلل",
                        "en": "Asks for no card or OTP details and does not cloak: suspicious only, pending analyst review"})

    return {"score": min(score, 100), "reasons": reasons, "entity": entity, "fingerprints": fps,
            "similarity": similarity, "cloaked": cloaked,
            "domain_created": created.isoformat() if created else None,
            "phone_view": {"final_url": phone.get("final_url"), "status": phone.get("status"), "error": phone.get("error"),
                           "title": pv["title"], "text": pv["text"][:4000], "inputs": pv["inputs"]},
            "bot_view": {"final_url": bot.get("final_url"), "status": bot.get("status"), "error": bot.get("error"),
                         "title": bv["title"], "text": bv["text"][:1500]}}


# ---- the link and its domain name alone, before (or without) opening the page --------------------------------
# Brands phished worldwide, with their real domains. Public phishing lists are full of these, mostly dead by the
# time they are checked: the name is then the only evidence left.
GLOBAL_BRANDS = {
    "paypal": ("paypal.com", "paypal.me"), "apple": ("apple.com", "icloud.com"), "appleid": ("apple.com",),
    "icloud": ("icloud.com", "apple.com"),
    "microsoft": ("microsoft.com", "live.com", "office.com", "microsoftonline.com", "outlook.com", "sharepoint.com"),
    "office365": ("office.com", "microsoft.com"), "outlook": ("outlook.com", "live.com", "office.com"),
    "netflix": ("netflix.com",), "amazon": ("amazon.com", "amazon.ae", "amazon.co.uk", "amazonaws.com"),
    "dhl": ("dhl.com", "dhl.ae"), "fedex": ("fedex.com",), "ups": ("ups.com",), "usps": ("usps.com",),
    "whatsapp": ("whatsapp.com", "whatsapp.net", "wa.me"), "facebook": ("facebook.com", "fb.com"),
    "instagram": ("instagram.com",), "binance": ("binance.com",), "coinbase": ("coinbase.com",),
    "metamask": ("metamask.io",), "ebay": ("ebay.com",), "adobe": ("adobe.com",), "docusign": ("docusign.com", "docusign.net"),
    "dropbox": ("dropbox.com",), "linkedin": ("linkedin.com",), "wellsfargo": ("wellsfargo.com",), "chase": ("chase.com",),
    "steamcommunity": ("steamcommunity.com",), "roblox": ("roblox.com",), "gmail": ("google.com", "gmail.com"),
}
LURE_WORDS = ("login", "signin", "sign-in", "verify", "verification", "secure", "security", "account", "update",
              "confirm", "unlock", "suspend", "suspended", "billing", "refund", "payment", "wallet", "recover", "reactivate")
RISKY_TLDS = ("xyz", "top", "cfd", "sbs", "click", "icu", "buzz", "monster", "cyou", "bond", "rest", "quest", "gq",
              "tk", "ml", "cf", "ga", "zip", "mov", "lol", "work", "support", "help", "country", "kim", "loan", "live")


def _has_token(host: str, token: str) -> bool:
    """A brand token as a whole part of the name (adpolice-fines.pay, paypal.secure-x.com), so 'ups' does not
    match 'groups' and 'tamm' does not match 'tammam'; longer tokens may also sit inside a word (mypaypal-login)."""
    token = token.lower().strip("-.")
    if len(token) < 3:
        return False
    if re.search(rf"(^|[.\-]){re.escape(token)}([.\-]|$)", host):
        return True
    return len(token) >= 6 and token in host.replace("-", "").replace(".", "")


def domain_signals(url: str, host: str) -> dict:
    """Score the link and its domain name alone (nothing is opened): imitation of an official body or a widely
    phished brand on a domain that is not theirs, a raw IP address, a fake host before '@', punycode,
    phishing words and throwaway top-level domains. Used when the page does not open, which is how most
    phishing links in public lists look by the time anyone checks them."""
    host = (host or "").lower().strip(".")
    reasons, score, entity = [], 0, None

    def add(points, ar, en):
        nonlocal score
        score += points
        reasons.append({"points": points, "ar": ar, "en": en, "by": "domain"})

    parts = urlsplit(url if "://" in url else "http://" + url)
    if "@" in (parts.netloc or ""):
        shown = parts.netloc.split("@", 1)[0]
        add(35, f"يخفي العنوان الحقيقي خلف «{shown}@»: المتصفح يذهب إلى {host} لا إلى {shown}",
            f"Hides the real address behind “{shown}@”: the browser goes to {host}, not {shown}")
    try:
        ipaddress.ip_address(host.strip("[]"))
        add(30, "الرابط عنوان IP مباشر بلا اسم نطاق، كما تفعل صفحات الاحتيال المؤقتة",
            "The link is a bare IP address with no domain name, as throwaway scam pages use")
        return {"score": min(score + (10 if any(w in parts.path.lower() for w in LURE_WORDS) else 0), 100),
                "reasons": reasons, "entity": None}
    except ValueError:
        pass
    if "xn--" in host:
        add(15, "اسم النطاق بحروف مشفّرة (punycode) قد تحاكي اسماً معروفاً",
            "The domain uses encoded (punycode) letters that can mimic a known name")
    if not store.official_entity(host):
        for e in store.registry()["entities"]:
            if any(_has_token(host, t) for t in e["brand_tokens"]):
                entity = e
                add(35, f"اسم النطاق يقلّد {e['name_ar']} وهو ليس نطاقها الرسمي ({', '.join(e['domains'])})",
                    f"The domain name imitates {e['name_en']} and is not its official domain ({', '.join(e['domains'])})")
                break
        if not entity:
            for brand, real in GLOBAL_BRANDS.items():
                if _has_token(host, brand) and not any(host == d or host.endswith("." + d) for d in real):
                    add(35, f"اسم النطاق يقلّد {brand} وهو ليس نطاقها الحقيقي ({', '.join(real)})",
                        f"The domain name imitates {brand} and is not its real domain ({', '.join(real)})")
                    break
    lures = [w for w in LURE_WORDS if re.search(rf"(^|[.\-]){re.escape(w)}", host)]
    if lures:
        add(10, f"اسم النطاق فيه كلمات استدراج ({', '.join(lures[:3])})", f"The domain name carries lure words ({', '.join(lures[:3])})")
    tld = host.rsplit(".", 1)[-1] if "." in host else ""
    if tld in RISKY_TLDS:
        add(10, f"امتداد .{tld} رخيص ويكثر في صفحات الاحتيال", f"The .{tld} ending is cheap and common on scam pages")
        if lures:
            add(10, "كلمات استدراج على امتداد رخيص معاً: نمط صفحات التصيّد المؤقتة",
                "Lure words on a cheap ending together: the pattern of throwaway phishing pages")
    if host.count("-") >= 3 or len(host) > 45 or host.count(".") >= 4:
        add(5, "اسم نطاق طويل أو مليء بالشرطات", "A long or hyphen-heavy domain name")
    return {"score": min(score, 100), "reasons": reasons, "entity": entity}


def verdict_for(score: int) -> str:
    return "fraud" if score >= FRAUD_AT else "suspicious" if score >= SUSPICIOUS_AT else "safe"
