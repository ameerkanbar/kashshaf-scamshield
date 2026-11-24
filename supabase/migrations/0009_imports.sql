-- Kashshaf: import a file of links (CSV, Excel, TXT, JSON), e.g. an evaluation set from the organisers.
-- Each link goes through the normal full check. When the file says which links are fraud and which are
-- legitimate, the expected label is kept so the dashboard can show precision and recall.

alter table public.url_sightings drop constraint url_sightings_source_check;
alter table public.url_sightings add constraint url_sightings_source_check
  check (source in ('message','serp_organic','serp_ad','serp_ai_overview','maps',
                    'ct_log','phish_feed','analyst','gateway','seed','import'));

create table public.imports (
  id bigint generated always as identity primary key,
  file_name text not null,
  imported_by text not null,
  total int not null default 0,
  labelled int not null default 0,
  skipped int not null default 0,
  at timestamptz not null default now()
);

create table public.import_items (
  import_id bigint not null references public.imports(id) on delete cascade,
  url_id bigint not null references public.urls(id) on delete cascade,
  line int not null,
  expected text check (expected in ('fraud','legit')),
  primary key (import_id, url_id)
);

alter table public.imports enable row level security;
alter table public.import_items enable row level security;
revoke all on public.imports, public.import_items from anon, authenticated;
