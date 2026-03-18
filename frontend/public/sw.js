const CACHE_NAME = "check-tracker-v5";
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

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
