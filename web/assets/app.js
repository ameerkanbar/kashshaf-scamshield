// Kashshaf dashboard: Supabase login, live operations room, charts, and every analyst page in Arabic and English.
(async function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------------- language ---------------- */
  const L = window.KI18N, LANG_KEY = "kashshaf.lang";
  let lang = "ar";
  try { lang = localStorage.getItem(LANG_KEY) === "en" ? "en" : "ar"; } catch { /* storage off */ }
  const t = (k, v = {}) => String(L[lang][k] ?? L.ar[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? "");
  const rtl = () => lang === "ar";
  const ent = (o, base = "entity") => (lang === "en" ? o?.[`${base}_en`] : o?.[`${base}_ar`]) || o?.[`${base}_ar`] || o?.[`${base}_en`] || "";

  const ICONS = {
    radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12l6-6"/>', chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    scan: '<path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2M7 12h10"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>', block: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
    link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
    log: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>', out: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>', play: '<path d="M7 4l13 8-13 8z"/>', stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    queue: '<rect x="3" y="4" width="18" height="4" rx="1"/><rect x="3" y="10" width="18" height="4" rx="1"/><rect x="3" y="16" width="18" height="4" rx="1"/>',
    alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>', shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>', download: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>', send: '<path d="M4 12l16-8-6 16-3-7z"/>',
    cert: '<rect x="4" y="3" width="16" height="13" rx="2"/><path d="M8 8h8M8 11h5M10 16l-1 5 3-2 3 2-1-5"/>', fish: '<path d="M3 12c4-6 11-6 15 0-4 6-11 6-15 0z"/><path d="M18 12l3-3v6zM8 11h.01"/>',
    org: '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="2" y="16" width="6" height="5" rx="1"/><rect x="9" y="16" width="6" height="5" rx="1"/><rect x="16" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M5 16v-2h14v2M12 12v4"/>',
    fp: '<path d="M12 11v3a6 6 0 0 1-1 3.5M8.5 9.5a4 4 0 0 1 7 2.5v2M5.5 10a7 7 0 0 1 13 2v1M7 19a9 9 0 0 0 1-4M17 15.5c0 1.8-.4 3.5-1.2 5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/>',
    review: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
    crown: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>', hand: '<path d="M8 13V5a1.5 1.5 0 0 1 3 0v6M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V5.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7 6 6 0 0 1-5-3l-2.5-4a1.5 1.5 0 0 1 2.5-1.5L8 15"/>',
  };
  const icon = (n) => `<i data-icon="${n}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ""}</svg></i>`;
  const paintIcons = (root = document) => $$("[data-icon]", root).forEach((el) => { if (!el.firstChild) el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[el.dataset.icon] || ""}</svg>`; });

  const VCLASS = ["fraud", "suspicious", "official", "safe", "unreachable"];
  const VCOLOR = { fraud: "#d03b3b", suspicious: "#ec835a", official: "#2a78d6", safe: "#0ca30c", unreachable: "#7d8794" };
  const pill = (v) => `<span class="pill v-${esc(v)}">${esc(t("v." + v))}</span>`;
  const src = (s) => esc(t("src." + s));
  const time = (v) => {
    if (!v) return "";
    const d = typeof v === "number" ? new Date(v * 1000) : new Date(v);
    return `<span class="ts" title="${d.toISOString()}">${d.toLocaleDateString("en-GB")} · ${d.toLocaleTimeString("en-GB")}</span>`;
  };
  function countTo(el, to) {
    if (!el) return;
    const from = +el.dataset.v || 0, sfx = el.dataset.suffix || ""; el.dataset.v = to;
    if (from === to || matchMedia("(prefers-reduced-motion: reduce)").matches) { el.textContent = to.toLocaleString("en") + sfx; return; }
    const t0 = performance.now();
    const step = (now) => { const k = Math.min(1, (now - t0) / 700); el.textContent = Math.round(from + (to - from) * (1 - (1 - k) ** 3)).toLocaleString("en") + sfx; if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  /* ---------------- auth ---------------- */
  const cfg = await fetch("/api/config").then((r) => r.json());
  const sb = supabase.createClient(cfg.supabase_url, cfg.supabase_key);
  let session = (await sb.auth.getSession()).data.session;
  sb.auth.onAuthStateChange((_e, s) => { session = s; });
  async function api(path, body) {
    const res = await fetch(path, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` }, body: body ? JSON.stringify(body) : undefined });
    if (res.status === 401) { showLogin(); throw new Error(t("err.session")); }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  }
  let timers = [];
  function showLogin() { timers.forEach(clearInterval); timers = []; $("#app").hidden = true; $("#login").hidden = false; }
  function showApp() {
    $("#login").hidden = true; $("#app").hidden = false;
    $("#userEmail").textContent = session.user.email; $("#avatar").textContent = session.user.email[0];
    route(); refreshState(); timers.forEach(clearInterval);
    let tick = 0; // the live view refreshes every 1.5 s, the other pages every 3 s
    timers = [setInterval(() => { tick++; if (page === "live" || tick % 2 === 0) refreshState(); }, 1500), setInterval(() => loadPage(true), 6000)];
  }
  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault(); $("#loginError").textContent = ""; $("#loginBtn").disabled = true;
    const { data, error } = await sb.auth.signInWithPassword({ email: $("#email").value, password: $("#password").value });
    $("#loginBtn").disabled = false;
    if (error) { $("#loginError").textContent = t("login.error"); return; }
    session = data.session; $("#password").value = ""; showApp();
  });
  $("#logout").onclick = async () => { await sb.auth.signOut(); session = null; showLogin(); };

  /* ---------------- routing ---------------- */
  const PAGES = ["ops", "org", "live", "settings", "analytics", "scan", "findings", "review", "blocked", "gangs", "discover", "agents", "audit"];
  let page = "ops";
  function route() {
    const p = location.hash.slice(1);
    page = PAGES.includes(p) ? p : "ops";
    $$("#nav a").forEach((a) => a.classList.toggle("active", a.dataset.page === page || (page === "live" && a.dataset.page === "org")));
    $$("[data-view]").forEach((v) => (v.hidden = v.dataset.view !== page));
    header(); $("#app").classList.remove("menu-open");
    loadPage(); window.scrollTo({ top: 0 });
  }
  const header = () => { $("#pageTitle").textContent = t(`page.${page}`); $("#pageSub").textContent = t(`page.${page}.sub`); document.title = `${t(`page.${page}`)} | ${t("brand")}`; };
  window.addEventListener("hashchange", route);
  $("#menuBtn").onclick = () => $("#app").classList.toggle("menu-open");
  $("#scrim").onclick = () => $("#app").classList.remove("menu-open");

  const SORT_KEY = "kashshaf.sort";
  let sort = "new";
  try { sort = localStorage.getItem(SORT_KEY) || "new"; } catch { /* default */ }
  $("#sortOrder").value = sort;
  $("#sortOrder").onchange = () => { sort = $("#sortOrder").value; try { localStorage.setItem(SORT_KEY, sort); } catch { /* this page */ } loadPage(); };

  function applyLang() {
    const h = document.documentElement; h.lang = lang; h.dir = L[lang].dir;
    $$("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
    $$("[data-i18n-ph]").forEach((el) => (el.placeholder = t(el.dataset.i18nPh)));
    $$("[data-i18n-aria]").forEach((el) => el.setAttribute("aria-label", t(el.dataset.i18nAria)));
    $$("[data-lang-toggle]").forEach((b) => (b.textContent = t("other")));
    $("#radarLegend").innerHTML = VCLASS.map((v) => `<span><i style="background:${VCOLOR[v]}"></i>${t("v." + v)}</span>`).join("");
    if (session && !$("#app").hidden) { header(); Object.values(charts).forEach((c) => c.destroy()); charts = {}; lastFeed = new Set(); renderState(); loadPage(); }
  }
  $$("[data-lang-toggle]").forEach((b) => (b.onclick = () => { lang = lang === "ar" ? "en" : "ar"; try { localStorage.setItem(LANG_KEY, lang); } catch { /* this page */ } applyLang(); }));

  /* ---------------- live state ---------------- */
  let st = null;
  let stateBusy = false; // one request at a time: a slow server never gets a pile of overlapping polls
  async function refreshState() {
    if (stateBusy) return;
    stateBusy = true;
    try { st = await api("/api/state"); renderState(); } catch (e) { console.warn(e); } finally { stateBusy = false; }
  }
  const hitUntil = new Map(), lastHits = new Map();
  function renderState() {
    if (!st) return;
    const s = st.stats, c = st.control, working = st.agents.filter((a) => a.status === "working").length;
    $("#chips").innerHTML = [[st.ai ? t("chip.ai.on") : t("chip.ai.off"), st.ai], [!st.google ? t("chip.google.off") : c.serp_exhausted ? t("chip.google.out") : t("chip.google.on"), st.google && !c.serp_exhausted],
      [!c.running ? t("chip.stopped") : c.patrol ? t("chip.patrol") : t("chip.running"), c.running]].map(([x, on]) => `<span class="chip ${on ? "on" : "off"}"><i></i>${esc(x)}</span>`).join("");
    $$(".live-dot").forEach((d) => d.classList.toggle("off", !c.running));
    $("#navBlocked").textContent = s.blocked || "";
    $("#navReview").textContent = s.review || "";
    // hero + controls
    $("#heroText").textContent = t("hero.text", { n: st.agents.length });
    if (document.activeElement !== $("#heroCount")) $("#heroCount").value = st.agents.length;
    if (document.activeElement !== $("#agentCount")) $("#agentCount").value = st.agents.length;
    $("#patrolBtn").disabled = c.patrol; $("#stopBtn").hidden = !c.running; $("#startBtn").hidden = c.running;
    $("#stopBtn2").hidden = !c.running; $("#startBtn2").hidden = c.running;
    // pipeline
    const stage = (k, v) => { const el = $(`[data-stage="${k}"]`); countTo($("[data-n]", el), v); el.classList.toggle("busy", v > 0 && c.running); };
    stage("discover", s.urls); stage("queue", s.queued); stage("check", working); stage("verdict", s.fraud); stage("block", s.blocked);
    $("#pipe").classList.toggle("paused", !c.running);
    // agent company: hits light up for a few seconds, the ops card and the company page draw from st.org
    const now = Date.now();
    st.agents.forEach((a) => { if ((a.hits || 0) > (lastHits.get(a.name) ?? a.hits)) hitUntil.set(a.name, now + 6000); lastHits.set(a.name, a.hits || 0); });
    renderDeptSum();
    if (page === "org") renderOrg();
    if (page === "live") renderLive();
    // patrol + spending
    $("#patrolLast").innerHTML = patrolText(c);
    const meter = (label, v, cap) => `<div class="meter"><div class="top"><span>${label}</span><b class="num">${v}/${cap}</b></div><div class="track"><i class="${v >= cap ? "full" : ""}" style="width:${cap ? Math.min(100, (100 * v) / cap) : 0}%"></i></div></div>`;
    $("#spend").innerHTML = meter(t("spend.serp"), c.serp_hour, c.serp_cap) + meter(t("spend.ai"), c.ai_hour, c.ai_cap)
      + `<div class="spend-line"><span>${t("spend.tokens")}</span><b class="num">${(c.input_tokens + c.output_tokens).toLocaleString("en")}</b></div>`
      + `<div class="spend-line"><span>${t("spend.saved")}</span><b>${t("spend.savedv", { s: c.serp_saved, a: c.ai_saved })}</b></div>`;
    if (page === "agents") renderAgents();
    if (page === "discover") renderDiscoverState();
    if (page === "ops" && insights) opsKpis();
  }
  function patrolText(c) {
    if (!c.running) return t("patrol.stopped");
    if (!c.patrol) return t("patrol.off");
    const l = c.patrol_last; if (!l) return t("patrol.started");
    const at = l.at ? `${time(l.at)}<br>` : "";
    if (l.kind === "google") return at + esc(t("patrol.google", { q: l.query, p: l.persona, n: l.queued }));
    if (l.kind === "feed") return at + esc(t("patrol.feed", { n: l.queued }));
    if (l.kind === "ct") return at + esc(t("patrol.ct", { n: l.queued }));
    if (l.kind === "paused") return at + esc(t("patrol.paused"));
    return at + esc(t("patrol.error", { e: l.error || "" }));
  }

  // controls (hero and agents page)
  async function control(action, msgEl, okText) {
    const count = Math.max(1, Math.min(500, +(page === "agents" ? $("#agentCount") : $("#heroCount")).value || 50));
    try { await api("/api/control", action === "patrol" ? { action, count } : { action }); msgEl.textContent = okText; msgEl.className = "msg"; }
    catch (e) { msgEl.textContent = e.message; msgEl.className = "msg err"; }
    refreshState();
  }
  $("#patrolBtn").onclick = () => control("patrol", $("#heroMsg"), t("act.patrol"));
  $("#stopBtn").onclick = () => control("stop", $("#heroMsg"), t("act.stop"));
  $("#startBtn").onclick = () => control("start", $("#heroMsg"), t("act.start"));
  $("#stopBtn2").onclick = () => control("stop", $("#agentsMsg"), t("act.stop"));
  $("#startBtn2").onclick = () => control("start", $("#agentsMsg"), t("act.start"));
  $("#resizeBtn").onclick = async () => {
    const n = Math.max(1, Math.min(500, +$("#agentCount").value || 50));
    try { await api("/api/agents", { count: n }); $("#agentsMsg").textContent = t("act.resized", { n }); } catch (e) { $("#agentsMsg").textContent = e.message; }
    refreshState();
  };

  /* ---------------- charts ---------------- */
  let charts = {}, insights = null, gangCount = 0;
  const baseFont = () => ({ family: getComputedStyle(document.body).fontFamily, size: 12 });
  function chartDefaults() {
    Chart.defaults.font = baseFont(); Chart.defaults.color = "#667085";
    Chart.defaults.plugins.legend.rtl = rtl(); Chart.defaults.plugins.tooltip.rtl = rtl();
    Chart.defaults.plugins.legend.labels.usePointStyle = true; Chart.defaults.plugins.legend.labels.boxWidth = 8;
    Chart.defaults.plugins.tooltip.backgroundColor = "#082E6D"; Chart.defaults.plugins.tooltip.padding = 10; Chart.defaults.plugins.tooltip.cornerRadius = 8;
  }
  const grid = { color: "#eef1f5" }, axis = { color: "#d0d5dd" };
  function upsert(id, make, update) {
    const el = document.getElementById(id); if (!el) return;
    if (charts[id]) { update(charts[id]); charts[id].update(); return; }
    chartDefaults(); charts[id] = new Chart(el, make());
  }
  function activityChart(id) {
    const tl = insights.timeline, labels = tl.map((h) => new Date(h.hour).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
    const sets = () => VCLASS.map((v) => ({ label: t("v." + v), data: tl.map((h) => h[v] || 0), backgroundColor: VCOLOR[v], borderColor: "#fff", borderWidth: 1, borderRadius: 4, borderSkipped: false, stack: "s" }));
    upsert(id, () => ({ type: "bar", data: { labels, datasets: sets() }, options: { responsive: true, maintainAspectRatio: false, animation: { duration: 900 },
      plugins: { legend: { position: "bottom" } }, interaction: { mode: "index", intersect: false },
      scales: { x: { stacked: true, grid: { display: false }, border: axis, reverse: rtl(), ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } }, y: { stacked: true, beginAtZero: true, grid, border: { display: false }, position: rtl() ? "right" : "left", ticks: { precision: 0 } } } } }),
    (c) => { c.data.labels = labels; c.data.datasets.forEach((d, i) => (d.data = sets()[i].data)); });
  }
  const tableHtml = (rows) => `<table class="table"><tbody>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${v}</td></tr>`).join("")}</tbody></table>`;
  function analyticsCharts() {
    const I = insights, vs = VCLASS.map((v) => I.verdicts[v] || 0);
    const vl = VCLASS.map((v, i) => `${t("v." + v)} · ${vs[i]}`); // the legend names each slice and its value
    upsert("chVerdicts", () => ({ type: "doughnut", data: { labels: vl, datasets: [{ data: vs, backgroundColor: VCLASS.map((v) => VCOLOR[v]), borderColor: "#fff", borderWidth: 2, hoverOffset: 8 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: "66%", plugins: { legend: { position: rtl() ? "left" : "right" } }, animation: { animateRotate: true, duration: 1000 } } }),
    (c) => { c.data.labels = vl; c.data.datasets[0].data = vs; });
    $("#tblVerdicts").innerHTML = tableHtml(VCLASS.map((v, i) => [t("v." + v), vs[i]]));
    const fv = [I.found.agents, I.found.people];
    const hbar = (labels, data, colors) => ({ type: "bar", data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 4, borderSkipped: false, barThickness: 22, maxBarThickness: 26 }] },
      options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, animation: { duration: 900 }, plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, reverse: rtl(), grid, border: { display: false }, ticks: { precision: 0 } }, y: { position: rtl() ? "right" : "left", grid: { display: false }, border: axis } } } });
    upsert("chFirst", () => hbar([t("chart.found.agents"), t("chart.found.people")], fv, ["#2a78d6", "#1baf7a"]), (c) => { c.data.datasets[0].data = fv; });
    $("#tblFirst").innerHTML = tableHtml([[t("chart.found.agents"), fv[0]], [t("chart.found.people"), fv[1]]]);
    const en = I.entities.map((e) => (lang === "en" ? e.en : e.ar)), ev = I.entities.map((e) => e.count);
    upsert("chEntities", () => hbar(en, ev, "#135BA6"), (c) => { c.data.labels = en; c.data.datasets[0].data = ev; });
    $("#tblEntities").innerHTML = tableHtml(I.entities.map((e, i) => [en[i], e.count]));
    const sk = Object.keys(I.sources).sort((a, b) => I.sources[b] - I.sources[a]), sl = sk.map((k) => t("src." + k)), sv = sk.map((k) => I.sources[k]);
    upsert("chSources", () => hbar(sl, sv, "#2a78d6"), (c) => { c.data.labels = sl; c.data.datasets[0].data = sv; });
    $("#tblSources").innerHTML = tableHtml(sk.map((k, i) => [sl[i], sv[i]]));
    activityChart("chActivity");
  }
  // KPI tile. The number counts up; the tile is rebuilt only when its text changes, so the animation runs from the old value.
  const kpi = (ic, value, label, desc, cls = "", sfx = "") => ({ value, html: `<div class="kpi ${cls}"><span class="ic">${icon(ic)}</span><b data-suffix="${sfx}">0${sfx}</b><span>${esc(label)}</span>${desc ? `<small>${esc(desc)}</small>` : ""}${cls === "feature" ? '<div class="bar"><i></i></div>' : ""}</div>` });
  function fillKpis(el, tiles) {
    const key = tiles.map((k) => k.html).join("");
    if (el.dataset.key !== key) { el.innerHTML = key; el.dataset.key = key; }
    $$(".kpi", el).forEach((tile, i) => { countTo($("b", tile), tiles[i].value); const bar = $(".bar i", tile); if (bar) bar.style.width = `${tiles[i].value}%`; });
  }
  function opsKpis() {
    const f = insights.found, total = f.agents + f.people, pct = total ? Math.round((100 * f.agents) / total) : 0;
    fillKpis($("#opsKpis"), [kpi("radar", pct, t("kpi.first"), t("kpi.first.d"), "feature", "%"),
      kpi("block", st?.stats.blocked ?? 0, t("kpi.blocked"), t("kpi.blocked.d"), "danger"),
      kpi("eye", st?.stats.cloaked ?? insights.cloaked, t("kpi.cloaked"), t("kpi.cloaked.d")),
      kpi("link", gangCount, t("kpi.gangs"), t("kpi.gangs.d"))]);
  }

  /* ---------------- radar + feed ---------------- */
  const hash = (s) => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  let seenBlips = new Set(), lastFeed = new Set();
  function radar(rows) {
    const band = { fraud: [20, 28], suspicious: [30, 36], official: [38, 44], safe: [38, 44], unreachable: [38, 44] };
    $("#blips").innerHTML = rows.slice(0, 40).map((f) => {
      const h = hash(f.domain || f.url), a = ((h % 360) * Math.PI) / 180, [r0, r1] = band[f.verdict] || [38, 44], r = r0 + ((h >>> 9) % 100) / 100 * (r1 - r0);
      const isNew = !seenBlips.has(f.url_id) && seenBlips.size > 0;
      return `<button type="button" class="blip ${esc(f.verdict)}${isNew ? " new" : ""}" style="left:${50 + r * Math.cos(a)}%;top:${50 + r * Math.sin(a)}%" data-open="${f.url_id}" title="${esc(t("v." + f.verdict))} · ${esc(f.domain)}" aria-label="${esc(t("v." + f.verdict))} ${esc(f.domain)}"></button>`;
    }).join("");
    rows.forEach((f) => seenBlips.add(f.url_id));
  }
  function feed(rows) {
    const first = lastFeed.size === 0;
    $("#feed").innerHTML = rows.slice(0, 12).map((f) => `<li class="${!first && !lastFeed.has(f.verdict_id) ? "new" : ""}" data-open="${f.url_id}">
      ${pill(f.verdict)}<span class="d" title="${esc(f.url)}">${esc(f.domain)}</span><span class="s">${f.score}</span>
      <span class="meta">${ent(f) ? esc(ent(f)) + " · " : ""}${f.agent ? esc(f.agent.split("@")[0]) + " · " : ""}${time(f.created_at)}</span></li>`).join("") || `<li>${t("none")}</li>`;
    rows.forEach((f) => lastFeed.add(f.verdict_id));
  }

  /* ---------------- pages ---------------- */
  let pageBusy = false;
  async function loadPage(poll = false) {
    if (!session || (poll && pageBusy)) return; // a poll waits for the previous load; a page change always loads
    const p = page;
    pageBusy = true;
    try {
      if (p === "ops") {
        const [recent, ins, gangs] = await Promise.all([api("/api/findings?limit=40&sort=new"), api("/api/insights"), api("/api/gangs")]);
        if (p !== page) return;
        insights = ins; gangCount = gangs.length; radar(recent); feed(recent); opsKpis(); activityChart("chActivityOps");
      }
      if (p === "analytics") {
        const ins = await api("/api/insights"); if (p !== page) return; insights = ins;
        const s = st?.stats || {};
        fillKpis($("#anKpis"), [kpi("list", ins.total, t("kpi.urls")), kpi("alert", ins.verdicts.fraud || 0, t("kpi.fraud"), "", "danger"),
          kpi("block", s.blocked ?? 0, t("kpi.blocked"), "", "danger"), kpi("review", s.review ?? 0, t("kpi.review"), t("kpi.review.d"), "warn"),
          kpi("hand", ins.protected_clicks, t("kpi.protected"), t("kpi.protected.d"), "good")]);
        analyticsCharts();
      }
      if (p === "findings" && !(poll && document.activeElement === $("#search"))) await loadFindings();
      if (p === "blocked") await loadBlocked();
      if (p === "gangs") await loadGangs();
      if (p === "discover") { renderDiscoverState(); await loadSearchLog(); }
      if (p === "agents") renderAgents();
      if (p === "org") renderOrg();
      if (p === "live") renderLive();
      if (p === "settings" && !poll) await loadSettings();
      if (p === "audit") await loadAudit();
      if (p === "scan") await Promise.all([updateScan(), updateImport()]);
      if (p === "review") await loadReview();
    } catch (e) { console.warn(e); } finally { pageBusy = false; }
    paintIcons();
  }

  // findings
  const findingRow = (f) => `<tr>
    <td>${pill(f.verdict)}<div class="sub num">${f.score}/100</div><div class="scorebar"><i style="width:${f.score}%"></i></div>${f.cloaked ? `<span class="tag red">${t("cloakTag")}</span>` : ""}</td>
    <td>${time(f.created_at)}</td>
    <td><span class="url">${esc(f.url)}</span><div class="sub">${esc(f.title || "")}</div></td>
    <td>${esc(ent(f) || "—")}</td>
    <td>${(f.sources || []).map((s) => `<span class="tag">${src(s)}</span>`).join("")}<div class="sub">${t("sightings", { n: f.sightings })}</div></td>
    <td>${f.pending_review ? `<span class="pending">⏳ ${t("rev.pending")}</span><div class="sub">${t("rev.pendingSub")}</div>` : f.blocked ? `<span class="blocked">${t("blockedTag")}</span>` : "—"}${f.override ? `<div class="sub">${t("rev.decided", { d: t("rev.d." + (f.override === "block" ? "block" : "allow")) })}</div>` : ""}</td>
    <td><button class="btn outline sm" data-open="${f.url_id}" type="button">${t("details")}</button></td></tr>`;
  async function loadFindings() {
    const q = new URLSearchParams({ q: $("#search").value, verdict: $("#verdictFilter").value, sort });
    const rows = await api(`/api/findings?${q}`);
    $("#findingsBody").innerHTML = rows.map(findingRow).join("") || `<tr><td colspan="7" class="empty">${t("noResults")}</td></tr>`;
  }
  let ft; $("#search").addEventListener("input", () => { clearTimeout(ft); ft = setTimeout(loadFindings, 300); });
  $("#verdictFilter").onchange = loadFindings;

  // blocked
  let blockedRows = [];
  async function loadBlocked() { blockedRows = await api(`/api/blocked?sort=${sort}`); renderBlocked(); }
  function renderBlocked() {
    const q = $("#blockedSearch").value.trim().toLowerCase();
    const rows = blockedRows.filter((b) => !q || b.domain.includes(q) || (b.entity_ar || "").includes(q) || (b.entity_en || "").toLowerCase().includes(q));
    $("#blockedBody").innerHTML = rows.map((b) => `<tr><td>${time(b.blocked_at)}</td><td><span class="url">${esc(b.domain)}</span></td><td>${esc(ent(b) || "—")}</td>
      <td class="num">${b.score}/100<div class="scorebar"><i style="width:${b.score}%"></i></div></td><td class="num">${b.links}</td><td class="num">${b.sightings}</td>
      <td>${time(b.first_seen)}</td><td>${time(b.last_seen) || "—"}</td><td>${b.pending_review ? `<span class="pending">⏳ ${t("rev.pending")}</span>${decisionButtons(b.domain, b.claimed_entity_id)}` : b.override === "block" ? `${t("manual")}<div class="sub">${esc(b.override_by || "")}</div>` : t("auto")}</td></tr>`).join("")
      || `<tr><td colspan="9" class="empty">${t("blocked.none")}</td></tr>`;
  }
  $("#blockedSearch").addEventListener("input", renderBlocked);
  $("#exportBtn").onclick = () => {
    const cols = ["domain", "entity_en", "score", "blocked_at", "first_seen", "last_seen", "links", "sightings", "override",
      "pending_review", "registrar", "registrar_abuse", "domain_created", "ip", "hosting", "hosting_abuse", "evidence_at"];
    const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + [cols.join(","), ...blockedRows.map((b) => cols.map((c) => cell(b[c])).join(","))].join("\n")], { type: "text/csv;charset=utf-8" }));
    a.download = `kashshaf-blocked-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };

  // gangs
  async function loadGangs() {
    const gangs = await api(`/api/gangs?sort=${sort}`);
    $("#gangsList").innerHTML = gangs.map((g, i) => {
      const n = g.domains.length, R = 62, nodes = g.domains.slice(0, 8).map((d, j) => { const a = (j / Math.min(n, 8)) * Math.PI * 2 - Math.PI / 2; return { d, x: 170 + R * 2 * Math.cos(a), y: 85 + R * Math.sin(a) }; });
      return `<div class="card"><div class="card-head"><div><h3>${t("gang", { n: i + 1 })} · ${t("gang.sites", { n })}</h3><p>${t("gang.first")} ${time(g.first_seen)} · ${t("gang.last")} ${time(g.last_seen)}</p></div><span class="pill v-fraud">${n}</span></div>
        <svg class="gang-graph" viewBox="0 0 340 170" role="img" aria-label="${esc(t("gang", { n: i + 1 }))}">${nodes.map((p) => `<line x1="170" y1="85" x2="${p.x}" y2="${p.y}"/>`).join("")}
          <circle cx="170" cy="85" r="16" fill="#d03b3b"/><text x="170" y="89" text-anchor="middle" fill="#fff" font-size="11" font-weight="700">${g.indicators.length}</text>
          ${nodes.map((p) => `<g><rect x="${p.x - 58}" y="${p.y - 11}" width="116" height="22" rx="11" fill="#fff" stroke="#082E6D"/><text x="${p.x}" y="${p.y + 4}" text-anchor="middle" font-size="9.5" font-family="Consolas, monospace" fill="#101828">${esc(p.d.split(".")[0].slice(0, 18))}</text></g>`).join("")}</svg>
        <div>${g.domains.map((d) => `<span class="tag u">${esc(d)}</span>`).join("")}</div><div>${g.indicators.map((x) => `<span class="tag red u">${esc(x)}</span>`).join("")}</div></div>`;
    }).join("") || `<div class="card empty">${t("gangs.none")}</div>`;
  }

  // discovery
  function renderDiscoverState() {
    if (!st) return;
    const c = st.control, run = st.discovery.running, l = st.discovery.last, box = $("#searchRun"), searching = !!run || c.patrol;
    box.classList.toggle("active", searching);
    box.innerHTML = `${searching ? '<span class="spin"></span>' : icon("globe")}<span class="grow">${run ? t("disc.state.run", { k: t("kind." + run) }) : c.patrol ? t("disc.state.patrol") : t("disc.state.none")}
      ${l ? `<div class="muted">${l.error ? esc(t("disc.lastErr", { e: l.error })) : esc(t("disc.last", { k: t("kind." + l.kind), n: l.queued }))} · ${time(l.at)}</div>` : ""}</span>
      ${searching ? `<button class="btn danger sm" id="stopSearchBtn" type="button">${icon("stop")}${t("disc.stop")}</button>` : ""}`;
    const sb2 = $("#stopSearchBtn"); if (sb2) sb2.onclick = async () => { await api("/api/control", { action: "stop_search" }); $("#discoverMsg").textContent = t("disc.stopped"); refreshState(); };
  }
  async function loadSearchLog() {
    const log = await api(`/api/searches?sort=${sort}`);
    $("#searchLogBody").innerHTML = log.map((x) => `<tr><td>${time(x.searched_at)}</td><td><span class="tag">${t(x.purpose === "agent" ? "kind.agent" : "kind.resident")}</span>${x.maps ? `<span class="tag">${t("maps")}</span>` : ""}</td>
      <td dir="auto">${esc(x.query)}</td><td class="num">${x.purpose === "agent" ? "—" : x.new_links}</td><td class="num">${x.purpose === "agent" ? "—" : x.known_links}</td>
      <td>${x.purpose === "agent" ? "—" : (x.blocked_now ?? x.known_blocked) ? `<span class="blocked">${x.blocked_now ?? x.known_blocked}</span>` : 0}</td><td>${esc(x.searched_by || "")}</td></tr>`).join("")
      || `<tr><td colspan="7" class="empty">${t("none")}</td></tr>`;
  }
  async function googleSearch(query, force) {
    const msg = $("#discoverMsg");
    try {
      const r = await api("/api/discover", { kind: "google", query, hl: $("#googleLang").value, force });
      if (r.cached) {
        msg.innerHTML = `${esc(t("disc.cached", { t: new Date(r.searched_at).toLocaleString("en-GB"), n: r.new, k: r.known, b: r.known_blocked }))} <button class="btn outline sm" id="forceSearch" type="button">${t("disc.force")}</button>`;
        $("#forceSearch").onclick = () => googleSearch(query, true);
      } else msg.textContent = t("disc.searching");
    } catch (e) { msg.textContent = e.message; }
  }
  $("#googleBtn").onclick = () => { const q = $("#googleQuery").value.trim(); if (q) googleSearch(q, false); };
  $$("[data-discover]").forEach((b) => (b.onclick = async () => {
    try { await api("/api/discover", { kind: b.dataset.discover }); $("#discoverMsg").textContent = t("disc.started"); } catch (e) { $("#discoverMsg").textContent = e.message; }
    refreshState();
  }));

  // agent company
  const DICON = { chief: "shield", discovery: "radar", intake: "queue", web: "scan", content: "eye", fingerprints: "fp", domain: "globe", ai: "bolt" };
  const agentState = (a) => (!st.control.running && a.dept !== "chief" ? "paused" : (hitUntil.get(a.name) || 0) > Date.now() ? "hit" : a.status === "working" ? "working" : "idle");
  const short = (a) => a.id.split("-").pop().replace("lead", "★");
  function renderDeptSum() {
    const o = st.org; if (!o || !$("#deptSum")) return;
    const row = (id, busy, size, waiting) => `<a class="dsum" href="#org">${icon(DICON[id])}<span class="n">${esc(t("dept." + id))}</span>
      <span class="b"><i style="width:${size ? (100 * busy) / size : 0}%"></i></span><span class="c num">${busy}/${size}</span>${waiting ? `<em>${esc(t("org.waiting", { n: waiting }))}</em>` : ""}</a>`;
    $("#deptSum").innerHTML = row("chief", o.chief.status === "working" ? 1 : 0, 1, 0) + o.departments.map((d) => row(d.id, d.busy, d.size - 1, d.waiting)).join(""); // members only; the leader assigns
  }
  function avatar(a, cls = "") {
    const s = agentState(a);
    return `<span class="av ${s} ${a.role} ${cls}" title="${esc(a.name)} · ${esc(t("role." + a.role))} · ${esc(t("agents." + s))}${a.job ? "\n" + esc(a.job) : ""}">${a.role === "leader" ? icon("crown") : esc(short(a))}</span>`;
  }
  function renderOrg() {
    const o = st?.org; if (!o) return;
    const all = st.agents, working = all.filter((a) => a.status === "working").length, open = o.cases.filter((c) => !c.finished).length;
    fillKpis($("#orgKpis"), [kpi("users", o.total, t("org.total"), t("org.min", { n: o.min_total })), kpi("org", o.departments.length, t("org.deptCount")),
      kpi("bolt", working, t("org.working"), "", working ? "good" : ""), kpi("queue", open, t("org.open"))]);
    const c = o.chief;
    $("#chiefCard").innerHTML = `<div class="chief-av ${agentState(c)}">${icon("shield")}</div>
      <div class="chief-txt"><span class="role-tag">${esc(t("role.chief"))}</span><h3>${esc(t("dept.chief"))} <span class="u">${esc(c.id)}</span></h3><p>${esc(t("dept.chief.d"))}</p>
      <div class="chief-stats"><span>${icon("target")}${esc(t("org.decisions", { n: c.done, h: c.hits }))}</span>${c.job ? `<span class="u">${esc(c.job)}</span>` : ""}</div></div>`;
    $("#depts").innerHTML = o.departments.map((d) => {
      const busy = d.members.filter((m) => m.status === "working");
      return `<div class="dept ${d.busy ? "active" : ""}">
        <div class="dept-head"><span class="dept-ic">${icon(DICON[d.id])}</span><div><h3>${esc(t("dept." + d.id))}</h3><p>${esc(t("dept." + d.id + ".d"))}</p></div></div>
        <div class="dept-stats"><span class="pill-soft">${esc(t("org.busy", { b: d.busy, n: d.size - 1 }))}</span>${d.waiting ? `<span class="pill-soft warn">${esc(t("org.waiting", { n: d.waiting }))}</span>` : ""}<span class="pill-soft muted2">${esc(t("org.done", { n: d.done }))}</span></div>
        <div class="leader">${avatar(d.leader, "lg")}<div><b>${esc(d.leader.id)}</b><small>${esc(t("role.leader"))} · ${esc(t("org.assigned", { n: d.leader.done }))}</small></div></div>
        <div class="members">${d.members.map((m) => avatar(m)).join("")}</div>
        <div class="now">${busy.slice(0, 3).map((m) => `<div>${avatar(m, "xs")}<span class="u">${esc(m.job || "")}</span></div>`).join("") || `<span class="muted">${esc(t("org.idleAll"))}</span>`}</div>
      </div>`;
    }).join("");
    $("#cases").innerHTML = o.cases.map((cs) => `<div class="case ${cs.finished ? "" : "open"}" data-open="${cs.url_id}">
      <div class="case-top"><span class="u">${esc(cs.domain)}</span>${cs.verdict ? pill(cs.verdict) : `<span class="pill-soft"><span class="spin"></span> ${esc(t("org.inprogress"))}</span>`}</div>
      <ol class="track">${o.stages.map((sg) => { const who = cs.stages[sg], cur = cs.current === sg, skip = (cs.skipped || []).includes(sg);
        return `<li class="${cur ? "cur" : who ? "done" : skip ? "skip" : ""}" title="${esc(t("stage." + sg))}${who ? " · " + esc(who.split("@")[0]) : skip ? " · " + esc(t("org.skipped")) : ""}">${icon(DICON[sg === "chief" ? "chief" : sg])}<small>${esc(t("stage." + sg))}</small></li>`; }).join("")}</ol></div>`).join("")
      || `<p class="muted">${esc(t("org.none"))}</p>`;
  }

  // live view: one big room, a desk per agent; a bubble shows what each agent just found (org.report on the server)
  const LOOKS = [{ skin: "tan", uni: "admin", beard: "short" }, { skin: "medium", uni: "field", beard: false }, { skin: "dark", uni: "admin" },
    { skin: "light", uni: "field", beard: "short", hair: "brown" }, { skin: "medium", uni: "admin", hair: "grey" }, { skin: "tan", uni: "field" }];
  const look = (a) => LOOKS[hash(a.id) % LOOKS.length];
  const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u || ""; } };
  let floorKey = "";
  const deskHTML = (a, cls = "") => `<div class="desk ${cls}" data-name="${esc(a.name)}">
      <div class="bubble" role="status"></div>
      <div class="mon"><div class="scr d-${esc(a.dept)}"><span class="glyph">${icon(DICON[a.dept] || "shield")}</span><i></i><i></i><i></i><i></i><span class="job"></span><span class="off"></span></div></div>
      <div class="tbl"></div>
      <div class="person"><img src="${window.KChars ? KChars.image("officer", look(a), "up", 0).src : ""}" alt=""></div>
      <span class="dtag">${a.role === "leader" ? icon("crown") : ""}${esc(a.id)}</span></div>`;
  function renderLive() {
    const o = st?.org; if (!o || !$("#floor")) return;
    const everyone = [o.chief, ...o.departments.flatMap((d) => [d.leader, ...d.members])];
    const key = everyone.map((a) => a.name).join("|") + lang;
    if (key !== floorKey) {
      floorKey = key;
      $("#floor").innerHTML = `<div class="zone chief-zone"><div class="zone-head">${icon("shield")}<b>${esc(t("live.office"))}</b><span class="zc" data-zone="chief"></span></div><div class="desks">${deskHTML(o.chief, "big")}</div></div>`
        + o.departments.map((d) => `<div class="zone" data-dept="${esc(d.id)}"><div class="zone-head">${icon(DICON[d.id])}<b>${esc(t("dept." + d.id))}</b><span class="zc" data-zone="${esc(d.id)}"></span></div>
          <div class="desks">${deskHTML(d.leader, "lead")}${d.members.map((m) => deskHTML(m)).join("")}</div></div>`).join("");
      $("#liveLegend").innerHTML = ["ok", "bad", "warn", "info"].map((l) => `<span class="lg ${l}"><i></i>${esc(t("live.l." + l))}</span>`).join("");
    }
    for (const a of everyone) {
      const el = $(`.desk[data-name="${CSS.escape(a.name)}"]`); if (!el) continue;
      const s = agentState(a);
      for (const c of ["working", "idle", "paused", "hit"]) el.classList.toggle(c, c === s);
      $(".job", el).textContent = s === "working" && a.job ? hostOf(a.job) : "";
      $(".off", el).textContent = s === "paused" ? t("live.paused") : s === "idle" ? t("live.idle") : "";
      if (!(a.last && o.now - a.last.at < 10)) el.title = `${a.name} · ${t("role." + a.role)}${a.job ? "\n" + a.job : ""}`;
      const L = a.last, fresh = L && o.now - L.at < 10, b = $(".bubble", el), k = fresh ? String(L.at) : "";
      if (b.dataset.k !== k) {
        b.dataset.k = k; b.className = "bubble";
        if (fresh) {
          b.innerHTML = `<b>${esc(L[lang] || L.ar)}</b>${L.url ? `<small>${esc(L.url)}</small>` : ""}`;
          el.title = `${L[lang] || L.ar}\n${L.url || ""}\n${a.name}`; // the full finding on hover
          void b.offsetWidth; b.className = `bubble show ${L.level}`; // restart the pop animation for each new result
        } else b.innerHTML = "";
      }
    }
    $$("[data-zone]").forEach((z) => {
      const d = o.departments.find((x) => x.id === z.dataset.zone);
      z.innerHTML = d ? `<span class="pill-soft">${esc(t("org.busy", { b: d.busy, n: d.size - 1 }))}</span>${d.waiting ? `<span class="pill-soft warn">${esc(t("org.waiting", { n: d.waiting }))}</span>` : ""}`
        : `<span class="pill-soft">${esc(t("org.decisions", { n: o.chief.done, h: o.chief.hits }))}</span>`;
    });
    const working = everyone.filter((a) => a.status === "working").length, open = o.cases.filter((c) => !c.finished).length, cl = o.chief.last;
    $("#liveStats").innerHTML = `<span class="pill-soft"><em class="live-dot${st.control.running ? "" : " off"}"></em> ${esc(t("live.working", { n: working }))}</span>
      <span class="pill-soft">${esc(t("live.open", { n: open }))}</span>
      ${cl ? `<span class="pill-soft lvl-${esc(cl.level)}">${esc(t("live.last"))} ${esc(cl[lang] || cl.ar)} · <span class="u">${esc(cl.url || "")}</span></span>` : ""}`;
  }

  // settings: live status of every outside service (GET /api/integrations), one test per service on demand
  const SVC_ICON = { peers: "users", supabase_db: "queue", supabase_auth: "users", claude: "bolt", serpapi: "search", crtsh: "cert", openphish: "fish", rdap: "globe", test_sites: "scan" };
  let services = null, settingsCfg = null, servicesAt = 0;
  async function loadSettings(force) {
    if (!force && services && Date.now() - servicesAt < 60000) return renderSettings(); // checks hit outside services: at most once a minute
    $("#setRefresh").disabled = true; $("#setSummary").innerHTML = `<span class="spin"></span> ${esc(t("set.checking"))}`;
    try { const r = await api("/api/integrations"); services = r.services; settingsCfg = r.settings; servicesAt = Date.now(); }
    finally { $("#setRefresh").disabled = false; }
    renderSettings();
  }
  function detailRows(d) {
    const v = (k, x) => k === "calls_hour" ? `${x}/${d.cap_hour}` : k === "last_ok" ? time(x) : k === "exhausted" ? (x ? t("yes") : t("no")) : esc(x);
    return Object.entries(d || {}).filter(([k, x]) => x !== null && x !== undefined && k !== "cap_hour" && L.ar["sd." + k])
      .map(([k, x]) => `<div><span>${esc(t("sd." + k))}</span><b class="${["key", "host", "endpoint", "model", "answered_by", "this_server", "others"].includes(k) ? "u" : "num"}">${v(k, x)}</b></div>`).join("");
  }
  function renderSettings() {
    if (!services) return;
    const ok = services.filter((s) => s.status === "ok").length, bad = services.filter((s) => s.status === "error").length;
    $("#setSummary").innerHTML = `<b>${esc(t("set.summary", { c: ok, n: services.length }))}</b>
      ${["ok", "warn", "configured", "off", "error"].map((st) => { const n = services.filter((s) => s.status === st).length; return n ? `<span class="st ${st}">${esc(t("st." + st))} · ${n}</span>` : ""; }).join("")}
      <small class="muted">${esc(t("set.checked"))} ${time(servicesAt / 1000)}</small>`;
    $("#navSettings").textContent = bad + services.filter((s) => s.status === "warn").length || "";
    $("#services").innerHTML = services.map((s) => `<div class="svc ${s.status}">
      <div class="svc-head"><span class="svc-ic">${icon(SVC_ICON[s.id] || "globe")}</span><div><h3>${esc(t("svc." + s.id))}</h3><p>${esc(t("svc." + s.id + ".d"))}</p></div>
        <span class="st ${s.status}">${esc(t("st." + s.status))}</span></div>
      <div class="svc-rows">${detailRows(s.detail)}${s.ms > 0 ? `<div><span>${esc(t("sd.ms"))}</span><b class="num">${s.ms} ms</b></div>` : ""}</div>
      ${s.error ? `<div class="svc-err u">${esc(s.error)}</div>` : ""}
      ${s.id === "claude" ? `<p class="note">${esc(t("set.claudeNote"))}</p>` : ""}${s.id === "rdap" ? `<p class="note">${esc(t("svc.rdap.note"))}</p>` : ""}${s.id === "peers" && s.status === "warn" ? `<p class="note">${esc(t("svc.peers.note"))}</p>` : ""}
      <div class="row"><button class="btn outline sm" data-test="${esc(s.id)}" type="button"${s.status === "off" ? " disabled" : ""}>${esc(t(s.id === "claude" ? "set.testPaid" : "set.test"))}</button><span class="muted">${time(s.checked_at)}</span></div>
    </div>`).join("");
    $$("[data-test]").forEach((b) => (b.onclick = async () => {
      b.disabled = true; b.innerHTML = `<span class="spin"></span> ${esc(t("set.checking"))}`;
      try { const r = await api("/api/integrations/test", { id: b.dataset.test }); services = services.map((x) => (x.id === r.id ? r : x)); }
      catch (e) { services = services.map((x) => (x.id === b.dataset.test ? { ...x, status: "error", error: e.message } : x)); }
      renderSettings();
    }));
    const c = settingsCfg || {};
    const val = (k, x) => typeof x === "boolean" ? t(x ? "yes" : "no") : k === "agent_base_url" ? (x ? `<span class="u">${esc(x)}</span>` : esc(t("direct"))) : x === null ? "—" : `<span class="${typeof x === "number" ? "num" : "u"}">${esc(x)}</span>`;
    const warn = (k, x) => (k === "allow_local_test_sites" && x) ? `<span class="tag red">${esc(t("cfg.warnTest"))}</span>` : (k === "agent_base_url" && x) ? `<span class="tag">${esc(t("cfg.warnProxy"))}</span>` : "";
    $("#configBody").innerHTML = Object.entries(c).map(([k, x]) => `<tr><td>${esc(t("cfg." + k))}</td><td>${val(k, x)} ${warn(k, x)}</td></tr>`).join("");
    paintIcons($("#settings") || document);
  }
  $("#setRefresh").onclick = () => loadSettings(true).catch((e) => ($("#setSummary").textContent = e.message));

  // agents page
  function renderAgents() {
    if (!st) return;
    const c = st.control, s = st.stats;
    fillKpis($("#agKpis"), [kpi("users", st.agents.length, t("nav.agents")), kpi("bolt", st.agents.filter((a) => a.status === "working").length, t("agents.working")),
      kpi("queue", s.queued + s.checking, t("kpi.queue")), kpi("target", st.agents.reduce((n, a) => n + (a.hits || 0), 0), t("col.hits"), "", "danger")]);
    const act = (a) => (a.status === "working" ? a.since : a.last_done) || 0, when = (a) => (a.status === "working" ? 1e12 : 0) + act(a);
    const list = [...st.agents].sort((a, b) => !act(a) - !act(b) || (sort === "risk" ? b.hits - a.hits || b.done - a.done : sort === "old" ? when(a) - when(b) : when(b) - when(a)) || a.id - b.id);
    $("#agentsBody").innerHTML = list.map((a) => `<tr><td>${esc(a.name)}</td><td>${esc(t("dept." + a.dept))}</td><td>${esc(t("role." + a.role))}</td><td>${!c.running || a.status === "paused" ? t("ag.paused") : a.status === "working" ? `<span class="tag" style="color:var(--blue)">${t("ag.working")}</span>` : t("ag.idle")}</td>
      <td class="num">${a.done}</td><td>${a.hits ? `<span class="blocked">${a.hits}</span>` : 0}</td><td><span class="url">${esc(a.job || "")}</span></td><td>${time(a.since) || "—"}</td><td>${time(a.last_done) || "—"}</td></tr>`).join("");
    paintIcons($("#agKpis"));
  }

  // audit
  async function loadAudit() {
    const log = await api(`/api/audit?sort=${sort}`);
    $("#auditBody").innerHTML = log.map((l) => `<tr><td>${time(l.at)}</td><td>${esc(l.actor)}</td><td>${esc(L[lang]["a." + l.action] ? t("a." + l.action) : l.action)}</td><td><span class="url">${esc(l.target || "")}</span></td></tr>`).join("")
      || `<tr><td colspan="4" class="empty">${t("none")}</td></tr>`;
  }

  // scan
  const SCAN_KEY = "kashshaf.lastScan", SEV = { fraud: 4, suspicious: 3, unreachable: 1, safe: 0, official: -1 };
  let lastScan = null, lastScanKey = "";
  try { lastScan = JSON.parse(sessionStorage.getItem(SCAN_KEY)); } catch { lastScan = null; }
  if (!Array.isArray(lastScan?.links)) lastScan = null;
  $("#scanBtn").onclick = async () => {
    const text = $("#scanText").value.trim(); $("#scanMsg").textContent = "";
    if (!text) { $("#scanMsg").textContent = t("scan.empty"); return; }
    $("#scanBtn").disabled = true;
    try {
      const r = await api("/api/scan", { text });
      lastScan = { at: r.at, text, links: r.links }; lastScanKey = "";
      try { sessionStorage.setItem(SCAN_KEY, JSON.stringify(lastScan)); } catch { /* memory */ }
      $("#scanText").value = ""; renderScan(); await updateScan();
    } catch (e) { $("#scanMsg").textContent = e.message; }
    $("#scanBtn").disabled = false;
  };
  async function updateScan() {
    const scan = lastScan; if (!scan?.links.length) return renderScan();
    const items = await api(`/api/scan_result?ids=${scan.links.map((l) => l.url_id).join(",")}`);
    if (scan !== lastScan) return;
    const key = JSON.stringify(items) + lang; if (key === lastScanKey) return;
    lastScanKey = key; lastScan.items = items; renderScan();
  }
  function renderScan() {
    const box = $("#scanResult"); box.hidden = !lastScan; if (!lastScan) return;
    const fromDb = new Set(lastScan.links.filter((l) => l.from_db).map((l) => l.url_id));
    const items = lastScan.items || lastScan.links.map((l) => ({ ...l, pending: true, status: "queued" }));
    const done = items.filter((x) => !x.pending && x.result).map((x) => x.result.verdict).sort((a, b) => SEV[b] - SEV[a]);
    const waiting = items.some((x) => x.pending), worst = done[0];
    const overall = !items.length ? ["pending", t("scan.nolinks")] : worst === "fraud" ? ["fraud", t("scan.fraud")] : waiting ? ["pending", t("scan.wait")]
      : worst === "suspicious" ? ["warn", t("scan.susp")] : worst === "unreachable" ? ["warn", t("scan.unreach")]
      : done.length && done.every((v) => v === "official") ? ["ok", t("scan.official")] : ["ok", t("scan.safe")];
    const by = (v) => (v.model === "database" ? t("by.database") : v.model === "rules" ? t("by.rules") : v.model ? t("by.ai") : v.verdict === "official" ? t("by.registry") : "");
    box.innerHTML = `<div class="card-head"><div><h3>${t("scan.result")}</h3><p>${time(lastScan.at)} · ${t("scan.links", { n: items.length })}</p></div></div>
      <p class="muted" dir="auto">${esc((lastScan.text || "").slice(0, 240))}</p>
      <div class="overall ${overall[0]}">${overall[0] === "pending" && waiting ? '<span class="spin"></span>' : icon(overall[0] === "fraud" ? "alert" : "shield")}${esc(overall[1])}</div>
      ${items.map((x) => {
        if (x.pending) return `<div class="scan-link"><div class="head"><span class="spin"></span><b>${x.status === "checking" ? esc(t("scan.checking", { a: (x.agent || "").split("@")[0] })) : t("scan.queued")}</b></div><span class="url">${esc(x.url)}</span></div>`;
        const v = x.result || { verdict: "unreachable", score: 0, reasons: [] };
        const e = ent(v) ? (v.verdict === "official" ? t("officialof", { e: ent(v) }) : ["fraud", "suspicious"].includes(v.verdict) ? t("impersonates", { e: ent(v) }) : ent(v)) : "";
        return `<div class="scan-link ${esc(v.verdict)}"><div class="head">${pill(v.verdict)}<b class="num">${v.score}/100</b>${v.blocked ? `<span class="tag red">${t("blockedTag")}</span>` : ""}${v.cloaked ? `<span class="tag red">${t("cloakTag")}</span>` : ""}${fromDb.has(x.url_id) ? `<span class="tag">${t("scan.fromdb")}</span>` : ""}</div>
          <span class="url">${esc(x.url)}</span><p class="muted">${esc(e)}${e ? " · " : ""}${time(v.created_at)}${by(v) ? " · " + esc(by(v)) : ""}</p>
          ${v.ai?.[`summary_${lang}`] ? `<div class="ai-box"><b>${t("d.ai")}:</b> ${esc(v.ai[`summary_${lang}`])}</div>` : ""}
          ${(v.reasons || []).length ? `<ul class="reasons">${v.reasons.map((r) => `<li>${esc(r[lang] || r.ar)}</li>`).join("")}</ul>` : ""}
          <div class="row"><button class="btn outline sm" data-open="${x.url_id}" type="button">${t("details")}</button>${v.blocked ? `<a class="btn outline sm" href="/blocked?url=${encodeURIComponent(x.url)}" target="_blank" rel="noopener">${t("d.warn")}</a>` : ""}</div></div>`;
      }).join("")}`;
  }

  // ---- review queue (upstream): suspicious sites blocked until an analyst decides ----
  const decisionButtons = (domain, entity) => `<div class="decide">
      <button class="btn ok sm" data-decide="allow" data-domain="${esc(domain)}" type="button">${esc(t("rev.allow"))}</button>
      ${entity ? `<button class="btn outline sm" data-decide="official" data-domain="${esc(domain)}" type="button">${esc(t("rev.official"))}</button>` : ""}
      <button class="btn danger sm" data-decide="block" data-domain="${esc(domain)}" type="button">${esc(t("rev.block"))}</button></div>`;
  const reviewCard = (f) => `<article class="result v-edge-${esc(f.verdict)}" role="listitem">
      <div class="result-verdict">${pill(f.verdict)}<div class="result-score num">${f.score}<small>/100</small></div>${f.cloaked ? `<span class="tag red">${t("cloakTag")}</span>` : ""}</div>
      <div class="result-main"><span class="url">${esc(f.url)}</span>${f.title ? `<div class="result-title">${esc(f.title)}</div>` : ""}
        <div class="result-meta"><span><span class="muted">${esc(t("col.entity"))}:</span> ${esc(ent(f) || "—")}</span>
          <span><span class="muted">${esc(t("col.source"))}:</span> ${(f.sources || []).map((s) => `<span class="tag">${src(s)}</span>`).join("") || "—"} <span class="muted">· ${t("sightings", { n: f.sightings })}</span></span>
          <span>${time(f.created_at)}</span></div></div>
      <div class="result-side"><div><span class="pending">⏳ ${esc(t("rev.pending"))}</span><div class="muted">${esc(t("rev.pendingSub"))}</div></div>
        <button class="btn outline sm" data-open="${f.url_id}" type="button">${esc(t("rev.evidence"))}</button>${decisionButtons(f.domain, f.claimed_entity_id)}</div></article>`;
  async function loadReview() {
    const rows = await api(`/api/findings?verdict=review&sort=${sort}`);
    const seen = new Set(), sites = rows.filter((f) => !seen.has(f.domain) && seen.add(f.domain)); // one card per site: its most dangerous link
    $("#reviewBody").innerHTML = sites.map(reviewCard).join("") || `<div class="card empty">${esc(t("rev.none"))}</div>`;
  }
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-decide]"); if (!b) return;
    b.closest(".decide").querySelectorAll("button").forEach((x) => (x.disabled = true));
    try { await api("/api/override", { domain: b.dataset.domain, action: b.dataset.decide }); }
    catch (err) { alert(err.message); }
    refreshState(); loadPage();
  });

  // ---- import a file of links (upstream) ----
  const IMPORT_KEY = "kashshaf.lastImport";
  let lastImport = null, importData = null, importKey = "", onlyMistakes = false;
  try { lastImport = JSON.parse(sessionStorage.getItem(IMPORT_KEY) || "null"); } catch { lastImport = null; }
  const pct = (x) => (x == null ? "—" : `${Math.round(x * 1000) / 10}%`);
  async function sendFile(file) {
    const msg = $("#importMsg"); msg.textContent = ""; msg.className = "msg";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { msg.textContent = t("imp.tooBig"); msg.className = "msg err"; return; }
    msg.textContent = t("imp.uploading", { f: file.name });
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const r = await api("/api/import", { file_name: file.name, data: btoa(bin) });
      lastImport = { id: r.import.id, url_column: r.url_column, label_column: r.label_column };
      try { sessionStorage.setItem(IMPORT_KEY, JSON.stringify(lastImport)); } catch { /* private mode */ }
      msg.textContent = ""; onlyMistakes = false; importKey = "";
      await updateImport();
    } catch (err) { msg.className = "msg err"; msg.textContent = err.message; }
    $("#importFile").value = "";
  }
  $("#importFile").addEventListener("change", (e) => sendFile(e.target.files[0]));
  { const dz = $("#dropzone");
    ["dragenter", "dragover"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("over"); }));
    ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("over"); }));
    dz.addEventListener("drop", (e) => sendFile(e.dataTransfer.files[0])); }
  async function updateImport() {
    if (!lastImport) return;
    const asked = lastImport, data = await api(`/api/import_result?id=${asked.id}`);
    if (asked !== lastImport) return; // a newer import started meanwhile
    importData = data;
    const key = JSON.stringify([data.done, data.rows.map((r) => [r.verdict, r.blocked, r.pending_review]), sort, onlyMistakes, lang]);
    if (key !== importKey) { importKey = key; renderImport(); }
  }
  const wrong = (r) => r.expected && !r.pending && (r.expected === "fraud") !== r.blocked;
  function renderImport() {
    const d = importData, b = d.import, m = d.metrics, box = $("#importResult"); box.hidden = false;
    const at = (r) => (r.checked_at ? Date.parse(r.checked_at) : 0);
    let rows = d.rows.filter((r) => !onlyMistakes || wrong(r));
    rows = sort === "risk" ? [...rows].sort((x, y) => (SEV[y.verdict] ?? -2) - (SEV[x.verdict] ?? -2) || (y.score || 0) - (x.score || 0))
      : [...rows].sort((x, y) => (y.pending - x.pending) || (sort === "old" ? at(x) - at(y) : at(y) - at(x)));
    const shown = rows.slice(0, 300), done = d.done === d.total;
    box.innerHTML = `<div class="import-head"><div><b>${esc(b.file_name)}</b>
        <div class="muted">${esc(t("imp.by", { u: b.imported_by, n: b.total }))}${b.skipped ? esc(t("imp.skipped", { n: b.skipped })) : ""} · ${time(b.at)}
        · ${esc(t("imp.urlcol", { c: String(lastImport.url_column ?? "—") }))}${lastImport.label_column ? ` · ${esc(t("imp.labelcol", { c: String(lastImport.label_column) }))}` : ""}</div></div>
        <button class="btn outline sm" id="importExport" type="button">${icon("download")}${esc(t("imp.export"))}</button></div>
      <div class="meter"><div class="track" role="progressbar" aria-valuemin="0" aria-valuemax="${d.total}" aria-valuenow="${d.done}"><i style="width:${d.total ? (100 * d.done) / d.total : 0}%"></i></div></div>
      <p class="muted">${done ? esc(t("imp.done")) : esc(t("imp.progress", { d: d.done, n: d.total }))}</p>
      <div class="import-counts">${VCLASS.map((v) => `<span>${pill(v)} <b class="num">${d.counts[v] || 0}</b></span>`).join("")}<span><span class="blocked">${esc(t("blockedTag"))}</span> <b class="num">${d.blocked}</b></span></div>
      ${m ? `<div class="metrics">
        <div class="metric"><b>${pct(m.precision)}</b><span>${esc(t("imp.precision"))}</span><small>${esc(t("imp.precision.d"))}</small></div>
        <div class="metric"><b>${pct(m.recall)}</b><span>${esc(t("imp.recall"))}</span><small>${esc(t("imp.recall.d"))}</small></div>
        <div class="metric"><b>${pct(m.f1)}</b><span>${esc(t("imp.f1"))}</span><small>${esc(t("imp.f1.d"))}</small></div>
        <div class="metric"><b>${pct(m.accuracy)}</b><span>${esc(t("imp.accuracy"))}</span><small>${esc(t("imp.accuracy.d", { n: m.checked }))}</small></div>
        <div class="metric confusion"><span>${esc(t("imp.tp"))} <b>${m.tp}</b></span><span>${esc(t("imp.fn"))} <b class="bad">${m.fn}</b></span>
          <span>${esc(t("imp.fp"))} <b class="bad">${m.fp}</b></span><span>${esc(t("imp.tn"))} <b>${m.tn}</b></span></div></div>
        <label class="check"><input type="checkbox" id="onlyMistakes" ${onlyMistakes ? "checked" : ""}> ${esc(t("imp.mistakes", { n: d.rows.filter(wrong).length }))}</label>` : ""}
      <div class="import-rows" role="list">${shown.map((r) => `<div class="import-row${wrong(r) ? " is-wrong" : ""}" role="listitem">
          <span class="muted">#${r.line}</span><span class="url">${esc(r.url || "")}</span>
          <span>${r.expected ? `<span class="muted">${esc(t("imp.expected"))}</span> ${esc(t("exp." + r.expected))}` : ""}</span>
          <span>${r.pending ? `<span class="muted"><span class="spin" aria-hidden="true"></span> ${esc(t("imp.checking"))}</span>`
            : `${pill(r.verdict)} ${r.pending_review ? `<span class="pending">⏳</span>` : r.blocked ? `<span class="blocked">⛔</span>` : ""}`}</span>
          <span>${r.checked_at ? time(r.checked_at) : ""}</span>
          ${r.pending ? "<span></span>" : `<button class="btn outline sm" data-open="${r.url_id}" type="button">${esc(t("details"))}</button>`}</div>`).join("")}</div>
      ${rows.length > shown.length ? `<p class="muted">${esc(t("imp.more", { s: shown.length, n: rows.length }))}</p>` : ""}`;
    $("#importExport").onclick = exportImport;
    const om = $("#onlyMistakes"); if (om) om.onchange = () => { onlyMistakes = om.checked; importKey = ""; renderImport(); };
  }
  function exportImport() {
    const cols = ["line", "url", "expected", "verdict", "score", "blocked", "pending_review", "entity_ar", "checked_at"];
    const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + [cols.join(","), ...importData.rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n")], { type: "text/csv;charset=utf-8" }));
    a.download = `kashshaf-import-${importData.import.id}-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
  }

  // ---- evidence (upstream): screenshot, WHOIS, hosting, hashes; the pack and the printable report ----
  async function apiRaw(path, body) {
    const res = await fetch(path, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` }, body: body ? JSON.stringify(body) : undefined });
    if (res.status === 401) { showLogin(); throw new Error(t("err.session")); }
    if (!res.ok) { let m = res.statusText; try { m = (await res.json()).error || m; } catch { /* not JSON */ } throw new Error(m); }
    return res;
  }
  async function download(path, fallbackName) {
    const res = await apiRaw(path);
    const name = ((res.headers.get("Content-Disposition") || "").match(/filename="?([^"]+)"?/) || [])[1] || fallbackName;
    const a = document.createElement("a"); a.href = URL.createObjectURL(await res.blob()); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  async function loadEvidence(urlId) {
    const box = $("#evidenceBox"); if (!box) return;
    let data;
    try { data = await api(`/api/evidence?url_id=${urlId}`); } catch (err) { box.innerHTML = `<p class="msg err">${esc(err.message)}</p>`; return; }
    if ($("#evidenceBox") !== box) return; // another link was opened meanwhile
    const ev = data.items[0], ltr = (x) => `<span dir="ltr">${esc(x)}</span>`, row = (k, v) => (v ? `<tr><th>${esc(t(k))}</th><td>${v}</td></tr>` : "");
    if (!ev) {
      box.innerHTML = `<p class="muted">${esc(t("ev.none"))}</p><div class="row"><button class="btn primary sm" id="evCapture" type="button">${esc(t("ev.capture"))}</button>
        <span id="evMsg" class="muted" role="status">${data.chrome ? "" : esc(t("ev.nochrome"))}</span></div>`;
    } else {
      const w = ev.whois || {}, h = ev.hosting || {}, errs = ev.errors || {};
      box.innerHTML = `<div class="evidence-grid">
          <div class="evidence-shot">${ev.screenshot_path ? `<img id="evShot" alt="${esc(t("ev.shotAlt"))}">` : `<div class="evidence-noshot">${esc(t("ev.noshot"))}${errs.screenshot ? `<span>${esc(errs.screenshot)}</span>` : ""}</div>`}</div>
          <table class="evidence-table">${row("ev.at", time(ev.captured_at))}${row("ev.pageTitle", esc(ev.page_title || ""))}
            ${row("ev.registrar", esc(w.registrar || w.error || w.note || ""))}
            ${row("ev.created", w.created ? `${ltr(w.created)}${w.age_days != null ? esc(t("ev.age", { n: w.age_days })) : ""}` : "")}
            ${row("ev.regAbuse", w.abuse_email ? ltr(w.abuse_email) : "")}
            ${row("ev.hosting", h.ip ? ltr([h.ip, h.as_name || h.owner, h.country].filter(Boolean).join(" · ")) : esc(h.note || ""))}
            ${row("ev.hostAbuse", h.abuse_email ? ltr(h.abuse_email) : "")}
            ${row("ev.shotHash", ev.screenshot_sha256 ? `<span class="hash">${esc(ev.screenshot_sha256)}</span>` : "")}
            ${row("ev.pageHash", ev.html_sha256 ? `<span class="hash">${esc(ev.html_sha256)}</span>` : "")}
            ${row("ev.missing", errs.page ? esc(t("ev.pageCopy", { e: errs.page })) : "")}</table></div>
        <div class="row"><button class="btn primary sm" id="evPack" type="button">${icon("download")}${esc(t("ev.pack"))}</button>
          <button class="btn outline sm" id="evReport" type="button">${esc(t("ev.report"))}</button>
          <button class="btn outline sm" id="evCapture" type="button">${esc(t("ev.recapture"))}</button><span id="evMsg" class="muted" role="status"></span></div>`;
      const say = (x) => { const m = $("#evMsg"); if (m) m.textContent = x; };
      $("#evPack").onclick = () => download(`/api/evidence_pack?url_id=${urlId}`, "kashshaf-evidence.zip").catch((e) => say(e.message));
      $("#evReport").onclick = async () => {
        const win = window.open("", "_blank"); // opened inside the click, so no popup blocker
        try {
          const res = await apiRaw(`/api/evidence_report?url_id=${urlId}`);
          const url = URL.createObjectURL(new Blob([await res.text()], { type: "text/html" }));
          if (win) { win.location = url; say(t("ev.printHint")); }
          else { const a = document.createElement("a"); a.href = url; a.download = `kashshaf-report-${urlId}.html`; a.click(); say(t("ev.savedHtml")); }
        } catch (e) { if (win) win.close(); say(e.message); }
      };
      if (ev.screenshot_path) apiRaw(`/api/evidence_file?id=${ev.id}&kind=screenshot`).then((r) => r.blob()).then((b) => { const img = $("#evShot"); if (img) img.src = URL.createObjectURL(b); }).catch(() => {});
    }
    $("#evCapture").onclick = async (e) => {
      e.target.disabled = true; const m = $("#evMsg"); if (m) m.textContent = t("ev.capturing");
      try { await api("/api/evidence_capture", { url_id: urlId }); } catch (err) { if (m) m.textContent = err.message; e.target.disabled = false; return; }
      loadEvidence(urlId);
    };
  }

  /* ---------------- detail dialog ---------------- */
  document.addEventListener("click", (e) => { const b = e.target.closest("[data-open]"); if (b) openDetail(+b.dataset.open); });
  $("#detail").addEventListener("click", (e) => { if (e.target === $("#detail")) $("#detail").close(); });
  async function openDetail(id) {
    $("#detailBody").innerHTML = `<div class="detail-body"><span class="spin"></span> ${t("loading")}</div>`;
    if (!$("#detail").open) $("#detail").showModal();
    const d = await api(`/api/finding?id=${id}`);
    const v = d.verdicts[0] || {}, s = d.scans[0] || {}, pv = s.phone_view || {}, bv = s.bot_view || {}, domain = d.url.domain;
    $("#detailBody").innerHTML = `<div class="detail-head"><div>${pill(v.verdict || "unreachable")} <span class="u">${esc(d.url.url)}</span></div><button class="btn ghost-dark sm" id="closeDetail" type="button">${t("close")}</button></div>
      <div class="detail-body">
        <p class="muted">${t("d.meta", { s: v.score ?? "—", m: esc(v.model === "rules" || v.model === "database" ? t("by." + v.model) : v.model || t("by.registry")), t: "" })}${time(v.created_at)} · ${esc(s.agent || "")} · ${t("d.firstSeen")} ${time(d.url.first_seen)}${s.domain_created ? ` · ${t("d.domainAge")} ${esc(s.domain_created)}` : ""}</p>
        ${v.ai ? `<div class="ai-box"><b>${t("d.ai")}:</b> ${esc(v.ai[`summary_${lang}`] || v.ai.summary_ar)}</div>` : ""}
        <h4>${t("d.reasons")}</h4><ul class="reasons">${(v.reasons || []).map((r) => `<li>${esc(r[lang] || r.ar)}${r.points ? ` <b class="num">(+${r.points})</b>` : ""}<span class="en">${esc(lang === "ar" ? r.en : r.ar)}</span></li>`).join("")}</ul>
        <h4>${t("d.views")} ${s.cloaked ? `<span class="pill v-fraud">${t("cloakTag")}</span>` : ""}</h4>
        <div class="views"><div><h5>${icon("scan")} ${t("d.phone")}</h5><b>${esc(pv.title || "")}</b><p dir="auto">${esc((pv.text || pv.error || "").slice(0, 1200))}</p></div>
          <div><h5>${icon("eye")} ${t("d.scanner")}</h5><b>${esc(bv.title || "")}</b><p dir="auto">${esc((bv.text || bv.error || "").slice(0, 1200))}</p></div></div>
        <h4>${t("d.fp")}</h4><div>${d.fingerprints.map((f) => `<span class="tag u">${esc(f.fingerprints.kind)}: ${esc(f.fingerprints.value)}</span>`).join("") || `<span class="muted">${t("none")}</span>`}</div>
        <h4>${t("d.seen")}</h4><div>${(sort === "old" ? [...d.sightings].reverse() : d.sightings).slice(0, 12).map((x) => `<div class="muted">${src(x.source)}${x.query ? ` · «${esc(x.query)}»` : ""}${x.position ? ` · ${t("d.position", { n: x.position })}` : ""} · ${time(x.seen_at)}</div>`).join("")}</div>
        <h4>${t("ev.title")}</h4><div id="evidenceBox" class="evidence"><p class="muted"><span class="spin"></span> ${t("ev.loading")}</p></div>
        <div class="row" style="margin-top:16px"><button class="btn danger sm" data-ov="block" type="button">${t("d.block")}</button><button class="btn ok sm" data-ov="allow" type="button">${t("d.allow")}</button>
          ${v.claimed_entity_id ? `<button class="btn outline sm" data-ov="official" type="button">${t("d.official")}</button>` : ""}
          <button class="btn outline sm" data-ov="" type="button">${t("d.clear")}</button><button class="btn outline sm" id="rescan" type="button">${t("d.rescan")}</button>
          <a class="btn outline sm" href="/blocked?url=${encodeURIComponent(d.url.url)}" target="_blank" rel="noopener">${t("d.warn")}</a></div>
        <p class="msg" id="detailMsg" role="status"></p>
      </div>`;
    paintIcons($("#detailBody"));
    $("#closeDetail").onclick = () => $("#detail").close();
    $("#rescan").onclick = async () => { await api("/api/rescan", { url: d.url.url }); $("#detailMsg").textContent = t("d.rescanned"); };
    $$("[data-ov]", $("#detailBody")).forEach((b) => (b.onclick = async () => {
      try { await api("/api/override", { domain, action: b.dataset.ov || null }); } catch (err) { $("#detailMsg").textContent = err.message; $("#detailMsg").className = "msg err"; return; }
      $("#detailMsg").textContent = t("d.saved"); refreshState(); loadPage();
    }));
    loadEvidence(d.url.id);
  }

  /* ---------------- start ---------------- */
  paintIcons(); applyLang();
  if (session) { const { data } = await sb.auth.getUser(); if (!data?.user) session = null; }
  session ? showApp() : showLogin();
})();
