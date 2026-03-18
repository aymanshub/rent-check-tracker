const CACHE_NAME = "check-tracker-v1";
const BASE = "/rent-check-tracker/";
const STATIC_ASSETS = [BASE, BASE + "index.html", BASE + "manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
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
  // Don't cache API calls
  if (event.request.url.includes("script.google.com")) return;
  if (event.request.url.includes("googleapis.com")) return;
  if (event.request.url.includes("accounts.google.com")) return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
