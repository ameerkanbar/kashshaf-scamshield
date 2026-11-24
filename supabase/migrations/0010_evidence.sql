-- Kashshaf: evidence for police use and takedown requests.
-- One row per capture of a link: a phone screenshot and the page's HTML (both kept in private storage,
-- each with a SHA-256 hash), the domain's registration data (RDAP / WHOIS, with the registrar's abuse
-- contact) and its hosting (IP addresses, network owner, abuse contact), all stamped with the capture time.

create table public.evidence (
  id bigint generated always as identity primary key,
  url_id bigint not null references public.urls(id) on delete cascade,
  domain text not null,
  captured_at timestamptz not null default now(),
  captured_by text not null,
  final_url text,
  page_title text,
  screenshot_path text,
  screenshot_sha256 text,
  html_path text,
  html_sha256 text,
  html_bytes int,
  whois jsonb,
  hosting jsonb,
  errors jsonb
);
create index on public.evidence(url_id, captured_at desc);
create index on public.evidence(domain, captured_at desc);

alter table public.evidence enable row level security;
revoke all on public.evidence from anon, authenticated;

-- Private bucket: screenshots and page copies are served only through the server, to logged-in analysts.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidence', 'evidence', false, 10485760, array['image/png', 'text/plain'])
on conflict (id) do nothing;
