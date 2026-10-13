/*
 * Service worker MUE (étape 1 : cache des assets lourds).
 * - modèles 3D / polices / icônes : cache-first (versionné)
 * - pages : network-first avec repli sur le cache
 * La file de synchro hors-ligne des séances arrive à l'étape "séance-combat".
 */
const VERSION = "mue-v1";
const ASSETS = `${VERSION}-assets`;
const PAGES = `${VERSION}-pages`;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(ASSETS).then((c) => c.addAll(["/models/hero-m.glb", "/icons/icon-192.png"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const heavy = url.pathname.startsWith("/models/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/_next/static/");
  if (heavy) {
    event.respondWith(
      caches.open(ASSETS).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      }),
    );
  } else if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(PAGES).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match("/"))),
    );
  }
});
