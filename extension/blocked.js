// Shared by the server warning page (/blocked?url=...) and the browser extension (blocked.html#url).
(function () {
  const params = new URLSearchParams(location.search);
  const blocked = params.get("url") || decodeURIComponent(location.hash.slice(1)) || "";
  document.getElementById("url").textContent = blocked || "—";

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
