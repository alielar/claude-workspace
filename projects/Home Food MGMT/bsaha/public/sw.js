/*
 * Bsaha service worker. Its job is small on purpose:
 * - lets Android (Chrome, Samsung Internet) offer a real "Install app" and open it full screen;
 * - keeps the app's own scripts, styles and dish photos on the phone, so the cook's screens
 *   open fast on mobile data (those files are content-hashed or static, so caching is safe);
 * - shows a plain "no connection" page instead of the browser's error when the network is gone.
 * Pages themselves always come from the network: the menu, votes and orders are never stale.
 */
const VERSION = "bsaha-v1";
const OFFLINE = "/offline.html";

const cacheable = (url) =>
  url.pathname.startsWith("/_next/static/") ||
  url.pathname.startsWith("/dishes/") ||
  url.pathname === "/icon" ||
  url.pathname.startsWith("/apple-icon");

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.add(OFFLINE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
    return;
  }

  if (cacheable(url)) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
        return res;
      })),
    );
  }
});
