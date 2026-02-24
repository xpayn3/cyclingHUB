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
  activityStreamsChart: null,
  activityPowerChart: null,
  activityHRChart: null,
  activityCurveChart: null,
  activityHRCurveChart: null,
  activityHistogramChart: null,
  activityGradientChart: null,
  activityCadenceChart: null,
  znpZoneTimeChart: null,
  wellnessHrvChart: null,
  wellnessSleepChart: null,
  wellnessSubjChart: null,
  wellnessCorrelChart: null,
  powerCurveChart: null,
  powerCurve: null,
  powerCurveRange: null,
  powerPageRangeDays: 90,
  powerPageChart: null,
  powerTrendChart: null,
  powerPageCurve: null,
  powerPageCurveRange: null,
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
  activitiesYear: new Date().getFullYear(),  // default to current year; null = all years
  activitiesSportFilter: 'all',
  activitiesSearch: '',
  flythrough: null,
  weatherPageData: null,
  weatherPageMeta: null,
  lifetimeActivities: null,
  lifetimeLastSync: null,
  _lifetimeSyncDone: false,
};

const ICU_BASE = 'https://intervals.icu/api/v1';

/* ====================================================
   GREETING
==================================================== */
const GREETINGS = [
  "Welcome back! 💪",
  "Good to see you! Let's ride.",
  "Ready to crush it today?",
  "Keep up the great work!",
  "Your progress is looking great 🚴",
  "Every ride counts. Let's go!",
  "You're on a roll — keep it up!",
  "Another day, another ride 🔥",
  "Stay consistent, stay strong.",
  "Great athletes review their data 📊",
  "You've got this. One pedal at a time.",
  "Champions train even when it's hard.",
  "Your legs are stronger than you think.",
  "Pain is temporary. Fitness is forever.",
  "Looking strong — keep pushing forward!",
];

/* ====================================================
   UTILITIES
==================================================== */
/** Destroy a Chart.js instance and return null for easy assignment */
function destroyChart(chart) {
  if (chart) chart.destroy();
  return null;
}

/** Update the sidebar CTL badge from state.fitness — call any time fitness data is available */
function updateSidebarCTL() {
  const el = document.getElementById('sidebarCTL');
  if (!el) return;
  const ctl = state.fitness?.ctl;
  if (ctl != null) {
    el.textContent = `CTL ${Math.round(ctl)}`;
  }
}

/** Update the topbar glow colour based on current TSB / training status */
function _tsbParticleColor(tsb) {
  if (tsb == null) return [148,163,190];
  if (tsb < -30)   return [239,68,68];
  if (tsb < -10)   return [251,146,60];
  if (tsb < 5)     return [0,229,160];
  if (tsb <= 25)   return [74,158,255];
  return [148,163,190];
}

function updateTopbarGlow() {
  const tsb = state.fitness?.tsb;
  const [r,g,b] = _tsbParticleColor(tsb);
  let a;
  if (tsb == null)       a = 0.2;
  else if (tsb < -30)    a = 0.4;
  else if (tsb < -10)    a = 0.35;
  else if (tsb < 5)      a = 0.35;
  else if (tsb <= 25)    a = 0.35;
  else                   a = 0.25;
  document.documentElement.style.setProperty('--topbar-glow', `rgba(${r},${g},${b},${a})`);
  // Update particle colour
  _aurora.rgb = [r,g,b];
}

/* ── Topbar aurora borealis effect ── */
const _aurora = { raf: null, rgb: [0,229,160], running: false, t: 0 };

function _initGlowObserver() {
  if (_aurora.observer) return;
  const el = document.querySelector('.topbar-glow-el');
  if (!el) return;
  _aurora.observer = new IntersectionObserver(([entry]) => {
    const visible = entry.isIntersecting;
    if (visible && _aurora.running && !_aurora.raf) {
      _aurora.raf = requestAnimationFrame(_aurora._frame);
    } else if (!visible && _aurora.raf) {
      cancelAnimationFrame(_aurora.raf);
      _aurora.raf = null;
    }
  }, { threshold: 0 });
  _aurora.observer.observe(el);
}

function startGlowParticles() {
  if (_aurora.running) return;
  const canvas = document.getElementById('glowParticles');
  if (!canvas) return;
  _aurora.running = true;
  _initGlowObserver();
  _aurora.t = Math.random() * 1000; // random start offset for variety

  const ctx = canvas.getContext('2d');

  // Thin traveling wavy lines
  const LINES = 6;
  const lines = Array.from({ length: LINES }, (_, i) => ({
    phase:    Math.random() * Math.PI * 2,
    speed:    0.4 + Math.random() * 0.6,        // travel speed (px/frame-ish)
    freq1:    2.0 + Math.random() * 2.0,         // primary wave freq
    freq2:    3.5 + Math.random() * 3.0,         // secondary twist freq
    amp1:     0.06 + Math.random() * 0.10,       // primary amplitude
    amp2:     0.02 + Math.random() * 0.04,       // twist amplitude
    yBase:    0.18 + (i / LINES) * 0.55,         // vertical spread
    alphaMax: 0.12 + Math.random() * 0.10,       // max opacity
    lineW:    0.6 + Math.random() * 0.8,         // stroke width
    hueShift: (Math.random() - 0.5) * 40,
    tOff:     Math.random() * 100,               // time offset for variety
  }));

  // Each curtain is a slow-drifting sine wave band
  const BANDS = 5;
  const bands = Array.from({ length: BANDS }, (_, i) => ({
    phase:  Math.random() * Math.PI * 2,
    speed:  0.0003 + Math.random() * 0.0004,  // very slow drift
    freq:   1.5 + Math.random() * 1.5,         // wave frequency
    amp:    0.08 + Math.random() * 0.15,        // vertical wave amplitude
    yBase:  0.15 + (i / BANDS) * 0.5,           // spread bands vertically
    width:  0.12 + Math.random() * 0.1,         // band thickness
    alphaMax: 0.08 + Math.random() * 0.07,       // subtle opacity
    hueShift: (Math.random() - 0.5) * 30,       // slight color variation per band
  }));

  function frame(ts) {
    if (!_aurora.running) return;
    _aurora.t = ts || _aurora.t;

    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (cw === 0) { _aurora.raf = requestAnimationFrame(frame); return; }
    if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
    }
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const [baseR, baseG, baseB] = _aurora.rgb;
    const time = _aurora.t * 0.001;

    for (const band of bands) {
      band.phase += band.speed;

      // Shift hue slightly: mix base color with a rotated version
      const shift = band.hueShift / 100;
      const r = Math.min(255, Math.max(0, baseR + shift * 60));
      const g = Math.min(255, Math.max(0, baseG + shift * 40));
      const b = Math.min(255, Math.max(0, baseB - shift * 30));

      // Draw the band as a series of vertical gradient slices
      const slices = Math.ceil(w / (3 * dpr));
      for (let i = 0; i <= slices; i++) {
        const xPct = i / slices;
        const x = xPct * w;

        // Sine wave determines vertical position of this slice
        const wave = Math.sin(xPct * band.freq * Math.PI * 2 + band.phase + time * 0.3)
                   + Math.sin(xPct * band.freq * 0.7 * Math.PI * 2 + band.phase * 1.3 + time * 0.2) * 0.4;
        const yCenter = (band.yBase + wave * band.amp) * h;

        // Breathing alpha — slow oscillation
        const breath = 0.5 + 0.5 * Math.sin(time * 0.5 + band.phase + xPct * 2);
        const alpha = band.alphaMax * breath;

        const bandH = band.width * h;
        const grad = ctx.createLinearGradient(x, yCenter - bandH, x, yCenter + bandH);
        grad.addColorStop(0,   `rgba(${r},${g},${b},0)`);
        grad.addColorStop(0.3, `rgba(${r},${g},${b},${alpha})`);
        grad.addColorStop(0.5, `rgba(${r},${g},${b},${alpha * 1.2})`);
        grad.addColorStop(0.7, `rgba(${r},${g},${b},${alpha})`);
        grad.addColorStop(1,   `rgba(${r},${g},${b},0)`);

        ctx.fillStyle = grad;
        const sliceW = (w / slices) + 1;
        ctx.fillRect(x, yCenter - bandH, sliceW, bandH * 2);
      }
    }

    // ── Thin twisting traveling wavy lines ──
    ctx.lineCap = 'round';
    for (const ln of lines) {
      const shift = ln.hueShift / 100;
      const lr = Math.min(255, Math.max(0, baseR + shift * 50));
      const lg = Math.min(255, Math.max(0, baseG + shift * 35));
      const lb = Math.min(255, Math.max(0, baseB - shift * 25));
      const tl = time + ln.tOff;

      // Breathing opacity
      const breath = 0.4 + 0.6 * Math.sin(tl * 0.35 + ln.phase);
      const alpha = ln.alphaMax * Math.max(0, breath);

      ctx.beginPath();
      ctx.strokeStyle = `rgba(${lr},${lg},${lb},${alpha})`;
      ctx.lineWidth = ln.lineW * dpr;

      const steps = Math.ceil(w / (2 * dpr));
      for (let i = 0; i <= steps; i++) {
        const xPct = i / steps;
        const x = xPct * w;
        // Slowly drifting frequencies & amplitudes so the wave shape evolves
        const fDrift1 = ln.freq1 + Math.sin(tl * 0.08 + ln.phase) * 0.6;
        const fDrift2 = ln.freq2 + Math.cos(tl * 0.06 + ln.tOff) * 0.8;
        const aDrift1 = ln.amp1 * (0.7 + 0.3 * Math.sin(tl * 0.12 + ln.phase * 1.5));
        const aDrift2 = ln.amp2 * (0.6 + 0.4 * Math.cos(tl * 0.10 + ln.tOff * 0.8));
        // Primary wave + secondary twist + third harmonic for organic movement
        const y1 = Math.sin(xPct * fDrift1 * Math.PI * 2 + ln.phase + tl * ln.speed * 0.15);
        const y2 = Math.sin(xPct * fDrift2 * Math.PI * 2 - ln.phase * 0.7 + tl * ln.speed * 0.22);
        const y3 = Math.sin(xPct * (fDrift1 + fDrift2) * 0.5 * Math.PI * 2 + tl * 0.18) * 0.3;
        const yCenter = (ln.yBase + y1 * aDrift1 + y2 * aDrift2 + y3 * ln.amp2 * 0.5) * h;
        if (i === 0) ctx.moveTo(x, yCenter);
        else ctx.lineTo(x, yCenter);
      }
      ctx.stroke();
    }

    _aurora.raf = requestAnimationFrame(frame);
  }
  _aurora._frame = frame;
  _aurora.raf = requestAnimationFrame(frame);
}

function stopGlowParticles() {
  _aurora.running = false;
  if (_aurora.raf) { cancelAnimationFrame(_aurora.raf); _aurora.raf = null; }
  const canvas = document.getElementById('glowParticles');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

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
    const payload = JSON.stringify(activities);
    const oldSize = new Blob([localStorage.getItem('icu_activities_cache') || '']).size;
    const newSize = new Blob([payload]).size;
    const { total } = getAppStorageUsage();
    if ((total - oldSize + newSize) > STORAGE_LIMIT) {
      showToast('Storage limit reached — activity cache not saved', 'error');
      return;
    }
    localStorage.setItem('icu_activities_cache', payload);
    localStorage.setItem('icu_last_sync', new Date().toISOString());
    updateStorageBar();
  } catch (e) {
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
    const payload = JSON.stringify({
      fitness:        state.fitness,
      wellnessHistory: state.wellnessHistory,
      athlete:        state.athlete,
    });
    const oldSize = new Blob([localStorage.getItem('icu_fitness_cache') || '']).size;
    const newSize = new Blob([payload]).size;
    const { total } = getAppStorageUsage();
    if ((total - oldSize + newSize) > STORAGE_LIMIT) {
      showToast('Storage limit reached — fitness cache not saved', 'error');
      return;
    }
    localStorage.setItem('icu_fitness_cache', payload);
    updateStorageBar();
  } catch (e) {
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

/* ====================================================
   LIFETIME ACTIVITY CACHE  (localStorage)
   Stores the all-time activity list for lifetime stats.
   Incremental sync: only fetches activities newer than
   the last lifetime sync timestamp.
==================================================== */
function saveLifetimeCache(activities) {
  try {
    const payload = JSON.stringify(activities);
    const oldSize = new Blob([localStorage.getItem('icu_lifetime_cache') || '']).size;
    const newSize = new Blob([payload]).size;
    const { total } = getAppStorageUsage();
    if ((total - oldSize + newSize) > STORAGE_LIMIT) {
      showToast('Storage limit reached — lifetime cache not saved', 'error');
      return;
    }
    localStorage.setItem('icu_lifetime_cache', payload);
    localStorage.setItem('icu_lifetime_sync', new Date().toISOString());
    updateStorageBar();
  } catch (e) {
    localStorage.removeItem('icu_lifetime_cache');
  }
}

function loadLifetimeCache() {
  try {
    const raw      = localStorage.getItem('icu_lifetime_cache');
    const lastSync = localStorage.getItem('icu_lifetime_sync');
    if (raw && lastSync) {
      const activities = JSON.parse(raw);
      if (Array.isArray(activities) && activities.length > 0) {
        return { activities, lastSync: new Date(lastSync) };
      }
    }
  } catch (e) { /* ignore */ }
  return null;
}

function clearLifetimeCache() {
  localStorage.removeItem('icu_lifetime_cache');
  localStorage.removeItem('icu_lifetime_sync');
  state.lifetimeActivities = null;
}

function getLifetimeCacheSize() {
  try {
    return new Blob([localStorage.getItem('icu_lifetime_cache') || '']).size;
  } catch (_) { return 0; }
}

/* ====================================================
   STORAGE LIMIT  (8 MB cap on all app localStorage)
==================================================== */
const STORAGE_LIMIT = 8 * 1024 * 1024; // 8 MB

function getAppStorageUsage() {
  const prefix = 'icu_';
  let total = 0;
  const breakdown = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key.startsWith(prefix)) continue;
    const size = new Blob([localStorage.getItem(key)]).size;
    total += size;
    // bucket into categories
    if (key === 'icu_activities_cache' || key === 'icu_last_sync')
      breakdown.activities = (breakdown.activities || 0) + size;
    else if (key === 'icu_lifetime_cache' || key === 'icu_lifetime_sync')
      breakdown.lifetime = (breakdown.lifetime || 0) + size;
    else if (key === 'icu_fitness_cache')
      breakdown.fitness = (breakdown.fitness || 0) + size;
    else
      breakdown.other = (breakdown.other || 0) + size;
  }
  return { total, breakdown };
}

function fmtBytes(b) {
  if (b > 1048576) return (b / 1048576).toFixed(1) + ' MB';
  if (b > 1024)    return (b / 1024).toFixed(0) + ' KB';
  return b + ' B';
}

function canStoreBytes(newBytes) {
  const { total } = getAppStorageUsage();
  return (total + newBytes) <= STORAGE_LIMIT;
}

function updateStorageBar() {
  const bar    = document.getElementById('storageBarTrack');
  const label  = document.getElementById('storageBarLabel');
  const legend = document.getElementById('storageBarLegend');
  if (!bar) return;

  const { total, breakdown } = getAppStorageUsage();
  const pct = (v) => Math.max(0, Math.min(100, (v / STORAGE_LIMIT) * 100));

  // build segments
  const segs = [
    { key: 'activities', color: 'var(--accent)',  label: 'Activities' },
    { key: 'lifetime',   color: '#6366f1',        label: 'Lifetime' },
    { key: 'fitness',    color: '#10b981',         label: 'Fitness' },
    { key: 'other',      color: 'var(--text-muted)', label: 'Other' },
  ];

  bar.innerHTML = segs.map(s => {
    const w = pct(breakdown[s.key] || 0);
    return w > 0 ? `<div class="stg-seg" style="width:${w}%;background:${s.color}" title="${s.label}: ${fmtBytes(breakdown[s.key])}"></div>` : '';
  }).join('');

  if (label) label.textContent = `${fmtBytes(total)} / ${fmtBytes(STORAGE_LIMIT)}`;

  if (legend) {
    legend.innerHTML = segs
      .filter(s => (breakdown[s.key] || 0) > 0)
      .map(s => `<span class="stg-legend-item"><span class="stg-legend-dot" style="background:${s.color}"></span>${s.label} ${fmtBytes(breakdown[s.key])}</span>`)
      .join('');
  }
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
    // Throttle pagination to avoid API rate-limiting on remote hosts
    if (guard > 0) await new Promise(r => setTimeout(r, 250));

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
  // Update topbar glow if on dashboard
  if (state.currentPage === 'dashboard') updateTopbarGlow();
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
    updateSidebarCTL(); // refresh badge with latest fetched value

    // Invalidate power curve cache so it re-fetches with fresh range
    state.powerCurve = null;
    state.powerCurveRange = null;
    state.powerPageCurve = null;
    state.powerPageCurveRange = null;

    state.synced = true;
    updateConnectionUI(true);
    renderDashboard();
    if (state.currentPage === 'calendar') renderCalendar();
    if (state.currentPage === 'fitness')  renderFitnessPage();
    if (state.currentPage === 'power')    renderPowerPage();
    if (state.currentPage === 'streaks')  renderStreaksPage();

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
  clearLifetimeCache();          // also wipe lifetime history
  state.activities = [];         // clear in-memory list too
  state.lifetimeActivities = null;
  state._lifetimeSyncDone  = false;
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

  // ── Lifetime cache UI ──
  updateLifetimeCacheUI();

  // ── Storage bar ──
  updateStorageBar();
}

function updateLifetimeCacheUI() {
  const countEl = document.getElementById('settingsLifetimeCount');
  const sizeEl  = document.getElementById('settingsLifetimeSize');
  const syncEl  = document.getElementById('settingsLifetimeSync');
  const acts    = state.lifetimeActivities;

  if (countEl) countEl.textContent = acts ? acts.length.toLocaleString() + ' activities' : '—';
  if (sizeEl)  sizeEl.textContent  = (() => {
    const bytes = getLifetimeCacheSize();
    if (!bytes) return '—';
    return bytes > 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : (bytes / 1024).toFixed(0) + ' KB';
  })();
  if (syncEl) {
    const ls = localStorage.getItem('icu_lifetime_sync');
    if (ls) {
      const diff = Math.round((Date.now() - new Date(ls).getTime()) / 60000);
      syncEl.textContent = diff < 1 ? 'Just now'
        : diff < 60 ? `${diff} min ago`
        : diff < 1440 ? `${Math.round(diff / 60)} hr ago`
        : new Date(ls).toLocaleDateString();
    } else {
      syncEl.textContent = 'Never';
    }
  }
}

function clearAllCaches() {
  clearActivityCache();
  clearFitnessCache();
  clearLifetimeCache();
  state.lifetimeActivities = null;
  state._lifetimeSyncDone  = false;
  updateStorageBar();
  showToast('All caches cleared', 'success');
  if (state.currentPage === 'settings') navigate('settings');
}

function resyncLifetimeData() {
  clearLifetimeCache();
  state.lifetimeActivities = null;
  state.lifetimeLastSync   = null;
  state._lifetimeSyncDone  = false;
  showToast('Syncing lifetime data…', 'success');
  runLifetimeSync();
}

function runLifetimeSync() {
  if (state._lifetimeSyncDone) return;
  state._lifetimeSyncDone = true;
  (async () => {
    try {
      const pageSize = 200;
      const seen = new Set();
      const all = [];
      const existing = state.lifetimeActivities || [];
      const lastSync = state.lifetimeLastSync;

      const hardOldest = lastSync ? toDateStr(new Date(lastSync.getTime() - 7 * 86400000)) : '2010-01-01';
      let ceiling = toDateStr(new Date());

      for (let guard = 0; guard < 60; guard++) {
        if (guard > 0) await new Promise(r => setTimeout(r, 300));

        let data;
        for (let retry = 0; retry < 3; retry++) {
          try {
            data = await icuFetch(
              `/athlete/${state.athleteId}/activities?oldest=${hardOldest}&newest=${ceiling}&limit=${pageSize}`
            );
            break;
          } catch (fetchErr) {
            const status = parseInt(fetchErr.message);
            if (status === 429 || status === 503) {
              await new Promise(r => setTimeout(r, (retry + 1) * 2000));
            } else {
              throw fetchErr;
            }
          }
        }
        if (!data) throw new Error('API rate limit — try again in a minute');

        const chunk = Array.isArray(data) ? data : (data.activities || []);
        if (!chunk.length) break;
        let added = 0;
        for (const a of chunk) {
          if (!seen.has(a.id)) { seen.add(a.id); all.push(a); added++; }
        }
        if (added === 0 || chunk.length < pageSize) break;
        const dates = chunk.map(a => a.start_date_local || a.start_date).filter(Boolean).sort();
        if (!dates.length) break;
        const oldest = dates[0].slice(0, 10);
        if (oldest <= hardOldest) break;
        ceiling = oldest;
      }

      if (lastSync && existing.length) {
        const freshIds = new Set(all.map(a => a.id));
        const kept = existing.filter(a => !freshIds.has(a.id));
        state.lifetimeActivities = [...kept, ...all].sort(
          (a, b) => new Date(b.start_date_local || b.start_date) - new Date(a.start_date_local || a.start_date)
        );
      } else {
        state.lifetimeActivities = all.sort(
          (a, b) => new Date(b.start_date_local || b.start_date) - new Date(a.start_date_local || a.start_date)
        );
      }

      state.lifetimeLastSync = new Date();
      saveLifetimeCache(state.lifetimeActivities);
      updateLifetimeCacheUI();
      showToast(`Synced ${state.lifetimeActivities.length} lifetime activities`, 'success');

      if (state.currentPage === 'streaks' || state.currentPage === 'wellness') renderStreaksPage();
      if (state.currentPage === 'activities') renderAllActivitiesList();
      if (state.currentPage === 'settings') navigate('settings');
    } catch (e) {
      console.error('Lifetime sync failed:', e);
      showToast('Lifetime sync failed: ' + (e.message || 'unknown error'), 'error');
      if (!state.lifetimeActivities) state.lifetimeActivities = state.activities || [];
      if (state.currentPage === 'streaks' || state.currentPage === 'wellness') renderStreaksPage();
    }
  })();
}

function exportLifetimeJSON() {
  const acts = state.lifetimeActivities;
  if (!acts || !acts.length) { showToast('No lifetime data to export', 'error'); return; }
  const blob = new Blob([JSON.stringify(acts, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `cycleiq-activities-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Exported ${acts.length} activities`, 'success');
}

function importLifetimeJSON() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const acts = JSON.parse(ev.target.result);
        if (!Array.isArray(acts) || !acts.length) {
          showToast('Invalid file — expected a JSON array of activities', 'error');
          return;
        }
        // Merge with existing: imported data fills gaps, existing data takes priority
        const map = new Map();
        acts.forEach(a => { const id = a.id || a.icu_id; if (id) map.set(id, a); });
        (state.lifetimeActivities || []).forEach(a => { const id = a.id || a.icu_id; if (id) map.set(id, a); });
        state.lifetimeActivities = Array.from(map.values()).sort(
          (a, b) => new Date(b.start_date_local || b.start_date) - new Date(a.start_date_local || a.start_date)
        );
        state.lifetimeLastSync = new Date();
        saveLifetimeCache(state.lifetimeActivities);
        updateLifetimeCacheUI();
        updateStorageBar();
        showToast(`Imported — ${state.lifetimeActivities.length} activities total`, 'success');
        if (state.currentPage === 'activities') renderAllActivitiesList();
      } catch (err) {
        showToast('Failed to parse JSON file', 'error');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

/* ====================================================
   NAVIGATION
==================================================== */
// iOS Safari requires position:fixed on body to prevent background scroll
// behind the sidebar (overflow:hidden alone is ignored by Safari).
let _sidebarScrollY = 0;
function _lockBodyScroll(lock) {
  if (lock) {
    _sidebarScrollY = window.scrollY;
    document.body.style.position  = 'fixed';
    document.body.style.top       = `-${_sidebarScrollY}px`;
    document.body.style.width     = '100%';
    document.body.style.overflow  = 'hidden';
  } else {
    document.body.style.position  = '';
    document.body.style.top       = '';
    document.body.style.width     = '';
    document.body.style.overflow  = '';
    window.scrollTo(0, _sidebarScrollY);
  }
}

function toggleSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  const burger   = document.getElementById('burgerBtn');
  const open     = sidebar.classList.toggle('open');
  backdrop.classList.toggle('open', open);
  burger?.classList.toggle('is-open', open);
  _lockBodyScroll(open);
}

function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebarBackdrop')?.classList.remove('open');
  document.getElementById('burgerBtn')?.classList.remove('is-open');
  _lockBodyScroll(false);
}

/* ====================================================
   SWIPE TO OPEN SIDEBAR (Mobile)
==================================================== */
let _swipeStartX = 0;
let _swipeStartY = 0;
document.addEventListener('touchstart', (e) => {
  // Only track single finger swipes (ignore multi-touch gestures like pinch)
  if (e.touches.length === 1) {
    _swipeStartX = e.touches[0].clientX;
    _swipeStartY = e.touches[0].clientY;
  } else {
    _swipeStartX = 0;
    _swipeStartY = 0;
  }
}, false);

document.addEventListener('touchmove', (e) => {
  // Only track if single finger and we started tracking
  if (_swipeStartX === 0 || e.touches.length !== 1) return;

  const touchX = e.touches[0].clientX;
  const touchY = e.touches[0].clientY;
  const deltaX = touchX - _swipeStartX;
  const deltaY = Math.abs(touchY - _swipeStartY);

  // Swipe from left edge (within 50px) to the right, with minimal vertical movement
  if (_swipeStartX < 50 && deltaX > 50 && deltaY < 50) {
    e.preventDefault();
    const sidebar = document.getElementById('sidebar');
    if (sidebar && !sidebar.classList.contains('open')) {
      // Get sidebar width and cap the translation to it
      const sidebarWidth = sidebar.offsetWidth || 280;
      const maxTranslate = Math.min(deltaX, sidebarWidth);
      sidebar.style.transform = `translateX(${maxTranslate}px)`;
    }
  }
}, { passive: false });

document.addEventListener('touchend', (e) => {
  if (_swipeStartX === 0) return;

  const touchX = e.changedTouches[0].clientX;
  const deltaX = touchX - _swipeStartX;

  // If swiped far enough from left edge, open sidebar
  if (_swipeStartX < 50 && deltaX > 80) {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      sidebar.style.transform = '';
      toggleSidebar();
    }
  } else {
    // Reset animation if swipe wasn't far enough
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.style.transform = '';
  }

  _swipeStartX = 0;
  _swipeStartY = 0;
}, false);

/* ── Disable pinch-to-zoom everywhere EXCEPT Leaflet maps ── */
function _isOnMap(e) {
  return e.target && e.target.closest && e.target.closest('.leaflet-container');
}

// Block multi-touch zoom — capture phase so it fires first
window.addEventListener('touchstart', function(e) {
  if (e.touches.length > 1 && !_isOnMap(e)) {
    e.preventDefault();
  }
}, { passive: false, capture: true });

window.addEventListener('touchmove', function(e) {
  if (e.touches.length > 1 && !_isOnMap(e)) {
    e.preventDefault();
  }
}, { passive: false, capture: true });

// Safari proprietary gesture events — capture phase on window
['gesturestart', 'gesturechange', 'gestureend'].forEach(function(evt) {
  window.addEventListener(evt, function(e) {
    if (!_isOnMap(e)) { e.preventDefault(); }
  }, { passive: false, capture: true });
});

function navigate(page) {
  state.previousPage = state.currentPage;
  state.currentPage  = page;
  try { sessionStorage.setItem('icu_route', JSON.stringify({ type: 'page', page })); } catch {}

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page)?.classList.add('active');
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');

  const info = {
    dashboard:  [GREETINGS[Math.floor(Math.random() * GREETINGS.length)], `Overview · Last ${state.rangeDays} days`],
    activities: ['Activities',     'All recorded rides & workouts'],
    calendar:   ['Calendar',       'Planned workouts & events'],
    fitness:    ['Fitness',        'CTL · ATL · TSB history'],
    power:      ['Power Curve',    'Best efforts across durations'],
    zones:      ['Training Zones', 'Time in zone breakdown'],
    compare:    ['Compare',        'Compare metrics across time periods'],
    goals:      ['Goals',          'Set & track training goals'],
    weather:    ['Weather',        'Weekly forecast & riding conditions'],
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
  const detailNav     = document.getElementById('detailTopbarNav');
  const detailBack    = document.getElementById('detailTopbarBack');
  const wxdBack       = document.getElementById('wxdTopbarBack');
  const settingsBack  = document.getElementById('settingsTopbarBack');
  if (detailNav)    detailNav.style.display    = 'none';
  if (detailBack)   detailBack.style.display   = 'none';
  if (wxdBack)      wxdBack.style.display      = 'none';
  if (settingsBack) settingsBack.style.display = 'none';

  // Show topbar range pill only on dashboard
  const pill = document.getElementById('dateRangePill');
  if (pill) pill.style.display = (page === 'dashboard') ? 'flex' : 'none';

  // Training status glow — dashboard only
  document.body.classList.toggle('dashboard-glow', page === 'dashboard');
  if (page === 'dashboard') { updateTopbarGlow(); startGlowParticles(); applyDashSectionVisibility(); }
  else stopGlowParticles();
  if (page === 'settings') renderDashSectionToggles();

  // Show month label in topbar only on calendar
  const calLabel = document.getElementById('calTopbarMonth');
  if (calLabel) calLabel.style.display = (page === 'calendar') ? '' : 'none';

  // Ensure topbar is always visible (never hide on calendar)
  document.querySelector('.topbar')?.classList.remove('topbar--hidden');
  document.querySelector('.page-headline')?.classList.remove('page-headline--hidden');

  if (page === 'dashboard' && state.synced) {
    const rail = document.getElementById('recentActScrollRail');
    if (rail) rail.scrollLeft = 0;
    renderDashboard();
  }
  if (page === 'calendar') renderCalendar();
  if (page === 'fitness')  renderFitnessPage();
  if (page === 'power')    renderPowerPage();
  if (page === 'zones')    renderZonesPage();
  if (page === 'compare')  { ensureLifetimeLoaded(); renderComparePage(); }
  if (page === 'goals')    renderGoalsPage();
  if (page === 'workout')  { wrkRefreshStats(); wrkRender(); }
  if (page === 'settings') {
    initWeatherLocationUI();
    const settingsBack = document.getElementById('settingsTopbarBack');
    if (settingsBack) settingsBack.style.display = (state.previousPage && state.previousPage !== 'settings') ? '' : 'none';
  }
  if (page === 'activities') ensureLifetimeLoaded();
  if (page === 'weather')  renderWeatherPage();
  if (page === 'gear')     renderGearPage();
  if (page === 'guide')    renderGuidePage();
  if (page === 'wellness') renderStreaksPage();
  if (page === 'streaks')  renderStreaksPage();

  window.scrollTo(0, 0);
}

/* ====================================================
   UNITS  (metric / imperial)
==================================================== */
function loadUnits() {
  state.units = localStorage.getItem('icu_units') || 'metric';
}

/* ── Weather location (manual city setting) ─────────────────────────────── */
async function setWeatherCity() {
  const input = document.getElementById('wxCityInput');
  const city  = (input?.value || '').trim();
  if (!city) return;

  const statusEl = document.getElementById('wxCurrentLocation');
  if (statusEl) statusEl.textContent = 'Looking up…';

  try {
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
    const geoRes = await fetch(geoUrl);
    if (!geoRes.ok) throw new Error('Geocoding request failed');
    const geoData = await geoRes.json();
    if (!geoData.results?.length) throw new Error('City not found');

    const { latitude: lat, longitude: lng, name, country } = geoData.results[0];
    const label = [name, country].filter(Boolean).join(', ');

    addWxLocation(lat, lng, label);
    if (statusEl) statusEl.textContent = `${getWxLocations().length} / ${WX_MAX_LOCATIONS} locations`;
    if (input) input.value = '';
  } catch (e) {
    if (statusEl) statusEl.textContent = 'City not found — try a different name';
  }
}

async function useMyLocation() {
  const statusEl = document.getElementById('wxCurrentLocation');
  if (statusEl) statusEl.textContent = 'Locating…';

  let lat, lng;

  // Try browser geolocation first
  if (navigator.geolocation) {
    try {
      const pos = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false, timeout: 10000, maximumAge: 300000
        })
      );
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
    } catch (_) { /* fall through to IP fallback */ }
  }

  // Fallback: IP-based geolocation (try multiple services)
  if (lat == null) {
    const ipServices = [
      {
        url: 'https://get.geojs.io/v1/ip/geo.json',
        parse: d => ({ lat: parseFloat(d.latitude), lng: parseFloat(d.longitude), city: d.city, country: d.country })
      },
      {
        url: 'https://ipapi.co/json/',
        parse: d => ({ lat: d.latitude, lng: d.longitude, city: d.city, country: d.country_name })
      },
      {
        url: 'https://ip-api.com/json/?fields=lat,lon,city,country',
        parse: d => ({ lat: d.lat, lng: d.lon, city: d.city, country: d.country })
      },
    ];
    for (const svc of ipServices) {
      try {
        const res = await fetch(svc.url);
        if (!res.ok) continue;
        const raw = await res.json();
        const d = svc.parse(raw);
        if (d.lat && d.lng && !isNaN(d.lat)) {
          const cityName = [d.city, d.country].filter(Boolean).join(', ') || `${d.lat.toFixed(2)}, ${d.lng.toFixed(2)}`;
          _applyWeatherLocation(d.lat, d.lng, cityName, statusEl);
          return;
        }
      } catch (_) { continue; }
    }
  }

  if (lat == null) {
    if (statusEl) statusEl.textContent = 'Not set';
    showToast('Could not determine location — try entering a city manually', 'error');
    return;
  }

  // Reverse-geocode via Nominatim for browser geolocation result
  let cityName = `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10`);
    if (res.ok) {
      const data = await res.json();
      const addr = data.address || {};
      const city = addr.city || addr.town || addr.village || addr.municipality || '';
      const country = addr.country || '';
      if (city) cityName = [city, country].filter(Boolean).join(', ');
    }
  } catch (_) {}

  _applyWeatherLocation(lat, lng, cityName, statusEl);
}

/* ── Multi-location weather (max 5) ──────────────────────────────── */
const WX_MAX_LOCATIONS = 5;

function getWxLocations() {
  try {
    const raw = localStorage.getItem('icu_wx_locations');
    if (raw) { const arr = JSON.parse(raw); if (Array.isArray(arr)) return arr; }
  } catch (_) {}
  // Migrate legacy single location
  try {
    const legacy = localStorage.getItem('icu_wx_coords');
    if (legacy) {
      const c = JSON.parse(legacy);
      const loc = { id: Date.now(), lat: c.lat, lng: c.lng, city: c.city || 'Unknown', active: true };
      saveWxLocations([loc]);
      return [loc];
    }
  } catch (_) {}
  return [];
}

function saveWxLocations(locs) {
  localStorage.setItem('icu_wx_locations', JSON.stringify(locs));
  // Keep icu_wx_coords in sync with the active location (backward compat)
  const active = locs.find(l => l.active);
  if (active) {
    localStorage.setItem('icu_wx_coords', JSON.stringify({ lat: active.lat, lng: active.lng, city: active.city }));
  } else {
    localStorage.removeItem('icu_wx_coords');
  }
}

function getActiveWxLocation() {
  const locs = getWxLocations();
  return locs.find(l => l.active) || locs[0] || null;
}

function setActiveWxLocation(id) {
  const locs = getWxLocations();
  locs.forEach(l => l.active = (l.id === id));
  saveWxLocations(locs);
  // Clear forecast cache so it refetches for new location
  localStorage.removeItem('icu_wx_forecast');
  localStorage.removeItem('icu_wx_forecast_ts');
  localStorage.removeItem('icu_wx_page');
  localStorage.removeItem('icu_wx_page_ts');
  if (state.currentPage === 'weather') renderWeatherPage();
  if (state.currentPage === 'dashboard') renderWeatherForecast();
  _refreshWxLocSettings();
}

function addWxLocation(lat, lng, city) {
  const locs = getWxLocations();
  // Prevent duplicates (same city name or very close coordinates)
  const dup = locs.find(l => l.city === city || (Math.abs(l.lat - lat) < 0.05 && Math.abs(l.lng - lng) < 0.05));
  if (dup) {
    // Just activate the existing one
    setActiveWxLocation(dup.id);
    showToast(`Switched to ${city}`, 'success');
    return;
  }
  if (locs.length >= WX_MAX_LOCATIONS) {
    showToast(`Maximum ${WX_MAX_LOCATIONS} locations — remove one first`, 'error');
    return;
  }
  locs.forEach(l => l.active = false);
  locs.push({ id: Date.now(), lat, lng, city, active: true });
  saveWxLocations(locs);
  localStorage.removeItem('icu_wx_forecast');
  localStorage.removeItem('icu_wx_forecast_ts');
  localStorage.removeItem('icu_wx_page');
  localStorage.removeItem('icu_wx_page_ts');
  showToast(`Added ${city}`, 'success');
  if (state.currentPage === 'weather') renderWeatherPage();
  if (state.currentPage === 'dashboard') renderWeatherForecast();
  _refreshWxLocSettings();
}

function removeWxLocation(id) {
  let locs = getWxLocations();
  const removing = locs.find(l => l.id === id);
  locs = locs.filter(l => l.id !== id);
  // If we removed the active one, activate the first remaining
  if (removing?.active && locs.length) locs[0].active = true;
  saveWxLocations(locs);
  localStorage.removeItem('icu_wx_forecast');
  localStorage.removeItem('icu_wx_forecast_ts');
  localStorage.removeItem('icu_wx_page');
  localStorage.removeItem('icu_wx_page_ts');
  showToast(`Removed ${removing?.city || 'location'}`, 'info');
  if (state.currentPage === 'weather') renderWeatherPage();
  if (state.currentPage === 'dashboard') renderWeatherForecast();
  _refreshWxLocSettings();
}

function _applyWeatherLocation(lat, lng, cityName, statusEl) {
  addWxLocation(lat, lng, cityName);
  if (statusEl) statusEl.textContent = cityName;
}

function clearWeatherLocation() {
  localStorage.removeItem('icu_wx_coords');
  localStorage.removeItem('icu_wx_locations');
  localStorage.removeItem('icu_wx_forecast');
  localStorage.removeItem('icu_wx_forecast_ts');
  localStorage.removeItem('icu_wx_page');
  localStorage.removeItem('icu_wx_page_ts');
  const statusEl = document.getElementById('wxCurrentLocation');
  if (statusEl) statusEl.textContent = 'Not set';
  const card = document.getElementById('forecastCard');
  if (card) card.style.display = 'none';
  _refreshWxLocSettings();
}

function _refreshWxLocSettings() {
  const list = document.getElementById('wxLocationsList');
  if (!list) return;
  const locs = getWxLocations();
  if (!locs.length) {
    list.innerHTML = '<div class="stt-row"><span class="stt-row-label" style="color:var(--text-muted)">No locations added</span></div>';
    return;
  }
  list.innerHTML = locs.map(l => `
    <div class="stt-row wx-loc-row${l.active ? ' wx-loc-row--active' : ''}">
      <button class="wx-loc-activate btn btn-ghost btn-sm" onclick="setActiveWxLocation(${l.id})" title="Set active">
        <span class="wx-loc-dot${l.active ? ' wx-loc-dot--on' : ''}"></span>
      </button>
      <span class="stt-row-label">${l.city}</span>
      <button class="wx-loc-remove btn btn-ghost btn-sm" onclick="removeWxLocation(${l.id})" title="Remove">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  `).join('');
  // Update the status label
  const statusEl = document.getElementById('wxCurrentLocation');
  if (statusEl) statusEl.textContent = `${locs.length} / ${WX_MAX_LOCATIONS} locations`;
}

function renderWxLocationSwitcher() {
  const locs = getWxLocations();
  if (locs.length <= 1) return '';
  return `
    <div class="wx-loc-switcher">
      ${locs.map(l => `
        <button class="wx-loc-pill${l.active ? ' wx-loc-pill--active' : ''}" onclick="setActiveWxLocation(${l.id})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M12 2a7 7 0 0 1 7 7c0 5.25-7 13-7 13S5 14.25 5 9a7 7 0 0 1 7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
          ${l.city}
        </button>
      `).join('')}
    </div>`;
}

function initWeatherLocationUI() {
  const statusEl = document.getElementById('wxCurrentLocation');
  if (!statusEl) return;
  const active = getActiveWxLocation();
  if (active) {
    statusEl.textContent = active.city || `${active.lat?.toFixed(2)}, ${active.lng?.toFixed(2)}`;
  }
  _refreshWxLocSettings();
  // Restore saved model selection
  const sel = document.getElementById('wxModelSelect');
  if (sel) sel.value = localStorage.getItem('icu_wx_model') || 'best_match';

  // Restore hide-empty-cards toggle
  const hideToggle = document.getElementById('hideEmptyCardsToggle');
  if (hideToggle) hideToggle.checked = localStorage.getItem('icu_hide_empty_cards') === 'true';
}

function setWeatherModel(model) {
  localStorage.setItem('icu_wx_model', model);
  // Clear cached forecasts so next load uses the new model
  localStorage.removeItem('icu_wx_forecast');
  localStorage.removeItem('icu_wx_forecast_ts');
  localStorage.removeItem('icu_wx_page');
  localStorage.removeItem('icu_wx_page_ts');
  showToast(`Weather model set to: ${model}`, 'success');
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
   MERGED ACTIVITY POOL  (recent + lifetime, deduped)
   Used by the Activities page so it lists everything.
==================================================== */
function getAllActivities() {
  const recent   = state.activities   || [];
  const lifetime = state.lifetimeActivities || [];
  if (!lifetime.length) return recent;
  // Build map keyed by id, preferring recent (richer data)
  const map = new Map();
  lifetime.forEach(a => { const id = a.id || a.icu_id; if (id) map.set(id, a); });
  recent.forEach(a =>   { const id = a.id || a.icu_id; if (id) map.set(id, a); }); // overwrites lifetime
  return Array.from(map.values());
}

/** Load lifetime data from cache (if not already in memory) so the
 *  Activities page can show the full history immediately. */
function ensureLifetimeLoaded() {
  if (state.lifetimeActivities) return; // already in memory
  const cached = loadLifetimeCache();
  if (cached) {
    state.lifetimeActivities = cached.activities;
    state.lifetimeLastSync   = cached.lastSync;
    // Re-render now that we have more activities
    renderAllActivitiesList();
  }
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
  let pool = getAllActivities().filter(a => !isEmptyActivity(a));
  if (state.activitiesYear !== null) {
    pool = pool.filter(a => {
      const d = new Date(a.start_date_local || a.start_date);
      return d.getFullYear() === state.activitiesYear;
    });
  }
  if (state.activitiesSportFilter && state.activitiesSportFilter !== 'all') {
    const env = state.activitiesSportFilter; // 'indoor' or 'outdoor'
    pool = pool.filter(a => calActivityEnvironment(a) === env);
  }
  if (state.activitiesSearch && state.activitiesSearch.trim()) {
    const q = state.activitiesSearch.trim().toLowerCase();
    pool = pool.filter(a => {
      const name = (a.name || a.icu_name || '').toLowerCase();
      return name.includes(q);
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

function setActivitiesSport(sport) {
  state.activitiesSportFilter = sport;
  renderAllActivitiesList();
  _updateSportButtons();
}

function setActivitiesSearch(q) {
  state.activitiesSearch = q;
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

function _updateSportButtons() {
  document.querySelectorAll('[data-sport]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.sport === state.activitiesSportFilter);
  });
}

function updateSortButtons() {
  document.querySelectorAll('[data-sort]').forEach(btn => {
    const f = btn.dataset.sort;
    const active = f === state.activitiesSort;
    btn.classList.toggle('active', active);
    const arrow = btn.querySelector('.sort-arrow');
    if (arrow) arrow.textContent = active ? (state.activitiesSortDir === 'desc' ? ' ↓' : ' ↑') : '';
  });
}

function renderAllActivitiesList() {
  const sorted = sortedAllActivities();
  const subtitle = document.getElementById('allActivitiesSubtitle');
  if (subtitle) subtitle.textContent = `${sorted.length} ${sorted.length === 1 ? 'activity' : 'activities'}`;
  // Count placeholder activities (planned workouts never completed — all metrics zero).
  // These exist in the intervals.icu /activities endpoint but have no recorded data.
  let allPool = getAllActivities().filter(a => !!(a.start_date_local || a.start_date));
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
  getAllActivities().forEach(a => {
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
// Build HTML for a single recent-activity carousel card
function buildRecentActCardHTML(a, idx) {
  const name    = a.name || a.icu_name || 'Activity';
  const dateStr = a.start_date_local || a.start_date || '';
  const dateObj = dateStr ? new Date(dateStr) : null;
  const dateFmt = dateObj
    ? dateObj.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    : '—';
  const timeFmt = dateObj
    ? dateObj.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : '';

  const dist  = actVal(a, 'distance', 'icu_distance');
  const secs  = actVal(a, 'moving_time', 'elapsed_time', 'icu_moving_time', 'icu_elapsed_time');
  const elev  = actVal(a, 'total_elevation_gain', 'icu_total_elevation_gain');
  const tss   = actVal(a, 'icu_training_load', 'tss');
  const speed = actVal(a, 'average_speed', 'icu_average_speed');

  const dFmt = dist  > 0 ? fmtDist(dist)  : null;
  const eFmt = elev  > 0 ? fmtElev(elev)  : null;
  const sFmt = speed > 0 ? fmtSpeed(speed) : null;

  const statItems = [
    dFmt && { val: dFmt.val, unit: dFmt.unit, lbl: 'Distance' },
    secs && { val: fmtDur(secs), unit: '',    lbl: 'Time' },
    sFmt && { val: sFmt.val, unit: sFmt.unit, lbl: 'Avg Speed' },
  ].filter(Boolean);

  const tssPill = '';

  const wxChip = a.weather_temp != null
    ? `<div class="ra-wx-chip">
        <span class="ra-wx-icon">${weatherIconSvg(a.weather_icon)}</span>
        <span class="ra-wx-temp">${fmtTempC(a.weather_temp)}</span>
        ${a.weather_wind_speed != null ? `<span class="ra-wx-wind">${fmtWindMs(a.weather_wind_speed)}</span>` : ''}
      </div>`
    : '';

  const statsHTML = statItems.map(s =>
    `<div class="ra-stat">
      <div class="ra-stat-lbl">${s.lbl}</div>
      <div class="ra-stat-val">${s.val}${s.unit ? `<span class="ra-stat-unit"> ${s.unit}</span>` : ''}</div>
    </div>`
  ).join('');

  return `<div class="card card--clickable recent-act-card" id="recentActCard_${idx}">
    <div class="recent-act-body">
      <div class="recent-act-info">
        <div class="recent-act-header">
          <div class="recent-act-text">
            <div class="recent-act-date">${dateFmt}${timeFmt ? ' · ' + timeFmt : ''}</div>
            <div class="recent-act-name">${name}</div>
          </div>
        </div>
        ${tssPill}
        <div class="recent-act-stats">${statsHTML}</div>
        ${wxChip}
      </div>
      <div class="recent-act-map" id="recentActMap_${idx}"></div>
    </div>
  </div>`;
}

// Fetch GPS and render the mini-map for one carousel card
async function renderRecentActCardMap(a, idx) {
  const actId = a.id || a.icu_activity_id;
  const mapEl = document.getElementById(`recentActMap_${idx}`);
  if (!mapEl) return;

  // 1. Best case: snapshot image cached (instant, no re-render needed)
  const cachedImg = localStorage.getItem(`icu_map_snap_${actId}`);
  if (cachedImg) {
    mapEl.innerHTML = `<img src="${cachedImg}" style="width:100%;height:100%;object-fit:cover;display:block;">`;
    return;
  }

  // 2. GPS points cached — skip the API call entirely on refresh
  let points = null;
  const cachedGPS = localStorage.getItem(`icu_gps_pts_${actId}`);
  if (cachedGPS) {
    try { points = JSON.parse(cachedGPS); } catch (_) {}
  }

  // 3. Nothing cached — fetch from API then save GPS points for next refresh
  if (!points || points.length < 2) {
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

    const step = Math.max(1, Math.floor(pairs.length / 400));
    points = pairs.filter((_, i) => i % step === 0);
    if (points[points.length - 1] !== pairs[pairs.length - 1]) points.push(pairs[pairs.length - 1]);

    // Cache the downsampled points (~8 KB) so we never need to re-fetch on refresh
    try { localStorage.setItem(`icu_gps_pts_${actId}`, JSON.stringify(points)); } catch (_) {}
  }

  requestAnimationFrame(() => {
    try {
      const map = L.map(mapEl, {
        zoomControl: false, scrollWheelZoom: false, dragging: false,
        doubleClickZoom: false, touchZoom: false, keyboard: false,
        attributionControl: false, boxZoom: false,
      });
      const _rcTheme = MAP_THEMES[loadMapTheme()] || MAP_THEMES.topo;
      mapEl.style.background = _rcTheme.bg;
      L.tileLayer(_rcTheme.url, {
        maxZoom: 19, attribution: '', crossOrigin: 'anonymous',
        ..._rcTheme.sub ? { subdomains: _rcTheme.sub } : {},
      }).addTo(map);
      L.polyline(points, { color: '#00e5a0', weight: 3, opacity: 1 }).addTo(map);
      const dotIcon = color => L.divIcon({
        className: '',
        html: `<div style="width:8px;height:8px;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,0.9);box-shadow:0 0 3px rgba(0,0,0,0.5)"></div>`,
        iconSize: [8, 8], iconAnchor: [4, 4],
      });
      L.marker(points[0],                 { icon: dotIcon('#00e5a0') }).addTo(map);
      L.marker(points[points.length - 1], { icon: dotIcon('#888')    }).addTo(map);
      const bounds = L.polyline(points).getBounds();
      map.fitBounds(bounds, { padding: [12, 12] });
      map.invalidateSize();
      state.recentActivityMaps = state.recentActivityMaps || [];
      state.recentActivityMaps.push(map);
      setTimeout(() => {
        try { map.invalidateSize(); map.fitBounds(bounds, { padding: [12, 12] }); } catch (_) {}
      }, 300);
      map.once('load', () => {
        setTimeout(() => snapshotRecentMap(map, mapEl, actId), 400);
      });
    } catch (_) {}
  });
}

async function renderRecentActivity() {
  const rail         = document.getElementById('recentActScrollRail');
  const sectionLabel = document.getElementById('recentActSectionLabel');
  if (!rail) return;

  (state.recentActivityMaps || []).forEach(m => { try { m.remove(); } catch (_) {} });
  state.recentActivityMaps = [];

  const pool = (state.activities || []).filter(a => !isEmptyActivity(a));
  if (!pool.length) {
    rail.innerHTML = '';
    if (sectionLabel) sectionLabel.style.display = 'none';
    return;
  }

  const recent = pool.slice(0, 3);
  rail.innerHTML = recent.map((a, i) => buildRecentActCardHTML(a, i)).join('');
  if (sectionLabel) sectionLabel.style.display = '';

  recent.forEach((a, i) => {
    const card = document.getElementById(`recentActCard_${i}`);
    if (card) card.onclick = () => navigateToActivity(a);
    renderRecentActCardMap(a, i);
  });
}


function snapshotRecentMap(map, container, actId) {
  try {
    const W = container.offsetWidth;
    const H = container.offsetHeight;
    if (W < 10 || H < 10) return;

    // Render at half resolution for a compact JPEG
    const scale  = 0.5;
    const canvas = document.createElement('canvas');
    canvas.width  = Math.round(W * scale);
    canvas.height = Math.round(H * scale);
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    const containerRect = container.getBoundingClientRect();

    // 1. Draw satellite tile images
    const tilePane = map.getPanes().tilePane;
    tilePane.querySelectorAll('img').forEach(img => {
      if (!img.complete || !img.naturalWidth) return;
      const r = img.getBoundingClientRect();
      try { ctx.drawImage(img, r.left - containerRect.left, r.top - containerRect.top, r.width, r.height); } catch (_) {}
    });

    // 2. Draw route SVG on top
    const svgEl = container.querySelector('.leaflet-overlay-pane svg');
    if (svgEl) {
      const svgClone = svgEl.cloneNode(true);
      svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      const svgRect = svgEl.getBoundingClientRect();
      const ox = svgRect.left - containerRect.left;
      const oy = svgRect.top  - containerRect.top;
      const blob = new Blob([new XMLSerializer().serializeToString(svgClone)], { type: 'image/svg+xml' });
      const url  = URL.createObjectURL(blob);
      const img  = new Image();
      img.onload = () => {
        ctx.drawImage(img, ox, oy, svgRect.width, svgRect.height);
        URL.revokeObjectURL(url);
        saveSnapshot(canvas, actId, map, container);
      };
      img.onerror = () => { URL.revokeObjectURL(url); saveSnapshot(canvas, actId, map, container); };
      img.src = url;
    } else {
      saveSnapshot(canvas, actId, map, container);
    }
  } catch (_) {}
}

function saveSnapshot(canvas, actId, map, container) {
  try {
    // WebP is ~30% smaller than JPEG at equal quality; fall back to JPEG if unsupported
    const fmt  = canvas.toDataURL('image/webp', 0.01).startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg';
    const data = canvas.toDataURL(fmt, 0.7);
    localStorage.setItem(`icu_map_snap_${actId}`, data);

    // Swap the live Leaflet map out for a static img immediately —
    // prevents Leaflet from glitching during carousel scroll on first load
    if (container) {
      try { map.remove(); } catch (_) {}
      // Remove from tracked maps array
      if (state.recentActivityMaps) {
        const idx = state.recentActivityMaps.indexOf(map);
        if (idx !== -1) state.recentActivityMaps.splice(idx, 1);
      }
      container.innerHTML = `<img src="${data}" style="width:100%;height:100%;object-fit:cover;display:block;">`;
    }
  } catch (_) {
    // localStorage quota exceeded — silently skip
  }
}

/* ====================================================
   WEATHER
==================================================== */

// Colored SVG weather icons
const WEATHER_SVGS = {
  sun: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="20" r="8" fill="#FBBF24"/><g stroke="#FBBF24" stroke-width="2.5" stroke-linecap="round"><line x1="20" y1="4" x2="20" y2="8"/><line x1="20" y1="32" x2="20" y2="36"/><line x1="4" y1="20" x2="8" y2="20"/><line x1="32" y1="20" x2="36" y2="20"/><line x1="8.69" y1="8.69" x2="11.52" y2="11.52"/><line x1="28.48" y1="28.48" x2="31.31" y2="31.31"/><line x1="31.31" y1="8.69" x2="28.48" y2="11.52"/><line x1="11.52" y1="28.48" x2="8.69" y2="31.31"/></g></svg>`,
  cloud: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M30 27H13a7 7 0 1 1 1.4-13.86A8 8 0 1 1 30 27z" fill="#94A3B8"/></svg>`,
  pcloud: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="15" cy="15" r="6" fill="#FBBF24"/><g stroke="#FBBF24" stroke-width="2" stroke-linecap="round"><line x1="15" y1="5" x2="15" y2="7.5"/><line x1="15" y1="22.5" x2="15" y2="25"/><line x1="5" y1="15" x2="7.5" y2="15"/><line x1="22.5" y1="15" x2="25" y2="15"/><line x1="7.93" y1="7.93" x2="9.7" y2="9.7"/><line x1="20.3" y1="20.3" x2="22.07" y2="22.07"/><line x1="22.07" y1="7.93" x2="20.3" y2="9.7"/><line x1="9.7" y1="20.3" x2="7.93" y2="22.07"/></g><path d="M34 32H20a6 6 0 1 1 1.2-11.88A7 7 0 1 1 34 32z" fill="#CBD5E1"/></svg>`,
  rain: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M30 24H13a7 7 0 1 1 1.4-13.86A8 8 0 1 1 30 24z" fill="#64748B"/><g stroke="#60A5FA" stroke-width="2.5" stroke-linecap="round"><line x1="13" y1="29" x2="11" y2="36"/><line x1="20" y1="29" x2="18" y2="36"/><line x1="27" y1="29" x2="25" y2="36"/></g></svg>`,
  drizzle: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M30 24H13a7 7 0 1 1 1.4-13.86A8 8 0 1 1 30 24z" fill="#94A3B8"/><g stroke="#93C5FD" stroke-width="2.5" stroke-linecap="round"><line x1="14" y1="29" x2="13" y2="34"/><line x1="20" y1="29" x2="19" y2="34"/><line x1="26" y1="29" x2="25" y2="34"/></g></svg>`,
  snow: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M30 22H13a7 7 0 1 1 1.4-13.86A8 8 0 1 1 30 22z" fill="#94A3B8"/><g stroke="#BAE6FD" stroke-width="2" stroke-linecap="round"><line x1="14" y1="28" x2="14" y2="36"/><line x1="10" y1="32" x2="18" y2="32"/><line x1="11" y1="29" x2="17" y2="35"/><line x1="17" y1="29" x2="11" y2="35"/><line x1="26" y1="28" x2="26" y2="36"/><line x1="22" y1="32" x2="30" y2="32"/><line x1="23" y1="29" x2="29" y2="35"/><line x1="29" y1="29" x2="23" y2="35"/></g></svg>`,
  hail: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M30 23H13a7 7 0 1 1 1.4-13.86A8 8 0 1 1 30 23z" fill="#64748B"/><circle cx="14" cy="31" r="2.5" fill="#BAE6FD"/><circle cx="22" cy="36" r="2.5" fill="#BAE6FD"/><circle cx="30" cy="31" r="2.5" fill="#BAE6FD"/></svg>`,
  storm: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M30 23H13a7 7 0 1 1 1.4-13.86A8 8 0 1 1 30 23z" fill="#475569"/><polyline points="22,24 17,32 21,32 16,40" stroke="#FCD34D" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`,
  fog: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M28 15H15a5 5 0 1 1 1-9.9A6 6 0 1 1 28 15z" fill="#CBD5E1"/><g stroke="#94A3B8" stroke-width="2.5" stroke-linecap="round"><line x1="6" y1="21" x2="34" y2="21"/><line x1="9" y1="27" x2="31" y2="27"/><line x1="13" y1="33" x2="27" y2="33"/></g></svg>`,
  wind: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 15h18a4 4 0 1 0-4-4" stroke="#94A3B8" stroke-width="2.5" stroke-linecap="round" fill="none"/><path d="M6 22h24a4 4 0 1 1-4 4" stroke="#94A3B8" stroke-width="2.5" stroke-linecap="round" fill="none"/><path d="M6 29h14a3 3 0 1 0-3-3" stroke="#94A3B8" stroke-width="2.5" stroke-linecap="round" fill="none"/></svg>`,
  temp: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="17" y="6" width="6" height="20" rx="3" fill="#94A3B8"/><circle cx="20" cy="30" r="5" fill="#F87171"/><rect x="18.5" y="14" width="3" height="14" rx="1.5" fill="#F87171"/></svg>`,
  moon: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M32 22.5A12 12 0 1 1 17.5 8a9 9 0 0 0 14.5 14.5z" fill="#FCD34D"/></svg>`,
};

// Map intervals.icu icon string → SVG
function weatherIconSvg(iconStr) {
  if (!iconStr) return WEATHER_SVGS.sun;
  const s = iconStr.toLowerCase();
  if (s.includes('thunder') || s.includes('storm'))                    return WEATHER_SVGS.storm;
  if (s.includes('snow') || s.includes('sleet') || s.includes('blizzard')) return WEATHER_SVGS.snow;
  if (s.includes('rain') || s.includes('drizzle') || s.includes('shower')) return WEATHER_SVGS.rain;
  if (s.includes('fog')  || s.includes('mist') || s.includes('haze'))  return WEATHER_SVGS.fog;
  if (s.includes('wind') || s.includes('breezy'))                      return WEATHER_SVGS.wind;
  if (s.includes('overcast') || s === 'cloudy')                        return WEATHER_SVGS.cloud;
  if (s.includes('partly') || s.includes('mostly') || s.includes('cloud')) return WEATHER_SVGS.pcloud;
  if (s.includes('night'))                                             return WEATHER_SVGS.moon;
  return WEATHER_SVGS.sun;
}

// Map Open-Meteo WMO code → SVG / label
function wmoIcon(code) {
  if ([95,96,99].includes(code))           return WEATHER_SVGS.storm;
  if ([77,85,86].includes(code))           return WEATHER_SVGS.hail;
  if ([71,73,75].includes(code))           return WEATHER_SVGS.snow;
  if ([80,81,82].includes(code))           return WEATHER_SVGS.rain;
  if ([56,57,61,63,65,66,67].includes(code)) return WEATHER_SVGS.rain;
  if ([51,53,55].includes(code))           return WEATHER_SVGS.drizzle;
  if ([45,48].includes(code))              return WEATHER_SVGS.fog;
  if (code === 3)                          return WEATHER_SVGS.cloud;
  if (code === 2)                          return WEATHER_SVGS.pcloud;
  if (code === 1)                          return WEATHER_SVGS.pcloud;
  return WEATHER_SVGS.sun;
}
function wmoLabel(code) {
  if ([95,96,99].includes(code))       return 'Thunderstorm';
  if ([85,86].includes(code))          return 'Snow showers';
  if ([71,73,75,77].includes(code))    return 'Snow';
  if ([80,81,82].includes(code))       return 'Showers';
  if ([66,67].includes(code))          return 'Freezing rain';
  if ([61,63,65].includes(code))       return 'Rain';
  if ([56,57].includes(code))          return 'Freezing drizzle';
  if ([51,53,55].includes(code))       return 'Drizzle';
  if ([45,48].includes(code))          return 'Fog';
  if (code === 3)                      return 'Overcast';
  if (code === 2)                      return 'Mostly cloudy';
  if (code === 1)                      return 'Partly cloudy';
  return 'Clear';
}

// Degrees → compass cardinal
function windDir(deg) {
  if (deg == null) return '';
  return ['N','NE','E','SE','S','SW','W','NW'][Math.round(deg / 45) % 8];
}

// Temperature: intervals.icu always stores °C
function fmtTempC(c) {
  if (c == null) return '—';
  if (state.units === 'imperial') return Math.round(c * 9/5 + 32) + '°F';
  return Math.round(c) + '°C';
}

// Wind: intervals.icu stores m/s
function fmtWindMs(ms) {
  if (ms == null) return '—';
  if (state.units === 'imperial') return Math.round(ms * 2.23694) + ' mph';
  return Math.round(ms * 3.6) + ' km/h';
}

// ── Activity weather card (data from intervals.icu activity fields) ──────────
function renderActivityWeather(a) {
  const card = document.getElementById('detailWeatherCard');
  if (!card) return;

  const temp     = a.weather_temp;          // °C
  const feels    = a.weather_apparent_temp; // °C
  const windMs   = a.weather_wind_speed;    // m/s
  const windDeg  = a.weather_wind_bearing;
  const humidity = a.weather_humidity;      // 0–1
  const icon     = a.weather_icon;
  const summary  = a.weather_summary;
  const uv       = a.weather_uvindex;
  const pressure = a.weather_pressure;      // hPa
  const precip   = a.weather_precip_probability; // 0–1

  if (temp == null) { showCardNA('detailWeatherCard'); return; }
  clearCardNA(card);
  card.style.display = '';

  // Riding-condition colour hint
  const isRain  = icon && (icon.includes('rain') || icon.includes('drizzle') || icon.includes('storm') || icon.includes('sleet'));
  const isSnow  = icon && (icon.includes('snow') || icon.includes('blizzard'));
  const isCold  = state.units === 'imperial' ? (temp * 9/5 + 32) < 40 : temp < 5;
  const quality = (isSnow || isCold) ? 'poor' : isRain ? 'fair' : 'good';
  const qLabel  = quality === 'good' ? 'Good riding conditions' : quality === 'fair' ? 'Marginal conditions' : 'Tough conditions';

  const tiles = [];

  // Main tile: icon + condition + temp
  tiles.push(`
    <div class="wx-tile wx-tile--main">
      <div class="wx-main-icon">${weatherIconSvg(icon)}</div>
      <div class="wx-main-info">
        <div class="wx-condition">${summary || (icon ? icon.replace(/-/g, ' ') : 'Conditions')}</div>
        <div class="wx-temp">${fmtTempC(temp)}</div>
        <div class="wx-riding-pill wx-riding-pill--${quality}">${qLabel}</div>
      </div>
    </div>`);

  if (feels    != null) tiles.push(`<div class="wx-tile"><div class="wx-lbl">Feels like</div><div class="wx-val">${fmtTempC(feels)}</div></div>`);
  if (windMs   != null) tiles.push(`<div class="wx-tile"><div class="wx-lbl">Wind</div><div class="wx-val">${fmtWindMs(windMs)}<span class="wx-sub"> ${windDir(windDeg)}</span></div></div>`);
  if (humidity != null) tiles.push(`<div class="wx-tile"><div class="wx-lbl">Humidity</div><div class="wx-val">${Math.round(humidity * 100)}%</div></div>`);
  if (uv       != null) tiles.push(`<div class="wx-tile"><div class="wx-lbl">UV Index</div><div class="wx-val">${uv}</div></div>`);
  if (precip   != null) tiles.push(`<div class="wx-tile"><div class="wx-lbl">Precip</div><div class="wx-val">${Math.round(precip * 100)}%</div></div>`);
  if (pressure != null) tiles.push(`<div class="wx-tile"><div class="wx-lbl">Pressure</div><div class="wx-val">${Math.round(pressure)}<span class="wx-sub"> hPa</span></div></div>`);

  document.getElementById('wxTiles').innerHTML = tiles.join('');
}

// ── 7-day riding forecast (Open-Meteo, free, no API key) ────────────────────
async function renderWeatherForecast() {
  const card = document.getElementById('forecastCard');
  if (!card) return;

  // Get coordinates — try cached coords first, then geocode from city/country
  let lat = null, lng = null;

  try {
    const cached = localStorage.getItem('icu_wx_coords');
    if (cached) { const c = JSON.parse(cached); lat = c.lat; lng = c.lng; }
  } catch (_) {}

  if (lat == null) {
    // No location set yet — show a prompt card instead
    card.style.display = '';
    card.innerHTML = `
      <div class="card-header">
        <div>
          <div class="card-title">Riding Forecast</div>
          <div class="card-subtitle">Set your location to see the weather</div>
        </div>
      </div>
      <div class="wx-no-location">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32"><path d="M12 2a7 7 0 0 1 7 7c0 5.25-7 13-7 13S5 14.25 5 9a7 7 0 0 1 7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
        <p>No location set. Add your city in <strong>Settings → Weather Location</strong>.</p>
        <button class="btn btn-primary btn-sm" onclick="navigate('settings')">Go to Settings</button>
      </div>`;
    return;
  }

  // 30-minute cache to avoid hammering the API
  const CACHE_KEY = 'icu_wx_forecast';
  const CACHE_TS  = 'icu_wx_forecast_ts';
  const AGE_MS    = 30 * 60 * 1000;
  let forecast = null;

  try {
    const cached = localStorage.getItem(CACHE_KEY);
    const ts     = +localStorage.getItem(CACHE_TS);
    if (cached && ts && Date.now() - ts < AGE_MS) forecast = JSON.parse(cached);
  } catch (_) {}

  if (!forecast) {
    const tUnit = state.units === 'imperial' ? 'fahrenheit' : 'celsius';
    const wUnit = state.units === 'imperial' ? 'mph' : 'kmh';
    const wxModel = localStorage.getItem('icu_wx_model') || 'best_match';
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode,windspeed_10m_max&timezone=auto&forecast_days=7&temperature_unit=${tUnit}&wind_speed_unit=${wUnit}&models=${wxModel}`;
    try {
      const res = await fetch(url);
      if (res.ok) {
        forecast = await res.json();
        localStorage.setItem(CACHE_KEY, JSON.stringify(forecast));
        localStorage.setItem(CACHE_TS, Date.now().toString());
      }
    } catch (_) {}
  }

  if (!forecast?.daily) { card.style.display = 'none'; return; }

  const { time, temperature_2m_max: highs, temperature_2m_min: lows,
          precipitation_probability_max: precips, weathercode: codes,
          windspeed_10m_max: winds } = forecast.daily;

  const deg = state.units === 'imperial' ? '°F' : '°C';

  // Score each day for cycling suitability
  function ridingScore(i) {
    const code   = codes[i];
    const wind   = winds?.[i] ?? 0;
    const precip = precips?.[i] ?? 0;
    const high   = highs[i];
    const isRain  = [51,53,55,56,57,61,63,65,67,80,81,82,95,96,99].includes(code);
    const isSnow  = [71,73,75,77,85,86].includes(code);
    const isCold  = state.units === 'imperial' ? high < 40 : high < 4;
    const isWindy = state.units === 'imperial' ? wind > 25 : wind > 40;
    if (isSnow || isCold)           return 'poor';
    if (isRain && precip > 60)      return 'poor';
    if (isRain || isWindy || precip > 30) return 'fair';
    return 'good';
  }

  // Use city from athlete profile, or fall back to timezone from forecast response
  const athleteCity = state.athlete?.city;
  const athleteCountry = state.athlete?.country;
  let location = athleteCity
    ? [athleteCity, athleteCountry].filter(Boolean).join(', ')
    : forecast.timezone?.split('/').pop()?.replace(/_/g, ' ') || 'Your area';

  const scoreLabel = { good: 'Great', fair: 'Fair', poor: 'Poor' };
  const days = time.map((dateStr, i) => {
    const d       = new Date(dateStr + 'T12:00:00');
    const isToday = i === 0;
    const dayName = isToday ? 'Today'
                 : i === 1  ? 'Tmrw'
                 : d.toLocaleDateString('en-US', { weekday: 'short' });
    const score     = ridingScore(i);
    const precipPct = precips?.[i] ?? 0;
    const precipHTML = precipPct > 10
      ? `<div class="wx-day-precip"><svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10"><path d="M12 2C8 8 5 12.5 5 15.5a7 7 0 0 0 14 0C19 12.5 16 8 12 2z"/></svg>${Math.round(precipPct)}%</div>`
      : `<div class="wx-day-precip"></div>`;
    return `
      <div class="wx-day wx-day--${score}${isToday ? ' wx-day--today' : ''}" onclick="navigate('weather'); setTimeout(() => renderWeatherDayDetail(${i}), 50)">
        <div class="wx-day-name">${dayName}</div>
        <div class="wx-day-icon">${wmoIcon(codes[i])}</div>
        <div class="wx-day-label">${wmoLabel(codes[i])}</div>
        <div class="wx-day-temps">
          <span class="wx-day-hi">${Math.round(highs[i])}°</span>
          <span class="wx-day-lo">${Math.round(lows[i])}°</span>
        </div>
        ${precipHTML}
        <div class="wx-score-badge wx-score-badge--${score}">${scoreLabel[score]}</div>
      </div>`;
  }).join('');

  card.style.display = '';
  card.innerHTML = `
    <div class="card-header">
      <div>
        <div class="card-title">Riding Forecast</div>
        <div class="card-subtitle">${location}</div>
      </div>
      <div class="wx-legend">
        <div class="wx-legend-item"><div class="wx-riding-dot wx-riding-dot--good"></div>Good</div>
        <div class="wx-legend-item"><div class="wx-riding-dot wx-riding-dot--fair"></div>Fair</div>
        <div class="wx-legend-item"><div class="wx-riding-dot wx-riding-dot--poor"></div>Poor</div>
      </div>
    </div>
    <div class="wx-forecast-row">${days}</div>`;
}

/* ====================================================
   WEATHER PAGE
==================================================== */
async function renderWeatherPage() {
  const container = document.getElementById('weatherPageContent');
  if (!container) return;

  // Hide the day-detail back button if returning from detail sub-page
  const wxdBack = document.getElementById('wxdTopbarBack');
  if (wxdBack) wxdBack.style.display = 'none';
  // Restore weather page title
  const titleEl    = document.getElementById('pageTitle');
  const subtitleEl = document.getElementById('pageSubtitle');
  if (titleEl)    titleEl.textContent    = 'Weather';
  if (subtitleEl) subtitleEl.textContent = '7-day cycling forecast';

  // Check for saved location
  let lat = null, lng = null, locationLabel = 'Your area';
  try {
    const cached = localStorage.getItem('icu_wx_coords');
    if (cached) {
      const c = JSON.parse(cached);
      lat = c.lat; lng = c.lng;
      locationLabel = c.city || locationLabel;
    }
  } catch (_) {}

  if (lat == null) {
    container.innerHTML = `
      <div class="wx-page-empty">
        <div class="wx-page-empty-icon">${WEATHER_SVGS.fog}</div>
        <h3>No location set</h3>
        <p>Set your city in Settings to get your riding forecast.</p>
        <button class="btn btn-primary" onclick="navigate('settings')">Go to Settings</button>
      </div>`;
    return;
  }

  container.innerHTML = `<div class="wx-page-loading"><div class="spinner"></div><p>Fetching forecast…</p></div>`;

  // Fetch detailed forecast — daily + hourly for today & tomorrow
  const tUnit = state.units === 'imperial' ? 'fahrenheit' : 'celsius';
  const wUnit = state.units === 'imperial' ? 'mph' : 'kmh';
  const deg   = state.units === 'imperial' ? '°F' : '°C';
  const windLbl = state.units === 'imperial' ? 'mph' : 'km/h';

  const CACHE_KEY = 'icu_wx_page';
  const CACHE_TS  = 'icu_wx_page_ts';
  const AGE_MS    = 30 * 60 * 1000;
  let data = null;

  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const ts  = +localStorage.getItem(CACHE_TS);
    if (raw && ts && Date.now() - ts < AGE_MS) data = JSON.parse(raw);
  } catch (_) {}

  if (!data) {
    const wxModel = localStorage.getItem('icu_wx_model') || 'best_match';
    const url = `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}` +
      `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,windspeed_10m_max,winddirection_10m_dominant,uv_index_max,sunrise,sunset` +
      `&hourly=temperature_2m,precipitation_probability,weathercode,windspeed_10m` +
      `&timezone=auto&forecast_days=7` +
      `&temperature_unit=${tUnit}&wind_speed_unit=${wUnit}&models=${wxModel}`;
    try {
      const res = await fetch(url);
      if (res.ok) {
        data = await res.json();
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        localStorage.setItem(CACHE_TS, Date.now().toString());
      }
    } catch (_) {}
  }

  if (!data?.daily) {
    container.innerHTML = `<div class="wx-page-empty"><p>Could not load forecast. Check your connection.</p></div>`;
    return;
  }

  // Save to state so day-detail sub-page can access it
  state.weatherPageData = data;
  state.weatherPageMeta = { deg, windLbl, locationLabel, lat, lng };

  const { time, weathercode: codes, temperature_2m_max: highs, temperature_2m_min: lows,
          precipitation_probability_max: precips, precipitation_sum: rainMm,
          windspeed_10m_max: winds, winddirection_10m_dominant: windDirs,
          uv_index_max: uvs, sunrise: sunrises, sunset: sunsets } = data.daily;

  // ── Ride score (0–100) with reasons ─────────────────────────────────────
  function rideScore(i) {
    const code   = codes[i];
    const wind   = winds?.[i] ?? 0;
    const precip = precips?.[i] ?? 0;
    const rain   = rainMm?.[i] ?? 0;
    const high   = highs[i];
    const low    = lows[i];
    const uv     = uvs?.[i] ?? 0;
    const isMetric = state.units !== 'imperial';

    const isSnow  = [71,73,75,77,85,86].includes(code);
    const isStorm = [95,96,99].includes(code);
    const isRain  = [51,53,55,56,57,61,63,65,67,80,81,82].includes(code);
    const isDriz  = [51,53,55].includes(code);
    const isFog   = [45,48].includes(code);
    const isClear = [0,1].includes(code);
    const isCloudy= [2,3].includes(code);

    const coldThresh  = isMetric ? 4  : 40;
    const hotThresh   = isMetric ? 35 : 95;
    const windThresh  = isMetric ? 32 : 20;   // starts feeling tough on a bike
    const windPoor    = isMetric ? 52 : 32;   // genuinely hard riding

    const reasons = [];
    let score = 100;

    // ── Weather condition ─────────────────────────────────────────────────
    if (isStorm)               { score -= 75; reasons.push('⛈ Thunderstorms expected'); }
    else if (isSnow)           { score -= 65; reasons.push('❄️ Snow or sleet forecast'); }
    else if (isRain && !isDriz){ score -= 45 + Math.min(precip, 55) * 0.5; reasons.push(`🌧 Rain (${Math.round(precip)}% chance)`); }
    else if (isDriz)           { score -= 30; reasons.push(`🌦 Drizzle expected`); }
    else if (isFog)            { score -= 25; reasons.push('🌫 Foggy — low visibility'); }

    // ── Precipitation probability (catches mismatches where code looks clear
    //    but rain chance is still significant) ─────────────────────────────
    if (!isRain && !isDriz && !isSnow && !isStorm) {
      if      (precip >= 60) { score -= 30; reasons.push(`🌧 ${Math.round(precip)}% rain chance`); }
      else if (precip >= 40) { score -= 18; reasons.push(`🌦 ${Math.round(precip)}% rain chance`); }
      else if (precip >= 25) { score -= 8;  reasons.push(`🌂 ${Math.round(precip)}% rain chance`); }
    }

    // ── Temperature ───────────────────────────────────────────────────────
    if (high < coldThresh)               { score -= 35; reasons.push(`🥶 Very cold (high ${Math.round(high)}${deg})`); }
    else if (high < (isMetric ? 8 : 46)) { score -= 20; reasons.push(`🌡 Chilly (high ${Math.round(high)}${deg})`); }
    else if (high > hotThresh)           { score -= 25; reasons.push(`🥵 Extreme heat (${Math.round(high)}${deg})`); }

    // ── Wind ──────────────────────────────────────────────────────────────
    if (wind > windPoor)       { score -= 35; reasons.push(`💨 Very strong winds (${Math.round(wind)} ${windLbl})`); }
    else if (wind > windThresh){ score -= 20; reasons.push(`💨 Windy (${Math.round(wind)} ${windLbl})`); }

    // ── Positive indicators (only on genuinely good days) ─────────────────
    if (score >= 80) {
      if (isClear)   reasons.unshift('☀️ Clear skies');
      else if (isCloudy) reasons.unshift('⛅ Mostly cloudy but dry');
      if (uv >= 6)   reasons.push(`🕶 High UV (${uv}) — wear sunscreen`);
    }

    score = Math.max(0, Math.min(100, Math.round(score)));
    // Stricter thresholds — a great day should genuinely be great
    const label = score >= 80 ? 'great' : score >= 55 ? 'good' : score >= 30 ? 'fair' : 'poor';
    return { score, label, reasons };
  }

  // ── Best time window today (hourly) ──────────────────────────────────────
  function bestRideWindow() {
    if (!data.hourly) return null;
    const { time: hTimes, temperature_2m: hTemps, precipitation_probability: hPrecip,
            weathercode: hCodes, windspeed_10m: hWind } = data.hourly;

    const todayStr = time[0]; // 'YYYY-MM-DD'
    const todayHours = hTimes
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => t.startsWith(todayStr))
      .filter(({ i }) => {
        const h = new Date(hTimes[i]).getHours();
        return h >= 6 && h <= 20; // 6am–8pm
      });

    if (!todayHours.length) return null;

    // Score each hour
    const scored = todayHours.map(({ i }) => {
      const h    = new Date(hTimes[i]).getHours();
      const temp = hTemps[i] ?? 15;
      const prec = hPrecip[i] ?? 0;
      const wind = hWind[i] ?? 0;
      const code = hCodes[i] ?? 0;
      const isMetric = state.units !== 'imperial';
      const coldT = isMetric ? 4 : 39;
      let s = 100;
      if ([95,96,99,71,73,75,77,85,86].includes(code)) s -= 60;
      else if ([61,63,65,67,80,81,82].includes(code)) s -= 30;
      else if ([51,53,55,56,57].includes(code)) s -= 15;
      if (temp < coldT) s -= 25;
      if (prec > 60) s -= 25;
      else if (prec > 30) s -= 10;
      if (wind > (isMetric ? 50 : 31)) s -= 20;
      return { h, score: Math.max(0, s) };
    });

    // Find longest contiguous stretch of hours with score ≥ 60
    let best = null, cur = [];
    for (const pt of scored) {
      if (pt.score >= 60) { cur.push(pt); }
      else {
        if (!best || cur.length > best.length) best = [...cur];
        cur = [];
      }
    }
    if (!best || cur.length > best.length) best = [...cur];
    if (!best?.length) return null;

    const fmt = h => { const ampm = h >= 12 ? 'pm' : 'am'; return `${h > 12 ? h-12 : h || 12}${ampm}`; };
    const endH = best[best.length-1].h + 1;
    return { label: `${fmt(best[0].h)} – ${fmt(endH)}`, endH };
  }

  const rideWindow = bestRideWindow();
  const nowH = new Date().getHours() + new Date().getMinutes() / 60;
  const rideWindowMissed = rideWindow && nowH >= rideWindow.endH;

  // ── Build HTML ────────────────────────────────────────────────────────────
  const DAYS_OF_WEEK = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  // Weekly overview cards
  const weekCards = time.map((dateStr, i) => {
    const d      = new Date(dateStr + 'T12:00:00');
    const dayName = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : DAYS_OF_WEEK[d.getDay()];
    const full   = i === 0 ? 'Today' : i === 1 ? 'Tomorrow'
                 : d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    const { score, label, reasons } = rideScore(i);
    const precipPct = Math.round(precips?.[i] ?? 0);
    const rainVal   = rainMm?.[i] ?? 0;
    const windVal   = Math.round(winds?.[i] ?? 0);
    const wdir      = windDir(windDirs?.[i] ?? 0);
    const uvVal     = Math.round(uvs?.[i] ?? 0);

    // Sunrise/sunset — format from ISO string
    let srStr = '—', ssStr = '—';
    try {
      srStr = new Date(sunrises[i]).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      ssStr = new Date(sunsets[i]).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } catch (_) {}

    const topReasons = reasons.slice(0, 3);
    const reasonHtml = topReasons.map(r => `<div class="wxp-reason">${r}</div>`).join('');

    return `
      <div class="wxp-day-card wxp-day-card--${label}" data-day-idx="${i}">
        <div class="wxp-day-header">
          <div class="wxp-day-name-wrap">
            <span class="wxp-day-name">${dayName}</span>
            ${i > 1 ? `<span class="wxp-day-full">${full}</span>` : ''}
          </div>
          <div class="wxp-day-icon-row">
            <div class="wxp-day-icon">${wmoIcon(codes[i])}</div>
            <div class="wxp-score-badge wxp-score--${label}" title="WMO code: ${codes[i]}">${label === 'great' ? '🚴 Great' : label === 'good' ? '👍 Good' : label === 'fair' ? '⚠️ Fair' : '✗ Poor'}</div>
          </div>
        </div>
        <div class="wxp-day-conditions">
          <div class="wxp-cond-row">
            <span class="wxp-cond-icon">${WEATHER_SVGS.temp}</span>
            <span class="wxp-cond-val">${Math.round(highs[i])}° / ${Math.round(lows[i])}°</span>
          </div>
          <div class="wxp-cond-row">
            <span class="wxp-cond-icon">${WEATHER_SVGS.rain}</span>
            <span class="wxp-cond-val">${precipPct}%${rainVal > 0.5 ? ` · ${rainVal.toFixed(1)} mm` : ''}</span>
          </div>
          <div class="wxp-cond-row">
            <span class="wxp-cond-icon">${WEATHER_SVGS.wind}</span>
            <span class="wxp-cond-val">${windVal} ${windLbl} ${wdir}</span>
          </div>
          <div class="wxp-cond-row">
            <span class="wxp-cond-label">UV</span>
            <span class="wxp-cond-val">${uvVal} · 🌅 ${srStr}</span>
          </div>
        </div>
        <div class="wxp-score-bar-wrap">
          <div class="wxp-score-bar wxp-score-bar--${label}" style="width:${score}%"></div>
        </div>
        <div class="wxp-reasons">${reasonHtml}</div>
      </div>`;
  }).join('');

  // Best days to ride (score ≥ 50, top 3 sorted by score)
  const scored7 = time.map((_, i) => ({ i, ...rideScore(i) }))
    .filter(d => d.score >= 50)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const bestCardsHtml = scored7.length ? scored7.map(({ i, score, label, reasons }) => {
    const d = new Date(time[i] + 'T12:00:00');
    const name = i === 0 ? 'Today' : i === 1 ? 'Tomorrow'
               : d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    const tip = reasons.filter(r => r.startsWith('☀') || r.startsWith('⛅') || r.startsWith('🕶') || r.startsWith('👌')).join(' · ') || reasons[0] || 'Good conditions';
    const badgeLabel = label === 'great' ? '🚴 Great' : label === 'good' ? '👍 Good' : '⚠️ Fair';
    return `
      <div class="card wxp-best-card wxp-best--${label}" data-day-idx="${i}">
        <div class="wxp-best-head">
          <div class="wxp-best-day">${name}</div>
          <div class="wxp-score-badge wxp-score--${label}">${badgeLabel}</div>
        </div>
        <div class="wxp-best-mid">
          <div class="wxp-best-icon">${wmoIcon(codes[i])}</div>
          <div class="wxp-best-score-num">${score}<span>/ 100</span></div>
        </div>
        <div class="wxp-best-stats">
          <div class="wxp-best-temp">${Math.round(highs[i])}${deg} <span class="wxp-best-low">/ ${Math.round(lows[i])}${deg}</span></div>
          <div class="wxp-best-meta">💨 ${Math.round(winds[i])} ${windLbl} · 🌧 ${Math.round(precips[i] ?? 0)}%</div>
        </div>
        <div class="wxp-best-score-bar">
          <div class="wxp-best-score-fill wxp-best-score--${label}" style="width:${score}%"></div>
        </div>
        <div class="wxp-best-tip">${tip}</div>
      </div>`;
  }).join('') : '';

  // Days to avoid (score < 30)
  const badDays = time.map((_, i) => ({ i, ...rideScore(i) }))
    .filter(d => d.score < 30);

  const badDaysHtml = badDays.length ? badDays.map(({ i, score, reasons }) => {
    const d = new Date(time[i] + 'T12:00:00');
    const name = i === 0 ? 'Today' : i === 1 ? 'Tomorrow'
               : d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    return `
      <div class="wxp-avoid-card">
        <div class="wxp-avoid-icon">${wmoIcon(codes[i])}</div>
        <div class="wxp-avoid-info">
          <div class="wxp-avoid-day">${name}</div>
          <div class="wxp-avoid-reasons">${reasons.slice(0,2).join(' · ')}</div>
        </div>
        <div class="wxp-avoid-score">${score}<span>/100</span></div>
      </div>`;
  }).join('') : '';

  // Weekly summary stats
  const avgHigh    = Math.round(highs.reduce((s,v)=>s+v,0)/highs.length);
  const maxWind    = Math.round(Math.max(...winds));
  const rainDays   = codes.filter(c => [51,53,55,56,57,61,63,65,67,80,81,82,95,96,99].includes(c)).length;
  const rideableDays = time.filter((_, i) => rideScore(i).score >= 50).length;
  const bestScore  = Math.max(...time.map((_,i)=>rideScore(i).score));
  const bestDayIdx = time.findIndex((_,i)=>rideScore(i).score===bestScore);
  const bestDayName = bestDayIdx === 0 ? 'Today' : bestDayIdx === 1 ? 'Tomorrow'
    : new Date(time[bestDayIdx]+'T12:00:00').toLocaleDateString('en-US',{weekday:'long'});

  // Mini 7-day strip for summary card
  const miniStripHtml = time.map((dateStr, i) => {
    const d       = new Date(dateStr + 'T12:00:00');
    const dayAbbr = i === 0 ? 'Now' : DAYS_OF_WEEK[d.getDay()];
    const { label } = rideScore(i);
    return `
      <div class="wxp-ms-day">
        <div class="wxp-ms-label">${dayAbbr}</div>
        <div class="wxp-ms-icon">${wmoIcon(codes[i])}</div>
        <div class="wxp-ms-temp">${Math.round(highs[i])}°</div>
        <div class="wxp-ms-dot wxp-ms-dot--${label}"></div>
      </div>`;
  }).join('');

  container.innerHTML = `
    <!-- Location switcher -->
    ${renderWxLocationSwitcher()}
    <!-- Location header -->
    <div class="wxp-location-bar">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M12 2a7 7 0 0 1 7 7c0 5.25-7 13-7 13S5 14.25 5 9a7 7 0 0 1 7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
      <span>${locationLabel}</span>
      <button class="wxp-change-loc btn btn-ghost btn-sm" onclick="navigate('settings')">Change</button>
      <button class="wxp-refresh-btn btn btn-ghost btn-sm" onclick="refreshWeatherPage()" title="Force refresh weather data">↺ Refresh</button>
    </div>

    <!-- Today's ride window -->
    ${rideWindow ? `
    <div class="card wxp-window-card${rideWindowMissed ? ' wxp-window-card--missed' : ''}">
      <div class="card-header">
        <div>
          <div class="card-title">Best Ride Window</div>
          <div class="card-subtitle">${rideWindowMissed ? 'Today\'s window has passed' : 'Today\'s optimal riding hours'}</div>
        </div>
        <div class="wxp-window-temps">${Math.round(highs[0])}° / ${Math.round(lows[0])}°</div>
      </div>
      <div class="wxp-window-inner">
        <div class="wxp-window-icon">${wmoIcon(codes[0])}</div>
        <div class="wxp-window-text">
          <div class="wxp-window-label">${rideWindowMissed ? 'Window missed' : 'Recommended window'}</div>
          <div class="wxp-window-time${rideWindowMissed ? ' wxp-window-time--missed' : ''}">${rideWindow.label}</div>
          ${rideWindowMissed ? '<div class="wxp-window-missed-note">You missed today\'s best window. Check tomorrow\'s forecast.</div>' : ''}
        </div>
      </div>
    </div>` : ''}

    <!-- Weekly summary — no card wrapper -->
    <div class="wxp-section-label">7-Day Summary</div>
    <!-- Mini icon strip -->
    <div class="wxp-mini-strip">${miniStripHtml}</div>
    <!-- Stat tiles -->
    <div class="wxp-stats-grid">
      <div class="wxp-st">
        <div class="wxp-st-icon">🌡</div>
        <div class="wxp-st-val">${avgHigh}<span>${deg}</span></div>
        <div class="wxp-st-lbl">Avg High</div>
      </div>
      <div class="wxp-st">
        <div class="wxp-st-icon">💨</div>
        <div class="wxp-st-val">${maxWind}<span> ${windLbl}</span></div>
        <div class="wxp-st-lbl">Max Wind</div>
      </div>
      <div class="wxp-st">
        <div class="wxp-st-icon">🌧</div>
        <div class="wxp-st-val">${rainDays}<span> d</span></div>
        <div class="wxp-st-lbl">Rain Days</div>
      </div>
      <div class="wxp-st wxp-st--highlight">
        <div class="wxp-st-icon">🚴</div>
        <div class="wxp-st-val">${rideableDays}<span> d</span></div>
        <div class="wxp-st-lbl">Rideable</div>
      </div>
    </div>

    <!-- Best days to ride — individual cards -->
    ${bestCardsHtml ? `
    <div class="wxp-section-label">Best Days to Ride</div>
    <div class="wxp-best-grid">${bestCardsHtml}</div>
    ` : `
    <div class="card wxp-no-rec-card">
      <div class="wxp-no-rec">No great riding days this week — looks like a tough stretch.</div>
    </div>
    `}

    ${badDaysHtml ? `
    <!-- Days to avoid -->
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">Days to Skip</div>
          <div class="card-subtitle">Poor riding conditions</div>
        </div>
      </div>
      <div class="wxp-avoid-list">${badDaysHtml}</div>
    </div>` : ''}

    <!-- Full weekly breakdown — standalone day cards -->
    <div class="wxp-section-label">This Week</div>
    <div class="wxp-week-scroll">${weekCards}</div>

    <!-- Data source footer -->
    <div class="wxp-data-source">
      <div class="wxp-ds-row">
        <span class="wxp-ds-label">Data source</span>
        <a class="wxp-ds-link" href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a>
        <span class="wxp-ds-sep">·</span>
        <span class="wxp-ds-label">Model</span>
        <span class="wxp-ds-val">${localStorage.getItem('icu_wx_model') || 'best_match'}</span>
      </div>
      <div class="wxp-ds-row">
        <span class="wxp-ds-label">Endpoint</span>
        <code class="wxp-ds-endpoint">api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&amp;longitude=${lng.toFixed(4)}&amp;daily=weathercode,…&amp;hourly=weathercode,…&amp;forecast_days=7&amp;timezone=auto&amp;models=${localStorage.getItem('icu_wx_model') || 'best_match'}</code>
      </div>
      <div class="wxp-ds-row">
        <span class="wxp-ds-label">Coordinates</span>
        <span class="wxp-ds-val">${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E</span>
        <span class="wxp-ds-sep">·</span>
        <span class="wxp-ds-label">Cache</span>
        <span class="wxp-ds-val">30 min (cleared on refresh)</span>
      </div>
      <div class="wxp-ds-row">
        <span class="wxp-ds-label">Weather codes</span>
        <a class="wxp-ds-link" href="https://open-meteo.com/en/docs#weathervariables" target="_blank" rel="noopener">WMO 4677 standard</a>
        <span class="wxp-ds-sep">·</span>
        <span class="wxp-ds-label">Hover score badges to see raw code per day</span>
      </div>
    </div>
  `;

  // Attach click handlers on day cards (with drag-detection guard)
  container.querySelectorAll('.wxp-day-card, .wxp-best-card').forEach(card => {
    let startX = 0, startY = 0, dragged = false;
    card.addEventListener('mousedown', e => {
      startX = e.clientX; startY = e.clientY; dragged = false;
    });
    card.addEventListener('mousemove', e => {
      if (Math.abs(e.clientX - startX) > 5 || Math.abs(e.clientY - startY) > 5) dragged = true;
    });
    card.addEventListener('mouseup', e => {
      if (!dragged) {
        const idx = parseInt(card.dataset.dayIdx, 10);
        if (!isNaN(idx)) renderWeatherDayDetail(idx);
      }
    });
    // Touch support
    card.addEventListener('touchstart', e => {
      startX = e.touches[0].clientX; startY = e.touches[0].clientY; dragged = false;
    }, { passive: true });
    card.addEventListener('touchmove', e => {
      if (Math.abs(e.touches[0].clientX - startX) > 8 || Math.abs(e.touches[0].clientY - startY) > 8) dragged = true;
    }, { passive: true });
    card.addEventListener('touchend', () => {
      if (!dragged) {
        const idx = parseInt(card.dataset.dayIdx, 10);
        if (!isNaN(idx)) renderWeatherDayDetail(idx);
      }
    });
  });

  // Attach drag-to-scroll on the week rail (desktop mouse drag)
  const rail = container.querySelector('.wxp-week-scroll');
  if (rail) {
    let isDown = false, startX = 0, scrollLeft = 0;
    rail.addEventListener('mousedown', e => {
      isDown = true;
      rail.classList.add('is-dragging');
      startX = e.pageX - rail.getBoundingClientRect().left;
      scrollLeft = rail.scrollLeft;
      e.preventDefault();
      e.stopPropagation();
    });
    document.addEventListener('mouseup', () => {
      isDown = false;
      rail.classList.remove('is-dragging');
    });
    document.addEventListener('mousemove', e => {
      if (!isDown) return;
      const x = e.pageX - rail.getBoundingClientRect().left;
      rail.scrollLeft = scrollLeft - (x - startX);
    });
    // Touch support
    rail.addEventListener('touchstart', e => {
      startX = e.touches[0].pageX - rail.getBoundingClientRect().left;
      scrollLeft = rail.scrollLeft;
    }, { passive: true });
    rail.addEventListener('touchmove', e => {
      const x = e.touches[0].pageX - rail.getBoundingClientRect().left;
      rail.scrollLeft = scrollLeft - (x - startX);
    }, { passive: true });
  }
}

function refreshWeatherPage() {
  localStorage.removeItem('icu_wx_page');
  localStorage.removeItem('icu_wx_page_ts');
  localStorage.removeItem('icu_wx_forecast');
  localStorage.removeItem('icu_wx_forecast_ts');
  renderWeatherPage();
}

/* ====================================================
   WEATHER DAY DETAIL SUB-PAGE
==================================================== */
function renderWeatherDayDetail(dayIdx) {
  const container = document.getElementById('weatherPageContent');
  if (!container) return;

  const data = state.weatherPageData;
  const meta = state.weatherPageMeta;
  if (!data?.daily || !meta) { renderWeatherPage(); return; }

  const { deg, windLbl } = meta;
  const isMetric = deg !== '°F';

  const { time, weathercode: codes, temperature_2m_max: highs, temperature_2m_min: lows,
          precipitation_probability_max: precips, precipitation_sum: rainMm,
          windspeed_10m_max: winds, winddirection_10m_dominant: windDirs,
          uv_index_max: uvs, sunrise: sunrises, sunset: sunsets } = data.daily;

  const i = dayIdx;
  const dateStr = time[i];
  const DAYS_OF_WEEK = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const d = new Date(dateStr + 'T12:00:00');
  const dayName = i === 0 ? 'Today' : i === 1 ? 'Tomorrow'
    : d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // ── Re-compute ride score for this day ───────────────────────────────────
  const code   = codes[i];
  const wind   = winds?.[i] ?? 0;
  const precip = precips?.[i] ?? 0;
  const rain   = rainMm?.[i] ?? 0;
  const high   = highs[i];
  const low    = lows[i];
  const uv     = uvs?.[i] ?? 0;
  const wdir   = windDir(windDirs?.[i] ?? 0);

  const isSnow  = [71,73,75,77,85,86].includes(code);
  const isStorm = [95,96,99].includes(code);
  const isRain  = [51,53,55,56,57,61,63,65,67,80,81,82].includes(code);
  const isDriz  = [51,53,55].includes(code);
  const isFog   = [45,48].includes(code);
  const isClear = [0,1].includes(code);
  const coldThresh = isMetric ? 4  : 40;
  const hotThresh  = isMetric ? 35 : 95;
  const windThresh = isMetric ? 32 : 20;
  const windPoor   = isMetric ? 52 : 32;

  const reasons = [];
  let score = 100;
  if (isStorm)               { score -= 75; reasons.push('⛈ Thunderstorms expected'); }
  else if (isSnow)           { score -= 65; reasons.push('❄️ Snow or sleet forecast'); }
  else if (isRain && !isDriz){ score -= 45 + Math.min(precip, 55) * 0.5; reasons.push(`🌧 Rain (${Math.round(precip)}% chance)`); }
  else if (isDriz)           { score -= 30; reasons.push(`🌦 Drizzle expected`); }
  else if (isFog)            { score -= 25; reasons.push('🌫 Foggy — low visibility'); }
  if (!isRain && !isDriz && !isSnow && !isStorm) {
    if      (precip >= 60) { score -= 30; reasons.push(`🌧 ${Math.round(precip)}% rain chance`); }
    else if (precip >= 40) { score -= 18; reasons.push(`🌦 ${Math.round(precip)}% rain chance`); }
    else if (precip >= 25) { score -= 8;  reasons.push(`🌂 ${Math.round(precip)}% rain chance`); }
  }
  if (high < coldThresh)               { score -= 35; reasons.push(`🥶 Very cold (high ${Math.round(high)}${deg})`); }
  else if (high < (isMetric ? 8 : 46)) { score -= 20; reasons.push(`🌡 Chilly (high ${Math.round(high)}${deg})`); }
  else if (high > hotThresh)           { score -= 25; reasons.push(`🥵 Extreme heat (${Math.round(high)}${deg})`); }
  if (wind > windPoor)       { score -= 35; reasons.push(`💨 Very strong winds (${Math.round(wind)} ${windLbl})`); }
  else if (wind > windThresh){ score -= 20; reasons.push(`💨 Windy (${Math.round(wind)} ${windLbl})`); }
  if (score >= 80) {
    if (isClear) reasons.unshift('☀️ Clear skies');
    else         reasons.unshift('⛅ Mostly cloudy but dry');
    if (uv >= 6) reasons.push(`🕶 High UV (${uv}) — wear sunscreen`);
  }
  score = Math.max(0, Math.min(100, Math.round(score)));
  const label = score >= 80 ? 'great' : score >= 55 ? 'good' : score >= 30 ? 'fair' : 'poor';

  // ── Sunrise / sunset ─────────────────────────────────────────────────────
  let srStr = '—', ssStr = '—';
  try {
    srStr = new Date(sunrises[i]).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    ssStr = new Date(sunsets[i]).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch (_) {}

  // ── Hourly data for this day ──────────────────────────────────────────────
  let hourlyHtml = '';
  let bestWindowStr = null;
  if (data.hourly) {
    const { time: hTimes, temperature_2m: hTemps, precipitation_probability: hPrecip,
            weathercode: hCodes, windspeed_10m: hWind } = data.hourly;

    const dayHours = hTimes
      .map((t, idx) => ({ t, idx }))
      .filter(({ t }) => t.startsWith(dateStr));

    // Best ride window for this day
    const rideHours = dayHours.filter(({ idx }) => {
      const h = new Date(hTimes[idx]).getHours();
      return h >= 6 && h <= 20;
    });
    const scoredHours = rideHours.map(({ idx }) => {
      const h    = new Date(hTimes[idx]).getHours();
      const temp = hTemps[idx] ?? 15;
      const prec = hPrecip[idx] ?? 0;
      const wnd  = hWind[idx] ?? 0;
      const cod  = hCodes[idx] ?? 0;
      const coldT = isMetric ? 4 : 39;
      let s = 100;
      if ([95,96,99,71,73,75,77,85,86].includes(cod)) s -= 60;
      else if ([61,63,65,67,80,81,82].includes(cod))  s -= 30;
      else if ([51,53,55,56,57].includes(cod))        s -= 15;
      if (temp < coldT) s -= 25;
      if (prec > 60) s -= 25;
      else if (prec > 30) s -= 10;
      if (wnd > (isMetric ? 50 : 31)) s -= 20;
      return { h, score: Math.max(0, s), idx };
    });

    let best = null, cur = [];
    for (const pt of scoredHours) {
      if (pt.score >= 60) { cur.push(pt); }
      else { if (!best || cur.length > best.length) best = [...cur]; cur = []; }
    }
    if (!best || cur.length > best.length) best = [...cur];
    if (best?.length) {
      const fmt = h => { const ampm = h >= 12 ? 'pm' : 'am'; return `${h > 12 ? h-12 : h || 12}${ampm}`; };
      bestWindowStr = `${fmt(best[0].h)} – ${fmt(best[best.length-1].h + 1)}`;
    }

    // Build hourly cards (every hour, 5am–9pm range shown)
    const displayHours = dayHours.filter(({ idx }) => {
      const h = new Date(hTimes[idx]).getHours();
      return h >= 5 && h <= 21;
    });

    const hourlyScoreMap = new Map(scoredHours.map(pt => [pt.idx, pt.score]));

    hourlyHtml = displayHours.map(({ idx }) => {
      const h     = new Date(hTimes[idx]).getHours();
      const ampm  = h >= 12 ? 'pm' : 'am';
      const hDisp = `${h > 12 ? h-12 : h || 12}${ampm}`;
      const temp  = hTemps[idx] != null ? Math.round(hTemps[idx]) : '—';
      const pr    = hPrecip[idx] ?? 0;
      const wnd   = hWind[idx] != null ? Math.round(hWind[idx]) : '—';
      const cod   = hCodes[idx] ?? 0;
      const hScore = hourlyScoreMap.get(idx);
      const dotLabel = hScore == null ? '' : hScore >= 75 ? 'great' : hScore >= 55 ? 'good' : hScore >= 35 ? 'fair' : 'poor';
      const dotHtml = dotLabel ? `<div class="wxd-h-dot wxd-h-dot--${dotLabel}"></div>` : '';
      return `
        <div class="wxd-h-card">
          <div class="wxd-h-time">${hDisp}</div>
          <div class="wxd-h-icon">${wmoIcon(cod)}</div>
          <div class="wxd-h-temp">${temp}°</div>
          <div class="wxd-h-wind">${wnd} ${windLbl}</div>
          <div class="wxd-h-rain">${Math.round(pr)}%</div>
          ${dotHtml}
        </div>`;
    }).join('');
  }

  // ── Ride Planner tips ─────────────────────────────────────────────────────
  function plannerTips() {
    const tips = [];

    // Kit recommendation
    if (high < coldThresh)               tips.push({ icon: '🧥', title: 'Kit', body: `Cold day — full thermal kit, wind vest, gloves & overshoes. Dress for ${Math.round(high)}${deg}.` });
    else if (high < (isMetric ? 10 : 50)) tips.push({ icon: '🧤', title: 'Kit', body: `Chilly — bib tights, long-sleeve base layer, arm warmers. High: ${Math.round(high)}${deg}.` });
    else if (high < (isMetric ? 18 : 65)) tips.push({ icon: '🚴', title: 'Kit', body: `Cool — jersey + arm warmers, knee warmers. May warm up midday.` });
    else if (high > hotThresh)            tips.push({ icon: '🌡', title: 'Kit', body: `Hot day — minimal kit, light colours, cooling vest if available. ${Math.round(high)}${deg} expected.` });
    else                                  tips.push({ icon: '🚴', title: 'Kit', body: `Comfortable temps — standard jersey & bibs. High: ${Math.round(high)}${deg}.` });

    // Rain gear
    if (isStorm)      tips.push({ icon: '⛈', title: 'Rain Gear', body: 'Thunderstorm forecast — consider an indoor session or reschedule.' });
    else if (isSnow)  tips.push({ icon: '❄️', title: 'Rain Gear', body: 'Snow forecast — not recommended. If riding, use full waterproofs & studded tyres.' });
    else if (isRain)  tips.push({ icon: '🌧', title: 'Rain Gear', body: 'Rain expected — waterproof jacket essential, mudguards recommended, check braking distance.' });
    else if (isDriz)  tips.push({ icon: '🌦', title: 'Rain Gear', body: 'Drizzle possible — light rain jacket or gilet in back pocket. Avoid white kit.' });
    else if (precip >= 40) tips.push({ icon: '🌂', title: 'Rain Gear', body: `${Math.round(precip)}% rain chance — pack a lightweight gilet as insurance.` });
    else              tips.push({ icon: '✅', title: 'Rain Gear', body: 'Dry conditions expected — no rain gear needed. Leave the jacket at home.' });

    // Wind strategy
    if (wind > windPoor)        tips.push({ icon: '💨', title: 'Wind Strategy', body: `Strong winds (${Math.round(wind)} ${windLbl} ${wdir}) — ride into the wind on the way out so you have it at your back coming home.` });
    else if (wind > windThresh) tips.push({ icon: '🍃', title: 'Wind Strategy', body: `Moderate wind (${Math.round(wind)} ${windLbl} ${wdir}) — expect effort spikes on exposed roads. Draft where possible.` });
    else                        tips.push({ icon: '🌿', title: 'Wind Strategy', body: `Light winds (${Math.round(wind)} ${windLbl}) — great day for time-trial efforts or PB attempts.` });

    // Sun / UV
    if (uv >= 8)       tips.push({ icon: '🕶', title: 'Sun Protection', body: `Very high UV index (${uv}) — SPF 50+ on all exposed skin, quality sunglasses essential.` });
    else if (uv >= 5)  tips.push({ icon: '☀️', title: 'Sun Protection', body: `Moderate UV (${uv}) — apply sunscreen before heading out, especially on shoulders & neck.` });
    else               tips.push({ icon: '🌤', title: 'Sun Protection', body: `Low UV (${uv}) — no special precautions needed. Sunglasses still useful for road debris.` });

    // Hydration
    if (high > (isMetric ? 28 : 82))   tips.push({ icon: '💧', title: 'Hydration', body: `Hot day — aim for at least 1 bottle (500ml) per 45 min. Add electrolyte mix in one bottle.` });
    else if (high > (isMetric ? 20 : 68)) tips.push({ icon: '🚰', title: 'Hydration', body: `Warm — 500ml/hr is a solid target. Note any cafes or water stops along the route.` });
    else                                tips.push({ icon: '🫗', title: 'Hydration', body: `Cool weather suppresses thirst — still drink 400–500ml/hr to stay on top of it.` });

    return tips;
  }

  const tips = plannerTips();
  const tipsHtml = tips.map(t => `
    <div class="wxd-tip-card">
      <div class="wxd-tip-icon">${t.icon}</div>
      <div class="wxd-tip-body">
        <div class="wxd-tip-title">${t.title}</div>
        <div class="wxd-tip-text">${t.body}</div>
      </div>
    </div>`).join('');

  // ── Score color bar / badge ───────────────────────────────────────────────
  const reasonsHtml = reasons.map(r => `<div class="wxd-reason">${r}</div>`).join('');

  // ── Show back button in topbar, update page title ────────────────────────
  const wxdBack = document.getElementById('wxdTopbarBack');
  if (wxdBack) wxdBack.style.display = '';
  const titleEl    = document.getElementById('pageTitle');
  const subtitleEl = document.getElementById('pageSubtitle');
  if (titleEl)    titleEl.textContent    = dayName;
  if (subtitleEl) subtitleEl.textContent = 'Weather · Day detail';

  // ── Build page ────────────────────────────────────────────────────────────
  container.innerHTML = `
    <!-- Hero card -->
    <div class="wxd-hero">
      <div class="wxd-hero-left">
        <div class="wxd-hero-icon">${wmoIcon(codes[i])}</div>
        <div class="wxd-hero-temps">
          <span class="wxd-hero-high">${Math.round(high)}${deg}</span>
          <span class="wxd-hero-low">/ ${Math.round(low)}${deg}</span>
        </div>
      </div>
      <div class="wxd-hero-right">
        <div class="wxp-score-badge wxp-score--${label} wxd-hero-badge">${label === 'great' ? '🚴 Great day' : label === 'good' ? '👍 Good day' : label === 'fair' ? '⚠️ Fair day' : '✗ Poor day'}</div>
        <div class="wxd-score-bar-wrap">
          <div class="wxd-score-bar wxd-score-bar--${label}" style="width:${score}%"></div>
        </div>
        <div class="wxd-score-num">${score}<span> / 100</span></div>
      </div>
    </div>

    <!-- Key stats row -->
    <div class="wxd-stats-row">
      <div class="wxd-stat">
        <div class="wxd-stat-icon">💨</div>
        <div class="wxd-stat-val">${Math.round(wind)}</div>
        <div class="wxd-stat-lbl">${windLbl} ${wdir}</div>
      </div>
      <div class="wxd-stat">
        <div class="wxd-stat-icon">🌧</div>
        <div class="wxd-stat-val">${Math.round(precip)}%</div>
        <div class="wxd-stat-lbl">Rain chance</div>
      </div>
      <div class="wxd-stat">
        <div class="wxd-stat-icon">☀️</div>
        <div class="wxd-stat-val">${uv}</div>
        <div class="wxd-stat-lbl">UV Index</div>
      </div>
      <div class="wxd-stat">
        <div class="wxd-stat-icon">🌅</div>
        <div class="wxd-stat-val">${srStr}</div>
        <div class="wxd-stat-lbl">Sunrise</div>
      </div>
      <div class="wxd-stat">
        <div class="wxd-stat-icon">🌇</div>
        <div class="wxd-stat-val">${ssStr}</div>
        <div class="wxd-stat-lbl">Sunset</div>
      </div>
    </div>

    <!-- Ride score reasons -->
    ${reasonsHtml ? `
    <div class="wxp-section-label">Ride Assessment</div>
    <div class="wxd-reasons">${reasonsHtml}</div>` : ''}

    <!-- Best ride window for this day -->
    ${bestWindowStr ? `
    <div class="wxd-window-banner">
      <span class="wxd-window-label">🚴 Best Ride Window</span>
      <span class="wxd-window-time">${bestWindowStr}</span>
    </div>` : ''}

    <!-- Hourly conditions -->
    ${hourlyHtml ? `
    <div class="wxp-section-label">Hourly Conditions</div>
    <div class="wxd-h-legend">
      <span>Temp</span><span>Wind</span><span>Rain%</span>
    </div>
    <div class="wxd-hourly-scroll">${hourlyHtml}</div>` : ''}

    <!-- Ride planner -->
    <div class="wxp-section-label">Ride Planner</div>
    <div class="wxd-tips">${tipsHtml}</div>
  `;

  // Drag-to-scroll on hourly rail
  const hRail = container.querySelector('.wxd-hourly-scroll');
  if (hRail) {
    let isDown = false, startX = 0, scrollLeft = 0;
    hRail.addEventListener('mousedown', e => {
      isDown = true; hRail.classList.add('is-dragging');
      startX = e.pageX - hRail.getBoundingClientRect().left;
      scrollLeft = hRail.scrollLeft;
      e.preventDefault();
    });
    document.addEventListener('mouseup', () => { isDown = false; hRail.classList.remove('is-dragging'); });
    document.addEventListener('mousemove', e => {
      if (!isDown) return;
      const x = e.pageX - hRail.getBoundingClientRect().left;
      hRail.scrollLeft = scrollLeft - (x - startX);
    });
    hRail.addEventListener('touchstart', e => {
      startX = e.touches[0].pageX - hRail.getBoundingClientRect().left;
      scrollLeft = hRail.scrollLeft;
    }, { passive: true });
    hRail.addEventListener('touchmove', e => {
      const x = e.touches[0].pageX - hRail.getBoundingClientRect().left;
      hRail.scrollLeft = scrollLeft - (x - startX);
    }, { passive: true });
  }
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
  document.getElementById('allActivitiesSubtitle').textContent = `${getAllActivities().filter(a => !isEmptyActivity(a)).length} total`;

  // Fitness gauges removed — elements no longer in DOM

  renderActivityList('activityList', recent.slice(0, 10));
  renderAllActivitiesList();
  updateSortButtons();
  _updateSportButtons();
  renderWeekProgress();
  renderTrainingStatus();
  renderFitnessChart(recent, days);
  renderWeeklyChart(recent);
  renderAvgPowerChart(recent);
  renderZoneDist(recent);
  renderPowerCurve();        // async — fetches if range changed
  renderRecentActivity();    // async — fetches GPS for map preview
  renderWeatherForecast();   // async — fetches Open-Meteo 7-day forecast
  renderGoalsDashWidget();   // goals & targets compact summary
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
  state.avgPowerChart     = destroyChart(state.avgPowerChart);
  state.powerCurveChart   = destroyChart(state.powerCurveChart);
  state.weekProgressChart = destroyChart(state.weekProgressChart);
  state.efSparkChart      = destroyChart(state.efSparkChart);
  (state.recentActivityMaps || []).forEach(m => { try { m.remove(); } catch (_) {} });
  state.recentActivityMaps = [];
  const rail = document.getElementById('recentActScrollRail');
  if (rail) rail.innerHTML = '';
  const racLabel = document.getElementById('recentActSectionLabel');
  if (racLabel) racLabel.style.display = 'none';
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

// ---------------------------------------------------------------------------
// External HTML tooltip — floats as a fixed DOM element above the canvas so
// it is never clipped by canvas bounds and never overlaps the chart grid.
// ---------------------------------------------------------------------------
function _getTooltipEl() {
  let el = document.getElementById('chartTooltipFloat');
  if (!el) {
    el = document.createElement('div');
    el.id = 'chartTooltipFloat';
    document.body.appendChild(el);
  }
  return el;
}

function externalTooltipHandler(context) {
  const { chart, tooltip } = context;
  const el = _getTooltipEl();

  // Hide when no active point
  if (tooltip.opacity === 0 || !tooltip.dataPoints?.length) {
    el.style.opacity = '0';
    return;
  }

  // Build HTML content
  const titleLines = tooltip.title  || [];
  const bodyLines  = tooltip.body   || [];
  const colors     = tooltip.labelColors || [];

  let html = '';
  if (titleLines.length) {
    html += `<div class="ctf-title">${titleLines.join('<br>')}</div>`;
  }
  const dataPoints = tooltip.dataPoints || [];
  bodyLines.forEach((body, i) => {
    const text = (body.lines || []).join('');
    if (!text) return;
    // Best colour source: dataset.borderColor (always the vivid line/stroke colour).
    // Fall back through labelColors then backgroundColor; skip anything that is
    // black, transparent or missing so swatches are never invisible.
    // For charts with per-bar backgroundColor arrays (e.g. cadence distribution),
    // index into the array using dataIndex so each bar shows its own colour.
    const ds       = dataPoints[i]?.dataset ?? {};
    const dataIdx  = dataPoints[i]?.dataIndex ?? i;
    const dsBg     = Array.isArray(ds.backgroundColor)
                       ? ds.backgroundColor[dataIdx]
                       : ds.backgroundColor;
    const dsBorder = Array.isArray(ds.borderColor)
                       ? ds.borderColor[dataIdx]
                       : ds.borderColor;
    const candidates = [
      dsBorder,
      ds.pointBackgroundColor,
      dsBg,
      colors[i]?.borderColor,
      colors[i]?.backgroundColor,
    ];
    const isUsable = c => c && c !== 'transparent' && c !== '#000'
                       && c !== '#000000' && c !== 'black'
                       && !String(c).startsWith('rgba(0,0,0')
                       && !String(c).startsWith('rgba(0, 0, 0');
    const bg = candidates.find(isUsable) || 'transparent';
    html += `<div class="ctf-row">` +
      `<span class="ctf-swatch" style="background:${bg}"></span>` +
      `<span>${text}</span>` +
      `</div>`;
  });
  el.innerHTML = html;

  // Position: centered on the crosshair x, bottom edge just above chartArea.top
  const rect = chart.canvas.getBoundingClientRect();
  const cx   = rect.left + (tooltip.caretX ?? 0);
  const cy   = rect.top  + (chart.chartArea?.top ?? 0);

  // Clamp horizontally so tooltip never leaves the viewport
  const tooltipW = el.offsetWidth || 150;
  const vw       = window.innerWidth;
  let left = cx - tooltipW / 2;
  if (left < 8)              left = 8;
  if (left + tooltipW > vw - 8) left = vw - tooltipW - 8;

  el.style.left    = left + 'px';
  el.style.top     = (cy - 8) + 'px';          // 8px gap above chartArea.top
  el.style.opacity = '1';
}

// Keep the aboveLine positioner — Chart.js still uses it to set tooltip.caretX
// to the data-point x rather than the raw cursor x, which keeps the crosshair
// and tooltip perfectly aligned while scrubbing.
Chart.Tooltip.positioners.aboveLine = function(items) {
  if (!items.length) return false;
  const chart = this.chart;
  return { x: items[0].element.x, y: chart.chartArea?.top ?? 0 };
};
Chart.Tooltip.positioners.offsetFromCursor = Chart.Tooltip.positioners.aboveLine;

const C_TOOLTIP = {
  enabled:  false,                    // disable canvas tooltip
  external: externalTooltipHandler,   // use floating HTML tooltip instead
  position: 'aboveLine',              // keeps caretX on data-point x
};
const C_TICK  = { color: '#62708a', font: { size: 10 } };
const C_GRID  = { color: 'rgba(255,255,255,0.04)' };
const C_NOGRID = { display: false };
// Shared grow-from-bottom animation applied globally to all charts
const C_ANIM = {
  x: { duration: 0 },
  y: {
    duration: 900,
    easing: 'easeOutQuart',
    from: ctx => ctx.chart.chartArea?.bottom ?? 0,
  },
};
Chart.defaults.animations = C_ANIM;
// Resize redraws must be instant. Per-property `animations` (C_ANIM) override the
// base `animation.duration`, so we must override each property inside the resize
// transition too — otherwise the y-grow still fires on every window resize.
Chart.defaults.transitions.resize = {
  animation: { duration: 0 },
  animations: { x: { duration: 0 }, y: { duration: 0 } },
};
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
// Eager-snap interaction mode: snaps tooltip to next/prev data point at 35% of
// the gap instead of the default 50% midpoint. Makes sparse charts feel snappier.
// Hysteresis: once snapped to a new point, requires cursor to travel back 50%
// of the gap before reverting — prevents jitter at the snap boundary.
(function () {
  const SNAP_FWD  = 0.35; // snap forward at 35% of gap
  const SNAP_BACK = 0.50; // snap back only once cursor retreats past 50% (hysteresis)

  Chart.Interaction.modes.indexEager = function (chart, e, options, useFinalPosition) {
    // Get what standard 'index' mode would give us (nearest midpoint)
    const standard = Chart.Interaction.modes.index(
      chart, e, { ...options, intersect: false }, useFinalPosition
    );
    if (!standard.length) return standard;

    const position = Chart.helpers.getRelativePosition(e, chart);
    const cursorX  = position.x;
    const midpointIdx = standard[0].index; // what standard mode picked

    // Use the first visible meta as reference for x positions
    const metas = chart.getSortedVisibleDatasetMetas().filter(m => m.data.length > 0);
    if (!metas.length) return standard;
    const refMeta = metas[0];

    // Retrieve last committed index (hysteresis anchor)
    const lastIdx = chart._eagerLastIdx ?? midpointIdx;

    // Determine which direction to evaluate relative to the last committed point
    const anchorEl = refMeta.data[lastIdx];
    if (!anchorEl) { chart._eagerLastIdx = midpointIdx; return standard; }
    const anchorX = anchorEl.x;

    let targetIdx = lastIdx;

    if (cursorX >= anchorX) {
      // Moving forward — snap to next when 35% into the gap
      const nextEl = refMeta.data[lastIdx + 1];
      if (nextEl) {
        const pct = (cursorX - anchorX) / (nextEl.x - anchorX);
        if (pct >= SNAP_FWD) targetIdx = lastIdx + 1;
      }
    } else {
      // Moving backward — only retreat once cursor is 50% back into previous gap
      const prevEl = refMeta.data[lastIdx - 1];
      if (prevEl) {
        const pct = (anchorX - cursorX) / (anchorX - prevEl.x);
        if (pct >= SNAP_BACK) targetIdx = lastIdx - 1;
      }
    }

    // If our hysteresis anchor is stale (cursor jumped far), realign to midpoint
    if (Math.abs(targetIdx - midpointIdx) > 1) targetIdx = midpointIdx;

    chart._eagerLastIdx = targetIdx;

    if (targetIdx === midpointIdx) return standard;

    // Build result at targetIdx across all visible datasets
    const result = [];
    metas.forEach(m => {
      const el = m.data[targetIdx];
      if (el) result.push({ element: el, datasetIndex: m.index, index: targetIdx });
    });
    return result.length ? result : standard;
  };
})();

// Mobile scroll lock: prevent vertical page scroll when scrubbing charts horizontally.
// Also hides the tooltip when the user scrolls vertically on or away from a chart.
Chart.register({
  id: 'touchScrollLock',
  afterInit(chart) {
    const canvas = chart.canvas;
    let startX = 0, startY = 0, locked = false;
    canvas.addEventListener('touchstart', e => {
      if (e.touches.length === 1) {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        locked = false;
      }
    }, { passive: true });
    canvas.addEventListener('touchmove', e => {
      if (e.touches.length !== 1) return;
      const dx = Math.abs(e.touches[0].clientX - startX);
      const dy = Math.abs(e.touches[0].clientY - startY);
      if (!locked && (dx > 5 || dy > 5)) {
        locked = true;
      }
      if (locked && dx > dy) {
        e.preventDefault(); // horizontal — block page scroll
      } else if (locked && dy > dx * 2 && dy > 20) {
        // Only hide tooltip when clearly scrolling vertically (2× ratio + 20px minimum)
        _getTooltipEl().style.opacity = '0';
      }
    }, { passive: false });
  }
});

// Also hide the tooltip whenever the page scrolls (covers scrolling outside chart area)
window.addEventListener('scroll', () => {
  _getTooltipEl().style.opacity = '0';
}, { passive: true });

// Vertical crosshair line drawn at the hovered x position
Chart.register({
  id: 'crosshairLine',
  afterDraw(chart) {
    const active = chart.tooltip?._active;
    if (!active || !active.length) return;
    const { ctx, chartArea: { top, bottom } } = chart;
    const x = active[0].element.x;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.lineWidth   = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.restore();
  },
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
  state.weekProgressChart = destroyChart(state.weekProgressChart);

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
      interaction: { mode: 'indexEager', intersect: false },
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

  const CX = 100, CY = 105, R = 82, SW = 18;
  const val = Math.max(0, Math.min(12, rampRate));

  // Map value to angle: 0 → π (left), 12 → 0 (right)
  const toA = v => Math.PI * (1 - Math.max(0, Math.min(12, v)) / 12);

  // SVG coordinate at angle a
  const px = a => (CX + R * Math.cos(a)).toFixed(1);
  const py = a => (CY - R * Math.sin(a)).toFixed(1);

  // Arc path helper
  const arcPath = (a1, a2) => {
    const large = (a1 - a2) > Math.PI ? 1 : 0;
    return `M${px(a1)} ${py(a1)} A${R} ${R} 0 ${large} 1 ${px(a2)} ${py(a2)}`;
  };

  const color = val < 8 ? '#00e5a0' : val < 10 ? '#f0c429' : '#ff4757';

  // Tick marks at zone boundaries
  const tickVals = [0, 3, 8, 10, 12];
  let ticks = '';
  tickVals.forEach(v => {
    const a = toA(v);
    const r1 = R + SW / 2 + 3, r2 = r1 + 7;
    ticks += `<line x1="${(CX + r1 * Math.cos(a)).toFixed(1)}" y1="${(CY - r1 * Math.sin(a)).toFixed(1)}" `
           + `x2="${(CX + r2 * Math.cos(a)).toFixed(1)}" y2="${(CY - r2 * Math.sin(a)).toFixed(1)}" `
           + `stroke="rgba(255,255,255,0.1)" stroke-width="1.5" stroke-linecap="round"/>`;
  });

  // Build the outer and inner radius arc shapes for the tube
  const Ro = R + SW / 2, Ri = R - SW / 2;
  const pxR = (a, r) => (CX + r * Math.cos(a)).toFixed(1);
  const pyR = (a, r) => (CY - r * Math.sin(a)).toFixed(1);

  // Full tube shape path (closed annular arc)
  const tubePath = (a1, a2, cap) => {
    const large = (a1 - a2) > Math.PI ? 1 : 0;
    if (cap === 'round') {
      // Outer arc CW, end cap, inner arc CCW, start cap
      return `M${pxR(a1, Ro)} ${pyR(a1, Ro)} A${Ro} ${Ro} 0 ${large} 1 ${pxR(a2, Ro)} ${pyR(a2, Ro)} `
           + `A${SW/2} ${SW/2} 0 0 1 ${pxR(a2, Ri)} ${pyR(a2, Ri)} `
           + `A${Ri} ${Ri} 0 ${large} 0 ${pxR(a1, Ri)} ${pyR(a1, Ri)} `
           + `A${SW/2} ${SW/2} 0 0 1 ${pxR(a1, Ro)} ${pyR(a1, Ro)}Z`;
    }
    return `M${pxR(a1, Ro)} ${pyR(a1, Ro)} A${Ro} ${Ro} 0 ${large} 1 ${pxR(a2, Ro)} ${pyR(a2, Ro)} `
         + `L${pxR(a2, Ri)} ${pyR(a2, Ri)} `
         + `A${Ri} ${Ri} 0 ${large} 0 ${pxR(a1, Ri)} ${pyR(a1, Ri)}Z`;
  };

  let s = `<defs>
    <!-- Tube shading: dark edges, lighter center for 3D cylinder look -->
    <linearGradient id="tubeTrack" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(255,255,255,0.07)"/>
      <stop offset="35%" stop-color="rgba(255,255,255,0.03)"/>
      <stop offset="65%" stop-color="rgba(0,0,0,0.08)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.2)"/>
    </linearGradient>
    <!-- Active fill tube gradient -->
    <linearGradient id="tubeFillGreen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#5fffca"/>
      <stop offset="30%" stop-color="#00e5a0"/>
      <stop offset="70%" stop-color="#00b87f"/>
      <stop offset="100%" stop-color="#008a60"/>
    </linearGradient>
    <linearGradient id="tubeFillYellow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffe066"/>
      <stop offset="30%" stop-color="#f0c429"/>
      <stop offset="70%" stop-color="#d4a820"/>
      <stop offset="100%" stop-color="#a88518"/>
    </linearGradient>
    <linearGradient id="tubeFillRed" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ff8a8a"/>
      <stop offset="30%" stop-color="#ff4757"/>
      <stop offset="70%" stop-color="#d63545"/>
      <stop offset="100%" stop-color="#a52835"/>
    </linearGradient>
    <!-- Specular highlight on tube -->
    <linearGradient id="tubeHighlight" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(255,255,255,0.25)"/>
      <stop offset="25%" stop-color="rgba(255,255,255,0.06)"/>
      <stop offset="50%" stop-color="rgba(255,255,255,0)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
    </linearGradient>
    <filter id="trsGlow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="6" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="trsDotGlow" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="3.5" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>`;

  s += ticks;

  // 1. Tube track — base dark fill for the empty tube
  s += `<path d="${tubePath(Math.PI * 0.999, Math.PI * 0.001, 'round')}" fill="rgba(10,12,20,0.6)"/>`;
  // 2. Zone color hints — faint tints inside the empty tube
  const zones = [[0, 3, '#00e5a0'], [3, 8, '#00e5a0'], [8, 10, '#f0c429'], [10, 12, '#ff4757']];
  zones.forEach(([lo, hi, c]) => {
    s += `<path d="${tubePath(toA(lo), toA(hi))}" fill="${c}" opacity="0.07"/>`;
  });
  // 3. Tube track — gradient overlay for 3D shading
  s += `<path d="${tubePath(Math.PI * 0.999, Math.PI * 0.001, 'round')}" fill="url(#tubeTrack)"/>`;

  // 4. Active fill — colored tube section
  const fillGrad = color === '#00e5a0' ? 'url(#tubeFillGreen)' : color === '#f0c429' ? 'url(#tubeFillYellow)' : 'url(#tubeFillRed)';
  if (val > 0.15) {
    // Glow behind fill
    s += `<path d="${arcPath(Math.PI * 0.999, toA(val))}" fill="none" stroke="${color}" stroke-width="${SW + 10}" stroke-linecap="round" opacity="0.2" filter="url(#trsGlow)"/>`;
    // Solid fill with gradient
    s += `<path d="${tubePath(Math.PI * 0.999, toA(val), 'round')}" fill="${fillGrad}"/>`;
    // Specular highlight on fill
    s += `<path d="${tubePath(Math.PI * 0.999, toA(val), 'round')}" fill="url(#tubeHighlight)"/>`;
  }

  // 4. Specular highlight on entire track (top edge shine)
  const hiR = R + SW / 2 - 1, hiRi = R + SW / 2 - 4;
  s += `<path d="M${pxR(Math.PI * 0.999, hiR)} ${pyR(Math.PI * 0.999, hiR)} A${hiR} ${hiR} 0 1 1 ${pxR(Math.PI * 0.001, hiR)} ${pyR(Math.PI * 0.001, hiR)}" `
     + `fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1.5" stroke-linecap="round"/>`;

  // 5. Indicator dot
  const dx = px(toA(val)), dy = py(toA(val));
  s += `<circle cx="${dx}" cy="${dy}" r="7" fill="${color}" opacity="0.3" filter="url(#trsDotGlow)"/>`;
  s += `<circle cx="${dx}" cy="${dy}" r="${SW/2 + 1}" fill="${color}"/>`;
  s += `<circle cx="${dx}" cy="${dy}" r="${SW/2 - 1}" fill="url(#tubeHighlight)"/>`;
  s += `<circle cx="${dx}" cy="${dy}" r="3" fill="rgba(255,255,255,0.6)"/>`;

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
    else if (tsb > 5)   { fLabel = 'Fresh';         fColor = '#00e5a0'; fHint = 'Good for B-priority races'; }
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
    state.efSparkChart = destroyChart(state.efSparkChart);
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
  state.efSparkChart = destroyChart(state.efSparkChart);

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
      interaction: { mode: 'indexEager', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { ...C_TOOLTIP, callbacks: { label: c => `EF: ${c.raw} w/bpm` } }
      },
      layout: { padding: 0 },
      scales: {
        x: { grid: C_NOGRID, ticks: { display: false } },
        y: { display: false },
      }
    }
  });
}

/* ====================================================
   CHARTS
==================================================== */
function renderFitnessChart(activities, days) {
  const ctx = document.getElementById('fitnessChart').getContext('2d');
  state.fitnessChart = destroyChart(state.fitnessChart);

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
      interaction: { mode: 'indexEager', intersect: false },
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
  state.weeklyChart = destroyChart(state.weeklyChart);
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
  state.avgPowerChart = destroyChart(state.avgPowerChart);

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
      interaction: { mode: 'indexEager', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { ...C_TOOLTIP, callbacks: { labelColor: C_LABEL_COLOR, label: c => `${c.dataset.label}: ${c.raw}w` } }
      },
      scales: cScales({ xGrid: false, xExtra: { maxTicksLimit: 10, maxRotation: 0, autoSkip: true } })
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
  state.powerCurveChart = destroyChart(state.powerCurveChart);

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
      interaction: { mode: 'indexEager', intersect: false },
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
          ticks: { ...C_TICK }
        }
      }
    }
  });
}

/* ====================================================
   POWER PAGE
==================================================== */

// Coggan 6-zone model (percentages of FTP)
const COGGAN_ZONES = [
  { id:'Z1', name:'Recovery',   minPct:0,    maxPct:0.55,     desc:'Very easy. Active recovery; flush fatigue without adding stress.' },
  { id:'Z2', name:'Endurance',  minPct:0.55, maxPct:0.75,     desc:'All-day aerobic pace. Builds the fat-burning engine and capillary density.' },
  { id:'Z3', name:'Tempo',      minPct:0.75, maxPct:0.90,     desc:'Comfortably hard. Improves aerobic power and muscular endurance.' },
  { id:'Z4', name:'Threshold',  minPct:0.90, maxPct:1.05,     desc:'Around FTP. Raises lactate threshold and time-to-exhaustion at high power.' },
  { id:'Z5', name:'VO₂max',     minPct:1.05, maxPct:1.20,     desc:'Maximal aerobic power. 3–8 min intervals. Expands VO₂max ceiling.' },
  { id:'Z6', name:'Anaerobic',  minPct:1.20, maxPct:Infinity, desc:'Short, explosive all-out efforts. Builds neuromuscular power and sprint capacity.' },
];

// W/kg → competitive category
function pwrKgCategory(wkg) {
  if (wkg >= 5.0) return { label:'Professional',   color:'var(--purple)' };
  if (wkg >= 4.5) return { label:'Cat 1 / Elite',  color:'var(--red)'    };
  if (wkg >= 4.0) return { label:'Cat 2',           color:'var(--orange)' };
  if (wkg >= 3.5) return { label:'Cat 3',           color:'var(--yellow)' };
  if (wkg >= 3.0) return { label:'Cat 4',           color:'var(--accent)' };
  if (wkg >= 2.0) return { label:'Cat 5',           color:'var(--blue)'   };
  return           { label:'Recreational', color:'var(--text-secondary)' };
}

function pwrNextCategory(wkg) {
  const steps = [
    { threshold:2.0, label:'Cat 5'          },
    { threshold:3.0, label:'Cat 4'          },
    { threshold:3.5, label:'Cat 3'          },
    { threshold:4.0, label:'Cat 2'          },
    { threshold:4.5, label:'Cat 1 / Elite'  },
    { threshold:5.0, label:'Professional'   },
  ];
  return steps.find(c => c.threshold > wkg) || null;
}

// Range-pill click handler for the power page
function setPwrRange(days) {
  state.powerPageRangeDays = days;
  document.querySelectorAll('#pwrRangePills button').forEach(b =>
    b.classList.toggle('active', +b.dataset.days === days)
  );
  // Bust page-curve cache so it re-fetches for the new window
  state.powerPageCurve = null;
  state.powerPageCurveRange = null;
  renderPowerPage();
}

async function renderPowerPage() {
  if (!state.synced) return;

  const ftp    = state.athlete?.ftp    || 0;
  const weight = state.athlete?.weight || 0;
  const wkg    = (ftp && weight) ? +(ftp / weight).toFixed(2) : null;
  const days   = state.powerPageRangeDays || 90;

  renderPwrHero(ftp, weight, wkg, days);
  renderPwrZones(ftp, weight);
  await renderPwrCurveChart(days, ftp, weight);
  // Re-render hero now that curve data has loaded (peak values were null on first pass)
  renderPwrHero(ftp, weight, wkg, days);
  renderPwrZoneDist(days);
  renderPwrTrend(days);
  renderPwrInsights(ftp, weight, wkg, days);
}

// ── Hero stat cards ─────────────────────────────────────────────────────────
function renderPwrHero(ftp, weight, wkg, days) {
  const el = document.getElementById('pwrHeroRow');
  if (!el) return;

  // Best peaks from cached curve (may be null before curve fetch)
  const pc      = state.powerPageCurve;
  const best20m = pc ? pwrPeakAt(pc, 1200) : null;
  const best5m  = pc ? pwrPeakAt(pc, 300)  : null;
  const cat     = wkg ? pwrKgCategory(wkg) : null;

  const cards = [
    {
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
      label: 'FTP',
      value: ftp ? `${ftp}` : '—',
      unit:  ftp ? 'w' : '',
      sub:   ftp && weight ? `${wkg} w/kg` : 'Set FTP in intervals.icu',
      color: 'var(--accent)',
    },
    {
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
      label: '20min Peak',
      value: best20m ? `${Math.round(best20m)}` : '—',
      unit:  best20m ? 'w' : '',
      sub:   best20m && weight ? `${(best20m / weight).toFixed(2)} w/kg` : `Last ${days}d`,
      color: 'var(--yellow)',
    },
    {
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
      label: '5min Peak',
      value: best5m ? `${Math.round(best5m)}` : '—',
      unit:  best5m ? 'w' : '',
      sub:   best5m && weight ? `${(best5m / weight).toFixed(2)} w/kg` : `Last ${days}d`,
      color: 'var(--orange)',
    },
    {
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>`,
      label: 'Category',
      value: cat ? cat.label : '—',
      unit:  '',
      sub:   wkg ? `${wkg} w/kg at FTP` : 'Set FTP to calculate',
      color: cat ? cat.color : 'var(--text-secondary)',
      textVal: true,
    },
  ];

  el.innerHTML = cards.map(c => `
    <div class="stat-card">
      <div class="stat-card-header">
        <div class="stat-label">${c.label}</div>
        <div class="stat-icon" style="background:${c.color}22;color:${c.color}">${c.icon}</div>
      </div>
      <div class="stat-value${c.textVal ? ' pwr-stat-text' : ''}" style="color:${c.color}">
        ${c.value}${c.unit ? `<span class="unit">${c.unit}</span>` : ''}
      </div>
      <div class="pwr-hero-sub">${c.sub}</div>
    </div>
  `).join('');
}

// ── Power Zones table ────────────────────────────────────────────────────────
function renderPwrZones(ftp, weight) {
  const rowsEl  = document.getElementById('pwrZoneRows');
  const subEl   = document.getElementById('pwrZoneSubtitle');
  const badgeEl = document.getElementById('pwrFtpBadge');
  if (!rowsEl) return;

  if (badgeEl) {
    badgeEl.innerHTML = ftp
      ? `<div class="pwr-ftp-badge-inner"><span>FTP</span><strong>${ftp}w</strong></div>`
      : '';
  }

  if (!ftp) {
    rowsEl.innerHTML = '<div class="pwr-empty-note">Set your FTP in intervals.icu to see personalised power zones.</div>';
    return;
  }

  if (subEl) subEl.textContent =
    `Coggan 6-zone model · ${ftp}w FTP${weight ? ` · ${weight}kg` : ''}`;

  // Max bar width relative to Z6 lower bound (1.4× FTP = full bar)
  const SCALE = ftp * 1.40;

  rowsEl.innerHTML = `
    <div class="pwr-zone-header">
      <div class="pwr-zh-zone">Zone</div>
      <div class="pwr-zh-watts">Watts</div>
      <div class="pwr-zh-wkg">W/kg</div>
      <div class="pwr-zh-bar"></div>
      <div class="pwr-zh-desc">Focus</div>
    </div>
    ${COGGAN_ZONES.map((z, i) => {
      const color  = ZONE_COLORS[i] || 'var(--text-secondary)';
      const minW   = i === 0 ? 0 : Math.round(ftp * z.minPct);
      const maxW   = z.maxPct === Infinity ? null : Math.round(ftp * z.maxPct);
      const rangeW = maxW ? `${minW}–${maxW}w` : `${minW}+w`;
      const minKg  = i === 0 ? '0.0' : (ftp * z.minPct / (weight || 70)).toFixed(1);
      const maxKg  = z.maxPct === Infinity ? null : (ftp * z.maxPct / (weight || 70)).toFixed(1);
      const rangeKg = maxKg ? `${minKg}–${maxKg}` : `${minKg}+`;
      const barW   = z.maxPct === Infinity ? 100 : Math.min(100, (ftp * z.maxPct) / SCALE * 100);
      return `
        <div class="pwr-zone-row">
          <div class="pwr-zone-id" style="color:${color}">${z.id}</div>
          <div class="pwr-zone-name">${z.name}</div>
          <div class="pwr-zone-watts">${rangeW}</div>
          <div class="pwr-zone-wkg">${rangeKg}</div>
          <div class="pwr-zone-bar-wrap">
            <div class="pwr-zone-bar" style="width:${barW}%;background:${color}"></div>
          </div>
          <div class="pwr-zone-desc">${z.desc}</div>
        </div>`;
    }).join('')}`;
}

// ── Power Curve chart ────────────────────────────────────────────────────────
function pwrPeakAt(pc, targetSecs) {
  const lookup = {};
  pc.secs.forEach((s, i) => { if (pc.watts[i]) lookup[s] = pc.watts[i]; });
  if (lookup[targetSecs]) return lookup[targetSecs];
  let best = null, minD = Infinity;
  pc.secs.forEach(s => {
    const d = Math.abs(s - targetSecs);
    if (d < minD && lookup[s]) { minD = d; best = lookup[s]; }
  });
  return best;
}

async function renderPwrCurveChart(days, ftp, weight) {
  const subtitleEl = document.getElementById('pwrCurveSubtitle');
  const peaksEl    = document.getElementById('pwrCurvePeaks');
  const canvas     = document.getElementById('pwrCurveCanvas');
  if (!canvas) return;

  // Fetch if cache is stale
  if (!state.powerPageCurve || state.powerPageCurveRange !== days) {
    const newest = toDateStr(new Date());
    const oldest = toDateStr(daysAgo(days));
    state.powerPageCurve      = await fetchRangePowerCurve(oldest, newest).catch(() => null);
    state.powerPageCurveRange = days;
  }

  const pc = state.powerPageCurve;
  if (subtitleEl) subtitleEl.textContent = `Best efforts · Last ${days} days`;

  // Peak pills
  if (peaksEl) {
    peaksEl.innerHTML = pc
      ? CURVE_PEAKS.map(p => {
          const w = Math.round(pwrPeakAt(pc, p.secs) || 0);
          if (!w) return '';
          const wkg = (weight && w) ? ` <span class="curve-peak-wkg">${(w/weight).toFixed(1)}w/kg</span>` : '';
          return `<div class="curve-peak">
            <div class="curve-peak-val">${w}<span class="curve-peak-unit">w</span></div>
            <div class="curve-peak-dur">${p.label}${wkg}</div>
          </div>`;
        }).join('')
      : '';
  }

  // Destroy old chart
  state.powerPageChart = destroyChart(state.powerPageChart);
  if (!pc) return;

  const chartData = pc.secs
    .map((s, i) => ({ x: s, y: pc.watts[i] }))
    .filter(pt => pt.y > 0);
  const maxSecs = chartData[chartData.length - 1]?.x || 3600;

  const datasets = [{
    label: `Last ${days}d`,
    data: chartData,
    borderColor: '#00e5a0',
    backgroundColor: 'rgba(0,229,160,0.07)',
    fill: true,
    tension: 0.4,
    pointRadius: 0,
    pointHoverRadius: 6,
    borderWidth: 2.5,
  }];

  // FTP reference line
  if (ftp) {
    datasets.push({
      label: 'FTP',
      data: [{ x: 1, y: ftp }, { x: maxSecs, y: ftp }],
      borderColor: 'rgba(255,107,53,0.55)',
      borderWidth: 1.5,
      borderDash: [5, 4],
      pointRadius: 0,
      fill: false,
      tension: 0,
    });
  }

  state.powerPageChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'indexEager', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...C_TOOLTIP,
          callbacks: {
            title: items => fmtSecsShort(items[0].parsed.x),
            label: ctx   => ctx.dataset.label === 'FTP'
              ? `FTP: ${ftp}w`
              : (() => {
                  const w = Math.round(ctx.parsed.y);
                  return weight ? `${w}w  ·  ${(w/weight).toFixed(2)} w/kg` : `${w}w`;
                })(),
          },
        },
      },
      scales: {
        x: {
          type: 'logarithmic',
          min: 1,
          max: maxSecs,
          grid: C_GRID,
          ticks: { ...C_TICK, autoSkip: false, maxRotation: 0, callback: val => CURVE_TICK_MAP[val] ?? null },
        },
        y: { grid: C_GRID, ticks: { ...C_TICK } },
      },
    },
  });
}

// ── Zone distribution (for the power page) ──────────────────────────────────
function renderPwrZoneDist(days) {
  const listEl  = document.getElementById('pwrZoneList');
  const balEl   = document.getElementById('pwrZoneBalance');
  const subEl   = document.getElementById('pwrZoneDistSub');
  const badgeEl = document.getElementById('pwrZoneTotalBadge');
  if (!listEl) return;

  const cutoff = toDateStr(daysAgo(days));
  const acts   = state.activities.filter(a =>
    (a.start_date_local || a.start_date || '').slice(0, 10) >= cutoff
  );

  const totals = [0, 0, 0, 0, 0, 0];
  let hasData  = false;
  acts.forEach(a => {
    const zt = a.icu_zone_times;
    if (!Array.isArray(zt) || zt.length < 1) return;
    zt.forEach(z => {
      if (!z || typeof z.id !== 'string') return;
      const m = z.id.match(/^Z(\d)$/);
      if (!m) return;
      const idx = parseInt(m[1], 10) - 1;
      if (idx >= 0 && idx < 6) { hasData = true; totals[idx] += z.secs || 0; }
    });
  });

  const totalSecs = totals.reduce((s, t) => s + t, 0);

  if (!hasData || totalSecs === 0) {
    if (badgeEl) badgeEl.textContent = '';
    if (subEl)   subEl.textContent   = 'Time in power zone';
    listEl.innerHTML = '<div class="pwr-empty-note">No power zone data in this period</div>';
    if (balEl) balEl.style.display = 'none';
    return;
  }

  // Badge + subtitle — mirrors dashboard exactly
  if (badgeEl) badgeEl.textContent = fmtDur(totalSecs) + ' total';
  if (subEl)   subEl.textContent   = `Time in power zone · Last ${days} days`;

  // Zone rows — identical markup to renderZoneDist
  listEl.innerHTML = ZONE_TAGS.map((tag, i) => {
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

  // Stacked balance bar + training style label — identical to dashboard
  if (balEl) {
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
    if      (z12 >= 0.65 && z56 >= 0.10) { style = 'Polarized';   hint = 'strong contrast between easy base and hard efforts'; }
    else if (z34 >= 0.40)                 { style = 'Sweet-spot';  hint = 'focused on productive threshold work'; }
    else if (z12 >= 0.60)                 { style = 'Pyramidal';   hint = 'broad aerobic base with moderate intensity work'; }
    else                                  { style = 'Mixed';        hint = 'varied intensity across all zones'; }

    balEl.style.display = '';
    balEl.innerHTML = `
      <div class="zone-balance-label">Zone Balance</div>
      <div class="zone-balance-bar">${segs}</div>
      <div class="zone-style-hint"><strong>${style}</strong> — ${hint}</div>`;
  }
}

// ── Power trend bar chart ────────────────────────────────────────────────────
function renderPwrTrend(days) {
  const canvas = document.getElementById('pwrTrendCanvas');
  const sumEl  = document.getElementById('pwrTrendSummary');
  if (!canvas) return;

  state.powerTrendChart = destroyChart(state.powerTrendChart);

  const cutoff = toDateStr(daysAgo(days));
  const acts = state.activities
    .filter(a => {
      const d = (a.start_date_local || a.start_date || '').slice(0, 10);
      const w = actVal(a, 'icu_weighted_avg_watts', 'average_watts', 'icu_average_watts');
      return d >= cutoff && w > 0;
    })
    .sort((a, b) =>
      (a.start_date_local || a.start_date || '').localeCompare(b.start_date_local || b.start_date || '')
    )
    .slice(-28); // last 28 powered rides

  if (acts.length < 3) {
    if (sumEl) sumEl.innerHTML = '<div class="pwr-empty-note">Not enough power data in this period</div>';
    return;
  }

  const labels = acts.map(a => (a.start_date_local || a.start_date || '').slice(5, 10).replace('-', '/'));
  const watts  = acts.map(a => Math.round(actVal(a, 'icu_weighted_avg_watts', 'average_watts', 'icu_average_watts')));

  // Simple linear regression for trend line
  const n     = watts.length;
  const yMean = watts.reduce((s, w) => s + w, 0) / n;
  const xMean = (n - 1) / 2;
  const num   = watts.reduce((s, w, i) => s + (i - xMean) * (w - yMean), 0);
  const den   = watts.reduce((s, _, i) => s + (i - xMean) ** 2, 0);
  const slope = den ? num / den : 0;
  const trendData = watts.map((_, i) => Math.round(yMean + slope * (i - xMean)));

  const avgW   = Math.round(yMean);
  const pctChg = yMean ? Math.round(slope / yMean * 100 * (n - 1)) : 0;
  const rising = slope > 1;
  const flat   = Math.abs(pctChg) < 3;

  const barColors = watts.map(w => w >= avgW ? 'rgba(0,229,160,0.75)' : 'rgba(0,229,160,0.25)');

  state.powerTrendChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'NP',
          data: watts,
          backgroundColor: barColors,
          borderRadius: 3,
          maxBarThickness: 14,
          order: 2,
        },
        {
          label: 'Trend',
          data: trendData,
          type: 'line',
          borderColor: 'rgba(255,107,53,0.8)',
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
          tension: 0.35,
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...C_TOOLTIP,
          callbacks: {
            title:  items => items[0].label,
            label:  ctx   => ctx.datasetIndex === 0 ? `${ctx.parsed.y}w NP` : `${ctx.parsed.y}w trend`,
          },
        },
      },
      scales: {
        x: { grid: C_GRID, ticks: { ...C_TICK, maxRotation: 0, maxTicksLimit: 7 } },
        y: { grid: C_GRID, ticks: { ...C_TICK } },
      },
    },
  });

  if (sumEl) {
    const dir  = flat ? 'neutral' : (rising ? 'up' : 'down');
    const icon = flat ? '→' : (rising ? '↑' : '↓');
    const msg  = flat
      ? `Holding steady around ${avgW}w average`
      : rising
        ? `Power rising +${Math.abs(pctChg)}% over this period`
        : `Power down ${Math.abs(pctChg)}% over this period`;
    sumEl.innerHTML = `<div class="stat-delta ${dir}" style="margin-top:8px;font-size:var(--text-sm)">${icon} ${msg}</div>`;
  }
}

// ── Insight / encouragement cards ───────────────────────────────────────────
function renderPwrInsights(ftp, weight, wkg, days) {
  const el = document.getElementById('pwrInsightsRow');
  if (!el) return;

  const insights = [];

  // 1. W/kg category + next step
  if (wkg) {
    const cat  = pwrKgCategory(wkg);
    const next = pwrNextCategory(wkg);
    insights.push({
      color: cat.color,
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>`,
      title: `You ride at ${cat.label} level`,
      body: next
        ? `At <strong>${wkg} w/kg</strong> you're in <strong>${cat.label}</strong> territory. Push your FTP to <strong>${Math.round((next.threshold * (weight || 70)))}w</strong> (${next.threshold} w/kg) to reach <strong>${next.label}</strong>.`
        : `At <strong>${wkg} w/kg</strong> you're among the elite of the sport. World-class power-to-weight ratio — keep it up!`,
    });
  }

  // 2. 20min peak vs FTP sanity check
  if (ftp && state.powerPageCurve) {
    const p20 = pwrPeakAt(state.powerPageCurve, 1200);
    if (p20) {
      const implied = Math.round(p20 * 0.95);
      if (implied > ftp * 1.06) {
        insights.push({
          color: 'var(--yellow)',
          icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
          title: 'FTP may be underestimated',
          body: `Your best 20min power of ${Math.round(p20)}w implies an FTP around <strong>${implied}w</strong>. Consider doing an FTP test and updating your setting in intervals.icu to get accurate zone training targets.`,
        });
      } else if (implied < ftp * 0.88) {
        insights.push({
          color: 'var(--blue)',
          icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
          title: 'Grow into your FTP',
          body: `Your 20min peak is below your set FTP of ${ftp}w — a sign of room to grow. Focused threshold intervals (4×8min, 2×20min) can help you close that gap.`,
        });
      }
    }
  }

  // 3. Zone distribution pattern
  const cutoff = toDateStr(daysAgo(days));
  const acts   = state.activities.filter(a => (a.start_date_local || a.start_date || '').slice(0, 10) >= cutoff);
  const totals = [0, 0, 0, 0, 0, 0];
  let zTotal   = 0;
  acts.forEach(a => {
    const zt = a.icu_zone_times;
    if (!Array.isArray(zt)) return;
    zt.forEach(z => {
      const m = z?.id?.match(/^Z(\d)$/);
      if (!m) return;
      const idx = parseInt(m[1], 10) - 1;
      if (idx >= 0 && idx < 6) { totals[idx] += z.secs || 0; zTotal += z.secs || 0; }
    });
  });

  if (zTotal > 0) {
    const z12 = (totals[0] + totals[1]) / zTotal;
    const z34 = (totals[2] + totals[3]) / zTotal;
    const z56 = (totals[4] + totals[5]) / zTotal;

    if (z12 < 0.50) {
      insights.push({
        color: 'var(--blue)',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
        title: 'Build more aerobic base',
        body: `Only <strong>${Math.round(z12 * 100)}%</strong> of your training is in Z1–Z2. Research shows 70–80% easy riding builds long-term capacity. Try adding longer, low-intensity rides to unlock faster adaptation.`,
      });
    } else if (z12 >= 0.65 && z56 >= 0.10) {
      insights.push({
        color: 'var(--accent)',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
        title: 'Polarized training — great work',
        body: `<strong>${Math.round(z12 * 100)}%</strong> easy + <strong>${Math.round(z56 * 100)}%</strong> hard. This polarized split matches what elite endurance athletes use and is linked to superior long-term performance gains.`,
      });
    } else if (z34 >= 0.40) {
      insights.push({
        color: 'var(--orange)',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
        title: 'Watch your threshold load',
        body: `<strong>${Math.round(z34 * 100)}%</strong> of training in Z3–Z4 is demanding. Prolonged sweet-spot blocks accumulate fatigue fast — make sure you're scheduling adequate recovery weeks.`,
      });
    }
  }

  // 4. Ride consistency
  const poweredCount = acts.filter(a =>
    actVal(a, 'icu_weighted_avg_watts', 'average_watts', 'icu_average_watts') > 0
  ).length;
  if (poweredCount >= 6) {
    insights.push({
      color: 'var(--accent)',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
      title: `${poweredCount} powered rides in ${days} days`,
      body: `Ride frequency is one of the strongest predictors of improvement. ${poweredCount} power-tracked sessions in ${days} days — that's solid consistency. Keep showing up!`,
    });
  } else if (!ftp) {
    insights.push({
      color: 'var(--blue)',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
      title: 'Set your FTP for full analysis',
      body: `Head to intervals.icu → Settings → Sport Settings and set your FTP. This unlocks personalised power zones, W/kg calculations, and training recommendations tailored to your fitness.`,
    });
  }

  el.innerHTML = insights.map(c => `
    <div class="pwr-insight-card" style="--ic-color:${c.color}">
      <div class="pwr-insight-icon" style="color:${c.color}">${c.icon}</div>
      <div class="pwr-insight-body">
        <div class="pwr-insight-title">${c.title}</div>
        <div class="pwr-insight-text">${c.body}</div>
      </div>
    </div>
  `).join('');
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
    updateSidebarCTL();
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
    state._fitZonePieChart = destroyChart(state._fitZonePieChart);
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
        animations: false,
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
  state.fitnessPageChart = destroyChart(state.fitnessPageChart);

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
    interaction: { mode: 'indexEager', intersect: false },
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
  state.fitnessWeeklyPageChart = destroyChart(state.fitnessWeeklyPageChart);

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

/* ====================================================
   ZONES PAGE
==================================================== */
const HR_ZONE_HEX  = ['#60a5fa','#34d399','#86efac','#fbbf24','#f97316','#f87171','#e879f9'];

function setZnpRange(days) {
  state.znpRangeDays = days;
  document.querySelectorAll('#znpRangeTabs .znp-tab').forEach(b =>
    b.classList.toggle('active', +b.dataset.days === days)
  );
  renderZonesPage();
}

function renderZonesPage() {
  if (!state.synced) return;
  const days      = state.znpRangeDays || 90;
  const now       = Date.now();
  const cutoff    = now - days * 86400000;
  const prevCutoff= now - days * 2 * 86400000;

  const recent = state.activities.filter(a =>
    new Date(a.start_date_local || a.start_date).getTime() >= cutoff
  );
  const prev = state.activities.filter(a => {
    const t = new Date(a.start_date_local || a.start_date).getTime();
    return t >= prevCutoff && t < cutoff;
  });

  renderZnpKPIs(recent, prev);
  renderZnpHRZones(recent, prev, days);
  renderZnpPwrZones(recent, prev, days);
  renderZnpDecoupleChart();
  renderZnpZoneTimeChart();
  renderZnpInsights(recent, prev);
}

// Sum icu_hr_zone_times (plain number array) across activities
function znpSumHRZones(activities) {
  const n = 7, totals = new Array(n).fill(0);
  activities.forEach(a => {
    const zt = a.icu_hr_zone_times;
    if (!Array.isArray(zt)) return;
    zt.forEach((z, i) => {
      if (i < n) totals[i] += typeof z === 'number' ? z : (z?.secs || 0);
    });
  });
  return totals;
}

// Sum icu_zone_times [{id:'Z1',secs:…}] across activities
function znpSumPwrZones(activities) {
  const totals = new Array(6).fill(0);
  activities.forEach(a => {
    const zt = a.icu_zone_times;
    if (!Array.isArray(zt)) return;
    zt.forEach(z => {
      if (!z?.id) return;
      const m = z.id.match(/^Z(\d)$/);
      if (!m) return;
      const idx = +m[1] - 1;
      if (idx >= 0 && idx < 6) totals[idx] += (z.secs || 0);
    });
  });
  return totals;
}

function renderZnpKPIs(recent, prev) {
  const row = document.getElementById('znpKpiRow');
  if (!row) return;

  // Aerobic decoupling avg
  const dcR = recent.filter(a => a.icu_aerobic_decoupling != null).map(a => a.icu_aerobic_decoupling);
  const dcP = prev  .filter(a => a.icu_aerobic_decoupling != null).map(a => a.icu_aerobic_decoupling);
  const dcAvg  = dcR.length ? +(dcR.reduce((s,v)=>s+v,0)/dcR.length).toFixed(1) : null;
  const dcPAvg = dcP.length ? +(dcP.reduce((s,v)=>s+v,0)/dcP.length).toFixed(1) : null;
  const dcColor = v => Math.abs(v) < 5 ? 'var(--accent)' : Math.abs(v) < 8 ? 'var(--yellow)' : 'var(--red)';
  const dcTrend = (dcAvg != null && dcPAvg != null)
    ? (dcAvg < dcPAvg - 0.5 ? `↓ ${(dcPAvg - dcAvg).toFixed(1)}% better` : dcAvg > dcPAvg + 0.5 ? `↑ ${(dcAvg - dcPAvg).toFixed(1)}% worse` : '→ stable')
    : (dcR.length ? 'avg HR drift' : 'No data');
  const dcTrendColor = (dcAvg != null && dcPAvg != null)
    ? (dcAvg < dcPAvg - 0.5 ? 'var(--accent)' : dcAvg > dcPAvg + 0.5 ? 'var(--red)' : 'var(--text-muted)')
    : 'var(--text-muted)';

  // Z2 HR aerobic base %
  const hrT    = znpSumHRZones(recent);
  const hrPT   = znpSumHRZones(prev);
  const hrTot  = hrT.reduce((s,v)=>s+v,0);
  const hrPTot = hrPT.reduce((s,v)=>s+v,0);
  const z2Pct  = hrTot  > 0 ? Math.round(hrT[1]  / hrTot  * 100) : null;
  const z2PPct = hrPTot > 0 ? Math.round(hrPT[1] / hrPTot * 100) : null;
  const z2Color = z2Pct == null ? 'var(--text-muted)' : z2Pct >= 45 ? 'var(--accent)' : z2Pct >= 28 ? 'var(--yellow)' : 'var(--red)';
  const z2Delta = (z2Pct != null && z2PPct != null) ? z2Pct - z2PPct : null;
  const z2Trend = z2Delta != null
    ? (z2Delta > 2 ? `↑ +${z2Delta}% vs prev` : z2Delta < -2 ? `↓ ${z2Delta}% vs prev` : '→ stable vs prev')
    : (z2Pct != null ? 'of HR time in Z2' : 'No HR data');
  const z2TrendColor = z2Delta != null
    ? (z2Delta > 2 ? 'var(--accent)' : z2Delta < -2 ? 'var(--red)' : 'var(--text-muted)')
    : 'var(--text-muted)';

  // Training style
  const pwrT   = znpSumPwrZones(recent);
  const pwrTot = pwrT.reduce((s,v)=>s+v,0);
  let style = 'Unknown', styleColor = 'var(--text-muted)', styleDesc = 'Not enough power data';
  if (pwrTot > 0) {
    const z12 = (pwrT[0]+pwrT[1])/pwrTot;
    const z34 = (pwrT[2]+pwrT[3])/pwrTot;
    const z56 = (pwrT[4]+pwrT[5])/pwrTot;
    if (z12 >= 0.65 && z56 >= 0.10)  { style='Polarized';  styleColor='var(--accent)'; styleDesc='Easy base + hard top-end efforts'; }
    else if (z34 >= 0.40)             { style='Sweet-spot'; styleColor='var(--yellow)'; styleDesc='Threshold-focused training'; }
    else if (z12 >= 0.60)             { style='Pyramidal';  styleColor='var(--blue)';   styleDesc='Broad aerobic base'; }
    else                              { style='Mixed';       styleColor='var(--orange)'; styleDesc='Varied intensity'; }
  }

  row.innerHTML = [
    { label:'Aerobic Decoupling', value: dcAvg!=null ? dcAvg+'%' : '—', color: dcAvg!=null ? dcColor(dcAvg) : 'var(--text-muted)', trend:dcTrend, trendColor:dcTrendColor },
    { label:'Z2 Aerobic Base',    value: z2Pct!=null ? z2Pct+'%' : '—', color: z2Color,                                             trend:z2Trend, trendColor:z2TrendColor },
    { label:'Training Style',     value: style,                           color: styleColor,                                         trend:styleDesc, trendColor:'var(--text-muted)' },
  ].map(k => `
    <div class="znp-kpi-card">
      <div class="znp-kpi-label">${k.label}</div>
      <div class="znp-kpi-value" style="color:${k.color}">${k.value}</div>
      <div class="znp-kpi-sub" style="color:${k.trendColor}">${k.trend}</div>
    </div>`).join('');

  row.querySelectorAll('.znp-kpi-card').forEach(el => {
    if (!el.dataset.glow) { el.dataset.glow = '1'; window.attachCardGlow?.(el); }
  });
}

function znpZoneRows(totals, names, hexes, totalSecs, prevTotals) {
  const prevTotal = prevTotals ? prevTotals.reduce((s,v)=>s+v,0) : 0;
  const rows = totals.map((secs, i) => {
    if (secs === 0) return '';
    const pct     = Math.round(totalSecs > 0 ? secs / totalSecs * 100 : 0);
    const prevPct = prevTotal > 0 ? prevTotals[i] / prevTotal * 100 : null;
    const delta   = prevPct != null ? pct - prevPct : null;
    const color   = hexes[i] || '#888';
    const deltaHtml = (delta != null && Math.abs(delta) >= 1)
      ? `<span class="znp-zone-delta" style="color:${delta > 0 ? color : 'var(--text-muted)'}">${delta > 0 ? '+' : ''}${delta.toFixed(0)}%</span>`
      : '';
    return `<div class="zone-row">
      <span class="zone-tag" style="color:${color}">Z${i+1}</span>
      <span class="zone-row-name">${names[i]}</span>
      <div class="zone-bar-track">
        <div class="zone-bar-fill" style="width:${pct}%;background:${color}"></div>
      </div>
      <span class="zone-pct" style="color:${color}">${pct}%</span>
      <span class="zone-time">${fmtDur(secs)}</span>
      ${deltaHtml}
    </div>`;
  }).join('');
  return `<div class="zone-list">${rows}</div>`;
}

function znpBalanceBar(totals, hexes) {
  const total = totals.reduce((s,v)=>s+v,0);
  if (!total) return '';
  const segs = totals.map((t,i) => {
    const p = t / total * 100;
    return p > 0.5 ? `<div class="zone-balance-seg" style="flex:${p};background:${hexes[i]}"></div>` : '';
  }).join('');
  return `<div class="zone-balance-section">
    <div class="zone-balance-label">Zone Balance</div>
    <div class="zone-balance-bar">${segs}</div>
  </div>`;
}

function renderZnpHRZones(recent, prev, days) {
  const totals     = znpSumHRZones(recent);
  const prevTotals = znpSumHRZones(prev);
  const totalSecs  = totals.reduce((s,v)=>s+v,0);
  const bodyEl     = document.getElementById('znpHRZoneBody');
  const badgeEl    = document.getElementById('znpHRZoneBadge');
  const balEl      = document.getElementById('znpHRZoneBalance');
  const subEl      = document.getElementById('znpHRZoneSub');
  if (!bodyEl) return;

  if (subEl) subEl.textContent = `Time in HR zone · last ${days} days`;

  if (totalSecs === 0) {
    bodyEl.innerHTML = '<div class="znp-empty">No HR zone data in this period</div>';
    if (badgeEl) badgeEl.textContent = '';
    if (balEl)   balEl.innerHTML = '';
    return;
  }
  if (badgeEl) badgeEl.textContent = fmtDur(totalSecs) + ' total';
  bodyEl.innerHTML  = znpZoneRows(totals, HR_ZONE_NAMES, HR_ZONE_HEX, totalSecs, prevTotals);
  if (balEl) balEl.innerHTML = znpBalanceBar(totals, HR_ZONE_HEX);
}

function renderZnpPwrZones(recent, prev, days) {
  const totals     = znpSumPwrZones(recent);
  const prevTotals = znpSumPwrZones(prev);
  const totalSecs  = totals.reduce((s,v)=>s+v,0);
  const bodyEl     = document.getElementById('znpPwrZoneBody');
  const badgeEl    = document.getElementById('znpPwrZoneBadge');
  const balEl      = document.getElementById('znpPwrZoneBalance');
  const subEl      = document.getElementById('znpPwrZoneSub');
  if (!bodyEl) return;

  if (subEl) subEl.textContent = `Time in power zone · last ${days} days`;

  if (totalSecs === 0) {
    bodyEl.innerHTML = '<div class="znp-empty">No power zone data in this period</div>';
    if (badgeEl) badgeEl.textContent = '';
    if (balEl)   balEl.innerHTML = '';
    return;
  }
  if (badgeEl) badgeEl.textContent = fmtDur(totalSecs) + ' total';
  bodyEl.innerHTML  = znpZoneRows(totals, ZONE_NAMES, ZONE_HEX, totalSecs, prevTotals);
  if (balEl) balEl.innerHTML = znpBalanceBar(totals, ZONE_HEX);
}

function renderZnpDecoupleChart() {
  const subEl    = document.getElementById('znpDecoupleSub');
  const badgeEl  = document.getElementById('znpDecoupleAvgBadge');

  const acts = state.activities
    .filter(a => a.icu_aerobic_decoupling != null)
    .sort((a,b) => new Date(a.start_date_local||a.start_date) - new Date(b.start_date_local||b.start_date))
    .slice(-60);

  if (acts.length < 3) {
    if (subEl)   subEl.textContent   = 'Not enough data yet — sync more rides';
    if (badgeEl) badgeEl.textContent = '';
    return;
  }

  const labels   = acts.map(a => {
    const d = new Date(a.start_date_local || a.start_date);
    return d.toLocaleDateString('en-US', { month:'short', day:'numeric' });
  });
  const values   = acts.map(a => +a.icu_aerobic_decoupling.toFixed(1));
  const ptColors = values.map(v => Math.abs(v)<5 ? '#00e5a0' : Math.abs(v)<8 ? '#fbbf24' : '#f87171');
  const avg      = +(values.reduce((s,v)=>s+v,0)/values.length).toFixed(1);

  if (subEl)   subEl.textContent   = `HR drift vs power · last ${acts.length} rides`;
  if (badgeEl) badgeEl.textContent = `avg ${avg}%`;

  if (state._znpDecoupleChart) { state._znpDecoupleChart.destroy(); state._znpDecoupleChart = null; }
  const ctx = document.getElementById('znpDecoupleChart')?.getContext('2d');
  if (!ctx) return;

  state._znpDecoupleChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: '#60a5fa',
        borderWidth: 2,
        pointBackgroundColor: ptColors,
        pointBorderColor:     ptColors,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.35,
        fill: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'indexEager', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...C_TOOLTIP,
          callbacks: {
            title:       ctx  => ctx[0].label,
            label:       ctx  => `Decoupling: ${ctx.raw}%`,
            afterLabel:  ctx  => Math.abs(ctx.raw)<5 ? '✓ Aerobically fit' : Math.abs(ctx.raw)<8 ? '⚠ Acceptable' : '✗ Needs base work',
          }
        }
      },
      scales: {
        x: { grid: C_GRID, ticks: { ...C_TICK, maxRotation:0, maxTicksLimit:8, autoSkip:true } },
        y: {
          grid: C_GRID,
          ticks: { ...C_TICK, callback: v => v+'%' },
          suggestedMin: -2,
          suggestedMax: 15,
        }
      }
    }
  });
}

function renderZnpInsights(recent, prev) {
  const row = document.getElementById('znpInsightsRow');
  if (!row) return;

  const pwrT   = znpSumPwrZones(recent);
  const pwrTot = pwrT.reduce((s,v)=>s+v,0);
  const hrT    = znpSumHRZones(recent);
  const hrTot  = hrT.reduce((s,v)=>s+v,0);

  const dcVals = recent.filter(a=>a.icu_aerobic_decoupling!=null).map(a=>a.icu_aerobic_decoupling);
  const dcAvg  = dcVals.length ? dcVals.reduce((s,v)=>s+v,0)/dcVals.length : null;
  const z2hrPct  = hrTot  > 0 ? hrT[1]  / hrTot  * 100 : null;
  const z3pwrPct = pwrTot > 0 ? pwrT[2] / pwrTot * 100 : null;
  const z12pct   = pwrTot > 0 ? (pwrT[0]+pwrT[1]) / pwrTot * 100 : null;
  const z56pct   = pwrTot > 0 ? (pwrT[4]+pwrT[5]) / pwrTot * 100 : null;

  const insights = [];

  if (dcAvg != null && dcAvg > 8) {
    insights.push({ type:'warning', icon:'🫀', title:'Aerobic base needs work',
      body:`Your average aerobic decoupling is ${dcAvg.toFixed(1)}% — above the 8% warning threshold. Your heart rate is drifting significantly relative to your power output, a sign that your aerobic engine can't sustain effort without recruiting more cardiovascular stress.`,
      tip:'Add 2–3 long Z2 rides per week at 60–70% max HR for 60–90 min each. This is the highest-ROI training change you can make.' });
  } else if (dcAvg != null && dcAvg < 5) {
    insights.push({ type:'good', icon:'✅', title:'Strong aerobic efficiency',
      body:`Your decoupling averages ${dcAvg.toFixed(1)}% — well under the 5% target. Your heart rate tracks your power output closely throughout rides, which is a hallmark of strong aerobic conditioning and fat metabolism.`,
      tip:'Maintain this with consistent volume. You can handle more intensity or duration without aerobic breakdown.' });
  }

  if (z3pwrPct != null && z3pwrPct > 30) {
    insights.push({ type:'warning', icon:'⚠️', title:'Too much grey zone (Z3 Tempo)',
      body:`${Math.round(z3pwrPct)}% of your power training is in Z3 — the "grey zone" that's too hard to fully recover from, yet too easy to drive strong VO₂max or threshold adaptations. It accumulates fatigue without maximising fitness gains.`,
      tip:'Shift Z3 time either down to Z2 endurance or up to Z4–Z5 intervals. Polarize your training.' });
  }

  if (z2hrPct != null && z2hrPct < 25 && hrTot > 3600) {
    insights.push({ type:'warning', icon:'📉', title:'Low aerobic base volume',
      body:`Only ${Math.round(z2hrPct)}% of your heart rate time is in Z2 Aerobic Base. Most coaches recommend 60–80% of all training at easy aerobic effort. Base volume is the foundation that makes all other training work better.`,
      tip:'Replace some moderate-effort rides with genuinely easy endurance rides — conversational pace, nasal breathing.' });
  }

  if (z12pct != null && z56pct != null && z12pct >= 65 && z56pct >= 10) {
    insights.push({ type:'good', icon:'🎯', title:'Polarized training pattern',
      body:`${Math.round(z12pct)}% easy + ${Math.round(z56pct)}% hard. This polarized distribution matches what research shows delivers optimal long-term adaptations — it's the approach used by most elite endurance athletes and coaches.`,
      tip:'Keep it up. Critically, make sure easy days stay genuinely easy — resist the urge to push.' });
  }

  if (z56pct != null && z56pct < 5 && pwrTot > 7200) {
    insights.push({ type:'neutral', icon:'💡', title:'Consider adding high-intensity work',
      body:`Less than 5% of your training is in Z5–Z6. While aerobic base is essential, periodic hard efforts drive VO₂max improvements and neuromuscular adaptations that easy rides cannot provide.`,
      tip:'Add one interval session per week — try 4×5 min at VO₂max power with equal rest, or hill sprints.' });
  }

  if (!insights.length) {
    insights.push({ type:'neutral', icon:'📊', title:'Keep training consistently',
      body:'Sync more activities to see personalised insights here. The more data synced, the more accurate the zone and progression analysis becomes.',
      tip:'Make sure your power meter or HR monitor is recording on every ride.' });
  }

  const cls = { warning:'znp-insight--warning', good:'znp-insight--good', neutral:'' };
  row.innerHTML = insights.map(ins => `
    <div class="znp-insight ${cls[ins.type]||''}">
      <div class="znp-insight-icon">${ins.icon}</div>
      <div class="znp-insight-body">
        <div class="znp-insight-title">${ins.title}</div>
        <div class="znp-insight-text">${ins.body}</div>
        <div class="znp-insight-tip">💡 ${ins.tip}</div>
      </div>
    </div>`).join('');
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
  let totalActs = 0, totalDist = 0, totalTSS = 0, totalSecs = 0, totalCals = 0;
  Object.entries(actMap).forEach(([d, acts]) => {
    const [y, mo] = d.split('-').map(Number);
    if (y === year && mo === month + 1) {
      acts.forEach(({ a }) => {
        if (isEmptyActivity(a)) return;
        totalActs++;
        totalDist += actVal(a, 'distance', 'icu_distance');
        totalTSS  += actVal(a, 'icu_training_load', 'tss');
        totalSecs += actVal(a, 'moving_time', 'elapsed_time', 'icu_moving_time', 'icu_elapsed_time');
        totalCals += actVal(a, 'calories', 'icu_calories') || 0;
      });
    }
  });

  const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setEl('calStatActivities', totalActs || '0');
  setEl('calStatDist',       totalDist > 0 ? (totalDist / 1000).toFixed(0) + ' km' : '—');
  setEl('calStatTSS',        totalTSS > 0  ? Math.round(totalTSS) : '—');
  setEl('calStatTime',       totalSecs > 0 ? fmtDur(totalSecs) : '—');
  setEl('calStatCals',       totalCals > 0 ? Math.round(totalCals).toLocaleString() + ' kcal' : '—');

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

    // ── Heart rate pill (desktop only) ──
    const hrVals = realActs
      .map(({ a }) => actVal(a, 'average_heartrate', 'icu_average_heartrate'))
      .filter(v => v > 0);
    const avgHR = hrVals.length > 0 ? Math.round(hrVals.reduce((s, v) => s + v, 0) / hrVals.length) : 0;
    const hrHtml = avgHR > 0
      ? `<div class="cal-day-hr${!thisMonth ? ' cal-day-hr--muted' : ''}"><svg viewBox="0 0 16 14" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M8 13.1L1.4 6.6C0.5 5.7 0 4.5 0 3.3 0 1.5 1.5 0 3.3 0c1 0 2 .5 2.7 1.2L8 3.5l2-2.3C10.7.5 11.7 0 12.7 0 14.5 0 16 1.5 16 3.3c0 1.2-.5 2.4-1.4 3.3L8 13.1z"/></svg>${avgHR}</div>`
      : '';

    return `<div class="${cls}" data-date="${dateStr}" onclick="selectCalDay('${dateStr}')">
      <div class="cal-day-num">${date.getDate()}</div>
      ${desktopHtml}
      ${mobileHtml}
      ${hrHtml}
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

  // Remove dashboard glow (not using navigate() here, so remove manually)
  document.body.classList.remove('dashboard-glow');
  stopGlowParticles();

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
    renderDetailDecoupleChart(normStreams, richActivity);
    renderDetailZones(richActivity);
    renderDetailHRZones(richActivity);
    // Both zone cards always show now (with NA if no data), so the row is always two-column
    renderDetailHistogram(richActivity, normStreams);
    renderDetailTempChart(normStreams, richActivity);
    renderDetailGradientProfile(normStreams, richActivity);
    renderDetailCadenceHist(normStreams, richActivity);
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

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('detailMapCard')?.classList.contains('map-fullscreen')) {
    toggleMapFullscreen();
  }
});

function toggleMapFullscreen() {
  const card = document.getElementById('detailMapCard');
  const btn  = document.getElementById('mapExpandBtn');
  if (!card) return;
  const isFs = card.classList.toggle('map-fullscreen');
  // Swap icon: expand ↔ collapse
  if (btn) btn.innerHTML = isFs
    ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>'
    : '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';
  // Lock body scroll when fullscreen
  document.body.style.overflow = isFs ? 'hidden' : '';
  // Enable/disable direct scroll-wheel zoom (no Alt key needed) in fullscreen
  if (state.activityMap) {
    if (isFs) state.activityMap.scrollWheelZoom.enable();
    else      state.activityMap.scrollWheelZoom.disable();
  }
  // Move stats content into the fullscreen bottom-left panel (or back)
  const statsPanel  = document.getElementById('mapStatsPanel');
  const fsLeft      = document.getElementById('fsBottomLeft');
  if (statsPanel && fsLeft) {
    if (isFs) {
      // Copy gauge + metrics into the bottom-left panel
      fsLeft.innerHTML = statsPanel.innerHTML;
      // Re-attach glow
      fsLeft.querySelectorAll('.mm-cell').forEach(el => {
        if (!el.dataset.glow) { el.dataset.glow = '1'; window.attachCardGlow && window.attachCardGlow(el); }
      });
    } else {
      fsLeft.innerHTML = '';
    }
  }
  // Invalidate mini chart cache so it redraws at new size
  if (state.flythrough?._drawMiniChart) {
    state.flythrough._invalidateMC?.();
    // Small delay for layout to settle
    setTimeout(() => state.flythrough?._drawMiniChart(state.flythrough?.idx || 0), 80);
  }
  // Let Leaflet recalculate the new container size
  setTimeout(() => { if (state.activityMap) state.activityMap.invalidateSize(); }, 50);
}

function destroyActivityCharts() {
  // Exit map fullscreen if active
  const mapCard = document.getElementById('detailMapCard');
  if (mapCard?.classList.contains('map-fullscreen')) {
    mapCard.classList.remove('map-fullscreen');
    document.body.style.overflow = '';
  }
  if (state.flythrough?.rafId) { cancelAnimationFrame(state.flythrough.rafId); }
  state.flythrough = null;
  // Reset mini chart + fullscreen bottom panels
  const _miniC = document.getElementById('fsMiniChart');
  if (_miniC) _miniC.classList.remove('mc-ready');
  const _fsL = document.getElementById('fsBottomLeft');
  if (_fsL) _fsL.innerHTML = '';
  if (state.activityMap) { state.activityMap.remove(); state.activityMap = null; }
  state._streetTileRef = null;
  state._colorLayerRef = null;
  state.activityStreamsChart   = destroyChart(state.activityStreamsChart);
  state.activityPowerChart     = destroyChart(state.activityPowerChart);
  state.activityHRChart        = destroyChart(state.activityHRChart);
  state.activityCurveChart     = destroyChart(state.activityCurveChart);
  state.activityHRCurveChart   = destroyChart(state.activityHRCurveChart);
  state.activityHistogramChart = destroyChart(state.activityHistogramChart);
  state.activityGradientChart  = destroyChart(state.activityGradientChart);
  state.activityCadenceChart   = destroyChart(state.activityCadenceChart);
  if (window._tempChart) { window._tempChart.destroy(); window._tempChart = null; }
  if (state._detailDecoupleChart) { state._detailDecoupleChart.destroy(); state._detailDecoupleChart = null; }
  ['detailMapCard', 'detailStreamsCard', 'detailChartsRow', 'detailZonesCard', 'detailHRZonesCard',
   'detailHistogramCard', 'detailCurveCard', 'detailHRCurveCard', 'detailPerfCard',
   'detailWeatherCard', 'detailTempCard', 'detailDecoupleCard',
   'detailGradientCard', 'detailCadenceCard'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = 'none';
    // Clear any injected NA overlays so they don't double-up next time
    el.querySelectorAll('.detail-na-inject').forEach(e => e.remove());
    el.querySelectorAll('[data-na-hidden]').forEach(e => { e.style.display = ''; delete e.dataset.naHidden; });
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
  const types   = 'time,watts,heartrate,cadence,velocity_smooth,altitude,distance,latlng,lat,lng,grade_smooth,temp,temperature';
  const headers = { ...authHeader(), 'Accept': 'application/json' };

  // Try typed URLs first (faster, less data)
  const typedUrls = [
    ICU_BASE + `/athlete/${state.athleteId}/activities/${activityId}/streams?streams=${types}`,
    ICU_BASE + `/activity/${activityId}/streams?streams=${types}`,
  ];

  let streams = null;
  for (const url of typedUrls) {
    const res = await fetch(url, { headers });
    if (res.status === 404) continue;
    if (!res.ok) throw new Error(`${res.status}: ${await res.text().catch(() => res.statusText)}`);
    const data = await res.json();
    if (data && (Array.isArray(data) ? data.length : Object.keys(data).length)) { streams = data; break; }
  }

  // If typed fetch succeeded but temp is absent, try the unfiltered endpoint which returns
  // all recorded streams including temperature (intervals.icu may not expose it in the typed path)
  if (streams) {
    const norm = normalizeStreams(streams);
    if (!norm.temp && !norm.temperature) {
      try {
        const res = await fetch(ICU_BASE + `/activity/${activityId}/streams`, { headers });
        if (res.ok) {
          const allData = await res.json();
          const allNorm = normalizeStreams(allData);
          const tempArr = allNorm.temp || allNorm.temperature || null;
          if (tempArr && tempArr.length > 0) {
            // Merge temp into the existing streams array/object
            if (Array.isArray(streams)) {
              streams.push({ type: 'temp', data: tempArr });
            } else {
              streams.temp = tempArr;
            }
          }
        }
      } catch (_) {}
    }
    return streams;
  }

  // Full fallback: unfiltered endpoint
  try {
    const res = await fetch(ICU_BASE + `/activity/${activityId}/streams`, { headers });
    if (res.ok) {
      const data = await res.json();
      if (data && (Array.isArray(data) ? data.length : Object.keys(data).length)) return data;
    }
  } catch (_) {}

  return null;
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
          case 5:   rec.distance    = raw / 100;        break; // cm → m
          case 6:   rec.speed       = raw / 1000;       break; // mm/s → m/s
          case 7:   rec.power       = raw;              break;
          case 13:  rec.temperature = raw;              break; // °C — Garmin ambient temp sensor
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

// Convert parsed FIT records → { time, watts, heartrate, cadence, velocity_smooth, altitude, temp }
function fitRecordsToStreams(records) {
  if (!records || !records.length) return null;
  const t0 = (records.find(r => r.timestamp) || {}).timestamp || 0;
  const out = { time: [], watts: [], heartrate: [], cadence: [], velocity_smooth: [], altitude: [], temp: [], latlng: [] };
  records.forEach(r => {
    out.time.push((r.timestamp || 0) - t0);
    out.watts.push(r.power      ?? null);
    out.heartrate.push(r.heart_rate ?? null);
    out.cadence.push(r.cadence  ?? null);
    out.velocity_smooth.push(r.speed ?? null);  // m/s — renderStreamCharts converts to km/h
    out.altitude.push(r.altitude ?? null);
    out.temp.push(r.temperature ?? null);        // °C — Garmin ambient temp sensor
    out.latlng.push((r.lat != null && r.lng != null) ? [r.lat, r.lng] : null);
  });
  // Drop streams with no real data (all nulls)
  if (out.latlng.every(p => p === null)) delete out.latlng;
  if (out.temp.every(v => v === null))   delete out.temp;
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
  const P_ICONS = {
    km:         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0"/><path d="M12 8v4l3 3"/></svg>`,
    duration:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    power:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    bpm:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
    speed:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 10 10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  };
  const pStat = (val, lbl, accent = false, cmpPct = null, iconKey = '') => {
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
    const iconHtml = P_ICONS[iconKey] ? `<div class="act-pstat-icon${accent ? ' accent' : ''}">${P_ICONS[iconKey]}</div>` : '';
    return `<div class="act-pstat${accent ? ' act-pstat--accent' : ''}">
       <div class="act-pstat-top">${iconHtml}<div class="act-pstat-lbl">${lbl}</div></div>
       <div class="act-pstat-val">${val}</div>
       ${cmpHtml}
     </div>`;
  };

  const primary = [];
  if (distKm > 0.05) primary.push(pStat(distKm.toFixed(1), 'Distance', false, pctDist, 'km'));
  if (secs > 0)      primary.push(pStat(fmtDur(secs), 'Duration', false, pctSecs, 'duration'));
  if (np > 0)        primary.push(pStat(Math.round(np) + 'W', 'Norm Power', true, pctPow, 'power'));
  else if (avgW > 0) primary.push(pStat(Math.round(avgW) + 'W', 'Avg Power', true, pctPow, 'power'));
  if (avgHR > 0)     primary.push(pStat(Math.round(avgHR), 'Avg BPM', false, pctHR, 'bpm'));
  else if (speedKmh > 0.5) primary.push(pStat(speedKmh.toFixed(1), 'Avg Speed', false, pctSpd, 'speed'));

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

  const secEl = document.getElementById('actSecondaryStats');
  secEl.innerHTML = sec;
  secEl.querySelectorAll('.act-sstat').forEach(el => {
    if (!el.dataset.glow) { el.dataset.glow = '1'; window.attachCardGlow && window.attachCardGlow(el); }
  });

  // ── Weather conditions during this ride ──────────────────────────────────
  renderActivityWeather(a);

  // ── Render the "How You Compare" card ────────────────────────────────────
  renderDetailComparison(a);

  // ── Data source / device footer ───────────────────────────────────────────
  renderDetailSourceFooter(a);
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
    const fillColor = (!up && !dn) ? '#3d4459'   // at average → neutral grey
                    : positive     ? '#00e5a0'   // performing better than avg → green
                    :                '#fb923c';  // performing worse than avg → amber
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

function renderDetailSourceFooter(a) {
  const el = document.getElementById('detailSourceFooter');
  if (!el) return;

  const parts = [];

  // Device that recorded the activity
  const device = a.device_name || a.icu_device_name;
  if (device) parts.push(`Recorded on <strong>${device}</strong>`);

  // Data source / platform (Garmin Connect, Strava, Wahoo, manual, etc.)
  // intervals.icu exposes this via external_id prefix or a dedicated source field
  let source = a.source || a.icu_source || '';
  if (!source && a.external_id) {
    const eid = String(a.external_id).toLowerCase();
    if (eid.startsWith('garmin'))       source = 'Garmin Connect';
    else if (eid.startsWith('strava'))  source = 'Strava';
    else if (eid.startsWith('wahoo'))   source = 'Wahoo';
    else if (eid.startsWith('zwift'))   source = 'Zwift';
    else if (eid.startsWith('polar'))   source = 'Polar Flow';
    else if (eid.startsWith('suunto'))  source = 'Suunto';
  }
  // Normalise raw API values like "GARMIN_CONNECT" → "Garmin Connect"
  if (source) {
    source = source.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    parts.push(`Synced from <strong>${source}</strong>`);
  }

  // Always credit the data API
  parts.push(`Data via <strong>intervals.icu</strong>`);

  // Activity ID — links directly to the activity on intervals.icu
  if (a.id) parts.push(`<a class="dsf-link" href="https://intervals.icu/activities/${a.id}" target="_blank" rel="noopener">View on intervals.icu</a>`);

  el.innerHTML = parts.join('<span class="dsf-sep">·</span>');
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

// Return an exact colour for a given stream index and colour mode.
// No quantisation — caller draws one segment per GPS pair for smooth gradients.
function routePointColor(mode, streams, si, maxes) {
  const get = (...keys) => {
    for (const k of keys) {
      const a = streams[k];
      if (Array.isArray(a) && si < a.length && a[si] != null) return a[si];
    }
    return null;
  };
  const clamp = (pct) => Math.min(1, Math.max(0, pct));

  switch (mode) {
    case 'hr': {
      const hr = get('heartrate', 'heart_rate');
      return hr != null ? hrZoneColor(hr, maxes.maxHR) : '#4b5563';
    }
    case 'speed': {
      const spd = get('velocity_smooth');
      if (spd == null) return '#3b82f6';
      const q = clamp((spd * 3.6) / (maxes.maxSpdKmh || 50));
      return lerpColor('#bfdbfe', '#1e3a8a', q);   // light → dark blue
    }
    case 'power': {
      const w = get('watts', 'power');
      if (w == null) return '#4b5563';
      const q = clamp(w / (maxes.maxWatts || 400));
      return q < 0.5
        ? lerpColor('#fde68a', '#f97316', q * 2)   // yellow → orange
        : lerpColor('#f97316', '#dc2626', (q-0.5)*2); // orange → red
    }
    case 'altitude': {
      const alt = get('altitude');
      if (alt == null) return '#4b5563';
      const range = (maxes.maxAlt - maxes.minAlt) || 1;
      const q = clamp((alt - maxes.minAlt) / range);
      return lerpColor('#34d399', '#7c3aed', q);   // green → violet
    }
    default:
      return '#00c87a';
  }
}

// Build one segment per consecutive GPS point pair with a colour smoothly
// interpolated between the exact values at each endpoint — no quantisation,
// no visible steps.  The Canvas renderer handles hundreds of short polylines
// efficiently in a single <canvas> element.
function buildColoredSegments(points, streams, mode, maxes) {
  const timeLen = streams.time?.length || points.length;

  // Exact color at every GPS point
  const colors = points.map((_, i) => {
    const si = Math.round(i * (timeLen - 1) / (points.length - 1));
    return routePointColor(mode, streams, si, maxes);
  });

  // One 2-point segment per consecutive pair; color = lerp midpoint of its two endpoints
  return points.slice(0, -1).map((pt, i) => ({
    color:  lerpColor(colors[i], colors[i + 1], 0.5),
    points: [pt, points[i + 1]],
  }));
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
  // Also update fullscreen bottom-left clone
  const _fsLeft = document.getElementById('fsBottomLeft');
  if (_fsLeft?.children.length) _refreshStatPanel(_fsLeft, streams, idx, maxSpdKmh, maxHR);
  _refreshStatPanel(panel, streams, idx, maxSpdKmh, maxHR);
}
function _refreshStatPanel(panel, streams, idx, maxSpdKmh, maxHR) {
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
  const _fsLeft = document.getElementById('fsBottomLeft');
  if (_fsLeft?.children.length) _resetStatPanel(_fsLeft);
  _resetStatPanel(panel);
}
function _resetStatPanel(panel) {
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

  if (!latlng || latlng.length < 2) { showCardNA('detailMapCard'); return; }

  const pairs = latlng.filter(p => Array.isArray(p) && p[0] != null && p[1] != null);
  const valid = pairs.filter(p => Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180);
  if (valid.length < 2) { showCardNA('detailMapCard'); return; }
  clearCardNA(card);

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

      const themeKey = loadMapTheme();
      const theme    = MAP_THEMES[themeKey] || MAP_THEMES.voyager;
      document.getElementById('activityMap').style.background = theme.bg;
      const streetTile = L.tileLayer(theme.url, {
        attribution: theme.attr, subdomains: theme.sub || 'abc', maxZoom: 19,
      });
      const satelliteTile = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; <a href="https://www.esri.com/">Esri</a> &mdash; Source: Esri, Maxar, GeoEye, Earthstar Geographics',
        maxZoom: 19,
      });
      streetTile.addTo(map);
      state._streetTileRef = streetTile; // store ref for hot-swap
      let isSatellite = false;

      // Line weight scales with zoom — thinner when zoomed out, fuller when close in
      const lineWeightForZoom = (zoom) => {
        if (zoom <= 10) return 2;
        if (zoom <= 12) return 3;
        if (zoom <= 14) return 4.5;
        return 6;
      };

      // Fix: reset cursor after zoom so it never gets stuck on zoom-in/zoom-out icon
      // Also update route line weight to match new zoom level
      map.on('zoomend zoomcancel', () => {
        map.getContainer().style.cursor = '';
        const w = lineWeightForZoom(map.getZoom());
        colorLayer.eachLayer(l => {
          l.setStyle({ weight: l.options.color === '#000' ? w + 3 : w });
        });
      });

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
      state._colorLayerRef = colorLayer; // store ref for hot-swap bringToFront
      let activeMode   = 'default';

      // Single Canvas renderer shared by all route segments — one <canvas> element,
      // much faster than hundreds of individual SVG nodes.
      const canvasRenderer = L.canvas({ padding: 0.5 });

      const applyColorMode = (mode) => {
        activeMode = mode;
        colorLayer.clearLayers();
        const segs = buildColoredSegments(points, streams, mode, maxes);

        const w = lineWeightForZoom(map.getZoom());

        // One shadow pass as a single polyline (no need for per-segment shadows)
        L.polyline(points, {
          color: '#000', weight: w + 3, opacity: 0.28,
          renderer: canvasRenderer, smoothFactor: 0,
        }).addTo(colorLayer);

        // Per-segment gradient coloring — Canvas handles hundreds cheaply
        segs.forEach(seg => {
          L.polyline(seg.points, {
            color: seg.color, weight: w, opacity: 1,
            renderer: canvasRenderer, smoothFactor: 0,
          }).addTo(colorLayer);
        });

        // Keep toggle buttons in sync
        document.querySelectorAll('.map-mode-btn').forEach(btn =>
          btn.classList.toggle('active', btn.dataset.mode === mode));
      };

      // Initial render (default green) — but start invisible; trace animation reveals it
      // We draw the route on a temporary overlay canvas, animating a "drawing" line
      // from start to end over 1.8s, then remove the overlay and show the real route.
      const doTraceAnim = () => {
        const mapContainer = map.getContainer();
        const rect = mapContainer.getBoundingClientRect();
        const oc = document.createElement('canvas');
        oc.width  = rect.width;
        oc.height = rect.height;
        oc.style.cssText = `position:absolute;inset:0;pointer-events:none;z-index:500;border-radius:inherit`;
        mapContainer.style.position = 'relative';
        mapContainer.appendChild(oc);
        const octx = oc.getContext('2d');

        // Convert lat/lng points to pixel positions on the map pane
        const pxPoints = points.map(latlng => {
          const p = map.latLngToContainerPoint(L.latLng(latlng[0], latlng[1]));
          return [p.x, p.y];
        });

        // Pre-compute cumulative distances for even-speed drawing
        const dists = [0];
        for (let i = 1; i < pxPoints.length; i++) {
          const dx = pxPoints[i][0] - pxPoints[i-1][0];
          const dy = pxPoints[i][1] - pxPoints[i-1][1];
          dists.push(dists[i-1] + Math.sqrt(dx*dx + dy*dy));
        }
        const totalLen = dists[dists.length - 1] || 1;

        const DURATION = 1800;
        const start = performance.now();
        const tick = (now) => {
          const t = Math.min((now - start) / DURATION, 1);
          const ease = t < 0.5 ? 2*t*t : -1 + (4-2*t)*t; // easeInOut
          const drawLen = totalLen * ease;

          octx.clearRect(0, 0, oc.width, oc.height);
          octx.beginPath();
          octx.strokeStyle = '#00e5a0';
          octx.lineWidth   = 4;
          octx.lineCap     = 'round';
          octx.lineJoin    = 'round';
          octx.shadowColor = 'rgba(0,229,160,0.7)';
          octx.shadowBlur  = 8;

          let drawn = 0;
          octx.moveTo(pxPoints[0][0], pxPoints[0][1]);
          for (let i = 1; i < pxPoints.length; i++) {
            const seg = dists[i] - dists[i-1];
            if (drawn + seg <= drawLen) {
              octx.lineTo(pxPoints[i][0], pxPoints[i][1]);
              drawn += seg;
            } else {
              const frac = (drawLen - drawn) / seg;
              octx.lineTo(
                pxPoints[i-1][0] + (pxPoints[i][0] - pxPoints[i-1][0]) * frac,
                pxPoints[i-1][1] + (pxPoints[i][1] - pxPoints[i-1][1]) * frac,
              );
              break;
            }
          }
          octx.stroke();

          if (t < 1) {
            requestAnimationFrame(tick);
          } else {
            // Reveal real route, fade out overlay
            applyColorMode('default');
            oc.style.transition = 'opacity 0.3s ease';
            oc.style.opacity = '0';
            setTimeout(() => oc.remove(), 350);
          }
        };

        // Hide real route during animation
        colorLayer.clearLayers();
        requestAnimationFrame(tick);
      };

      // applyColorMode will be called by the animation; just set up mode state
      activeMode = 'default';

      // ── Fit bounds + start/end markers ───────────────────────────────────
      // Compute bounds from the points array for fitBounds
      const tempPoly = L.polyline(points);
      const routeBounds = tempPoly.getBounds();
      map.fitBounds(routeBounds, { padding: [24, 24] });
      map.invalidateSize();
      state.activityMap = map;

      // Run trace animation after tiles have a moment to load
      setTimeout(doTraceAnim, 300);

      const dotIcon = (color, label) => L.divIcon({
        className: '',
        html: `<div style="
          width:14px;height:14px;border-radius:50%;
          background:${color};
          border:2.5px solid #fff;
          box-shadow:0 2px 8px rgba(0,0,0,0.7),0 0 0 2px rgba(0,0,0,0.3);
          display:flex;align-items:center;justify-content:center;
        ">${label ? `<span style="color:#fff;font-size:7px;font-weight:900;line-height:1">${label}</span>` : ''}</div>`,
        iconSize: [14, 14], iconAnchor: [7, 7],
      });
      L.marker(points[0],                 { icon: dotIcon('#00e5a0', 'S'), zIndexOffset: 200 }).addTo(map);
      L.marker(points[points.length - 1], { icon: dotIcon('#ff4444',  'F'), zIndexOffset: 200 }).addTo(map);

      // ── Alt + scroll to zoom ─────────────────────────────────────────────
      const mapEl = map.getContainer();
      let hintTimer;

      const ALT_HINT_KEY = 'icu_alt_zoom_hint_seen';

      mapEl.addEventListener('wheel', (e) => {
        if (e.altKey) {
          e.preventDefault();
          e.stopPropagation();
          const delta  = e.deltaY < 0 ? 1 : -1;
          const pt     = map.mouseEventToContainerPoint(e);
          const latlng = map.containerPointToLatLng(pt);
          map.setZoomAround(latlng, map.getZoom() + delta);
        } else if (!localStorage.getItem(ALT_HINT_KEY)) {
          // Show "hold Alt to zoom" nudge — only on first ever interaction
          let hint = mapEl.querySelector('.map-scroll-hint');
          if (!hint) {
            hint = document.createElement('div');
            hint.className = 'map-scroll-hint';
            hint.textContent = 'Hold Alt to zoom';
            mapEl.appendChild(hint);
          }
          hint.classList.add('visible');
          clearTimeout(hintTimer);
          hintTimer = setTimeout(() => {
            hint.classList.remove('visible');
            localStorage.setItem(ALT_HINT_KEY, '1');
          }, 1600);
        }
      }, { passive: false });

      // Cursor feedback when Alt is held over the map
      const onKeyDown = (e) => { if (e.key === 'Alt') mapEl.classList.add('alt-zoom');    };
      const onKeyUp   = (e) => { if (e.key === 'Alt') mapEl.classList.remove('alt-zoom'); };
      const resetAltZoom = () => mapEl.classList.remove('alt-zoom');

      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup',   onKeyUp);
      // Reset when window loses focus (Alt+Tab, cmd+Tab, etc.)
      window.addEventListener('blur',               resetAltZoom);
      document.addEventListener('visibilitychange', resetAltZoom);

      // Clean up global listeners if the map is ever removed
      map.on('remove', () => {
        window.removeEventListener('keydown',            onKeyDown);
        window.removeEventListener('keyup',              onKeyUp);
        window.removeEventListener('blur',               resetAltZoom);
        document.removeEventListener('visibilitychange', resetAltZoom);
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
        ).join('');

        togglesEl.querySelectorAll('.map-mode-btn').forEach(btn =>
          btn.addEventListener('click', () => applyColorMode(btn.dataset.mode)));

        // Satellite toggle as a Leaflet control (bottom-left)
        const SatControl = L.Control.extend({
          options: { position: 'bottomleft' },
          onAdd() {
            const btn = L.DomUtil.create('button', 'map-sat-control');
            btn.title = 'Toggle satellite imagery';
            btn.innerHTML = '<span class="map-mode-icon">🛰</span>Satellite';
            L.DomEvent.disableClickPropagation(btn);
            L.DomEvent.on(btn, 'click', () => {
              isSatellite = !isSatellite;
              if (isSatellite) {
                map.removeLayer(streetTile);
                satelliteTile.addTo(map);
              } else {
                map.removeLayer(satelliteTile);
                streetTile.addTo(map);
              }
              btn.classList.toggle('active', isSatellite);
            });
            return btn;
          },
        });
        new SatControl().addTo(map);

        // Recentre button — snaps back to route bounds
        const RecentreControl = L.Control.extend({
          options: { position: 'topright' },
          onAdd() {
            const btn = L.DomUtil.create('button', 'map-recentre-control');
            btn.title = 'Recentre map';
            btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
              <circle cx="9" cy="9" r="3"/>
              <line x1="9" y1="1" x2="9" y2="5"/>
              <line x1="9" y1="13" x2="9" y2="17"/>
              <line x1="1" y1="9" x2="5" y2="9"/>
              <line x1="13" y1="9" x2="17" y2="9"/>
            </svg>`;
            L.DomEvent.disableClickPropagation(btn);
            L.DomEvent.on(btn, 'click', () => {
              map.flyToBounds(routeBounds, { padding: [24, 24], duration: 0.6 });
            });
            return btn;
          },
        });
        new RecentreControl().addTo(map);
      }

      // ── Hover scrubbing ──────────────────────────────────────────────────
      const statsEl = document.getElementById('mapStatsPanel');
      const hasStreams = streams && (streams.watts || streams.heartrate || streams.cadence
                                     || streams.velocity_smooth || streams.altitude);

      const timeLen = streams.time?.length || valid.length;

      if (hasStreams && statsEl) {
        // Build the panel skeleton once (gauge + metric rows).
        // Do this BEFORE invalidateSize so the panel's full height is established
        // and the map can stretch to match via flexbox.
        statsEl.innerHTML = buildMapStatsHTML(streams, maxSpdKmh, maxHR);
        // Attach glow effect to the newly created mm-cell elements
        statsEl.querySelectorAll('.mm-cell').forEach(el => {
          if (!el.dataset.glow) { el.dataset.glow = '1'; window.attachCardGlow && window.attachCardGlow(el); }
        });
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
          // Don't fight flythrough — suppress hover dot while playing
          if (state.flythrough?.playing) return;
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
          // Update mini chart cursor on hover too
          if (state.flythrough?._drawMiniChart) state.flythrough._drawMiniChart(bestIdx);
        });

        map.on('mouseout', () => {
          if (state.flythrough?.playing) return;
          hoverDot.setStyle({ fillOpacity: 0, opacity: 0 });
          resetMapStats(statsEl);
        });
      }

      // ── Flythrough (always initialised when GPS data is present) ─────────
      initFlythrough(map, valid, streams, maxes, maxSpdKmh, maxHR,
                     hasStreams ? statsEl : null, timeLen, () => activeMode);

    } catch(e) { console.error('[Map] Leaflet error:', e); }
  });
}

/* ====================================================
   MAP FLYTHROUGH — animated dot traverses the route
==================================================== */
function initFlythrough(map, valid, streams, maxes, maxSpdKmh, maxHR, statsEl, timeLen, getMode) {
  const ft = {
    playing: false,
    idx: 0,
    speed: 30,   // multiplier: GPS points are ~1Hz, so 30× ≈ 30 pts/sec
    follow: true,
    rafId: null,
    lastTs: null,
    _resumeOnRelease: false,
  };
  state.flythrough = ft;

  // Show the flythrough bar now that GPS data is confirmed, reset to start
  const bar = document.getElementById('flythroughBar');
  if (bar) bar.style.display = '';
  const _fill = document.getElementById('ftScrubberFill');
  const _thumb = document.getElementById('ftScrubberThumb');
  if (_fill)  _fill.style.width = '0%';
  if (_thumb) _thumb.style.left = '0%';
  const _playBtn = document.getElementById('ftPlayBtn');
  if (_playBtn) _playBtn.innerHTML = '<svg width="11" height="13" viewBox="0 0 11 13" fill="currentColor"><polygon points="0,0 11,6.5 0,13"/></svg>';

  // Flythrough dot — above hover pane (z 460)
  map.createPane('flythroughPane');
  map.getPane('flythroughPane').style.zIndex = 460;

  const makeFtIcon = (color) => L.divIcon({
    className: '',
    html: `<div class="ft-dot-wrap">
             <div class="ft-dot-core" style="background:${color}"></div>
             <div class="ft-dot-ring" style="border-color:${color}aa"></div>
           </div>`,
    iconSize:   [14, 14],
    iconAnchor: [7,  7],
  });

  const ftMarker = L.marker(valid[0], {
    pane: 'flythroughPane',
    icon: makeFtIcon('#00e5a0'),
    zIndexOffset: 500,
  });

  // ── Fullscreen mini sparkline chart ──────────────────────────────────
  const _mc = { canvas: null, ctx: null, layers: [], layerOn: {}, cached: null, w: 0, h: 0 };

  const MC_METRICS = [
    { key: 'heartrate',       alt: 'heart_rate',     label: 'HR',       color: '#ff6b35', unit: 'bpm' },
    { key: 'watts',           alt: 'power',          label: 'Power',    color: '#00e5a0', unit: 'w'   },
    { key: 'altitude',        alt: null,             label: 'Elev',     color: '#9b59ff', unit: 'm'   },
    { key: 'cadence',         alt: null,             label: 'Cad',      color: '#4a9eff', unit: 'rpm' },
    { key: 'velocity_smooth', alt: null,             label: 'Speed',    color: '#f0c429', unit: 'km/h', scale: 3.6 },
  ];

  function initMiniChart() {
    _mc.canvas = document.getElementById('fsMiniCanvas');
    if (!_mc.canvas) return;
    _mc.ctx = _mc.canvas.getContext('2d');
    _mc.layers = [];
    _mc.layerOn = {};

    // Gather available stream layers
    MC_METRICS.forEach(m => {
      const arr = streams[m.key] || (m.alt ? streams[m.alt] : null);
      if (!arr || !arr.length) return;
      const scale = m.scale || 1;
      const vals = arr.map(v => v != null ? v * scale : null);
      // Safe min/max for large arrays (avoid stack overflow with spread)
      let min = Infinity, max = -Infinity;
      for (let i = 0; i < vals.length; i++) {
        if (vals[i] != null) {
          if (vals[i] < min) min = vals[i];
          if (vals[i] > max) max = vals[i];
        }
      }
      if (min === Infinity) return; // no valid data
      _mc.layers.push({ ...m, data: vals, min, max, rawArr: arr });
      _mc.layerOn[m.key] = true;
    });

    // Build toggle buttons
    const togEl = document.getElementById('fsMiniToggles');
    if (togEl) {
      togEl.innerHTML = _mc.layers.map(l =>
        `<button class="fs-mini-tog active" data-mckey="${l.key}" style="--sc:${l.color}">${l.label}</button>`
      ).join('');
      togEl.querySelectorAll('.fs-mini-tog').forEach(btn => {
        btn.addEventListener('click', () => {
          const k = btn.dataset.mckey;
          _mc.layerOn[k] = !_mc.layerOn[k];
          btn.classList.toggle('active', _mc.layerOn[k]);
          _mc.cached = null;  // invalidate cache
          drawMiniChart(ft.idx);
        });
      });
    }

    // Mark container as ready so CSS shows it in fullscreen
    const container = document.getElementById('fsMiniChart');
    if (container && _mc.layers.length) container.classList.add('mc-ready');

    _mc.cached = null;
    drawMiniChart(0);
  }

  function drawMiniChart(gpsIdx) {
    if (!_mc.ctx || !_mc.layers.length) return;
    const canvas = _mc.canvas;
    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (cw === 0 || ch === 0) return; // hidden — skip

    // Resize canvas buffer if needed
    if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
      _mc.w = cw;
      _mc.h = ch;
      _mc.cached = null;
    }

    const ctx = _mc.ctx;
    const w = cw * dpr;
    const h = ch * dpr;

    // Redraw cached background lines if needed
    if (!_mc.cached) {
      const offscreen = document.createElement('canvas');
      offscreen.width = w;
      offscreen.height = h;
      const oCtx = offscreen.getContext('2d');
      oCtx.clearRect(0, 0, w, h);

      const pad = 4 * dpr;
      const drawH = h - pad * 2;
      const drawW = w - pad * 0.5;

      _mc.layers.forEach(layer => {
        if (!_mc.layerOn[layer.key]) return;
        const { data, min, max, color } = layer;
        const range = max - min || 1;
        const step = Math.max(1, Math.floor(data.length / (drawW / dpr)));

        oCtx.beginPath();
        oCtx.strokeStyle = color;
        oCtx.lineWidth = 1.5 * dpr;
        oCtx.globalAlpha = 0.7;
        let started = false;

        for (let i = 0; i < data.length; i += step) {
          const v = data[i];
          if (v == null) continue;
          const x = (i / (data.length - 1)) * drawW;
          const y = pad + drawH - ((v - min) / range) * drawH;
          if (!started) { oCtx.moveTo(x, y); started = true; }
          else oCtx.lineTo(x, y);
        }
        oCtx.stroke();
        oCtx.globalAlpha = 1;
      });
      _mc.cached = offscreen;
    }

    // Draw cached background + cursor line
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(_mc.cached, 0, 0);

    // Cursor vertical line at current position
    const si = Math.round(gpsIdx * (timeLen - 1) / (valid.length - 1));
    const totalLen = _mc.layers[0]?.data.length || timeLen;
    const xPct = si / (totalLen - 1);
    const xPx = xPct * (w - 2 * dpr);

    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.5 * dpr;
    ctx.setLineDash([4 * dpr, 3 * dpr]);
    ctx.moveTo(xPx, 0);
    ctx.lineTo(xPx, h);
    ctx.stroke();
    ctx.setLineDash([]);

    // Dots at intersection with each active layer
    const dotPad = 4 * dpr;
    const dotDrawH = h - dotPad * 2;
    _mc.layers.forEach(layer => {
      if (!_mc.layerOn[layer.key]) return;
      const { data, min, max, color } = layer;
      const range = max - min || 1;
      const di = Math.min(si, data.length - 1);
      const v = data[di];
      if (v == null) return;
      const y = dotPad + dotDrawH - ((v - min) / range) * dotDrawH;
      ctx.beginPath();
      ctx.arc(xPx, y, 4 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5 * dpr;
      ctx.stroke();
    });

    // Update value labels below the chart
    updateMiniVals(si);
  }

  function updateMiniVals(si) {
    const el = document.getElementById('fsMiniVals');
    if (!el) return;
    const parts = [];
    _mc.layers.forEach(l => {
      if (!_mc.layerOn[l.key]) return;
      const arr = l.data;
      const di = Math.min(si, arr.length - 1);
      const v = arr[di];
      const display = v != null ? (l.key === 'altitude' ? Math.round(v) : v.toFixed(l.key === 'velocity_smooth' ? 1 : 0)) : '—';
      parts.push(`<span class="fs-mini-val" style="color:${l.color}"><span class="fs-mini-val-num">${display}</span><span class="fs-mini-val-unit">${l.unit}</span></span>`);
    });
    el.innerHTML = parts.join('');
  }

  // Build the mini chart after streams are ready
  if (streams) initMiniChart();
  // Expose mini chart updater so the hover handler (outside this scope) can call it
  ft._drawMiniChart = drawMiniChart;
  ft._invalidateMC = () => { _mc.cached = null; };
  ft._mcLayers = _mc.layers;

  // ── Core seek function ──────────────────────────────────────────────────
  // goTo(idx) snaps to an integer index — used for scrubbing and manual seeks.
  // goToSmooth(frac) interpolates between GPS points for fluid marker movement.
  function goTo(idx) {
    ft.idx = Math.max(0, Math.min(valid.length - 1, Math.round(idx)));
    _updatePosition(ft.idx, valid[ft.idx]);
  }

  function _updatePosition(idxForStats, pos) {
    // Update marker colour to match active route-colour mode
    const si = Math.round(idxForStats * (timeLen - 1) / (valid.length - 1));
    const color = routePointColor(getMode(), streams, si, maxes);
    ftMarker.setIcon(makeFtIcon(color));
    ftMarker.setLatLng(pos);
    if (!map.hasLayer(ftMarker)) ftMarker.addTo(map);

    if (ft.follow) map.panTo(pos, { animate: false });
    if (statsEl)   refreshMapStats(statsEl, streams, si, maxSpdKmh, maxHR);

    // Update mini chart cursor
    drawMiniChart(idxForStats);

    // Update scrubber UI
    const pct = idxForStats / (valid.length - 1);
    const fill  = document.getElementById('ftScrubberFill');
    const thumb = document.getElementById('ftScrubberThumb');
    if (fill)  fill.style.width = `${pct * 100}%`;
    if (thumb) thumb.style.left = `${pct * 100}%`;
  }

  // Interpolate marker position between two GPS points for smooth movement
  function goToSmooth(fIdx) {
    const clamped = Math.max(0, Math.min(valid.length - 1, fIdx));
    const i0 = Math.floor(clamped);
    const i1 = Math.min(i0 + 1, valid.length - 1);
    const t  = clamped - i0; // fractional part 0..1

    const lat = valid[i0][0] + (valid[i1][0] - valid[i0][0]) * t;
    const lng = valid[i0][1] + (valid[i1][1] - valid[i0][1]) * t;

    ft.idx = Math.round(clamped); // keep integer idx in sync for stats
    _updatePosition(ft.idx, [lat, lng]);
  }

  // ── RAF animation loop ──────────────────────────────────────────────────
  // ft._fIdx tracks the precise fractional position for smooth interpolation.
  // At speed=1 (realtime), we advance 1 GPS point per second (~1Hz data).
  function step(ts) {
    if (!ft.playing) return;
    if (ft.lastTs == null) { ft.lastTs = ts; ft._fIdx = ft.idx; }
    const elapsed = Math.min(ts - ft.lastTs, 100); // cap delta to avoid huge jumps after tab switch
    ft.lastTs = ts;

    ft._fIdx += elapsed * ft.speed / 1000;

    if (ft._fIdx >= valid.length - 1) {
      goTo(valid.length - 1);
      ftPause();
      return;
    }
    // Smooth or snapped movement based on user preference
    if (loadSmoothFlyover()) {
      goToSmooth(ft._fIdx);
    } else {
      const rounded = Math.round(ft._fIdx);
      if (rounded !== ft.idx) goTo(rounded);
    }
    ft.rafId = requestAnimationFrame(step);
  }

  // ── Play / Pause ────────────────────────────────────────────────────────
  const ICON_PLAY  = `<svg width="11" height="13" viewBox="0 0 11 13" fill="currentColor"><polygon points="0,0 11,6.5 0,13"/></svg>`;
  const ICON_PAUSE = `<svg width="11" height="13" viewBox="0 0 11 13" fill="currentColor"><rect x="0" y="0" width="4" height="13" rx="1"/><rect x="7" y="0" width="4" height="13" rx="1"/></svg>`;

  const FT_ZOOM = 16; // zoom level during flythrough

  function ftPlay() {
    if (ft.idx >= valid.length - 1) goTo(0); // restart from beginning
    ft.playing = true;
    ft.lastTs  = null;
    ft._fIdx   = ft.idx;
    // Save current view so we can restore on pause/stop
    if (!ft._savedZoom) {
      ft._savedZoom   = map.getZoom();
      ft._savedCenter = map.getCenter();
    }
    // Zoom in to the current position
    const pos = valid[ft.idx];
    map.setView(pos, Math.max(map.getZoom(), FT_ZOOM), { animate: true, duration: 0.5 });
    const btn = document.getElementById('ftPlayBtn');
    if (btn) btn.innerHTML = ICON_PAUSE;
    // Small delay so the zoom animation finishes before the RAF loop starts panning
    setTimeout(() => { if (ft.playing) ft.rafId = requestAnimationFrame(step); }, 500);
  }

  function ftPause() {
    ft.playing = false;
    if (ft.rafId) { cancelAnimationFrame(ft.rafId); ft.rafId = null; }
    const btn = document.getElementById('ftPlayBtn');
    if (btn) btn.innerHTML = ICON_PLAY;
    // Zoom back out to show the full route
    if (ft._savedZoom != null) {
      map.setView(ft._savedCenter, ft._savedZoom, { animate: true, duration: 0.4 });
      ft._savedZoom   = null;
      ft._savedCenter = null;
    }
  }

  // ── Window-level handlers (attached to buttons via onclick) ─────────────
  window.ftTogglePlay = () => { ft.playing ? ftPause() : ftPlay(); };
  window.ftSetSpeed   = (s) => { ft.speed = +s; };
  window.ftToggleFollow = () => {
    ft.follow = !ft.follow;
    const btn = document.getElementById('ftFollowBtn');
    if (btn) btn.classList.toggle('active', ft.follow);
  };

  // ── Scrubber drag (mouse + touch) ───────────────────────────────────────
  const track = document.getElementById('ftScrubberTrack');
  if (track) {
    const idxFromEvent = (clientX) => {
      const rect = track.getBoundingClientRect();
      const pct  = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return Math.round(pct * (valid.length - 1));
    };

    let dragging = false;

    track.addEventListener('mousedown', (e) => {
      dragging = true;
      ft._resumeOnRelease = ft.playing;
      ftPause();
      goTo(idxFromEvent(e.clientX));
    });
    document.addEventListener('mousemove', (e) => { if (dragging) goTo(idxFromEvent(e.clientX)); });
    document.addEventListener('mouseup',   ()  => {
      if (!dragging) return;
      dragging = false;
      if (ft._resumeOnRelease) ftPlay();
    });

    track.addEventListener('touchstart', (e) => {
      dragging = true;
      ft._resumeOnRelease = ft.playing;
      ftPause();
      goTo(idxFromEvent(e.touches[0].clientX));
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
      if (dragging) goTo(idxFromEvent(e.touches[0].clientX));
    }, { passive: true });
    document.addEventListener('touchend', () => {
      if (!dragging) return;
      dragging = false;
      if (ft._resumeOnRelease) ftPlay();
    });
  }

  // Clean up on map remove
  map.on('remove', () => {
    ftPause();
    state.flythrough = null;
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

  if (!datasets.length) { showCardNA('detailStreamsCard'); return; }

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
  state.activityStreamsChart = destroyChart(state.activityStreamsChart);
  const canvas = document.getElementById('activityStreamsChart');
  if (!canvas) return;

  state.activityStreamsChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'indexEager', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...C_TOOLTIP,
          filter: () => !state._streamsPanning,
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
        zoom: {
          zoom: {
            wheel:   { enabled: true, speed: 0.1, modifierKey: 'alt' },
            pinch:   { enabled: true },
            mode:    'x',
            onZoom:  () => streamsUpdateZoomState(),
          },
          pan: {
            enabled: true,
            mode:    'x',
            onPanStart:    () => { state._streamsPanning = true;  _getTooltipEl().style.opacity = '0'; },
            onPanComplete: () => { state._streamsPanning = false; streamsUpdateZoomState(); },
          },
          limits: {
            x: { minRange: 30 },
          },
        },
      },
      scales,
    },
  });

  // Show hint initially, hide once user zooms
  const hint = document.getElementById('streamsZoomHint');
  if (hint) hint.style.opacity = '1';

  // Show the combined card, hide the old separate cards row
  const streamsCard = document.getElementById('detailStreamsCard');
  clearCardNA(streamsCard);
  streamsCard.style.display = '';
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
  chart.update('none');
  document.querySelectorAll(`.stream-toggle-btn[data-metric="${metric}"]`).forEach(btn => {
    btn.classList.toggle('active', !meta.hidden);
  });
}

function streamsZoomIn() {
  state.activityStreamsChart?.zoom(1.5);
  streamsUpdateZoomState();
}
function streamsZoomOut() {
  state.activityStreamsChart?.zoom(0.67);
  streamsUpdateZoomState();
}
function streamsResetZoom() {
  state.activityStreamsChart?.resetZoom();
  streamsUpdateZoomState(true);
}
function streamsUpdateZoomState(forceReset) {
  const hint      = document.getElementById('streamsZoomHint');
  const resetBtn  = document.querySelector('.streams-zoom-btn--reset');
  const isZoomed  = !forceReset && state.activityStreamsChart?.isZoomedOrPanned?.();
  if (hint)     hint.style.opacity     = isZoomed ? '0' : '1';
  if (resetBtn) resetBtn.style.opacity = isZoomed ? '1' : '0.35';
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
  state.activityPowerChart = destroyChart(state.activityPowerChart);
  state.activityHRChart    = destroyChart(state.activityHRChart);
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
/* ── Detail-card "not available" helpers ─────────────────────────────────────
   showCardNA(id)  — always shows the card, injects an NA message, hides blanks
   clearCardNA(card) — removes the NA message and restores hidden areas
   Call clearCardNA at the top of each successful render path.
────────────────────────────────────────────────────────────────────────────── */
const _NA_HTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20" style="opacity:0.35"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16.5" r="1" fill="currentColor" stroke="none"/></svg><span>Data not available</span>`;

function showCardNA(cardId) {
  const card = document.getElementById(cardId);
  if (!card) return;
  // If the user prefers hidden empty cards, just hide and bail
  if (localStorage.getItem('icu_hide_empty_cards') === 'true') {
    card.style.display = 'none';
    return;
  }
  card.style.display = '';
  card.classList.add('card--na');
  card.querySelectorAll('.detail-na-inject').forEach(e => e.remove());
  // Hide chart/map/peaks areas so they don't leave blank whitespace below the message
  card.querySelectorAll('.chart-wrap, .map-container, .activity-map, .curve-peaks').forEach(e => { e.dataset.naHidden = '1'; e.style.display = 'none'; });
  const el = document.createElement('div');
  el.className = 'detail-na-inject';
  el.innerHTML = _NA_HTML;
  const header = card.querySelector('.card-header');
  if (header) header.insertAdjacentElement('afterend', el);
  else card.appendChild(el);
}

function setHideEmptyCards(enabled) {
  localStorage.setItem('icu_hide_empty_cards', String(enabled));
  const toggle = document.getElementById('hideEmptyCardsToggle');
  if (toggle) toggle.checked = enabled;
}

function clearCardNA(card) {
  if (!card) return;
  card.classList.remove('card--na');
  card.querySelectorAll('.detail-na-inject').forEach(e => e.remove());
  card.querySelectorAll('[data-na-hidden]').forEach(e => { e.style.display = ''; delete e.dataset.naHidden; });
}

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

  if (!metrics.length) { showCardNA('detailPerfCard'); return; }

  clearCardNA(card);
  gridEl.innerHTML = metrics.join('');
  gridEl.querySelectorAll('.perf-metric').forEach(el => {
    if (!el.dataset.glow) { el.dataset.glow = '1'; window.attachCardGlow && window.attachCardGlow(el); }
  });
  document.getElementById('detailPerfSubtitle').textContent = 'Power & efficiency metrics · this ride';
  card.style.display = '';
}

function renderDetailDecoupleChart(streams, activity) {
  const card = document.getElementById('detailDecoupleCard');
  if (!card) return;

  const watts = streams.watts || streams.power || [];
  const hr    = streams.heartrate || streams.heart_rate || [];

  // Need both streams with real data
  const hasData = watts.length > 10 && hr.length > 10
    && watts.some(v => v > 0) && hr.some(v => v > 0);

  if (!hasData) { showCardNA('detailDecoupleCard'); return; }

  // Build paired samples (skip zeros/nulls), then smooth into 60-second buckets
  const paired = [];
  const len = Math.min(watts.length, hr.length);
  for (let i = 0; i < len; i++) {
    const w = watts[i], h = hr[i];
    if (w != null && w > 0 && h != null && h > 40) paired.push({ w, h });
  }
  if (paired.length < 60) { showCardNA('detailDecoupleCard'); return; }

  // Rolling EF in 60-sample windows, stepped every 30 samples
  const WINDOW = 60, STEP = 30;
  const efSeries = [];
  for (let i = 0; i + WINDOW <= paired.length; i += STEP) {
    const slice = paired.slice(i, i + WINDOW);
    const avgW = slice.reduce((s, p) => s + p.w, 0) / slice.length;
    const avgH = slice.reduce((s, p) => s + p.h, 0) / slice.length;
    efSeries.push(avgH > 0 ? +(avgW / avgH).toFixed(3) : null);
  }

  // Split into first half / second half for decoupling calculation
  const mid   = Math.floor(efSeries.length / 2);
  const half1 = efSeries.slice(0, mid).filter(v => v != null);
  const half2 = efSeries.slice(mid).filter(v => v != null);
  const ef1   = half1.length ? half1.reduce((s,v)=>s+v,0)/half1.length : null;
  const ef2   = half2.length ? half2.reduce((s,v)=>s+v,0)/half2.length : null;
  const dcPct = (ef1 && ef2) ? +((ef1 - ef2) / ef1 * 100).toFixed(1) : null;

  // Colour the badge
  const dcFromActivity = activity?.icu_aerobic_decoupling;
  const dcDisplay = dcFromActivity != null ? dcFromActivity : dcPct;
  const dcColor = dcDisplay == null ? 'var(--text-muted)'
    : Math.abs(dcDisplay) < 5 ? 'var(--accent)'
    : Math.abs(dcDisplay) < 8 ? 'var(--yellow)'
    : 'var(--red)';
  const dcLabel = dcDisplay == null ? '—'
    : Math.abs(dcDisplay) < 5 ? `${dcDisplay}% · Aerobically fit`
    : Math.abs(dcDisplay) < 8 ? `${dcDisplay}% · Acceptable`
    : `${dcDisplay}% · Needs base work`;

  const badgeEl  = document.getElementById('detailDecoupleBadge');
  const halvesEl = document.getElementById('detailDecoupleHalves');
  const subEl    = document.getElementById('detailDecoupleSub');

  if (badgeEl)  { badgeEl.textContent = dcDisplay != null ? dcDisplay + '%' : '—'; badgeEl.style.color = dcColor; }
  if (subEl)    subEl.textContent = 'Efficiency Factor (power ÷ HR) over time';
  if (halvesEl && ef1 && ef2) {
    halvesEl.innerHTML = `
      <div class="detail-decouple-half">
        <div class="detail-decouple-half-label">First half EF</div>
        <div class="detail-decouple-half-val">${ef1.toFixed(2)}</div>
      </div>
      <div class="detail-decouple-half detail-decouple-half--arrow">
        <div class="detail-decouple-arrow" style="color:${dcColor}">
          ${dcDisplay != null && dcDisplay > 0 ? '↓' : '↑'}
        </div>
        <div class="detail-decouple-pct" style="color:${dcColor}">${dcLabel}</div>
      </div>
      <div class="detail-decouple-half">
        <div class="detail-decouple-half-label">Second half EF</div>
        <div class="detail-decouple-half-val">${ef2.toFixed(2)}</div>
      </div>`;
  }

  // X-axis labels: minutes into ride
  const labels = efSeries.map((_, i) => {
    const sec = (i * STEP + WINDOW / 2);
    const m = Math.round(sec / 60);
    return m + 'm';
  });

  // Colour each point by position (first half green-ish, second half by EF drop)
  const ptColors = efSeries.map((v, i) => {
    if (v == null) return 'transparent';
    return i < mid ? '#60a5fa' : (dcDisplay != null && Math.abs(dcDisplay) >= 8 ? '#f87171' : '#fbbf24');
  });

  if (state._detailDecoupleChart) { state._detailDecoupleChart.destroy(); state._detailDecoupleChart = null; }
  const ctx = document.getElementById('detailDecoupleChart')?.getContext('2d');
  if (!ctx) return;

  // Midpoint vertical annotation via dataset trick
  const midX = labels[mid] || null;

  state._detailDecoupleChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'EF (W/bpm)',
          data: efSeries,
          borderColor: '#60a5fa',
          borderWidth: 2,
          pointBackgroundColor: ptColors,
          pointBorderColor:     ptColors,
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.4,
          fill: {
            target: 'origin',
            above: 'rgba(96,165,250,0.06)',
          },
          segment: {
            borderColor: ctx => ctx.p0DataIndex >= mid ? (dcDisplay != null && Math.abs(dcDisplay) >= 8 ? '#f87171' : '#fbbf24') : '#60a5fa',
          },
        },
        // Midpoint divider — invisible zero-height line rendered as annotation
        {
          label: '',
          data: labels.map((l, i) => i === mid ? efSeries[mid] : null),
          borderColor: 'rgba(255,255,255,0.15)',
          borderWidth: 1,
          borderDash: [4, 4],
          pointRadius: 0,
          fill: false,
          spanGaps: false,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'indexEager', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...C_TOOLTIP,
          callbacks: {
            title:      c => `At ${c[0].label}`,
            label:      c => c.datasetIndex === 0 ? `EF: ${c.raw} W/bpm` : null,
            afterLabel: c => {
              if (c.datasetIndex !== 0 || c.raw == null) return null;
              return c.dataIndex < mid ? '← First half' : '← Second half';
            },
          }
        }
      },
      scales: {
        x: { grid: C_GRID, ticks: { ...C_TICK, maxRotation: 0, maxTicksLimit: 8, autoSkip: true } },
        y: {
          grid: C_GRID,
          ticks: { ...C_TICK, callback: v => v.toFixed(1) },
          title: { display: false },
        }
      }
    }
  });

  clearCardNA(card);
  card.style.display = '';
}

function renderDetailZones(activity) {
  const card = document.getElementById('detailZonesCard');
  if (!card) return;

  const zt = activity.icu_zone_times;
  if (!Array.isArray(zt) || zt.length === 0) { showCardNA('detailZonesCard'); return; }

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

  if (totalSecs === 0) { showCardNA('detailZonesCard'); return; }
  clearCardNA(card);

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
  if (!Array.isArray(hzt) || hzt.length === 0) { showCardNA('detailHRZonesCard'); return; }

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

  if (totalSecs === 0) { showCardNA('detailHRZonesCard'); return; }
  clearCardNA(card);

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

// ── Outside temperature graph (Garmin ambient sensor) ────────────────────────
function renderDetailTempChart(streams, activity) {
  const card        = document.getElementById('detailTempCard');
  const unavailable = document.getElementById('detailTempUnavailable');
  const subtitle    = document.getElementById('detailTempSubtitle');
  const canvas      = document.getElementById('activityTempChart');
  if (!card || !canvas) return;

  // Always show the card — destroyActivityCharts() hides it, we must re-show it
  card.style.display = '';

  // Temperature comes as 'temp' from the intervals.icu streams API
  // or from our FIT parser which also writes it as 'temp'
  const rawTemp = streams.temp || streams.temperature || null;
  const hasData = rawTemp && rawTemp.length > 0 && rawTemp.some(v => v != null);

  const imperial = state.units === 'imperial';
  const deg = imperial ? '°F' : '°C';

  if (!hasData) {
    // Show greyed-out demo card with placeholder sine-wave data
    unavailable.style.display = 'flex';
    canvas.style.opacity = '0.18';
    if (subtitle) subtitle.textContent = 'Garmin sensor data';

    // Generate a fake smooth wave so the card doesn't look empty
    const demoLen  = 60;
    const demoData = Array.from({ length: demoLen }, (_, i) =>
      Math.round((15 + Math.sin(i / 8) * 3 + Math.sin(i / 3) * 0.8) * 10) / 10
    );
    const demoLabels = demoData.map((_, i) => `${i}:00`);

    if (window._tempChart) { window._tempChart.destroy(); window._tempChart = null; }
    window._tempChart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: demoLabels,
        datasets: [{
          data: demoData,
          borderColor: '#6b7280',
          backgroundColor: 'rgba(107,114,128,0.12)',
          fill: true,
          pointRadius: 0,
          borderWidth: 1.5,
          tension: 0.4,
        }]
      },
      options: {
        animation: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: { display: false },
          y: { display: false },
        },
        responsive: true,
        maintainAspectRatio: false,
      }
    });
    return;
  }

  unavailable.style.display = 'none';
  canvas.style.opacity = '1';

  // Downsample to at most 400 points
  const ds = downsampleStreams({ temp: rawTemp, time: streams.time || [] }, 400);
  const temps = imperial
    ? ds.temp.map(v => v != null ? Math.round((v * 9/5 + 32) * 10) / 10 : null)
    : ds.temp;
  const rawTime = ds.time || [];

  const labels = temps.map((_, i) => {
    const s = rawTime[i] != null ? rawTime[i] : i;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}:${String(m).padStart(2,'0')}` : `${m}:${String(s % 60).padStart(2,'0')}`;
  });

  const valid = temps.filter(v => v != null);
  const minT  = Math.min(...valid);
  const maxT  = Math.max(...valid);
  const avgT  = Math.round(valid.reduce((a, b) => a + b, 0) / valid.length * 10) / 10;

  if (subtitle) subtitle.textContent = `Avg ${avgT}${deg} · Min ${minT}${deg} · Max ${maxT}${deg}`;

  // Gradient fill — blue at cold end, orange-red at warm end
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 180);
  grad.addColorStop(0,   'rgba(251,146,60,0.35)');  // warm top
  grad.addColorStop(1,   'rgba(96,165,250,0.05)');  // cool bottom

  if (window._tempChart) { window._tempChart.destroy(); window._tempChart = null; }
  window._tempChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: `Temp (${deg})`,
        data: temps,
        borderColor: '#fb923c',
        backgroundColor: grad,
        fill: true,
        pointRadius: 0,
        pointHoverRadius: 5,
        borderWidth: 2,
        tension: 0.35,
        spanGaps: true,
      }]
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'indexEager', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.parsed.y}${deg}`,
          },
          backgroundColor: 'rgba(15,20,30,0.85)',
          titleColor: '#94a3b8',
          bodyColor: '#f1f5f9',
          borderColor: 'rgba(255,255,255,0.08)',
          borderWidth: 1,
        }
      },
      scales: {
        x: {
          grid:  C_GRID,
          ticks: { ...C_TICK, maxTicksLimit: 7 },
        },
        y: {
          position: 'left',
          grid: C_GRID,
          ticks: { ...C_TICK, maxTicksLimit: 5, callback: v => v + deg },
          suggestedMin: minT - 2,
          suggestedMax: maxT + 2,
        }
      }
    }
  });
}

// Power histogram — time (mins) at each watt bucket
function renderDetailHistogram(activity, streams) {
  const card = document.getElementById('detailHistogramCard');
  if (!card) return;

  const BUCKET = 20;

  // Primary source: pre-computed power_histogram from the intervals.icu detail response.
  // Zwift and many indoor activities don't include this field even though power data
  // exists — fall back to computing the distribution from the raw watts stream.
  let hist = Array.isArray(activity.power_histogram) ? activity.power_histogram : null;

  if (!hist || hist.length === 0) {
    const wattsArr = streams && (streams.watts || streams.power);
    if (Array.isArray(wattsArr) && wattsArr.some(v => v != null && v > 0)) {
      const tempBuckets = {};
      wattsArr.forEach(w => {
        if (w == null || w <= 0) return;
        const key = Math.floor(w / BUCKET) * BUCKET;
        tempBuckets[key] = (tempBuckets[key] || 0) + 1; // 1 second per sample
      });
      hist = Object.entries(tempBuckets).map(([watts, secs]) => ({ watts: +watts, secs }));
    }
  }

  if (!hist || hist.length === 0) { showCardNA('detailHistogramCard'); return; }

  const filtered = hist.filter(h => h && h.watts >= 0 && (h.secs || h.seconds) > 0);
  if (filtered.length === 0) { showCardNA('detailHistogramCard'); return; }

  // Group into 20 w buckets for a clean bar chart
  const buckets = {};
  filtered.forEach(h => {
    const key = Math.floor((h.watts || 0) / BUCKET) * BUCKET;
    buckets[key] = (buckets[key] || 0) + (h.secs || h.seconds || 0);
  });

  const entries = Object.entries(buckets)
    .map(([k, v]) => ({ watts: +k, mins: +(v / 60).toFixed(1) }))
    .sort((a, b) => a.watts - b.watts);

  if (entries.length === 0) { showCardNA('detailHistogramCard'); return; }
  clearCardNA(card);
  card.style.display = '';

  state.activityHistogramChart = destroyChart(state.activityHistogramChart);
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

// ── Feature 1: Elevation / Gradient Profile ─────────────────────────────────
function renderDetailGradientProfile(streams, activity) {
  const card = document.getElementById('detailGradientCard');
  if (!card) return;
  const alt  = streams?.altitude;
  const dist = streams?.distance;
  if (!Array.isArray(alt) || alt.length < 2) { card.style.display = 'none'; return; }

  // Downsample to max 500 points for chart performance
  const N = alt.length;
  const step = Math.max(1, Math.floor(N / 500));
  const altDS = [], distDS = [], gradeDS = [];
  for (let i = 0; i < N; i += step) {
    altDS.push(alt[i]);
    distDS.push(dist ? +(dist[i] / 1000).toFixed(3) : i);
    // gradient = rise/run over ~10 samples (smoothed)
    const prev = Math.max(0, i - 10 * step);
    const dAlt = alt[i] - alt[prev];
    const dDist = dist ? (dist[i] - dist[prev]) : (10 * step);
    gradeDS.push(dDist > 0 ? +(dAlt / dDist * 100).toFixed(1) : 0);
  }

  // Colour each segment by gradient steepness
  const segColors = gradeDS.map(g => {
    const a = Math.abs(g);
    if (a < 2)  return 'rgba(0,229,160,0.6)';    // flat — accent green
    if (a < 5)  return 'rgba(240,196,41,0.7)';   // gentle — yellow
    if (a < 10) return 'rgba(255,107,53,0.75)';  // moderate — orange
    return 'rgba(255,71,87,0.85)';               // steep — red
  });

  const sub = document.getElementById('detailGradientSubtitle');
  if (sub && dist) {
    const totalElev = activity?.total_elevation_gain || activity?.icu_total_elevation_gain;
    sub.textContent = `${(dist[N-1]/1000).toFixed(1)} km${totalElev ? ` · +${Math.round(totalElev)}m` : ''}`;
  }

  card.style.display = '';
  state.activityGradientChart = destroyChart(state.activityGradientChart);
  state.activityGradientChart = new Chart(
    document.getElementById('detailGradientChart').getContext('2d'), {
      type: 'bar',
      data: {
        labels: distDS,
        datasets: [{
          data: altDS,
          backgroundColor: segColors,
          borderWidth: 0,
          barPercentage: 1.0,
          categoryPercentage: 1.0,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: items => `${items[0].label} km`,
              label: item => {
                const g = gradeDS[item.dataIndex];
                return [`${Math.round(item.raw)}m elevation`, `${g > 0 ? '+' : ''}${g}% grade`];
              }
            },
            ...C_TOOLTIP,
          }
        },
        scales: {
          x: {
            ticks: { color: '#62708a', font: { size: 10 }, maxTicksLimit: 8,
              callback: v => distDS[v] !== undefined ? distDS[v] + ' km' : '' },
            grid: { display: false },
            border: { display: false },
          },
          y: {
            ticks: { color: '#62708a', font: { size: 10 },
              callback: v => v + 'm' },
            grid: { color: 'rgba(255,255,255,0.04)' },
            border: { display: false },
          }
        }
      }
    }
  );
}

// ── Feature 2: Cadence Distribution ─────────────────────────────────────────
function renderDetailCadenceHist(streams, activity) {
  const card = document.getElementById('detailCadenceCard');
  if (!card) return;
  const cad = streams?.cadence;
  if (!Array.isArray(cad) || !cad.some(v => v != null && v > 0)) {
    card.style.display = 'none'; return;
  }

  // Bins: 0-49 (too slow), 50-59, 60-69, 70-79, 80-89, 90-99, 100-109, 110+
  const BIN_START = 50, BIN_SIZE = 10, BIN_COUNT = 7;
  const bins = new Array(BIN_COUNT + 1).fill(0); // last bin = 110+
  let totalSecs = 0;
  cad.forEach(v => {
    if (v == null || v <= 0) return;
    totalSecs++;
    if (v < BIN_START)                              bins[0] += 1;
    else if (v >= BIN_START + BIN_SIZE * BIN_COUNT) bins[BIN_COUNT] += 1;
    else {
      const idx = Math.floor((v - BIN_START) / BIN_SIZE) + 1;
      if (idx < bins.length) bins[idx] += 1;
    }
  });

  const labels = ['<50', '50–59', '60–69', '70–79', '80–89', '90–99', '100–109', '110+'];
  const minutes = bins.map(b => +(b / 60).toFixed(1));

  // Find sweet spot (highest bin) to highlight
  const maxIdx = minutes.indexOf(Math.max(...minutes));
  const colors = minutes.map((_, i) =>
    i === maxIdx ? '#00e5a0' : 'rgba(74,158,255,0.5)'
  );

  const sub = document.getElementById('detailCadenceSubtitle');
  if (sub && totalSecs > 0) {
    const avgCad = cad.filter(v => v > 0).reduce((s, v) => s + v, 0) /
                   cad.filter(v => v > 0).length;
    sub.textContent = `Avg ${Math.round(avgCad)} rpm · ${labels[maxIdx]} most common`;
  }

  card.style.display = '';
  state.activityCadenceChart = destroyChart(state.activityCadenceChart);
  state.activityCadenceChart = new Chart(
    document.getElementById('detailCadenceChart').getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data: minutes,
          backgroundColor: colors,
          hoverBackgroundColor: '#00e5a0',
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            ...C_TOOLTIP,
            callbacks: {
              title: items => items[0].label + ' rpm',
              label: item => `${item.raw} min`,
            }
          }
        },
        scales: {
          x: {
            ticks: { color: '#62708a', font: { size: 10 } },
            grid: { display: false },
            border: { display: false },
          },
          y: {
            ticks: { color: '#62708a', font: { size: 10 },
              callback: v => v + ' min' },
            grid: { color: 'rgba(255,255,255,0.04)' },
            border: { display: false },
          }
        }
      }
    }
  );
}

// ── Feature 3: Zone Distribution Over Time (weekly stacked bars) ─────────────
function renderZnpZoneTimeChart() {
  const canvas = document.getElementById('znpZoneTimeChart');
  if (!canvas) return;
  const days    = state.znpRangeDays || 90;
  const cutoff  = Date.now() - days * 86400000;
  const acts    = state.activities.filter(a =>
    new Date(a.start_date_local || a.start_date).getTime() >= cutoff
  );

  // Group by ISO week (Mon–Sun)
  const weekMap = {};
  acts.forEach(a => {
    const d = new Date(a.start_date_local || a.start_date);
    // Get Monday of that week
    const day = d.getDay(); // 0=Sun
    const diff = (day === 0 ? -6 : 1 - day);
    const mon = new Date(d); mon.setDate(d.getDate() + diff);
    mon.setHours(0,0,0,0);
    const key = mon.toISOString().slice(0,10);
    if (!weekMap[key]) weekMap[key] = new Array(6).fill(0);
    const zt = a.icu_zone_times;
    if (!Array.isArray(zt)) return;
    zt.forEach(z => {
      if (!z?.id) return;
      const m = z.id.match(/^Z(\d)$/);
      if (!m) return;
      const idx = +m[1] - 1;
      if (idx >= 0 && idx < 6) weekMap[key][idx] += (z.secs || 0) / 3600;
    });
  });

  const weeks = Object.keys(weekMap).sort();
  if (!weeks.length) return;

  const ZONE_COLORS_CHART = [
    'rgba(100,180,255,0.85)',  // Z1 blue
    'rgba(0,229,160,0.85)',    // Z2 green
    'rgba(240,196,41,0.85)',   // Z3 yellow
    'rgba(255,150,50,0.85)',   // Z4 orange
    'rgba(255,71,87,0.85)',    // Z5 red
    'rgba(180,80,220,0.85)',   // Z6 purple
  ];
  const ZONE_LABELS = ['Z1 Recovery','Z2 Endurance','Z3 Tempo','Z4 Threshold','Z5 VO2max','Z6 Anaerobic'];

  const datasets = ZONE_LABELS.map((label, i) => ({
    label,
    data: weeks.map(w => +weekMap[w][i].toFixed(2)),
    backgroundColor: ZONE_COLORS_CHART[i],
    borderRadius: i === 5 ? 4 : 0,  // round top of last segment
  }));

  const sub = document.getElementById('znpZoneTimeSub');
  if (sub) sub.textContent = `Weekly power zone breakdown · last ${days} days`;

  state.znpZoneTimeChart = destroyChart(state.znpZoneTimeChart);
  state.znpZoneTimeChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: weeks.map(w => {
        const d = new Date(w);
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      }),
      datasets,
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: { color: '#9ba5be', boxWidth: 12, font: { size: 10 }, padding: 12 }
        },
        tooltip: {
          ...C_TOOLTIP,
          mode: 'indexEager',
          callbacks: {
            label: item => `${item.dataset.label}: ${item.raw}h`,
          }
        }
      },
      scales: {
        x: {
          stacked: true,
          ticks: { color: '#62708a', font: { size: 10 }, maxTicksLimit: 12 },
          grid: { display: false },
          border: { display: false },
        },
        y: {
          stacked: true,
          ticks: { color: '#62708a', font: { size: 10 },
            callback: v => v + 'h' },
          grid: { color: 'rgba(255,255,255,0.04)' },
          border: { display: false },
        }
      }
    }
  });
}

// ── Streaks Page ──────────────────────────────────────────────────────────────
function renderWellnessPage() { renderStreaksPage(); }  // alias so old nav calls still work

function renderStreaksPage() {
  if (!state.synced) return;
  const acts = state.activities || [];

  // ── Build a Set of active ISO date strings (YYYY-MM-DD) ──────────────────
  const activeDays = new Set();
  acts.forEach(a => {
    const d = (a.start_date_local || a.start_date || '').slice(0, 10);
    if (d) activeDays.add(d);
  });

  // ── Week key helper: ISO week start (Monday) as YYYY-MM-DD ───────────────
  function weekKey(date) {
    const d = new Date(date);
    const day = d.getDay() || 7;           // Mon=1 … Sun=7
    d.setDate(d.getDate() - (day - 1));
    return d.toISOString().slice(0, 10);
  }

  const activeWeeks = new Set([...activeDays].map(weekKey));

  // ── Month key helper ─────────────────────────────────────────────────────
  function monthKey(date) { return date.slice(0, 7); }
  const activeMonths = new Set([...activeDays].map(monthKey));

  // ── Generic streak counter (sorted array of keys, today's key) ───────────
  function calcStreak(sortedKeys, todayKey, stepFn) {
    // current streak: count backwards from todayKey
    let current = 0, best = 0, run = 0;
    let check = todayKey;
    const keySet = new Set(sortedKeys);
    // walk backwards while keys exist
    while (keySet.has(check)) {
      current++;
      check = stepFn(check, -1);
    }
    // if today is NOT active, we might still be on a streak ending yesterday
    if (current === 0) {
      check = stepFn(todayKey, -1);
      while (keySet.has(check)) {
        current++;
        check = stepFn(check, -1);
      }
    }
    // best streak: scan all keys
    sortedKeys.forEach((k, i) => {
      if (i === 0) { run = 1; }
      else {
        const prev = stepFn(k, -1);
        run = sortedKeys[i - 1] === prev ? run + 1 : 1;
      }
      if (run > best) best = run;
    });
    return { current, best };
  }

  // Week step function: add n weeks (n=-1 means previous week)
  function weekStep(key, n) {
    const d = new Date(key);
    d.setDate(d.getDate() + n * 7);
    return d.toISOString().slice(0, 10);
  }

  // Day step function
  function dayStep(key, n) {
    const d = new Date(key);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  // Month step function
  function monthStep(key, n) {
    const [y, m] = key.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  const todayStr     = new Date().toISOString().slice(0, 10);
  const todayWeek    = weekKey(todayStr);
  const todayMonth   = monthKey(todayStr);

  const sortedWeeks  = [...activeWeeks].sort();
  const sortedDays   = [...activeDays].sort();
  const sortedMonths = [...activeMonths].sort();

  const weekStreaks  = calcStreak(sortedWeeks,  todayWeek,  weekStep);
  const dayStreaks   = calcStreak(sortedDays,   todayStr,   dayStep);
  const monthStreaks = calcStreak(sortedMonths, todayMonth, monthStep);

  const totalActiveWeeks = activeWeeks.size;

  // ── Update hero cards ─────────────────────────────────────────────────────
  function setHero(numId, subId, current, unit) {
    const el = document.getElementById(numId);
    const sub = document.getElementById(subId);
    if (el)  el.textContent  = current;
    if (sub) sub.textContent = `${unit} streak`;
  }
  setHero('stkWeekNum',  'stkWeekSub',  weekStreaks.current,  'week');
  setHero('stkDayNum',   'stkDaySub',   dayStreaks.current,   'day');
  setHero('stkMonthNum', 'stkMonthSub', monthStreaks.current, 'month');

  // Animate hero flame based on streak size
  const weekHero = document.getElementById('stkWeekHero');
  if (weekHero) {
    weekHero.className = 'stk-hero-card' +
      (weekStreaks.current >= 12 ? ' stk-hero--legendary' :
       weekStreaks.current >= 6  ? ' stk-hero--hot' :
       weekStreaks.current >= 2  ? ' stk-hero--warm' : '');
  }

  // ── Personal bests ────────────────────────────────────────────────────────
  const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setText('stkBestWeekStreak',  weekStreaks.best  + (weekStreaks.best  === 1 ? ' week'  : ' weeks'));
  setText('stkBestDayStreak',   dayStreaks.best   + (dayStreaks.best   === 1 ? ' day'   : ' days'));
  setText('stkBestMonthStreak', monthStreaks.best + (monthStreaks.best === 1 ? ' month' : ' months'));
  setText('stkTotalWeeks',      totalActiveWeeks + (totalActiveWeeks === 1 ? ' week' : ' weeks'));

  // Subtitle: is the current streak the all-time best?
  if (weekStreaks.current > 0 && weekStreaks.current === weekStreaks.best) {
    setText('stkBestWeekSub', '🏆 that\'s your best ever!');
  } else {
    setText('stkBestWeekSub', 'all time');
  }

  // ── Weekly calendar heatmap (last 52 weeks) ───────────────────────────────
  const calWrap = document.getElementById('stkCalWrap');
  const calSub  = document.getElementById('stkCalSub');
  if (calWrap) {
    // Build 52 weeks ending this week
    const WEEKS = 52;
    // start from WEEKS-1 Mondays ago
    const startDate = new Date(todayWeek);
    startDate.setDate(startDate.getDate() - (WEEKS - 1) * 7);

    // Count rides per week
    const weekCounts = {};
    acts.forEach(a => {
      const d = (a.start_date_local || a.start_date || '').slice(0, 10);
      if (!d) return;
      const wk = weekKey(d);
      weekCounts[wk] = (weekCounts[wk] || 0) + 1;
    });

    // Build week objects
    const weeks = [];
    for (let i = 0; i < WEEKS; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i * 7);
      const wk = d.toISOString().slice(0, 10);
      const count = weekCounts[wk] || 0;
      const isStreak = activeWeeks.has(wk);
      // heat level 0-3
      const heat = count === 0 ? 0 : count <= 2 ? 1 : count <= 4 ? 2 : 3;
      weeks.push({ wk, count, heat, isStreak,
        label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) });
    }

    // Month labels: place label at first week of each month
    const monthLabels = {};
    weeks.forEach((w, i) => {
      const d = new Date(w.wk);
      const mk = `${d.getFullYear()}-${d.getMonth()}`;
      if (!monthLabels[mk]) monthLabels[mk] = i;
    });

    // Build HTML: weeks as columns, label row on top
    let html = '<div class="stk-cal-grid">';
    // Month label row
    html += '<div class="stk-cal-month-row">';
    weeks.forEach((w, i) => {
      const d = new Date(w.wk);
      const mk = `${d.getFullYear()}-${d.getMonth()}`;
      if (monthLabels[mk] === i) {
        html += `<div class="stk-cal-month-lbl">${d.toLocaleDateString('en-GB',{month:'short'})}</div>`;
      } else {
        html += '<div class="stk-cal-month-lbl"></div>';
      }
    });
    html += '</div>';

    // Cells row
    html += '<div class="stk-cal-cells">';
    weeks.forEach(w => {
      const cls = `stk-cell stk-heat-${w.heat}${w.wk === todayWeek ? ' stk-cell--today' : ''}`;
      html += `<div class="${cls}" title="${w.label}: ${w.count} ride${w.count !== 1 ? 's' : ''}"></div>`;
    });
    html += '</div></div>';

    calWrap.innerHTML = html;
    if (calSub) calSub.textContent =
      `Last 52 weeks · ${totalActiveWeeks} active · ${WEEKS - totalActiveWeeks} rest`;
  }

  // ── This year monthly grid ────────────────────────────────────────────────
  const year = new Date().getFullYear();
  const monthsGrid = document.getElementById('stkMonthsGrid');
  const yearTotal  = document.getElementById('stkYearTotal');
  if (monthsGrid) {
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const now = new Date();
    let totalRidesYear = 0;
    const html = monthNames.map((name, mi) => {
      const mk = `${year}-${String(mi + 1).padStart(2, '0')}`;
      const count = acts.filter(a => {
        const d = (a.start_date_local || a.start_date || '').slice(0, 7);
        return d === mk;
      }).length;
      totalRidesYear += count;
      const isPast    = mi < now.getMonth() || year < now.getFullYear();
      const isCurrent = mi === now.getMonth() && year === now.getFullYear();
      const isFuture  = mi > now.getMonth() && year >= now.getFullYear();
      const heat = count === 0 ? 0 : count <= 4 ? 1 : count <= 8 ? 2 : count <= 12 ? 3 : 4;
      return `<div class="stk-month-tile stk-month-heat-${heat}${isCurrent ? ' stk-month--current' : ''}${isFuture ? ' stk-month--future' : ''}">
        <div class="stk-month-name">${name}</div>
        <div class="stk-month-count">${isFuture ? '' : count || '—'}</div>
        ${isFuture ? '' : `<div class="stk-month-bar"><div class="stk-month-bar-fill" style="width:${Math.min(100, count * 7)}%"></div></div>`}
      </div>`;
    }).join('');
    monthsGrid.innerHTML = html;
    if (yearTotal) yearTotal.textContent = `${totalRidesYear} rides this year`;
    setText('stkYearTitle', `${year} Overview`);
    setText('stkYearSub', `Rides per month · ${year}`);
  }

  // ── Achievements / badges ─────────────────────────────────────────────────
  const BADGES = [
    { id:'b1',  icon:'🔥', name:'On Fire',          desc:'3+ week streak',      earned: weekStreaks.current  >= 3  },
    { id:'b2',  icon:'🚀', name:'Week Warrior',      desc:'5+ week streak',      earned: weekStreaks.current  >= 5  },
    { id:'b3',  icon:'💎', name:'Diamond Streak',    desc:'10+ week streak',     earned: weekStreaks.current  >= 10 },
    { id:'b4',  icon:'👑', name:'Streak King',       desc:'20+ week streak',     earned: weekStreaks.current  >= 20 },
    { id:'b5',  icon:'⚡', name:'Daily Grinder',     desc:'7+ day streak',       earned: dayStreaks.current   >= 7  },
    { id:'b6',  icon:'🌙', name:'Month Maker',       desc:'3+ month streak',     earned: monthStreaks.current >= 3  },
    { id:'b7',  icon:'🏆', name:'Best Week Ever',    desc:'Matched all-time best week streak', earned: weekStreaks.current > 0 && weekStreaks.current === weekStreaks.best },
    { id:'b8',  icon:'🚴', name:'Century Club',      desc:'100+ active weeks',   earned: totalActiveWeeks    >= 100 },
    { id:'b9',  icon:'📅', name:'Half Year',         desc:'26+ active weeks',    earned: totalActiveWeeks    >= 26  },
    { id:'b10', icon:'🌟', name:'Consistent',        desc:'50+ active weeks',    earned: totalActiveWeeks    >= 50  },
    { id:'b11', icon:'❄️', name:'Winter Warrior',    desc:'Rode in Jan or Feb',  earned: acts.some(a => { const m = +(a.start_date_local||a.start_date||'').slice(5,7); return m===1||m===2; }) },
    { id:'b12', icon:'☀️', name:'Summer Beast',      desc:'Rode in Jul or Aug',  earned: acts.some(a => { const m = +(a.start_date_local||a.start_date||'').slice(5,7); return m===7||m===8; }) },
  ];

  const badgesGrid = document.getElementById('stkBadgesGrid');
  if (badgesGrid) {
    badgesGrid.innerHTML = BADGES.map(b => `
      <div class="stk-badge${b.earned ? ' stk-badge--earned' : ''}">
        <div class="stk-badge-icon">${b.icon}</div>
        <div class="stk-badge-name">${b.name}</div>
        <div class="stk-badge-desc">${b.desc}</div>
        ${b.earned ? '<div class="stk-badge-check">✓</div>' : ''}
      </div>`).join('');
  }

  // ── Lifetime fun stats ────────────────────────────────────────────────────
  const lifetimeGrid = document.getElementById('stkLifetimeGrid');
  if (lifetimeGrid) {
    // Try loading from localStorage cache first
    if (!state.lifetimeActivities) {
      const cached = loadLifetimeCache();
      if (cached) {
        state.lifetimeActivities = cached.activities;
        state.lifetimeLastSync   = cached.lastSync;
      }
    }

    // If still no data, show loading. If cached, show immediately but sync in background.
    if (!state.lifetimeActivities) {
      lifetimeGrid.innerHTML = `<div class="stk-lifetime-loading">Loading lifetime data…</div>`;
    }

    // Incremental sync: fetch only new activities since last lifetime sync
    if (!state._lifetimeSyncDone) {
      runLifetimeSync();
    }
  }

  if (lifetimeGrid && state.lifetimeActivities && state.lifetimeActivities.length) {
    const ltActs = state.lifetimeActivities;
    const totalRides    = ltActs.length;
    const totalDistM    = ltActs.reduce((s, a) => s + actVal(a, 'distance', 'icu_distance'), 0);
    const totalDistKm   = totalDistM / 1000;
    const totalElevM    = ltActs.reduce((s, a) => s + actVal(a, 'total_elevation_gain', 'icu_total_elevation_gain', 'icu_elevation_gain'), 0);
    const totalTimeSecs = ltActs.reduce((s, a) => s + actVal(a, 'moving_time', 'elapsed_time', 'icu_moving_time', 'icu_elapsed_time', 'moving_time_seconds', 'elapsed_time_seconds'), 0);
    const totalTimeHrs  = totalTimeSecs / 3600;
    const totalCals     = ltActs.reduce((s, a) => s + actVal(a, 'calories', 'icu_calories', 'kilojoules'), 0);
    const totalTSS      = ltActs.reduce((s, a) => s + actVal(a, 'icu_training_load', 'training_load_score', 'tss'), 0);

    // Longest single ride
    const longestRide   = ltActs.reduce((best, a) => actVal(a, 'distance', 'icu_distance') > actVal(best, 'distance', 'icu_distance') ? a : best, {});
    const longestKm     = (actVal(longestRide, 'distance', 'icu_distance') / 1000).toFixed(0);
    const longestName   = longestRide.name || 'Unknown';

    // Favourite day of week
    const dayCounts = Array(7).fill(0);
    ltActs.forEach(a => {
      const d = new Date(a.start_date_local || a.start_date);
      if (!isNaN(d)) dayCounts[d.getDay()]++;
    });
    const dayNames  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const favDayIdx = dayCounts.indexOf(Math.max(...dayCounts));
    const favDay    = dayNames[favDayIdx];

    // Favourite month
    const monthCounts = Array(12).fill(0);
    ltActs.forEach(a => {
      const d = new Date(a.start_date_local || a.start_date);
      if (!isNaN(d)) monthCounts[d.getMonth()]++;
    });
    const monthNames2  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const favMonthIdx  = monthCounts.indexOf(Math.max(...monthCounts));
    const favMonth     = monthNames2[favMonthIdx];

    // Biggest single week (most rides)
    const weekRideCounts = {};
    ltActs.forEach(a => {
      const wk = weekKey((a.start_date_local || a.start_date || '').slice(0, 10));
      if (wk) weekRideCounts[wk] = (weekRideCounts[wk] || 0) + 1;
    });
    const bestWeekCount = Math.max(...Object.values(weekRideCounts), 0);

    // Early bird rides (before 08:00)
    const earlyBird = ltActs.filter(a => {
      const t = (a.start_date_local || a.start_date || '').slice(11, 13);
      return t && +t < 8;
    }).length;

    // Average ride distance
    const avgDistKm = totalDistKm / totalRides;

    // Earth circumference comparison
    const earthLaps = (totalDistKm / 40075).toFixed(2);

    // Hottest & coldest rides — prefer Garmin sensor (average_temp), fall back to weather_temp
    const getTemp    = a => a.average_temp ?? a.weather_temp ?? null;
    const tempActs   = ltActs.filter(a => getTemp(a) != null);
    const imperial   = state.units === 'imperial';
    const fmtT       = c => imperial ? `${Math.round(c * 9/5 + 32)}°F` : `${Math.round(c)}°C`;
    const hottestAct = tempActs.length ? tempActs.reduce((m, a) => getTemp(a) > getTemp(m) ? a : m) : null;
    const coldestAct = tempActs.length ? tempActs.reduce((m, a) => getTemp(a) < getTemp(m) ? a : m) : null;

    // Biggest single ascent
    const biggestClimbAct = ltActs.reduce((m, a) => {
      const elev = a.total_elevation_gain || a.icu_elevation_gain || 0;
      return elev > (m.total_elevation_gain || m.icu_elevation_gain || 0) ? a : m;
    }, {});
    const biggestClimbM = Math.round(biggestClimbAct.total_elevation_gain || biggestClimbAct.icu_elevation_gain || 0);

    // Format helpers
    const fmtKm   = v => `${Math.round(v).toLocaleString()} km`;
    const fmtHrs  = v => v >= 1000 ? `${(v/1000).toFixed(1)}k hrs` : `${Math.round(v)} hrs`;
    const fmtNum  = v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(1)}k` : `${Math.round(v)}`;

    const STATS = [
      { icon:'🚴', label:'Total Rides',        value: fmtNum(totalRides),          fun: `That's ${Math.round(totalRides / Math.max(1, (new Date() - new Date(ltActs[ltActs.length-1]?.start_date_local||ltActs[ltActs.length-1]?.start_date||new Date())) / (86400000*365)))} rides/year on avg` },
      { icon:'📍', label:'Total Distance',     value: fmtKm(totalDistKm),          fun: `${earthLaps}× around the Earth 🌍` },
      { icon:'⛰️', label:'Total Elevation',    value: fmtKm(totalElevM / 1000),     fun: `${(totalElevM / 8848).toFixed(1)}× the height of Everest 🏔️` },
      { icon:'⏱️', label:'Total Time',         value: fmtHrs(totalTimeHrs),        fun: `${(totalTimeHrs / 24).toFixed(1)} full days on the bike` },
      { icon:'🔥', label:'Total Calories',     value: totalCals > 0 ? fmtNum(totalCals) + ' kcal' : '—', fun: totalCals > 0 ? `≈ ${Math.round(totalCals / 250)} pizzas burned 🍕` : 'Sync calorie data in intervals.icu' },
      { icon:'📊', label:'Total TSS',          value: totalTSS > 0 ? fmtNum(Math.round(totalTSS)) : '—', fun: totalTSS > 0 ? 'Cumulative training stress score' : 'Log power data to track TSS' },
      { icon:'📏', label:'Avg Ride Distance',  value: `${avgDistKm.toFixed(1)} km`, fun: `Per ride, across all ${totalRides} activities` },
      { icon:'🏆', label:'Longest Ride',       value: `${longestKm} km`,           fun: longestName },
      { icon:'📅', label:'Best Week',          value: `${bestWeekCount} rides`,     fun: 'Most rides packed into one week' },
      { icon:'⭐', label:'Fav Day',            value: favDay,                       fun: `You ride most on ${favDay}s` },
      { icon:'🌸', label:'Fav Month',          value: favMonth,                     fun: `${monthCounts[favMonthIdx]} rides on average in ${favMonth}` },
      { icon:'🌅', label:'Early Bird Rides',   value: fmtNum(earlyBird),            fun: `Rides started before 8 am` },
      { icon:'🌡️', label:'Hottest Ride',       value: hottestAct ? fmtT(getTemp(hottestAct)) : '—', fun: hottestAct ? (hottestAct.name || 'Unknown ride') : 'No sensor data yet', act: hottestAct || null },
      { icon:'🥶', label:'Coldest Ride',       value: coldestAct ? fmtT(getTemp(coldestAct)) : '—', fun: coldestAct ? (coldestAct.name || 'Unknown ride') : 'No sensor data yet', act: coldestAct || null },
      { icon:'🏔️', label:'Biggest Climb',      value: biggestClimbM > 0 ? `${biggestClimbM.toLocaleString()} m` : '—', fun: biggestClimbM > 0 ? (biggestClimbAct.name || 'Unknown ride') : 'No elevation data yet', act: biggestClimbM > 0 ? biggestClimbAct : null },
    ];

    // Also wire longest ride click
    const longestAct = acts.reduce((m, a) => (a.distance || 0) > (m.distance || 0) ? a : m, {});
    STATS.forEach(s => {
      if (s.label === 'Longest Ride') s.act = longestAct.id ? longestAct : null;
    });

    lifetimeGrid.innerHTML = STATS.map((s, i) => `
      <div class="stk-stat-tile${s.act ? ' stk-stat-tile--link' : ''}" data-stat-idx="${i}">
        <div class="stk-stat-icon">${s.icon}</div>
        <div class="stk-stat-val">${s.value}</div>
        <div class="stk-stat-label">${s.label}</div>
        <div class="stk-stat-fun">${s.fun}</div>
      </div>`).join('');

    lifetimeGrid.querySelectorAll('.stk-stat-tile--link').forEach(el => {
      const s = STATS[+el.dataset.statIdx];
      if (s?.act) el.addEventListener('click', () => navigateToActivity(s.act));
    });

    // ── Odometer count-up on stat values ────────────────────────────────────
    const odoObs = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        odoObs.unobserve(entry.target);
        const valEl = entry.target.querySelector('.stk-stat-val');
        if (!valEl) return;
        const finalText = valEl.textContent.trim();
        // Extract leading number (handles "932 km", "1.2k hrs", "42°C" etc.)
        const match = finalText.match(/^([\d,]+\.?\d*)/);
        if (!match) return;
        const finalNum = parseFloat(match[1].replace(/,/g, ''));
        const suffix   = finalText.slice(match[0].length);
        const prefix   = '';
        const isInt    = Number.isInteger(finalNum) || match[1].includes(',');
        const decimals = isInt ? 0 : (match[1].split('.')[1] || '').length;
        const duration = 900;
        const start    = performance.now();
        valEl.classList.add('odometer-play');
        const tick = (now) => {
          const t = Math.min((now - start) / duration, 1);
          const ease = 1 - Math.pow(1 - t, 3);
          const cur = finalNum * ease;
          const fmt = isInt
            ? Math.round(cur).toLocaleString()
            : cur.toFixed(decimals);
          valEl.textContent = prefix + fmt + suffix;
          if (t < 1) requestAnimationFrame(tick);
          else { valEl.textContent = finalText; valEl.classList.remove('odometer-play'); }
        };
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.3 });
    lifetimeGrid.querySelectorAll('.stk-stat-tile').forEach(el => odoObs.observe(el));
  }

  // ── Badge shine sweep on render ──────────────────────────────────────────
  const badgesGridShine = document.getElementById('stkBadgesGrid');
  if (badgesGridShine) {
    const seenKey = 'stk_badges_shine_seen';
    const seenSet = new Set(JSON.parse(localStorage.getItem(seenKey) || '[]'));
    badgesGridShine.querySelectorAll('.stk-badge--earned').forEach((el, i) => {
      const name = el.querySelector('.stk-badge-name')?.textContent || i;
      if (seenSet.has(name)) return;
      seenSet.add(name);
      setTimeout(() => {
        el.classList.add('badge-shine-play');
        el.addEventListener('animationend', () => el.classList.remove('badge-shine-play'), { once: true });
      }, 200 + i * 120);
    });
    localStorage.setItem(seenKey, JSON.stringify([...seenSet]));
  }
}

// Build a power curve object from a raw watts stream using a sliding-window max.
// Shared duration ticks (seconds) used by power and HR curve builders + normalization
const DURS = [1,2,3,5,8,10,15,20,30,45,60,90,120,180,300,420,600,900,1200,1800,2700,3600,5400,7200];

// Returns {secs, watts} at logarithmically-spaced durations.
function buildCurveFromStream(wattsArr) {
  if (!Array.isArray(wattsArr) || wattsArr.length === 0) return null;
  const n = wattsArr.length;
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

  // No power for this activity → always show NA, regardless of year history
  if (!raw) { showCardNA('detailCurveCard'); return; }
  clearCardNA(card);
  card.style.display = '';

  // Peak stat pills (from this activity — raw is guaranteed non-null here)
  const peaksEl = document.getElementById('detailCurvePeaks');
  if (peaksEl) {
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

  // Normalize a curve to the shared DURS ticks via nearest-neighbour lookup
  // so both datasets share the same x-values and hover dots stay aligned.
  const normalizeCurve = (c, yKey = 'watts') => {
    if (!c) return [];
    const lookup = {};
    c.secs.forEach((s, i) => { if (c[yKey][i] > 0) lookup[s] = c[yKey][i]; });
    const maxDur = c.secs[c.secs.length - 1] || 0;
    return DURS
      .filter(d => d <= maxDur)
      .map(d => {
        // find closest available duration
        let best = null, minDiff = Infinity;
        Object.keys(lookup).forEach(s => {
          const diff = Math.abs(s - d);
          if (diff < minDiff) { minDiff = diff; best = lookup[s]; }
        });
        return best != null ? { x: d, y: best } : null;
      })
      .filter(Boolean);
  };

  const rideData    = normalizeCurve(raw, 'watts');
  const rideMaxSecs = rideData.length ? rideData[rideData.length - 1].x : 0;
  const yearRawData = normalizeCurve(rawYear, 'watts');
  // Only cap year curve to ride duration when we actually have ride data.
  // When rideMaxSecs === 0 (no power for this activity) keep the full year curve.
  const yearData = rideMaxSecs > 0
    ? yearRawData.filter(p => p.x <= rideMaxSecs)
    : yearRawData;
  const maxSecs  = rideMaxSecs || (yearData.length ? yearData[yearData.length - 1].x : 3600);

  // Safety: if normalisation produced no plottable data, fall back to NA card
  if (!rideData.length && !yearData.length) { showCardNA('detailCurveCard'); return; }

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

  state.activityCurveChart = destroyChart(state.activityCurveChart);
  state.activityCurveChart = new Chart(
    document.getElementById('activityCurveChart').getContext('2d'), {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'indexEager', intersect: false },
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
          y: { grid: C_GRID, ticks: { ...C_TICK } }
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

  if (!raw && !rawYear) { showCardNA('detailHRCurveCard'); return; }
  clearCardNA(card);
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

  const normalizeHRCurve = c => {
    if (!c) return [];
    const lookup = {};
    c.secs.forEach((s, i) => { if (c.heartrate[i] > 0) lookup[s] = c.heartrate[i]; });
    const maxDur = c.secs[c.secs.length - 1] || 0;
    return DURS
      .filter(d => d <= maxDur)
      .map(d => {
        let best = null, minDiff = Infinity;
        Object.keys(lookup).forEach(s => {
          const diff = Math.abs(s - d);
          if (diff < minDiff) { minDiff = diff; best = lookup[s]; }
        });
        return best != null ? { x: d, y: best } : null;
      })
      .filter(Boolean);
  };

  const rideData = normalizeHRCurve(raw);
  const rideMaxSecs = rideData.length ? rideData[rideData.length - 1].x : 0;
  const yearData = normalizeHRCurve(rawYear).filter(p => p.x <= rideMaxSecs);
  const maxSecs  = rideMaxSecs || (yearData.length ? yearData[yearData.length - 1].x : 3600);

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

  state.activityHRCurveChart = destroyChart(state.activityHRCurveChart);
  state.activityHRCurveChart = new Chart(
    document.getElementById('activityHRCurveChart').getContext('2d'), {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'indexEager', intersect: false },
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
          y: { grid: C_GRID, ticks: { ...C_TICK } }
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
      interaction: { mode: 'indexEager', intersect: false },
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

// ─────────────────────────────────────────────────────────────────────────────
// GEAR PAGE
// ─────────────────────────────────────────────────────────────────────────────

const GEAR_STORE_KEY = 'icu_gear_components';
const GEAR_CATEGORY_COLORS = {
  Drivetrain: '#60a5fa',
  Wheels:     '#34d399',
  Cockpit:    '#a78bfa',
  Frame:      '#f97316',
  Brakes:     '#f87171',
  Tyres:      '#fbbf24',
  Pedals:     '#e879f9',
  Saddle:     '#fb923c',
  Other:      '#94a3b8',
};

function loadGearComponents() {
  try { return JSON.parse(localStorage.getItem(GEAR_STORE_KEY)) || []; }
  catch { return []; }
}
function saveGearComponents(arr) {
  localStorage.setItem(GEAR_STORE_KEY, JSON.stringify(arr));
}

// ── State for selected bike filter ──
let _gearSelectedBike = null; // null = all
let _gearBikeCache    = [];   // [{id, name, km}]

async function renderGearPage() {
  // Fetch bikes from intervals.icu via MCP (already available in state or refetch)
  const bikeRow = document.getElementById('gearBikesRow');
  const compGrid = document.getElementById('gearComponentsGrid');
  if (!bikeRow || !compGrid) return;

  bikeRow.innerHTML = '<div class="gear-bikes-loading"><div class="spinner"></div> Loading bikes…</div>';

  let bikes = [];
  try {
    const raw = state.gearBikes; // cached from last fetch
    if (raw && raw.length) {
      bikes = raw;
    } else {
      // Pull via the MCP tool result already stored in state after sync
      // Fallback: use activityData to derive bike list if no direct API
      // We'll call the gear list endpoint through a fetch wrapper
      const apiKey  = localStorage.getItem('icu_api_key');
      const athlete = localStorage.getItem('icu_athlete_id');
      if (apiKey && athlete) {
        const resp = await fetch(
          `https://intervals.icu/api/v1/athlete/${athlete}/gear`,
          { headers: { 'Authorization': 'Basic ' + btoa('API_KEY:' + apiKey) } }
        );
        if (resp.ok) {
          const data = await resp.json();
          bikes = (data || []).map(g => ({
            id:   g.id,
            name: g.name || 'Unnamed bike',
            km:   g.distance ? Math.round(g.distance / 1000) : 0,
            type: g.type || 'Bike',
          }));
          state.gearBikes = bikes;
        }
      }
    }
  } catch(e) { console.warn('Gear fetch error', e); }

  _gearBikeCache = bikes;

  // Render bike cards
  if (bikes.length === 0) {
    bikeRow.innerHTML = '<div class="gear-empty-state">No bikes found on intervals.icu</div>';
  } else {
    bikeRow.innerHTML = bikes.map(b => {
      const sel = _gearSelectedBike === b.id ? ' gear-bike-card--active' : '';
      const kmFmt = b.km >= 1000 ? (b.km / 1000).toFixed(1) + 'k' : b.km;
      return `<div class="gear-bike-card${sel}" onclick="gearSelectBike('${b.id}')">
        <div class="gear-bike-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" width="32" height="32">
            <circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/>
            <path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-3 11.5L9 11l-3.5 3.5M15 6l-4 5.5H5.5M15 6l3 5.5"/>
          </svg>
        </div>
        <div class="gear-bike-name">${b.name}</div>
        <div class="gear-bike-km">${kmFmt} km</div>
      </div>`;
    }).join('');
  }

  // Populate bike select in modal
  const sel = document.getElementById('gearFormBike');
  if (sel) {
    const opts = bikes.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
    sel.innerHTML = '<option value="">— All bikes / General —</option>' + opts;
  }

  renderGearComponents();
}

function gearSelectBike(id) {
  _gearSelectedBike = (_gearSelectedBike === id) ? null : id; // toggle
  // Re-highlight cards
  document.querySelectorAll('.gear-bike-card').forEach(el => {
    const elId = el.getAttribute('onclick').match(/'([^']+)'/)?.[1];
    el.classList.toggle('gear-bike-card--active', elId === _gearSelectedBike);
  });
  renderGearComponents();
}

function renderGearComponents() {
  const grid   = document.getElementById('gearComponentsGrid');
  const title  = document.getElementById('gearComponentsTitle');
  const sub    = document.getElementById('gearComponentsSub');
  if (!grid) return;

  const allComps = loadGearComponents();
  const filtered = _gearSelectedBike
    ? allComps.filter(c => c.bikeId === _gearSelectedBike)
    : allComps;

  // Update header
  const bike = _gearBikeCache.find(b => b.id === _gearSelectedBike);
  if (title) title.textContent = bike ? `${bike.name} — Components` : 'All Components';
  if (sub)   sub.textContent   = filtered.length
    ? `${filtered.length} component${filtered.length !== 1 ? 's' : ''} tracked`
    : 'No components yet — add your first one above';

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="gear-empty-state gear-empty-state--comp">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40" style="opacity:.3"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
      <div>No components tracked yet.</div>
      <button class="btn btn-primary btn-sm" onclick="openGearModal()">Add your first component</button>
    </div>`;
    return;
  }

  // Group by category
  const groups = {};
  filtered.forEach(c => {
    const cat = c.category || 'Other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(c);
  });

  grid.innerHTML = Object.entries(groups).map(([cat, items]) => {
    const color = GEAR_CATEGORY_COLORS[cat] || '#94a3b8';
    const cards = items.map(c => gearComponentCard(c)).join('');
    return `<div class="gear-cat-group">
      <div class="gear-cat-label" style="color:${color}">${cat}</div>
      <div class="gear-cat-cards">${cards}</div>
    </div>`;
  }).join('');
}

function gearComponentCard(c) {
  const color   = GEAR_CATEGORY_COLORS[c.category] || '#94a3b8';
  const bike    = _gearBikeCache.find(b => b.id === c.bikeId);
  const bikeKm  = bike ? bike.km : 0;
  const kmAtInst = parseFloat(c.kmAtInstall) || 0;
  const ridden  = Math.max(0, bikeKm - kmAtInst);
  const remind  = parseFloat(c.reminderKm)  || 0;
  const pct     = remind > 0 ? Math.min(100, Math.round(ridden / remind * 100)) : null;
  const warn    = pct !== null && pct >= 90;
  const overdue = pct !== null && pct >= 100;

  const progressHtml = pct !== null ? `
    <div class="gear-comp-bar-wrap">
      <div class="gear-comp-bar-track">
        <div class="gear-comp-bar-fill" style="width:${pct}%;background:${overdue ? 'var(--red)' : warn ? '#f97316' : color}"></div>
      </div>
      <span class="gear-comp-bar-label ${overdue ? 'gear-comp-bar-label--red' : warn ? 'gear-comp-bar-label--warn' : ''}">
        ${overdue ? '⚠ Replace' : warn ? '⚠ Soon' : `${pct}%`}
      </span>
    </div>` : '';

  const meta = [];
  if (c.brand || c.model) meta.push(`<span>${[c.brand, c.model].filter(Boolean).join(' ')}</span>`);
  if (c.purchaseDate)     meta.push(`<span>${c.purchaseDate}</span>`);
  if (c.price)            meta.push(`<span>€${parseFloat(c.price).toFixed(0)}</span>`);
  if (bike)               meta.push(`<span style="color:var(--accent)">${bike.name}</span>`);

  return `<div class="gear-comp-card ${overdue ? 'gear-comp-card--overdue' : warn ? 'gear-comp-card--warn' : ''}">
    <div class="gear-comp-top">
      <div class="gear-comp-name">${c.name || 'Component'}</div>
      <div class="gear-comp-actions">
        <button class="gear-icon-btn" title="Edit" onclick="openGearModal('${c.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>
        </button>
        <button class="gear-icon-btn gear-icon-btn--del" title="Delete" onclick="deleteGearComponent('${c.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </div>
    </div>
    ${meta.length ? `<div class="gear-comp-meta">${meta.join('<span class="gear-comp-dot">·</span>')}</div>` : ''}
    ${ridden > 0 || remind > 0 ? `<div class="gear-comp-km">${Math.round(ridden).toLocaleString()} km ridden${remind > 0 ? ` / ${remind.toLocaleString()} km` : ''}</div>` : ''}
    ${progressHtml}
  </div>`;
}

function openGearModal(editId) {
  const modal = document.getElementById('gearModal');
  const titleEl = document.getElementById('gearModalTitle');
  if (!modal) return;

  // Reset form
  document.getElementById('gearEditId').value         = editId || '';
  document.getElementById('gearFormName').value       = '';
  document.getElementById('gearFormBrand').value      = '';
  document.getElementById('gearFormModel').value      = '';
  document.getElementById('gearFormDate').value       = '';
  document.getElementById('gearFormPrice').value      = '';
  document.getElementById('gearFormKmAtInstall').value= '';
  document.getElementById('gearFormReminderKm').value = '';
  document.getElementById('gearFormBike').value       = _gearSelectedBike || '';
  document.getElementById('gearFormCategory').value   = 'Drivetrain';

  if (editId) {
    const comp = loadGearComponents().find(c => c.id === editId);
    if (comp) {
      titleEl.textContent = 'Edit Component';
      document.getElementById('gearFormName').value        = comp.name        || '';
      document.getElementById('gearFormBrand').value       = comp.brand       || '';
      document.getElementById('gearFormModel').value       = comp.model       || '';
      document.getElementById('gearFormDate').value        = comp.purchaseDate|| '';
      document.getElementById('gearFormPrice').value       = comp.price       || '';
      document.getElementById('gearFormKmAtInstall').value = comp.kmAtInstall || '';
      document.getElementById('gearFormReminderKm').value  = comp.reminderKm  || '';
      document.getElementById('gearFormBike').value        = comp.bikeId      || '';
      document.getElementById('gearFormCategory').value    = comp.category    || 'Drivetrain';
    }
  } else {
    titleEl.textContent = 'Add Component';
  }

  modal.classList.add('open');
}

function closeGearModal() {
  const modal = document.getElementById('gearModal');
  if (modal) modal.classList.remove('open');
}

function submitGearForm() {
  const name = document.getElementById('gearFormName').value.trim();
  if (!name) {
    document.getElementById('gearFormName').focus();
    return;
  }
  const editId = document.getElementById('gearEditId').value;
  const comp = {
    id:           editId || ('g_' + Date.now() + '_' + Math.random().toString(36).slice(2,7)),
    bikeId:       document.getElementById('gearFormBike').value        || '',
    category:     document.getElementById('gearFormCategory').value    || 'Other',
    name,
    brand:        document.getElementById('gearFormBrand').value.trim() || '',
    model:        document.getElementById('gearFormModel').value.trim() || '',
    purchaseDate: document.getElementById('gearFormDate').value        || '',
    price:        parseFloat(document.getElementById('gearFormPrice').value)        || 0,
    kmAtInstall:  parseFloat(document.getElementById('gearFormKmAtInstall').value)  || 0,
    reminderKm:   parseFloat(document.getElementById('gearFormReminderKm').value)   || 0,
  };

  let all = loadGearComponents();
  if (editId) {
    all = all.map(c => c.id === editId ? comp : c);
  } else {
    all.push(comp);
  }
  saveGearComponents(all);
  closeGearModal();
  renderGearComponents();
}

function deleteGearComponent(id) {
  if (!confirm('Delete this component?')) return;
  const all = loadGearComponents().filter(c => c.id !== id);
  saveGearComponents(all);
  renderGearComponents();
}

// ─────────────────────────────────────────────────────────────────────────────
// TRAINING GUIDE PAGE
// ─────────────────────────────────────────────────────────────────────────────

function renderGuidePage() {
  const wrap = document.getElementById('guidePageContent');
  if (!wrap) return;

  const f      = state.fitness || {};
  const ctl    = f.ctl    != null ? Math.round(f.ctl)    : null;
  const atl    = f.atl    != null ? Math.round(f.atl)    : null;
  const tsb    = f.tsb    != null ? Math.round(f.tsb)    : (ctl != null && atl != null ? ctl - atl : null);
  const rr     = f.rampRate != null ? +f.rampRate.toFixed(1) : null;
  const ftp    = state.athlete?.ftp    || null;
  const weight = state.athlete?.weight || null;
  const wkg    = ftp && weight ? +(ftp / weight).toFixed(2) : null;
  const name   = state.athlete ? (state.athlete.name || state.athlete.firstname || 'You') : 'You';

  // ── helper: build a zone row (highlight only, no inline badge) ──
  function zoneRow(barPct, color, label, desc, isActive) {
    return `<div class="guide-zone-row${isActive ? ' guide-zone-row--active' : ''}">
      <span class="guide-zone-bar" style="width:${barPct}%;background:${color}"></span>
      <span class="guide-zone-label">${label}</span>
      <span class="guide-zone-desc">${desc}</span>
    </div>`;
  }

  // ── helper: green pill for top-right of card ──
  function youBadge(value, suffix) {
    if (value == null) return '';
    return `<span class="guide-you-badge">${value}${suffix || ''}</span>`;
  }

  // ── CTL zone detection ──
  function ctlZone(v) {
    if (v == null) return -1;
    if (v < 30)  return 0;
    if (v < 60)  return 1;
    if (v < 90)  return 2;
    if (v < 120) return 3;
    return 4;
  }
  // ── TSB zone detection ──
  function tsbZone(v) {
    if (v == null) return -1;
    if (v < -30) return 0;
    if (v < -10) return 1;
    if (v < 5)   return 2;
    if (v <= 25) return 3;
    return 4;
  }
  // ── ATL vs CTL zone ──
  function atlZone(a, c) {
    if (a == null || c == null) return -1;
    const diff = a - c;
    if (diff < 0)  return 0;
    if (diff < 10) return 1;
    if (diff < 30) return 2;
    return 3;
  }
  // ── Ramp Rate zone ──
  function rrZone(v) {
    if (v == null) return -1;
    if (v < 0)  return 0;
    if (v < 5)  return 1;
    if (v < 8)  return 2;
    return 3;
  }

  const ctlZ = ctlZone(ctl);
  const tsbZ = tsbZone(tsb);
  const atlZ = atlZone(atl, ctl);
  const rrZ  = rrZone(rr);

  // ── Personalised summary line ──
  function ctlLabel(v) {
    if (v == null) return null;
    if (v < 30)  return 'beginner level';
    if (v < 60)  return 'recreational level';
    if (v < 90)  return 'fit amateur level';
    if (v < 120) return 'serious racer level';
    return 'elite level';
  }
  function tsbLabel(v) {
    if (v == null) return null;
    if (v < -30) return 'heavily overreached — you need rest immediately';
    if (v < -10) return 'in a training block, carrying fatigue';
    if (v < 5)   return 'in a good training sweet spot';
    if (v <= 25) return 'fresh and in peak form';
    return 'well rested but fitness may be declining';
  }
  function wkgLabel(v) {
    if (v == null) return null;
    if (v < 2.5) return 'beginner';
    if (v < 3.5) return 'recreational';
    if (v < 4.5) return 'sportive / cat 4';
    if (v < 5.5) return 'cat 3 / strong amateur';
    return 'elite / pro territory';
  }

  const hasFitness = ctl != null;

  // ── Personal status card ──
  const statusCard = hasFitness ? `
    <div class="card guide-status-card">
      <div class="guide-status-header">
        <div class="guide-status-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="22" height="22"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
        <div>
          <div class="guide-status-title">Your current status, ${name}</div>
          <div class="guide-status-sub">Based on your live intervals.icu data</div>
        </div>
      </div>
      <div class="guide-status-kpis">
        ${ctl  != null ? `<div class="guide-status-kpi">
          <div class="guide-status-kpi-val" style="color:var(--accent)">${ctl}</div>
          <div class="guide-status-kpi-label">CTL · Fitness</div>
          <div class="guide-status-kpi-desc">${ctlLabel(ctl)}</div>
        </div>` : ''}
        ${atl  != null ? `<div class="guide-status-kpi">
          <div class="guide-status-kpi-val" style="color:var(--orange)">${atl}</div>
          <div class="guide-status-kpi-label">ATL · Fatigue</div>
          <div class="guide-status-kpi-desc">${atl > ctl ? `${atl - ctl} above CTL` : `${ctl - atl} below CTL`}</div>
        </div>` : ''}
        ${tsb  != null ? `<div class="guide-status-kpi">
          <div class="guide-status-kpi-val" style="color:${tsb >= 0 ? 'var(--blue)' : 'var(--orange)'}">${tsb > 0 ? '+' : ''}${tsb}</div>
          <div class="guide-status-kpi-label">TSB · Form</div>
          <div class="guide-status-kpi-desc">${tsbLabel(tsb)}</div>
        </div>` : ''}
        ${rr   != null ? `<div class="guide-status-kpi">
          <div class="guide-status-kpi-val" style="color:${rr >= 0 ? 'var(--accent)' : 'var(--red)'}">${rr > 0 ? '+' : ''}${rr}</div>
          <div class="guide-status-kpi-label">Ramp Rate</div>
          <div class="guide-status-kpi-desc">per week</div>
        </div>` : ''}
        ${ftp  != null ? `<div class="guide-status-kpi">
          <div class="guide-status-kpi-val" style="color:var(--yellow)">${ftp}w</div>
          <div class="guide-status-kpi-label">FTP</div>
          <div class="guide-status-kpi-desc">${wkg ? wkg + ' w/kg' : ''}</div>
        </div>` : ''}
        ${wkg  != null ? `<div class="guide-status-kpi">
          <div class="guide-status-kpi-val" style="color:var(--purple)">${wkgLabel(wkg)}</div>
          <div class="guide-status-kpi-label">W/kg Level</div>
          <div class="guide-status-kpi-desc">${wkg} w/kg</div>
        </div>` : ''}
      </div>
    </div>` : `
    <div class="card guide-intro-card">
      <div class="guide-intro-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
      </div>
      <div>
        <div class="guide-intro-title">Training Load Explained</div>
        <div class="guide-intro-sub">Sync your intervals.icu data to see how these numbers apply to your own training.</div>
      </div>
    </div>`;

  // ── W/kg benchmarks card ──
  const wkgCard = ftp ? (() => {
    const rows = [
      { label: '< 2.5', desc: 'Beginner', pct: 20, color: '#62708a' },
      { label: '2.5–3.5', desc: 'Recreational', pct: 40, color: 'var(--blue)' },
      { label: '3.5–4.5', desc: 'Sportive / Cat 4', pct: 60, color: 'var(--accent)' },
      { label: '4.5–5.5', desc: 'Cat 3 / Strong amateur', pct: 80, color: 'var(--orange)' },
      { label: '5.5+', desc: 'Elite / Pro', pct: 100, color: 'var(--red)' },
    ];
    function wkgZone(v) {
      if (v < 2.5) return 0; if (v < 3.5) return 1; if (v < 4.5) return 2; if (v < 5.5) return 3; return 4;
    }
    const activeZ = wkg ? wkgZone(wkg) : -1;
    const zoneRows = rows.map((r, i) => zoneRow(r.pct, r.color, r.label, r.desc, i === activeZ)).join('');
    return `<div class="card guide-metric-card">
      <div class="guide-metric-header">
        <div class="guide-metric-badge" style="background:rgba(240,196,41,0.12);color:var(--yellow)">W/kg</div>
        <div>
          <div class="guide-metric-name">Watts per Kilogram</div>
          <div class="guide-metric-aka">your power-to-weight ratio</div>
        </div>
        ${youBadge(wkg, ' w/kg')}
      </div>
      <p class="guide-metric-desc">Dividing your FTP by your bodyweight gives a weight-normalised power score that lets you compare performance regardless of size. It's the most common benchmark for road cycling performance.${ftp && weight ? ` Your FTP of <strong>${ftp}w</strong> at <strong>${weight}kg</strong> gives you <strong>${wkg} w/kg</strong>.` : ''}</p>
      <div class="guide-zones">${zoneRows}</div>
      <div class="guide-tip">💡 Improving w/kg comes from raising FTP, reducing weight, or both. Most cyclists find raising FTP easier.</div>
    </div>`;
  })() : '';

  // ── Main grid ──
  wrap.innerHTML = `<div class="guide-grid">
    ${statusCard}

    <!-- CTL -->
    <div class="card guide-metric-card">
      <div class="guide-metric-header">
        <div class="guide-metric-badge" style="background:rgba(0,229,160,0.12);color:var(--accent)">CTL</div>
        <div>
          <div class="guide-metric-name">Chronic Training Load</div>
          <div class="guide-metric-aka">aka <strong>Fitness</strong></div>
        </div>
        ${youBadge(ctl)}
      </div>
      <p class="guide-metric-desc">Your 42-day rolling average of daily training stress. Think of it as your long-term fitness bank — the higher it is, the more your body is adapted to hard training.${ctl != null ? ` Your current CTL is <strong>${ctl}</strong>.` : ''}</p>
      <div class="guide-zones">
        ${zoneRow(20,  'var(--text-muted)', '0–30',   'Beginner / returning from break',               ctlZ===0)}
        ${zoneRow(40,  'var(--blue)',       '30–60',  'Recreational cyclist, training regularly',      ctlZ===1)}
        ${zoneRow(65,  'var(--accent)',     '60–90',  'Fit amateur, racing or hard sportives',         ctlZ===2)}
        ${zoneRow(85,  'var(--orange)',     '90–120', 'Serious club racer / part-time athlete',        ctlZ===3)}
        ${zoneRow(100, 'var(--red)',        '120+',   'Elite / pro level — needs full recovery cycles', ctlZ===4)}
      </div>
      <div class="guide-tip">💡 Aim to build CTL no faster than 5–8 points per week to reduce injury risk.</div>
    </div>

    <!-- ATL -->
    <div class="card guide-metric-card">
      <div class="guide-metric-header">
        <div class="guide-metric-badge" style="background:rgba(255,107,53,0.12);color:var(--orange)">ATL</div>
        <div>
          <div class="guide-metric-name">Acute Training Load</div>
          <div class="guide-metric-aka">aka <strong>Fatigue</strong></div>
        </div>
        ${youBadge(atl)}
      </div>
      <p class="guide-metric-desc">Your 7-day rolling average of daily training stress. It reacts fast — a big week shoots it up, a few easy days brings it down quickly.${atl != null && ctl != null ? ` Your ATL is <strong>${atl}</strong> vs CTL <strong>${ctl}</strong> — you're ${atl > ctl ? `<strong>${atl-ctl} points above</strong> CTL, in a fatigue hole` : `<strong>${ctl-atl} points below</strong> CTL, recovering well`}.` : ''}</p>
      <div class="guide-zones">
        ${zoneRow(25,  'var(--accent)', 'ATL &lt; CTL',          'Recovering — feeling fresh, performance may peak',   atlZ===0)}
        ${zoneRow(55,  'var(--blue)',   'ATL ≈ CTL',             'Maintaining — steady state training',                atlZ===1)}
        ${zoneRow(80,  'var(--orange)', 'ATL &gt; CTL by 20–30', 'Hard training block — expected but monitor closely', atlZ===2)}
        ${zoneRow(100, 'var(--red)',    'ATL &gt; CTL by 30+',   'Danger zone — high injury &amp; illness risk',       atlZ===3)}
      </div>
      <div class="guide-tip">💡 ATL drops about 13% per day of rest — a 3-day easy period makes a noticeable difference.</div>
    </div>

    <!-- TSB -->
    <div class="card guide-metric-card">
      <div class="guide-metric-header">
        <div class="guide-metric-badge" style="background:rgba(74,158,255,0.12);color:var(--blue)">TSB</div>
        <div>
          <div class="guide-metric-name">Training Stress Balance</div>
          <div class="guide-metric-aka">aka <strong>Form</strong> &nbsp;=&nbsp; CTL − ATL</div>
        </div>
        ${youBadge(tsb != null ? (tsb > 0 ? '+' + tsb : tsb) : null)}
      </div>
      <p class="guide-metric-desc">The difference between your fitness and your fatigue. A positive TSB means you're fresh and ready to perform.${tsb != null ? ` Your TSB is currently <strong>${tsb > 0 ? '+' : ''}${tsb}</strong> — ${tsbLabel(tsb)}.` : ''}</p>
      <div class="guide-zones">
        ${zoneRow(15,  'var(--purple)',     'Below −30',  'Overreaching — step back immediately',             tsbZ===0)}
        ${zoneRow(40,  'var(--orange)',     '−30 to −10', 'Training load — tired but building fitness',       tsbZ===1)}
        ${zoneRow(65,  'var(--accent)',     '−10 to +5',  'Sweet spot — training while managing fatigue',     tsbZ===2)}
        ${zoneRow(85,  'var(--blue)',       '+5 to +25',  'Peak form — ideal for races &amp; hard efforts',   tsbZ===3)}
        ${zoneRow(100, 'var(--text-muted)', 'Above +25',  'Detraining — too much rest, fitness declining',    tsbZ===4)}
      </div>
      <div class="guide-tip">💡 Aim for TSB between +5 and +15 on race day. Start your taper 7–14 days out.</div>
    </div>

    <!-- TSS -->
    <div class="card guide-metric-card">
      <div class="guide-metric-header">
        <div class="guide-metric-badge" style="background:rgba(240,196,41,0.12);color:var(--yellow)">TSS</div>
        <div>
          <div class="guide-metric-name">Training Stress Score</div>
          <div class="guide-metric-aka">per-ride training load</div>
        </div>
      </div>
      <p class="guide-metric-desc">A single number representing the stress of one ride. 100 TSS = riding at your FTP for exactly one hour. Every workout gets a TSS; these feed into your ATL and CTL.${ftp ? ` With your FTP of ${ftp}w, a 2-hour endurance ride would score roughly 80–120 TSS.` : ''}</p>
      <div class="guide-zones">
        ${zoneRow(20,  'var(--accent)', 'Under 50', 'Easy recovery ride — minimal fatigue',              false)}
        ${zoneRow(45,  'var(--blue)',   '50–100',   'Moderate training ride — recover in a day',         false)}
        ${zoneRow(70,  'var(--orange)', '100–150',  'Hard session — 1–2 days recovery needed',           false)}
        ${zoneRow(100, 'var(--red)',    '150+',     'Very hard / long ride — 2–3 days to fully recover', false)}
      </div>
      <div class="guide-tip">💡 Without a power meter, TSS is estimated from heart rate. A power meter gives more accurate numbers.</div>
    </div>

    <!-- Ramp Rate -->
    <div class="card guide-metric-card">
      <div class="guide-metric-header">
        <div class="guide-metric-badge" style="background:rgba(155,89,255,0.12);color:var(--purple)">RR</div>
        <div>
          <div class="guide-metric-name">Ramp Rate</div>
          <div class="guide-metric-aka">CTL change per week</div>
        </div>
        ${youBadge(rr != null ? (rr > 0 ? '+' + rr : rr) : null, '/wk')}
      </div>
      <p class="guide-metric-desc">How fast your fitness is rising or falling each week.${rr != null ? ` Your current ramp rate is <strong>${rr > 0 ? '+' : ''}${rr}/week</strong>${rr > 8 ? ' — that\'s quite aggressive, watch for fatigue' : rr >= 3 ? ' — right in the ideal zone' : rr > 0 ? ' — conservative, safe to push a little more' : ' — fitness is declining, time to ramp up'}.` : ''}</p>
      <div class="guide-zones">
        ${zoneRow(15,  'var(--text-muted)', 'Negative',  'Fitness declining — rest week or off-season',       rrZ===0)}
        ${zoneRow(40,  'var(--accent)',     '+3 to +5',  'Ideal — safe, sustainable fitness gains',           rrZ===1)}
        ${zoneRow(70,  'var(--orange)',     '+5 to +8',  'Aggressive — monitor for fatigue &amp; soreness',   rrZ===2)}
        ${zoneRow(100, 'var(--red)',        'Above +8',  'Too fast — high injury risk, ease off',             rrZ===3)}
      </div>
      <div class="guide-tip">💡 New to structured training? Stay at +3–4/week. Experienced athletes can push to +5–6 for short blocks.</div>
    </div>

    ${wkgCard}

    <!-- Quick reference -->
    <div class="card guide-ref-card">
      <div class="card-header"><div class="card-title">Quick Reference</div></div>
      <div class="guide-ref-grid">
        <div class="guide-ref-item">
          <div class="guide-ref-label">I want to get fitter</div>
          <div class="guide-ref-val">Keep ATL &gt; CTL for weeks at a time. Ramp rate +3–5/wk.</div>
        </div>
        <div class="guide-ref-item">
          <div class="guide-ref-label">I have a race next weekend</div>
          <div class="guide-ref-val">Reduce load now. Target TSB +5 to +15 on race day.</div>
        </div>
        <div class="guide-ref-item">
          <div class="guide-ref-label">I feel exhausted all the time</div>
          <div class="guide-ref-val">Check TSB — if below −20, take 3–5 easy days.</div>
        </div>
        <div class="guide-ref-item">
          <div class="guide-ref-label">I haven't trained in weeks</div>
          <div class="guide-ref-val">CTL is low — start easy and ramp slowly. Rushing causes injury.</div>
        </div>
      </div>
    </div>
  </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────

// ── Dashboard section visibility toggles ─────────────────────────────────────
const DASH_SECTIONS = [
  { key: 'recentCarousel', label: 'Recent Activity Carousel', defaultOn: true },
  { key: 'weather',        label: 'Weather Forecast',         defaultOn: true },
  { key: 'weeklyStats',    label: 'Weekly Stats',             defaultOn: true },
  { key: 'weekProgress',   label: 'Week Progress & Training Status', defaultOn: true },
  { key: 'trainingLoad',   label: 'Training Load Chart',      defaultOn: true },
  { key: 'powerZones',     label: 'Average Power & Zones',    defaultOn: true },
  { key: 'powerCurve',     label: 'Power Curve',              defaultOn: true },
  { key: 'weeklyTss',      label: 'Weekly Load Chart',        defaultOn: true },
  { key: 'goalsTargets',   label: 'Goals & Targets',          defaultOn: true },
  { key: 'recentTable',    label: 'Recent Activities Table',  defaultOn: true },
];

function loadDashSectionPrefs() {
  try {
    const raw = localStorage.getItem('icu_dash_sections');
    return raw ? JSON.parse(raw) : {};
  } catch(e) { return {}; }
}

function saveDashSectionPref(key, visible) {
  const prefs = loadDashSectionPrefs();
  prefs[key] = visible;
  localStorage.setItem('icu_dash_sections', JSON.stringify(prefs));
}

function isDashSectionVisible(key) {
  const prefs = loadDashSectionPrefs();
  const sec = DASH_SECTIONS.find(s => s.key === key);
  if (prefs[key] !== undefined) return prefs[key];
  return sec ? sec.defaultOn : true;
}

function applyDashSectionVisibility() {
  for (const sec of DASH_SECTIONS) {
    const el = document.querySelector(`[data-dash-section="${sec.key}"]`);
    if (el) el.classList.toggle('dash-hidden', !isDashSectionVisible(sec.key));
  }
}

function renderDashSectionToggles() {
  const container = document.getElementById('dashSectionToggles');
  if (!container) return;
  container.innerHTML = '';
  for (const sec of DASH_SECTIONS) {
    const on = isDashSectionVisible(sec.key);
    const row = document.createElement('div');
    row.className = 'stt-row stt-row--toggle';
    row.innerHTML = `
      <div class="stt-row-info">
        <div class="stt-row-label">${sec.label}</div>
      </div>
      <label class="settings-ios-toggle">
        <input type="checkbox" ${on ? 'checked' : ''} data-dash-toggle="${sec.key}">
        <span class="settings-ios-slider"></span>
      </label>`;
    const cb = row.querySelector('input');
    cb.addEventListener('change', () => {
      saveDashSectionPref(sec.key, cb.checked);
      applyDashSectionVisibility();
    });
    container.appendChild(row);
  }
}

// ========================== GOALS & TARGETS ==========================

const GOAL_METRICS = {
  distance:  { label: 'Distance',      unit: 'km',  icon: 'blue',   fmt: v => v.toFixed(1) },
  time:      { label: 'Ride Time',     unit: 'h',   icon: 'orange', fmt: v => v.toFixed(1) },
  tss:       { label: 'Training Load', unit: 'TSS', icon: 'green',  fmt: v => Math.round(v) },
  elevation: { label: 'Elevation',     unit: 'm',   icon: 'purple', fmt: v => Math.round(v).toLocaleString() },
  power:     { label: 'Avg Power',     unit: 'w',   icon: 'orange', fmt: v => Math.round(v) },
  count:     { label: 'Rides',         unit: '',    icon: 'green',  fmt: v => Math.round(v) },
  heartrate: { label: 'Avg Heart Rate',unit: 'bpm', icon: 'red',    fmt: v => Math.round(v) },
};

function loadGoals() {
  try { return JSON.parse(localStorage.getItem('icu_goals') || '[]'); }
  catch(e) { return []; }
}
function saveGoals(goals) { localStorage.setItem('icu_goals', JSON.stringify(goals)); }

function addGoal(metric, target, period) {
  const goals = loadGoals();
  goals.push({ id: Date.now(), metric, target: +target, period, active: true, created: new Date().toISOString().slice(0,10) });
  saveGoals(goals);
  renderGoalsPage();
  renderGoalsDashWidget();
}
function updateGoal(id, updates) {
  const goals = loadGoals();
  const g = goals.find(g => g.id === id);
  if (g) Object.assign(g, updates);
  saveGoals(goals);
  renderGoalsPage();
  renderGoalsDashWidget();
}
function deleteGoal(id) {
  saveGoals(loadGoals().filter(g => g.id !== id));
  renderGoalsPage();
  renderGoalsDashWidget();
}

function getGoalPeriodRange(period) {
  const now = new Date();
  let start, end, totalDays;
  if (period === 'week') {
    start = getWeekStart(now);
    end = new Date(start);
    end.setDate(end.getDate() + 7);
    totalDays = 7;
  } else if (period === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    totalDays = Math.round((end - start) / 86400000);
  } else {
    start = new Date(now.getFullYear(), 0, 1);
    end = new Date(now.getFullYear() + 1, 0, 1);
    totalDays = Math.round((end - start) / 86400000);
  }
  const elapsed = Math.max(1, Math.round((now - start) / 86400000));
  const remaining = Math.max(0, totalDays - elapsed);
  return { start, end, totalDays, elapsed, remaining };
}

function computeGoalProgress(goal) {
  const { start, end, totalDays, elapsed, remaining } = getGoalPeriodRange(goal.period);
  const startStr = toDateStr(start);
  const endStr = toDateStr(end);
  const acts = state.activities.filter(a => {
    if (isEmptyActivity(a)) return false;
    const d = (a.start_date_local || a.start_date || '').slice(0,10);
    return d >= startStr && d < endStr;
  });

  let current = 0;
  if (goal.metric === 'count') {
    current = acts.length;
  } else if (goal.metric === 'power' || goal.metric === 'heartrate') {
    let sum = 0, n = 0;
    acts.forEach(a => {
      const v = goal.metric === 'power'
        ? actVal(a, 'icu_weighted_avg_watts', 'average_watts', 'icu_average_watts')
        : actVal(a, 'average_heartrate', 'icu_average_heartrate');
      if (v > 0) { sum += v; n++; }
    });
    current = n > 0 ? sum / n : 0;
  } else {
    acts.forEach(a => {
      if (goal.metric === 'distance') current += actVal(a, 'distance', 'icu_distance') / 1000;
      else if (goal.metric === 'time') current += actVal(a, 'moving_time', 'elapsed_time', 'icu_moving_time', 'icu_elapsed_time') / 3600;
      else if (goal.metric === 'tss') current += actVal(a, 'icu_training_load', 'tss');
      else if (goal.metric === 'elevation') current += actVal(a, 'total_elevation_gain', 'icu_total_elevation_gain');
    });
  }

  const pct = goal.target > 0 ? Math.min((current / goal.target) * 100, 100) : 0;
  const expectedPct = (elapsed / totalDays) * 100;
  const pace = expectedPct > 0 ? (pct / expectedPct) * 100 : 100;
  let status = 'on-track';
  if (pace >= 100) status = 'ahead';
  else if (pace < 50) status = 'behind';
  else if (pace < 80) status = 'caution';

  return { current, target: goal.target, pct, pace, status, elapsed, remaining, totalDays };
}

function goalFormHTML() {
  return `<div class="goal-form-overlay" id="goalFormOverlay" style="display:none">
    <div class="goal-form-card">
      <div class="goal-form-title" id="goalFormTitle">Add Goal</div>
      <input type="hidden" id="goalFormId" value="">
      <div class="goal-form-field">
        <label>Metric</label>
        <select id="goalFormMetric">
          ${Object.entries(GOAL_METRICS).map(([k,v]) => `<option value="${k}">${v.label} (${v.unit || 'count'})</option>`).join('')}
        </select>
      </div>
      <div class="goal-form-field">
        <label>Target</label>
        <div class="goal-number-wrap">
          <input type="number" id="goalFormTarget" placeholder="e.g. 200" min="0" step="any">
          <div class="goal-number-btns">
            <button type="button" onclick="goalNumStep(1)" tabindex="-1"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 15l-6-6-6 6"/></svg></button>
            <button type="button" onclick="goalNumStep(-1)" tabindex="-1"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></button>
          </div>
        </div>
      </div>
      <div class="goal-form-field">
        <label>Period</label>
        <select id="goalFormPeriod">
          <option value="week">Weekly</option>
          <option value="month">Monthly</option>
          <option value="year">Yearly</option>
        </select>
      </div>
      <div class="goal-form-actions">
        <button class="btn btn-ghost" onclick="hideGoalForm()">Cancel</button>
        <button class="btn btn-primary" onclick="submitGoalForm()">Save Goal</button>
      </div>
    </div>
  </div>`;
}

function renderGoalsPage() {
  const container = document.getElementById('goalsPageContent');
  if (!container) return;
  const goals = loadGoals();

  if (!goals.length) {
    container.innerHTML = `
      <div class="goals-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
          <circle cx="12" cy="12" r="10"/><path d="M12 8v4l2 2"/>
        </svg>
        <h3>No goals set yet</h3>
        <p>Set training targets to track your progress over time.</p>
        <button class="btn btn-primary" onclick="showGoalForm()">Create Your First Goal</button>
      </div>` + goalFormHTML();
    return;
  }

  const periodLabel = { week: 'This Week', month: 'This Month', year: 'This Year' };
  let html = `<div class="goals-header">
    <button class="btn btn-primary btn-sm" onclick="showGoalForm()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Add Goal
    </button>
  </div>
  <div class="goals-grid">`;

  goals.forEach(goal => {
    const m = GOAL_METRICS[goal.metric];
    if (!m) return;
    const p = computeGoalProgress(goal);
    const statusLabel = { ahead: 'Ahead', 'on-track': 'On Track', caution: 'Caution', behind: 'Behind' };
    const statusCls = { ahead: 'green', 'on-track': 'green', caution: 'yellow', behind: 'red' };

    html += `
    <div class="goal-card">
      <div class="goal-card-header">
        <div class="goal-card-metric">
          <div class="goal-metric-icon ${m.icon}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <circle cx="12" cy="12" r="10"/><path d="M12 8v4l2 2"/>
            </svg>
          </div>
          <div>
            <div class="goal-card-title">${m.label}</div>
            <div class="goal-card-period">${periodLabel[goal.period]} · ${p.remaining}d left</div>
          </div>
        </div>
        <div class="goal-card-actions">
          <button class="btn btn-ghost btn-xs" onclick="showGoalForm(${goal.id})" title="Edit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn btn-ghost btn-xs" onclick="deleteGoal(${goal.id})" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
      <div class="goal-progress-section">
        <div class="goal-progress-bar-wrap">
          <div class="goal-progress-bar goal-progress-bar--${statusCls[p.status]}" style="width:${p.pct.toFixed(1)}%"></div>
          <div class="goal-progress-expected" style="left:${Math.min(p.elapsed / p.totalDays * 100, 100).toFixed(1)}%"></div>
        </div>
        <div class="goal-progress-info">
          <span class="goal-progress-value">${m.fmt(p.current)} <span class="goal-progress-unit">/ ${m.fmt(p.target)} ${m.unit}</span></span>
          <span class="goal-progress-badge goal-progress-badge--${statusCls[p.status]}">${statusLabel[p.status]}</span>
        </div>
        <div class="goal-progress-pct">${Math.round(p.pct)}% complete</div>
      </div>
    </div>`;
  });

  html += '</div>';
  html += goalFormHTML();

  container.innerHTML = html;
}

function goalNumStep(dir) {
  const el = document.getElementById('goalFormTarget');
  if (!el) return;
  const cur = parseFloat(el.value) || 0;
  const step = cur >= 100 ? 10 : cur >= 10 ? 5 : 1;
  el.value = Math.max(0, cur + step * dir);
  el.focus();
}

function showGoalForm(editId) {
  const overlay = document.getElementById('goalFormOverlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  const titleEl = document.getElementById('goalFormTitle');
  const idEl = document.getElementById('goalFormId');
  const metricEl = document.getElementById('goalFormMetric');
  const targetEl = document.getElementById('goalFormTarget');
  const periodEl = document.getElementById('goalFormPeriod');

  if (editId) {
    const g = loadGoals().find(g => g.id === editId);
    if (g) {
      titleEl.textContent = 'Edit Goal';
      idEl.value = g.id;
      metricEl.value = g.metric;
      targetEl.value = g.target;
      periodEl.value = g.period;
      return;
    }
  }
  titleEl.textContent = 'Add Goal';
  idEl.value = '';
  metricEl.value = 'distance';
  targetEl.value = '';
  periodEl.value = 'week';
}

function hideGoalForm() {
  const overlay = document.getElementById('goalFormOverlay');
  if (overlay) overlay.style.display = 'none';
}

function submitGoalForm() {
  const id = document.getElementById('goalFormId').value;
  const metric = document.getElementById('goalFormMetric').value;
  const target = document.getElementById('goalFormTarget').value;
  const period = document.getElementById('goalFormPeriod').value;
  if (!target || +target <= 0) { showToast('Enter a target value', 'error'); return; }

  if (id) {
    updateGoal(+id, { metric, target: +target, period });
  } else {
    addGoal(metric, target, period);
  }
  hideGoalForm();
}

function renderGoalsDashWidget() {
  const container = document.getElementById('goalsDashContent');
  if (!container) return;
  const goals = loadGoals();
  if (!goals.length) { container.style.display = 'none'; return; }
  container.style.display = '';

  const periodLabel = { week: 'Wk', month: 'Mo', year: 'Yr' };
  let html = `<div class="card"><div class="card-header"><div><div class="card-title">Goals</div><div class="card-subtitle">Training targets progress</div></div><a href="#" onclick="navigate('goals');return false" style="font-size:12px;color:var(--accent);text-decoration:none;font-weight:500">View all</a></div><div style="padding:0 16px 16px"><div class="goals-dash-list">`;

  goals.slice(0, 4).forEach(goal => {
    const m = GOAL_METRICS[goal.metric];
    if (!m) return;
    const p = computeGoalProgress(goal);
    const statusCls = { ahead: 'green', 'on-track': 'green', caution: 'yellow', behind: 'red' };

    html += `
    <div class="goals-dash-item">
      <div class="goals-dash-label">
        <span class="goals-dash-dot goals-dash-dot--${m.icon}"></span>
        ${m.label} <span class="goals-dash-period">${periodLabel[goal.period]}</span>
      </div>
      <div class="goals-dash-bar-wrap">
        <div class="goals-dash-bar goals-dash-bar--${statusCls[p.status]}" style="width:${p.pct.toFixed(1)}%"></div>
      </div>
      <div class="goals-dash-val">${m.fmt(p.current)} / ${m.fmt(p.target)} ${m.unit}</div>
    </div>`;
  });

  html += '</div>';
  if (goals.length > 4) html += `<div class="goals-dash-more"><a href="#" onclick="navigate('goals');return false">View all ${goals.length} goals →</a></div>`;
  html += '</div></div>';

  container.innerHTML = html;
}

// ========================== COMPARE PAGE FUNCTIONS ==========================

// Compare page state
const _compare = {
  periodDays: 28,
  grouping: 'week',  // week, biweek, month
  chartType: 'bar',  // bar or line
  cards: [],  // Array of {id, metric, chart}
  nextCardId: 0
};

function getMetricOptions() {
  return {
    'distance': 'Distance (km)',
    'time': 'Ride Time (hours)',
    'elevation': 'Elevation (meters)',
    'power': 'Avg Power (watts)',
    'heartrate': 'Avg Heart Rate (bpm)',
    'tss': 'TSS',
    'ctl': 'CTL (Fitness)',
    'atl': 'ATL (Fatigue)',
    'tsb': 'TSB (Form)',
    'count': 'Ride Count'
  };
}

function addCompareCard(metric = 'tss') {
  const cardId = _compare.nextCardId++;
  _compare.cards.push({ id: cardId, metric: metric, chart: null });
  renderCompareMetrics();
  updateComparePage();
}

function removeCompareCard(cardId) {
  _compare.cards = _compare.cards.filter(c => c.id !== cardId);
  if (_compare.cards.length === 0) {
    document.getElementById('compareEmptyState').style.display = 'block';
    document.getElementById('compareMetricsContainer').innerHTML = '';
  } else {
    renderCompareMetrics();
    updateComparePage();
  }
}

function setComparePeriod(days) {
  _compare.periodDays = days;
  document.querySelectorAll('.compare-range-pills button').forEach(b => b.classList.remove('active'));
  event?.target?.classList.add('active');
  updateComparePage();
}

function setCompareChartType(type) {
  _compare.chartType = type;
  document.querySelectorAll('.compare-chart-type-toggle button').forEach(b => b.classList.remove('active'));
  if (type === 'bar') {
    document.querySelectorAll('.compare-chart-type-toggle .compareBarBtn').forEach(b => b.classList.add('active'));
  } else {
    document.querySelectorAll('.compare-chart-type-toggle .compareLineBtn').forEach(b => b.classList.add('active'));
  }
  updateComparePage();
}

function aggregateDataForComparison(startDate, endDate, grouping) {
  const periods = [];
  let current = new Date(startDate);

  // Generate periods
  while (current < endDate) {
    const periodStart = new Date(current);
    let periodEnd;

    if (grouping === 'week') {
      periodEnd = new Date(current);
      periodEnd.setDate(periodEnd.getDate() + 7);
    } else if (grouping === 'biweek') {
      periodEnd = new Date(current);
      periodEnd.setDate(periodEnd.getDate() + 14);
    } else { // month
      periodEnd = new Date(current);
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    periodEnd = new Date(Math.min(periodEnd.getTime(), endDate.getTime()));
    periods.push({
      label: `${toDateStr(periodStart).slice(5)}`,
      startDate: periodStart,
      endDate: periodEnd,
      data: {}
    });

    current = new Date(periodEnd);
  }

  // Aggregate metrics for each period
  // Use lifetime activities if available, otherwise use current activities
  const activitiesToUse = state.lifetimeActivities || state.activities;

  for (const period of periods) {
    const startStr = toDateStr(period.startDate);
    const endStr = toDateStr(period.endDate);

    let tss = 0, dist = 0, time = 0, elev = 0, pow = 0, powN = 0, hr = 0, hrN = 0, count = 0;

    for (const activity of activitiesToUse) {
      const actDate = (activity.start_date_local || activity.start_date || '').slice(0, 10);
      if (actDate < startStr || actDate >= endStr) continue;
      if (isEmptyActivity(activity)) continue;

      count++;
      tss += actVal(activity, 'icu_training_load', 'tss');
      dist += actVal(activity, 'distance', 'icu_distance') / 1000;
      time += actVal(activity, 'moving_time', 'elapsed_time', 'icu_moving_time', 'icu_elapsed_time') / 3600;
      elev += actVal(activity, 'total_elevation_gain', 'icu_total_elevation_gain');
      const w = actVal(activity, 'icu_weighted_avg_watts', 'average_watts', 'icu_average_watts');
      if (w > 0) { pow += w; powN++; }
      const h = actVal(activity, 'icu_average_heartrate', 'average_heartrate');
      if (h > 0) { hr += h; hrN++; }
    }

    period.data = {
      tss: Math.round(tss),
      distance: parseFloat(dist.toFixed(1)),
      time: parseFloat(time.toFixed(1)),
      elevation: Math.round(elev),
      power: powN > 0 ? Math.round(pow / powN) : 0,
      heartrate: hrN > 0 ? Math.round(hr / hrN) : 0,
      count: count
    };
  }

  return periods;
}

function generateCompareChart(currentPeriods, previousPeriods, metric, chartType) {
  const canvas = document.getElementById('compareChart');
  if (!canvas) return;

  _compare.chart = destroyChart(_compare.chart);
  const ctx = canvas.getContext('2d');

  const currentValues = currentPeriods.map(p => p.data[metric] || 0);
  const previousValues = previousPeriods.map(p => p.data[metric] || 0);

  const currentColor = { r: 0, g: 229, b: 160 };   // accent green
  const previousColor = { r: 120, g: 120, b: 140 }; // muted blue-gray

  const isBar = chartType === 'bar';

  const currentDataset = {
    label: 'This Period',
    data: currentValues,
    borderColor: isBar ? 'transparent' : `rgb(${currentColor.r},${currentColor.g},${currentColor.b})`,
    backgroundColor: isBar ? `rgba(${currentColor.r},${currentColor.g},${currentColor.b},0.5)` : `rgba(${currentColor.r},${currentColor.g},${currentColor.b},0.1)`,
    hoverBackgroundColor: isBar ? `rgb(${currentColor.r},${currentColor.g},${currentColor.b})` : undefined,
    tension: 0.3,
    borderWidth: isBar ? 0 : 2,
    borderRadius: 4,
    fill: !isBar,
    pointRadius: isBar ? 0 : 4,
    pointBackgroundColor: `rgb(${currentColor.r},${currentColor.g},${currentColor.b})`
  };

  const previousDataset = {
    label: 'Previous Period',
    data: previousValues,
    borderColor: isBar ? 'transparent' : `rgb(${previousColor.r},${previousColor.g},${previousColor.b})`,
    backgroundColor: isBar ? `rgba(${previousColor.r},${previousColor.g},${previousColor.b},0.35)` : `rgba(${previousColor.r},${previousColor.g},${previousColor.b},0.08)`,
    hoverBackgroundColor: isBar ? `rgb(${previousColor.r},${previousColor.g},${previousColor.b})` : undefined,
    tension: 0.3,
    borderWidth: isBar ? 0 : 2,
    borderRadius: 4,
    borderDash: isBar ? [] : [5, 5],
    fill: !isBar,
    pointRadius: isBar ? 0 : 3,
    pointBackgroundColor: `rgb(${previousColor.r},${previousColor.g},${previousColor.b})`
  };

  const config = {
    type: chartType === 'bar' ? 'bar' : 'line',
    data: {
      labels: currentPeriods.map(p => p.label),
      datasets: [currentDataset, previousDataset]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#62708a', font: { size: 12 } } },
        tooltip: { ...C_TOOLTIP }
      },
      scales: cScales({ xGrid: false, yExtra: { maxTicksLimit: 6 } })
    }
  };

  _compare.chart = new Chart(ctx, config);
}

function generateCompareStats(currentPeriods, previousPeriods, metric) {
  const currentValues = currentPeriods.map(p => p.data[metric] || 0);
  const previousValues = previousPeriods.map(p => p.data[metric] || 0);

  const currentSum = currentValues.reduce((a, b) => a + b, 0);
  const previousSum = previousValues.reduce((a, b) => a + b, 0);
  const currentAvg = (currentSum / currentValues.length).toFixed(1);
  const previousAvg = (previousSum / previousValues.length).toFixed(1);

  const change = previousSum > 0 ? (((currentSum - previousSum) / previousSum) * 100).toFixed(1) : 0;
  const changeClass = change > 0 ? 'stat-positive' : (change < 0 ? 'stat-negative' : '');

  let html = '<table><thead><tr><th>Metric</th><th>This Period</th><th>Previous Period</th><th>Change</th></tr></thead><tbody>';
  html += `<tr><td><strong>Total</strong></td><td>${currentSum}</td><td>${previousSum}</td><td class="${changeClass}">${change > 0 ? '+' : ''}${change}%</td></tr>`;
  html += `<tr><td><strong>Average</strong></td><td>${currentAvg}</td><td>${previousAvg}</td><td>-</td></tr>`;
  html += `</tbody></table>`;

  document.getElementById('compareStatsTable').innerHTML = html;
}

function generateCompareChartForCard(cardId, currentPeriods, previousPeriods, metric, chartType) {
  const canvas = document.getElementById(`compareChart${cardId}`);
  if (!canvas) return;

  const card = _compare.cards.find(c => c.id === cardId);
  if (!card) return;

  // Destroy old chart if exists
  if (card.chart) card.chart = destroyChart(card.chart);

  const ctx = canvas.getContext('2d');
  const currentValues = currentPeriods.map(p => p.data[metric] || 0);
  const previousValues = previousPeriods.map(p => p.data[metric] || 0);

  const currentColor = { r: 0, g: 229, b: 160 };
  const previousColor = { r: 120, g: 120, b: 140 };

  const isBar = chartType === 'bar';

  const currentDataset = {
    label: 'This Period',
    data: currentValues,
    borderColor: isBar ? 'transparent' : `rgb(${currentColor.r},${currentColor.g},${currentColor.b})`,
    backgroundColor: isBar ? `rgba(${currentColor.r},${currentColor.g},${currentColor.b},0.5)` : `rgba(${currentColor.r},${currentColor.g},${currentColor.b},0.1)`,
    hoverBackgroundColor: isBar ? `rgb(${currentColor.r},${currentColor.g},${currentColor.b})` : undefined,
    tension: 0.3,
    borderWidth: isBar ? 0 : 2,
    borderRadius: 4,
    fill: !isBar,
    pointRadius: isBar ? 0 : 4,
    pointBackgroundColor: `rgb(${currentColor.r},${currentColor.g},${currentColor.b})`
  };

  const previousDataset = {
    label: 'Previous Period',
    data: previousValues,
    borderColor: isBar ? 'transparent' : `rgb(${previousColor.r},${previousColor.g},${previousColor.b})`,
    backgroundColor: isBar ? `rgba(${previousColor.r},${previousColor.g},${previousColor.b},0.35)` : `rgba(${previousColor.r},${previousColor.g},${previousColor.b},0.08)`,
    hoverBackgroundColor: isBar ? `rgb(${previousColor.r},${previousColor.g},${previousColor.b})` : undefined,
    tension: 0.3,
    borderWidth: isBar ? 0 : 2,
    borderRadius: 4,
    borderDash: isBar ? [] : [5, 5],
    fill: !isBar,
    pointRadius: isBar ? 0 : 3,
    pointBackgroundColor: `rgb(${previousColor.r},${previousColor.g},${previousColor.b})`
  };

  const config = {
    type: chartType === 'bar' ? 'bar' : 'line',
    data: {
      labels: currentPeriods.map(p => p.label),
      datasets: [currentDataset, previousDataset]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#62708a', font: { size: 12 } } },
        tooltip: { ...C_TOOLTIP }
      },
      scales: cScales({ xGrid: false, yExtra: { maxTicksLimit: 6 } })
    }
  };

  card.chart = new Chart(ctx, config);
}

function generateCompareStatsForCard(cardId, currentPeriods, previousPeriods, metric) {
  const currentValues = currentPeriods.map(p => p.data[metric] || 0);
  const previousValues = previousPeriods.map(p => p.data[metric] || 0);

  const currentSum = currentValues.reduce((a, b) => a + b, 0);
  const previousSum = previousValues.reduce((a, b) => a + b, 0);
  const currentAvg = (currentSum / currentValues.length).toFixed(1);
  const previousAvg = (previousSum / previousValues.length).toFixed(1);

  const change = previousSum > 0 ? (((currentSum - previousSum) / previousSum) * 100).toFixed(1) : 0;
  const changeClass = change > 0 ? 'stat-positive' : (change < 0 ? 'stat-negative' : '');

  let html = '<div class="compare-card-stats-summary">';
  html += `<div class="stat-item"><span>Total</span><strong>${currentSum}</strong><span class="stat-prev">(${previousSum})</span></div>`;
  html += `<div class="stat-item"><span>Average</span><strong>${currentAvg}</strong><span class="stat-prev">(${previousAvg})</span></div>`;
  html += `<div class="stat-item"><span>Change</span><strong class="${changeClass}">${change > 0 ? '+' : ''}${change}%</strong></div>`;
  html += '</div>';

  document.getElementById(`compareStats${cardId}`).innerHTML = html;
}

function renderCompareMetrics() {
  if (_compare.cards.length === 0) {
    document.getElementById('compareMetricsContainer').innerHTML = '';
    document.getElementById('compareEmptyState').style.display = 'block';
    return;
  }

  document.getElementById('compareEmptyState').style.display = 'none';
  const container = document.getElementById('compareMetricsContainer');
  const metricOptions = getMetricOptions();

  container.innerHTML = _compare.cards.map(card => `
    <div class="compare-metric-card" data-card-id="${card.id}">
      <div class="compare-metric-header">
        <select class="compare-card-metric-select" onchange="updateCompareCardMetric(${card.id}, this.value)">
          ${Object.entries(metricOptions).map(([value, label]) =>
            `<option value="${value}" ${card.metric === value ? 'selected' : ''}>${label}</option>`
          ).join('')}
        </select>
        <button class="compare-card-remove" onclick="removeCompareCard(${card.id})">✕</button>
      </div>
      <div class="compare-metric-content">
        <div class="compare-chart-wrapper">
          <div class="compare-chart-type-toggle">
            <button class="compareBarBtn ${_compare.chartType === 'bar' ? 'active' : ''}" onclick="setCompareChartType('bar')">Bar</button>
            <button class="compareLineBtn ${_compare.chartType === 'line' ? 'active' : ''}" onclick="setCompareChartType('line')">Line</button>
          </div>
          <div class="chart-wrap chart-wrap--lg">
            <canvas id="compareChart${card.id}"></canvas>
          </div>
        </div>
        <div class="compare-card-stats" id="compareStats${card.id}"></div>
      </div>
    </div>
  `).join('');
}

function updateCompareCardMetric(cardId, metric) {
  const card = _compare.cards.find(c => c.id === cardId);
  if (card) {
    card.metric = metric;
    updateComparePage();
  }
}

function renderComparePage() {
  _compare.grouping = document.getElementById('compareGrouping')?.value || 'week';
  if (_compare.cards.length === 0) {
    renderCompareMetrics();
  }
  updateComparePage();
}

function updateComparePage() {
  if (_compare.cards.length === 0) {
    return;
  }

  // Current period (e.g., last 4 weeks)
  const currentEndDate = new Date();
  const currentStartDate = daysAgo(_compare.periodDays);

  // Previous period (same duration)
  const previousEndDate = new Date(currentStartDate);
  const previousStartDate = new Date(previousEndDate);
  previousStartDate.setDate(previousStartDate.getDate() - _compare.periodDays);

  // Aggregate data for both periods
  const currentPeriods = aggregateDataForComparison(currentStartDate, currentEndDate, _compare.grouping);
  const previousPeriods = aggregateDataForComparison(previousStartDate, previousEndDate, _compare.grouping);

  if (currentPeriods.length === 0) {
    document.getElementById('compareEmptyState').style.display = 'block';
    document.getElementById('compareMetricsContainer').innerHTML = '';
    return;
  }

  // Show/hide metrics container
  document.getElementById('compareEmptyState').style.display = 'none';

  // Generate chart and stats for each card
  for (const card of _compare.cards) {
    generateCompareChartForCard(card.id, currentPeriods, previousPeriods, card.metric, _compare.chartType);
    generateCompareStatsForCard(card.id, currentPeriods, previousPeriods, card.metric);
  }
}

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
    // Pre-load lifetime cache so the Activities page can show the full list
    const ltCached = loadLifetimeCache();
    if (ltCached) {
      state.lifetimeActivities = ltCached.activities;
      state.lifetimeLastSync   = ltCached.lastSync;
    }
    updateSidebarCTL(); // show cached CTL in sidebar immediately
    state.synced = true;
    updateConnectionUI(true);
    renderDashboard();
  } else {
    updateConnectionUI(false);
  }
  // Restore the page the user was on before refresh
  const _validPages = ['dashboard','activities','calendar','fitness','power','zones','weather','settings','workout','guide'];
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

// ── Carousel mouse-drag scroll with momentum + rubber-band bounce ─────────────
(function() {
  function initCarouselDrag(rail) {
    let isDragging  = false;
    let startX      = 0;
    let startScroll = 0;
    let moved       = false;
    let velX        = 0;
    let rafId       = null;

    // Rolling velocity buffer — keeps the last 100ms of pointer samples
    // so releasing after a slow-but-still-moving drag carries proper momentum
    const VEL_WINDOW = 160; // ms
    let velBuf = []; // [{x, t}, ...]

    const FRICTION   = 0.92;
    const SPRING     = 0.18;
    const OVERSCROLL = 80;

    const maxScroll = () => rail.scrollWidth - rail.clientWidth;

    function rubberClamp(raw) {
      const max = maxScroll();
      if (raw < 0)   return raw * (OVERSCROLL / (OVERSCROLL + Math.abs(raw)));
      if (raw > max) return max + (raw - max) * (OVERSCROLL / (OVERSCROLL + (raw - max)));
      return raw;
    }

    // Compute velocity from rolling buffer: displacement over the window period
    function calcVel() {
      const now = performance.now();
      // Drop samples older than the window
      velBuf = velBuf.filter(s => now - s.t <= VEL_WINDOW);
      if (velBuf.length < 2) return 0;
      const oldest = velBuf[0];
      const newest = velBuf[velBuf.length - 1];
      const dt = newest.t - oldest.t || 1;
      return (oldest.x - newest.x) / dt * 16; // px per ~60fps frame
    }

    function cancelMomentum() { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }

    function momentum() {
      const max = maxScroll();
      const cur = rail.scrollLeft;

      if (cur < 0 || cur > max) {
        const target = cur < 0 ? 0 : max;
        const next   = cur + (target - cur) * SPRING;
        rail.scrollLeft = Math.abs(next - target) < 0.5 ? target : next;
        if (Math.abs(next - target) >= 0.5) rafId = requestAnimationFrame(momentum);
        return;
      }

      velX *= FRICTION;
      if (Math.abs(velX) < 0.3) return;
      rail.scrollLeft += velX;
      rafId = requestAnimationFrame(momentum);
    }

    rail.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      cancelMomentum();
      isDragging  = true;
      moved       = false;
      startX      = e.clientX;
      startScroll = rail.scrollLeft;
      velBuf      = [{ x: e.clientX, t: performance.now() }];
      velX        = 0;
      rail.style.cursor     = 'grabbing';
      rail.style.userSelect = 'none';
      e.preventDefault();
    });

    window.addEventListener('mousemove', e => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 4) moved = true;
      velBuf.push({ x: e.clientX, t: performance.now() });
      rail.scrollLeft = rubberClamp(startScroll - dx);
    });

    window.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging            = false;
      rail.style.cursor     = '';
      rail.style.userSelect = '';
      velX  = calcVel();
      rafId = requestAnimationFrame(momentum);
    });

    rail.addEventListener('click', e => {
      if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; }
    }, true);
  }

  const existing = document.getElementById('recentActScrollRail');
  if (existing) { initCarouselDrag(existing); }
  else {
    const obs = new MutationObserver(() => {
      const rail = document.getElementById('recentActScrollRail');
      if (rail) { initCarouselDrag(rail); obs.disconnect(); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }
})();

// ── Physics scroll setting ────────────────────────────────────────────────────
function loadPhysicsScroll() {
  const saved = localStorage.getItem('icu_physics_scroll');
  return saved === null ? true : saved === 'true'; // default ON
}
function setPhysicsScroll(enabled) {
  localStorage.setItem('icu_physics_scroll', String(enabled));
  const toggle = document.getElementById('physicsScrollToggle');
  if (toggle) toggle.checked = enabled;
}
// Init toggle state on settings page load
(function() {
  const toggle = document.getElementById('physicsScrollToggle');
  if (toggle) toggle.checked = loadPhysicsScroll();
})();

// ── Map theme setting ─────────────────────────────────────────────────────────
const MAP_THEMES = {
  voyager:  { label: 'Voyager',  url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', sub: 'abcd', attr: '&copy; OpenStreetMap &copy; CARTO',       bg: '#f0ede4' },
  light:    { label: 'Light',    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',            sub: 'abcd', attr: '&copy; OpenStreetMap &copy; CARTO',       bg: '#f5f4f0' },
  dark:     { label: 'Dark',     url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',             sub: 'abcd', attr: '&copy; OpenStreetMap &copy; CARTO',       bg: '#1a1c22' },
  topo:     { label: 'Topo',     url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',      sub: null,   attr: '&copy; Esri',                  bg: '#dde8c8' },
  outdoors: { label: 'Outdoors', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',    sub: null,   attr: '&copy; Esri &copy; OpenStreetMap', bg: '#e8f0e4' },
};

function loadMapTheme() {
  return localStorage.getItem('icu_map_theme') || 'topo';
}
function setMapTheme(key) {
  if (!MAP_THEMES[key]) return;
  localStorage.setItem('icu_map_theme', key);
  // Update active state on picker buttons
  document.querySelectorAll('.map-theme-option').forEach(b =>
    b.classList.toggle('active', b.dataset.theme === key));
  // Hot-swap tile on live activity map if open
  if (state.activityMap && state._streetTileRef) {
    const t = MAP_THEMES[key];
    state.activityMap.removeLayer(state._streetTileRef);
    state._streetTileRef = L.tileLayer(t.url, {
      attribution: t.attr, subdomains: t.sub || 'abc', maxZoom: 19,
    }).addTo(state.activityMap);
    // Move route layer above new tiles
    if (state._colorLayerRef) state._colorLayerRef.bringToFront();
  }
  // Clear cached map snapshots so they regenerate with the new theme
  Object.keys(localStorage)
    .filter(k => k.startsWith('icu_map_snap_'))
    .forEach(k => localStorage.removeItem(k));
}
(function initMapThemePicker() {
  document.querySelectorAll('.map-theme-option').forEach(b =>
    b.classList.toggle('active', b.dataset.theme === loadMapTheme()));
})();

// ── Smooth flyover setting ───────────────────────────────────────────────────
function loadSmoothFlyover() {
  return localStorage.getItem('icu_smooth_flyover') !== 'false'; // default on
}
function toggleSmoothFlyover(on) {
  localStorage.setItem('icu_smooth_flyover', on ? 'true' : 'false');
}
(function initSmoothFlyoverToggle() {
  const el = document.getElementById('smoothFlyoverToggle');
  if (el) el.checked = loadSmoothFlyover();
})();

// ── Page-level grab-to-scroll with momentum (Figma-style) ────────────────────
(function() {
  // Only skip elements that need their own mouse behaviour (text inputs, maps, sidebar)
  // Buttons, links, cards etc. are fine — moved-flag suppresses accidental clicks after a drag
  const SKIP = 'input,select,textarea,.sidebar,.map-container,.activity-map,.recent-act-scroll-rail,.wxp-week-scroll';

  let isDragging  = false;
  let startY      = 0;
  let startX      = 0;
  let startScrollY = 0;
  let startScrollX = 0;
  let moved       = false;
  let velY        = 0;
  let velX        = 0;
  let rafId       = null;

  const VEL_WINDOW = 160; // ms — same as carousel
  const FRICTION   = 0.96;
  let velBuf = [];

  function cancelMomentum() { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }

  function calcVel() {
    const now = performance.now();
    velBuf = velBuf.filter(s => now - s.t <= VEL_WINDOW);
    if (velBuf.length < 2) return { x: 0, y: 0 };
    const oldest = velBuf[0];
    const newest = velBuf[velBuf.length - 1];
    const dt = newest.t - oldest.t || 1;
    return {
      x: (oldest.x - newest.x) / dt * 16,
      y: (oldest.y - newest.y) / dt * 16,
    };
  }

  function momentum() {
    velY *= FRICTION;
    velX *= FRICTION;
    if (Math.abs(velY) < 0.3 && Math.abs(velX) < 0.3) return;
    window.scrollBy(velX, velY);
    rafId = requestAnimationFrame(momentum);
  }

  document.addEventListener('mousedown', e => {
    if (!loadPhysicsScroll()) return;
    if (e.button !== 0) return;
    if (e.target.closest(SKIP)) return;
    cancelMomentum();
    isDragging   = true;
    moved        = false;
    startY       = e.clientY;
    startX       = e.clientX;
    startScrollY = window.scrollY;
    startScrollX = window.scrollX;
    velBuf       = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
    velY         = 0;
    velX         = 0;
    document.documentElement.style.cursor = 'grab';
    e.preventDefault();
  });

  window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    const dy = e.clientY - startY;
    const dx = e.clientX - startX;
    if (Math.abs(dy) > 4 || Math.abs(dx) > 4) {
      moved = true;
      document.documentElement.style.cursor = 'grabbing';
    }
    velBuf.push({ x: e.clientX, y: e.clientY, t: performance.now() });
    window.scrollTo(startScrollX - dx, startScrollY - dy);
  });

  window.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    document.documentElement.style.cursor = '';
    const v = calcVel();
    velX  = v.x;
    velY  = v.y;
    rafId = requestAnimationFrame(momentum);
  });

  window.addEventListener('click', e => {
    if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; }
  }, true);
})();

/* ====================================================
   CARD GLOW — Apple TV–style spotlight + rim glow
==================================================== */
(function initCardGlow() {
  const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;

  function attachGlow(el) {
    if (isTouchDevice) return;   // no mouse on touch — skip entirely
    el.addEventListener('mousemove', e => {
      const r = el.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width  * 100).toFixed(1) + '%';
      const y = ((e.clientY - r.top)  / r.height * 100).toFixed(1) + '%';
      el.style.setProperty('--mouse-x', x);
      el.style.setProperty('--mouse-y', y);
    });
  }
  // expose so other parts of the app can attach glow to late-rendered elements
  window.attachCardGlow = attachGlow;

  const GLOW_SEL = '.stat-card, .recent-act-card, .perf-metric, .act-pstat, .mm-cell, .wxp-day-card, .fit-kpi-card, .wx-day, .znp-kpi-card, .wxp-st, .wxp-best-card, .stk-hero-card, .stk-pb-card, .stk-badge--earned, .stk-stat-tile';

  function attachPress(el) {
    const press   = () => el.classList.add('is-pressed');
    const release = () => el.classList.remove('is-pressed');
    el.addEventListener('mousedown',   press);
    el.addEventListener('touchstart',  press,  { passive: true });
    el.addEventListener('mouseup',     release);
    el.addEventListener('mouseleave',  release);
    el.addEventListener('touchend',    release);
    el.addEventListener('touchcancel', release);
  }

  function attachGlowAndPress(el) {
    attachGlow(el);
  }

  // Attach to all current glow cards
  document.querySelectorAll(GLOW_SEL).forEach(attachGlowAndPress);

  // Also catch any cards rendered later (e.g. after data loads)
  const observer = new MutationObserver(() => {
    document.querySelectorAll(GLOW_SEL).forEach(el => {
      if (el.dataset.glow) return;
      el.dataset.glow = '1';
      attachGlowAndPress(el);
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();

/* ====================================================
   BADGE TILT — 3D medal tilt for earned achievement badges
==================================================== */
(function initBadgeTilt() {
  if (window.matchMedia('(pointer: coarse)').matches) return; // touch — skip

  const MAX_TILT = 8; // degrees

  function attachTilt(el) {
    if (el.dataset.tilt) return;
    el.dataset.tilt = '1';

    el.addEventListener('mousemove', e => {
      const rect = el.getBoundingClientRect();
      const dx = (e.clientX - rect.left  - rect.width  / 2) / (rect.width  / 2); // -1..1
      const dy = (e.clientY - rect.top   - rect.height / 2) / (rect.height / 2); // -1..1
      const rx = (-dy * MAX_TILT).toFixed(2);
      const ry = ( dx * MAX_TILT).toFixed(2);
      el.classList.remove('badge-tilt-reset');
      el.style.transform = `perspective(480px) rotateX(${rx}deg) rotateY(${ry}deg) scale(1.03)`;
    });

    el.addEventListener('mouseleave', () => {
      el.classList.add('badge-tilt-reset');
      el.style.transform = '';
    });
  }

  // Attach to any already-rendered earned badges
  document.querySelectorAll('.stk-badge--earned').forEach(attachTilt);

  // Catch badges rendered later (streaks page is dynamic)
  const obs = new MutationObserver(() => {
    document.querySelectorAll('.stk-badge--earned').forEach(el => {
      if (!el.dataset.tilt) attachTilt(el);
    });
  });
  obs.observe(document.body, { childList: true, subtree: true });
})();
