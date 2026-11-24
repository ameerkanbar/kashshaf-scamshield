-- Kashshaf: e& runs its UAE consumer site on eand.ae (smiles, mobile plans, bill payment).
-- It was missing from the registry, so the real site was judged as an impostor.
insert into public.official_domains(domain, entity_id, verified, source)
values ('eand.ae', 'etisalat', false, 'false positive fix 2026-11-24')
on conflict (domain) do nothing;
