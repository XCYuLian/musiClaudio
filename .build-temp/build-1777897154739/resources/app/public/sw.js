/**
 * Claudio Service Worker
 *
 * Strategy: Cache-first for shell, network-first for API.
 * Prefetch: cues the next track 10s before current ends.
 */

const CACHE_NAME = 'claudio-v1';
const SHELL_FILES = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json',
];

// ── Install: cache the app shell ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

// ── Activate: clean old caches ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch: cache-first for shell, network-first for API ──
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET
  if (event.request.method !== 'GET') return;

  // ─ API / WebSocket — network first, no caching ─
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/stream')) {
    return; // Don't intercept — let browser handle
  }

  // ─ TTS audio — network first, cache on success ─
  if (url.pathname.startsWith('/tts/')) {
    event.respondWith(networkFirstWithCache(event.request));
    return;
  }

  // ─ Shell / static — cache first, network fallback ─
  event.respondWith(cacheFirstWithNetwork(event.request));
});

// ── Strategies ──
async function cacheFirstWithNetwork(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirstWithCache(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}

// ── Message: prefetch next track (called from app.js) ──
self.addEventListener('message', (event) => {
  if (event.data?.type === 'prefetch' && event.data?.url) {
    const url = event.data.url;
    caches.open(CACHE_NAME).then(cache => {
      fetch(url).then(res => {
        if (res.ok) cache.put(url, res);
      }).catch(() => {});
    });
  }
});
