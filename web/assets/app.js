// Kashshaf analyst dashboard. Login with Supabase Auth; every API call carries the analyst's access token.
(async function () {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const VERDICT = { fraud: "احتيال", suspicious: "مشبوه", safe: "آمن", official: "رسمي", unreachable: "تعذّر الفتح" };
  const SOURCE = { message: "رسالة", serp_organic: "نتائج جوجل", serp_ad: "إعلان جوجل", serp_ai_overview: "ملخص الذكاء الاصطناعي",
    maps: "الخرائط", ct_log: "سجل الشهادات", phish_feed: "قائمة تصيّد", analyst: "محلل", gateway: "رابط محمي", seed: "تجربة", import: "استيراد ملف" };
  const pill = (v) => `<span class="pill v-${esc(v)}">${VERDICT[v] || esc(v)}</span>`;
  // Date and time everywhere, e.g. 23/11/2026 · 3:24:56 م. Accepts ISO strings or Unix seconds.
  const time = (t) => {
    if (!t) return "";
    const d = typeof t === "number" ? new Date(t * 1000) : new Date(t);
    const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
    const clock = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    return `<span class="ts" dir="ltr" title="${d.toISOString()}">${date} · ${clock}</span>`;
  };
  const ACTION = { google_search: "بحث جوجل", phish_feed: "قوائم التصيّد", ct_logs: "سجلات الشهادات", budget_reached: "وصل حد البحث",
    google_error: "خطأ في البحث", search_stop: "إيقاف البحث", patrol_start: "تشغيل الدورية" };

  const cfg = await fetch("/api/config").then((r) => r.json());
  const sb = supabase.createClient(cfg.supabase_url, cfg.supabase_key);
  let session = (await sb.auth.getSession()).data.session;
  let tab = "overview", timer = null;

  // One sort for every list on every page, remembered in this browser (the operations room reads it too).
  const SORT_KEY = "kashshaf.sort", SORT_LABEL = { new: "الأحدث أولاً", old: "الأقدم أولاً", risk: "الأخطر أولاً" };
  let sort = "new";
  try { sort = localStorage.getItem(SORT_KEY) || "new"; } catch { /* storage off: default order */ }
  if (!SORT_LABEL[sort]) sort = "new";

  async function api(path, body) {
    const res = await fetch(path, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) { showLogin(); throw new Error("login required"); }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  }

  // ---- auth --------------------------------------------------------------
  function showLogin() { $("#app").hidden = true; $("#login").hidden = false; clearInterval(timer); }
  function showApp() { $("#login").hidden = true; $("#app").hidden = false; $("#userEmail").textContent = session.user.email; refresh(); timer = setInterval(refresh, 3000); window.KashshafTour?.maybeStart(); }
  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#loginError").textContent = "";
    const { data, error } = await sb.auth.signInWithPassword({ email: $("#email").value, password: $("#password").value });
    if (error) { $("#loginError").textContent = "بيانات الدخول غير صحيحة"; return; }
    session = data.session; showApp();
  });
  $("#logout").onclick = async () => { await sb.auth.signOut(); session = null; showLogin(); };
  sb.auth.onAuthStateChange((_e, s) => { session = s; });

  // ---- tabs --------------------------------------------------------------
  $("#nav").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-tab]");
    if (!b) return;
    tab = b.dataset.tab;
    document.querySelectorAll("#nav button").forEach((x) => x.classList.toggle("active", x === b));
    document.querySelectorAll("[data-view]").forEach((v) => (v.hidden = v.dataset.view !== tab));
    refresh();
  });

  // ---- renderers ---------------------------------------------------------
  function findingRow(f, review = false) {
    // One result = one card: verdict | link and facts | decision. It wraps instead of scrolling sideways.
    const sources = (f.sources || []).map((s) => `<span class="tag">${SOURCE[s] || esc(s)}</span>`).join("");
    return `<article class="result v-edge-${esc(f.verdict)}${review ? " result-review" : ""}" role="listitem">
      <div class="result-verdict">${pill(f.verdict)}<div class="result-score">${f.score}<small>/100</small></div>
        ${f.cloaked ? '<span class="tag">إخفاء</span>' : ""}</div>
      <div class="result-main">
        <span class="url">${esc(f.url)}</span>
        ${f.title ? `<div class="result-title">${esc(f.title)}</div>` : ""}
        <div class="result-meta">
          <span><span class="muted">الجهة المنتحَلة:</span> ${esc(f.entity_ar || "—")}</span>
          <span><span class="muted">المصدر:</span> ${sources || "—"} <span class="muted">· ${f.sightings} ظهور</span></span>
          <span>${time(f.created_at)}</span>
        </div>
      </div>
      <div class="result-side">
        <div>${f.pending_review ? '<span class="pending">⏳ محظور احترازياً</span><div class="muted small">بانتظار مراجعة محلل</div>'
          : f.blocked ? '<span class="blocked">⛔ محظور</span>' : '<span class="muted">غير محظور</span>'}
          ${f.override ? `<div class="muted small">قرار المحلل: ${f.override === "block" ? "احتيال" : "سماح"}</div>` : ""}</div>
        <button class="btn btn-sm" data-open="${f.url_id}">${review ? "الأدلة كاملة" : "التفاصيل"}</button>
        ${review ? decisionButtons(f.domain, f.claimed_entity_id) : ""}
      </div></article>`;
  }

  // An analyst's decision on a site blocked pending review.
  function decisionButtons(domain, entity) {
    const d = esc(domain);
    return `<div class="decide">
      <button class="btn btn-sm btn-ok" data-decide="allow" data-domain="${d}">آمن · رفع الحظر</button>
      ${entity ? `<button class="btn btn-sm" data-decide="official" data-domain="${d}">رسمي</button>` : ""}
      <button class="btn btn-sm btn-danger" data-decide="block" data-domain="${d}">احتيال · تثبيت الحظر</button></div>`;
  }
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-decide]");
    if (!b) return;
    b.closest(".decide").querySelectorAll("button").forEach((x) => (x.disabled = true));
    try {
      await api("/api/override", { domain: b.dataset.domain, action: b.dataset.decide });
    } catch (err) {
      alert(err.message);
    }
    refresh();
  });

  // Every 3 seconds: the status (from /api/state) and the current tab's list load side by side.
  let lastState = null;
  async function refresh() {
    if (!session) return;
    await Promise.all([refreshState(), loadList()]);
  }

  async function refreshState() {
    const t = tab;
    try {
      const st = lastState = await api("/api/state");
      const s = st.stats;
      $("#statusStrip").innerHTML = [
        [`وكيل Claude ${st.ai ? "يعمل" : "متوقف (القواعد فقط)"}`, st.ai],
        [!st.google ? "بحث جوجل غير متصل" : st.control.serp_exhausted ? "بحث جوجل: انتهى الرصيد" : "بحث جوجل متصل", st.google && !st.control.serp_exhausted],
        [`${st.agents.length} وكيل · ${st.agents.filter((a) => a.status === "working").length} يعمل الآن`, true],
        [st.discovery.running ? `جارٍ الاكتشاف: ${st.discovery.running}` : "لا يوجد اكتشاف قيد التشغيل", !!st.discovery.running],
        [!st.control.running ? "الوكلاء متوقفون" : st.control.patrol ? "الدورية المستمرة تعمل" : "الوكلاء جاهزون", st.control.running],
      ].map(([text, on]) => `<span class="chip ${on ? "on" : "off"}">${esc(text)}</span>`).join("");

      $("#reviewCount").hidden = !s.review;
      $("#reviewCount").textContent = s.review;
      if (t === "overview") {
        $("#kpis").innerHTML = [["روابط مفحوصة", s.urls], ["في الانتظار", s.queued + s.checking], ["مواقع محظورة", s.blocked, "danger"], ["بانتظار المراجعة", s.review, "warn"],
          ["احتيال", s.fraud, "danger"], ["مشبوه", s.suspicious], ["مواقع تخفي نفسها", s.cloaked], ["مواقع رسمية", s.official], ["رسائل", s.messages]]
          .map(([k, v, c]) => `<div class="kpi ${c || ""}"><b>${v}</b><span>${k}</span></div>`).join("");
      }
      if (t === "agents") {
        const c = st.control;
        $("#stopBtn").hidden = !c.running; $("#startBtn").hidden = c.running;
        $("#runState").textContent = !c.running ? "· متوقفون" : c.patrol ? "· الدورية تعمل" : "· يعملون";
        $("#runState").className = `run-state ${c.running ? "on" : "off"}`;
        $("#budgetLine").textContent = `هذه الساعة: ${c.serp_hour}/${c.serp_cap} بحث جوجل · ${c.ai_hour}/${c.ai_cap} تحقيق Claude · `
          + `التوكنز منذ تشغيل السيرفر: ${(c.input_tokens + c.output_tokens).toLocaleString("en")} · `
          + `وفّرت الذاكرة: ${c.serp_saved} بحث و${c.ai_saved} تحقيق`;
        $("#agentsGrid").innerHTML = st.agents.map((a) => `<div class="agent-dot ${a.status}" title="${esc(a.name)}"></div>`).join("");
        renderAgents(st.agents);
      }
      if (t === "discover") {
        const c = st.control, run = st.discovery.running;
        const KIND = { google: "جولة كل السكان", query: "بحث جوجل", ct: "سجلات الشهادات", feed: "قوائم التصيّد" };
        const searching = !!run || c.patrol;
        $("#searchState").innerHTML = run ? `يعمل الآن: ${KIND[run] || esc(run)}${c.patrol ? " + الدورية المستمرة" : ""}`
          : c.patrol ? `الدورية المستمرة تعمل منذ ${time(c.patrol_since)}` : "لا يوجد بحث يعمل الآن";
        $("#searchDot").className = `dot ${searching ? "on" : ""}`;
        $("#stopSearchBtn").hidden = !searching;
        $("#searchRun").classList.toggle("active", searching);
        const l = st.discovery.last;
        if (l && !$("#discoverMsg").dataset.keep) $("#discoverMsg").innerHTML = l.error ? `خطأ: ${esc(l.error)} · ${time(l.at)}`
          : `آخر تشغيل (${KIND[l.kind] || esc(l.kind)}): ${l.queued} رابط جديد${l.known != null ? ` · ${l.known} موجود مسبقاً لم يُعد فحصه` : ""} · ${time(l.at)}`;
      }
    } catch (e) { console.warn(e); }
  }

  // Newest: agents working now (latest start first), then the latest to finish. Oldest: the reverse.
  // Most dangerous: the agents that caught the most fraud. Agents that have not worked yet stay last.
  function renderAgents(list) {
    const act = (a) => (a.status === "working" ? a.since : a.last_done) || 0;
    const when = (a) => (a.status === "working" ? 1e12 : 0) + act(a); // working now counts as the newest
    const agents = [...list].sort((a, b) => !act(a) - !act(b)
      || (sort === "risk" ? b.hits - a.hits || b.done - a.done : sort === "old" ? when(a) - when(b) : when(b) - when(a))
      || a.id - b.id);
    $("#agentsBody").innerHTML = agents.map((a) => `<tr><td>${esc(a.name)}</td><td>${a.status === "working" ? "يعمل" : a.status === "paused" ? "متوقف" : "متاح"}</td>
      <td>${a.done}</td><td>${a.hits ? `<span class="blocked">${a.hits}</span>` : 0}</td><td><span class="url">${esc(a.job || "")}</span></td>
      <td class="nowrap">${time(a.since) || "—"}</td><td class="nowrap">${time(a.last_done) || "—"}</td></tr>`).join("");
  }

  // The current tab's list in the chosen order. Also runs on its own, right away, when the sort changes.
  async function loadList() {
    const t = tab, asked = sort;
    const stale = () => asked !== sort || t !== tab; // a newer load will draw it
    try {
      if (t === "overview") {
        const [fraud, gangs] = await Promise.all([api(`/api/findings?verdict=fraud&limit=8&sort=${asked}`), api(`/api/gangs?sort=${asked}`)]);
        if (stale()) return;
        document.querySelectorAll(".sort-note").forEach((n) => (n.textContent = `· ${SORT_LABEL[asked]}`));
        $("#latestFraud").innerHTML = fraud.map((f) => `<div class="list-item"><span class="url">${esc(f.url)}</span>
          <span class="muted">${esc(f.entity_ar || "")} · ${time(f.created_at)}</span> <button class="link" data-open="${f.url_id}">التفاصيل</button></div>`).join("") || '<p class="empty">لا يوجد بعد.</p>';
        $("#topGangs").innerHTML = gangs.slice(0, 5).map((g, i) => `<div class="list-item"><b>عصابة ${i + 1}</b> · ${g.domains.length} مواقع
          <span class="muted">· آخر نشاط ${time(g.last_seen)}</span>
          <div>${g.indicators.slice(0, 3).map((x) => `<span class="tag">${esc(x)}</span>`).join("")}</div></div>`).join("") || '<p class="empty">لا يوجد بعد.</p>';
      }
      if (t === "findings") {
        const q = new URLSearchParams({ q: $("#search").value, verdict: $("#verdictFilter").value, sort: asked });
        const rows = await api(`/api/findings?${q}`);
        if (stale()) return;
        $("#findingsBody").innerHTML = rows.map(findingRow).join("") || '<p class="empty">لا توجد نتائج.</p>';
      }
      if (t === "review") {
        const rows = await api(`/api/findings?verdict=review&sort=${asked}`);
        if (stale()) return;
        // one card per site: its most dangerous link
        const seen = new Set(), sites = rows.filter((f) => !seen.has(f.domain) && seen.add(f.domain));
        $("#reviewTotal").textContent = `· ${sites.length}`;
        $("#reviewBody").innerHTML = sites.map((f) => findingRow(f, true)).join("")
          || '<p class="empty">لا توجد مواقع بانتظار المراجعة.</p>';
      }
      if (t === "gangs") {
        const gangs = await api(`/api/gangs?sort=${asked}`);
        if (stale()) return;
        $("#gangsList").innerHTML = gangs.map((g, i) => `<div class="gang"><h3>عصابة ${i + 1} · ${g.domains.length} مواقع</h3>
          <p class="muted gang-time">أول ظهور ${time(g.first_seen)} · آخر نشاط ${time(g.last_seen)}</p>
          ${g.domains.map((d) => `<span class="url">${esc(d)}</span>`).join("")}
          <div>${g.indicators.map((x) => `<span class="tag">${esc(x)}</span>`).join("")}</div></div>`).join("") || '<p class="empty">لا توجد مواقع مرتبطة بعد.</p>';
      }
      if (t === "blocked") {
        const rows = await api(`/api/blocked?sort=${asked}`);
        if (stale()) return;
        blockedRows = rows;
        renderBlocked();
      }
      if (t === "scan") await Promise.all([updateScan(), updateImport()]);
      if (t === "audit") {
        const log = await api(`/api/audit?sort=${asked}`);
        if (stale()) return;
        $("#auditBody").innerHTML = log.map((l) => `<tr><td>${time(l.at)}</td><td>${esc(l.actor)}</td><td>${esc(l.action)}</td>
          <td><span class="url">${esc(l.target || "")}</span></td></tr>`).join("");
      }
      if (t === "discover") {
        const log = await api(`/api/searches?sort=${asked}`);
        if (stale()) return;
        $("#searchLogBody").innerHTML = log.map((x) => `<tr><td class="nowrap">${time(x.searched_at)}</td>
          <td>${x.purpose === "agent" ? '<span class="tag">بحث الوكيل</span>' : '<span class="tag">بحث كساكن</span>'}${x.maps ? '<span class="tag">+ الخرائط</span>' : ""}</td>
          <td dir="auto">${esc(x.query)}</td><td>${x.purpose === "agent" ? "—" : x.new_links}</td><td>${x.purpose === "agent" ? "—" : x.known_links}</td>
          <td>${x.purpose === "agent" ? "—" : (x.blocked_now ?? x.known_blocked) ? `<span class="blocked">${x.blocked_now ?? x.known_blocked}</span>` : 0}${x.suspicious_now ? `<div class="muted">+${x.suspicious_now} مشبوه</div>` : ""}</td>
          <td>${esc(x.searched_by || "")}</td></tr>`).join("") || '<tr><td colspan="7" class="empty">لا يوجد بحث بعد.</td></tr>';
      }
    } catch (e) { console.warn(e); }
  }

  // ---- check a message or link: only the latest check is shown, under the form ----
  const SCAN_KEY = "kashshaf.lastScan";
  const SEV = { fraud: 4, suspicious: 3, unreachable: 1, safe: 0, official: -1 };
  let lastScan = null, lastScanKey = "";
  try { lastScan = JSON.parse(sessionStorage.getItem(SCAN_KEY)); } catch { lastScan = null; }
  if (!Array.isArray(lastScan?.links)) lastScan = null;

  $("#scanBtn").onclick = async () => {
    const text = $("#scanText").value.trim();
    $("#scanMsg").textContent = "";
    if (!text) { $("#scanMsg").textContent = "الصق رسالة أو رابطاً أولاً."; return; }
    $("#scanBtn").disabled = true;
    try {
      const r = await api("/api/scan", { text });
      lastScan = { at: r.at, text, links: r.links }; // replaces the previous check
      lastScanKey = "";
      try { sessionStorage.setItem(SCAN_KEY, JSON.stringify(lastScan)); } catch { /* storage off: keep it in memory */ }
      $("#scanText").value = "";
      renderScan();
      await updateScan();
    } catch (e) { $("#scanMsg").textContent = e.message; }
    $("#scanBtn").disabled = false;
  };

  async function updateScan() {
    const scan = lastScan;
    if (!scan?.links.length) return renderScan();
    const items = await api(`/api/scan_result?ids=${scan.links.map((l) => l.url_id).join(",")}`);
    if (scan !== lastScan) return; // a newer check replaced this one while we waited: drop the old answer
    const key = JSON.stringify(items);
    if (key === lastScanKey) return; // nothing changed: leave the page as it is
    lastScanKey = key; lastScan.items = items; renderScan();
    try { sessionStorage.setItem(SCAN_KEY, JSON.stringify(lastScan)); } catch { /* storage off: keep it in memory */ }
  }

  function renderScan() {
    const box = $("#scanResult");
    box.hidden = !lastScan;
    if (!lastScan) return;
    const fromDb = new Set(lastScan.links.filter((l) => l.from_db).map((l) => l.url_id));
    const at = (x) => (x.result?.created_at ? Date.parse(x.result.created_at) : 0);
    const items = [...(lastScan.items || lastScan.links.map((l) => ({ ...l, pending: true, status: "queued" })))]
      .sort((a, b) => b.pending - a.pending || (sort === "risk"
        ? (SEV[b.result?.verdict] ?? -2) - (SEV[a.result?.verdict] ?? -2) || (b.result?.score ?? 0) - (a.result?.score ?? 0)
        : sort === "old" ? at(a) - at(b) : at(b) - at(a)));
    const done = items.filter((x) => !x.pending && x.result).map((x) => x.result.verdict);
    const worst = done.sort((a, b) => SEV[b] - SEV[a])[0];
    const waiting = items.some((x) => x.pending);

    let overall;
    if (!items.length) overall = ["none", "لا توجد روابط في هذا النص لفحصها."];
    else if (worst === "fraud") overall = ["v-fraud", "احتيال: في الرسالة رابط احتيال. لا تفتحه ولا تُدخل أي بيانات."];
    else if (waiting) overall = ["pending", "جارٍ الفحص… تظهر النتيجة هنا خلال ثوانٍ، وتحقيق وكيل Claude قد يأخذ دقيقة."];
    else if (worst === "suspicious") overall = ["v-suspicious", "مشبوه: راجع الرابط قبل فتحه، ولا تُدخل أي بيانات."];
    else if (worst === "unreachable") overall = ["v-unreachable", "تعذّر فتح الرابط، ربما توقف الموقع."];
    else if (done.length && done.every((v) => v === "official")) overall = ["v-official", "رابط رسمي لجهة حكومية مسجّلة."];
    else overall = ["v-safe", "لم يُعثر على احتيال في روابط الرسالة."];

    const by = (v) => v.model === "database" ? "قاعدة البيانات" : v.model === "rules" ? "القواعد"
      : v.model ? "وكيل Claude" : v.verdict === "official" ? "السجل الرسمي" : "";
    // an official site belongs to the entity; only fraud and suspicious sites impersonate it
    const entity = (v) => !v.entity_ar ? "" : v.verdict === "official" ? `الموقع الرسمي لـ${esc(v.entity_ar)} · `
      : ["fraud", "suspicious"].includes(v.verdict) ? `ينتحل: ${esc(v.entity_ar)} · ` : `الجهة المذكورة: ${esc(v.entity_ar)} · `;
    const link = (x) => {
      if (x.pending) return `<div class="scan-link pending"><div class="scan-link-head"><span class="spin" aria-hidden="true"></span>
          <b>${x.status === "checking" ? `يفحصه الآن ${esc((x.agent || "").split("@")[0])}` : "في انتظار وكيل"}</b></div>
          <span class="url">${esc(x.url)}</span></div>`;
      const v = x.result;
      if (!v) return `<div class="scan-link"><div class="scan-link-head">${pill("unreachable")}</div>
          <span class="url">${esc(x.url)}</span><p class="muted">تعذّر فحص الرابط.</p></div>`;
      return `<div class="scan-link ${esc(v.verdict)}">
          <div class="scan-link-head">${pill(v.verdict)}<b class="score">${v.score}/100</b>
            ${v.blocked ? '<span class="blocked">محظور</span>' : ""}${v.cloaked ? '<span class="tag">إخفاء</span>' : ""}
            ${fromDb.has(x.url_id) ? '<span class="tag">فُحص سابقاً، من قاعدة البيانات</span>' : ""}</div>
          <span class="url">${esc(x.url)}</span>
          <p class="muted">${entity(v)}وقت الحكم ${time(v.created_at)}${by(v) ? ` · بواسطة ${by(v)}` : ""}</p>
          ${v.ai?.summary_ar ? `<div class="ai-box"><b>تحليل الوكيل:</b> ${esc(v.ai.summary_ar)}</div>` : ""}
          ${(v.reasons || []).length ? `<ul class="reasons">${v.reasons.map((r) => `<li>${esc(r.ar)}</li>`).join("")}</ul>` : ""}
          <div class="row-actions"><button class="btn btn-sm" data-open="${x.url_id}">التفاصيل والأدلة</button>
            ${v.blocked ? `<a class="btn btn-sm" href="/blocked?url=${encodeURIComponent(x.url)}" target="_blank" rel="noopener">صفحة التحذير</a>` : ""}</div>
        </div>`;
    };

    const text = lastScan.text || "";
    box.className = `panel scan-result ${waiting && worst !== "fraud" ? "pending" : worst || "none"}`;
    box.innerHTML = `<div class="scan-result-head"><h2>نتيجة الفحص</h2>
        <span class="muted">${time(lastScan.at)} · ${items.length} رابط</span></div>
      <p class="scan-text" dir="auto">${esc(text.length > 240 ? `${text.slice(0, 240)}…` : text)}</p>
      <div class="scan-overall ${overall[0]}">${overall[1]}</div>
      ${items.map(link).join("")}`;
  }
  renderScan();

  // ---- actions -----------------------------------------------------------
  $("#googleBtn").onclick = async () => {
    const query = $("#googleQuery").value.trim();
    if (!query) return;
    await googleSearch(query, false);
  };
  async function googleSearch(query, force) {
    const msg = $("#discoverMsg");
    try {
      const r = await api("/api/discover", { kind: "google", query, hl: $("#googleLang").value, force });
      if (r.cached) {
        msg.dataset.keep = "1";
        msg.innerHTML = `هذا البحث تم ${time(r.searched_at)} ووجد ${r.new} رابط جديد و${r.known} موجود مسبقاً (${r.known_blocked} محظور). `
          + `لم يُصرف بحث جديد. <button class="link" id="forceSearch">ابحث مرة ثانية على أي حال</button>`;
        $("#forceSearch").onclick = () => { delete msg.dataset.keep; googleSearch(query, true); };
      } else { delete msg.dataset.keep; msg.textContent = "بدأ البحث، ستظهر الروابط في النتائج."; }
    } catch (e) { delete msg.dataset.keep; msg.textContent = e.message; }
  }

  // ---- import a file of links -------------------------------------------------
  // Only the latest import is shown (like the latest check). Its id survives a reload.
  const IMPORT_KEY = "kashshaf.lastImport";
  let lastImport = null, importData = null, importKey = "", onlyMistakes = false;
  try { lastImport = JSON.parse(sessionStorage.getItem(IMPORT_KEY) || "null"); } catch (e) { lastImport = null; }
  const pct = (x) => (x == null ? "—" : `${Math.round(x * 1000) / 10}%`);
  const EXPECTED = { fraud: "احتيال", legit: "سليم" };

  async function sendFile(file) {
    const msg = $("#importMsg");
    msg.textContent = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { msg.textContent = "الملف أكبر من 10 ميجابايت."; return; }
    msg.className = "muted"; msg.textContent = `جارٍ رفع ${file.name}…`;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const r = await api("/api/import", { file_name: file.name, data: btoa(bin) });
      lastImport = { id: r.import.id, url_column: r.url_column, label_column: r.label_column };
      try { sessionStorage.setItem(IMPORT_KEY, JSON.stringify(lastImport)); } catch (e) { /* private mode */ }
      msg.textContent = ""; onlyMistakes = false; importKey = "";
      await updateImport();
    } catch (err) {
      msg.className = "error"; msg.textContent = err.message;
    }
    $("#importFile").value = "";
  }
  $("#importFile").addEventListener("change", (e) => sendFile(e.target.files[0]));
  const dz = $("#dropzone");
  ["dragenter", "dragover"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("over"); }));
  dz.addEventListener("drop", (e) => sendFile(e.dataTransfer.files[0]));

  async function updateImport() {
    if (!lastImport) return;
    const asked = lastImport;
    const data = await api(`/api/import_result?id=${asked.id}`);
    if (asked !== lastImport) return;  // a newer import started meanwhile
    importData = data;
    const key = JSON.stringify([data.done, data.rows.map((r) => [r.verdict, r.blocked, r.pending_review]), sort, onlyMistakes]);
    if (key !== importKey) { importKey = key; renderImport(); }
  }

  const wrong = (r) => r.expected && !r.pending && (r.expected === "fraud") !== r.blocked;
  function renderImport() {
    const d = importData, b = d.import, m = d.metrics, box = $("#importResult");
    box.hidden = false;
    const at = (r) => (r.checked_at ? Date.parse(r.checked_at) : 0);
    let rows = d.rows.filter((r) => !onlyMistakes || wrong(r));
    rows = sort === "risk" ? [...rows].sort((x, y) => (SEV[y.verdict] ?? -2) - (SEV[x.verdict] ?? -2) || (y.score || 0) - (x.score || 0))
      : [...rows].sort((x, y) => (y.pending - x.pending) || (sort === "old" ? at(x) - at(y) : at(y) - at(x)));
    const shown = rows.slice(0, 300);
    const done = d.done === d.total;
    box.innerHTML = `
      <div class="import-head">
        <div><b>${esc(b.file_name)}</b>
          <div class="muted small">رفعه ${esc(b.imported_by)} · ${time(b.at)} · ${b.total} رابط${b.skipped ? ` · تجاهلنا ${b.skipped} سطراً بلا رابط أو مكرراً` : ""}
          · عمود الروابط: ${esc(String(lastImport.url_column ?? "—"))}${lastImport.label_column ? ` · عمود التصنيف: ${esc(String(lastImport.label_column))}` : ""}</div></div>
        <button class="btn btn-sm" id="importExport">تصدير النتائج CSV</button>
      </div>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${d.total}" aria-valuenow="${d.done}">
        <span style="width:${d.total ? (100 * d.done) / d.total : 0}%"></span></div>
      <p class="muted small">${done ? "اكتمل فحص كل الروابط." : `فُحص ${d.done} من ${d.total} · الوكلاء يعملون على الباقي`}</p>
      <div class="import-counts">
        ${["fraud", "suspicious", "safe", "official", "unreachable"].map((v) => `<span>${pill(v)} <b>${d.counts[v] || 0}</b></span>`).join("")}
        <span><span class="blocked">⛔ محظور</span> <b>${d.blocked}</b></span>
      </div>
      ${m ? `<div class="metrics">
        <div class="metric"><b>${pct(m.precision)}</b><span>الدقة (Precision)</span><small>من المحظور فعلاً احتيال</small></div>
        <div class="metric"><b>${pct(m.recall)}</b><span>الاستدعاء (Recall)</span><small>من الاحتيال تم حظره</small></div>
        <div class="metric"><b>${pct(m.f1)}</b><span>F1</span><small>توازن الاثنين</small></div>
        <div class="metric"><b>${pct(m.accuracy)}</b><span>الصحة (Accuracy)</span><small>من ${m.checked} رابطاً مصنّفاً</small></div>
        <div class="metric confusion"><span>احتيال حُظر <b>${m.tp}</b></span><span>احتيال فات <b class="bad">${m.fn}</b></span>
          <span>سليم حُظر خطأً <b class="bad">${m.fp}</b></span><span>سليم مفتوح <b>${m.tn}</b></span></div>
      </div>
      <label class="check"><input type="checkbox" id="onlyMistakes" ${onlyMistakes ? "checked" : ""}> عرض الأخطاء فقط (${d.rows.filter(wrong).length})</label>` : ""}
      <div class="import-rows" role="list">
        ${shown.map((r) => `<div class="import-row${wrong(r) ? " is-wrong" : ""}" role="listitem">
          <span class="muted small">#${r.line}</span>
          <span class="url">${esc(r.url || "")}</span>
          <span>${r.expected ? `<span class="muted small">المتوقع:</span> ${EXPECTED[r.expected]}` : ""}</span>
          <span>${r.pending ? '<span class="muted"><span class="spin" aria-hidden="true"></span> قيد الفحص</span>'
            : `${pill(r.verdict)} ${r.pending_review ? '<span class="pending small">⏳ مراجعة</span>' : r.blocked ? '<span class="blocked small">⛔</span>' : ""}`}</span>
          <span class="small">${r.checked_at ? time(r.checked_at) : ""}</span>
          ${r.pending ? "<span></span>" : `<button class="btn btn-sm" data-open="${r.url_id}">التفاصيل</button>`}
        </div>`).join("")}
      </div>
      ${rows.length > shown.length ? `<p class="muted small">يظهر أول ${shown.length} من ${rows.length}. الملف المصدَّر فيه الكل.</p>` : ""}`;
    $("#importExport").onclick = exportImport;
    const om = $("#onlyMistakes");
    if (om) om.onchange = () => { onlyMistakes = om.checked; importKey = ""; renderImport(); };
  }

  function exportImport() {
    const cols = ["line", "url", "expected", "verdict", "score", "blocked", "pending_review", "entity_ar", "checked_at"];
    const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.join(","), ...importData.rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `kashshaf-import-${importData.import.id}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ---- blocked list --------------------------------------------------------
  let blockedRows = [];
  function renderBlocked() {
    const q = $("#blockedSearch").value.trim().toLowerCase();
    const rows = blockedRows.filter((b) => !q || b.domain.includes(q) || (b.entity_ar || "").includes(q));
    $("#blockedCount").textContent = `· ${blockedRows.length}`;
    $("#blockedBody").innerHTML = rows.map((b) => `<tr><td class="nowrap">${time(b.blocked_at)}</td>
      <td><span class="url">${esc(b.domain)}</span></td><td>${esc(b.entity_ar || "—")}</td><td>${b.score}/100</td>
      <td>${b.links}</td><td>${b.sightings}</td><td class="nowrap">${time(b.first_seen)}</td><td class="nowrap">${time(b.last_seen) || "—"}</td>
      <td>${b.pending_review ? '<span class="pending">⏳ بانتظار المراجعة</span>' : b.override === "block" ? `يدوي${b.override_by ? `<div class="muted">${esc(b.override_by)}</div>` : ""}` : "تلقائي"}</td></tr>`).join("")
      || '<tr><td colspan="9" class="empty">لا توجد مواقع محظورة.</td></tr>';
  }
  $("#blockedSearch").addEventListener("input", renderBlocked);
  $("#exportBtn").onclick = () => {
    const cols = ["domain", "entity_en", "score", "blocked_at", "first_seen", "last_seen", "links", "sightings", "override",
      "pending_review", "registrar", "registrar_abuse", "domain_created", "ip", "hosting", "hosting_abuse", "evidence_at"];
    const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.join(","), ...blockedRows.map((b) => cols.map((c) => cell(b[c])).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `kashshaf-blocked-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
  };

  document.querySelectorAll("[data-discover]").forEach((b) => (b.onclick = async () => {
    try { await api("/api/discover", { kind: b.dataset.discover }); $("#discoverMsg").textContent = "بدأ التشغيل."; }
    catch (e) { $("#discoverMsg").textContent = e.message; }
  }));
  $("#stopSearchBtn").onclick = async () => {
    $("#stopSearchBtn").disabled = true;
    try { await api("/api/control", { action: "stop_search" }); $("#discoverMsg").textContent = "تم إيقاف البحث. الوكلاء يكملون فحص الروابط التي وُجدت."; }
    catch (e) { $("#discoverMsg").textContent = e.message; }
    $("#stopSearchBtn").disabled = false; refresh();
  };
  function resort() {
    renderScan();
    if (importData) { importKey = ""; renderImport(); }
    if (tab === "agents" && lastState) renderAgents(lastState.agents);
    if (session) loadList();
  }
  $("#sortOrder").value = sort;
  $("#sortOrder").addEventListener("change", () => {
    sort = $("#sortOrder").value;
    try { localStorage.setItem(SORT_KEY, sort); } catch { /* keep it for this page only */ }
    resort();
  });
  window.addEventListener("storage", (e) => { // changed in the operations room in another tab
    if (e.key === SORT_KEY && SORT_LABEL[e.newValue]) { sort = e.newValue; $("#sortOrder").value = sort; resort(); }
  });
  $("#stopBtn").onclick = () => api("/api/control", { action: "stop" }).then(refresh);
  $("#startBtn").onclick = () => api("/api/control", { action: "start" }).then(refresh);
  $("#resizeBtn").onclick = () => api("/api/agents", { count: +$("#agentCount").value }).then(refresh);
  $("#search").addEventListener("input", () => loadList());
  $("#verdictFilter").addEventListener("change", () => loadList());

  // ---- detail dialog -----------------------------------------------------
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-open]");
    if (b) openDetail(+b.dataset.open);
  });
  async function openDetail(id) {
    const d = await api(`/api/finding?id=${id}`);
    const v = d.verdicts[0] || {}, s = d.scans[0] || {};
    const domain = d.url.domain;
    const pv = s.phone_view || {}, bv = s.bot_view || {};
    $("#detailBody").innerHTML = `
      <div class="detail-head"><div>${pill(v.verdict)} <span class="url">${esc(d.url.url)}</span></div>
        <button class="btn btn-sm" id="closeDetail">إغلاق</button></div>
      <div class="detail-body">
        <p class="muted">الدرجة ${v.score}/100 · ${esc(v.model || "")} · وقت الحكم ${time(v.created_at)} · ${esc(s.agent || "")}
          · أول ظهور للرابط ${time(d.url.first_seen)}
          ${s.domain_created ? ` · تاريخ تسجيل النطاق ${esc(s.domain_created)}` : ""}</p>
        ${v.ai ? `<div class="ai-box"><b>تحليل الوكيل:</b> ${esc(v.ai.summary_ar)}<span class="muted" dir="ltr" style="display:block">${esc(v.ai.summary_en)}</span></div>` : ""}
        <h3>الأسباب</h3>
        <ul class="reasons">${(v.reasons || []).map((r) => `<li>${esc(r.ar)}<span class="en">${esc(r.en)}${r.points ? ` (+${r.points})` : ""}</span></li>`).join("")}</ul>
        <h3>ما يراه الهاتف مقابل ما تراه أداة الفحص ${s.cloaked ? '<span class="pill v-fraud">إخفاء</span>' : ""}</h3>
        <div class="views">
          <div class="view"><h4>هاتف في الإمارات</h4><b>${esc(pv.title || "")}</b><p dir="auto">${esc((pv.text || pv.error || "").slice(0, 1200))}</p></div>
          <div class="view"><h4>أداة فحص</h4><b>${esc(bv.title || "")}</b><p dir="auto">${esc((bv.text || bv.error || "").slice(0, 1200))}</p></div>
        </div>
        <h3>البصمات</h3>
        <div>${d.fingerprints.map((f) => `<span class="tag">${esc(f.fingerprints.kind)}: ${esc(f.fingerprints.value)}</span>`).join("") || '<span class="muted">لا يوجد</span>'}</div>
        <h3>أين ظهر</h3>
        <div>${(sort === "old" ? [...d.sightings].reverse() : d.sightings).slice(0, 12).map((x) => `<div class="muted">${SOURCE[x.source] || esc(x.source)}${x.query ? ` · «${esc(x.query)}»` : ""}${x.position ? ` · الترتيب ${x.position}` : ""} · ${time(x.seen_at)}</div>`).join("")}</div>
        <h3>الأدلة للشرطة وطلب الإزالة</h3>
        <div id="evidenceBox" class="evidence"><p class="muted">جارٍ تحميل الأدلة…</p></div>
        <div class="row-actions">
          <button class="btn btn-danger" data-override="block">احتيال · حظر النطاق</button>
          <button class="btn btn-ok" data-override="allow">آمن · سماح</button>
          ${v.claimed_entity_id ? '<button class="btn" data-override="official">رسمي · إضافة للسجل</button>' : ""}
          <button class="btn" data-override="">إلغاء القرار اليدوي</button>
          <button class="btn" id="rescan">إعادة الفحص</button>
          <a class="btn" href="/blocked?url=${encodeURIComponent(d.url.url)}" target="_blank" rel="noopener">صفحة التحذير</a>
        </div>
      </div>`;
    $("#closeDetail").onclick = () => $("#detail").close();
    $("#rescan").onclick = () => api("/api/rescan", { url: d.url.url }).then(() => $("#detail").close());
    document.querySelectorAll("[data-override]").forEach((b) => (b.onclick = async () => {
      try {
        await api("/api/override", { domain, action: b.dataset.override || null });
      } catch (err) {
        return alert(err.message);
      }
      $("#detail").close(); refresh();
    }));
    $("#detail").showModal();
    loadEvidence(d.url.id);
  }

  // ---- evidence: screenshot, WHOIS, hosting, hashes; the pack and the printable report ------------
  async function apiRaw(path, body) {
    const res = await fetch(path, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) { showLogin(); throw new Error("login required"); }
    if (!res.ok) {
      let msg = res.statusText;
      try { msg = (await res.json()).error || msg; } catch (e) { /* not JSON */ }
      throw new Error(msg);
    }
    return res;
  }

  async function download(path, fallbackName) {
    const res = await apiRaw(path);
    const name = ((res.headers.get("Content-Disposition") || "").match(/filename="?([^"]+)"?/) || [])[1] || fallbackName;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await res.blob());
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  async function loadEvidence(urlId) {
    const box = $("#evidenceBox");
    if (!box) return;
    let data;
    try {
      data = await api(`/api/evidence?url_id=${urlId}`);
    } catch (err) {
      box.innerHTML = `<p class="error">${esc(err.message)}</p>`;
      return;
    }
    if ($("#evidenceBox") !== box) return;  // another link was opened meanwhile
    const ev = data.items[0];
    const ltr = (x) => `<span dir="ltr">${esc(x)}</span>`;
    const row = (k, v) => (v ? `<tr><th>${k}</th><td>${v}</td></tr>` : "");
    if (!ev) {
      box.innerHTML = `<p class="muted">لم تُلتقط أدلة لهذا الرابط بعد. تُلتقط تلقائياً لحظة الحكم بالاحتيال أو الاشتباه.</p>
        <div class="row-actions"><button class="btn btn-primary" id="evCapture">التقاط الأدلة الآن</button>
        <span id="evMsg" class="muted small" role="status">${data.chrome ? "" : "Chrome غير موجود على هذا الجهاز، فلن تُلتقط صورة الشاشة"}</span></div>`;
    } else {
      const w = ev.whois || {}, h = ev.hosting || {}, errs = ev.errors || {};
      box.innerHTML = `<div class="evidence-grid">
          <div class="evidence-shot">${ev.screenshot_path ? '<img id="evShot" alt="لقطة الشاشة كما يراها هاتف في الإمارات">'
            : `<div class="evidence-noshot">لا توجد لقطة شاشة${errs.screenshot ? `<span class="small">${esc(errs.screenshot)}</span>` : ""}</div>`}</div>
          <table class="evidence-table">
            ${row("وقت الالتقاط", time(ev.captured_at))}
            ${row("عنوان الصفحة", esc(ev.page_title || ""))}
            ${row("المسجِّل", esc(w.registrar || w.error || w.note || ""))}
            ${row("تاريخ تسجيل النطاق", w.created ? `${ltr(w.created)}${w.age_days != null ? ` · عمره ${w.age_days} يوماً` : ""}` : "")}
            ${row("بريد البلاغات لدى المسجِّل", w.abuse_email ? ltr(w.abuse_email) : "")}
            ${row("الاستضافة", h.ip ? ltr([h.ip, h.as_name || h.owner, h.country].filter(Boolean).join(" · ")) : esc(h.note || ""))}
            ${row("بريد البلاغات لدى الاستضافة", h.abuse_email ? ltr(h.abuse_email) : "")}
            ${row("بصمة اللقطة SHA-256", ev.screenshot_sha256 ? `<span class="hash">${esc(ev.screenshot_sha256)}</span>` : "")}
            ${row("بصمة نسخة الصفحة SHA-256", ev.html_sha256 ? `<span class="hash">${esc(ev.html_sha256)}</span>` : "")}
            ${row("لم يُلتقط", errs.page ? esc(`نسخة الصفحة: ${errs.page}`) : "")}
          </table>
        </div>
        <div class="row-actions">
          <button class="btn btn-primary" id="evPack">تنزيل ملف الأدلة (ZIP)</button>
          <button class="btn" id="evReport">تقرير للطباعة</button>
          <button class="btn" id="evCapture">التقاط من جديد</button>
          <span id="evMsg" class="muted small" role="status"></span>
        </div>`;
      const say = (t) => { const m = $("#evMsg"); if (m) m.textContent = t; };
      $("#evPack").onclick = () => download(`/api/evidence_pack?url_id=${urlId}`, "kashshaf-evidence.zip").catch((e) => say(e.message));
      $("#evReport").onclick = async () => {
        const win = window.open("", "_blank");  // opened inside the click, so no popup blocker
        try {
          const res = await apiRaw(`/api/evidence_report?url_id=${urlId}`);
          const url = URL.createObjectURL(new Blob([await res.text()], { type: "text/html" }));
          if (win) {
            win.location = url;
            say("اطبع التقرير من نافذته (⌘P أو Ctrl+P) واحفظه PDF.");
          } else {  // popups blocked: save the report as a file rather than leave the dashboard
            const a = document.createElement("a");
            a.href = url;
            a.download = `kashshaf-report-${urlId}.html`;
            a.click();
            say("حُفظ التقرير كملف HTML: افتحه واطبعه PDF.");
          }
        } catch (e) {
          if (win) win.close();
          say(e.message);
        }
      };
      if (ev.screenshot_path) {
        apiRaw(`/api/evidence_file?id=${ev.id}&kind=screenshot`).then((r) => r.blob()).then((b) => {
          const img = $("#evShot");
          if (img) img.src = URL.createObjectURL(b);
        }).catch(() => {});
      }
    }
    $("#evCapture").onclick = async (e) => {
      e.target.disabled = true;
      const m = $("#evMsg");
      if (m) m.textContent = "جارٍ التقاط الصورة وبيانات النطاق والاستضافة… حتى 30 ثانية";
      try {
        await api("/api/evidence_capture", { url_id: urlId });
      } catch (err) {
        if (m) m.textContent = err.message;
        e.target.disabled = false;
        return;
      }
      loadEvidence(urlId);
    };
  }

  $("#tourBtn").addEventListener("click", () => window.KashshafTour?.start());
  session ? showApp() : showLogin();
})();
