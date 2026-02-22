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
  activityMap: null,
  recentActivityMap: null,
  activityStreamsChart: null,
  activityPowerChart: null,
  activityHRChart: null,
  activityCurveChart: null,
  activityHRCurveChart: null,
  activityHistogramChart: null,
  powerCurveChart: null,
  powerCurve: null,
  powerCurveRange: null,
  weekProgressChart: null,
  weekProgressMetric: 'tss',
  weekStartDay: 1,          // 0=Sunday, 1=Monday
  efSparkChart: null,
  calMonth: null,
  calSelectedDate: null,
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

/* ====================================================
   FITNESS / WELLNESS CACHE  (localStorage)
   Stores CTL/ATL/TSB, wellness history & athlete profile
   so the fitness page renders instantly after a refresh.
==================================================== */
function saveFitnessCache() {
  try {
    localStorage.setItem('icu_fitness_cache', JSON.stringify({
      fitness:        state.fitness,
      wellnessHistory: state.wellnessHistory,
      athlete:        state.athlete,
    }));
  } catch (e) {
    // Quota exceeded — drop the cache gracefully
    localStorage.removeItem('icu_fitness_cache');
  }
}

function loadFitnessCache() {
  try {
    const raw = localStorage.getItem('icu_fitness_cache');
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (data.fitness)         state.fitness         = data.fitness;
    if (data.wellnessHistory) state.wellnessHistory = data.wellnessHistory;
    if (data.athlete)         state.athlete         = data.athlete;
    return true;
  } catch (e) { return false; }
}

function clearFitnessCache() {
  localStorage.removeItem('icu_fitness_cache');
}

function loadCredentials() {
  state.athleteId = localStorage.getItem('icu_athlete_id') || null;
  state.apiKey    = localStorage.getItem('icu_api_key')    || null;
  return !!(state.athleteId && state.apiKey);
}

function clearCredentials() {
  localStorage.removeItem('icu_athlete_id');
  localStorage.removeItem('icu_api_key');
  clearFitnessCache();
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
    saveFitnessCache();

    // Invalidate power curve cache so it re-fetches with fresh range
    state.powerCurve = null;
    state.powerCurveRange = null;

    state.synced = true;
    updateConnectionUI(true);
    renderDashboard();
    if (state.currentPage === 'calendar') renderCalendar();
    if (state.currentPage === 'fitness')  renderFitnessPage();

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
  clearCredentials();   // also calls clearFitnessCache()
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
  clearFitnessCache();           // also wipe fitness/wellness cache
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
    dashboard:  ['Dashboard',      `Overview · Last ${state.rangeDays} days`],
    activities: ['Activities',     'All recorded rides & workouts'],
    calendar:   ['Calendar',       'Planned workouts & events'],
    fitness:    ['Fitness',        'CTL · ATL · TSB history'],
    power:      ['Power Curve',    'Best efforts across durations'],
    zones:      ['Training Zones', 'Time in zone breakdown'],
    settings:   ['Settings',       'Account & connection'],
    workout:    ['Create Workout', 'Build & export custom cycling workouts'],
    guide:      ['Training Guide', 'Understanding CTL · ATL · TSB & training load'],
  };
  const [title, sub] = info[page] || ['CycleIQ', ''];
  document.getElementById('pageTitle').textContent    = title;
  document.getElementById('pageSubtitle').textContent = sub;

  // Calendar fills full viewport height — toggle padding-less mode on the scroll container
  const pc = document.getElementById('pageContent');
  if (pc) pc.classList.toggle('page-content--calendar', page === 'calendar');

  // Always restore the activity-detail topbar elements when leaving the activity page
  const detailNav  = document.getElementById('detailTopbarNav');
  const detailBack = document.getElementById('detailTopbarBack');
  if (detailNav)  detailNav.style.display  = 'none';
  if (detailBack) detailBack.style.display = 'none';

  // Show topbar range pill only on dashboard
  const pill = document.getElementById('dateRangePill');
  if (pill) pill.style.display = (page === 'dashboard') ? 'flex' : 'none';

  // Show month label in topbar only on calendar
  const calLabel = document.getElementById('calTopbarMonth');
  if (calLabel) calLabel.style.display = (page === 'calendar') ? '' : 'none';

  // Ensure topbar is always visible (never hide on calendar)
  document.querySelector('.topbar')?.classList.remove('topbar--hidden');
  document.querySelector('.page-headline')?.classList.remove('page-headline--hidden');

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
   RECENT ACTIVITY CARD (dashboard)
==================================================== */
async function renderRecentActivity() {
  const card = document.getElementById('recentActivityCard');
  if (!card) return;

  const pool = (state.activities || []).filter(a => !isEmptyActivity(a));
  if (!pool.length) { card.style.display = 'none'; return; }

  const a   = pool[0];
  const actId = a.id || a.icu_activity_id;

  // Basic info
  const name    = a.name || a.icu_name || 'Activity';
  const dateStr = a.start_date_local || a.start_date || '';
  const dateObj = dateStr ? new Date(dateStr) : null;
  const dateFmt = dateObj
    ? dateObj.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    : '—';
  const timeFmt = dateObj
    ? dateObj.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : '';

  document.getElementById('recentActName').textContent    = name;
  document.getElementById('recentActDate').textContent    = dateFmt + (timeFmt ? ' · ' + timeFmt : '');
  document.getElementById('recentActSubtitle').textContent = fmtDate(dateStr);

  // Sport icon
  const iconEl = document.getElementById('recentActIcon');
  if (iconEl) iconEl.innerHTML = activityTypeIcon(a);

  // View button
  const viewBtn = document.getElementById('recentActViewBtn');
  if (viewBtn) viewBtn.onclick = () => navigateToActivity(a);

  // Stats
  const dist  = actVal(a, 'distance', 'icu_distance');
  const secs  = actVal(a, 'moving_time', 'elapsed_time', 'icu_moving_time', 'icu_elapsed_time');
  const elev  = actVal(a, 'total_elevation_gain', 'icu_total_elevation_gain');
  const watts = actVal(a, 'icu_weighted_avg_watts', 'average_watts', 'icu_average_watts');
  const hr    = actVal(a, 'average_heartrate', 'icu_average_heartrate');
  const tss   = actVal(a, 'icu_training_load', 'tss');
  const speed = actVal(a, 'average_speed', 'icu_average_speed');

  const dFmt = dist  > 0 ? fmtDist(dist)  : null;
  const eFmt = elev  > 0 ? fmtElev(elev)  : null;
  const sFmt = speed > 0 ? fmtSpeed(speed) : null;

  const statItems = [
    dFmt   && { icon: '📏', val: dFmt.val,           unit: dFmt.unit,  lbl: 'Distance' },
    secs   && { icon: '⏱',  val: fmtDur(secs),        unit: '',         lbl: 'Time' },
    eFmt   && { icon: '⛰',  val: eFmt.val,            unit: eFmt.unit,  lbl: 'Elevation' },
    sFmt   && { icon: '💨',  val: sFmt.val,            unit: sFmt.unit,  lbl: 'Avg Speed' },
    watts  && { icon: '⚡',  val: Math.round(watts),   unit: 'w',        lbl: 'Avg Power' },
    hr     && { icon: '❤️', val: Math.round(hr),       unit: 'bpm',      lbl: 'Avg HR' },
    tss    && { icon: '🔥',  val: Math.round(tss),     unit: 'TSS',      lbl: 'Load' },
  ].filter(Boolean);

  document.getElementById('recentActStats').innerHTML = statItems.map(s =>
    `<div class="ra-stat">
      <div class="ra-stat-val">${s.val}<span class="ra-stat-unit"> ${s.unit}</span></div>
      <div class="ra-stat-lbl">${s.lbl}</div>
    </div>`
  ).join('');

  card.style.display = '';

  // Map preview — destroy previous instance first
  if (state.recentActivityMap) {
    state.recentActivityMap.remove();
    state.recentActivityMap = null;
  }
  const mapEl = document.getElementById('recentActMap');
  if (!mapEl) return;
  mapEl.innerHTML = '';

  // Fetch GPS
  let latlng = null;
  try { latlng = await fetchMapGPS(actId); } catch (_) {}

  if (!latlng || latlng.length < 2) {
    mapEl.innerHTML = '<div class="ra-map-empty">No GPS data</div>';
    return;
  }

  const pairs = latlng.filter(p => Array.isArray(p) && p[0] != null && p[1] != null
    && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180);
  if (pairs.length < 2) {
    mapEl.innerHTML = '<div class="ra-map-empty">No GPS data</div>';
    return;
  }

  // Downsample
  const step   = Math.max(1, Math.floor(pairs.length / 400));
  const points = pairs.filter((_, i) => i % step === 0);
  if (points[points.length - 1] !== pairs[pairs.length - 1]) points.push(pairs[pairs.length - 1]);

  requestAnimationFrame(() => {
    try {
      const map = L.map(mapEl, {
        zoomControl:        false,
        scrollWheelZoom:    false,
        dragging:           false,
        doubleClickZoom:    false,
        touchZoom:          false,
        keyboard:           false,
        attributionControl: false,
        boxZoom:            false,
      });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd', maxZoom: 19,
      }).addTo(map);

      L.polyline(points, { color: '#00e5a0', weight: 3, opacity: 1 }).addTo(map);

      const dotIcon = (color) => L.divIcon({
        className: '',
        html: `<div style="width:8px;height:8px;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,0.9);box-shadow:0 0 3px rgba(0,0,0,0.5)"></div>`,
        iconSize: [8, 8], iconAnchor: [4, 4],
      });
      L.marker(points[0],                 { icon: dotIcon('#00e5a0') }).addTo(map);
      L.marker(points[points.length - 1], { icon: dotIcon('#888')    }).addTo(map);

      const tempPoly = L.polyline(points);
      map.fitBounds(tempPoly.getBounds(), { padding: [12, 12] });
      map.invalidateSize();
      state.recentActivityMap = map;
    } catch (_) {}
  });
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
  renderPowerCurve();      // async — fetches if range changed
  renderRecentActivity();  // async — fetches GPS for map preview
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
  if (state.recentActivityMap)  { state.recentActivityMap.remove();   state.recentActivityMap  = null; }
  const rac = document.getElementById('recentActivityCard');
  if (rac) rac.style.display = 'none';
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

// Known platform prefixes to strip from activity titles.
// Returns { title: string, platformTag: string|null }
const PLATFORM_PREFIXES = ['Zwift', 'Garmin', 'TrainerRoad', 'Wahoo', 'Rouvy', 'MyWhoosh', 'FulGaz'];
function cleanActivityName(rawName) {
  if (!rawName) return { title: rawName || '', platformTag: null };
  for (const platform of PLATFORM_PREFIXES) {
    // Match "Platform - " at the very start (case-sensitive, with optional extra spaces)
    const prefix = platform + ' - ';
    if (rawName.startsWith(prefix)) {
      return { title: rawName.slice(prefix.length).trim(), platformTag: platform };
    }
  }
  return { title: rawName, platformTag: null };
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

    const rawName = (a.name && a.name.trim()) ? a.name.trim() : activityFallbackName(a);
    const { title: name, platformTag } = cleanActivityName(rawName);
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
          ${platformTag ? `<span class="act-platform-tag">${platformTag}</span>` : ''}
          ${badge ? `<span class="act-card-badge">${badge}</span>` : ''}
        </div>
      </div>
      ${stats.length ? `<div class="act-card-stats">${stats.join('')}</div>` : ''}
    </div>`;
  }).join('');
}

/* ====================================================
   CHART STYLE TOKENS  (single source of truth)
==================================================== */
// Custom positioner: always to the right of the cursor, never jumps vertically
Chart.Tooltip.positioners.offsetFromCursor = function(items, eventPosition) {
  if (!items.length) return false;
  return { x: eventPosition.x + 14, y: eventPosition.y, xAlign: 'left', yAlign: 'center' };
};

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
  caretSize:       0,
  xAlign:          'left',
  yAlign:          'center',
  position:        'offsetFromCursor',
};
const C_TICK  = { color: '#525d72', font: { size: 10 } };
const C_GRID  = { color: 'rgba(255,255,255,0.04)' };
const C_NOGRID = { display: false };
// Solid hover dots: auto-fill with the dataset's line colour, no border ring
Chart.register({
  id: 'solidHoverDots',
  beforeUpdate(chart) {
    chart.data.datasets.forEach(ds => {
      ds.pointHoverBorderWidth = 0;
      if (ds.borderColor && !ds._hoverColorOverridden) {
        ds.pointHoverBackgroundColor = ds.borderColor;
        ds._hoverColorOverridden = true;
      }
    });
  }
});
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
          pointRadius: 5,
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
          pointRadius:          thisWeekData.map((_, i) => i === todayIdx ? 9 : 5),
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
      scales: cScales({ xGrid: false, yExtra: { maxTicksLimit: 4, display: false } })
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
        pointRadius:          efs.map((_, i) => i === efs.length - 1 ? 8 : 5),
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
      { label: 'CTL', data: ctlD, borderColor: '#00e5a0', backgroundColor: 'rgba(0,229,160,0.07)', borderWidth: 2, pointRadius: 0, pointHoverRadius: 7, tension: 0.4, fill: true },
      { label: 'ATL', data: atlD, borderColor: '#ff6b35', backgroundColor: 'rgba(255,107,53,0.05)', borderWidth: 2, pointRadius: 0, pointHoverRadius: 7, tension: 0.4 },
      { label: 'TSB', data: tsbD, borderColor: '#4a9eff', backgroundColor: 'rgba(74,158,255,0.05)', borderWidth: 2, pointRadius: 0, pointHoverRadius: 7, tension: 0.4 }
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
          pointHoverRadius: 7,
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
const HR_ZONE_NAMES = ['Active Rec.', 'Aerobic Base', 'Aerobic', 'Threshold', 'VO₂max', 'Anaerobic', 'Neuromuscular'];
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
    const types = CYCLING_POWER_TYPES();
    let raw = null;
    for (const type of types) {
      try {
        const data = await icuFetch(
          `/athlete/${state.athleteId}/power-curves?type=${type}&oldest=${oldest}&newest=${newest}`
        );
        const candidate = Array.isArray(data) ? data[0] : (data.list?.[0] ?? data);
        if (candidate && Array.isArray(candidate.secs) && candidate.secs.length > 0 &&
            Array.isArray(candidate.watts) && candidate.watts.some(w => w != null && w > 0)) {
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
        pointHoverRadius: 7,
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
  state._fitZoneRange = state._fitZoneRange ?? 90;
  setFitZoneRange(state._fitZoneRange);
}

function setFitZoneRange(days) {
  state._fitZoneRange = days;
  document.getElementById('fitZoneTab90')  ?.classList.toggle('active', days === 90);
  document.getElementById('fitZoneTab365') ?.classList.toggle('active', days === 365);
  document.getElementById('fitZoneTabAll') ?.classList.toggle('active', days === 0);
  renderFitnessZoneDist(days);
}

function renderFitnessZoneDist(days) {
  const card = document.getElementById('fitZoneCard');
  if (!card || !state.synced) return;

  const now = new Date();
  const acts = days > 0
    ? state.activities.filter(a => {
        const d = new Date(a.start_date_local || a.start_date);
        return (now - d) / 86400000 <= days;
      })
    : state.activities;

  const totals  = [0, 0, 0, 0, 0, 0];
  const pwrSums = [0, 0, 0, 0, 0, 0];
  const pwrCnts = [0, 0, 0, 0, 0, 0];
  let hasData = false;

  acts.forEach(a => {
    const zt = a.icu_zone_times;
    if (!Array.isArray(zt)) return;
    zt.forEach(z => {
      if (!z || typeof z.id !== 'string') return;
      const m = z.id.match(/^Z(\d)$/);
      if (!m) return;
      const i = parseInt(m[1], 10) - 1;
      if (i < 0 || i > 5) return;
      hasData = true;
      totals[i] += (z.secs || 0);
      if (z.avg_watts) { pwrSums[i] += z.avg_watts * (z.secs || 0); pwrCnts[i] += (z.secs || 0); }
    });
  });

  const totalSecs = totals.reduce((s, v) => s + v, 0);
  if (!hasData || totalSecs === 0) { card.style.display = 'none'; return; }
  card.style.display = '';

  const lbl = days === 0 ? 'all activities' : `last ${days} days`;
  document.getElementById('fitZoneSubtitle').textContent = `Time in zone · ${lbl}`;

  const RAW_COLORS = ['#4a9eff','#00e5a0','#f0c429','#ff6b35','#ff4757','#9b59ff'];

  // ── Doughnut chart ──
  const canvas = document.getElementById('fitZonePie');
  if (canvas) {
    if (state._fitZonePieChart) { state._fitZonePieChart.destroy(); state._fitZonePieChart = null; }
    state._fitZonePieChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ZONE_TAGS.map((t, i) => `${t} ${ZONE_NAMES[i]}`),
        datasets: [{
          data: totals.map(v => v > 0 ? v : null),
          backgroundColor: RAW_COLORS.map((c, i) => totals[i] > 0 ? c + 'cc' : 'transparent'),
          borderColor:     RAW_COLORS.map((c, i) => totals[i] > 0 ? c        : 'transparent'),
          borderWidth: 2,
          hoverOffset: 6,
        }]
      },
      options: {
        cutout: '68%',
        animation: { animateRotate: true, duration: 600 },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...C_TOOLTIP,
            callbacks: {
              label: ctx => {
                const i = ctx.dataIndex;
                const pct = Math.round(totals[i] / totalSecs * 100);
                return ` ${ZONE_NAMES[i]}: ${pct}% · ${fmtDur(totals[i])}`;
              }
            }
          }
        }
      }
    });
  }

  // ── Pie centre: dominant zone ──
  const domIdx  = totals.indexOf(Math.max(...totals));
  const domPct  = Math.round(totals[domIdx] / totalSecs * 100);
  const centerEl = document.getElementById('fitZonePieCenter');
  if (centerEl) centerEl.innerHTML =
    `<div class="fit-zone-pie-pct" style="color:${RAW_COLORS[domIdx]}">${domPct}%</div>
     <div class="fit-zone-pie-lbl">${ZONE_TAGS[domIdx]}</div>`;

  // ── KPI strip ──
  const ftp = state.athlete?.ftp || null;
  const trackedCount = acts.filter(a => Array.isArray(a.icu_zone_times) && a.icu_zone_times.some(z => z.id?.match(/^Z\d$/))).length;
  const z12pct = Math.round((totals[0]+totals[1]) / totalSecs * 100);
  const z56pct = Math.round((totals[4]+totals[5]) / totalSecs * 100);
  document.getElementById('fitZoneKpis').innerHTML = `
    <div class="fit-zone-kpi"><div class="fit-zone-kpi-val">${fmtDur(totalSecs)}</div><div class="fit-zone-kpi-lbl">Total time</div></div>
    <div class="fit-zone-kpi"><div class="fit-zone-kpi-val">${trackedCount}</div><div class="fit-zone-kpi-lbl">Rides tracked</div></div>
    <div class="fit-zone-kpi"><div class="fit-zone-kpi-val" style="color:${RAW_COLORS[domIdx]}">${ZONE_NAMES[domIdx]}</div><div class="fit-zone-kpi-lbl">Dominant zone</div></div>
    <div class="fit-zone-kpi"><div class="fit-zone-kpi-val">${z12pct}%</div><div class="fit-zone-kpi-lbl">Easy (Z1–Z2)</div></div>
    <div class="fit-zone-kpi"><div class="fit-zone-kpi-val">${z56pct}%</div><div class="fit-zone-kpi-lbl">Hard (Z5–Z6)</div></div>
  `;

  // ── Zone rows ──
  const FTP_PCTS = [[0,0.55],[0.55,0.75],[0.75,0.90],[0.90,1.05],[1.05,1.20],[1.20,99]];
  document.getElementById('fitZoneRows').innerHTML = ZONE_TAGS.map((tag, i) => {
    if (totals[i] === 0) return '';
    const pct    = Math.round(totals[i] / totalSecs * 100);
    const color  = RAW_COLORS[i];
    const avgPwr = pwrCnts[i] > 0
      ? Math.round(pwrSums[i] / pwrCnts[i]) + ' W'
      : ftp ? (() => { const [lo,hi]=FTP_PCTS[i]; return hi>=99?`${Math.round(ftp*lo)}+ W`:`${Math.round(ftp*lo)}–${Math.round(ftp*hi)} W`; })()
      : '';
    return `<div class="fit-zone-row">
      <div class="fit-zone-dot" style="background:${color}"></div>
      <div class="fit-zone-row-info">
        <div class="fit-zone-row-top">
          <span class="fit-zone-tag" style="color:${color}">${tag}</span>
          <span class="fit-zone-name">${ZONE_NAMES[i]}</span>
          ${avgPwr ? `<span class="fit-zone-watts">${avgPwr}</span>` : ''}
        </div>
        <div class="fit-zone-bar-track">
          <div class="fit-zone-bar-fill" style="width:${pct}%;background:${color}aa"></div>
        </div>
      </div>
      <div class="fit-zone-row-stats">
        <span class="fit-zone-pct" style="color:${color}">${pct}%</span>
        <span class="fit-zone-time">${fmtDur(totals[i])}</span>
      </div>
    </div>`;
  }).join('');

  // ── Balance bar + training style ──
  const z12r = (totals[0]+totals[1]) / totalSecs;
  const z34r = (totals[2]+totals[3]) / totalSecs;
  const z56r = (totals[4]+totals[5]) / totalSecs;
  let style, hint, styleColor;
  if      (z12r >= 0.65 && z56r >= 0.10) { style='Polarized';  styleColor='#4a9eff'; hint='Strong contrast between easy base and hard efforts'; }
  else if (z34r >= 0.40)                  { style='Sweet-spot'; styleColor='#00e5a0'; hint='Focused on productive threshold work'; }
  else if (z12r >= 0.60)                  { style='Pyramidal';  styleColor='#f0c429'; hint='Broad aerobic base with moderate intensity work'; }
  else                                    { style='Mixed';      styleColor='#ff6b35'; hint='Varied intensity across all zones'; }

  const segs = totals.map((v, i) => {
    const p = v / totalSecs * 100;
    return p > 0.5 ? `<div style="flex:${p};background:${RAW_COLORS[i]};height:100%"></div>` : '';
  }).join('');

  document.getElementById('fitZoneBalance').innerHTML = `
    <div class="fit-zone-balance-bar" style="display:flex;height:12px;border-radius:3px;overflow:hidden;gap:2px">${segs}</div>
    <div class="fit-zone-balance-label">
      <span class="fit-zone-style-tag" style="background:${styleColor}22;color:${styleColor}">${style}</span>
      <span class="fit-zone-style-hint">${hint}</span>
    </div>`;
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
      { label: 'CTL', data: ctlD, borderColor: '#00e5a0', backgroundColor: 'rgba(0,229,160,0.08)', borderWidth: 2, pointRadius: 0, pointHoverRadius: 7, tension: 0.4, fill: true },
      { label: 'ATL', data: atlD, borderColor: '#ff6b35', backgroundColor: 'rgba(255,107,53,0.05)', borderWidth: 2, pointRadius: 0, pointHoverRadius: 7, tension: 0.4 },
      { label: 'TSB', data: tsbD, borderColor: '#4a9eff', backgroundColor: 'rgba(74,158,255,0.05)', borderWidth: 2, pointRadius: 0, pointHoverRadius: 7, tension: 0.4 }
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
  const ICONS = {
    success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`,
    error:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/></svg>`,
    info:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>`,
  };
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.innerHTML = `<span class="toast-icon">${ICONS[type] || ICONS.info}</span><span>${msg}</span>`;
  document.getElementById('toastContainer').appendChild(t);
  setTimeout(() => {
    t.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
    t.style.opacity = '0';
    t.style.transform = 'translateY(6px) scale(0.95)';
    setTimeout(() => t.remove(), 220);
  }, 3500);
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
  state.calSelectedDate = toDateStr(now);
  renderCalendar();
}

// Returns a tiny SVG intensity bar icon (4 ascending bars, bottom-aligned)
function calIntensityBars(tss) {
  if (!tss || tss <= 0) return '';
  const level  = tss < 30 ? 1 : tss < 60 ? 2 : tss < 100 ? 3 : 4;
  const color  = level === 1 ? '#4caf7d' : level === 2 ? '#e0c040' : level === 3 ? '#f0a500' : '#e84b3a';
  const dim    = 'rgba(255,255,255,0.12)';
  const W = 2, GAP = 1.5, H = 10;
  const heights = [3, 5, 7, 10];
  const totalW  = 4 * W + 3 * GAP; // 12.5
  const rects   = heights.map((h, i) => {
    const x    = i * (W + GAP);
    const fill = i < level ? color : dim;
    return `<rect x="${x}" y="${H - h}" width="${W}" height="${h}" rx="0.8" fill="${fill}"/>`;
  }).join('');
  return `<svg class="cal-intensity" width="${totalW}" height="${H}" viewBox="0 0 ${totalW} ${H}" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;
}

// Returns 'indoor' or 'outdoor' for an activity
function calActivityEnvironment(a) {
  const t = (a.sport_type || a.type || '').toLowerCase();
  if (a.trainer || t.includes('virtual') || t.includes('treadmill') || t.includes('indoor'))
    return 'indoor';
  return 'outdoor';
}

// Returns a small inline SVG icon for a sport type (12×12, stroked)
function calSportIcon(a) {
  const t = (a.sport_type || a.type || '').toLowerCase();
  const p = 'width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cal-card-icon"';
  if (t.includes('run'))
    return `<svg ${p}><circle cx="12" cy="5" r="2"/><path d="M10 9l-2 5h8l-2-5"/><path d="M8 14l-1 5m9-5l1 5"/><path d="M10 9c0 0-2 2-2 4"/><path d="M14 9c0 0 2 2 2 4"/></svg>`;
  if (t.includes('swim'))
    return `<svg ${p}><path d="M2 14c2-3 4-3 6 0s4 3 6 0 4-3 6 0"/><path d="M2 18c2-3 4-3 6 0s4 3 6 0 4-3 6 0"/><circle cx="15" cy="7" r="2"/><path d="M17 9l-4 3-3-2"/></svg>`;
  if (t.includes('virtual') || t.includes('workout'))
    return `<svg ${p}><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>`;
  // Ride / default bicycle
  return `<svg ${p}><circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l3-8h6l3 8"/><path d="M9 8l-3 8"/><path d="M12 8v4"/></svg>`;
}

function calEventClass(a) {
  const t = (a.sport_type || a.type || '').toLowerCase();
  if (t.includes('virtualride') || t.includes('virtual')) return 'cal-event--virtual';
  if (t.includes('run'))  return 'cal-event--run';
  if (t.includes('swim')) return 'cal-event--swim';
  if (t.includes('ride')) return 'cal-event--ride';
  return 'cal-event--other';
}

// Build the date → [{a, stateIdx}] lookup (used by calendar and day panel)
function buildCalActMap() {
  const actMap = {};
  state.activities.forEach((a, stateIdx) => {
    const d = (a.start_date_local || a.start_date || '').slice(0, 10);
    if (!d) return;
    if (!actMap[d]) actMap[d] = [];
    actMap[d].push({ a, stateIdx });
  });
  return actMap;
}

function renderCalendar() {
  const m     = getCalMonth();
  const year  = m.getFullYear();
  const month = m.getMonth(); // 0-based

  // Month label (topbar only)
  const monthStr = m.toLocaleString('default', { month: 'long', year: 'numeric' });
  const calTopbar = document.getElementById('calTopbarMonth');
  if (calTopbar) calTopbar.textContent = monthStr;

  const actMap   = buildCalActMap();
  const todayStr = toDateStr(new Date());

  // Default selected date to today on first render
  if (!state.calSelectedDate) state.calSelectedDate = todayStr;

  // ── Month stats ──
  let totalActs = 0, totalDist = 0, totalTSS = 0, totalSecs = 0;
  Object.entries(actMap).forEach(([d, acts]) => {
    const [y, mo] = d.split('-').map(Number);
    if (y === year && mo === month + 1) {
      acts.forEach(({ a }) => {
        if (isEmptyActivity(a)) return;
        totalActs++;
        totalDist += actVal(a, 'distance', 'icu_distance');
        totalTSS  += actVal(a, 'icu_training_load', 'tss');
        totalSecs += actVal(a, 'moving_time', 'elapsed_time', 'icu_moving_time', 'icu_elapsed_time');
      });
    }
  });

  const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setEl('calStatActivities', totalActs || '0');
  setEl('calStatDist',       totalDist > 0 ? (totalDist / 1000).toFixed(0) + ' km' : '—');
  setEl('calStatTSS',        totalTSS > 0  ? Math.round(totalTSS) : '—');
  setEl('calStatTime',       totalSecs > 0 ? fmtDur(totalSecs) : '—');

  // ── DOW header labels (respects configured week start) ──
  const calDowNames    = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const calWeekendDays = [0, 6];
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

  // ── Build grid cells ──
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  const startDow = (firstDay.getDay() - state.weekStartDay + 7) % 7;

  const cells = [];
  for (let i = startDow - 1; i >= 0; i--)
    cells.push({ date: new Date(year, month, -i),      thisMonth: false });
  for (let d = 1; d <= lastDay.getDate(); d++)
    cells.push({ date: new Date(year, month, d),       thisMonth: true });
  const rem = cells.length % 7;
  if (rem > 0)
    for (let i = 1; i <= 7 - rem; i++)
      cells.push({ date: new Date(year, month + 1, i), thisMonth: false });

  const grid = document.getElementById('calGrid');
  grid.innerHTML = cells.map(({ date, thisMonth }) => {
    const dateStr   = toDateStr(date);
    const acts      = actMap[dateStr] || [];
    const realActs  = acts.filter(({ a }) => !isEmptyActivity(a));
    const isToday    = dateStr === todayStr;
    const isSelected = dateStr === state.calSelectedDate;
    const dow        = date.getDay();
    const isWeekend  = dow === 0 || dow === 6;

    const cls = [
      'cal-day',
      !thisMonth  ? 'cal-day--other-month' : '',
      isToday     ? 'cal-day--today'       : '',
      isSelected  ? 'cal-day--selected'    : '',
      isWeekend   ? 'cal-day--weekend'     : '',
    ].filter(Boolean).join(' ');

    // ── Desktop: mini activity cards (hidden on mobile via CSS) ──
    const maxCards = 2;
    const shownActs = realActs.slice(0, maxCards);
    const extraActs = realActs.length - maxCards;

    const cardsHtml = shownActs.map(({ a, stateIdx }) => {
      const { title: name } = cleanActivityName((a.name && a.name.trim()) ? a.name.trim() : activityFallbackName(a));
      const dist = (a.distance || 0) / 1000;
      const secs = a.moving_time || a.elapsed_time || 0;
      const statParts = [];
      if (secs > 0)   statParts.push(fmtDur(secs));
      if (dist > 0.1) statParts.push(dist.toFixed(1) + ' km');
      const stats = statParts.join(' · ');
      const tss   = actVal(a, 'icu_training_load', 'tss');
      const tc    = calEventClass(a);
      const icon  = calSportIcon(a);
      const sport = tc.replace('cal-event--', '');
      const bars  = calIntensityBars(tss);
      const env   = calActivityEnvironment(a);
      return `<div class="cal-day-card ${tc}" onclick="event.stopPropagation();navigateToActivity(${stateIdx})">
        <div class="cal-day-card-top">
          <div class="cal-card-icon-box ${sport}">${icon}</div>
          <span class="cal-day-card-stats">${stats}</span>
          ${bars}
        </div>
        <div class="cal-day-card-name">
          <span class="cal-env-tag cal-env-tag--${env}">${env === 'indoor' ? 'Indoor' : 'Outdoor'}</span>${name}
        </div>
      </div>`;
    }).join('');
    const moreHtml = extraActs > 0 ? `<div class="cal-day-more">+${extraActs} more</div>` : '';
    const desktopHtml = `<div class="cal-day-cards">${cardsHtml}${moreHtml}</div>`;

    // ── Mobile: dot indicators (hidden on desktop via CSS) ──
    const seenTypes = new Set();
    const dots = realActs.reduce((acc, { a }) => {
      const tc = calEventClass(a);
      if (!seenTypes.has(tc) && seenTypes.size < 3) {
        seenTypes.add(tc);
        acc += `<div class="cal-dot ${tc}"></div>`;
      }
      return acc;
    }, '');
    const mobileHtml = `<div class="cal-dots">${dots}</div>`;

    return `<div class="${cls}" data-date="${dateStr}" onclick="selectCalDay('${dateStr}')">
      <div class="cal-day-num">${date.getDate()}</div>
      ${desktopHtml}
      ${mobileHtml}
    </div>`;
  }).join('');

  // Render the day panel for the currently selected date
  renderCalDayList(state.calSelectedDate, actMap);
}

// Select a day in the calendar and update the bottom panel
function selectCalDay(dateStr) {
  state.calSelectedDate = dateStr;
  // Update visual selection on grid cells without full re-render
  document.querySelectorAll('#calGrid .cal-day').forEach(el => {
    el.classList.toggle('cal-day--selected', el.dataset.date === dateStr);
  });
  renderCalDayList(dateStr);
}

// Render the activity list in the bottom day panel
function renderCalDayList(dateStr, actMap) {
  const header = document.getElementById('calDayPanelHeader');
  const list   = document.getElementById('calDayPanelList');
  if (!header || !list) return;

  // Format header: "Monday, February 22" (parse as local date to avoid UTC offset shift)
  const [y, mo, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, mo - 1, d);
  header.textContent = dateObj.toLocaleDateString('default', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  // Build actMap lazily if not passed in
  const map = actMap || buildCalActMap();
  const acts = (map[dateStr] || []).filter(({ a }) => !isEmptyActivity(a));

  if (acts.length === 0) {
    list.innerHTML = '<div class="cal-day-empty">No activities</div>';
    return;
  }

  const chevronSvg = `<svg class="cal-list-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;

  list.innerHTML = acts.map(({ a, stateIdx }) => {
    const { title: name } = cleanActivityName((a.name && a.name.trim()) ? a.name.trim() : activityFallbackName(a));
    const dist = (a.distance || 0) / 1000;
    const secs = a.moving_time || a.elapsed_time || 0;
    const tss  = actVal(a, 'icu_training_load', 'tss');
    const meta = [
      dist > 0.1 ? dist.toFixed(1) + ' km' : '',
      secs > 0   ? fmtDur(secs) : '',
    ].filter(Boolean).join(' · ');
    const tc = calEventClass(a);
    return `<div class="cal-list-item" onclick="navigateToActivity(${stateIdx})">
      <div class="cal-list-dot ${tc}"></div>
      <div class="cal-list-info">
        <div class="cal-list-name">${name}</div>
        ${meta ? `<div class="cal-list-meta">${meta}</div>` : ''}
      </div>
      ${tss > 0 ? `<div class="cal-list-tss">${Math.round(tss)} TSS</div>` : ''}
      ${chevronSvg}
    </div>`;
  }).join('');
}

/* ====================================================
   ACTIVITY DETAIL — NAVIGATION
==================================================== */
let _stepHeightTimer = null; // tracks the active min-height freeze timer

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
  state.currentPage = 'activity';

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
  // Swap topbar: ensure it's visible (calendar hides it), hide date-range pill; show back + prev/next
  document.querySelector('.topbar')?.classList.remove('topbar--hidden');
  const _calLabel = document.getElementById('calTopbarMonth');
  if (_calLabel) _calLabel.style.display = 'none';
  const _pill = document.getElementById('dateRangePill');
  if (_pill) _pill.style.display = 'none';
  const _back = document.getElementById('detailTopbarBack');
  if (_back) _back.style.display = '';
  const _detailNav = document.getElementById('detailTopbarNav');
  if (_detailNav) _detailNav.style.display = 'flex';
  document.querySelector('.page-headline')?.classList.add('page-headline--hidden');
  // Remove calendar's full-bleed layout so normal padding is restored
  const pageContent = document.getElementById('pageContent');
  if (pageContent) pageContent.classList.remove('page-content--calendar');
  if (!fromStep) window.scrollTo(0, 0);

  // Back button label
  const fromLabel = state.previousPage === 'dashboard' ? 'Dashboard' : 'Activities';
  document.getElementById('detailBackLabel').textContent = fromLabel;

  // Render basic info immediately from cached data
  renderActivityBasic(activity);

  // Reset charts — but when stepping prev/next, freeze the page height first so the
  // browser doesn't snap the scroll position when cards collapse to display:none.
  const _pc = document.getElementById('pageContent');
  if (fromStep && _pc) {
    if (_stepHeightTimer) { clearTimeout(_stepHeightTimer); _stepHeightTimer = null; }
    // Pin to at least viewport height so rapid clicks never let it shrink
    _pc.style.minHeight = Math.max(_pc.offsetHeight, window.innerHeight) + 'px';
    _stepHeightTimer = setTimeout(() => { _pc.style.minHeight = ''; _stepHeightTimer = null; }, 800);
  }
  destroyActivityCharts();
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
    let   streams    = streamsResult.status === 'fulfilled' ? streamsResult.value : null;

    // Re-render stats with richer fields from full detail response
    if (fullDetail) renderActivityBasic({ ...activity, ...fullDetail });

    const richActivity = fullDetail ? { ...activity, ...fullDetail } : activity;

    // The individual detail endpoint sometimes omits zone arrays that ARE present
    // on the cached list activity — restore them so the supplementary cards can render.
    ['icu_zone_times', 'icu_hr_zone_times'].forEach(key => {
      if (Array.isArray(activity[key]) && activity[key].length > 0 &&
          (!Array.isArray(richActivity[key]) || richActivity[key].length === 0)) {
        richActivity[key] = activity[key];
      }
    });

    // If the streams endpoint returned nothing, try downloading the original FIT file
    // and parsing it client-side — this gives full second-by-second data from Garmin.
    if (!streams) {
      const loadingEl = document.getElementById('detailChartsLoading');
      loadingEl.innerHTML = '<div class="spinner"></div><span>Parsing FIT file…</span>';
      loadingEl.style.display = 'flex';
      try {
        const fitBuf = await fetchFitFile(actId);
        if (fitBuf) {
          const fitRecords = parseFitBuffer(fitBuf);
          const fitStreams  = fitRecordsToStreams(fitRecords);
          if (fitStreams) streams = fitStreams;
        }
      } catch (_) { /* FIT unavailable — fall through to zone bar charts */ }
      loadingEl.style.display = 'none';
    } else {
      document.getElementById('detailChartsLoading').style.display = 'none';
    }

    // Normalize streams (handles both intervals.icu API shape and our FIT-derived flat object)
    let normStreams = streams ? normalizeStreams(streams) : {};

    // FIT streams are already flat { time, watts, … } — normalizeStreams passes them through unchanged.
    // But if they came from the FIT parser directly, assign them as-is.
    if (streams && !Object.keys(normStreams).length) normStreams = streams;

    // Derive grade_smooth from altitude + distance when the API didn't return it
    if (!normStreams.grade_smooth && normStreams.altitude && normStreams.distance) {
      normStreams.grade_smooth = computeGradeStream(normStreams.altitude, normStreams.distance);
    }

    // If icu_hr_zone_times still not present, compute it from the HR stream
    if (!Array.isArray(richActivity.icu_hr_zone_times) || richActivity.icu_hr_zone_times.length === 0) {
      const hrArr    = normStreams.heartrate || normStreams.heart_rate || [];
      const zoneBnds = richActivity.icu_hr_zones;
      const computed = computeHRZoneTimesFromStream(hrArr, zoneBnds);
      if (computed) richActivity.icu_hr_zone_times = computed;
    }

    // Route map — resolve GPS to [[lat,lng],...] pairs.
    // The streams API only returns latitude; the /map endpoint has full pairs.
    let latlngForMap = null;

    const latArr = normStreams.lat || normStreams.latlng;
    const lngArr = normStreams.lng;

    if (latArr && lngArr && latArr.length === lngArr.length && !Array.isArray(latArr[0])) {
      latlngForMap = latArr.map((lat, i) =>
        lat != null && lngArr[i] != null ? [lat, lngArr[i]] : null
      );
    } else if (latArr && Array.isArray(latArr[0])) {
      latlngForMap = latArr;
    }

    // GPS fallback 1: intervals.icu's internal /api/activity/{id}/map endpoint
    // (the same one their website Route tab uses — returns full GPS + weather JSON)
    if (!latlngForMap) {
      latlngForMap = await fetchMapGPS(actId);
    }

    // GPS fallback 2: try fetching just the 'lng' stream in a targeted call
    if (!latlngForMap && latArr && !Array.isArray(latArr[0])) {
      latlngForMap = await fetchLngStream(actId, latArr);
    }

    // GPS fallback 3: FIT binary file
    if (!latlngForMap) {
      try {
        const gpsFitBuf = await fetchFitFile(actId);
        if (gpsFitBuf) {
          const gpsFitRecords = parseFitBuffer(gpsFitBuf);
          if (gpsFitRecords) {
            const gpsFitStreams = fitRecordsToStreams(gpsFitRecords);
            if (gpsFitStreams?.latlng) latlngForMap = gpsFitStreams.latlng;
          }
        }
      } catch (_) { /* FIT unavailable */ }
    }

    // GPS fallback 4: GPX file
    if (!latlngForMap) {
      latlngForMap = await fetchGPSFromGPX(actId);
    }
    renderActivityMap(latlngForMap, normStreams);

    // Stream charts when data came back; fall back to zone bar charts if not
    if (streams) {
      renderStreamCharts(normStreams, richActivity);
    } else {
      renderActivityZoneCharts(richActivity);
    }

    // Supplementary cards — each shows/hides itself based on data availability
    renderDetailPerformance(richActivity, actId, normStreams);
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
    renderDetailCurve(actId, normStreams);   // async — shows/hides its own card
    renderDetailHRCurve(normStreams);        // async — shows/hides its own card
  } catch (err) {
    console.error('[Activity detail] Unhandled error:', err);
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
  if (state.activityMap)            { state.activityMap.remove();            state.activityMap            = null; }
  if (state.activityStreamsChart)   { state.activityStreamsChart.destroy();   state.activityStreamsChart   = null; }
  if (state.activityPowerChart)     { state.activityPowerChart.destroy();     state.activityPowerChart     = null; }
  if (state.activityHRChart)        { state.activityHRChart.destroy();        state.activityHRChart        = null; }
  if (state.activityCurveChart)     { state.activityCurveChart.destroy();     state.activityCurveChart     = null; }
  if (state.activityHRCurveChart)   { state.activityHRCurveChart.destroy();   state.activityHRCurveChart   = null; }
  if (state.activityHistogramChart) { state.activityHistogramChart.destroy(); state.activityHistogramChart = null; }
  ['detailMapCard', 'detailStreamsCard', 'detailChartsRow', 'detailZonesCard', 'detailHRZonesCard', 'detailHistogramCard', 'detailCurveCard', 'detailHRCurveCard', 'detailPerfCard'].forEach(id => {
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
  const types   = 'time,watts,heartrate,cadence,velocity_smooth,altitude,distance,latlng,lat,lng,grade_smooth';
  const headers = { ...authHeader(), 'Accept': 'application/json' };

  // Try both known endpoint shapes — intervals.icu exposes streams under two paths
  const urls = [
    ICU_BASE + `/athlete/${state.athleteId}/activities/${activityId}/streams?streams=${types}`,
    ICU_BASE + `/activity/${activityId}/streams?streams=${types}`,
    ICU_BASE + `/activity/${activityId}/streams`,
  ];

  for (const url of urls) {
    const res = await fetch(url, { headers });
    if (res.status === 404) continue;                                          // try next
    if (!res.ok) throw new Error(`${res.status}: ${await res.text().catch(() => res.statusText)}`);
    const data = await res.json();
    if (data && (Array.isArray(data) ? data.length : Object.keys(data).length)) return data;
  }
  return null; // no stream data available on any endpoint
}

/* ====================================================
   FIT FILE FETCH + MINIMAL BINARY PARSER
   Used as fallback when the /streams endpoint returns 404.
   Parses Garmin FIT record messages (msg #20) directly from the
   binary file stored on intervals.icu, extracting:
   power, heart_rate, cadence, speed (m/s), altitude (m), timestamp.
==================================================== */
async function fetchFitFile(activityId) {
  // Try several URL patterns intervals.icu uses for FIT file export
  const headers = { ...authHeader(), 'Accept': 'application/octet-stream' };
  const urls = [
    ICU_BASE + `/activity/${activityId}.fit`,
    ICU_BASE + `/athlete/${state.athleteId}/activities/${activityId}.fit`,
    ICU_BASE + `/activity/${activityId}/original`,
    ICU_BASE + `/athlete/${state.athleteId}/activities/${activityId}/original`,
  ];
  for (const url of urls) {
    const res = await fetch(url, { headers });
    if (res.ok) return res.arrayBuffer();
  }
  return null;
}

// Fetch GPS track from intervals.icu's map endpoint.
// Their website uses /api/activity/{id}/map but that lacks CORS headers.
// We try /api/v1/ variants first (CORS-enabled), then the internal one as a last hope.
// Returns [[lat,lng],...] pairs or null.
async function fetchMapGPS(activityId) {
  const numericId = String(activityId).replace(/^i/, '');
  const urls = [
    // Public API variants — have CORS headers but may 404
    ICU_BASE + `/activity/${activityId}/map`,
    ICU_BASE + `/athlete/${state.athleteId}/activities/${activityId}/map`,
    // Local proxy (proxy.py adds CORS) — only works when served via serve.bat
    `http://localhost:8080/icu-internal/activity/${numericId}/map?weather=true`,
    // Direct internal endpoint — CORS-blocked from file:// but works from same-origin
    `https://intervals.icu/api/activity/${numericId}/map?weather=true`,
  ];
  let data = null;
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: authHeader() });
      if (!res.ok) continue;
      data = await res.json();
      break;
    } catch (_) {}
  }
  if (!data) return null;

  // intervals.icu returns GPS as "latlngs" — already [[lat,lng],...] pairs
  const track =
    data.latlngs     ||
    data.latlng      ||
    data.track       ||
    data.route       ||
    data.coordinates ||
    null;

  if (Array.isArray(track) && track.length > 0) {
    if (Array.isArray(track[0])) return track;
    if (typeof track[0] === 'number' && track.length % 2 === 0) {
      const pairs = [];
      for (let i = 0; i < track.length; i += 2) pairs.push([track[i], track[i+1]]);
      return pairs;
    }
  }

  const latData = data.lat || data.latitude;
  const lngData = data.lng || data.lon || data.longitude;
  if (Array.isArray(latData) && Array.isArray(lngData) && latData.length === lngData.length) {
    return latData.map((lat, i) =>
      lat != null && lngData[i] != null ? [lat, lngData[i]] : null
    );
  }

  return null;
}

// Try to fetch the longitude stream separately from the streams endpoint.
// intervals.icu's /activity/{id}/streams endpoint works when /athlete/{id}/activities/{id}/streams 404s.
// We already have latitudes from the main streams fetch; this tries to pair them with longitudes.
// Returns [[lat,lng],...] pairs or null.
async function fetchLngStream(activityId, latArr) {
  const headers = { ...authHeader(), 'Accept': 'application/json' };
  // Try each streams base URL with only the lng (and lon) stream types
  const baseUrls = [
    ICU_BASE + `/activity/${activityId}/streams`,
    ICU_BASE + `/athlete/${state.athleteId}/activities/${activityId}/streams`,
  ];
  for (const base of baseUrls) {
    for (const type of ['lng', 'lon']) {
      try {
        const res = await fetch(`${base}?streams=${type}`, { headers });
        if (!res.ok) continue;
        const data = await res.json();
        if (!data) continue;
        // Normalize — could be [{type:'lng',data:[...]}] or {lng:[...]}
        let lngData = null;
        if (Array.isArray(data)) {
          const s = data.find(s => s.type === type || s.type === 'lng' || s.type === 'lon');
          lngData = s?.data;
        } else if (data[type] || data.lng || data.lon) {
          lngData = data[type] || data.lng || data.lon;
        }
        if (Array.isArray(lngData) && lngData.length === latArr.length) {
          return latArr.map((lat, i) =>
            lat != null && lngData[i] != null ? [lat, lngData[i]] : null
          );
        }
      } catch (_) {}
    }
  }
  return null;
}

// Fetch GPS track from a GPX file — intervals.icu can generate GPX for most activities.
// Returns [[lat,lng],...] pairs or null.
async function fetchGPSFromGPX(activityId) {
  // Try both URL patterns
  const gpxUrls = [
    ICU_BASE + `/activity/${activityId}.gpx`,
    ICU_BASE + `/athlete/${state.athleteId}/activities/${activityId}.gpx`,
  ];
  try {
    let res = null;
    for (const url of gpxUrls) {
      res = await fetch(url, { headers: authHeader() });
      if (res.ok) break;
      res = null;
    }
    if (!res) return null;
    const text = await res.text();
    const doc  = new DOMParser().parseFromString(text, 'text/xml');
    const pts  = doc.querySelectorAll('trkpt');
    if (!pts.length) return null;
    const pairs = [];
    pts.forEach(pt => {
      const lat = parseFloat(pt.getAttribute('lat'));
      const lon = parseFloat(pt.getAttribute('lon'));
      if (!isNaN(lat) && !isNaN(lon)) pairs.push([lat, lon]);
    });
    return pairs.length >= 2 ? pairs : null;
  } catch (_) { return null; }
}

function parseFitBuffer(buffer) {
  const bytes = new Uint8Array(buffer);
  const view  = new DataView(buffer);
  if (bytes.length < 12) return null;
  if (String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) !== '.FIT') return null;

  const headerSize = bytes[0];
  const dataSize   = view.getUint32(4, true);
  const end        = headerSize + dataSize;

  const localDefs    = {};
  const records      = [];
  let   offset       = headerSize;
  let   lastTimestamp = 0;

  // Read a single field value from the DataView
  function readField(pos, baseType, le) {
    switch (baseType) {
      case 0x00: case 0x0A: case 0x02: { const v = bytes[pos]; return v === 0xFF       ? null : v; }
      case 0x01:                        { const v = view.getInt8(pos);              return v === 0x7F         ? null : v; }
      case 0x84:                        { const v = view.getUint16(pos, le);        return v === 0xFFFF       ? null : v; }
      case 0x83:                        { const v = view.getInt16(pos, le);         return v === 0x7FFF       ? null : v; }
      case 0x86:                        { const v = view.getUint32(pos, le);        return v === 0xFFFFFFFF   ? null : v; }
      case 0x85:                        { const v = view.getInt32(pos, le);         return v === 0x7FFFFFFF   ? null : v; }
      case 0x88:                        { const v = view.getFloat32(pos, le);       return isFinite(v)        ? v    : null; }
      default: return null;
    }
  }

  // Extract a record message into a plain object
  function readRecordMsg(pos, def, forcedTimestamp) {
    const rec = forcedTimestamp !== null ? { timestamp: forcedTimestamp } : {};
    const le  = !def.bigEndian;
    for (const f of def.fields) {
      const raw = readField(pos, f.baseType, le);
      if (raw !== null) {
        switch (f.fieldNum) {
          case 253: rec.timestamp  = raw;              break;
          case 0:   rec.lat        = raw * (180 / 2147483648); break; // semicircles → degrees
          case 1:   rec.lng        = raw * (180 / 2147483648); break; // semicircles → degrees
          case 2:   rec.altitude   = raw / 5 - 500;   break; // scale 1/5, offset -500 → metres
          case 3:   rec.heart_rate = raw;              break;
          case 4:   rec.cadence    = raw;              break;
          case 5:   rec.distance   = raw / 100;        break; // cm → m
          case 6:   rec.speed      = raw / 1000;       break; // mm/s → m/s
          case 7:   rec.power      = raw;              break;
        }
      }
      pos += f.size;
    }
    return rec;
  }

  while (offset < end && offset < bytes.length) {
    if (offset >= bytes.length) break;
    const header = bytes[offset++];

    // Compressed timestamp header (bit 7 set)
    if (header & 0x80) {
      const localMsgNum = (header >> 5) & 0x03;
      const timeDelta   = header & 0x1F;
      lastTimestamp     = ((lastTimestamp & ~0x1F) + timeDelta) >>> 0;
      if (timeDelta < (lastTimestamp & 0x1F)) lastTimestamp += 0x20;
      const def = localDefs[localMsgNum];
      if (def) {
        if (def.globalMsgNum === 20) records.push(readRecordMsg(offset, def, lastTimestamp));
        offset += def.recordSize;
      }
      continue;
    }

    const hasDevData   = (header & 0x60) === 0x60;
    const isDefinition = !!(header & 0x40);
    const localMsgNum  = header & 0x0F;

    if (isDefinition) {
      offset++;                                          // reserved
      const bigEndian    = bytes[offset++] === 1;
      const globalMsgNum = bigEndian ? view.getUint16(offset, false) : view.getUint16(offset, true);
      offset += 2;
      const numFields = bytes[offset++];
      const fields = [];
      let   recordSize = 0;
      for (let i = 0; i < numFields; i++) {
        const fieldNum = bytes[offset++];
        const size     = bytes[offset++];
        const baseType = bytes[offset++] & 0x9F;        // mask reserved bits
        fields.push({ fieldNum, size, baseType });
        recordSize += size;
      }
      if (hasDevData) {
        const nDev = bytes[offset++];
        for (let i = 0; i < nDev; i++) { recordSize += bytes[offset + 1]; offset += 3; }
      }
      localDefs[localMsgNum] = { globalMsgNum, fields, bigEndian, recordSize };
    } else {
      const def = localDefs[localMsgNum];
      if (!def) break;                                   // malformed — bail
      if (def.globalMsgNum === 20) {
        const rec = readRecordMsg(offset, def, null);
        if (rec.timestamp) lastTimestamp = rec.timestamp;
        records.push(rec);
      }
      offset += def.recordSize;
    }
  }

  return records.length > 0 ? records : null;
}

// Convert parsed FIT records → { time, watts, heartrate, cadence, velocity_smooth, altitude }
function fitRecordsToStreams(records) {
  if (!records || !records.length) return null;
  const t0 = (records.find(r => r.timestamp) || {}).timestamp || 0;
  const out = { time: [], watts: [], heartrate: [], cadence: [], velocity_smooth: [], altitude: [], latlng: [] };
  records.forEach(r => {
    out.time.push((r.timestamp || 0) - t0);
    out.watts.push(r.power      ?? null);
    out.heartrate.push(r.heart_rate ?? null);
    out.cadence.push(r.cadence  ?? null);
    out.velocity_smooth.push(r.speed ?? null);  // m/s — renderStreamCharts converts to km/h
    out.altitude.push(r.altitude ?? null);
    out.latlng.push((r.lat != null && r.lng != null) ? [r.lat, r.lng] : null);
  });
  // Drop latlng stream entirely if no GPS data was recorded (all nulls)
  if (out.latlng.every(p => p === null)) delete out.latlng;
  return out;
}

// Compute a smoothed grade (%) stream from altitude + distance arrays.
// Uses a ±8-sample window so brief GPS noise doesn't spike the value.
function computeGradeStream(altArr, distArr) {
  const n = altArr.length;
  const W = 8;
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - W);
    const hi = Math.min(n - 1, i + W);
    const dDist = distArr[hi] - distArr[lo];
    raw[i] = dDist > 1 ? ((altArr[hi] - altArr[lo]) / dDist) * 100 : 0;
  }
  // Light smoothing pass to further reduce noise
  const S = 4;
  return Array.from(raw).map((_, i) => {
    let sum = 0, cnt = 0;
    for (let j = Math.max(0, i - S); j <= Math.min(n - 1, i + S); j++) {
      sum += raw[j]; cnt++;
    }
    return Math.round((sum / cnt) * 10) / 10;  // 1 decimal
  });
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
  const rawAName = (a.name && a.name.trim()) ? a.name.trim() : activityFallbackName(a);
  const { title: aName, platformTag: aPlatformTag } = cleanActivityName(rawAName);
  document.getElementById('detailName').textContent = aName;
  // Platform tag (e.g. "Zwift") shown in the eyebrow next to sport type
  const platformTagEl = document.getElementById('detailPlatformTag');
  if (platformTagEl) {
    platformTagEl.textContent  = aPlatformTag || '';
    platformTagEl.style.display = aPlatformTag ? '' : 'none';
  }
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

  // ── Compute per-type averages for comparison ──────────────────────────────
  const thisType = (a.sport_type || a.type || '').toLowerCase();
  const peers = (state.activities || []).filter(act => {
    const t = (act.sport_type || act.type || '').toLowerCase();
    return t === thisType && act.id !== a.id;
  });
  const avgOf = (...keys) => {
    const vals = peers.map(act => actVal(act, ...keys)).filter(v => v > 0);
    return vals.length >= 3 ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  };
  const pctDiff = (actual, avg) => (avg && avg > 0 && actual > 0)
    ? ((actual - avg) / avg) * 100 : null;

  const avgDistM  = avgOf('distance', 'icu_distance');
  const avgSecsV  = avgOf('moving_time', 'elapsed_time', 'icu_moving_time', 'icu_elapsed_time',
                          'moving_time_seconds', 'elapsed_time_seconds');
  const avgPowV   = avgOf('icu_weighted_avg_watts', 'normalized_power', 'average_watts', 'icu_average_watts');
  const avgHrV    = avgOf('average_heartrate', 'icu_average_heartrate');
  const avgSpdMs  = avgOf('average_speed', 'icu_average_speed', 'average_speed_meters_per_sec');

  const avgElevV  = avgOf('total_elevation_gain', 'icu_total_elevation_gain');
  const avgCadV   = avgOf('average_cadence', 'icu_average_cadence');
  const avgTssV   = avgOf('icu_training_load', 'tss');

  const pctDist   = pctDiff(dist,    avgDistM);
  const pctSecs   = pctDiff(secs,    avgSecsV);
  const pctPow    = pctDiff(np || avgW, avgPowV);
  const pctHR     = pctDiff(avgHR,   avgHrV);
  const pctSpd    = pctDiff(speedMs, avgSpdMs);
  const pctElev   = pctDiff(elev,    avgElevV);
  const pctCad    = pctDiff(avgCad,  avgCadV);
  const pctTss    = pctDiff(tss,     avgTssV);

  // ── Primary stats: up to 4 hero numbers ───────────────────────────────────
  const pStat = (val, lbl, accent = false, cmpPct = null) => {
    let cmpHtml = '';
    if (cmpPct !== null && !isNaN(cmpPct)) {
      const up = cmpPct >= 1;
      const dn = cmpPct <= -1;
      const cls = up ? 'cmp-up' : (dn ? 'cmp-down' : 'cmp-same');
      const arrow = up ? '↑' : (dn ? '↓' : '→');
      const pctAbs = Math.abs(Math.round(cmpPct));
      const label = pctAbs < 1 ? 'on avg' : `${arrow} ${pctAbs}% vs avg`;
      cmpHtml = `<div class="act-pstat-cmp ${cls}">${label}</div>`;
    }
    return `<div class="act-pstat${accent ? ' act-pstat--accent' : ''}">
       <div class="act-pstat-val">${val}</div>
       <div class="act-pstat-lbl">${lbl}</div>
       ${cmpHtml}
     </div>`;
  };

  const primary = [];
  if (distKm > 0.05) primary.push(pStat(distKm.toFixed(1), 'km', false, pctDist));
  if (secs > 0)      primary.push(pStat(fmtDur(secs), 'duration', false, pctSecs));
  if (np > 0)        primary.push(pStat(Math.round(np) + 'W', 'norm power', true, pctPow));
  else if (avgW > 0) primary.push(pStat(Math.round(avgW) + 'W', 'avg power', true, pctPow));
  if (avgHR > 0)     primary.push(pStat(Math.round(avgHR), 'avg bpm', false, pctHR));
  else if (speedKmh > 0.5) primary.push(pStat(speedKmh.toFixed(1), 'km/h', false, pctSpd));

  const primaryEl = document.getElementById('actPrimaryStats');
  primaryEl.innerHTML = primary.slice(0, 4).join('');
  primaryEl.style.gridTemplateColumns = `repeat(${Math.min(primary.length, 4)}, 1fr)`;

  // Store computed avgs for comparison card
  a._avgs = { avgDistM, avgSecsV, avgPowV, avgHrV, avgSpdMs, peerCount: peers.length };

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
  const sStat = (val, lbl, icon, color, cmpPct = null, colored = false) => {
    let cmpHtml = '';
    if (cmpPct !== null && !isNaN(cmpPct)) {
      const up = cmpPct >= 1;
      const dn = cmpPct <= -1;
      const cls = colored ? (up ? 'cmp-pos' : (dn ? 'cmp-neg' : 'cmp-neutral')) : 'cmp-neutral';
      const pctAbs = Math.abs(Math.round(cmpPct));
      const label = pctAbs < 1 ? '≈ avg' : `${up ? '↑' : '↓'} ${pctAbs}% vs avg`;
      cmpHtml = `<div class="act-sstat-cmp ${cls}">${label}</div>`;
    }
    return `<div class="act-sstat">
       <div class="act-sstat-top">
         <div class="act-sstat-icon ${color}">${SICONS[icon]}</div>
         <div class="act-sstat-lbl">${lbl}</div>
       </div>
       <div class="act-sstat-val">${val}</div>
       ${cmpHtml}
     </div>`;
  };

  let sec = '';
  if (elev > 0)                  sec += sStat(elev.toLocaleString() + ' m', 'Elevation',   'elev',   'green',  pctElev, false);
  if (speedKmh > 0.5 && np > 0) sec += sStat(speedKmh.toFixed(1) + ' km/h','Avg Speed',   'speed',  'blue',   pctSpd,  true);
  if (avgW > 0 && np > 0)        sec += sStat(Math.round(avgW) + 'W',       'Avg Power',   'zap',    'orange', pctPow,  true);
  if (maxW > 0)                  sec += sStat(Math.round(maxW) + 'W',       'Max Power',   'zap',    'orange', null,    false);
  if (ifVal > 0)                 sec += sStat(ifVal.toFixed(2),              'Int. Factor', 'target', 'purple', null,    false);
  if (maxHR > 0)                 sec += sStat(Math.round(maxHR) + ' bpm',   'Max HR',      'heart',  'red',    null,    false);
  if (avgCad > 0)                sec += sStat(Math.round(avgCad) + ' rpm',  'Cadence',     'cad',    'yellow', pctCad,  false);
  if (cals > 0)                  sec += sStat(Math.round(cals).toLocaleString(), 'Calories','fire',   'orange', null,    false);
  if (tss > 0)                   sec += sStat(tss,                           'TSS',         'pulse',  'green',  pctTss,  false);

  document.getElementById('actSecondaryStats').innerHTML = sec;

  // ── Render the "How You Compare" card ────────────────────────────────────
  renderDetailComparison(a);
}

function renderDetailComparison(a) {
  const card    = document.getElementById('detailCompareCard');
  const rowsEl  = document.getElementById('detailCmpRows');
  const subtEl  = document.getElementById('detailCompareSubtitle');
  const badgeEl = document.getElementById('detailCmpBadge');
  if (!card) return;

  const avgs = a._avgs || {};
  if (!avgs.peerCount || avgs.peerCount < 3) { card.style.display = 'none'; return; }

  const thisType = (a.sport_type || a.type || '');
  subtEl.textContent = `vs. your last ${avgs.peerCount} ${thisType.toLowerCase()} averages`;

  // Determine overall vibe for the badge
  const allPcts = [];

  // Helper: build one comparison row
  // bar fills up to 150% of avg, so avg line sits at ~66.7%
  const makeRow = (label, actual, avg, fmtFn, higherIsGood = true) => {
    if (!actual || !avg || avg <= 0) return '';
    const pct = ((actual - avg) / avg) * 100;
    // Normalise bar: avg = 66.7%, max shown = 2× avg
    const ratio = Math.min(actual / avg, 2.0);
    const fillPct = (ratio / 2.0) * 100;
    const avgLinePct = 50; // avg sits at 50% of the bar track (since max = 2×avg)
    const up = pct >= 1;
    const dn = pct <= -1;
    const positive = higherIsGood ? up : dn;
    const cls = positive ? 'cmp-up' : (up || dn ? 'cmp-down' : 'cmp-same');
    const fillColor = positive ? '#22c55e' : (up || dn ? 'var(--accent)' : 'var(--text-muted)');
    const pctAbs = Math.abs(Math.round(pct));
    const pctLabel = pctAbs < 1 ? '≈ avg' : `${up ? '+' : '-'}${pctAbs}%`;
    allPcts.push(positive ? pct : -Math.abs(pct));
    return `<div class="detail-cmp-row">
      <div class="detail-cmp-label">${label}</div>
      <div class="detail-cmp-bar-wrap">
        <div class="detail-cmp-bar-fill" style="width:${fillPct.toFixed(1)}%;background:${fillColor}"></div>
        <div class="detail-cmp-bar-avg" style="left:${avgLinePct}%">
          <div class="detail-cmp-avg-val">avg ${fmtFn(avg)}</div>
        </div>
      </div>
      <div class="detail-cmp-vals">
        <div class="detail-cmp-this">${fmtFn(actual)}</div>
        <div class="detail-cmp-pct ${cls}">${pctLabel}</div>
      </div>
    </div>`;
  };

  // Gather raw values
  const dist    = actVal(a, 'distance', 'icu_distance');
  const distKm  = dist / 1000;
  const secs    = actVal(a, 'moving_time', 'elapsed_time', 'icu_moving_time', 'icu_elapsed_time',
                         'moving_time_seconds', 'elapsed_time_seconds');
  const np      = actVal(a, 'icu_weighted_avg_watts', 'normalized_power');
  const avgW    = actVal(a, 'average_watts', 'icu_average_watts');
  const pow     = np || avgW;
  const avgHR   = actVal(a, 'average_heartrate', 'icu_average_heartrate') ||
                  (a.heart_rate && a.heart_rate.average) || 0;
  const rawSpd  = actVal(a, 'average_speed', 'icu_average_speed', 'average_speed_meters_per_sec');
  const speedMs = rawSpd || (secs > 0 && dist ? dist / secs : 0);
  const elev    = Math.round(actVal(a, 'total_elevation_gain', 'icu_total_elevation_gain'));
  const tss     = Math.round(actVal(a, 'icu_training_load', 'tss'));

  const avgElev = (() => {
    const thisType = (a.sport_type || a.type || '').toLowerCase();
    const peers = (state.activities || []).filter(act => {
      const t = (act.sport_type || act.type || '').toLowerCase();
      return t === thisType && act.id !== a.id;
    });
    const vals = peers.map(act => Math.round(actVal(act, 'total_elevation_gain', 'icu_total_elevation_gain'))).filter(v => v > 0);
    return vals.length >= 3 ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  })();

  const avgTSS = (() => {
    const thisType = (a.sport_type || a.type || '').toLowerCase();
    const peers = (state.activities || []).filter(act => {
      const t = (act.sport_type || act.type || '').toLowerCase();
      return t === thisType && act.id !== a.id;
    });
    const vals = peers.map(act => Math.round(actVal(act, 'icu_training_load', 'tss'))).filter(v => v > 0);
    return vals.length >= 3 ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  })();

  let html = '';
  html += makeRow('Distance',  distKm,   avgs.avgDistM  ? avgs.avgDistM / 1000 : null, v => v.toFixed(1) + ' km');
  html += makeRow('Duration',  secs,     avgs.avgSecsV,  v => fmtDur(v));
  html += makeRow('Power',     pow,      avgs.avgPowV,   v => Math.round(v) + ' W');
  html += makeRow('Heart Rate',avgHR,    avgs.avgHrV,    v => Math.round(v) + ' bpm', false); // lower HR = better at same power
  html += makeRow('Speed',     speedMs,  avgs.avgSpdMs,  v => (v * 3.6).toFixed(1) + ' km/h');
  html += makeRow('Elevation', elev,     avgElev,        v => Math.round(v).toLocaleString() + ' m');
  html += makeRow('Load (TSS)', tss,     avgTSS,         v => Math.round(v));

  if (!html.trim()) { card.style.display = 'none'; return; }

  // Overall badge: average of all pct differences
  if (allPcts.length > 0) {
    const overallPct = allPcts.reduce((s, v) => s + v, 0) / allPcts.length;
    const good = overallPct >= 3;
    const weak = overallPct <= -3;
    const label = good ? '🔥 Above your average' : (weak ? 'Below your average' : '≈ On par');
    badgeEl.textContent = label;
    if (good) {
      badgeEl.style.background = '#22c55e22';
      badgeEl.style.color = '#22c55e';
    } else if (weak) {
      badgeEl.style.background = 'var(--bg-elevated)';
      badgeEl.style.color = 'var(--text-muted)';
    } else {
      badgeEl.style.background = 'var(--bg-elevated)';
      badgeEl.style.color = 'var(--accent)';
    }
  }

  rowsEl.innerHTML = html;
  card.style.display = '';
}

/* ====================================================
   ROUTE MAP  (Leaflet.js)
==================================================== */

// ── Route colour-gradient helpers ────────────────────────────────────────

// Linear interpolation between two hex colours (t = 0..1)
function lerpColor(hex1, hex2, t) {
  const p = (h) => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
  const [r1,g1,b1] = p(hex1), [r2,g2,b2] = p(hex2);
  const r = Math.round(r1 + (r2-r1)*t);
  const g = Math.round(g1 + (g2-g1)*t);
  const b = Math.round(b1 + (b2-b1)*t);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

// Return a quantised colour for a given stream index and colour mode.
// Quantising to BUCKETS values prevents creating thousands of unique hex strings
// (and therefore thousands of Leaflet polyline segments).
function routePointColor(mode, streams, si, maxes, BUCKETS = 32) {
  const get = (...keys) => {
    for (const k of keys) {
      const a = streams[k];
      if (Array.isArray(a) && si < a.length && a[si] != null) return a[si];
    }
    return null;
  };
  const quantize = (pct) => Math.round(Math.min(1, Math.max(0, pct)) * BUCKETS) / BUCKETS;

  switch (mode) {
    case 'hr': {
      const hr = get('heartrate', 'heart_rate');
      return hr != null ? hrZoneColor(hr, maxes.maxHR) : '#4b5563';
    }
    case 'speed': {
      const spd = get('velocity_smooth');
      if (spd == null) return '#3b82f6';
      const q = quantize((spd * 3.6) / (maxes.maxSpdKmh || 50));
      return lerpColor('#bfdbfe', '#1e3a8a', q);   // light → dark blue
    }
    case 'power': {
      const w = get('watts', 'power');
      if (w == null) return '#4b5563';
      const q = quantize(w / (maxes.maxWatts || 400));
      return q < 0.5
        ? lerpColor('#fde68a', '#f97316', q * 2)   // yellow → orange
        : lerpColor('#f97316', '#dc2626', (q-0.5)*2); // orange → red
    }
    case 'altitude': {
      const alt = get('altitude');
      if (alt == null) return '#4b5563';
      const range = (maxes.maxAlt - maxes.minAlt) || 1;
      const q = quantize((alt - maxes.minAlt) / range);
      return lerpColor('#34d399', '#7c3aed', q);   // green → violet
    }
    default:
      return '#00c87a';
  }
}

// Build an array of { color, points[] } segments from the GPS track.
// Consecutive points that share the same quantised colour are merged into one
// segment (with a 1-point overlap) so Leaflet only renders O(transitions) polylines.
function buildColoredSegments(points, streams, mode, maxes) {
  const timeLen = streams.time?.length || points.length;
  const result  = [];
  let curColor  = null;
  let curPts    = [];

  for (let i = 0; i < points.length; i++) {
    const si    = Math.round(i * (timeLen - 1) / (points.length - 1));
    const color = routePointColor(mode, streams, si, maxes);

    if (color !== curColor) {
      if (curPts.length >= 2) result.push({ color: curColor, points: curPts });
      // Start new segment, sharing the last point for a seamless join
      curColor = color;
      curPts   = curPts.length ? [curPts[curPts.length - 1], points[i]] : [points[i]];
    } else {
      curPts.push(points[i]);
    }
  }
  if (curPts.length >= 2) result.push({ color: curColor, points: curPts });
  return result;
}

// ── Map stats panel: SVG speed gauge + metric rows ───────────────────────

// Build the panel HTML once (skeleton with — placeholders).
// Call this BEFORE adding hover event listeners to avoid re-creating DOM on every event.
// Feather-style inline SVG icons (24×24 viewBox, sized via CSS)
const MAP_ICONS = {
  power: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  hr:    `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
  cad:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`,
  alt:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>`,
  grade: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="20" x2="21" y2="20"/><polyline points="3 20 13 8 17 13 21 4"/></svg>`,
  time:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
};

// HR zone colour based on % of max HR
function hrZoneColor(hr, maxHR) {
  const p = hr / (maxHR || 190);
  if (p < 0.60) return '#94a3b8';  // Z1 recovery — muted blue-gray
  if (p < 0.70) return '#60a5fa';  // Z2 endurance — blue
  if (p < 0.80) return '#4ade80';  // Z3 aerobic   — green
  if (p < 0.90) return '#fb923c';  // Z4 threshold — orange
  return '#f87171';                 // Z5 VO2max    — red
}

// Compute an SVG arc path for the speed gauge.
// Gauge geometry: CX=60, CY=68, R=44, 270° sweep clockwise starting at 135° (7:30 position).
// pct = 0..1 → returns path string for setAttribute('d', …).
// Using <path> instead of <circle stroke-dasharray> gives reliable stroke-linecap="round" endpoints.
function gaugeArcPath(pct) {
  const CX = 60, CY = 68, R = 44;
  if (pct <= 0) return 'M 0 0';
  pct = Math.min(0.9999, pct);   // prevent degenerate arc when start ≈ end
  const toR = d => d * (Math.PI / 180);
  const sx = (CX + R * Math.cos(toR(135))).toFixed(2);
  const sy = (CY + R * Math.sin(toR(135))).toFixed(2);
  const ex = (CX + R * Math.cos(toR(135 + pct * 270))).toFixed(2);
  const ey = (CY + R * Math.sin(toR(135 + pct * 270))).toFixed(2);
  const large = (pct * 270) > 180 ? 1 : 0;
  return `M ${sx} ${sy} A ${R} ${R} 0 ${large} 1 ${ex} ${ey}`;
}
// Full 270° track arc (static — precomputed: start 135°→28.89,99.11, end 45°→91.11,99.11)
const GAUGE_TRACK_PATH = 'M 28.89 99.11 A 44 44 0 1 1 91.11 99.11';

function buildMapStatsHTML(streams, maxSpdKmh, maxHR) {
  const hasWatts = !!(streams.watts || streams.power);
  const hasHR    = !!(streams.heartrate || streams.heart_rate);
  const hasCad   = !!streams.cadence;
  const hasAlt   = !!streams.altitude;
  const hasGrade = !!streams.grade_smooth;

  const maxLabel = maxSpdKmh != null ? maxSpdKmh.toFixed(0) : '—';

  // Tick marks — 10 km/h major + 5 km/h minor notches inside the arc stroke
  // Arc geometry: cx=60, cy=68, r=44, stroke-width=8 → stroke spans r=40..48
  const CX = 60, CY = 68, R = 44;
  const tickMarks = (() => {
    const lines = [];
    const maxSpd = maxSpdKmh || 50;
    for (let v = 5; v < maxSpd; v += 5) {
      const isMajor = (v % 10 === 0);
      const pct  = v / maxSpd;
      const aRad = (135 + pct * 270) * (Math.PI / 180);
      const cos  = Math.cos(aRad), sin = Math.sin(aRad);
      // Major ticks span more of the stroke; minor ticks are shorter
      const r1 = isMajor ? R - 3 : R - 1.5;
      const r2 = isMajor ? R + 3 : R + 1.5;
      const sw  = isMajor ? 1    : 0.75;
      const col = isMajor ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.11)';
      lines.push(
        `<line x1="${(CX + r1*cos).toFixed(2)}" y1="${(CY + r1*sin).toFixed(2)}" ` +
             `x2="${(CX + r2*cos).toFixed(2)}" y2="${(CY + r2*sin).toFixed(2)}" ` +
             `stroke="${col}" stroke-width="${sw}" stroke-linecap="round"/>`
      );
    }
    return lines.join('');
  })();

  // SVG speedometer — 270° arc, r=44, cx=60, cy=68
  // stroke-linecap="round" gives rounded arc endpoints; ticks sit on top for section markers
  const gaugeHtml = `
    <div class="speed-gauge">
      <svg viewBox="0 0 120 114" overflow="visible" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stop-color="#00a86b"/>
            <stop offset="100%" stop-color="#00e5a0"/>
          </linearGradient>
        </defs>
        <path class="g-track" d="${GAUGE_TRACK_PATH}"/>
        <path class="g-fill"  d="M 0 0"/>
        ${tickMarks}
        <text class="g-num"  x="60" y="72"
              fill="#e2e8f0" text-anchor="middle">—</text>
        <text class="g-unit" x="60" y="85"
              fill="#94a3b8" text-anchor="middle">km/h</text>
        <text class="g-zero" x="20.4" y="108"
              fill="#64748b" text-anchor="middle">0</text>
        <text class="g-max"  x="99.6" y="108"
              fill="#64748b" text-anchor="middle">${maxLabel}</text>
      </svg>
      <div class="g-label">SPEED</div>
    </div>`;

  // Garmin-style data field cell: label + icon on top, big number below
  const cell = (icon, iconClass, lbl, mkey, unt, full = false) =>
    `<div class="mm-cell${full ? ' mm-full' : ''}">
       <div class="mm-header">
         <span class="mm-icon ${iconClass}">${icon}</span>
         <span class="mm-lbl">${lbl}</span>
       </div>
       <div class="mm-data">
         <span class="mm-val" data-mkey="${mkey}">—</span>${unt ? `<span class="mm-unt">${unt}</span>` : ''}
       </div>
     </div>`;

  // Build cells; bottom row: Time (left) + Grade (right), or Time full-width if no grade
  const cells = [
    hasWatts ? cell(MAP_ICONS.power, '',        'PWR',   'watts', 'W')   : null,
    hasHR    ? cell(MAP_ICONS.hr,    'hr-icon', 'HR',    'hr',    'bpm') : null,
    hasCad   ? cell(MAP_ICONS.cad,   '',        'CAD',   'cad',   'rpm') : null,
    hasAlt   ? cell(MAP_ICONS.alt,   '',        'ALT',   'alt',   'm')   : null,
    hasGrade ? cell(MAP_ICONS.grade, '',        'GRADE', 'grade', '%')   : null,
               cell(MAP_ICONS.time,  '',        'TIME',  'time',  '',    false),
  ].filter(Boolean).join('');

  return gaugeHtml + `<div class="map-metrics">${cells}</div>`;
}

// Update panel DOM in-place — no full innerHTML rebuild on every mousemove.
function refreshMapStats(panel, streams, idx, maxSpdKmh, maxHR) {
  if (!panel) return;
  const get = (key) => {
    const arr = streams[key];
    return (Array.isArray(arr) && idx < arr.length && arr[idx] != null) ? arr[idx] : null;
  };

  const watts  = get('watts') ?? get('power');
  const hr     = get('heartrate') ?? get('heart_rate');
  const cad    = get('cadence');
  const spd    = get('velocity_smooth');  // m/s
  const alt    = get('altitude');
  const grade  = get('grade_smooth');     // percent, signed
  const t      = get('time');

  const fmt = (v, dec = 0) => v != null ? (+v).toFixed(dec) : '—';
  const fmtTime = (s) => {
    if (s == null) return '—';
    const h  = Math.floor(s / 3600);
    const m  = Math.floor((s % 3600) / 60);
    const sc = Math.floor(s % 60);
    return h > 0
      ? `${h}:${String(m).padStart(2,'0')}:${String(sc).padStart(2,'0')}`
      : `${m}:${String(sc).padStart(2,'0')}`;
  };

  // ── Gauge ─────────────────────────────────────────────────────────────
  const spdKmh = spd != null ? spd * 3.6 : null;
  const maxSpd = maxSpdKmh || 50;
  const pct    = spdKmh != null ? Math.min(1, Math.max(0, spdKmh / maxSpd)) : 0;
  const gFill = panel.querySelector('.g-fill');
  const gNum  = panel.querySelector('.g-num');
  if (gFill) gFill.setAttribute('d', gaugeArcPath(pct));
  if (gNum)  gNum.textContent = spdKmh != null ? spdKmh.toFixed(1) : '—';

  // ── Metric rows ───────────────────────────────────────────────────────
  const setVal = (key, val, color) => {
    const el = panel.querySelector(`[data-mkey="${key}"]`);
    if (!el) return;
    el.textContent = val;
    if (color !== undefined) el.style.color = color;
  };
  setVal('watts', fmt(watts));
  setVal('cad',   fmt(cad));
  setVal('alt',   fmt(alt));
  setVal('time',  fmtTime(t));

  // Grade: show sign, 1 decimal, colour by slope direction/steepness
  if (grade != null) {
    const gStr  = (grade >= 0 ? '+' : '') + grade.toFixed(1);
    const gColor = grade >  6  ? '#f87171'   // steep climb  — red
                 : grade >  2  ? '#fb923c'   // moderate climb — orange
                 : grade > -2  ? '#e2e8f0'   // flat          — white
                 : grade > -6  ? '#60a5fa'   // moderate descent — blue
                 :               '#818cf8';  // steep descent — indigo
    setVal('grade', gStr, gColor);
  }

  // HR — zone-specific color on the number
  const hrColor = (hr != null) ? hrZoneColor(hr, maxHR) : '';
  setVal('hr', fmt(hr), hrColor);

  // ── HR icon heartbeat — animation speed matches actual BPM ────────────
  const hrIcon = panel.querySelector('.hr-icon');
  if (hrIcon) {
    if (hr != null) {
      const newPeriod = `${(60 / Math.max(30, hr)).toFixed(2)}s`;
      const oldPeriod = hrIcon.style.getPropertyValue('--hr-period');
      hrIcon.style.color = hrColor;
      if (!hrIcon.classList.contains('hr-beating')) {
        // First beat — just start it
        hrIcon.style.setProperty('--hr-period', newPeriod);
        hrIcon.classList.add('hr-beating');
      } else if (oldPeriod !== newPeriod) {
        // HR changed — restart animation immediately instead of waiting
        // for the current cycle to finish (CSS only picks up duration changes
        // at the next iteration boundary)
        hrIcon.classList.remove('hr-beating');
        void hrIcon.offsetWidth;  // force reflow to reset the animation
        hrIcon.style.setProperty('--hr-period', newPeriod);
        hrIcon.classList.add('hr-beating');
      }
    } else {
      hrIcon.classList.remove('hr-beating');
      hrIcon.style.color = '';
    }
  }
}

// Reset all values back to dashes (called on mouseout).
function resetMapStats(panel) {
  if (!panel) return;
  const gFill = panel.querySelector('.g-fill');
  const gNum  = panel.querySelector('.g-num');
  if (gFill) gFill.setAttribute('d', 'M 0 0');
  if (gNum)  gNum.textContent = '—';
  panel.querySelectorAll('[data-mkey]').forEach(el => {
    el.textContent = '—';
    el.style.color = '';
  });
  // Stop heartbeat animation and clear zone colour from icon
  const hrIcon = panel.querySelector('.hr-icon');
  if (hrIcon) {
    hrIcon.classList.remove('hr-beating');
    hrIcon.style.color = '';
  }
}

function renderActivityMap(latlng, streams) {

  const card = document.getElementById('detailMapCard');
  if (!card) return;

  if (!latlng || latlng.length < 2) { card.style.display = 'none'; return; }

  const pairs = latlng.filter(p => Array.isArray(p) && p[0] != null && p[1] != null);
  const valid = pairs.filter(p => Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180);
  if (valid.length < 2) { card.style.display = 'none'; return; }

  // Downsample for rendering — keep full `valid` array for hover detection
  const step   = Math.max(1, Math.floor(valid.length / 600));
  const points = valid.filter((_, i) => i % step === 0);
  if (points[points.length - 1] !== valid[valid.length - 1]) points.push(valid[valid.length - 1]);

  card.style.display = '';

  requestAnimationFrame(() => {
    if (state.activityMap) return;
    try {
      const map = L.map('activityMap', {
        zoomControl:        true,
        scrollWheelZoom:    false,
        attributionControl: true,
      });

      const streetTile = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd', maxZoom: 19,
      });
      const satelliteTile = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; <a href="https://www.esri.com/">Esri</a> &mdash; Source: Esri, Maxar, GeoEye, Earthstar Geographics',
        maxZoom: 19,
      });
      streetTile.addTo(map);
      let isSatellite = false;

      // ── Pre-compute per-mode maxima ──────────────────────────────────────
      const spdArr  = streams.velocity_smooth;
      const maxSpdKmh = (Array.isArray(spdArr) && spdArr.length)
        ? Math.ceil(Math.max(...spdArr.filter(v => v != null)) * 3.6 / 5) * 5
        : 50;

      const hrArr = streams.heartrate || streams.heart_rate;
      const maxHR = (Array.isArray(hrArr) && hrArr.length)
        ? Math.round(Math.max(...hrArr.filter(v => v != null)))
        : 190;

      const wArr = streams.watts || streams.power;
      const maxWatts = (Array.isArray(wArr) && wArr.length)
        ? Math.ceil(Math.max(...wArr.filter(v => v != null)) / 50) * 50
        : 400;

      const altArr = streams.altitude;
      const minAlt = (Array.isArray(altArr) && altArr.length)
        ? Math.min(...altArr.filter(v => v != null)) : 0;
      const maxAlt = (Array.isArray(altArr) && altArr.length)
        ? Math.max(...altArr.filter(v => v != null)) : 100;

      const maxes = { maxSpdKmh, maxHR, maxWatts, minAlt, maxAlt };

      // ── Colour layer (cleared & rebuilt on mode toggle) ──────────────────
      const colorLayer = L.layerGroup().addTo(map);
      let activeMode   = 'default';

      const applyColorMode = (mode) => {
        activeMode = mode;
        colorLayer.clearLayers();
        const segs = buildColoredSegments(points, streams, mode, maxes);
        segs.forEach(seg => L.polyline(seg.points, {
          color: seg.color, weight: 5, opacity: 1,
        }).addTo(colorLayer));

        // Keep toggle buttons in sync
        document.querySelectorAll('.map-mode-btn').forEach(btn =>
          btn.classList.toggle('active', btn.dataset.mode === mode));
      };

      // Initial render (default green)
      applyColorMode('default');

      // ── Fit bounds + start/end markers ───────────────────────────────────
      // Compute bounds from the points array for fitBounds
      const tempPoly = L.polyline(points);
      map.fitBounds(tempPoly.getBounds(), { padding: [24, 24] });
      map.invalidateSize();
      state.activityMap = map;

      const dotIcon = (color) => L.divIcon({
        className: '',
        html: `<div style="width:10px;height:10px;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,0.8);box-shadow:0 0 4px rgba(0,0,0,0.6)"></div>`,
        iconSize: [10, 10], iconAnchor: [5, 5],
      });
      L.marker(points[0],                 { icon: dotIcon('#00e5a0'), zIndexOffset: 200 }).addTo(map);
      L.marker(points[points.length - 1], { icon: dotIcon('#888'),    zIndexOffset: 200 }).addTo(map);

      // ── Alt + scroll to zoom ─────────────────────────────────────────────
      const mapEl = map.getContainer();
      let hintTimer;

      mapEl.addEventListener('wheel', (e) => {
        if (e.altKey) {
          e.preventDefault();
          e.stopPropagation();
          const delta  = e.deltaY < 0 ? 1 : -1;
          const pt     = map.mouseEventToContainerPoint(e);
          const latlng = map.containerPointToLatLng(pt);
          map.setZoomAround(latlng, map.getZoom() + delta);
        } else {
          // Show "hold Alt to zoom" nudge
          let hint = mapEl.querySelector('.map-scroll-hint');
          if (!hint) {
            hint = document.createElement('div');
            hint.className = 'map-scroll-hint';
            hint.textContent = 'Hold Alt to zoom';
            mapEl.appendChild(hint);
          }
          hint.classList.add('visible');
          clearTimeout(hintTimer);
          hintTimer = setTimeout(() => hint.classList.remove('visible'), 1600);
        }
      }, { passive: false });

      // Cursor feedback when Alt is held over the map
      const onKeyDown = (e) => { if (e.key === 'Alt') mapEl.classList.add('alt-zoom');    };
      const onKeyUp   = (e) => { if (e.key === 'Alt') mapEl.classList.remove('alt-zoom'); };
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup',   onKeyUp);
      // Clean up global listeners if the map is ever removed
      map.on('remove', () => {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup',   onKeyUp);
      });

      // ── Toggle buttons ────────────────────────────────────────────────────
      const togglesEl = document.getElementById('mapColorToggles');
      if (togglesEl) {
        const modes = [
          { key: 'default',  label: 'Route',    icon: '◉' },
          hrArr?.length   ? { key: 'hr',       label: 'HR',       icon: '♥' } : null,
          spdArr?.length  ? { key: 'speed',    label: 'Speed',    icon: '⚡' } : null,
          wArr?.length    ? { key: 'power',    label: 'Power',    icon: '◈' } : null,
          altArr?.length  ? { key: 'altitude', label: 'Altitude', icon: '▲' } : null,
        ].filter(Boolean);

        togglesEl.innerHTML = modes.map(m =>
          `<button class="map-mode-btn${m.key === 'default' ? ' active' : ''}" data-mode="${m.key}">
             <span class="map-mode-icon">${m.icon}</span>${m.label}
           </button>`
        ).join('') +
        `<button class="map-layer-btn" id="mapLayerToggle" title="Toggle satellite imagery">
           <span class="map-mode-icon">🛰</span>Satellite
         </button>`;

        togglesEl.querySelectorAll('.map-mode-btn').forEach(btn =>
          btn.addEventListener('click', () => applyColorMode(btn.dataset.mode)));

        document.getElementById('mapLayerToggle')?.addEventListener('click', () => {
          isSatellite = !isSatellite;
          if (isSatellite) {
            map.removeLayer(streetTile);
            satelliteTile.addTo(map);
          } else {
            map.removeLayer(satelliteTile);
            streetTile.addTo(map);
          }
          document.getElementById('mapLayerToggle')?.classList.toggle('active', isSatellite);
        });
      }

      // ── Hover scrubbing ──────────────────────────────────────────────────
      const statsEl = document.getElementById('mapStatsPanel');
      const hasStreams = streams && (streams.watts || streams.heartrate || streams.cadence
                                     || streams.velocity_smooth || streams.altitude);
      if (!hasStreams || !statsEl) return;

      const timeLen = streams.time?.length || valid.length;

      // Build the panel skeleton once (gauge + metric rows).
      // Do this BEFORE invalidateSize so the panel's full height is established
      // and the map can stretch to match via flexbox.
      statsEl.innerHTML = buildMapStatsHTML(streams, maxSpdKmh, maxHR);
      // Panel content has now set the container's true height — tell Leaflet to
      // re-render tiles/layers at the new size.
      requestAnimationFrame(() => map.invalidateSize());

      // Dedicated pane above overlayPane (z 400) so the dot always paints
      // on top of the colour-gradient polylines, even after colorLayer redraws.
      map.createPane('hoverPane');
      map.getPane('hoverPane').style.zIndex = 450;

      // Circle marker that snaps to the nearest GPS point on hover
      const hoverDot = L.circleMarker(valid[0], {
        pane: 'hoverPane',
        radius: 7, color: '#fff', weight: 2.5,
        fillColor: '#fff', fillOpacity: 0, opacity: 0,
      }).addTo(map);

      map.on('mousemove', (e) => {
        const { lat, lng } = e.latlng;

        // Linear scan — find the nearest GPS point (fast enough at ~6k points)
        let bestIdx = 0, bestDist = Infinity;
        for (let i = 0; i < valid.length; i++) {
          const dlat = valid[i][0] - lat;
          const dlng = valid[i][1] - lng;
          const d    = dlat * dlat + dlng * dlng;
          if (d < bestDist) { bestDist = d; bestIdx = i; }
        }

        // Map GPS index → stream index (proportional, handles slight length differences)
        const si = Math.round(bestIdx * (timeLen - 1) / (valid.length - 1));

        // Dot colour reflects the active colour mode at this exact point
        const dotColor = routePointColor(activeMode, streams, si, maxes);
        hoverDot.setLatLng(valid[bestIdx]);
        hoverDot.setStyle({ fillOpacity: 1, opacity: 1, fillColor: dotColor });
        refreshMapStats(statsEl, streams, si, maxSpdKmh, maxHR);
      });

      map.on('mouseout', () => {
        hoverDot.setStyle({ fillOpacity: 0, opacity: 0 });
        resetMapStats(statsEl);
      });

    } catch(e) { console.error('[Map] Leaflet error:', e); }
  });
}

function renderStreamCharts(streams, activity) {
  const ds = downsampleStreams(streams, 400);

  // Normalise alternate key names
  if (!ds.watts     && ds.power)      ds.watts     = ds.power;
  if (!ds.heartrate && ds.heart_rate) ds.heartrate = ds.heart_rate;

  // Time axis raw values (seconds from start)
  const rawTime = ds.time || [];

  // Ordered stream definitions — altitude drawn first so it sits behind everything
  const STREAM_DEFS = [
    { key: 'altitude',        label: 'Altitude', color: '#9b59ff', unit: 'm',    yAxis: 'yAlt',     borderWidth: 0,   fill: 'origin', alpha: 0.18 },
    { key: 'watts',           label: 'Power',    color: '#00e5a0', unit: 'w',    yAxis: 'yPower',   borderWidth: 1.5, fill: false,    alpha: 0 },
    { key: 'heartrate',       label: 'HR',       color: '#ff6b35', unit: ' bpm', yAxis: 'yHR',      borderWidth: 1.5, fill: false,    alpha: 0 },
    { key: 'cadence',         label: 'Cadence',  color: '#4a9eff', unit: ' rpm', yAxis: 'yCadence', borderWidth: 1.5, fill: false,    alpha: 0 },
    { key: 'velocity_smooth', label: 'Speed',    color: '#f0c429', unit: ' km/h',yAxis: 'ySpeed',   borderWidth: 1.5, fill: false,    alpha: 0 },
  ];

  const datasets = [];
  const presentKeys = [];

  STREAM_DEFS.forEach(def => {
    let data = ds[def.key];
    if (!data || !data.length || !data.some(v => v != null && v > 0)) return;

    // Convert speed m/s → km/h
    if (def.key === 'velocity_smooth') data = data.map(v => v != null ? Math.round(v * 36) / 10 : null);

    presentKeys.push(def.key);
    datasets.push({
      streamKey:       def.key,
      label:           def.label,
      data,
      yAxisID:         def.yAxis,
      borderColor:     def.color,
      backgroundColor: def.alpha > 0 ? def.color + Math.round(def.alpha * 255).toString(16).padStart(2, '0') : 'transparent',
      fill:            def.fill,
      pointRadius:     0,
      pointHoverRadius: 6,
      borderWidth:     def.borderWidth,
      tension:         0.3,
      spanGaps:        true,
      order:           STREAM_DEFS.findIndex(d => d.key === def.key),
    });
  });

  if (!datasets.length) return;

  const refLen = datasets[0].data.length;
  const labels = Array.from({ length: refLen }, (_, i) => {
    const s = rawTime[i] != null ? rawTime[i] : i;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}`
      : `${m}:${String(sec).padStart(2, '0')}`;
  });

  // Y-axis config — power (left) and HR (right) show tick labels; others are hidden but still scale correctly
  const hasPower = presentKeys.includes('watts');
  const hasHR    = presentKeys.includes('heartrate');

  const scales = {
    x: {
      grid:  C_GRID,
      ticks: { ...C_TICK, maxTicksLimit: 8 },
    },
    yPower:   { display: hasPower,  position: 'left',  min: 0,  grid: C_GRID,              ticks: { ...C_TICK, maxTicksLimit: 5, callback: v => v + 'w' } },
    yHR:      { display: hasHR,     position: 'right', min: 30, grid: { display: false },   ticks: { ...C_TICK, maxTicksLimit: 5, callback: v => v + ''  } },
    yCadence: { display: false, min: 0  },
    ySpeed:   { display: false, min: 0  },
    yAlt:     { display: false        },
  };

  // Build subtitle from available metrics
  const subtitleParts = [];
  if (hasPower) {
    const avg = Math.round(activity.average_watts || 0);
    const np  = Math.round(activity.icu_weighted_avg_watts || 0);
    if (avg > 0) subtitleParts.push(`Avg ${avg}w`);
    if (np  > 0) subtitleParts.push(`NP ${np}w`);
  }
  if (hasHR) {
    const avg = Math.round(activity.average_heartrate || 0);
    if (avg > 0) subtitleParts.push(`Avg HR ${avg} bpm`);
  }
  document.getElementById('detailStreamsSubtitle').textContent = subtitleParts.join(' · ');

  // Toggle chips
  const STREAM_META = { watts: '#00e5a0', heartrate: '#ff6b35', cadence: '#4a9eff', velocity_smooth: '#f0c429', altitude: '#9b59ff' };
  const STREAM_LABEL = { watts: 'Power', heartrate: 'HR', cadence: 'Cadence', velocity_smooth: 'Speed', altitude: 'Altitude' };
  const togContainer = document.getElementById('streamToggleChips');
  if (togContainer) {
    togContainer.innerHTML = presentKeys.map(k =>
      `<button class="stream-toggle-btn active" data-metric="${k}" style="--sc:${STREAM_META[k]}" onclick="toggleStreamLayer('${k}')">${STREAM_LABEL[k]}</button>`
    ).join('');
  }

  // Render chart
  if (state.activityStreamsChart) { state.activityStreamsChart.destroy(); state.activityStreamsChart = null; }
  const canvas = document.getElementById('activityStreamsChart');
  if (!canvas) return;

  state.activityStreamsChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...C_TOOLTIP,
          callbacks: {
            title: items => {
              const s = rawTime[items[0].dataIndex];
              if (s == null) return '';
              const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
              return h > 0
                ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
                : `${m}:${String(sec).padStart(2,'0')}`;
            },
            label: ctx => {
              if (ctx.parsed.y == null) return null;
              const units = { watts: 'w', heartrate: ' bpm', cadence: ' rpm', velocity_smooth: ' km/h', altitude: ' m' };
              const v = Math.round(ctx.parsed.y * 10) / 10;
              return ` ${ctx.dataset.label}: ${v}${units[ctx.dataset.streamKey] || ''}`;
            },
          },
        },
      },
      scales,
    },
  });

  // Show the combined card, hide the old separate cards row
  document.getElementById('detailStreamsCard').style.display = '';
  document.getElementById('detailChartsRow').style.display  = 'none';
}

// Toggle a single stream dataset on/off via the chip buttons
function toggleStreamLayer(metric) {
  const chart = state.activityStreamsChart;
  if (!chart) return;
  const dsIdx = chart.data.datasets.findIndex(d => d.streamKey === metric);
  if (dsIdx === -1) return;
  const meta = chart.getDatasetMeta(dsIdx);
  meta.hidden = !meta.hidden;
  chart.update();
  document.querySelectorAll(`.stream-toggle-btn[data-metric="${metric}"]`).forEach(btn => {
    btn.classList.toggle('active', !meta.hidden);
  });
}

// Ordered list of cycling activity types to try when querying power curves.
// dominantRideType() is tried first, then common fallbacks.
const CYCLING_POWER_TYPES = () =>
  [dominantRideType(), 'Ride', 'VirtualRide', 'MountainBikeRide', 'EBikeRide', 'Workout']
    .filter((t, i, a) => a.indexOf(t) === i);

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
async function renderDetailPerformance(a, actId, streams) {
  const card        = document.getElementById('detailPerfCard');
  const gridEl      = document.getElementById('detailPerfGrid');
  if (!card || !gridEl) return;

  // ── Sync metric tiles ─────────────────────────────────────────────
  const np      = a.icu_weighted_avg_watts || a.normalized_power || a.weighted_avg_watts || 0;
  const avgW    = a.average_watts || a.icu_average_watts || 0;
  const avgHR   = a.average_heartrate || a.icu_average_heartrate ||
                  (a.heart_rate && a.heart_rate.average) || 0;
  const rawIF   = a.intensity_factor || a.icu_intensity_factor || 0;
  const ifVal   = rawIF > 1 ? rawIF / 100 : rawIF;
  const vi      = (np > 0 && avgW > 0) ? np / avgW   : null;
  const ef      = (np > 0 && avgHR > 0) ? np / avgHR : null;
  const decouple = (a.icu_aerobic_decoupling != null) ? a.icu_aerobic_decoupling : null;
  const trimp   = a.icu_trimp || a.trimp || 0;
  const rawSpd  = a.max_speed_meters_per_sec || a.icu_max_speed || a.max_speed || 0;
  const maxSpd  = rawSpd > 0 ? rawSpd * 3.6 : null;

  const tile = (val, lbl, sub, color) =>
    `<div class="perf-metric">
       <div class="perf-metric-val" style="color:${color}">${val}</div>
       <div class="perf-metric-lbl">${lbl}</div>
       ${sub ? `<div class="perf-metric-sub">${sub}</div>` : ''}
     </div>`;

  const ifColor = v => v < 0.75 ? '#60a5fa' : v < 0.85 ? '#34d399' : v < 0.95 ? '#fbbf24' : '#f87171';
  const dcColor = v => Math.abs(v) < 5 ? '#34d399' : Math.abs(v) < 8 ? '#fbbf24' : '#f87171';

  const metrics = [];
  if (np > 0)           metrics.push(tile(Math.round(np) + 'w',       'Normalized Power',   'NP',               '#00e5a0'));
  if (ifVal > 0.01)     metrics.push(tile(ifVal.toFixed(2),            'Intensity Factor',   'IF = NP / FTP',    ifColor(ifVal)));
  if (vi !== null)      metrics.push(tile(vi.toFixed(2),               'Variability Index',  'VI = NP / avg W',  vi < 1.05 ? '#34d399' : vi < 1.10 ? '#fbbf24' : '#f87171'));
  if (ef !== null)      metrics.push(tile(ef.toFixed(2),               'Efficiency Factor',  'EF = NP / avg HR', '#818cf8'));
  if (decouple !== null) metrics.push(tile(decouple.toFixed(1) + '%', 'Aerobic Decoupling', 'HR drift vs power', dcColor(decouple)));
  if (trimp > 0)        metrics.push(tile(Math.round(trimp),           'TRIMP',              'Training load score','#fb923c'));
  if (maxSpd !== null)  metrics.push(tile(maxSpd.toFixed(1) + ' km/h','Max Speed',          'Peak speed this ride','#38bdf8'));

  gridEl.innerHTML = metrics.join('');
  document.getElementById('detailPerfSubtitle').textContent = 'Power & efficiency metrics · this ride';

  card.style.display = metrics.length > 0 ? '' : 'none';
}

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

// Fetch athlete-level power curve for a date range + activity type
async function fetchRangePowerCurve(oldest, newest) {
  const types = CYCLING_POWER_TYPES();
  for (const type of types) {
    try {
      const data = await icuFetch(
        `/athlete/${state.athleteId}/power-curves?type=${type}&oldest=${oldest}&newest=${newest}`
      );
      const candidate = Array.isArray(data) ? data[0] : (data?.list?.[0] ?? data);
      // Require at least one non-null watt value — API returns all-null watts when there's no data for this type
      if (candidate && Array.isArray(candidate.secs) && candidate.secs.length > 0 &&
          Array.isArray(candidate.watts) && candidate.watts.some(w => w != null && w > 0)) {
        return candidate;
      }
    } catch (_) { /* try next type */ }
  }
  return null;
}

// Build a power curve object from a raw watts stream using a sliding-window max.
// Returns {secs, watts} at logarithmically-spaced durations.
function buildCurveFromStream(wattsArr) {
  if (!Array.isArray(wattsArr) || wattsArr.length === 0) return null;
  const n = wattsArr.length;
  // Key durations (seconds) — only include those shorter than the ride
  const DURS = [1,2,3,5,8,10,15,20,30,45,60,90,120,180,300,420,600,900,1200,1800,2700,3600,5400,7200];
  const secs = [], watts = [];
  for (const dur of DURS) {
    if (dur > n) break;
    let sum = 0;
    for (let i = 0; i < dur; i++) sum += (wattsArr[i] || 0);
    let best = sum;
    for (let i = dur; i < n; i++) {
      sum += (wattsArr[i] || 0) - (wattsArr[i - dur] || 0);
      if (sum > best) best = sum;
    }
    const peak = Math.round(best / dur);
    if (peak > 0) { secs.push(dur); watts.push(peak); }
  }
  return secs.length ? { secs, watts } : null;
}

async function renderDetailCurve(actId, streams) {
  const card = document.getElementById('detailCurveCard');
  if (!card) return;

  // Fetch current activity curve and 1-year best in parallel
  let raw = null;
  const yearPromise = fetchRangePowerCurve(toDateStr(daysAgo(365)), toDateStr(new Date())).catch(() => null);

  try {
    const rideRaw = await fetchActivityPowerCurve(actId);
    if (rideRaw && Array.isArray(rideRaw.secs) && rideRaw.secs.length) raw = rideRaw;
  } catch (_) {}
  if (!raw && streams) raw = buildCurveFromStream(streams.watts || streams.power);

  const rawYear = await yearPromise;

  if (!raw && !rawYear) { card.style.display = 'none'; return; }
  card.style.display = '';

  // Peak stat pills (from this activity only)
  const peaksEl = document.getElementById('detailCurvePeaks');
  if (peaksEl) {
    if (raw) {
      const lookup = {};
      raw.secs.forEach((s, i) => { if (raw.watts[i]) lookup[s] = raw.watts[i]; });
      const peakW = target => {
        if (lookup[target]) return lookup[target];
        let best = null, minDiff = Infinity;
        raw.secs.forEach(s => { const d = Math.abs(s - target); if (d < minDiff && lookup[s]) { minDiff = d; best = lookup[s]; } });
        return best;
      };
      peaksEl.innerHTML = CURVE_PEAKS.map(p => {
        const w = Math.round(peakW(p.secs) || 0);
        if (!w) return '';
        return `<div class="curve-peak">
          <div class="curve-peak-val">${w}<span class="curve-peak-unit">w</span></div>
          <div class="curve-peak-dur">${p.label}</div>
        </div>`;
      }).join('');
    } else {
      peaksEl.innerHTML = '';
    }
  }

  // Legend
  const legendEl = document.getElementById('detailCurveLegend');
  if (legendEl) {
    const items = [
      raw     && { label: 'This ride', color: '#00e5a0' },
      rawYear && { label: '1 year',    color: '#fb923c' },
    ].filter(Boolean);
    legendEl.innerHTML = items.map(l =>
      `<div class="curve-legend-item">
         <div class="curve-legend-dot" style="background:${l.color}"></div>
         ${l.label}
       </div>`
    ).join('');
  }

  const toPoints = c => c
    ? c.secs.map((s, i) => ({ x: s, y: c.watts[i] })).filter(pt => pt.y > 0)
    : [];

  const rideData = toPoints(raw);
  const yearData = toPoints(rawYear);
  // Use the ride's last duration as x-axis max so both lines reach the right edge
  const rideMaxX = rideData.length ? rideData[rideData.length - 1].x : 0;
  const yearMaxX = yearData.length ? yearData[yearData.length - 1].x : 0;
  const maxSecs  = rideMaxX || yearMaxX || 3600;

  const datasets = [];
  if (yearData.length)
    datasets.push({
      label: '1 year', data: yearData,
      borderColor: '#fb923c', backgroundColor: 'rgba(251,146,60,0.04)',
      borderWidth: 1.5, borderDash: [4, 3], fill: false,
      tension: 0.4, pointRadius: 0, pointHoverRadius: 6,
    });
  if (rideData.length)
    datasets.push({
      label: 'This ride', data: rideData,
      borderColor: '#00e5a0', backgroundColor: 'rgba(0,229,160,0.08)',
      borderWidth: 2.5, fill: true,
      tension: 0.4, pointRadius: 0, pointHoverRadius: 7,
    });

  if (state.activityCurveChart) { state.activityCurveChart.destroy(); state.activityCurveChart = null; }
  state.activityCurveChart = new Chart(
    document.getElementById('activityCurveChart').getContext('2d'), {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: { ...C_TOOLTIP, callbacks: {
            title: items => fmtSecsShort(items[0].parsed.x),
            label: ctx   => `${ctx.dataset.label}: ${Math.round(ctx.parsed.y)}w`,
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

// Build an HR curve {secs, heartrate} from a raw heartrate stream using sliding-window max.
function buildHRCurveFromStream(hrArr) {
  if (!Array.isArray(hrArr) || hrArr.length === 0) return null;
  const cleaned = hrArr.map(v => (v > 0 ? v : null)); // treat 0 as no data
  const n = cleaned.length;
  const DURS = [1,2,3,5,8,10,15,20,30,45,60,90,120,180,300,420,600,900,1200,1800,2700,3600,5400,7200];
  const secs = [], heartrate = [];
  for (const dur of DURS) {
    if (dur > n) break;
    // collect valid windows of exactly `dur` non-null samples
    let best = 0;
    for (let i = 0; i <= n - dur; i++) {
      let sum = 0, valid = true;
      for (let j = i; j < i + dur; j++) { if (cleaned[j] == null) { valid = false; break; } sum += cleaned[j]; }
      if (valid) { const avg = sum / dur; if (avg > best) best = avg; }
    }
    const peak = Math.round(best);
    if (peak > 0) { secs.push(dur); heartrate.push(peak); }
  }
  return secs.length ? { secs, heartrate } : null;
}

// Fetch athlete-level HR curve for a date range
async function fetchRangeHRCurve(oldest, newest) {
  try {
    const data = await icuFetch(
      `/athlete/${state.athleteId}/hr-curves?oldest=${oldest}&newest=${newest}`
    );
    const candidate = Array.isArray(data) ? data[0] : (data?.list?.[0] ?? data);
    if (candidate && Array.isArray(candidate.secs) && candidate.secs.length > 0 &&
        Array.isArray(candidate.heartrate) && candidate.heartrate.some(h => h != null && h > 0)) {
      return candidate;
    }
  } catch (_) {}
  return null;
}

const HR_CURVE_PEAKS = [
  { secs: 1,    label: '1s'    },
  { secs: 60,   label: '1 min' },
  { secs: 300,  label: '5 min' },
  { secs: 1200, label: '20 min'},
  { secs: 3600, label: '1 hr'  },
];

async function renderDetailHRCurve(streams) {
  const card = document.getElementById('detailHRCurveCard');
  if (!card) return;

  const hrStream = streams && (streams.heartrate || streams.heart_rate);
  let raw = null;
  if (Array.isArray(hrStream) && hrStream.length > 0)
    raw = buildHRCurveFromStream(hrStream);

  const yearPromise = fetchRangeHRCurve(toDateStr(daysAgo(365)), toDateStr(new Date())).catch(() => null);
  const rawYear = await yearPromise;

  if (!raw && !rawYear) { card.style.display = 'none'; return; }
  card.style.display = '';

  // Peak pills
  const peaksEl = document.getElementById('detailHRCurvePeaks');
  if (peaksEl) {
    if (raw) {
      const lookup = {};
      raw.secs.forEach((s, i) => { if (raw.heartrate[i]) lookup[s] = raw.heartrate[i]; });
      const peakHR = target => {
        if (lookup[target]) return lookup[target];
        let best = null, minDiff = Infinity;
        raw.secs.forEach(s => { const d = Math.abs(s - target); if (d < minDiff && lookup[s]) { minDiff = d; best = lookup[s]; } });
        return best;
      };
      peaksEl.innerHTML = HR_CURVE_PEAKS.map(p => {
        const bpm = Math.round(peakHR(p.secs) || 0);
        if (!bpm) return '';
        return `<div class="curve-peak">
          <div class="curve-peak-val">${bpm}<span class="curve-peak-unit">bpm</span></div>
          <div class="curve-peak-dur">${p.label}</div>
        </div>`;
      }).join('');
    } else {
      peaksEl.innerHTML = '';
    }
  }

  // Legend
  const legendEl = document.getElementById('detailHRCurveLegend');
  if (legendEl) {
    const items = [
      raw     && { label: 'This ride', color: '#f87171' },
      rawYear && { label: '1 year',    color: '#fb923c' },
    ].filter(Boolean);
    legendEl.innerHTML = items.map(l =>
      `<div class="curve-legend-item">
         <div class="curve-legend-dot" style="background:${l.color}"></div>
         ${l.label}
       </div>`
    ).join('');
  }

  const toPoints = c => c
    ? c.secs.map((s, i) => ({ x: s, y: c.heartrate[i] })).filter(pt => pt.y > 0)
    : [];

  const rideData = toPoints(raw);
  const yearData = toPoints(rawYear);
  const maxSecs  = [...rideData, ...yearData].reduce((m, pt) => Math.max(m, pt.x), 0) || 3600;

  const datasets = [];
  if (yearData.length)
    datasets.push({
      label: '1 year', data: yearData,
      borderColor: '#fb923c', backgroundColor: 'rgba(251,146,60,0.04)',
      borderWidth: 1.5, borderDash: [4, 3], fill: false,
      tension: 0.4, pointRadius: 0, pointHoverRadius: 6,
    });
  if (rideData.length)
    datasets.push({
      label: 'This ride', data: rideData,
      borderColor: '#f87171', backgroundColor: 'rgba(248,113,113,0.08)',
      borderWidth: 2.5, fill: true,
      tension: 0.4, pointRadius: 0, pointHoverRadius: 7,
    });

  if (state.activityHRCurveChart) { state.activityHRCurveChart.destroy(); state.activityHRCurveChart = null; }
  state.activityHRCurveChart = new Chart(
    document.getElementById('activityHRCurveChart').getContext('2d'), {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: { ...C_TOOLTIP, callbacks: {
            title: items => fmtSecsShort(items[0].parsed.x),
            label: ctx   => `${ctx.dataset.label}: ${Math.round(ctx.parsed.y)} bpm`,
          }}
        },
        scales: {
          x: {
            type: 'logarithmic', min: 1, max: maxSecs,
            grid: C_GRID,
            ticks: { ...C_TICK, autoSkip: false, maxRotation: 0, callback: val => CURVE_TICK_MAP[val] ?? null }
          },
          y: { grid: C_GRID, ticks: { ...C_TICK, callback: v => v + ' bpm' } }
        }
      }
    }
  );
}

function streamChartConfig(labels, data, color, fill, unit) {
  return {
    type: 'line',
    data: { labels, datasets: [{ data, borderColor: color, backgroundColor: fill, borderWidth: 2, pointRadius: 0, pointHoverRadius: 7, tension: 0.4, fill: true, spanGaps: true }] },
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
    loadFitnessCache(); // restore CTL/ATL/TSB, wellness history & athlete profile
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
