// A victim's verified report: UAE PASS sends the person back here with a one-time ticket in the address.
(function () {
  const $ = (s) => document.querySelector(s);
  const hash = new URLSearchParams(location.hash.slice(1));
  const ticket = hash.get("ticket"), error = hash.get("error");
  const url = hash.get("url") || new URLSearchParams(location.search).get("url") || "";
  if (location.hash) history.replaceState(null, "", location.pathname);  // the ticket leaves the address bar
  const show = (id) => ["intro", "form", "done"].forEach((x) => { $("#" + x).hidden = x !== id; });

  const ADVICE = {
    card: "اتصل ببنكك فوراً لإيقاف البطاقة والاعتراض على أي عملية.",
    otp: "اتصل ببنكك وأبلغه بأنك أعطيت رمز تحقق لموقع احتيال.",
    id: "راقب حساباتك، ولا تعطِ رمز تحقق لأحد يتصل بك باسم جهة رسمية.",
    password: "غيّر كلمة المرور فوراً في كل حساب يستخدمها.",
    paid: "احتفظ بإيصال الدفع أو التحويل وكشف الحساب: تحتاجه الشرطة والبنك.",
  };

  if (!ticket) {
    show("intro");
    $("#introMsg").textContent = error === "cancelled" ? "أُلغي التحقق عبر UAE PASS."
      : error === "unverified" ? "حسابك في UAE PASS غير موثّق بعد. وثّق حسابك ثم أعد المحاولة." : "";
    $("#introUrl").textContent = url || "—";
    if (url) $("#startBtn").href = `/report/start?url=${encodeURIComponent(url)}`;
    else $("#startBtn").style.display = "none";
    return;
  }

  fetch(`/api/report_ticket?ticket=${encodeURIComponent(ticket)}`)
    .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
    .then(({ ok, d }) => {
      if (!ok) {
        show("intro");
        $("#introMsg").textContent = d.error;
        $("#startBtn").style.display = "none";
        return;
      }
      show("form");
      $("#who").textContent = d.name_ar;
      $("#whoEn").textContent = d.name_en;
      $("#level").textContent = `${d.level} · ${d.level_ar}`;
      $("#idn").textContent = d.idn;
      $("#reportUrl").textContent = d.url;
    });

  $("#reportForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const what = [...document.querySelectorAll('input[name="what"]:checked')].map((x) => x.value);
    if (!what.length) {
      $("#formMsg").textContent = "اختر ما فعلته في الموقع، أو «لم أُدخل شيئاً».";
      return;
    }
    $("#formMsg").textContent = "";
    $("#sendBtn").disabled = true;
    $("#sendBtn").textContent = "جارٍ الإرسال…";
    try {
      const res = await fetch("/api/report", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket, what, amount: $("#amount").value, channel: $("#channel").value,
                               notes: $("#notes").value, contact_ok: $("#contact").checked }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "تعذّر إرسال البلاغ");
      $("#ref").textContent = d.ref;
      const tips = what.filter((w) => ADVICE[w]).map((w) => ADVICE[w]);
      tips.push("لا تفتح الرابط مرة أخرى، وحذّر من أرسله إليك.");
      $("#advice").innerHTML = "";
      tips.forEach((t) => { const li = document.createElement("li"); li.textContent = t; $("#advice").appendChild(li); });
      show("done");
    } catch (err) {
      $("#formMsg").textContent = err.message;
      $("#sendBtn").disabled = false;
      $("#sendBtn").textContent = "إرسال البلاغ";
    }
  });
})();
