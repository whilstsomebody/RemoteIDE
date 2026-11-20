// RemoteIDE Service Worker - Offline Shell & Safe Caching
const CACHE_NAME = "remoteide-shell-v1";
const SHELL_ASSETS = [
  "/",
  "/manifest.json",
  "/logo.png"
];

// Install: Cache core application shell
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

// Activate: Clean up old caches
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

// Fetch: Network-first for dynamic and API routes; Stale-while-revalidate for static assets
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Strictly NEVER cache API requests, WebSocket endpoints, or sensitive state
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/socket.io/") ||
    event.request.headers.has("Authorization") ||
    event.request.method !== "GET"
  ) {
    return; // Pass directly to network
  }

  // Next.js static assets (_next/static, images)
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

