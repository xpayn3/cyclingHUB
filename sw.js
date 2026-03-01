/* ============================================================
   Service Worker — App Shell + Map Tile Cache
   ============================================================
   1. App shell (HTML, CSS, JS): network-first with cache fallback
   2. Satellite tiles from Esri: cache-first for speed
   3. Navigation Preload: fetch starts while SW boots
============================================================ */

const APP_CACHE    = 'icu-app-shell-v1';
const TILE_CACHE   = 'icu-map-tiles-v1';
const MAX_TILES    = 2000; // rough cap to avoid unbounded disk use
const TILE_ORIGINS = ['server.arcgisonline.com'];

const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
];

// ── Install: pre-cache app shell, activate immediately ───────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(APP_CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: clean up old caches + enable navigation preload ─
self.addEventListener('activate', e => {
  e.waitUntil(
    Promise.all([
      // Clean old cache versions
      caches.keys()
        .then(keys => Promise.all(
          keys
            .filter(k =>
              (k.startsWith('icu-map-tiles-') && k !== TILE_CACHE) ||
              (k.startsWith('icu-app-shell-') && k !== APP_CACHE)
            )
            .map(k => caches.delete(k))
        )),
      // Enable navigation preload (fetch starts while SW boots)
      self.registration.navigationPreload &&
        self.registration.navigationPreload.enable()
    ]).then(() => self.clients.claim())
  );
});

// ── Fetch handler ────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // 1. Tile requests → cache-first
  if (TILE_ORIGINS.some(o => url.includes(o))) {
    e.respondWith(handleTile(e.request));
    return;
  }

  // 2. Same-origin navigation / app shell → network-first
  if (e.request.mode === 'navigate' || isSameOriginAsset(url)) {
    e.respondWith(handleAppShell(e.request, e.preloadResponse));
    return;
  }

  // 3. Everything else → passthrough
});

// ── Network-first for app shell (uses preload when available) ─
async function handleAppShell(request, preloadResponse) {
  try {
    // Use the preloaded response if available (navigation preload)
    const response = (await preloadResponse) || (await fetch(request));
    if (response.ok) {
      const cache = await caches.open(APP_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Fallback for navigation requests: serve cached index.html
    if (request.mode === 'navigate') {
      const fallback = await caches.match('./index.html');
      if (fallback) return fallback;
    }
    return new Response('Offline', { status: 503 });
  }
}

function isSameOriginAsset(url) {
  try {
    const u = new URL(url);
    return u.origin === self.location.origin &&
      (u.pathname.endsWith('.html') || u.pathname.endsWith('.css') || u.pathname.endsWith('.js'));
  } catch { return false; }
}

// ── Cache-first for tiles ────────────────────────────────────
async function handleTile(request) {
  const cache = await caches.open(TILE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
      pruneCache(cache);
    }
    return response;
  } catch {
    return new Response('', { status: 408 });
  }
}

// ── Prune: keep cache under MAX_TILES ───────────────────────
async function pruneCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_TILES) return;
  const toDelete = keys.slice(0, keys.length - MAX_TILES);
  await Promise.all(toDelete.map(k => cache.delete(k)));
}
