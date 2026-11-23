-- Kashshaf: sort by danger.

-- 1. findings gets a severity rank, so "most dangerous first" puts fraud before suspicious before the rest
--    (then by score). Same columns as before, severity added at the end.
create or replace view public.findings with (security_invoker = true) as
select distinct on (v.url_id)
  v.id as verdict_id, v.url_id, u.url, u.domain, v.verdict, v.score, v.claimed_entity_id,
  e.name_en as entity_en, e.name_ar as entity_ar, v.reasons, v.ai, v.model, v.created_at,
  s.cloaked, s.similarity, s.domain_created, s.agent, s.phone_view->>'title' as title,
  d.override,
  (d.override = 'block' or (d.override is null and d.verdict = 'fraud')) as blocked,
  (select count(*) from public.url_sightings us where us.url_id = v.url_id) as sightings,
  (select array_agg(distinct us.source) from public.url_sightings us where us.url_id = v.url_id) as sources,
  case v.verdict when 'fraud' then 4 when 'suspicious' then 3 when 'unreachable' then 1 when 'safe' then 0 else -1 end
    as severity
from public.verdicts v
join public.urls u on u.id = v.url_id
left join public.scans s on s.id = v.scan_id
left join public.domains d on d.domain = u.domain
left join public.entities e on e.id = v.claimed_entity_id
order by v.url_id, v.created_at desc;

-- 2. For each search phrase: links it surfaced that are blocked now, and (not blocked, not allowed) suspicious ones.
create or replace view public.search_hits with (security_invoker = true) as
select lower(s.query) as query,
       count(distinct s.url_id) as links,
       count(distinct s.url_id) filter (where b.domain is not null) as blocked_links,
       count(distinct s.url_id) filter (where b.domain is null and d.verdict = 'suspicious' and d.override is null)
         as suspicious_links
from public.url_sightings s
join public.urls u on u.id = s.url_id
left join public.blocklist b on b.domain = u.domain
left join public.domains d on d.domain = u.domain
where s.query is not null
group by lower(s.query);
