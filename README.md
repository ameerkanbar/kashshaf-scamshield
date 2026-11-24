# Kashshaf (كشّاف)

**ScamShield AI hackathon (42 Abu Dhabi × Abu Dhabi Police), team Return 0:** Mohammad Amir Knbar, Ahmad Abulaban, Anas Alhawamdeh.

A fraud-link radar for Abu Dhabi Police. It finds scam links in Google results, ads, AI Overviews and
Google Maps before people reach them, checks every one with a Claude agent against the official registry,
blocks fraud and suspicious links until an analyst decides, and prepares the evidence for a takedown request.

## The problem

Scammers in the UAE copy Abu Dhabi Police, TAMM, UAE PASS, banks and telecoms: fake traffic-fine pages, fake
refunds, fake parcel fees, fake customer-service numbers on Google Maps. Most tools wait for a person to paste
a link they already doubt. By then the person may have entered their card or OTP. Scam sites also hide from
scanners (they show a harmless page to bots and the scam to phones) and live only a few days.

## Our solution

Kashshaf searches like an Abu Dhabi resident on a phone, so it sees what residents see, and hunts the links
itself:

1. **Discover.** Resident searches on Google and Google Maps (via SerpAPI), new certificates for look-alike
   domains (crt.sh), phishing feeds (OpenPhish), pasted messages, imported files and verified victim reports.
2. **Check.** Each link is opened twice, as a UAE phone and as a scanner, to catch cloaking. Rules look for card,
   OTP and Emirates ID forms, Telegram exfiltration and young domains. A Claude agent then investigates with
   tools: it reads the page, looks at a screenshot next to the official site of the body it claims to be, looks
   up the domain's registration and searches the web.
3. **Decide.** A risk score with its reasons in Arabic and English. Fraud is blocked. Suspicious is blocked too,
   until an analyst decides: safe, official (added to the registry) or fraud.
4. **Act.** Anyone who opens a blocked link sees a police warning page and can file a verified report with UAE
   PASS (simulated). The analyst downloads an evidence pack (screenshot, page copy, WHOIS/RDAP, hosting and abuse
   contacts, SHA-256 hashes, a draft takedown request). Shared fingerprints link domains into gangs.

## Technical choices, tools, APIs and data

| Choice | Why |
|---|---|
| Python standard library server, no framework | Few moving parts for a 24-hour build; one dependency (`anthropic`) |
| Supabase (Postgres, Auth, Storage) | Shared database for many agents and machines (`FOR UPDATE SKIP LOCKED` queue), row level security, private evidence bucket |
| Claude (`claude-opus-5-5`) with tool use and vision | Reads Arabic and English pages, sees text drawn in images, compares a page with the official site, explains its verdict |
| Rules before and beside the AI | Cheap, explainable signals; the rules alone never say "fraud" without a harmful signal, which keeps false positives on real banks and government sites low |
| Human review for suspicious links | Blocks early without letting an uncertain verdict reach the public as final |
| Headless Chrome | Screenshots as an iPhone sees them, for the agent and for the evidence |

**APIs and data sources:** Anthropic Messages API, SerpAPI (Google, Google Maps), crt.sh, OpenPhish community
feed, RDAP and WHOIS, Team Cymru IP-to-ASN, Supabase. The official registry (bodies, domains, phone numbers) is
in `supabase/migrations/0003_seed_registry.sql` and `0013_official_phones.sql`, read from each body's own site.
`test_sites/` serves local, clearly labelled TEST scam pages for the demo; no real scam is hosted.

## Architecture

| Part | What it does | Code |
|---|---|---|
| Database | Supabase Postgres: registry, queue, scans, verdicts, fingerprints, blocklist, audit log | `supabase/migrations/` |
| Discovery | SerpAPI (Google, ads, AI Overviews, Maps), crt.sh, OpenPhish | `kashshaf/discovery.py` |
| Agent pool | N workers claim URLs with `claim_url()` (`FOR UPDATE SKIP LOCKED`), safe across machines | `kashshaf/workers.py` |
| Agent company | The agents work as a company: a chief, and 7 departments (discovery, intake, web two-view, content, fingerprints, domain, AI), each with a leader and members. A case moves department to department and waits when a department is full; the chief gives the verdict. Minimum 15 agents | `kashshaf/org.py` |
| Rules | Two-view fetch, cloaking, registry match, payment/OTP asks, Telegram exfil, domain age | `kashshaf/rules.py` |
| Claude agent | Tools: `fetch_page`, `view_page` (screenshot of the page beside the official site, so it reads text hidden in images and rates the visual similarity), `lookup_official_entity`, `domain_registration`, `web_search`, `submit_verdict`. When the AI service is busy, the rules give a provisional verdict and the link is checked again after 5, 15 and 30 minutes | `kashshaf/agent.py` |
| Server | Analyst dashboard (Supabase login, Arabic/English), API, safe-link gateway, warning page | `server.py`, `web/` |
| Dashboard | Arabic/English, responsive, menu on the right. Home is the operations room: live radar, discover → check → verdict → block pipeline, live feed, charts. Pages: agent company and its live office view, analytics, check a message or link (with file import, History and New session), results, review queue, blocked sites, gangs, official registry, discovery, agents, audit log, settings. Loading shows shimmer skeletons; tables never scroll sideways (long text is shortened, rows become cards on narrow screens) | `web/index.html`, `web/assets/app.js`, `web/assets/i18n.js`, `web/assets/app.css` |
| Settings and keys | Live status of every connected service (Supabase, Claude, SerpAPI, crt.sh, OpenPhish, RDAP, other machines on the same database) with a test button each; «إدارة المفاتيح» edits every key and setting in `.env` with free connection tests; a first-run setup page when no keys exist | `kashshaf/health.py`, `kashshaf/envfile.py`, `web/assets/keys.js`, `web/setup.html` |
| Official registry | The official bodies, their domains and their official phone numbers, each with the page on the body's own site it was read on | `kashshaf/phones.py`, `supabase/migrations/0013_official_phones.sql` |
| Fake support lines | Google Maps places named like an official body with a number that is not theirs | `kashshaf/phones.py` |
| Extension | Redirects blocked domains to the warning page | `extension/` |
| Evidence | Screenshot, page copy, WHOIS/RDAP, hosting, SHA-256 hashes; evidence pack and takedown draft | `kashshaf/evidence.py` |
| HQ game | `/hq`: a walkable 2D headquarters in Abu Dhabi Police colours. Each room is one dashboard tab (press Space at the officer); the detention cells hold the blocked sites, grouped by the kind of body they impersonate | `web/hq.html`, `web/assets/hq/` |

## Setup

**Quickest way: from the browser.** Run `python server.py` with no `.env`: instead of stopping, Kashshaf opens a
setup page at http://localhost:8080 (only on the computer running it). Paste your Supabase project URL and keys
(and, optionally, Claude and SerpAPI), press «اختبار الاتصال», then save: the keys go into `.env` and the server
restarts itself into the dashboard. A new Supabase project first needs the tables: in its SQL Editor, run the
files in `supabase/migrations` in order. Later, **Settings → إدارة المفاتيح** edits every key and setting the same
way (secrets are never shown back, an empty box keeps the current key, each service has a free connection test).
`KASHSHAF_ENV_FILE` points a server at another settings file (e.g. a second instance).

Or by hand:

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

## UAE PASS (the UAE digital identity)

- **Analysts log in with UAE PASS.** Only a fully verified identity (SOP3) whose email is a police address
  (`ANALYST_EMAIL_DOMAINS`, default `adpolice.gov.ae`) or listed in `ANALYST_EMAILS` gets in. Every decision is
  then recorded under that officer's verified identity. Email and password stay as a fallback.
- **Victims report with UAE PASS.** The warning page offers a verified report: after UAE PASS (SOP2 or SOP3) the
  person says what they entered or paid and how the link reached them. The report reaches the analyst with the
  link and its evidence, and the link is checked again at once. Only what a case needs is kept; phone and email
  only with the person's consent; the Emirates ID number is masked on screen.
- **Simulation now, the real thing later.** Kashshaf follows the real UAE PASS OpenID Connect flow
  (authorize, code, token, userinfo; the same verification levels and identity fields). Until the police have
  client credentials, a built-in simulation with fictional identities stands in for UAE PASS at `/mock-uaepass`.
  Set `UAEPASS_BASE_URL`, `UAEPASS_CLIENT_ID` and `UAEPASS_CLIENT_SECRET` to switch to UAE PASS staging or
  production, with no code change.

## Fake customer-service numbers on Google Maps

Every Maps place a search shows is checked, website or not. If its name presents it as an official body
(the same whole-word matching the rules use; a short name must name the body with a phrase of two words or
more, or next to a service word such as "customer service" or «خدمة العملاء») and its number is not one of
that body's official numbers, it is a fake support line: kept in `fake_phones` and listed at the top of the
Results page. When the place has a website, the link is checked first and the fake number is one more
reason in its verdict (it is never simply "safe"), and the evidence pack shows the Maps source and the number.

The official numbers (`supabase/migrations/0013_official_phones.sql`) were read on each body's own website,
with the page in `source`. Numbers are compared normalised (`kashshaf/phones.py`: +971, 00971 and the leading
0 removed, spaces and dashes ignored). A body with no number on record (Aramex publishes none) is never flagged.

## Importing a file of links

On the «فحص رسالة أو رابط» page, drop a CSV, Excel (.xlsx), TXT or JSON file (up to 5000 links).
The link column is found automatically, defanged links (`hxxp`, `[.]`) are restored, and every link gets
the full check. If the file has a label column (`label`, `class`, `is_phishing`... with values such as
phishing / legitimate, 1 / 0, احتيال / سليم), the page shows precision, recall, F1 and accuracy, where
"flagged" means blocked for the public (fraud, or suspicious pending review). Results export to CSV.
For a large evaluation set, raise `AI_MAX_PER_HOUR` so every link gets the Claude investigation.

- **Agents off? The file still runs.** If the agents are stopped when a file comes in, they are started for it
  and stopped again once every link is checked. Pressing start or stop meanwhile overrides this; if they were
  already on, an import never touches them.
- **Dead, IP and decoy@ links.** Most links in public phishing lists are dead by the time they are checked. A
  link that does not open is judged from the link and its domain name alone: imitation of an official body or
  of a widely phished brand (PayPal, Apple, Microsoft, DHL...) on a domain that is not theirs, a bare IP
  address, a fake host before `@`, punycode, lure words and throwaway endings. With such a name it is
  suspicious and blocked until reviewed (never "fraud" without seeing the page); a dead ordinary link stays
  "unreachable". Bare-IP links and `decoy@host` links are read from the file and opened at the real host.
- **New session and History.** When a file is fully checked, «جلسة جديدة» clears the screen for the next one.
  «السجل» lists every file ever uploaded; «عرض» brings any of them back with all its results. Nothing is deleted.

## Running it locally without paid services

`kashshaf-run/` holds a local Supabase emulator (PostgREST, auth, storage and the views, in memory), the
end-to-end tests and a demo. Nothing there calls Claude or SerpAPI.

```bash
python kashshaf-run/supabase_emulator.py .          # Supabase on http://localhost:54321 (test login in kashshaf-run/emulator_users.json, made on first run)
python test_sites/server.py                         # local TEST scam pages on :8081
KASHSHAF_ENV_FILE=kashshaf-run/local.env python server.py --port 8095 --agents 15
python kashshaf-run/test_merge.py                   # end to end: verdicts, review, evidence, import, settings
KASHSHAF_ENV_FILE=kashshaf-run/local.env python kashshaf-run/test_fake_phones.py
python kashshaf-run/test_import_auto.py             # import with agents off, dead / IP / @ links
```

`kashshaf-run/local.env.example` has the emulator's settings: copy it to `kashshaf-run/local.env`.

## Other material

- `report/`: the analysis of the project (PDF and HTML).

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
| `CHROME_PATH` | auto | Chrome, Chromium or Edge used for screenshots; found automatically on macOS, Linux and Windows |
| `KASHSHAF_ENV_FILE` | `.env` | Read the settings from another file (a second instance on the same machine, a deployment) |
| `UAEPASS_BASE_URL` | empty | Empty = the built-in simulation. UAE PASS staging: `https://stg-id.uaepass.ae/idshub` |
| `UAEPASS_CLIENT_ID`, `UAEPASS_CLIENT_SECRET` | simulation values | The client credentials UAE PASS issues to the police |
| `ANALYST_EMAIL_DOMAINS` | adpolice.gov.ae | Email domains allowed to log in as analysts with UAE PASS |
| `ANALYST_EMAILS` | empty | Extra addresses allowed to log in as analysts |
| `PUBLIC_URL` | empty | The address people use to reach Kashshaf; pins the UAE PASS return address on a real deployment |

## Public endpoints (no login)

| Path | Use |
|---|---|
| `GET /api/blocklist` | Feed for the extension, DNS or ISP blocking |
| `GET /api/check?url=` | Lookup for banks, telecoms and apps |
| `GET /go?url=` | Safe-link gateway: opens the site or the warning page |
| `GET /blocked?url=` | Warning page |
| `GET /auth/uaepass/start` | Analyst login with UAE PASS |
| `GET /report/start?url=` | A victim's verified report, starting with UAE PASS |

## Security notes

- The secret key stays on the server. The browser only gets the publishable key and logs in.
- Row level security is on for every table with no public policies.
- The fetcher refuses private and internal IP addresses.
- Agents only read pages; they never submit forms.
- The registry domains are marked `verified = false` until confirmed with each entity.
- The warning page uses a generic shield, not the official police crest (needs permission).
- Secret keys entered in Settings are written to `.env` on the server and never sent back to the browser; the
  first-run setup page answers only on the computer running Kashshaf (loopback, Host and Origin checked).

## Trade-offs, what we left out, what we would do differently

- **UAE PASS is a simulation.** We have no client credentials, so a built-in, clearly labelled simulation with
  fictional identities stands in for it. The flow is the real OpenID Connect one; switching is three settings.
- **Cloaking is detected by device only.** The phone view differs from the scanner view by user agent. In
  production the phone view should leave through a UAE mobile IP, since some scams check the IP too.
- **Redirects.** The internal-address check runs on the first host only, not on every redirect hop, and
  JavaScript redirects are not followed. Both need fixing before facing the open internet.
- **WHOIS for `.ae`.** The `.ae` registry limits automated WHOIS, so registration data for `.ae` domains is often
  missing.
- **Cost and limits.** Every Claude investigation and every Google search costs money, so both have hourly caps
  (`AI_MAX_PER_HOUR`, `SERP_MAX_PER_HOUR`); past the cap the rules judge alone and lean towards "suspicious".
- **Registry not confirmed.** Official domains and numbers are marked unverified until each body confirms them.
- **Left out:** automatic takedown submission (we draft the request, a person sends it), social media and SMS
  sources, signing evidence with UAE PASS, TAMM integration.
- **Differently:** start from a labelled evaluation set on day one to tune precision and recall, and keep one
  shared test database per developer instead of one shared project.

