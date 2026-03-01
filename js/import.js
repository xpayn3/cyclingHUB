/* Import Page module — extracted from app.js */
import { state } from './state.js';

/* ── Lazy proxies for functions defined in other modules ── */
const _app = (fn) => (...a) => window[fn](...a);
const showToast           = _app('showToast');
const showConfirmDialog   = _app('showConfirmDialog');
const getAllActivities     = _app('getAllActivities');
const icuRenderSyncUI     = _app('icuRenderSyncUI');
const stravaRenderSyncUI  = _app('stravaRenderSyncUI');
const _hmOpenDB           = _app('_hmOpenDB');
/* HM_STORE constant from heatmap.js */
const HM_STORE = 'routes';

/* ====================================================
   IMPORT PAGE — FIT File Upload & Parsing
==================================================== */
const _imp = {
  queue: [],        // { id, file, parsed: null, status: 'pending'|'processing'|'done'|'error'|'skipped', error: null }
  processing: false,
  history: JSON.parse(localStorage.getItem('icu_import_history') || '[]'),
  inited: false,
};

export function initImportPage() {
  if (_imp.inited) { impRenderHistory(); icuRenderSyncUI(); stravaRenderSyncUI(); return; }
  _imp.inited = true;

  const dz = document.getElementById('impDropzone');
  const fi = document.getElementById('impFileInput');
  if (!dz || !fi) return;

  // Click to browse
  dz.addEventListener('click', () => fi.click());

  // File input change
  fi.addEventListener('change', () => {
    if (fi.files.length) impAddFiles(fi.files);
    fi.value = '';
  });

  // Drag & drop
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('imp-dropzone--dragover'); });
  dz.addEventListener('dragleave', e => { e.preventDefault(); dz.classList.remove('imp-dropzone--dragover'); });
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('imp-dropzone--dragover');
    const files = [...e.dataTransfer.files].filter(f => f.name.toLowerCase().endsWith('.fit'));
    if (files.length) impAddFiles(files);
    else showToast('Only .FIT files are supported', 'error');
  });

  impRenderHistory();
  stravaRenderSyncUI();
}

/* ── Tab switching ── */
export function impSwitchTab(src) {
  document.querySelectorAll('.imp-tab').forEach(t => t.classList.toggle('imp-tab--active', t.dataset.src === src));
  ['icu', 'fit', 'strava'].forEach(k => {
    const p = document.getElementById('impPanel' + (k === 'icu' ? 'Icu' : k === 'fit' ? 'Fit' : 'Strava'));
    if (p) p.style.display = k === src ? '' : 'none';
  });
  if (src === 'icu') icuRenderSyncUI();
  if (src === 'strava') stravaRenderSyncUI();
}

/* ── Add files to queue ── */
export function impAddFiles(fileList) {
  const files = Array.from(fileList).filter(f => f.name.toLowerCase().endsWith('.fit'));
  if (!files.length) { showToast('No .FIT files found', 'error'); return; }

  const newItems = [];
  for (const f of files) {
    // Avoid adding same filename twice
    if (_imp.queue.find(q => q.file.name === f.name && q.file.size === f.size)) continue;
    const item = {
      id: Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      file: f,
      parsed: null,
      status: 'pending',
      error: null,
      settings: null,
      settingsOpen: false,
    };
    _imp.queue.push(item);
    newItems.push(item);
  }
  impRenderQueue();
  // Early-parse to detect available data streams
  for (const item of newItems) impEarlyParse(item);
}

/* ── Early-parse FIT to detect streams ── */
export async function impEarlyParse(item) {
  try {
    const buffer = await item.file.arrayBuffer();
    const parsed = await impParseFIT(buffer);
    item.parsed = parsed;
    impDetectStreams(item);
    impRenderQueue();
  } catch (_) { /* silent — will re-parse during import */ }
}

/* ── Detect available data streams ── */
export function impDetectStreams(item) {
  const p = item.parsed;
  if (!p) return;
  const s = p.sessions?.[0] || {};
  const recs = p.records || [];
  // Sample first 50 records for field detection
  const sample = recs.slice(0, 50);
  item.settings = {};
  // GPS
  if (sample.some(r => r.position_lat != null && r.position_long != null)) item.settings.gps = true;
  // Heart rate
  if ((s.avg_heart_rate && s.avg_heart_rate > 0) || sample.some(r => r.heart_rate > 0)) item.settings.heartrate = true;
  // Power
  if ((s.avg_power && s.avg_power > 0) || sample.some(r => r.power > 0)) item.settings.power = true;
  // Cadence
  if ((s.avg_cadence && s.avg_cadence > 0) || sample.some(r => r.cadence > 0)) item.settings.cadence = true;
  // Speed
  if ((s.avg_speed && s.avg_speed > 0) || sample.some(r => r.speed > 0 || r.enhanced_speed > 0)) item.settings.speed = true;
  // Elevation
  if ((s.total_ascent && s.total_ascent > 0) || sample.some(r => r.altitude != null)) item.settings.elevation = true;
  // Temperature
  if (sample.some(r => r.temperature != null)) item.settings.temperature = true;
  // Calories
  if (s.total_calories && s.total_calories > 0) item.settings.calories = true;
}

/* ── Toggle settings panel for a queue item ── */
export function impToggleSettings(id) {
  const item = _imp.queue.find(q => q.id === id);
  if (!item) return;
  const wasOpen = item.settingsOpen;
  // Close all panels first
  _imp.queue.forEach(q => q.settingsOpen = false);
  item.settingsOpen = !wasOpen;
  impRenderQueue();
}

/* ── Toggle a specific data stream for a queue item ── */
export function impToggleStream(id, stream) {
  const item = _imp.queue.find(q => q.id === id);
  if (!item || !item.settings || !(stream in item.settings)) return;
  item.settings[stream] = !item.settings[stream];
  impRenderQueue();
}

/* ── Build settings panel HTML for a queue item ── */
export function impBuildSettingsPanel(q) {
  const s = q.parsed?.sessions?.[0] || {};
  const recs = q.parsed?.records || [];
  const gpsCount = recs.filter(r => r.position_lat != null && r.position_long != null).length;

  const allStreams = [
    { key: 'gps', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
      name: 'GPS Route', preview: gpsCount ? `${gpsCount.toLocaleString()} pts` : '' },
    { key: 'heartrate', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
      name: 'Heart Rate', preview: s.avg_heart_rate ? `Avg ${Math.round(s.avg_heart_rate)} bpm` : '' },
    { key: 'power', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
      name: 'Power', preview: s.avg_power ? `Avg ${Math.round(s.avg_power)} W` : '' },
    { key: 'cadence', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M21.54 15H17a2 2 0 0 0-2 2v4.54"/><path d="M7 3.34V5a3 3 0 0 0 3 3v0a2 2 0 0 1 2 2v0c0 1.1.9 2 2 2v0a2 2 0 0 0 2-2v0c0-1.1.9-2 2-2h3.17"/><path d="M11 21.95V18a2 2 0 0 0-2-2v0a2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H2.05"/><circle cx="12" cy="12" r="10"/></svg>`,
      name: 'Cadence', preview: s.avg_cadence ? `Avg ${Math.round(s.avg_cadence)} rpm` : '' },
    { key: 'speed', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M12 12m-10 0a10 10 0 1 0 20 0 10 10 0 1 0-20 0"/><path d="M12 12l4-4"/><path d="M12 7v1"/></svg>`,
      name: 'Speed', preview: s.avg_speed ? `Avg ${(s.avg_speed).toFixed(1)} km/h` : (s.enhanced_avg_speed ? `Avg ${(s.enhanced_avg_speed).toFixed(1)} km/h` : '') },
    { key: 'elevation', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg>`,
      name: 'Elevation', preview: s.total_ascent ? `${Math.round(s.total_ascent)} m gain` : '' },
    { key: 'temperature', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>`,
      name: 'Temperature', preview: (() => { const t = recs.find(r => r.temperature != null); return t ? `${Math.round(t.temperature)}°C` : ''; })() },
    { key: 'calories', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`,
      name: 'Calories', preview: s.total_calories ? `${Math.round(s.total_calories)} kcal` : '' },
  ];

  const rows = allStreams.map(st => {
    const available = st.key in q.settings;
    const enabled = available && q.settings[st.key];
    if (!available) {
      return `<div class="imp-sp-row imp-sp-row--unavail">
        <span class="imp-sp-icon">${st.icon}</span>
        <span class="imp-sp-name">${st.name}</span>
        <span class="imp-sp-preview">Not available</span>
      </div>`;
    }
    return `<label class="imp-sp-row">
      <span class="imp-sp-icon">${st.icon}</span>
      <span class="imp-sp-name">${st.name}</span>
      <span class="imp-sp-preview">${st.preview}</span>
      <input type="checkbox" ${enabled ? 'checked' : ''} onchange="impToggleStream('${q.id}','${st.key}')"/>
      <span class="imp-toggle-switch"></span>
    </label>`;
  }).join('');

  return `<div class="imp-qi-settings-panel">
    <div class="imp-sp-header">Data Streams</div>
    ${rows}
  </div>`;
}

/* ── Render queue UI ── */
export function impRenderQueue() {
  const card = document.getElementById('impQueueCard');
  const list = document.getElementById('impQueueList');
  const sub = document.getElementById('impQueueSub');
  if (!card || !list) return;

  if (!_imp.queue.length) {
    card.style.display = 'none';
    return;
  }
  card.style.display = '';
  sub.textContent = `${_imp.queue.length} file${_imp.queue.length !== 1 ? 's' : ''} selected`;

  list.innerHTML = _imp.queue.map(q => {
    const sizeMB = (q.file.size / (1024 * 1024)).toFixed(1);
    const sport = q.parsed ? impDetectSport(q.parsed) : 'other';
    const sportIcon = { ride: '🚴', run: '🏃', swim: '🏊', other: '📄' }[sport];
    const statusCls = `imp-qi-status--${q.status}`;
    const statusLabels = { pending: 'Ready', processing: 'Parsing…', done: 'Imported', error: 'Error', skipped: 'Skipped' };
    const statusLabel = q.error ? q.error : statusLabels[q.status] || q.status;

    let metaHtml = `<span>${sizeMB} MB</span>`;
    if (q.parsed) {
      const d = impGetDuration(q.parsed);
      const dist = impGetDistance(q.parsed);
      if (d) metaHtml += `<span>${d}</span>`;
      if (dist) metaHtml += `<span>${dist}</span>`;
    }

    // Stream badges
    let badgesHtml = '';
    if (q.settings) {
      const streamBadges = [
        { key: 'gps', label: 'GPS' },
        { key: 'heartrate', label: 'HR' },
        { key: 'power', label: 'PWR' },
        { key: 'cadence', label: 'CAD' },
        { key: 'speed', label: 'SPD' },
        { key: 'elevation', label: 'ELE' },
        { key: 'temperature', label: 'TMP' },
        { key: 'calories', label: 'CAL' },
      ];
      const tags = streamBadges
        .filter(b => b.key in q.settings)
        .map(b => `<span class="imp-qi-badge${q.settings[b.key] ? '' : ' imp-qi-badge--off'}">${b.label}</span>`)
        .join('');
      if (tags) badgesHtml = `<div class="imp-qi-badges">${tags}</div>`;
    }

    // Settings button (only for pending items with parsed data)
    const settingsBtn = (q.status === 'pending' && q.settings) ? `<div class="imp-qi-settings-btn${q.settingsOpen ? ' imp-qi-settings-btn--active' : ''}" onclick="impToggleSettings('${q.id}')" title="Import settings">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
      </div>` : '';

    // Settings panel (expanded below this item)
    let panelHtml = '';
    if (q.settingsOpen && q.settings) {
      panelHtml = impBuildSettingsPanel(q);
    }

    return `<div class="imp-queue-item${q.settingsOpen ? ' imp-queue-item--expanded' : ''}" data-id="${q.id}">
      <div class="imp-qi-icon imp-qi-icon--${sport}">
        <span style="font-size:18px">${sportIcon}</span>
      </div>
      <div class="imp-qi-info">
        <div class="imp-qi-name">${q.file.name}</div>
        <div class="imp-qi-meta">${metaHtml}</div>
        ${badgesHtml}
      </div>
      <div class="imp-qi-status ${statusCls}">${statusLabel}</div>
      ${settingsBtn}
      ${q.status === 'pending' ? `<div class="imp-qi-remove" onclick="impRemoveFromQueue('${q.id}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </div>` : ''}
    </div>${panelHtml}`;
  }).join('');
}

/* ── Remove from queue ── */
export function impRemoveFromQueue(id) {
  _imp.queue = _imp.queue.filter(q => q.id !== id);
  impRenderQueue();
}

/* ── Clear queue ── */
export function impClearQueue() {
  _imp.queue = [];
  impRenderQueue();
}

/* ── Process all files ── */
export async function impProcessAll() {
  if (_imp.processing || !_imp.queue.length) return;
  _imp.processing = true;
  const btn = document.getElementById('impProcessBtn');
  if (btn) btn.disabled = true;

  const optGPS   = document.getElementById('impOptGPS')?.checked;
  const optSport = document.getElementById('impOptSport')?.checked;
  const optDupes = document.getElementById('impOptDupes')?.checked;

  let imported = 0, skipped = 0, errors = 0;

  for (const item of _imp.queue) {
    if (item.status !== 'pending') continue;
    item.status = 'processing';
    impRenderQueue();

    try {
      // Reuse early-parsed data if available, otherwise parse now
      if (!item.parsed) {
        const buffer = await item.file.arrayBuffer();
        item.parsed = await impParseFIT(buffer);
      }
      const parsed = item.parsed;

      // Duplicate check (returns false or a reason string)
      const dupReason = optDupes && impIsDuplicate(parsed);
      if (dupReason) {
        item.status = 'skipped';
        item.error = dupReason;
        skipped++;
        impRenderQueue();
        continue;
      }

      // Build activity object
      const activity = impBuildActivity(parsed, item.file.name, optSport, optGPS, item.settings);

      // Save to imported activities in localStorage
      impSaveActivity(activity);
      imported++;

      item.status = 'done';

      // Add to history
      _imp.history.unshift({
        name: activity.name,
        sport: activity.type || 'Ride',
        date: activity.start_date,
        importedAt: new Date().toISOString(),
        status: 'success',
        distance: activity.distance,
        duration: activity.moving_time,
      });

    } catch (err) {
      console.error('FIT parse error:', err);
      item.status = 'error';
      item.error = err.message || 'Parse failed';
      errors++;

      _imp.history.unshift({
        name: item.file.name,
        sport: 'unknown',
        date: null,
        importedAt: new Date().toISOString(),
        status: 'error',
        error: item.error,
      });
    }
    impRenderQueue();
  }

  // Save history
  try { localStorage.setItem('icu_import_history', JSON.stringify(_imp.history.slice(0, 100))); } catch (e) { console.warn('localStorage.setItem failed:', e); }

  _imp.processing = false;
  if (btn) btn.disabled = false;
  impRenderHistory();

  // Show summary toast
  const parts = [];
  if (imported) parts.push(`${imported} imported`);
  if (skipped) parts.push(`${skipped} skipped`);
  if (errors) parts.push(`${errors} failed`);
  showToast(parts.join(', ') || 'No files to process', imported > 0 ? 'success' : 'error');
}

/* ── FIT Parser wrapper (lazy-loaded) ── */
let _fitParserLoaded = (typeof FitParser !== 'undefined');

export async function _loadFitParser() {
  if (_fitParserLoaded && typeof FitParser !== 'undefined') return;
  // Load all four CJS modules in the right order via a blob-based bundle
  // Order matters: binary.js requires fit + messages, so they must load first
  const urls = [
    'https://cdn.jsdelivr.net/npm/fit-file-parser@1.9.1/dist/fit.js',
    'https://cdn.jsdelivr.net/npm/fit-file-parser@1.9.1/dist/messages.js',
    'https://cdn.jsdelivr.net/npm/fit-file-parser@1.9.1/dist/binary.js',
    'https://cdn.jsdelivr.net/npm/fit-file-parser@1.9.1/dist/fit-parser.js',
  ];
  const sources = await Promise.all(urls.map(u => fetch(u).then(r => r.text())));
  // Wrap each module in a function that provides require/module/exports
  const modules = {};
  const names = ['fit', 'messages', 'binary', 'fit-parser'];
  const bundle = names.map((name, i) => `
    (function(){
      var module = { exports: {} };
      var exports = module.exports;
      var require = function(n) { return __m[n.replace('./','')] || {}; };
      ${sources[i]}
      __m['${name}'] = module.exports;
    })();
  `).join('\n');
  const script = document.createElement('script');
  // Provide a minimal Buffer polyfill for binary.js (it uses Buffer.from for UTF-8 string decoding)
  const bufferShim = `__m['buffer'] = { Buffer: { from: function(arr) { return { toString: function() { return Array.from(arr).map(function(c){ return String.fromCharCode(c); }).join(''); } }; } } };`;
  script.textContent = `(function(){ var __m = {};\n${bufferShim}\n${bundle}\nwindow.FitParser = __m['fit-parser'].default || __m['fit-parser']; })();`;
  document.head.appendChild(script);
  _fitParserLoaded = true;
}

export async function impParseFIT(arrayBuffer) {
  // Lazy-load the FIT parser on first use
  if (typeof FitParser === 'undefined') {
    await _loadFitParser();
  }
  if (typeof FitParser === 'undefined') {
    throw new Error('FIT parser library could not be loaded. Please check your internet connection.');
  }
  const parser = new FitParser({ force: true, speedUnit: 'km/h', lengthUnit: 'km', elapsedRecordField: true });
  const data = { records: [], sessions: [], laps: [], events: [], device_infos: [], activity: null };
  parser.parse(arrayBuffer, (err, result) => {
    if (err) throw new Error(err);
    Object.assign(data, result);
  });
  return data;
}

/* ── Sport detection ── */
export function impDetectSport(parsed) {
  const session = parsed.sessions?.[0];
  if (!session) return 'other';
  const sport = (session.sport || '').toLowerCase();
  if (sport === 'cycling' || sport === 'biking') return 'ride';
  if (sport === 'running') return 'run';
  if (sport === 'swimming') return 'swim';
  // Fallback: check sub_sport
  const sub = (session.sub_sport || '').toLowerCase();
  if (sub.includes('cycl') || sub.includes('bik') || sub.includes('ride')) return 'ride';
  if (sub.includes('run') || sub.includes('trail')) return 'run';
  if (sub.includes('swim') || sub.includes('pool') || sub.includes('open_water')) return 'swim';
  return 'ride'; // default to ride
}

/* ── Duration helper ── */
export function impGetDuration(parsed) {
  const s = parsed.sessions?.[0];
  if (!s) return null;
  const secs = s.total_timer_time || s.total_elapsed_time || 0;
  if (!secs) return null;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

/* ── Distance helper ── */
export function impGetDistance(parsed) {
  const s = parsed.sessions?.[0];
  if (!s) return null;
  let d = s.total_distance;
  if (!d) return null;
  // fit-parser with lengthUnit: 'km' gives km
  if (d > 1000) d = d / 1000; // safety: if still in meters
  return d >= 1 ? `${d.toFixed(1)} km` : `${(d * 1000).toFixed(0)} m`;
}

/* ── Duplicate check ── */
export function impIsDuplicate(parsed) {
  const s = parsed.sessions?.[0];
  if (!s) return false;
  const ts = s.start_time ? new Date(s.start_time).getTime() : null;
  const dur = Math.round(s.total_timer_time || 0);
  if (!ts) return false;

  // Check against locally imported FIT activities
  const imported = JSON.parse(localStorage.getItem('icu_fit_activities') || '[]');
  const localDup = imported.some(a => {
    const aTs = new Date(a.start_date).getTime();
    return Math.abs(aTs - ts) < 60000 && Math.abs((a.moving_time || 0) - dur) < 30;
  });
  if (localDup) return 'Already imported locally';

  // Check against synced intervals.icu activities
  const synced = getAllActivities();
  const syncedDup = synced.find(a => {
    const aDate = a.start_date_local || a.start_date;
    if (!aDate) return false;
    const aTs = new Date(aDate).getTime();
    const aDur = a.moving_time || a.icu_moving_time || a.elapsed_time || 0;
    return Math.abs(aTs - ts) < 120000 && Math.abs(aDur - dur) < 60;
  });
  if (syncedDup) return `Already on intervals.icu: ${syncedDup.name || syncedDup.icu_name || 'activity'}`;

  return false;
}

/* ── Build activity from parsed FIT ── */
export function impBuildActivity(parsed, fileName, autoSport, extractGPS, settings) {
  const s = parsed.sessions?.[0] || {};
  const records = parsed.records || [];
  const st = settings || {}; // per-file stream settings

  const sport = autoSport ? impDetectSport(parsed) : 'ride';
  const typeMap = { ride: 'Ride', run: 'Run', swim: 'Swim', other: 'Ride' };

  const startDate = s.start_time ? new Date(s.start_time).toISOString() : new Date().toISOString();
  const cleanName = fileName.replace(/\.fit$/i, '').replace(/[_-]/g, ' ');
  const sportLabel = typeMap[sport] || 'Ride';
  const dateStr = new Date(startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const name = `${sportLabel} — ${dateStr}`;

  const activity = {
    id: 'fit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    source: 'fit_import',
    name,
    type: typeMap[sport],
    start_date: startDate,
    moving_time: Math.round(s.total_timer_time || s.total_elapsed_time || 0),
    elapsed_time: Math.round(s.total_elapsed_time || s.total_timer_time || 0),
    distance: s.total_distance || 0,
    total_ascent: st.elevation === false ? 0 : (s.total_ascent || 0),
    average_speed: st.speed === false ? 0 : (s.avg_speed || s.enhanced_avg_speed || 0),
    max_speed: st.speed === false ? 0 : (s.max_speed || s.enhanced_max_speed || 0),
    average_heartrate: st.heartrate === false ? 0 : (s.avg_heart_rate || 0),
    max_heartrate: st.heartrate === false ? 0 : (s.max_heart_rate || 0),
    average_watts: st.power === false ? 0 : (s.avg_power || 0),
    max_watts: st.power === false ? 0 : (s.max_power || 0),
    average_cadence: st.cadence === false ? 0 : (s.avg_cadence || 0),
    calories: st.calories === false ? 0 : (s.total_calories || 0),
    normalized_power: st.power === false ? 0 : (s.normalized_power || 0),
    training_stress_score: st.power === false ? 0 : (s.training_stress_score || 0),
    intensity_factor: st.power === false ? 0 : (s.intensity_factor || 0),
    file_name: fileName,
  };

  // Extract GPS route (respect per-file GPS setting)
  const gpsEnabled = st.gps !== false && extractGPS;
  if (gpsEnabled && records.length) {
    const route = [];
    for (const r of records) {
      if (r.position_lat != null && r.position_long != null) {
        // FIT uses semicircles; fit-parser converts to degrees
        const lat = typeof r.position_lat === 'number' ? r.position_lat : 0;
        const lng = typeof r.position_long === 'number' ? r.position_long : 0;
        if (lat !== 0 && lng !== 0 && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
          route.push([lat, lng]);
        }
      }
    }
    if (route.length > 10) {
      // Downsample for storage — keep every Nth point
      const maxPts = 500;
      const step = Math.max(1, Math.floor(route.length / maxPts));
      activity.gps_route = route.filter((_, i) => i % step === 0);
    }
  }

  return activity;
}

/* ── Save to localStorage ── */
export function impSaveActivity(activity) {
  const key = 'icu_fit_activities';
  const list = JSON.parse(localStorage.getItem(key) || '[]');
  list.push(activity);
  try { localStorage.setItem(key, JSON.stringify(list)); } catch (e) { console.warn('localStorage.setItem failed:', e); }

  // Also save GPS route to IndexedDB for heatmap if available
  if (activity.gps_route && activity.gps_route.length > 10) {
    impSaveRouteToIDB(activity.id, activity.gps_route);
  }
}

/* ── Save route to IndexedDB (same DB as heatmap) ── */
export async function impSaveRouteToIDB(activityId, route) {
  try {
    const db = await _hmOpenDB();
    const tx = db.transaction(HM_STORE, 'readwrite');
    tx.objectStore(HM_STORE).put({ id: activityId, route, source: 'fit_import' });
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
    db.close();
  } catch (_) {}
}

/* ── Render import history ── */
export function impRenderHistory() {
  const list = document.getElementById('impHistoryList');
  const sub = document.getElementById('impHistorySub');
  const clearBtn = document.getElementById('impHistoryClearBtn');
  if (!list) return;

  if (!_imp.history.length) {
    sub.textContent = 'No imports yet';
    if (clearBtn) clearBtn.style.display = 'none';
    list.innerHTML = `<div class="imp-history-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
      <p>Imported activities will appear here</p>
    </div>`;
    return;
  }

  const successCount = _imp.history.filter(h => h.status === 'success').length;
  sub.textContent = `${successCount} activit${successCount !== 1 ? 'ies' : 'y'} imported`;
  if (clearBtn) clearBtn.style.display = '';

  list.innerHTML = _imp.history.slice(0, 30).map(h => {
    const dotCls = h.status === 'success' ? 'imp-hi-dot--success' : h.status === 'error' ? 'imp-hi-dot--error' : 'imp-hi-dot--skipped';
    const dateStr = h.importedAt ? new Date(h.importedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    let meta = h.sport || '';
    if (h.distance) {
      const km = h.distance >= 1000 ? (h.distance / 1000).toFixed(1) : h.distance.toFixed(1);
      meta += ` · ${km} km`;
    }
    if (h.duration) {
      const m = Math.round((h.duration || 0) / 60);
      meta += ` · ${m} min`;
    }
    return `<div class="imp-history-item">
      <div class="imp-hi-dot ${dotCls}"></div>
      <div class="imp-hi-info">
        <div class="imp-hi-name">${h.name || 'Unknown'}</div>
        <div class="imp-hi-meta">${meta}</div>
      </div>
      <div class="imp-hi-date">${dateStr}</div>
    </div>`;
  }).join('');
}

/* ── Clear history ── */
export function impClearHistory() {
  showConfirmDialog('Clear Import History', 'This will remove all import history records. Imported activities will not be affected.', () => {
    _imp.history = [];
    localStorage.removeItem('icu_import_history');
    impRenderHistory();
    showToast('Import history cleared');
  });
}

