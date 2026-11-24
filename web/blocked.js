// Shared by the server warning page (/blocked?url=...) and the browser extension (blocked.html#url).
(function () {
  const params = new URLSearchParams(location.search);
  const blocked = params.get("url") || decodeURIComponent(location.hash.slice(1)) || "";
  document.getElementById("url").textContent = blocked || "—";

  // A victim reports the site with a verified identity (UAE PASS). Only on the server's page: the extension's copy has no link.
  const report = document.getElementById("reportLink");
  const inExtension = location.protocol === "chrome-extension:";
  if (report && blocked && !inExtension) report.href = "/report/start?url=" + encodeURIComponent(blocked);
  else if (report) report.closest(".report").style.display = "none";  // a style beats the hidden attribute

  // Suspicious, not yet confirmed: blocked as a precaution while an analyst reviews it.
  if (params.get("review") === "1") {
    document.body.classList.add("review");
    document.title = "موقع مشبوه قيد المراجعة | Under review";
    document.querySelector(".badge").textContent = "⏳ موقع مشبوه · قيد المراجعة";
    document.getElementById("title").textContent = "هذا الموقع مشبوه، وهو قيد المراجعة";
    document.getElementById("status").hidden = false;
    document.getElementById("msg").textContent =
      "لم نتأكد بعد من أن هذا الموقع احتيالي، لكن فيه علامات مريبة، فحظرناه احترازياً لحمايتك. " +
      "إذا تبيّن أنه آمن سيُرفع الحظر عنه، وإذا ثبت أنه احتيال يبقى محظوراً.";
    document.querySelector(".en h2").textContent = "This site is suspicious and under review";
    document.querySelector(".en p").textContent =
      "We stopped this page as a precaution because it looks suspicious. Abu Dhabi Police analysts are reviewing it now; if it proves safe, the block will be lifted.";
  }

  document.getElementById("close").addEventListener("click", function () {
    // Inside the extension we can close the tab directly.
    if (window.chrome && chrome.tabs && chrome.tabs.getCurrent) {
      chrome.tabs.getCurrent(function (tab) { if (tab) chrome.tabs.remove(tab.id); });
      return;
    }
    // A normal web page may only close tabs that a script opened.
    window.close();
    setTimeout(function () {
      document.getElementById("closed").style.display = "block";
      location.replace("about:blank");
    }, 300);
  });
})();
