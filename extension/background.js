// Pulls the Kashshaf blocklist and turns each domain into a redirect rule.
// Any visit to a blocked domain (and its subdomains) opens blocked.html instead.
const DEFAULT_API = "http://localhost:8080";

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function apiBase() {
  const { api } = await chrome.storage.local.get("api");
  return api || DEFAULT_API;
}

async function sync() {
  let domains, review;
  try {
    const res = await fetch(`${await apiBase()}/api/blocklist`, { cache: "no-store" });
    const data = await res.json();
    domains = data.domains || [];
    review = new Set(data.review || []); // suspicious: blocked until an analyst reviews it
  } catch (e) {
    console.warn("Kashshaf: could not reach the server, keeping the current rules", e);
    return;
  }
  const page = chrome.runtime.getURL("blocked.html");
  const addRules = domains.map((domain, i) => ({
    id: i + 1,
    priority: 1,
    // suspicious sites get the "under review" message, confirmed fraud the "fraud page" one
    action: { type: "redirect", redirect: { regexSubstitution: `${page}${review.has(domain) ? "?review=1" : ""}#\\0` } },
    condition: {
      regexFilter: `^https?://([^/?#]*\\.)?${escapeRegex(domain)}(:[0-9]+)?([/?#].*)?$`,
      resourceTypes: ["main_frame"],
    },
  }));
  const old = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: old.map((r) => r.id), addRules });
  await chrome.storage.local.set({ lastSync: Date.now(), domains, review: [...review] });
  console.log(`Kashshaf: ${domains.length} blocked domains (${review.size} under review)`, domains);
}

chrome.runtime.onInstalled.addListener(() => { chrome.alarms.create("sync", { periodInMinutes: 0.5 }); sync(); });
chrome.runtime.onStartup.addListener(sync);
chrome.alarms.onAlarm.addListener((a) => { if (a.name === "sync") sync(); });
