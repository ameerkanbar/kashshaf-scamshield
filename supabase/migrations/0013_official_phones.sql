-- Kashshaf: official customer-service numbers, and fake ones found on Google Maps.
-- Scam pages on Maps often look like a real body's "customer service" with a fake number. A Maps place whose
-- name presents it as an official body, with a number that is not one of that body's, is a fake support line.
--
-- Every number below was read on the body's OWN website (the page is in `source`, November 2026); none is
-- from memory or a directory. Numbers are stored normalised (digits only, no +971 / 00971 / leading 0),
-- the same way kashshaf/phones.py normalises what Maps shows, so "+971 2 446 1461" = "02-4461461" = 24461461.
-- Aramex publishes no phone number on its site (chat only), so it has none here and is never flagged.

-- One number can belong to more than one body (800555 is the Abu Dhabi Government Contact Centre, used by
-- TAMM and by the Integrated Transport Centre), so the key is (phone, entity).
alter table public.official_phones drop constraint official_phones_pkey;
alter table public.official_phones add primary key (phone, entity_id);
alter table public.official_phones add column if not exists label text;

insert into public.official_phones(phone, entity_id, label, verified, source) values
  -- Abu Dhabi Police
  ('8003333',   'adpolice', 'Abu Dhabi Police Call Center', true, 'https://www.adpolice.gov.ae/en/ContactUs'),
  ('24461461',  'adpolice', 'Abu Dhabi Police Operator', true, 'https://www.adpolice.gov.ae/en/ContactUs'),
  ('999',       'adpolice', 'Emergency', true, 'https://www.adpolice.gov.ae/en/ContactUs'),
  ('8002626',   'adpolice', 'Aman service', true, 'https://www.adpolice.gov.ae/en/ContactUs'),
  ('8008999',   'adpolice', 'E-recruitment', true, 'https://www.adpolice.gov.ae/en/ContactUs'),
  ('8005354',   'adpolice', 'Social support centers', true, 'https://www.adpolice.gov.ae/en/ContactUs'),
  -- Ministry of Interior
  ('8005000',   'moi', 'Toll free', true, 'https://moi.gov.ae/en/contact-us'),
  ('47771777',  'moi', 'Contact us', true, 'https://moi.gov.ae/en/contact-us'),
  ('171',       'moi', 'Contact us', true, 'https://moi.gov.ae/en/contact-us'),
  -- TAMM / Abu Dhabi Government Contact Centre
  ('800555',    'tamm', 'Abu Dhabi Contact Center', true, 'https://www.tamm.abudhabi/en/contact-us'),
  -- UAE Government Portal
  ('171',       'uae_gov', 'Tawasul 171', true, 'https://u.ae/en'),
  -- ICP
  ('600522222', 'icp', 'Call Center (inside UAE; +971600522222 from abroad)', true, 'https://icp.gov.ae/en/contact-us'),
  ('24955555',  'icp', 'Phone (UAE Government directory)', true, 'https://u.ae/en'),
  -- Integrated Transport Centre (itc.gov.ae now redirects to Abu Dhabi Mobility)
  ('800555',    'itc', 'Abu Dhabi Mobility contact', true, 'https://itc.gov.ae/contact (redirects to admobility.gov.ae)'),
  -- Salik
  ('80072545',  'salik', '800 SALIK (72545)', true, 'https://www.salik.ae/en'),
  -- Ministry of Economy (from the UAE Government directory on u.ae; moec.gov.ae redirects to moet.gov.ae)
  ('8001222',   'moec', 'Customer Care', true, 'https://u.ae/en (UAE Government directory: Ministry of Economy)'),
  ('26131111',  'moec', 'Phone', true, 'https://u.ae/en (UAE Government directory: Ministry of Economy)'),
  -- Emirates Post
  ('600599999', 'emiratespost', 'Call us / WhatsApp', true, 'https://www.emiratespost.ae/contact-us'),
  ('42303000',  'emiratespost', 'Head Office', true, 'https://www.emiratespost.ae/contact-us'),
  -- e& (etisalat.ae redirects to eand.ae)
  ('8003327',   'etisalat', 'Rashid toll-free (800eFAQ)', true, 'https://www.eand.ae/en/c/support/index.html'),
  -- du
  ('155',       'du', 'Call us, in UAE', true, 'https://www.du.ae/support/du-contactus'),
  ('555678155', 'du', 'Call us, overseas (+971 55 5678155)', true, 'https://www.du.ae/support/du-contactus'),
  -- First Abu Dhabi Bank
  ('600525500', 'fab', 'FAB Service, UAE', true, 'https://www.bankfab.com/en-ae/contact-us'),
  ('26811511',  'fab', 'FAB Service, international', true, 'https://www.bankfab.com/en-ae/contact-us'),
  ('600560137', 'fab', 'National Housing Loan', true, 'https://www.bankfab.com/en-ae/contact-us'),
  ('600500201', 'fab', 'e-Dirham', true, 'https://www.bankfab.com/en-ae/contact-us'),
  ('600522298', 'fab', 'Ratibi', true, 'https://www.bankfab.com/en-ae/contact-us'),
  ('600543329', 'fab', 'Payit', true, 'https://www.bankfab.com/en-ae/contact-us'),
  ('24104888',  'fab', 'POS', true, 'https://www.bankfab.com/en-ae/contact-us'),
  ('8002200',   'fab', 'FAB Islamic', true, 'https://www.bankfab.com/en-ae/contact-us'),
  ('600522235', 'fab', 'Commercial Banking', true, 'https://www.bankfab.com/en-ae/contact-us'),
  ('80040000',  'fab', 'Elite and Private Banking', true, 'https://www.bankfab.com/en-ae/contact-us'),
  -- ADCB
  ('600502030', 'adcb', 'Call now', true, 'https://www.adcb.com/en/personal/'),
  -- Emirates NBD
  ('600540000', 'enbd', 'Call Center', true, 'https://www.emiratesnbd.com/en/contact-us'),
  -- ADDC
  ('8002332',   'addc', 'Call Centre', true, 'https://www.addc.ae'),
  -- Etihad Airways (its site lists WhatsApp support; the call numbers open in a dialog)
  ('566889003', 'etihad', 'WhatsApp support', true, 'https://www.etihad.com/en-ae/help'),
  -- UAE PASS
  ('600561111', 'uaepass', 'Call Us Now', true, 'https://uaepass.ae/')
on conflict (phone, entity_id) do nothing;

-- Fake support lines: a Maps place named like an official body, with a number that is not the body's.
-- Kept even when the place has no website, so the analyst sees it.
create table public.fake_phones (
  id bigint generated always as identity primary key,
  phone text not null,                 -- normalised
  phone_raw text,                      -- as Maps shows it
  entity_id text not null references public.entities(id) on delete cascade,
  place_name text not null,
  address text,
  query text,                          -- the search that showed it
  website text,
  url_id bigint references public.urls(id) on delete set null,
  sightings int not null default 1,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  unique (phone, entity_id, place_name)
);
create index on public.fake_phones(last_seen desc);

alter table public.fake_phones enable row level security;
revoke all on public.fake_phones from anon, authenticated;
