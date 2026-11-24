// Kashshaf HQ v2: Abu Dhabi Police-style headquarters, walkable, with rooms wired to the Kashshaf system screens.
(async function () {
  const $ = (s) => document.querySelector(s);
  const C = KChars;

  /* ======================= demo data (real results of the local run) ======================= */
  const V = { fraud: ["احتيال", "#C2002F"], suspicious: ["مشبوه", "#B54708"], safe: ["آمن", "#067647"], official: ["رسمي", "#135BA6"] };
  const pill = (v) => `<span class="pill" style="background:${V[v][1]}">${V[v][0]}</span>`;
  const F = [
    { u: "http://tamm-refund-uae.localhost:8081/claim", d: "tamm-refund-uae.localhost", v: "fraud", s: 100, e: "تم (خدمات حكومة أبوظبي)", c: "government", src: "رسالة", cl: true, t: "12:22:22",
      r: ["يُظهر للهواتف صفحة تطلب مالاً أو بيانات ويخفيها عن أدوات الفحص (إخفاء، تشابه 27%)", "يقدّم نفسه على أنه تم وهو ليس على نطاقها الرسمي (tamm.abudhabi)", "اسم النطاق يقلّد اسم الجهة", "فيه نموذج يطلب بيانات البطاقة", "فيه نموذج يطلب رمز تحقق أو رقم الهوية", "يضغط على الضحية بمهلة قصيرة أو تهديد", "يرسل البيانات المسروقة إلى بوت تيليجرام"] },
    { u: "http://adpolice-fines-pay.localhost:8081/pay", d: "adpolice-fines-pay.localhost", v: "fraud", s: 100, e: "شرطة أبوظبي", c: "government", src: "رسالة", t: "12:22:12",
      r: ["يقدّم نفسه على أنه شرطة أبوظبي وهو ليس على نطاقها الرسمي (adpolice.gov.ae)", "اسم النطاق يقلّد اسم الجهة", "فيه نموذج يطلب بيانات البطاقة", "يضغط على الضحية بمهلة قصيرة أو تهديد", "يرسل البيانات المسروقة إلى بوت تيليجرام"] },
    { u: "http://consumer-protection-refund.localhost:8081/", d: "consumer-protection-refund.localhost", v: "fraud", s: 100, e: "وزارة الاقتصاد (حماية المستهلك)", c: "government", src: "محلل", t: "12:23:13",
      r: ["يقدّم نفسه على أنه حماية المستهلك وهو ليس على نطاقها الرسمي (moec.gov.ae)", "اسم النطاق يقلّد اسم الجهة", "فيه نموذج يطلب بيانات البطاقة", "يرسل البيانات المسروقة إلى بوت تيليجرام"] },
    { u: "http://aramex-redelivery.localhost:8081/track?id=AX99231", d: "aramex-redelivery.localhost", v: "fraud", s: 95, e: "أرامكس", c: "courier", src: "رسالة", t: "12:22:33",
      r: ["يقدّم نفسه على أنه أرامكس وهو ليس على نطاقها الرسمي (aramex.com)", "اسم النطاق يقلّد اسم الجهة", "فيه نموذج يطلب بيانات البطاقة", "يضغط على الضحية بمهلة قصيرة أو تهديد"] },
    { u: "http://etisalat-points.localhost:8081/redeem", d: "etisalat-points.localhost", v: "fraud", s: 85, e: "اتصالات من e&", c: "telecom", src: "رسالة", t: "12:22:38",
      r: ["يقدّم نفسه على أنه اتصالات وهو ليس على نطاقها الرسمي", "اسم النطاق يقلّد اسم الجهة", "فيه نموذج يطلب رمز تحقق أو رقم الهوية", "يضغط على الضحية بمهلة قصيرة أو تهديد"] },
    { u: "http://karak-cafe.localhost:8081/", v: "safe", s: 0, e: "—", src: "رسالة", t: "12:22:41", r: [] },
    { u: "https://www.adpolice.gov.ae", v: "official", s: 0, e: "شرطة أبوظبي", src: "رسالة", t: "12:22:42", r: [] },
    { u: "https://www.tamm.abudhabi", v: "official", s: 0, e: "تم", src: "رسالة", t: "12:22:42", r: [] },
    { u: "https://u.ae/en/", v: "official", s: 0, e: "البوابة الرسمية لحكومة الإمارات", src: "محلل", t: "12:23:13", r: [] },
    { u: "https://www.aramex.com/", v: "official", s: 0, e: "أرامكس", src: "محلل", t: "12:23:13", r: [] },
  ];
  const CELLS = [
    { id: "government", name: "الجهات الحكومية والشرطة", ex: "شرطة أبوظبي، تم، الداخلية، حماية المستهلك" },
    { id: "bank", name: "البنوك", ex: "بنك أبوظبي الأول، أبوظبي التجاري، الإمارات دبي الوطني" },
    { id: "courier", name: "البريد والشحن", ex: "بريد الإمارات، أرامكس" },
    { id: "telecom", name: "الاتصالات", ex: "اتصالات، دو" },
    { id: "transport", name: "النقل والطرق", ex: "درب، سالك" },
    { id: "utility", name: "الكهرباء والماء", ex: "شركة أبوظبي للتوزيع" },
    { id: "airline", name: "الطيران", ex: "الاتحاد للطيران" },
    { id: "none", name: "بدون جهة منتحلة", ex: "احتيال عام: استثمار، وظائف، جوائز" },
  ];
  const inmates = (id) => F.filter((f) => f.v === "fraud" && (f.c || "none") === id);
  const fraud = F.filter((f) => f.v === "fraud");
  $("#cellTable").innerHTML = `<tr><th>#</th><th>الزنزانة</th><th>من يُوقف فيها</th><th>حالياً</th></tr>` +
    CELLS.map((c, i) => `<tr><td>${i + 1}</td><td><b>${c.name}</b></td><td style="color:var(--muted)">${c.ex}</td><td>${inmates(c.id).map((f) => `<code>${f.d}</code>`).join("<br>") || "—"}</td></tr>`).join("");

  /* ======================= cast ======================= */
  const PEOPLE = {
    me: ["citizen", { skin: "tan" }],
    reception: ["officer", { skin: "medium", uni: "admin", beard: "short" }],
    lab: ["officer", { skin: "light", uni: "admin", beard: false, hair: "brown" }],
    archive: ["officer", { skin: "tan", uni: "admin", hair: "grey" }],
    gangs: ["officer", { skin: "medium", uni: "admin" }],
    dispatch: ["officer", { skin: "dark", uni: "field", beard: "short" }],
    ops: ["officer", { skin: "tan", uni: "admin", beard: "short", hair: "grey" }],
    records: ["officer", { skin: "light", uni: "admin", beard: "short" }],
    prison: ["officer", { skin: "dark", uni: "field" }],
    agentA: ["officer", { skin: "tan", uni: "admin", beard: "short" }],
    agentB: ["officer", { skin: "medium", uni: "field", beard: false }],
    agentC: ["officer", { skin: "dark", uni: "admin" }],
    agentD: ["officer", { skin: "light", uni: "field", beard: "short", hair: "brown" }],
    guard: ["officer", { skin: "medium", uni: "field", beard: false }],
    p1: ["prisoner", { skin: "light", hair: "brown", num: "0417" }],
    p2: ["prisoner", { skin: "tan", num: "0522" }],
    p3: ["prisoner", { skin: "dark", beard: "short", num: "0613" }],
  };
  await C.preload(Object.values(PEOPLE));

  // character showcase
  {
    const hero = $("#hero");
    for (const d of ["down", "left", "up", "right"]) { const i = C.image("citizen", PEOPLE.me[1], d, 0).cloneNode(); hero.append(i); }
    hero.insertAdjacentHTML("beforeend", `<div class="cap"><div class="bubble">هذا أنت: مواطن بالكندورة البيضاء والغترة والعقال والطربوشة. يظهر فوقك اسم حسابك وشارة «محقق كشّاف».</div></div>`);
    const roster = $("#roster");
    const rows = [["reception", "موظف الاستقبال", "زي إداري كحلي"], ["ops", "قائد العمليات", "رتب فضية على الكتف"], ["dispatch", "ضابط العمليات الميدانية", "زي ميداني أزرق رمادي"],
      ["gangs", "المحقق", "إدارة التحريات"], ["prison", "حارس التوقيف", "زي ميداني"], ["p2", "موقوف = موقع محظور", "رقمه على صدره"]];
    for (const [k, t, s] of rows) {
      const box = document.createElement("div"); const i = C.image(PEOPLE[k][0], PEOPLE[k][1], "down", 0).cloneNode(); box.append(i);
      box.insertAdjacentHTML("beforeend", `${t}<small>${s}</small>`); roster.append(box);
    }
  }

  /* ======================= map ======================= */
  const TILE = 64, W = 60, H = 44;
  const T = Array.from({ length: H }, () => Array(W).fill("out"));
  const SOLID = Array.from({ length: H }, () => Array(W).fill(false));
  const set = (x, y, t) => { if (x >= 0 && y >= 0 && x < W && y < H) T[y][x] = t; };
  const fill = (x0, y0, x1, y1, t) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, t); };

  fill(0, 0, 59, 35, "wall");
  const ROOMS = [
    { id: "ops", name: "غرفة العمليات", sys: "الوكلاء", r: [1, 1, 18, 18], fl: "carpetB", door: [[9, 19], [10, 19]] },
    { id: "gangs", name: "إدارة التحريات", sys: "العصابات", r: [20, 1, 29, 18], fl: "carpet", door: [[24, 19], [25, 19]] },
    { id: "dispatch", name: "الدوريات واللاسلكي", sys: "الاكتشاف", r: [31, 1, 39, 18], fl: "carpetT", door: [[35, 19], [36, 19]] },
    { id: "records", name: "قسم السجلات", sys: "السجل", r: [41, 1, 45, 18], fl: "wood", door: [[43, 19], [44, 19]] },
    { id: "archive", name: "الأرشيف المركزي", sys: "النتائج", r: [47, 1, 58, 18], fl: "vinyl", door: [[52, 19], [53, 19]] },
    { id: "lab", name: "مختبر الفحص الرقمي", sys: "فحص رسالة أو رابط", r: [1, 25, 20, 34], fl: "lab", door: [[10, 24], [11, 24]] },
    { id: "reception", name: "البهو والاستقبال", sys: "لوحة المتابعة", r: [22, 25, 37, 34], fl: "marble", door: [] },
    { id: "prison", name: "التوقيف", sys: "المحظورة", r: [39, 25, 58, 34], fl: "concrete", door: [[41, 24], [42, 24]] },
  ];
  fill(1, 20, 58, 23, "corr");
  for (const R of ROOMS) { const [x0, y0, x1, y1] = R.r; fill(x0, y0, x1, y1, R.fl); for (const [x, y] of R.door) set(x, y, "door"); }
  for (let x = 22; x <= 37; x++) set(x, 24, x >= 28 && x <= 31 ? "gate" : "glass");
  for (let x = 28; x <= 31; x++) set(x, 35, "entry");
  // detention: 4 cells above and 4 below a walkway, a guard booth, lockers by the door
  const CX = [[44, 46], [48, 50], [52, 54], [56, 58]];
  const cellRect = (k) => { const top = k < 4, [x0, x1] = CX[k % 4]; return { x0, x1, y0: top ? 25 : 32, y1: top ? 27 : 34, bars: top ? 28 : 31 }; };
  for (let k = 0; k < 8; k++) { const c = cellRect(k); fill(c.x0, c.y0, c.x1, c.y1, "cell"); for (let x = c.x0; x <= c.x1; x++) set(x, c.bars, "bars"); }
  for (const x of [43, 47, 51, 55]) { for (let y = 25; y <= 28; y++) set(x, y, "wall"); for (let y = 31; y <= 34; y++) set(x, y, "wall"); }
  fill(39, 31, 42, 34, "tile");
  // forecourt
  fill(2, 37, 20, 39, "grass"); fill(39, 37, 57, 39, "grass"); fill(0, 41, 59, 43, "road");

  const WALLISH = new Set(["wall", "glass"]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) SOLID[y][x] = ["wall", "glass", "bars", "cell"].includes(T[y][x]);

  // furniture: [type, x, y, w, h, extra]
  const FURN = [];
  const add = (t, x, y, w = 1, h = 1, o = {}) => FURN.push({ t, x, y, w, h, ...o });
  // operations room
  add("videowall", 3, 1, 14, 1);
  const SEATS = [];
  for (const y of [6, 9, 12, 15]) for (const [a, b] of [[2, 8], [11, 17]]) { add("desk", a, y, b - a + 1, 1, { mon: "agent" }); for (let x = a; x <= b; x++) SEATS.push({ x, y: y + 1 }); }
  add("plant", 1, 18); add("plant", 18, 18); add("plant", 1, 1); add("plant", 18, 1);
  // investigations
  add("board", 21, 1, 8, 1); add("table", 22, 7, 6, 2); add("cabinet", 27, 17, 3, 1); add("cabinet", 20, 17, 2, 1); add("plant", 29, 1);
  // dispatch
  add("console", 32, 2, 7, 1); add("maptable", 33, 8, 5, 2); add("plant", 31, 18); add("plant", 39, 18); add("cabinet", 38, 17, 1, 1);
  // records
  add("binders", 41, 1, 5, 1); add("binderscol", 41, 3, 1, 13); add("desk", 43, 9, 2, 1, { mon: "book" }); add("cabinet", 45, 12, 1, 5, { vert: true });
  // archive: 12 rows of shelving + desks
  for (const y of [2, 4, 6, 8, 10, 12]) { add("shelf", 47, y, 5, 1, { lab: `A${y / 2}` }); add("shelf", 55, y, 4, 1, { lab: `B${y / 2}` }); }
  add("desk", 48, 16, 3, 1, { mon: "pc" }); add("desk", 55, 16, 4, 1, { mon: "pc4" }); add("plant", 47, 18); add("plant", 58, 18);
  // lab
  add("rack", 14, 25, 6, 1); add("scanner", 2, 26, 3, 2, { which: "phone" }); add("scanner", 6, 26, 3, 2, { which: "scan" });
  const LABSEATS = [];
  for (const y of [29, 32]) for (const [a, b] of [[2, 8], [13, 19]]) { add("desk", a, y, b - a + 1, 1, { mon: "lab" }); for (let x = a; x <= b; x++) LABSEATS.push({ x, y: y + 1 }); }
  add("plant", 1, 34); add("plant", 20, 34);
  // lobby
  add("counter", 27, 29, 6, 1); for (const y of [31, 33]) { add("seats", 23, y, 3, 1); add("seats", 34, y, 3, 1); }
  add("plant", 22, 25); add("plant", 37, 25); add("plant", 22, 34); add("plant", 37, 34); add("flagstand", 23, 27); add("flagstand", 36, 27);
  add("totem", 25, 26); add("totem", 34, 26); add("planter", 26, 36); add("planter", 33, 36);
  // detention
  add("lockers", 39, 25, 4, 1); add("bench", 39, 27, 2, 1); add("guarddesk", 39, 32, 3, 1);
  // corridor
  for (const [x, y] of [[1, 20], [58, 20], [1, 23], [58, 23]]) add("plant", x, y);
  add("bench", 5, 23, 2, 1); add("bench", 15, 23, 2, 1); add("bench", 46, 23, 2, 1); add("bench", 55, 23, 2, 1); add("cooler", 19, 20); add("directory", 29, 20, 2, 1);
  // forecourt
  for (const x of [5, 11, 17, 42, 48, 54]) add("palm", x, 38);
  add("flagpole", 24, 37); add("flagpole", 35, 37); add("monument", 36, 39, 4, 1); add("car", 8, 41, 3, 2); add("car", 46, 41, 3, 2); add("car", 21, 41, 3, 2);
  for (const f of FURN) for (let j = 0; j < f.h; j++) for (let i = 0; i < f.w; i++) if (f.t !== "palm" || (i === 0 && j === 0)) SOLID[f.y + j][f.x + i] = true;

  const LINES = {
    reception: "أهلاً وسهلاً في القيادة العامة! هذي لوحة المتابعة، كل الأرقام لحظة بلحظة.",
    lab: "عندك رسالة مشبوهة؟ الجهازين هنا يفتحون الرابط بعين الهاتف وعين الفاحص.",
    archive: "كل حكم صدر محفوظ في هالرفوف. ابحث، فلتر، وافتح الأدلة.",
    gangs: "شوف الخيوط الحمراء: مواقع تتشارك نفس البوت أو نفس الرقم.",
    dispatch: "من هنا نطلّع الدوريات: بحث جوجل، سجلات الشهادات، وقوائم التصيّد.",
    ops: "هذولا الوكلاء الخمسين. قل لي كم واحد تبي، وشغّل الدورية أو أوقفها.",
    records: "كل عملية صارت في النظام مكتوبة في هالدفاتر.",
    prison: "التوقيف فيه كل المواقع المحظورة. كل زنزانة لنوع من الجهات المنتحلة.",
  };
  const NPCS = [
    { room: "reception", x: 29, y: 28, dir: "down", name: "موظف الاستقبال" },
    { room: "lab", x: 12, y: 27, dir: "down", name: "فنّي المختبر" },
    { room: "archive", x: 49, y: 15, dir: "down", name: "أمين الأرشيف" },
    { room: "gangs", x: 25, y: 11, dir: "down", name: "المحقق" },
    { room: "dispatch", x: 35, y: 12, dir: "down", name: "ضابط العمليات الميدانية" },
    { room: "ops", x: 9, y: 3, dir: "down", name: "قائد العمليات" },
    { room: "records", x: 43, y: 8, dir: "down", name: "كاتب السجل" },
    { room: "prison", x: 42, y: 31, dir: "down", name: "حارس التوقيف" },
  ];
  const EXTRAS = [{ who: "guard", x: 27, y: 25, dir: "down" }, { who: "agentB", x: 31, y: 28, dir: "down" }];
  for (const n of [...NPCS, ...EXTRAS]) SOLID[n.y][n.x] = true;
  const AGENTKIND = ["agentA", "agentB", "agentC", "agentD"];
  const AGENTS = SEATS.slice(0, 50).map((s, i) => ({ ...s, who: AGENTKIND[(i * 7) % 4], st: "idle", until: 0 }));
  const SEATED = [...AGENTS,
    ...LABSEATS.filter((_, i) => i % 2 === 0).map((s, i) => ({ ...s, who: AGENTKIND[(i + 1) % 4], lab: true })),
    ...[33, 35, 37].map((x, i) => ({ x, y: 3, who: AGENTKIND[i], ops: true }))];
  for (const s of SEATED) SOLID[s.y][s.x] = true;

  const INTER = [
    ...NPCS.map((n) => ({ kind: "npc", x: n.x + 0.5, y: n.y + 0.6, r: 2.0, npc: n })),
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => { const c = cellRect(k); return { kind: "cell", k, x: (c.x0 + c.x1 + 1) / 2, y: c.bars + (k < 4 ? 1.4 : -0.4), r: 1.6 }; }),
  ];

  /* ======================= static rendering ======================= */
  const st = document.createElement("canvas"); st.width = W * TILE; st.height = H * TILE;
  const g = st.getContext("2d");
  const hash = (a, b, c) => { let h = (a * 73856093) ^ (b * 19349663) ^ (c * 83492791); h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };
  const lin = (x0, y0, x1, y1, stops) => { const gr = g.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, c]) => gr.addColorStop(o, c)); return gr; };
  const rr = (x, y, w, h, r = 6) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
  const shadow = (x, y, w, h, r = 8, a = 0.2) => { g.fillStyle = `rgba(0,0,0,${a})`; rr(x + 4, y + 8, w, h, r); g.fill(); };
  const noise = (X, Y, n, col, seed, size = 2) => { g.fillStyle = col; for (let i = 0; i < n; i++) { const h = hash(X, Y, seed + i); g.fillRect(X + (h % 64), Y + ((h >>> 7) % 64), size, size); } };

  function floor(x, y, t) {
    const X = x * TILE, Y = y * TILE;
    switch (t) {
      case "marble": case "gate": case "entry": {
        g.fillStyle = ((x >> 1) + (y >> 1)) % 2 ? "#f4f2ed" : "#ebe8e1"; g.fillRect(X, Y, 64, 64);
        g.fillStyle = "#dbd6cc"; if (x % 2 === 0) g.fillRect(X, Y, 1.5, 64); if (y % 2 === 0) g.fillRect(X, Y, 64, 1.5);
        if (hash(x, y, 1) % 3 === 0) { const h = hash(x, y, 2); g.strokeStyle = "rgba(140,135,125,.22)"; g.lineWidth = 1.2; g.beginPath(); g.moveTo(X, Y + h % 64); g.bezierCurveTo(X + 22, Y + (h >>> 6) % 64, X + 40, Y + (h >>> 12) % 64, X + 64, Y + (h >>> 18) % 64); g.stroke(); }
        g.fillStyle = "rgba(255,255,255,.35)"; g.fillRect(X + 6, Y + 6, 18, 3); break;
      }
      case "corr": case "door": g.fillStyle = "#e4e7ec"; g.fillRect(X, Y, 64, 64); g.fillStyle = "#d2d7df"; g.fillRect(X, Y + 63, 64, 1); g.fillRect(X + 63, Y, 1, 64); noise(X, Y, 6, "#d9dde4", 3); break;
      case "carpetB": g.fillStyle = "#1f2b40"; g.fillRect(X, Y, 64, 64); noise(X, Y, 30, "#263450", 5); noise(X, Y, 20, "#19233a", 9); if (x % 2 === 0) { g.fillStyle = "#18223a"; g.fillRect(X, Y, 1, 64); } break;
      case "carpet": g.fillStyle = "#3b4c68"; g.fillRect(X, Y, 64, 64); noise(X, Y, 30, "#43567a", 5); noise(X, Y, 20, "#33435d", 9); break;
      case "carpetT": g.fillStyle = "#33505b"; g.fillRect(X, Y, 64, 64); noise(X, Y, 30, "#3c5c68", 5); noise(X, Y, 20, "#2c4650", 9); break;
      case "wood": g.fillStyle = "#a07a52"; g.fillRect(X, Y, 64, 64); for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? "#9a744c" : "#a68058"; g.fillRect(X, Y + i * 16, 64, 15); g.fillStyle = "#7f5e3b"; g.fillRect(X, Y + i * 16 + 15, 64, 1); g.fillRect(X + ((x * 23 + i * 37) % 64), Y + i * 16, 1, 15); } break;
      case "vinyl": g.fillStyle = "#d9d5cb"; g.fillRect(X, Y, 64, 64); g.fillStyle = "#c9c4b8"; g.fillRect(X, Y + 31, 64, 1); g.fillRect(X + 31, Y, 1, 64); noise(X, Y, 8, "#cfcabd", 3); break;
      case "lab": g.fillStyle = "#eef2f6"; g.fillRect(X, Y, 64, 64); g.fillStyle = "#d9e0e8"; g.fillRect(X, Y + 31, 64, 1); g.fillRect(X + 31, Y, 1, 64); g.fillRect(X, Y + 63, 64, 1); g.fillRect(X + 63, Y, 1, 64); break;
      case "concrete": g.fillStyle = "#a9aeb4"; g.fillRect(X, Y, 64, 64); noise(X, Y, 22, "#9ea3a9", 4); noise(X, Y, 10, "#b3b8be", 8); break;
      case "cell": g.fillStyle = "#8e939a"; g.fillRect(X, Y, 64, 64); noise(X, Y, 22, "#858a91", 4); break;
      case "tile": g.fillStyle = "#c7cdd6"; g.fillRect(X, Y, 64, 64); g.fillStyle = "#b4bbc6"; g.fillRect(X, Y + 31, 64, 1); g.fillRect(X + 31, Y, 1, 64); break;
      case "grass": g.fillStyle = "#6f9f46"; g.fillRect(X, Y, 64, 64); noise(X, Y, 40, "#7cad50", 4, 3); noise(X, Y, 25, "#5f8c3b", 9, 3); break;
      case "road": g.fillStyle = "#3d4148"; g.fillRect(X, Y, 64, 64); noise(X, Y, 30, "#464a52", 4); if (y === 42 && x % 3 === 0) { g.fillStyle = "#f2f2f2"; g.fillRect(X + 8, Y + 30, 40, 5); } if (y === 41) { g.fillStyle = "#c8c3b2"; g.fillRect(X, Y, 64, 6); } break;
      default: { // paving outside
        g.fillStyle = "#ddd2ba"; g.fillRect(X, Y, 64, 64); g.fillStyle = "#c9bc9f";
        for (let r = 0; r < 4; r++) { g.fillRect(X, Y + r * 16, 64, 1); const off = r % 2 ? 16 : 0; for (let c = 0; c < 2; c++) g.fillRect(X + off + c * 32, Y + r * 16, 1, 16); }
        noise(X, Y, 6, "#d3c7ac", 2);
      }
    }
  }
  function wall(x, y) {
    const X = x * TILE, Y = y * TILE;
    const belowT = y + 1 < H ? T[y + 1][x] : "out";
    const faceVisible = !WALLISH.has(belowT) && belowT !== "bars";
    if (!faceVisible) { g.fillStyle = "#d6dbe3"; g.fillRect(X, Y, 64, 64); g.fillStyle = "#e9ecf1"; g.fillRect(X + 3, Y + 3, 58, 58); return; }
    if (y === 35) { // exterior facade: white stone with blue glass and an ADP-blue band
      g.fillStyle = "#e9ecf1"; g.fillRect(X, Y, 64, 18); g.fillStyle = "#135BA6"; g.fillRect(X, Y + 16, 64, 5);
      g.fillStyle = lin(X, Y + 21, X, Y + 64, [[0, "#ffffff"], [1, "#e3e7ee"]]); g.fillRect(X, Y + 21, 64, 43);
      g.fillStyle = lin(X, Y + 25, X + 64, Y + 58, [[0, "#9cc6ef"], [0.5, "#2f6fb4"], [1, "#123f7c"]]); g.fillRect(X + 8, Y + 25, 48, 30);
      g.fillStyle = "rgba(255,255,255,.35)"; g.beginPath(); g.moveTo(X + 8, Y + 25); g.lineTo(X + 30, Y + 25); g.lineTo(X + 8, Y + 47); g.fill();
      g.fillStyle = "#c6ccd6"; g.fillRect(X + 31, Y + 25, 2, 30); g.fillStyle = "#082E6D"; g.fillRect(X, Y + 58, 64, 6); return;
    }
    g.fillStyle = "#e7eaef"; g.fillRect(X, Y, 64, 20); g.fillStyle = "#cdd3dc"; g.fillRect(X, Y + 18, 64, 2);
    g.fillStyle = lin(X, Y + 20, X, Y + 64, [[0, "#fafbfc"], [1, "#e6eaf0"]]); g.fillRect(X, Y + 20, 64, 44);
    g.fillStyle = "#135BA6"; g.fillRect(X, Y + 44, 64, 5); g.fillStyle = "#082E6D"; g.fillRect(X, Y + 56, 64, 8);
  }
  function glass(x, y) {
    floor(x, y, "marble"); const X = x * TILE, Y = y * TILE;
    g.fillStyle = "rgba(0,0,0,.12)"; g.fillRect(X, Y + 30, 64, 10);
    g.fillStyle = "rgba(150,195,240,.55)"; g.fillRect(X, Y + 14, 64, 22); g.fillStyle = "rgba(255,255,255,.55)"; g.fillRect(X + 6, Y + 16, 20, 3);
    g.fillStyle = "#9aa6b5"; g.fillRect(X, Y + 12, 64, 3); g.fillRect(X, Y + 35, 64, 3); g.fillRect(X + 62, Y + 12, 2, 26);
  }
  function bars(x, y) {
    floor(x, y, "concrete"); const X = x * TILE, Y = y * TILE;
    g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(X, Y + 40, 64, 8);
    g.fillStyle = "#4b5260"; g.fillRect(X, Y + 6, 64, 6); g.fillRect(X, Y + 36, 64, 6);
    for (let i = 4; i < 64; i += 10) { g.fillStyle = lin(X + i, 0, X + i + 5, 0, [[0, "#d9dde3"], [1, "#6b7380"]]); g.fillRect(X + i, Y - 8, 5, 52); }
  }

  // ---- furniture painters ----
  const mon = (x, y, scr = "#1d6fc4") => { g.fillStyle = "#1b1f27"; rr(x, y, 30, 20, 2); g.fill(); g.fillStyle = scr; g.fillRect(x + 2, y + 2, 26, 15); g.fillStyle = "#2a2f39"; g.fillRect(x + 12, y + 20, 6, 5); g.fillRect(x + 8, y + 24, 14, 2); };
  function chair(cx, cy) { g.fillStyle = "rgba(0,0,0,.2)"; g.beginPath(); g.ellipse(cx + 2, cy + 10, 18, 7, 0, 0, 7); g.fill(); g.fillStyle = "#23272f"; g.beginPath(); g.ellipse(cx, cy, 16, 12, 0, 0, 7); g.fill(); g.fillStyle = "#353b46"; g.beginPath(); g.ellipse(cx, cy - 2, 12, 8, 0, 0, 7); g.fill(); }
  function paint(f) {
    const X = f.x * TILE, Y = f.y * TILE, Wd = f.w * TILE, Hd = f.h * TILE;
    switch (f.t) {
      case "desk": {
        for (let i = 0; i < f.w; i++) if (f.mon === "agent" || f.mon === "lab") chair(X + i * 64 + 32, Y + 76);
        shadow(X + 2, Y + 8, Wd - 4, 44);
        g.fillStyle = lin(0, Y + 8, 0, Y + 44, [[0, "#ffffff"], [1, "#e9ecf1"]]); rr(X + 2, Y + 8, Wd - 4, 36, 4); g.fill();
        g.fillStyle = "#b9a07c"; g.fillRect(X + 2, Y + 42, Wd - 4, 4); g.fillStyle = "#c3c9d2"; g.fillRect(X + 2, Y + 46, Wd - 4, 10);
        g.fillStyle = "#7d8694"; g.fillRect(X + 6, Y + 46, 4, 14); g.fillRect(X + Wd - 10, Y + 46, 4, 14);
        if (f.mon === "lab") for (let i = 0; i < f.w; i++) { mon(X + i * 64 + 6, Y + 10, "#0f3b2a"); mon(X + i * 64 + 30, Y + 12, "#14315c"); g.fillStyle = "#2a2f39"; g.fillRect(X + i * 64 + 18, Y + 34, 26, 6); }
        if (f.mon === "pc") for (let i = 0; i < f.w; i++) mon(X + i * 64 + 17, Y + 10, "#1d6fc4");
        if (f.mon === "pc4") for (let i = 0; i < f.w; i++) { mon(X + i * 64 + 17, Y + 10, "#e8f0fa"); g.fillStyle = "#135BA6"; g.fillRect(X + i * 64 + 21, Y + 14, 22, 3); }
        if (f.mon === "book") { g.fillStyle = "#f4efe1"; g.fillRect(X + 30, Y + 14, 56, 24); g.fillStyle = "#b3a98f"; g.fillRect(X + 57, Y + 14, 2, 24); for (let i = 0; i < 4; i++) { g.fillStyle = "#7a8291"; g.fillRect(X + 34, Y + 18 + i * 5, 20, 1.5); g.fillRect(X + 62, Y + 18 + i * 5, 20, 1.5); } g.fillStyle = "#082E6D"; g.fillRect(X + 92, Y + 16, 22, 16); }
        if (f.mon === "agent") for (let i = 0; i < f.w; i++) { g.fillStyle = "#2a2f39"; g.fillRect(X + i * 64 + 20, Y + 34, 24, 6); }
        break;
      }
      case "videowall": {
        shadow(X, Y - 30, Wd, 74);
        g.fillStyle = "#0b0f17"; rr(X, Y - 34, Wd, 78, 4); g.fill();
        const panels = 7, pw = (Wd - 16) / panels;
        for (let i = 0; i < panels; i++) {
          const px = X + 8 + i * pw;
          g.fillStyle = lin(px, Y - 28, px, Y + 38, [[0, "#0d2b52"], [1, "#071a33"]]); g.fillRect(px + 2, Y - 28, pw - 4, 66);
          g.fillStyle = "#1d6fc4";
          if (i % 3 === 0) for (let b = 0; b < 8; b++) { const h = 10 + (hash(i, b, 3) % 40); g.fillRect(px + 10 + b * 12, Y + 30 - h, 7, h); }
          if (i % 3 === 1) { g.strokeStyle = "#4fa3ff"; g.lineWidth = 2; g.beginPath(); for (let k = 0; k < 10; k++) g.lineTo(px + 8 + k * ((pw - 20) / 9), Y + 20 - (hash(i, k, 7) % 36)); g.stroke(); g.fillStyle = "#C2002F"; g.fillRect(px + 10, Y - 22, 40, 8); }
          if (i % 3 === 2) { g.fillStyle = "#16467e"; g.beginPath(); g.ellipse(px + pw / 2, Y + 4, pw / 2 - 14, 24, 0, 0, 7); g.fill(); for (let k = 0; k < 6; k++) { g.fillStyle = k % 2 ? "#C2002F" : "#ffd166"; g.beginPath(); g.arc(px + 20 + (hash(i, k, 9) % (pw - 40)), Y - 12 + (hash(i, k, 4) % 36), 3, 0, 7); g.fill(); } }
        }
        break;
      }
      case "board": {
        shadow(X, Y - 28, Wd, 66);
        g.fillStyle = "#5e3b1f"; rr(X, Y - 32, Wd, 70, 3); g.fill(); g.fillStyle = "#b8884f"; g.fillRect(X + 6, Y - 26, Wd - 12, 58); noise(X, Y - 26, 40, "#a87a45", 3);
        const pins = []; for (let i = 0; i < 12; i++) pins.push([X + 30 + (i * 41) % (Wd - 60), Y - 14 + ((i * 17) % 34)]);
        for (const [px, py] of pins) { g.fillStyle = "rgba(0,0,0,.2)"; g.fillRect(px - 10, py - 6, 26, 30); g.fillStyle = "#f6f3ea"; g.fillRect(px - 12, py - 8, 24, 28); g.fillStyle = "#9aa3ae"; g.beginPath(); g.arc(px, py + 2, 6, 0, 7); g.fill(); g.fillRect(px - 8, py + 8, 16, 8); }
        g.strokeStyle = "#C2002F"; g.lineWidth = 2.5; g.beginPath();
        [[0, 3], [3, 7], [7, 2], [2, 9], [9, 11], [5, 8], [8, 10]].forEach(([a, b]) => { g.moveTo(...pins[a]); g.lineTo(...pins[b]); }); g.stroke();
        for (const [px, py] of pins) { g.fillStyle = "#C2002F"; g.beginPath(); g.arc(px, py - 8, 3, 0, 7); g.fill(); }
        break;
      }
      case "table": {
        for (let i = 0; i < f.w; i++) { chair(X + i * 64 + 32, Y - 4); chair(X + i * 64 + 32, Y + Hd + 6); }
        shadow(X, Y, Wd, Hd - 6, 10);
        g.fillStyle = lin(0, Y, 0, Y + Hd, [[0, "#6f4b2c"], [1, "#4f3219"]]); rr(X, Y, Wd, Hd - 6, 10); g.fill();
        g.fillStyle = "rgba(255,255,255,.08)"; g.fillRect(X + 10, Y + 8, Wd - 20, 6);
        for (let i = 0; i < 6; i++) { g.save(); g.translate(X + 40 + i * 58, Y + 50 + (i % 2) * 20); g.rotate((i % 3 - 1) * 0.15); g.fillStyle = "#f6f3ea"; g.fillRect(-16, -20, 32, 40); g.fillStyle = "#9aa3ae"; g.fillRect(-10, -14, 20, 2); g.fillRect(-10, -8, 16, 2); g.fillRect(-10, -2, 18, 2); g.restore(); }
        g.fillStyle = "#1b1f27"; rr(X + Wd - 90, Y + 30, 60, 40, 3); g.fill(); g.fillStyle = "#1d6fc4"; g.fillRect(X + Wd - 86, Y + 34, 52, 30);
        break;
      }
      case "console": {
        for (const cx of [33, 35, 37]) chair(cx * 64 + 32, Y + 74);
        shadow(X, Y - 20, Wd, 76);
        g.fillStyle = "#0b0f17"; g.fillRect(X + 8, Y - 30, Wd - 16, 34);
        for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? "#0d2b52" : "#123a2c"; g.fillRect(X + 14 + i * ((Wd - 28) / 6), Y - 26, (Wd - 28) / 6 - 6, 26); }
        g.fillStyle = lin(0, Y + 4, 0, Y + 56, [[0, "#3a4250"], [1, "#232933"]]); rr(X, Y + 4, Wd, 50, 6); g.fill();
        for (let i = 0; i < f.w * 6; i++) { g.fillStyle = ["#2e9e5b", "#ffd166", "#C2002F", "#1d6fc4"][i % 4]; g.beginPath(); g.arc(X + 14 + i * 10.5, Y + 16 + (i % 2) * 8, 3, 0, 7); g.fill(); }
        for (const cx of [33, 35, 37]) { g.fillStyle = "#11151c"; g.fillRect(cx * 64 + 22, Y + 34, 20, 12); g.strokeStyle = "#11151c"; g.lineWidth = 2; g.beginPath(); g.moveTo(cx * 64 + 32, Y + 34); g.lineTo(cx * 64 + 40, Y + 22); g.stroke(); }
        break;
      }
      case "maptable": {
        shadow(X, Y, Wd, Hd, 10);
        g.fillStyle = "#1b1f27"; rr(X, Y, Wd, Hd, 10); g.fill();
        g.fillStyle = lin(X, Y, X + Wd, Y + Hd, [[0, "#0d3d7a"], [1, "#0a2a55"]]); rr(X + 8, Y + 8, Wd - 16, Hd - 16, 6); g.fill();
        g.fillStyle = "#c9b894"; g.beginPath(); g.moveTo(X + 20, Y + Hd - 20); g.bezierCurveTo(X + 80, Y + 40, X + 160, Y + 90, X + Wd - 20, Y + 24); g.lineTo(X + Wd - 20, Y + Hd - 20); g.closePath(); g.fill();
        g.strokeStyle = "rgba(255,255,255,.35)"; g.lineWidth = 1.5; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(X + 30 + i * 50, Y + Hd - 20); g.lineTo(X + 60 + i * 40, Y + 30); g.stroke(); }
        for (let k = 0; k < 9; k++) { g.fillStyle = k % 3 ? "#C2002F" : "#ffd166"; g.beginPath(); g.arc(X + 40 + (hash(k, 1, 2) % (Wd - 80)), Y + 30 + (hash(k, 3, 4) % (Hd - 60)), 5, 0, 7); g.fill(); }
        break;
      }
      case "shelf": {
        shadow(X, Y + 2, Wd, 56, 3);
        g.fillStyle = "#6f7885"; g.fillRect(X, Y - 18, Wd, 76); g.fillStyle = "#9aa3af"; g.fillRect(X, Y - 18, Wd, 6);
        for (let r = 0; r < 3; r++) {
          g.fillStyle = "#505864"; g.fillRect(X + 3, Y - 10 + r * 23, Wd - 6, 21);
          for (let b = 0; b < f.w * 6; b++) {
            const bx = X + 5 + b * 10.6; const h = hash(f.x * 13 + b, f.y + r, 5);
            g.fillStyle = ["#e9dfc8", "#d9cdb0", "#f2f2ee", "#c6d4e6", "#e9dfc8", "#d8c9a6"][h % 6]; g.fillRect(bx, Y - 8 + r * 23 + (h % 3), 9, 18 - (h % 3));
            g.fillStyle = "#135BA6"; g.fillRect(bx + 2, Y - 2 + r * 23, 5, 3);
          }
        }
        g.fillStyle = "#082E6D"; g.fillRect(X - 4, Y - 18, 28, 22); g.fillStyle = "#fff"; g.font = "700 12px Arial"; g.textAlign = "center"; g.direction = "ltr"; g.fillText(f.lab, X + 10, Y - 2);
        break;
      }
      case "binders": case "binderscol": {
        shadow(X, Y, Wd, Hd - 6, 3);
        g.fillStyle = "#5e3b1f"; g.fillRect(X, Y - (f.t === "binders" ? 18 : 0), Wd, Hd + (f.t === "binders" ? 12 : -4));
        const vert = f.t === "binderscol";
        const n = vert ? f.h * 5 : f.w * 7;
        for (let i = 0; i < n; i++) {
          g.fillStyle = ["#082E6D", "#135BA6", "#C2002F", "#3F3E45", "#e7e1d1", "#2e7d4f"][hash(i, f.x, 9) % 6];
          if (vert) g.fillRect(X + 6, Y + 4 + i * 12.4, Wd - 14, 10); else g.fillRect(X + 4 + i * 9, Y - 12, 7, 46);
        }
        break;
      }
      case "cabinet": {
        shadow(X, Y, Wd, Hd - 6, 3);
        for (let i = 0; i < f.w; i++) for (let j = 0; j < f.h; j++) {
          const cx = X + i * 64, cy = Y + j * 64;
          g.fillStyle = lin(cx, 0, cx + 64, 0, [[0, "#8d96a3"], [0.5, "#aeb6c1"], [1, "#858e9b"]]); g.fillRect(cx + 4, cy - 10, 56, 68);
          for (let d = 0; d < 4; d++) { g.fillStyle = "#6b7380"; g.fillRect(cx + 8, cy - 4 + d * 15, 48, 1.5); g.fillStyle = "#2a2f3a"; g.fillRect(cx + 26, cy + 2 + d * 15, 12, 3); }
        }
        break;
      }
      case "rack": {
        shadow(X, Y, Wd, 56, 3);
        for (let i = 0; i < f.w; i++) { const cx = X + i * 64; g.fillStyle = "#14171d"; g.fillRect(cx + 3, Y - 22, 58, 80); g.fillStyle = "#232833"; for (let r = 0; r < 8; r++) g.fillRect(cx + 7, Y - 18 + r * 9.5, 50, 7); }
        break;
      }
      case "scanner": {
        shadow(X, Y, Wd, Hd - 8, 8);
        g.fillStyle = lin(0, Y, 0, Y + Hd, [[0, "#f6f7f9"], [1, "#dfe3ea"]]); rr(X + 4, Y + 6, Wd - 8, Hd - 14, 8); g.fill();
        g.fillStyle = "#135BA6"; g.fillRect(X + 4, Y + Hd - 20, Wd - 8, 6);
        if (f.which === "phone") {
          g.fillStyle = "#11151c"; rr(X + 60, Y + 10, 72, 100, 10); g.fill(); g.fillStyle = "#fff"; g.fillRect(X + 66, Y + 20, 60, 80);
          g.fillStyle = "#C2002F"; g.fillRect(X + 70, Y + 26, 52, 8); g.fillStyle = "#9aa3ae"; for (let i = 0; i < 4; i++) g.fillRect(X + 70, Y + 40 + i * 12, 52, 7);
          g.fillStyle = "#2e9e5b"; g.fillRect(X + 70, Y + 88, 52, 8);
        } else {
          g.fillStyle = "#11151c"; rr(X + 24, Y + 12, 144, 92, 6); g.fill(); g.fillStyle = "#fffaf0"; g.fillRect(X + 30, Y + 18, 132, 76);
          g.fillStyle = "#c97b2a"; g.fillRect(X + 36, Y + 24, 60, 8); g.fillStyle = "#b9b0a0"; for (let i = 0; i < 5; i++) g.fillRect(X + 36, Y + 38 + i * 10, 116 - i * 12, 5);
        }
        g.fillStyle = "#082E6D"; rr(X + 12, Y + Hd - 44, 54, 20, 5); g.fill(); g.fillStyle = "#fff"; g.font = "700 12px 'Noto Kufi Arabic'"; g.textAlign = "center"; g.direction = "rtl";
        g.fillText(f.which === "phone" ? "هاتف" : "فاحص", X + 39, Y + Hd - 29);
        break;
      }
      case "counter": {
        shadow(X, Y, Wd, 56, 10);
        g.fillStyle = "#f7f6f2"; rr(X, Y + 2, Wd, 26, 10); g.fill(); g.fillStyle = "#c4a676"; g.fillRect(X + 6, Y + 2, Wd - 12, 5);
        g.fillStyle = lin(0, Y + 26, 0, Y + 64, [[0, "#135BA6"], [1, "#082E6D"]]); rr(X, Y + 24, Wd, 40, 8); g.fill();
        g.fillStyle = "#fff"; g.font = "700 17px 'Noto Kufi Arabic'"; g.textAlign = "center"; g.direction = "rtl"; g.fillText("الاستقبال · RECEPTION", X + Wd / 2, Y + 50);
        mon(X + 60, Y - 6, "#e8f0fa"); mon(X + Wd - 130, Y - 6, "#e8f0fa");
        break;
      }
      case "seats": {
        g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(X + 4, Y + 30, Wd - 6, 22);
        g.fillStyle = "#9aa3ae"; g.fillRect(X + 2, Y + 34, Wd - 4, 6);
        for (let i = 0; i < f.w * 2; i++) { const sx = X + 4 + i * 31.5; g.fillStyle = lin(0, Y + 4, 0, Y + 40, [[0, "#1d6fc4"], [1, "#135BA6"]]); rr(sx, Y + 4, 27, 14, 5); g.fill(); g.fillStyle = "#135BA6"; rr(sx, Y + 18, 27, 18, 5); g.fill(); }
        break;
      }
      case "plant": {
        const cx = X + 32, cy = Y + 40;
        g.fillStyle = "rgba(0,0,0,.2)"; g.beginPath(); g.ellipse(cx + 4, cy + 18, 22, 8, 0, 0, 7); g.fill();
        g.fillStyle = lin(cx - 16, 0, cx + 16, 0, [[0, "#cfd4dc"], [0.5, "#ffffff"], [1, "#c3c9d2"]]); rr(cx - 16, cy - 4, 32, 26, 6); g.fill();
        for (let i = 0; i < 11; i++) { const a = (i / 11) * Math.PI * 2, r = 14 + (i % 3) * 4; g.fillStyle = ["#2f7d3e", "#3f9a4f", "#24663a"][i % 3]; g.beginPath(); g.ellipse(cx + Math.cos(a) * r * 0.8, cy - 16 + Math.sin(a) * r * 0.6, 11, 6, a, 0, 7); g.fill(); }
        g.fillStyle = "#4fb062"; g.beginPath(); g.ellipse(cx, cy - 20, 8, 6, 0, 0, 7); g.fill();
        break;
      }
      case "palm": {
        const cx = X + 32, cy = Y + 32;
        g.fillStyle = "rgba(0,0,0,.18)"; g.beginPath(); g.ellipse(cx + 26, cy + 26, 70, 26, 0.2, 0, 7); g.fill();
        g.fillStyle = "#7a5532"; g.fillRect(cx - 6, cy - 10, 12, 40);
        for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; g.save(); g.translate(cx, cy - 16); g.rotate(a); g.fillStyle = i % 2 ? "#2f7d3e" : "#3f9a4f";
          g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(40, -16, 82, 4); g.quadraticCurveTo(40, 4, 0, 0); g.fill(); g.strokeStyle = "rgba(0,0,0,.2)"; g.lineWidth = 1; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(40, -6, 80, 4); g.stroke(); g.restore(); }
        g.fillStyle = "#6b4a2b"; g.beginPath(); g.arc(cx, cy - 16, 8, 0, 7); g.fill();
        break;
      }
      case "flagstand": case "flagpole": {
        const tall = f.t === "flagpole" ? 170 : 110, cx = X + 32, base = Y + 50;
        g.fillStyle = "rgba(0,0,0,.2)"; g.beginPath(); g.ellipse(cx + 6, base + 4, 18, 6, 0, 0, 7); g.fill();
        g.fillStyle = "#9aa3ae"; g.beginPath(); g.ellipse(cx, base, 14, 5, 0, 0, 7); g.fill();
        g.fillStyle = lin(cx - 3, 0, cx + 3, 0, [[0, "#c9ced6"], [1, "#7d8694"]]); g.fillRect(cx - 2.5, base - tall, 5, tall);
        const fx = cx + 2, fy = base - tall + 4, fw = f.t === "flagpole" ? 84 : 56, fh = fw / 2;
        for (let s = 0; s < 12; s++) { const sx = fx + (s * fw) / 12, dy = Math.sin(s * 0.7) * 3, w = fw / 12 + 0.6;
          if (s < 3) { g.fillStyle = "#C8102E"; g.fillRect(sx, fy + dy, w, fh); } else { g.fillStyle = "#00843D"; g.fillRect(sx, fy + dy, w, fh / 3); g.fillStyle = "#ffffff"; g.fillRect(sx, fy + dy + fh / 3, w, fh / 3); g.fillStyle = "#000"; g.fillRect(sx, fy + dy + (2 * fh) / 3, w, fh / 3); } }
        break;
      }
      case "monument": {
        shadow(X, Y, Wd, 56, 6);
        g.fillStyle = lin(0, Y, 0, Y + 64, [[0, "#f4f2ed"], [1, "#dcd6ca"]]); rr(X, Y + 4, Wd, 56, 6); g.fill();
        g.fillStyle = lin(0, Y + 10, 0, Y + 50, [[0, "#135BA6"], [1, "#082E6D"]]); rr(X + 10, Y + 10, Wd - 20, 40, 5); g.fill();
        g.fillStyle = "#fff"; g.font = "700 17px 'Noto Kufi Arabic'"; g.textAlign = "center"; g.direction = "rtl"; g.fillText("القيادة العامة · مقر كشّاف", X + Wd / 2 + 14, Y + 36);
        drawShield(X + 30, Y + 30, 13);
        break;
      }
      case "car": { // top-down patrol car facing right, Abu Dhabi blue-and-white livery
        const x = X + 6, y = Y + 22, L = 180, Wc = 84;
        g.fillStyle = "rgba(0,0,0,.28)"; rr(x + 6, y + 10, L, Wc, 24); g.fill();
        g.fillStyle = "#15171c"; for (const [wx, wy] of [[26, -5], [L - 60, -5], [26, Wc - 7], [L - 60, Wc - 7]]) { rr(x + wx, y + wy, 34, 12, 4); g.fill(); }
        g.fillStyle = lin(0, y, 0, y + Wc, [[0, "#e3e7ee"], [0.18, "#ffffff"], [0.82, "#ffffff"], [1, "#d9dee6"]]); rr(x, y, L, Wc, 22); g.fill();
        g.fillStyle = "#135BA6"; rr(x + 10, y + 2, L - 24, 9, 4); g.fill(); rr(x + 10, y + Wc - 11, L - 24, 9, 4); g.fill();
        g.fillStyle = "#082E6D"; g.fillRect(x + 10, y + 9, L - 24, 2); g.fillRect(x + 10, y + Wc - 11, L - 24, 2);
        g.fillStyle = "#1c2a44"; g.beginPath(); g.moveTo(x + L - 74, y + 12); g.lineTo(x + L - 48, y + 18); g.lineTo(x + L - 48, y + Wc - 18); g.lineTo(x + L - 74, y + Wc - 12); g.fill();
        g.beginPath(); g.moveTo(x + 36, y + 14); g.lineTo(x + 54, y + 12); g.lineTo(x + 54, y + Wc - 12); g.lineTo(x + 36, y + Wc - 14); g.fill();
        g.fillStyle = "rgba(255,255,255,.25)"; g.beginPath(); g.moveTo(x + L - 70, y + 16); g.lineTo(x + L - 56, y + 20); g.lineTo(x + L - 64, y + 34); g.fill();
        g.fillStyle = "#f6f8fb"; rr(x + 56, y + 14, L - 132, Wc - 28, 6); g.fill();
        g.fillStyle = "#cfd5de"; g.fillRect(x + L - 18, y + 18, 6, 14); g.fillRect(x + L - 18, y + Wc - 32, 6, 14);
        g.fillStyle = "#082E6D"; g.font = "800 11px Arial"; g.textAlign = "center"; g.direction = "ltr";
        g.save(); g.translate(x + L - 30, y + Wc / 2); g.rotate(Math.PI / 2); g.fillText("POLICE", 0, 4); g.restore();
        g.fillStyle = "#2b2f38"; rr(x + 76, y + 18, 24, Wc - 36, 4); g.fill();
        break;
      }
      case "totem": { // freestanding information screen
        shadow(X + 14, Y + 30, 36, 24, 6);
        g.fillStyle = "#c9ced6"; rr(X + 14, Y + 46, 36, 10, 3); g.fill();
        g.fillStyle = lin(0, Y - 40, 0, Y + 50, [[0, "#135BA6"], [1, "#082E6D"]]); rr(X + 16, Y - 44, 32, 92, 5); g.fill();
        g.fillStyle = "#e8f0fa"; g.fillRect(X + 20, Y - 38, 24, 64);
        g.fillStyle = "#C2002F"; g.fillRect(X + 22, Y - 34, 20, 6); g.fillStyle = "#135BA6"; for (let i = 0; i < 4; i++) g.fillRect(X + 22, Y - 22 + i * 10, 20 - i * 3, 5);
        drawShield(X + 32, Y + 36, 7);
        break;
      }
      case "planter": {
        shadow(X + 6, Y + 14, 52, 42, 8);
        g.fillStyle = lin(0, Y + 10, 0, Y + 58, [[0, "#f4f2ed"], [1, "#d2ccc0"]]); rr(X + 6, Y + 12, 52, 44, 8); g.fill();
        g.fillStyle = "#5b8c3a"; rr(X + 10, Y + 14, 44, 20, 6); g.fill();
        for (let i = 0; i < 7; i++) { g.fillStyle = ["#2f7d3e", "#3f9a4f", "#4fb062"][i % 3]; g.beginPath(); g.arc(X + 14 + i * 6, Y + 18 + (i % 2) * 8, 7, 0, 7); g.fill(); }
        break;
      }
      case "lockers": {
        shadow(X, Y, Wd, 52, 3);
        for (let i = 0; i < f.w * 2; i++) { const lx = X + i * 32; g.fillStyle = lin(lx, 0, lx + 32, 0, [[0, "#7d8694"], [0.5, "#a3abb7"], [1, "#7d8694"]]); g.fillRect(lx + 2, Y - 14, 28, 70); g.fillStyle = "#4b5260"; for (let s = 0; s < 3; s++) g.fillRect(lx + 8, Y - 6 + s * 4, 16, 1.5); g.fillRect(lx + 22, Y + 24, 3, 10); }
        break;
      }
      case "guarddesk": {
        shadow(X, Y, Wd, 48, 6);
        g.fillStyle = "#3a4250"; rr(X, Y + 6, Wd, 46, 6); g.fill();
        for (let i = 0; i < 6; i++) { g.fillStyle = "#0b0f17"; g.fillRect(X + 8 + i * 30, Y - 14, 28, 22); g.fillStyle = i % 2 ? "#2c3b4a" : "#3d4e40"; g.fillRect(X + 10 + i * 30, Y - 12, 24, 18); g.fillStyle = "rgba(255,255,255,.25)"; g.fillRect(X + 12 + i * 30, Y - 10, 8, 6); }
        break;
      }
      case "bench": {
        g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(X + 6, Y + 36, Wd - 8, 14);
        for (let i = 0; i < 3; i++) { g.fillStyle = i % 2 ? "#8a5a32" : "#9a6a3e"; g.fillRect(X + 4, Y + 14 + i * 9, Wd - 8, 7); }
        g.fillStyle = "#3a3f48"; g.fillRect(X + 10, Y + 40, 5, 12); g.fillRect(X + Wd - 15, Y + 40, 5, 12);
        break;
      }
      case "cooler": {
        g.fillStyle = "rgba(0,0,0,.2)"; g.fillRect(X + 20, Y + 44, 30, 10);
        g.fillStyle = "#eef1f5"; rr(X + 18, Y + 10, 28, 44, 4); g.fill(); g.fillStyle = "#9cc6ef"; rr(X + 20, Y - 12, 24, 24, 8); g.fill(); g.fillStyle = "#135BA6"; g.fillRect(X + 24, Y + 20, 16, 4);
        break;
      }
      case "directory": {
        shadow(X, Y, Wd, 50, 6);
        g.fillStyle = lin(0, Y, 0, Y + 60, [[0, "#135BA6"], [1, "#082E6D"]]); rr(X + 6, Y - 6, Wd - 12, 56, 6); g.fill();
        g.fillStyle = "#fff"; g.font = "700 11px 'Noto Kufi Arabic'"; g.textAlign = "right"; g.direction = "rtl";
        ["↑ العمليات · التحريات", "↑ الدوريات · السجلات · الأرشيف", "↓ المختبر · البهو · التوقيف"].forEach((t, i) => g.fillText(t, X + Wd - 14, Y + 12 + i * 15));
        break;
      }
    }
  }
  function drawShield(cx, cy, r, gg = g) {
    gg.save(); gg.translate(cx - r, cy - r); gg.scale(r / 32, r / 32);
    gg.fillStyle = "#135BA6"; gg.fill(new Path2D("M32 3 7 12v18c0 16 10.5 27.5 25 31 14.5-3.5 25-15 25-31V12L32 3z"));
    gg.fillStyle = "#082E6D"; gg.fill(new Path2D("M32 8.5 12 16v14c0 13 8.5 22.5 20 25.5 11.5-3 20-12.5 20-25.5V16L32 8.5z"));
    gg.fillStyle = "#fff"; gg.fill(new Path2D("M32 18l3.6 7.4 8.1 1.2-5.9 5.7 1.4 8.1L32 36.6l-7.2 3.8 1.4-8.1-5.9-5.7 8.1-1.2z"));
    gg.restore();
  }
  function plaque(cx, cy, title, sub, w = 3.6) {
    const X = cx * TILE, Y = cy * TILE, Wd = w * TILE, Hd = 50;
    g.fillStyle = "rgba(0,0,0,.18)"; rr(X - Wd / 2 + 3, Y - Hd / 2 + 4, Wd, Hd, 6); g.fill();
    g.fillStyle = "#ffffff"; rr(X - Wd / 2, Y - Hd / 2, Wd, Hd, 6); g.fill();
    g.fillStyle = "#135BA6"; g.fillRect(X + Wd / 2 - 8, Y - Hd / 2, 8, Hd);
    drawShield(X + Wd / 2 - 28, Y, 13);
    g.direction = "rtl"; g.textAlign = "center"; g.fillStyle = "#082E6D"; g.font = "800 17px 'Noto Kufi Arabic'"; g.fillText(title, X - 14, Y - 2, Wd - 64);
    g.fillStyle = "#135BA6"; g.font = "600 12px 'Noto Kufi Arabic'"; g.fillText(sub, X - 14, Y + 17, Wd - 64);
  }
  function cellDecor(k) {
    const c = cellRect(k), X = c.x0 * TILE, top = k < 4, Y = (top ? c.y0 : c.y1) * TILE;
    // steel bunk against the back wall and a steel toilet
    g.fillStyle = "rgba(0,0,0,.2)"; g.fillRect(X + 10, Y + (top ? 14 : 18), 110, 40);
    g.fillStyle = "#6b7380"; g.fillRect(X + 6, Y + (top ? 6 : 14), 112, 40); g.fillStyle = "#c9ced6"; g.fillRect(X + 10, Y + (top ? 10 : 18), 104, 32); g.fillStyle = "#eef1f5"; g.fillRect(X + 12, Y + (top ? 12 : 20), 26, 28);
    g.fillStyle = "#b8bec7"; g.beginPath(); g.ellipse(X + 164, Y + 32, 14, 16, 0, 0, 7); g.fill(); g.fillStyle = "#8e959f"; g.beginPath(); g.ellipse(X + 164, Y + 32, 8, 10, 0, 0, 7); g.fill();
    // sign over the bars
    const n = inmates(CELLS[k].id).length, bx = ((c.x0 + c.x1 + 1) / 2) * TILE, by = c.bars * TILE + (top ? 56 : -6);
    g.font = "700 13px 'Noto Kufi Arabic'"; const label = `${CELLS[k].name} · ${n}`; const tw = Math.min(g.measureText(label).width + 28, (c.x1 - c.x0 + 1) * TILE - 6);
    g.fillStyle = "rgba(0,0,0,.2)"; rr(bx - tw / 2 + 2, by - 12, tw, 24, 6); g.fill();
    g.fillStyle = n ? "#C2002F" : "#3F3E45"; rr(bx - tw / 2, by - 14, tw, 24, 6); g.fill();
    g.fillStyle = "#fff"; g.textAlign = "center"; g.direction = "rtl"; g.fillText(label, bx, by + 3, tw - 10);
  }

  await document.fonts.load("800 17px 'Noto Kufi Arabic'"); await document.fonts.load("600 12px 'Noto Kufi Arabic'");
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = T[y][x];
    if (t === "wall") wall(x, y); else if (t === "glass") glass(x, y); else if (t === "bars") { /* later, over cell decor */ } else floor(x, y, t);
  }
  // corridor runner, entrance mat, door thresholds, security gates, glass entry doors
  g.fillStyle = "#082E6D"; g.fillRect(2 * TILE, 21 * TILE + 8, 56 * TILE, 2 * TILE - 16); g.fillStyle = "#135BA6"; g.fillRect(2 * TILE, 21 * TILE + 8, 56 * TILE, 4); g.fillRect(2 * TILE, 23 * TILE - 12, 56 * TILE, 4);
  { // entrance carpet and the floor emblem in the lobby
    const mx = 28 * TILE + 10, my = 33 * TILE + 14, mw = 4 * TILE - 20, mh = TILE + 34;
    g.fillStyle = "#082E6D"; rr(mx, my, mw, mh, 6); g.fill(); g.strokeStyle = "#135BA6"; g.lineWidth = 4; rr(mx + 6, my + 6, mw - 12, mh - 12, 4); g.stroke();
    g.fillStyle = "#fff"; g.font = "700 13px 'Noto Kufi Arabic'"; g.textAlign = "center"; g.direction = "rtl"; g.fillText("أهلاً وسهلاً · WELCOME", mx + mw / 2, my + mh / 2 + 5);
    const ex = 30 * TILE, ey = 26.6 * TILE;
    g.fillStyle = "rgba(0,0,0,.06)"; g.beginPath(); g.ellipse(ex, ey, 112, 62, 0, 0, 7); g.fill();
    g.fillStyle = "#082E6D"; g.beginPath(); g.ellipse(ex, ey, 104, 56, 0, 0, 7); g.fill();
    g.fillStyle = "#f4f2ed"; g.beginPath(); g.ellipse(ex, ey, 94, 48, 0, 0, 7); g.fill();
    g.fillStyle = "#135BA6"; g.beginPath(); g.ellipse(ex, ey, 84, 40, 0, 0, 7); g.fill();
    g.save(); g.translate(ex, ey); g.scale(1, 0.55); drawShield(0, 0, 40); g.restore();
  }
  for (const R of ROOMS) for (const [x, y] of R.door) { g.fillStyle = "#9aa3b0"; g.fillRect(x * TILE, y * TILE + 28, TILE, 8); }
  for (const gx of [28, 30]) { const X = gx * TILE; g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(X + 6, 24 * TILE + 40, 2 * TILE - 4, 10);
    for (const px of [X + 4, X + 2 * TILE - 18]) { g.fillStyle = lin(px, 0, px + 14, 0, [[0, "#c9ced6"], [1, "#7d8694"]]); rr(px, 24 * TILE - 30, 14, 82, 4); g.fill(); g.fillStyle = "#2e9e5b"; g.fillRect(px + 4, 24 * TILE - 20, 6, 6); }
    g.fillStyle = "#9aa3ae"; rr(X + 4, 24 * TILE - 36, 2 * TILE - 8, 12, 4); g.fill(); }
  for (let x = 28; x <= 31; x++) { const X = x * TILE, Y = 35 * TILE; g.fillStyle = "#e9ecf1"; g.fillRect(X, Y, 64, 14); g.fillStyle = "#135BA6"; g.fillRect(X, Y + 12, 64, 5);
    g.fillStyle = "rgba(150,195,240,.45)"; g.fillRect(X + (x < 30 ? 0 : 40), Y + 18, 24, 40); g.fillStyle = "#9aa6b5"; g.fillRect(X + (x < 30 ? 22 : 40), Y + 18, 2, 40); }
  g.fillStyle = "#082E6D"; rr(27 * TILE + 20, 35 * TILE - 26, 6 * TILE - 40, 30, 6); g.fill(); g.fillStyle = "#fff"; g.font = "700 15px 'Noto Kufi Arabic'"; g.textAlign = "center"; g.direction = "rtl"; g.fillText("المدخل الرئيسي · MAIN ENTRANCE", 30 * TILE, 35 * TILE - 6);
  for (let k = 0; k < 8; k++) cellDecor(k);
  for (const f of FURN) if (f.t !== "palm" && f.t !== "car") paint(f);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (T[y][x] === "bars") bars(x, y);
  for (let k = 0; k < 8; k++) { const c = cellRect(k); if (k >= 4) continue; }
  // room signs next to doors
  for (const R of ROOMS) { if (!R.door.length) continue; const [dx, dy] = R.door[1]; const right = dx + 2.6 <= R.r[2] + 0.5; plaque(right ? dx + 2.4 : dx - 2.9, dy + 0.55, R.name, R.sys, R.id === "records" ? 3.2 : 3.6); }
  plaque(29.99, 24.0 + 0.1, "البهو والاستقبال", "لوحة المتابعة", 3.4);
  for (let k = 0; k < 8; k++) cellDecor(k);
  for (const f of FURN) if (f.t === "car") paint(f);
  const palms = FURN.filter((f) => f.t === "palm");

  /* ======================= camera, input, loop ======================= */
  const view = $("#view"), ctx = view.getContext("2d");
  const VW = view.width, VH = view.height;
  const player = { x: 29.9, y: 40.3, dir: "up", moving: false, t: 0 };
  const keys = new Set();
  let open = null, near = null;
  const box = $("#mapbox"), hint = $("#focusHint");
  $("#loading").remove(); hint.hidden = false;
  hint.onclick = () => box.focus();
  box.addEventListener("focus", () => { hint.hidden = true; });
  box.addEventListener("blur", () => { keys.clear(); if (!open) hint.hidden = false; });
  const MOVE = { ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right" };
  box.addEventListener("keydown", (e) => {
    if (MOVE[e.code] || e.code === "Space") e.preventDefault();
    if (open) { if (e.code === "Escape" || (e.code === "Space" && e.target === box)) closePanel(); return; }
    if (MOVE[e.code]) keys.add(MOVE[e.code]);
    if (e.code === "Space" && near) openPanel(near);
  });
  box.addEventListener("keyup", (e) => { if (MOVE[e.code]) keys.delete(MOVE[e.code]); });

  const blocked = (x, y) => {
    for (const [ox, oy] of [[-0.28, -0.22], [0.28, -0.22], [-0.28, 0], [0.28, 0]]) {
      const tx = Math.floor(x + ox), ty = Math.floor(y + oy);
      if (tx < 0 || ty < 0 || tx >= W || ty >= H || SOLID[ty][tx]) return true;
    }
    return false;
  };
  const roomAt = (x, y) => {
    if (y >= 35.5) return { name: "ساحة المقر", sys: "القيادة العامة" };
    if (y >= 20 && y < 24) return { name: "الممر الرئيسي", sys: "" };
    return ROOMS.find((r) => x >= r.r[0] && x < r.r[2] + 1 && y >= r.r[1] && y < r.r[3] + 1) || null;
  };
  function update(dt) {
    let dx = 0, dy = 0;
    if (keys.has("left")) dx -= 1; if (keys.has("right")) dx += 1; if (keys.has("up")) dy -= 1; if (keys.has("down")) dy += 1;
    player.moving = !!(dx || dy);
    if (player.moving) {
      player.dir = dx < 0 ? "left" : dx > 0 ? "right" : dy < 0 ? "up" : "down";
      const sp = (4.8 * dt) / Math.hypot(dx, dy);
      if (!blocked(player.x + dx * sp, player.y)) player.x += dx * sp;
      if (!blocked(player.x, player.y + dy * sp)) player.y += dy * sp;
      player.t += dt;
    }
    near = null; let best = 99;
    for (const it of INTER) { const d = Math.hypot(it.x - player.x, it.y - player.y); if (d < it.r && d < best) { best = d; near = it; } }
    const rm = roomAt(player.x, player.y), label = rm ? `${rm.name}${rm.sys ? " · " + rm.sys : ""}` : "";
    const hud = $("#hudRoom"); if (label && hud.textContent !== label) hud.textContent = label;
    const now = performance.now();
    for (const a of AGENTS) if (now > a.until) { const r = Math.random(); a.st = r < 0.06 ? "hit" : r < 0.62 ? "work" : "idle"; a.until = now + (a.st === "hit" ? 3000 : 1500 + Math.random() * 3500); }
  }

  const CW = 62, CH = 124; // character size on screen (world px)
  function person(who, dir, cx, footY, frame = 0, seated = false) {
    const [kind, o] = PEOPLE[who]; const img = C.image(kind, o, dir, frame);
    if (!img.complete) return;
    if (seated) ctx.drawImage(img, 0, 0, 200, 250, cx - CW / 2, footY - CH * 0.62, CW, CH * 0.625);
    else ctx.drawImage(img, cx - CW / 2, footY - CH, CW, CH);
  }
  let camX = 0, camY = 0;
  function draw(t) {
    camX = Math.max(0, Math.min(W * TILE - VW, player.x * TILE - VW / 2));
    camY = Math.max(0, Math.min(H * TILE - VH, player.y * TILE - VH / 2 - 40));
    ctx.drawImage(st, camX, camY, VW, VH, 0, 0, VW, VH);
    ctx.save(); ctx.translate(-Math.round(camX), -Math.round(camY));
    // live layers: video-wall ticker, agent screens, rack LEDs, car light bars
    ctx.save(); ctx.beginPath(); ctx.rect(3 * TILE + 10, TILE - 30, 14 * TILE - 20, 18); ctx.clip();
    ctx.fillStyle = "#C2002F"; ctx.fillRect(3 * TILE + 10, TILE - 30, 14 * TILE - 20, 18);
    ctx.fillStyle = "#fff"; ctx.font = "700 13px 'Noto Kufi Arabic'"; ctx.direction = "rtl"; ctx.textAlign = "left";
    const msg = "عاجل · 5 مواقع احتيال محظورة · عصابتان · آخر حكم: tamm-refund-uae احتيال 100/100 (إخفاء) · ";
    const off = (t / 18) % 1100; ctx.fillText(msg + msg, 3 * TILE + 10 - 1100 + off, TILE - 16); ctx.restore();
    for (const a of AGENTS) {
      const col = a.st === "hit" ? ((t / 220) % 2 < 1 ? "#C2002F" : "#7a1020") : a.st === "work" ? ((t / 140 + a.x) % 3 < 1.6 ? "#2e9e5b" : "#23824a") : "#4b5566";
      const mx = a.x * TILE + 17, my = (a.y - 1) * TILE + 8;
      ctx.fillStyle = "#1b1f27"; ctx.beginPath(); ctx.roundRect(mx, my, 30, 22, 2); ctx.fill(); ctx.fillStyle = col; ctx.fillRect(mx + 2, my + 2, 26, 16);
      ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.fillRect(mx + 5, my + 5, 12, 2); ctx.fillRect(mx + 5, my + 10, 16, 2);
      ctx.fillStyle = "#2a2f39"; ctx.fillRect(mx + 12, my + 22, 6, 5);
    }
    for (let i = 0; i < 6; i++) for (let r = 0; r < 8; r++) { const on = Math.floor(t / 300 + i * 3 + r * 7) % 5; ctx.fillStyle = on === 0 ? "#C2002F" : on < 3 ? "#2e9e5b" : "#1d6fc4"; ctx.fillRect((14 + i) * TILE + 48, 25 * TILE - 16 + r * 9.5, 4, 3); }
    // sprites sorted by depth
    const list = [];
    for (const s of SEATED) list.push({ y: s.y + 0.5, f: () => person(s.who, "up", s.x * TILE + 32, s.y * TILE + 42, 0, true) });
    for (const n of NPCS) list.push({ y: n.y + 0.85, f: () => person(n.room, n.dir, n.x * TILE + 32, n.y * TILE + 58) });
    for (const e of EXTRAS) list.push({ y: e.y + 0.85, f: () => person(e.who, e.dir, e.x * TILE + 32, e.y * TILE + 58) });
    for (let k = 0; k < 8; k++) { const c = cellRect(k); inmates(CELLS[k].id).forEach((f, i) => {
      const cx = (c.x0 + 0.5 + i) * TILE, fy = (k < 4 ? c.y0 + 2.75 : c.y0 + 2.4) * TILE + Math.sin(t / 500 + i * 2) * 1.5;
      list.push({ y: fy / TILE, f: () => person(["p1", "p2", "p3"][i % 3], k < 4 ? "down" : "up", cx, fy) }); }); }
    const frame = player.moving ? [1, 0, 2, 0][Math.floor(player.t * 8) % 4] : 0;
    list.push({ y: player.y, f: () => {
      person("me", player.dir, player.x * TILE, player.y * TILE, frame);
      ctx.font = "700 12px 'Noto Kufi Arabic'"; ctx.textAlign = "center"; ctx.direction = "rtl"; const tag = "محقق كشّاف"; const tw = ctx.measureText(tag).width + 16;
      ctx.fillStyle = "#082E6D"; ctx.beginPath(); ctx.roundRect(player.x * TILE - tw / 2, player.y * TILE - CH - 26, tw, 20, 10); ctx.fill(); ctx.fillStyle = "#fff"; ctx.fillText(tag, player.x * TILE, player.y * TILE - CH - 11);
    } });
    for (const p of palms) list.push({ y: p.y + 0.4, f: () => paintLive(p) });
    for (const c of FURN.filter((f) => f.t === "car")) list.push({ y: c.y + 2, f: () => { const blink = Math.floor(t / 350) % 2; const lx = c.x * TILE + c.w * TILE / 2 - 6, ly = c.y * TILE + 18 + 30;
      const bx = c.x * TILE + 84, by = c.y * TILE + 42;
      ctx.fillStyle = blink ? "#ff2a4a" : "#6a1020"; ctx.fillRect(bx, by, 14, 22); ctx.fillStyle = blink ? "#0d2b52" : "#3d8bff"; ctx.fillRect(bx, by + 22, 14, 22);
      if (blink) { ctx.fillStyle = "rgba(255,42,74,.18)"; ctx.beginPath(); ctx.arc(bx + 7, by + 11, 40, 0, 7); ctx.fill(); } else { ctx.fillStyle = "rgba(61,139,255,.18)"; ctx.beginPath(); ctx.arc(bx + 7, by + 33, 40, 0, 7); ctx.fill(); } } });
    list.sort((a, b) => a.y - b.y).forEach((s) => s.f());
    // interaction prompt
    if (near && !open) {
      const X = near.x * TILE, Y = (near.kind === "npc" ? near.y - 2.3 : near.y - 1.6) * TILE + Math.sin(t / 200) * 3;
      const label = near.kind === "npc" ? near.npc.name : `زنزانة ${CELLS[near.k].name}`;
      ctx.font = "700 15px 'Noto Kufi Arabic'"; const tw = ctx.measureText(label).width + 104;
      ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.roundRect(X - tw / 2 + 3, Y - 18, tw, 38, 12); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.roundRect(X - tw / 2, Y - 22, tw, 38, 12); ctx.fill();
      ctx.fillStyle = "#135BA6"; ctx.beginPath(); ctx.roundRect(X + tw / 2 - 74, Y - 16, 66, 26, 7); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "700 13px Arial"; ctx.textAlign = "center"; ctx.direction = "ltr"; ctx.fillText("SPACE", X + tw / 2 - 41, Y + 2);
      ctx.fillStyle = "#082E6D"; ctx.font = "700 15px 'Noto Kufi Arabic'"; ctx.direction = "rtl"; ctx.textAlign = "right"; ctx.fillText(label, X + tw / 2 - 84, Y + 3);
    }
    ctx.restore();
    // minimap
    const mw = 240, mh = (H / W) * mw, mx = VW - mw - 14, my = 14;
    ctx.fillStyle = "rgba(8,46,109,.85)"; ctx.beginPath(); ctx.roundRect(mx - 6, my - 6, mw + 12, mh + 12, 10); ctx.fill();
    ctx.drawImage(st, mx, my, mw, mh);
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.strokeRect(mx + (camX / (W * TILE)) * mw, my + (camY / (H * TILE)) * mh, (VW / (W * TILE)) * mw, (VH / (H * TILE)) * mh);
    ctx.fillStyle = "#C2002F"; ctx.beginPath(); ctx.arc(mx + (player.x / W) * mw, my + (player.y / H) * mh, 4.5, 0, 7); ctx.fill(); ctx.strokeStyle = "#fff"; ctx.stroke();
  }
  function paintLive(f) { const save = g; /* palms are drawn on the live layer so people walk under the fronds */
    const cx = f.x * TILE + 32, cy = f.y * TILE + 32;
    ctx.fillStyle = "#7a5532"; ctx.fillRect(cx - 6, cy - 10, 12, 40);
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; ctx.save(); ctx.translate(cx, cy - 40); ctx.rotate(a); ctx.fillStyle = i % 2 ? "#2f7d3e" : "#3f9a4f";
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(40, -16, 86, 4); ctx.quadraticCurveTo(40, 4, 0, 0); ctx.fill(); ctx.restore(); }
    ctx.fillStyle = "#6b4a2b"; ctx.beginPath(); ctx.arc(cx, cy - 40, 8, 0, 7); ctx.fill();
  }
  // palm shadows on the static layer
  for (const p of palms) { g.fillStyle = "rgba(0,0,0,.16)"; g.beginPath(); g.ellipse(p.x * TILE + 62, p.y * TILE + 60, 80, 28, 0.2, 0, 7); g.fill(); }

  let last = performance.now();
  function loop(t) { const dt = Math.min(0.05, (t - last) / 1000); last = t; if (!open) update(dt); draw(t); requestAnimationFrame(loop); }
  requestAnimationFrame(loop);

  /* ======================= system screens ======================= */
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const GANGS = [
    { d: ["consumer-protection-refund.localhost", "tamm-refund-uae.localhost", "adpolice-fines-pay.localhost"], i: "telegram_bot: 7712345678:AAFakeTestToken…" },
    { d: ["etisalat-points.localhost", "aramex-redelivery.localhost"], i: "whatsapp: wa.me/971500000099" },
  ];
  const evidence = (f) => `<div class="cardx"><div>${pill(f.v)} <b>${f.s}/100</b> ${f.cl ? '<span class="tag">إخفاء</span>' : ""} <span class="tag" style="color:#C2002F">محظور</span></div>
    <div class="u">${esc(f.u)}</div><div class="muted">ينتحل: ${esc(f.e)} · 24/11/2026 ${f.t} · بواسطة القواعد</div>
    <ul class="reasons">${f.r.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
    ${f.cl ? `<div class="views"><div><b>هاتف في الإمارات</b><br>TAMM | منصة تم: you are eligible for a refund of AED 1,250. Enter your Emirates ID and card…</div><div><b>أداة فحص</b><br>Mama Huda's Kitchen: the best chicken machboos recipe…</div></div>` : ""}
    <div style="margin-top:6px"><button class="sbtn l">التفاصيل والأدلة</button><button class="sbtn g">إطلاق سراح (سماح)</button><button class="sbtn l">إعادة الفحص</button><button class="sbtn l">صفحة التحذير</button></div></div>`;
  const SCREENS = {
    reception: () => `<h4>لوحة المتابعة</h4><div class="kp">
      <div><b>10</b>روابط مفحوصة</div><div><b>0</b>في الانتظار</div><div class="d"><b>5</b>مواقع محظورة</div><div class="d"><b>5</b>احتيال</div>
      <div><b>0</b>مشبوه</div><div><b>1</b>مواقع تخفي نفسها</div><div><b>4</b>مواقع رسمية</div><div><b>6</b>رسائل</div></div>
      <div class="two"><div class="cardx"><b>مواقع الاحتيال المحظورة</b>${fraud.map((f) => `<div class="u" style="margin-top:4px">${esc(f.u)}</div><div class="muted">${esc(f.e)} · ${f.t}</div>`).join("")}</div>
      <div class="cardx"><b>العصابات</b>${GANGS.map((x, i) => `<div style="margin-top:6px"><b>عصابة ${i + 1}</b> · ${x.d.length} مواقع<br><span class="tag">${esc(x.i)}</span></div>`).join("")}</div></div>
      <div class="muted"><span class="tag">وكيل Claude متوقف (القواعد فقط)</span><span class="tag">بحث جوجل غير متصل</span><span class="tag">50 وكيل</span><span class="tag">الوكلاء جاهزون</span></div>`,
    lab: () => `<h4>فحص رسالة أو رابط</h4><p class="muted">الصق رسالة نصية أو واتساب أو بريداً أو رابطاً. الجهاز يفتح كل رابط مرتين: كهاتف في الإمارات وكأداة فحص.</p>
      <textarea rows="3">TAMM: You are eligible for a refund of AED 1,250. Claim before midnight: http://tamm-refund-uae.localhost:8081/claim</textarea>
      <div style="margin:6px 0 10px"><button class="sbtn">إرسال للوكلاء</button></div>
      <div class="cardx" style="border-color:#C2002F;background:#fef3f2"><b style="color:#C2002F">احتيال: في الرسالة رابط احتيال. لا تفتحه ولا تُدخل أي بيانات.</b></div>${evidence(F[0])}`,
    archive: () => `<h4>النتائج</h4><div style="display:flex;gap:6px;margin-bottom:6px"><input type="text" placeholder="بحث في الروابط والعناوين"><select style="width:180px"><option>كل الأحكام</option><option>احتيال</option><option>مشبوه</option><option>آمن</option><option>رسمي</option></select></div>
      <table><tr><th>الحكم</th><th>الوقت</th><th>الرابط</th><th>الجهة</th><th>المصدر</th><th>الحظر</th></tr>${F.map((f) => `<tr><td>${pill(f.v)}<div class="muted">${f.s}/100</div></td><td>${f.t}</td><td class="u">${esc(f.u)}</td><td>${esc(f.e)}</td><td><span class="tag">${f.src}</span></td><td>${f.v === "fraud" ? '<b style="color:#C2002F">محظور</b>' : "—"}</td></tr>`).join("")}</table>`,
    gangs: () => `<h4>العصابات</h4><p class="muted">مواقع تتشارك بوت تيليجرام أو رقم واتساب أو آيبان أو رقم هاتف أو معرّف تحليلات.</p>
      ${GANGS.map((x, i) => `<div class="cardx"><b>عصابة ${i + 1} · ${x.d.length} مواقع</b><div class="muted">أول ظهور 12:22 · آخر نشاط 12:23</div>
        <svg viewBox="0 0 520 90" style="width:100%;height:90px;margin:6px 0">${x.d.map((d, j) => { const cx = 70 + j * (380 / Math.max(1, x.d.length - 1)); return `<line x1="260" y1="20" x2="${cx}" y2="66" stroke="#C2002F" stroke-width="3"/><rect x="${cx - 64}" y="56" width="128" height="24" rx="6" fill="#fff" stroke="#082E6D" stroke-width="2"/><text x="${cx}" y="72" font-size="10" text-anchor="middle" font-family="Consolas">${d.split(".")[0]}</text>`; }).join("")}<rect x="160" y="6" width="200" height="24" rx="6" fill="#C2002F"/><text x="260" y="22" fill="#fff" font-size="11" text-anchor="middle" font-family="Consolas">${esc(x.i.split(":")[0])}</text></svg>
        ${x.d.map((d) => `<span class="tag u">${d}</span>`).join("")}</div>`).join("")}`,
    dispatch: () => `<h4>الاكتشاف</h4><div class="cardx"><b>بحث جوجل كساكن في أبوظبي</b><div class="muted">النتائج والإعلانات وملخصات الذكاء الاصطناعي ونتائج الخرائط، من هاتف في أبوظبي.</div>
      <div style="display:flex;gap:6px;margin-top:6px"><input type="text" placeholder="مثال: دفع مخالفات شرطة أبوظبي"><button class="sbtn">بحث</button></div><button class="sbtn l" style="margin-top:6px">تشغيل كل السكان الافتراضيين</button></div>
      <div class="two"><div class="cardx"><b>سجلات الشهادات الرقمية</b><div class="muted">نطاقات جديدة تحمل أسماء جهات رسمية.</div><button class="sbtn l">تشغيل</button></div>
      <div class="cardx"><b>قوائم التصيّد العامة (OpenPhish)</b><div class="muted">روابط تصيّد حية تستهدف علامات إماراتية.</div><button class="sbtn l">تشغيل</button></div></div>
      <div class="cardx"><b>سجل البحث</b><div class="muted">لا يوجد بحث بعد (بحث جوجل غير متصل في هذا التشغيل).</div></div>`,
    ops: () => `<h4>الوكلاء · غرفة العمليات</h4><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">العدد <input type="text" value="50" style="width:70px"><button class="sbtn l">تطبيق</button><button class="sbtn g">▶ تشغيل الدورية المستمرة</button><button class="sbtn r">■ إيقاف كل الوكلاء</button></div>
      <div class="dots">${AGENTS.map((a) => `<i class="${a.st === "hit" ? "h" : a.st === "work" ? "w" : ""}"></i>`).join("")}</div>
      <div class="two"><div class="cardx">بحث جوجل هذه الساعة <b>0/20</b><div class="meter"><i style="width:0%"></i></div>تحقيقات Claude هذه الساعة <b>0/60</b><div class="meter"><i style="width:0%"></i></div></div>
      <div class="cardx">التوكنز منذ التشغيل <b>0</b><br>وفّرت الذاكرة <b>0</b> بحث · <b>0</b> تحقيق</div></div>`,
    records: () => `<h4>سجل العمليات</h4><table><tr><th>الوقت</th><th>المستخدم</th><th>العملية</th><th>الهدف</th></tr>
      ${[["12:23:13", "analyst@…", "scan", "3 روابط"], ["12:22:45", "analyst@…", "scan", "adpolice.gov.ae, tamm.abudhabi"], ["12:22:40", "analyst@…", "scan", "karak-cafe.localhost"], ["12:22:30", "analyst@…", "scan", "etisalat-points.localhost"], ["12:22:20", "analyst@…", "scan", "aramex-redelivery.localhost"], ["12:22:15", "analyst@…", "scan", "tamm-refund-uae.localhost"], ["12:22:10", "analyst@…", "scan", "adpolice-fines-pay.localhost"]]
        .map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td class="u">${r[3]}</td></tr>`).join("")}</table>`,
    prison: () => `<h4>المواقع المحظورة · ${fraud.length}</h4><p class="muted">كل موقع هنا محفوظ في قاعدة البيانات. أي رابط جديد على نفس النطاق يُحظر فوراً بدون فحص، ومن يفتحه يرى صفحة التحذير.</p>
      <div style="margin-bottom:6px"><button class="sbtn">تنزيل القائمة (CSV)</button></div>
      <table><tr><th>تاريخ الحظر</th><th>النطاق</th><th>الجهة المنتحلة</th><th>الدرجة</th><th>الزنزانة</th><th>القرار</th></tr>${fraud.map((f) => `<tr><td>${f.t}</td><td class="u">${f.d}</td><td>${esc(f.e)}</td><td>${f.s}/100</td><td>${CELLS.find((c) => c.id === f.c).name}</td><td>تلقائي</td></tr>`).join("")}</table>`,
    cell: (k) => { const list = inmates(CELLS[k].id); return `<h4>زنزانة ${CELLS[k].name} · ${list.length} ${list.length === 1 ? "موقوف" : "موقوفين"}</h4><p class="muted">المواقع المحظورة التي انتحلت: ${CELLS[k].ex}</p>${list.length ? list.map(evidence).join("") : '<div class="cardx muted">الزنزانة فاضية. ما في موقع محظور انتحل هذا النوع من الجهات بعد.</div>'}`; },
  };
  const panel = $("#panel"); let typer = null;
  function openPanel(it) {
    open = it; keys.clear();
    const isCell = it.kind === "cell", room = isCell ? "prison" : it.npc.room;
    const who = isCell ? (inmates(CELLS[it.k].id).length ? "p2" : "prison") : room;
    const pc = $("#portrait").getContext("2d"); pc.clearRect(0, 0, 128, 128);
    const [kind, o] = PEOPLE[who]; pc.drawImage(C.image(kind, o, "down", 0), 30, 0, 140, 140, 0, 0, 128, 128);
    const Rm = ROOMS.find((r) => r.id === room);
    $("#pName").textContent = isCell ? `زنزانة ${CELLS[it.k].name}` : it.npc.name;
    $("#pSys").textContent = `· ${Rm.name} · ${Rm.sys}`;
    const line = isCell ? (inmates(CELLS[it.k].id).length ? "هذولا موقوفين بتهمة الاحتيال. اختر واحد لتشوف الأدلة." : "ما في أحد هنا… لسا.") : LINES[room];
    const say = $("#pSay"); say.textContent = ""; clearInterval(typer); let i = 0;
    typer = setInterval(() => { say.textContent = line.slice(0, ++i); if (i >= line.length) clearInterval(typer); }, 20);
    $("#pBody").innerHTML = isCell ? SCREENS.cell(it.k) : SCREENS[room]();
    panel.classList.add("open"); box.focus();
  }
  function closePanel() { open = null; panel.classList.remove("open"); box.focus(); }
  $("#pClose").onclick = closePanel;
  window.KHQ = { player, openPanel, INTER }; // for testing
})();
