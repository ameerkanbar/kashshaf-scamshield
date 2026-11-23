// Kashshaf analyst dashboard. Login with Supabase Auth; every API call carries the analyst's access token.
(async function () {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const VERDICT = { fraud: "احتيال", suspicious: "مشبوه", safe: "آمن", official: "رسمي", unreachable: "تعذّر الفتح" };
  const SOURCE = { message: "رسالة", serp_organic: "نتائج جوجل", serp_ad: "إعلان جوجل", serp_ai_overview: "ملخص الذكاء الاصطناعي",
    maps: "الخرائط", ct_log: "سجل الشهادات", phish_feed: "قائمة تصيّد", analyst: "محلل", gateway: "رابط محمي", seed: "تجربة" };
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
  function findingRow(f) {
    return `<tr>
      <td>${pill(f.verdict)}<div class="muted">${f.score}/100</div>${f.cloaked ? '<span class="tag">إخفاء</span>' : ""}</td>
      <td class="nowrap">${time(f.created_at)}</td>
      <td><span class="url">${esc(f.url)}</span><div class="muted">${esc(f.title || "")}</div></td>
      <td>${esc(f.entity_ar || "—")}</td>
      <td>${(f.sources || []).map((s) => `<span class="tag">${SOURCE[s] || esc(s)}</span>`).join("")}<div class="muted">${f.sightings} ظهور</div></td>
      <td>${f.blocked ? '<span class="blocked">محظور</span>' : "—"}${f.override ? `<div class="muted">يدوي: ${f.override === "block" ? "حظر" : "سماح"}</div>` : ""}</td>
      <td><button class="btn btn-sm" data-open="${f.url_id}">التفاصيل</button></td></tr>`;
  }

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

      if (t === "overview") {
        $("#kpis").innerHTML = [["روابط مفحوصة", s.urls], ["في الانتظار", s.queued + s.checking], ["مواقع محظورة", s.blocked, "danger"],
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
        $("#findingsBody").innerHTML = rows.map(findingRow).join("") || '<tr><td colspan="7" class="empty">لا توجد نتائج.</td></tr>';
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
      if (t === "scan") await updateScan();
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

  // ---- blocked list --------------------------------------------------------
  let blockedRows = [];
  function renderBlocked() {
    const q = $("#blockedSearch").value.trim().toLowerCase();
    const rows = blockedRows.filter((b) => !q || b.domain.includes(q) || (b.entity_ar || "").includes(q));
    $("#blockedCount").textContent = `· ${blockedRows.length}`;
    $("#blockedBody").innerHTML = rows.map((b) => `<tr><td class="nowrap">${time(b.blocked_at)}</td>
      <td><span class="url">${esc(b.domain)}</span></td><td>${esc(b.entity_ar || "—")}</td><td>${b.score}/100</td>
      <td>${b.links}</td><td>${b.sightings}</td><td class="nowrap">${time(b.first_seen)}</td><td class="nowrap">${time(b.last_seen) || "—"}</td>
      <td>${b.override === "block" ? `يدوي${b.override_by ? `<div class="muted">${esc(b.override_by)}</div>` : ""}` : "تلقائي"}</td></tr>`).join("")
      || '<tr><td colspan="9" class="empty">لا توجد مواقع محظورة.</td></tr>';
  }
  $("#blockedSearch").addEventListener("input", renderBlocked);
  $("#exportBtn").onclick = () => {
    const cols = ["domain", "entity_en", "score", "blocked_at", "first_seen", "last_seen", "links", "sightings", "override"];
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
        <div class="row-actions">
          <button class="btn btn-danger" data-override="block">حظر النطاق</button>
          <button class="btn" data-override="allow">سماح</button>
          <button class="btn" data-override="">إلغاء القرار اليدوي</button>
          <button class="btn" id="rescan">إعادة الفحص</button>
          <a class="btn" href="/blocked?url=${encodeURIComponent(d.url.url)}" target="_blank" rel="noopener">صفحة التحذير</a>
        </div>
      </div>`;
    $("#closeDetail").onclick = () => $("#detail").close();
    $("#rescan").onclick = () => api("/api/rescan", { url: d.url.url }).then(() => $("#detail").close());
    document.querySelectorAll("[data-override]").forEach((b) => (b.onclick = async () => {
      await api("/api/override", { domain, action: b.dataset.override || null });
      $("#detail").close(); refresh();
    }));
    $("#detail").showModal();
  }

  $("#tourBtn").addEventListener("click", () => window.KashshafTour?.start());
  session ? showApp() : showLogin();
})();
