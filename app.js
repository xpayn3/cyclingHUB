/* ====================================================
   STATE
==================================================== */
const state = {
  athleteId: null,
  apiKey: null,
  athlete: null,
  activities: [],
  fitness: null,
  wellnessHistory: {},
  rangeDays: 30,
  fitnessChart: null,
  weeklyChart: null,
  avgPowerChart: null,
  fitnessPageChart: null,
  fitnessWeeklyPageChart: null,
  fitnessRangeDays: 90,
  currentActivityIdx: null,
  activityPowerChart: null,
  activityHRChart: null,
  activityCurveChart: null,
  activityHistogramChart: null,
  powerCurveChart: null,
  powerCurve: null,
  powerCurveRange: null,
  weekProgressChart: null,
  weekProgressMetric: 'tss',
  weekStartDay: 1,          // 0=Sunday, 1=Monday
  efSparkChart: null,
  calMonth: null,
  currentPage: 'dashboard',
  previousPage: null,
  synced: false,
  activitiesSort: 'date',
  activitiesSortDir: 'desc',
  activitiesYear: new Date().getFullYear()   // default to current year; null = all years
};

const ICU_BASE = 'https://intervals.icu/api/v1';

/* ====================================================
   CREDENTIALS (localStorage)
==================================================== */
function saveCredentials(athleteId, apiKey) {
  localStorage.setItem('icu_athlete_id', athleteId);
  localStorage.setItem('icu_api_key', apiKey);
  state.athleteId = athleteId;
  state.apiKey = apiKey;
}

/* ====================================================
   ACTIVITY CACHE  (localStorage — survives page refresh)
==================================================== */
function saveActivityCache(activities) {
  try {
    localStorage.setItem('icu_activities_cache', JSON.stringify(activities));
    localStorage.setItem('icu_last_sync', new Date().toISOString());
  } catch (e) {
    // Quota exceeded — not fatal, next sync will just be a full fetch
    localStorage.removeItem('icu_activities_cache');
  }
}

function loadActivityCache() {
  try {
    const raw      = localStorage.getItem('icu_activities_cache');
    const lastSync = localStorage.getItem('icu_last_sync');
    if (raw && lastSync) {
      const activities = JSON.parse(raw);
      if (Array.isArray(activities) && activities.length > 0) {
        return { activities, lastSync: new Date(lastSync) };
      }
    }
  } catch (e) { /* ignore */ }
  return null;
}

function clearActivityCache() {
  localStorage.removeItem('icu_activities_cache');
  localStorage.removeItem('icu_last_sync');
}

function loadCredentials() {
  state.athleteId = localStorage.getItem('icu_athlete_id') || null;
  state.apiKey    = localStorage.getItem('icu_api_key')    || null;
  return !!(state.athleteId && state.apiKey);
}

function clearCredentials() {
  localStorage.removeItem('icu_athlete_id');
  localStorage.removeItem('icu_api_key');
  state.athleteId = null;
  state.apiKey = null;
  state.athlete = null;
  state.activities = [];
  state.fitness = null;
  state.wellnessHistory = {};
  state.synced = false;
}

function authHeader() {
  const token = btoa('API_KEY:' + state.apiKey);
  return { 'Authorization': 'Basic ' + token };
}

/* ====================================================
   API CALLS
==================================================== */
async function icuFetch(path) {
  const res = await fetch(ICU_BASE + path, {
    headers: { ...authHeader(), 'Accept': 'application/json' }
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

async function fetchAthleteProfile() {
  const data = await icuFetch(`/athlete/${state.athleteId}`);
  state.athlete = data;
  return data;
}

// since: optional Date — if provided, only fetches activities on/after that date (incremental mode)
// Fetch activities using date-based pagination (more reliable than offset with intervals.icu).
// Each page walks the ceiling backwards to the oldest date in the previous chunk so we
// never miss activities when a date-range returns more than one page.
async function fetchActivities(daysBack = null, since = null) {
  if (daysBack === null) daysBack = defaultSyncDays(); // covers Jan 1 of last year
  const hardOldest = since ? toDateStr(since) : toDateStr(daysAgo(daysBack));
  const pageSize   = 200;
  const seen       = new Set();
  const all        = [];

  let ceiling = toDateStr(new Date()); // start from today, walk backwards

  for (let guard = 0; guard < 30; guard++) {
    const data = await icuFetch(
      `/athlete/${state.athleteId}/activities?oldest=${hardOldest}&newest=${ceiling}&limit=${pageSize}`
    );
    const chunk = Array.isArray(data) ? data : (data.activities || []);
    if (!chunk.length) break;

    let added = 0;
    for (const a of chunk) {
      if (!seen.has(a.id)) { seen.add(a.id); all.push(a); added++; }
    }

    // Full page → there may be more; walk the ceiling back past the oldest date in this chunk.
    if (chunk.length >= pageSize) {
      const oldestDateInChunk = chunk.reduce((min, a) => {
        const d = (a.start_date_local || a.start_date || '').slice(0, 10);
        return (!min || d < min) ? d : min;
      }, '');
      if (!oldestDateInChunk || oldestDateInChunk <= hardOldest) break;
      // Step ceiling back by 1 day so next request doesn't re-fetch the same boundary day
      const prev = new Date(oldestDateInChunk);
      prev.setDate(prev.getDate() - 1);
      const prevStr = toDateStr(prev);
      if (prevStr <= hardOldest) break;
      ceiling = prevStr;
      if (added === 0) break; // safety: got a full chunk but all dupes — stop
    } else {
      break; // partial page → reached the end of the window
    }
  }

  // Sort newest-first to match the rest of the app
  all.sort((a, b) =>
    new Date(b.start_date_local || b.start_date) - new Date(a.start_date_local || a.start_date)
  );

  if (since) {
    // Incremental: merge fresh activities into existing cache.
    // Retain anything in cache that is within the fetch window and wasn't just re-fetched.
    const freshIds = new Set(all.map(a => a.id));
    const cutoff   = daysAgo(daysBack);
    const retained = state.activities.filter(
      a => !freshIds.has(a.id) && new Date(a.start_date_local || a.start_date) >= cutoff
    );
    state.activities = [...retained, ...all].sort(
      (a, b) => new Date(b.start_date_local || b.start_date) - new Date(a.start_date_local || a.start_date)
    );
  } else {
    state.activities = all;
  }
  return state.activities;
}

async function fetchFitness() {
  const newest = toDateStr(new Date());
  const oldest = toDateStr(daysAgo(400));
  const data = await icuFetch(
    `/athlete/${state.athleteId}/wellness?oldest=${oldest}&newest=${newest}`
  );
  const entries = Array.isArray(data) ? data : [];

  // Build date-keyed map of exact CTL/ATL/TSB from intervals.icu
  state.wellnessHistory = {};
  entries.forEach(e => {
    if (e.id) state.wellnessHistory[e.id] = e;
  });

  // Most recent entry with actual fitness values for the gauge cards
  const withFitness = entries.filter(e => e.ctl != null).reverse();
  if (withFitness.length > 0) {
    const latest = withFitness[0];
    state.fitness = {
      ctl: latest.ctl,
      atl: latest.atl,
      tsb: latest.tsb != null ? latest.tsb : (latest.ctl - latest.atl),
      rampRate: latest.rampRate
    };
  }
  return state.fitness;
}

/* ====================================================
   MODAL
==================================================== */
function openModal() {
  const modal = document.getElementById('connectModal');
  modal.classList.add('open');
  if (state.athleteId) document.getElementById('inputAthleteId').value = state.athleteId;
  if (state.apiKey)    document.getElementById('inputApiKey').value    = state.apiKey;
  document.getElementById('modalCloseBtn').style.display = (state.athleteId && state.apiKey) ? 'flex' : 'none';
}

function closeModal() {
  document.getElementById('connectModal').classList.remove('open');
}

function toggleApiKeyVisibility() {
  const input = document.getElementById('inputApiKey');
  const icon  = document.getElementById('eyeIcon');
  if (input.type === 'password') {
    input.type = 'text';
    icon.innerHTML = `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>`;
  } else {
    input.type = 'password';
    icon.innerHTML = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
  }
}

async function handleConnect() {
  const athleteId = document.getElementById('inputAthleteId').value.trim();
  const apiKey    = document.getElementById('inputApiKey').value.trim();
  let valid = true;

  document.getElementById('errAthleteId').classList.remove('show');
  document.getElementById('errApiKey').classList.remove('show');
  document.getElementById('inputAthleteId').classList.remove('error');
  document.getElementById('inputApiKey').classList.remove('error');

  if (!athleteId) {
    document.getElementById('errAthleteId').classList.add('show');
    document.getElementById('inputAthleteId').classList.add('error');
    valid = false;
  }
  if (!apiKey) {
    document.getElementById('errApiKey').classList.add('show');
    document.getElementById('inputApiKey').classList.add('error');
    valid = false;
  }
  if (!valid) return;

  const btn = document.getElementById('connectBtn');
  btn.disabled = true;
  btn.innerHTML = `<div class="spinner spinner-sm"></div> Connecting…`;

  state.athleteId = athleteId;
  state.apiKey    = apiKey;

  try {
    await fetchAthleteProfile();
    saveCredentials(athleteId, apiKey);
    closeModal();
    updateConnectionUI(true);
    await syncData();
  } catch (err) {
    const msg = err.message.includes('401') ? 'Invalid credentials. Check your Athlete ID and API key.' :
                err.message.includes('403') ? 'Access denied. Verify your API key.' :
                err.message.includes('404') ? 'Athlete not found. Check your Athlete ID.' :
                'Connection failed: ' + err.message;
    showToast(msg, 'error');
    document.getElementById('inputAthleteId').classList.add('error');
    document.getElementById('inputApiKey').classList.add('error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Connect &amp; Sync`;
  }
}

/* ====================================================
   SYNC
==================================================== */
async function syncData() {
  if (!state.athleteId || !state.apiKey) {
    openModal();
    return;
  }

  const btn = document.getElementById('syncBtn');
  btn.classList.add('btn-spinning');
  btn.disabled = true;

  try {
    if (!state.athlete) await fetchAthleteProfile();

    // Decide between incremental and full sync
    const cache = loadActivityCache();
    const isIncremental = !!(cache && cache.activities.length > 0);

    if (isIncremental) {
      // Load cache into state immediately so the UI can render while we fetch
      state.activities = cache.activities;
      state.synced = true;
      updateConnectionUI(true);
      renderDashboard();

      // Fetch only activities since last sync minus 2-day buffer (extra buffer for timezone safety)
      const since = new Date(cache.lastSync);
      since.setDate(since.getDate() - 2);
      setLoading(true, 'Checking for new activities…');
      await fetchActivities(null, since);
    } else {
      const days = defaultSyncDays();
      setLoading(true, `Loading activities — syncing ${days} days…`);
      await fetchActivities(days);
    }

    // Save updated cache after a successful fetch
    saveActivityCache(state.activities);

    setLoading(true, 'Loading fitness data…');
    await fetchFitness().catch(() => null); // non-fatal

    // Invalidate power curve cache so it re-fetches with fresh range
    state.powerCurve = null;
    state.powerCurveRange = null;

    state.synced = true;
    updateConnectionUI(true);
    renderDashboard();
    if (state.currentPage === 'calendar') renderCalendar();

    const newCount = isIncremental
      ? state.activities.filter(a => {
          const d = new Date(a.start_date_local || a.start_date);
          return d >= new Date(cache.lastSync - 86400000);
        }).length
      : state.activities.filter(a => !isEmptyActivity(a)).length;

    showToast(
      isIncremental
        ? `Up to date · ${newCount} new activit${newCount === 1 ? 'y' : 'ies'}`
        : `Synced ${newCount} activities`,
      'success'
    );
  } catch (err) {
    const msg = err.message.includes('401') || err.message.includes('403')
      ? 'Authentication failed. Please reconnect.'
      : 'Sync failed: ' + err.message;
    showToast(msg, 'error');
  } finally {
    setLoading(false);
    btn.classList.remove('btn-spinning');
    btn.disabled = false;
  }
}

function disconnect() {
  if (!confirm('Disconnect and clear saved credentials?')) return;
  clearCredentials();
  clearActivityCache();
  updateConnectionUI(false);
  resetDashboard();
  showToast('Disconnected', 'info');
}

/* ====================================================
   PROFILE PICTURE
==================================================== */
function loadAvatar() {
  const stored = localStorage.getItem('icu_avatar');
  applyAvatar(stored);
}

function applyAvatar(dataUrl) {
  const sidebarAv  = document.getElementById('athleteAvatar');
  const previewAv  = document.getElementById('avatarPreview');
  const removeBtn  = document.getElementById('avatarRemoveBtn');
  if (dataUrl) {
    const img = `<img src="${dataUrl}" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    if (sidebarAv) { sidebarAv.innerHTML = img; sidebarAv.style.background = 'none'; }
    if (previewAv) { previewAv.innerHTML = img; previewAv.style.background = 'none'; }
    if (removeBtn) removeBtn.style.display = 'inline-flex';
  } else {
    // Revert to initials
    const aName = state.athlete ? (state.athlete.name || state.athlete.firstname || '?') : '?';
    const initial = aName[0].toUpperCase();
    if (sidebarAv) { sidebarAv.textContent = initial; sidebarAv.style.background = ''; }
    if (previewAv) { previewAv.textContent = initial; previewAv.style.background = ''; }
    if (removeBtn) removeBtn.style.display = 'none';
  }
}

function handleAvatarUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('Please select an image file', 'error'); return; }
  const reader = new FileReader();
  reader.onload = ev => {
    // Downscale to max 200×200 to keep localStorage usage small
    const img = new Image();
    img.onload = () => {
      const size = 200;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      // Cover-crop: centre the image
      const scale = Math.max(size / img.width, size / img.height);
      const sw = size / scale, sh = size / scale;
      const sx = (img.width - sw) / 2, sy = (img.height - sh) / 2;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      localStorage.setItem('icu_avatar', dataUrl);
      applyAvatar(dataUrl);
      showToast('Profile photo updated', 'success');
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
  // Reset input so the same file can be re-selected
  e.target.value = '';
}

function removeAvatar() {
  localStorage.removeItem('icu_avatar');
  applyAvatar(null);
  showToast('Profile photo removed', 'info');
}

// Force a full re-fetch from scratch, ignoring any cached activities.
// Useful when activities appear missing, especially on the 1-year view.
function forceFullSync() {
  if (!state.athleteId || !state.apiKey) { openModal(); return; }
  clearActivityCache();          // wipe local cache so syncData() treats this as a fresh install
  state.activities = [];         // clear in-memory list too
  showToast('Cache cleared — starting full re-sync…', 'info');
  syncData();
}

/* ====================================================
   CONNECTION UI
==================================================== */
function updateConnectionUI(connected) {
  const dot   = document.getElementById('connectionDot');
  const name  = document.getElementById('athleteName');
  const sub   = document.getElementById('athleteSub');
  const av    = document.getElementById('athleteAvatar');
  const lbl   = document.getElementById('connectBtnLabel');
  const badge = document.getElementById('settingsConnectionBadge');
  const btext = document.getElementById('settingsConnectionText');
  const sid   = document.getElementById('settingsAthleteId');
  const skey  = document.getElementById('settingsApiKey');

  if (connected && state.athlete) {
    const a = state.athlete;
    const aName = a.name || a.firstname || 'Athlete';
    dot.className    = 'connection-dot connected';
    name.textContent = aName;
    sub.textContent  = a.city || 'intervals.icu';
    av.textContent   = aName[0].toUpperCase();
    lbl.textContent  = 'Reconnect';
    badge.className  = 'connection-status-badge connected';
    btext.textContent = 'Connected';
    sid.textContent  = state.athleteId || '—';
    skey.textContent = state.apiKey ? '••••••••' + state.apiKey.slice(-4) : '—';

    // Athlete profile card
    const el = id => document.getElementById(id);
    if (el('settingsAthleteName')) el('settingsAthleteName').textContent = aName;
    if (el('settingsFTP'))    el('settingsFTP').textContent    = a.ftp   ? a.ftp + ' W'   : '—';
    if (el('settingsLTHR'))   el('settingsLTHR').textContent   = a.lthr  ? a.lthr + ' bpm': '—';
    if (el('settingsWeight')) el('settingsWeight').textContent = a.weight ? a.weight + ' kg' : '—';
    const loc = [a.city, a.country].filter(Boolean).join(', ');
    if (el('settingsLocation')) el('settingsLocation').textContent = loc || '—';

    // Sync avatar preview with whatever is stored (photo or initial)
    applyAvatar(localStorage.getItem('icu_avatar'));

    // Data & sync card
    const lastSync = localStorage.getItem('icu_last_sync');
    if (el('settingsLastSync')) {
      if (lastSync) {
        const diff = Math.round((Date.now() - new Date(lastSync)) / 60000);
        el('settingsLastSync').textContent = diff < 1 ? 'Just now'
          : diff < 60 ? `${diff} min ago`
          : diff < 1440 ? `${Math.round(diff / 60)} hr ago`
          : new Date(lastSync).toLocaleDateString();
      } else {
        el('settingsLastSync').textContent = 'Never';
      }
    }
    if (el('settingsActivityCount')) {
      el('settingsActivityCount').textContent = state.activities.length
        ? state.activities.length.toLocaleString() + ' activities'
        : '—';
    }
    if (el('settingsCacheSize')) {
      try {
        const bytes = new Blob([localStorage.getItem('icu_activities_cache') || '']).size;
        el('settingsCacheSize').textContent = bytes > 1048576
          ? (bytes / 1048576).toFixed(1) + ' MB'
          : (bytes / 1024).toFixed(0) + ' KB';
      } catch { el('settingsCacheSize').textContent = '—'; }
    }
  } else {
    dot.className   = 'connection-dot disconnected';
    name.textContent = 'Not connected';
    sub.textContent  = 'Click to connect';
    av.textContent   = '?';
    lbl.textContent  = 'Connect';
    badge.className  = 'connection-status-badge disconnected';
    btext.textContent = 'Not connected';
    sid.textContent  = '—';
    skey.textContent = '—';
    ['settingsAthleteName','settingsFTP','settingsLTHR','settingsWeight','settingsLocation',
     'settingsLastSync','settingsActivityCount','settingsCacheSize'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '—';
    });
  }
}

/* ====================================================
   NAVIGATION
==================================================== */
function toggleSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  const burger   = document.getElementById('burgerBtn');
  const open     = sidebar.classList.toggle('open');
  backdrop.classList.toggle('open', open);
  burger?.classList.toggle('is-open', open);
}

function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebarBackdrop')?.classList.remove('open');
  document.getElementById('burgerBtn')?.classList.remove('is-open');
}

function navigate(page) {
  state.previousPage = state.currentPage;
  state.currentPage  = page;
  try { sessionStorage.setItem('icu_route', JSON.stringify({ type: 'page', page })); } catch {}

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page)?.classList.add('active');
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');

  const info = {
    dashboard: ['Dashboard', `Overview · Last ${state.rangeDays} days`],
    activities: ['Activities', 'All recorded rides & workouts'],
    calendar:   ['Calendar', 'Planned workouts & events'],
    fitness:    ['Fitness', 'CTL · ATL · TSB history'],
    power:      ['Power Curve', 'Best efforts across durations'],
    zones:      ['Training Zones', 'Time in zone breakdown'],
    settings:   ['Settings', 'Account & connection'],
    workout:    ['Create Workout', 'Build & export custom cycling workouts'],
    guide:      ['Training Guide', 'Understanding CTL · ATL · TSB & training load']
  };
  const [title, sub] = info[page] || ['CycleIQ', ''];
  document.getElementById('pageTitle').textContent    = title;
  document.getElementById('pageSubtitle').textContent = sub;

  // Calendar fills full viewport height — toggle padding-less mode on the scroll container
  const pc = document.getElementById('pageContent');
  if (pc) pc.classList.toggle('page-content--calendar', page === 'calendar');

  // Show topbar range pill only on pages where it makes sense
  const pill = document.getElementById('dateRangePill');
  if (pill) pill.style.display = (page === 'dashboard') ? 'flex' : 'none';

  // Hide topbar + headline on calendar (full-viewport layout) and activity pages
  const isFullViewport = (page === 'calendar');
  document.querySelector('.topbar')?.classList.toggle('topbar--hidden', isFullViewport);
  document.querySelector('.page-headline')?.classList.toggle('page-headline--hidden', isFullViewport);

  if (page === 'calendar') renderCalendar();
  if (page === 'fitness')  renderFitnessPage();
  if (page === 'workout')  { wrkRefreshStats(); wrkRender(); }

  window.scrollTo(0, 0);
}

/* ====================================================
   UNITS  (metric / imperial)
==================================================== */
function loadUnits() {
  state.units = localStorage.getItem('icu_units') || 'metric';
}

function setUnits(units) {
  state.units = units;
  localStorage.setItem('icu_units', units);
  document.querySelectorAll('[data-units]').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.units === units)
  );
  const elevEl = document.getElementById('settingsElevUnit');
  if (elevEl) elevEl.textContent = units === 'imperial' ? 'feet' : 'metres';
  if (state.synced) {
    renderDashboard();
    if (state.currentPage === 'activities') renderActivityList();
  }
}

// Distance: input in metres, returns { val, unit }
function fmtDist(metres) {
  if (state.units === 'imperial') {
    return { val: (metres / 1609.344).toFixed(1), unit: 'mi' };
  }
  return { val: (metres / 1000).toFixed(1), unit: 'km' };
}

// Speed: input in m/s, returns { val, unit }
function fmtSpeed(ms) {
  if (state.units === 'imperial') {
    return { val: (ms * 2.23694).toFixed(1), unit: 'mph' };
  }
  return { val: (ms * 3.6).toFixed(1), unit: 'km/h' };
}

// Elevation: input in metres, returns { val, unit }
function fmtElev(metres) {
  if (state.units === 'imperial') {
    return { val: Math.round(metres * 3.28084).toLocaleString(), unit: 'ft' };
  }
  return { val: Math.round(metres).toLocaleString(), unit: 'm' };
}

/* ====================================================
   DATE RANGE & WEEK START
==================================================== */
function setWeekStartDay(day) {
  // day: 0=Sunday, 1=Monday
  state.weekStartDay = day;
  localStorage.setItem('icu_week_start_day', day);
  // Sync toggle buttons in settings
  document.querySelectorAll('[data-weekstart]').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.weekstart) === day);
  });
  // Re-render all week-dependent views
  if (state.synced) {
    renderWeekProgress();
    renderFitnessStreak();
  }
  if (state.currentPage === 'calendar') renderCalendar();
}

function rangeLabel(days) {
  return days === 365 ? 'Last year' : `Last ${days} days`;
}

function setRange(days) {
  state.rangeDays = days;
  localStorage.setItem('icu_range_days', days);
  // Sync topbar pill
  document.querySelectorAll('#dateRangePill button').forEach(b => b.classList.remove('active'));
  document.getElementById('range' + days)?.classList.add('active');
  // Sync settings default-range pill
  document.querySelectorAll('[data-defrange]').forEach(b =>
    b.classList.toggle('active', parseInt(b.dataset.defrange) === days)
  );
  // Update Training Load card range label
  const lbl = document.getElementById('fitnessRangeLabel');
  if (lbl) lbl.textContent = rangeLabel(days);
  if (state.synced) renderDashboard();
}

// Alias used by the settings page default-range buttons
function setDefaultRange(days) { setRange(days); }

/* ====================================================
   ACTIVITIES SORT
==================================================== */
const SORT_FIELDS = {
  date:      a => new Date(a.start_date_local || a.start_date).getTime(),
  distance:  a => actVal(a, 'distance', 'icu_distance'),
  time:      a => actVal(a, 'moving_time', 'elapsed_time', 'icu_moving_time', 'icu_elapsed_time'),
  elevation: a => actVal(a, 'total_elevation_gain', 'icu_total_elevation_gain'),
  power:     a => actVal(a, 'icu_weighted_avg_watts', 'average_watts', 'icu_average_watts'),
  bpm:       a => actVal(a, 'average_heartrate', 'icu_average_heartrate'),
};

function sortedAllActivities() {
  let pool = state.activities.filter(a => !isEmptyActivity(a));
  if (state.activitiesYear !== null) {
    pool = pool.filter(a => {
      const d = new Date(a.start_date_local || a.start_date);
      return d.getFullYear() === state.activitiesYear;
    });
  }
  const fn  = SORT_FIELDS[state.activitiesSort] || SORT_FIELDS.date;
  const dir = state.activitiesSortDir === 'asc' ? 1 : -1;
  return [...pool].sort((a, b) => dir * (fn(a) - fn(b)));
}

function setActivitiesYear(year) {
  state.activitiesYear = year === 'all' ? null : parseInt(year);
  renderAllActivitiesList();
}

function setActivitiesSort(field) {
  if (state.activitiesSort === field) {
    state.activitiesSortDir = state.activitiesSortDir === 'desc' ? 'asc' : 'desc';
  } else {
    state.activitiesSort    = field;
    state.activitiesSortDir = 'desc';
  }
  renderAllActivitiesList();
  updateSortButtons();
}

function updateSortButtons() {
  document.querySelectorAll('.sort-btn').forEach(btn => {
    const f = btn.dataset.sort;
    const active = f === state.activitiesSort;
    btn.classList.toggle('active', active);
    const arrow = btn.querySelector('.sort-arrow');
    if (arrow) arrow.textContent = active ? (state.activitiesSortDir === 'desc' ? ' ↓' : ' ↑') : '';
  });
}

function renderAllActivitiesList() {
  const sorted = sortedAllActivities();
  const yearLabel = state.activitiesYear !== null ? ` · ${state.activitiesYear}` : '';
  document.getElementById('allActivitiesSubtitle').textContent =
    `${sorted.length} activities${yearLabel}`;
  // Count placeholder activities (planned workouts never completed — all metrics zero).
  // These exist in the intervals.icu /activities endpoint but have no recorded data.
  let allPool = state.activities.filter(a => !!(a.start_date_local || a.start_date));
  if (state.activitiesYear !== null) {
    allPool = allPool.filter(a => {
      const d = new Date(a.start_date_local || a.start_date);
      return d.getFullYear() === state.activitiesYear;
    });
  }
  const emptyCount = allPool.filter(a => isEmptyActivity(a)).length;

  // Render the list first (it overwrites innerHTML), then prepend the note at the top
  renderActivityList('allActivityList', sorted);
  const listEl = document.getElementById('allActivityList');
  if (listEl && emptyCount > 0) {
    const note = document.createElement('div');
    note.className = 'act-empty-note';
    note.textContent = `+ ${emptyCount} planned ${emptyCount === 1 ? 'workout' : 'workouts'} with no recorded data`;
    listEl.insertBefore(note, listEl.firstChild);
  }

  _refreshYearDropdown();
}

function _refreshYearDropdown() {
  const sel = document.getElementById('activitiesYearSelect');
  if (!sel) return;

  // Collect distinct years from ALL (unfiltered) activities
  const currentYear = new Date().getFullYear();
  const years = new Set();
  state.activities.forEach(a => {
    if (!isEmptyActivity(a)) {
      const y = new Date(a.start_date_local || a.start_date).getFullYear();
      if (!isNaN(y)) years.add(y);
    }
  });

  // Ensure the last 4 years are always present in the list
  for (let y = currentYear; y > currentYear - 4; y--) years.add(y);

  const sorted = [...years].sort((a, b) => b - a); // newest first

  // Re-build options only if they changed (avoids flicker)
  const desired = ['all', ...sorted.map(String)];
  const current = [...sel.options].map(o => o.value);
  if (JSON.stringify(desired) === JSON.stringify(current)) return;

  sel.innerHTML = '';
  // "All" option
  const allOpt = document.createElement('option');
  allOpt.value = 'all';
  allOpt.textContent = 'All years';
  sel.appendChild(allOpt);

  sorted.forEach(y => {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y === currentYear ? `${y} (current)` : String(y);
    sel.appendChild(opt);
  });

  // Restore selected value
  sel.value = state.activitiesYear !== null ? String(state.activitiesYear) : 'all';
}

/* ====================================================
   RENDER DASHBOARD
==================================================== */
function renderDashboard() {
  const days   = state.rangeDays;
  const cutoff = daysAgo(days);
  const recent = state.activities.filter(a =>
    new Date(a.start_date_local || a.start_date) >= cutoff && !isEmptyActivity(a)
  );

  // ── Weekly aggregates for top stat cards ───────────────────────────────────
  const today         = new Date();
  const thisWeekStart = getWeekStart(today);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(thisWeekStart.getDate() - 7);
  const thisWeekStr = toDateStr(thisWeekStart);
  const lastWeekStr = toDateStr(lastWeekStart);

  function aggWeek(startStr, endStr) {
    let tss = 0, dist = 0, time = 0, elev = 0, pow = 0, powN = 0, count = 0;
    state.activities.forEach(a => {
      if (isEmptyActivity(a)) return;
      const d = (a.start_date_local || a.start_date || '').slice(0, 10);
      if (d < startStr || (endStr && d >= endStr)) return;
      count++;
      tss  += actVal(a, 'icu_training_load', 'tss');
      dist += actVal(a, 'distance', 'icu_distance') / 1000;
      time += actVal(a, 'moving_time', 'elapsed_time', 'icu_moving_time', 'icu_elapsed_time') / 3600;
      elev += actVal(a, 'total_elevation_gain', 'icu_total_elevation_gain');
      const w = actVal(a, 'icu_weighted_avg_watts', 'average_watts', 'icu_average_watts');
      if (w > 0) { pow += w; powN++; }
    });
    return { tss, dist, time, elev, pow: powN > 0 ? Math.round(pow / powN) : 0, powN, count };
  }

  const tw = aggWeek(thisWeekStr, null);       // this week: Mon → today
  const lw = aggWeek(lastWeekStr, thisWeekStr); // last week: Mon → Sun

  // Trend helper — returns { text, cls } for stat-delta
  function trend(cur, prev, opts = {}) {
    if (cur === 0 && prev === 0) return { text: 'no data yet', cls: 'neutral' };
    if (prev === 0) return { text: 'new this week', cls: 'up' };
    const pct = (cur - prev) / prev * 100;
    if (Math.abs(pct) < 1) return { text: '→ same as last wk', cls: 'neutral' };
    const arrow = pct > 0 ? '↑' : '↓';
    const cls   = pct > 0 ? 'up' : 'down';
    const label = opts.fmt
      ? `${arrow} ${opts.fmt(cur - prev)} vs last wk`
      : `${arrow} ${Math.abs(Math.round(pct))}% vs last wk`;
    return { text: label, cls };
  }

  function applyTrend(id, cur, prev, opts) {
    const el = document.getElementById(id);
    if (!el) return;
    const { text, cls } = trend(cur, prev, opts);
    el.textContent = text;
    el.className   = `stat-delta ${cls}`;
  }

  // ── Update stat values (this week) ─────────────────────────────────────────
  document.getElementById('statTSS').innerHTML   = `${Math.round(tw.tss)}<span class="unit"> tss</span>`;
  document.getElementById('statDist').innerHTML  = `${tw.dist.toFixed(1)}<span class="unit"> km</span>`;
  document.getElementById('statTime').innerHTML  = `${tw.time.toFixed(1)}<span class="unit"> h</span>`;
  document.getElementById('statElev').innerHTML  = `${Math.round(tw.elev).toLocaleString()}<span class="unit"> m</span>`;
  document.getElementById('statCount').textContent = tw.count;
  document.getElementById('statPower').innerHTML = tw.powN
    ? `${tw.pow}<span class="unit"> w</span>`
    : `—<span class="unit"> w</span>`;

  // ── Trend deltas ───────────────────────────────────────────────────────────
  applyTrend('statTSSDelta',  tw.tss,   lw.tss);
  applyTrend('statDistDelta', tw.dist,  lw.dist);
  applyTrend('statTimeDelta', tw.time,  lw.time);
  applyTrend('statElevDelta', tw.elev,  lw.elev);
  applyTrend('statPowerDelta', tw.pow,  lw.pow,
    { fmt: d => `${d >= 0 ? '+' : ''}${d} W` });

  // Activity count: show absolute diff (small numbers, % not meaningful)
  const countEl = document.getElementById('statCountDelta');
  if (countEl) {
    const diff = tw.count - lw.count;
    if      (tw.count === 0 && lw.count === 0) { countEl.textContent = 'no rides yet';       countEl.className = 'stat-delta neutral'; }
    else if (lw.count === 0)                   { countEl.textContent = 'new this week';       countEl.className = 'stat-delta up'; }
    else if (diff === 0)                        { countEl.textContent = '→ same as last wk';  countEl.className = 'stat-delta neutral'; }
    else {
      const arrow = diff > 0 ? '↑' : '↓';
      countEl.textContent = `${arrow} ${Math.abs(diff)} vs last wk`;
      countEl.className   = `stat-delta ${diff > 0 ? 'up' : 'down'}`;
    }
  }

  // Week range label above stat grid  (e.g. "Mon Feb 17 – today")
  const wkRangeEl = document.getElementById('statGridWeekRange');
  if (wkRangeEl) {
    const startFmt = thisWeekStart.toLocaleDateString('default', { month: 'short', day: 'numeric' });
    const endFmt   = today.toLocaleDateString('default', { month: 'short', day: 'numeric' });
    wkRangeEl.textContent = `${startFmt} – ${endFmt}`;
  }

  document.getElementById('activitiesSubtitle').textContent    = `Last ${days} days · ${recent.length} activities`;
  document.getElementById('allActivitiesSubtitle').textContent = `${state.activities.filter(a => !isEmptyActivity(a)).length} total`;

  // Fitness gauges removed — elements no longer in DOM

  renderActivityList('activityList', recent.slice(0, 10));
  renderAllActivitiesList();
  updateSortButtons();
  renderWeekProgress();
  renderTrainingStatus();
  renderFitnessChart(recent, days);
  renderWeeklyChart(recent);
  renderAvgPowerChart(recent);
  renderZoneDist(recent);
  renderPowerCurve(); // async — fetches if range changed
}

function resetDashboard() {
  ['statTSS', 'statDist', 'statTime', 'statElev', 'statPower'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { const u = el.querySelector('.unit'); el.innerHTML = '—'; if (u) el.appendChild(u); }
  });
  document.getElementById('statCount').textContent = '—';
  ['statTSSDelta','statDistDelta','statTimeDelta','statElevDelta','statCountDelta','statPowerDelta'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = 'Sync to load'; el.className = 'stat-delta neutral'; }
  });
  document.getElementById('activityList').innerHTML = `
    <div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
      <p>Connect your account to see activities.</p>
      <button class="btn btn-primary" onclick="openModal()">Connect intervals.icu</button>
    </div>`;
  if (state.avgPowerChart)      { state.avgPowerChart.destroy();      state.avgPowerChart      = null; }
  if (state.powerCurveChart)    { state.powerCurveChart.destroy();    state.powerCurveChart    = null; }
  if (state.weekProgressChart)  { state.weekProgressChart.destroy();  state.weekProgressChart  = null; }
  if (state.efSparkChart)       { state.efSparkChart.destroy();       state.efSparkChart       = null; }
  state.powerCurve = null; state.powerCurveRange = null;
  const zc = document.getElementById('zoneDistCard');
  if (zc) zc.style.display = 'none';
  const pc = document.getElementById('powerCurveCard');
  if (pc) pc.style.display = 'none';
}

/* ====================================================
   ACTIVITY LIST
==================================================== */
const sportIcon = {
  ride:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="5" cy="17" r="2"/><circle cx="19" cy="17" r="2"/><path d="M5 17H3v-4l2-5h8l3 5h1a2 2 0 0 1 2 2v2h-2"/><path d="M9 17h6"/></svg>`,
  run:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M13 4a1 1 0 1 0 2 0 1 1 0 0 0-2 0"/><path d="m6 20 5-8 2 3 2-2 3 4"/><path d="m6 12 2-5 4 1 2 3"/></svg>`,
  swim:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12h20M2 17c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2"/><path d="M17 8a2 2 0 0 0-4 0l-1 4h6l-1-4z"/></svg>`,
  default: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`
};

// Resolve the sport type string, checking all known field variants
function actSportType(a) {
  return (a.sport_type || a.type || a.icu_sport_type || a.activity_type || '').toLowerCase();
}

function activityTypeClass(a) {
  const t = actSportType(a);
  if (t.includes('run'))  return 'run';
  if (t.includes('swim')) return 'swim';
  return '';
}

function activityTypeIcon(a) {
  const t = actSportType(a);
  if (t.includes('run'))  return sportIcon.run;
  if (t.includes('swim')) return sportIcon.swim;
  return sportIcon.ride;
}

function activityFallbackName(a) {
  const t = actSportType(a);
  if (t.includes('virtualride') || t.includes('virtual_ride')) return 'Virtual Ride';
  if (t.includes('ride'))    return 'Ride';
  if (t.includes('run'))     return 'Run';
  if (t.includes('swim'))    return 'Swim';
  if (t.includes('walk'))    return 'Walk';
  if (t.includes('hike'))    return 'Hike';
  if (t.includes('weight') || t.includes('strength')) return 'Strength';
  if (t.includes('yoga'))    return 'Yoga';
  if (t.includes('workout')) return 'Workout';
  if (t.includes('row'))     return 'Rowing';
  if (t.includes('ski'))     return 'Ski';
  if (t.includes('climb'))   return 'Climbing';
  if (t.includes('virtual')) return 'Virtual';
  const raw = a.sport_type || a.type || a.icu_sport_type || a.activity_type || '';
  return raw || 'Activity';
}

// Helper: pull a metric from an activity checking both plain and icu_ prefixed field names.
// The intervals.icu API sometimes stores data under icu_distance, icu_moving_time etc.
// depending on the source device / manual entry.
function actVal(a, ...keys) {
  for (const k of keys) { const v = a[k]; if (v) return v; }
  return 0;
}

function isEmptyActivity(a) {
  if (!(a.start_date_local || a.start_date)) return true;
  // Discard true calendar placeholders — planned workouts that were never completed.
  // These arrive through the /activities endpoint with zero data in every metric field.
  // We check both plain and icu_ variants so we never drop real non-cycling activities
  // (gym, walk, yoga, etc.) that have time but no distance or power.
  const dist = actVal(a, 'distance', 'icu_distance');
  const time = actVal(a, 'moving_time', 'elapsed_time', 'icu_moving_time', 'icu_elapsed_time', 'total_elapsed_time');
  const tss  = actVal(a, 'icu_training_load', 'tss');
  const hr   = actVal(a, 'average_heartrate', 'icu_average_heartrate');
  const pwr  = actVal(a, 'icu_weighted_avg_watts', 'average_watts', 'icu_average_watts');
  return dist === 0 && time === 0 && tss === 0 && hr === 0 && pwr === 0;
}

// Global lookup: actKey → activity object, rebuilt on every renderActivityList call
if (!window._actLookup) window._actLookup = {};

function renderActivityList(containerId, activities) {
  const el       = document.getElementById(containerId);
  const filtered = (activities || []).filter(a => !isEmptyActivity(a));
  if (!filtered.length) {
    el.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg><p>No activities in this period.</p></div>`;
    return;
  }

  // Precompute power percentile thresholds from all loaded activities so colours
  // always span the full spectrum relative to this athlete's own power range.
  // Z1 blue → Z2 green → Z3 yellow → Z4 orange → Z5 red
  const PWR_COLORS = ['#4a9eff', '#00e5a0', '#ffcc00', '#ff6b35', '#ff5252'];
  const allPwrs = state.activities
    .map(a => a.icu_weighted_avg_watts || a.average_watts || 0)
    .filter(w => w > 0)
    .sort((a, b) => a - b);
  const pThresh = allPwrs.length > 4 ? [
    allPwrs[Math.floor(allPwrs.length * 0.2)],
    allPwrs[Math.floor(allPwrs.length * 0.4)],
    allPwrs[Math.floor(allPwrs.length * 0.6)],
    allPwrs[Math.floor(allPwrs.length * 0.8)],
  ] : null;
  function powerColor(w) {
    if (!w || !pThresh) return null;
    if (w < pThresh[0]) return PWR_COLORS[0];
    if (w < pThresh[1]) return PWR_COLORS[1];
    if (w < pThresh[2]) return PWR_COLORS[2];
    if (w < pThresh[3]) return PWR_COLORS[3];
    return PWR_COLORS[4];
  }

  el.innerHTML = filtered.map((a, fi) => {
    const actKey  = containerId + '_' + fi;
    window._actLookup[actKey] = a;

    // Use actVal() for every metric — intervals.icu may return fields with or without
    // the icu_ prefix depending on sync source (Garmin/Strava vs manual entry).
    const dist    = actVal(a, 'distance', 'icu_distance');
    const distKm  = dist / 1000;
    const secs    = actVal(a, 'moving_time', 'elapsed_time', 'icu_moving_time', 'icu_elapsed_time', 'total_elapsed_time');
    const elev    = Math.round(actVal(a, 'total_elevation_gain', 'icu_total_elevation_gain'));
    const rawSpeed = actVal(a, 'average_speed', 'icu_average_speed');
    const speedMs  = rawSpeed || (secs > 0 && dist ? dist / secs : 0);
    const speedKmh = speedMs * 3.6;
    const pwr     = actVal(a, 'icu_weighted_avg_watts', 'average_watts', 'icu_average_watts');
    const hr      = Math.round(actVal(a, 'average_heartrate', 'icu_average_heartrate'));
    const tss     = Math.round(actVal(a, 'icu_training_load', 'tss'));
    const date    = fmtDate(a.start_date_local || a.start_date);
    const tc      = activityTypeClass(a);  // 'run' | 'swim' | ''

    // Determine virtual ride class for stripe colour
    const sportRaw = (a.sport_type || a.type || a.icu_sport_type || '').toLowerCase();
    const isVirtual = sportRaw.includes('virtual');
    const rowClass  = isVirtual ? 'virtual' : tc;

    const name  = (a.name && a.name.trim()) ? a.name.trim() : activityFallbackName(a);
    const badge = a.sport_type || a.type || '';

    // Build stat pills — only include what has a value
    const statPill = (val, lbl, color = null) =>
      `<div class="act-stat"><div class="act-stat-val"${color ? ` style="color:${color}"` : ''}>${val}</div><div class="act-stat-lbl">${lbl}</div></div>`;

    const stats = [];
    if (distKm > 0.05) stats.push(statPill(distKm.toFixed(2), 'km'));
    if (secs > 0)       stats.push(statPill(fmtDur(secs), 'time'));
    if (elev > 0)       stats.push(statPill(elev.toLocaleString(), 'm elev'));
    if (pwr > 0)        stats.push(statPill(Math.round(pwr) + 'w', 'power', powerColor(pwr)));
    if (hr > 0)         stats.push(statPill(hr, 'bpm'));
    if (speedKmh > 1 && !pwr) stats.push(statPill(speedKmh.toFixed(1), 'km/h'));

    return `<div class="activity-row ${rowClass}" onclick="navigateToActivity('${actKey}')">
      <div class="activity-type-icon ${tc}">${activityTypeIcon(a)}</div>
      <div class="act-card-info">
        <div class="act-card-name">${name}</div>
        <div class="act-card-sub">
          <span class="act-card-date">${date}</span>
          ${badge ? `<span class="act-card-badge">${badge}</span>` : ''}
        </div>
      </div>
      ${stats.length ? `<div class="act-card-stats">${stats.join('')}</div>` : ''}
      ${tss ? `<div class="activity-tss">${tss}</div>` : ''}
    </div>`;
  }).join('');
}

/* ====================================================
   CHART STYLE TOKENS  (single source of truth)
==================================================== */
const C_TOOLTIP = {
  backgroundColor: '#1e2330',
  borderColor:     '#252b3a',
  borderWidth:     1,
  titleColor:      '#8891a8',
  bodyColor:       '#eef0f8',
  padding:         10,
  boxWidth:        8,
  boxHeight:       8,
  boxPadding:      3,
};
const C_TICK  = { color: '#525d72', font: { size: 10 } };
const C_GRID  = { color: 'rgba(255,255,255,0.04)' };
const C_NOGRID = { display: false };
// Standard scale pair — pass xGrid:false for bar charts
function cScales({ xGrid = true, xExtra = {}, yExtra = {} } = {}) {
  return {
    x: { grid: xGrid ? C_GRID : C_NOGRID, ticks: { ...C_TICK, ...xExtra } },
    y: { grid: C_GRID,                    ticks: { ...C_TICK, ...yExtra } },
  };
}
// labelColor swatch callback (used on multi-series charts)
const C_LABEL_COLOR = ctx => ({
  backgroundColor: ctx.dataset.borderColor,
  borderColor:     ctx.dataset.borderColor,
  borderWidth: 0, borderRadius: 3,
});

/* ====================================================
   WEEK PROGRESS
==================================================== */

// Compute approximate CTL (42-day EMA of daily TSS) at a given date from local activities.
// Used to derive a 7-day fitness delta without needing historical wellness API data.
function computeCTLfromActivities(activities, atDate) {
  const end = new Date(atDate);
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - 126); // 3× CTL tau for EMA warmup

  const dailyTSS = {};
  activities.forEach(a => {
    const d = (a.start_date_local || a.start_date || '').slice(0, 10);
    if (!d) return;
    const tss = actVal(a, 'icu_training_load', 'tss');
    if (tss > 0) dailyTSS[d] = (dailyTSS[d] || 0) + tss;
  });

  let ctl = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    ctl += ((dailyTSS[toDateStr(new Date(d))] || 0) - ctl) / 42;
  }
  return ctl;
}

function renderWeekProgress(metric) {
  metric = metric || state.weekProgressMetric || 'tss';
  state.weekProgressMetric = metric;

  // Update active toggle button
  document.querySelectorAll('.wkp-toggle-btn').forEach(btn =>
    btn.classList.toggle('wkp-toggle-btn--active', btn.dataset.metric === metric)
  );

  // Metric config
  const cfg = {
    tss:       { label: 'Training Load', unit: 'TSS',  color: '#00e5a0', dimColor: 'rgba(0,229,160,0.08)',    fmt: v => Math.round(v),           tooltip: v => `${Math.round(v)} TSS` },
    distance:  { label: 'Distance',      unit: 'km',   color: '#4a9eff', dimColor: 'rgba(74,158,255,0.08)',   fmt: v => (v/1000).toFixed(1),     tooltip: v => `${(v/1000).toFixed(1)} km` },
    time:      { label: 'Time Riding',   unit: '',     color: '#9b59ff', dimColor: 'rgba(155,89,255,0.08)',   fmt: v => fmtDur(v),               tooltip: v => fmtDur(v) },
    elevation: { label: 'Elevation',     unit: 'm',    color: '#ff6b35', dimColor: 'rgba(255,107,53,0.08)',   fmt: v => Math.round(v).toLocaleString(), tooltip: v => `${Math.round(v)} m` },
  };
  const m = cfg[metric];

  // Update subtitle + unit label
  const allDayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const wkStartName = allDayNames[state.weekStartDay];
  const wkEndName   = allDayNames[(state.weekStartDay + 6) % 7];
  const subtitleEl  = document.getElementById('wpSubtitle');
  if (subtitleEl) subtitleEl.textContent = `${m.label} · ${wkStartName} → ${wkEndName}`;
  const unitEl = document.getElementById('wpUnit');
  if (unitEl) unitEl.textContent = m.unit || '—';

  // Update legend dot colour to match metric
  const legendDots = document.querySelectorAll('#weekProgressCard .chart-legend-item:first-child .chart-legend-dot');
  legendDots.forEach(d => d.style.background = m.color);

  const todayStr = toDateStr(new Date());
  const today    = new Date();

  // Week start/end using configurable day (state.weekStartDay: 0=Sun, 1=Mon)
  const thisMonday = getWeekStart(today);
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(thisMonday.getDate() - 7);

  // Build daily maps for all metrics at once, using actVal for proper icu_ fallbacks
  const maps = { tss: {}, distance: {}, time: {}, elevation: {} };
  state.activities.filter(a => !isEmptyActivity(a)).forEach(a => {
    const d = (a.start_date_local || a.start_date || '').slice(0, 10);
    if (!d) return;
    maps.tss[d]       = (maps.tss[d]       || 0) + actVal(a, 'icu_training_load', 'tss');
    maps.distance[d]  = (maps.distance[d]  || 0) + actVal(a, 'distance', 'icu_distance');
    maps.time[d]      = (maps.time[d]      || 0) + actVal(a, 'moving_time', 'elapsed_time', 'icu_moving_time', 'icu_elapsed_time');
    maps.elevation[d] = (maps.elevation[d] || 0) + actVal(a, 'total_elevation_gain', 'icu_total_elevation_gain');
  });
  const dayMap = maps[metric];

  // Day labels starting from the configured week start
  const allDayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayLabels    = Array.from({ length: 7 }, (_, i) => allDayLabels[(state.weekStartDay + i) % 7]);
  const thisWeekData = [], lastWeekData = [];
  let thisTotal = 0, lastTotal = 0;

  for (let i = 0; i < 7; i++) {
    const td    = new Date(thisMonday); td.setDate(thisMonday.getDate() + i);
    const ld    = new Date(lastMonday); ld.setDate(lastMonday.getDate() + i);
    const tdStr = toDateStr(td);
    const v1    = tdStr > todayStr ? null : (dayMap[tdStr] || 0);
    const v2    = dayMap[toDateStr(ld)] || 0;
    thisWeekData.push(v1);
    lastWeekData.push(v2);
    if (v1 !== null) thisTotal += v1;
    lastTotal += v2;
  }

  // Stat values
  document.getElementById('wpThisWeek').textContent = m.fmt(thisTotal);
  document.getElementById('wpLastWeek').textContent = m.fmt(lastTotal);

  const deltaEl = document.getElementById('wpDelta');
  if (lastTotal > 0) {
    const pct  = (thisTotal - lastTotal) / lastTotal * 100;
    const sign = pct >= 0 ? '+' : '';
    deltaEl.textContent = `${sign}${pct.toFixed(0)}% vs last week`;
    deltaEl.style.color = pct >= 0 ? 'var(--accent)' : 'var(--red)';
  } else {
    deltaEl.textContent = 'vs last week';
    deltaEl.style.color = 'var(--text-muted)';
  }

  // Fitness trend (always CTL-based)
  const d7      = new Date(today); d7.setDate(d7.getDate() - 7);
  const ctlNow  = computeCTLfromActivities(state.activities, today);
  const ctlPrev = computeCTLfromActivities(state.activities, d7);
  const ctlDiff = ctlNow - ctlPrev;
  const ctlEl   = document.getElementById('wpCTLDelta');
  const ctlSign = ctlDiff >= 0 ? '+' : '';
  ctlEl.textContent = `CTL ${ctlSign}${ctlDiff.toFixed(1)}`;
  ctlEl.style.color = ctlDiff > 0.5 ? 'var(--accent)' : ctlDiff < -0.5 ? 'var(--red)' : 'var(--text-secondary)';

  const badgeEl = document.getElementById('wpTrendBadge');
  if      (ctlDiff > 1.5)  { badgeEl.textContent = '▲ Building';   badgeEl.className = 'wkp-badge wkp-badge--up'; }
  else if (ctlDiff < -1.5) { badgeEl.textContent = '▼ Declining';  badgeEl.className = 'wkp-badge wkp-badge--down'; }
  else                     { badgeEl.textContent = '→ Maintaining'; badgeEl.className = 'wkp-badge wkp-badge--flat'; }

  // Chart
  const ctx = document.getElementById('weekProgressChart');
  if (!ctx) return;
  if (state.weekProgressChart) { state.weekProgressChart.destroy(); state.weekProgressChart = null; }

  const todayIdx = thisWeekData.reduce((idx, v, i) => (v !== null ? i : idx), 0);

  state.weekProgressChart = new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: {
      labels: dayLabels,
      datasets: [
        {
          label: 'Last week',
          data: lastWeekData,
          borderColor:         'rgba(136,145,168,0.45)',
          backgroundColor:     'transparent',
          borderWidth: 2,
          borderDash: [5, 4],
          pointRadius: 3,
          pointBackgroundColor: 'rgba(136,145,168,0.5)',
          pointBorderColor:    'transparent',
          tension: 0.35,
          order: 2
        },
        {
          label: 'This week',
          data: thisWeekData,
          borderColor:          m.color,
          backgroundColor:      m.dimColor,
          borderWidth: 2.5,
          pointRadius:          thisWeekData.map((_, i) => i === todayIdx ? 6 : 3),
          pointBackgroundColor: thisWeekData.map((_, i) => i === todayIdx ? m.color : m.color + '99'),
          pointBorderColor:     thisWeekData.map((_, i) => i === todayIdx ? 'var(--bg-card)' : 'transparent'),
          pointBorderWidth: 2,
          fill: true,
          spanGaps: false,
          tension: 0.35,
          order: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...C_TOOLTIP,
          callbacks: {
            label: c => `${c.dataset.label}: ${c.raw != null ? m.tooltip(c.raw) : '—'}`
          }
        }
      },
      scales: cScales({ xGrid: false, yExtra: { maxTicksLimit: 4 } })
    }
  });
}

/* ====================================================
   TRAINING STATUS
==================================================== */

// Draw the semicircular ramp-rate gauge into #rampGaugeSVG.
// Range 0–12 CTL/week. Negative values pin the needle at 0.
function drawRampGaugeSVG(rampRate) {
  const el = document.getElementById('rampGaugeSVG');
  if (!el) return;

  const CX = 100, CY = 105, R = 82, SW = 16;
  const val = Math.max(0, Math.min(12, rampRate));

  // Map value to angle: 0 → π (left), 12 → 0 (right)
  const toA = v => Math.PI * (1 - Math.max(0, Math.min(12, v)) / 12);

  // SVG coordinate at angle a (standard math → SVG y-flip)
  const px = a => (CX + R * Math.cos(a)).toFixed(1);
  const py = a => (CY - R * Math.sin(a)).toFixed(1);

  // Arc path from angle a1 to a2, sweep=1 (clockwise on screen = top arc)
  const seg = (a1, a2, col, sw, op, cap) => {
    op  = op  ?? 1;
    cap = cap ?? 'butt';
    const large = (a1 - a2) > Math.PI ? 1 : 0;
    return `<path d="M${px(a1)} ${py(a1)} A${R} ${R} 0 ${large} 1 ${px(a2)} ${py(a2)}" `
         + `fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="${cap}" opacity="${op}"/>`;
  };

  // Ramp-rate color zones (0–12 CTL/wk)
  const zones = [[0,3,'#00e5a0'],[3,8,'#00e5a0'],[8,10,'#f0c429'],[10,12,'#ff4757']];
  const color = val < 8 ? '#00e5a0' : val < 10 ? '#f0c429' : '#ff4757';

  let s = '';
  // 1. Background track
  s += seg(Math.PI * 0.999, Math.PI * 0.001, 'rgba(255,255,255,0.07)', SW);
  // 2. Dimmed zone bands
  zones.forEach(([lo, hi, c]) => s += seg(toA(lo), toA(hi), c, SW - 7, 0.28));
  // 3. Active progress fill
  if (val > 0.15) s += seg(Math.PI * 0.999, toA(val), color, SW, 0.88, 'round');
  // 4. Indicator dot
  s += `<circle cx="${px(toA(val))}" cy="${py(toA(val))}" r="7" fill="${color}" stroke="var(--bg-card)" stroke-width="3"/>`;

  el.innerHTML = s;
}

function renderTrainingStatus() {
  // ── RAMP RATE ──────────────────────────────────────────────
  // Both dates use the same local computation so the delta is on a consistent scale.
  // Do NOT mix state.fitness.ctl (API, full history) with computeCTL (starts from 0) —
  // that offset makes a low-activity week appear like a huge gain.
  const today   = new Date();
  const d7      = new Date(); d7.setDate(d7.getDate() - 7);
  const ctlNow  = computeCTLfromActivities(state.activities, today);
  const ctlPrev = computeCTLfromActivities(state.activities, d7);
  const ramp    = ctlNow - ctlPrev; // CTL points gained/lost over last 7 days

  const rampNumEl = document.getElementById('rampNum');
  const rampBadge = document.getElementById('rampBadge');
  if (rampNumEl) rampNumEl.textContent = (ramp >= 0 ? '+' : '') + ramp.toFixed(1);

  let rampLabel, rampCls;
  if      (ramp <  0) { rampLabel = 'Detraining';    rampCls = 'trs-badge trs-badge--blue';      }
  else if (ramp <  3) { rampLabel = 'Easy build';     rampCls = 'trs-badge trs-badge--green-dim'; }
  else if (ramp <  8) { rampLabel = 'Optimal build';  rampCls = 'trs-badge trs-badge--green';     }
  else if (ramp < 10) { rampLabel = 'Aggressive';     rampCls = 'trs-badge trs-badge--yellow';    }
  else                { rampLabel = 'At risk';         rampCls = 'trs-badge trs-badge--red';       }
  if (rampBadge) { rampBadge.textContent = rampLabel; rampBadge.className = rampCls; }

  drawRampGaugeSVG(ramp);

  // ── CTL / ATL / TSB ────────────────────────────────────────
  const tsb       = state.fitness?.tsb ?? (state.fitness ? (state.fitness.ctl - state.fitness.atl) : null);
  const ctl       = state.fitness?.ctl ?? null;
  const atl       = state.fitness?.atl ?? null;
  const formNumEl = document.getElementById('trsFormNum');
  const formStat  = document.getElementById('trsFormStatus');
  const formHint  = document.getElementById('trsFormHint');
  const ctlNumEl  = document.getElementById('trsCTLNum');
  const atlNumEl  = document.getElementById('trsATLNum');

  if (ctl !== null && ctlNumEl) ctlNumEl.textContent = Math.round(ctl);
  if (atl !== null && atlNumEl) atlNumEl.textContent = Math.round(atl);

  if (tsb !== null && formNumEl) {
    formNumEl.textContent = (tsb >= 0 ? '+' : '') + Math.round(tsb);

    let fLabel, fColor, fHint;
    if      (tsb > 25)  { fLabel = 'Peak Form';     fColor = '#00e5a0'; fHint = 'Perfect for A-priority races'; }
    else if (tsb > 15)  { fLabel = 'Race Ready';    fColor = '#00e5a0'; fHint = 'Target A-priority races now'; }
    else if (tsb > 5)   { fLabel = 'Fresh';         fColor = '#88c860'; fHint = 'Good for B-priority races'; }
    else if (tsb > -5)  { fLabel = 'Neutral';       fColor = '#f0c429'; fHint = 'Transitioning'; }
    else if (tsb > -15) { fLabel = 'Training';      fColor = '#f0c429'; fHint = 'Building fitness load'; }
    else if (tsb > -25) { fLabel = 'Deep Training'; fColor = '#ff6b35'; fHint = 'High load — monitor fatigue'; }
    else                { fLabel = 'Overreaching';  fColor = '#ff4757'; fHint = 'Recovery needed soon'; }

    formNumEl.style.color = fColor;
    if (formStat) {
      formStat.textContent = fLabel;
      formStat.style.color = fColor;
      formStat.style.background = fColor + '22';
    }
    if (formHint) formHint.textContent = fHint;
  }

  // ── AEROBIC EFFICIENCY sparkline ───────────────────────────
  // Qualifying rides: must have both power (NP) and HR data, duration > 30 min
  const qualifying = [...state.activities]
    .filter(a => {
      const pwr = actVal(a, 'icu_weighted_avg_watts', 'average_watts');
      const hr  = actVal(a, 'average_heartrate', 'icu_average_heartrate');
      const dur = actVal(a, 'moving_time', 'icu_moving_time', 'elapsed_time');
      return pwr > 50 && hr > 50 && dur > 1800;
    })
    .sort((a, b) => new Date(a.start_date_local || a.start_date) - new Date(b.start_date_local || b.start_date))
    .slice(-10);

  const efCurEl   = document.getElementById('trsEFCurrent');
  const efDeltaEl = document.getElementById('trsEFDelta');

  if (qualifying.length < 3) {
    if (efCurEl)   efCurEl.textContent   = '—';
    if (efDeltaEl) { efDeltaEl.textContent = 'Need 3+ power+HR rides'; efDeltaEl.style.color = 'var(--text-muted)'; }
    if (state.efSparkChart) { state.efSparkChart.destroy(); state.efSparkChart = null; }
    return;
  }

  const efs = qualifying.map(a => {
    const pwr = actVal(a, 'icu_weighted_avg_watts', 'average_watts');
    const hr  = actVal(a, 'average_heartrate', 'icu_average_heartrate');
    return +(pwr / hr).toFixed(3);
  });

  // Compare average EF of most recent 3 vs oldest 3 to get trend
  const n       = Math.min(3, efs.length);
  const efRecent = efs.slice(-n).reduce((s, v) => s + v, 0) / n;
  const efOld    = efs.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const efPct    = (efRecent - efOld) / efOld * 100;

  if (efCurEl) efCurEl.textContent = efRecent.toFixed(2) + ' w/bpm';
  if (efDeltaEl) {
    const sign = efPct >= 0 ? '+' : '';
    efDeltaEl.textContent = `${sign}${efPct.toFixed(1)}%`;
    efDeltaEl.style.color = efPct >= 0 ? 'var(--accent)' : 'var(--red)';
  }

  const ctx = document.getElementById('trsEFChart');
  if (!ctx) return;
  if (state.efSparkChart) { state.efSparkChart.destroy(); state.efSparkChart = null; }

  state.efSparkChart = new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: {
      labels: qualifying.map(a => fmtDate(a.start_date_local || a.start_date)),
      datasets: [{
        data: efs,
        borderColor: '#00e5a0',
        backgroundColor: 'rgba(0,229,160,0.08)',
        borderWidth: 2,
        pointRadius:          efs.map((_, i) => i === efs.length - 1 ? 5 : 2.5),
        pointBackgroundColor: efs.map((_, i) => i === efs.length - 1 ? '#00e5a0' : 'rgba(0,229,160,0.6)'),
        pointBorderColor: 'transparent',
        fill: true,
        tension: 0.35
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { ...C_TOOLTIP, callbacks: { label: c => `EF: ${c.raw} w/bpm` } }
      },
      scales: cScales({ xGrid: false, yExtra: { maxTicksLimit: 3 } })
    }
  });
}

/* ====================================================
   CHARTS
==================================================== */
function renderFitnessChart(activities, days) {
  const ctx = document.getElementById('fitnessChart').getContext('2d');
  if (state.fitnessChart) state.fitnessChart.destroy();

  const wellness = state.wellnessHistory || {};

  // Build daily TSS map as fallback for days missing wellness data
  const dailyTSS = {};
  state.activities.forEach(a => {
    const d = (a.start_date_local || a.start_date || '').slice(0, 10);
    if (d) dailyTSS[d] = (dailyTSS[d] || 0) + (a.icu_training_load || a.tss || 0);
  });

  // Seed EMA from the most recent wellness entry at or before chart start
  // (avoids divergence caused by using a stale seed 400 days away with no warmup)
  let ctl = 30, atl = 30;
  let seedBack = -1;
  for (let back = 0; back <= 90; back++) {
    const sd = toDateStr(daysAgo(days + back));
    const sw = wellness[sd];
    if (sw && sw.ctl != null) {
      ctl = sw.ctl;
      atl = sw.atl ?? sw.ctl;
      seedBack = back;
      break;
    }
  }
  // Bridge gap days between seed date and chart start
  if (seedBack > 0) {
    for (let g = seedBack - 1; g >= 1; g--) {
      const gd = toDateStr(daysAgo(days + g));
      const t = dailyTSS[gd] || 0;
      ctl = ctl + (t - ctl) / 42;
      atl = atl + (t - atl) / 7;
    }
  }

  const labels = [], ctlD = [], atlD = [], tsbD = [];

  for (let i = days; i >= 0; i--) {
    const d = toDateStr(daysAgo(i));
    const w = wellness[d];
    if (w && w.ctl != null) {
      ctl = w.ctl; atl = w.atl;
      labels.push(d.slice(5));
      ctlD.push(+ctl.toFixed(1));
      atlD.push(+atl.toFixed(1));
      tsbD.push(w.tsb != null ? +w.tsb.toFixed(1) : +(ctl - atl).toFixed(1));
    } else {
      // EMA fallback for days without wellness data
      const t = dailyTSS[d] || 0;
      ctl = ctl + (t - ctl) / 42;
      atl = atl + (t - atl) / 7;
      labels.push(d.slice(5));
      ctlD.push(+ctl.toFixed(1));
      atlD.push(+atl.toFixed(1));
      tsbD.push(+(ctl - atl).toFixed(1));
    }
  }

  state.fitnessChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [
      { label: 'CTL', data: ctlD, borderColor: '#00e5a0', backgroundColor: 'rgba(0,229,160,0.07)', borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.4, fill: true },
      { label: 'ATL', data: atlD, borderColor: '#ff6b35', backgroundColor: 'rgba(255,107,53,0.05)', borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.4 },
      { label: 'TSB', data: tsbD, borderColor: '#4a9eff', backgroundColor: 'rgba(74,158,255,0.05)', borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.4 }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { ...C_TOOLTIP, callbacks: { labelColor: C_LABEL_COLOR } }
      },
      scales: cScales({ xExtra: { maxTicksLimit: 8 } })
    }
  });
}

function renderWeeklyChart(activities) {
  const canvas = document.getElementById('weeklyTssChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (state.weeklyChart) state.weeklyChart.destroy();
  const weeks = {};
  activities.forEach(a => {
    const d  = new Date(a.start_date_local || a.start_date);
    const wk = weekKey(d);
    weeks[wk] = (weeks[wk] || 0) + (a.icu_training_load || a.tss || 0);
  });
  const entries = Object.entries(weeks).sort((a, b) => a[0].localeCompare(b[0])).slice(-8);
  state.weeklyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: entries.map(([k]) => 'W' + k.slice(-2)),
      datasets: [{ data: entries.map(([, v]) => Math.round(v)), backgroundColor: 'rgba(0,229,160,0.5)', hoverBackgroundColor: '#00e5a0', borderRadius: 4 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { ...C_TOOLTIP, callbacks: { label: c => `${c.raw} TSS` } } },
      scales: cScales({ xGrid: false, yExtra: { maxTicksLimit: 4 } })
    }
  });
}

function renderAvgPowerChart(activities) {
  const ctx = document.getElementById('avgPowerChart');
  if (!ctx) return;
  if (state.avgPowerChart) { state.avgPowerChart.destroy(); state.avgPowerChart = null; }

  // Only rides with power data, sorted chronologically
  const powered = activities
    .filter(a => (a.icu_weighted_avg_watts || a.average_watts || 0) > 0)
    .sort((a, b) => new Date(a.start_date_local || a.start_date) - new Date(b.start_date_local || b.start_date));

  if (!powered.length) {
    document.getElementById('avgPowerCard').style.display = 'none';
    return;
  }
  document.getElementById('avgPowerCard').style.display = '';

  const labels = powered.map(a => fmtDate(a.start_date_local || a.start_date));
  const watts   = powered.map(a => Math.round(a.icu_weighted_avg_watts || a.average_watts || 0));

  // Rolling 7-activity average trend line
  const trend = watts.map((_, i) => {
    const window = watts.slice(Math.max(0, i - 6), i + 1);
    return Math.round(window.reduce((s, v) => s + v, 0) / window.length);
  });

  state.avgPowerChart = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Avg Power',
          data: watts,
          backgroundColor: 'rgba(0,229,160,0.25)',
          hoverBackgroundColor: 'rgba(0,229,160,0.5)',
          borderColor: 'rgba(0,229,160,0.6)',
          borderWidth: 1,
          borderRadius: 4,
          order: 2
        },
        {
          label: '7-ride trend',
          data: trend,
          type: 'line',
          borderColor: '#00e5a0',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.4,
          order: 1
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { ...C_TOOLTIP, callbacks: { labelColor: C_LABEL_COLOR, label: c => `${c.dataset.label}: ${c.raw}w` } }
      },
      scales: cScales({ xGrid: false, xExtra: { maxTicksLimit: 10, maxRotation: 0, autoSkip: true }, yExtra: { callback: v => v + 'w' } })
    }
  });
}

/* ====================================================
   ZONE DISTRIBUTION CARD
==================================================== */
const ZONE_COLORS = [
  'var(--blue)',    // Z1 Recovery
  'var(--accent)', // Z2 Endurance
  'var(--yellow)', // Z3 Tempo
  'var(--orange)', // Z4 Threshold
  'var(--red)',     // Z5 VO₂max
  'var(--purple)'  // Z6 Anaerobic
];
const ZONE_NAMES    = ['Recovery', 'Endurance', 'Tempo', 'Threshold', 'VO₂max', 'Anaerobic'];
const HR_ZONE_NAMES = ['Active Recovery', 'Aerobic Base', 'Aerobic', 'Threshold', 'VO₂max', 'Anaerobic', 'Neuromuscular'];
const ZONE_TAGS     = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6'];

function renderZoneDist(activities) {
  const card = document.getElementById('zoneDistCard');
  if (!card) return;

  // Sum icu_zone_times across recent activities.
  // Each entry is an object: { id: "Z1", secs: 557 }, { id: "Z2", secs: 1358 }, …
  // Z7 and SS (Sweet Spot) entries are ignored; we only map Z1–Z6.
  const totals = [0, 0, 0, 0, 0, 0];
  let hasData = false;

  activities.forEach(a => {
    const zt = a.icu_zone_times;
    if (!Array.isArray(zt) || zt.length < 1) return;
    zt.forEach(z => {
      if (!z || typeof z.id !== 'string') return;
      const match = z.id.match(/^Z(\d)$/);           // matches Z1–Z6 (Z7 ignored)
      if (!match) return;
      const idx = parseInt(match[1], 10) - 1;        // Z1 → 0, …, Z6 → 5
      if (idx >= 0 && idx < 6) {
        hasData = true;
        totals[idx] += (z.secs || 0);
      }
    });
  });

  const totalSecs = totals.reduce((s, t) => s + t, 0);
  if (!hasData || totalSecs === 0) { card.style.display = 'none'; return; }
  card.style.display = '';

  document.getElementById('zoneTotalBadge').textContent = fmtDur(totalSecs) + ' total';
  document.getElementById('zoneDistSubtitle').textContent =
    `Time in power zone · Last ${state.rangeDays} days`;

  // Zone rows
  document.getElementById('zoneList').innerHTML = ZONE_TAGS.map((tag, i) => {
    const secs  = totals[i];
    const pct   = Math.round(secs / totalSecs * 100);
    const color = ZONE_COLORS[i];
    if (secs === 0) return '';
    return `<div class="zone-row">
      <span class="zone-tag" style="color:${color}">${tag}</span>
      <span class="zone-row-name">${ZONE_NAMES[i]}</span>
      <div class="zone-bar-track">
        <div class="zone-bar-fill" style="width:${pct}%;background:${color}"></div>
      </div>
      <span class="zone-pct" style="color:${color}">${pct}%</span>
      <span class="zone-time">${fmtDur(secs)}</span>
    </div>`;
  }).join('');

  // Stacked balance bar + training style hint
  const balEl = document.getElementById('zoneBalanceSection');
  const segs = ZONE_TAGS.map((_, i) => {
    const pct = totals[i] / totalSecs * 100;
    return pct > 0.5
      ? `<div class="zone-balance-seg" style="flex:${pct};background:${ZONE_COLORS[i]}"></div>`
      : '';
  }).join('');

  const z12 = (totals[0] + totals[1]) / totalSecs;
  const z34 = (totals[2] + totals[3]) / totalSecs;
  const z56 = (totals[4] + totals[5]) / totalSecs;

  let style, hint;
  if (z12 >= 0.65 && z56 >= 0.10) {
    style = 'Polarized'; hint = 'strong contrast between easy base and hard efforts';
  } else if (z34 >= 0.40) {
    style = 'Sweet-spot'; hint = 'focused on productive threshold work';
  } else if (z12 >= 0.60) {
    style = 'Pyramidal'; hint = 'broad aerobic base with moderate intensity work';
  } else {
    style = 'Mixed'; hint = 'varied intensity across all zones';
  }

  balEl.style.display = '';
  balEl.innerHTML = `
    <div class="zone-balance-label">Zone Balance</div>
    <div class="zone-balance-bar">${segs}</div>
    <div class="zone-style-hint"><strong>${style}</strong> — ${hint}</div>`;
}

/* ====================================================
   POWER CURVE
==================================================== */
// Human-readable label for a duration in seconds (short form for axis / pills)
function fmtSecsShort(s) {
  if (s < 60)   return `${s}s`;
  if (s < 3600) { const m = Math.floor(s / 60); const r = s % 60; return r ? `${m}m${r}s` : `${m}m`; }
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60);
  return m ? `${h}h${m}m` : `${h}h`;
}

// Key durations to show as stat pills above the chart
const CURVE_PEAKS = [
  { secs: 5,    label: '5s'  },
  { secs: 60,   label: '1m'  },
  { secs: 300,  label: '5m'  },
  { secs: 1200, label: '20m' },
  { secs: 3600, label: '1h'  },
];

// Tick labels shown on the logarithmic x-axis
const CURVE_TICK_MAP = { 1:'1s', 5:'5s', 10:'10s', 30:'30s', 60:'1m', 300:'5m', 600:'10m', 1200:'20m', 1800:'30m', 3600:'1h' };

// Detect the most common cycling activity type from loaded activities.
// Falls back through common types so we always try something valid.
function dominantRideType() {
  const CYCLING_RE = /ride|cycling|bike|velo/i;
  const counts = {};
  state.activities.forEach(a => {
    const t = a.sport_type || a.type || '';
    if (CYCLING_RE.test(t)) counts[t] = (counts[t] || 0) + 1;
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] || 'Ride';
}

async function renderPowerCurve() {
  const card = document.getElementById('powerCurveCard');
  if (!card) return;

  // Fetch (or use cache) when range changes
  if (!state.powerCurve || state.powerCurveRange !== state.rangeDays) {
    const newest = toDateStr(new Date());
    const oldest = toDateStr(daysAgo(state.rangeDays));
    // Try dominant type first, then common fallbacks
    const types = [dominantRideType(), 'Ride', 'VirtualRide', 'MountainBikeRide']
      .filter((t, i, a) => a.indexOf(t) === i); // dedupe
    let raw = null;
    for (const type of types) {
      try {
        const data = await icuFetch(
          `/athlete/${state.athleteId}/power-curves?type=${type}&oldest=${oldest}&newest=${newest}`
        );
        const candidate = Array.isArray(data) ? data[0] : (data.list?.[0] ?? data);
        if (candidate && Array.isArray(candidate.secs) && candidate.secs.length > 0) {
          raw = candidate; break;
        }
      } catch (e) { /* try next type */ }
    }
    state.powerCurve      = raw;
    state.powerCurveRange = state.rangeDays;
  }

  const pc = state.powerCurve;
  if (!pc) { card.style.display = 'none'; return; }
  card.style.display = '';

  // Build a lookup: secs → watts (skipping null / 0)
  const lookup = {};
  pc.secs.forEach((s, i) => { if (pc.watts[i]) lookup[s] = pc.watts[i]; });

  // Find watts closest to target duration
  function peakWatts(targetSecs) {
    if (lookup[targetSecs]) return lookup[targetSecs];
    let best = null, minDiff = Infinity;
    pc.secs.forEach(s => {
      const diff = Math.abs(s - targetSecs);
      if (diff < minDiff && lookup[s]) { minDiff = diff; best = lookup[s]; }
    });
    return best;
  }

  // Subtitle
  document.getElementById('powerCurveSubtitle').textContent =
    `Best power efforts · Last ${state.rangeDays} days`;

  // Peak stat pills
  document.getElementById('curvePeaks').innerHTML = CURVE_PEAKS.map(p => {
    const w = Math.round(peakWatts(p.secs) || 0);
    if (!w) return '';
    return `<div class="curve-peak">
      <div class="curve-peak-val">${w}<span class="curve-peak-unit">w</span></div>
      <div class="curve-peak-dur">${p.label}</div>
    </div>`;
  }).join('');

  // Prepare chart data (use all available points as {x, y})
  const chartData = pc.secs
    .map((s, i) => ({ x: s, y: pc.watts[i] }))
    .filter(pt => pt.y > 0);

  const maxSecs = chartData[chartData.length - 1]?.x || 3600;

  // Destroy old chart
  if (state.powerCurveChart) { state.powerCurveChart.destroy(); state.powerCurveChart = null; }

  const canvas = document.getElementById('powerCurveChart');
  state.powerCurveChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      datasets: [{
        data: chartData,
        borderColor: '#00e5a0',
        backgroundColor: 'rgba(0,229,160,0.07)',
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { ...C_TOOLTIP, callbacks: {
          title: items => fmtSecsShort(items[0].parsed.x),
          label: ctx  => `${Math.round(ctx.parsed.y)}w`,
        }}
      },
      scales: {
        x: {
          type: 'logarithmic', min: 1, max: maxSecs,
          grid: C_GRID,
          ticks: { ...C_TICK, autoSkip: false, maxRotation: 0, callback: val => CURVE_TICK_MAP[val] ?? null }
        },
        y: {
          grid: C_GRID,
          ticks: { ...C_TICK, callback: v => v + 'w' }
        }
      }
    }
  });
}

/* ====================================================
   FITNESS PAGE
==================================================== */
function renderFitnessStreak() {
  const activities = state.activities.filter(a => !isEmptyActivity(a));

  // Build set of active days (YYYY-MM-DD)
  const daySet = new Set();
  activities.forEach(a => {
    const d = (a.start_date_local || a.start_date || '').slice(0, 10);
    if (d) daySet.add(d);
  });

  // Current streak: count consecutive days back from today (if today empty, start from yesterday)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = toDateStr(today);
  let streak = 0;
  const startOffset = daySet.has(todayStr) ? 0 : 1;
  for (let i = startOffset; i < 365; i++) {
    const d = toDateStr(new Date(today.getTime() - i * 86400000));
    if (daySet.has(d)) streak++;
    else break;
  }

  // This week (from configured week start day → today)
  const weekStart    = getWeekStart(today);
  const weekStartStr = toDateStr(weekStart);
  const weekActs = activities.filter(a => {
    const d = (a.start_date_local || a.start_date || '').slice(0, 10);
    return d >= weekStartStr;
  });
  const weekTSS  = weekActs.reduce((s, a) => s + actVal(a, 'icu_training_load', 'tss'), 0);

  const streakEl   = document.getElementById('fitStreak');
  const streakHint = document.getElementById('fitStreakHint');
  if (streakEl) {
    streakEl.textContent = streak;
    streakEl.style.color = streak >= 7 ? 'var(--accent)' : streak >= 3 ? 'var(--orange)' : '';
  }
  if (streakHint) {
    streakHint.textContent = streak >= 14 ? 'On fire 🔥' : streak >= 7 ? 'Great run' : streak >= 3 ? 'Keep going' : streak > 0 ? 'Started' : '';
  }

  const weekEl   = document.getElementById('fitWeekActs');
  const weekHint = document.getElementById('fitWeekHint');
  if (weekEl) weekEl.textContent = weekActs.length;
  if (weekHint) weekHint.textContent = weekTSS > 0 ? Math.round(weekTSS) + ' TSS' : '';
}

function renderFitnessWellness() {
  const entries = Object.values(state.wellnessHistory)
    .filter(e => e.id)
    .sort((a, b) => a.id.localeCompare(b.id));

  if (!entries.length) return;

  const last7 = entries.slice(-7);
  let shown = 0;

  // HRV (rMSSD)
  const hrvVals = last7.filter(e => e.hrv != null);
  if (hrvVals.length >= 2) {
    const avg = hrvVals.reduce((s, e) => s + e.hrv, 0) / hrvVals.length;
    const trend = hrvVals[hrvVals.length - 1].hrv - hrvVals[0].hrv;
    document.getElementById('fitHRV').textContent = Math.round(avg);
    const tEl = document.getElementById('fitHRVTrend');
    if (tEl) {
      tEl.textContent = trend > 1 ? '↑' : trend < -1 ? '↓' : '→';
      tEl.style.color = trend > 1 ? 'var(--accent)' : trend < -1 ? 'var(--red)' : 'var(--text-muted)';
    }
    document.getElementById('fitWcardHRV').style.display = '';
    shown++;
  }

  // Resting HR
  const hrVals = last7.filter(e => e.restingHR != null);
  if (hrVals.length >= 1) {
    const latest = hrVals[hrVals.length - 1].restingHR;
    const trend  = hrVals.length >= 3 ? latest - hrVals[0].restingHR : 0;
    document.getElementById('fitRestHR').textContent = Math.round(latest);
    const tEl = document.getElementById('fitHRTrend');
    if (tEl) {
      tEl.textContent = trend > 2 ? '↑' : trend < -2 ? '↓' : '';
      tEl.style.color = trend > 2 ? 'var(--red)' : trend < -2 ? 'var(--accent)' : 'var(--text-muted)';
    }
    document.getElementById('fitWcardHR').style.display = '';
    shown++;
  }

  // Sleep
  const sleepVals = last7.filter(e => e.sleepSecs != null && e.sleepSecs > 0);
  if (sleepVals.length >= 2) {
    const avgH = sleepVals.reduce((s, e) => s + e.sleepSecs, 0) / sleepVals.length / 3600;
    const trend = sleepVals[sleepVals.length - 1].sleepSecs - sleepVals[0].sleepSecs;
    document.getElementById('fitSleep').textContent = avgH.toFixed(1) + 'h';
    const tEl = document.getElementById('fitSleepTrend');
    if (tEl) {
      tEl.textContent = trend > 1800 ? '↑' : trend < -1800 ? '↓' : '→';
      tEl.style.color = trend > 1800 ? 'var(--accent)' : trend < -1800 ? 'var(--red)' : 'var(--text-muted)';
    }
    document.getElementById('fitWcardSleep').style.display = '';
    shown++;
  }

  // Weight
  const weightVals = entries.filter(e => e.weight != null && e.weight > 0);
  if (weightVals.length >= 1) {
    const latest = weightVals[weightVals.length - 1].weight;
    const prev   = weightVals[Math.max(0, weightVals.length - 8)].weight;
    const delta  = latest - prev;
    document.getElementById('fitWeight').textContent = latest.toFixed(1);
    const tEl = document.getElementById('fitWeightTrend');
    if (tEl && Math.abs(delta) >= 0.1) {
      tEl.textContent = (delta > 0 ? '+' : '') + delta.toFixed(1) + ' kg';
      tEl.style.color = 'var(--text-muted)';
    }
    document.getElementById('fitWcardWeight').style.display = '';
    shown++;
  }

  const strip = document.getElementById('fitWellnessStrip');
  if (strip) strip.style.display = shown > 0 ? 'grid' : 'none';
}

function renderFitnessHeatmap() {
  const el = document.getElementById('fitHeatmap');
  if (!el) return;

  // Build TSS map keyed by YYYY-MM-DD
  const tssMap = {};
  state.activities.filter(a => !isEmptyActivity(a)).forEach(a => {
    const d = (a.start_date_local || a.start_date || '').slice(0, 10);
    if (!d) return;
    tssMap[d] = (tssMap[d] || 0) + (a.icu_training_load || a.tss || 1);
  });

  // 26 complete weeks ending today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dow   = (today.getDay() + 6) % 7; // 0=Mon
  const start = new Date(today.getTime() - (dow + 26 * 7 - 1) * 86400000);

  // Color scale threshold: 80th percentile of non-zero TSS values
  const allTSS = Object.values(tssMap).filter(t => t > 0).sort((a, b) => a - b);
  const p80    = allTSS.length > 0 ? allTSS[Math.floor(allTSS.length * 0.8)] : 80;

  // Day-of-week labels (Mon, Wed, Fri only)
  const DAY_LABELS = ['M', '', 'W', '', 'F', '', ''];
  let html = '<div class="fit-hm-days">' +
    DAY_LABELS.map(l => `<div class="fit-hm-day-label">${l}</div>`).join('') +
    '</div>';

  // Month labels row — track first occurrence of each month across columns
  const monthLabels = [];
  for (let w = 0; w < 26; w++) {
    const colStart = new Date(start.getTime() + w * 7 * 86400000);
    const m = colStart.getMonth();
    const prev = w > 0 ? new Date(start.getTime() + (w - 1) * 7 * 86400000).getMonth() : -1;
    monthLabels.push(m !== prev ? colStart.toLocaleDateString('en-GB', { month: 'short' }) : '');
  }

  // Week columns
  for (let w = 0; w < 26; w++) {
    html += '<div class="fit-hm-col">';
    // Month label at top of column
    html += `<div class="fit-hm-month-lbl">${monthLabels[w]}</div>`;
    // 7 day cells
    for (let d = 0; d < 7; d++) {
      const date    = new Date(start.getTime() + (w * 7 + d) * 86400000);
      const dateStr = toDateStr(date);
      const tss     = tssMap[dateStr] || 0;
      const future  = date > today;

      let level = 0;
      if (!future && tss > 0) {
        if      (tss < p80 * 0.25) level = 1;
        else if (tss < p80 * 0.5)  level = 2;
        else if (tss < p80 * 0.75) level = 3;
        else                        level = 4;
      }

      const cls     = future ? 'fit-hm-cell fit-hm-cell--future' : `fit-hm-cell fit-hm-cell--${level}`;
      const tooltip = tss > 0 ? `${dateStr} · ${Math.round(tss)} TSS` : dateStr;
      html += `<div class="${cls}" title="${tooltip}"></div>`;
    }
    html += '</div>';
  }

  el.innerHTML = html;
}

function setFitnessRange(days) {
  state.fitnessRangeDays = days;
  document.querySelectorAll('#fitRangePills button').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('fitRange' + days);
  if (btn) btn.classList.add('active');
  renderFitnessHistoryChart(days);
}

function renderFitnessPage() {
  if (!state.synced) return;

  // ── KPI cards ──
  if (state.fitness) {
    const ctl  = state.fitness.ctl  ?? 0;
    const atl  = state.fitness.atl  ?? 0;
    const tsb  = state.fitness.tsb  != null ? state.fitness.tsb : (ctl - atl);
    const ramp = state.fitness.rampRate;

    document.getElementById('fitCTL').textContent = Math.round(ctl);
    const sidebarCTL = document.getElementById('sidebarCTL');
    if (sidebarCTL) sidebarCTL.textContent = `CTL ${Math.round(ctl)}`;
    document.getElementById('fitATL').textContent = Math.round(atl);

    const tsbEl  = document.getElementById('fitTSB');
    const barTSB = document.getElementById('fitBarTSB');
    tsbEl.textContent = (tsb >= 0 ? '+' : '') + Math.round(tsb);
    if      (tsb >  5) { tsbEl.style.color = 'var(--accent)'; barTSB.style.background = 'var(--accent)'; }
    else if (tsb < -10){ tsbEl.style.color = 'var(--red)';    barTSB.style.background = 'var(--red)'; }
    else               { tsbEl.style.color = 'var(--orange)'; barTSB.style.background = 'var(--orange)'; }

    document.getElementById('fitBarCTL').style.width = Math.min(100, ctl / 1.5) + '%';
    document.getElementById('fitBarATL').style.width = Math.min(100, atl / 1.5) + '%';
    document.getElementById('fitBarTSB').style.width = Math.min(100, Math.abs(tsb) * 2.5) + '%';

    const rampEl   = document.getElementById('fitRamp');
    const hintEl   = document.getElementById('fitRampHint');
    if (ramp != null) {
      rampEl.textContent = (ramp >= 0 ? '+' : '') + ramp.toFixed(1);
      rampEl.style.color = ramp > 0 ? 'var(--accent)' : ramp < -3 ? 'var(--red)' : 'var(--orange)';
      hintEl.textContent = ramp > 1.5 ? 'Building' : ramp < -1.5 ? 'Tapering' : 'Maintaining';
    } else {
      rampEl.textContent = '—';
      rampEl.style.color = '';
      hintEl.textContent = '';
    }
  }

  renderFitnessStreak();
  renderFitnessWellness();
  renderFitnessHistoryChart(state.fitnessRangeDays);
  renderFitnessHeatmap();
  renderFitnessWeeklyPageChart();
  renderFitnessMonthlyTable();
}

function renderFitnessHistoryChart(days) {
  const canvas = document.getElementById('fitnessPageChart');
  if (!canvas) return;
  if (state.fitnessPageChart) { state.fitnessPageChart.destroy(); state.fitnessPageChart = null; }

  const wellness  = state.wellnessHistory || {};
  const dailyTSS  = {};
  state.activities.forEach(a => {
    const d = (a.start_date_local || a.start_date || '').slice(0, 10);
    if (d) dailyTSS[d] = (dailyTSS[d] || 0) + (a.icu_training_load || a.tss || 0);
  });

  // Seed EMA from the most recent wellness entry at or before chart start
  let ctl = 30, atl = 30;
  let seedBack = -1;
  for (let back = 0; back <= 90; back++) {
    const sd = toDateStr(daysAgo(days + back));
    const sw = wellness[sd];
    if (sw && sw.ctl != null) {
      ctl = sw.ctl;
      atl = sw.atl ?? sw.ctl;
      seedBack = back;
      break;
    }
  }
  // Bridge gap days between seed date and chart start
  if (seedBack > 0) {
    for (let g = seedBack - 1; g >= 1; g--) {
      const gd = toDateStr(daysAgo(days + g));
      const t = dailyTSS[gd] || 0;
      ctl = ctl + (t - ctl) / 42;
      atl = atl + (t - atl) / 7;
    }
  }

  const labels = [], ctlD = [], atlD = [], tsbD = [];

  for (let i = days; i >= 0; i--) {
    const d = toDateStr(daysAgo(i));
    const w = wellness[d];
    if (w && w.ctl != null) {
      ctl = w.ctl; atl = w.atl;
      ctlD.push(+ctl.toFixed(1));
      atlD.push(+atl.toFixed(1));
      tsbD.push(w.tsb != null ? +w.tsb.toFixed(1) : +(ctl - atl).toFixed(1));
    } else {
      const t = dailyTSS[d] || 0;
      ctl = ctl + (t - ctl) / 42;
      atl = atl + (t - atl) / 7;
      ctlD.push(+ctl.toFixed(1));
      atlD.push(+atl.toFixed(1));
      tsbD.push(+(ctl - atl).toFixed(1));
    }
    labels.push(d.slice(5));
  }

  const chartOpts = {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: { ...C_TOOLTIP, callbacks: { labelColor: C_LABEL_COLOR } }
    },
    scales: cScales({ xExtra: { maxTicksLimit: 10 } })
  };

  state.fitnessPageChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels, datasets: [
      { label: 'CTL', data: ctlD, borderColor: '#00e5a0', backgroundColor: 'rgba(0,229,160,0.08)', borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.4, fill: true },
      { label: 'ATL', data: atlD, borderColor: '#ff6b35', backgroundColor: 'rgba(255,107,53,0.05)', borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.4 },
      { label: 'TSB', data: tsbD, borderColor: '#4a9eff', backgroundColor: 'rgba(74,158,255,0.05)', borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.4 }
    ]},
    options: chartOpts
  });
}

function renderFitnessWeeklyPageChart() {
  const canvas = document.getElementById('fitnessWeeklyPageChart');
  if (!canvas) return;
  if (state.fitnessWeeklyPageChart) { state.fitnessWeeklyPageChart.destroy(); state.fitnessWeeklyPageChart = null; }

  const weeks = {};
  state.activities.forEach(a => {
    const d  = new Date(a.start_date_local || a.start_date);
    const wk = weekKey(d);
    weeks[wk] = (weeks[wk] || 0) + (a.icu_training_load || a.tss || 0);
  });
  const entries = Object.entries(weeks).sort((a, b) => a[0].localeCompare(b[0])).slice(-16);
  if (!entries.length) return;

  // Color bars by intensity relative to avg
  const vals   = entries.map(([, v]) => Math.round(v));
  const avg    = vals.reduce((s, v) => s + v, 0) / vals.length;
  const colors = vals.map(v => v >= avg * 1.2 ? '#ff6b35' : v >= avg * 0.8 ? '#00e5a0' : 'rgba(0,229,160,0.4)');

  state.fitnessWeeklyPageChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: entries.map(([k]) => 'W' + k.slice(-2)),
      datasets: [{ data: vals, backgroundColor: colors, borderRadius: 4, hoverBackgroundColor: '#00e5a0' }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { ...C_TOOLTIP, callbacks: { label: c => `${c.raw} TSS` } }
      },
      scales: cScales({ xGrid: false, xExtra: { maxRotation: 0 }, yExtra: { maxTicksLimit: 5 } })
    }
  });
}

function renderFitnessMonthlyTable() {
  const tbody = document.getElementById('fitMonthlyBody');
  if (!tbody) return;

  const months = {};
  state.activities.filter(a => !isEmptyActivity(a)).forEach(a => {
    const key = (a.start_date_local || a.start_date || '').slice(0, 7); // YYYY-MM
    if (!key) return;
    if (!months[key]) months[key] = { count: 0, dist: 0, time: 0, tss: 0 };
    months[key].count++;
    months[key].dist += actVal(a, 'distance', 'icu_distance') / 1000;
    months[key].time += actVal(a, 'moving_time', 'elapsed_time', 'icu_moving_time', 'icu_elapsed_time') / 3600;
    months[key].tss  += actVal(a, 'icu_training_load', 'tss');
  });

  const entries = Object.entries(months).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 8);
  if (!entries.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px">No data</td></tr>`;
    return;
  }

  tbody.innerHTML = entries.map(([key, m]) => {
    const [yr, mo] = key.split('-');
    const label = new Date(+yr, +mo - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
    return `<tr>
      <td class="fit-month-label">${label}</td>
      <td>${m.count}</td>
      <td>${m.dist.toFixed(0)} km</td>
      <td>${m.time.toFixed(1)} h</td>
      <td class="fit-tss-cell">${Math.round(m.tss)}</td>
    </tr>`;
  }).join('');
}

/* ====================================================
   HELPERS
==================================================== */
function setLoading(show, text = 'Loading…') {
  document.getElementById('loadingText').textContent = text;
  document.getElementById('loadingOverlay').classList.toggle('active', show);
}

function showToast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className   = 'toast ' + type;
  t.textContent = msg;
  document.getElementById('toastContainer').appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

function fmtDur(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function fmtTime(str) {
  if (!str) return '';
  try { return new Date(str).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
}
function toDateStr(d) {
  // Use local time — NOT toISOString() which converts to UTC and shifts the date
  // for users in UTC+ timezones, causing activities to appear on the wrong day.
  const y  = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${dy}`;
}

// Returns midnight of the week-start day (per state.weekStartDay) containing 'date'.
// startDay: 0=Sunday, 1=Monday. Defaults to state.weekStartDay.
function getWeekStart(date, startDay) {
  if (startDay === undefined) startDay = state.weekStartDay;
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow  = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = (dow - startDay + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

function daysAgo(n)   { const d = new Date(); d.setDate(d.getDate() - n); return d; }

// Returns how many days to fetch so we always cover Jan 1 of the previous calendar year.
// e.g. on Feb 21 2026  →  Jan 1 2025 is 416 days ago  →  returns 421 (+ 5-day buffer)
function defaultSyncDays() {
  const today      = new Date();
  const jan1LastYr = new Date(today.getFullYear() - 1, 0, 1);
  const days       = Math.ceil((today - jan1LastYr) / 86400000);
  return days + 5; // small buffer for timezone safety
}

function weekKey(d) {
  const date = new Date(d);
  const day  = date.getDay() || 7;
  date.setDate(date.getDate() + 4 - day);
  const y  = date.getFullYear();
  const ys = new Date(y, 0, 1);
  return y + String(Math.ceil(((date - ys) / 86400000 + 1) / 7)).padStart(2, '0');
}

/* ====================================================
   CALENDAR
==================================================== */
// calMonth: Date set to the 1st of the displayed month
function getCalMonth() {
  if (!state.calMonth) {
    const now = new Date();
    state.calMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return state.calMonth;
}

function calPrevMonth() {
  const m = getCalMonth();
  state.calMonth = new Date(m.getFullYear(), m.getMonth() - 1, 1);
  renderCalendar();
}

function calNextMonth() {
  const m = getCalMonth();
  state.calMonth = new Date(m.getFullYear(), m.getMonth() + 1, 1);
  renderCalendar();
}

function calGoToday() {
  const now = new Date();
  state.calMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  renderCalendar();
}

function calEventClass(a) {
  const t = (a.sport_type || a.type || '').toLowerCase();
  if (t.includes('virtualride') || t.includes('virtual')) return 'cal-event--virtual';
  if (t.includes('run'))  return 'cal-event--run';
  if (t.includes('swim')) return 'cal-event--swim';
  if (t.includes('ride')) return 'cal-event--ride';
  return 'cal-event--other';
}

function renderCalendar() {
  const m     = getCalMonth();
  const year  = m.getFullYear();
  const month = m.getMonth(); // 0-based

  // Month label
  document.getElementById('calMonthLabel').textContent =
    m.toLocaleString('default', { month: 'long', year: 'numeric' });

  // Build date → [{a, stateIdx}] lookup from all activities
  const actMap = {};
  state.activities.forEach((a, stateIdx) => {
    const d = (a.start_date_local || a.start_date || '').slice(0, 10);
    if (!d) return;
    if (!actMap[d]) actMap[d] = [];
    actMap[d].push({ a, stateIdx });
  });

  // ── Month stats ──
  let totalActs = 0, totalDist = 0, totalTSS = 0, totalSecs = 0;
  const dailyTSSMap = {};
  Object.entries(actMap).forEach(([d, acts]) => {
    const [y, mo] = d.split('-').map(Number);
    if (y === year && mo === month + 1) {
      let dayTSS = 0;
      acts.forEach(({ a }) => {
        if (isEmptyActivity(a)) return;
        totalActs++;
        totalDist += actVal(a, 'distance', 'icu_distance');
        const tss = actVal(a, 'icu_training_load', 'tss');
        totalTSS  += tss;
        dayTSS    += tss;
        totalSecs += actVal(a, 'moving_time', 'elapsed_time', 'icu_moving_time', 'icu_elapsed_time');
      });
      if (dayTSS > 0) dailyTSSMap[d] = dayTSS;
    }
  });
  const maxDayTSS = Math.max(...Object.values(dailyTSSMap), 1);

  const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setEl('calStatActivities', totalActs || '0');
  setEl('calStatDist',       totalDist > 0 ? (totalDist / 1000).toFixed(0) + ' km' : '—');
  setEl('calStatTSS',        totalTSS > 0  ? Math.round(totalTSS) : '—');
  setEl('calStatTime',       totalSecs > 0 ? fmtDur(totalSecs) : '—');

  // ── Build grid cells ──
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  const todayStr = toDateStr(new Date());
  // How many cells to pad before the 1st, based on configured week start day
  const startDow = (firstDay.getDay() - state.weekStartDay + 7) % 7;

  // Update DOW header labels to match the configured week start
  const calDowNames  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const calWeekendDays = [0, 6]; // 0=Sunday, 6=Saturday (JS getDay values)
  const dowRow = document.querySelector('.cal-dow-row');
  if (dowRow) {
    dowRow.innerHTML = '';
    for (let i = 0; i < 7; i++) {
      const dayIdx = (state.weekStartDay + i) % 7;
      const div = document.createElement('div');
      if (calWeekendDays.includes(dayIdx)) div.className = 'cal-dow--weekend';
      div.textContent = calDowNames[dayIdx];
      dowRow.appendChild(div);
    }
  }

  const cells = [];
  for (let i = startDow - 1; i >= 0; i--)
    cells.push({ date: new Date(year, month, -i),     thisMonth: false });
  for (let d = 1; d <= lastDay.getDate(); d++)
    cells.push({ date: new Date(year, month, d),      thisMonth: true });
  const rem = cells.length % 7;
  if (rem > 0)
    for (let i = 1; i <= 7 - rem; i++)
      cells.push({ date: new Date(year, month + 1, i), thisMonth: false });

  const grid = document.getElementById('calGrid');
  grid.innerHTML = cells.map(({ date, thisMonth }) => {
    const dateStr   = toDateStr(date);
    const acts      = actMap[dateStr] || [];
    const realActs  = acts.filter(({ a }) => !isEmptyActivity(a));
    const isToday   = dateStr === todayStr;
    const dow       = date.getDay();
    const isWeekend = dow === 0 || dow === 6;

    const cls = [
      'cal-day',
      !thisMonth  ? 'cal-day--other-month' : '',
      isToday     ? 'cal-day--today'       : '',
      isWeekend   ? 'cal-day--weekend'     : '',
    ].filter(Boolean).join(' ');

    const maxShow = 3;
    const shown   = realActs.slice(0, maxShow);
    const extra   = realActs.length - maxShow;

    const eventsHtml = shown.map(({ a, stateIdx }) => {
      const name = (a.name && a.name.trim()) ? a.name.trim() : activityFallbackName(a);
      const dist = (a.distance || 0) / 1000;
      const secs = a.moving_time || a.elapsed_time || 0;
      const meta = dist > 0.1 ? dist.toFixed(1) + ' km'
                 : secs > 0   ? fmtDur(secs)
                 : '';
      const tc = calEventClass(a);
      return `<div class="cal-event ${tc}" onclick="navigateToActivity(${stateIdx})">
        <div class="cal-event-name">${name}</div>
        ${meta ? `<div class="cal-event-meta">${meta}</div>` : ''}
      </div>`;
    }).join('');

    const moreHtml = extra > 0 ? `<div class="cal-more">+${extra} more</div>` : '';

    // TSS load bar
    const dayTSS = dailyTSSMap[dateStr] || 0;
    const barPct = dayTSS > 0 ? Math.max(8, Math.round(dayTSS / maxDayTSS * 100)) : 0;
    const firstTc = realActs.length > 0 ? calEventClass(realActs[0].a) : '';
    const barColor = firstTc.includes('run')  ? 'var(--orange)'
                   : firstTc.includes('swim') ? 'var(--blue)'
                   : firstTc.includes('virtual') ? 'var(--purple)'
                   : 'var(--accent)';
    const tssBarHtml = barPct > 0
      ? `<div class="cal-day-tss"><div class="cal-day-tss-bar" style="width:${barPct}%;background:${barColor}"></div></div>`
      : '';

    return `<div class="${cls}">
      <div class="cal-day-num">${date.getDate()}</div>
      <div class="cal-events">${eventsHtml}${moreHtml}</div>
      ${tssBarHtml}
    </div>`;
  }).join('');
}

/* ====================================================
   ACTIVITY DETAIL — NAVIGATION
==================================================== */
async function navigateToActivity(actKey, fromStep = false) {
  // Accept an activity object directly (used when stepping prev/next)
  let activity = (actKey && typeof actKey === 'object') ? actKey : null;

  if (!activity) {
    // Resolve via lookup map (set when the activity list was rendered)
    activity = window._actLookup && window._actLookup[actKey];
    // Fallback: numeric index in state.activities (legacy)
    if (!activity) {
      const numIdx = Number(actKey);
      if (!isNaN(numIdx) && numIdx >= 0 && numIdx < state.activities.length) {
        activity = state.activities[numIdx];
      }
    }
  }
  if (!activity) { showToast('Activity data not found', 'error'); return; }

  const _routeId = activity.id || activity.icu_activity_id;
  try { sessionStorage.setItem('icu_route', JSON.stringify({ type: 'activity', actId: String(_routeId) })); } catch {}

  if (!fromStep) state.previousPage = state.currentPage;
  state.currentPage  = 'activity';

  // Track position in the non-empty pool for prev/next navigation
  const pool = state.activities.filter(a => !isEmptyActivity(a));
  const poolIdx = pool.findIndex(a => (a.id && a.id === activity.id) || a === activity);
  state.currentActivityIdx = poolIdx >= 0 ? poolIdx : null;

  const prevBtn = document.getElementById('detailNavPrev');
  const nextBtn = document.getElementById('detailNavNext');
  const counter = document.getElementById('detailNavCounter');
  if (prevBtn) prevBtn.disabled = poolIdx <= 0;
  if (nextBtn) nextBtn.disabled = poolIdx < 0 || poolIdx >= pool.length - 1;
  if (counter) counter.textContent = poolIdx >= 0 ? `${poolIdx + 1} / ${pool.length}` : '';

  // Show the activity page
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-activity').classList.add('active');
  // Hide topbar and page headline — activity page has its own back nav
  document.querySelector('.topbar')?.classList.add('topbar--hidden');
  document.querySelector('.page-headline')?.classList.add('page-headline--hidden');
  // Scroll back to top and remove calendar's full-bleed layout so normal padding is restored
  const pageContent = document.getElementById('pageContent');
  if (pageContent) pageContent.classList.remove('page-content--calendar');
  window.scrollTo(0, 0);

  // Back button label
  const fromLabel = state.previousPage === 'dashboard' ? 'Dashboard' : 'Activities';
  document.getElementById('detailBackLabel').textContent = fromLabel;

  // Topbar is hidden on activity page — title/date are shown in the hero section instead

  // Render basic info immediately from cached data
  renderActivityBasic(activity);

  // Reset charts
  destroyActivityCharts();
  document.getElementById('detailChartsRow').style.display     = 'none';
  document.getElementById('detailChartsLoading').style.display = 'none';

  // Only try to fetch detail/streams if we have an id
  const actId = activity.id;
  if (!actId) return;

  document.getElementById('detailChartsLoading').style.display = 'flex';

  try {
    const [detailResult, streamsResult] = await Promise.allSettled([
      fetchActivityDetail(actId),
      fetchActivityStreams(actId)
    ]);

    const fullDetail = detailResult.status === 'fulfilled' ? detailResult.value : null;
    const streams    = streamsResult.status === 'fulfilled' ? streamsResult.value : null;


    // Re-render stats with richer fields from full detail response
    if (fullDetail) renderActivityBasic({ ...activity, ...fullDetail });

    document.getElementById('detailChartsLoading').style.display = 'none';

    const richActivity = fullDetail ? { ...activity, ...fullDetail } : activity;

    // The individual detail endpoint sometimes omits zone arrays that ARE present
    // on the cached list activity — restore them so the supplementary cards can render.
    ['icu_zone_times', 'icu_hr_zone_times'].forEach(key => {
      if (Array.isArray(activity[key]) && activity[key].length > 0 &&
          (!Array.isArray(richActivity[key]) || richActivity[key].length === 0)) {
        richActivity[key] = activity[key];
      }
    });

    // Normalize streams once here so we can use it for both zone computation and charts.
    // normalizeStreams converts the raw API shape ({type,data}[] or flat object) → flat {key: []}
    const normStreams = streams ? normalizeStreams(streams) : {};

    // If icu_hr_zone_times still not present, compute it from the HR stream
    // using the athlete's configured icu_hr_zones boundaries (bpm upper limits per zone).
    if (!Array.isArray(richActivity.icu_hr_zone_times) || richActivity.icu_hr_zone_times.length === 0) {
      const hrArr    = normStreams.heartrate || normStreams.heart_rate || [];
      const zoneBnds = richActivity.icu_hr_zones;
      const computed = computeHRZoneTimesFromStream(hrArr, zoneBnds);
      if (computed) richActivity.icu_hr_zone_times = computed;
    }

    // Stream charts only when data actually came back
    if (streams) {
      const norm = normStreams;
      renderStreamCharts(norm, richActivity);
    }

    // Supplementary cards — each shows/hides itself based on data availability
    renderDetailZones(richActivity);
    renderDetailHRZones(richActivity);
    // Adjust zones row: force single column when only one card is visible
    const zonesRow = document.querySelector('.detail-zones-row');
    if (zonesRow) {
      const powerHidden = document.getElementById('detailZonesCard')?.style.display === 'none';
      const hrHidden    = document.getElementById('detailHRZonesCard')?.style.display === 'none';
      zonesRow.classList.toggle('detail-zones-row--single', powerHidden || hrHidden);
    }
    renderDetailHistogram(richActivity);
    renderDetailCurve(actId); // async — shows/hides its own card
  } catch (err) {
    document.getElementById('detailChartsLoading').style.display = 'none';
  }
}

function navigateBack() {
  navigate(state.previousPage || 'activities');
}

// Step to the adjacent activity in the sorted list.
// delta = -1 → newer (toward index 0), delta = +1 → older (toward end of array)
function stepActivity(delta) {
  if (state.currentActivityIdx === null) return;
  const pool = state.activities.filter(a => !isEmptyActivity(a));
  const newIdx = state.currentActivityIdx + delta;
  if (newIdx < 0 || newIdx >= pool.length) return;
  navigateToActivity(pool[newIdx], true);
}

function destroyActivityCharts() {
  if (state.activityPowerChart)     { state.activityPowerChart.destroy();     state.activityPowerChart     = null; }
  if (state.activityHRChart)        { state.activityHRChart.destroy();        state.activityHRChart        = null; }
  if (state.activityCurveChart)     { state.activityCurveChart.destroy();     state.activityCurveChart     = null; }
  if (state.activityHistogramChart) { state.activityHistogramChart.destroy(); state.activityHistogramChart = null; }
  ['detailZonesCard', 'detailHRZonesCard', 'detailHistogramCard', 'detailCurveCard'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

/* ====================================================
   ACTIVITY DETAIL — DATA FETCHING
==================================================== */
async function fetchActivityDetail(activityId) {
  const raw = await icuFetch(`/athlete/${state.athleteId}/activities/${activityId}`);
  // intervals.icu returns an array with a single activity object
  return Array.isArray(raw) ? raw[0] : raw;
}

async function fetchActivityStreams(activityId) {
  const types = 'time,watts,heartrate,cadence,velocity_smooth,altitude,distance';
  const res = await fetch(
    ICU_BASE + `/athlete/${state.athleteId}/activities/${activityId}/streams?streams=${types}`,
    { headers: { ...authHeader(), 'Accept': 'application/json' } }
  );
  if (res.status === 404) return null; // activity has no stream data — not an error
  if (!res.ok) throw new Error(`${res.status}: ${await res.text().catch(() => res.statusText)}`);
  return res.json();
}

// Normalise stream data into a flat { key: number[] } map.
// intervals.icu can return several shapes — handle all of them.
function normalizeStreams(raw) {
  if (!raw) return {};

  // Shape 1: already a flat object { watts: [...], heartrate: [...], ... }
  if (!Array.isArray(raw) && typeof raw === 'object') {
    const obj = {};
    Object.entries(raw).forEach(([k, v]) => { if (Array.isArray(v)) obj[k] = v; });
    return obj;
  }

  // Shape 2: array of { type, data } objects  →  [{ type:'watts', data:[...] }, ...]
  if (Array.isArray(raw) && raw.length > 0 && raw[0] && typeof raw[0] === 'object' && raw[0].type) {
    const obj = {};
    raw.forEach(s => { if (s.type && Array.isArray(s.data)) obj[s.type] = s.data; });
    return obj;
  }

  return {};
}

// Downsample all stream arrays together so they stay time-aligned
function downsampleStreams(streams, targetLen = 300) {
  const keys = Object.keys(streams).filter(k => Array.isArray(streams[k]) && streams[k].length > 0);
  if (!keys.length) return streams;
  const totalLen = streams[keys[0]].length;
  if (totalLen <= targetLen) return streams;
  const step = Math.floor(totalLen / targetLen);
  const result = {};
  keys.forEach(key => {
    result[key] = [];
    for (let i = 0; i < totalLen; i += step) {
      const slice = streams[key]
        .slice(i, Math.min(i + step, totalLen))
        .filter(v => v != null && typeof v === 'number');
      result[key].push(slice.length
        ? Math.round(slice.reduce((a, b) => a + b, 0) / slice.length)
        : null);
    }
  });
  return result;
}

/* ====================================================
   ACTIVITY DETAIL — RENDERING
==================================================== */
function renderActivityBasic(a) {
  // ── Eyebrow: icon · type · TSS ────────────────────────────────────────────
  const iconEl = document.getElementById('detailIcon');
  iconEl.className = 'activity-type-icon ' + activityTypeClass(a);
  iconEl.innerHTML = activityTypeIcon(a);
  document.getElementById('detailType').textContent = a.sport_type || a.type || '';

  const tss   = Math.round(actVal(a, 'icu_training_load', 'tss'));
  const tssEl = document.getElementById('detailTSSBadge');
  tssEl.textContent   = tss > 0 ? `${tss} TSS` : '';
  tssEl.style.display = tss > 0 ? 'flex' : 'none';

  // ── Title & date ──────────────────────────────────────────────────────────
  const aName = (a.name && a.name.trim()) ? a.name.trim() : activityFallbackName(a);
  document.getElementById('detailName').textContent = aName;
  const dateStr = fmtDate(a.start_date_local || a.start_date);
  const timeStr = fmtTime(a.start_date_local || a.start_date);
  document.getElementById('detailDate').textContent = dateStr + (timeStr ? ' · ' + timeStr : '');

  // ── Raw values ────────────────────────────────────────────────────────────
  const dist     = actVal(a, 'distance', 'icu_distance');
  const distKm   = dist / 1000;
  const secs     = actVal(a, 'moving_time', 'elapsed_time', 'icu_moving_time', 'icu_elapsed_time',
                           'moving_time_seconds', 'elapsed_time_seconds');
  const rawSpd   = actVal(a, 'average_speed', 'icu_average_speed', 'average_speed_meters_per_sec');
  const speedMs  = rawSpd || (secs > 0 && dist ? dist / secs : 0);
  const speedKmh = speedMs * 3.6;
  const avgW     = actVal(a, 'average_watts', 'icu_average_watts');
  const np       = actVal(a, 'icu_weighted_avg_watts', 'normalized_power');
  const maxW     = actVal(a, 'max_watts', 'icu_max_watts');
  const ifVal    = a.intensity_factor || 0;
  const avgHR    = actVal(a, 'average_heartrate', 'icu_average_heartrate') ||
                   (a.heart_rate && a.heart_rate.average) || 0;
  const maxHR    = actVal(a, 'max_heartrate', 'icu_max_heartrate') ||
                   (a.heart_rate && a.heart_rate.max) || 0;
  const avgCad   = actVal(a, 'average_cadence', 'icu_average_cadence') ||
                   (a.cadence && a.cadence.average) || 0;
  const cals     = actVal(a, 'calories', 'icu_calories') ||
                   (a.other && a.other.calories) || 0;
  const elev     = Math.round(actVal(a, 'total_elevation_gain', 'icu_total_elevation_gain'));

  // ── Primary stats: up to 4 hero numbers ───────────────────────────────────
  const pStat = (val, lbl, accent = false) =>
    `<div class="act-pstat${accent ? ' act-pstat--accent' : ''}">
       <div class="act-pstat-val">${val}</div>
       <div class="act-pstat-lbl">${lbl}</div>
     </div>`;

  const primary = [];
  if (distKm > 0.05) primary.push(pStat(distKm.toFixed(1), 'km'));
  if (secs > 0)      primary.push(pStat(fmtDur(secs), 'duration'));
  if (np > 0)        primary.push(pStat(Math.round(np) + 'W', 'norm power', true));
  else if (avgW > 0) primary.push(pStat(Math.round(avgW) + 'W', 'avg power', true));
  if (avgHR > 0)     primary.push(pStat(Math.round(avgHR), 'avg bpm'));
  else if (speedKmh > 0.5) primary.push(pStat(speedKmh.toFixed(1), 'km/h'));

  const primaryEl = document.getElementById('actPrimaryStats');
  primaryEl.innerHTML = primary.slice(0, 4).join('');
  primaryEl.style.gridTemplateColumns = `repeat(${Math.min(primary.length, 4)}, 1fr)`;

  // ── Secondary stats: icon tiles ──────────────────────────────────────────
  const SICONS = {
    elev:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 20 9 8 15 14 20 6"/></svg>`,
    speed:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 10 10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    zap:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    target: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
    heart:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
    cad:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`,
    fire:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3z"/></svg>`,
    pulse:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
  };
  const sStat = (val, lbl, icon, color) =>
    `<div class="act-sstat">
       <div class="act-sstat-icon ${color}">${SICONS[icon]}</div>
       <div class="act-sstat-val">${val}</div>
       <div class="act-sstat-lbl">${lbl}</div>
     </div>`;

  let sec = '';
  if (elev > 0)                  sec += sStat(elev.toLocaleString() + ' m', 'Elevation',    'elev',   'green');
  if (speedKmh > 0.5 && np > 0) sec += sStat(speedKmh.toFixed(1) + ' km/h','Avg Speed',    'speed',  'blue');
  if (avgW > 0 && np > 0)        sec += sStat(Math.round(avgW) + 'W',       'Avg Power',    'zap',    'orange');
  if (maxW > 0)                  sec += sStat(Math.round(maxW) + 'W',       'Max Power',    'zap',    'orange');
  if (ifVal > 0)                 sec += sStat(ifVal.toFixed(2),              'Int. Factor',  'target', 'purple');
  if (maxHR > 0)                 sec += sStat(Math.round(maxHR) + ' bpm',   'Max HR',       'heart',  'red');
  if (avgCad > 0)                sec += sStat(Math.round(avgCad) + ' rpm',  'Cadence',      'cad',    'yellow');
  if (cals > 0)                  sec += sStat(Math.round(cals).toLocaleString(), 'Calories', 'fire',   'orange');
  if (tss > 0)                   sec += sStat(tss,                           'TSS',          'pulse',  'green');

  document.getElementById('actSecondaryStats').innerHTML = sec;
}

function renderStreamCharts(streams, activity) {
  const ds = downsampleStreams(streams, 300);

  // Normalise stream key names (intervals.icu may use 'watts' or 'power', 'heartrate' or 'heart_rate')
  if (!ds.watts && ds.power)      ds.watts     = ds.power;
  if (!ds.heartrate && ds.heart_rate) ds.heartrate = ds.heart_rate;

  // Time axis labels from time stream, or fallback to minutes
  const rawTime = ds.time || [];
  const refLen  = (ds.watts || ds.heartrate || []).length;
  const labels  = Array.from({ length: refLen }, (_, i) => {
    const s = rawTime[i] != null ? rawTime[i] : i;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}` : `${m}m`;
  });

  let hasCharts = false;
  const powerCard = document.getElementById('detailPowerCard');
  const hrCard    = document.getElementById('detailHRCard');
  powerCard.style.display = 'none';
  hrCard.style.display    = 'none';

  if (ds.watts && ds.watts.some(v => v > 0)) {
    hasCharts = true;
    powerCard.style.display = 'block';
    const avgW = Math.round(activity.average_watts || 0);
    const npW  = Math.round(activity.icu_weighted_avg_watts || 0);
    document.getElementById('detailPowerSubtitle').textContent =
      [avgW > 0 ? `Avg ${avgW}w` : '', npW > 0 ? `NP ${npW}w` : ''].filter(Boolean).join(' · ');
    if (state.activityPowerChart) state.activityPowerChart.destroy();
    state.activityPowerChart = new Chart(
      document.getElementById('activityPowerChart').getContext('2d'),
      streamChartConfig(labels, ds.watts, '#00e5a0', 'rgba(0,229,160,0.08)', 'w')
    );
  }

  if (ds.heartrate && ds.heartrate.some(v => v > 0)) {
    hasCharts = true;
    hrCard.style.display = 'block';
    const avgHR = Math.round(activity.average_heartrate || 0);
    const maxHR = Math.round(activity.max_heartrate || 0);
    document.getElementById('detailHRSubtitle').textContent =
      [avgHR > 0 ? `Avg ${avgHR} bpm` : '', maxHR > 0 ? `Max ${maxHR} bpm` : ''].filter(Boolean).join(' · ');
    if (state.activityHRChart) state.activityHRChart.destroy();
    state.activityHRChart = new Chart(
      document.getElementById('activityHRChart').getContext('2d'),
      streamChartConfig(labels, ds.heartrate, '#ff6b35', 'rgba(255,107,53,0.08)', 'bpm')
    );
  }

  if (hasCharts) {
    const chartsRow = document.getElementById('detailChartsRow');
    const both = powerCard.style.display !== 'none' && hrCard.style.display !== 'none';
    chartsRow.style.gridTemplateColumns = both ? '1fr 1fr' : '1fr';
    chartsRow.style.display = 'grid';
  }
}

// Hex colours that map to our zone CSS vars (used in Chart.js which needs actual colour values)
const ZONE_HEX = ['#4a9eff', '#00e5a0', '#ffcc00', '#ff6b35', '#ff5252', '#b482ff'];

// Render zone bar charts when time-series streams are not available.
// Uses icu_zone_times (power) and icu_hr_zone_times (HR) from the activity object.
function renderActivityZoneCharts(activity) {
  const chartsRow = document.getElementById('detailChartsRow');
  const powerCard = document.getElementById('detailPowerCard');
  const hrCard    = document.getElementById('detailHRCard');
  if (state.activityPowerChart) { state.activityPowerChart.destroy(); state.activityPowerChart = null; }
  if (state.activityHRChart)    { state.activityHRChart.destroy();    state.activityHRChart    = null; }
  powerCard.style.display = 'none';
  hrCard.style.display    = 'none';

  function zoneBarConfig(labels, data, colors) {
    return {
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 4 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { ...C_TOOLTIP, callbacks: { label: c => `${c.raw} min` } }
        },
        scales: cScales({ xGrid: false, yExtra: { callback: v => v + 'm' } })
      }
    };
  }

  let hasCharts = false;

  // ── Power zones ────────────────────────────────────────────────────────────
  const zt = activity.icu_zone_times;
  if (Array.isArray(zt) && zt.length > 0) {
    const labels = [], data = [], colors = [];
    zt.forEach(z => {
      if (!z || typeof z.id !== 'string') return;
      const m = z.id.match(/^Z(\d)$/);
      if (!m) return;
      const idx = parseInt(m[1], 10) - 1;
      if (idx >= 0 && idx < 6 && (z.secs || 0) > 0) {
        labels.push(`${z.id} · ${ZONE_NAMES[idx]}`);
        data.push(+(z.secs / 60).toFixed(1));
        colors.push(ZONE_HEX[idx] + 'b3'); // ~70% opacity
      }
    });
    if (data.length > 0) {
      hasCharts = true;
      powerCard.style.display = 'block';
      document.getElementById('detailPowerSubtitle').textContent = 'Time in power zone';
      state.activityPowerChart = new Chart(
        document.getElementById('activityPowerChart').getContext('2d'),
        zoneBarConfig(labels, data, colors)
      );
    }
  }

  // ── HR zones ───────────────────────────────────────────────────────────────
  const hzt = activity.icu_hr_zone_times;
  if (Array.isArray(hzt) && hzt.length > 0) {
    const labels = [], data = [], colors = [];
    hzt.forEach(z => {
      if (!z || typeof z.id !== 'string') return;
      const m = z.id.match(/^Z(\d)$/);
      if (!m) return;
      const idx = parseInt(m[1], 10) - 1;
      if (idx >= 0 && idx < 6 && (z.secs || 0) > 0) {
        labels.push(`${z.id} · ${ZONE_NAMES[idx]}`);
        data.push(+(z.secs / 60).toFixed(1));
        colors.push(ZONE_HEX[idx] + 'b3');
      }
    });
    if (data.length > 0) {
      hasCharts = true;
      hrCard.style.display = 'block';
      document.getElementById('detailHRSubtitle').textContent = 'Time in HR zone';
      state.activityHRChart = new Chart(
        document.getElementById('activityHRChart').getContext('2d'),
        zoneBarConfig(labels, data, colors)
      );
    }
  }

  if (hasCharts) {
    const both = powerCard.style.display !== 'none' && hrCard.style.display !== 'none';
    chartsRow.style.gridTemplateColumns = both ? '1fr 1fr' : '1fr';
    chartsRow.style.display = 'grid';
  }
}

/* ====================================================
   ACTIVITY DETAIL — SUPPLEMENTARY ANALYSIS CARDS
==================================================== */

// Detailed zone table (power zones with bars + time + %)
function renderDetailZones(activity) {
  const card = document.getElementById('detailZonesCard');
  if (!card) return;

  const zt = activity.icu_zone_times;
  if (!Array.isArray(zt) || zt.length === 0) { card.style.display = 'none'; return; }

  // Build index → secs map for Z1–Z6
  const totals = new Array(6).fill(0);
  let totalSecs = 0;
  zt.forEach(z => {
    if (!z || typeof z.id !== 'string') return;
    const m = z.id.match(/^Z(\d)$/);
    if (!m) return;
    const idx = parseInt(m[1], 10) - 1;
    if (idx >= 0 && idx < 6) { totals[idx] += (z.secs || 0); totalSecs += (z.secs || 0); }
  });

  if (totalSecs === 0) { card.style.display = 'none'; return; }

  document.getElementById('detailZonesTotalBadge').textContent = fmtDur(totalSecs) + ' total';
  document.getElementById('detailZonesSubtitle').textContent   = 'Time in power zone · this ride';

  document.getElementById('detailZoneList').innerHTML = totals.map((secs, i) => {
    const pct   = totalSecs > 0 ? (secs / totalSecs * 100).toFixed(1) : '0.0';
    const color = ZONE_HEX[i];
    const dim   = secs === 0 ? ' style="opacity:0.35"' : '';
    return `<div class="detail-zone-row"${dim}>
      <span class="detail-zone-tag" style="color:${color}">${ZONE_TAGS[i]}</span>
      <span class="detail-zone-name">${ZONE_NAMES[i]}</span>
      <div class="detail-zone-bar-track">
        <div class="detail-zone-bar-fill" style="width:${pct}%;background:${color}"></div>
      </div>
      <span class="detail-zone-time">${secs > 0 ? fmtDur(secs) : '—'}</span>
      <span class="detail-zone-pct" style="color:${color}">${pct}%</span>
    </div>`;
  }).join('');

  card.style.display = '';
}

// Compute HR zone times from a raw second-by-second HR stream.
// zoneBoundaries: icu_hr_zones — array of UPPER bpm limits per zone, e.g. [136,152,158,169,174,179,187]
// Each sample counts as 1 second. Last zone catches everything above the second-to-last boundary.
function computeHRZoneTimesFromStream(hrStream, zoneBoundaries) {
  if (!Array.isArray(hrStream) || hrStream.length === 0) return null;
  if (!Array.isArray(zoneBoundaries) || zoneBoundaries.length === 0) return null;
  const n = zoneBoundaries.length;
  const secs = new Array(n).fill(0);
  hrStream.forEach(bpm => {
    if (!bpm || bpm <= 0) return;
    let z = n - 1; // default: last zone
    for (let i = 0; i < n; i++) { if (bpm <= zoneBoundaries[i]) { z = i; break; } }
    secs[z]++;
  });
  if (secs.every(s => s === 0)) return null;
  return secs.map((s, i) => ({ id: `Z${i + 1}`, secs: s }));
}

// Detailed HR zone table — mirrors renderDetailZones but uses icu_hr_zone_times
function renderDetailHRZones(activity) {
  const card = document.getElementById('detailHRZonesCard');
  if (!card) return;

  const hzt = activity.icu_hr_zone_times;
  if (!Array.isArray(hzt) || hzt.length === 0) { card.style.display = 'none'; return; }

  // Normalise to [{id,secs}] — API returns plain numbers [1783,1152,...] or objects [{id,secs}]
  const entries = hzt.map((z, i) =>
    typeof z === 'number' ? { id: `Z${i + 1}`, secs: z } : z
  );

  const numZones = Math.min(entries.length, 7);
  const totals = new Array(numZones).fill(0);
  let totalSecs = 0;
  entries.forEach(z => {
    if (!z || typeof z.id !== 'string') return;
    const m = z.id.match(/^Z(\d)$/);
    if (!m) return;
    const idx = parseInt(m[1], 10) - 1;
    if (idx >= 0 && idx < numZones) { totals[idx] += (z.secs || 0); totalSecs += (z.secs || 0); }
  });

  if (totalSecs === 0) { card.style.display = 'none'; return; }

  // Pull avg/max HR from the activity for the subtitle
  const avgHR = actVal(activity, 'average_heartrate', 'icu_average_heartrate');
  const maxHR = actVal(activity, 'max_heartrate', 'icu_max_heartrate');
  const hintParts = [];
  if (avgHR > 0) hintParts.push(`avg ${Math.round(avgHR)} bpm`);
  if (maxHR > 0) hintParts.push(`max ${Math.round(maxHR)} bpm`);

  document.getElementById('detailHRZonesTotalBadge').textContent = fmtDur(totalSecs) + ' total';
  document.getElementById('detailHRZonesSubtitle').textContent   =
    hintParts.length ? `Time in HR zone · ${hintParts.join(' · ')}` : 'Time in HR zone · this ride';

  document.getElementById('detailHRZoneList').innerHTML = totals.map((secs, i) => {
    const pct   = totalSecs > 0 ? (secs / totalSecs * 100).toFixed(1) : '0.0';
    const color = ZONE_HEX[i] || ZONE_HEX[ZONE_HEX.length - 1];
    const tag   = `Z${i + 1}`;
    const name  = HR_ZONE_NAMES[i] || tag;
    const dim   = secs === 0 ? ' style="opacity:0.35"' : '';
    return `<div class="detail-zone-row"${dim}>
      <span class="detail-zone-tag" style="color:${color}">${tag}</span>
      <span class="detail-zone-name">${name}</span>
      <div class="detail-zone-bar-track">
        <div class="detail-zone-bar-fill" style="width:${pct}%;background:${color}"></div>
      </div>
      <span class="detail-zone-time">${secs > 0 ? fmtDur(secs) : '—'}</span>
      <span class="detail-zone-pct" style="color:${color}">${pct}%</span>
    </div>`;
  }).join('');

  card.style.display = '';
}

// Power histogram — time (mins) at each watt bucket
function renderDetailHistogram(activity) {
  const card = document.getElementById('detailHistogramCard');
  if (!card) return;

  // power_histogram is typically [{watts: N, secs: N}, ...] in the full detail response
  const hist = activity.power_histogram;
  if (!Array.isArray(hist) || hist.length === 0) { card.style.display = 'none'; return; }

  const filtered = hist.filter(h => h && h.watts >= 0 && (h.secs || h.seconds) > 0);
  if (filtered.length === 0) { card.style.display = 'none'; return; }

  // Group into 20 w buckets for a clean bar chart
  const BUCKET = 20;
  const buckets = {};
  filtered.forEach(h => {
    const key = Math.floor((h.watts || 0) / BUCKET) * BUCKET;
    buckets[key] = (buckets[key] || 0) + (h.secs || h.seconds || 0);
  });

  const entries = Object.entries(buckets)
    .map(([k, v]) => ({ watts: +k, mins: +(v / 60).toFixed(1) }))
    .sort((a, b) => a.watts - b.watts);

  if (entries.length === 0) { card.style.display = 'none'; return; }
  card.style.display = '';

  if (state.activityHistogramChart) { state.activityHistogramChart.destroy(); state.activityHistogramChart = null; }
  state.activityHistogramChart = new Chart(
    document.getElementById('activityHistogramChart').getContext('2d'), {
      type: 'bar',
      data: {
        labels: entries.map(e => e.watts + 'w'),
        datasets: [{
          data:  entries.map(e => e.mins),
          backgroundColor: 'rgba(0,229,160,0.45)',
          hoverBackgroundColor: '#00e5a0',
          borderRadius: 2,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { ...C_TOOLTIP, callbacks: { label: c => `${c.raw} min` } }
        },
        scales: cScales({ xGrid: false, xExtra: { maxTicksLimit: 12, maxRotation: 0 }, yExtra: { callback: v => v + 'm' } })
      }
    }
  );
}

// Fetch and render per-ride power curve
async function fetchActivityPowerCurve(activityId) {
  const res = await fetch(
    ICU_BASE + `/athlete/${state.athleteId}/activities/${activityId}/power-curve`,
    { headers: { ...authHeader(), 'Accept': 'application/json' } }
  );
  if (res.status === 404) return null; // no power data for this activity — not an error
  if (!res.ok) throw new Error(`${res.status}: ${await res.text().catch(() => res.statusText)}`);
  return res.json();
}

async function renderDetailCurve(actId) {
  const card = document.getElementById('detailCurveCard');
  if (!card) return;

  let raw = null;
  try {
    const data = await fetchActivityPowerCurve(actId);
    const candidate = Array.isArray(data) ? data[0] : (data.list?.[0] ?? data);
    if (candidate && Array.isArray(candidate.secs) && candidate.secs.length > 0) raw = candidate;
  } catch (e) { /* endpoint not available */ }

  if (!raw) { card.style.display = 'none'; return; }
  card.style.display = '';

  // Peak stat pills
  const lookup = {};
  raw.secs.forEach((s, i) => { if (raw.watts[i]) lookup[s] = raw.watts[i]; });
  function peakWatts(target) {
    if (lookup[target]) return lookup[target];
    let best = null, minDiff = Infinity;
    raw.secs.forEach(s => {
      const d = Math.abs(s - target);
      if (d < minDiff && lookup[s]) { minDiff = d; best = lookup[s]; }
    });
    return best;
  }

  document.getElementById('detailCurvePeaks').innerHTML = CURVE_PEAKS.map(p => {
    const w = Math.round(peakWatts(p.secs) || 0);
    if (!w) return '';
    return `<div class="curve-peak">
      <div class="curve-peak-val">${w}<span class="curve-peak-unit">w</span></div>
      <div class="curve-peak-dur">${p.label}</div>
    </div>`;
  }).join('');

  const chartData = raw.secs.map((s, i) => ({ x: s, y: raw.watts[i] })).filter(pt => pt.y > 0);
  const maxSecs   = chartData[chartData.length - 1]?.x || 3600;

  if (state.activityCurveChart) { state.activityCurveChart.destroy(); state.activityCurveChart = null; }
  state.activityCurveChart = new Chart(
    document.getElementById('activityCurveChart').getContext('2d'), {
      type: 'line',
      data: {
        datasets: [{
          data: chartData,
          borderColor: '#00e5a0',
          backgroundColor: 'rgba(0,229,160,0.07)',
          fill: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 4, borderWidth: 2,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: { ...C_TOOLTIP, callbacks: {
            title: items => fmtSecsShort(items[0].parsed.x),
            label: ctx  => `${Math.round(ctx.parsed.y)}w`,
          }}
        },
        scales: {
          x: {
            type: 'logarithmic', min: 1, max: maxSecs,
            grid: C_GRID,
            ticks: { ...C_TICK, autoSkip: false, maxRotation: 0, callback: val => CURVE_TICK_MAP[val] ?? null }
          },
          y: { grid: C_GRID, ticks: { ...C_TICK, callback: v => v + 'w' } }
        }
      }
    }
  );
}

function streamChartConfig(labels, data, color, fill, unit) {
  return {
    type: 'line',
    data: { labels, datasets: [{ data, borderColor: color, backgroundColor: fill, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.4, fill: true, spanGaps: true }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { ...C_TOOLTIP, callbacks: { label: c => `${c.raw} ${unit}` } }
      },
      scales: cScales({ xExtra: { maxTicksLimit: 8 } })
    }
  };
}

/* ====================================================
   SETUP LINK (cross-device credential sharing)
==================================================== */
function copySetupLink() {
  if (!state.athleteId || !state.apiKey) {
    showToast('Connect first to generate a setup link', 'error');
    return;
  }
  const url = window.location.origin + window.location.pathname +
    '#id=' + encodeURIComponent(state.athleteId) +
    '&key=' + encodeURIComponent(state.apiKey);
  navigator.clipboard.writeText(url).then(() => {
    showToast('Setup link copied — open it on any device to connect instantly', 'success');
  }).catch(() => {
    prompt('Copy this link and open it on your phone:', url);
  });
}

/* ====================================================
   INIT
==================================================== */
const savedRange = parseInt(localStorage.getItem('icu_range_days'));
if ([7, 14, 30, 60, 90, 365].includes(savedRange)) {
  state.rangeDays = savedRange;
  document.querySelectorAll('#dateRangePill button').forEach(b => b.classList.remove('active'));
  document.getElementById('range' + savedRange)?.classList.add('active');
}
// Init Training Load range label
const initRangeLabel = document.getElementById('fitnessRangeLabel');
if (initRangeLabel) initRangeLabel.textContent = rangeLabel(state.rangeDays);
// Sync settings default-range buttons
document.querySelectorAll('[data-defrange]').forEach(b =>
  b.classList.toggle('active', parseInt(b.dataset.defrange) === state.rangeDays)
);

const savedWeekStart = parseInt(localStorage.getItem('icu_week_start_day'));
if (savedWeekStart === 0 || savedWeekStart === 1) {
  state.weekStartDay = savedWeekStart;
}
document.querySelectorAll('[data-weekstart]').forEach(btn => {
  btn.classList.toggle('active', parseInt(btn.dataset.weekstart) === state.weekStartDay);
});

// Load units preference
loadUnits();
// Load saved profile picture
loadAvatar();
document.querySelectorAll('[data-units]').forEach(btn =>
  btn.classList.toggle('active', btn.dataset.units === state.units)
);
const elevEl = document.getElementById('settingsElevUnit');
if (elevEl) elevEl.textContent = state.units === 'imperial' ? 'feet' : 'metres';

// Capture any saved route before navigate('dashboard') overwrites sessionStorage
const _initRoute = (() => { try { return JSON.parse(sessionStorage.getItem('icu_route')); } catch { return null; } })();

navigate('dashboard');

// Check URL hash for setup link credentials (e.g. #id=i12345&key=abc...)
// The hash is never sent to any server, so credentials stay private.
(function applyHashCredentials() {
  const hash = window.location.hash.slice(1);
  if (!hash) return;
  const p = new URLSearchParams(hash);
  const hashId  = p.get('id');
  const hashKey = p.get('key');
  if (hashId && hashKey) {
    saveCredentials(hashId, hashKey);
    // Remove credentials from URL bar without reloading
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
})();

const hasCredentials = loadCredentials();
if (hasCredentials) {
  // Pre-load cached activities so the dashboard renders instantly,
  // then syncData() will fetch only what's new in the background.
  const cached = loadActivityCache();
  if (cached) {
    state.activities = cached.activities;
    state.synced = true;
    updateConnectionUI(true);
    renderDashboard();
  } else {
    updateConnectionUI(false);
  }
  // Restore the page the user was on before refresh
  const _validPages = ['dashboard','activities','calendar','fitness','power','zones','settings','workout','guide'];
  if (_initRoute && _initRoute.type === 'activity' && _initRoute.actId) {
    // Find by ID directly — _actLookup may not be built yet so search state.activities
    const _restoredAct = state.activities.find(a => String(a.id) === String(_initRoute.actId));
    if (_restoredAct) navigateToActivity(_restoredAct);
  } else if (_initRoute && _initRoute.type === 'page' && _validPages.includes(_initRoute.page)) {
    navigate(_initRoute.page);
  }
  syncData();
} else {
  openModal();
}

// Close modal on backdrop click (only when already connected)
document.getElementById('connectModal').addEventListener('click', function(e) {
  if (e.target === this && (state.athleteId && state.apiKey)) closeModal();
});

/* ====================================================
   WORKOUT BUILDER
==================================================== */
const wrkState = {
  name: 'New Workout',
  segments: [],
  editIdx: null,
  ftpOverride: null,
};

// Segment type defaults
const WRK_DEFAULTS = {
  warmup:   { type:'warmup',   duration:600,  powerLow:50,  powerHigh:75 },
  steady:   { type:'steady',   duration:1200, power:88 },
  interval: { type:'interval', reps:5, onDuration:180, onPower:120, offDuration:120, offPower:50 },
  cooldown: { type:'cooldown', duration:600,  powerLow:75,  powerHigh:40 },
  free:     { type:'free',     duration:600 },
};

// Zone color by % FTP
function wrkZoneColor(pct, alpha = 0.88) {
  if (pct < 55)  return `rgba(110,110,150,${alpha})`;
  if (pct < 75)  return `rgba(74,158,255,${alpha})`;
  if (pct < 90)  return `rgba(0,229,160,${alpha})`;
  if (pct < 105) return `rgba(255,204,0,${alpha})`;
  if (pct < 120) return `rgba(255,107,53,${alpha})`;
  return             `rgba(255,82,82,${alpha})`;
}

function wrkGetFtp() {
  if (wrkState.ftpOverride) return wrkState.ftpOverride;
  const ftp = state.athlete?.ftp || state.athlete?.icu_ftp || state.athlete?.threshold_power;
  return (ftp && ftp > 0) ? ftp : 250;
}

function wrkSegDuration(seg) {
  return seg.type === 'interval'
    ? seg.reps * (seg.onDuration + seg.offDuration)
    : seg.duration;
}

function wrkTotalSecs() {
  return wrkState.segments.reduce((s, seg) => s + wrkSegDuration(seg), 0);
}

function wrkFmtTime(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function wrkEstimateTSS() {
  const ftp = wrkGetFtp();
  let totalWorkJ = 0, totalSecs = 0;
  wrkState.segments.forEach(seg => {
    const dur = wrkSegDuration(seg);
    totalSecs += dur;
    if (seg.type === 'warmup' || seg.type === 'cooldown') {
      totalWorkJ += ftp * ((seg.powerLow + seg.powerHigh) / 2 / 100) * dur;
    } else if (seg.type === 'steady') {
      totalWorkJ += ftp * (seg.power / 100) * dur;
    } else if (seg.type === 'interval') {
      const repD = seg.onDuration + seg.offDuration;
      const avgP = (seg.onPower * seg.onDuration + seg.offPower * seg.offDuration) / repD / 100;
      totalWorkJ += ftp * avgP * dur;
    } else if (seg.type === 'free') {
      totalWorkJ += ftp * 0.55 * dur;
    }
  });
  if (totalSecs === 0) return 0;
  const np = totalWorkJ / totalSecs;
  const IF = np / ftp;
  return Math.round((totalSecs * np * IF) / (ftp * 3600) * 100);
}

function wrkSetFtp(val) {
  wrkState.ftpOverride = val ? parseInt(val) : null;
  wrkRefreshStats();
  wrkDrawChart();
}

function wrkRefreshStats() {
  const ftp = wrkGetFtp();
  const secs = wrkTotalSecs();
  const el = document.getElementById('wrkTotalTime');
  if (el) el.textContent = wrkFmtTime(secs);
  const tssEl = document.getElementById('wrkTotalTSS');
  if (tssEl) tssEl.textContent = wrkEstimateTSS();
  const ftpEl = document.getElementById('wrkFtpDisp');
  if (ftpEl) ftpEl.textContent = ftp;
}

/* ── Canvas chart ─────────────────────────────── */
function wrkDrawChart() {
  const canvas = document.getElementById('wrkCanvas');
  const empty  = document.getElementById('wrkChartEmpty');
  if (!canvas) return;

  const segs = wrkState.segments;
  if (!segs.length) {
    canvas.style.display = 'none';
    if (empty) empty.style.display = 'flex';
    return;
  }
  canvas.style.display = 'block';
  if (empty) empty.style.display = 'none';

  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const PAD_T = 20, PAD_B = 28, PAD_L = 38, PAD_R = 10;
  const cW = W - PAD_L - PAD_R;
  const cH = H - PAD_T - PAD_B;
  const totalSecs = wrkTotalSecs();
  const MAX_PCT = 160;

  // Background
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.clearRect(0, 0, W, H);

  // Y-axis grid lines
  const gridPcts = [50, 75, 100, 125];
  ctx.font = `10px 'JetBrains Mono', monospace`;
  ctx.textAlign = 'right';
  gridPcts.forEach(pct => {
    const y = PAD_T + cH * (1 - pct / MAX_PCT);
    ctx.strokeStyle = pct === 100 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)';
    ctx.lineWidth = pct === 100 ? 1 : 0.5;
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(PAD_L + cW, y); ctx.stroke();
    ctx.fillStyle = pct === 100 ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.2)';
    ctx.fillText(pct + '%', PAD_L - 4, y + 3.5);
  });

  // Draw segments
  let curSec = 0;
  segs.forEach((seg, idx) => {
    const dur  = wrkSegDuration(seg);
    const x    = PAD_L + (curSec / totalSecs) * cW;
    const segW = (dur / totalSecs) * cW;
    const isSelected = idx === wrkState.editIdx;

    if (seg.type === 'warmup') {
      wrkDrawRamp(ctx, x, segW, seg.powerLow, seg.powerHigh, MAX_PCT, PAD_T, cH);
    } else if (seg.type === 'cooldown') {
      wrkDrawRamp(ctx, x, segW, seg.powerHigh, seg.powerLow, MAX_PCT, PAD_T, cH);
    } else if (seg.type === 'steady') {
      wrkDrawBlock(ctx, x, segW, seg.power, MAX_PCT, PAD_T, cH);
    } else if (seg.type === 'interval') {
      const repW  = segW / seg.reps;
      const onW   = repW * seg.onDuration / (seg.onDuration + seg.offDuration);
      const offW  = repW - onW;
      for (let r = 0; r < seg.reps; r++) {
        wrkDrawBlock(ctx, x + r * repW,       onW,  seg.onPower,  MAX_PCT, PAD_T, cH);
        wrkDrawBlock(ctx, x + r * repW + onW, offW, seg.offPower, MAX_PCT, PAD_T, cH);
      }
    } else if (seg.type === 'free') {
      wrkDrawFree(ctx, x, segW, MAX_PCT, PAD_T, cH);
    }

    // Selection highlight
    if (isSelected) {
      const topPct = seg.type === 'interval' ? Math.max(seg.onPower, seg.offPower)
                   : seg.type === 'warmup' || seg.type === 'cooldown' ? Math.max(seg.powerLow, seg.powerHigh)
                   : seg.type === 'steady' ? seg.power : 55;
      const selY = PAD_T + cH * (1 - topPct / MAX_PCT);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(x + 1, selY, segW - 2, cH + PAD_T - selY - 1);
      ctx.setLineDash([]);
    }

    // Time label at segment start (skip first and very narrow ones)
    if (idx > 0 && segW > 30) {
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.textAlign = 'center';
      ctx.font = '9px Inter, sans-serif';
      ctx.fillText(wrkFmtTime(Math.round(curSec)), x, PAD_T + cH + 16);
    }

    curSec += dur;
  });

  // Final time label
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.textAlign = 'center';
  ctx.font = '9px Inter, sans-serif';
  ctx.fillText(wrkFmtTime(Math.round(totalSecs)), PAD_L + cW, PAD_T + cH + 16);
}

function wrkDrawBlock(ctx, x, w, pct, maxPct, padT, cH) {
  const barH = Math.max(2, (pct / maxPct) * cH);
  const y = padT + cH - barH;
  ctx.fillStyle = wrkZoneColor(pct);
  ctx.fillRect(x, y, Math.max(1, w), barH);
}

function wrkDrawRamp(ctx, x, w, pctFrom, pctTo, maxPct, padT, cH) {
  const bottom = padT + cH;
  const yFrom  = padT + cH - (pctFrom / maxPct) * cH;
  const yTo    = padT + cH - (pctTo   / maxPct) * cH;
  const grad   = ctx.createLinearGradient(x, 0, x + w, 0);
  grad.addColorStop(0, wrkZoneColor(pctFrom, 0.9));
  grad.addColorStop(1, wrkZoneColor(pctTo,   0.9));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(x,     bottom);
  ctx.lineTo(x,     yFrom);
  ctx.lineTo(x + w, yTo);
  ctx.lineTo(x + w, bottom);
  ctx.closePath();
  ctx.fill();
}

function wrkDrawFree(ctx, x, w, maxPct, padT, cH) {
  const pct  = 50;
  const barH = (pct / maxPct) * cH;
  const y    = padT + cH - barH;
  ctx.fillStyle = 'rgba(120,120,140,0.35)';
  ctx.fillRect(x, y, Math.max(1, w), barH);
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  for (let i = 0; i < w; i += 8) ctx.fillRect(x + i, y, 4, barH);
}

/* ── Segment list rendering ───────────────────── */
function wrkRender() {
  wrkDrawChart();
  wrkRefreshStats();

  const list = document.getElementById('wrkSegmentList');
  if (!list) return;
  const segs = wrkState.segments;

  if (!segs.length) {
    list.innerHTML = '<div class="wrk-list-empty">No segments yet — add one below</div>';
    return;
  }

  const TYPE_LABELS = { warmup:'Warmup', steady:'Steady State', interval:'Intervals', cooldown:'Cooldown', free:'Free Ride' };
  const TYPE_COLORS = { warmup:'#4a9eff', steady:'#00e5a0', interval:'#ff6b35', cooldown:'#8888bb', free:'#777' };

  list.innerHTML = segs.map((seg, idx) => {
    const color   = TYPE_COLORS[seg.type] || '#aaa';
    const label   = TYPE_LABELS[seg.type] || seg.type;
    const dur     = wrkSegDuration(seg);
    const durStr  = wrkFmtTime(dur);
    let detail = '';
    if (seg.type === 'warmup' || seg.type === 'cooldown') {
      detail = `${durStr} · ${seg.powerLow}→${seg.powerHigh}% FTP`;
    } else if (seg.type === 'steady') {
      detail = `${durStr} · ${seg.power}% FTP`;
    } else if (seg.type === 'interval') {
      detail = `${seg.reps}× (${wrkFmtTime(seg.onDuration)} @ ${seg.onPower}% / ${wrkFmtTime(seg.offDuration)} @ ${seg.offPower}%)`;
    } else if (seg.type === 'free') {
      detail = `${durStr} · no target`;
    }

    const isEditing = wrkState.editIdx === idx;
    const editPanel = isEditing ? wrkBuildEditPanel(seg, idx) : '';

    return `<div class="wrk-seg-wrap${isEditing ? ' wrk-seg-wrap--active' : ''}">
      <div class="wrk-seg-row" onclick="wrkToggleEdit(${idx})">
        <span class="wrk-seg-swatch" style="background:${color}"></span>
        <div class="wrk-seg-info">
          <span class="wrk-seg-type">${label}</span>
          <span class="wrk-seg-detail">${detail}</span>
        </div>
        <div class="wrk-seg-actions" onclick="event.stopPropagation()">
          <button class="wrk-icon-btn" title="Move up"    onclick="wrkMove(${idx},-1)" ${idx===0?'disabled':''}>↑</button>
          <button class="wrk-icon-btn" title="Move down"  onclick="wrkMove(${idx}, 1)" ${idx===segs.length-1?'disabled':''}>↓</button>
          <button class="wrk-icon-btn wrk-icon-btn--del" title="Remove" onclick="wrkRemove(${idx})">×</button>
        </div>
      </div>
      ${editPanel}
    </div>`;
  }).join('');
}

function wrkBuildEditPanel(seg, idx) {
  const fmtDur = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return { m, s };
  };

  let fields = '';
  if (seg.type === 'steady') {
    const { m, s } = fmtDur(seg.duration);
    fields = `
      <div class="wrk-edit-row">
        <label>Duration</label>
        <div class="wrk-dur-inputs">
          <input type="number" min="0" max="600" value="${m}" oninput="wrkSet(${idx},'durationMin',+this.value)"> <span>min</span>
          <input type="number" min="0" max="59"  value="${s}" oninput="wrkSet(${idx},'durationSec',+this.value)"> <span>sec</span>
        </div>
      </div>
      <div class="wrk-edit-row">
        <label>Power</label>
        <div class="wrk-power-input">
          <input type="range" min="40" max="160" value="${seg.power}" oninput="wrkSet(${idx},'power',+this.value);this.nextElementSibling.textContent=this.value+'%'">
          <span class="wrk-power-badge" style="background:${wrkZoneColor(seg.power)}">${seg.power}%</span>
        </div>
      </div>`;
  } else if (seg.type === 'warmup' || seg.type === 'cooldown') {
    const { m, s } = fmtDur(seg.duration);
    fields = `
      <div class="wrk-edit-row">
        <label>Duration</label>
        <div class="wrk-dur-inputs">
          <input type="number" min="0" max="600" value="${m}" oninput="wrkSet(${idx},'durationMin',+this.value)"> <span>min</span>
          <input type="number" min="0" max="59"  value="${s}" oninput="wrkSet(${idx},'durationSec',+this.value)"> <span>sec</span>
        </div>
      </div>
      <div class="wrk-edit-row">
        <label>Power from</label>
        <div class="wrk-power-input">
          <input type="range" min="30" max="130" value="${seg.powerLow}" oninput="wrkSet(${idx},'powerLow',+this.value);this.nextElementSibling.textContent=this.value+'%'">
          <span class="wrk-power-badge" style="background:${wrkZoneColor(seg.powerLow)}">${seg.powerLow}%</span>
        </div>
      </div>
      <div class="wrk-edit-row">
        <label>Power to</label>
        <div class="wrk-power-input">
          <input type="range" min="30" max="130" value="${seg.powerHigh}" oninput="wrkSet(${idx},'powerHigh',+this.value);this.nextElementSibling.textContent=this.value+'%'">
          <span class="wrk-power-badge" style="background:${wrkZoneColor(seg.powerHigh)}">${seg.powerHigh}%</span>
        </div>
      </div>`;
  } else if (seg.type === 'interval') {
    const { m: onM, s: onS } = fmtDur(seg.onDuration);
    const { m: offM, s: offS } = fmtDur(seg.offDuration);
    fields = `
      <div class="wrk-edit-row">
        <label>Repetitions</label>
        <div class="wrk-dur-inputs"><input type="number" min="1" max="50" value="${seg.reps}" oninput="wrkSet(${idx},'reps',+this.value)"> <span>×</span></div>
      </div>
      <div class="wrk-edit-row">
        <label>Work duration</label>
        <div class="wrk-dur-inputs">
          <input type="number" min="0" max="60" value="${onM}" oninput="wrkSet(${idx},'onDurMin',+this.value)"> <span>min</span>
          <input type="number" min="0" max="59" value="${onS}" oninput="wrkSet(${idx},'onDurSec',+this.value)"> <span>sec</span>
        </div>
      </div>
      <div class="wrk-edit-row">
        <label>Work power</label>
        <div class="wrk-power-input">
          <input type="range" min="50" max="200" value="${seg.onPower}" oninput="wrkSet(${idx},'onPower',+this.value);this.nextElementSibling.textContent=this.value+'%'">
          <span class="wrk-power-badge" style="background:${wrkZoneColor(seg.onPower)}">${seg.onPower}%</span>
        </div>
      </div>
      <div class="wrk-edit-row">
        <label>Rest duration</label>
        <div class="wrk-dur-inputs">
          <input type="number" min="0" max="60" value="${offM}" oninput="wrkSet(${idx},'offDurMin',+this.value)"> <span>min</span>
          <input type="number" min="0" max="59" value="${offS}" oninput="wrkSet(${idx},'offDurSec',+this.value)"> <span>sec</span>
        </div>
      </div>
      <div class="wrk-edit-row">
        <label>Rest power</label>
        <div class="wrk-power-input">
          <input type="range" min="30" max="100" value="${seg.offPower}" oninput="wrkSet(${idx},'offPower',+this.value);this.nextElementSibling.textContent=this.value+'%'">
          <span class="wrk-power-badge" style="background:${wrkZoneColor(seg.offPower)}">${seg.offPower}%</span>
        </div>
      </div>`;
  } else if (seg.type === 'free') {
    const { m, s } = fmtDur(seg.duration);
    fields = `
      <div class="wrk-edit-row">
        <label>Duration</label>
        <div class="wrk-dur-inputs">
          <input type="number" min="0" max="600" value="${m}" oninput="wrkSet(${idx},'durationMin',+this.value)"> <span>min</span>
          <input type="number" min="0" max="59"  value="${s}" oninput="wrkSet(${idx},'durationSec',+this.value)"> <span>sec</span>
        </div>
      </div>`;
  }

  return `<div class="wrk-edit-panel">${fields}</div>`;
}

/* ── Segment operations ───────────────────────── */
function wrkAddSegment(type) {
  wrkState.segments.push({ ...WRK_DEFAULTS[type] });
  wrkState.editIdx = wrkState.segments.length - 1;
  wrkRender();
}

function wrkRemove(idx) {
  wrkState.segments.splice(idx, 1);
  if (wrkState.editIdx === idx) wrkState.editIdx = null;
  else if (wrkState.editIdx > idx) wrkState.editIdx--;
  wrkRender();
}

function wrkMove(idx, dir) {
  const segs = wrkState.segments;
  const ni = idx + dir;
  if (ni < 0 || ni >= segs.length) return;
  [segs[idx], segs[ni]] = [segs[ni], segs[idx]];
  if (wrkState.editIdx === idx) wrkState.editIdx = ni;
  else if (wrkState.editIdx === ni) wrkState.editIdx = idx;
  wrkRender();
}

function wrkToggleEdit(idx) {
  wrkState.editIdx = wrkState.editIdx === idx ? null : idx;
  wrkRender();
}

function wrkSet(idx, field, val) {
  const seg = wrkState.segments[idx];
  if (!seg) return;
  if (field === 'durationMin') seg.duration = val * 60 + (seg.duration % 60);
  else if (field === 'durationSec') seg.duration = Math.floor(seg.duration / 60) * 60 + val;
  else if (field === 'onDurMin')  seg.onDuration  = val * 60 + (seg.onDuration  % 60);
  else if (field === 'onDurSec')  seg.onDuration  = Math.floor(seg.onDuration  / 60) * 60 + val;
  else if (field === 'offDurMin') seg.offDuration = val * 60 + (seg.offDuration % 60);
  else if (field === 'offDurSec') seg.offDuration = Math.floor(seg.offDuration / 60) * 60 + val;
  else seg[field] = val;
  // Redraw chart + stats without re-rendering the segment list (keeps inputs focused)
  wrkDrawChart();
  wrkRefreshStats();
}

function wrkClear() {
  if (wrkState.segments.length && !confirm('Start a new workout? Current workout will be lost.')) return;
  wrkState.segments = [];
  wrkState.editIdx  = null;
  wrkState.name     = 'New Workout';
  const inp = document.getElementById('wrkNameInput');
  if (inp) inp.value = 'New Workout';
  wrkRender();
}

/* ── Exports ──────────────────────────────────── */
function wrkExportZwo() {
  if (!wrkState.segments.length) { showToast('Add segments first', 'error'); return; }
  const name = wrkState.name || 'CycleIQ Workout';
  const seg2zwo = seg => {
    if (seg.type === 'warmup')
      return `    <Warmup Duration="${seg.duration}" PowerLow="${(seg.powerLow/100).toFixed(2)}" PowerHigh="${(seg.powerHigh/100).toFixed(2)}"/>`;
    if (seg.type === 'cooldown')
      return `    <Cooldown Duration="${seg.duration}" PowerLow="${(Math.min(seg.powerLow,seg.powerHigh)/100).toFixed(2)}" PowerHigh="${(Math.max(seg.powerLow,seg.powerHigh)/100).toFixed(2)}"/>`;
    if (seg.type === 'steady')
      return `    <SteadyState Duration="${seg.duration}" Power="${(seg.power/100).toFixed(2)}"/>`;
    if (seg.type === 'interval')
      return `    <IntervalsT Repeat="${seg.reps}" OnDuration="${seg.onDuration}" OffDuration="${seg.offDuration}" OnPower="${(seg.onPower/100).toFixed(2)}" OffPower="${(seg.offPower/100).toFixed(2)}"/>`;
    if (seg.type === 'free')
      return `    <FreeRide Duration="${seg.duration}"/>`;
    return '';
  };
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<workout_file>
  <author>CycleIQ</author>
  <name>${name}</name>
  <description></description>
  <sportType>bike</sportType>
  <tags></tags>
  <workout>
${wrkState.segments.map(seg2zwo).join('\n')}
  </workout>
</workout_file>`;
  wrkDownload(name.replace(/[^a-z0-9]/gi,'_') + '.zwo', xml, 'application/xml');
  showToast('Zwift .zwo downloaded', 'success');
}

function wrkExportFit() {
  if (!wrkState.segments.length) { showToast('Add segments first', 'error'); return; }
  const name = wrkState.name || 'CycleIQ Workout';
  const ftp  = wrkGetFtp();
  try {
    const fitBytes = buildFitWorkout(wrkState.segments, name, ftp);
    const blob = new Blob([fitBytes], { type: 'application/octet-stream' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = name.replace(/[^a-z0-9]/gi,'_') + '.fit';
    a.click(); URL.revokeObjectURL(url);
    showToast('Garmin .fit downloaded', 'success');
  } catch(e) {
    showToast('FIT export failed: ' + e.message, 'error');
  }
}

function wrkDownload(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/* ── Garmin FIT encoder ───────────────────────── */
function buildFitWorkout(segments, name, ftp) {
  // CRC-16 (FIT variant)
  const CRC_TAB = [0x0000,0xCC01,0xD801,0x1400,0xF001,0x3C00,0x2800,0xE401,
                   0xA001,0x6C00,0x7800,0xB401,0x5000,0x9C01,0x8801,0x4400];
  const crc16 = (data, seed = 0) => {
    let c = seed;
    for (const b of data) {
      let t = CRC_TAB[c & 0xF]; c = (c >> 4) & 0xFFF; c ^= t ^ CRC_TAB[b & 0xF];
      t = CRC_TAB[c & 0xF]; c = (c >> 4) & 0xFFF; c ^= t ^ CRC_TAB[(b >> 4) & 0xF];
    }
    return c;
  };

  const buf = [];
  const u8  = v => buf.push(v & 0xFF);
  const u16 = v => { buf.push(v & 0xFF); buf.push((v >> 8) & 0xFF); };
  const u32 = v => { buf.push(v & 0xFF); buf.push((v >> 8) & 0xFF);
                     buf.push((v >> 16) & 0xFF); buf.push((v >> 24) & 0xFF); };
  const str = (s, len) => {
    const b = new TextEncoder().encode(s.slice(0, len - 1));
    for (let i = 0; i < len; i++) buf.push(i < b.length ? b[i] : 0);
  };

  // Count total workout steps
  let nSteps = 0;
  segments.forEach(s => { nSteps += s.type === 'interval' ? s.reps * 2 : 1; });

  // --- Def: FILE_ID (local 0, global mesg 0) ---
  u8(0x40); u8(0x00); u8(0x00); u16(0); u8(5);
  u8(0);  u8(1); u8(0x00);  // type: enum
  u8(1);  u8(2); u8(0x84);  // manufacturer: uint16
  u8(2);  u8(2); u8(0x84);  // product: uint16
  u8(4);  u8(4); u8(0x86);  // time_created: uint32
  u8(5);  u8(2); u8(0x84);  // number: uint16
  // Data: FILE_ID
  u8(0x00);
  u8(5);     // type = workout
  u16(255);  // manufacturer
  u16(0);    // product
  const FIT_EPOCH = 631065600000;
  u32(Math.floor((Date.now() - FIT_EPOCH) / 1000));
  u16(0);    // number

  // --- Def: WORKOUT (local 1, global mesg 26) ---
  u8(0x41); u8(0x00); u8(0x00); u16(26); u8(4);
  u8(4); u8(1); u8(0x00);   // sport: enum
  u8(5); u8(4); u8(0x86);   // capabilities: uint32
  u8(6); u8(2); u8(0x84);   // num_valid_steps: uint16
  u8(8); u8(16); u8(0x07);  // wkt_name: string[16]
  // Data: WORKOUT
  u8(0x01);
  u8(2);       // sport = cycling
  u32(0x00000020);
  u16(nSteps);
  str(name, 16);

  // --- Def: WORKOUT_STEP (local 2, global mesg 27) ---
  u8(0x42); u8(0x00); u8(0x00); u16(27); u8(9);
  u8(254); u8(2);  u8(0x84);  // message_index: uint16
  u8(0);   u8(16); u8(0x07);  // wkt_step_name: string[16]
  u8(1);   u8(1);  u8(0x00);  // duration_type: enum
  u8(2);   u8(4);  u8(0x86);  // duration_value: uint32
  u8(3);   u8(1);  u8(0x00);  // target_type: enum
  u8(4);   u8(4);  u8(0x86);  // target_value: uint32
  u8(5);   u8(4);  u8(0x86);  // target_low: uint32
  u8(6);   u8(4);  u8(0x86);  // target_high: uint32
  u8(7);   u8(1);  u8(0x00);  // intensity: enum

  let stepIdx = 0;
  const writeStep = (label, secs, pLow, pHigh, intensity) => {
    u8(0x02);
    u16(stepIdx++);
    str(label, 16);
    u8(0);      // duration_type = time
    u32(secs);
    const hp = pHigh > 0;
    u8(hp ? 4 : 0);  // target_type: 4=power, 0=open
    u32(0);           // target_value (use low/high range)
    u32(hp ? Math.round(ftp * pLow  / 100) + 1000 : 0xFFFFFFFF);
    u32(hp ? Math.round(ftp * pHigh / 100) + 1000 : 0xFFFFFFFF);
    u8(intensity);
  };

  segments.forEach(seg => {
    if (seg.type === 'warmup') {
      writeStep('Warmup', seg.duration, seg.powerLow, seg.powerHigh, 2);
    } else if (seg.type === 'cooldown') {
      writeStep('Cooldown', seg.duration,
        Math.min(seg.powerLow, seg.powerHigh), Math.max(seg.powerLow, seg.powerHigh), 3);
    } else if (seg.type === 'steady') {
      writeStep('Steady', seg.duration, Math.max(1, seg.power - 5), seg.power + 5, 0);
    } else if (seg.type === 'interval') {
      for (let r = 0; r < seg.reps; r++) {
        writeStep('Work', seg.onDuration,  Math.max(1,seg.onPower  - 5), seg.onPower  + 5, 0);
        writeStep('Rest', seg.offDuration, Math.max(1,seg.offPower - 5), seg.offPower + 5, 1);
      }
    } else if (seg.type === 'free') {
      writeStep('Free Ride', seg.duration, 0, 0, 0);
    }
  });

  // Assemble: build data array
  const data = new Uint8Array(buf);

  // FIT file header (14 bytes)
  const hdr = [];
  const h8  = v => hdr.push(v & 0xFF);
  const h16 = v => { hdr.push(v & 0xFF); hdr.push((v >> 8) & 0xFF); };
  const h32 = v => { hdr.push(v & 0xFF); hdr.push((v >> 8) & 0xFF);
                     hdr.push((v >> 16) & 0xFF); hdr.push((v >> 24) & 0xFF); };
  h8(14); h8(0x10); h16(2100); h32(data.length);
  h8(0x2E); h8(0x46); h8(0x49); h8(0x54); // ".FIT"
  const hdrArr = new Uint8Array(hdr);
  const hdrCrc = crc16(hdrArr);
  const datCrc = crc16(data);

  const out = new Uint8Array(14 + 2 + data.length + 2);
  out.set(hdrArr, 0);
  out[14] = hdrCrc & 0xFF; out[15] = (hdrCrc >> 8) & 0xFF;
  out.set(data, 16);
  out[16 + data.length]     = datCrc & 0xFF;
  out[16 + data.length + 1] = (datCrc >> 8) & 0xFF;
  return out;
}

// Redraw chart on resize
(function() {
  let _wrkRaf = null;
  window.addEventListener('resize', () => {
    if (state.currentPage !== 'workout') return;
    clearTimeout(_wrkRaf);
    _wrkRaf = setTimeout(wrkDrawChart, 80);
  });
})();
