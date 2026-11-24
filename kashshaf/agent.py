"""The Kashshaf investigation agent: Claude with real tools.

The agent receives the rule evidence and both page views, can open pages,
check the official registry, look up a domain's registration date and search
Google, then must submit one structured verdict with reasons.
"""
import json
import os

import base64
import threading

from . import config, control, discovery, evidence, fetcher, rules, store

MODEL = os.environ.get("AGENT_MODEL", "claude-opus-5-5")
MAX_TURNS = 8

SYSTEM = """You are an investigator for Abu Dhabi Police. You decide whether a web page is a scam that \
should be blocked for UAE residents.

How to judge:
- Fraud means the page pretends to be an organisation (government, police, bank, courier, telecom, utility, \
airline, or a well-known business) that it is not, or runs an obvious scam (fake refunds, fake fines, fake \
prizes, fake investments, fake jobs), and tries to take money, card details, OTP codes, IDs or passwords.
- Use the official registry: an official entity only operates on its listed domains. Use lookup_official_entity \
before claiming a domain is not official.
- Legitimate local businesses, news sites and blogs that do not impersonate anyone are safe, even if they sell \
things or take payments.
- Cloaking (phones see different content than scanners) is strong evidence of fraud.
- If the evidence is mixed, use "suspicious" so an analyst reviews it. Never guess "fraud" without evidence.
- Only read pages. Never fill in or submit forms.
- Look at the page with view_page when it names an organisation, asks for money or data, or shows little text: \
scammers draw their message inside images so text scanners miss it.
- When the page presents itself as an organisation in the registry (by name, logo or look), open that \
organisation's real website with view_official_site and compare the two. In submit_verdict, rate how closely the \
page looks like the official site (0-100) and say what you saw. A crude page that only uses the name is still \
impersonation; looking alike on an official domain is not fraud.

When you are done, call submit_verdict exactly once. Write reasons a police analyst can verify, in Arabic and \
English."""

TOOLS = [
    {"name": "fetch_page", "description": "Open a URL as a UAE phone or as a security scanner and return its title, "
     "visible text (truncated), form fields and indicators such as Telegram bots or WhatsApp numbers.",
     "input_schema": {"type": "object", "properties": {
         "url": {"type": "string"}, "device": {"type": "string", "enum": ["phone", "scanner"]}},
         "required": ["url", "device"], "additionalProperties": False}},
    {"name": "lookup_official_entity", "description": "Search the official registry by organisation name or domain. "
     "Returns matching entities with the only domains they officially use.",
     "input_schema": {"type": "object", "properties": {"query": {"type": "string"}},
                      "required": ["query"], "additionalProperties": False}},
    {"name": "domain_registration", "description": "Registration date of a domain from RDAP, if available.",
     "input_schema": {"type": "object", "properties": {"domain": {"type": "string"}},
                      "required": ["domain"], "additionalProperties": False}},
    {"name": "web_search", "description": "Google search (UAE) to check reputation, official websites or scam reports.",
     "input_schema": {"type": "object", "properties": {"query": {"type": "string"}},
                      "required": ["query"], "additionalProperties": False}},
    {"name": "view_page", "description": "See the page as a UAE phone shows it: a screenshot. Shows text drawn inside "
     "images, logos and layout that the page's text does not.",
     "input_schema": {"type": "object", "properties": {"url": {"type": "string"}},
                      "required": ["url"], "additionalProperties": False}},
    {"name": "view_official_site", "description": "See the official website of a registry entity (a screenshot), to "
     "compare its logos, colours, layout and wording with the page.",
     "input_schema": {"type": "object", "properties": {"entity_id": {"type": "string"}},
                      "required": ["entity_id"], "additionalProperties": False}},
    {"name": "submit_verdict", "description": "Submit the final verdict. Call once, at the end.", "strict": True,
     "input_schema": {"type": "object", "properties": {
         "verdict": {"type": "string", "enum": ["fraud", "suspicious", "safe"]},
         "score": {"type": "integer", "description": "0-100 risk score"},
         "claimed_entity_id": {"type": ["string", "null"], "description": "Registry id of the impersonated entity, or null"},
         "reasons_ar": {"type": "array", "items": {"type": "string"}},
         "reasons_en": {"type": "array", "items": {"type": "string"}},
         "summary_ar": {"type": "string"}, "summary_en": {"type": "string"},
         "visual_similarity": {"type": ["integer", "null"],
                               "description": "0-100: how closely it looks like the official site; null if not compared"},
         "visual_notes_ar": {"type": "string", "description": "What the screenshot shows; empty if you did not look"},
         "visual_notes_en": {"type": "string"}},
         "required": ["verdict", "score", "claimed_entity_id", "reasons_ar", "reasons_en", "summary_ar", "summary_en",
                      "visual_similarity", "visual_notes_ar", "visual_notes_en"],
         "additionalProperties": False}},
]

_client = None
_local = threading.local()


def failure() -> str | None:
    """Why the last investigate() in this thread gave no verdict: budget, stopped, api, refusal or unfinished."""
    return getattr(_local, "failure", None)


def enabled() -> bool:
    return bool(config.ANTHROPIC_API_KEY)


def _png(data: bytes) -> dict:
    return {"type": "image", "source": {"type": "base64", "media_type": "image/png",
                                        "data": base64.b64encode(data).decode()}}


def _view_page(url: str) -> list[dict] | str:
    """A screenshot inside the tool result (scale 1: about a quarter of the image tokens of an evidence shot)."""
    shot, error = evidence.screenshot(url, scale=1)
    if not shot:
        return f"No screenshot: {error}."
    return [{"type": "text", "text": f"Screenshot of {url} as a UAE phone sees it."}, _png(shot)]


def _view_official_site(entity_id: str) -> list[dict] | str:
    entity = next((e for e in store.registry()["entities"] if e["id"] == entity_id), None)
    if not entity:
        return f"No registry entity '{entity_id}'. Find its id with lookup_official_entity."
    url, ref, error = evidence.reference(entity)
    if not ref:
        return f"The official website ({url}) could not be captured: {error}."
    return [{"type": "text", "text": f"The official website of {entity['name_en']} ({url}) as a UAE phone sees it."},
            _png(ref)]


def _run_tool(name: str, args: dict) -> str | list[dict]:
    if name == "view_page":
        return _view_page(args["url"])
    if name == "view_official_site":
        return _view_official_site(args["entity_id"])
    if name == "fetch_page":
        page = fetcher.fetch(args["url"], fetcher.PHONE_UA if args["device"] == "phone" else fetcher.BOT_UA)
        view = rules.page_text(page["html"])
        return json.dumps({"final_url": page["final_url"], "status": page.get("status"), "error": page["error"],
                           "title": view["title"], "text": view["text"][:3500], "inputs": view["inputs"],
                           "indicators": rules.fingerprints(page["html"])}, ensure_ascii=False)
    if name == "lookup_official_entity":
        q = args["query"].lower()
        hits = [{"id": e["id"], "name_en": e["name_en"], "name_ar": e["name_ar"], "official_domains": e["domains"]}
                for e in store.registry()["entities"]
                if q in e["name_en"].lower() or q in e["name_ar"] or any(q in d or d in q for d in e["domains"])
                or any(q in k.lower() for k in e["keywords"])]
        return json.dumps(hits or "No official entity matches.", ensure_ascii=False)
    if name == "domain_registration":
        created = rules.domain_created(args["domain"].lower())
        return json.dumps({"registered": created.isoformat() if created else "unknown"})
    if name == "web_search":
        if not config.SERPAPI_KEY:
            return "Search is not available."
        try:
            return json.dumps(discovery.web_search(args["query"]), ensure_ascii=False)
        except control.BudgetExceeded:
            return "Search budget reached for this hour. Decide from the evidence you have."
    return f"Unknown tool {name}"


def investigate(url: str, evidence: dict) -> dict | None:
    """Run the agent. Returns the submitted verdict plus a trace, or None if it could not finish."""
    global _client
    _local.failure = "stopped"
    if not enabled() or not control.state["running"]:
        return None
    try:
        control.take("ai")
    except control.BudgetExceeded:
        _local.failure = "budget"
        return None  # rules decide alone until the hourly cap frees up
    _local.failure = "unfinished"
    import anthropic
    if _client is None:
        # overloads come in bursts: retry a few times with growing pauses (the SDK's default is 2)
        _client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY, base_url=config.AGENT_BASE_URL or None,
                                      max_retries=4)

    brief = {
        "url": url,
        "rule_score": evidence["score"],
        "rule_reasons": [r["en"] for r in evidence["reasons"]],
        "cloaked": evidence["cloaked"],
        "domain_registered": evidence["domain_created"],
        "phone_view": evidence["phone_view"],
        "scanner_view": evidence["bot_view"],
        "indicators": evidence["fingerprints"],
    }
    messages = [{"role": "user", "content": "Investigate this page and submit a verdict.\n\n"
                 + json.dumps(brief, ensure_ascii=False)}]
    trace = []
    asked_for_reasons = False
    for _ in range(MAX_TURNS):
        if not control.state["running"]:
            return None  # stopped mid-investigation: don't spend more
        try:
            response = _client.beta.messages.create(
                model=MODEL, max_tokens=16000, system=SYSTEM, tools=TOOLS, messages=messages,
                output_config={"effort": "medium"},
                betas=["server-side-fallback-2026-07-01"], fallbacks="default",
            )
        except anthropic.RateLimitError as e:
            print(f"[agent] rate limited: {e}")
            _local.failure = "api"
            return None
        except anthropic.APIStatusError as e:
            print(f"[agent] API error {e.status_code}: {e}")
            _local.failure = "api"
            return None
        except anthropic.APIConnectionError as e:
            print(f"[agent] connection error: {e}")
            _local.failure = "api"
            return None
        control.add_tokens(response.usage.input_tokens, response.usage.output_tokens)
        if response.stop_reason == "refusal":
            _local.failure = "refusal"
            return None
        messages.append({"role": "assistant", "content": response.content})
        results = []
        for block in response.content:
            if block.type != "tool_use":
                continue
            if block.name == "submit_verdict":
                v = dict(block.input)
                v["score"] = max(0, min(100, int(v.get("score") or 0)))
                for k in ("reasons_ar", "reasons_en"):  # gateways may not enforce strict schemas
                    if isinstance(v.get(k), str):
                        try:
                            v[k] = json.loads(v[k])
                        except ValueError:
                            v[k] = [v[k]]
                    v[k] = [str(x) for x in (v.get(k) or [])]
                if not (v["reasons_ar"] and v.get("summary_ar")) and not asked_for_reasons:
                    # the gateway may not enforce required fields, and an analyst needs the reasons: ask once
                    asked_for_reasons = True
                    results.append({"type": "tool_result", "tool_use_id": block.id, "is_error": True,
                                    "content": "Not accepted: reasons_ar, reasons_en, summary_ar and summary_en must "
                                               "not be empty. Call submit_verdict again with all of them."})
                    continue
                if v.get("verdict") not in ("fraud", "suspicious", "safe"):
                    return None
                sim = v.get("visual_similarity")
                v["visual_similarity"] = max(0, min(100, int(sim))) if isinstance(sim, (int, float)) else None
                _local.failure = None
                return {**v, "model": response.model, "trace": trace}
            output = _run_tool(block.name, dict(block.input))
            summary = output if isinstance(output, str) else " ".join(  # images stay out of the trace
                b["text"] for b in output if b["type"] == "text")
            trace.append({"tool": block.name, "input": dict(block.input), "output": summary[:300]})
            results.append({"type": "tool_result", "tool_use_id": block.id, "content": output})
        if not results:  # answered in text without submitting: ask once more
            messages.append({"role": "user", "content": "Call submit_verdict now with your final verdict."})
        else:
            messages.append({"role": "user", "content": results})
    return None
