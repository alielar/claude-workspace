/* Control Center service worker.
 *
 * Goal: the app opens instantly and works offline.
 *
 *  - /_next/static/*  → cache-first (file names are content-hashed, safe forever)
 *  - page navigations → serve the cached page immediately, refresh it in the
 *                       background ("stale-while-revalidate"); if nothing is
 *                       cached and the network fails, show /offline
 *  - GET /api/*       → network-first with a short timeout, fall back to cache
 *  - anything else    → network, fall back to cache
 *
 * Writes (POST/PATCH/DELETE) are never cached here; the app queues them itself
 * (see src/lib/local/outbox.ts) and replays when back online.
 */

const VERSION = "cc-v6";
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const API = `${VERSION}-api`;

const PRECACHE_PAGES = ["/today", "/stretch", "/checklist", "/train", "/train/w1", "/train/w2", "/books", "/todo", "/news", "/settings", "/offline"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PAGES).then((cache) =>
      Promise.all(
        PRECACHE_PAGES.map((url) =>
          fetch(url, { credentials: "same-origin" })
            .then((res) => (res.ok ? cache.put(url, res) : null))
            .catch(() => null)
        )
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Hashed build assets: cache-first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  // Page navigations: stale-while-revalidate, offline fallback.
  if (req.mode === "navigate") {
    event.respondWith(
      caches.open(PAGES).then(async (cache) => {
        const cached = await cache.match(url.pathname);
        const network = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(url.pathname, res.clone());
            return res;
          })
          .catch(() => null);
        if (cached) {
          event.waitUntil(network);
          return cached;
        }
        const res = await network;
        if (res) return res;
        return (await cache.match("/offline")) || new Response("Offline", { status: 503 });
      })
    );
    return;
  }

  // RSC payloads / prefetches for pages: let them go to the network, fall back to nothing.
  if (req.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) return;

  // API reads: network-first (3s), then cache.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      caches.open(API).then(async (cache) => {
        try {
          const res = await withTimeout(fetch(req), 3000);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          const hit = await cache.match(req);
          return hit || new Response("null", { status: 503, headers: { "Content-Type": "application/json" } });
        }
      })
    );
    return;
  }

  // Everything else (fonts, images, icons): network, fall back to cache.
  event.respondWith(
    caches.open(STATIC).then(async (cache) => {
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        const hit = await cache.match(req);
        return hit || Response.error();
      }
    })
  );
});
