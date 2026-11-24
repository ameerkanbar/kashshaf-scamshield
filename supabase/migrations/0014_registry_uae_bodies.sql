-- Kashshaf: more UAE bodies in the official registry: federal and emirate authorities, police forces, utilities,
-- banks and airlines that scammers copy. Without them a real site such as rta.ae could be judged "suspicious".
-- Domains only: a phone number goes in official_phones only once it is read on the body's own site (see 0013),
-- so none of these bodies flags a Maps number as fake until its numbers are added.
-- verified = false until each body confirms, like the first registry (0003).
insert into public.entities(id, name_en, name_ar, category, keywords, brand_tokens) values
-- federal
('mohre', 'Ministry of Human Resources and Emiratisation', 'وزارة الموارد البشرية والتوطين', 'government', array['ministry of human resources','mohre','وزارة الموارد البشرية','work permit','تصريح عمل']::text[], array['mohre']::text[]),
('mofa', 'Ministry of Foreign Affairs', 'وزارة الخارجية', 'government', array['ministry of foreign affairs','وزارة الخارجية','document attestation','تصديق المستندات']::text[], array['mofa-uae','mofauae']::text[]),
('mohap', 'Ministry of Health and Prevention', 'وزارة الصحة ووقاية المجتمع', 'government', array['ministry of health','mohap','وزارة الصحة']::text[], array['mohap']::text[]),
('moe', 'Ministry of Education', 'وزارة التربية والتعليم', 'government', array['ministry of education','وزارة التربية والتعليم']::text[], array['moe-uae','moeuae']::text[]),
('fta', 'Federal Tax Authority', 'الهيئة الاتحادية للضرائب', 'government', array['federal tax authority','الهيئة الاتحادية للضرائب','vat refund','استرداد ضريبة القيمة المضافة']::text[], array['fta-uae','uae-fta','uaetax','tax-uae']::text[]),
('cbuae', 'Central Bank of the UAE', 'مصرف الإمارات العربية المتحدة المركزي', 'government', array['central bank of the uae','central bank uae','المصرف المركزي','مصرف الإمارات المركزي']::text[], array['centralbank','cbuae']::text[]),
('tdra', 'Telecommunications and Digital Government Regulatory Authority', 'هيئة تنظيم الاتصالات والحكومة الرقمية', 'government', array['tdra','هيئة تنظيم الاتصالات']::text[], array['tdra']::text[]),
-- Abu Dhabi
('abudhabi_gov', 'Abu Dhabi Government Portal', 'بوابة حكومة أبوظبي', 'government', array['abu dhabi government','حكومة أبوظبي']::text[], array['abudhabi-gov','abudhabigov']::text[]),
('doh', 'Department of Health Abu Dhabi', 'دائرة الصحة أبوظبي', 'government', array['department of health abu dhabi','دائرة الصحة']::text[], array['doh-ad','dohabudhabi']::text[]),
('dmt', 'Department of Municipalities and Transport', 'دائرة البلديات والنقل', 'government', array['department of municipalities and transport','دائرة البلديات والنقل','abu dhabi municipality','بلدية أبوظبي']::text[], array['dmt-abudhabi','dmt-ad']::text[]),
('adjd', 'Abu Dhabi Judicial Department', 'دائرة القضاء أبوظبي', 'government', array['abu dhabi judicial department','دائرة القضاء']::text[], array['adjd']::text[]),
('adek', 'Abu Dhabi Department of Education and Knowledge', 'دائرة التعليم والمعرفة', 'government', array['adek','دائرة التعليم والمعرفة']::text[], array['adek']::text[]),
('adcustoms', 'Abu Dhabi Customs', 'جمارك أبوظبي', 'government', array['abu dhabi customs','جمارك أبوظبي']::text[], array['adcustoms']::text[]),
-- Dubai and the other emirates
('rta', 'Roads and Transport Authority (Dubai)', 'هيئة الطرق والمواصلات', 'transport', array['roads and transport authority','هيئة الطرق والمواصلات','rta dubai','nol card','بطاقة نول']::text[], array['rta-dubai','rtadubai','dubai-rta']::text[]),
('dubaipolice', 'Dubai Police', 'شرطة دبي', 'government', array['dubai police','شرطة دبي']::text[], array['dubaipolice','dubai-police']::text[]),
('shjpolice', 'Sharjah Police', 'شرطة الشارقة', 'government', array['sharjah police','شرطة الشارقة']::text[], array['shjpolice','sharjahpolice']::text[]),
('dubai_gov', 'Dubai Government Portal', 'بوابة حكومة دبي', 'government', array['dubai government','حكومة دبي']::text[], array['dubai-gov','dubaigov']::text[]),
('gdrfad', 'General Directorate of Residency and Foreigners Affairs Dubai', 'الإدارة العامة للإقامة وشؤون الأجانب دبي', 'government', array['gdrfa','الإقامة وشؤون الأجانب']::text[], array['gdrfa']::text[]),
('dm', 'Dubai Municipality', 'بلدية دبي', 'government', array['dubai municipality','بلدية دبي']::text[], array['dubaimunicipality','dubai-municipality']::text[]),
('dubaicourts', 'Dubai Courts', 'محاكم دبي', 'government', array['dubai courts','محاكم دبي']::text[], array['dubaicourts']::text[]),
('dubaicustoms', 'Dubai Customs', 'جمارك دبي', 'government', array['dubai customs','جمارك دبي']::text[], array['dubaicustoms']::text[]),
-- utilities
('dewa', 'Dubai Electricity and Water Authority', 'هيئة كهرباء ومياه دبي', 'utility', array['dubai electricity and water','dewa','هيئة كهرباء ومياه دبي','ديوا']::text[], array['dewa']::text[]),
('sewa', 'Sharjah Electricity, Water and Gas Authority', 'هيئة كهرباء ومياه وغاز الشارقة', 'utility', array['sharjah electricity','sewa','هيئة كهرباء ومياه وغاز الشارقة']::text[], array['sewa-shj','sharjahsewa']::text[]),
('etihadwe', 'Etihad Water and Electricity', 'الاتحاد للماء والكهرباء', 'utility', array['etihad water and electricity','الاتحاد للماء والكهرباء']::text[], array['etihadwe']::text[]),
('adnoc', 'ADNOC', 'أدنوك', 'energy', array['adnoc','أدنوك']::text[], array['adnoc']::text[]),
-- banks
('adib', 'Abu Dhabi Islamic Bank', 'مصرف أبوظبي الإسلامي', 'bank', array['abu dhabi islamic bank','مصرف أبوظبي الإسلامي','adib']::text[], array['adib']::text[]),
('dib', 'Dubai Islamic Bank', 'بنك دبي الإسلامي', 'bank', array['dubai islamic bank','بنك دبي الإسلامي']::text[], array['dubaiislamic','dib-uae']::text[]),
('mashreq', 'Mashreq', 'بنك المشرق', 'bank', array['mashreq','بنك المشرق']::text[], array['mashreq']::text[]),
('rakbank', 'RAKBANK', 'بنك رأس الخيمة الوطني', 'bank', array['rakbank','بنك رأس الخيمة']::text[], array['rakbank']::text[]),
('cbd', 'Commercial Bank of Dubai', 'بنك دبي التجاري', 'bank', array['commercial bank of dubai','بنك دبي التجاري']::text[], array['cbd-uae','cbduae']::text[]),
-- airlines
('emirates', 'Emirates', 'طيران الإمارات', 'airline', array['emirates airline','طيران الإمارات']::text[], array['emirates-air','emiratesairline']::text[]),
('flydubai', 'flydubai', 'فلاي دبي', 'airline', array['flydubai','فلاي دبي']::text[], array['flydubai']::text[])
on conflict (id) do nothing;

insert into public.official_domains(domain, entity_id, verified, source) values
('mohre.gov.ae', 'mohre', false, 'registry 2026-11-25'),
('mofa.gov.ae', 'mofa', false, 'registry 2026-11-25'),
('mohap.gov.ae', 'mohap', false, 'registry 2026-11-25'),
('moe.gov.ae', 'moe', false, 'registry 2026-11-25'),
('tax.gov.ae', 'fta', false, 'registry 2026-11-25'),
('centralbank.ae', 'cbuae', false, 'registry 2026-11-25'),
('tdra.gov.ae', 'tdra', false, 'registry 2026-11-25'),
('abudhabi.ae', 'abudhabi_gov', false, 'registry 2026-11-25'),
('doh.gov.ae', 'doh', false, 'registry 2026-11-25'),
('dmt.gov.ae', 'dmt', false, 'registry 2026-11-25'),
('adjd.gov.ae', 'adjd', false, 'registry 2026-11-25'),
('adek.gov.ae', 'adek', false, 'registry 2026-11-25'),
('adcustoms.gov.ae', 'adcustoms', false, 'registry 2026-11-25'),
('rta.ae', 'rta', false, 'registry 2026-11-25'),
('dubaipolice.gov.ae', 'dubaipolice', false, 'registry 2026-11-25'),
('shjpolice.gov.ae', 'shjpolice', false, 'registry 2026-11-25'),
('dubai.ae', 'dubai_gov', false, 'registry 2026-11-25'),
('gdrfad.gov.ae', 'gdrfad', false, 'registry 2026-11-25'),
('dm.gov.ae', 'dm', false, 'registry 2026-11-25'),
('dc.gov.ae', 'dubaicourts', false, 'registry 2026-11-25'),
('dubaicustoms.gov.ae', 'dubaicustoms', false, 'registry 2026-11-25'),
('dewa.gov.ae', 'dewa', false, 'registry 2026-11-25'),
('sewa.gov.ae', 'sewa', false, 'registry 2026-11-25'),
('etihadwe.ae', 'etihadwe', false, 'registry 2026-11-25'),
('adnoc.ae', 'adnoc', false, 'registry 2026-11-25'),
('adib.ae', 'adib', false, 'registry 2026-11-25'),
('dib.ae', 'dib', false, 'registry 2026-11-25'),
('mashreq.com', 'mashreq', false, 'registry 2026-11-25'),
('rakbank.ae', 'rakbank', false, 'registry 2026-11-25'),
('cbd.ae', 'cbd', false, 'registry 2026-11-25'),
('emirates.com', 'emirates', false, 'registry 2026-11-25'),
('flydubai.com', 'flydubai', false, 'registry 2026-11-25')
on conflict (domain) do nothing;

-- A local TEST page (test_sites/) was once marked official for du during a demo; a test page is never official.
delete from public.official_domains where domain like '%.localhost';
