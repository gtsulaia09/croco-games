/* Croco Games service worker: caches the static app shell only.
 * API and WebSocket traffic is never cached or replayed — offline mode never pretends to
 * synchronise multiplayer actions. */
const CACHE = "croco-shell-v2";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  // Never touch API or WebSocket upgrade requests, even when the API shares the origin.
  if (url.pathname.includes("/api/")) return;
  // Hashed build assets: cache-first (file names change with every build).
  if (url.pathname.includes("/assets/")) {
    event.respondWith(
      caches.match(event.request).then(
        (hit) =>
          hit ||
          fetch(event.request).then((res) => {
            // Clone synchronously: the original body is streamed to the page.
            if (res.ok) {
              const copy = res.clone();
              event.waitUntil(caches.open(CACHE).then((c) => c.put(event.request, copy)));
            }
            return res;
          }),
      ),
    );
    return;
  }
  if (event.request.mode !== "navigate") {
    // Small static files (icon, manifest): network-first, cached copy when offline.
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            event.waitUntil(caches.open(CACHE).then((c) => c.put(event.request, copy)));
          }
          return res;
        })
        .catch(() => caches.match(event.request).then((hit) => hit || Response.error())),
    );
    return;
  }
  // Navigations: network-first, the cached shell when offline.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        // Only the app's own index page is kept as the offline shell.
        if (res.ok && (url.pathname.endsWith("/") || url.pathname.endsWith("/index.html"))) {
          const copy = res.clone();
          event.waitUntil(caches.open(CACHE).then((c) => c.put("shell", copy)));
        }
        return res;
      })
      .catch(() => caches.match("shell").then((hit) => hit || Response.error())),
  );
});
