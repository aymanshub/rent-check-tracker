const CACHE_NAME = "check-tracker-v8";
const BASE = "/rent-check-tracker/";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = event.request.url;

  // Don't cache API calls or Google services
  if (
    url.includes("script.google.com") ||
    url.includes("script.googleusercontent.com") ||
    url.includes("googleapis.com") ||
    url.includes("accounts.google.com") ||
    url.includes("googleusercontent.com")
  ) {
    return;
  }

  // Navigation requests (HTML): network-first, fall back to cache
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(BASE + "index.html"))
    );
    return;
  }

  // Static assets (JS/CSS/images): cache-first, fall back to network + cache it
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          // Cache successful responses for static assets
          if (response.ok && url.includes("/assets/")) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          // If a JS/CSS chunk fails to load (old hash gone), force reload
          if (url.match(/\.(js|css)$/)) {
            return new Response("", {
              status: 302,
              headers: { Location: BASE },
            });
          }
          return new Response("Offline", { status: 503 });
        });
    })
  );
});
