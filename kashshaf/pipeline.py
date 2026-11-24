"""Inspect one URL as a case that moves through the agent company (org.py):

intake (official registry, known blocks) -> web (two-view fetch) -> content / fingerprints / domain (rules)
-> ai (Claude agent) -> chief (verdict, saved and blocked).

Every step reports what it found (org.report), word for word from the evidence, for the live view.
"""
from contextlib import nullcontext
from datetime import datetime, timedelta, timezone

from . import agent, config, control, evidence, fetcher, org, rules, store, supa

UAE = timezone(timedelta(hours=4))  # Abu Dhabi time, no daylight saving

# The chief's words for each verdict: level, Arabic, English
VERDICT_WORDS = {
    "fraud": ("bad", "احتيال · حُظر", "Fraud · blocked"),
    "suspicious": ("warn", "مشبوه · محظور حتى المراجعة", "Suspicious · blocked pending review"),
    "safe": ("ok", "آمن", "Safe"),
    "official": ("ok", "رسمي", "Official"),
    "unreachable": ("warn", "تعذّر الفتح", "Unreachable"),
}
FP_NAMES = {"telegram_bot": ("بوت تيليجرام", "Telegram bot"), "telegram_link": ("رابط تيليجرام", "Telegram link"),
            "whatsapp": ("رقم واتساب", "WhatsApp number"), "iban": ("آيبان", "IBAN"), "uae_phone": ("رقم هاتف", "phone number"),
            "analytics_id": ("معرّف تحليلات", "analytics ID")}


def _first(reasons: list[dict]) -> tuple[str, str]:
    """The first reason, plus how many more."""
    more = len(reasons) - 1
    r = reasons[0]
    return (r["ar"] + (f" (+{more})" if more else ""), r["en"] + (f" (+{more})" if more else ""))


def inspect(url_row: dict, agent_name: str) -> dict:
    url, host = url_row["url"], url_row["domain"]
    company = org.current()
    case = company.case_start(url_row, agent_name) if company else None
    stage = (lambda did: company.stage(case, did)) if company else (lambda did: nullcontext())
    decide = (lambda: company.decide(case)) if company else nullcontext
    report = (lambda who, level, ar, en: company.report(who, level, ar, en, host)) if company else (lambda *a: None)

    def finish(scan, verdict):
        with decide():
            store.save_result(url_row, agent_name, scan, verdict)
        if verdict["verdict"] in store.BLOCKING:
            evidence.schedule(url_row, agent_name)  # scam pages vanish fast: keep the evidence from this moment
        if company:
            company.case_finish(case, verdict["verdict"])
            report(company.chief, *VERDICT_WORDS.get(verdict["verdict"], ("info", verdict["verdict"], verdict["verdict"])))
        return verdict

    # Intake: the official registry and the blocklist answer many links without any fetch.
    owner = store.official_entity(host)
    if owner:
        report(agent_name, "ok", f"رسمي: {owner['name_ar']}", f"Official: {owner['name_en']}")
        return finish(None, {"verdict": "official", "score": 0, "claimed_entity_id": owner["id"],
                             "reasons": [{"points": 0, "by": "registry", "ar": f"نطاق رسمي مسجّل لجهة {owner['name_ar']}",
                                          "en": f"Registered official domain of {owner['name_en']}"}]})
    ns = store.gov_namespace(host)
    if ns:
        report(agent_name, "ok", f"نطاق حكومي محمي (.{ns})", f"Protected government namespace (.{ns})")
        return finish(None, {"verdict": "official", "score": 0, "claimed_entity_id": None,
                             "reasons": [{"points": 0, "by": "registry", "ar": f"نطاق حكومي محمي (.{ns}) لا تسجّله إلا جهات حكومية",
                                          "en": f"Protected government namespace (.{ns}); only government bodies can register it"}]})

    # A new link on a domain the database already blocks: same verdict, no fetch, no Claude.
    # (A link that was judged before goes through the full check, so "rescan" can still clear it.)
    dom = store.domain_status(host)
    if store.is_confirmed_fraud(dom) and supa.count("verdicts", url_id=f"eq.{url_row['id']}") == 0:
        when = dom.get("blocked_at") or dom.get("updated_at")
        since = datetime.fromisoformat(when).astimezone(UAE).strftime("%d/%m/%Y %H:%M") if when else ""
        control.saved("ai")
        report(agent_name, "bad", "نطاق محظور مسبقاً", "Domain already blocked")
        return finish(None, {"verdict": "fraud", "score": dom.get("score") or 100, "model": "database",
                             "claimed_entity_id": dom.get("claimed_entity_id"),
                             "reasons": [{"points": 0, "by": "database",
                                          "ar": f"النطاق محظور مسبقاً في قاعدة البيانات منذ {since} بتوقيت الإمارات",
                                          "en": f"Domain already blocked in the database since {since} (UAE time)"}]})
    report(agent_name, "info", "غير معروف · أُحيل للفحص", "Unknown · sent for checks")

    # Web: open the link as a UAE phone and as a scanner.
    with stage("web") as web_agent:
        phone, bot = fetcher.fetch_two_views(url)
    if not phone["html"] and not bot["html"]:
        report(web_agent, "warn", "تعذّر فتح الرابط", f"Could not open: {(phone['error'] or '')[:60]}")
        return finish({"phone_view": {"error": phone["error"], "status": phone.get("status")},
                       "bot_view": {"error": bot["error"], "status": bot.get("status")}, "error": phone["error"]},
                      {"verdict": "unreachable", "score": 0, "reasons": [
                          {"points": 0, "by": "fetch", "ar": "تعذّر فتح الرابط", "en": f"Could not open: {phone['error']}"}]})
    report(web_agent, "ok", f"فُتح كهاتف ({phone.get('status')}) وكأداة فحص ({bot.get('status')})",
           f"Opened as phone ({phone.get('status')}) and scanner ({bot.get('status')})")

    # Content, fingerprints and domain departments: the rules, each section in its department.
    ev = rules.evaluate(host, phone, bot, stage=stage)
    if company:
        rs = ev["reasons"]
        content = [r for r in rs if not (r["en"].startswith("Sends stolen data") or r["en"].startswith("Domain registered")
                                         or r["en"].startswith("Domain name imitates"))]
        domain = [r for r in rs if r["en"].startswith("Domain registered") or r["en"].startswith("Domain name imitates")]
        if content:
            company.credit(case, "content")
            report((case, "content"), "bad", *_first(content))
        else:
            report((case, "content"), "ok", "لا إشارات احتيال في المحتوى", "No fraud signals in the content")
        fps = ev["fingerprints"]
        if fps:
            company.credit(case, "fingerprints")
            kinds = list(dict.fromkeys(f["kind"] for f in fps))
            names = [FP_NAMES.get(k, (k, k)) for k in kinds]
            bad = "telegram_bot" in kinds
            report((case, "fingerprints"), "bad" if bad else "warn",
                   "وُجد: " + "، ".join(a for a, _ in names), "Found: " + ", ".join(e for _, e in names))
        else:
            report((case, "fingerprints"), "ok", "لا بصمات تربطه بعصابة", "No fingerprints linking it to a gang")
        if domain:
            company.credit(case, "domain")
            report((case, "domain"), "bad", *_first(domain))
        else:
            age = f" · مسجّل {ev['domain_created']}" if ev["domain_created"] else ""
            report((case, "domain"), "ok", "لا إشارات في النطاق" + age,
                   "No domain signals" + (f" · registered {ev['domain_created']}" if ev["domain_created"] else ""))
    scan = {"phone_view": ev["phone_view"], "bot_view": ev["bot_view"], "similarity": ev["similarity"],
            "cloaked": ev["cloaked"], "domain_created": ev["domain_created"]}
    verdict = {"verdict": rules.verdict_for(ev["score"]), "score": ev["score"], "reasons": ev["reasons"],
               "claimed_entity_id": ev["entity"]["id"] if ev["entity"] else None,
               "fingerprints": ev["fingerprints"], "model": "rules"}

    # AI department: the full check. Claude reads the whole page, the registry, the domain's registration
    # and the web before the final verdict. Only when it finds nothing wrong is a site called safe.
    result = None
    if agent.enabled() and ev["score"] >= config.AGENT_MIN_RULE_SCORE:
        with stage("ai") as ai_agent:
            result = agent.investigate(url, ev)
        if result:
            level, ar, en = VERDICT_WORDS.get(result["verdict"], ("info", result["verdict"], result["verdict"]))
            report(ai_agent, level, f"Claude: {ar} ({result['score']})", f"Claude: {en} ({result['score']})")
            if company and result["verdict"] == "fraud":
                company.credit(case, "ai")
        else:
            report(ai_agent, "info", "لم يكمل التحقيق · القواعد تحكم", "Investigation did not finish · rules decide")
    if not result and ev["score"] > 0 and verdict["verdict"] == "safe":
        # the rules saw warning signs but the full check could not run: not sure = suspicious,
        # so it is blocked until an analyst looks at it
        verdict.update(verdict="suspicious", score=max(ev["score"], rules.SUSPICIOUS_AT))
        verdict["reasons"] = ev["reasons"] + [{"points": 0, "by": "rules",
            "ar": "ظهرت علامات تحذير ولم يكتمل التحقيق الكامل: محظور احترازياً حتى يراجعه محلل",
            "en": "Warning signs and the full investigation could not run: blocked as a precaution until an analyst reviews it"}]
    if result:
        known = {e["id"] for e in store.registry()["entities"]}
        verdict.update(
            verdict=result["verdict"], score=result["score"], model=result["model"],
            claimed_entity_id=result.get("claimed_entity_id") if result.get("claimed_entity_id") in known
            else verdict["claimed_entity_id"],
            reasons=ev["reasons"] + [{"points": None, "by": "ai", "ar": ar, "en": en}
                                     for ar, en in zip(result.get("reasons_ar") or [], result.get("reasons_en") or [])],
            ai={"summary_ar": result.get("summary_ar"), "summary_en": result.get("summary_en"), "trace": result.get("trace")})

    # Chief: the final verdict is saved and the domain blocked (fraud, or suspicious pending review).
    return finish(scan, verdict)
