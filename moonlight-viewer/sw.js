// sw.js — オフライン用キャッシュ。ファイルを変えたら CACHE の版を必ず上げる（iPhoneに古い画面が残るため）。
const CACHE = "moonlight-viewer-v38";
const APP_ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./shared/inventory-report.js",
  "./shared/inventory-report-ui.js",
  "./shared/inventory-report.css",
  "./js/core.js",
  "./js/cloud.js",
  "./js/calc.js",
  "./js/employees.js",
  "./js/sales.js",
  "./js/buyers.js",
  "./js/inventory.js",
  "./js/bonus.js",
  "./js/shell.js",
  "./js/start.js",
  "./config.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.hostname.endsWith(".supabase.co")) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        return caches.match("./index.html");
      })
  );
});
