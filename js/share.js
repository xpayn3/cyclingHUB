/* Share Modal module — extracted from app.js */
import { state } from './state.js';

/* ── Lazy proxies for functions defined in other modules ── */
const _app = (fn) => (...a) => window[fn](...a);
const showToast    = _app('showToast');
const fetchMapGPS  = _app('fetchMapGPS');
const _mlGetStyle  = _app('_mlGetStyle');

/* ====================================================
   SHARE ROUTE IMAGE
==================================================== */

const _share = {
  map: null,
  container: null,
  actId: null,
  activity: null,
  points: null,
  style: 'satellite',
  routeColor: '#00e5a0',
  showStats: true,
  format: '1:1',
  rendering: false,
  rendered: false,
  _debounce: null,
  _cachedMapImg: null,   // cached map+route capture as Image for fast re-composite
  _cachedFmt: null,      // format used for cached image
  _cachedStyle: null,    // style used for cached image
  _markerCoords: null,   // { sx, sy, ex, ey } projected marker positions on final canvas
};

const SHARE_COLORS = [
  { id: 'green',  hex: '#00e5a0', label: 'Green' },
  { id: 'orange', hex: '#fc4c02', label: 'Orange' },
  { id: 'blue',   hex: '#3b82f6', label: 'Blue' },
  { id: 'red',    hex: '#ef4444', label: 'Red' },
  { id: 'white',  hex: '#ffffff', label: 'White' },
  { id: 'yellow', hex: '#facc15', label: 'Yellow' },
];

const SHARE_FORMATS = {
  '1:1':  { w: 1080, h: 1080, label: '1:1' },
  '4:3':  { w: 1440, h: 1080, label: '4:3' },
  '16:9': { w: 1920, h: 1080, label: '16:9' },
};

const SHARE_STYLES = [
  { id: 'satellite', label: 'Satellite' },
  { id: 'dark',      label: 'Dark' },
  { id: 'liberty',   label: 'Light' },
];

/* ── Open / Close ── */

export async function openShareModal(actId) {
  _share.actId = actId;
  _share.rendered = false;

  // Find activity — match by id with or without 'i' prefix
  const all = state.activities || [];
  const bareId = String(actId).replace(/^i/, '');
  _share.activity = all.find(a => {
    const aid = String(a.id || a.icu_activity_id || '');
    return aid === actId || aid === bareId || aid === 'i' + bareId;
  }) || {};

  // Open modal
  document.getElementById('shareModal').showModal();
  document.getElementById('shareCanvas').style.display = 'none';
  document.getElementById('shareLoading').style.display = '';

  // Render setting chips
  _shareRenderChips();

  // Load GPS points — try multiple ID formats
  let pts = null;
  const cached = localStorage.getItem('icu_gps_pts_' + actId)
    || localStorage.getItem('icu_gps_pts_i' + bareId)
    || localStorage.getItem('icu_gps_pts_' + bareId);
  if (cached) {
    try { pts = JSON.parse(cached); } catch (_) {}
  }
  if (!pts || pts.length < 2) {
    try { pts = await fetchMapGPS(actId); } catch (_) {}
  }
  if (!pts || pts.length < 2) {
    document.getElementById('shareLoading').innerHTML = '<span style="color:var(--red)">No GPS data available for this activity</span>';
    return;
  }
  // Filter valid
  _share.points = pts.filter(p => Array.isArray(p) && p[0] != null && p[1] != null && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180);
  if (_share.points.length < 2) {
    document.getElementById('shareLoading').innerHTML = '<span style="color:var(--red)">No GPS data available</span>';
    return;
  }

  shareRender();
}

export function closeShareModal() {
  document.getElementById('shareModal').close();
  if (_share.map) { try { _share.map.remove(); } catch (_) {} _share.map = null; }
  if (_share.container) { try { _share.container.remove(); } catch (_) {} _share.container = null; }
  _share._cachedMapImg = null;
  _share._cachedFmt = null;
  _share._cachedStyle = null;
  _share._markerCoords = null;
  _share.rendering = false;
}

/* ── Render setting chips ── */

export function _shareRenderChips() {
  // Style chips
  const styleEl = document.getElementById('shareStyleChips');
  if (styleEl) {
    styleEl.innerHTML = SHARE_STYLES.map(s =>
      `<button class="share-chip${_share.style === s.id ? ' share-chip--active' : ''}" onclick="shareUpdateSetting('style','${s.id}')">${s.label}</button>`
    ).join('');
  }
  // Color chips
  const colorEl = document.getElementById('shareColorChips');
  if (colorEl) {
    colorEl.innerHTML = SHARE_COLORS.map(c =>
      `<button class="share-color-dot${_share.routeColor === c.hex ? ' share-color-dot--active' : ''}" style="background:${c.hex}" title="${c.label}" onclick="shareUpdateSetting('routeColor','${c.hex}')"></button>`
    ).join('');
  }
  // Format chips
  const fmtEl = document.getElementById('shareFormatChips');
  if (fmtEl) {
    fmtEl.innerHTML = Object.entries(SHARE_FORMATS).map(([k, v]) =>
      `<button class="share-chip${_share.format === k ? ' share-chip--active' : ''}" onclick="shareUpdateSetting('format','${k}')">${v.label}</button>`
    ).join('');
  }
  // Stats toggle
  const cb = document.getElementById('shareShowStats');
  if (cb) cb.checked = _share.showStats;
}

/* ── Setting change handler ── */

export function shareUpdateSetting(key, value) {
  if (_share[key] === value) return;
  _share[key] = value;
  _shareRenderChips();

  clearTimeout(_share._debounce);

  if (key === 'showStats') {
    // Stats toggle — instant re-composite from cached map image
    if (_share._cachedMapImg) {
      _shareRecomposite();
    } else {
      _share._debounce = setTimeout(() => shareRender(), 150);
    }
  } else if (key === 'routeColor') {
    // Route color — re-render but keep current preview visible (no loading flash)
    _share._cachedMapImg = null;
    _share._debounce = setTimeout(() => shareRender(true), 150);
  } else {
    // Style or format change — full re-render with loading spinner
    _share._cachedMapImg = null;
    _share._debounce = setTimeout(() => shareRender(), 150);
  }
}

/* ── Calculate route bearing ── */

export function _shareCalcBearing(pts) {
  if (pts.length < 2) return 0;
  const start = pts[0];
  const end = pts[pts.length - 1];
  const dLng = (end[1] - start[1]) * Math.PI / 180;
  const lat1 = start[0] * Math.PI / 180;
  const lat2 = end[0] * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const bearing = Math.atan2(y, x) * 180 / Math.PI;
  // Offset by ~30° for a more dramatic 3/4 view
  return (bearing + 30 + 360) % 360;
}

/* ── Main render function ── */

export async function shareRender(keepPreview) {
  if (!_share.points || _share.points.length < 2) return;
  if (_share.rendering) return;
  _share.rendering = true;

  const loadingEl = document.getElementById('shareLoading');
  const canvasEl = document.getElementById('shareCanvas');
  if (!keepPreview) {
    if (loadingEl) loadingEl.style.display = '';
    if (canvasEl) canvasEl.style.display = 'none';
  }

  // Cleanup previous map & cache
  if (_share.map) { try { _share.map.remove(); } catch (_) {} _share.map = null; }
  if (_share.container) { try { _share.container.remove(); } catch (_) {} _share.container = null; }
  _share._cachedMapImg = null;

  const fmt = SHARE_FORMATS[_share.format] || SHARE_FORMATS['1:1'];
  // Render at full resolution for crisp export
  const renderW = fmt.w;
  const renderH = fmt.h;

  // Create off-screen container
  const div = document.createElement('div');
  div.style.cssText = `position:fixed;left:-9999px;top:-9999px;width:${renderW}px;height:${renderH}px;overflow:hidden;`;
  document.body.appendChild(div);
  _share.container = div;

  const styleKey = _share.style;
  const mapStyle = (styleKey === 'satellite')
    ? { version: 8, sources: { 'sat-tiles': { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256 } }, layers: [{ id: 'sat', type: 'raster', source: 'sat-tiles' }] }
    : _mlGetStyle(styleKey);

  const bearing = _shareCalcBearing(_share.points);
  const pitch = styleKey === 'satellite' ? 50 : 40;

  // Calculate bounds
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
  for (const p of _share.points) {
    if (p[0] < minLat) minLat = p[0];
    if (p[0] > maxLat) maxLat = p[0];
    if (p[1] < minLng) minLng = p[1];
    if (p[1] > maxLng) maxLng = p[1];
  }

  const map = new maplibregl.Map({
    container: div,
    style: mapStyle,
    center: [(minLng + maxLng) / 2, (minLat + maxLat) / 2],
    zoom: 10,
    bearing: bearing,
    pitch: pitch,
    maxPitch: 85,
    attributionControl: false,
    preserveDrawingBuffer: true,
    antialias: true,
    fadeDuration: 0,
  });
  _share.map = map;

  map.on('load', () => {
    // Add terrain for 3D effect
    if (styleKey === 'satellite') {
      map.addSource('share-dem', {
        type: 'raster-dem',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        tileSize: 256,
        encoding: 'terrarium',
        maxzoom: 15,
      });
      map.setTerrain({ source: 'share-dem', exaggeration: 1.5 });
    }

    // Route GeoJSON
    const coords = _share.points.map(p => [p[1], p[0]]);
    const geojson = { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } };

    // Glow layer (wide, transparent)
    map.addSource('share-route', { type: 'geojson', data: geojson });
    map.addLayer({
      id: 'share-route-glow',
      type: 'line',
      source: 'share-route',
      paint: {
        'line-color': _share.routeColor,
        'line-width': 12,
        'line-opacity': 0.3,
        'line-blur': 6,
      },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    });
    // Shadow
    map.addLayer({
      id: 'share-route-shadow',
      type: 'line',
      source: 'share-route',
      paint: {
        'line-color': '#000000',
        'line-width': 6,
        'line-opacity': 0.35,
      },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    });
    // Main route line
    map.addLayer({
      id: 'share-route-line',
      type: 'line',
      source: 'share-route',
      paint: {
        'line-color': _share.routeColor,
        'line-width': 4,
        'line-opacity': 1,
      },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    });

    // Fit to route bounds — extra bottom padding to center visually with pitch tilt
    map.fitBounds([[minLng, minLat], [maxLng, maxLat]], {
      padding: { top: 30, bottom: 140, left: 40, right: 40 },
      bearing: bearing,
      pitch: pitch,
      animate: false,
    });

    // Wait for all tiles to load
    const onIdle = () => {
      // Double wait to ensure satellite tiles finish
      setTimeout(() => {
        _shareCapture(map, fmt);
      }, 800);
    };
    map.once('idle', onIdle);
  });
}

/* ── Draw start/finish dot on canvas ── */

export function _shareDrawMarker(ctx, x, y) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 4;
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.fillStyle = _share.routeColor;
  ctx.fill();
  ctx.restore();
}

/* ── Capture map and composite final image ── */

export function _shareCapture(map, fmt) {
  try {
    const mapCanvas = map.getCanvas();
    const finalCanvas = document.getElementById('shareCanvas');
    finalCanvas.width = fmt.w;
    finalCanvas.height = fmt.h;
    const ctx = finalCanvas.getContext('2d');

    // Draw map (upscaled from render size)
    ctx.drawImage(mapCanvas, 0, 0, fmt.w, fmt.h);

    // Start & Finish markers — drawn on canvas using projected coords
    const pts = _share.points;
    if (pts && pts.length >= 2) {
      const scaleX = fmt.w / mapCanvas.width;
      const scaleY = fmt.h / mapCanvas.height;
      const startLngLat = [pts[0][1], pts[0][0]];
      const endLngLat = [pts[pts.length - 1][1], pts[pts.length - 1][0]];
      const sp = map.project(startLngLat);
      const ep = map.project(endLngLat);
      const sx = sp.x * scaleX, sy = sp.y * scaleY;
      const ex = ep.x * scaleX, ey = ep.y * scaleY;
      _shareDrawMarker(ctx, sx, sy);
      _shareDrawMarker(ctx, ex, ey);
      _share._markerCoords = { sx, sy, ex, ey };
    }

    // Cache the map+route+markers image (before overlays) for fast re-composite
    const cacheImg = new Image();
    cacheImg.src = finalCanvas.toDataURL('image/png');
    _share._cachedMapImg = cacheImg;
    _share._cachedFmt = { ...fmt };
    _share._cachedStyle = _share.style;

    // Apply overlays
    _shareApplyOverlays(ctx, fmt);

    // Show preview
    finalCanvas.style.display = 'block';
    document.getElementById('shareLoading').style.display = 'none';
    _share.rendered = true;
  } catch (err) {
    console.error('Share capture failed:', err);
    document.getElementById('shareLoading').innerHTML = '<span style="color:var(--red)">Failed to capture image</span>';
  }
  _share.rendering = false;

  // Cleanup off-screen map
  if (_share.map) { try { _share.map.remove(); } catch (_) {} _share.map = null; }
  if (_share.container) { try { _share.container.remove(); } catch (_) {} _share.container = null; }
}

/* ── Apply vignette, stats, branding overlays ── */

export function _shareApplyOverlays(ctx, fmt) {
  // Vignette overlay — subtle darkened edges
  const vig = ctx.createRadialGradient(fmt.w / 2, fmt.h / 2, fmt.w * 0.3, fmt.w / 2, fmt.h / 2, fmt.w * 0.75);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, fmt.w, fmt.h);

  // Stats overlay
  if (_share.showStats) {
    _shareDrawStats(ctx, fmt);
  }

  // CycleIQ branding — bottom right
  _shareDrawBranding(ctx, fmt);
}

/* ── Re-composite from cached map image (instant, no map re-render) ── */

export function _shareRecomposite() {
  const img = _share._cachedMapImg;
  const fmt = _share._cachedFmt;
  if (!img || !fmt) return;
  const finalCanvas = document.getElementById('shareCanvas');
  finalCanvas.width = fmt.w;
  finalCanvas.height = fmt.h;
  const ctx = finalCanvas.getContext('2d');
  ctx.drawImage(img, 0, 0, fmt.w, fmt.h);
  _shareApplyOverlays(ctx, fmt);
  finalCanvas.style.display = 'block';
}


/* ── Draw stats bar on canvas ── */

export function _shareDrawStats(ctx, fmt) {
  const a = _share.activity || {};
  const barH = Math.round(fmt.h * 0.22);
  const y = fmt.h - barH;

  // Dark glassmorphism bar
  ctx.fillStyle = 'rgba(10, 12, 18, 0.75)';
  ctx.fillRect(0, y, fmt.w, barH);

  // Top border line
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(0, y, fmt.w, 1);

  const pad = Math.round(fmt.w * 0.035);
  const titleSize = Math.round(fmt.h * 0.038);
  const dateSize = Math.round(fmt.h * 0.02);
  const labelSize = Math.round(fmt.h * 0.016);
  const valSize = Math.round(fmt.h * 0.03);

  // Row 1: Activity name + date
  const name = a.name || a.icu_name || 'Activity';
  const date = a.start_date_local || a.start_date || '';
  const dateStr = date ? new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${titleSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.textBaseline = 'top';
  const titleY = y + pad;
  ctx.fillText(name, pad, titleY);

  if (dateStr) {
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = `${dateSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillText(dateStr, pad, titleY + titleSize + 4);
  }

  // Row 2: Stats spanning full width
  const stats = [];
  const dist = a.distance || a.icu_distance || 0;
  if (dist) {
    const km = dist > 1000 ? (dist / 1000).toFixed(1) : dist.toFixed(1);
    stats.push({ label: 'DISTANCE', value: `${km} km` });
  }
  const dur = a.moving_time || a.icu_moving_time || a.elapsed_time || 0;
  if (dur) {
    const h = Math.floor(dur / 3600);
    const m = Math.floor((dur % 3600) / 60);
    stats.push({ label: 'TIME', value: h ? `${h}h ${m}m` : `${m}m` });
  }
  const elev = a.total_ascent || a.total_elevation_gain || a.icu_total_elevation_gain || 0;
  if (elev) stats.push({ label: 'ELEVATION', value: `${Math.round(elev)} m` });
  const pwr = a.average_watts || a.icu_average_watts || 0;
  if (pwr) stats.push({ label: 'AVG POWER', value: `${Math.round(pwr)} W` });
  else {
    const spd = a.average_speed || a.icu_average_speed || 0;
    if (spd) {
      const kmh = spd < 50 ? spd * 3.6 : spd;
      stats.push({ label: 'AVG SPEED', value: `${kmh.toFixed(1)} km/h` });
    }
  }

  if (stats.length) {
    const statsY = titleY + titleSize + dateSize + Math.round(pad * 0.6);
    const statW = (fmt.w - pad * 2) / stats.length;
    stats.forEach((s, i) => {
      const sx = pad + i * statW;
      // Label
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = `600 ${labelSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      ctx.textBaseline = 'top';
      ctx.fillText(s.label, sx, statsY);
      // Value
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${valSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      ctx.fillText(s.value, sx, statsY + labelSize + 3);
    });
  }
}

/* ── Draw CycleIQ branding ── */

export function _shareDrawBranding(ctx, fmt) {
  const pad = Math.round(fmt.w * 0.025);
  const size = Math.round(fmt.h * 0.02);

  // Position: bottom-right corner (above stats bar if present)
  const bx = fmt.w - pad;
  const by = _share.showStats ? fmt.h - Math.round(fmt.h * 0.16) - pad : fmt.h - pad;

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `600 ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('CycleIQ', bx, by);
  ctx.textAlign = 'left'; // reset
}

/* ── Download image ── */

export function shareImageDownload() {
  const canvas = document.getElementById('shareCanvas');
  if (!canvas || !_share.rendered) { showToast('Image not ready yet', 'error'); return; }

  canvas.toBlob(blob => {
    if (!blob) { showToast('Failed to generate image', 'error'); return; }
    const name = (_share.activity?.name || 'Activity').replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '-');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CycleIQ-${name}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Image downloaded', 'success');
  }, 'image/png');
}

/* ── Copy to clipboard ── */

export async function shareImageCopy() {
  const canvas = document.getElementById('shareCanvas');
  if (!canvas || !_share.rendered) { showToast('Image not ready yet', 'error'); return; }

  try {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('No blob');
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    showToast('Image copied to clipboard', 'success');
  } catch (err) {
    showToast('Copy failed — try Download instead', 'error');
  }
}

