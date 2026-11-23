-- Kashshaf: remember searches and blocked dates, so nothing paid is repeated.

-- Every paid search (resident discovery or the agent's own research) and what it returned.
create table public.searches (
  id bigint generated always as identity primary key,
  query text not null,
  hl text not null default 'en',
  purpose text not null default 'discovery' check (purpose in ('discovery', 'agent')),
  maps boolean not null default false,
  results jsonb,
  new_links int not null default 0,
  known_links int not null default 0,
  known_blocked int not null default 0,
  searched_by text,
  searched_at timestamptz not null default now()
);
create index searches_lookup_idx on public.searches (purpose, lower(query), hl, searched_at desc);
alter table public.searches enable row level security;

-- When a domain was first blocked.
alter table public.domains add column blocked_at timestamptz;
update public.domains set blocked_at = updated_at
 where blocked_at is null and (override = 'block' or (override is null and verdict = 'fraud'));

-- Blocked domains with how often they were seen, for the "blocked" tab and exports.
create view public.blocked_list with (security_invoker = true) as
select d.domain, d.verdict, d.score, d.override, d.override_by, d.claimed_entity_id,
       e.name_ar as entity_ar, e.name_en as entity_en,
       d.first_seen, coalesce(d.blocked_at, d.updated_at) as blocked_at,
       (select count(*) from public.urls u where u.domain = d.domain) as links,
       (select count(*) from public.url_sightings s join public.urls u on u.id = s.url_id where u.domain = d.domain) as sightings,
       (select max(s.seen_at) from public.url_sightings s join public.urls u on u.id = s.url_id where u.domain = d.domain) as last_seen
from public.domains d
left join public.entities e on e.id = d.claimed_entity_id
where d.override = 'block' or (d.override is null and d.verdict = 'fraud');
