// RemoteIDE Service Worker - Offline Shell & Safe Caching
const CACHE_NAME = "remoteide-shell-v1";
const SHELL_ASSETS = [
  "/",
  "/manifest.json",
  "/logo.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_ASSETS).catch((err) => {
        console.warn("Failed to pre-cache some shell assets:", err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never cache API requests, cross-origin responses (e.g. a separately hosted gateway), or authenticated state
  if (
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/socket.io/") ||
    event.request.headers.has("Authorization") ||
    event.request.method !== "GET"
  ) {
    return; // Pass directly to network
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.match(/\.(png|jpg|jpeg|svg|css|js|woff2)$/)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // HTML navigation: Network-first with cached shell fallback if offline
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match("/").then((cached) => {
          return cached || new Response("RemoteIDE is offline. Please reconnect.", {
            headers: { "Content-Type": "text/html" }
          });
        });
      })
    );
  }
});

