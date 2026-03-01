/* Heatmap module — extracted from app.js */
import { state } from './state.js';

/* ── Lazy proxies for functions defined in other modules ── */
const _app = (fn) => (...a) => window[fn](...a);
const showToast        = _app('showToast');
const getAllActivities  = _app('getAllActivities');
const fetchMapGPS      = _app('fetchMapGPS');
const loadMapTheme     = _app('loadMapTheme');
const _mlGetStyle      = _app('_mlGetStyle');
const _mlApplyTerrain  = _app('_mlApplyTerrain');
const loadTerrainEnabled = _app('loadTerrainEnabled');
const _isMobile        = _app('_isMobile');
const isEmptyActivity  = _app('isEmptyActivity');

/* ====================================================
   HEAT MAP PAGE
==================================================== */
const _hm = {
  map: null,
  polylines: [],       // MapLibre layer ID references
  heatLayer: null,     // MapLibre heatmap layer ID
  allRoutes: [],       // [{id, points, date, type, distance, time, power, hr, name}]
  loaded: false,
  loading: false,
  filter: 'all',       // 'all','year','6mo','90d','custom'
  sportFilter: 'all',  // 'all','Ride','Run','Swim','Walk'
  colorMode: 'heat',   // 'heat','speed','power','time','elevation'
  animating: false,
  animIdx: 0,
  animTimer: null,
  timeFilter: 'all',   // 'all','morning','afternoon','evening','night'
};
/* ── Expose for cross-module access (theme hot-swap) ── */
window._hm = _hm;

/* ── Render the page shell ── */
export function renderHeatmapPage() {
  const container = document.getElementById('heatmapPageContent');
  if (!container) return;

  container.innerHTML = `
    <div class="hm-wrapper">
      <!-- Map fills entire shell -->
      <div class="hm-map-container">
        <div id="heatmapMap" class="hm-map"></div>
        <div class="hm-loading" id="hmLoading">
          <div class="hm-loading-spinner"></div>
          <div class="hm-loading-text">Loading GPS routes…</div>
          <div class="hm-loading-sub" id="hmLoadingSub">0 of 0</div>
        </div>
      </div>

      <!-- Floating legend pill: top-center -->
      <div class="hm-overlay hm-overlay--legend">
        <div class="hm-legend" id="hmLegend"></div>
      </div>

      <!-- Unified floating bottom panel -->
      <div class="hm-overlay hm-overlay--bottom">
        <div class="hm-bottom-panel">
          <div class="hm-grabber"><span class="hm-grabber-pill"></span></div>
          <!-- Section 1: Stats -->
          <div class="hm-panel-stats">
            <div class="hm-stats" id="hmStats">
              <div class="hm-stat"><span class="hm-stat-val" id="hmStatRoutes">—</span><span class="hm-stat-label">Routes</span></div>
              <div class="hm-stat"><span class="hm-stat-val" id="hmStatDist">—</span><span class="hm-stat-label">Total km</span></div>
              <div class="hm-stat"><span class="hm-stat-val" id="hmStatTime">—</span><span class="hm-stat-label">Hours</span></div>
              <div class="hm-stat"><span class="hm-stat-val" id="hmStatElev">—</span><span class="hm-stat-label">Elevation (m)</span></div>
            </div>
          </div>
          <!-- Section 2: Filters (collapsible) -->
          <div class="hm-panel-filters" id="hmPanelFilters">
            <div class="hm-controls">
              <div class="hm-control-group">
                <label class="hm-label">Period</label>
                <div class="hm-pills" id="hmPeriodPills">
                  <button class="hm-pill active" data-val="all">All Time</button>
                  <button class="hm-pill" data-val="year">This Year</button>
                  <button class="hm-pill" data-val="6mo">6 Months</button>
                  <button class="hm-pill" data-val="90d">90 Days</button>
                </div>
              </div>
              <div class="hm-control-group">
                <label class="hm-label">Style</label>
                <div class="hm-pills" id="hmColorPills">
                  <button class="hm-pill active" data-val="heat">Heat</button>
                  <button class="hm-pill" data-val="lines">Lines</button>
                  <button class="hm-pill" data-val="speed">Speed</button>
                  <button class="hm-pill" data-val="time">By Year</button>
                </div>
              </div>
              <div class="hm-control-group">
                <label class="hm-label">Time of Day</label>
                <div class="hm-pills" id="hmTimePills">
                  <button class="hm-pill active" data-val="all">All</button>
                  <button class="hm-pill" data-val="morning">Morning</button>
                  <button class="hm-pill" data-val="afternoon">Afternoon</button>
                  <button class="hm-pill" data-val="evening">Evening</button>
                </div>
              </div>
            </div>
          </div>
          <!-- Section 3: Animate bar (collapsible) -->
          <div class="hm-panel-animate">
            <div class="hm-animate-bar">
              <button class="hm-animate-btn" id="hmAnimateBtn" onclick="hmToggleAnimate()">
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><polygon points="5,3 19,12 5,21"/></svg>
                <span id="hmAnimateLabel">Replay Rides</span>
              </button>
              <div class="hm-speed-pills" id="hmSpeedPills">
                <button class="hm-speed-pill active" data-speed="1">1x</button>
                <button class="hm-speed-pill" data-speed="2">2x</button>
                <button class="hm-speed-pill" data-speed="3">3x</button>
              </div>
              <div class="hm-animate-progress" id="hmAnimateProgress">
                <div class="hm-animate-bar-fill" id="hmAnimateBarFill"></div>
              </div>
              <span class="hm-animate-count" id="hmAnimateCount"></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Wire up pill buttons
  _hmWirePills('hmPeriodPills', v => { _hm.filter = v; hmApplyFilters(); });
  _hmWirePills('hmSportPills',  v => { _hm.sportFilter = v; hmApplyFilters(); });
  _hmWirePills('hmColorPills',  v => { _hm.colorMode = v; hmRedraw(); });
  _hmWirePills('hmTimePills',   v => { _hm.timeFilter = v; hmApplyFilters(); });

  // Wire speed pills
  const speedWrap = document.getElementById('hmSpeedPills');
  if (speedWrap) {
    speedWrap.querySelectorAll('.hm-speed-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        speedWrap.querySelectorAll('.hm-speed-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _hm.animSpeed = parseInt(btn.dataset.speed, 10) || 1;
      });
    });
  }

  // Init map
  _hmInitMap();

  // Load routes
  if (!_hm.loaded) {
    hmLoadAllRoutes();
  } else {
    // Already loaded — hide the loading overlay and draw
    const ld = document.getElementById('hmLoading');
    if (ld) ld.style.display = 'none';
    hmApplyFilters();
  }

  _hmInitSheet();
}

/* ── Mobile bottom-sheet (swipe to collapse / expand) ── */
/* state: 0=expanded, 1=stats-only, 2=hidden (grabber only) */
const _hmSheet = { startY: 0, startX: 0, tracking: false, directionLocked: false, state: 0, collapseH: 0, hideH: 0 };

export function _hmSetSheetState(s, overlay) {
  _hmSheet.state = s;
  overlay.classList.toggle('hm-sheet-collapsed', s === 1);
  overlay.classList.toggle('hm-sheet-hidden', s === 2);
}

export function _hmInitSheet() {
  const overlay = document.querySelector('.hm-overlay--bottom');
  const grabber = document.querySelector('.hm-grabber');
  if (!overlay || !grabber) return;

  // Measure snap distances
  function _hmMeasure() {
    const filters = overlay.querySelector('.hm-panel-filters');
    const animate = overlay.querySelector('.hm-panel-animate');
    const stats = overlay.querySelector('.hm-panel-stats');
    const panel = overlay.querySelector('.hm-bottom-panel');
    const gap = panel ? parseFloat(getComputedStyle(panel).gap) || 0 : 0;
    // collapseH: distance to hide filters + animate (show stats only)
    let ch = 0;
    if (filters) ch += filters.offsetHeight + gap;
    if (animate) ch += animate.offsetHeight + gap;
    _hmSheet.collapseH = ch;
    overlay.style.setProperty('--hm-collapse-h', ch + 'px');
    // hideH: distance to hide everything (show grabber only)
    let hh = ch;
    if (stats) hh += stats.offsetHeight + gap;
    _hmSheet.hideH = hh;
    overlay.style.setProperty('--hm-hide-h', hh + 'px');
  }

  // Snap offsets for each state
  function _snapOffsets() {
    return [0, _hmSheet.collapseH, _hmSheet.hideH];
  }
  function _stateOffset(s) { return _snapOffsets()[s] || 0; }

  // Find nearest snap state for a given offset
  function _nearestSnap(offset) {
    const snaps = _snapOffsets();
    let best = 0, bestDist = Math.abs(offset - snaps[0]);
    for (let i = 1; i < snaps.length; i++) {
      const d = Math.abs(offset - snaps[i]);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  }

  // Grabber click cycles: expanded → stats → hidden → expanded
  grabber.addEventListener('click', () => {
    if (!_isMobile()) return;
    _hmMeasure();
    const next = (_hmSheet.state + 1) % 3;
    _hmSetSheetState(next, overlay);
  });

  // Touch handling on the entire panel
  const panel = overlay.querySelector('.hm-bottom-panel');
  if (!panel) return;

  panel.addEventListener('touchstart', (e) => {
    if (!_isMobile() || e.touches.length !== 1) return;
    _hmMeasure();
    _hmSheet.startY = e.touches[0].clientY;
    _hmSheet.startX = e.touches[0].clientX;
    _hmSheet.tracking = false;
    _hmSheet.directionLocked = false;
    overlay.style.transition = 'none';
  }, { passive: true });

  panel.addEventListener('touchmove', (e) => {
    if (!_isMobile() || e.touches.length !== 1) return;
    const y = e.touches[0].clientY;
    const dy = y - _hmSheet.startY;
    const dx = Math.abs(e.touches[0].clientX - _hmSheet.startX);

    if (!_hmSheet.directionLocked) {
      if (Math.abs(dy) < 8 && dx < 8) return;
      if (dx > Math.abs(dy)) { _hmSheet.directionLocked = true; _hmSheet.tracking = false; return; }
      _hmSheet.directionLocked = true;
      _hmSheet.tracking = true;
    }
    if (!_hmSheet.tracking) return;
    e.preventDefault();

    const maxDown = _hmSheet.hideH;
    const baseOffset = _stateOffset(_hmSheet.state);
    let offset = Math.max(0, Math.min(maxDown, baseOffset + dy));
    overlay.style.transform = `translateY(${offset}px)`;
  }, { passive: false });

  panel.addEventListener('touchend', (e) => {
    if (!_hmSheet.tracking) { overlay.style.transition = ''; return; }
    overlay.style.transition = '';

    const dy = e.changedTouches[0].clientY - _hmSheet.startY;
    const maxDown = _hmSheet.hideH;
    const baseOffset = _stateOffset(_hmSheet.state);
    let offset = Math.max(0, Math.min(maxDown, baseOffset + dy));

    const snap = _nearestSnap(offset);
    overlay.style.transform = '';
    _hmSetSheetState(snap, overlay);
    _hmSheet.tracking = false;
  }, { passive: true });
}

export function _hmWirePills(containerId, onChange) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  wrap.querySelectorAll('.hm-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      wrap.querySelectorAll('.hm-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      onChange(btn.dataset.val);
    });
  });
}

/* ── Init MapLibre map (Heatmap page) ── */
export function _hmInitMap() {
  // Destroy old map and clear all layer references
  if (_hm.map) { try { _hm.map.remove(); } catch (_) {} _hm.map = null; }
  _hm.polylines = [];
  _hm._initialFitDone = false;
  _hm.heatLayer = null;
  _hm._layerCounter = 0;
  _hm._isSatellite = false;

  const el = document.getElementById('heatmapMap');
  if (!el) return;

  const themeKey = loadMapTheme();
  const themeDef = window.MAP_STYLES[themeKey] || window.MAP_STYLES.liberty;
  el.style.background = themeDef.bg;

  const _hmTerrainOn = loadTerrainEnabled();
  _hm.map = new maplibregl.Map({
    container: el,
    style: _mlGetStyle(themeKey),
    center: [14, 46],
    zoom: 4,
    attributionControl: true,
    dragRotate: _hmTerrainOn,
    pitchWithRotate: _hmTerrainOn,
    maxPitch: 85,
  });
  _hm.map.addControl(new maplibregl.NavigationControl({ showCompass: _hmTerrainOn, visualizePitch: _hmTerrainOn }), 'top-left');
  _hm.map.on('load', () => _mlApplyTerrain(_hm.map));

  // Prevent scroll-wheel from scrolling page while over map
  el.addEventListener('wheel', function(e) { e.preventDefault(); }, { passive: false });

  // Locate-me button (DOM-based, placed inside the navigation control area)
  const locBtn = document.createElement('button');
  locBtn.className = 'maplibregl-ctrl-icon hm-locate-btn';
  locBtn.title = 'My location';
  locBtn.setAttribute('aria-label', 'My location');
  locBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>';
  locBtn.style.cssText = 'display:flex;align-items:center;justify-content:center;width:30px;height:30px;cursor:pointer;border:none;border-radius:0;';
  locBtn.addEventListener('click', (e) => { e.preventDefault(); _hmLocateMe(); });
  // Append to the zoom control container
  setTimeout(() => {
    const navCtrl = el.querySelector('.maplibregl-ctrl-top-left .maplibregl-ctrl-group');
    if (navCtrl) navCtrl.appendChild(locBtn);
  }, 100);

  // Satellite toggle button (matches Activity page pattern)
  const satBtn = document.createElement('button');
  satBtn.className = 'map-sat-control';
  satBtn.title = 'Toggle satellite imagery';
  satBtn.innerHTML = '<span class="map-mode-icon">🛰</span>Satellite';
  satBtn.addEventListener('click', () => {
    _hm._isSatellite = !_hm._isSatellite;
    satBtn.classList.toggle('active', _hm._isSatellite);
    _hm.map.setStyle(_hm._isSatellite ? _mlGetStyle('satellite') : _mlGetStyle(loadMapTheme()));
    _hm.map.once('style.load', () => { hmRedraw(); _mlApplyTerrain(_hm.map); });
  });
  el.appendChild(satBtn);

  setTimeout(() => { if (_hm.map) _hm.map.resize(); }, 200);
  setTimeout(() => { if (_hm.map) _hm.map.resize(); }, 600);
  setTimeout(() => { if (_hm.map) _hm.map.resize(); }, 1200);
}

/* ── Center map on user's current location ── */
export async function _hmLocateMe() {
  if (!_hm.map) return;
  showToast('Finding your location…', 'success');

  function _flyTo(lat, lng, label) {
    _hm.map.flyTo({ center: [lng, lat], zoom: 12, duration: 1200 });
    if (_hm._locMarker) { _hm._locMarker.remove(); _hm._locMarker = null; }
    const el = document.createElement('div');
    el.style.cssText = 'width:16px;height:16px;border-radius:50%;background:rgba(0,116,217,0.4);border:2px solid #0074D9;cursor:pointer;';
    el.title = label || 'You are here';
    _hm._locMarker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([lng, lat]).addTo(_hm.map);
  }

  // 1. Try browser geolocation
  if (navigator.geolocation) {
    try {
      const pos = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject,
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 })
      );
      _flyTo(pos.coords.latitude, pos.coords.longitude, 'You are here');
      return;
    } catch (_) { /* fall through */ }

    // Retry without high accuracy
    try {
      const pos = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject,
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 })
      );
      _flyTo(pos.coords.latitude, pos.coords.longitude, 'You are here');
      return;
    } catch (_) { /* fall through */ }
  }

  // 2. Fallback: IP-based geolocation
  const ipServices = [
    { url: 'https://get.geojs.io/v1/ip/geo.json',
      parse: d => ({ lat: parseFloat(d.latitude), lng: parseFloat(d.longitude), city: d.city }) },
    { url: 'https://ipapi.co/json/',
      parse: d => ({ lat: d.latitude, lng: d.longitude, city: d.city }) },
    { url: 'https://ip-api.com/json/?fields=lat,lon,city',
      parse: d => ({ lat: d.lat, lng: d.lon, city: d.city }) },
  ];
  for (const svc of ipServices) {
    try {
      const res = await fetch(svc.url);
      if (!res.ok) continue;
      const raw = await res.json();
      const d = svc.parse(raw);
      if (d.lat && d.lng && !isNaN(d.lat)) {
        _flyTo(d.lat, d.lng, d.city || 'Approximate location');
        showToast('Showing approximate location (IP-based)', 'success');
        return;
      }
    } catch (_) { continue; }
  }

  showToast('Could not determine location', 'error');
}

/* ── Heatmap route cache (IndexedDB — no size limit) ── */
const HM_DB_NAME = 'cycleiq_heatmap';
const HM_DB_VER  = 2;
const HM_STORE   = 'routes';
const HM_META_STORE = 'meta';  // store negative-cache & last-sync timestamp

export function _hmOpenDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HM_DB_NAME, HM_DB_VER);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(HM_STORE)) {
        db.createObjectStore(HM_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(HM_META_STORE)) {
        db.createObjectStore(HM_META_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

export async function _hmSaveCache(routes) {
  try {
    const db = await _hmOpenDB();
    const tx = db.transaction(HM_STORE, 'readwrite');
    const store = tx.objectStore(HM_STORE);
    // Clear old data and write fresh
    store.clear();
    for (const r of routes) {
      store.put({
        id: r.id, pts: r.points, d: r.date.toISOString(),
        tp: r.type, dst: r.distance, tm: r.time, pw: r.power,
        hr: r.hr, nm: r.name, spd: r.speed, elv: r.elevation, h: r.hour,
      });
    }
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
    db.close();
  } catch (e) { console.warn('[HM cache] save failed:', e); }
}

/* Save only new routes (incremental — avoids rewriting the whole DB) */
export async function _hmSaveCacheIncremental(newRoutes) {
  if (!newRoutes || newRoutes.length === 0) return;
  try {
    const db = await _hmOpenDB();
    const tx = db.transaction(HM_STORE, 'readwrite');
    const store = tx.objectStore(HM_STORE);
    for (const r of newRoutes) {
      store.put({
        id: r.id, pts: r.points, d: r.date.toISOString(),
        tp: r.type, dst: r.distance, tm: r.time, pw: r.power,
        hr: r.hr, nm: r.name, spd: r.speed, elv: r.elevation, h: r.hour,
      });
    }
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
    db.close();
  } catch (e) { console.warn('[HM cache] incremental save failed:', e); }
}

/* ── Negative cache: remember activity IDs that have no GPS ── */
export async function _hmGetNoGpsSet() {
  try {
    const db = await _hmOpenDB();
    const tx = db.transaction(HM_META_STORE, 'readonly');
    const store = tx.objectStore(HM_META_STORE);
    const rec = await new Promise((res, rej) => {
      const req = store.get('noGpsIds');
      req.onsuccess = () => res(req.result);
      req.onerror   = () => rej(req.error);
    });
    db.close();
    return new Set(rec ? rec.ids : []);
  } catch (_) { return new Set(); }
}

export async function _hmSaveNoGpsSet(idSet) {
  try {
    const db = await _hmOpenDB();
    const tx = db.transaction(HM_META_STORE, 'readwrite');
    tx.objectStore(HM_META_STORE).put({ key: 'noGpsIds', ids: [...idSet] });
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
    db.close();
  } catch (_) {}
}

/* ── Last background-update timestamp ── */
export async function _hmGetLastBgUpdate() {
  try {
    const db = await _hmOpenDB();
    const tx = db.transaction(HM_META_STORE, 'readonly');
    const rec = await new Promise((res, rej) => {
      const req = tx.objectStore(HM_META_STORE).get('lastBgUpdate');
      req.onsuccess = () => res(req.result);
      req.onerror   = () => rej(req.error);
    });
    db.close();
    return rec ? rec.ts : 0;
  } catch (_) { return 0; }
}

export async function _hmSetLastBgUpdate() {
  try {
    const db = await _hmOpenDB();
    const tx = db.transaction(HM_META_STORE, 'readwrite');
    tx.objectStore(HM_META_STORE).put({ key: 'lastBgUpdate', ts: Date.now() });
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
    db.close();
  } catch (_) {}
}

export async function _hmLoadCache() {
  try {
    const db = await _hmOpenDB();
    const tx = db.transaction(HM_STORE, 'readonly');
    const store = tx.objectStore(HM_STORE);
    const all = await new Promise((res, rej) => {
      const req = store.getAll();
      req.onsuccess = () => res(req.result);
      req.onerror   = () => rej(req.error);
    });
    db.close();
    if (!all || all.length === 0) return null;
    return all.map(r => ({
      id: r.id, points: r.pts, date: new Date(r.d),
      type: r.tp, distance: r.dst, time: r.tm, power: r.pw,
      hr: r.hr, name: r.nm, speed: r.spd, elevation: r.elv, hour: r.h,
    }));
  } catch (e) { console.warn('[HM cache] load failed:', e); return null; }
}

export async function _hmClearCache() {
  try {
    const db = await _hmOpenDB();
    const stores = [HM_STORE, HM_META_STORE].filter(s => db.objectStoreNames.contains(s));
    const tx = db.transaction(stores, 'readwrite');
    stores.forEach(s => tx.objectStore(s).clear());
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
    db.close();
  } catch (_) {}
}

/* ── Load all GPS routes from lifetime activities ── */
export async function hmLoadAllRoutes() {
  if (_hm.loading) return;
  _hm.loading = true;

  const loadingEl = document.getElementById('hmLoading');
  const subEl     = document.getElementById('hmLoadingSub');
  const textEl    = document.querySelector('.hm-loading-text');

  // 1) Try IndexedDB cache first — instant load
  const cached = await _hmLoadCache();
  if (cached && cached.length > 0) {
    _hm.allRoutes = cached;
    _hm.loaded  = true;
    _hm.loading = false;
    if (loadingEl) loadingEl.style.display = 'none';
    if (_hm.map) {
      _hm.map.resize();
      setTimeout(() => _hm.map && _hm.map.resize(), 300);
    }
    hmApplyFilters();

    // Check in background if we have new activities to add
    _hmBackgroundUpdate(cached);
    return;
  }

  // 2) Full load — show loading overlay
  if (loadingEl) loadingEl.style.display = 'flex';
  if (textEl) textEl.textContent = 'Loading GPS routes…';

  // Wait a tick for lifetimeActivities to populate from cache
  await new Promise(r => setTimeout(r, 200));

  const routes = await _hmFetchAllRoutes(subEl, textEl);

  _hm.allRoutes = routes;
  _hm.loaded  = true;
  _hm.loading = false;

  if (loadingEl) loadingEl.style.display = 'none';
  if (_hm.map) {
    _hm.map.resize();
    setTimeout(() => _hm.map && _hm.map.resize(), 300);
  }

  if (routes.length === 0) {
    if (loadingEl) {
      loadingEl.style.display = 'flex';
      if (textEl) textEl.textContent = 'No GPS routes found';
      if (subEl) subEl.textContent = 'Sync your lifetime data in Settings first, then come back';
    }
    return;
  }

  // Save to cache for instant load next time
  _hmSaveCache(routes);
  hmApplyFilters();
}

/* ── Background update: check for new activities not yet in cache ── */
const HM_BG_COOLDOWN = 10 * 60 * 1000; // 10 minutes between background checks

export async function _hmBackgroundUpdate(cachedRoutes) {
  // Cooldown: skip if we checked recently
  const lastBg = await _hmGetLastBgUpdate();
  if (Date.now() - lastBg < HM_BG_COOLDOWN) return;

  await new Promise(r => setTimeout(r, 500));
  const acts = getAllActivities().filter(a => !isEmptyActivity(a));
  const cachedIds = new Set(cachedRoutes.map(r => r.id));
  const noGpsSet  = await _hmGetNoGpsSet();

  const newActs = acts.filter(a => {
    if (cachedIds.has(a.id)) return false;      // already have GPS for this
    if (noGpsSet.has(a.id))  return false;       // already know it has no GPS
    if (a.start_latlng && Array.isArray(a.start_latlng) && a.start_latlng.length === 2) return true;
    const dist = a.distance || a.icu_distance || 0;
    return dist > 500;
  });

  // Mark that we checked, even if nothing new
  await _hmSetLastBgUpdate();

  if (newActs.length === 0) return;

  // Fetch GPS for new activities in background
  const newRoutes = [];
  const failedIds = [];
  const BATCH = 5;
  for (let i = 0; i < newActs.length; i += BATCH) {
    const batch = newActs.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(a => _hmFetchOneRoute(a)));
    results.forEach((r, idx) => {
      if (r) newRoutes.push(r);
      else   failedIds.push(batch[idx].id);   // no GPS — remember so we don't retry
    });
    if (i + BATCH < newActs.length) await new Promise(r => setTimeout(r, 150));
  }

  // Save negative cache so we never re-fetch these
  if (failedIds.length > 0) {
    failedIds.forEach(id => noGpsSet.add(id));
    _hmSaveNoGpsSet(noGpsSet);
  }

  if (newRoutes.length > 0) {
    _hm.allRoutes = [..._hm.allRoutes, ...newRoutes].sort((a, b) => a.date - b.date);
    _hmSaveCacheIncremental(newRoutes);   // only write the new ones
    hmApplyFilters(); // re-draw with new routes
    showToast(`Heat map: added ${newRoutes.length} new route${newRoutes.length > 1 ? 's' : ''}`, 'success');
  }
}

/* ── Fetch GPS for a single activity ── */
export async function _hmFetchOneRoute(a) {
  try {
    const cacheKey = `icu_gps_pts_${String(a.id).replace(/^i/, '')}`;
    let points = null;
    try {
      const c = localStorage.getItem(cacheKey);
      if (c) points = JSON.parse(c);
    } catch (_) {}

    if (!points || points.length < 2) {
      const latlng = await fetchMapGPS(a.id);
      if (!latlng || latlng.length < 2) return null;
      const valid = latlng.filter(p => Array.isArray(p) && p[0] != null && p[1] != null && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180);
      if (valid.length < 2) return null;
      const step = Math.max(1, Math.floor(valid.length / 200));
      points = valid.filter((_, j) => j % step === 0);
      if (points.length > 0 && points[points.length - 1] !== valid[valid.length - 1]) points.push(valid[valid.length - 1]);
      try { localStorage.setItem(cacheKey, JSON.stringify(points)); } catch (_) {}
    }

    if (!points || points.length < 2) return null;

    const hour = new Date(a.start_date_local || a.start_date).getHours();
    return {
      id: a.id, points,
      date: new Date(a.start_date_local || a.start_date),
      type: (a.type || a.icu_type || 'Ride'),
      distance: a.distance || a.icu_distance || 0,
      time: a.moving_time || a.icu_moving_time || a.elapsed_time || 0,
      power: a.average_watts || a.icu_weighted_avg_watts || 0,
      hr: a.average_heartrate || 0,
      name: a.name || a.icu_name || '',
      speed: (a.distance && a.moving_time) ? (a.distance / a.moving_time) * 3.6 : 0,
      elevation: a.total_elevation_gain || a.icu_total_elevation_gain || 0,
      hour,
    };
  } catch (_) { return null; }
}

/* ── Full fetch of all routes (first-time load) ── */
export async function _hmFetchAllRoutes(subEl, textEl) {
  const acts = getAllActivities().filter(a => !isEmptyActivity(a));

  const candidates = acts.filter(a => {
    if (a.start_latlng && Array.isArray(a.start_latlng) && a.start_latlng.length === 2) return true;
    const dist = a.distance || a.icu_distance || 0;
    if (dist > 500) return true;
    try {
      const cacheKey = `icu_gps_pts_${String(a.id).replace(/^i/, '')}`;
      if (localStorage.getItem(cacheKey)) return true;
    } catch (_) {}
    return false;
  });

  if (subEl) subEl.textContent = `0 of ${candidates.length}`;

  const routes = [];
  const noGpsIds = [];
  let loaded = 0;
  let foundGPS = 0;

  const BATCH = 5;
  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(a => _hmFetchOneRoute(a)));
    results.forEach((r, idx) => {
      if (r) { routes.push(r); foundGPS++; }
      else   noGpsIds.push(batch[idx].id);
    });
    loaded += batch.length;
    if (subEl) subEl.textContent = `${loaded} of ${candidates.length} checked · ${foundGPS} routes found`;
    if (i + BATCH < candidates.length) await new Promise(r => setTimeout(r, 150));
  }

  // Save negative cache so first-time failures aren't retried
  if (noGpsIds.length > 0) {
    _hmSaveNoGpsSet(new Set(noGpsIds));
  }
  // Mark background-update timestamp so it doesn't re-run immediately
  _hmSetLastBgUpdate();

  routes.sort((a, b) => a.date - b.date);
  return routes;
}

/* ── Filter routes based on current settings ── */
export function hmApplyFilters() {
  let routes = _hm.allRoutes.filter(r => r.points && r.points.length >= 2);

  // Period filter
  const now = new Date();
  if (_hm.filter === 'year') {
    const jan1 = new Date(now.getFullYear(), 0, 1);
    routes = routes.filter(r => r.date >= jan1);
  } else if (_hm.filter === '6mo') {
    const cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 6);
    routes = routes.filter(r => r.date >= cutoff);
  } else if (_hm.filter === '90d') {
    const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 90);
    routes = routes.filter(r => r.date >= cutoff);
  }

  // Sport filter
  if (_hm.sportFilter !== 'all') {
    if (_hm.sportFilter === 'Other') {
      routes = routes.filter(r => !['Ride', 'Run'].includes(r.type));
    } else {
      routes = routes.filter(r => r.type === _hm.sportFilter);
    }
  }

  // Time of day filter
  if (_hm.timeFilter !== 'all') {
    routes = routes.filter(r => {
      const h = r.hour;
      if (_hm.timeFilter === 'morning')   return h >= 5 && h < 12;
      if (_hm.timeFilter === 'afternoon') return h >= 12 && h < 17;
      if (_hm.timeFilter === 'evening')   return h >= 17 && h < 21;
      return false;
    });
  }

  _hm._filtered = routes;
  hmUpdateStats(routes);
  hmRedraw();
}

/* ── Update stats bar ── */
export function hmUpdateStats(routes) {
  const dist = routes.reduce((s, r) => s + (r.distance || 0), 0);
  const time = routes.reduce((s, r) => s + (r.time || 0), 0);
  const elev = routes.reduce((s, r) => s + (r.elevation || 0), 0);

  const fmt = (n) => n >= 10000 ? (n/1000).toFixed(1) + 'k' : n.toLocaleString();
  const el = id => document.getElementById(id);
  if (el('hmStatRoutes')) el('hmStatRoutes').textContent = routes.length;
  if (el('hmStatDist'))   el('hmStatDist').textContent   = fmt(Math.round(dist / 1000));
  if (el('hmStatTime'))   el('hmStatTime').textContent   = Math.round(time / 3600).toLocaleString();
  if (el('hmStatElev'))   el('hmStatElev').textContent   = fmt(Math.round(elev));
}

/* ── Draw routes on map ── */
export function hmRedraw() {
  if (!_hm.map) return;
  const routes = _hm._filtered || [];

  // Clear existing MapLibre layers & sources
  _hmClearMapLayers();

  if (routes.length === 0) {
    _hmUpdateLegend('');
    return;
  }

  const mode = _hm.colorMode;

  if (mode === 'heat') {
    _hmDrawHeat(routes);
  } else if (mode === 'lines') {
    _hmDrawLines(routes);
  } else if (mode === 'speed') {
    _hmDrawBySpeed(routes);
  } else if (mode === 'time') {
    _hmDrawByYear(routes);
  }

  // Only fit bounds on first draw — zoom to the densest activity area
  if (!_hm._initialFitDone) {
    const allPts = routes.flatMap(r => r.points);
    if (allPts.length > 0) {
      _hm._initialFitDone = true;

      const CELL = 0.05;
      const grid = {};
      let maxKey = null, maxCount = 0;
      for (const p of allPts) {
        const key = (Math.floor(p[0] / CELL) * CELL).toFixed(3) + ',' +
                    (Math.floor(p[1] / CELL) * CELL).toFixed(3);
        grid[key] = (grid[key] || 0) + 1;
        if (grid[key] > maxCount) { maxCount = grid[key]; maxKey = key; }
      }

      const _fitPts = (pts, pad, mz) => {
        const bounds = pts.reduce(
          (b, p) => b.extend([p[1], p[0]]),
          new maplibregl.LngLatBounds([pts[0][1], pts[0][0]], [pts[0][1], pts[0][0]])
        );
        _hm.map.fitBounds(bounds, { padding: pad, maxZoom: mz, duration: 0 });
      };

      if (maxKey) {
        const [cLat, cLng] = maxKey.split(',').map(Number);
        const R = 0.25;
        const nearby = allPts.filter(p =>
          Math.abs(p[0] - cLat) < R && Math.abs(p[1] - cLng) < R
        );
        if (nearby.length > 10) {
          _fitPts(nearby, 40, 13);
        } else {
          _fitPts(allPts, 30, 13);
        }
      } else {
        _fitPts(allPts, 30, 13);
      }
    }
  }
}

// Helper: clear all heatmap layers and sources from the MapLibre map
export function _hmClearMapLayers() {
  if (!_hm.map) return;
  // Remove tracked layer/source IDs
  (_hm._layerIds || []).forEach(id => {
    try { if (_hm.map.getLayer(id)) _hm.map.removeLayer(id); } catch (_) {}
  });
  (_hm._sourceIds || []).forEach(id => {
    try { if (_hm.map.getSource(id)) _hm.map.removeSource(id); } catch (_) {}
  });
  _hm._layerIds = [];
  _hm._sourceIds = [];
  // Remove tooltip popups
  (_hm._popups || []).forEach(p => p.remove());
  _hm._popups = [];
  // Remove tracked event handlers
  (_hm._eventHandlers || []).forEach(h => {
    try { _hm.map.off(h.event, h.layer, h.fn); } catch (_) {}
  });
  _hm._eventHandlers = [];
  _hm.polylines = [];
  _hm.heatLayer = null;
}

/* ── Heat mode (MapLibre heatmap layer) ── */
export function _hmDensifyPoints(points, maxGap) {
  // Interpolate between consecutive GPS points so the heat trail is continuous
  if (points.length < 2) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const dLat = b[0] - a[0], dLng = b[1] - a[1];
    const dist = Math.sqrt(dLat * dLat + dLng * dLng);
    if (dist > maxGap) {
      const steps = Math.ceil(dist / maxGap);
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        out.push([a[0] + dLat * t, a[1] + dLng * t]);
      }
    }
    out.push(b);
  }
  return out;
}

export function _hmDrawHeat(routes) {
  const features = [];
  // maxGap ≈ 0.0004° (~44m) — keeps the heat trail connected even when zoomed in
  const MAX_GAP = 0.0004;
  routes.forEach(r => {
    const dense = _hmDensifyPoints(r.points, MAX_GAP);
    dense.forEach(p => {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p[1], p[0]] },
        properties: { weight: 1 },
      });
    });
  });

  const srcId = 'hm-heat-src';
  const layerId = 'hm-heat-layer';

  _hm.map.addSource(srcId, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features },
  });

  _hm.map.addLayer({
    id: layerId,
    type: 'heatmap',
    source: srcId,
    paint: {
      'heatmap-weight': 0.12,
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 0.3, 10, 1, 14, 2, 17, 3.5],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 3, 10, 8, 14, 16, 17, 26],
      'heatmap-opacity': 0.85,
      'heatmap-color': [
        'interpolate', ['linear'], ['heatmap-density'],
        0,    'rgba(0,0,0,0)',
        0.15, '#1a1a5e',
        0.35, '#0074D9',
        0.5,  '#00e5a0',
        0.7,  '#FFDC00',
        0.9,  '#FF4136',
        1.0,  '#ff0066',
      ],
    },
  });

  _hm._sourceIds = (_hm._sourceIds || []).concat(srcId);
  _hm._layerIds  = (_hm._layerIds  || []).concat(layerId);
  _hm.heatLayer = layerId;

  _hmUpdateLegend(`
    <span style="color:#1a1a5e">Low</span>
    <div class="hm-legend-gradient"></div>
    <span style="color:#ff0066">High</span>
  `);
}

/* ── Lines mode (MapLibre GeoJSON lines) ── */
export function _hmDrawLines(routes) {
  // Batch all routes into one GeoJSON source for performance
  const features = routes.map((r, i) => ({
    type: 'Feature',
    properties: { idx: i, name: r.name || 'Activity', date: r.date.toLocaleDateString(), dist: (r.distance/1000).toFixed(1) },
    geometry: { type: 'LineString', coordinates: r.points.map(p => [p[1], p[0]]) },
  }));

  const srcId = 'hm-lines-src';
  _hm.map.addSource(srcId, { type: 'geojson', data: { type: 'FeatureCollection', features } });

  // Shadow layer
  const shadowId = 'hm-lines-shadow';
  _hm.map.addLayer({
    id: shadowId, type: 'line', source: srcId,
    paint: { 'line-color': '#00e5a0', 'line-width': 3, 'line-opacity': 0.06 },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  });

  // Main line layer
  const lineId = 'hm-lines-main';
  _hm.map.addLayer({
    id: lineId, type: 'line', source: srcId,
    paint: { 'line-color': '#00e5a0', 'line-width': 1.5, 'line-opacity': 0.35 },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  });

  // Tooltip on hover
  const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'hm-tooltip-popup' });
  const enterFn = (e) => {
    _hm.map.getCanvas().style.cursor = 'pointer';
    const f = e.features[0];
    if (f) popup.setLngLat(e.lngLat).setHTML(`<b>${f.properties.name}</b><br>${f.properties.date}<br>${f.properties.dist} km`).addTo(_hm.map);
  };
  const leaveFn = () => { _hm.map.getCanvas().style.cursor = ''; popup.remove(); };
  _hm.map.on('mouseenter', lineId, enterFn);
  _hm.map.on('mouseleave', lineId, leaveFn);

  _hm._sourceIds = (_hm._sourceIds || []).concat(srcId);
  _hm._layerIds  = (_hm._layerIds  || []).concat(shadowId, lineId);
  _hm._popups    = (_hm._popups    || []).concat(popup);
  _hm._eventHandlers = (_hm._eventHandlers || []).concat(
    { event: 'mouseenter', layer: lineId, fn: enterFn },
    { event: 'mouseleave', layer: lineId, fn: leaveFn },
  );

  _hmUpdateLegend('<span style="color:#00e5a0">All Routes</span>');
}

/* ── Speed color mode (MapLibre) ── */
export function _hmDrawBySpeed(routes) {
  const speeds = routes.filter(r => r.speed > 0).map(r => r.speed);
  if (speeds.length === 0) { _hmDrawLines(routes); return; }

  const minSpd = safeMin(speeds);
  const maxSpd = safeMax(speeds);
  const range = maxSpd - minSpd || 1;

  const features = routes.map((r, i) => {
    const t = r.speed > 0 ? (r.speed - minSpd) / range : 0;
    return {
      type: 'Feature',
      properties: { color: _hmSpeedColor(t), name: r.name || 'Activity', speed: r.speed.toFixed(1), date: r.date.toLocaleDateString() },
      geometry: { type: 'LineString', coordinates: r.points.map(p => [p[1], p[0]]) },
    };
  });

  const srcId = 'hm-speed-src';
  const layerId = 'hm-speed-layer';

  _hm.map.addSource(srcId, { type: 'geojson', data: { type: 'FeatureCollection', features } });
  _hm.map.addLayer({
    id: layerId, type: 'line', source: srcId,
    paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-opacity': 0.55 },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  });

  const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'hm-tooltip-popup' });
  const enterFn = (e) => {
    _hm.map.getCanvas().style.cursor = 'pointer';
    const f = e.features[0];
    if (f) popup.setLngLat(e.lngLat).setHTML(`<b>${f.properties.name}</b><br>${f.properties.speed} km/h<br>${f.properties.date}`).addTo(_hm.map);
  };
  const leaveFn = () => { _hm.map.getCanvas().style.cursor = ''; popup.remove(); };
  _hm.map.on('mouseenter', layerId, enterFn);
  _hm.map.on('mouseleave', layerId, leaveFn);

  _hm._sourceIds = (_hm._sourceIds || []).concat(srcId);
  _hm._layerIds  = (_hm._layerIds  || []).concat(layerId);
  _hm._popups    = (_hm._popups    || []).concat(popup);
  _hm._eventHandlers = (_hm._eventHandlers || []).concat(
    { event: 'mouseenter', layer: layerId, fn: enterFn },
    { event: 'mouseleave', layer: layerId, fn: leaveFn },
  );

  _hmUpdateLegend(`
    <span style="color:#0074D9">${minSpd.toFixed(0)} km/h</span>
    <div class="hm-legend-gradient hm-legend-gradient--speed"></div>
    <span style="color:#FF4136">${maxSpd.toFixed(0)} km/h</span>
  `);
}

export function _hmSpeedColor(t) {
  // Blue → Cyan → Green → Yellow → Red
  if (t < 0.25) return _hmLerp('#0074D9', '#00e5a0', t / 0.25);
  if (t < 0.5)  return _hmLerp('#00e5a0', '#FFDC00', (t - 0.25) / 0.25);
  if (t < 0.75) return _hmLerp('#FFDC00', '#FF851B', (t - 0.5) / 0.25);
  return _hmLerp('#FF851B', '#FF4136', (t - 0.75) / 0.25);
}

/* ── By Year mode (MapLibre) ── */
export function _hmDrawByYear(routes) {
  const years = [...new Set(routes.map(r => r.date.getFullYear()))].sort();
  const YEAR_COLORS = ['#636efa', '#EF553B', '#00cc96', '#ab63fa', '#FFA15A', '#19d3f3', '#FF6692', '#B6E880', '#FF97FF', '#FECB52'];

  const yearColor = {};
  years.forEach((y, i) => yearColor[y] = YEAR_COLORS[i % YEAR_COLORS.length]);

  const features = routes.map((r, i) => {
    const yr = r.date.getFullYear();
    return {
      type: 'Feature',
      properties: { color: yearColor[yr], name: r.name || 'Activity', year: String(yr), dist: (r.distance/1000).toFixed(1) },
      geometry: { type: 'LineString', coordinates: r.points.map(p => [p[1], p[0]]) },
    };
  });

  const srcId = 'hm-year-src';
  const layerId = 'hm-year-layer';

  _hm.map.addSource(srcId, { type: 'geojson', data: { type: 'FeatureCollection', features } });
  _hm.map.addLayer({
    id: layerId, type: 'line', source: srcId,
    paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-opacity': 0.5 },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  });

  const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'hm-tooltip-popup' });
  const enterFn = (e) => {
    _hm.map.getCanvas().style.cursor = 'pointer';
    const f = e.features[0];
    if (f) popup.setLngLat(e.lngLat).setHTML(`<b>${f.properties.name}</b><br>${f.properties.year}<br>${f.properties.dist} km`).addTo(_hm.map);
  };
  const leaveFn = () => { _hm.map.getCanvas().style.cursor = ''; popup.remove(); };
  _hm.map.on('mouseenter', layerId, enterFn);
  _hm.map.on('mouseleave', layerId, leaveFn);

  _hm._sourceIds = (_hm._sourceIds || []).concat(srcId);
  _hm._layerIds  = (_hm._layerIds  || []).concat(layerId);
  _hm._popups    = (_hm._popups    || []).concat(popup);
  _hm._eventHandlers = (_hm._eventHandlers || []).concat(
    { event: 'mouseenter', layer: layerId, fn: enterFn },
    { event: 'mouseleave', layer: layerId, fn: leaveFn },
  );

  const legendItems = years.map(y => `<span class="hm-legend-dot" style="background:${yearColor[y]}"></span>${y}`).join(' ');
  _hmUpdateLegend(legendItems);
}

/* ── Color interpolation helpers ── */
export function _hmLerp(c1, c2, t) {
  const h = s => parseInt(s.slice(1), 16);
  const v1 = h(c1), v2 = h(c2);
  const r = Math.round(((v1 >> 16) & 255) * (1 - t) + ((v2 >> 16) & 255) * t);
  const g = Math.round(((v1 >> 8) & 255) * (1 - t) + ((v2 >> 8) & 255) * t);
  const b = Math.round((v1 & 255) * (1 - t) + (v2 & 255) * t);
  return `rgb(${r},${g},${b})`;
}

export function _hmUpdateLegend(html) {
  const el = document.getElementById('hmLegend');
  if (el) el.innerHTML = html;
}

/* ── Animate: replay rides one by one ── */
// States: 'stopped' | 'playing' | 'paused'
_hm.animState = 'stopped';
_hm.animSpeed = 1;

export function _hmSetAnimBtn(icon, label) {
  const btnEl = document.getElementById('hmAnimateBtn');
  const lbl = document.getElementById('hmAnimateLabel');
  if (lbl) lbl.textContent = label;
  if (btnEl) {
    const svg = btnEl.querySelector('svg');
    if (svg) svg.innerHTML = icon === 'pause'
      ? '<rect x="5" y="3" width="4" height="18"/><rect x="15" y="3" width="4" height="18"/>'
      : '<polygon points="5,3 19,12 5,21"/>';
  }
}

export function hmToggleAnimate() {
  if (_hm.animState === 'playing') {
    hmPauseAnimate();
  } else if (_hm.animState === 'paused') {
    hmResumeAnimate();
  } else {
    hmStartAnimate();
  }
}

export function hmStartAnimate() {
  const routes = _hm._filtered || [];
  if (routes.length === 0) return;

  _hm.animating = true;
  _hm.animState = 'playing';
  _hm.animIdx = 0;

  // Clear map
  _hmClearMapLayers();

  _hmSetAnimBtn('pause', 'Pause');
  _hm._animFeatures = []; // accumulate features for batch rendering
  _hmAnimLoop();
}

export function _hmAnimLoop() {
  const routes = _hm._filtered || [];
  const barFill = document.getElementById('hmAnimateBarFill');
  const countEl = document.getElementById('hmAnimateCount');

  if (_hm.animState !== 'playing' || _hm.animIdx >= routes.length) {
    if (_hm.animIdx >= routes.length) hmStopAnimate();
    return;
  }

  const r = routes[_hm.animIdx];
  const pct = ((_hm.animIdx + 1) / routes.length) * 100;
  if (barFill) barFill.style.width = pct + '%';
  if (countEl) countEl.textContent = `${_hm.animIdx + 1} / ${routes.length} · ${r.date.toLocaleDateString()}`;

  // Add this route's feature to the accumulator
  _hm._animFeatures.push({
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: r.points.map(p => [p[1], p[0]]) },
  });

  // Update or create the animation source/layer
  const srcId = 'hm-anim-src';
  const glowId = 'hm-anim-glow';
  const lineId = 'hm-anim-line';
  const geojson = { type: 'FeatureCollection', features: _hm._animFeatures };

  if (_hm.map.getSource(srcId)) {
    _hm.map.getSource(srcId).setData(geojson);
  } else {
    _hm.map.addSource(srcId, { type: 'geojson', data: geojson });
    _hm.map.addLayer({
      id: glowId, type: 'line', source: srcId,
      paint: { 'line-color': '#00e5a0', 'line-width': 4, 'line-opacity': 0.15 },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    });
    _hm.map.addLayer({
      id: lineId, type: 'line', source: srcId,
      paint: { 'line-color': '#00e5a0', 'line-width': 1.8, 'line-opacity': 0.6 },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    });
    _hm._sourceIds = (_hm._sourceIds || []).concat(srcId);
    _hm._layerIds  = (_hm._layerIds  || []).concat(glowId, lineId);
  }

  _hm.animIdx++;

  const baseDelay = routes.length > 200 ? 60 : routes.length > 50 ? 200 : 350;
  const speedMap = { 1: 1, 2: 4, 3: 15 };
  const delay = Math.max(5, Math.round(baseDelay / (speedMap[_hm.animSpeed] || 1)));
  _hm.animTimer = setTimeout(_hmAnimLoop, delay);
}

export function hmPauseAnimate() {
  _hm.animState = 'paused';
  if (_hm.animTimer) { clearTimeout(_hm.animTimer); _hm.animTimer = null; }
  _hmSetAnimBtn('play', 'Resume');
}

export function hmResumeAnimate() {
  _hm.animState = 'playing';
  _hmSetAnimBtn('pause', 'Pause');
  _hmAnimLoop();
}

export function hmStopAnimate() {
  _hm.animating = false;
  _hm.animState = 'stopped';
  if (_hm.animTimer) { clearTimeout(_hm.animTimer); _hm.animTimer = null; }
  _hmSetAnimBtn('play', 'Replay Rides');
  const barFill = document.getElementById('hmAnimateBarFill');
  if (barFill) barFill.style.width = '0%';
}

