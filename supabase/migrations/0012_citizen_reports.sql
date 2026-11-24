-- Kashshaf: verified reports from victims. A person who reaches the warning page can report the site to
-- Abu Dhabi Police after signing in with UAE PASS, so every report comes from a verified identity
-- (a complainant the police can open a case for), linked to the link and its evidence.
-- Only what a case needs is kept, and contact details only when the person agreed to be contacted.

alter table public.url_sightings drop constraint url_sightings_source_check;
alter table public.url_sightings add constraint url_sightings_source_check
  check (source in ('message','serp_organic','serp_ad','serp_ai_overview','maps',
                    'ct_log','phish_feed','analyst','gateway','seed','import','citizen_report'));

create table public.citizen_reports (
  id bigint generated always as identity primary key,
  url_id bigint references public.urls(id) on delete set null,
  url text not null,
  domain text not null,
  reporter_uuid text not null,
  reporter_name_ar text,
  reporter_name_en text,
  reporter_idn text,
  reporter_level text not null check (reporter_level in ('SOP2','SOP3')),
  reporter_mobile text,
  reporter_email text,
  what_happened text[] not null default '{}',
  amount_aed numeric(12,2),
  channel text,
  notes text,
  contact_ok boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.citizen_reports(domain, created_at desc);
create index on public.citizen_reports(url_id);

alter table public.citizen_reports enable row level security;
revoke all on public.citizen_reports from anon, authenticated;
