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
  calMonth: null,
  currentPage: 'dashboard',
  previousPage: null,
  synced: false,
  activitiesSort: 'date',
  activitiesSortDir: 'desc'
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
async function fetchActivities(daysBack = 365, since = null) {
  const newest = toDateStr(new Date());
  const oldest = since ? toDateStr(since) : toDateStr(daysAgo(daysBack));
  let all = [];
  let page = 0;
  const pageSize = 200;
  while (true) {
    const data = await icuFetch(
      `/athlete/${state.athleteId}/activities?oldest=${oldest}&newest=${newest}&limit=${pageSize}&offset=${page * pageSize}`
    );
    const chunk = Array.isArray(data) ? data : (data.activities || []);
    all = all.concat(chunk);
    if (chunk.length < pageSize) break;
    page++;
    if (page > 20) break;
  }

  if (since) {
    // Incremental: merge fresh activities into existing cache
    // New fetch supersedes any existing entry with the same id
    const freshIds = new Set(all.map(a => a.id));
    const cutoff   = daysAgo(365); // drop anything older than 365 days from cache
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

      // Fetch only activities since last sync minus 1-day buffer
      const since = new Date(cache.lastSync);
      since.setDate(since.getDate() - 1);
      setLoading(true, 'Checking for new activities…');
      await fetchActivities(365, since);
    } else {
      setLoading(true, 'Loading activities — first sync may take a moment…');
      await fetchActivities(365);
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
    const aName = state.athlete.name || state.athlete.firstname || 'Athlete';
    dot.className  = 'connection-dot connected';
    name.textContent = aName;
    sub.textContent  = state.athlete.city || 'intervals.icu';
    av.textContent   = aName[0].toUpperCase();
    lbl.textContent  = 'Reconnect';
    badge.className  = 'connection-status-badge connected';
    btext.textContent = 'Connected';
    sid.textContent  = state.athleteId || '—';
    skey.textContent = state.apiKey ? '••••••••' + state.apiKey.slice(-4) : '—';
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
    settings:   ['Settings', 'Account & connection']
  };
  const [title, sub] = info[page] || ['CycleIQ', ''];
  document.getElementById('pageTitle').textContent    = title;
  document.getElementById('pageSubtitle').textContent = sub;
  document.getElementById('dateRangePill').style.display =
    (page === 'dashboard' || page === 'activities') ? 'flex' : 'none';

  // Calendar fills full viewport height — toggle padding-less mode on the scroll container
  const pc = document.getElementById('pageContent');
  if (pc) pc.classList.toggle('page-content--calendar', page === 'calendar');

  if (page === 'calendar') renderCalendar();
  if (page === 'fitness')  renderFitnessPage();
}

/* ====================================================
   DATE RANGE
==================================================== */
function setRange(days) {
  state.rangeDays = days;
  localStorage.setItem('icu_range_days', days);
  document.querySelectorAll('#dateRangePill button').forEach(b => b.classList.remove('active'));
  document.getElementById('range' + days).classList.add('active');
  document.getElementById('pageSubtitle').textContent = `Overview · Last ${days} days`;
  if (state.synced) renderDashboard();
}

/* ====================================================
   ACTIVITIES SORT
==================================================== */
const SORT_FIELDS = {
  date:      a => new Date(a.start_date_local || a.start_date).getTime(),
  distance:  a => a.distance || 0,
  time:      a => a.moving_time || a.elapsed_time || 0,
  elevation: a => a.total_elevation_gain || 0,
  power:     a => a.icu_weighted_avg_watts || a.average_watts || 0,
  bpm:       a => a.average_heartrate || 0,
};

function sortedAllActivities() {
  const pool = state.activities.filter(a => !isEmptyActivity(a));
  const fn   = SORT_FIELDS[state.activitiesSort] || SORT_FIELDS.date;
  const dir  = state.activitiesSortDir === 'asc' ? 1 : -1;
  return [...pool].sort((a, b) => dir * (fn(a) - fn(b)));
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
  document.getElementById('allActivitiesSubtitle').textContent =
    `${sorted.length} activities`;
  renderActivityList('allActivityList', sorted);
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

  let tss = 0, dist = 0, time = 0, elev = 0, power = 0, powerN = 0;
  recent.forEach(a => {
    tss  += (a.icu_training_load || a.tss || 0);
    dist += (a.distance || 0) / 1000;
    time += (a.moving_time || a.elapsed_time || 0) / 3600;
    elev += (a.total_elevation_gain || 0);
    const w = a.icu_weighted_avg_watts || a.average_watts || 0;
    if (w > 0) { power += w; powerN++; }
  });

  document.getElementById('statTSS').innerHTML   = `${Math.round(tss)}<span class="unit"> tss</span>`;
  document.getElementById('statDist').innerHTML  = `${dist.toFixed(0)}<span class="unit"> km</span>`;
  document.getElementById('statTime').innerHTML  = `${time.toFixed(1)}<span class="unit"> h</span>`;
  document.getElementById('statElev').innerHTML  = `${Math.round(elev).toLocaleString()}<span class="unit"> m</span>`;
  document.getElementById('statCount').textContent = recent.length;
  document.getElementById('statPower').innerHTML = powerN
    ? `${Math.round(power / powerN)}<span class="unit"> w</span>`
    : `—<span class="unit"> w</span>`;

  document.getElementById('statTSSDelta').textContent   = `${recent.length} rides in ${days}d`;
  document.getElementById('statDistDelta').textContent  = 'total distance';
  document.getElementById('statTimeDelta').textContent  = 'total riding time';
  document.getElementById('statElevDelta').textContent  = 'total climbing';
  document.getElementById('statCountDelta').textContent = `in last ${days} days`;
  document.getElementById('statPowerDelta').textContent = powerN
    ? `avg from ${powerN} power rides`
    : 'no power data';

  document.getElementById('activitiesSubtitle').textContent    = `Last ${days} days · ${recent.length} activities`;
  document.getElementById('allActivitiesSubtitle').textContent = `${state.activities.filter(a => !isEmptyActivity(a)).length} total`;

  // Fitness gauges — tsb can be null from API, fall back to ctl - atl
  if (state.fitness) {
    const ctl = state.fitness.ctl ?? 0;
    const atl = state.fitness.atl ?? 0;
    const tsb = state.fitness.tsb != null ? state.fitness.tsb : (ctl - atl);
    document.getElementById('gaugeCTL').textContent = Math.round(ctl);
    document.getElementById('gaugeATL').textContent = Math.round(atl);
    document.getElementById('gaugeTSB').textContent = (tsb >= 0 ? '+' : '') + Math.round(tsb);
    document.getElementById('barCTL').style.width = Math.min(100, ctl / 1.5) + '%';
    document.getElementById('barATL').style.width = Math.min(100, atl / 1.5) + '%';
    document.getElementById('barTSB').style.width = Math.min(100, Math.abs(tsb) * 2) + '%';
    document.getElementById('barTSB').style.background  = tsb >= 0 ? 'var(--accent)' : 'var(--red)';
    document.getElementById('gaugeTSB').style.color     = tsb >= 0 ? 'var(--accent)' : 'var(--red)';
  }

  renderActivityList('activityList', recent.slice(0, 10));
  renderAllActivitiesList();
  updateSortButtons();
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
  ['gaugeCTL', 'gaugeATL', 'gaugeTSB'].forEach(id => {
    document.getElementById(id).textContent = '—';
  });
  document.getElementById('activityList').innerHTML = `
    <div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
      <p>Connect your account to see activities.</p>
      <button class="btn btn-primary" onclick="openModal()">Connect intervals.icu</button>
    </div>`;
  if (state.avgPowerChart)   { state.avgPowerChart.destroy();   state.avgPowerChart   = null; }
  if (state.powerCurveChart) { state.powerCurveChart.destroy(); state.powerCurveChart = null; }
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

function activityTypeClass(a) {
  const t = (a.sport_type || a.type || '').toLowerCase();
  if (t.includes('run'))  return 'run';
  if (t.includes('swim')) return 'swim';
  return '';
}

function activityTypeIcon(a) {
  const t = (a.sport_type || a.type || '').toLowerCase();
  if (t.includes('run'))  return sportIcon.run;
  if (t.includes('swim')) return sportIcon.swim;
  return sportIcon.ride;
}

function activityFallbackName(a) {
  const t = (a.sport_type || a.type || '').toLowerCase();
  if (t.includes('virtualride') || t.includes('virtual_ride')) return 'Virtual Ride';
  if (t.includes('ride'))    return 'Ride';
  if (t.includes('run'))     return 'Run';
  if (t.includes('swim'))    return 'Swim';
  if (t.includes('walk'))    return 'Walk';
  if (t.includes('hike'))    return 'Hike';
  if (t.includes('weight'))  return 'Strength';
  if (t.includes('yoga'))    return 'Yoga';
  if (t.includes('workout')) return 'Workout';
  return a.sport_type || a.type || 'Activity';
}

function isEmptyActivity(a) {
  const dist = a.distance || 0;
  const time = a.moving_time || a.elapsed_time || 0;
  const tss  = a.icu_training_load || a.tss || 0;
  return dist === 0 && time === 0 && tss === 0;
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

    const distKm  = (a.distance || 0) / 1000;
    const secs    = a.moving_time || a.elapsed_time || 0;
    const elev    = Math.round(a.total_elevation_gain || 0);
    const speedMs = a.average_speed || (secs > 0 && a.distance ? a.distance / secs : 0);
    const speedKmh = speedMs * 3.6;
    const pwr     = a.icu_weighted_avg_watts || a.average_watts || 0;
    const hr      = Math.round(a.average_heartrate || 0);
    const tss     = Math.round(a.icu_training_load || a.tss || 0);
    const date    = fmtDate(a.start_date_local || a.start_date);
    const tc      = activityTypeClass(a);  // 'run' | 'swim' | ''

    // Determine virtual ride class for stripe colour
    const sportRaw = (a.sport_type || a.type || '').toLowerCase();
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

  // Seed fallback EMA from oldest available wellness entry
  let ctlFallback = 30, atlFallback = 30;
  const welKeys = Object.keys(wellness).sort();
  if (welKeys.length > 0) {
    const oldest = wellness[welKeys[0]];
    if (oldest.ctl != null) { ctlFallback = oldest.ctl; atlFallback = oldest.atl; }
  }

  const labels = [], ctlD = [], atlD = [], tsbD = [];
  let ctl = ctlFallback, atl = atlFallback;

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
      { label: 'TSB', data: tsbD, borderColor: '#4a9eff', backgroundColor: 'rgba(74,158,255,0.05)', borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 4, tension: 0.4, borderDash: [4, 3] }
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
  const ctx = document.getElementById('weeklyTssChart').getContext('2d');
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
const ZONE_NAMES = ['Recovery', 'Endurance', 'Tempo', 'Threshold', 'VO₂max', 'Anaerobic'];
const ZONE_TAGS  = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6'];

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

  renderFitnessHistoryChart(state.fitnessRangeDays);
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

  let ctlSeed = 30, atlSeed = 30;
  const welKeys = Object.keys(wellness).sort();
  if (welKeys.length > 0) {
    const oldest = wellness[welKeys[0]];
    if (oldest.ctl != null) { ctlSeed = oldest.ctl; atlSeed = oldest.atl; }
  }

  const labels = [], ctlD = [], atlD = [], tsbD = [];
  let ctl = ctlSeed, atl = atlSeed;

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
      { label: 'TSB', data: tsbD, borderColor: '#4a9eff', backgroundColor: 'rgba(74,158,255,0.05)', borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 4, tension: 0.4, borderDash: [4, 3] }
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
    months[key].dist += (a.distance || 0) / 1000;
    months[key].time += (a.moving_time || a.elapsed_time || 0) / 3600;
    months[key].tss  += (a.icu_training_load || a.tss || 0);
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
function toDateStr(d) { return d.toISOString().slice(0, 10); }
function daysAgo(n)   { const d = new Date(); d.setDate(d.getDate() - n); return d; }

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

function calEventClass(a) {
  const t = (a.sport_type || a.type || '').toLowerCase();
  if (t.includes('virtualride') || t.includes('virtual')) return 'cal-event--virtual';
  if (t.includes('run'))  return 'cal-event--run';
  if (t.includes('swim')) return 'cal-event--swim';
  if (t.includes('ride')) return 'cal-event--ride';
  return 'cal-event--other';
}

function renderCalendar() {
  const m    = getCalMonth();
  const year = m.getFullYear();
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

  const firstDay  = new Date(year, month, 1);
  const lastDay   = new Date(year, month + 1, 0);
  const todayStr  = toDateStr(new Date());

  // Monday-first: convert JS Sunday=0 to Mon=0…Sun=6
  const startDow = (firstDay.getDay() + 6) % 7;
  const endDow   = (lastDay.getDay() + 6) % 7;

  const cells = [];

  // Leading days from previous month
  for (let i = startDow - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, month, -i), thisMonth: false });
  }
  // Days in this month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    cells.push({ date: new Date(year, month, d), thisMonth: true });
  }
  // Trailing days to complete last row
  const rem = cells.length % 7;
  if (rem > 0) {
    for (let i = 1; i <= 7 - rem; i++) {
      cells.push({ date: new Date(year, month + 1, i), thisMonth: false });
    }
  }

  const grid = document.getElementById('calGrid');
  grid.innerHTML = cells.map(({ date, thisMonth }) => {
    const dateStr = toDateStr(date);
    const acts    = actMap[dateStr] || [];
    const isToday = dateStr === todayStr;
    const dow     = date.getDay(); // 0=Sun, 6=Sat
    const isWeekend = dow === 0 || dow === 6;

    const cls = [
      'cal-day',
      !thisMonth   ? 'cal-day--other-month' : '',
      isToday      ? 'cal-day--today'       : '',
      isWeekend    ? 'cal-day--weekend'     : '',
    ].filter(Boolean).join(' ');

    const maxShow = 3;
    const shown   = acts.slice(0, maxShow);
    const extra   = acts.length - maxShow;

    const eventsHtml = shown.map(({ a, stateIdx }) => {
      const name  = (a.name && a.name.trim()) ? a.name.trim() : activityFallbackName(a);
      const dist  = (a.distance || 0) / 1000;
      const secs  = a.moving_time || a.elapsed_time || 0;
      const meta  = dist > 0.1 ? dist.toFixed(1) + ' km'
                  : secs > 0   ? fmtDur(secs)
                  : '';
      const tc = calEventClass(a);
      return `<div class="cal-event ${tc}" onclick="navigateToActivity(${stateIdx})">
        <div class="cal-event-name">${name}</div>
        ${meta ? `<div class="cal-event-meta">${meta}</div>` : ''}
      </div>`;
    }).join('');

    const moreHtml = extra > 0
      ? `<div class="cal-more">+${extra} more</div>`
      : '';

    return `<div class="${cls}">
      <div class="cal-day-num">${date.getDate()}</div>
      ${eventsHtml}${moreHtml}
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
  document.getElementById('dateRangePill').style.display = 'none';

  // Scroll back to top and remove calendar's full-bleed layout so normal padding is restored
  const pageContent = document.getElementById('pageContent');
  if (pageContent) {
    pageContent.scrollTop = 0;
    pageContent.classList.remove('page-content--calendar');
  }

  // Back button label
  const fromLabel = state.previousPage === 'dashboard' ? 'Dashboard' : 'Activities';
  document.getElementById('detailBackLabel').textContent = fromLabel;

  // Update topbar
  const aName = (activity.name && activity.name.trim()) ? activity.name.trim() : activityFallbackName(activity);
  document.getElementById('pageTitle').textContent    = aName;
  document.getElementById('pageSubtitle').textContent = fmtDate(activity.start_date_local || activity.start_date);

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

    // Stream charts only when data actually came back
    if (streams) {
      const norm = normalizeStreams(streams);
      renderStreamCharts(norm, richActivity);
    }

    // Supplementary cards — each shows/hides itself based on data availability
    renderDetailZones(richActivity);
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
  ['detailZonesCard', 'detailHistogramCard', 'detailCurveCard'].forEach(id => {
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
  // First attempt: standard path with explicit stream types
  try {
    return await icuFetch(
      `/athlete/${state.athleteId}/activities/${activityId}/streams?streams=${types}`
    );
  } catch (e1) {
    // Second attempt: strip the 'i' prefix — some paths need a plain numeric ID
    const numId = String(activityId).replace(/^i/, '');
    if (numId !== String(activityId)) {
      try {
        return await icuFetch(
          `/athlete/${state.athleteId}/activities/${numId}/streams?streams=${types}`
        );
      } catch (e2) { /* fall through */ }
    }
    throw e1;
  }
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
  // ── Hero ──────────────────────────────────────────────────────────────────
  const aName = (a.name && a.name.trim()) ? a.name.trim() : activityFallbackName(a);
  document.getElementById('detailName').textContent = aName;

  const dateStr = fmtDate(a.start_date_local || a.start_date);
  const timeStr = fmtTime(a.start_date_local || a.start_date);
  document.getElementById('detailDate').textContent = dateStr + (timeStr ? ' · ' + timeStr : '');
  document.getElementById('detailType').textContent = a.sport_type || a.type || '';

  const iconEl = document.getElementById('detailIcon');
  iconEl.className = 'activity-type-icon lg ' + activityTypeClass(a);
  iconEl.innerHTML = activityTypeIcon(a);

  const tss   = Math.round(a.icu_training_load || a.tss || 0);
  const tssEl = document.getElementById('detailTSSBadge');
  tssEl.textContent   = tss > 0 ? `${tss} TSS` : '';
  tssEl.style.display = tss > 0 ? 'flex' : 'none';

  // ── Metrics strip ─────────────────────────────────────────────────────────
  const distKm   = (a.distance || 0) / 1000;
  const secs     = a.moving_time || a.elapsed_time || a.moving_time_seconds || a.elapsed_time_seconds || 0;
  const speedMs  = a.average_speed || a.average_speed_meters_per_sec ||
                   (secs > 0 && a.distance ? a.distance / secs : 0);
  const speedKmh = speedMs * 3.6;
  const avgW     = a.average_watts || 0;
  const np       = a.icu_weighted_avg_watts || 0;
  const maxW     = a.max_watts || 0;
  const ifVal    = a.intensity_factor || 0;
  const avgHR    = a.average_heartrate || (a.heart_rate && a.heart_rate.average) || 0;
  const maxHR    = a.max_heartrate || (a.heart_rate && a.heart_rate.max) || 0;
  const avgCad   = a.average_cadence || (a.cadence && a.cadence.average) || 0;
  const cals     = a.calories || (a.other && a.other.calories) || 0;
  const elev     = Math.round(a.total_elevation_gain || 0);

  // chip(value, label, accent?)
  const chip = (v, lbl, accent = false) =>
    `<div class="mc${accent ? ' mc--accent' : ''}"><div class="mc-val">${v}</div><div class="mc-lbl">${lbl}</div></div>`;

  let html = '';
  if (distKm > 0.05)  html += chip(distKm.toFixed(1), 'km');
  if (secs > 0)        html += chip(fmtDur(secs), 'time');
  if (elev > 0)        html += chip(elev.toLocaleString(), 'm elev');
  if (speedKmh > 0.5)  html += chip(speedKmh.toFixed(1), 'km/h');
  if (avgW > 0)        html += chip(Math.round(avgW) + 'w', 'avg power', true);
  if (np > 0)          html += chip(Math.round(np) + 'w', 'norm power', true);
  if (maxW > 0)        html += chip(Math.round(maxW) + 'w', 'max power');
  if (ifVal > 0)       html += chip(ifVal.toFixed(2), 'int. factor');
  if (avgHR > 0)       html += chip(Math.round(avgHR), 'avg bpm');
  if (maxHR > 0)       html += chip(Math.round(maxHR), 'max bpm');
  if (avgCad > 0)      html += chip(Math.round(avgCad), 'rpm');
  if (cals > 0)        html += chip(Math.round(cals).toLocaleString(), 'kcal');
  if (tss > 0)         html += chip(tss, 'TSS', true);

  document.getElementById('detailMetrics').innerHTML = html;
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
    if (secs === 0) return '';
    const pct   = (secs / totalSecs * 100).toFixed(1);
    const color = ZONE_HEX[i];
    return `<div class="detail-zone-row">
      <span class="detail-zone-tag" style="color:${color}">${ZONE_TAGS[i]}</span>
      <span class="detail-zone-name">${ZONE_NAMES[i]}</span>
      <div class="detail-zone-bar-track">
        <div class="detail-zone-bar-fill" style="width:${pct}%;background:${color}"></div>
      </div>
      <span class="detail-zone-time">${fmtDur(secs)}</span>
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
  try {
    return await icuFetch(`/athlete/${state.athleteId}/activities/${activityId}/power-curve`);
  } catch (e1) {
    const numId = String(activityId).replace(/^i/, '');
    if (numId !== String(activityId)) {
      return await icuFetch(`/athlete/${state.athleteId}/activities/${numId}/power-curve`);
    }
    throw e1;
  }
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
if ([7, 30, 90, 365].includes(savedRange)) {
  state.rangeDays = savedRange;
  document.querySelectorAll('#dateRangePill button').forEach(b => b.classList.remove('active'));
  document.getElementById('range' + savedRange).classList.add('active');
}

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
  syncData();
} else {
  openModal();
}

// Close modal on backdrop click (only when already connected)
document.getElementById('connectModal').addEventListener('click', function(e) {
  if (e.target === this && (state.athleteId && state.apiKey)) closeModal();
});
