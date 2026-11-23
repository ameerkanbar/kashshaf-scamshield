// Operations room: draws the agents in an amphitheater and drives patrol / stop.
(async function () {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const VERDICT = { fraud: "احتيال", suspicious: "مشبوه", safe: "آمن", official: "رسمي", unreachable: "تعذّر" };
  const NS = "http://www.w3.org/2000/svg";
  const SEV = { fraud: 4, suspicious: 3, unreachable: 1, safe: 0, official: -1 };

  // The feed follows the same sort as the dashboard (saved in this browser).
  const SORT_KEY = "kashshaf.sort", SORTS = ["new", "old", "risk"];
  let sort = "new";
  try { sort = localStorage.getItem(SORT_KEY) || "new"; } catch { /* storage off: default order */ }
  if (!SORTS.includes(sort)) sort = "new";

  const cfg = await fetch("/api/config").then((r) => r.json());
  const sb = supabase.createClient(cfg.supabase_url, cfg.supabase_key);
  const session = (await sb.auth.getSession()).data.session;
  if (!session) { location.href = "/"; return; }

  async function api(path, body) {
    const res = await fetch(path, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) { location.href = "/"; throw new Error("login required"); }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  }

  // ---- amphitheater layout ------------------------------------------------------
  // Rows are arcs around a point above the hall (the wall screen); every seat turns to face it.
  const svg = $("#hall");
  let seats = [], seatCount = 0;

  function layout(n) {
    const cx = 600, cy = -230, r0 = 300, rowGap = 64, spacing = 60, span = (46 * Math.PI) / 180;
    const pts = [], rows = [];
    for (let r = r0; pts.length < n; r += rowGap) {
      const per = Math.max(1, Math.floor((r * 2 * span) / spacing) + 1);
      const take = Math.min(per, n - pts.length);
      const used = take === per ? span : (span * (take - 1)) / (per - 1 || 1); // last row stays centered
      for (let k = 0; k < take; k++) {
        const t = Math.PI / 2 + (take === 1 ? 0 : -used + (2 * used * k) / (take - 1));
        pts.push({ x: cx + r * Math.cos(t), y: cy + r * Math.sin(t), deg: (t * 180) / Math.PI - 90 });
      }
      rows.push({ r, used });
    }
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const minX = Math.min(...xs) - 50, maxX = Math.max(...xs) + 50, minY = Math.min(...ys) - 50, maxY = Math.max(...ys) + 40;
    svg.setAttribute("viewBox", `${minX} ${minY} ${maxX - minX} ${maxY - minY}`);

    const arc = ({ r, used }) => {
      const a = Math.PI / 2 - used - 0.06, b = Math.PI / 2 + used + 0.06, R = r + 10;
      return `M ${cx + R * Math.cos(a)} ${cy + R * Math.sin(a)} A ${R} ${R} 0 0 1 ${cx + R * Math.cos(b)} ${cy + R * Math.sin(b)}`;
    };
    svg.innerHTML = `<defs>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="glowRed" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      ${rows.map((row) => `<path class="step" d="${arc(row)}"/>`).join("")}
      ${pts.map((p, i) => `<g class="seat idle" data-i="${i}" transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${p.deg.toFixed(1)})">
        <title></title>
        <rect class="frame" x="-16" y="-28" width="32" height="21" rx="2"/>
        <rect class="scr" x="-14" y="-26" width="28" height="17" rx="1"/>
        <rect class="ln" x="-12" y="-23.5" width="20" height="1.8"/><rect class="ln" x="-12" y="-19" width="15" height="1.8"/><rect class="ln" x="-12" y="-14.5" width="22" height="1.8"/>
        <text class="alert" x="0" y="-13" text-anchor="middle">!</text>
        <rect class="cap" x="-3" y="-7" width="6" height="3"/>
        <ellipse class="body" cx="0" cy="13" rx="13" ry="7"/>
        <circle class="head" cx="0" cy="3.5" r="6.5"/>
      </g>`).join("")}`;
    seats = [...svg.querySelectorAll(".seat")];
    seatCount = n;
  }

  // ---- live state --------------------------------------------------------------------
  let lastSeen = null; const hits = new Map(); // agent name -> until (ms)
  let busy = false;

  async function tick() {
    try {
      const [st, recent] = await Promise.all([api("/api/state"), api("/api/findings?limit=10")]);
      const c = st.control, agents = st.agents;

      // new fraud since last poll: light up the agent that found it
      const newest = recent[0]?.created_at;
      if (lastSeen) recent.filter((f) => f.verdict === "fraud" && f.created_at > lastSeen)
        .forEach((f) => f.agent && hits.set(f.agent, Date.now() + 8000));
      if (newest && (!lastSeen || newest > lastSeen)) lastSeen = newest;

      if (agents.length !== seatCount) layout(Math.max(agents.length, 1));
      const now = Date.now();
      agents.forEach((a, i) => {
        const g = seats[i]; if (!g) return;
        const hit = (hits.get(a.name) || 0) > now;
        const cls = !c.running ? "paused" : hit ? "hit" : a.status === "working" ? "working" : "idle";
        if (!g.classList.contains(cls)) g.setAttribute("class", `seat ${cls}`);
        g.querySelector("title").textContent = `${a.name} · فحص ${a.done}${a.job ? `\n${a.job}` : ""}`;
      });

      // mode + buttons
      const mode = !c.running ? ["stopped", "متوقف"] : c.patrol ? ["patrol", "الدورية تعمل"] : ["running", "الوكلاء جاهزون"];
      $("#mode").className = `mode ${mode[0]}`; $("#mode").textContent = mode[1];
      $("#patrolBtn").disabled = busy || c.patrol;
      $("#stopBtn").disabled = busy || !c.running;
      if (document.activeElement !== $("#count")) $("#count").value = agents.length;

      // wall screen
      const s = st.stats;
      $("#kpis").innerHTML = [["روابط مفحوصة", s.urls], ["في الانتظار", s.queued + s.checking], ["مواقع احتيال", s.fraud, "danger"], ["مواقع محظورة", s.blocked, "danger"]]
        .map(([k, v, d]) => `<div class="${d || ""}"><b>${v}</b><span>${k}</span></div>`).join("");
      $("#ticker").innerHTML = tickerText(c);
      // the latest 10 results, in the chosen order (stable sort: newest first among equals)
      const shown = sort === "old" ? [...recent].reverse()
        : sort === "risk" ? [...recent].sort((a, b) => (SEV[b.verdict] ?? -2) - (SEV[a.verdict] ?? -2) || b.score - a.score)
        : recent;
      $("#feed").innerHTML = shown.map((f) => `<li class="${f.verdict}"><span class="v ${f.verdict}">${VERDICT[f.verdict] || esc(f.verdict)}</span>
        <span class="d" title="${esc(f.url)}">${esc(f.domain)}</span><span class="w">${esc((f.agent || "").split("@")[0])}</span><span class="t" title="${esc(f.created_at)}">${stamp(f.created_at)}</span></li>`).join("")
        || '<li>لا توجد نتائج بعد.</li>';

      // spending meters
      $("#meters").innerHTML = meter("بحث جوجل هذه الساعة", c.serp_hour, c.serp_cap) + meter("تحقيقات Claude هذه الساعة", c.ai_hour, c.ai_cap)
        + `<div class="meter">التوكنز منذ التشغيل<br><b>${(c.input_tokens + c.output_tokens).toLocaleString("en")}</b></div>`
        + `<div class="meter">وفّرت الذاكرة<br><b>${c.serp_saved}</b> بحث · <b>${c.ai_saved}</b> تحقيق</div>`;
    } catch (e) { console.warn(e); }
  }

  function stamp(t) {
    const d = new Date(t);
    return `${d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit" })} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
  }

  function meter(label, v, cap) {
    const pct = cap ? Math.min(100, (100 * v) / cap) : 0;
    return `<div class="meter">${label} <b>${v}/${cap}</b><div class="track"><div class="fill ${v >= cap ? "full" : ""}" style="width:${pct}%"></div></div></div>`;
  }

  function tickerText(c) {
    if (!c.running) return "كل الوكلاء متوقفون. لا يُصرف أي بحث أو توكنز.";
    if (!c.patrol) return "الوكلاء يفحصون ما يصلهم فقط. شغّل الدورية ليبحثوا بأنفسهم باستمرار.";
    const l = c.patrol_last;
    if (!l) return "الدورية بدأت…";
    const at = l.at ? `<span class="t">${stamp(l.at * 1000)}</span> · ` : "";
    if (l.kind === "google") return at + `الدورية بحثت في جوجل عن <b>«${esc(l.query)}»</b> كـ ${esc(l.persona)} · ${l.queued} رابط جديد`
      + (l.known ? ` · ${l.known} موجود مسبقاً لم يُعد فحصه` : "") + (l.known_blocked ? ` · ${l.known_blocked} محظور` : "");
    if (l.kind === "feed") return at + `الدورية فحصت قوائم التصيّد العامة · أضافت ${l.queued} رابطاً`;
    if (l.kind === "ct") return at + `الدورية فحصت سجلات الشهادات الجديدة · أضافت ${l.queued} نطاقاً`;
    if (l.kind === "paused") return at + "وصلنا لحد البحث في هذه الساعة. الدورية تكمل على المصادر المجانية.";
    return at + `خطأ في الدورية: ${esc(l.error || "")}`;
  }

  async function act(action) {
    busy = true; $("#msg").textContent = "";
    try {
      const count = Math.max(1, Math.min(500, +$("#count").value || 50));
      await api("/api/control", action === "patrol" ? { action, count } : { action });
    } catch (e) { $("#msg").textContent = e.message; }
    busy = false; tick();
  }
  $("#sortOrder").value = sort;
  $("#sortOrder").addEventListener("change", () => {
    sort = $("#sortOrder").value;
    try { localStorage.setItem(SORT_KEY, sort); } catch { /* this page only */ }
    tick();
  });
  window.addEventListener("storage", (e) => { // changed in the dashboard in another tab
    if (e.key === SORT_KEY && SORTS.includes(e.newValue)) { sort = e.newValue; $("#sortOrder").value = sort; tick(); }
  });
  $("#patrolBtn").onclick = () => act("patrol");
  $("#stopBtn").onclick = () => act("stop");
  $("#count").addEventListener("change", async () => {
    const count = Math.max(1, Math.min(500, +$("#count").value || 50));
    try { await api("/api/agents", { count }); } catch (e) { $("#msg").textContent = e.message; }
    tick();
  });

  layout(50);
  tick();
  setInterval(tick, 2000);
})();
