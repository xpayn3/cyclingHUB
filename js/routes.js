/* Route Builder module — extracted from app.js */
import { state } from './state.js';

/* ── Lazy proxies for functions defined in other modules ── */
const _app = (fn) => (...a) => window[fn](...a);
const showToast            = _app('showToast');
const navigate             = _app('navigate');
const destroyChart         = _app('destroyChart');
const _mlGetStyle          = _app('_mlGetStyle');
const _mlApplyTerrain      = _app('_mlApplyTerrain');
const _addCyclOSMLayer     = _app('_addCyclOSMLayer');
const _addRoadSafetyLayer  = _app('_addRoadSafetyLayer');
const loadRoadSafetyEnabled = _app('loadRoadSafetyEnabled');
const loadCyclOSMEnabled   = _app('loadCyclOSMEnabled');
const loadTerrainEnabled   = _app('loadTerrainEnabled');
const loadMapTheme         = _app('loadMapTheme');

/* ====================================================
   ROUTE BUILDER
==================================================== */
const _rb = {
  map: null,
  tileLayer: null,
  waypoints: [],
  routeSegments: [],
  routePolyline: null,
  elevationData: [],
  elevChart: null,
  elevMarker: null,
  history: [],
  historyIdx: -1,
  savedRoutes: [],
  activeRouteId: null,
  _fetchAbort: null,
  _poiEnabled: false,
  _poiAbort: null,
  _poiCache: '',
  _poiDebounce: null,
  _poiCategories: { water: true, bike: true, cafe: true, toilets: true, fuel: true, shelter: true, viewpoint: true },
  _poiAlongRoute: false,
  _surfaceMode: false,
  _surfaceLayer: null,
  _roadSafetyOn: localStorage.getItem('icu_road_safety') === 'true',
  _cyclOSMOn: localStorage.getItem('icu_cyclosm') === 'true',
  _timeLabel: null,
  router: { engine: 'osrm', profile: 'cycling', label: 'Cycling' },
  orsApiKey: localStorage.getItem('icu_ors_api_key') || '',
};

/* ── Expose for cross-module access (theme hot-swap) ── */
window._rb = _rb;
window._rbRestoreMapLayers = _rbRestoreMapLayers;

/* ── IndexedDB ── */
const RB_DB_NAME = 'cycleiq_routes';
const RB_DB_VER = 1;
const RB_STORE = 'routes';

export function _rbOpenDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(RB_DB_NAME, RB_DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(RB_STORE)) {
        const store = db.createObjectStore(RB_STORE, { keyPath: 'id' });
        store.createIndex('ts', 'ts', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/* ── Page Render ── */
export function renderRouteBuilderPage() {
  const container = document.getElementById('routeBuilderContent');
  if (!container) return;

  container.innerHTML = `
    <div class="rb-wrapper">
      <div class="rb-map-container">
        <div id="rbMap" class="rb-map"></div>
        <div class="rb-search-float">
          <div class="rb-fs-logo" onclick="navigate('dashboard')" title="Back to dashboard"><div class="rb-fs-logo-icon"><svg viewBox="0 0 24 24" fill="none" stroke="#0d0f14" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><line x1="12" y1="3" x2="12" y2="10"/><line x1="12" y1="14" x2="12" y2="21"/><line x1="3" y1="12" x2="10" y2="12"/><line x1="14" y1="12" x2="21" y2="12"/></svg></div></div>
          <div class="rb-search-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input class="rb-search-input" id="rbSearchInput" placeholder="Search places…" autocomplete="off" />
            <div class="rb-search-results" id="rbSearchResults"></div>
          </div>
          <div class="rb-router-wrap" id="rbRouterWrap">
            <button class="rb-router-trigger" id="rbRouterTrigger" title="Routing profile">
              ${RB_ROUTERS[0].icon}
              <span id="rbRouterLabel">${RB_ROUTERS[0].label} <span class="rb-router-engine">(${RB_ROUTERS[0].engine.toUpperCase()})</span></span>
              <svg class="rb-router-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="rb-router-menu" id="rbRouterMenu">
              ${RB_ROUTERS.map((r, i) => {
                if (r.engine === 'ors' && !_rb.orsApiKey) return `<div class="rb-router-option rb-router-option--disabled" data-engine="${r.engine}" data-profile="${r.profile}" data-label="${r.label}" data-idx="${i}" title="Set ORS API key in Settings">${r.icon}<span>${r.label} <span class="rb-router-engine">(${r.engine.toUpperCase()})</span></span></div>`;
                return `<div class="rb-router-option${i === 0 ? ' rb-router-option--selected' : ''}" data-engine="${r.engine}" data-profile="${r.profile}" data-label="${r.label}" data-idx="${i}">${r.icon}<span>${r.label} <span class="rb-router-engine">(${r.engine.toUpperCase()})</span></span></div>`;
              }).join('')}
            </div>
          </div>
          <div class="rb-export-wrap" id="rbExportWrap">
            <button class="rb-export-trigger" id="rbExportTrigger">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              <span>Export</span>
              <svg class="rb-export-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="rb-export-menu" id="rbExportMenu">
              <div class="rb-export-option" onclick="rbImportGPX()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                <span>Import GPX</span>
              </div>
              <div class="rb-export-option" onclick="rbExportGPX()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <span>Export GPX</span>
              </div>
              <div class="rb-export-option" onclick="rbExportFIT()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <span>Export FIT</span>
              </div>
              <div class="rb-export-sep"></div>
              <div class="rb-export-option" onclick="rbSave()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                <span>Save Route</span>
              </div>
            </div>
          </div>
        </div>
        <div class="rb-poi-filter" id="rbPoiFilter" style="display:none"></div>
        <button class="rb-panel-toggle" onclick="rbToggleSidePanel()" title="Toggle stats panel">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
        </button>
        <div class="rb-overlay rb-overlay--right" id="rbSidePanel">
          <div class="rb-side-panel">
            <div class="rb-stats-card card">
              <div class="card-header"><div class="card-title">Route Stats</div></div>
              <div class="rb-stats-grid" id="rbStatsGrid">
                <div class="rb-stat"><span class="rb-stat-val" id="rbStatDist">0.0</span><span class="rb-stat-label">km</span></div>
                <div class="rb-stat"><span class="rb-stat-val" id="rbStatElev">0</span><span class="rb-stat-label">Elev Gain (m)</span></div>
                <div class="rb-stat"><span class="rb-stat-val" id="rbStatLoss">0</span><span class="rb-stat-label">Elev Loss (m)</span></div>
                <div class="rb-stat"><span class="rb-stat-val" id="rbStatTime">0:00</span><span class="rb-stat-label">Est. Time</span></div>
                <div class="rb-stat"><span class="rb-stat-val" id="rbStatGrade">0.0</span><span class="rb-stat-label">Avg Grade %</span></div>
                <div class="rb-stat"><span class="rb-stat-val" id="rbStatSurface">&mdash;</span><span class="rb-stat-label">Surface</span></div>
              </div>
            </div>
            <div class="rb-actions-card card">
              <div class="rb-actions-row">
                <button class="btn btn-ghost btn-icon btn-sm" id="rbUndoBtn" onclick="rbUndo()" title="Undo (Ctrl+Z)" disabled>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                </button>
                <button class="btn btn-ghost btn-icon btn-sm" id="rbRedoBtn" onclick="rbRedo()" title="Redo (Ctrl+Y)" disabled>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"/></svg>
                </button>
                <span class="rb-actions-sep"></span>
                <button class="btn btn-ghost btn-icon btn-sm" onclick="rbReverse()" title="Reverse route">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                </button>
                <button class="btn btn-ghost btn-icon btn-sm" onclick="rbOutAndBack()" title="Out & Back">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                </button>
                <button class="btn btn-ghost btn-icon btn-sm" onclick="rbLoopBack()" title="Loop back to start">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 10 10"/><polyline points="22 2 22 12 12 12"/></svg>
                </button>
                <button class="btn btn-ghost btn-icon btn-sm rb-tool-btn--danger" onclick="rbClear()" title="Clear route">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>
            <div class="rb-waypoints-card card">
              <div class="card-header">
                <div class="card-title">Waypoints</div>
                <div class="card-subtitle" id="rbWpCount">0 points</div>
              </div>
              <div class="rb-waypoint-list" id="rbWaypointList">
                <div class="rb-saved-empty">Click the map to add waypoints</div>
              </div>
            </div>
            <div class="rb-saved-card card">
              <div class="card-header"><div class="card-title">Saved Routes</div></div>
              <div class="rb-saved-list" id="rbSavedList">
                <div class="rb-saved-empty">No saved routes yet</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="rb-elev-panel" id="rbElevPanel">
        <div class="rb-elev-toggle" onclick="rbToggleElevPanel()">
          <span class="rb-elev-toggle-icon" id="rbElevToggleIcon">&#9650;</span>
          <span>Elevation Profile</span>
        </div>
        <div class="rb-elev-chart-wrap" id="rbElevChartWrap">
          <canvas id="rbElevCanvas"></canvas>
        </div>
      </div>
    </div>
  `;

  _rbInitMap();
  _rbLoadSavedRoutes();
  _rbInitSearch();
  _rbInitKeyboard();

  // Collapse elevation panel by default
  const ep = document.getElementById('rbElevPanel');
  if (ep) ep.classList.add('collapsed');
}

/* ── Map Init ── */
/* ── Coordinate helpers: internal is [lat,lng], MapLibre is [lng,lat] ── */
export function _rbToLngLat(ll) { return [ll[1], ll[0]]; }
export function _rbToLatLng(ll) { return [ll[1], ll[0]]; }

/* ── Restore all dynamic layers after a style change ── */
export function _rbRestoreMapLayers() {
  // Overlays first (below route layers)
  const isSat = _rbMapLayerKeys[_rbLayerIdx] === 'satellite';
  if (_rb._cyclOSMOn) _addCyclOSMLayer(_rb.map);
  if (_rb._roadSafetyOn && !isSat) _addRoadSafetyLayer(_rb.map);
  // GeoJSON sources/layers are cleared on setStyle — redraw the route
  _rbRedrawRoute();
  // Re-fetch POIs (markers are DOM-based and survive style changes, but we need fresh data)
  if (_rb._poiEnabled) {
    _rb._poiCache = '';
    _rbFetchPois();
  }
  _mlApplyTerrain(_rb.map);
  // Sync road safety button state (disabled in satellite)
  const rsBtn = document.getElementById('rbRoadSafetyBtn');
  if (rsBtn) {
    if (isSat) { rsBtn.classList.add('rb-tool-disabled'); rsBtn.classList.remove('active'); }
    else { rsBtn.classList.remove('rb-tool-disabled'); if (_rb._roadSafetyOn) rsBtn.classList.add('active'); }
  }
}

export function _rbInitMap() {
  if (_rb.map) { try { _rb.map.remove(); } catch(_){} _rb.map = null; }
  const el = document.getElementById('rbMap');
  if (!el) return;

  _rb.map = new maplibregl.Map({
    container: el,
    style: _mlGetStyle(loadMapTheme()),
    center: [14, 46],
    zoom: 6,
    bearing: 0,
    pitch: 0,
    maxPitch: 85,
    doubleClickZoom: false,
    attributionControl: false,
    dragRotate: true,
    pitchWithRotate: false,
    dragPan: {
      linearity: 0.5,
      deceleration: 10,
      maxSpeed: 200,
    },
    fadeDuration: 0,
    renderWorldCopies: false,
    antialias: false,
    collectResourceTiming: false,
    maxTileCacheSize: 150,
    pixelRatio: Math.min(devicePixelRatio, 2),
  });
  _rb.map.on('load', () => {
    _mlApplyTerrain(_rb.map);
    if (_rb._cyclOSMOn) _addCyclOSMLayer(_rb.map);
    if (_rb._roadSafetyOn) _addRoadSafetyLayer(_rb.map);
  });
  _rb.map.addControl(new maplibregl.AttributionControl({ compact: true }), 'top-right');
  _rb.map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left');

  // Custom rotation + pitch handler (right-click drag or Alt+left-click drag)
  (function() {
    const mapEl = _rb.map.getContainer();
    let rotating = false, startX = 0, startY = 0, startBearing = 0, startPitch = 0;
    mapEl.addEventListener('mousedown', function(e) {
      if (e.button === 2 || (e.button === 0 && e.altKey)) {
        rotating = true;
        startX = e.clientX; startY = e.clientY;
        startBearing = _rb.map.getBearing();
        startPitch = _rb.map.getPitch();
        _rb.map.dragPan.disable();
        mapEl.style.cursor = 'grabbing';
        e.preventDefault();
      }
    });
    mapEl.addEventListener('contextmenu', function(e) { e.preventDefault(); });
    let _rbRotateRAF = 0;
    window.addEventListener('mousemove', function(e) {
      if (!rotating) return;
      const cx = e.clientX, cy = e.clientY;
      if (_rbRotateRAF) return;
      _rbRotateRAF = requestAnimationFrame(function() {
        _rbRotateRAF = 0;
        _rb.map.setBearing(startBearing + (cx - startX) * 0.2);
        _rb.map.setPitch(Math.min(85, Math.max(0, startPitch - (cy - startY) * 0.3)));
      });
    });
    window.addEventListener('mouseup', function() {
      if (!rotating) return;
      rotating = false;
      _rb.map.dragPan.enable();
      mapEl.style.cursor = '';
      _rb.map.off('click', _rbOnMapClick);
      setTimeout(() => _rb.map.on('click', _rbOnMapClick), 50);
    });
  })();

  _rb.map.on('click', _rbOnMapClick);

  // Unified map tools control (zoom, compass + custom tools)
  class RbMapTools {
    onAdd(map) {
      this._map = map;
      this._container = document.createElement('div');
      this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group rb-map-tools';

      const mkBtn = (cls, title, svg, handler) => {
        const a = document.createElement('a');
        a.className = 'rb-map-tool-btn' + (cls ? ' ' + cls : '');
        a.href = '#';
        a.title = title;
        a.innerHTML = svg;
        a.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); handler(); });
        this._container.appendChild(a);
        return a;
      };

      mkBtn('', 'Zoom in',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
        () => map.zoomIn());

      mkBtn('', 'Zoom out',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><line x1="5" y1="12" x2="19" y2="12"/></svg>',
        () => map.zoomOut());

      const compassBtn = mkBtn('', 'Reset bearing to north',
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/><polygon points="12 3 14.5 11 12 9.5 9.5 11" fill="#e05050" stroke="none"/><polygon points="12 21 9.5 13 12 14.5 14.5 13" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>',
        () => map.resetNorthPitch());
      compassBtn.id = 'rbCompassBtn';
      const compassSvg = compassBtn.querySelector('svg');
      map.on('rotate', () => {
        compassSvg.style.transform = `rotate(${-map.getBearing()}deg)`;
      });

      // Separator
      const sep = document.createElement('div');
      sep.className = 'rb-map-tool-sep';
      this._container.appendChild(sep);

      mkBtn('', 'My location',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2"/><circle cx="12" cy="12" r="9" opacity="0.3"/></svg>',
        _rbGeolocate);

      mkBtn('', 'Switch map layer',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
        _rbCycleMapLayer).id = 'rbLayerBtn';

      mkBtn('', 'Toggle points of interest',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
        _rbTogglePoi).id = 'rbPoiBtn';

      const frameBtn = mkBtn('', 'Frame route',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M3 8V5a2 2 0 0 1 2-2h3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M21 16v3a2 2 0 0 1-2 2h-3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/></svg>',
        _rbFrameRoute);
      frameBtn.id = 'rbFrameBtn';
      frameBtn.classList.add('rb-tool-disabled');

      const surfaceBtn = mkBtn('', 'Surface colors',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M2 20h20"/><path d="M5 20v-6l4-4 3 3 5-5 4 4v8"/></svg>',
        _rbToggleSurfaceMode);
      surfaceBtn.id = 'rbSurfaceToggleBtn';

      // ── Road Safety overlay button ──
      const rsBtn = mkBtn(_rb._roadSafetyOn ? 'active' : '', 'Road safety overlay',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3z"/><path d="M9 12l2 2 4-4"/></svg>',
        _rbToggleRoadSafety);
      rsBtn.id = 'rbRoadSafetyBtn';

      // ── CyclOSM overlay button ──
      const cosmBtn = mkBtn(_rb._cyclOSMOn ? 'active' : '', 'CyclOSM cycling overlay',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="6" cy="17" r="3.5"/><circle cx="18" cy="17" r="3.5"/><path d="M6 17l3-7h6l3 7"/><circle cx="12" cy="7" r="1.5"/></svg>',
        _rbToggleCyclOSM);
      cosmBtn.id = 'rbCyclOSMBtn';

      // ── 3D Terrain toggle button ──
      const terrBtn = mkBtn(loadTerrainEnabled() ? 'active' : '', 'Toggle 3D terrain',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M3 20l5-10 4 6 3-4 6 8"/><circle cx="17" cy="7" r="2"/></svg>',
        _rbToggleTerrain);
      terrBtn.id = 'rbTerrainBtn';

      // Separator before fullscreen
      const sep2 = document.createElement('div');
      sep2.className = 'rb-map-tool-sep';
      this._container.appendChild(sep2);

      const fsBtn = mkBtn('', 'Toggle fullscreen',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" id="rbFsSvg"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
        _rbToggleFullscreen);
      fsBtn.id = 'rbFullscreenBtn';

      return this._container;
    }
    onRemove() { this._container.remove(); }
  }
  _rb.map.addControl(new RbMapTools(), 'top-left');

  setTimeout(() => { if (_rb.map) _rb.map.resize(); }, 200);
  setTimeout(() => { if (_rb.map) _rb.map.resize(); }, 600);

  _rbInitRouteScrub();
  _rbInitRouterDropdown();
  _rbInitExportDropdown();
}

/* ── Router Dropdown ── */
export function _rbInitRouterDropdown() {
  const wrap = document.getElementById('rbRouterWrap');
  const trigger = document.getElementById('rbRouterTrigger');
  const menu = document.getElementById('rbRouterMenu');
  if (!wrap || !trigger || !menu) return;

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    wrap.classList.toggle('rb-router-wrap--open');
    const ew = document.getElementById('rbExportWrap');
    if (ew) ew.classList.remove('rb-export-wrap--open');
  });

  document.addEventListener('click', () => {
    wrap.classList.remove('rb-router-wrap--open');
  });

  menu.addEventListener('click', (e) => {
    const opt = e.target.closest('.rb-router-option');
    if (!opt) return;
    e.stopPropagation();

    // Block disabled ORS options
    if (opt.classList.contains('rb-router-option--disabled')) {
      showToast('Set your ORS API key in Settings first', 'info');
      return;
    }

    const engine = opt.dataset.engine;
    const profile = opt.dataset.profile;
    const label = opt.dataset.label;
    const idx = parseInt(opt.dataset.idx);

    // Skip if already selected
    if (_rb.router.engine === engine && _rb.router.profile === profile) {
      wrap.classList.remove('rb-router-wrap--open');
      return;
    }

    _rb.router = { engine, profile, label };

    // Update trigger
    const r = RB_ROUTERS[idx];
    trigger.innerHTML = `${r.icon}<span id="rbRouterLabel">${r.label} <span class="rb-router-engine">(${r.engine.toUpperCase()})</span></span><svg class="rb-router-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"><polyline points="6 9 12 15 18 9"/></svg>`;

    // Update selected state
    menu.querySelectorAll('.rb-router-option').forEach(o => o.classList.remove('rb-router-option--selected'));
    opt.classList.add('rb-router-option--selected');

    wrap.classList.remove('rb-router-wrap--open');

    // Re-fetch route with new router if we have waypoints
    if (_rb.waypoints.length >= 2) {
      _rbRefetchAllSegments();
    }

    showToast(`Routing: ${label}`, 'success');
  });
}

export function _rbInitExportDropdown() {
  const wrap = document.getElementById('rbExportWrap');
  const trigger = document.getElementById('rbExportTrigger');
  if (!wrap || !trigger) return;

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    wrap.classList.toggle('rb-export-wrap--open');
    // Close router dropdown if open
    const rw = document.getElementById('rbRouterWrap');
    if (rw) rw.classList.remove('rb-router-wrap--open');
  });

  document.addEventListener('click', () => {
    wrap.classList.remove('rb-export-wrap--open');
  });

  wrap.querySelector('.rb-export-menu').addEventListener('click', (e) => {
    const opt = e.target.closest('.rb-export-option');
    if (opt) wrap.classList.remove('rb-export-wrap--open');
  });
}

export async function _rbRefetchAllSegments() {
  _rb.routeSegments = [];
  for (let i = 0; i < _rb.waypoints.length - 1; i++) {
    const a = _rb.waypoints[i];
    const b = _rb.waypoints[i + 1];
    const route = await _rbFetchRoute(a, b, false, true);
    if (route) {
      _rb.routeSegments.push({ points: route.points, distance: route.distance, duration: route.duration, annotations: route.annotations });
    } else {
      _rb.routeSegments.push({ points: [[a.lat, a.lng], [b.lat, b.lng]], distance: _rbHaversine([a.lat, a.lng], [b.lat, b.lng]), duration: 0, fallback: true });
    }
  }
  _rbClearAltRoute();
  _rbRedrawRoute();
  _rbFetchElevation();
  _rbUpdateStats();
}

/* ── Geolocate ── */
export function _rbGeolocate() {
  if (!navigator.geolocation) { showToast('Geolocation not supported', 'error'); return; }
  const btn = document.querySelector('.rb-map-tools .rb-map-tool-btn');
  if (btn) btn.classList.add('rb-locating');
  const onSuccess = (pos) => {
    if (btn) btn.classList.remove('rb-locating');
    const lng = pos.coords.longitude, lat = pos.coords.latitude;
    if (_rb.map) _rb.map.jumpTo({ center: [lng, lat], zoom: 14 });
    // Blue dot at user location
    if (_rb._geoMarker) { _rb._geoMarker.setLngLat([lng, lat]); }
    else {
      const el = document.createElement('div');
      el.className = 'rb-geoloc-dot';
      _rb._geoMarker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([lng, lat]).addTo(_rb.map);
    }
  };
  const onFail = (err) => {
    if (btn) btn.classList.remove('rb-locating');
    if (err.code === 1) showToast('Location blocked — allow it in browser site settings', 'error');
    else if (err.code === 3) showToast('Location timed out — try again', 'error');
    else showToast('Could not get location', 'error');
  };
  // Try high accuracy first, fall back to low accuracy
  navigator.geolocation.getCurrentPosition(onSuccess, () => {
    navigator.geolocation.getCurrentPosition(onSuccess, onFail,
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 });
  }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
}

/* ── Layer Cycling ── */
// Build cycle list from MAP_STYLES: vector themes first, then satellite
// Lazy-init because MAP_STYLES is defined in app.js and not available at import time
let _rbMapLayerKeys = null;
let _rbLayerIdx = 0;
function _rbEnsureLayerKeys() {
  if (_rbMapLayerKeys) return;
  _rbMapLayerKeys = [...Object.keys(window.MAP_STYLES).filter(k => k !== 'satellite'), 'satellite'];
  _rbLayerIdx = Math.max(0, _rbMapLayerKeys.indexOf(loadMapTheme()));
  window._rbLayerIdx = _rbLayerIdx;
}

export function _rbCycleMapLayer() {
  if (!_rb.map) return;
  _rbEnsureLayerKeys();
  _rbLayerIdx = (_rbLayerIdx + 1) % _rbMapLayerKeys.length;
  const key = _rbMapLayerKeys[_rbLayerIdx];
  const entry = window.MAP_STYLES[key];
  const btn = document.getElementById('rbLayerBtn');

  _rb.map.setStyle(_mlGetStyle(key));

  // Re-add all route/POI/marker layers after style is fully ready
  _rb.map.once('idle', _rbRestoreMapLayers);

  if (btn) {
    const isDefault = key === loadMapTheme();
    btn.classList.toggle('rb-layer-active', !isDefault);
    btn.title = isDefault ? 'Switch map layer' : (entry ? entry.label : key);
  }
  showToast((entry ? entry.label : key) + ' map', 'info');
}

/* ── Points of Interest (Overpass API) ── */
const _rbPoiTypes = {
  water:     { label: 'Water',     tag: 'node["amenity"="drinking_water"]', color: '#4fc3f7', icon: '💧',
    svg: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2C8 2 3.5 7.5 3.5 10a4.5 4.5 0 0 0 9 0C12.5 7.5 8 2 8 2z"/></svg>' },
  bike:      { label: 'Bike Shop', tag: 'node["shop"="bicycle"]',           color: '#00e5a0', icon: '🔧',
    svg: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 3l1.5 4m0 0L5 11m2-4h3l2 4M4.5 11a2 2 0 1 0 0 .01M11.5 11a2 2 0 1 0 0 .01"/><circle cx="9" cy="5" r="1"/></svg>' },
  cafe:      { label: 'Café',      tag: 'node["amenity"="cafe"]',           color: '#ffb74d', icon: '☕',
    svg: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5h9v5a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V5z"/><path d="M11 6h1.5a1.5 1.5 0 0 1 0 3H11"/><path d="M4 3c0-1 .5-1.5 1-1.5S6 2 6 3M7 3c0-1 .5-1.5 1-1.5S9 2 9 3"/></svg>' },
  toilets:   { label: 'Toilets',   tag: 'node["amenity"="toilets"]',        color: '#b39ddb', icon: 'WC',
    svg: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="3" r="1.5"/><path d="M5 5v4m-2 0l2 3m0-3l2 3"/><circle cx="11" cy="3" r="1.5"/><path d="M9 5l1 4h2l1-4M10.5 9l-.5 3m1-3l.5 3"/></svg>' },
  fuel:      { label: 'Fuel',      tag: 'node["amenity"="fuel"]',           color: '#ef5350', icon: '⛽',
    svg: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="7" height="10" rx="1"/><path d="M9 7h1.5a1 1 0 0 1 1 1v3.5a1 1 0 0 0 2 0V6l-2-2"/><line x1="4" y1="6" x2="7" y2="6"/></svg>' },
  shelter:   { label: 'Shelter',   tag: 'node["amenity"="shelter"]',        color: '#8d6e63', icon: '⛺',
    svg: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12l6-9 6 9"/><path d="M6 12v-3l2-2 2 2v3"/></svg>' },
  viewpoint: { label: 'Viewpoint', tag: 'node["tourism"="viewpoint"]',      color: '#ffd54f', icon: '👁',
    svg: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/></svg>' },
};

let _rbPoiFetching = false;
let _rbPoiDirty = false;
let _rbPoiRetries = 0;
const _rbPoiMaxRetries = 3;

/* ── POI Tile Cache ── */
const _rbPoiTileSize = 0.05; // ~5km grid cells
const _rbPoiTileCache = new Map(); // key: "lat,lng" → { ts, nodes: [] }
const _rbPoiTileTTL = 10 * 60 * 1000; // 10 minutes

export function _rbPoiTileKey(lat, lng) {
  return `${(Math.floor(lat / _rbPoiTileSize) * _rbPoiTileSize).toFixed(3)},${(Math.floor(lng / _rbPoiTileSize) * _rbPoiTileSize).toFixed(3)}`;
}

export function _rbPoiTilesForBounds(bounds) {
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const s = Math.floor(sw.lat / _rbPoiTileSize) * _rbPoiTileSize;
  const w = Math.floor(sw.lng / _rbPoiTileSize) * _rbPoiTileSize;
  const n = ne.lat;
  const e = ne.lng;
  const tiles = [];
  for (let lat = s; lat <= n; lat += _rbPoiTileSize) {
    for (let lng = w; lng <= e; lng += _rbPoiTileSize) {
      tiles.push({ lat: lat.toFixed(3), lng: lng.toFixed(3) });
    }
  }
  return tiles;
}

export function _rbPoiCatKey() {
  return Object.entries(_rb._poiCategories).filter(([,v]) => v).map(([k]) => k).sort().join(',');
}

export function _rbPoiClearTileCache() {
  _rbPoiTileCache.clear();
}

export function _rbTogglePoi() {
  if (!_rb.map) return;
  const btn = document.getElementById('rbPoiBtn');
  const filter = document.getElementById('rbPoiFilter');

  if (_rb._poiEnabled) {
    // Disable
    _rb._poiEnabled = false;
    if (_rb._poiAbort) { _rb._poiAbort.abort(); _rb._poiAbort = null; }
    clearTimeout(_rb._poiDebounce);
    _rbPoiFetching = false;
    _rbPoiDirty = false;
    _rbClearPoiLayers();
    _rb._poiCache = '';
    if (btn) { btn.classList.remove('rb-poi-active'); btn.classList.remove('rb-poi-loading'); }
    if (filter) filter.style.display = 'none';
    _rb.map.off('moveend', _rbOnPoiMoveEnd);
    _rb.map.off('zoom', _rbUpdatePoiScale);
  } else {
    // Enable
    _rb._poiEnabled = true;
    _rbPoiRetries = 0;
    if (btn) btn.classList.add('rb-poi-active');
    if (filter) filter.style.display = '';
    if (_rb.routeSegments.length > 0) _rb._poiAlongRoute = true;
    _rbRenderPoiFilter();
    if (!_rb._poiAlongRoute) {
      setTimeout(() => { if (_rb._poiEnabled) _rb.map.on('moveend', _rbOnPoiMoveEnd); }, 2000);
    }
    _rb.map.on('zoom', _rbUpdatePoiScale);
    _rbUpdatePoiScale();
    _rbFetchPois();
  }
}

/* ── POI layer helpers (MapLibre) ── */
const _rbPoiMarkers = [];
let _rbPoiPopup = null;
let _rbWpPopup = null;

export function _rbClearPoiLayers() {
  for (const m of _rbPoiMarkers) m.remove();
  _rbPoiMarkers.length = 0;
  if (_rbPoiPopup) { _rbPoiPopup.remove(); _rbPoiPopup = null; }
}

export function _rbAddPoiMarker(lat, lon, cat, name) {
  const cfg = _rbPoiTypes[cat];
  const el = document.createElement('div');
  el.className = 'rb-poi-pin';
  el.innerHTML = `<div class="rb-poi-pin-inner"><div class="rb-poi-pin-icon" style="background:${cfg.color}">${cfg.svg}</div><div class="rb-poi-pin-tail" style="border-top-color:${cfg.color}"></div></div>`;
  const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
    .setLngLat([lon, lat])
    .addTo(_rb.map);
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    _rbCloseWpPopup();
    if (_rbPoiPopup) _rbPoiPopup.remove();
    const hasRoute = _rb.routeSegments.length > 0;
    _rbPoiPopup = new maplibregl.Popup({ closeButton: false, offset: 14, className: 'rb-poi-popup-wrap' })
      .setLngLat([lon, lat])
      .setHTML(`<div class="rb-poi-popup"><strong>${_escHtml(name)}</strong><br><span class="rb-poi-popup-cat" style="color:${cfg.color}">${cfg.svg} ${cfg.label}</span>${hasRoute ? `<button class="rb-poi-add-btn" data-lat="${lat}" data-lon="${lon}" data-name="${_escHtml(name)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M12 5v14M5 12h14"/></svg> Add to route</button>` : ''}</div>`)
      .addTo(_rb.map);
    const addBtn = _rbPoiPopup.getElement().querySelector('.rb-poi-add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        _rbAddPoiToRoute(parseFloat(addBtn.dataset.lat), parseFloat(addBtn.dataset.lon), addBtn.dataset.name);
        _rbPoiPopup.remove();
        _rbPoiPopup = null;
      });
    }
  });
  _rbPoiMarkers.push(marker);
}

export function _rbOnPoiMoveEnd() {
  clearTimeout(_rb._poiDebounce);
  _rb._poiDebounce = setTimeout(_rbFetchPois, 1000);
}

export function _rbUpdatePoiScale() {
  if (!_rb.map) return;
  const z = _rb.map.getZoom();
  // scale: 0.55 at z<=12, 0.7 at z13, 0.85 at z14, 1.0 at z>=15
  const s = z >= 15 ? 1 : z <= 12 ? 0.55 : 0.55 + (z - 12) * 0.15;
  _rb.map.getContainer().style.setProperty('--poi-scale', s.toFixed(3));
}

export function _rbBuildPoiQuery(bounds) {
  if (_rb._poiAlongRoute && _rb.routeSegments.length > 0) return _rbBuildPoiQueryAround();
  if (!bounds) return null;
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const bbox = `${sw.lat.toFixed(4)},${sw.lng.toFixed(4)},${ne.lat.toFixed(4)},${ne.lng.toFixed(4)}`;
  const tags = Object.entries(_rbPoiTypes)
    .filter(([k]) => _rb._poiCategories[k])
    .map(([, v]) => v.tag + `(${bbox})`)
    .join(';');
  if (!tags) return null;
  return `[out:json][timeout:15];(${tags};);out body 300;`;
}

export function _rbBuildPoiQueryAround() {
  const sampled = _rbSampleRoutePoints(80);
  if (sampled.length === 0) return null;
  const coordStr = sampled.map(p => `${p[0].toFixed(4)},${p[1].toFixed(4)}`).join(',');
  const tags = Object.entries(_rbPoiTypes)
    .filter(([k]) => _rb._poiCategories[k])
    .map(([, v]) => v.tag + `(around:500,${coordStr})`)
    .join(';');
  if (!tags) return null;
  return `[out:json][timeout:25];(${tags};);out body 300;`;
}

export function _rbSampleRoutePoints(maxPts) {
  const all = [];
  for (const seg of _rb.routeSegments) all.push(...seg.points);
  if (all.length <= maxPts) return all;
  let totalDist = 0;
  for (let i = 1; i < all.length; i++) totalDist += _rbHaversine(all[i - 1], all[i]);
  const interval = totalDist / (maxPts - 1);
  const sampled = [all[0]];
  let cum = 0, next = interval;
  for (let i = 1; i < all.length; i++) {
    cum += _rbHaversine(all[i - 1], all[i]);
    if (cum >= next) { sampled.push(all[i]); next += interval; }
  }
  const last = all[all.length - 1];
  if (sampled[sampled.length - 1] !== last) sampled.push(last);
  return sampled;
}

export function _rbRouteHash() {
  if (_rb.routeSegments.length === 0) return '';
  const f = _rb.routeSegments[0].points[0];
  const ls = _rb.routeSegments[_rb.routeSegments.length - 1];
  const l = ls.points[ls.points.length - 1];
  return `${_rb.routeSegments.length}:${f[0].toFixed(3)},${f[1].toFixed(3)}:${l[0].toFixed(3)},${l[1].toFixed(3)}`;
}

export async function _rbFetchPois() {
  if (!_rb.map || !_rb._poiEnabled) return;

  // Along-route mode: single query, no tile caching
  if (_rb._poiAlongRoute) {
    if (_rb.routeSegments.length === 0) { _rbClearPoiLayers(); return; }
    const catKey = _rbPoiCatKey();
    const cacheKey = 'route:' + _rbRouteHash() + ':' + catKey;
    if (cacheKey === _rb._poiCache) return;
    if (_rbPoiFetching) { _rbPoiDirty = true; return; }
    const query = _rbBuildPoiQueryAround();
    if (!query) { _rbClearPoiLayers(); return; }
    await _rbDoPoiFetch(query, cacheKey);
    return;
  }

  // Map-area mode: tile-based caching
  if (_rb.map.getZoom() < 12) {
    _rbClearPoiLayers();
    _rb._poiCache = '';
    showToast('Zoom in to see points of interest', 'info');
    return;
  }

  const bounds = _rb.map.getBounds();
  const tiles = _rbPoiTilesForBounds(bounds);
  const catKey = _rbPoiCatKey();
  const now = Date.now();

  // Find tiles that need fetching (not cached or expired)
  const missing = tiles.filter(t => {
    const key = `${t.lat},${t.lng}:${catKey}`;
    const cached = _rbPoiTileCache.get(key);
    return !cached || (now - cached.ts > _rbPoiTileTTL);
  });

  // Render from cache first (instant)
  _rbRenderPoiFromCache(bounds, catKey);

  if (missing.length === 0) return;
  if (_rbPoiFetching) { _rbPoiDirty = true; return; }

  // Fetch missing tiles (batch into one query with combined bbox)
  const mS = Math.min(...missing.map(t => t.lat));
  const mW = Math.min(...missing.map(t => t.lng));
  const mN = Math.max(...missing.map(t => t.lat)) + _rbPoiTileSize;
  const mE = Math.max(...missing.map(t => t.lng)) + _rbPoiTileSize;
  const bbox = `${mS.toFixed(4)},${mW.toFixed(4)},${mN.toFixed(4)},${mE.toFixed(4)}`;
  const tags = Object.entries(_rbPoiTypes)
    .filter(([k]) => _rb._poiCategories[k])
    .map(([, v]) => v.tag + `(${bbox})`)
    .join(';');
  if (!tags) return;
  const query = `[out:json][timeout:15];(${tags};);out body 500;`;

  _rbPoiFetching = true;
  _rbPoiDirty = false;
  const btn = document.getElementById('rbPoiBtn');
  if (btn) btn.classList.add('rb-poi-loading');
  if (_rb._poiAbort) _rb._poiAbort.abort();
  _rb._poiAbort = new AbortController();

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: 'data=' + encodeURIComponent(query),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: _rb._poiAbort.signal,
    });
    if (!res.ok) throw new Error('Overpass ' + res.status);
    const data = await res.json();
    if (!_rb._poiEnabled) return;

    // Distribute nodes into tile buckets
    const tileBuckets = new Map();
    for (const t of missing) tileBuckets.set(`${t.lat},${t.lng}:${catKey}`, []);
    for (const el of (data.elements || [])) {
      if (el.type !== 'node' || !el.lat || !el.lon) continue;
      const cat = _rbClassifyPoi(el.tags);
      if (!cat) continue;
      const tk = _rbPoiTileKey(el.lat, el.lon) + ':' + catKey;
      if (tileBuckets.has(tk)) tileBuckets.get(tk).push({ lat: el.lat, lon: el.lon, cat, name: el.tags.name || null });
    }
    // Store in cache
    for (const [key, nodes] of tileBuckets) _rbPoiTileCache.set(key, { ts: now, nodes });

    // Re-render with fresh cache
    const prevCount = _rbPoiMarkers.length;
    _rbRenderPoiFromCache(_rb.map.getBounds(), catKey);
    const newCount = _rbPoiMarkers.length;
    const added = newCount - prevCount;
    if (added > 0) showToast(`Loaded ${added} new point${added !== 1 ? 's' : ''} of interest`, 'info');
    else if (newCount > 0) showToast(`${newCount} point${newCount !== 1 ? 's' : ''} of interest`, 'info');
    _rbPoiRetries = 0;
  } catch (e) {
    if (e.name === 'AbortError') return;
    console.warn('POI fetch error:', e);
    if (_rbPoiRetries < _rbPoiMaxRetries) { _rbPoiRetries++; _rbPoiDirty = true; }
  } finally {
    _rbPoiFetching = false;
    if (btn) btn.classList.remove('rb-poi-loading');
    if (_rbPoiDirty && _rb._poiEnabled) {
      _rbPoiDirty = false;
      setTimeout(_rbFetchPois, 1000 * _rbPoiRetries);
    }
  }
}

export function _rbRenderPoiFromCache(bounds, catKey) {
  _rbClearPoiLayers();
  const tiles = _rbPoiTilesForBounds(bounds);
  const seen = new Set();
  for (const t of tiles) {
    const cached = _rbPoiTileCache.get(`${t.lat},${t.lng}:${catKey}`);
    if (!cached) continue;
    for (const n of cached.nodes) {
      if (!_rb._poiCategories[n.cat]) continue;
      const id = `${n.lat},${n.lon}`;
      if (seen.has(id)) continue;
      seen.add(id);
      _rbAddPoiMarker(n.lat, n.lon, n.cat, n.name || _rbPoiTypes[n.cat].label);
    }
  }
}

export async function _rbDoPoiFetch(query, cacheKey) {
  if (_rbPoiFetching) { _rbPoiDirty = true; return; }
  _rbPoiFetching = true;
  _rbPoiDirty = false;
  const btn = document.getElementById('rbPoiBtn');
  if (btn) btn.classList.add('rb-poi-loading');
  if (_rb._poiAbort) _rb._poiAbort.abort();
  _rb._poiAbort = new AbortController();
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: 'data=' + encodeURIComponent(query),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: _rb._poiAbort.signal,
    });
    if (!res.ok) throw new Error('Overpass ' + res.status);
    const data = await res.json();
    if (!_rb._poiEnabled) return;
    _rbClearPoiLayers();
    _rb._poiCache = cacheKey;
    for (const el of (data.elements || [])) {
      if (el.type !== 'node' || !el.lat || !el.lon) continue;
      const cat = _rbClassifyPoi(el.tags);
      if (!cat || !_rb._poiCategories[cat]) continue;
      _rbAddPoiMarker(el.lat, el.lon, cat, el.tags.name || _rbPoiTypes[cat].label);
    }
    if (_rbPoiMarkers.length > 0) showToast(`Found ${_rbPoiMarkers.length} point${_rbPoiMarkers.length !== 1 ? 's' : ''} of interest along route`, 'info');
    _rbPoiRetries = 0;
  } catch (e) {
    if (e.name === 'AbortError') return;
    console.warn('POI fetch error:', e);
    if (_rbPoiRetries < _rbPoiMaxRetries) { _rbPoiRetries++; _rbPoiDirty = true; }
  } finally {
    _rbPoiFetching = false;
    if (btn) btn.classList.remove('rb-poi-loading');
    if (_rbPoiDirty && _rb._poiEnabled) {
      _rbPoiDirty = false;
      setTimeout(_rbFetchPois, 1000 * _rbPoiRetries);
    }
  }
}

export function _rbClassifyPoi(tags) {
  if (!tags) return null;
  if (tags.amenity === 'drinking_water') return 'water';
  if (tags.shop === 'bicycle') return 'bike';
  if (tags.amenity === 'cafe') return 'cafe';
  if (tags.amenity === 'toilets') return 'toilets';
  if (tags.amenity === 'fuel') return 'fuel';
  if (tags.amenity === 'shelter') return 'shelter';
  if (tags.tourism === 'viewpoint') return 'viewpoint';
  return null;
}

export function _escHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

export function _rbRenderPoiFilter() {
  const el = document.getElementById('rbPoiFilter');
  if (!el) return;
  const hasRoute = _rb.routeSegments.length > 0;
  const modeHtml = hasRoute ? `<div class="rb-poi-mode-toggle">` +
    `<button class="rb-poi-mode-btn${!_rb._poiAlongRoute ? ' active' : ''}" onclick="_rbSetPoiMode(false)">Map</button>` +
    `<button class="rb-poi-mode-btn${_rb._poiAlongRoute ? ' active' : ''}" onclick="_rbSetPoiMode(true)">Route</button>` +
    `</div>` : '';
  const chips = Object.entries(_rbPoiTypes).map(([key, cfg]) =>
    `<button class="rb-poi-chip${_rb._poiCategories[key] ? ' active' : ''}" data-cat="${key}" onclick="_rbTogglePoiCat('${key}', this)">` +
    `<span class="rb-poi-chip-dot" style="background:${cfg.color}"></span>${cfg.label}</button>`
  ).join('');
  el.innerHTML = modeHtml + chips;
}

export function _rbSetPoiMode(alongRoute) {
  if (_rb._poiAlongRoute === alongRoute) return;
  _rb._poiAlongRoute = alongRoute;
  _rb._poiCache = '';
  _rbClearPoiLayers();
  _rbRenderPoiFilter();
  if (alongRoute) {
    _rb.map.off('moveend', _rbOnPoiMoveEnd);
  } else {
    _rb.map.on('moveend', _rbOnPoiMoveEnd);
  }
  _rbFetchPois();
}

export function _rbTogglePoiCat(key, btn) {
  _rb._poiCategories[key] = !_rb._poiCategories[key];
  if (btn) btn.classList.toggle('active', _rb._poiCategories[key]);
  _rbRefreshPois();
}

export function _rbRefreshPois() {
  _rb._poiCache = '';
  if (!_rb._poiAlongRoute && _rb.map) {
    _rbRenderPoiFromCache(_rb.map.getBounds(), _rbPoiCatKey());
  }
  _rbFetchPois();
}

/* ── Waypoint Marker ── */
const _rbFinishSVG = `<svg viewBox="0 0 18 18" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="4" height="4" fill="#111"/><rect x="5" y="1" width="4" height="4" fill="white"/><rect x="9" y="1" width="4" height="4" fill="#111"/><rect x="13" y="1" width="4" height="4" fill="white"/><rect x="1" y="5" width="4" height="4" fill="white"/><rect x="5" y="5" width="4" height="4" fill="#111"/><rect x="9" y="5" width="4" height="4" fill="white"/><rect x="13" y="5" width="4" height="4" fill="#111"/><rect x="1" y="9" width="4" height="4" fill="#111"/><rect x="5" y="9" width="4" height="4" fill="white"/><rect x="9" y="9" width="4" height="4" fill="#111"/><rect x="13" y="9" width="4" height="4" fill="white"/><rect x="1" y="13" width="4" height="4" fill="white"/><rect x="5" y="13" width="4" height="4" fill="#111"/><rect x="9" y="13" width="4" height="4" fill="white"/><rect x="13" y="13" width="4" height="4" fill="#111"/></svg>`;

export function _rbWaypointContent(index, total) {
  if (index === 0) return { cls: ' rb-wp-marker--start', label: 'S' };
  if (total >= 2 && index === total - 1) return { cls: ' rb-wp-marker--finish', label: _rbFinishSVG };
  return { cls: '', label: String(index + 1) };
}

export function _rbCreateWaypointMarker(lat, lng, index) {
  const el = document.createElement('div');
  el.className = 'rb-wp-icon';
  el.innerHTML = `<div class="rb-wp-marker${index === 0 ? ' rb-wp-marker--start' : ''}">${index === 0 ? 'S' : (index + 1)}</div>`;
  let _dragged = false;
  el.addEventListener('mousedown', (e) => {
    if (e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
      const idx = _rb.waypoints.findIndex(w => w.marker && w.marker.getElement() === el);
      if (idx !== -1) _rbRemoveWaypoint(idx);
    }
  });
  el.addEventListener('click', (e) => {
    if (_dragged) { _dragged = false; return; }
    e.stopPropagation();
    const idx = _rb.waypoints.findIndex(w => w.marker?.getElement() === el);
    if (idx !== -1) _rbShowWaypointPopup(idx);
  });
  el.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); e.stopPropagation(); } });
  const marker = new maplibregl.Marker({ element: el, draggable: true, anchor: 'center' })
    .setLngLat([lng, lat])
    .addTo(_rb.map);
  marker.on('dragstart', () => { _dragged = true; _rbCloseWpPopup(); });
  el.removeAttribute('aria-label');
  return marker;
}

export function _rbCloseWpPopup() {
  if (_rbWpPopup) { _rbWpPopup.remove(); _rbWpPopup = null; }
}

export function _rbWaypointDistFromStart(idx) {
  let dist = 0;
  for (let i = 0; i < idx && i < _rb.routeSegments.length; i++) {
    dist += _rb.routeSegments[i].distance || 0;
  }
  return dist;
}

export function _rbWaypointElevation(idx) {
  if (!_rb.elevationData.length) return null;
  const cumDist = _rbWaypointDistFromStart(idx);
  let closest = 0, bestD = Infinity;
  for (let i = 0; i < _rb.elevationData.length; i++) {
    const d = Math.abs(_rb.elevationData[i].dist - cumDist);
    if (d < bestD) { bestD = d; closest = i; }
  }
  return Math.round(_rb.elevationData[closest].elev);
}

export function _rbShowWaypointPopup(idx) {
  _rbCloseWpPopup();
  if (_rbPoiPopup) { _rbPoiPopup.remove(); _rbPoiPopup = null; }

  const wp = _rb.waypoints[idx];
  if (!wp) return;

  const total = _rb.waypoints.length;
  const label = idx === 0 ? 'Start' : (idx === total - 1 && total >= 2) ? 'Finish' : `Waypoint ${idx + 1}`;
  const name = wp._placeName || 'Loading\u2026';
  const dist = _rbWaypointDistFromStart(idx);
  const distStr = dist >= 1000 ? (dist / 1000).toFixed(1) + ' km' : Math.round(dist) + ' m';
  const elev = _rbWaypointElevation(idx);
  const elevStr = elev !== null ? elev + ' m' : '\u2013';

  const html = `<div class="rb-wp-popup">
    <div class="rb-wp-popup-header">
      <span class="rb-wp-popup-label">${_escHtml(label)}</span>
      <button class="rb-wp-popup-close" title="Close">\u00d7</button>
    </div>
    <div class="rb-wp-popup-name">${_escHtml(name)}</div>
    <div class="rb-wp-popup-stats">
      <div class="rb-wp-popup-stat">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
        <span class="rb-wp-popup-val">${distStr}</span>
      </div>
      <div class="rb-wp-popup-stat">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 20 7-7 4 4 9-11"/></svg>
        <span class="rb-wp-popup-val">${elevStr}</span>
      </div>
      <div class="rb-wp-popup-stat">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="10" r="3"/><path d="M12 2a8 8 0 0 0-8 8c0 5.4 8 12 8 12s8-6.6 8-12a8 8 0 0 0-8-8z"/></svg>
        <span class="rb-wp-popup-val">${wp.lat.toFixed(4)}, ${wp.lng.toFixed(4)}</span>
      </div>
    </div>
    <div class="rb-wp-popup-actions">
      <button class="rb-wp-popup-btn rb-wp-popup-center" title="Center map">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>
        Center
      </button>
      <button class="rb-wp-popup-btn rb-wp-popup-delete" title="Remove waypoint">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        Remove
      </button>
    </div>
  </div>`;

  _rbWpPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: true, offset: 20, className: 'rb-wp-popup-wrap' })
    .setLngLat([wp.lng, wp.lat])
    .setHTML(html)
    .addTo(_rb.map);

  const popupEl = _rbWpPopup.getElement();
  popupEl.querySelector('.rb-wp-popup-close').addEventListener('click', () => _rbCloseWpPopup());
  popupEl.querySelector('.rb-wp-popup-center').addEventListener('click', () => {
    _rb.map.easeTo({ center: [wp.lng, wp.lat], zoom: Math.max(_rb.map.getZoom(), 14), duration: 500 });
    _rbCloseWpPopup();
  });
  popupEl.querySelector('.rb-wp-popup-delete').addEventListener('click', () => {
    _rbCloseWpPopup();
    _rbRemoveWaypoint(idx);
  });

  if (!wp._placeName) {
    _rbReverseGeocode(wp.lat, wp.lng).then(placeName => {
      wp._placeName = placeName || `Point ${idx + 1}`;
      const nameEl = popupEl.querySelector('.rb-wp-popup-name');
      if (nameEl) nameEl.textContent = wp._placeName;
    });
  }
}

export function _rbUpdateWaypointMarkerIcon(marker, index) {
  const total = _rb.waypoints.length;
  const wp = _rbWaypointContent(index, total);
  const el = marker.getElement();
  el.className = 'rb-wp-icon';
  el.innerHTML = `<div class="rb-wp-marker${wp.cls}">${wp.label}</div>`;
}

export function _rbRefreshAllWaypointIcons() {
  const n = _rb.waypoints.length;
  _rb.waypoints.forEach((w, i) => { if (w.marker) _rbUpdateWaypointMarkerIcon(w.marker, i); });
  // Offset finish marker when it sits on top of the start marker (loop route)
  if (n >= 2) {
    const first = _rb.waypoints[0];
    const last  = _rb.waypoints[n - 1];
    const overlaps = Math.abs(first.lat - last.lat) < 0.0001 && Math.abs(first.lng - last.lng) < 0.0001;
    if (last.marker) last.marker.setOffset(overlaps ? [20, 0] : [0, 0]);
    if (first.marker) first.marker.setOffset([0, 0]);
  }
}

/* ── Routing engines ── */
const OSRM_BASE = 'https://router.project-osrm.org/route/v1/cycling';
const BROUTER_BASE = 'https://brouter.de/brouter';
const ORS_BASE = 'https://api.openrouteservice.org/v2/directions';

const RB_ROUTERS = [
  { engine: 'osrm', profile: 'cycling', label: 'Cycling', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-3 11.5V14l-3-3 4-3 2 3h2"/></svg>' },
  { engine: 'brouter', profile: 'fastbike', label: 'Road', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M5 12h14M12 5l7 7-7 7"/></svg>' },
  { engine: 'brouter', profile: 'trekking', label: 'Trekking', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M3 17l4-8 4 4 4-8 4 8"/></svg>' },
  { engine: 'brouter', profile: 'mtb', label: 'MTB', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M4 20l4-12 4 6 4-10 4 14"/></svg>' },
  { engine: 'brouter', profile: 'shortest', label: 'Shortest', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>' },
  { engine: 'brouter', profile: 'safety', label: 'Safety', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' },
  { engine: 'brouter', profile: 'fastbike-lowtraffic', label: 'Low Traffic', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>' },
  { engine: 'brouter', profile: 'fastbike-asia-pacific', label: 'Asia-Pacific', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>' },
  { engine: 'ors', profile: 'cycling-regular', label: 'Regular', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>' },
  { engine: 'ors', profile: 'cycling-road', label: 'Road', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M4 19L12 5l8 14"/><line x1="8" y1="14" x2="16" y2="14"/></svg>' },
  { engine: 'ors', profile: 'cycling-mountain', label: 'Mountain', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M4 20l5-14 3 6 4-8 4 16"/></svg>' },
  { engine: 'ors', profile: 'cycling-electric', label: 'E-Bike', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>' },
];

/* ── Avoid-aware routing for loop-back ── */
export function _rbSampleAvoidPoints(intervalM) {
  const pts = [];
  const iv = intervalM || 400;
  for (const seg of _rb.routeSegments) {
    if (!seg.points || seg.points.length < 2) continue;
    let accum = 0;
    for (let i = 1; i < seg.points.length; i++) {
      const [lat1, lng1] = seg.points[i - 1];
      const [lat2, lng2] = seg.points[i];
      const d = _rbHaversine(lat1, lng1, lat2, lng2);
      accum += d;
      if (accum >= iv) { pts.push([lat2, lng2]); accum = 0; }
    }
  }
  return pts; // [[lat, lng], ...]
}

export function _rbHaversine(a1, a2, a3, a4) {
  // Supports both _rbHaversine([lat,lng],[lat,lng]) and _rbHaversine(lat,lng,lat,lng)
  const lat1 = Array.isArray(a1) ? a1[0] : a1;
  const lng1 = Array.isArray(a1) ? a1[1] : a2;
  const lat2 = Array.isArray(a1) ? a2[0] : a3;
  const lng2 = Array.isArray(a1) ? a2[1] : a4;
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function _rbFetchRouteWithAvoid(from, to) {
  const avoidPts = _rbSampleAvoidPoints(400);
  if (!avoidPts.length) return _rbFetchRoute(from, to);

  let signal;
  if (_rb._fetchAbort) _rb._fetchAbort.abort();
  _rb._fetchAbort = new AbortController();
  signal = _rb._fetchAbort.signal;

  if (_rb.router.engine === 'brouter') {
    // BRouter supports nogos=lng,lat,radius|...
    const nogos = avoidPts.map(p => `${p[1]},${p[0]},100`).join('|');
    const lonlats = `${from.lng},${from.lat}|${to.lng},${to.lat}`;
    const url = `${BROUTER_BASE}?lonlats=${lonlats}&profile=${_rb.router.profile}&alternativeidx=0&format=geojson&nogos=${encodeURIComponent(nogos)}`;
    try {
      const resp = await fetch(url, { signal });
      if (resp.ok) {
        const data = await resp.json();
        const feat = data.features && data.features[0];
        if (feat) {
          const coords = feat.geometry.coordinates;
          const points = coords.map(c => [c[1], c[0]]);
          const dist = parseFloat(feat.properties['track-length']) || 0;
          const dur = parseFloat(feat.properties['total-time']) || 0;
          return { points, distance: dist, duration: dur, annotations: null };
        }
      }
    } catch (e) { if (e.name === 'AbortError') return null; }
    // Fallback: try without avoid
    return _rbFetchRoute(from, to);
  }

  if (_rb.router.engine === 'ors') {
    // ORS: use POST with avoid_polygons buffer around route
    const apiKey = _rb.orsApiKey;
    if (!apiKey) { showToast('Set your ORS API key in Settings', 'error'); return null; }
    const body = {
      coordinates: [[from.lng, from.lat], [to.lng, to.lat]],
      options: {
        avoid_polygons: _rbBuildAvoidMultiPoly(avoidPts, 0.001)
      }
    };
    try {
      const resp = await fetch(`${ORS_BASE}/${_rb.router.profile}/geojson`, {
        method: 'POST', signal,
        headers: { 'Content-Type': 'application/json', 'Authorization': apiKey },
        body: JSON.stringify(body),
      });
      if (resp.ok) {
        const data = await resp.json();
        const feat = data.features && data.features[0];
        if (feat) {
          const coords = feat.geometry.coordinates;
          const points = coords.map(c => [c[1], c[0]]);
          const summary = feat.properties.summary || {};
          return { points, distance: summary.distance || 0, duration: summary.duration || 0, annotations: null };
        }
      }
    } catch (e) { if (e.name === 'AbortError') return null; }
    return _rbFetchRoute(from, to);
  }

  // OSRM: request alternatives, pick least overlapping
  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const url = `${OSRM_BASE}/${coords}?overview=full&geometries=polyline6&steps=true&annotations=true&alternatives=true`;
  try {
    const resp = await fetch(url, { signal });
    const data = await resp.json();
    if (data.code !== 'Ok' || !data.routes?.length) return _rbFetchRoute(from, to);
    if (data.routes.length === 1) return _normalizeOsrmRoute(data.routes[0]);
    // Pick route with least overlap to existing route
    const existing = new Set(avoidPts.map(p => `${p[0].toFixed(4)},${p[1].toFixed(4)}`));
    let best = null, bestOverlap = Infinity;
    for (const r of data.routes) {
      const norm = _normalizeOsrmRoute(r);
      let overlap = 0;
      for (const pt of norm.points) {
        if (existing.has(`${pt[0].toFixed(4)},${pt[1].toFixed(4)}`)) overlap++;
      }
      if (overlap < bestOverlap) { bestOverlap = overlap; best = norm; }
    }
    return best;
  } catch (e) {
    if (e.name === 'AbortError') return null;
    return _rbFetchRoute(from, to);
  }
}

export function _rbBuildAvoidMultiPoly(pts, bufferDeg) {
  // Build a MultiPolygon of small squares around each avoid point
  const polys = pts.slice(0, 50).map(p => {  // ORS limits polygon complexity
    const [lat, lng] = p;
    const b = bufferDeg;
    return [[[lng-b,lat-b],[lng+b,lat-b],[lng+b,lat+b],[lng-b,lat+b],[lng-b,lat-b]]];
  });
  return { type: 'MultiPolygon', coordinates: polys };
}

/* ── BRouter fetch ── */
export async function _brouterFetchRoute(from, to, altIdx, signal) {
  const lonlats = `${from.lng},${from.lat}|${to.lng},${to.lat}`;
  const url = `${BROUTER_BASE}?lonlats=${lonlats}&profile=${_rb.router.profile}&alternativeidx=${altIdx || 0}&format=geojson`;
  try {
    const resp = await fetch(url, { signal });
    if (!resp.ok) return null;
    const data = await resp.json();
    const feat = data.features && data.features[0];
    if (!feat) return null;
    const coords = feat.geometry.coordinates; // [lng, lat, ele]
    const points = coords.map(c => [c[1], c[0]]); // flip to [lat, lng]
    const dist = parseFloat(feat.properties['track-length']) || 0;
    const dur = parseFloat(feat.properties['total-time']) || 0;
    return { points, distance: dist, duration: dur, annotations: null };
  } catch (e) {
    if (e.name === 'AbortError') return null;
    return null;
  }
}

/* ── ORS fetch ── */
export async function _orsFetchRoute(from, to, altIdx, signal) {
  const apiKey = _rb.orsApiKey;
  if (!apiKey) { showToast('Set your ORS API key in Settings', 'error'); return null; }
  let url = `${ORS_BASE}/${_rb.router.profile}?api_key=${apiKey}&start=${from.lng},${from.lat}&end=${to.lng},${to.lat}`;
  if (altIdx > 0) url += `&alternative_routes=${encodeURIComponent(JSON.stringify({ target_count: 2 }))}`;
  try {
    const resp = await fetch(url, { signal });
    if (resp.status === 429) { showToast('ORS rate limit reached — try again later', 'error'); return null; }
    if (resp.status === 403) { showToast('Invalid ORS API key — check Settings', 'error'); return null; }
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data.features || !data.features.length) return null;
    // If we requested alternatives, return array
    if (altIdx > 0 && data.features.length > 1) {
      return data.features.map(feat => {
        const coords = feat.geometry.coordinates;
        const points = coords.map(c => [c[1], c[0]]);
        const summary = feat.properties.summary || {};
        return { points, distance: summary.distance || 0, duration: summary.duration || 0, annotations: null };
      });
    }
    const feat = data.features[0];
    const coords = feat.geometry.coordinates; // [lng, lat]
    const points = coords.map(c => [c[1], c[0]]); // flip to [lat, lng]
    const summary = feat.properties.summary || {};
    return { points, distance: summary.distance || 0, duration: summary.duration || 0, annotations: null };
  } catch (e) {
    if (e.name === 'AbortError') return null;
    return null;
  }
}

export function _normalizeOsrmRoute(r) {
  return { points: _rbDecodePolyline6(r.geometry), distance: r.distance, duration: r.duration, annotations: r.legs[0]?.annotation || null };
}

export async function _rbFetchRoute(from, to, withAlternatives, skipAbort) {
  let signal;
  if (!skipAbort) {
    if (_rb._fetchAbort) _rb._fetchAbort.abort();
    _rb._fetchAbort = new AbortController();
    signal = _rb._fetchAbort.signal;
  }

  if (_rb.router.engine === 'brouter') {
    try {
      const main = await _brouterFetchRoute(from, to, 0, signal);
      if (!main) { showToast('Could not find route between points', 'error'); return null; }
      if (!withAlternatives) return main;
      const alt = await _brouterFetchRoute(from, to, 1, signal);
      return alt ? [main, alt] : [main];
    } catch (e) {
      if (e.name === 'AbortError') return null;
      showToast('Route fetch failed', 'error');
      return null;
    }
  }

  if (_rb.router.engine === 'ors') {
    try {
      if (withAlternatives) {
        const result = await _orsFetchRoute(from, to, 1, signal);
        if (!result) { showToast('Could not find route between points', 'error'); return null; }
        return Array.isArray(result) ? result : [result];
      }
      const main = await _orsFetchRoute(from, to, 0, signal);
      if (!main) { showToast('Could not find route between points', 'error'); return null; }
      return main;
    } catch (e) {
      if (e.name === 'AbortError') return null;
      showToast('Route fetch failed', 'error');
      return null;
    }
  }

  // OSRM
  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const alt = withAlternatives ? '&alternatives=true' : '';
  const url = `${OSRM_BASE}/${coords}?overview=full&geometries=polyline6&steps=true&annotations=true${alt}`;
  try {
    const resp = await fetch(url, { signal });
    const data = await resp.json();
    if (data.code !== 'Ok' || !data.routes?.length) {
      showToast('Could not find cycling route between points', 'error');
      return null;
    }
    if (withAlternatives) return data.routes.map(_normalizeOsrmRoute);
    return _normalizeOsrmRoute(data.routes[0]);
  } catch (e) {
    if (e.name === 'AbortError') return null;
    showToast('Route fetch failed', 'error');
    return null;
  }
}

/* ── Alternative route display ── */
export function _rbClearAltRoute() {
  if (!_rb.map) return;
  if (_rb._altEnterFn) { _rb.map.off('mouseenter', 'rb-alt-hit', _rb._altEnterFn); _rb._altEnterFn = null; }
  if (_rb._altLeaveFn) { _rb.map.off('mouseleave', 'rb-alt-hit', _rb._altLeaveFn); _rb._altLeaveFn = null; }
  try { if (_rb.map.getLayer('rb-alt-route')) _rb.map.removeLayer('rb-alt-route'); } catch(_){}
  try { if (_rb.map.getLayer('rb-alt-hit')) _rb.map.removeLayer('rb-alt-hit'); } catch(_){}
  try { if (_rb.map.getSource('rb-alt-route')) _rb.map.removeSource('rb-alt-route'); } catch(_){}
  if (_rb._altToast) { _rb._altToast = null; }
}

export function _rbShowAltRoute(altRoute, segIdx) {
  _rbClearAltRoute();
  const altPoints = altRoute.points;
  const coords = altPoints.map(p => [p[1], p[0]]);
  const altDistKm = (altRoute.distance / 1000).toFixed(1);
  const mainDistKm = (_rb.routeSegments[segIdx]?.distance / 1000 || 0).toFixed(1);
  const diff = (altRoute.distance - (_rb.routeSegments[segIdx]?.distance || 0)) / 1000;
  const diffStr = diff >= 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);

  _rb.map.addSource('rb-alt-route', {
    type: 'geojson',
    data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } },
  });
  _rb.map.addLayer({
    id: 'rb-alt-route', type: 'line', source: 'rb-alt-route',
    paint: { 'line-color': '#888888', 'line-width': 4, 'line-opacity': 0.6 },
  });
  // Wide hit area for clicking
  _rb.map.addLayer({
    id: 'rb-alt-hit', type: 'line', source: 'rb-alt-route',
    paint: { 'line-color': 'transparent', 'line-width': 30 },
  });

  _rb.map.getCanvas().style.cursor = '';

  // Hover effect — store refs for cleanup
  _rb._altEnterFn = () => {
    if (_rb.map.getLayer('rb-alt-route')) {
      _rb.map.setPaintProperty('rb-alt-route', 'line-opacity', 0.9);
    }
    _rb.map.getCanvas().style.cursor = 'pointer';
  };
  _rb._altLeaveFn = () => {
    if (_rb.map.getLayer('rb-alt-route')) {
      _rb.map.setPaintProperty('rb-alt-route', 'line-opacity', 0.6);
    }
    _rb.map.getCanvas().style.cursor = '';
  };
  _rb.map.on('mouseenter', 'rb-alt-hit', _rb._altEnterFn);
  _rb.map.on('mouseleave', 'rb-alt-hit', _rb._altLeaveFn);

  // Click to select alternative — suppress map click so no waypoint is placed
  _rb.map.once('click', 'rb-alt-hit', (e) => {
    e.preventDefault();
    _rb._altClicked = true;
    _rb.routeSegments[segIdx] = {
      points: altPoints,
      distance: altRoute.distance,
      duration: altRoute.duration,
      annotations: altRoute.annotations,
    };
    _rbClearAltRoute();
    _rbRedrawRoute();
    _rbFetchElevation();
    _rbPushHistory();
    _rbUpdateStats();
    showToast(`Switched to alternative (${altDistKm} km)`, 'success');
  });

  showToast(`Alternative available: ${altDistKm} km (${diffStr} km) — click blue route to switch`, 'info', 5000);
}

/* ── Polyline6 Decoder ── */
export function _rbDecodePolyline6(encoded) {
  const points = [];
  let lat = 0, lng = 0, i = 0;
  while (i < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1 ? ~(result >> 1) : result >> 1);
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1 ? ~(result >> 1) : result >> 1);
    points.push([lat / 1e6, lng / 1e6]);
  }
  return points;
}

/* ── Map Click ── */
export async function _rbOnMapClick(e) {
  if (_rb._altClicked) { _rb._altClicked = false; return; }
  if (_rb._routeClicked) { _rb._routeClicked = false; return; }
  // If click hit the route line, skip — the rb-route-hit handler inserts a waypoint
  if (_rb.map.getLayer('rb-route-hit')) {
    const hitFeats = _rb.map.queryRenderedFeatures(e.point, { layers: ['rb-route-hit'] });
    if (hitFeats.length > 0) return;
  }
  // If click hit the alt-route layer, skip — the layer handler will deal with it
  if (_rb.map.getLayer('rb-alt-hit')) {
    const features = _rb.map.queryRenderedFeatures(e.point, { layers: ['rb-alt-hit'] });
    if (features.length > 0) return;
  }
  const lat = e.lngLat.lat;
  const lng = e.lngLat.lng;
  const idx = _rb.waypoints.length;
  const marker = _rbCreateWaypointMarker(lat, lng, idx);
  marker.on('dragend', () => _rbOnWaypointDrag(idx));
  _rb.waypoints.push({ lat, lng, marker });
  _rbRefreshAllWaypointIcons();

  // Smoothly pan camera to the new waypoint
  _rb.map.easeTo({ center: [lng, lat], duration: 400 });

  if (_rb.waypoints.length > 1) {
    _rbClearAltRoute();
    const prev = _rb.waypoints[_rb.waypoints.length - 2];
    const curr = _rb.waypoints[_rb.waypoints.length - 1];
    const routes = await _rbFetchRoute(prev, curr, true);
    if (routes && routes.length > 0) {
      const route = routes[0];
      const segIdx = _rb.routeSegments.length;
      _rb.routeSegments.push({ points: route.points, distance: route.distance, duration: route.duration, annotations: route.annotations });
      _rbRedrawRoute();
      _rbFetchElevation();
      // Show alternative if available
      if (routes.length > 1) {
        _rbShowAltRoute(routes[1], segIdx);
      }
    } else {
      // Fallback: straight dashed line between waypoints
      _rb.routeSegments.push({ points: [[prev.lat, prev.lng], [curr.lat, curr.lng]], distance: _rbHaversine([prev.lat, prev.lng], [curr.lat, curr.lng]), duration: 0, fallback: true });
      _rbRedrawRoute();
      _rbFetchElevation();
    }
  }

  _rbPushHistory();
  _rbUpdateStats();
  _rbUpdateWaypointList();
}

/* ── Waypoint Drag ── */
export async function _rbOnWaypointDrag(idx) {
  const wp = _rb.waypoints[idx];
  if (!wp) return;
  const pos = wp.marker.getLngLat();
  wp.lat = pos.lat;
  wp.lng = pos.lng;
  wp._placeName = null; // re-fetch place name after drag

  const promises = [];
  if (idx > 0) {
    const prevWp = _rb.waypoints[idx - 1];
    promises.push(_rbFetchRoute(prevWp, wp, false, true).then(r => {
      if (r) _rb.routeSegments[idx - 1] = { points: r.points, distance: r.distance, duration: r.duration, annotations: r.annotations };
      else _rb.routeSegments[idx - 1] = { points: [[prevWp.lat, prevWp.lng], [wp.lat, wp.lng]], distance: _rbHaversine([prevWp.lat, prevWp.lng], [wp.lat, wp.lng]), duration: 0, fallback: true };
    }));
  }
  if (idx < _rb.waypoints.length - 1) {
    const nextWp = _rb.waypoints[idx + 1];
    promises.push(_rbFetchRoute(wp, nextWp, false, true).then(r => {
      if (r) _rb.routeSegments[idx] = { points: r.points, distance: r.distance, duration: r.duration, annotations: r.annotations };
      else _rb.routeSegments[idx] = { points: [[wp.lat, wp.lng], [nextWp.lat, nextWp.lng]], distance: _rbHaversine([wp.lat, wp.lng], [nextWp.lat, nextWp.lng]), duration: 0, fallback: true };
    }));
  }
  await Promise.all(promises);

  _rbRedrawRoute();
  _rbFetchElevation();
  _rbPushHistory();
  _rbUpdateStats();
}

/* ── Insert waypoint on route click ── */
export async function _rbInsertWaypoint(segIdx, lat, lng) {
  const insertIdx = segIdx + 1;
  const wp = { lat, lng, marker: null };
  _rb.waypoints.splice(insertIdx, 0, wp);

  // Fetch two new segments to replace the one old segment
  const prevWp = _rb.waypoints[insertIdx - 1];
  const nextWp = _rb.waypoints[insertIdx + 1];

  const [routeA, routeB] = await Promise.all([
    _rbFetchRoute(prevWp, wp, false, true),
    _rbFetchRoute(wp, nextWp, false, true),
  ]);

  const segA = routeA
    ? { points: routeA.points, distance: routeA.distance, duration: routeA.duration, annotations: routeA.annotations }
    : { points: [[prevWp.lat, prevWp.lng], [wp.lat, wp.lng]], distance: _rbHaversine([prevWp.lat, prevWp.lng], [wp.lat, wp.lng]), duration: 0, fallback: true };
  const segB = routeB
    ? { points: routeB.points, distance: routeB.distance, duration: routeB.duration, annotations: routeB.annotations }
    : { points: [[wp.lat, wp.lng], [nextWp.lat, nextWp.lng]], distance: _rbHaversine([wp.lat, wp.lng], [nextWp.lat, nextWp.lng]), duration: 0, fallback: true };

  // Replace the one old segment with two new ones
  _rb.routeSegments.splice(segIdx, 1, segA, segB);

  // Remove all old markers and recreate from stored coordinates
  // (same approach as _rbRemoveWaypoint — ensures drag handlers have correct indices)
  _rb.waypoints.forEach(w => { if (w.marker) w.marker.remove(); });
  _rb.waypoints.forEach((w, i) => {
    w.marker = _rbCreateWaypointMarker(w.lat, w.lng, i);
    w.marker.on('dragend', () => _rbOnWaypointDrag(i));
  });
  _rbRefreshAllWaypointIcons();

  _rbClearAltRoute();
  _rbRedrawRoute();
  _rbFetchElevation();
  _rbPushHistory();
  _rbUpdateStats();
  _rbUpdateWaypointList();
}

/* ── Add POI to route as named waypoint ── */
export async function _rbAddPoiToRoute(lat, lon, name) {
  if (_rb.routeSegments.length === 0) return;

  // Find closest point on any segment to the POI
  let bestSegIdx = 0, minDist = Infinity;
  for (let s = 0; s < _rb.routeSegments.length; s++) {
    const pts = _rb.routeSegments[s].points;
    for (const p of pts) {
      const d = (p[0] - lat) ** 2 + (p[1] - lon) ** 2;
      if (d < minDist) { minDist = d; bestSegIdx = s; }
    }
  }

  // Insert as waypoint at the POI location with the POI name
  const insertIdx = bestSegIdx + 1;
  const wp = { lat, lng: lon, marker: null, _placeName: name };
  _rb.waypoints.splice(insertIdx, 0, wp);

  const prevWp = _rb.waypoints[insertIdx - 1];
  const nextWp = _rb.waypoints[insertIdx + 1];

  const [routeA, routeB] = await Promise.all([
    _rbFetchRoute(prevWp, wp, false, true),
    _rbFetchRoute(wp, nextWp, false, true),
  ]);

  const segA = routeA
    ? { points: routeA.points, distance: routeA.distance, duration: routeA.duration, annotations: routeA.annotations }
    : { points: [[prevWp.lat, prevWp.lng], [wp.lat, wp.lng]], distance: _rbHaversine([prevWp.lat, prevWp.lng], [wp.lat, wp.lng]), duration: 0, fallback: true };
  const segB = routeB
    ? { points: routeB.points, distance: routeB.distance, duration: routeB.duration, annotations: routeB.annotations }
    : { points: [[wp.lat, wp.lng], [nextWp.lat, nextWp.lng]], distance: _rbHaversine([wp.lat, wp.lng], [nextWp.lat, nextWp.lng]), duration: 0, fallback: true };

  _rb.routeSegments.splice(bestSegIdx, 1, segA, segB);

  // Recreate all markers (same approach as _rbInsertWaypoint)
  _rb.waypoints.forEach(w => { if (w.marker) w.marker.remove(); });
  _rb.waypoints.forEach((w, i) => {
    w.marker = _rbCreateWaypointMarker(w.lat, w.lng, i);
    w.marker.on('dragend', () => _rbOnWaypointDrag(i));
  });
  _rbRefreshAllWaypointIcons();

  _rbClearAltRoute();
  _rbRedrawRoute();
  _rbFetchElevation();
  _rbPushHistory();
  _rbUpdateStats();
  _rbUpdateWaypointList();
  showToast(`Added "${name}" to route`, 'success');
}

/* ── Route Drawing ── */
export function _rbRedrawRoute() {
  if (!_rb.map) return;
  // Remove old route layers/sources
  try { if (_rb.map.getLayer('rb-route-arrows')) _rb.map.removeLayer('rb-route-arrows'); } catch(_){}
  try { if (_rb.map.getLayer('rb-route-hit')) _rb.map.removeLayer('rb-route-hit'); } catch(_){}
  try { if (_rb.map.getLayer('rb-route')) _rb.map.removeLayer('rb-route'); } catch(_){}
  try { if (_rb.map.getLayer('rb-surface')) _rb.map.removeLayer('rb-surface'); } catch(_){}
  try { if (_rb.map.getLayer('rb-fallback')) _rb.map.removeLayer('rb-fallback'); } catch(_){}
  try { if (_rb.map.getSource('rb-route')) _rb.map.removeSource('rb-route'); } catch(_){}
  try { if (_rb.map.getSource('rb-surface')) _rb.map.removeSource('rb-surface'); } catch(_){}
  try { if (_rb.map.getSource('rb-fallback')) _rb.map.removeSource('rb-fallback'); } catch(_){}
  _rb.routePolyline = null;
  _rb._surfaceLayer = null;

  const allPoints = [];
  for (const seg of _rb.routeSegments) allPoints.push(...seg.points);
  if (allPoints.length === 0) return;

  // Separate routed vs fallback (unroutable) segments
  const routedPoints = [];
  const fallbackFeatures = [];
  for (const seg of _rb.routeSegments) {
    if (seg.fallback) {
      fallbackFeatures.push({
        type: 'Feature', properties: {},
        geometry: { type: 'LineString', coordinates: seg.points.map(p => [p[1], p[0]]) },
      });
    } else {
      routedPoints.push(...seg.points);
    }
  }

  // Dashed connectors for OSRM snap gaps (route snaps to nearest road, waypoint is off-road)
  const SNAP_THRESHOLD = 30; // meters — draw connector if gap > 30m
  for (let i = 0; i < _rb.routeSegments.length; i++) {
    const seg = _rb.routeSegments[i];
    if (seg.fallback || seg.points.length === 0) continue;
    const wpStart = _rb.waypoints[i];
    const wpEnd = _rb.waypoints[i + 1];
    if (wpStart) {
      const segFirst = seg.points[0];
      if (_rbHaversine([wpStart.lat, wpStart.lng], segFirst) > SNAP_THRESHOLD) {
        fallbackFeatures.push({
          type: 'Feature', properties: {},
          geometry: { type: 'LineString', coordinates: [[wpStart.lng, wpStart.lat], [segFirst[1], segFirst[0]]] },
        });
      }
    }
    if (wpEnd) {
      const segLast = seg.points[seg.points.length - 1];
      if (_rbHaversine([wpEnd.lat, wpEnd.lng], segLast) > SNAP_THRESHOLD) {
        fallbackFeatures.push({
          type: 'Feature', properties: {},
          geometry: { type: 'LineString', coordinates: [[segLast[1], segLast[0]], [wpEnd.lng, wpEnd.lat]] },
        });
      }
    }
  }

  if (_rb._surfaceMode && routedPoints.length > 0) {
    const groups = _rbGroupBySurface();
    const features = groups.map(g => ({
      type: 'Feature',
      properties: { surface: g.type, color: g.color },
      geometry: { type: 'LineString', coordinates: g.points.filter(Boolean).map(p => [p[1], p[0]]) },
    }));
    _rb.map.addSource('rb-surface', { type: 'geojson', data: { type: 'FeatureCollection', features } });
    _rb.map.addLayer({
      id: 'rb-surface', type: 'line', source: 'rb-surface',
      paint: { 'line-color': ['get', 'color'], 'line-width': 4, 'line-opacity': 0.9 },
    });
    _rb._surfaceLayer = true;
  }

  // Main route source (all points for bounds, routed for display)
  if (routedPoints.length > 0) {
    const geojson = { type: 'Feature', geometry: { type: 'LineString', coordinates: routedPoints.map(p => [p[1], p[0]]) } };
    _rb.map.addSource('rb-route', { type: 'geojson', data: geojson });
    if (!_rb._surfaceMode) {
      _rb.map.addLayer({
        id: 'rb-route', type: 'line', source: 'rb-route',
        paint: { 'line-color': '#00e5a0', 'line-width': 4, 'line-opacity': 0.9 },
      });
    }
    _rb.routePolyline = true;
  } else {
    // Only fallback segments — still need a route source for bounds
    _rb.map.addSource('rb-route', { type: 'geojson', data: { type: 'FeatureCollection', features: fallbackFeatures } });
    _rb.routePolyline = true;
  }

  // Dashed fallback lines for unroutable segments
  if (fallbackFeatures.length > 0) {
    _rb.map.addSource('rb-fallback', { type: 'geojson', data: { type: 'FeatureCollection', features: fallbackFeatures } });
    _rb.map.addLayer({
      id: 'rb-fallback', type: 'line', source: 'rb-fallback',
      paint: { 'line-color': '#888888', 'line-width': 3, 'line-opacity': 0.8 },
    });
  }

  // Direction arrows along route
  if (_rb.map.getSource('rb-route') && routedPoints.length > 1) {
    if (!_rb.map.hasImage('rb-arrow')) {
      const sz = 32, canvas = document.createElement('canvas');
      canvas.width = sz; canvas.height = sz;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, sz, sz);
      const cx = sz / 2, cy = sz / 2;
      // Clean minimal chevron — Apple style open stroke, no fill
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // Subtle shadow for depth
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(cx - 4, cy - 6);
      ctx.lineTo(cx + 4, cy);
      ctx.lineTo(cx - 4, cy + 6);
      ctx.stroke();
      _rb.map.addImage('rb-arrow', { width: sz, height: sz, data: ctx.getImageData(0, 0, sz, sz).data });
    }
    _rb.map.addLayer({
      id: 'rb-route-arrows', type: 'symbol', source: 'rb-route',
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 45,
        'icon-image': 'rb-arrow',
        'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.6, 11, 0.8, 14, 1.0, 18, 1.2],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-rotation-alignment': 'map',
      },
      paint: { 'icon-opacity': 0.9 },
    });
  }

  // Invisible wide hit-area layer for route scrubbing
  if (_rb.map.getSource('rb-route')) {
    _rb.map.addLayer({
      id: 'rb-route-hit', type: 'line', source: 'rb-route',
      paint: { 'line-color': 'transparent', 'line-width': 40 },
    });
  }

  if (_rb._poiEnabled && _rb._poiAlongRoute) {
    clearTimeout(_rb._poiDebounce);
    _rb._poiDebounce = setTimeout(_rbFetchPois, 800);
  }

  _rbUpdateFrameBtn();
}

/* ── Route scrub tooltip ── */
export function _rbInitRouteScrub() {
  if (!_rb.map || _rb._scrubBound) return;
  _rb._scrubBound = true;

  _rb._scrubMoveFn = function(e) {
    // Don't show scrub tooltip when hovering over a waypoint marker
    const hovered = e.originalEvent?.target?.closest?.('.rb-wp-icon');
    if (hovered) {
      if (_rb._scrubMarker) { _rb._scrubMarker.remove(); _rb._scrubMarker = null; }
      if (_rb._scrubDot) { _rb._scrubDot.remove(); _rb._scrubDot = null; }
      return;
    }
    const allPoints = [];
    for (const seg of _rb.routeSegments) {
      if (!seg.fallback) allPoints.push(...seg.points);
    }
    if (allPoints.length < 2) return;

    // Find closest point on route
    const cursor = [e.lngLat.lat, e.lngLat.lng];
    let minDist = Infinity, bestIdx = 0;
    for (let i = 0; i < allPoints.length; i++) {
      const d = (allPoints[i][0] - cursor[0]) ** 2 + (allPoints[i][1] - cursor[1]) ** 2;
      if (d < minDist) { minDist = d; bestIdx = i; }
    }

    // Cumulative distance up to that point
    let cumDist = 0;
    for (let i = 1; i <= bestIdx; i++) {
      cumDist += _rbHaversine(allPoints[i - 1], allPoints[i]);
    }

    // Total distance + estimated time
    let totalDist = 0, totalElev = 0;
    for (const seg of _rb.routeSegments) totalDist += seg.distance || 0;
    for (let i = 1; i < _rb.elevationData.length; i++) {
      const diff = _rb.elevationData[i].elev - _rb.elevationData[i - 1].elev;
      if (diff > 0) totalElev += diff;
    }
    const avgSpeed = Math.max(15, 25 - (totalElev / Math.max(1, totalDist / 1000)) * 2);
    const timeAtPoint = totalDist > 0 ? (cumDist / 1000) / avgSpeed * 3600 : 0;

    // Elevation at point
    let elev = null;
    if (_rb.elevationData.length > 0) {
      let closestElev = 0, minEd = Infinity;
      for (let i = 0; i < _rb.elevationData.length; i++) {
        const d = Math.abs(_rb.elevationData[i].dist - cumDist);
        if (d < minEd) { minEd = d; closestElev = i; }
      }
      elev = Math.round(_rb.elevationData[closestElev].elev);
    }

    const km = (cumDist / 1000).toFixed(1);
    const time = _rbFormatTime(timeAtPoint);
    const elevStr = elev !== null ? `${elev}m` : '';
    const pt = allPoints[bestIdx];

    if (!_rb._scrubMarker) {
      const el = document.createElement('div');
      el.className = 'rb-scrub-tooltip';
      _rb._scrubMarker = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -8] })
        .setLngLat([pt[1], pt[0]]).addTo(_rb.map);
    }
    if (!_rb._scrubDot) {
      const dot = document.createElement('div');
      dot.className = 'rb-scrub-dot';
      _rb._scrubDot = new maplibregl.Marker({ element: dot, anchor: 'center' })
        .setLngLat([pt[1], pt[0]]).addTo(_rb.map);
    }
    _rb._scrubMarker.setLngLat([pt[1], pt[0]]);
    _rb._scrubDot.setLngLat([pt[1], pt[0]]);
    const el = _rb._scrubMarker.getElement();
    el.innerHTML = `<div class="rb-scrub-content"><span class="rb-scrub-km">${km} km</span><span class="rb-scrub-sep">&middot;</span><span class="rb-scrub-time">${time}</span>${elevStr ? `<span class="rb-scrub-sep">&middot;</span><span class="rb-scrub-elev">${elevStr}</span>` : ''}</div>`;

    _rb.map.getCanvas().style.cursor = 'crosshair';

    // Sync vertical line on elevation chart
    _rbSyncElevCrosshair(cumDist);
  };

  _rb._scrubLeaveFn = function() {
    if (_rb._scrubMarker) { _rb._scrubMarker.remove(); _rb._scrubMarker = null; }
    if (_rb._scrubDot) { _rb._scrubDot.remove(); _rb._scrubDot = null; }
    _rb.map.getCanvas().style.cursor = '';
    _rbSyncElevCrosshair(null);
  };

  // Click on route line → insert waypoint between adjacent waypoints
  _rb._scrubClickFn = function(e) {
    if (_rb.routeSegments.length === 0) return;
    _rb._routeClicked = true; // prevent _rbOnMapClick from also firing

    const lat = e.lngLat.lat, lng = e.lngLat.lng;
    let bestSegIdx = 0, minDist = Infinity;
    for (let s = 0; s < _rb.routeSegments.length; s++) {
      const pts = _rb.routeSegments[s].points;
      for (const p of pts) {
        const d = (p[0] - lat) ** 2 + (p[1] - lng) ** 2;
        if (d < minDist) { minDist = d; bestSegIdx = s; }
      }
    }
    _rbInsertWaypoint(bestSegIdx, lat, lng);
  };

  _rb.map.on('mousemove', 'rb-route-hit', _rb._scrubMoveFn);
  _rb.map.on('mouseleave', 'rb-route-hit', _rb._scrubLeaveFn);
  _rb.map.on('click', 'rb-route-hit', _rb._scrubClickFn);
}

/* ── Route bounds helper ── */
export function _rbGetRouteBounds() {
  const allPoints = [];
  for (const seg of _rb.routeSegments) allPoints.push(...seg.points);
  if (allPoints.length === 0) return null;
  const lngs = allPoints.map(p => p[1]);
  const lats = allPoints.map(p => p[0]);
  return new maplibregl.LngLatBounds(
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)]
  );
}

/* ── Frame route ── */
export function _rbFrameRoute() {
  const bounds = _rbGetRouteBounds();
  if (!bounds) return;
  const panel = document.getElementById('rbSidePanel');
  const panelW = panel && panel.offsetWidth ? panel.offsetWidth + 40 : 60;
  _rb.map.fitBounds(bounds, { padding: { top: 60, bottom: 60, left: 60, right: panelW } });
}

export function _rbUpdateFrameBtn() {
  const btn = document.getElementById('rbFrameBtn');
  if (!btn) return;
  const hasRoute = _rb.routeSegments.length > 0 && _rb.routeSegments.some(s => s.points.length > 1);
  btn.classList.toggle('rb-tool-disabled', !hasRoute);
}

/* ── Haversine ── */
/* ── Route Midpoint by Distance ── */
export function _rbRouteMidpoint() {
  const allPoints = [];
  for (const seg of _rb.routeSegments) allPoints.push(...seg.points);
  if (allPoints.length < 2) return null;
  let totalDist = 0;
  for (let i = 1; i < allPoints.length; i++) totalDist += _rbHaversine(allPoints[i - 1], allPoints[i]);
  if (totalDist === 0) return null;
  const half = totalDist / 2;
  let cum = 0;
  for (let i = 1; i < allPoints.length; i++) {
    const d = _rbHaversine(allPoints[i - 1], allPoints[i]);
    if (cum + d >= half) {
      const r = (half - cum) / d;
      return [allPoints[i - 1][0] + (allPoints[i][0] - allPoints[i - 1][0]) * r,
              allPoints[i - 1][1] + (allPoints[i][1] - allPoints[i - 1][1]) * r];
    }
    cum += d;
  }
  return allPoints[allPoints.length - 1];
}

/* ── Elevation ── */
const _RB_ELEV_API = 'https://api.open-elevation.com/api/v1/lookup';
let _rbElevTimer = null;

export function _rbFetchElevation() {
  clearTimeout(_rbElevTimer);
  _rbElevTimer = setTimeout(_rbDoFetchElevation, 600);
}

export async function _rbDoFetchElevation() {
  const allPoints = [];
  for (const seg of _rb.routeSegments) allPoints.push(...seg.points);
  if (allPoints.length === 0) { _rb.elevationData = []; _rbRenderElevChart(); return; }

  const step = Math.max(1, Math.floor(allPoints.length / 200));
  const sampled = allPoints.filter((_, i) => i % step === 0 || i === allPoints.length - 1);
  const locations = sampled.map(p => ({ latitude: p[0], longitude: p[1] }));

  try {
    const resp = await fetch(_RB_ELEV_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations }),
    });
    const data = await resp.json();
    if (!data.results) return;

    _rb.elevationData = [];
    let cumDist = 0;
    for (let i = 0; i < data.results.length; i++) {
      if (i > 0) cumDist += _rbHaversine(sampled[i - 1], sampled[i]);
      const elev = data.results[i].elevation;
      const prevElev = i > 0 ? _rb.elevationData[i - 1].elev : elev;
      const segDist = i > 0 ? _rbHaversine(sampled[i - 1], sampled[i]) : 1;
      const grade = i > 0 ? ((elev - prevElev) / segDist) * 100 : 0;
      _rb.elevationData.push({ dist: cumDist, elev, grade, lat: sampled[i][0], lng: sampled[i][1] });
    }
    _rbRenderElevChart();
    _rbUpdateStats();
  } catch (e) {
    console.warn('[RB] Elevation fetch failed:', e);
  }
}

/* ── Elevation Chart ── */
export function _rbRenderElevChart() {
  const canvas = document.getElementById('rbElevCanvas');
  if (!canvas) return;

  _rb.elevChart = destroyChart(_rb.elevChart);
  state._rbElevChart = null;

  if (_rb.elevationData.length < 2) return;

  const labels = _rb.elevationData.map(d => (d.dist / 1000).toFixed(1));
  const elevs = _rb.elevationData.map(d => d.elev);
  const grades = _rb.elevationData.map(d => d.grade);

  const colors = grades.map(g => {
    const ag = Math.abs(g);
    if (ag < 3) return 'rgba(0,229,160,0.6)';
    if (ag < 6) return 'rgba(240,196,41,0.6)';
    if (ag < 10) return 'rgba(255,107,53,0.6)';
    return 'rgba(255,71,87,0.6)';
  });
  const hoverColors = grades.map(g => {
    const ag = Math.abs(g);
    if (ag < 3) return '#00e5a0';
    if (ag < 6) return '#f0c429';
    if (ag < 10) return '#ff6b35';
    return '#ff4757';
  });

  _rb._elevCrosshairIdx = null;
  _rb.elevChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    plugins: [_rbElevCrosshairPlugin],
    data: {
      labels,
      datasets: [{
        data: elevs,
        backgroundColor: colors,
        hoverBackgroundColor: hoverColors,
        borderWidth: 0,
        barPercentage: 1.0,
        categoryPercentage: 1.0,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      onHover: (event, elements) => { _rbSyncElevMarker(elements); },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: items => `${items[0].label} km`,
            label: item => {
              const g = grades[item.dataIndex];
              return [`${Math.round(item.raw)}m elevation`, `${g > 0 ? '+' : ''}${g.toFixed(1)}% grade`];
            }
          },
          ...window.C_TOOLTIP,
        }
      },
      scales: {
        x: { ticks: { ...window.C_TICK, maxTicksLimit: 10, callback: (v, i) => labels[i] + ' km' }, grid: { display: false }, border: { display: false } },
        y: { ticks: { ...window.C_TICK, callback: v => v + 'm' }, grid: window.C_GRID, border: { display: false } }
      }
    }
  });
  state._rbElevChart = _rb.elevChart;
}

/* ── Elevation-Map Sync ── */
export function _rbSyncElevMarker(elements) {
  if (_rb.elevMarker) { _rb.elevMarker.remove(); _rb.elevMarker = null; }
  if (!elements?.length) return;
  const idx = elements[0].index;
  const pt = _rb.elevationData[idx];
  if (!pt) return;
  const el = document.createElement('div');
  el.style.cssText = 'width:12px;height:12px;border-radius:50%;background:#00e5a0;border:2px solid #00e5a0;box-shadow:0 0 6px rgba(0,229,160,0.5);';
  _rb.elevMarker = new maplibregl.Marker({ element: el, anchor: 'center' })
    .setLngLat([pt.lng, pt.lat])
    .addTo(_rb.map);
}

/* ── Map→Chart crosshair sync ── */
export function _rbSyncElevCrosshair(cumDist) {
  if (!_rb.elevChart) return;
  if (cumDist === null) {
    _rb._elevCrosshairIdx = null;
    _rb.elevChart.update('none');
    return;
  }
  // Find closest elevation data index by distance
  let bestIdx = 0, minD = Infinity;
  for (let i = 0; i < _rb.elevationData.length; i++) {
    const d = Math.abs(_rb.elevationData[i].dist - cumDist);
    if (d < minD) { minD = d; bestIdx = i; }
  }
  _rb._elevCrosshairIdx = bestIdx;
  _rb.elevChart.update('none');
}

const _rbElevCrosshairPlugin = {
  id: 'rbElevCrosshair',
  afterDraw(chart) {
    const idx = _rb._elevCrosshairIdx;
    if (idx == null) return;
    const meta = chart.getDatasetMeta(0);
    if (!meta || !meta.data[idx]) return;
    const x = meta.data[idx].x;
    const { top, bottom } = chart.chartArea;
    const ctx = chart.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    // Small dot at the bar top
    const y = meta.data[idx].y;
    ctx.beginPath();
    ctx.setLineDash([]);
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#00e5a0';
    ctx.fill();
    ctx.restore();
  }
};

/* ── Elevation Panel Toggle ── */
export function rbToggleElevPanel() {
  const panel = document.getElementById('rbElevPanel');
  if (panel) panel.classList.toggle('collapsed');
}

export function rbToggleSidePanel() {
  const panel = document.getElementById('rbSidePanel');
  if (panel) panel.classList.toggle('rb-panel-open');
}

/* ── Undo / Redo ── */
export function _rbPushHistory() {
  _rb.history = _rb.history.slice(0, _rb.historyIdx + 1);
  _rb.history.push({
    waypoints: _rb.waypoints.map(w => ({ lat: w.lat, lng: w.lng })),
    segments: JSON.parse(JSON.stringify(_rb.routeSegments)),
    elevation: JSON.parse(JSON.stringify(_rb.elevationData)),
  });
  _rb.historyIdx = _rb.history.length - 1;
  _rbUpdateUndoRedoBtns();
}

export function rbUndo() {
  if (_rb.historyIdx <= 0) return;
  _rb.historyIdx--;
  _rbRestoreHistory(_rb.history[_rb.historyIdx]);
}

export function rbRedo() {
  if (_rb.historyIdx >= _rb.history.length - 1) return;
  _rb.historyIdx++;
  _rbRestoreHistory(_rb.history[_rb.historyIdx]);
}

export function _rbRestoreHistory(snapshot) {
  _rbCloseWpPopup();
  _rb.waypoints.forEach(w => w.marker && w.marker.remove());
  _rb.waypoints = snapshot.waypoints.map((w, i) => {
    const marker = _rbCreateWaypointMarker(w.lat, w.lng, i);
    marker.on('dragend', () => _rbOnWaypointDrag(i));
    return { ...w, marker };
  });
  _rbRefreshAllWaypointIcons();
  _rb.routeSegments = JSON.parse(JSON.stringify(snapshot.segments));
  _rb.elevationData = snapshot.elevation ? JSON.parse(JSON.stringify(snapshot.elevation)) : [];
  _rbRedrawRoute();
  _rbRenderElevChart();
  _rbUpdateStats();
  _rbUpdateWaypointList();
  _rbUpdateUndoRedoBtns();
}

export function _rbUpdateUndoRedoBtns() {
  const undo = document.getElementById('rbUndoBtn');
  const redo = document.getElementById('rbRedoBtn');
  if (undo) undo.disabled = _rb.historyIdx <= 0;
  if (redo) redo.disabled = _rb.historyIdx >= _rb.history.length - 1;
}

/* ── Keyboard Shortcuts ── */
export function _rbInitKeyboard() {
  document.addEventListener('keydown', _rbOnKeydown);
}
export function _rbOnKeydown(e) {
  if (state.currentPage !== 'routes') return;
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); rbUndo(); }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); rbRedo(); }
}

/* ── POI Search ── */
let _rbSearchTimer = null;

export function _rbInitSearch() {
  const input = document.getElementById('rbSearchInput');
  if (!input) return;
  input.addEventListener('input', () => {
    clearTimeout(_rbSearchTimer);
    _rbSearchTimer = setTimeout(() => _rbDoSearch(input.value.trim()), 400);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') _rbClearSearch();
  });
}

export async function _rbDoSearch(query) {
  const results = document.getElementById('rbSearchResults');
  if (!query || query.length < 3) { if (results) { results.innerHTML = ''; results.style.display = 'none'; } return; }

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`;
    const resp = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    const data = await resp.json();

    if (!results) return;
    results.innerHTML = data.map(r => {
      const name = r.display_name.split(',').slice(0, 2).join(',');
      const sub = r.display_name.split(',').slice(2, 4).join(',');
      return `<div class="rb-search-item" data-lat="${r.lat}" data-lon="${r.lon}">
        <span class="rb-search-name">${name}</span>
        <span class="rb-search-sub">${sub}</span>
      </div>`;
    }).join('');
    results.style.display = data.length ? 'block' : 'none';

    results.querySelectorAll('.rb-search-item').forEach(el => {
      el.addEventListener('click', () => {
        const lat = parseFloat(el.dataset.lat);
        const lon = parseFloat(el.dataset.lon);
        _rb.map.jumpTo({ center: [lon, lat], zoom: 14 });
        _rbClearSearch();
      });
    });
  } catch (e) {
    console.warn('[RB] Search failed:', e);
  }
}

export function _rbClearSearch() {
  const input = document.getElementById('rbSearchInput');
  const results = document.getElementById('rbSearchResults');
  if (input) input.value = '';
  if (results) { results.innerHTML = ''; results.style.display = 'none'; }
}

/* ── GPX Export ── */
export function rbExportGPX() {
  if (_rb.routeSegments.length === 0) { showToast('No route to export', 'error'); return; }

  const allPoints = [];
  for (const seg of _rb.routeSegments) allPoints.push(...seg.points);

  let gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="CycleIQ Route Builder" xmlns="http://www.topografix.com/GPX/1/1">\n  <trk>\n    <name>CycleIQ Route</name>\n    <trkseg>\n`;

  for (let i = 0; i < allPoints.length; i++) {
    const [lat, lng] = allPoints[i];
    const elevPt = _rb.elevationData.length > 0 ? _rb.elevationData.reduce((closest, d) => {
      const dist = Math.abs(d.lat - lat) + Math.abs(d.lng - lng);
      return dist < closest.dist ? { dist, elev: d.elev } : closest;
    }, { dist: Infinity, elev: null }) : { elev: null };
    gpx += `      <trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}">${elevPt.elev != null ? `<ele>${Math.round(elevPt.elev)}</ele>` : ''}</trkpt>\n`;
  }

  gpx += `    </trkseg>\n  </trk>\n</gpx>`;

  const blob = new Blob([gpx], { type: 'application/gpx+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `route-${new Date().toISOString().slice(0, 10)}.gpx`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('GPX exported', 'success');
  _rbShowExportHelper('gpx');
}

/* ── FIT Course Export (Garmin) ── */
export function rbExportFIT() {
  if (_rb.routeSegments.length === 0) { showToast('No route to export', 'error'); return; }

  const allPoints = [];
  for (const seg of _rb.routeSegments) allPoints.push(...seg.points);

  // Sample to max ~500 points
  const step = Math.max(1, Math.floor(allPoints.length / 500));
  const pts = allPoints.filter((_, i) => i % step === 0 || i === allPoints.length - 1);

  const fitData = _rbBuildFIT(pts);
  const blob = new Blob([fitData], { type: 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `route-${new Date().toISOString().slice(0, 10)}.fit`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('FIT course exported', 'success');
  _rbShowExportHelper('fit');
}

/* ── Export Helper Dialog ── */
const _rbExportDevices = {
  garmin_fit: {
    label: 'Garmin',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
    formats: ['fit'],
    steps: [
      '<b>Option A — Garmin Connect (wireless):</b>',
      '1. Go to <b>connect.garmin.com</b> &rarr; Training &rarr; Courses',
      '2. Click <b>Import</b> and select the .fit file',
      '3. Save the course &mdash; it will sync to your device automatically',
      '<b>Option B — USB:</b>',
      '1. Connect your Garmin via USB',
      '2. Copy the .fit file to <b>Garmin/NewFiles/</b>',
      '3. Safely eject &mdash; the course appears under Courses on your device'
    ]
  },
  garmin_gpx: {
    label: 'Garmin',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
    formats: ['gpx'],
    steps: [
      '<b>Option A — Garmin Connect:</b>',
      '1. Go to <b>connect.garmin.com</b> &rarr; Training &rarr; Courses',
      '2. Click <b>Import</b> and select the .gpx file',
      '3. Save &mdash; it syncs to your device wirelessly',
      '<b>Option B — USB:</b>',
      '1. Connect your Garmin via USB',
      '2. Copy the .gpx file to <b>Garmin/NewFiles/</b>',
      '3. Safely eject and check Courses on your device',
      '<span style="color:var(--text-muted);font-size:12px">Tip: FIT format is recommended for Garmin for best compatibility</span>'
    ]
  },
  wahoo: {
    label: 'Wahoo',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    formats: ['fit', 'gpx'],
    steps: [
      '<b>Option A — ELEMNT Companion App:</b>',
      '1. Open the <b>ELEMNT</b> app on your phone',
      '2. Tap <b>Routes</b> &rarr; the <b>+</b> button',
      '3. Select <b>Import file</b> and choose the downloaded file',
      '4. The route syncs to your Wahoo ELEMNT/BOLT/ROAM wirelessly',
      '<b>Option B — USB (BOLT v1 / ELEMNT):</b>',
      '1. Connect via USB, copy file to the device root',
      '2. Safely eject &mdash; route appears under Saved Routes'
    ]
  },
  hammerhead: {
    label: 'Hammerhead',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12" y2="18"/></svg>',
    formats: ['fit', 'gpx'],
    steps: [
      '<b>Hammerhead Dashboard:</b>',
      '1. Go to <b>dashboard.hammerhead.io</b>',
      '2. Navigate to <b>Routes</b> &rarr; <b>Upload</b>',
      '3. Select your file and save',
      '4. Sync your Karoo &mdash; the route appears in navigation'
    ]
  },
  other: {
    label: 'Other',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="12" cy="12" r="3"/><path d="M12 1v4m0 14v4m-8.66-14.5l3.46 2m10.4 6l3.46 2m-17.32 0l3.46-2m10.4-6l3.46-2"/></svg>',
    formats: ['fit', 'gpx'],
    steps: [
      'Most cycling computers accept .fit or .gpx files:',
      '1. Check your device brand\'s companion app or web dashboard for a <b>Route Import</b> option',
      '2. Upload the downloaded file',
      '3. Sync your device &mdash; the course should appear in navigation',
      '<b>USB fallback:</b> connect the device and copy the file to its storage &mdash; check your device\'s manual for the correct folder'
    ]
  }
};

export function _rbShowExportHelper(format) {
  const modal = document.getElementById('exportHelperModal');
  const tabsEl = document.getElementById('exportHelperTabs');
  const stepsEl = document.getElementById('exportHelperSteps');
  if (!modal || !tabsEl || !stepsEl) return;

  // Filter devices that support this format
  const devices = Object.entries(_rbExportDevices).filter(([key, d]) => {
    if (format === 'fit' && key === 'garmin_gpx') return false;
    if (format === 'gpx' && key === 'garmin_fit') return false;
    return d.formats.includes(format);
  });

  // Render tabs
  tabsEl.innerHTML = devices.map(([key, d], i) =>
    `<button class="rb-export-tab${i === 0 ? ' active' : ''}" data-device="${key}" onclick="_rbSwitchExportTab('${key}')">${d.icon}<span>${d.label}</span></button>`
  ).join('');

  // Show first device
  _rbRenderExportSteps(devices[0][1].steps, stepsEl);

  const desc = document.getElementById('exportHelperDesc');
  if (desc) desc.textContent = `Your .${format} file has been downloaded. Follow the steps below to load it on your device.`;

  modal.showModal();
}

export function _rbSwitchExportTab(deviceKey) {
  const tabsEl = document.getElementById('exportHelperTabs');
  const stepsEl = document.getElementById('exportHelperSteps');
  if (!tabsEl || !stepsEl) return;

  tabsEl.querySelectorAll('.rb-export-tab').forEach(t => t.classList.toggle('active', t.dataset.device === deviceKey));

  const device = _rbExportDevices[deviceKey];
  if (device) _rbRenderExportSteps(device.steps, stepsEl);
}

export function _rbRenderExportSteps(steps, container) {
  container.innerHTML = `<div class="rb-export-step-list">${steps.map(s => `<div class="rb-export-step">${s}</div>`).join('')}</div>`;
}

export function closeExportHelper() {
  const modal = document.getElementById('exportHelperModal');
  if (modal?.open) modal.close();
}

export function _rbBuildFIT(points) {
  let cap = 65536, buf = new Uint8Array(cap), pos = 0;

  function ensure(n) { while (pos + n > cap) { cap *= 2; const nb = new Uint8Array(cap); nb.set(buf); buf = nb; } }
  function u8(v)  { ensure(1); buf[pos++] = v & 0xFF; }
  function u16(v) { ensure(2); buf[pos] = v & 0xFF; buf[pos + 1] = (v >> 8) & 0xFF; pos += 2; }
  function u32(v) { ensure(4); const uv = v >>> 0; buf[pos] = uv & 0xFF; buf[pos+1] = (uv >>> 8) & 0xFF; buf[pos+2] = (uv >>> 16) & 0xFF; buf[pos+3] = (uv >>> 24) & 0xFF; pos += 4; }
  function s32(v) { ensure(4); const iv = v | 0; buf[pos] = iv & 0xFF; buf[pos+1] = (iv >> 8) & 0xFF; buf[pos+2] = (iv >> 16) & 0xFF; buf[pos+3] = (iv >> 24) & 0xFF; pos += 4; }
  function str(s, len) { ensure(len); for (let i = 0; i < len; i++) buf[pos++] = i < s.length ? s.charCodeAt(i) & 0x7F : 0; }

  // FIT epoch: 1989-12-31T00:00:00Z
  const FIT_EPOCH = 631065600;
  const now = Math.floor(Date.now() / 1000) - FIT_EPOCH;
  const toSC = (deg) => Math.round(deg * (Math.pow(2, 31) / 180));
  const toAlt = (m) => Math.max(0, Math.round((m + 500) * 5));
  const toDist = (m) => Math.round(m * 100);

  // CRC16 (FIT standard nibble-based)
  const CT = [0x0000,0xCC01,0xD801,0x1400,0xF001,0x3C00,0x2800,0xE401,0xA001,0x6C00,0x7800,0xB401,0x5000,0x9C01,0x8801,0x4400];
  function crc16(d, s, e) {
    let c = 0;
    for (let i = s; i < e; i++) {
      let t = CT[c & 0xF]; c = (c >> 4) & 0x0FFF; c = c ^ t ^ CT[d[i] & 0xF];
      t = CT[c & 0xF]; c = (c >> 4) & 0x0FFF; c = c ^ t ^ CT[(d[i] >> 4) & 0xF];
    }
    return c;
  }

  // Definition message writer
  function writeDef(local, global, fields) {
    u8(0x40 | (local & 0xF));
    u8(0x00); // reserved
    u8(0x00); // little-endian
    u16(global);
    u8(fields.length);
    for (const [fnum, fsize, ftype] of fields) { u8(fnum); u8(fsize); u8(ftype); }
  }

  // ── File Header (14 bytes) ──
  u8(14); u8(0x20); u16(2132); u32(0); str('.FIT', 4); u16(0);
  const dataStart = pos;

  // ── file_id (mesg 0, local 0) ──
  writeDef(0, 0, [[0,1,0x00],[1,2,0x84],[2,2,0x84],[3,4,0x8C],[4,4,0x86]]);
  u8(0x00); u8(6); u16(255); u16(0); u32(12345); u32(now);

  // ── course (mesg 31, local 1) ──
  writeDef(1, 31, [[5,16,0x07],[4,1,0x00]]);
  u8(0x01); str('CycleIQ Route', 16); u8(2); // sport=cycling

  // ── event: timer start (mesg 21, local 2) ──
  writeDef(2, 21, [[253,4,0x86],[0,1,0x00],[1,1,0x00]]);
  u8(0x02); u32(now); u8(0); u8(0); // event=timer, type=start

  // ── record definition (mesg 20, local 3) ──
  writeDef(3, 20, [[253,4,0x86],[0,4,0x85],[1,4,0x85],[2,2,0x84],[5,4,0x86]]);

  // Build cumulative distances
  let cumDist = 0;
  const dists = [0];
  for (let i = 1; i < points.length; i++) {
    cumDist += _rbHaversine(points[i - 1], points[i]);
    dists.push(cumDist);
  }

  // Find closest elevation for a point
  function findElev(lat, lng) {
    if (_rb.elevationData.length === 0) return 0;
    let best = _rb.elevationData[0], bestD = Infinity;
    for (const d of _rb.elevationData) {
      const dd = Math.abs(d.lat - lat) + Math.abs(d.lng - lng);
      if (dd < bestD) { bestD = dd; best = d; }
    }
    return best.elev || 0;
  }

  // ── record data × N ──
  for (let i = 0; i < points.length; i++) {
    const [lat, lng] = points[i];
    u8(0x03);
    u32(now + i);
    s32(toSC(lat));
    s32(toSC(lng));
    u16(toAlt(findElev(lat, lng)));
    u32(toDist(dists[i]));
  }

  // ── course_point definition (mesg 32, local 4) ──
  writeDef(4, 32, [[254,2,0x84],[1,4,0x86],[2,4,0x85],[3,4,0x85],[4,4,0x86],[5,1,0x00],[6,16,0x07]]);

  // ── course_point data × waypoints ──
  _rb.waypoints.forEach((wp, i) => {
    let wpDist = 0, bestD = Infinity;
    for (let j = 0; j < points.length; j++) {
      const dd = Math.abs(points[j][0] - wp.lat) + Math.abs(points[j][1] - wp.lng);
      if (dd < bestD) { bestD = dd; wpDist = dists[j]; }
    }
    u8(0x04);
    u16(i);
    u32(now + i);
    s32(toSC(wp.lat));
    s32(toSC(wp.lng));
    u32(toDist(wpDist));
    u8(0); // type=generic
    str(i === 0 ? 'Start' : (i === _rb.waypoints.length - 1 ? 'Finish' : 'WP ' + (i + 1)), 16);
  });

  // ── event: timer stop (reuse local 2) ──
  u8(0x02); u32(now + points.length); u8(0); u8(4); // event=timer, type=stop_all

  // ── lap (mesg 19, local 5) ──
  let elevGain = 0, elevLoss = 0;
  for (let i = 1; i < _rb.elevationData.length; i++) {
    const diff = _rb.elevationData[i].elev - _rb.elevationData[i - 1].elev;
    if (diff > 0) elevGain += diff; else elevLoss += Math.abs(diff);
  }
  writeDef(5, 19, [[254,2,0x84],[253,4,0x86],[0,1,0x00],[1,1,0x00],[2,4,0x86],[3,4,0x85],[4,4,0x85],[5,4,0x85],[6,4,0x85],[7,4,0x86],[8,4,0x86],[9,4,0x86],[13,2,0x84],[14,2,0x84]]);
  const fp = points[0], lp = points[points.length - 1];
  const elapsed = points.length * 1000; // ms
  u8(0x05);
  u16(0); u32(now + points.length); u8(9); u8(1); // event=lap, type=stop
  u32(now);
  s32(toSC(fp[0])); s32(toSC(fp[1]));
  s32(toSC(lp[0])); s32(toSC(lp[1]));
  u32(elapsed); u32(elapsed);
  u32(toDist(dists[dists.length - 1]));
  u16(Math.round(elevGain)); u16(Math.round(elevLoss));

  // ── Finalize: data size, CRCs ──
  const dataSize = pos - dataStart;
  buf[4] = dataSize & 0xFF; buf[5] = (dataSize >> 8) & 0xFF;
  buf[6] = (dataSize >> 16) & 0xFF; buf[7] = (dataSize >> 24) & 0xFF;
  const hCrc = crc16(buf, 0, 12);
  buf[12] = hCrc & 0xFF; buf[13] = (hCrc >> 8) & 0xFF;
  const fCrc = crc16(buf, 0, pos);
  u16(fCrc);

  return buf.slice(0, pos);
}

/* ── GPX Import ── */
export function rbImportGPX() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.gpx';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    _rbParseGPX(text);
  };
  input.click();
}

export function _rbParseGPX(text) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'application/xml');
  const trkpts = doc.querySelectorAll('trkpt');
  if (trkpts.length === 0) { showToast('No track points found in GPX', 'error'); return; }

  rbClear();

  const points = Array.from(trkpts).map(pt => ({
    lat: parseFloat(pt.getAttribute('lat')),
    lng: parseFloat(pt.getAttribute('lon')),
    elev: pt.querySelector('ele') ? parseFloat(pt.querySelector('ele').textContent) : null,
  }));

  const step = Math.max(1, Math.floor(points.length / 10));
  const wpIndices = [0];
  for (let i = step; i < points.length - 1; i += step) wpIndices.push(i);
  if (wpIndices[wpIndices.length - 1] !== points.length - 1) wpIndices.push(points.length - 1);

  for (const wi of wpIndices) {
    const pt = points[wi];
    const marker = _rbCreateWaypointMarker(pt.lat, pt.lng, _rb.waypoints.length);
    const wpIdx = _rb.waypoints.length;
    marker.on('dragend', () => _rbOnWaypointDrag(wpIdx));
    _rb.waypoints.push({ lat: pt.lat, lng: pt.lng, marker });
  }
  _rbRefreshAllWaypointIcons();

  for (let i = 0; i < wpIndices.length - 1; i++) {
    const start = wpIndices[i];
    const end = wpIndices[i + 1];
    const segPoints = points.slice(start, end + 1).map(p => [p.lat, p.lng]);
    let segDist = 0;
    for (let j = 1; j < segPoints.length; j++) segDist += _rbHaversine(segPoints[j - 1], segPoints[j]);
    _rb.routeSegments.push({ points: segPoints, distance: segDist, duration: 0, annotations: null });
  }

  _rbRedrawRoute();

  if (points[0].elev != null) {
    let cumDist = 0;
    _rb.elevationData = points.map((p, i) => {
      if (i > 0) cumDist += _rbHaversine([points[i - 1].lat, points[i - 1].lng], [p.lat, p.lng]);
      const grade = i > 0 ? ((p.elev - points[i - 1].elev) / Math.max(1, _rbHaversine([points[i - 1].lat, points[i - 1].lng], [p.lat, p.lng]))) * 100 : 0;
      return { dist: cumDist, elev: p.elev, grade, lat: p.lat, lng: p.lng };
    });
    _rbRenderElevChart();
  } else {
    _rbFetchElevation();
  }

  const bounds = _rbGetRouteBounds();
  if (bounds) _rb.map.fitBounds(bounds, { padding: 40 });

  _rbPushHistory();
  _rbUpdateStats();
  _rbUpdateWaypointList();
  showToast(`Imported ${points.length} points from GPX`, 'success');
}

/* ── Stats ── */
export function _rbUpdateStats() {
  let totalDist = 0, totalDur = 0;
  for (const seg of _rb.routeSegments) {
    totalDist += seg.distance || 0;
    totalDur += seg.duration || 0;
  }

  let elevGain = 0, elevLoss = 0, totalGrade = 0, gradeCount = 0;
  for (let i = 1; i < _rb.elevationData.length; i++) {
    const diff = _rb.elevationData[i].elev - _rb.elevationData[i - 1].elev;
    if (diff > 0) elevGain += diff;
    else elevLoss += Math.abs(diff);
    totalGrade += Math.abs(_rb.elevationData[i].grade);
    gradeCount++;
  }

  const avgSpeedKmh = Math.max(15, 25 - (elevGain / Math.max(1, totalDist / 1000)) * 2);
  const estTimeSec = totalDist > 0 ? (totalDist / 1000) / avgSpeedKmh * 3600 : 0;

  const el = (id) => document.getElementById(id);
  if (el('rbStatDist'))    el('rbStatDist').textContent = (totalDist / 1000).toFixed(1);
  if (el('rbStatElev'))    el('rbStatElev').textContent = Math.round(elevGain);
  if (el('rbStatLoss'))    el('rbStatLoss').textContent = Math.round(elevLoss);
  if (el('rbStatTime'))    el('rbStatTime').textContent = _rbFormatTime(estTimeSec);
  if (el('rbStatGrade'))   el('rbStatGrade').textContent = gradeCount ? (totalGrade / gradeCount).toFixed(1) : '0.0';
  if (el('rbStatSurface')) el('rbStatSurface').textContent = _rbDetectSurfaces() || '\u2014';
  if (el('rbWpCount'))     el('rbWpCount').textContent = `${_rb.waypoints.length} points`;
  _rbUpdateTimeLabel(estTimeSec);
}

export function _rbUpdateTimeLabel(estTimeSec) {
  if (_rb._timeLabel) { _rb._timeLabel.remove(); _rb._timeLabel = null; }
  if (_rb.routeSegments.length === 0 || estTimeSec <= 0) return;
  let pos = _rbRouteMidpoint();
  if (!pos) return;
  // Shift position if too close to any waypoint
  const minGap = 0.003; // ~300m in degrees
  const tooClose = () => _rb.waypoints.some(w =>
    Math.abs(w.lat - pos[0]) < minGap && Math.abs(w.lng - pos[1]) < minGap
  );
  if (tooClose()) {
    // Walk along route to find a spot away from all waypoints
    const allPts = [];
    for (const seg of _rb.routeSegments) allPts.push(...seg.points);
    if (allPts.length > 4) {
      const step = Math.max(1, Math.floor(allPts.length / 20));
      for (let offset = step; offset < allPts.length / 2; offset += step) {
        const mid = Math.floor(allPts.length / 2);
        // Try ahead and behind the midpoint
        for (const idx of [mid + offset, mid - offset]) {
          if (idx >= 0 && idx < allPts.length) {
            pos = allPts[idx];
            if (!tooClose()) break;
          }
        }
        if (!tooClose()) break;
      }
    }
  }
  const el = document.createElement('div');
  el.className = 'rb-time-label-icon';
  el.innerHTML = `<div class="rb-time-sign"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><span>${_rbFormatTime(estTimeSec)}</span></div><div class="rb-time-sign-tail"></div>`;
  _rb._timeLabel = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, 0] })
    .setLngLat([pos[1], pos[0]])
    .addTo(_rb.map);
}

export function _rbFormatTime(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}` : `0:${String(m).padStart(2, '0')}`;
}

export function _rbDetectSurfaces() {
  let paved = 0, mixed = 0, offroad = 0;
  for (const seg of _rb.routeSegments) {
    if (!seg.annotations?.speed) continue;
    for (const speed of seg.annotations.speed) {
      if (speed >= 5) paved++;
      else if (speed >= 2.5) mixed++;
      else offroad++;
    }
  }
  const total = paved + mixed + offroad;
  if (total === 0) return null;
  if (mixed === 0 && offroad === 0) return 'Paved';
  if (paved === 0 && mixed === 0) return 'Off-road';
  return `${Math.round(paved / total * 100)}/${Math.round(mixed / total * 100)}/${Math.round(offroad / total * 100)}%`;
}

/* ── Surface Coloring ── */
const _rbSurfaceColors = { paved: '#00e5a0', mixed: '#ffb74d', offroad: '#c4813d' };

export function _rbClassifySpeed(speed) {
  if (speed >= 5) return 'paved';
  if (speed >= 2.5) return 'mixed';
  return 'offroad';
}

export function _rbGroupBySurface() {
  const groups = [];
  for (const seg of _rb.routeSegments) {
    if (!seg.annotations?.speed || seg.annotations.speed.length === 0) {
      groups.push({ points: [...seg.points], type: 'paved', color: _rbSurfaceColors.paved });
      continue;
    }
    const speeds = seg.annotations.speed;
    let curType = _rbClassifySpeed(speeds[0]);
    let curPts = [seg.points[0]];
    for (let i = 0; i < speeds.length; i++) {
      const t = _rbClassifySpeed(speeds[i]);
      if (t !== curType) {
        curPts.push(seg.points[i]);
        groups.push({ points: curPts, type: curType, color: _rbSurfaceColors[curType] });
        curType = t;
        curPts = [seg.points[i]];
      }
      curPts.push(seg.points[i + 1]);
    }
    if (curPts.length >= 2) groups.push({ points: curPts, type: curType, color: _rbSurfaceColors[curType] });
  }
  return groups;
}

export function _rbToggleFullscreen() {
  const isFs = document.body.classList.toggle('rb-fullscreen');
  const btn = document.getElementById('rbFullscreenBtn');
  if (btn) {
    btn.querySelector('svg').innerHTML = isFs
      ? '<polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/>'
      : '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>';
  }
  // Resize map after transition
  setTimeout(() => { if (_rb.map) _rb.map.resize(); }, 350);
}

export function _rbToggleSurfaceMode() {
  _rb._surfaceMode = !_rb._surfaceMode;
  _rbRedrawRoute();
  _rbUpdateSurfaceLegend();
  const btn = document.getElementById('rbSurfaceToggleBtn');
  if (btn) btn.classList.toggle('active', _rb._surfaceMode);
  showToast(_rb._surfaceMode ? 'Surface view on' : 'Surface view off', 'info');
}

/* ── Road Safety overlay toggle ── */
export function _rbToggleRoadSafety() {
  if (!_rb.map) return;
  const isSat = _rbMapLayerKeys[_rbLayerIdx] === 'satellite';
  if (isSat) return; // no vector source in satellite mode
  _rb._roadSafetyOn = !_rb._roadSafetyOn;
  setRoadSafetyEnabled(_rb._roadSafetyOn);
  if (_rb._roadSafetyOn) { _addRoadSafetyLayer(_rb.map); } else { _removeRoadSafetyLayer(_rb.map); }
  const btn = document.getElementById('rbRoadSafetyBtn');
  if (btn) btn.classList.toggle('active', _rb._roadSafetyOn);
  showToast(_rb._roadSafetyOn ? 'Road safety on' : 'Road safety off', 'info');
}

/* ── CyclOSM overlay toggle ── */
export function _rbToggleCyclOSM() {
  if (!_rb.map) return;
  _rb._cyclOSMOn = !_rb._cyclOSMOn;
  setCyclOSMEnabled(_rb._cyclOSMOn);
  if (_rb._cyclOSMOn) { _addCyclOSMLayer(_rb.map); } else { _removeCyclOSMLayer(_rb.map); }
  const btn = document.getElementById('rbCyclOSMBtn');
  if (btn) btn.classList.toggle('active', _rb._cyclOSMOn);
  showToast(_rb._cyclOSMOn ? 'CyclOSM overlay on' : 'CyclOSM overlay off', 'info');
}

/* ── 3D Terrain toggle ── */
export function _rbToggleTerrain() {
  if (!_rb.map) return;
  const on = !loadTerrainEnabled();
  setTerrainEnabled(on);
  _mlApplyTerrain(_rb.map);
  const btn = document.getElementById('rbTerrainBtn');
  if (btn) btn.classList.toggle('active', on);
  // Sync settings page toggle if it exists
  const settingsEl = document.getElementById('terrain3dToggle');
  if (settingsEl) settingsEl.checked = on;
  if (on) {
    _rb.map.easeTo({ pitch: 55, duration: 600 });
  } else {
    _rb.map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
  }
  showToast(on ? '3D terrain on' : '3D terrain off', 'info');
}

export function _rbUpdateSurfaceLegend() {
  let legend = document.getElementById('rbSurfaceLegend');
  if (!_rb._surfaceMode) { if (legend) legend.style.display = 'none'; return; }
  if (!legend) {
    legend = document.createElement('div');
    legend.id = 'rbSurfaceLegend';
    legend.className = 'rb-surface-legend';
    const mc = document.querySelector('.rb-map-container');
    if (mc) mc.appendChild(legend);
  }
  legend.style.display = '';
  legend.innerHTML =
    '<div class="rb-surface-legend-item"><span class="rb-surface-legend-dot" style="background:#00e5a0"></span>Paved</div>' +
    '<div class="rb-surface-legend-item"><span class="rb-surface-legend-dot" style="background:#ffb74d"></span>Mixed</div>' +
    '<div class="rb-surface-legend-item"><span class="rb-surface-legend-dot" style="background:#c4813d"></span>Off-road</div>';
}

/* ── Reverse ── */
export function rbReverse() {
  if (_rb.waypoints.length < 2) return;
  _rbCloseWpPopup();
  _rb.waypoints.forEach(w => w.marker.remove());
  _rb.waypoints.reverse();
  _rb.routeSegments.reverse();
  _rb.routeSegments.forEach(seg => seg.points.reverse());

  _rb.waypoints.forEach((w, i) => {
    w.marker = _rbCreateWaypointMarker(w.lat, w.lng, i);
    w.marker.on('dragend', () => _rbOnWaypointDrag(i));
  });
  _rbRefreshAllWaypointIcons();

  if (_rb.elevationData.length) {
    const totalDist = _rb.elevationData[_rb.elevationData.length - 1].dist;
    _rb.elevationData.reverse();
    _rb.elevationData.forEach(d => { d.dist = totalDist - d.dist; });
  }

  _rbRedrawRoute();
  _rbRenderElevChart();
  _rbPushHistory();
  _rbUpdateStats();
  _rbUpdateWaypointList();
  showToast('Route reversed', 'success');
}

/* ── Out-and-Back ── */
export async function rbOutAndBack() {
  if (_rb.waypoints.length < 2) return;
  _rbCloseWpPopup();
  const returnWps = _rb.waypoints.slice(0, -1).reverse();

  for (const wp of returnWps) {
    const marker = _rbCreateWaypointMarker(wp.lat, wp.lng, _rb.waypoints.length);
    const idx = _rb.waypoints.length;
    marker.on('dragend', () => _rbOnWaypointDrag(idx));
    _rb.waypoints.push({ lat: wp.lat, lng: wp.lng, marker });

    const prev = _rb.waypoints[_rb.waypoints.length - 2];
    const curr = _rb.waypoints[_rb.waypoints.length - 1];
    const route = await _rbFetchRoute(prev, curr);
    if (route) {
      _rb.routeSegments.push({ points: route.points, distance: route.distance, duration: route.duration, annotations: route.annotations });
    }
  }
  _rbRefreshAllWaypointIcons();

  _rbRedrawRoute();
  _rbFetchElevation();
  _rbPushHistory();
  _rbUpdateStats();
  _rbUpdateWaypointList();
  showToast('Out-and-back route created', 'success');
}

export async function rbLoopBack() {
  _rbCloseWpPopup();
  if (_rb.waypoints.length < 2) { showToast('Add at least 2 waypoints first', 'error'); return; }
  const first = _rb.waypoints[0];
  const last = _rb.waypoints[_rb.waypoints.length - 1];
  if (Math.abs(first.lat - last.lat) < 0.0001 && Math.abs(first.lng - last.lng) < 0.0001) {
    showToast('Route is already a loop', 'info');
    return;
  }
  const route = await _rbFetchRouteWithAvoid(last, first);
  if (!route) return;
  const marker = _rbCreateWaypointMarker(first.lat, first.lng, _rb.waypoints.length);
  const idx = _rb.waypoints.length;
  marker.on('dragend', () => _rbOnWaypointDrag(idx));
  _rb.waypoints.push({ lat: first.lat, lng: first.lng, marker });
  _rbRefreshAllWaypointIcons();
  _rb.routeSegments.push({ points: route.points, distance: route.distance, duration: route.duration, annotations: route.annotations });
  _rbRedrawRoute();
  _rbFetchElevation();
  _rbPushHistory();
  _rbUpdateStats();
  _rbUpdateWaypointList();
  showToast('Loop back to start created', 'success');
}

/* ── Saved Routes ── */
export async function _rbLoadSavedRoutes() {
  try {
    const db = await _rbOpenDB();
    const tx = db.transaction(RB_STORE, 'readonly');
    const req = tx.objectStore(RB_STORE).getAll();
    req.onsuccess = () => {
      _rb.savedRoutes = (req.result || []).sort((a, b) => b.ts - a.ts);
      _rbRenderSavedList();
      db.close();
    };
  } catch (e) { console.warn('[RB] Failed to load saved routes:', e); }
}

export function _rbRenderSavedList() {
  const list = document.getElementById('rbSavedList');
  if (!list) return;
  if (_rb.savedRoutes.length === 0) {
    list.innerHTML = '<div class="rb-saved-empty">No saved routes yet</div>';
    return;
  }
  list.innerHTML = _rb.savedRoutes.map(r => `
    <div class="rb-saved-item${r.id === _rb.activeRouteId ? ' rb-saved-item--active' : ''}" data-id="${r.id}">
      <div class="rb-saved-info" data-action="load" data-rid="${r.id}">
        <div class="rb-saved-name">${r.name}</div>
        <div class="rb-saved-meta">${(r.distance / 1000).toFixed(1)} km · +${Math.round(r.elevGain || 0)}m · ${new Date(r.ts).toLocaleDateString()}</div>
      </div>
      <button class="btn btn-icon btn-sm btn-ghost rb-saved-del" data-action="delete" data-rid="${r.id}" title="Delete">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
      </button>
    </div>
  `).join('');

  list.querySelectorAll('[data-action="load"]').forEach(el => {
    el.addEventListener('click', () => rbLoadRoute(el.dataset.rid));
  });
  list.querySelectorAll('[data-action="delete"]').forEach(el => {
    el.addEventListener('click', (e) => { e.stopPropagation(); rbDeleteSavedRoute(el.dataset.rid); });
  });
}

export async function rbSave() {
  if (_rb.waypoints.length < 2) { showToast('Add at least 2 waypoints', 'error'); return; }

  const allPoints = [];
  for (const seg of _rb.routeSegments) allPoints.push(...seg.points);

  let totalDist = 0;
  for (const seg of _rb.routeSegments) totalDist += seg.distance || 0;

  let elevGain = 0, elevLoss = 0;
  for (let i = 1; i < _rb.elevationData.length; i++) {
    const diff = _rb.elevationData[i].elev - _rb.elevationData[i - 1].elev;
    if (diff > 0) elevGain += diff; else elevLoss += Math.abs(diff);
  }

  const name = prompt('Route name:', 'My Route');
  if (!name) return;

  const route = {
    id: _rb.activeRouteId || crypto.randomUUID(),
    name,
    ts: Date.now(),
    waypoints: _rb.waypoints.map(w => ({ lat: w.lat, lng: w.lng })),
    routePoints: allPoints,
    elevationData: _rb.elevationData,
    distance: totalDist,
    elevGain, elevLoss,
    segments: _rb.routeSegments.map(s => ({ points: s.points, distance: s.distance, duration: s.duration, annotations: s.annotations || null })),
  };

  try {
    const db = await _rbOpenDB();
    const tx = db.transaction(RB_STORE, 'readwrite');
    tx.objectStore(RB_STORE).put(route);
    await new Promise((r, j) => { tx.oncomplete = r; tx.onerror = j; });
    db.close();
    _rb.activeRouteId = route.id;
    await _rbLoadSavedRoutes();
    showToast('Route saved', 'success');
  } catch (e) { showToast('Failed to save route', 'error'); }
}

export async function rbLoadRoute(id) {
  const route = _rb.savedRoutes.find(r => r.id === id);
  if (!route) return;

  rbClear();
  _rb.activeRouteId = route.id;

  route.waypoints.forEach((w, i) => {
    const marker = _rbCreateWaypointMarker(w.lat, w.lng, i);
    marker.on('dragend', () => _rbOnWaypointDrag(i));
    _rb.waypoints.push({ lat: w.lat, lng: w.lng, marker });
  });
  _rbRefreshAllWaypointIcons();

  _rb.routeSegments = (route.segments || []).map(s => ({
    points: s.points, distance: s.distance, duration: s.duration || 0, annotations: s.annotations || null,
  }));
  _rb.elevationData = route.elevationData || [];

  _rbRedrawRoute();
  _rbRenderElevChart();
  _rbUpdateStats();
  _rbUpdateWaypointList();

  const bounds = _rbGetRouteBounds();
  if (bounds) _rb.map.fitBounds(bounds, { padding: 40 });

  _rbPushHistory();
  _rbRenderSavedList();
}

export async function rbDeleteSavedRoute(id) {
  if (!confirm('Delete this saved route?')) return;
  try {
    const db = await _rbOpenDB();
    const tx = db.transaction(RB_STORE, 'readwrite');
    tx.objectStore(RB_STORE).delete(id);
    await new Promise((r, j) => { tx.oncomplete = r; tx.onerror = j; });
    db.close();
    if (_rb.activeRouteId === id) _rb.activeRouteId = null;
    await _rbLoadSavedRoutes();
    showToast('Route deleted', 'success');
  } catch (e) { showToast('Failed to delete route', 'error'); }
}

/* ── Leave Route Builder confirmation ── */
export function _rbConfirmLeave(targetPage) {
  showConfirmDialog(
    'Leave Route Builder?',
    'Your current route has not been saved. All progress will be lost.',
    () => { rbClear(); navigate(targetPage); }
  );
}

/* ── Clear ── */
export function rbClear() {
  _rbCloseWpPopup();
  _rb.waypoints.forEach(w => w.marker && w.marker.remove());
  _rb.waypoints = [];
  _rb.routeSegments = [];
  _rb.elevationData = [];
  _rb.activeRouteId = null;
  // Abort any in-flight route fetch
  if (_rb._fetchAbort) { try { _rb._fetchAbort.abort(); } catch(_){} _rb._fetchAbort = null; }
  // Remove route layers
  if (_rb.map) {
    if (_rb.map.getLayer('rb-route-arrows')) _rb.map.removeLayer('rb-route-arrows');
    if (_rb.map.getLayer('rb-route-hit')) _rb.map.removeLayer('rb-route-hit');
    if (_rb.map.getLayer('rb-route')) _rb.map.removeLayer('rb-route');
    if (_rb.map.getLayer('rb-surface')) _rb.map.removeLayer('rb-surface');
    if (_rb.map.getLayer('rb-fallback')) _rb.map.removeLayer('rb-fallback');
    if (_rb.map.getSource('rb-route')) _rb.map.removeSource('rb-route');
    if (_rb.map.getSource('rb-surface')) _rb.map.removeSource('rb-surface');
    if (_rb.map.getSource('rb-fallback')) _rb.map.removeSource('rb-fallback');
  }
  _rbClearAltRoute();
  if (_rb._scrubMarker) { _rb._scrubMarker.remove(); _rb._scrubMarker = null; }
  if (_rb._scrubDot) { _rb._scrubDot.remove(); _rb._scrubDot = null; }
  if (_rb._scrubBound && _rb.map) {
    if (_rb._scrubMoveFn)  _rb.map.off('mousemove', 'rb-route-hit', _rb._scrubMoveFn);
    if (_rb._scrubLeaveFn) _rb.map.off('mouseleave', 'rb-route-hit', _rb._scrubLeaveFn);
    if (_rb._scrubClickFn) _rb.map.off('click', 'rb-route-hit', _rb._scrubClickFn);
  }
  _rb._scrubMoveFn = null; _rb._scrubLeaveFn = null; _rb._scrubClickFn = null;
  _rb._scrubBound = false;
  _rb.routePolyline = null;
  _rb._surfaceLayer = null;
  if (_rb.elevMarker) { _rb.elevMarker.remove(); _rb.elevMarker = null; }
  if (_rb._timeLabel) { _rb._timeLabel.remove(); _rb._timeLabel = null; }
  _rb._surfaceMode = false;
  // Clean up POI state
  if (_rb._poiAbort) { try { _rb._poiAbort.abort(); } catch(_){} _rb._poiAbort = null; }
  clearTimeout(_rb._poiDebounce);
  _rb._poiDebounce = null;
  _rbClearPoiLayers();
  _rb._poiEnabled = false;
  _rb._poiAlongRoute = false;
  _rb._poiCache = '';
  _rbPoiFetching = false;
  _rbPoiDirty = false;
  _rbPoiRetries = 0;
  if (_rb.map) _rb.map.off('zoom', _rbUpdatePoiScale);
  const sfBtn = document.getElementById('rbSurfaceToggleBtn');
  if (sfBtn) sfBtn.classList.remove('active');
  const sfLeg = document.getElementById('rbSurfaceLegend');
  if (sfLeg) sfLeg.style.display = 'none';
  _rb.history = [];
  _rb.historyIdx = -1;
  _rb.elevChart = destroyChart(_rb.elevChart);
  state._rbElevChart = null;
  // Remove keyboard listener (re-added on next renderRouteBuilderPage)
  document.removeEventListener('keydown', _rbOnKeydown);
  _rbUpdateStats();
  _rbUpdateWaypointList();
  _rbUpdateUndoRedoBtns();
}

/* ── Waypoint List ── */
export async function _rbReverseGeocode(lat, lng) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=14&addressdetails=1`, {
      headers: { 'Accept-Language': 'en' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const a = data.address || {};
    return a.village || a.town || a.city || a.suburb || a.hamlet || a.municipality || a.county || data.display_name?.split(',')[0] || null;
  } catch (_) { return null; }
}

export function _rbUpdateWaypointList() {
  const list = document.getElementById('rbWaypointList');
  if (!list) return;
  if (_rb.waypoints.length === 0) {
    list.innerHTML = '<div class="rb-saved-empty">Click the map to add waypoints</div>';
    return;
  }
  list.innerHTML = _rb.waypoints.map((w, i) => `
    <div class="rb-wp-item">
      <span class="rb-wp-badge${i === 0 ? ' rb-wp-badge--start' : (_rb.waypoints.length > 1 && i === _rb.waypoints.length - 1) ? ' rb-wp-badge--finish' : ''}">${i === 0 ? 'S' : (_rb.waypoints.length > 1 && i === _rb.waypoints.length - 1) ? '<svg viewBox="0 0 10 10" width="10" height="10"><rect x="0" y="0" width="2.5" height="2.5" fill="currentColor"/><rect x="2.5" y="0" width="2.5" height="2.5" fill="transparent"/><rect x="5" y="0" width="2.5" height="2.5" fill="currentColor"/><rect x="7.5" y="0" width="2.5" height="2.5" fill="transparent"/><rect x="0" y="2.5" width="2.5" height="2.5" fill="transparent"/><rect x="2.5" y="2.5" width="2.5" height="2.5" fill="currentColor"/><rect x="5" y="2.5" width="2.5" height="2.5" fill="transparent"/><rect x="7.5" y="2.5" width="2.5" height="2.5" fill="currentColor"/><rect x="0" y="5" width="2.5" height="2.5" fill="currentColor"/><rect x="2.5" y="5" width="2.5" height="2.5" fill="transparent"/><rect x="5" y="5" width="2.5" height="2.5" fill="currentColor"/><rect x="7.5" y="5" width="2.5" height="2.5" fill="transparent"/><rect x="0" y="7.5" width="2.5" height="2.5" fill="transparent"/><rect x="2.5" y="7.5" width="2.5" height="2.5" fill="currentColor"/><rect x="5" y="7.5" width="2.5" height="2.5" fill="transparent"/><rect x="7.5" y="7.5" width="2.5" height="2.5" fill="currentColor"/></svg>' : i + 1}</span>
      <div class="rb-wp-info">
        <span class="rb-wp-name">${w._placeName || 'Loading...'}</span>
        <span class="rb-wp-coords">${w.lat.toFixed(4)}, ${w.lng.toFixed(4)}</span>
      </div>
      <button class="btn btn-icon btn-sm btn-ghost rb-wp-remove" data-idx="${i}" title="Remove" style="margin-left:auto;width:24px;height:24px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  `).join('');

  list.querySelectorAll('.rb-wp-remove').forEach(btn => {
    btn.addEventListener('click', () => _rbRemoveWaypoint(parseInt(btn.dataset.idx)));
  });

  // Fetch place names for waypoints that don't have one yet
  _rb.waypoints.forEach((w, i) => {
    if (w._placeName) return;
    _rbReverseGeocode(w.lat, w.lng).then(name => {
      w._placeName = name || `Point ${i + 1}`;
      const el = list.querySelectorAll('.rb-wp-name')[i];
      if (el) el.textContent = w._placeName;
    });
  });
}

export async function _rbRemoveWaypoint(idx) {
  _rbCloseWpPopup();
  if (idx < 0 || idx >= _rb.waypoints.length) return;
  _rb.waypoints[idx].marker.remove();
  _rb.waypoints.splice(idx, 1);

  // Stitch segments
  const isFirst = idx === 0;
  const isLast = idx >= _rb.routeSegments.length; // was last waypoint
  if (_rb.waypoints.length < 2) {
    // 0 or 1 waypoint left — no segments needed
    _rb.routeSegments = [];
  } else if (isFirst) {
    // Deleted the first waypoint — just drop segment 0, the rest shift down
    _rb.routeSegments.splice(0, 1);
  } else if (isLast) {
    // Deleted the last waypoint — just drop the last segment
    _rb.routeSegments.splice(idx - 1, 1);
  } else {
    // Deleted a middle waypoint — replace two adjacent segments with one new route
    const a = _rb.waypoints[idx - 1];
    const b = _rb.waypoints[idx]; // shifted down after splice
    const route = await _rbFetchRoute(a, b, false, true);
    let newSeg;
    if (route) {
      newSeg = { points: route.points, distance: route.distance, duration: route.duration, annotations: route.annotations };
    } else {
      newSeg = { points: [[a.lat, a.lng], [b.lat, b.lng]], distance: _rbHaversine([a.lat, a.lng], [b.lat, b.lng]), duration: 0, fallback: true };
    }
    _rb.routeSegments.splice(idx - 1, 2, newSeg);
  }

  // Remove all old markers and recreate from stored coordinates
  _rb.waypoints.forEach(w => { if (w.marker) w.marker.remove(); });
  _rb.waypoints.forEach((w, i) => {
    w.marker = _rbCreateWaypointMarker(w.lat, w.lng, i);
    w.marker.on('dragend', () => _rbOnWaypointDrag(i));
  });
  _rbRefreshAllWaypointIcons();

  _rbRedrawRoute();
  _rbClearAltRoute();
  if (_rb.waypoints.length > 1) _rbFetchElevation();
  else { _rb.elevationData = []; _rbRenderElevChart(); }
  _rbPushHistory();
  _rbUpdateStats();
  _rbUpdateWaypointList();
}
