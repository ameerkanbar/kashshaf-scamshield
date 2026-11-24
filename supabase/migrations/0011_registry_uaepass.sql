-- Kashshaf: UAE PASS, the national digital identity, is a favourite target of phishing
-- ("your UAE PASS will be suspended, confirm with your Emirates ID and OTP"). The judges name it explicitly.
insert into public.entities(id, name_en, name_ar, category, keywords, brand_tokens)
values ('uaepass', 'UAE PASS', 'الهوية الرقمية (UAE PASS)', 'government',
        array['uae pass', 'uaepass', 'الهوية الرقمية', 'يو اي اي باس']::text[],
        array['uaepass', 'uae-pass']::text[])
on conflict (id) do nothing;

insert into public.official_domains(domain, entity_id, verified, source)
values ('uaepass.ae', 'uaepass', false, 'registry 2026-11-24')
on conflict (domain) do nothing;
