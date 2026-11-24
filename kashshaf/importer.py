"""Read a file of links (CSV, TSV, Excel .xlsx, TXT or JSON) into (line, url, expected label).

The file can have any columns: the link column is the one where most cells look like links. If a column
says whether each link is fraud or legitimate (label, class, type, is_phishing...), that becomes the
expected label, so the dashboard can measure precision and recall against it.
"""
import csv
import io
import json
import re
import xml.etree.ElementTree as ET
import zipfile

MAX_LINKS = 5000

_LINK = re.compile(r"^(?:https?://)?(?:[a-z0-9-]+\.)+[a-z]{2,63}(?::\d{2,5})?(?:[/?#]\S*)?$", re.IGNORECASE)
_LOCAL = re.compile(r"^(?:https?://)?[a-z0-9.-]+\.localhost(?::\d{2,5})?(?:[/?#]\S*)?$", re.IGNORECASE)

FRAUD_WORDS = {"phishing", "phish", "malicious", "fraud", "fraudulent", "scam", "bad", "spam", "malware",
               "defacement", "1", "true", "yes", "احتيال", "احتيالي", "مزيف", "ضار"}
LEGIT_WORDS = {"legitimate", "legit", "benign", "safe", "good", "clean", "official", "0", "false", "no",
               "سليم", "آمن", "امن", "رسمي", "مشروع"}
LABEL_HEADERS = {"label", "labels", "class", "type", "verdict", "status", "result", "category", "target",
                 "is_phishing", "phishing", "is_malicious", "malicious", "is_fraud", "fraud", "expected",
                 "التصنيف", "النوع", "الحكم", "الحالة"}


def clean_link(cell: str) -> str | None:
    """A cell as a link, or None. Undoes common defanging (hxxp, [.]) and adds http:// when missing."""
    s = (cell or "").strip().strip("\"'<>").replace("[.]", ".").replace("(.)", ".")
    s = re.sub(r"^hxxp", "http", s, flags=re.IGNORECASE)
    if not s or " " in s or not (_LINK.match(s) or _LOCAL.match(s)):
        return None
    return s if re.match(r"^https?://", s, re.IGNORECASE) else "http://" + s


def label_of(cell: str) -> str | None:
    v = (cell or "").strip().lower()
    if v in FRAUD_WORDS:
        return "fraud"
    if v in LEGIT_WORDS:
        return "legit"
    return None


def _xlsx_rows(data: bytes) -> list[list[str]]:
    """First sheet of an .xlsx file, read with the standard library (the file is zipped XML)."""
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        shared = []
        if "xl/sharedStrings.xml" in z.namelist():
            for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", ns):
                shared.append("".join(t.text or "" for t in si.iter(f"{{{ns['m']}}}t")))
        sheet = sorted(n for n in z.namelist() if re.match(r"xl/worksheets/sheet\d+\.xml$", n))[0]
        rows = []
        for row in ET.fromstring(z.read(sheet)).iter(f"{{{ns['m']}}}row"):
            cells = {}
            for c in row.findall("m:c", ns):
                col = re.sub(r"\d", "", c.get("r", "A"))
                idx = 0
                for ch in col:
                    idx = idx * 26 + ord(ch.upper()) - 64
                v = c.find("m:v", ns)
                if c.get("t") == "s" and v is not None:
                    text = shared[int(v.text)]
                elif c.get("t") == "inlineStr":
                    text = "".join(t.text or "" for t in c.iter(f"{{{ns['m']}}}t"))
                else:
                    text = v.text if v is not None else ""
                cells[idx - 1] = text or ""
            rows.append([cells.get(i, "") for i in range(max(cells) + 1)] if cells else [])
        return rows


def _text_rows(data: bytes) -> list[list[str]]:
    for enc in ("utf-8-sig", "cp1256", "latin-1"):
        try:
            text = data.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    lines = [l for l in text.splitlines() if l.strip()]
    if not lines:
        return []
    try:
        dialect = csv.Sniffer().sniff("\n".join(lines[:20]), delimiters=",;\t|")
        return [r for r in csv.reader(lines, dialect)]
    except csv.Error:
        return [[l] for l in lines]  # one link per line


def _json_rows(data: bytes) -> list[list[str]]:
    doc = json.loads(data.decode("utf-8-sig"))
    if isinstance(doc, dict):  # {"urls": [...]} or {"data": [...]}
        doc = next((v for v in doc.values() if isinstance(v, list)), [])
    if doc and all(isinstance(x, dict) for x in doc):
        keys = list(dict.fromkeys(k for x in doc for k in x))
        return [keys] + [[str(x.get(k, "")) for k in keys] for x in doc]
    return [[str(x)] for x in doc]


def read_rows(file_name: str, data: bytes) -> list[list[str]]:
    name = file_name.lower()
    if name.endswith((".xlsx", ".xlsm")):
        return _xlsx_rows(data)
    if name.endswith(".json"):
        return _json_rows(data)
    return _text_rows(data)


def parse(file_name: str, data: bytes) -> dict:
    """{"items": [{"line", "url", "expected"}], "skipped": n, "url_column", "label_column"}."""
    rows = [[str(c).strip() for c in r] for r in read_rows(file_name, data) if any(str(c).strip() for c in r)]
    if not rows:
        return {"items": [], "skipped": 0, "url_column": None, "label_column": None}
    width = max(len(r) for r in rows)
    header = rows[0] if not any(clean_link(c) for c in rows[0]) else None
    body = rows[1:] if header else rows
    first_line = 2 if header else 1

    def column(i):
        return [r[i] if i < len(r) else "" for r in body]

    url_col = max(range(width), key=lambda i: sum(bool(clean_link(c)) for c in column(i)))
    label_col = None
    for i in range(width):
        if i == url_col:
            continue
        named = header and header[i].strip().lower() in LABEL_HEADERS
        values = [c for c in column(i) if c]
        known = sum(bool(label_of(c)) for c in values)
        if values and (named or known / len(values) > 0.9) and known / len(values) > 0.5:
            label_col = i
            break

    items, skipped, seen = [], 0, set()
    for n, r in enumerate(body):
        url = clean_link(r[url_col] if url_col < len(r) else "")
        if not url or url in seen:
            skipped += 1
            continue
        seen.add(url)
        expected = label_of(r[label_col]) if label_col is not None and label_col < len(r) else None
        items.append({"line": first_line + n, "url": url, "expected": expected})
        if len(items) >= MAX_LINKS:
            skipped += len(body) - n - 1
            break
    return {"items": items, "skipped": skipped,
            "url_column": header[url_col] if header else url_col + 1,
            "label_column": (header[label_col] if header else label_col + 1) if label_col is not None else None}
