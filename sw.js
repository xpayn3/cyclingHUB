/* ============================================================
   Service Worker — Map Tile Cache
   Caches satellite tiles from Esri so they load offline /
   instantly on subsequent visits.
============================================================ */

const TILE_CACHE   = 'icu-map-tiles-v1';
const MAX_TILES    = 2000; // rough cap to avoid unbounded disk use
const TILE_ORIGINS = ['server.arcgisonline.com'];

// ── Install: activate immediately ───────────────────────────
self.addEventListener('install', () => self.skipWaiting());

// ── Activate: clean up old cache versions ───────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k.startsWith('icu-map-tiles-') && k !== TILE_CACHE)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first for tile requests ────────────────────
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Only intercept tile requests
  if (!TILE_ORIGINS.some(o => url.includes(o))) return;

  e.respondWith(
    caches.open(TILE_CACHE).then(async cache => {
      // Cache hit → return immediately
      const cached = await cache.match(e.request);
      if (cached) return cached;

      // Cache miss → fetch, store, return
      try {
        const response = await fetch(e.request);
        if (response.ok) {
          cache.put(e.request, response.clone());
          // Prune oldest entries if over the cap (fire-and-forget)
          pruneCache(cache);
        }
        return response;
      } catch {
        // Offline and not cached — return empty 408 so Leaflet
        // renders a blank tile rather than throwing an error
        return new Response('', { status: 408 });
      }
    })
  );
});

// ── Prune: keep cache under MAX_TILES ───────────────────────
async function pruneCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_TILES) return;
  // Delete oldest entries (they're in insertion order)
  const toDelete = keys.slice(0, keys.length - MAX_TILES);
  await Promise.all(toDelete.map(k => cache.delete(k)));
}
