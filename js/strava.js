/* Strava Integration module — extracted from app.js */
import { state, STRAVA_API_BASE, STRAVA_AUTH_BASE, STRAVA_AUTH_URL } from './state.js';

/* ── Lazy proxies for functions defined in other modules ── */
const _app = (fn) => (...a) => window[fn](...a);
const showToast             = _app('showToast');
const navigate              = _app('navigate');
const showConfirmDialog     = _app('showConfirmDialog');
const updateStorageBar      = _app('updateStorageBar');
const updateLifetimeCacheUI = _app('updateLifetimeCacheUI');
const pollRestore           = _app('pollRestore');
const rlUpdateUI            = _app('rlUpdateUI');
const impSwitchTab          = _app('impSwitchTab');
const impSaveRouteToIDB     = _app('impSaveRouteToIDB');

/* ====================================================
   STRAVA INTEGRATION
   OAuth flow, sync engine, activity builder, rate limiter
==================================================== */

/* ── Strava credentials ── */
export function saveStravaCredentials(clientId, clientSecret) {
  try {
    localStorage.setItem('strava_client_id', clientId);
    localStorage.setItem('strava_client_secret', clientSecret);
  } catch (e) { console.warn('localStorage.setItem failed (Strava creds):', e); }
}
export function loadStravaCredentials() {
  const clientId = localStorage.getItem('strava_client_id');
  const clientSecret = localStorage.getItem('strava_client_secret');
  return (clientId && clientSecret) ? { clientId, clientSecret } : null;
}
export function clearStravaCredentials() {
  ['strava_client_id', 'strava_client_secret', 'strava_access_token',
   'strava_refresh_token', 'strava_expires_at', 'strava_athlete',
   'strava_last_sync'].forEach(k => localStorage.removeItem(k));
}

/* ── Strava token management ── */
export function saveStravaTokens(accessToken, refreshToken, expiresAt) {
  localStorage.setItem('strava_access_token', accessToken);
  localStorage.setItem('strava_refresh_token', refreshToken);
  localStorage.setItem('strava_expires_at', String(expiresAt));
}
export function loadStravaTokens() {
  const accessToken = localStorage.getItem('strava_access_token');
  const refreshToken = localStorage.getItem('strava_refresh_token');
  const expiresAt = parseInt(localStorage.getItem('strava_expires_at') || '0', 10);
  return accessToken ? { accessToken, refreshToken, expiresAt } : null;
}
export function clearStravaTokens() {
  ['strava_access_token', 'strava_refresh_token', 'strava_expires_at'].forEach(k => localStorage.removeItem(k));
}
export function isStravaTokenExpired() {
  const expiresAt = parseInt(localStorage.getItem('strava_expires_at') || '0', 10);
  return Date.now() / 1000 > expiresAt - 300; // 5 min buffer
}
export function isStravaConnected() {
  return !!loadStravaTokens() && !!loadStravaCredentials();
}

export async function refreshStravaToken() {
  const creds = loadStravaCredentials();
  const tokens = loadStravaTokens();
  if (!creds || !tokens || !tokens.refreshToken) { clearStravaTokens(); return null; }
  try {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: tokens.refreshToken,
    });
    const res = await fetch(STRAVA_AUTH_BASE + 'token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) { clearStravaTokens(); showToast('Strava session expired — please reconnect', 'error'); return null; }
    const data = await res.json();
    saveStravaTokens(data.access_token, data.refresh_token, data.expires_at);
    return data.access_token;
  } catch (e) {
    console.warn('Strava token refresh failed:', e);
    return null;
  }
}

export async function getStravaAccessToken() {
  const tokens = loadStravaTokens();
  if (!tokens) return null;
  if (!isStravaTokenExpired()) return tokens.accessToken;
  return refreshStravaToken();
}

/* ── Strava API fetch wrapper ── */
export async function stravaFetch(path) {
  const token = await getStravaAccessToken();
  if (!token) throw new Error('Not connected to Strava');
  const res = await fetch(STRAVA_API_BASE + path, {
    headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' },
  });
  _stravaRl.timestamps.push(Date.now());
  if (!res.ok) {
    if (res.status === 401) { clearStravaTokens(); throw new Error('Strava session expired'); }
    if (res.status === 429) throw new Error('Strava rate limit reached — please wait');
    const text = await res.text().catch(() => '');
    throw new Error(`Strava ${res.status}: ${text}`);
  }
  return res.json();
}

/* ── Strava OAuth flow ── */
export function stravaStartAuth() {
  const creds = loadStravaCredentials();
  if (!creds) { showToast('Enter Strava Client ID & Secret first', 'error'); return; }
  const redirectUri = window.location.origin + window.location.pathname;
  const url = `${STRAVA_AUTH_URL}?client_id=${creds.clientId}&response_type=code` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}&scope=activity:read_all&approval_prompt=auto`;
  window.location.href = url;
}

export async function stravaExchangeCode(code) {
  const creds = loadStravaCredentials();
  if (!creds) { showToast('Strava credentials not found', 'error'); return; }
  try {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      code: code,
    });
    const res = await fetch(STRAVA_AUTH_BASE + 'token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) { showToast('Strava authorization failed', 'error'); return; }
    const data = await res.json();
    saveStravaTokens(data.access_token, data.refresh_token, data.expires_at);
    if (data.athlete) {
      localStorage.setItem('strava_athlete', JSON.stringify({
        id: data.athlete.id,
        firstname: data.athlete.firstname,
        lastname: data.athlete.lastname,
        profile: data.athlete.profile_medium || data.athlete.profile,
      }));
    }
    showToast('Connected to Strava!', 'success');
    navigate('import');
    setTimeout(() => { impSwitchTab('strava'); stravaRenderSyncUI(); }, 200);
  } catch (e) {
    console.error('Strava code exchange failed:', e);
    showToast('Strava connection failed: ' + e.message, 'error');
  }
}

export function stravaDisconnect() {
  showConfirmDialog('Disconnect Strava', 'This will remove your Strava connection. Imported activities will be kept.', () => {
    clearStravaCredentials();
    stravaRenderSyncUI();
    showToast('Disconnected from Strava');
  });
}

/* ── Strava rate limiter ── */
const _stravaRl = { timestamps: [] };
export function stravaRlCanProceed() {
  const now = Date.now();
  _stravaRl.timestamps = _stravaRl.timestamps.filter(t => now - t < 15 * 60 * 1000);
  return _stravaRl.timestamps.length < 190; // 10 request safety buffer
}
export async function stravaRlThrottle() {
  while (!stravaRlCanProceed()) {
    const oldest = _stravaRl.timestamps[0];
    const wait = (oldest + 15 * 60 * 1000) - Date.now() + 1000;
    const waitSec = Math.ceil(wait / 1000);
    const el = document.getElementById('stravaProgressText');
    if (el) el.textContent = `Rate limited — waiting ${waitSec}s...`;
    await new Promise(r => setTimeout(r, Math.min(wait, 5000)));
  }
}

/* ── Strava sync state ── */
const _stravaSync = { inProgress: false, cancelled: false };

/* ── Strava activity type mapping ── */
export function stravaMapType(type) {
  const map = {
    'Ride': 'Ride', 'VirtualRide': 'VirtualRide', 'EBikeRide': 'Ride',
    'GravelRide': 'Ride', 'MountainBikeRide': 'Ride', 'Handcycle': 'Ride',
    'Run': 'Run', 'VirtualRun': 'VirtualRun', 'TrailRun': 'Run',
    'Swim': 'Swim', 'Walk': 'Walk', 'Hike': 'Hike',
    'NordicSki': 'NordicSki', 'AlpineSki': 'AlpineSki',
    'Rowing': 'Rowing', 'Kayaking': 'Kayaking',
    'WeightTraining': 'WeightTraining', 'Yoga': 'Yoga',
  };
  return map[type] || type || 'Other';
}

/* ── Strava activity builder ── */
export function stravaBuildActivity(detail, streams) {
  const a = {
    id: 'strava_' + detail.id,
    source: 'strava',
    strava_id: detail.id,
    name: detail.name || 'Strava Activity',
    type: stravaMapType(detail.type || detail.sport_type),
    start_date: detail.start_date,
    start_date_local: detail.start_date_local,
    moving_time: detail.moving_time || 0,
    elapsed_time: detail.elapsed_time || 0,
    distance: detail.distance || 0,
    total_ascent: detail.total_elevation_gain || 0,
    average_speed: (detail.average_speed || 0) * 3.6, // m/s → km/h
    max_speed: (detail.max_speed || 0) * 3.6,
    average_heartrate: detail.average_heartrate || 0,
    max_heartrate: detail.max_heartrate || 0,
    average_watts: detail.average_watts || 0,
    max_watts: detail.max_watts || 0,
    weighted_average_watts: detail.weighted_average_watts || 0,
    average_cadence: detail.average_cadence || 0,
    calories: detail.calories || 0,
    kilojoules: detail.kilojoules || 0,
    suffer_score: detail.suffer_score || 0,
    device_name: detail.device_name || '',
    has_power: !!detail.device_watts,
    description: detail.description || '',
    gear_id: detail.gear_id || null,
  };
  // GPS route from latlng stream
  if (streams && streams.latlng && streams.latlng.data) {
    const raw = streams.latlng.data.filter(p => p && p.length === 2 && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180);
    if (raw.length > 10) {
      const maxPts = 500;
      const step = Math.max(1, Math.floor(raw.length / maxPts));
      a.gps_route = raw.filter((_, i) => i % step === 0);
    }
  }
  // Extract streams for detail page
  a._streams = {};
  if (streams) {
    for (const key of ['watts', 'heartrate', 'cadence', 'velocity_smooth', 'altitude', 'distance', 'time', 'temp']) {
      if (streams[key] && streams[key].data) a._streams[key] = streams[key].data;
    }
  }
  return a;
}

/* ── Strava duplicate detection ── */
export function stravaIsDuplicate(stravaAct) {
  // Check existing Strava imports by strava_id
  try {
    const existing = JSON.parse(localStorage.getItem('icu_strava_activities') || '[]');
    if (existing.some(a => a.strava_id === stravaAct.id)) return true;
  } catch (_) {}
  // Fuzzy check against intervals.icu + FIT imports (timestamp ± 2 min + duration)
  const ts = new Date(stravaAct.start_date).getTime();
  const dur = stravaAct.moving_time || stravaAct.elapsed_time || 0;
  const all = [...(state.activities || []), ...(state.lifetimeActivities || [])];
  try {
    const fit = JSON.parse(localStorage.getItem('icu_fit_activities') || '[]');
    all.push(...fit);
  } catch (_) {}
  return all.some(a => {
    const aTs = new Date(a.start_date || a.start_date_local).getTime();
    const aDur = a.moving_time || a.elapsed_time || 0;
    return Math.abs(aTs - ts) < 120000 && (aDur === 0 || dur === 0 || Math.abs(aDur - dur) < 120);
  });
}

/* ── Strava IndexedDB for streams ── */
const STRAVA_DB_NAME = 'cycleiq_strava';
const STRAVA_DB_VER = 1;
export function _stravaOpenDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(STRAVA_DB_NAME, STRAVA_DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('streams')) db.createObjectStore('streams');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function stravaSaveStreamsToIDB(activityId, streams) {
  try {
    const db = await _stravaOpenDB();
    const tx = db.transaction('streams', 'readwrite');
    tx.objectStore('streams').put(streams, activityId);
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
    db.close();
  } catch (e) { console.warn('Failed to save Strava streams:', e); }
}
export async function stravaLoadStreamsFromIDB(activityId) {
  try {
    const db = await _stravaOpenDB();
    const tx = db.transaction('streams', 'readonly');
    const req = tx.objectStore('streams').get(activityId);
    const result = await new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = rej; });
    db.close();
    return result || null;
  } catch (e) { return null; }
}

/* ── Strava save activity ── */
export function stravaSaveActivity(activity) {
  const streams = activity._streams;
  delete activity._streams;
  const key = 'icu_strava_activities';
  const list = JSON.parse(localStorage.getItem(key) || '[]');
  list.push(activity);
  try { localStorage.setItem(key, JSON.stringify(list)); } catch (e) { console.warn('localStorage full:', e); }
  // GPS route to heatmap IndexedDB
  if (activity.gps_route && activity.gps_route.length > 10) {
    impSaveRouteToIDB(activity.id, activity.gps_route);
  }
  // Streams to Strava IndexedDB
  if (streams && Object.keys(streams).length > 0) {
    stravaSaveStreamsToIDB(activity.id, streams);
  }
}

/* ── Strava sync orchestrator ── */
export async function stravaSyncActivities(options = {}) {
  if (_stravaSync.inProgress) { showToast('Sync already in progress', 'error'); return; }
  if (!isStravaConnected()) { showToast('Not connected to Strava', 'error'); return; }
  _stravaSync.inProgress = true;
  _stravaSync.cancelled = false;
  const progressEl = document.getElementById('stravaProgress');
  const fillEl = document.getElementById('stravaProgressFill');
  const textEl = document.getElementById('stravaProgressText');
  const syncBtn = document.getElementById('stravaSyncBtn');
  if (progressEl) progressEl.style.display = '';
  if (syncBtn) syncBtn.disabled = true;

  function updateProgress(text, pct) {
    if (fillEl) fillEl.style.width = (pct || 0) + '%';
    if (textEl) textEl.textContent = text;
  }

  let totalNew = 0, totalSkipped = 0, errors = 0;
  try {
    // Determine time range
    const lastSync = options.fullSync ? null : localStorage.getItem('strava_last_sync');
    const after = lastSync ? Math.floor(new Date(lastSync).getTime() / 1000) - 172800 : null; // -2 days buffer

    // Phase 1: Fetch activity list
    updateProgress('Fetching activity list...', 0);
    let allActivities = [];
    let page = 1;
    const perPage = 100;
    while (true) {
      if (_stravaSync.cancelled) break;
      await stravaRlThrottle();
      let url = `athlete/activities?page=${page}&per_page=${perPage}`;
      if (after) url += `&after=${after}`;
      const activities = await stravaFetch(url);
      if (!activities || !activities.length) break;
      allActivities.push(...activities);
      updateProgress(`Found ${allActivities.length} activities...`, 0);
      page++;
    }

    if (_stravaSync.cancelled) { updateProgress('Cancelled', 0); return; }

    // Phase 2: Filter duplicates
    const skipDupes = document.getElementById('stravaOptDupes')?.checked !== false;
    const newActivities = skipDupes ? allActivities.filter(a => !stravaIsDuplicate(a)) : allActivities;
    totalSkipped = allActivities.length - newActivities.length;
    updateProgress(`${newActivities.length} new activities to import (${totalSkipped} skipped)`, 0);

    if (!newActivities.length) {
      updateProgress('All activities already imported!', 100);
      showToast(`No new activities found (${totalSkipped} already imported)`);
      return;
    }

    // Phase 3: Fetch details and streams for each new activity
    const fetchGPS = document.getElementById('stravaOptGPS')?.checked !== false;
    const fetchStreams = document.getElementById('stravaOptStreams')?.checked !== false;

    for (let i = 0; i < newActivities.length; i++) {
      if (_stravaSync.cancelled) break;
      const act = newActivities[i];
      const pct = Math.round(((i + 1) / newActivities.length) * 100);
      updateProgress(`Importing ${i + 1}/${newActivities.length}: ${act.name || 'Activity'}`, pct);

      try {
        await stravaRlThrottle();
        const detail = await stravaFetch(`activities/${act.id}`);
        let streams = null;
        if (fetchGPS || fetchStreams) {
          const streamKeys = [];
          if (fetchGPS) streamKeys.push('latlng');
          if (fetchStreams) streamKeys.push('watts', 'heartrate', 'cadence', 'velocity_smooth', 'altitude', 'distance', 'time', 'temp');
          await stravaRlThrottle();
          try {
            streams = await stravaFetch(`activities/${act.id}/streams?keys=${streamKeys.join(',')}&key_by_type=true`);
          } catch (_) { /* streams are optional */ }
        }
        const activity = stravaBuildActivity(detail, streams);
        stravaSaveActivity(activity);
        totalNew++;
      } catch (e) {
        console.warn(`Failed to import Strava activity ${act.id}:`, e);
        errors++;
      }
    }

    localStorage.setItem('strava_last_sync', new Date().toISOString());
    updateProgress(`Done! ${totalNew} imported, ${totalSkipped} skipped${errors ? ', ' + errors + ' errors' : ''}`, 100);
    showToast(`Strava sync complete: ${totalNew} new activities imported`, 'success');

    // Save sync to history
    const hist = JSON.parse(localStorage.getItem('strava_sync_history') || '[]');
    hist.unshift({ date: new Date().toISOString(), imported: totalNew, skipped: totalSkipped, errors, fullSync: !!options.fullSync });
    if (hist.length > 20) hist.length = 20;
    localStorage.setItem('strava_sync_history', JSON.stringify(hist));
    stravaRenderSyncHistory();

  } catch (e) {
    console.error('Strava sync error:', e);
    updateProgress('Error: ' + e.message, 0);
    showToast('Strava sync failed: ' + e.message, 'error');
  } finally {
    _stravaSync.inProgress = false;
    if (syncBtn) syncBtn.disabled = false;
  }
}

export function stravaCancelSync() {
  _stravaSync.cancelled = true;
  showToast('Cancelling sync...');
}

/* ── intervals.icu UI rendering (Import tab) ── */
export function icuRenderSyncUI() {
  const connectCard = document.getElementById('icuConnectCard');
  const syncCard    = document.getElementById('icuSyncCard');
  if (!connectCard || !syncCard) return;

  const connected = !!(state.athleteId && state.apiKey);
  connectCard.style.display = connected ? 'none' : '';
  syncCard.style.display    = connected ? '' : 'none';

  if (connected && state.athlete) {
    const a = state.athlete;
    const aName = a.name || a.firstname || 'Athlete';

    const titleEl = document.getElementById('icuAthleteTitle');
    if (titleEl) titleEl.textContent = aName;

    const badgeEl = document.getElementById('icuConnectionBadge');
    if (badgeEl) { badgeEl.textContent = 'Connected'; badgeEl.className = 'strava-badge strava-badge--connected'; }

    const idEl = document.getElementById('icuAthleteId');
    if (idEl) idEl.textContent = state.athleteId;

    const ftpEl = document.getElementById('icuFTP');
    if (ftpEl) ftpEl.textContent = a.ftp ? a.ftp + ' W' : '—';

    const lthrEl = document.getElementById('icuLTHR');
    if (lthrEl) lthrEl.textContent = a.lthr ? a.lthr + ' bpm' : '—';

    const weightEl = document.getElementById('icuWeight');
    if (weightEl) weightEl.textContent = a.weight ? a.weight.toFixed(1) + ' kg' : '—';

    // Sync stats
    const lastSyncEl = document.getElementById('icuSettingsLastSync');
    if (lastSyncEl) {
      const ts = localStorage.getItem('icu_last_sync');
      if (ts) {
        const diff = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
        lastSyncEl.textContent = diff < 1 ? 'Just now'
          : diff < 60 ? `${diff} min ago`
          : diff < 1440 ? `${Math.round(diff / 60)} hr ago`
          : new Date(ts).toLocaleDateString();
      } else {
        lastSyncEl.textContent = 'Never';
      }
    }

    const countEl = document.getElementById('icuActivityCount');
    if (countEl) countEl.textContent = state.activities ? state.activities.length.toLocaleString() : '0';

    const sizeEl = document.getElementById('icuCacheSize');
    if (sizeEl) {
      const raw = localStorage.getItem('icu_activity_cache');
      if (raw) {
        const bytes = new Blob([raw]).size;
        sizeEl.textContent = bytes > 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : (bytes / 1024).toFixed(0) + ' KB';
      } else {
        sizeEl.textContent = '—';
      }
    }

    // Storage bar, lifetime, smart poll, rate limit
    // Only call these when Import page is active (they reference const variables
    // that are in TDZ during initial script execution at startup)
    if (state.currentPage === 'import') {
      updateStorageBar();
      updateLifetimeCacheUI();
      pollRestore();
      rlUpdateUI();
    }
  } else if (!connected) {
    // Pre-fill credentials if saved
    const savedId  = localStorage.getItem('icu_athlete_id');
    const savedKey = localStorage.getItem('icu_api_key');
    if (savedId) {
      const el = document.getElementById('icuAthleteIdInput');
      if (el) el.value = savedId;
    }
    if (savedKey) {
      const el = document.getElementById('icuApiKeyInput');
      if (el) el.value = savedKey;
    }
  }

  // Pre-fill ORS API key if saved
  const savedOrsKey = localStorage.getItem('icu_ors_api_key');
  if (savedOrsKey) {
    const el = document.getElementById('orsApiKeyInput');
    if (el) el.value = savedOrsKey;
  }
}

export function saveOrsApiKey() {
  const input = document.getElementById('orsApiKeyInput');
  if (!input) return;
  const key = input.value.trim();
  if (key) {
    localStorage.setItem('icu_ors_api_key', key);
    if (window._rb) window._rb.orsApiKey = key;
    showToast('ORS API key saved — ORS profiles now available in Route Builder', 'success');
  } else {
    localStorage.removeItem('icu_ors_api_key');
    if (window._rb) window._rb.orsApiKey = '';
    showToast('ORS API key removed', 'info');
  }
}

export async function icuSaveAndConnect() {
  const idInput  = document.getElementById('icuAthleteIdInput');
  const keyInput = document.getElementById('icuApiKeyInput');
  if (!idInput || !keyInput) return;

  const athleteId = idInput.value.trim();
  const apiKey    = keyInput.value.trim();

  if (!athleteId || !apiKey) {
    showToast('Please enter both Athlete ID and API Key', 'error');
    return;
  }

  const btn = idInput.closest('.imp-panel').querySelector('.icu-connect-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner spinner-sm"></div> Connecting…'; }

  state.athleteId = athleteId;
  state.apiKey    = apiKey;

  try {
    await window.fetchAthleteProfile();
    window.saveCredentials(athleteId, apiKey);
    window.updateConnectionUI(true);
    await window.syncData();
  } catch (err) {
    const m = err.message || '';
    const isServerDown = m.includes('502') || m.includes('503') || m.includes('504') ||
                         m.includes('NetworkError') || m.includes('Failed to fetch') || m.includes('CORS') || m.includes('network');
    const msg = m.includes('401') ? 'Invalid credentials. Check your Athlete ID and API key.' :
                m.includes('403') ? 'Access denied. Verify your API key.' :
                m.includes('404') ? 'Athlete not found. Check your Athlete ID.' :
                m.includes('429') ? 'Rate limited by intervals.icu. Wait a few minutes.' :
                isServerDown      ? 'Can\'t reach intervals.icu — their server may be down. Try again shortly.' :
                'Connection failed: ' + m;
    showToast(msg, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg> Connect & Sync'; }
  }
}

/* ── Strava UI rendering ── */
export function stravaRenderSyncUI() {
  const connectCard = document.getElementById('stravaConnectCard');
  const syncCard = document.getElementById('stravaSyncCard');
  if (!connectCard || !syncCard) return;

  // Show the correct callback domain based on current host
  const domainEl = document.getElementById('stravaCallbackDomain');
  if (domainEl) domainEl.textContent = window.location.hostname || 'localhost';

  const connected = isStravaConnected();
  connectCard.style.display = connected ? 'none' : '';
  syncCard.style.display = connected ? '' : 'none';

  if (connected) {
    const athlete = JSON.parse(localStorage.getItem('strava_athlete') || 'null');
    const titleEl = document.getElementById('stravaAthleteTitle');
    if (titleEl && athlete) titleEl.textContent = `${athlete.firstname} ${athlete.lastname}`;
    const lastSync = localStorage.getItem('strava_last_sync');
    const lastEl = document.getElementById('stravaLastSync');
    if (lastEl) lastEl.textContent = lastSync ? `Last sync: ${new Date(lastSync).toLocaleString()}` : 'Never synced';
    stravaRenderSyncHistory();
  } else {
    // Pre-fill credentials if saved
    const creds = loadStravaCredentials();
    if (creds) {
      const idEl = document.getElementById('stravaClientId');
      const secEl = document.getElementById('stravaClientSecret');
      if (idEl) idEl.value = creds.clientId;
      if (secEl) secEl.value = creds.clientSecret;
    }
  }
}

export function stravaRenderSyncHistory() {
  const listEl = document.getElementById('stravaSyncHistoryList');
  const subEl = document.getElementById('stravaSyncHistorySub');
  if (!listEl) return;
  const hist = JSON.parse(localStorage.getItem('strava_sync_history') || '[]');
  if (subEl) subEl.textContent = hist.length ? `${hist.length} sync${hist.length > 1 ? 's' : ''}` : 'No syncs yet';
  if (!hist.length) { listEl.innerHTML = '<div class="imp-history-empty">No sync history</div>'; return; }
  listEl.innerHTML = hist.slice(0, 10).map(h => {
    const d = new Date(h.date);
    const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
                    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const dotCls = h.errors ? 'imp-hi-dot--error' : 'imp-hi-dot--ok';
    return `<div class="imp-history-item">
      <div class="imp-hi-dot ${dotCls}"></div>
      <div class="imp-hi-info">
        <div class="imp-hi-name">${h.fullSync ? 'Full Sync' : 'Incremental Sync'}</div>
        <div class="imp-hi-meta">${h.imported} imported · ${h.skipped} skipped${h.errors ? ' · ' + h.errors + ' errors' : ''}</div>
      </div>
      <div class="imp-hi-date">${dateStr}</div>
    </div>`;
  }).join('');
}

export function stravaSaveAndAuth() {
  const clientId = (document.getElementById('stravaClientId')?.value || '').trim();
  const clientSecret = (document.getElementById('stravaClientSecret')?.value || '').trim();
  if (!clientId || !clientSecret) { showToast('Please enter both Client ID and Client Secret', 'error'); return; }
  saveStravaCredentials(clientId, clientSecret);
  stravaStartAuth();
}

export function stravaClearActivities() {
  showConfirmDialog('Clear Strava Activities', 'This will remove all imported Strava activities. You can re-sync later.', () => {
    localStorage.removeItem('icu_strava_activities');
    localStorage.removeItem('strava_sync_history');
    localStorage.removeItem('strava_last_sync');
    stravaRenderSyncUI();
    showToast('Strava activities cleared');
  });
}

