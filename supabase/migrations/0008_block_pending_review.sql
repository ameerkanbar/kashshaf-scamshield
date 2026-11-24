-- Kashshaf: a suspicious site is blocked at once and waits for an analyst.
-- The analyst then decides: safe (unblock), official (add to the registry) or fraud (keep blocked).
-- Shared platforms (youtube.com, facebook.com...) are never blocked as a whole: a bad post there goes to the platform.

alter table public.domains add column if not exists platform boolean not null default false;
update public.domains set platform = true
 where domain ~ '(^|\.)(facebook\.com|x\.com|twitter\.com|instagram\.com|youtube\.com|tiktok\.com|linkedin\.com|google\.com|reddit\.com|medium\.com|t\.me|wa\.me|whatsapp\.com|snapchat\.com|pinterest\.com)$';

-- Suspicious sites already in the database become blocked now, pending review.
update public.domains set blocked_at = coalesce(blocked_at, updated_at)
 where override is null and not platform and verdict = 'suspicious';

create or replace view public.blocklist with (security_invoker = true) as
  select d.domain, d.verdict, d.score, d.claimed_entity_id, d.updated_at
  from public.domains d
  where d.override = 'block' or (d.override is null and not d.platform and d.verdict in ('fraud','suspicious'));

-- Waiting for an analyst: blocked because suspicious, no human decision yet.
create or replace view public.review_queue with (security_invoker = true) as
  select d.domain, d.score, d.claimed_entity_id, coalesce(d.blocked_at, d.updated_at) as blocked_at
  from public.domains d
  where d.override is null and not d.platform and d.verdict = 'suspicious';

create or replace view public.blocked_list with (security_invoker = true) as
select d.domain, d.verdict, d.score, d.override, d.override_by, d.claimed_entity_id,
       e.name_ar as entity_ar, e.name_en as entity_en,
       d.first_seen, coalesce(d.blocked_at, d.updated_at) as blocked_at,
       (select count(*) from public.urls u where u.domain = d.domain) as links,
       (select count(*) from public.url_sightings s join public.urls u on u.id = s.url_id where u.domain = d.domain) as sightings,
       (select max(s.seen_at) from public.url_sightings s join public.urls u on u.id = s.url_id where u.domain = d.domain) as last_seen,
       (d.override is null and d.verdict = 'suspicious') as pending_review
from public.domains d
left join public.entities e on e.id = d.claimed_entity_id
where d.override = 'block' or (d.override is null and not d.platform and d.verdict in ('fraud','suspicious'));

create or replace view public.findings with (security_invoker = true) as
select distinct on (v.url_id)
  v.id as verdict_id, v.url_id, u.url, u.domain, v.verdict, v.score, v.claimed_entity_id,
  e.name_en as entity_en, e.name_ar as entity_ar, v.reasons, v.ai, v.model, v.created_at,
  s.cloaked, s.similarity, s.domain_created, s.agent, s.phone_view->>'title' as title,
  d.override,
  (d.override = 'block' or (d.override is null and not d.platform and d.verdict in ('fraud','suspicious'))) as blocked,
  (select count(*) from public.url_sightings us where us.url_id = v.url_id) as sightings,
  (select array_agg(distinct us.source) from public.url_sightings us where us.url_id = v.url_id) as sources,
  case v.verdict when 'fraud' then 4 when 'suspicious' then 3 when 'unreachable' then 1 when 'safe' then 0 else -1 end
    as severity,
  (d.override is null and not d.platform and d.verdict = 'suspicious') as pending_review
from public.verdicts v
join public.urls u on u.id = v.url_id
left join public.scans s on s.id = v.scan_id
left join public.domains d on d.domain = u.domain
left join public.entities e on e.id = v.claimed_entity_id
order by v.url_id, v.created_at desc;

-- Search log: links it surfaced that are confirmed blocked, and ones blocked pending review.
create or replace view public.search_hits with (security_invoker = true) as
select lower(s.query) as query,
       count(distinct s.url_id) as links,
       count(distinct s.url_id) filter (where d.override = 'block' or (d.override is null and d.verdict = 'fraud'))
         as blocked_links,
       count(distinct s.url_id) filter (where d.override is null and not d.platform and d.verdict = 'suspicious')
         as suspicious_links
from public.url_sightings s
join public.urls u on u.id = s.url_id
left join public.domains d on d.domain = u.domain
where s.query is not null
group by lower(s.query);
