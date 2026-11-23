-- Latest verdict for every URL, with its domain's block status and exposure.
create view public.findings with (security_invoker = true) as
select distinct on (v.url_id)
  v.id as verdict_id, v.url_id, u.url, u.domain, v.verdict, v.score, v.claimed_entity_id,
  e.name_en as entity_en, e.name_ar as entity_ar, v.reasons, v.ai, v.model, v.created_at,
  s.cloaked, s.similarity, s.domain_created, s.agent, s.phone_view->>'title' as title,
  d.override,
  (d.override = 'block' or (d.override is null and d.verdict = 'fraud')) as blocked,
  (select count(*) from public.url_sightings us where us.url_id = v.url_id) as sightings,
  (select array_agg(distinct us.source) from public.url_sightings us where us.url_id = v.url_id) as sources
from public.verdicts v
join public.urls u on u.id = v.url_id
left join public.scans s on s.id = v.scan_id
left join public.domains d on d.domain = u.domain
left join public.entities e on e.id = v.claimed_entity_id
order by v.url_id, v.created_at desc;

-- Indicators shared by more than one domain (gang links).
create view public.shared_indicators with (security_invoker = true) as
select f.kind, f.value, array_agg(distinct u.domain order by u.domain) as domains
from public.fingerprints f
join public.url_fingerprints uf on uf.fingerprint_id = f.id
join public.urls u on u.id = uf.url_id
group by f.id, f.kind, f.value
having count(distinct u.domain) > 1;
