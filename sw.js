const CACHE_VERSION = "v14";
const CACHE_NAME = `field-task-app-${CACHE_VERSION}`;

const BASE_PATH = "/driva-pwa/";

const APP_SHELL = [
  BASE_PATH,
  BASE_PATH + "driver.html",
  BASE_PATH + "manifest.json",
  BASE_PATH + "icon-192.png",
  BASE_PATH + "icon-512.png"
];

// INSTALL
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// ACTIVATE
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(k => {
          if (k !== CACHE_NAME) {
            return caches.delete(k);
          }
          return Promise.resolve();
        })
      )
    )
  );
  self.clients.claim();
});

// FETCH
self.addEventListener("fetch", event => {
  const request = event.request;

  // Always serve app shell for navigation
  if (request.mode === "navigate") {
    event.respondWith(
      caches.match(BASE_PATH + "driver.html")
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request)
        .then(response => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, copy);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(BASE_PATH + "driver.html");
        });
    })
  );
});
