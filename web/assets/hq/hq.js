// Kashshaf HQ: Supabase login, live data from the Kashshaf API, and the system screen behind every NPC and cell.
(async function () {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const VERDICT = { fraud: ["احتيال", "#C2002F"], suspicious: ["مشبوه", "#B54708"], safe: ["آمن", "#067647"], official: ["رسمي", "#135BA6"], unreachable: ["تعذّر الفتح", "#667085"] };
  const pill = (v) => `<span class="pill" style="background:${(VERDICT[v] || ["", "#667085"])[1]}">${(VERDICT[v] || [esc(v)])[0]}</span>`;
  const SOURCE = { message: "رسالة", serp_organic: "نتائج جوجل", serp_ad: "إعلان جوجل", serp_ai_overview: "ملخص الذكاء الاصطناعي",
    maps: "الخرائط", ct_log: "سجل الشهادات", phish_feed: "قائمة تصيّد", analyst: "محلل", gateway: "رابط محمي", seed: "تجربة" };
  const ACTION = { google_search: "بحث جوجل", phish_feed: "قوائم التصيّد", ct_logs: "سجلات الشهادات", budget_reached: "وصل حد البحث", google_error: "خطأ في البحث",
    search_stop: "إيقاف البحث", patrol_start: "تشغيل الدورية", agents_start: "تشغيل الوكلاء", agents_stop: "إيقاف الوكلاء", agents_resize: "تغيير عدد الوكلاء",
    scan: "فحص", override_block: "حظر يدوي", override_allow: "سماح يدوي", override_clear: "إلغاء القرار اليدوي", scan_error: "خطأ في الفحص" };
  const time = (t) => {
    if (!t) return "";
    const d = typeof t === "number" ? new Date(t * 1000) : new Date(t);
    return `<span dir="ltr" title="${d.toISOString()}">${d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })} · ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>`;
  };
  const SORT_KEY = "kashshaf.sort";
  let sort = "new";
  try { sort = localStorage.getItem(SORT_KEY) || "new"; } catch { /* storage off */ }
  const sortSelect = () => `<select data-sort><option value="new"${sort === "new" ? " selected" : ""}>الأحدث أولاً</option><option value="old"${sort === "old" ? " selected" : ""}>الأقدم أولاً</option><option value="risk"${sort === "risk" ? " selected" : ""}>الأخطر أولاً</option></select>`;

  /* ---------------- auth ---------------- */
  const cfg = await fetch("/api/config").then((r) => r.json());
  const sb = supabase.createClient(cfg.supabase_url, cfg.supabase_key);
  let session = (await sb.auth.getSession()).data.session;
  sb.auth.onAuthStateChange((_e, s) => { session = s; });

  async function api(path, body) {
    const res = await fetch(path, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) { showLogin(); throw new Error("انتهت الجلسة، سجّل الدخول من جديد"); }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  }
  const show = (id) => ["login", "intro", "game"].forEach((s) => ($("#" + s).hidden = s !== id));
  function showLogin() { stopPolling(); show("login"); setTimeout(() => $("#email").focus(), 50); }
  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault(); $("#loginError").textContent = ""; $("#loginBtn").disabled = true;
    const { data, error } = await sb.auth.signInWithPassword({ email: $("#email").value, password: $("#password").value });
    $("#loginBtn").disabled = false;
    if (error) { $("#loginError").textContent = "بيانات الدخول غير صحيحة"; return; }
    session = data.session; $("#password").value = ""; showIntro();
  });
  $("#logout").onclick = async () => { await sb.auth.signOut(); session = null; closePanel(); showLogin(); };

  /* ---------------- intro ---------------- */
  function showIntro() {
    show("intro");
    $("#introName").textContent = session.user.email;
    const hero = $("#hero"); hero.innerHTML = "";
    for (const d of ["down", "left", "up", "right"]) { const i = KChars.image("citizen", { skin: "tan" }, d, 0).cloneNode(); i.alt = ""; hero.append(i); }
    setTimeout(() => $("#enterBtn").focus(), 50);
  }
  $("#enterBtn").onclick = () => enterGame();

  /* ---------------- game ---------------- */
  let world = null, lastState = null, timers = [];
  const box = $("#mapbox"), canvas = $("#view");
  function fit() { const r = box.getBoundingClientRect(); canvas.width = Math.max(320, Math.round(r.width)); canvas.height = Math.max(240, Math.round(r.height)); }
  window.addEventListener("resize", () => { if (!$("#game").hidden) fit(); });

  async function enterGame() {
    show("game"); fit();
    if (!world) {
      world = await KHQWorld.create({ canvas, box, onInteract: openPanel, onRoom: (l) => ($("#hudRoom").textContent = l), tag: `محقق كشّاف · ${session.user.email.split("@")[0]}` });
      $("#loading").remove();
      if (new URLSearchParams(location.search).has("debug")) window.KHQ = world; // for automated walk-through tests
      $("#focusHint").onclick = () => box.focus();
      box.addEventListener("focus", () => ($("#focusHint").hidden = true));
      box.addEventListener("blur", () => { if (!open) $("#focusHint").hidden = false; });
      setupTouch();
    }
    box.focus(); startPolling();
  }
  function stopPolling() { timers.forEach(clearInterval); timers = []; }
  function startPolling() {
    stopPolling();
    pollState(); pollSlow();
    timers.push(setInterval(pollState, 2000), setInterval(pollSlow, 6000));
  }

  let registry = null, registryAt = 0, gangsCount = 0;
  async function pollState() {
    try {
      const st = lastState = await api("/api/state");
      const s = st.stats, c = st.control;
      $("#kUrls").textContent = s.urls; $("#kBlocked").textContent = s.blocked; $("#kFraud").textContent = s.fraud;
      $("#kQueue").textContent = s.queued + s.checking; $("#kAgents").textContent = st.agents.length;
      const mode = !c.running ? ["off", "الوكلاء متوقفون"] : c.patrol ? ["patrol", "الدورية تعمل"] : ["on", "الوكلاء جاهزون"];
      $("#kMode").className = `k mode ${mode[0]}`; $("#kMode").textContent = mode[1];
      world?.setAgents(st.agents, c.running);
      if (open?.refresh) open.refresh();
    } catch (e) { console.warn(e); }
  }
  async function pollSlow() {
    try {
      if (!registry || Date.now() - registryAt > 60000) { registry = await api("/api/registry"); registryAt = Date.now(); }
      const [blocked, gangs, latest] = await Promise.all([api("/api/blocked?sort=risk"), api("/api/gangs"), api("/api/findings?verdict=fraud&limit=3")]);
      gangsCount = gangs.length; $("#kGangs").textContent = gangsCount;
      const byCell = world.CELLS.map(() => []);
      for (const b of blocked) byCell[cellOf(b)].push(b);
      world.setInmates(byCell);
      const s = lastState?.stats;
      world.setTicker(`عاجل · ${s?.blocked ?? blocked.length} مواقع محظورة · ${gangsCount} عصابات · ${s?.queued ?? 0} روابط بالانتظار`
        + (latest[0] ? ` · آخر حكم احتيال: ${latest[0].domain} (${latest[0].score}/100)` : "") + " · ");
    } catch (e) { console.warn(e); }
  }
  const catOf = (entityId) => (registry || []).find((e) => e.id === entityId)?.category;
  function cellOf(b) {
    const i = world.CELLS.findIndex((c) => c.id === catOf(b.claimed_entity_id));
    return i < 0 ? world.CELLS.length - 1 : i;
  }

  function setupTouch() {
    if (!matchMedia("(pointer: coarse)").matches) return;
    $("#touch").hidden = false;
    for (const b of document.querySelectorAll("#touch [data-dir]")) {
      const d = b.dataset.dir;
      b.addEventListener("pointerdown", (e) => { e.preventDefault(); world.press(d, true); });
      for (const ev of ["pointerup", "pointerleave", "pointercancel"]) b.addEventListener(ev, () => world.press(d, false));
    }
    $("#actBtn").addEventListener("click", () => world.act());
  }

  /* ---------------- panels ---------------- */
  const LINES = {
    reception: "أهلاً وسهلاً في القيادة العامة! هذي لوحة المتابعة، كل الأرقام لحظة بلحظة.",
    lab: "عندك رسالة مشبوهة؟ الصقها هنا، والجهازين يفتحون كل رابط بعين الهاتف وعين الفاحص.",
    archive: "كل حكم صدر محفوظ في هالرفوف. ابحث، فلتر، وافتح الأدلة.",
    gangs: "شوف الخيوط الحمراء: مواقع تتشارك نفس البوت أو نفس الرقم.",
    dispatch: "من هنا نطلّع الدوريات: بحث جوجل، سجلات الشهادات، وقوائم التصيّد.",
    ops: "هذولا الوكلاء. قل لي كم واحد تبي، وشغّل الدورية أو أوقفها.",
    records: "كل عملية صارت في النظام مكتوبة في هالدفاتر.",
    prison: "التوقيف فيه كل المواقع المحظورة. كل زنزانة لنوع من الجهات المنتحلة.",
  };
  const panel = $("#panel"), pBody = $("#pBody");
  let open = null, typer = null;
  function say(line) {
    const el = $("#pSay"); el.textContent = ""; clearInterval(typer); let i = 0;
    typer = setInterval(() => { el.textContent = line.slice(0, ++i); if (i >= line.length) clearInterval(typer); }, 18);
  }
  function openPanel(it) {
    world.pause(true);
    const isCell = it.kind === "cell", room = isCell ? "prison" : it.npc.room;
    const Rm = world.ROOMS.find((r) => r.id === room);
    world.portrait(isCell ? "p2" : room, $("#portrait"));
    $("#pName").textContent = isCell ? `زنزانة ${world.CELLS[it.k].name}` : it.npc.name;
    $("#pSys").textContent = `· ${Rm.name} · ${Rm.sys}`;
    say(isCell ? "هذولا موقوفين بتهمة الاحتيال. اختر واحد لتشوف الأدلة." : LINES[room]);
    panel.classList.add("open");
    const view = document.createElement("div"); pBody.replaceChildren(view); pBody.scrollTop = 0;
    open = { room, k: it.k, refresh: null, view }; // each panel draws only into its own view, so a late answer never lands in another room
    (isCell ? SCREENS.cell(it.k) : SCREENS[room]())?.catch?.((e) => (view.innerHTML = `<p class="msg err">${esc(e.message)}</p>`));
    $("#pClose").focus();
  }
  function closePanel() { if (!open) return; open = null; panel.classList.remove("open"); clearInterval(typer); world?.pause(false); box.focus(); }
  $("#pClose").onclick = closePanel;
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && open) { e.preventDefault(); closePanel(); } });
  panel.addEventListener("keydown", (e) => { // typing in a screen never moves the player; Esc still closes
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closePanel(); return; }
    e.stopPropagation();
  });
  panel.addEventListener("change", (e) => {
    if (e.target.matches("[data-sort]")) { sort = e.target.value; try { localStorage.setItem(SORT_KEY, sort); } catch { /* this page only */ } open?.reload?.(); }
  });
  const msg = (text, err) => { const m = $("#pMsg", open?.view || pBody); if (m) { m.textContent = text; m.className = `msg${err ? " err" : ""}`; } };
  async function act(btn, fn) { btn.disabled = true; try { await fn(); } catch (e) { msg(e.message, true); } btn.disabled = false; }

  /* finding detail (shared by archive, lab and cells) */
  async function detail(id, back) {
    const me = open, body = me.view, render = (h) => { body.innerHTML = h; pBody.scrollTop = 0; }, msg = (t, e) => { const m = $("#pMsg", body); if (m) { m.textContent = t; m.className = `msg${e ? " err" : ""}`; } };
    render(`<p class="muted"><span class="spin"></span> جارٍ فتح الأدلة…</p>`);
    const d = await api(`/api/finding?id=${id}`);
    const v = d.verdicts[0] || {}, s = d.scans[0] || {}, pv = s.phone_view || {}, bv = s.bot_view || {}, domain = d.url.domain;
    render(`<div class="row"><button class="sbtn l" data-back>→ رجوع</button></div>
      <h4>${pill(v.verdict)} <span class="u">${esc(d.url.url)}</span></h4>
      <p class="muted">الدرجة ${v.score ?? "—"}/100 · ${esc(v.model || "")} · وقت الحكم ${time(v.created_at)} · ${esc(s.agent || "")} · أول ظهور ${time(d.url.first_seen)}${s.domain_created ? ` · تسجيل النطاق ${esc(s.domain_created)}` : ""}</p>
      ${v.ai ? `<div class="ai-box"><b>تحليل وكيل Claude:</b> ${esc(v.ai.summary_ar)}<span class="muted" dir="ltr" style="display:block">${esc(v.ai.summary_en)}</span></div>` : ""}
      <div class="cardx"><b>الأسباب</b><ul class="reasons">${(v.reasons || []).map((r) => `<li>${esc(r.ar)}<span class="en">${esc(r.en)}${r.points ? ` (+${r.points})` : ""}</span></li>`).join("") || "<li>لا يوجد</li>"}</ul></div>
      <div class="cardx"><b>ما يراه الهاتف مقابل ما تراه أداة الفحص ${s.cloaked ? '<span class="pill" style="background:#C2002F">إخفاء</span>' : ""}</b>
        <div class="views"><div><h5>هاتف في الإمارات</h5><b>${esc(pv.title || "")}</b><p dir="auto">${esc((pv.text || pv.error || "").slice(0, 1200))}</p></div>
        <div><h5>أداة فحص</h5><b>${esc(bv.title || "")}</b><p dir="auto">${esc((bv.text || bv.error || "").slice(0, 1200))}</p></div></div></div>
      <div class="cardx"><b>البصمات</b><div>${d.fingerprints.map((f) => `<span class="tag u">${esc(f.fingerprints.kind)}: ${esc(f.fingerprints.value)}</span>`).join("") || '<span class="muted">لا يوجد</span>'}</div></div>
      <div class="cardx"><b>أين ظهر</b>${d.sightings.slice(0, 12).map((x) => `<div class="muted">${SOURCE[x.source] || esc(x.source)}${x.query ? ` · «${esc(x.query)}»` : ""}${x.position ? ` · الترتيب ${x.position}` : ""} · ${time(x.seen_at)}</div>`).join("")}</div>
      <div class="row"><button class="sbtn r" data-ov="block">حظر النطاق</button><button class="sbtn g" data-ov="allow">إطلاق سراح (سماح)</button><button class="sbtn l" data-ov="">إلغاء القرار اليدوي</button>
        <button class="sbtn l" data-rescan>إعادة الفحص</button><a class="sbtn l" href="/blocked?url=${encodeURIComponent(d.url.url)}" target="_blank" rel="noopener">صفحة التحذير</a></div>
      <p class="msg" id="pMsg"></p>`);
    $("[data-back]", body).onclick = back;
    body.querySelectorAll("[data-ov]").forEach((b) => (b.onclick = () => act(b, async () => {
      await api("/api/override", { domain, action: b.dataset.ov || null }); msg("تم حفظ القرار وسُجّل في السجل."); pollSlow();
    })));
    $("[data-rescan]", body).onclick = (e) => act(e.target, async () => { await api("/api/rescan", { url: d.url.url }); msg("أُعيد الرابط للوكلاء. ستظهر النتيجة الجديدة في الأرشيف."); });
    me.refresh = null;
  }

  const SCREENS = {
    async reception() {
      const me = open, body = me.view, render = (h) => { body.innerHTML = h; pBody.scrollTop = 0; }, msg = (t, e) => { const m = $("#pMsg", body); if (m) { m.textContent = t; m.className = `msg${e ? " err" : ""}`; } };
      const draw = async () => {
        const [fraud, gangs] = await Promise.all([api(`/api/findings?verdict=fraud&limit=8&sort=${sort}`), api(`/api/gangs?sort=${sort}`)]);
        if (open?.room !== "reception") return;
        render(`<h4>لوحة المتابعة ${sortSelect()}</h4><div class="kp" id="kp"></div>
          <div class="two"><div class="cardx"><b>مواقع الاحتيال المحظورة</b>${fraud.map((f) => `<div style="margin-top:6px"><span class="u">${esc(f.url)}</span><div class="muted">${esc(f.entity_ar || "")} · ${time(f.created_at)}</div></div>`).join("") || '<p class="muted">لا يوجد بعد.</p>'}</div>
          <div class="cardx"><b>العصابات</b>${gangs.slice(0, 5).map((g, i) => `<div style="margin-top:6px"><b>عصابة ${i + 1}</b> · ${g.domains.length} مواقع <span class="muted">· آخر نشاط ${time(g.last_seen)}</span><div>${g.indicators.slice(0, 3).map((x) => `<span class="tag u">${esc(x)}</span>`).join("")}</div></div>`).join("") || '<p class="muted">لا يوجد بعد.</p>'}</div></div>
          <div id="chips"></div>`);
        kpis();
      };
      const kpis = () => {
        const st = lastState; if (!st || !$("#kp", body)) return; const s = st.stats, c = st.control;
        $("#kp", body).innerHTML = [["روابط مفحوصة", s.urls], ["في الانتظار", s.queued + s.checking], ["مواقع محظورة", s.blocked, "d"], ["احتيال", s.fraud, "d"],
          ["مشبوه", s.suspicious], ["مواقع تخفي نفسها", s.cloaked], ["مواقع رسمية", s.official], ["رسائل", s.messages]].map(([k, v, d]) => `<div class="${d || ""}"><b>${v}</b>${k}</div>`).join("");
        $("#chips", body).innerHTML = [`وكيل Claude ${st.ai ? "يعمل (" + esc(st.model) + ")" : "متوقف (القواعد فقط)"}`, !st.google ? "بحث جوجل غير متصل" : c.serp_exhausted ? "بحث جوجل: انتهى الرصيد" : "بحث جوجل متصل",
          `${st.agents.length} وكيل · ${st.agents.filter((a) => a.status === "working").length} يعمل الآن`, !c.running ? "الوكلاء متوقفون" : c.patrol ? "الدورية تعمل" : "الوكلاء جاهزون"].map((t) => `<span class="tag">${t}</span>`).join("");
      };
      me.refresh = kpis; me.reload = draw; await draw();
    },

    async lab() {
      const me = open, body = me.view, render = (h) => { body.innerHTML = h; pBody.scrollTop = 0; }, msg = (t, e) => { const m = $("#pMsg", body); if (m) { m.textContent = t; m.className = `msg${e ? " err" : ""}`; } };
      let scan = null;
      try { scan = JSON.parse(sessionStorage.getItem("kashshaf.lastScan")); } catch { scan = null; }
      render(`<h4>فحص رسالة أو رابط</h4><p class="muted">الصق رسالة نصية أو واتساب أو بريداً أو رابطاً. يستخرج النظام الروابط ويرسلها للوكلاء فوراً.</p>
        <textarea id="scanText" rows="4" placeholder="مثال: شرطة أبوظبي: لديك مخالفة غير مدفوعة، ادفع الآن عبر http://..."></textarea>
        <div class="row"><button class="sbtn" id="scanBtn">إرسال للوكلاء</button><span class="msg" id="pMsg"></span></div><div id="scanOut"></div>`);
      $("#scanText", body).focus();
      const SEV = { fraud: 4, suspicious: 3, unreachable: 1, safe: 0, official: -1 };
      const out = async () => {
        if (!scan?.links?.length || open?.room !== "lab" || !$("#scanOut", body)) return;
        const items = await api(`/api/scan_result?ids=${scan.links.map((l) => l.url_id).join(",")}`);
        if (!$("#scanOut", body)) return;
        const done = items.filter((x) => !x.pending && x.result).map((x) => x.result.verdict).sort((a, b) => SEV[b] - SEV[a]);
        const waiting = items.some((x) => x.pending), worst = done[0];
        const overall = !items.length ? ["", "لا توجد روابط في هذا النص."] : worst === "fraud" ? ["alert", "احتيال: في الرسالة رابط احتيال. لا تفتحه ولا تُدخل أي بيانات."]
          : waiting ? ["wait", "جارٍ الفحص… تظهر النتيجة خلال ثوانٍ."] : worst === "suspicious" ? ["alert", "مشبوه: راجع الرابط قبل فتحه."]
          : done.length && done.every((v) => v === "official") ? ["ok", "رابط رسمي لجهة حكومية مسجّلة."] : ["ok", "لم يُعثر على احتيال في روابط الرسالة."];
        $("#scanOut", body).innerHTML = `<div class="cardx ${overall[0]}">${overall[1]}</div>` + items.map((x) => x.pending
          ? `<div class="cardx"><span class="spin"></span> <b>${x.status === "checking" ? `يفحصه الآن ${esc((x.agent || "").split("@")[0])}` : "في انتظار وكيل"}</b><div class="u">${esc(x.url)}</div></div>`
          : `<div class="cardx">${pill(x.result?.verdict || "unreachable")} <b>${x.result?.score ?? 0}/100</b> ${x.result?.blocked ? '<span class="tag" style="color:#C2002F">محظور</span>' : ""}${x.result?.cloaked ? '<span class="tag">إخفاء</span>' : ""}
              <div class="u">${esc(x.url)}</div>${x.result?.ai?.summary_ar ? `<div class="ai-box">${esc(x.result.ai.summary_ar)}</div>` : ""}
              <ul class="reasons">${(x.result?.reasons || []).map((r) => `<li>${esc(r.ar)}</li>`).join("")}</ul><button class="sbtn l" data-open="${x.url_id}">التفاصيل والأدلة</button></div>`).join("");
        $("#scanOut", body).querySelectorAll("[data-open]").forEach((b) => (b.onclick = () => detail(+b.dataset.open, () => SCREENS.lab())));
      };
      $("#scanBtn", body).onclick = (e) => act(e.target, async () => {
        const text = $("#scanText", body).value.trim();
        if (!text) { msg("الصق رسالة أو رابطاً أولاً.", true); return; }
        const r = await api("/api/scan", { text });
        scan = { at: r.at, links: r.links };
        try { sessionStorage.setItem("kashshaf.lastScan", JSON.stringify(scan)); } catch { /* memory only */ }
        $("#scanText", body).value = ""; msg(`أُرسل ${r.links.length} رابط للوكلاء.`); await out();
      });
      me.refresh = () => out().catch(console.warn); await out();
    },

    async archive() {
      const me = open, body = me.view, render = (h) => { body.innerHTML = h; pBody.scrollTop = 0; }, msg = (t, e) => { const m = $("#pMsg", body); if (m) { m.textContent = t; m.className = `msg${e ? " err" : ""}`; } };
      render(`<h4>الأرشيف المركزي · النتائج ${sortSelect()}</h4>
        <div class="row"><input type="search" id="q" placeholder="بحث في الروابط والعناوين"><select id="vf"><option value="">كل الأحكام</option><option value="fraud">احتيال</option><option value="suspicious">مشبوه</option><option value="safe">آمن</option><option value="official">رسمي</option><option value="unreachable">تعذّر الفتح</option></select></div>
        <div id="tbl"><p class="muted"><span class="spin"></span></p></div>`);
      const load = async () => {
        const q = new URLSearchParams({ q: $("#q", body)?.value || "", verdict: $("#vf", body)?.value || "", sort, limit: 200 });
        const rows = await api(`/api/findings?${q}`);
        if (!$("#tbl", body)) return;
        $("#tbl", body).innerHTML = `<table><tr><th>الحكم</th><th>الوقت</th><th>الرابط</th><th>الجهة المنتحَلة</th><th>المصدر</th><th>الحظر</th></tr>${rows.map((f) => `<tr class="click" data-open="${f.url_id}">
          <td>${pill(f.verdict)}<div class="muted">${f.score}/100</div>${f.cloaked ? '<span class="tag">إخفاء</span>' : ""}</td><td>${time(f.created_at)}</td>
          <td><span class="u">${esc(f.url)}</span><div class="muted">${esc(f.title || "")}</div></td><td>${esc(f.entity_ar || "—")}</td>
          <td>${(f.sources || []).map((s) => `<span class="tag">${SOURCE[s] || esc(s)}</span>`).join("")}</td><td>${f.blocked ? '<b style="color:#C2002F">محظور</b>' : "—"}</td></tr>`).join("") || '<tr><td colspan="6" class="muted">لا توجد نتائج.</td></tr>'}</table>`;
        $("#tbl", body).querySelectorAll("[data-open]").forEach((r) => (r.onclick = () => detail(+r.dataset.open, () => SCREENS.archive())));
      };
      let t; $("#q", body).oninput = () => { clearTimeout(t); t = setTimeout(() => load().catch((e) => msg(e.message, true)), 300); };
      $("#vf", body).onchange = () => load();
      me.reload = load; await load();
    },

    async gangs() {
      const me = open, body = me.view, render = (h) => { body.innerHTML = h; pBody.scrollTop = 0; }, msg = (t, e) => { const m = $("#pMsg", body); if (m) { m.textContent = t; m.className = `msg${e ? " err" : ""}`; } };
      const gangs = await api(`/api/gangs?sort=${sort}`);
      render(`<h4>إدارة التحريات · العصابات ${sortSelect()}</h4><p class="muted">مواقع احتيال أو مشبوهة تتشارك بوت تيليجرام أو رقم واتساب أو آيبان أو رقم هاتف أو معرّف تحليلات.</p>
        ${gangs.map((x, i) => { const n = x.domains.length; return `<div class="cardx"><b>عصابة ${i + 1} · ${n} مواقع</b> <span class="muted">أول ظهور ${time(x.first_seen)} · آخر نشاط ${time(x.last_seen)}</span>
          <svg viewBox="0 0 560 100" style="width:100%;height:100px;margin:6px 0" role="img" aria-label="روابط العصابة">${x.domains.slice(0, 6).map((d, j) => { const cx = n === 1 ? 280 : 70 + j * (420 / Math.max(1, Math.min(n, 6) - 1)); return `<line x1="280" y1="22" x2="${cx}" y2="70" stroke="#C2002F" stroke-width="3"/><rect x="${cx - 66}" y="62" width="132" height="26" rx="6" fill="#fff" stroke="#082E6D" stroke-width="2"/><text x="${cx}" y="79" font-size="10" text-anchor="middle" font-family="Consolas">${esc(d.split(".")[0].slice(0, 20))}</text>`; }).join("")}<rect x="170" y="6" width="220" height="26" rx="6" fill="#C2002F"/><text x="280" y="23" fill="#fff" font-size="11" text-anchor="middle" font-family="Consolas">${esc((x.indicators[0] || "").split(":")[0])}</text></svg>
          <div>${x.domains.map((d) => `<span class="tag u">${esc(d)}</span>`).join("")}</div><div>${x.indicators.map((d) => `<span class="tag u" style="color:#C2002F">${esc(d)}</span>`).join("")}</div></div>`; }).join("") || '<p class="muted">لا توجد مواقع مرتبطة بعد.</p>'}`);
      me.reload = () => SCREENS.gangs();
    },

    async dispatch() {
      const me = open, body = me.view, render = (h) => { body.innerHTML = h; pBody.scrollTop = 0; }, msg = (t, e) => { const m = $("#pMsg", body); if (m) { m.textContent = t; m.className = `msg${e ? " err" : ""}`; } };
      render(`<h4>الدوريات واللاسلكي · الاكتشاف</h4><div class="cardx" id="runState"></div>
        <div class="cardx"><b>بحث جوجل كساكن في أبوظبي</b><div class="muted">النتائج والإعلانات وملخصات الذكاء الاصطناعي ونتائج الخرائط، من هاتف في أبوظبي.</div>
          <div class="row"><input type="text" id="gq" placeholder="مثال: دفع مخالفات شرطة أبوظبي"><select id="gl"><option value="ar">العربية</option><option value="en">English</option></select><button class="sbtn" id="gBtn">بحث</button></div>
          <button class="sbtn l" data-kind="google">تشغيل كل السكان الافتراضيين</button></div>
        <div class="two"><div class="cardx"><b>سجلات الشهادات الرقمية</b><div class="muted">نطاقات جديدة تحمل أسماء جهات رسمية خلال آخر 14 يوماً.</div><button class="sbtn l" data-kind="ct">تشغيل</button></div>
          <div class="cardx"><b>قوائم التصيّد العامة (OpenPhish)</b><div class="muted">روابط تصيّد حية تستهدف علامات إماراتية.</div><button class="sbtn l" data-kind="feed">تشغيل</button></div></div>
        <p class="msg" id="pMsg"></p>
        <h4>سجل البحث ${sortSelect()}</h4><div id="log"></div>`);
      const KIND = { google: "جولة كل السكان", query: "بحث جوجل", ct: "سجلات الشهادات", feed: "قوائم التصيّد" };
      const status = () => {
        const st = lastState; if (!st || !$("#runState", body)) return; const c = st.control, run = st.discovery.running, l = st.discovery.last;
        $("#runState", body).innerHTML = `${run || c.patrol ? '<span class="spin"></span> ' : ""}<b>${run ? `يعمل الآن: ${KIND[run] || esc(run)}` : c.patrol ? "الدورية المستمرة تعمل" : "لا يوجد بحث يعمل الآن"}</b>
          ${l ? `<div class="muted">${l.error ? `آخر تشغيل: خطأ: ${esc(l.error)}` : `آخر تشغيل (${KIND[l.kind] || esc(l.kind)}): ${l.queued} رابط جديد${l.known != null ? ` · ${l.known} موجود مسبقاً` : ""}`} · ${time(l.at)}</div>` : ""}
          ${run || c.patrol ? '<button class="sbtn r" id="stopS">■ إيقاف البحث</button>' : ""}
          <div class="muted">بحث جوجل هذه الساعة ${c.serp_hour}/${c.serp_cap}${!st.google ? " · غير متصل (لا يوجد SERPAPI_KEY)" : ""}</div>`;
        const s = $("#stopS", body); if (s) s.onclick = () => act(s, async () => { await api("/api/control", { action: "stop_search" }); msg("تم إيقاف البحث. الوكلاء يكملون فحص ما وُجد."); });
      };
      const log = async () => {
        const rows = await api(`/api/searches?sort=${sort}`); if (!$("#log", body)) return;
        $("#log", body).innerHTML = `<table><tr><th>الوقت</th><th>النوع</th><th>البحث</th><th>جديدة</th><th>موجودة</th><th>محظورة الآن</th><th>بواسطة</th></tr>${rows.map((x) => `<tr><td>${time(x.searched_at)}</td>
          <td><span class="tag">${x.purpose === "agent" ? "بحث الوكيل" : "بحث كساكن"}</span>${x.maps ? '<span class="tag">+ الخرائط</span>' : ""}</td><td dir="auto">${esc(x.query)}</td>
          <td>${x.purpose === "agent" ? "—" : x.new_links}</td><td>${x.purpose === "agent" ? "—" : x.known_links}</td><td>${x.purpose === "agent" ? "—" : (x.blocked_now ?? x.known_blocked) || 0}</td><td>${esc(x.searched_by || "")}</td></tr>`).join("") || '<tr><td colspan="7" class="muted">لا يوجد بحث بعد.</td></tr>'}</table>`;
      };
      $("#gBtn", body).onclick = (e) => act(e.target, async () => {
        const query = $("#gq", body).value.trim(); if (!query) { msg("اكتب عبارة البحث.", true); return; }
        const r = await api("/api/discover", { kind: "google", query, hl: $("#gl", body).value });
        msg(r.cached ? `هذا البحث تم ${new Date(r.searched_at).toLocaleString("en-GB")} ووجد ${r.new} رابط جديد و${r.known} موجود (${r.known_blocked} محظور). لم يُصرف بحث جديد.` : "بدأ البحث، ستظهر الروابط في الأرشيف.");
      });
      body.querySelectorAll("[data-kind]").forEach((b) => (b.onclick = () => act(b, async () => { await api("/api/discover", { kind: b.dataset.kind }); msg("بدأ التشغيل."); })));
      me.refresh = status; me.reload = log; status(); await log();
    },

    async ops() {
      const me = open, body = me.view, render = (h) => { body.innerHTML = h; pBody.scrollTop = 0; }, msg = (t, e) => { const m = $("#pMsg", body); if (m) { m.textContent = t; m.className = `msg${e ? " err" : ""}`; } };
      render(`<h4>غرفة العمليات · الوكلاء ${sortSelect()}</h4>
        <div class="row">العدد <input type="number" id="cnt" min="1" max="500" style="width:90px"><button class="sbtn l" id="applyBtn">تطبيق</button>
          <button class="sbtn g" id="patrolBtn">▶ تشغيل الدورية المستمرة</button><button class="sbtn" id="startBtn">▶ تشغيل الوكلاء</button><button class="sbtn r" id="stopBtn">■ إيقاف كل الوكلاء</button></div>
        <p class="msg" id="pMsg"></p><div id="live"></div>`);
      const cnt = $("#cnt", body); cnt.value = lastState?.agents.length || 50;
      const count = () => Math.max(1, Math.min(500, +cnt.value || 50));
      $("#applyBtn", body).onclick = (e) => act(e.target, async () => { await api("/api/agents", { count: count() }); msg(`أصبح عدد الوكلاء ${count()}.`); pollState(); });
      $("#patrolBtn", body).onclick = (e) => act(e.target, async () => { await api("/api/control", { action: "patrol", count: count() }); msg("الدورية المستمرة تعمل."); pollState(); });
      $("#startBtn", body).onclick = (e) => act(e.target, async () => { await api("/api/control", { action: "start" }); msg("الوكلاء يعملون."); pollState(); });
      $("#stopBtn", body).onclick = (e) => act(e.target, async () => { await api("/api/control", { action: "stop" }); msg("توقف كل الوكلاء والبحث. لا يُصرف أي شيء."); pollState(); });
      const live = () => {
        const st = lastState; if (!st || !$("#live", body)) return; const c = st.control;
        const meter = (label, v, cap) => `${label} <b>${v}/${cap}</b><div class="meter"><i class="${v >= cap ? "full" : ""}" style="width:${cap ? Math.min(100, (100 * v) / cap) : 0}%"></i></div>`;
        const act_ = (a) => (a.status === "working" ? a.since : a.last_done) || 0;
        const list = [...st.agents].sort((a, b) => sort === "risk" ? b.hits - a.hits || b.done - a.done : sort === "old" ? act_(a) - act_(b) : act_(b) - act_(a));
        $("#live", body).innerHTML = `<div class="muted">${!c.running ? "الوكلاء متوقفون" : c.patrol ? "الدورية المستمرة تعمل" : "الوكلاء يفحصون ما يصلهم"} · ${st.agents.filter((a) => a.status === "working").length} يعمل الآن</div>
          <div class="dots">${st.agents.map((a) => `<i class="${!c.running ? "p" : a.status === "working" ? "w" : ""}" title="${esc(a.name)}"></i>`).join("")}</div>
          <div class="two"><div class="cardx">${meter("بحث جوجل هذه الساعة", c.serp_hour, c.serp_cap)}${meter("تحقيقات Claude هذه الساعة", c.ai_hour, c.ai_cap)}</div>
          <div class="cardx">التوكنز منذ التشغيل <b>${(c.input_tokens + c.output_tokens).toLocaleString("en")}</b><br>وفّرت الذاكرة <b>${c.serp_saved}</b> بحث · <b>${c.ai_saved}</b> تحقيق</div></div>
          <table><tr><th>الوكيل</th><th>الحالة</th><th>فحص</th><th>احتيال كشفه</th><th>يعمل الآن على</th><th>آخر فحص</th></tr>${list.slice(0, 20).map((a) => `<tr><td>${esc(a.name)}</td>
            <td>${a.status === "working" ? "يعمل" : a.status === "paused" ? "متوقف" : "متاح"}</td><td>${a.done}</td><td>${a.hits ? `<b style="color:#C2002F">${a.hits}</b>` : 0}</td>
            <td><span class="u">${esc(a.job || "")}</span></td><td>${time(a.last_done) || "—"}</td></tr>`).join("")}</table>`;
      };
      me.refresh = live; me.reload = live; live();
    },

    async records() {
      const me = open, body = me.view, render = (h) => { body.innerHTML = h; pBody.scrollTop = 0; }, msg = (t, e) => { const m = $("#pMsg", body); if (m) { m.textContent = t; m.className = `msg${e ? " err" : ""}`; } };
      const log = await api(`/api/audit?sort=${sort}`);
      render(`<h4>قسم السجلات · سجل العمليات ${sortSelect()}</h4><table><tr><th>الوقت</th><th>المستخدم</th><th>العملية</th><th>الهدف</th></tr>${log.map((l) => `<tr><td>${time(l.at)}</td><td>${esc(l.actor)}</td><td>${ACTION[l.action] || esc(l.action)}</td><td><span class="u">${esc(l.target || "")}</span></td></tr>`).join("") || '<tr><td colspan="4" class="muted">لا يوجد.</td></tr>'}</table>`);
      me.reload = () => SCREENS.records();
    },

    async prison() {
      const me = open, body = me.view, render = (h) => { body.innerHTML = h; pBody.scrollTop = 0; }, msg = (t, e) => { const m = $("#pMsg", body); if (m) { m.textContent = t; m.className = `msg${e ? " err" : ""}`; } };
      const rows = await api(`/api/blocked?sort=${sort}`);
      render(`<h4>التوقيف · المواقع المحظورة · ${rows.length} ${sortSelect()}</h4>
        <p class="muted">كل موقع هنا محفوظ في قاعدة البيانات. أي رابط جديد على نفس النطاق يُحظر فوراً بدون فحص، ومن يفتحه يرى صفحة التحذير.</p>
        <div class="row"><input type="search" id="bq" placeholder="بحث في النطاقات"><button class="sbtn" id="csv">تنزيل القائمة (CSV)</button></div><div id="tbl"></div>`);
      const draw = () => {
        const q = $("#bq", body).value.trim().toLowerCase();
        $("#tbl", body).innerHTML = `<table><tr><th>تاريخ الحظر</th><th>النطاق</th><th>الجهة المنتحَلة</th><th>الدرجة</th><th>الزنزانة</th><th>روابط</th><th>مرات الظهور</th><th>القرار</th></tr>${rows.filter((b) => !q || b.domain.includes(q) || (b.entity_ar || "").includes(q)).map((b) => `<tr>
          <td>${time(b.blocked_at)}</td><td><span class="u">${esc(b.domain)}</span></td><td>${esc(b.entity_ar || "—")}</td><td>${b.score}/100</td><td>${world.CELLS[cellOf(b)].name}</td><td>${b.links}</td><td>${b.sightings}</td>
          <td>${b.override === "block" ? `يدوي <div class="muted">${esc(b.override_by || "")}</div>` : "تلقائي"}</td></tr>`).join("") || '<tr><td colspan="8" class="muted">لا توجد مواقع محظورة.</td></tr>'}</table>`;
      };
      $("#bq", body).oninput = draw;
      $("#csv", body).onclick = () => {
        const cols = ["domain", "entity_en", "score", "blocked_at", "first_seen", "last_seen", "links", "sightings", "override"];
        const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob(["﻿" + [cols.join(","), ...rows.map((b) => cols.map((c) => cell(b[c])).join(","))].join("\n")], { type: "text/csv;charset=utf-8" }));
        a.download = `kashshaf-blocked-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
      };
      me.reload = () => SCREENS.prison(); draw();
    },

    async cell(k) {
      const me = open, body = me.view, render = (h) => { body.innerHTML = h; pBody.scrollTop = 0; }, msg = (t, e) => { const m = $("#pMsg", body); if (m) { m.textContent = t; m.className = `msg${e ? " err" : ""}`; } };
      const C = world.CELLS[k];
      const rows = (await api(`/api/blocked?sort=${sort}`)).filter((b) => cellOf(b) === k);
      render(`<h4>زنزانة ${esc(C.name)} · ${rows.length} ${rows.length === 1 ? "موقوف" : "موقوفين"} ${sortSelect()}</h4><p class="muted">المواقع المحظورة التي انتحلت: ${esc(C.ex)}</p>
        ${rows.map((b) => `<div class="cardx"><div>${pill("fraud")} <b>${b.score}/100</b> ${b.override === "block" ? '<span class="tag">حظر يدوي</span>' : ""}</div>
          <div class="u" style="font-size:13px">${esc(b.domain)}</div>
          <div class="muted">ينتحل: ${esc(b.entity_ar || "—")} · محظور منذ ${time(b.blocked_at)} · ${b.links} رابط · ${b.sightings} ظهور</div>
          <div class="row"><button class="sbtn" data-ev="${esc(b.domain)}">الأدلة</button><button class="sbtn g" data-allow="${esc(b.domain)}">إطلاق سراح (سماح)</button>
            ${b.override ? `<button class="sbtn l" data-clear="${esc(b.domain)}">إلغاء القرار اليدوي</button>` : ""}</div></div>`).join("") || '<div class="cardx muted">الزنزانة فاضية. ما في موقع محظور انتحل هذا النوع من الجهات.</div>'}
        <p class="msg" id="pMsg"></p>`);
      const back = () => SCREENS.cell(k);
      body.querySelectorAll("[data-ev]").forEach((b) => (b.onclick = () => act(b, async () => {
        const f = await api(`/api/findings?${new URLSearchParams({ q: b.dataset.ev, verdict: "fraud", limit: 1, sort: "risk" })}`);
        if (!f[0]) { msg("لم أجد حكماً لهذا النطاق.", true); return; }
        await detail(f[0].url_id, back);
      })));
      body.querySelectorAll("[data-allow],[data-clear]").forEach((b) => (b.onclick = () => act(b, async () => {
        await api("/api/override", { domain: b.dataset.allow || b.dataset.clear, action: b.dataset.allow ? "allow" : null });
        await pollSlow(); await back();
      })));
      me.reload = back;
    },
  };

  /* ---------------- start ---------------- */
  if (session) { const { data } = await sb.auth.getUser(); if (!data?.user) session = null; }
  session ? showIntro() : showLogin();
})();
