-- Kashshaf: a link whose agent stopped mid-check three times is marked "error" instead of staying "checking" forever.
-- (Before this, such a link was never claimed again and showed as waiting for good.)
create or replace function public.claim_url(agent_name text, stale_after interval default interval '5 minutes')
returns setof public.urls language sql security invoker set search_path = '' as $$
  update public.urls set status = 'error', claimed_by = null
   where status = 'checking' and claimed_at < now() - stale_after and attempts >= 3;
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
revoke execute on function public.claim_url(text, interval) from public, anon, authenticated;
grant execute on function public.claim_url(text, interval) to service_role;
