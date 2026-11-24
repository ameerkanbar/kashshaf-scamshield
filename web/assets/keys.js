// The keys form: every service key and setting in .env, grouped, with a free connection test per service.
// Used by Settings -> Keys (in a dialog) and by the first-run setup page. Secrets are never shown back:
// only "set ••••1234", and an empty box keeps the current key.
(function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const T = {
    ar: {
      "g.supabase": "قاعدة البيانات (Supabase)", "g.supabase.d": "مطلوبة. أنشئ مشروعاً في supabase.com، ثم من Project Settings ← API Keys انسخ الرابط والمفتاحين.",
      "g.claude": "وكيل الذكاء الاصطناعي (Claude)", "g.claude.d": "اختياري. من console.anthropic.com ← API Keys. بدونه يحكم الوكلاء بالقواعد فقط.",
      "g.search": "بحث جوجل (SerpAPI)", "g.search.d": "اختياري. من serpapi.com ← Dashboard. يكتشف به الوكلاء الإعلانات ونتائج البحث المزيفة.",
      "g.uaepass": "الدخول عبر UAE PASS", "g.uaepass.d": "اختياري. اترك الرابط فارغاً لاستخدام المحاكاة المدمجة.",
      "g.agents": "الوكلاء والحدود", "g.agents.d": "العدد، وحدود الإنفاق في الساعة، ومتى يُعاد الفحص.",
      "g.evidence": "الأدلة والأمان", "g.evidence.d": "لقطات الشاشة، وصفحات الاختبار المحلية، ومفتاح الجلسات.",
      "SUPABASE_URL": "رابط المشروع", "SUPABASE_PUBLISHABLE_KEY": "المفتاح العام (Publishable)", "SUPABASE_SECRET_KEY": "المفتاح السري (Secret)",
      "SUPABASE_SECRET_KEY.h": "يبقى على الخادم فقط، لا يُرسل للمتصفح أبداً.",
      "ANTHROPIC_API_KEY": "مفتاح Claude API", "AGENT_BASE_URL": "بوابة متوافقة (اختياري)", "AGENT_BASE_URL.h": "فارغ = Anthropic مباشرة.",
      "AGENT_MODEL": "النموذج", "SERPAPI_KEY": "مفتاح SerpAPI",
      "UAEPASS_BASE_URL": "رابط UAE PASS", "UAEPASS_BASE_URL.h": "مثال بيئة الاختبار: https://stg-id.uaepass.ae/idshub",
      "UAEPASS_CLIENT_ID": "Client ID", "UAEPASS_CLIENT_SECRET": "Client Secret", "ANALYST_EMAIL_DOMAINS": "نطاقات بريد المحللين",
      "ANALYST_EMAIL_DOMAINS.h": "مفصولة بفواصل، مثل adpolice.gov.ae", "ANALYST_EMAILS": "بريد محللين محدد (اختياري)", "PUBLIC_URL": "الرابط العام للنظام",
      "PUBLIC_URL.h": "عند النشر على خادم، مثل https://kashshaf.example.ae",
      "AGENT_COUNT": "عدد الوكلاء", "AGENT_MIN_RULE_SCORE": "أقل درجة لاستدعاء Claude", "AGENT_MIN_RULE_SCORE.h": "0 = كل رابط غير رسمي. أعلى = إنفاق أقل.",
      "AI_MAX_PER_HOUR": "أقصى استدعاءات Claude في الساعة", "SERP_MAX_PER_HOUR": "أقصى عمليات بحث في الساعة", "PATROL_INTERVAL_SEC": "ثوانٍ بين جولات الدورية",
      "DISCOVERY_INTERVAL_MIN": "دقائق بين جولات الاكتشاف التلقائي", "DISCOVERY_INTERVAL_MIN.h": "0 = يدوي فقط.",
      "SEARCH_COOLDOWN_HOURS": "ساعات قبل تكرار نفس البحث", "AGENT_SEARCH_CACHE_HOURS": "ساعات حفظ نتائج بحث الوكيل", "RECHECK_AFTER_HOURS": "ساعات قبل إعادة فحص الرابط",
      "EVIDENCE_AUTO": "التقاط الأدلة تلقائياً", "CHROME_PATH": "مسار Chrome (اختياري)", "CHROME_PATH.h": "فارغ = يبحث عنه النظام تلقائياً.",
      "ALLOW_LOCAL_TEST_SITES": "السماح بصفحات الاختبار المحلية", "ALLOW_LOCAL_TEST_SITES.h": "اجعله false على الخادم الحقيقي.",
      "KASHSHAF_SESSION_SECRET": "مفتاح توقيع الجلسات (اختياري)", "KASHSHAF_SESSION_SECRET.h": "فارغ = يُشتق من مفتاح Supabase السري.",
      required: "مطلوب", restart: "بعد إعادة التشغيل", set: "مضبوط", notset: "غير مضبوط", keep: "اتركه فارغاً للإبقاء على المفتاح الحالي",
      show: "إظهار", hide: "إخفاء", clear: "حذف المفتاح", test: "اختبار الاتصال", testing: "جارٍ الاختبار…", save: "حفظ وتشغيل", saving: "جارٍ الحفظ…",
      yes: "نعم (true)", no: "لا (false)", def: "الافتراضي: {d}",
      "t.ok": "✓ متصل", "t.incomplete": "أكمل الحقول المطلوبة لهذه الخدمة أولاً.", "t.publishable": "المفتاح العام أو الرابط غير صحيح.",
      "t.secret": "المفتاح السري غير صحيح.", "t.schema": "الاتصال سليم، لكن الجداول غير موجودة بعد: افتح SQL Editor في Supabase وشغّل ملفات supabase/migrations بالترتيب (من 0001 إلى الأخير).",
      "t.key": "المفتاح غير صحيح أو انتهت صلاحيته.", "t.unreachable": "تعذّر الوصول للخدمة. تأكد من الرابط والإنترنت.", "t.other": "ردّت الخدمة بخطأ.",
      "t.untestable": "لا يوجد اختبار لهذه المجموعة.",
      "s.ok": "تم الحفظ وصار مفعّلاً: {k}", "s.none": "لا تغييرات للحفظ.", "s.restart": "هذه تعمل بعد إعادة تشغيل السيرفر: {k}",
      "s.errors": "صحّح الحقول المعلّمة بالأحمر.", "s.supabase": "لم يُحفظ شيء: قاعدة البيانات الجديدة لم تستجب. ", "s.relogin": "تغيّرت قاعدة البيانات: سجّل الدخول من جديد.",
      "e.required": "مطلوب", "e.url": "يجب أن يبدأ بـ http:// أو https://", "e.int": "رقم صحيح", "e.number": "رقم", "e.other": "قيمة غير صالحة",
    },
    en: {
      "g.supabase": "Database (Supabase)", "g.supabase.d": "Required. Create a project at supabase.com, then copy the URL and both keys from Project Settings → API Keys.",
      "g.claude": "AI agent (Claude)", "g.claude.d": "Optional. From console.anthropic.com → API Keys. Without it the agents judge by rules only.",
      "g.search": "Google search (SerpAPI)", "g.search.d": "Optional. From serpapi.com → Dashboard. Lets the agents find fake ads and search results.",
      "g.uaepass": "Sign-in with UAE PASS", "g.uaepass.d": "Optional. Leave the URL empty to use the built-in simulation.",
      "g.agents": "Agents and limits", "g.agents.d": "How many, spending caps per hour, and when to check again.",
      "g.evidence": "Evidence and safety", "g.evidence.d": "Screenshots, local test pages and the session signing key.",
      "SUPABASE_URL": "Project URL", "SUPABASE_PUBLISHABLE_KEY": "Publishable key", "SUPABASE_SECRET_KEY": "Secret key",
      "SUPABASE_SECRET_KEY.h": "Stays on the server, never sent to the browser.",
      "ANTHROPIC_API_KEY": "Claude API key", "AGENT_BASE_URL": "Compatible gateway (optional)", "AGENT_BASE_URL.h": "Empty = Anthropic directly.",
      "AGENT_MODEL": "Model", "SERPAPI_KEY": "SerpAPI key",
      "UAEPASS_BASE_URL": "UAE PASS URL", "UAEPASS_BASE_URL.h": "Staging example: https://stg-id.uaepass.ae/idshub",
      "UAEPASS_CLIENT_ID": "Client ID", "UAEPASS_CLIENT_SECRET": "Client secret", "ANALYST_EMAIL_DOMAINS": "Analyst email domains",
      "ANALYST_EMAIL_DOMAINS.h": "Comma-separated, e.g. adpolice.gov.ae", "ANALYST_EMAILS": "Specific analyst emails (optional)", "PUBLIC_URL": "Public URL",
      "PUBLIC_URL.h": "When deployed on a server, e.g. https://kashshaf.example.ae",
      "AGENT_COUNT": "Number of agents", "AGENT_MIN_RULE_SCORE": "Lowest score that calls Claude", "AGENT_MIN_RULE_SCORE.h": "0 = every non-official link. Higher = less spend.",
      "AI_MAX_PER_HOUR": "Max Claude calls per hour", "SERP_MAX_PER_HOUR": "Max searches per hour", "PATROL_INTERVAL_SEC": "Seconds between patrol rounds",
      "DISCOVERY_INTERVAL_MIN": "Minutes between automatic discovery", "DISCOVERY_INTERVAL_MIN.h": "0 = manual only.",
      "SEARCH_COOLDOWN_HOURS": "Hours before repeating a search", "AGENT_SEARCH_CACHE_HOURS": "Hours to keep agent search results", "RECHECK_AFTER_HOURS": "Hours before re-checking a link",
      "EVIDENCE_AUTO": "Capture evidence automatically", "CHROME_PATH": "Chrome path (optional)", "CHROME_PATH.h": "Empty = found automatically.",
      "ALLOW_LOCAL_TEST_SITES": "Allow local test pages", "ALLOW_LOCAL_TEST_SITES.h": "Set to false on a real server.",
      "KASHSHAF_SESSION_SECRET": "Session signing key (optional)", "KASHSHAF_SESSION_SECRET.h": "Empty = derived from the Supabase secret key.",
      required: "Required", restart: "After a restart", set: "Set", notset: "Not set", keep: "Leave empty to keep the current key",
      show: "Show", hide: "Hide", clear: "Remove key", test: "Test connection", testing: "Testing…", save: "Save and apply", saving: "Saving…",
      yes: "Yes (true)", no: "No (false)", def: "Default: {d}",
      "t.ok": "✓ Connected", "t.incomplete": "Fill in this service's required fields first.", "t.publishable": "The URL or publishable key is wrong.",
      "t.secret": "The secret key is wrong.", "t.schema": "Connected, but the tables are not there yet: open the SQL Editor in Supabase and run the files in supabase/migrations in order (0001 to the last).",
      "t.key": "The key is wrong or expired.", "t.unreachable": "Could not reach the service. Check the URL and the internet.", "t.other": "The service answered with an error.",
      "t.untestable": "No test for this group.",
      "s.ok": "Saved and in use: {k}", "s.none": "No changes to save.", "s.restart": "These take effect after a server restart: {k}",
      "s.errors": "Fix the fields marked in red.", "s.supabase": "Nothing was saved: the new database did not answer. ", "s.relogin": "The database changed: please sign in again.",
      "e.required": "Required", "e.url": "Must start with http:// or https://", "e.int": "A whole number", "e.number": "A number", "e.other": "Invalid value",
    },
  };
  const GROUPS = ["supabase", "claude", "search", "uaepass", "agents", "evidence"];
  const TESTABLE = new Set(["supabase", "claude", "search"]);
  const EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';

  function errText(t, e) {
    return /required/.test(e) ? t("e.required") : /http/.test(e) ? t("e.url") : /whole/.test(e) ? t("e.int") : /number/.test(e) ? t("e.number") : t("e.other");
  }

  /**
   * mount(el, { fields, lang, test(group, values) -> Promise<result>, save(values) -> Promise<response>, onSaved(response), only })
   * only: an array of groups to show (the setup page shows every group, Supabase first).
   */
  function mount(el, opts) {
    const lang = opts.lang === "en" ? "en" : "ar";
    const t = (k, v = {}) => String(T[lang][k] ?? T.ar[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? "");
    let fields = opts.fields;
    const clear = new Set();

    const input = (f) => {
      const id = `key_${f.name}`;
      if (f.kind === "bool") {
        const v = f.value || f.default;
        return `<select id="${id}" name="${f.name}"><option value="true"${v === "true" ? " selected" : ""}>${esc(t("yes"))}</option><option value="false"${v === "false" ? " selected" : ""}>${esc(t("no"))}</option></select>`;
      }
      const type = f.kind === "secret" ? "password" : f.kind === "url" ? "url" : "text";
      const ph = f.kind === "secret" ? (f.set ? t("keep") : "") : f.default ? t("def", { d: f.default }) : "";
      const mode = f.kind === "int" || f.kind === "number" ? ` inputmode="${f.kind === "int" ? "numeric" : "decimal"}"` : "";
      return `<div class="kf-input"><input id="${id}" name="${f.name}" type="${type}" dir="${f.kind === "secret" && f.set ? "auto" : "ltr"}" autocomplete="off" spellcheck="false"${mode}${f.kind === "secret" ? " data-secret" : ""}
          value="${f.kind === "secret" ? "" : esc(f.value || "")}" placeholder="${esc(ph)}">
        ${f.kind === "secret" ? `<button type="button" class="kf-eye" data-eye="${id}" title="${esc(t("show"))}" aria-label="${esc(t("show"))}">${EYE}</button>` : ""}</div>`;
    };
    const fieldHtml = (f) => `<div class="kf" data-field="${f.name}">
        <label for="key_${f.name}"><span>${esc(t(f.name))}</span>
          ${f.required ? `<em class="kf-req">${esc(t("required"))}</em>` : ""}${f.restart ? `<em class="kf-restart">${esc(t("restart"))}</em>` : ""}
          ${f.kind === "secret" ? `<em class="kf-state ${f.set ? "on" : ""}">${esc(f.set ? t("set") : t("notset"))}${f.set && f.hint ? ` <bdi dir="ltr">${esc(f.hint)}</bdi>` : ""}</em>` : ""}</label>
        ${input(f)}
        ${T[lang][f.name + ".h"] ? `<small class="kf-help">${esc(t(f.name + ".h"))}</small>` : ""}
        ${f.kind === "secret" && f.set && !f.required ? `<label class="kf-clear"><input type="checkbox" data-clear="${f.name}"> ${esc(t("clear"))}</label>` : ""}
        <small class="kf-err" role="alert"></small></div>`;

    function render() {
      const groups = (opts.only || GROUPS).filter((g) => fields.some((f) => f.group === g));
      el.innerHTML = `<form class="keys-form" novalidate>
          ${groups.map((g) => `<fieldset class="kg" data-group="${g}">
            <legend>${esc(t("g." + g))}</legend><p class="kg-d">${esc(t("g." + g + ".d"))}</p>
            <div class="kg-grid">${fields.filter((f) => f.group === g).map(fieldHtml).join("")}</div>
            ${TESTABLE.has(g) ? `<div class="kg-test"><button type="button" class="btn outline sm" data-testgroup="${g}">${esc(t("test"))}</button><span class="kg-result" role="status"></span></div>` : ""}
          </fieldset>`).join("")}
          <div class="keys-foot"><span class="keys-msg" role="status"></span><button type="submit" class="btn primary">${esc(t("save"))}</button></div>
        </form>`;
      const form = el.querySelector("form");
      form.querySelectorAll("[data-eye]").forEach((b) => (b.onclick = () => {
        const i = el.querySelector("#" + b.dataset.eye); i.type = i.type === "password" ? "text" : "password";
        b.title = b.ariaLabel = t(i.type === "password" ? "show" : "hide");
      }));
      form.querySelectorAll("[data-clear]").forEach((c) => (c.onchange = () => (c.checked ? clear.add(c.dataset.clear) : clear.delete(c.dataset.clear))));
      form.querySelectorAll("[data-testgroup]").forEach((b) => (b.onclick = () => runTest(b.dataset.testgroup, b)));
      form.onsubmit = (e) => { e.preventDefault(); runSave(form.querySelector("[type=submit]")); };
    }
    const values = (group) => {
      const out = {};
      el.querySelectorAll(group ? `[data-group="${group}"] [name]` : "[name]").forEach((i) => { if (i.name && !i.dataset.clear) out[i.name] = i.value.trim(); });
      return out;
    };
    const showResult = (group, r) => {
      const box = el.querySelector(`[data-group="${group}"] .kg-result`); if (!box) return;
      box.className = "kg-result " + (r.ok ? "ok" : "bad");
      box.textContent = r.ok ? `${t("t.ok")}${r.detail ? " · " + r.detail : ""}` : `${t("t." + (r.code || "other"))}${r.detail && r.code !== "schema" ? " (" + r.detail + ")" : ""}`;
    };
    async function runTest(group, b) {
      const box = el.querySelector(`[data-group="${group}"] .kg-result`);
      b.disabled = true; box.className = "kg-result"; box.innerHTML = `<span class="sk sk-line" style="width:120px"></span>`;
      try { showResult(group, await opts.test(group, values(group))); }
      catch (e) { box.className = "kg-result bad"; box.textContent = e.message; }
      finally { b.disabled = false; }
    }
    async function runSave(b) {
      const msg = el.querySelector(".keys-msg");
      el.querySelectorAll(".kf").forEach((x) => { x.classList.remove("bad"); x.querySelector(".kf-err").textContent = ""; });
      b.disabled = true; b.textContent = t("saving"); msg.className = "keys-msg"; msg.textContent = "";
      try {
        const r = await opts.save({ ...values(), _clear: [...clear] });
        if (r.fields) { fields = r.fields; clear.clear(); render(); }
        const m = el.querySelector(".keys-msg");
        m.className = "keys-msg ok";
        const list = (ks) => ks.map((k) => t(k)).join(lang === "ar" ? "، " : ", ");
        m.textContent = r.saved?.length ? t("s.ok", { k: list(r.saved) }) + (r.restart?.length ? " · " + t("s.restart", { k: list(r.restart) }) : "") : t("s.none");
        opts.onSaved?.(r);
      } catch (e) {
        const body = e.body || {};
        msg.className = "keys-msg bad";
        if (body.errors) {
          Object.entries(body.errors).forEach(([k, v]) => { const f = el.querySelector(`[data-field="${k}"]`); if (f) { f.classList.add("bad"); f.querySelector(".kf-err").textContent = errText(t, v); } });
          msg.textContent = t("s.errors");
        } else if (body.test) { showResult("supabase", body.test); msg.textContent = t("s.supabase") + t("t." + (body.test.code || "other")); }
        else msg.textContent = e.message;
      } finally {
        const sb = el.querySelector("[type=submit]"); if (sb) { sb.disabled = false; sb.textContent = t("save"); }
      }
    }
    render();
    return { t };
  }

  window.KashshafKeys = { mount, T };
})();
