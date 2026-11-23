# Kashshaf (كشّاف)

A fraud-link radar for Abu Dhabi Police. A pool of agents (50 by default) takes
links from Google results, ads, AI Overviews, Maps, certificate logs, phishing
feeds and pasted messages. Each link is opened as a UAE phone and as a scanner,
checked against the official registry, and investigated by a Claude agent with
real tools. Fraud domains are blocked, and anyone who opens one sees an Abu
Dhabi Police warning page.

## Architecture

| Part | What it does | Code |
|---|---|---|
| Database | Supabase Postgres: registry, queue, scans, verdicts, fingerprints, blocklist, audit log | `supabase/migrations/` |
| Discovery | SerpAPI (Google, ads, AI Overviews, Maps), crt.sh, OpenPhish | `kashshaf/discovery.py` |
| Agent pool | N workers claim URLs with `claim_url()` (`FOR UPDATE SKIP LOCKED`), safe across machines | `kashshaf/workers.py` |
| Rules | Two-view fetch, cloaking, registry match, payment/OTP asks, Telegram exfil, domain age | `kashshaf/rules.py` |
| Claude agent | Tools: `fetch_page`, `lookup_official_entity`, `domain_registration`, `web_search`, `submit_verdict` | `kashshaf/agent.py` |
| Server | Analyst dashboard (Supabase login), API, safe-link gateway, warning page | `server.py`, `web/` |
| Extension | Redirects blocked domains to the warning page | `extension/` |

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

## Settings (.env)

| Setting | Default | Meaning |
|---|---|---|
| `AGENT_COUNT` | 50 | Agents at start; change live from the dashboard |
| `AGENT_MODEL` | `claude-opus-5-5` | Model for the investigation agent |
| `AGENT_BASE_URL` | empty | Empty = Anthropic API directly. Set only for an Anthropic-compatible gateway |
| `AGENT_MIN_RULE_SCORE` | 1 | Run Claude only when rules find at least this score (0 = all non-official links) |
| `DISCOVERY_INTERVAL_MIN` | 0 | Minutes between automatic discovery rounds (0 = manual) |
| `SERP_MAX_PER_HOUR` | 20 | Google searches per hour (patrol, discovery and the agent's own searches). Past it, search pauses |
| `AI_MAX_PER_HOUR` | 60 | Claude investigations per hour. Past it, links are judged by the rules only |
| `PATROL_INTERVAL_SEC` | 90 | Seconds between patrol rounds in the operations room |
| `SEARCH_COOLDOWN_HOURS` | 24 | The same resident search is not run (or paid for) again within this window |
| `AGENT_SEARCH_CACHE_HOURS` | 168 | The agent's own searches are answered from the database for a week |
| `RECHECK_AFTER_HOURS` | 24 | A pasted link checked within this window is answered from the database |
| `ALLOW_LOCAL_TEST_SITES` | true | Allow `*.localhost` test pages. Set to false in production |

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
