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
  activityPowerChart: null,
  activityHRChart: null,
  calMonth: null,
  currentPage: 'dashboard',
  previousPage: null,
  synced: false
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

async function fetchActivities(daysBack = 365) {
  const newest = toDateStr(new Date());
  const oldest = toDateStr(daysAgo(daysBack));
  // No ?fields= restriction — fetch all fields so `id` and all metrics are always present
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
    if (page > 20) break; // safety cap at 4000 activities
  }
  state.activities = all;
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
  setLoading(true, 'Loading activities…');

  try {
    if (!state.athlete) await fetchAthleteProfile();

    setLoading(true, 'Loading activities (this may take a moment)…');
    await fetchActivities(365);

    setLoading(true, 'Loading fitness data…');
    await fetchFitness().catch(() => null); // non-fatal

    state.synced = true;
    updateConnectionUI(true);
    renderDashboard();
    if (state.currentPage === 'calendar') renderCalendar();
    const validCount = state.activities.filter(a => !isEmptyActivity(a)).length;
    showToast(`Synced ${validCount} activities`, 'success');
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

  renderActivityList('activityList',    recent.slice(0, 10));
  renderActivityList('allActivityList', state.activities.filter(a => !isEmptyActivity(a)));
  renderFitnessChart(recent, days);
  renderWeeklyChart(recent);
  renderAvgPowerChart(recent);
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
  if (state.avgPowerChart) { state.avgPowerChart.destroy(); state.avgPowerChart = null; }
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
    const statPill = (val, lbl) =>
      `<div class="act-stat"><div class="act-stat-val">${val}</div><div class="act-stat-lbl">${lbl}</div></div>`;

    const stats = [];
    if (distKm > 0.05) stats.push(statPill(distKm.toFixed(2), 'km'));
    if (secs > 0)       stats.push(statPill(fmtDur(secs), 'time'));
    if (elev > 0)       stats.push(statPill(elev.toLocaleString(), 'm elev'));
    if (pwr > 0)        stats.push(statPill(Math.round(pwr) + 'w', 'power'));
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
      { label: 'CTL', data: ctlD, borderColor: '#00e5a0', backgroundColor: 'rgba(0,229,160,0.07)', borderWidth: 2, pointRadius: 0, tension: 0.4, fill: true },
      { label: 'ATL', data: atlD, borderColor: '#ff6b35', backgroundColor: 'rgba(255,107,53,0.05)', borderWidth: 2, pointRadius: 0, tension: 0.4 },
      { label: 'TSB', data: tsbD, borderColor: '#4a9eff', backgroundColor: 'rgba(74,158,255,0.05)', borderWidth: 1.5, pointRadius: 0, tension: 0.4, borderDash: [4, 3] }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e2330', borderColor: '#252b3a', borderWidth: 1,
          titleColor: '#8891a8', bodyColor: '#eef0f8', padding: 10,
          boxWidth: 8, boxHeight: 8,
          callbacks: {
            labelColor: ctx => ({
              backgroundColor: ctx.dataset.borderColor,
              borderColor:     ctx.dataset.borderColor,
              borderWidth: 0,
              borderRadius: 4
            })
          }
        }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#525d72', maxTicksLimit: 8, font: { size: 11 } } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#525d72', font: { size: 11 } } }
      }
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
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${c.raw} TSS` } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#525d72', font: { size: 10 } } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#525d72', font: { size: 10 }, maxTicksLimit: 4 } }
      }
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
          borderRadius: 3,
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
        tooltip: {
          backgroundColor: '#1e2330', borderColor: '#252b3a', borderWidth: 1,
          titleColor: '#8891a8', bodyColor: '#eef0f8', padding: 10,
          callbacks: { label: c => `${c.dataset.label}: ${c.raw}w` }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#525d72', font: { size: 10 }, maxTicksLimit: 10,
            maxRotation: 0, autoSkip: true }
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#525d72', font: { size: 11 }, callback: v => v + 'w' }
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
      tooltip: {
        backgroundColor: '#1e2330', borderColor: '#252b3a', borderWidth: 1,
        titleColor: '#8891a8', bodyColor: '#eef0f8', padding: 10,
        callbacks: {
          labelColor: c => ({ backgroundColor: c.dataset.borderColor, borderColor: c.dataset.borderColor, borderWidth: 0, borderRadius: 3 })
        }
      }
    },
    scales: {
      x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#525d72', maxTicksLimit: 10, font: { size: 11 } } },
      y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#525d72', font: { size: 11 } } }
    }
  };

  state.fitnessPageChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels, datasets: [
      { label: 'CTL', data: ctlD, borderColor: '#00e5a0', backgroundColor: 'rgba(0,229,160,0.08)', borderWidth: 2.5, pointRadius: 0, tension: 0.4, fill: true },
      { label: 'ATL', data: atlD, borderColor: '#ff6b35', backgroundColor: 'rgba(255,107,53,0.05)', borderWidth: 2,   pointRadius: 0, tension: 0.4 },
      { label: 'TSB', data: tsbD, borderColor: '#4a9eff', backgroundColor: 'rgba(74,158,255,0.05)', borderWidth: 1.5, pointRadius: 0, tension: 0.4, borderDash: [4, 3] }
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
        tooltip: { callbacks: { label: c => `${c.raw} TSS` } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#525d72', font: { size: 10 }, maxRotation: 0 } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#525d72', font: { size: 10 }, maxTicksLimit: 5 } }
      }
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
async function navigateToActivity(actKey) {
  // Resolve activity via lookup map (set when the list was rendered)
  let activity = window._actLookup && window._actLookup[actKey];
  // Fallback: numeric index in state.activities (legacy)
  if (!activity) {
    const numIdx = Number(actKey);
    if (!isNaN(numIdx) && numIdx >= 0 && numIdx < state.activities.length) {
      activity = state.activities[numIdx];
    }
  }
  if (!activity) { showToast('Activity data not found', 'error'); return; }

  state.previousPage = state.currentPage;
  state.currentPage  = 'activity';

  // Show the activity page
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-activity').classList.add('active');
  document.getElementById('dateRangePill').style.display = 'none';

  // Scroll back to top
  const pageContent = document.getElementById('pageContent');
  if (pageContent) pageContent.scrollTop = 0;

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

    if (streams) {
      renderStreamCharts(normalizeStreams(streams), fullDetail ? { ...activity, ...fullDetail } : activity);
    }
  } catch (err) {
    console.error('Activity detail error:', err);
    document.getElementById('detailChartsLoading').style.display = 'none';
  }
}

function navigateBack() {
  navigate(state.previousPage || 'activities');
}

function destroyActivityCharts() {
  if (state.activityPowerChart) { state.activityPowerChart.destroy(); state.activityPowerChart = null; }
  if (state.activityHRChart)    { state.activityHRChart.destroy();    state.activityHRChart    = null; }
}

/* ====================================================
   ACTIVITY DETAIL — DATA FETCHING
==================================================== */
async function fetchActivityDetail(activityId) {
  return await icuFetch(`/athlete/${state.athleteId}/activities/${activityId}`);
}

async function fetchActivityStreams(activityId) {
  // Fetch all available streams — filter client-side
  return await icuFetch(
    `/athlete/${state.athleteId}/activities/${activityId}/streams`
  );
}

// Normalise stream data — handles both object {watts:[…]} and array [{type:'watts',data:[…]}] formats
function normalizeStreams(raw) {
  if (!raw) return {};
  if (Array.isArray(raw)) {
    const obj = {};
    raw.forEach(s => { if (s.type && Array.isArray(s.data)) obj[s.type] = s.data; });
    return obj;
  }
  return typeof raw === 'object' ? raw : {};
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
  tssEl.textContent    = tss > 0 ? tss : '';
  tssEl.style.display  = tss > 0 ? 'inline-block' : 'none';

  // Build stats — handle both fields-restricted and full API response field names
  const distKm   = (a.distance || 0) / 1000;
  const secs     = a.moving_time || a.elapsed_time || a.moving_time_seconds || a.elapsed_time_seconds || 0;
  const speedMs  = a.average_speed || a.average_speed_meters_per_sec ||
                   (secs > 0 && a.distance ? a.distance / secs : 0);
  const speedKmh = speedMs * 3.6;
  const avgW     = a.average_watts || 0;
  const np       = a.icu_weighted_avg_watts || 0;
  const avgHR    = a.average_heartrate || (a.heart_rate && a.heart_rate.average) || 0;

  const stats = [
    { label: 'Distance',    value: distKm > 0 ? distKm.toFixed(2) : '—',                            unit: 'km'   },
    { label: 'Moving Time', value: secs > 0 ? fmtDur(secs) : '—',                                   unit: ''     },
    { label: 'Elevation',   value: Math.round(a.total_elevation_gain || 0).toLocaleString(),          unit: 'm'    },
    { label: 'Avg Speed',   value: speedKmh > 0.5 ? speedKmh.toFixed(1) : '—',                      unit: 'km/h' },
  ];

  if (avgW > 0) stats.push(
    { label: 'Avg Power',   value: Math.round(avgW),                                                  unit: 'w'   },
    { label: 'Norm Power',  value: np > 0 ? Math.round(np) : '—',                                    unit: 'w'   },
    { label: 'Max Power',   value: a.max_watts ? Math.round(a.max_watts) : '—',                       unit: 'w'   },
    { label: 'Int. Factor', value: a.intensity_factor ? a.intensity_factor.toFixed(2) : '—',          unit: ''    }
  );

  const maxHR  = a.max_heartrate || (a.heart_rate && a.heart_rate.max) || 0;
  const avgCad = a.average_cadence || (a.cadence && a.cadence.average) || 0;
  const cals   = a.calories || (a.other && a.other.calories) || 0;

  if (avgHR > 0) stats.push(
    { label: 'Avg HR',      value: Math.round(avgHR),                                                 unit: 'bpm' },
    { label: 'Max HR',      value: maxHR ? Math.round(maxHR) : '—',                                   unit: 'bpm' }
  );

  if (avgCad > 0) stats.push({ label: 'Avg Cadence', value: Math.round(avgCad),                       unit: 'rpm'  });
  if (cals > 0)   stats.push({ label: 'Calories',    value: Math.round(cals).toLocaleString(),        unit: 'kcal' });
  if (tss > 0)    stats.push({ label: 'TSS',         value: tss,                                      unit: ''    });

  document.getElementById('detailStatsGrid').innerHTML = stats.map(s =>
    `<div class="detail-stat">
      <div class="detail-stat-label">${s.label}</div>
      <div class="detail-stat-value">${s.value}${s.unit ? `<span class="detail-stat-unit"> ${s.unit}</span>` : ''}</div>
    </div>`
  ).join('');
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

  const chartsRow = document.getElementById('detailChartsRow');
  if (hasCharts) {
    const both = powerCard.style.display !== 'none' && hrCard.style.display !== 'none';
    chartsRow.style.gridTemplateColumns = both ? '1fr 1fr' : '1fr';
    chartsRow.style.display = 'grid';
  }
}

function streamChartConfig(labels, data, color, fill, unit) {
  return {
    type: 'line',
    data: { labels, datasets: [{ data, borderColor: color, backgroundColor: fill, borderWidth: 1.5, pointRadius: 0, tension: 0.3, fill: true, spanGaps: true }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e2330', borderColor: '#252b3a', borderWidth: 1,
          titleColor: '#8891a8', bodyColor: '#eef0f8', padding: 10,
          callbacks: { label: c => `${c.raw} ${unit}` }
        }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#525d72', maxTicksLimit: 8, font: { size: 10 } } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#525d72', font: { size: 10 } } }
      }
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
  updateConnectionUI(false);
  syncData();
} else {
  openModal();
}

// Close modal on backdrop click (only when already connected)
document.getElementById('connectModal').addEventListener('click', function(e) {
  if (e.target === this && (state.athleteId && state.apiKey)) closeModal();
});
