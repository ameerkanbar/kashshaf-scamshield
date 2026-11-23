-- Kashshaf core schema (applied to Supabase project bkmwzkhkyhescyspeuxm on 2026-11-23).

-- Official registry
create table public.entities (
  id text primary key,
  name_en text not null,
  name_ar text not null,
  category text not null default 'government',
  keywords text[] not null default '{}',
  brand_tokens text[] not null default '{}',
  created_at timestamptz not null default now()
);
create table public.official_domains (
  domain text primary key,
  entity_id text not null references public.entities(id) on delete cascade,
  verified boolean not null default false,
  source text,
  created_at timestamptz not null default now()
);
create index on public.official_domains(entity_id);
create table public.official_phones (
  phone text primary key,
  entity_id text not null references public.entities(id) on delete cascade,
  verified boolean not null default false,
  source text
);

-- Discovery
create table public.personas (
  id bigint generated always as identity primary key,
  name text not null, language text not null, need text not null,
  queries text[] not null default '{}', active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.messages (
  id bigint generated always as identity primary key,
  text text not null, channel text not null default 'analyst', submitted_by uuid,
  created_at timestamptz not null default now()
);
create table public.urls (
  id bigint generated always as identity primary key,
  url text not null unique, domain text not null,
  status text not null default 'queued' check (status in ('queued','checking','done','error')),
  priority int not null default 0, attempts int not null default 0,
  claimed_by text, claimed_at timestamptz,
  first_seen timestamptz not null default now(), last_checked timestamptz
);
create index urls_queue_idx on public.urls(status, priority desc, first_seen);
create index on public.urls(domain);
create table public.url_sightings (
  id bigint generated always as identity primary key,
  url_id bigint not null references public.urls(id) on delete cascade,
  source text not null check (source in ('message','serp_organic','serp_ad','serp_ai_overview','maps',
                                         'ct_log','phish_feed','analyst','gateway','seed')),
  query text, persona_id bigint references public.personas(id) on delete set null,
  message_id bigint references public.messages(id) on delete set null,
  position int, phone text, raw jsonb, seen_at timestamptz not null default now()
);
create index on public.url_sightings(url_id);

-- Analysis
create table public.scans (
  id bigint generated always as identity primary key,
  url_id bigint not null references public.urls(id) on delete cascade,
  agent text not null, started_at timestamptz not null default now(), finished_at timestamptz,
  phone_view jsonb, bot_view jsonb, similarity real, cloaked boolean not null default false,
  domain_created date, error text
);
create index on public.scans(url_id);
create table public.verdicts (
  id bigint generated always as identity primary key,
  url_id bigint not null references public.urls(id) on delete cascade,
  scan_id bigint references public.scans(id) on delete set null,
  verdict text not null check (verdict in ('fraud','suspicious','safe','official','unreachable')),
  score int not null check (score between 0 and 100),
  claimed_entity_id text references public.entities(id) on delete set null,
  reasons jsonb not null default '[]', ai jsonb, model text,
  created_at timestamptz not null default now()
);
create index on public.verdicts(url_id, created_at desc);
create table public.fingerprints (
  id bigint generated always as identity primary key,
  kind text not null, value text not null, unique (kind, value)
);
create table public.url_fingerprints (
  url_id bigint not null references public.urls(id) on delete cascade,
  fingerprint_id bigint not null references public.fingerprints(id) on delete cascade,
  primary key (url_id, fingerprint_id)
);
create index on public.url_fingerprints(fingerprint_id);

-- Blocking
create table public.domains (
  domain text primary key,
  verdict text not null check (verdict in ('fraud','suspicious','safe','official','unreachable')),
  score int not null default 0,
  claimed_entity_id text references public.entities(id) on delete set null,
  override text check (override in ('block','allow')), override_by text, override_note text,
  first_seen timestamptz not null default now(), updated_at timestamptz not null default now()
);
create view public.blocklist with (security_invoker = true) as
  select d.domain, d.verdict, d.score, d.claimed_entity_id, d.updated_at
  from public.domains d
  where d.override = 'block' or (d.override is null and d.verdict = 'fraud');
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor text not null, action text not null, target text, details jsonb,
  at timestamptz not null default now()
);

-- Work queue: agents claim URLs atomically (safe across many machines).
create or replace function public.claim_url(agent_name text, stale_after interval default interval '5 minutes')
returns setof public.urls language sql security invoker set search_path = '' as $$
  update public.urls u
     set status = 'checking', claimed_by = agent_name, claimed_at = now(), attempts = u.attempts + 1
   where u.id = (
     select id from public.urls
      where status = 'queued'
         or (status = 'checking' and claimed_at < now() - stale_after and attempts < 3)
      order by priority desc, first_seen
      limit 1
      for update skip locked)
  returning u.*;
$$;

-- Only the server (secret key) touches these tables.
alter table public.entities enable row level security;
alter table public.official_domains enable row level security;
alter table public.official_phones enable row level security;
alter table public.personas enable row level security;
alter table public.messages enable row level security;
alter table public.urls enable row level security;
alter table public.url_sightings enable row level security;
alter table public.scans enable row level security;
alter table public.verdicts enable row level security;
alter table public.fingerprints enable row level security;
alter table public.url_fingerprints enable row level security;
alter table public.domains enable row level security;
alter table public.audit_log enable row level security;
revoke execute on function public.claim_url(text, interval) from public, anon, authenticated;
grant execute on function public.claim_url(text, interval) to service_role;
