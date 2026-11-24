"""Inspect one URL: official check -> two-view fetch -> rules -> Claude agent -> stored verdict."""
from datetime import datetime, timedelta, timezone

from . import agent, config, control, evidence, fetcher, rules, store, supa

UAE = timezone(timedelta(hours=4))  # Abu Dhabi time, no daylight saving


def inspect(url_row: dict, agent_name: str) -> dict:
    url, host = url_row["url"], url_row["domain"]

    owner = store.official_entity(host)
    if owner:
        verdict = {"verdict": "official", "score": 0, "claimed_entity_id": owner["id"],
                   "reasons": [{"points": 0, "by": "registry", "ar": f"نطاق رسمي مسجّل لجهة {owner['name_ar']}",
                                "en": f"Registered official domain of {owner['name_en']}"}]}
        store.save_result(url_row, agent_name, None, verdict)
        return verdict
    ns = store.gov_namespace(host)
    if ns:
        verdict = {"verdict": "official", "score": 0, "claimed_entity_id": None,
                   "reasons": [{"points": 0, "by": "registry", "ar": f"نطاق حكومي محمي (.{ns}) لا تسجّله إلا جهات حكومية",
                                "en": f"Protected government namespace (.{ns}); only government bodies can register it"}]}
        store.save_result(url_row, agent_name, None, verdict)
        return verdict

    # A new link on a domain the database already blocks: same verdict, no fetch, no Claude.
    # (A link that was judged before goes through the full check, so "rescan" can still clear it.)
    dom = store.domain_status(host)
    if store.is_confirmed_fraud(dom) and supa.count("verdicts", url_id=f"eq.{url_row['id']}") == 0:
        when = dom.get("blocked_at") or dom.get("updated_at")
        since = datetime.fromisoformat(when).astimezone(UAE).strftime("%d/%m/%Y %H:%M") if when else ""
        verdict = {"verdict": "fraud", "score": dom.get("score") or 100, "model": "database",
                   "claimed_entity_id": dom.get("claimed_entity_id"),
                   "reasons": [{"points": 0, "by": "database",
                                "ar": f"النطاق محظور مسبقاً في قاعدة البيانات منذ {since} بتوقيت الإمارات",
                                "en": f"Domain already blocked in the database since {since} (UAE time)"}]}
        store.save_result(url_row, agent_name, None, verdict)
        control.saved("ai")
        evidence.schedule(url_row, agent_name)
        return verdict

    phone, bot = fetcher.fetch_two_views(url)
    if not phone["html"] and not bot["html"]:
        verdict = {"verdict": "unreachable", "score": 0, "reasons": [
            {"points": 0, "by": "fetch", "ar": "تعذّر فتح الرابط", "en": f"Could not open: {phone['error']}"}]}
        scan = {"phone_view": {"error": phone["error"], "status": phone.get("status")},
                "bot_view": {"error": bot["error"], "status": bot.get("status")}, "error": phone["error"]}
        store.save_result(url_row, agent_name, scan, verdict)
        return verdict

    ev = rules.evaluate(host, phone, bot)
    scan = {"phone_view": ev["phone_view"], "bot_view": ev["bot_view"], "similarity": ev["similarity"],
            "cloaked": ev["cloaked"], "domain_created": ev["domain_created"]}
    verdict = {"verdict": rules.verdict_for(ev["score"]), "score": ev["score"], "reasons": ev["reasons"],
               "claimed_entity_id": ev["entity"]["id"] if ev["entity"] else None,
               "fingerprints": ev["fingerprints"], "model": "rules"}

    # The full check: the Claude agent reads the whole page, the registry, the domain's registration
    # and the web before the final verdict. Only when it finds nothing wrong is a site called safe.
    result = None
    if agent.enabled() and ev["score"] >= config.AGENT_MIN_RULE_SCORE:
        result = agent.investigate(url, ev)
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

    store.save_result(url_row, agent_name, scan, verdict)
    if verdict["verdict"] in store.BLOCKING:
        # scam pages vanish fast: keep the evidence from the moment we judged it
        evidence.schedule(url_row, agent_name)
    return verdict
