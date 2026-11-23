/* Usage guide: a welcome box, then boxes that point at each part of the dashboard.
   Opens once per browser session (each new tab/window), and any time from the "دليل الاستخدام" button. */
(() => {
  const KEY = "kashshaf.tourSeen";

  const steps = [
    { welcome: true,
      title: "مرحباً بك في كشّاف",
      body: "منصة شرطة أبوظبي لرصد روابط ومواقع الاحتيال وحظرها قبل أن تصل للناس. هكذا يعمل النظام:" },
    { target: "#toolbar", tab: "overview",
      title: "حالة النظام والترتيب",
      body: "هنا ترى عدد الوكلاء العاملين، وهل وكيل الذكاء الاصطناعي وبحث جوجل يعملان. الأخضر يعني يعمل. ومن «الترتيب» تختار ترتيب كل القوائم في كل الصفحات: الأحدث أو الأقدم أو الأخطر." },
    { target: "#kpis", tab: "overview",
      title: "لوحة المتابعة",
      body: "أرقام مباشرة: كم رابطاً فُحص، وكم موقع احتيال حُظر، وكم عصابة كُشفت. تتحدّث كل 3 ثوانٍ." },
    { target: "#scanText", tab: "scan",
      title: "١. افحص رسالة أو رابطاً",
      body: "الصق رسالة SMS أو واتساب أو بريداً مشبوهاً ثم اضغط «إرسال للوكلاء». يستخرج النظام الروابط ويفحصها، وتظهر النتيجة مع الأسباب تحتها مباشرة." },
    { target: "#discover-panel", tab: "discover",
      title: "٢. الاكتشاف التلقائي",
      body: "يبحث النظام في جوجل والخرائط كأنه ساكن في أبوظبي، ويراقب النطاقات الجديدة وقوائم التصيّد، ويرسل كل رابط للوكلاء." },
    { target: "[data-view=agents] .panel", tab: "agents",
      title: "٣. الوكلاء",
      body: "كل وكيل يفتح الرابط مرتين: كهاتف وكأداة فحص، ليكشف المواقع التي تخفي نفسها. ثم يقارنه بالسجل الرسمي ويحقق فيه وكيل الذكاء الاصطناعي." },
    { target: "[data-view=findings] .panel", tab: "findings",
      title: "٤. النتائج والأدلة",
      body: "كل رابط بحكمه: احتيال، مشبوه، آمن أو رسمي. اضغط على أي نتيجة لترى الأسباب والأدلة، ويمكنك الحظر أو السماح يدوياً." },
    { target: "[data-view=gangs] .panel", tab: "gangs",
      title: "٥. العصابات",
      body: "المواقع التي تستخدم نفس بوت تيليجرام أو رقم واتساب أو الآيبان تُجمع معاً، لأن وراءها غالباً نفس العصابة." },
    { target: "[data-view=audit] .panel", tab: "audit",
      title: "سجل العمليات",
      body: "كل عملية حظر أو سماح أو فحص تُسجَّل باسم المحلل ووقتها، للمراجعة والمساءلة." },
    { final: true,
      title: "٦. حماية الناس",
      body: "أي موقع احتيال يُحظر فوراً. من يضغط على رابطه يرى صفحة تحذير من شرطة أبوظبي بدل صفحة الاحتيال، عبر إضافة المتصفح أو بوابة الروابط الآمنة." },
  ];

  const flow = [
    ["🔎", "اكتشاف", "جوجل، الخرائط، الرسائل"],
    ["📱", "فحص مزدوج", "كهاتف وكأداة فحص"],
    ["🧠", "تحقيق ذكي", "مقارنة بالسجل الرسمي"],
    ["⛔", "حظر وتحذير", "صفحة تحذير للمواطن"],
  ];

  let i = 0, root, spot, card;

  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  function build() {
    root = el("div", "tour"); root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-labelledby", "tourTitle");
    spot = el("div", "tour-spot");
    card = el("div", "tour-card");
    root.append(spot, card);
    document.body.append(root);
    root.addEventListener("click", (e) => {
      const a = e.target.closest("[data-tour]");
      if (!a) return;
      ({ next, prev, close, demo: () => window.open("/blocked?url=" + encodeURIComponent("http://adpolice-fines-pay.example/pay"), "_blank") })[a.dataset.tour]();
    });
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
  }

  function onKey(e) {
    if (!root) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowLeft" || e.key === "Enter") { e.preventDefault(); next(); } // RTL: left moves forward
    else if (e.key === "ArrowRight") { e.preventDefault(); prev(); }
  }

  function render() {
    const s = steps[i], last = i === steps.length - 1;
    if (s.tab) document.querySelector(`#nav [data-tab="${s.tab}"]`)?.click();
    const dots = steps.map((_, k) => `<span class="${k === i ? "on" : ""}"></span>`).join("");
    const extra = s.welcome
      ? `<ol class="tour-flow">${flow.map(([ic, t, d]) => `<li><i aria-hidden="true">${ic}</i><b>${t}</b><small>${d}</small></li>`).join("")}</ol>`
      : s.final ? `<button class="btn tour-demo" data-tour="demo">عرض صفحة التحذير</button>` : "";
    card.className = "tour-card" + (s.welcome || s.final ? " center" : "");
    card.innerHTML = `
      <div class="tour-top"><span class="tour-count">${i + 1} / ${steps.length}</span>
        <button class="tour-x" data-tour="close" aria-label="إغلاق الدليل">✕</button></div>
      <h3 id="tourTitle">${s.title}</h3>
      <p>${s.body}</p>${extra}
      <div class="tour-foot">
        <div class="tour-dots" aria-hidden="true">${dots}</div>
        <div class="tour-btns">
          ${i ? `<button class="btn btn-sm" data-tour="prev">السابق</button>` : `<button class="link" data-tour="close">تخطي</button>`}
          <button class="btn btn-primary btn-sm" data-tour="next">${last ? "ابدأ الاستخدام" : i ? "التالي" : "ابدأ الجولة"}</button>
        </div>
      </div>`;
    requestAnimationFrame(place);
    // the tab loads its data a moment later; follow the panel as it grows
    const at = i;
    [500, 1500].forEach((ms) => setTimeout(() => at === i && place(), ms));
    card.querySelector("[data-tour=next]").focus({ preventScroll: true });
  }

  function target() {
    const s = steps[i];
    if (!s.target) return null;
    for (const sel of [s.target, s.fallback]) {
      const t = sel && document.querySelector(sel);
      if (t && t.offsetParent !== null && t.getBoundingClientRect().height > 8) return t;
    }
    return null;
  }

  function place() {
    if (!root) return;
    const t = target();
    if (!t) { spot.classList.add("none"); card.classList.add("center"); card.style.cssText = ""; return; }
    const r0 = t.getBoundingClientRect();
    if (r0.height > innerHeight * 0.45) window.scrollTo({ top: r0.top + scrollY - 110, behavior: "instant" }); // tall: show its top
    else t.scrollIntoView({ block: "center", behavior: "instant" });
    const r = t.getBoundingClientRect(), pad = 8, vw = innerWidth, vh = innerHeight;
    const h = Math.min(r.height + pad * 2, vh * 0.45);
    spot.classList.remove("none");
    Object.assign(spot.style, { top: r.top - pad + "px", left: r.left - pad + "px", width: r.width + pad * 2 + "px", height: h + "px" });
    card.classList.remove("center");
    if (vw < 640) { card.style.cssText = ""; card.classList.add("dock"); return; }
    card.classList.remove("dock");
    const cw = Math.min(380, vw - 32), ch = card.offsetHeight;
    let top = r.top - pad + h + 12;
    if (top + ch > vh - 16) top = Math.max(16, r.top - pad - ch - 12);
    const right = Math.min(Math.max(16, vw - r.right), vw - cw - 16); // align to the target's right edge (RTL)
    card.style.cssText = `top:${top}px;right:${right}px;width:${cw}px`;
  }

  function next() { if (i < steps.length - 1) { i++; render(); } else close(); }
  function prev() { if (i > 0) { i--; render(); } }

  function close() {
    try { sessionStorage.setItem(KEY, "1"); } catch {}
    document.removeEventListener("keydown", onKey);
    window.removeEventListener("resize", place);
    root?.remove(); root = null;
    document.querySelector('#nav [data-tab="overview"]')?.click();
    document.getElementById("tourBtn")?.focus();
  }

  function start() { if (root) return; i = 0; build(); render(); }

  function maybeStart() {
    let seen = false;
    try { seen = sessionStorage.getItem(KEY) === "1"; } catch {}
    if (!seen) setTimeout(start, 400);
  }

  window.KashshafTour = { start, maybeStart };
})();
