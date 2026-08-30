const CACHE_VERSION = "v22-module-cache-fix";
const CACHE_NAME = `field-task-app-${CACHE_VERSION}`;

const BASE_PATH = "/nsca/";
const DRIVER_URL = BASE_PATH + "driver.html";

const CORE_ASSETS = [
  DRIVER_URL,
  BASE_PATH + "install.html",
  BASE_PATH + "manifest.json",
  BASE_PATH + "icon-192.png",
  BASE_PATH + "icon-512.png",
  BASE_PATH + "logo.jpg"
];

const REMOTE_ASSETS = [
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
  "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  "https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css",
  "https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css",
  "https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js",
  "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js",
  "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js",
  "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js",
  "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js",
  "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_ASSETS);
    await Promise.allSettled(
      REMOTE_ASSETS.map(url => cache.add(url))
    );
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

function isDriverNavigation(requestUrl) {
  const url = new URL(requestUrl);
  return url.origin === self.location.origin &&
    (url.pathname === DRIVER_URL || url.pathname === BASE_PATH);
}

function isCacheableStaticRequest(requestUrl) {
  const url = new URL(requestUrl);
  if (url.origin === self.location.origin) {
    return url.pathname.startsWith(BASE_PATH);
  }
  if (url.hostname === "unpkg.com" || url.hostname === "www.gstatic.com") {
    return true;
  }
  return url.hostname.endsWith(".tile.openstreetmap.org");
}

function shouldUseNetworkFirst(requestUrl) {
  const url = new URL(requestUrl);
  return url.origin === self.location.origin &&
    (url.pathname.endsWith(".js") || url.pathname.endsWith(".html"));
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    if (!isDriverNavigation(request.url)) return;

    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(DRIVER_URL, response.clone());
        }
        return response;
      } catch {
        return (await caches.match(DRIVER_URL)) || Response.error();
      }
    })());
    return;
  }

  if (!isCacheableStaticRequest(request.url)) return;

  event.respondWith((async () => {
    if (shouldUseNetworkFirst(request.url)) {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      } catch {
        return (await caches.match(request)) || Response.error();
      }
    }

    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok || response.type === "opaque") {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      return Response.error();
    }
  })());
});
