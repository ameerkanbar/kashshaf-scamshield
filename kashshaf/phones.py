"""Fake customer-service numbers on Google Maps.

A Maps place whose name presents it as an official body (the same whole-word matching the rules use on pages),
with a phone number that is not one of that body's official numbers (official_phones, read from each body's
own website), is a fake support line. It is recorded (fake_phones) even when the place has no website, and
when it has one, it becomes an extra reason in that link's verdict.

A body with no official number on record is never flagged: an unknown number is not proof of a fake one.
"""
import re
import threading
import time

from . import store, supa

_cache = {"at": 0.0, "by_entity": {}}
_lock = threading.Lock()

# Words that make a place name a customer-service claim ("Salik Customer Service", "خدمة عملاء اتصالات").
SERVICE_WORDS = ("customer service", "customer care", "customer support", "call center", "call centre", "contact center",
                 "contact centre", "helpline", "help line", "hotline", "support", "service center", "service centre",
                 "complaints", "refund", "خدمة العملاء", "خدمة عملاء", "مركز الاتصال", "مركز اتصال", "الدعم", "دعم العملاء",
                 "الخط الساخن", "الشكاوى", "مركز خدمة")
FAKE_POINTS = 40  # impersonating a body's customer service with a number that is not theirs


def normalize(raw: str | None) -> str:
    """Digits only, without the country code or the trunk 0: '+971 2 446 1461', '00971-2-4461461' and
    '02 4461461' all become '24461461'; toll-free '800 3333' stays '8003333'."""
    d = re.sub(r"\D", "", raw or "")
    if d.startswith("00"):
        d = d[2:]
    if d.startswith("971") and len(d) >= 10:
        d = d[3:]
    return d.lstrip("0")


def official_numbers() -> dict[str, set[str]]:
    """{entity_id: {normalised numbers}}, reloaded every minute. Empty if the table is not there yet."""
    with _lock:
        if time.time() - _cache["at"] > 60:
            by: dict[str, set[str]] = {}
            try:
                for r in supa.select("official_phones", select="phone,entity_id"):
                    by.setdefault(r["entity_id"], set()).add(normalize(r["phone"]))
            except supa.SupabaseError as e:
                print(f"[phones] official_phones not readable: {e}")
            _cache.update(at=time.time(), by_entity=by)
        return _cache["by_entity"]


def place_entity(name: str) -> dict | None:
    """The official body a Maps place name presents itself as, or None.

    Whole-word mentions only (like the rules). A short business name is a claim only when it names the body
    with a phrase of two words or more ("Abu Dhabi Police ..."), or names it next to a service word
    ("Salik Customer Service"); "Salik Car Wash" or "Tamm Cafe" are not claims."""
    from .rules import _mentions  # same matching as for pages
    low = (name or "").lower()
    if not low.strip():
        return None
    service = any(w in low for w in SERVICE_WORDS)
    best, best_score = None, 0
    for e in store.registry()["entities"]:
        terms = {t.lower().strip() for t in (*e["keywords"], e["name_en"], e["name_ar"]) if t}
        hits = [t for t in terms if _mentions(t, low)]
        if not hits:
            continue
        strong = any(len(t.split()) >= 2 for t in hits)
        if not (strong or service):
            continue
        score = sum(len(t) for t in hits)  # the longest, most specific name wins
        if score > best_score:
            best, best_score = e, score
    return best


def check_place(name: str, phone: str | None) -> dict | None:
    """A fake support line, or None. Only when the place claims to be a body that has official numbers on record
    and its number is not one of them."""
    number = normalize(phone)
    if len(number) < 3:
        return None
    entity = place_entity(name)
    if not entity:
        return None
    known = official_numbers().get(entity["id"])
    if not known or number in known:
        return None
    return {"entity": entity, "phone": number, "phone_raw": phone, "official": sorted(known)}


def reason(fake: dict, name: str) -> dict:
    e = fake["entity"]
    shown = fake["phone_raw"] or fake["phone"]
    return {"points": FAKE_POINTS, "by": "maps",
            "ar": f"رقم خدمة عملاء مزيّف على خرائط جوجل: «{name}» يقدّم نفسه على أنه {e['name_ar']} برقم {shown}، "
                  f"وهو ليس من أرقام {e['name_ar']} الرسمية",
            "en": f"Fake customer-service number on Google Maps: “{name}” presents itself as {e['name_en']} with {shown}, "
                  f"which is not one of {e['name_en']}'s official numbers"}


def record(fake: dict, place: dict, query: str | None, url_id: int | None) -> None:
    """Keep the fake line for the analyst (a place seen again just counts one more sighting)."""
    e = fake["entity"]
    try:
        rows = supa.select("fake_phones", select="id,sightings", phone=f"eq.{fake['phone']}",
                           entity_id=f"eq.{e['id']}", place_name=f"eq.{place['title']}")
        if rows:
            supa.update("fake_phones", {"sightings": rows[0]["sightings"] + 1, "last_seen": store.now(),
                                        **({"url_id": url_id} if url_id else {})}, id=f"eq.{rows[0]['id']}")
        else:
            supa.insert("fake_phones", {"phone": fake["phone"], "phone_raw": fake["phone_raw"], "entity_id": e["id"],
                                        "place_name": place["title"], "address": place.get("address"), "query": query,
                                        "website": place.get("website"), "url_id": url_id}, returning=False)
            store.audit("discovery", "fake_phone", place["title"], {"phone": fake["phone_raw"], "entity": e["id"]})
    except supa.SupabaseError as e2:
        print(f"[phones] could not record a fake number: {e2}")


def for_url(url_id: int) -> list[dict]:
    """Reasons for a link from its Maps sightings: the place's name and number, checked again now."""
    out, seen = [], set()
    try:
        rows = supa.select("url_sightings", select="phone,raw", url_id=f"eq.{url_id}", source="eq.maps")
    except supa.SupabaseError:
        return out
    for s in rows:
        name = (s.get("raw") or {}).get("title") or ""
        fake = check_place(name, s.get("phone"))
        if fake and (fake["phone"], fake["entity"]["id"]) not in seen:
            seen.add((fake["phone"], fake["entity"]["id"]))
            out.append({**reason(fake, name), "fake_phone": fake["phone_raw"] or fake["phone"], "entity_id": fake["entity"]["id"]})
    return out


def listing(limit: int = 100) -> list[dict]:
    """Fake support lines for the dashboard, newest first, with the body's official numbers beside them."""
    try:
        rows = supa.select("fake_phones", select="*", order="last_seen.desc", limit=str(limit))
    except supa.SupabaseError:
        return []
    reg = {e["id"]: e for e in store.registry()["entities"]}
    nums = official_numbers()
    for r in rows:
        e = reg.get(r["entity_id"]) or {}
        r.update(entity_en=e.get("name_en"), entity_ar=e.get("name_ar"), official=sorted(nums.get(r["entity_id"], ())))
    return rows
