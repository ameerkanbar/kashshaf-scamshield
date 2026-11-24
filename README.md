# Kashshaf (كشّاف)

A fraud-link radar for Abu Dhabi Police. A pool of agents (50 by default) takes
links from Google results, ads, AI Overviews, Maps, certificate logs, phishing
feeds and pasted messages. Each link is opened as a UAE phone and as a scanner,
checked against the official registry, and investigated by a Claude agent with
real tools. Fraud domains are blocked, and anyone who opens one sees an Abu
Dhabi Police warning page. Suspicious domains are blocked at once too, as a
precaution, until an analyst reviews them and decides: safe (unblock), official
(add to the registry) or fraud (keep blocked).

## Architecture

| Part | What it does | Code |
|---|---|---|
| Database | Supabase Postgres: registry, queue, scans, verdicts, fingerprints, blocklist, audit log | `supabase/migrations/` |
| Discovery | SerpAPI (Google, ads, AI Overviews, Maps), crt.sh, OpenPhish | `kashshaf/discovery.py` |
| Agent pool | N workers claim URLs with `claim_url()` (`FOR UPDATE SKIP LOCKED`), safe across machines | `kashshaf/workers.py` |
| Agent company | The agents work as a company: a chief, and 7 departments (discovery, intake, web two-view, content, fingerprints, domain, AI), each with a leader and members. A case moves department to department and waits when a department is full; the chief gives the verdict. Minimum 15 agents | `kashshaf/org.py` |
| Rules | Two-view fetch, cloaking, registry match, payment/OTP asks, Telegram exfil, domain age | `kashshaf/rules.py` |
| Claude agent | Tools: `fetch_page`, `lookup_official_entity`, `domain_registration`, `web_search`, `submit_verdict` | `kashshaf/agent.py` |
| Server | Analyst dashboard (Supabase login, Arabic/English), API, safe-link gateway, warning page | `server.py`, `web/` |
| Dashboard | Home is the operations room: live radar, discover → check → verdict → block pipeline, one tile per agent, live feed, and charts from `/api/insights` | `web/index.html`, `web/assets/app.js`, `web/assets/i18n.js` |
| Extension | Redirects blocked domains to the warning page | `extension/` |
| Evidence | Screenshot, page copy, WHOIS/RDAP, hosting, SHA-256 hashes; evidence pack and takedown draft | `kashshaf/evidence.py` |
| HQ game | `/hq`: a walkable 2D headquarters in Abu Dhabi Police colours. Each room is one dashboard tab (press Space at the officer); the detention cells hold the blocked sites, grouped by the kind of body they impersonate | `web/hq.html`, `web/assets/hq/` |

## Setup

1. Fill in `.env` (copy of `.env.example`):
   - `SUPABASE_SECRET_KEY`: Supabase dashboard → Project Settings → API Keys → secret key
   - `ANTHROPIC_API_KEY`: console.anthropic.com
   - `SERPAPI_KEY`: serpapi.com
2. Create analyst accounts: Supabase dashboard → Authentication → Users → Add user.
   Turn off public sign-ups: Authentication → Sign In / Providers → Allow new users to sign up: off.
3. Install and run:

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

```bash
.venv/bin/python server.py
```

Open http://localhost:8080 and log in.

Local TEST scam pages for demos (never host them publicly):

```bash
python3 test_sites/server.py
```

## Evidence for police use and takedown requests

When a link is judged fraud or suspicious, Kashshaf captures at that moment: a screenshot as an iPhone in
the UAE sees it (headless Chrome, a throwaway profile), a copy of the page, who registered the domain
(RDAP, or WHOIS where RDAP is not offered) with the registrar's abuse contact, and who hosts it (IP, network,
ASN, abuse contact). Files go to a private Supabase Storage bucket with their SHA-256 hashes.

In a link's details, the analyst downloads the evidence pack (ZIP: printable report, screenshot, page copy
as text, evidence.json, a draft takedown request and SHA256SUMS.txt) or opens the report to print as PDF.
The blocked-sites CSV carries the registrar, hosting and abuse contacts for bulk takedown requests.

## Importing a file of links

On the «فحص رسالة أو رابط» page, drop a CSV, Excel (.xlsx), TXT or JSON file (up to 5000 links).
The link column is found automatically, defanged links (`hxxp`, `[.]`) are restored, and every link gets
the full check. If the file has a label column (`label`, `class`, `is_phishing`... with values such as
phishing / legitimate, 1 / 0, احتيال / سليم), the page shows precision, recall, F1 and accuracy, where
"flagged" means blocked for the public (fraud, or suspicious pending review). Results export to CSV.
For a large evaluation set, raise `AI_MAX_PER_HOUR` so every link gets the Claude investigation.

## Settings (.env)

| Setting | Default | Meaning |
|---|---|---|
| `AGENT_COUNT` | 50 | Agents at start; change live from the dashboard |
| `AGENT_MODEL` | `claude-opus-5-5` | Model for the investigation agent |
| `AGENT_BASE_URL` | empty | Empty = Anthropic API directly. Set only for an Anthropic-compatible gateway |
| `AGENT_MIN_RULE_SCORE` | 0 | Run Claude only when rules find at least this score (0 = every non-official link gets the full check) |
| `DISCOVERY_INTERVAL_MIN` | 0 | Minutes between automatic discovery rounds (0 = manual) |
| `SERP_MAX_PER_HOUR` | 20 | Google searches per hour (patrol, discovery and the agent's own searches). Past it, search pauses |
| `AI_MAX_PER_HOUR` | 60 | Claude investigations per hour. Past it, the rules judge alone, and any warning sign makes a link suspicious (blocked pending review) |
| `PATROL_INTERVAL_SEC` | 90 | Seconds between patrol rounds in the operations room |
| `SEARCH_COOLDOWN_HOURS` | 24 | The same resident search is not run (or paid for) again within this window |
| `AGENT_SEARCH_CACHE_HOURS` | 168 | The agent's own searches are answered from the database for a week |
| `RECHECK_AFTER_HOURS` | 24 | A pasted link checked within this window is answered from the database |
| `ALLOW_LOCAL_TEST_SITES` | true | Allow `*.localhost` test pages. Set to false in production |
| `EVIDENCE_AUTO` | true | Capture evidence automatically for fraud and suspicious links (at most 2 at a time, once per link every 6 hours) |
| `CHROME_PATH` | auto | Chrome or Chromium used for screenshots; found automatically on macOS and Linux |

## Public endpoints (no login)

| Path | Use |
|---|---|
| `GET /api/blocklist` | Feed for the extension, DNS or ISP blocking |
| `GET /api/check?url=` | Lookup for banks, telecoms and apps |
| `GET /go?url=` | Safe-link gateway: opens the site or the warning page |
| `GET /blocked?url=` | Warning page |

## Security notes

- The secret key stays on the server. The browser only gets the publishable key and logs in.
- Row level security is on for every table with no public policies.
- The fetcher refuses private and internal IP addresses.
- Agents only read pages; they never submit forms.
- The registry domains are marked `verified = false` until confirmed with each entity.
- The warning page uses a generic shield, not the official police crest (needs permission).
