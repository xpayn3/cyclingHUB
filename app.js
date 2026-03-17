/* ====================================================
   ES MODULE IMPORTS
==================================================== */
import { state, ICU_BASE, STRAVA_API_BASE, STRAVA_AUTH_BASE, STRAVA_AUTH_URL,
         STORAGE_LIMIT, safeMax, safeMin, _rIC, GREETINGS } from './js/state.js';

import { weatherIconSvg, wmoIcon, wmoLabel, windDir, fmtTempC, fmtWindMs,
         renderActivityWeather, renderActivityNotes, renderActivityIntervals,
         renderWeatherForecast, renderWeatherPage, renderWeatherDayDetail,
         refreshWeatherPage } from './js/weather.js';

import { openShareModal, closeShareModal, shareUpdateSetting, shareRender,
         shareImageDownload, shareImageCopy } from './js/share.js';

import { renderRouteBuilderPage, rbUndo, rbRedo, rbReverse, rbOutAndBack,
         rbLoopBack, rbClear, rbSave, rbSaveEdit, rbCancelEdit, rbLoadRoute, rbDeleteSavedRoute,
         rbExportGPX, rbExportFIT, rbImportGPX, rbToggleElevPanel,
         rbToggleSidePanel, closeExportHelper,
         _rbSetPoiMode, _rbTogglePoiCat, _rbSwitchExportTab,
         _rbToggleFullscreen, _rbToggleSurfaceMode, _rbToggleRoadSafety,
         _rbToggleCyclOSM, _rbToggleTerrain, _rbConfirmLeave,
         rbToggleSnap, rbToggleAvoidUnpaved, rbToggleAvoidHighways,
         rbSetGradient, rbToggleElevShading, rbToggleWind } from './js/routes.js';

import { renderHeatmapPage, hmLoadAllRoutes, hmApplyFilters, hmRedraw,
         hmToggleAnimate, hmRescanGPS, _hmOpenDB } from './js/heatmap.js';

import { wrkRender, wrkRefreshStats, wrkSetName, wrkAddSegment, wrkRemove, wrkMove,
         wrkToggleEdit, wrkSet, wrkClear, wrkExportZwo, wrkExportFit,
         wrkDownload, wrkSetFtp, wrkDrawChart, buildFitWorkout,
         loadMapTheme, setMapTheme, loadAppFont, setAppFont,
         copyShareLink, shareToTwitter, shareToWhatsApp, shareToReddit,
         _isDark, _updateChartColors, setTheme,
         loadPhysicsScroll, setPhysicsScroll,
         loadSmoothFlyover, toggleSmoothFlyover, toggleTerrain3d,
         initMapThemePicker } from './js/workout.js';

import { saveStravaCredentials, loadStravaCredentials, clearStravaCredentials,
         isStravaConnected, stravaStartAuth, stravaExchangeCode,
         stravaDisconnect, stravaSyncActivities, stravaCancelSync,
         icuRenderSyncUI, stravaRenderSyncUI, stravaSaveAndAuth,
         stravaClearActivities, icuSaveAndConnect, saveOrsApiKey,
         stravaFetch, stravaMapType, stravaSaveStreamsToIDB,
         stravaLoadStreamsFromIDB } from './js/strava.js';

import { initImportPage, impSwitchTab, impAddFiles, impRemoveFromQueue,
         impClearQueue, impProcessAll, impToggleSettings, impToggleStream,
         impRenderHistory, impClearHistory, impSaveRouteToIDB } from './js/import.js';

/* ====================================================
   DESIGN TOKENS — single source of truth for JS colors
==================================================== */
const ACCENT = '#00e5a0';

/* ====================================================
   PWA — Service Worker Registration + Install Prompt
==================================================== */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
    .then(reg => {
      if (!reg) return;
      reg.addEventListener('updatefound', () => {
        const newSW = reg.installing;
        if (!newSW) return;
        newSW.addEventListener('statechange', () => {
          if (newSW.state === 'activated' && navigator.serviceWorker.controller) {
            showToast('App updated — refresh for the latest version', 'success');
          }
        });
      });
    })
    .catch(err => console.warn('SW registration failed:', err));
}

let _pwaInstallPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _pwaInstallPrompt = e;
  const btn = document.getElementById('pwaInstallBtn');
  if (btn) btn.style.display = '';
});
window.addEventListener('appinstalled', () => {
  _pwaInstallPrompt = null;
  const btn = document.getElementById('pwaInstallBtn');
  if (btn) btn.style.display = 'none';
  showToast('App installed!', 'success');
});
function pwaInstall() {
  if (!_pwaInstallPrompt) return;
  _pwaInstallPrompt.prompt();
}

// ── iOS Safari "Add to Home Screen" banner ──
(function initIOSBanner() {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  const isSafari = /Safari/.test(navigator.userAgent) &&
    !/CriOS|FxiOS|OPiOS|EdgiOS/.test(navigator.userAgent);

  if (!isIOS || isStandalone || !isSafari) return;
  if (localStorage.getItem('iosInstallDismissed')) return;

  const banner = document.getElementById('iosInstallBanner');
  const closeBtn = document.getElementById('iosInstallClose');
  if (!banner) return;

  setTimeout(() => banner.classList.add('show'), 3000);

  closeBtn?.addEventListener('click', () => {
    banner.classList.remove('show');
    localStorage.setItem('iosInstallDismissed', '1');
  });
})();

/* ====================================================
   DIALOG — close on backdrop click + Escape key
==================================================== */
document.addEventListener('click', e => {
  if (e.target.tagName === 'DIALOG' && e.target.open) {
    const rect = e.target.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right ||
        e.clientY < rect.top  || e.clientY > rect.bottom) {
      e.target.close();
    }
  }
});

/* ====================================================
   PERF — Idle callback helper (defers non-critical work)
==================================================== */

/* ── Navigation AbortController ── */
let _navAbort = null;


/* ====================================================
   CUSTOM DROPDOWN  — replaces native <select> with polished UI
   Call  initCustomDropdowns(root?)  to upgrade all .app-select
   elements (or those inside a given root element).
==================================================== */
// Single global click-outside handler for all custom dropdowns
if (!window._cddGlobalListener) {
  window._cddGlobalListener = true;
  document.addEventListener('click', e => {
    document.querySelectorAll('.cdd-wrap--open').forEach(w => {
      if (!w.contains(e.target)) {
        w.classList.remove('cdd-wrap--open', 'cdd-wrap--flip');
        w.querySelector('.cdd-trigger')?.setAttribute('aria-expanded', 'false');
      }
    });
  });
}

function initCustomDropdowns(root = document) {
  root.querySelectorAll('select.app-select, select.compare-card-metric-select').forEach(sel => {
    if (sel.dataset.cddReady) return;           // already wrapped
    sel.dataset.cddReady = '1';

    const isSm = sel.classList.contains('app-select--sm');

    // ── Build wrapper ──
    const wrap = document.createElement('div');
    wrap.className = 'cdd-wrap' + (isSm ? ' cdd-wrap--sm' : '');

    // ── Trigger button ──
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'cdd-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');

    const labelSpan = document.createElement('span');
    labelSpan.className = 'cdd-label';
    const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    chevron.setAttribute('class', 'cdd-chevron');
    chevron.setAttribute('viewBox', '0 0 12 7');
    chevron.innerHTML = '<path d="M1 1l5 5 5-5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
    trigger.append(labelSpan, chevron);

    // ── Dropdown panel ──
    const dropdown = document.createElement('div');
    dropdown.className = 'cdd-dropdown';
    dropdown.setAttribute('role', 'listbox');

    // ── Populate ──
    function buildOptions() {
      dropdown.innerHTML = '';
      Array.from(sel.options).forEach((opt, i) => {
        const item = document.createElement('div');
        item.className = 'cdd-option' + (i === sel.selectedIndex ? ' cdd-option--selected' : '');
        item.dataset.value = opt.value;
        item.dataset.index = i;
        item.setAttribute('role', 'option');
        item.textContent = opt.textContent.trim() || opt.value;
        dropdown.appendChild(item);
      });
      const cur = sel.options[sel.selectedIndex];
      labelSpan.textContent = cur ? (cur.textContent.trim() || cur.value) : '';
    }
    buildOptions();

    // ── Insert into DOM ──
    sel.style.display = 'none';
    sel.parentNode.insertBefore(wrap, sel);
    wrap.append(trigger, dropdown, sel);    // move select inside wrap

    // ── Open / close helpers ──
    let focusIdx = -1;

    function openDrop() {
      // Close any other open dropdowns first
      document.querySelectorAll('.cdd-wrap--open').forEach(w => {
        if (w !== wrap) {
          w.classList.remove('cdd-wrap--open', 'cdd-wrap--flip');
          w.querySelector('.cdd-trigger')?.setAttribute('aria-expanded', 'false');
        }
      });
      // Flip if near bottom of viewport
      const rect = wrap.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      wrap.classList.toggle('cdd-wrap--flip', spaceBelow < 280);
      wrap.classList.add('cdd-wrap--open');
      trigger.setAttribute('aria-expanded', 'true');
      focusIdx = sel.selectedIndex;
      highlightFocused();
    }

    function closeDrop() {
      wrap.classList.remove('cdd-wrap--open', 'cdd-wrap--flip');
      trigger.setAttribute('aria-expanded', 'false');
      focusIdx = -1;
    }

    function highlightFocused() {
      dropdown.querySelectorAll('.cdd-option').forEach((o, i) => {
        o.classList.toggle('cdd-option--focused', i === focusIdx);
        if (i === focusIdx) o.scrollIntoView({ block: 'nearest' });
      });
    }

    function selectByIndex(i) {
      sel.selectedIndex = i;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      buildOptions();
      closeDrop();
    }

    // ── Event: toggle open ──
    trigger.addEventListener('click', e => {
      e.stopPropagation();
      if (wrap.classList.contains('cdd-wrap--open')) closeDrop();
      else openDrop();
    });

    // ── Event: click an option ──
    dropdown.addEventListener('click', e => {
      e.stopPropagation();
      const opt = e.target.closest('.cdd-option');
      if (!opt) return;
      selectByIndex(+opt.dataset.index);
    });

    // ── Event: keyboard nav ──
    trigger.addEventListener('keydown', e => {
      const isOpen = wrap.classList.contains('cdd-wrap--open');
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (isOpen && focusIdx >= 0) selectByIndex(focusIdx);
        else openDrop();
      } else if (e.key === 'Escape') {
        closeDrop();
        trigger.focus();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!isOpen) openDrop();
        focusIdx = Math.min(focusIdx + 1, sel.options.length - 1);
        highlightFocused();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!isOpen) openDrop();
        focusIdx = Math.max(focusIdx - 1, 0);
        highlightFocused();
      }
    });

    // ── Observe select for dynamic option changes ──
    const obs = new MutationObserver(() => buildOptions());
    obs.observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['selected'] });

    // ── Public API on the select ──
    sel._cddRefresh = buildOptions;
    sel._cddWrap    = wrap;
  });
}

/* Re-init after DOM changes (e.g. compare cards re-rendered) */
function refreshCustomDropdowns(root) {
  if (root) {
    root.querySelectorAll('select').forEach(s => {
      if (!s.dataset.cddReady) return;
      delete s.dataset.cddReady;
      // Remove old wrapper — move select back to its original parent
      const wrap = s.closest('.cdd-wrap');
      if (wrap && wrap.parentNode) {
        wrap.parentNode.insertBefore(s, wrap);
        wrap.remove();
      }
      s.style.display = '';
    });
  }
  initCustomDropdowns(root || document);
}

/* ====================================================
   UTILITIES
==================================================== */
/** Destroy a Chart.js instance and return null for easy assignment */
const _chartLinks = new Map();   // chartInstance → partnerStateKey (for tooltip sync)
function destroyChart(chart) {
  if (chart) { _chartLinks.delete(chart); chart.destroy(); }
  return null;
}

/* ── Lazy chart rendering — defer off-screen charts until visible ── */
const _lazyCharts = { observer: null, pending: new Map() };

function lazyRenderChart(canvasId, renderFn) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  // Find the closest .card ancestor (the visible container)
  const card = canvas.closest('.card') || canvas.parentElement;
  if (!card) { renderFn(); return; }

  // If already in viewport, render immediately
  const rect = card.getBoundingClientRect();
  if (rect.top < window.innerHeight + 200 && rect.bottom > -200) {
    renderFn();
    return;
  }

  // Otherwise defer until scrolled into view
  if (!_lazyCharts.observer) {
    _lazyCharts.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const fn = _lazyCharts.pending.get(entry.target);
          if (fn) {
            _lazyCharts.pending.delete(entry.target);
            _lazyCharts.observer.unobserve(entry.target);
            fn();
          }
        }
      });
    }, { rootMargin: '200px' });
  }

  // Cancel any previous pending render for this card
  if (_lazyCharts.pending.has(card)) {
    _lazyCharts.observer.unobserve(card);
  }
  _lazyCharts.pending.set(card, renderFn);
  _lazyCharts.observer.observe(card);
}

/* ── Chart cleanup on page navigation ── */
const _pageChartKeys = {
  dashboard: ['weekProgressChart', 'fitnessChart', '_dashFormChart', 'weeklyChart', 'avgPowerChart', 'efSparkChart', 'powerCurveChart', 'powerProfileRadarChart', 'cyclingTrendsChart', 'monotonyChart', 'aeChart', 'rampRateChart', 'ytdDistChart', 'pwrHrScatterChart'],
  fitness:   ['fitnessPageChart', '_fitFormChart', 'fitnessWeeklyPageChart', '_fitZonePieChart', 'fitFatigueChart', 'fitFtpHistChart', 'fitPeriodChart', 'healthRHRChart', 'healthHRVChart', 'healthStepsChart', 'healthWeightChart', 'insightHrvTssChart', 'insightRhrCtlChart', 'insightTssWeightChart', 'insightStepsHrvChart'],
  power:     ['powerPageChart', 'powerTrendChart'],
  zones:     ['znpZoneTimeChart', '_znpDecoupleChart'],
  activity:  ['activityStreamsChart', 'activityPowerChart', 'activityHRChart',
              'activityHistogramChart', 'activityGradientChart', 'activityCadenceChart',
              'activityCurveChart', 'activityHRCurveChart', '_detailDecoupleChart', '_detailLRBalChart'],
  routes:    ['_rbElevChart'],
};

const _pageCleanupFns = [];
function cleanupPageCharts(leavingPage) {
  // Stop vitality shader animation when leaving dashboard
  if (leavingPage === 'dashboard' && typeof _stopVitality === 'function') _stopVitality();
  // Run and clear any registered cleanup callbacks
  while (_pageCleanupFns.length) { try { _pageCleanupFns.pop()(); } catch(_){} }
  const keys = _pageChartKeys[leavingPage];
  if (keys) {
    keys.forEach(k => {
      if (state[k]) { state[k].destroy(); state[k] = null; }
    });
  }
  // Destroy compare card charts when leaving compare page
  if (leavingPage === 'compare') {
    _compare.cards.forEach(c => { if (c.chart) c.chart = destroyChart(c.chart); });
    _compare._cachedPeriods = null;
  }
  // Destroy weather charts
  if (leavingPage === 'weather') {
    window._tempChart = destroyChart(window._tempChart);
    window._wxPerfTempSpeedChart = destroyChart(window._wxPerfTempSpeedChart);
    window._wxPerfTempPowerChart = destroyChart(window._wxPerfTempPowerChart);
    window._wxPerfWindSpeedChart = destroyChart(window._wxPerfWindSpeedChart);
  }
  // Clear activity page step-height timer and deactivate sheet mode
  if (leavingPage === 'activity') {
    deactivateSheetMode();
  }
  // Destroy route builder map + sheet
  if (leavingPage === 'routes') {
    if (window.rbCleanupSheetMode) rbCleanupSheetMode();
    if (window._rb && _rb.map) { try { _rb.map.remove(); } catch(_){} _rb.map = null; }
  }
  // Cleanup heatmap sheet
  if (leavingPage === 'heatmap') {
    if (window.hmCleanupSheetMode) hmCleanupSheetMode();
  }
  // Clean up card grid maps when leaving activities page
  if (leavingPage === 'activities') {
    _cleanupCardGrid('allActivityCardGrid');
  }
  // Also clean up any pending lazy renders
  _lazyCharts.pending.forEach((fn, card) => {
    _lazyCharts.observer.unobserve(card);
  });
  _lazyCharts.pending.clear();
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

/* ====================================================
   CREDENTIALS (localStorage)
==================================================== */
function saveCredentials(athleteId, apiKey) {
  try {
    localStorage.setItem('icu_athlete_id', athleteId);
    localStorage.setItem('icu_api_key', apiKey);
  } catch (e) { console.warn('localStorage.setItem failed (credentials):', e); }
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
    const now = new Date().toISOString();
    localStorage.setItem('icu_activities_cache', payload);
    localStorage.setItem('icu_last_sync', now);
    updateStorageBar();
    // Also persist to local backup folder (fire-and-forget)
    if (window._localSaveActivityList) _localSaveActivityList(activities, now);
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
  updateLastSyncLabel(null);
}

function updateLastSyncLabel(isoStr) {
  const el = document.getElementById('syncAgeLabel');
  if (!el) return;
  if (!isoStr) { el.textContent = ''; return; }
  const ms = Date.now() - new Date(isoStr).getTime();
  if (ms < 60000) { el.textContent = 'Synced just now'; return; }
  const min = Math.round(ms / 60000);
  if (min < 60) { el.textContent = `Synced ${min}m ago`; return; }
  const hrs = Math.floor(min / 60);
  el.textContent = `Synced ${hrs}h ${min % 60}m ago`;
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
    if (data.athlete) {
      state.athlete = data.athlete;
      const cycling = data.athlete?.sportSettings?.find(s => s.types?.includes('Ride'));
      if (cycling?.ftp && !data.athlete.ftp)   data.athlete.ftp  = cycling.ftp;
      if (cycling?.lthr && !data.athlete.lthr)  data.athlete.lthr = cycling.lthr;
      if (!data.athlete.weight && cycling?.weight) data.athlete.weight = cycling.weight;
      if (!data.athlete.weight && data.athlete.icu_weight) data.athlete.weight = data.athlete.icu_weight;
    }
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
    else if (key.startsWith('icu_gps_pts_'))
      breakdown.heatmap = (breakdown.heatmap || 0) + size;
    else
      breakdown.other = (breakdown.other || 0) + size;
  }
  return { total, breakdown };
}

/* Get heatmap IndexedDB cache size */
async function getHeatmapIDBSize() {
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
    if (!all || all.length === 0) return { bytes: 0, count: 0 };
    const bytes = new Blob([JSON.stringify(all)]).size;
    return { bytes, count: all.length };
  } catch (_) { return { bytes: 0, count: 0 }; }
}

async function getActCacheIDBSize() {
  try {
    const db = await _actCacheDB();
    const tx = db.transaction('items', 'readonly');
    const store = tx.objectStore('items');
    const all = await new Promise((res, rej) => {
      const req = store.getAll();
      req.onsuccess = () => res(req.result);
      req.onerror   = () => rej(req.error);
    });
    if (!all || all.length === 0) return { bytes: 0, count: 0, activityIds: new Set() };
    const bytes = new Blob([JSON.stringify(all)]).size;
    const ids = new Set();
    for (const row of all) {
      const k = row.key, i = k.lastIndexOf('_');
      if (i > 0) ids.add(k.slice(0, i));
    }
    return { bytes, count: all.length, activityIds: ids };
  } catch (_) { return { bytes: 0, count: 0, activityIds: new Set() }; }
}

function fmtBytes(b) {
  if (b > 1048576) return (b / 1048576).toFixed(1) + ' MB';
  if (b > 1024)    return (b / 1024).toFixed(0) + ' KB';
  return b + ' B';
}

async function updateStorageBar() {
  const bar    = document.getElementById('storageBarTrack');
  const label  = document.getElementById('storageBarLabel');
  const legend = document.getElementById('storageBarLegend');
  if (!bar) return;

  const { total: lsTotal, breakdown } = getAppStorageUsage();

  // Get heatmap IndexedDB size (async)
  let hmIDB = { bytes: 0, count: 0 };
  try { hmIDB = await getHeatmapIDBSize(); } catch (_) {}

  // Get offline activity cache IDB size
  let actIDB = { bytes: 0, count: 0, activityIds: new Set() };
  try { actIDB = await getActCacheIDBSize(); } catch (_) {}

  // Combine heatmap: localStorage GPS points + IndexedDB route cache
  breakdown.heatmap = (breakdown.heatmap || 0) + hmIDB.bytes;
  breakdown.offline = actIDB.bytes;
  const total = lsTotal + hmIDB.bytes + actIDB.bytes;

  // Use browser Storage API for real quota, fall back to total as denominator
  let quota = 0;
  try {
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      quota = est.quota || 0;
    }
  } catch (_) {}
  const barMax = quota > 0 ? quota : Math.max(total, STORAGE_LIMIT);

  const pct = (v) => Math.max(0, Math.min(100, (v / barMax) * 100));

  // build segments
  const segs = [
    { key: 'activities', color: 'var(--accent)',     label: 'Activities' },
    { key: 'lifetime',   color: '#6366f1',           label: 'Lifetime' },
    { key: 'offline',    color: '#8b5cf6',           label: 'Cached Activities' },
    { key: 'fitness',    color: '#10b981',            label: 'Fitness' },
    { key: 'heatmap',    color: '#f59e0b',            label: 'Heat Map' },
    { key: 'other',      color: 'var(--text-muted)',  label: 'Other' },
  ];

  bar.innerHTML = segs.map(s => {
    const w = pct(breakdown[s.key] || 0);
    return w > 0 ? `<div class="stg-seg" style="width:${w}%;background:${s.color}" title="${s.label}: ${fmtBytes(breakdown[s.key])}"></div>` : '';
  }).join('');

  if (label) {
    label.textContent = quota > 0
      ? `${fmtBytes(total)} / ${fmtBytes(quota)} used`
      : `${fmtBytes(total)} used`;
  }

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
  // Combine navigation abort signal with a 30-second timeout
  const signals = [];
  if (_navAbort) signals.push(_navAbort.signal);
  if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
    signals.push(AbortSignal.timeout(30000));
  }
  const signal = signals.length > 1 && typeof AbortSignal.any === 'function'
    ? AbortSignal.any(signals)
    : signals[0] || undefined;

  let res;
  try {
    res = await fetch(ICU_BASE + path, {
      headers: { ...authHeader(), 'Accept': 'application/json' },
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') return null;
    throw err;
  }
  rlTrackRequest();  // count only after a real network request fires
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

async function icuPost(path, body) {
  const res = await fetch(ICU_BASE + path, {
    method: 'POST',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  rlTrackRequest();
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

async function icuPut(path, body) {
  const res = await fetch(ICU_BASE + path, {
    method: 'PUT',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  rlTrackRequest();
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

async function icuDelete(path) {
  const res = await fetch(ICU_BASE + path, {
    method: 'DELETE',
    headers: authHeader(),
  });
  rlTrackRequest();
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : null;
}

async function fetchAthleteProfile() {
  const data = await icuFetch(`/athlete/${state.athleteId}`);
  state.athlete = data;
  // Extract FTP, weight, LTHR from cycling sport settings to top-level for easy access
  const cycling = data?.sportSettings?.find(s => s.types?.includes('Ride'));
  if (cycling?.ftp)  data.ftp  = cycling.ftp;
  if (cycling?.lthr) data.lthr = cycling.lthr;
  if (!data.weight && cycling?.weight) data.weight = cycling.weight;
  if (!data.weight && data.icu_weight) data.weight = data.icu_weight;
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
  return state.fitness;
}

/* ====================================================
   MODAL
==================================================== */
function openModal() {
  const modal = document.getElementById('connectModal');
  if (state.athleteId) document.getElementById('inputAthleteId').value = state.athleteId;
  if (state.apiKey)    document.getElementById('inputApiKey').value    = state.apiKey;
  document.getElementById('modalCloseBtn').style.display = (state.athleteId && state.apiKey) ? 'flex' : 'none';
  modal.showModal();
}

function closeModal() {
  closeModalAnimated(document.getElementById('connectModal'));
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
    await syncData(true);
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
    if (!isServerDown) {
      document.getElementById('inputAthleteId').classList.add('error');
      document.getElementById('inputApiKey').classList.add('error');
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Connect &amp; Sync`;
  }
}

/* ====================================================
   SYNC
==================================================== */
let _syncInProgress = false;

async function syncData(force = false) {
  if (_syncInProgress) return;
  _syncInProgress = true;

  if (!state.athleteId || !state.apiKey) {
    _syncInProgress = false;
    openModal();
    return;
  }

  const btn = document.getElementById('syncBtn');

  // Skip network sync if data was synced recently (< 15 min) and this
  // is an automatic page-load sync, not a manual button press.
  const CACHE_TTL = 15 * 60 * 1000; // 15 minutes
  let cache = loadActivityCache();

  // On a fresh install localStorage is empty — try local backup folder first.
  // This turns a full 90-day API sync into a cheap incremental sync.
  if (!cache && window._localLoadActivityList) {
    const localList = await _localLoadActivityList();
    if (localList) {
      try {
        localStorage.setItem('icu_activities_cache', JSON.stringify(localList.activities));
        localStorage.setItem('icu_last_sync', localList.lastSync);
      } catch(e) {}
      cache = localList;
    }
  }

  if (!force && cache && cache.activities.length > 0) {
    const ageMs = Date.now() - new Date(cache.lastSync).getTime();
    if (ageMs < CACHE_TTL) {
      // Data is fresh — just restore from cache, no API calls.
      // Don't render here — navigate() handles page rendering after syncData returns.
      state.activities = cache.activities;
      state.synced = true;
      updateConnectionUI(true);
      updateLastSyncLabel(cache.lastSync);
      _syncInProgress = false;
      return;
    }
  }

  if (btn) { btn.classList.add('btn-spinning'); btn.disabled = true; }

  try {
    if (!state.athlete) await fetchAthleteProfile();

    // FTP change detection
    if (loadFtpAlert() && state.athlete?.ftp) {
      const prevFtp = parseFloat(localStorage.getItem('icu_last_ftp') || '0');
      const curFtp = state.athlete.ftp;
      if (prevFtp > 0 && curFtp !== prevFtp) {
        const delta = curFtp - prevFtp;
        const sign = delta > 0 ? '+' : '';
        showToast(`FTP updated: ${prevFtp} → ${curFtp} W (${sign}${delta})`, delta > 0 ? 'success' : 'info');
      }
      try { localStorage.setItem('icu_last_ftp', String(curFtp)); } catch (e) { /* ignore */ }
    }

    // Decide between incremental and full sync
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
      // Silent background sync — no loading spinner for incremental updates
      if (!force && btn) { btn.classList.add('btn-spinning'); }
      else { setLoading(true, 'Checking for new activities…'); }

      // Fetch activities and fitness in parallel for incremental sync
      const [, fitOk] = await Promise.all([
        fetchActivities(null, since),
        fetchFitness().then(() => true).catch(() => false),
      ]);
      if (fitOk) { saveFitnessCache(); updateSidebarCTL(); }
    } else {
      const days = defaultSyncDays();
      setLoading(true, `Loading activities — syncing ${days} days…`);
      await fetchActivities(days);

      setLoading(true, 'Loading fitness data…');
      await fetchFitness().catch(() => null);
      saveFitnessCache();
      updateSidebarCTL();
    }

    // Save updated cache after a successful fetch
    saveActivityCache(state.activities);
    updateLastSyncLabel(new Date().toISOString());
    if (window._lbAutoBackupIfEnabled) _lbAutoBackupIfEnabled();

    // Invalidate power curve cache so it re-fetches with fresh range
    state.powerCurve = null;
    state.powerCurveRange = null;
    state.powerPageCurve = null;
    state.powerPageCurveRange = null;

    state.synced = true;
    updateConnectionUI(true);
    if (state.currentPage === 'dashboard')  renderDashboard();
    if (state.currentPage === 'activities') renderAllActivitiesList();
    if (state.currentPage === 'calendar')  { renderCalendar(); refreshCalendarEvents(); }
    if (state.currentPage === 'fitness')   renderFitnessPage();
    if (state.currentPage === 'power')     renderPowerPage();
    if (state.currentPage === 'goals')     { renderStreaksPage(); renderGoalsPage(); }

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
    const m = err.message || '';
    const msg = (m.includes('401') || m.includes('403'))
      ? 'Authentication failed. Please reconnect.'
      : (m.includes('502') || m.includes('503') || m.includes('504'))
      ? 'intervals.icu is temporarily unavailable (server error). Try again in a few minutes.'
      : (m.includes('NetworkError') || m.includes('Failed to fetch') || m.includes('CORS') || m.includes('network'))
      ? 'Can\'t reach intervals.icu — their server may be down or your connection dropped. Try again shortly.'
      : (m.includes('429'))
      ? 'Rate limited by intervals.icu. Wait a few minutes before syncing again.'
      : 'Sync failed: ' + m;
    showToast(msg, 'error');
  } finally {
    _syncInProgress = false;
    setLoading(false);
    if (btn) { btn.classList.remove('btn-spinning'); btn.disabled = false; }
  }
}

function disconnect() {
  if (!confirm('Disconnect and clear saved credentials?')) return;
  pollStop();           // stop smart polling timer
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
  const custom = localStorage.getItem('icu_avatar');
  applyAvatar(custom || _getIntervalsAvatarUrl());
}

function _getIntervalsAvatarUrl() {
  return state.athlete?.profile_medium || null;
}

function applyAvatar(src) {
  const sidebarAv  = document.getElementById('athleteAvatar');
  const previewAv  = document.getElementById('avatarPreview');
  const connAv     = document.getElementById('icuConnAvatar');
  const removeBtn  = document.getElementById('avatarRemoveBtn');
  const hasCustom  = !!localStorage.getItem('icu_avatar');
  if (src) {
    const img = `<img src="${src}" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    if (sidebarAv) { sidebarAv.innerHTML = img; sidebarAv.style.background = 'none'; }
    if (previewAv) { previewAv.innerHTML = img; previewAv.style.background = 'none'; }
    if (connAv)    { connAv.innerHTML = img; connAv.style.background = 'none'; }
    if (removeBtn) removeBtn.style.display = hasCustom ? 'inline-flex' : 'none';
  } else {
    // Revert to initials
    const aName = state.athlete ? (state.athlete.name || state.athlete.firstname || '?') : '?';
    const initial = aName[0].toUpperCase();
    if (sidebarAv) { sidebarAv.textContent = initial; sidebarAv.style.background = ''; }
    if (previewAv) { previewAv.textContent = initial; previewAv.style.background = ''; }
    if (connAv)    { connAv.textContent = initial; connAv.style.background = ''; }
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
      try { localStorage.setItem('icu_avatar', dataUrl); } catch (e) { console.warn('localStorage.setItem failed (avatar):', e); }
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
  const fallback = _getIntervalsAvatarUrl();
  applyAvatar(fallback);
  showToast(fallback ? 'Reverted to intervals.icu photo' : 'Profile photo removed', 'info');
}

// Force a full re-fetch from scratch, ignoring any cached activities.
// Useful when activities appear missing, especially on the 1-year view.
function forceFullSync() {
  if (!state.athleteId || !state.apiKey) { openModal(); return; }
  clearActivityCache();
  clearFitnessCache();
  clearLifetimeCache();
  state.activities = [];
  state.lifetimeActivities = null;
  state._lifetimeSyncDone  = false;
  showToast('Cache cleared — starting full re-sync…', 'info');
  syncData(true);
}

function confirmSyncData() {
  if (!state.athleteId || !state.apiKey) { openModal(); return; }
  showConfirmDialog(
    'Sync Data',
    'This will fetch the latest activities and fitness data from Intervals.icu.',
    () => syncData(true)
  );
}

function confirmFullResync() {
  if (!state.athleteId || !state.apiKey) { openModal(); return; }
  showConfirmDialog(
    'Full Re-sync',
    'This will clear all cached data and re-download everything from Intervals.icu. This may take a while.',
    () => forceFullSync()
  );
}

/* ====================================================
   PULL TO REFRESH — Dashboard
==================================================== */
(() => {
  const THRESHOLD = 160;
  const DEAD_ZONE = 20; // ignore small accidental drags
  let _ptrStartY = 0, _ptrDist = 0, _ptrActive = false, _ptrRefreshing = false;
  const indicator = () => document.getElementById('ptrIndicator');

  window.addEventListener('touchstart', e => {
    if (state.currentPage !== 'dashboard' || _ptrRefreshing) return;
    if (window.scrollY > 0) return;
    // Don't trigger inside scrollable containers (sidebar, modals, panels)
    const t = e.target;
    if (t.closest('.sidebar, .nav-sidebar, .modal, .modal-dialog, dialog[open], [data-scrollable]')) return;
    // Check if touch started inside any element that is itself scrolled or scrollable vertically
    let el = t;
    while (el && el !== document.body) {
      if (el.scrollTop > 0) return;
      const ov = getComputedStyle(el).overflowY;
      if ((ov === 'auto' || ov === 'scroll') && el.scrollHeight > el.clientHeight) return;
      el = el.parentElement;
    }
    _ptrStartY = e.touches[0].clientY;
    _ptrActive = true;
    _ptrDist = 0;
  }, { passive: true });

  window.addEventListener('touchmove', e => {
    if (!_ptrActive || _ptrRefreshing) return;
    _ptrDist = e.touches[0].clientY - _ptrStartY;
    if (_ptrDist < DEAD_ZONE) { _ptrDist = 0; return; }
    _ptrDist -= DEAD_ZONE; // offset so indicator starts at 0
    const el = indicator();
    if (!el) return;
    const progress = Math.min(_ptrDist / THRESHOLD, 1);
    el.classList.add('ptr-visible');
    el.style.top = (-44 + progress * 108) + 'px';
    el.querySelector('.ptr-spinner').style.transform = `rotate(${progress * 270}deg)`;
  }, { passive: true });

  window.addEventListener('touchend', () => {
    if (!_ptrActive) return;
    _ptrActive = false;
    const el = indicator();
    if (!el) return;
    if (_ptrDist >= THRESHOLD && !_ptrRefreshing) {
      _ptrRefreshing = true;
      el.classList.add('ptr-refreshing');
      el.style.top = '';
      el.querySelector('.ptr-spinner').style.transform = '';
      syncData(true).finally(() => {
        _ptrRefreshing = false;
        el.classList.remove('ptr-refreshing', 'ptr-visible');
        el.style.top = '';
      });
    } else {
      el.classList.remove('ptr-visible');
      el.style.top = '';
      el.querySelector('.ptr-spinner').style.transform = '';
    }
    _ptrDist = 0;
  }, { passive: true });
})();

/* ====================================================
   iOS SETTINGS — SUBPAGE NAVIGATION
==================================================== */
let _iosActiveSubpage = null;
const _iosSubpageNames = {
  account: 'Account', font: 'Font', maptheme: 'Map Theme',
  weather: 'Weather', icu: 'intervals.icu', strava: 'Strava',
  dashsections: 'Dashboard Sections', actsections: 'Activity Sections',
  backup: 'Backup & Restore', routebuilder: 'Route Builder',
  share: 'Share CycleIQ', donate: 'Support CycleIQ',
  defaultrange: 'Default Range'
};

function openSettingsSubpage(id) {
  const main = document.getElementById('iosSettingsMain');
  const sub  = document.getElementById('iosSubpage-' + id);
  if (!main || !sub) return;
  _iosActiveSubpage = id;
  const headline = document.querySelector('.page-headline');

  // Close any other active subpage instantly
  document.querySelectorAll('.ios-subpage.active').forEach(s => {
    s.classList.remove('active');
    s.style.display = 'none';
  });

  // Slide main + headline out to the left
  main.classList.add('ios-nav-out');
  if (headline) headline.classList.add('ios-nav-out');

  // Prepare subpage: show it off-screen right, then slide in
  sub.style.display = 'block';
  sub.offsetHeight; // force reflow
  sub.classList.add('active');

  // Hide main after transition
  setTimeout(() => { main.style.display = 'none'; }, 380);

  // Update page headline to subpage name after slide-out starts
  setTimeout(() => {
    const title = document.getElementById('pageTitle');
    const subtitle = document.getElementById('pageSubtitle');
    if (title) title.textContent = _iosSubpageNames[id] || id;
    if (subtitle) subtitle.textContent = '';
    const backBtn = document.getElementById('settingsBackBtn');
    if (backBtn) backBtn.style.display = '';
    if (headline) {
      headline.classList.add('page-headline--subpage');
      headline.classList.remove('ios-nav-out');
      headline.classList.add('ios-nav-in');
      headline.offsetHeight;
      headline.classList.remove('ios-nav-in');
    }
  }, 180);

  window.scrollTo(0, 0);
}

function closeSettingsSubpage() {
  const main = document.getElementById('iosSettingsMain');
  if (!main) return;
  const activeSub = document.querySelector('.ios-subpage.active, .ios-subpage.ios-nav-back');
  const headline = document.querySelector('.page-headline');

  // Also find subpage by _iosActiveSubpage if class-based query missed it
  const sub = activeSub || (_iosActiveSubpage ? document.getElementById('iosSubpage-' + _iosActiveSubpage) : null);

  // Slide headline out to the right with subpage
  if (headline) headline.classList.add('ios-nav-out-right');

  // Slide subpage out to the right
  if (sub) {
    sub.style.display = 'block';
    sub.classList.remove('active');
    sub.classList.add('ios-nav-back');
    setTimeout(() => {
      sub.classList.remove('ios-nav-back');
      sub.style.display = 'none';
    }, 380);
  }

  // Show main: clear inline display, remove transition class, force reflow
  main.style.display = '';
  main.classList.remove('ios-nav-out');
  main.offsetHeight; // force reflow so browser sees the state change

  // Update headline mid-transition, then slide it back in from the left
  setTimeout(() => {
    const title = document.getElementById('pageTitle');
    const subtitle = document.getElementById('pageSubtitle');
    if (title) title.textContent = 'Settings';
    if (subtitle) subtitle.textContent = 'Account & connection';
    const backBtn = document.getElementById('settingsBackBtn');
    if (backBtn) backBtn.style.display = 'none';
    if (headline) {
      headline.classList.remove('page-headline--subpage', 'ios-nav-out-right');
      headline.classList.add('ios-nav-in-left');
      headline.offsetHeight;
      headline.classList.remove('ios-nav-in-left');
    }
  }, 180);

  _iosActiveSubpage = null;
  window.scrollTo(0, 0);
}

function iosSettingsInit() {
  // Close any open subpage when entering settings
  closeSettingsSubpage();

  // Profile card
  const connected = !!(state.athleteId && state.apiKey);
  const profileName = document.getElementById('iosProfileName');
  const profileSub  = document.getElementById('iosProfileSub');
  const profileAv   = document.getElementById('iosProfileAvatar');
  if (connected && state.athlete) {
    const a = state.athlete;
    const aName = a.name || a.firstname || 'Athlete';
    if (profileName) profileName.textContent = aName;
    if (profileSub)  profileSub.textContent = 'Profile, Photo & Account';
    if (profileAv) {
      const customAvatar = localStorage.getItem('icu_avatar');
      const src = customAvatar || _getIntervalsAvatarUrl();
      if (src) profileAv.innerHTML = `<img src="${src}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
      else profileAv.textContent = aName[0].toUpperCase();
    }
  } else {
    if (profileName) profileName.textContent = 'Not Connected';
    if (profileSub)  profileSub.textContent = 'Tap to set up your account';
    if (profileAv)   profileAv.textContent = '?';
  }

  // Connection badges
  const icuBadge    = document.getElementById('iosIcuBadge');
  const icuBadgeOff = document.getElementById('iosIcuBadgeOff');
  if (icuBadge && icuBadgeOff) {
    icuBadge.style.display    = connected ? '' : 'none';
    icuBadgeOff.style.display = connected ? 'none' : '';
  }
  const stravaConnected = !!localStorage.getItem('strava_access_token');
  const stBadge    = document.getElementById('iosStravaBadge');
  const stBadgeOff = document.getElementById('iosStravaBadgeOff');
  if (stBadge && stBadgeOff) {
    stBadge.style.display    = stravaConnected ? '' : 'none';
    stBadgeOff.style.display = stravaConnected ? 'none' : '';
  }

  // Inline values
  const fontEl = document.getElementById('iosCurrentFont');
  if (fontEl) {
    const fontMap = { 'inter': 'Inter', 'dm-sans': 'DM Sans', 'outfit': 'Outfit', 'space-grotesk': 'Space Grotesk' };
    fontEl.textContent = fontMap[localStorage.getItem('icu_font') || 'inter'] || 'Inter';
  }
  const mapEl = document.getElementById('iosCurrentMapTheme');
  if (mapEl) {
    const themeMap = { 'liberty': 'Liberty', 'positron': 'Positron', 'dark': 'Dark', 'strava': 'Strava' };
    mapEl.textContent = themeMap[localStorage.getItem('icu_map_theme') || 'dark'] || 'Dark';
  }
  const wxEl = document.getElementById('iosWeatherCount');
  if (wxEl) {
    try {
      const locs = JSON.parse(localStorage.getItem('icu_wx_locations') || '[]');
      wxEl.textContent = locs.length ? locs.length + ' location' + (locs.length > 1 ? 's' : '') : 'None';
    } catch { wxEl.textContent = 'None'; }
  }
  // Default range value
  const defRangeEl = document.getElementById('iosDefRangeVal');
  if (defRangeEl) defRangeEl.textContent = (state.rangeDays || 30) + ' days';
  // Sync checkmarks
  document.querySelectorAll('.ios-row--check[data-defrange]').forEach(r =>
    r.classList.toggle('active', parseInt(r.dataset.defrange) === (state.rangeDays || 30))
  );
}

/* ====================================================
   CONNECTION UI
==================================================== */
function updateConnectionUI(connected) {
  const dot   = document.getElementById('connectionDot');
  const name  = document.getElementById('athleteName');
  const sub   = document.getElementById('athleteSub');
  const av    = document.getElementById('athleteAvatar');

  if (connected && state.athlete) {
    const a = state.athlete;
    const aName = a.name || a.firstname || 'Athlete';
    dot.className    = 'connection-dot connected';
    name.textContent = aName;
    sub.textContent  = a.city || 'intervals.icu';
    av.textContent   = aName[0].toUpperCase();
    // Custom avatar takes priority, then intervals.icu profile pic
    const customAvatar = localStorage.getItem('icu_avatar');
    applyAvatar(customAvatar || _getIntervalsAvatarUrl());
    // Update settings profile card name
    const sttName = document.getElementById('settingsAthleteName');
    if (sttName) sttName.textContent = aName;
    // iOS settings profile card
    const iosName = document.getElementById('iosProfileName');
    if (iosName) iosName.textContent = aName;
  } else {
    dot.className   = 'connection-dot disconnected';
    name.textContent = 'Not connected';
    sub.textContent  = 'Click to connect';
    av.textContent   = '?';
    const iosName = document.getElementById('iosProfileName');
    if (iosName) iosName.textContent = 'Not Connected';
  }

  // Update Import → ICU tab if panel exists
  icuRenderSyncUI();
}

function updateLifetimeCacheUI() {
  const countEl = document.getElementById('icuLifetimeCount');
  const sizeEl  = document.getElementById('icuLifetimeSize');
  const syncEl  = document.getElementById('icuLifetimeSync');
  const acts    = state.lifetimeActivities;

  const stravaOnly = acts ? acts.filter(a => a.source === 'STRAVA' && a._note).length : 0;
  const available  = acts ? acts.length - stravaOnly : 0;
  if (countEl) countEl.textContent = acts ? available.toLocaleString() + ' activities' : '—';
  const stravaRow = document.getElementById('icuStravaOnlyRow');
  const stravaEl  = document.getElementById('icuStravaOnlyCount');
  if (stravaRow && stravaEl) {
    if (stravaOnly > 0) {
      stravaRow.style.display = '';
      stravaEl.innerHTML = `${stravaOnly} <span style="font-size:.75rem;color:var(--text-muted)">(not available via API)</span>`;
    } else {
      stravaRow.style.display = 'none';
    }
  }
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
  showConfirmDialog(
    'Clear All Caches',
    'This will remove all cached data including activities, fitness, and heat map routes. The app will need to re-download everything.',
    () => {
      clearActivityCache();
      clearFitnessCache();
      clearLifetimeCache();
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith('icu_gps_pts_')) localStorage.removeItem(key);
      }
      _hmClearCache();
      // Clear offline activity IDB cache
      try { _actCacheDB().then(db => { const tx = db.transaction('items', 'readwrite'); tx.objectStore('items').clear(); }); } catch (_) {}
      _hm.allRoutes = [];
      _hm.loaded = false;
      state.lifetimeActivities = null;
      state._lifetimeSyncDone  = false;
      updateStorageBar();
      showToast('All caches cleared', 'success');
      if (state.currentPage === 'settings') navigate('settings');
    }
  );
}

function resyncLifetimeData() {
  showConfirmDialog(
    'Re-sync Lifetime Data',
    'This will clear your cached lifetime data and re-download all activities from Intervals.icu. This may take a moment.',
    () => {
      clearLifetimeCache();
      state.lifetimeActivities = null;
      state.lifetimeLastSync   = null;
      state._lifetimeSyncDone  = false;
      showToast('Syncing lifetime data…', 'success');
      runLifetimeSync();
    }
  );
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

      if (state.currentPage === 'goals') { renderStreaksPage(); renderGoalsPage(); _rIC(() => { if (window.refreshGlow) refreshGlow(); if (window.refreshBadgeTilt) refreshBadgeTilt(); }); }
      if (state.currentPage === 'activities') renderAllActivitiesList();
      if (state.currentPage === 'settings') navigate('settings');
    } catch (e) {
      console.error('Lifetime sync failed:', e);
      showToast('Lifetime sync failed: ' + (e.message || 'unknown error'), 'error');
      if (!state.lifetimeActivities) state.lifetimeActivities = state.activities || [];
      if (state.currentPage === 'goals') { renderStreaksPage(); renderGoalsPage(); _rIC(() => { if (window.refreshGlow) refreshGlow(); if (window.refreshBadgeTilt) refreshBadgeTilt(); }); }
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

/* ── Full Backup helpers (IDB read/write) ── */
async function _idbReadAll(openFn, storeName) {
  try {
    const db = await openFn();
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    return await new Promise(res => {
      const entries = [];
      const req = store.openCursor();
      req.onsuccess = e => {
        const c = e.target.result;
        if (c) { entries.push({ k: c.key, v: c.value }); c.continue(); }
        else res(entries);
      };
      req.onerror = () => res([]);
    });
  } catch (_) { return []; }
}
async function _idbWriteAll(openFn, storeName, entries, outOfLineKeys) {
  try {
    const db = await openFn();
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.clear();
    for (const e of entries) {
      if (outOfLineKeys) store.put(e.v, e.k);
      else store.put(e.v);
    }
    await new Promise(r => { tx.oncomplete = r; tx.onerror = r; });
  } catch (_) {}
}

/* ── Full Backup Export ── */
async function exportFullBackup() {
  showToast('Building full backup…', 'info');
  try {
    // 1. localStorage
    const ls = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith('icu_') || k.startsWith('strava_')) ls[k] = localStorage.getItem(k);
    }
    // 2. IndexedDB stores
    const [actcache, hmRoutes, hmMeta, strava, routes] = await Promise.all([
      _idbReadAll(_actCacheDB, 'items'),
      _idbReadAll(_hmOpenDB,   HM_STORE),
      _idbReadAll(_hmOpenDB,   HM_META_STORE),
      _idbReadAll(_stravaOpenDB, 'streams'),
      _idbReadAll(_rbOpenDB,   RB_STORE),
    ]);
    const backup = {
      version: 1,
      exported: new Date().toISOString(),
      localStorage: ls,
      indexedDB: { actcache, heatmap_routes: hmRoutes, heatmap_meta: hmMeta, strava, routes }
    };
    const json = JSON.stringify(backup);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `cycleiq-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    const sizeMB = (blob.size / (1024 * 1024)).toFixed(1);
    showToast(`Full backup exported (${sizeMB} MB)`, 'success');
  } catch (e) {
    console.error('Full backup export failed:', e);
    showToast('Backup export failed: ' + (e.message || 'unknown error'), 'error');
  }
}

/* ── Full Backup Import ── */
function importFullBackup() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        showToast('Restoring backup…', 'info');
        const backup = JSON.parse(ev.target.result);
        if (!backup.version || !backup.localStorage) {
          showToast('Invalid backup file', 'error'); return;
        }
        // 1. Restore localStorage
        const ls = backup.localStorage;
        for (const k of Object.keys(ls)) localStorage.setItem(k, ls[k]);
        // 2. Restore IndexedDB
        const idb = backup.indexedDB || {};
        await Promise.all([
          idb.actcache       ? _idbWriteAll(_actCacheDB,   'items',        idb.actcache)        : null,
          idb.heatmap_routes ? _idbWriteAll(_hmOpenDB,     HM_STORE,       idb.heatmap_routes)  : null,
          idb.heatmap_meta   ? _idbWriteAll(_hmOpenDB,     HM_META_STORE,  idb.heatmap_meta)    : null,
          idb.strava         ? _idbWriteAll(_stravaOpenDB, 'streams',      idb.strava, true)    : null,
          idb.routes         ? _idbWriteAll(_rbOpenDB,     RB_STORE,       idb.routes)          : null,
        ]);
        showToast('Backup restored — reloading…', 'success');
        setTimeout(() => location.reload(), 1200);
      } catch (err) {
        console.error('Full backup import failed:', err);
        showToast('Backup import failed: ' + (err.message || 'parse error'), 'error');
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
    Object.assign(document.body.style, {
      position: 'fixed', top: `-${_sidebarScrollY}px`,
      width: '100%', overflow: 'hidden'
    });
  } else {
    Object.assign(document.body.style, {
      position: '', top: '', width: '', overflow: ''
    });
    window.scrollTo(0, _sidebarScrollY);
  }
}

function toggleSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  const fab      = document.getElementById('floatingMenuBtn');
  const open     = sidebar.classList.toggle('open');
  backdrop.classList.toggle('open', open);
  fab?.classList.toggle('is-open', open);
  if (open) { const nav = sidebar.querySelector('.sidebar-nav'); if (nav) nav.scrollTop = 0; }
  _lockBodyScroll(open);
}

function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebarBackdrop')?.classList.remove('open');
  document.getElementById('floatingMenuBtn')?.classList.remove('is-open');
  _lockBodyScroll(false);
}

// Prevent touchmove on the backdrop — stops iOS from starting a scroll
// context on the empty area that then "steals" scroll from the sidebar.
document.addEventListener('DOMContentLoaded', () => {
  const bd = document.getElementById('sidebarBackdrop');
  if (bd) {
    bd.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  }
});

/* ====================================================
   SWIPE TO OPEN / CLOSE SIDEBAR (Mobile)
==================================================== */
const _swipe = {
  startX: 0, startY: 0,
  prevX: 0, prevT: 0,     // velocity tracking
  tracking: false,         // true once we've committed to a horizontal swipe
  direction: '',           // 'open' or 'close'
  wasOpen: false,          // sidebar state when swipe started
  sidebarW: 260,
  edgeZone: 30,            // px from left edge to start an "open" swipe
  directionLocked: false,
  velocity: 0,             // px/ms — positive = rightward
  animating: false         // true while snap animation is in flight
};

function _isMobile() { return window.innerWidth <= 700; }

/* ── helpers ── */
function _swipeCleanup(sidebar, backdrop, shouldOpen) {
  // Only toggle body scroll lock when state actually changes
  const stateChanged = shouldOpen !== _swipe.wasOpen;
  // Set class FIRST (its transform matches the inline one), then clear inline
  if (shouldOpen) {
    sidebar.classList.add('open');
    backdrop?.classList.add('open');
    document.getElementById('burgerBtn')?.classList.add('is-open');
    if (stateChanged) _lockBodyScroll(true);
    const _nav = sidebar.querySelector('.sidebar-nav');
    if (_nav) _nav.scrollTop = 0;
  } else {
    sidebar.classList.remove('open');
    backdrop?.classList.remove('open');
    document.getElementById('burgerBtn')?.classList.remove('is-open');
    if (stateChanged) _lockBodyScroll(false);
  }
  // Clear inline styles — class rules now handle visual state
  sidebar.style.transform = '';
  sidebar.style.pointerEvents = '';
  sidebar.style.transition = '';
  if (backdrop) {
    backdrop.style.opacity = '';
    backdrop.style.visibility = '';
    backdrop.style.pointerEvents = '';
    backdrop.style.transition = '';
  }
  _swipe.animating = false;
}

function _swipeReset() {
  _swipe.tracking = false;
  _swipe.direction = '';
  _swipe.velocity = 0;
  _swipe.directionLocked = false;
}

/* ── touchstart ── */
document.addEventListener('touchstart', (e) => {
  if (!_isMobile() || e.touches.length !== 1 || _swipe.animating) return;
  const x = e.touches[0].clientX;
  const sidebar = document.getElementById('sidebar');
  _swipe.startX = x;
  _swipe.startY = e.touches[0].clientY;
  _swipe.prevX = x;
  _swipe.prevT = e.timeStamp;
  _swipe.tracking = false;
  _swipe.directionLocked = false;
  _swipe.direction = '';
  _swipe.velocity = 0;
  _swipe.sidebarW = (sidebar ? sidebar.offsetWidth : 260) || 260;

  const isOpen = sidebar && sidebar.classList.contains('open');
  _swipe.wasOpen = isOpen;
  if (!isOpen && x <= _swipe.edgeZone) {
    _swipe.direction = 'open';
  } else if (isOpen) {
    _swipe.direction = 'close';
  }
}, false);

/* ── touchmove ── */
document.addEventListener('touchmove', (e) => {
  if (!_swipe.direction || e.touches.length !== 1) return;
  const x = e.touches[0].clientX;
  const y = e.touches[0].clientY;
  const dx = x - _swipe.startX;
  const dy = Math.abs(y - _swipe.startY);

  // Lock direction after small movement — if vertical, abort
  if (!_swipe.directionLocked) {
    if (Math.abs(dx) < 8 && dy < 8) return; // deadzone
    if (dy > Math.abs(dx)) { _swipe.direction = ''; return; } // vertical scroll
    _swipe.directionLocked = true;
    _swipe.tracking = true;
    // Disable sidebar CSS transition while dragging for 1:1 feel
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.style.transition = 'none';
    const backdrop = document.getElementById('sidebarBackdrop');
    if (backdrop) backdrop.style.transition = 'none';
  }

  if (!_swipe.tracking) return;
  e.preventDefault();

  // Track velocity (exponential moving average for smoothness)
  const dt = e.timeStamp - _swipe.prevT;
  if (dt > 0) {
    const instantV = (x - _swipe.prevX) / dt;
    _swipe.velocity = 0.4 * _swipe.velocity + 0.6 * instantV;
  }
  _swipe.prevX = x;
  _swipe.prevT = e.timeStamp;

  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (!sidebar) return;

  const W = _swipe.sidebarW;
  let offset; // 0 = fully closed, 1 = fully open

  if (_swipe.direction === 'open') {
    offset = Math.max(0, Math.min(1, dx / W));
  } else {
    offset = Math.max(0, Math.min(1, 1 + dx / W));
  }

  sidebar.style.transform = `translateX(${-W + offset * W}px)`;
  sidebar.style.pointerEvents = 'auto';

  if (backdrop) {
    backdrop.style.opacity = offset * 0.55;
    backdrop.style.visibility = offset > 0 ? 'visible' : 'hidden';
    backdrop.style.pointerEvents = offset > 0.1 ? 'auto' : 'none';
  }
}, { passive: false });

/* ── touchend ── */
document.addEventListener('touchend', (e) => {
  if (!_swipe.tracking) { _swipe.direction = ''; return; }

  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (!sidebar) { _swipeReset(); return; }

  const W = _swipe.sidebarW;
  const x = e.changedTouches[0].clientX;
  const dx = x - _swipe.startX;

  let offset;
  if (_swipe.direction === 'open') {
    offset = Math.max(0, Math.min(1, dx / W));
  } else {
    offset = Math.max(0, Math.min(1, 1 + dx / W));
  }

  // Decide snap direction — velocity wins for genuine quick flicks only
  const VELOCITY_THRESHOLD = 0.55; // px/ms — must be a fast flick
  const MIN_FLICK_DIST = 0.15;     // must have dragged at least 15% of sidebar width
  let shouldOpen;
  if (Math.abs(_swipe.velocity) > VELOCITY_THRESHOLD && offset > MIN_FLICK_DIST && offset < (1 - MIN_FLICK_DIST)) {
    shouldOpen = _swipe.velocity > 0; // right = open, left = close
  } else {
    shouldOpen = offset > 0.35;
  }

  const targetX = shouldOpen ? 0 : -W;

  // If already at target (tiny drag that didn't move), skip animation
  const currentX = -W + offset * W;
  if (Math.abs(currentX - targetX) < 2) {
    _swipeCleanup(sidebar, backdrop, shouldOpen);
    _swipeReset();
    return;
  }

  // Animate to final position — set transition, then set target transform
  _swipe.animating = true;
  sidebar.style.transition = 'transform 0.25s cubic-bezier(0.2, 0, 0, 1)';
  if (backdrop) backdrop.style.transition = 'opacity 0.25s ease, visibility 0.25s';

  sidebar.style.transform = `translateX(${targetX}px)`;
  sidebar.style.pointerEvents = shouldOpen ? 'auto' : '';
  if (backdrop) {
    backdrop.style.opacity = shouldOpen ? '0.55' : '0';
    backdrop.style.visibility = shouldOpen ? 'visible' : 'hidden';
    backdrop.style.pointerEvents = shouldOpen ? 'auto' : 'none';
  }

  // After transition completes, swap inline styles for CSS classes
  const onEnd = (ev) => {
    if (ev.propertyName !== 'transform') return;
    sidebar.removeEventListener('transitionend', onEnd);
    clearTimeout(fallback);
    _swipeCleanup(sidebar, backdrop, shouldOpen);
  };
  sidebar.addEventListener('transitionend', onEnd);
  const fallback = setTimeout(() => {
    sidebar.removeEventListener('transitionend', onEnd);
    _swipeCleanup(sidebar, backdrop, shouldOpen);
  }, 300);

  _swipeReset();
}, false);

/* ── touchcancel — clean up if touch is interrupted ── */
document.addEventListener('touchcancel', () => {
  if (!_swipe.tracking) { _swipe.direction = ''; return; }
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (sidebar) {
    sidebar.style.transition = '';
    sidebar.style.transform = '';
    sidebar.style.pointerEvents = '';
  }
  if (backdrop) {
    backdrop.style.transition = '';
    backdrop.style.opacity = '';
    backdrop.style.visibility = '';
    backdrop.style.pointerEvents = '';
  }
  _swipeReset();
}, false);

/* ── Disable pinch-to-zoom everywhere EXCEPT Leaflet maps ── */
function _isOnMap(e) {
  return e.target && e.target.closest && e.target.closest('.leaflet-container');
}

// 1) Block multi-touch — capture phase on window, fires before everything
window.addEventListener('touchstart', function(e) {
  if (e.touches.length > 1 && !_isOnMap(e)) e.preventDefault();
}, { passive: false, capture: true });

window.addEventListener('touchmove', function(e) {
  if (e.touches.length > 1 && !_isOnMap(e)) e.preventDefault();
}, { passive: false, capture: true });

// 2) Safari proprietary gesture events
['gesturestart', 'gesturechange', 'gestureend'].forEach(function(evt) {
  window.addEventListener(evt, function(e) {
    if (!_isOnMap(e)) e.preventDefault();
  }, { passive: false, capture: true });
});

// 3) Strip inline touch-action styles that Hammer.js / chart-zoom may inject
//    (these override CSS !important because they're inline)
(function() {
  const mo = new MutationObserver(function(mutations) {
    mutations.forEach(function(m) {
      if (m.type === 'attributes' && m.attributeName === 'style') {
        const el = m.target;
        if (el.closest && el.closest('.leaflet-container')) return;
        const ta = el.style.touchAction;
        if (ta && ta !== 'pan-x pan-y') {
          el.style.touchAction = 'pan-x pan-y';
        }
      }
    });
  });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style'], subtree: true });
})();

// 4) Last resort: if iOS Safari still zooms, snap viewport scale back to 1
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', function() {
    if (window.visualViewport.scale > 1.01) {
      document.body.style.zoom = (1 / window.visualViewport.scale);
      requestAnimationFrame(function() {
        document.body.style.zoom = '';
      });
    }
  });
}

function navigate(page) {
  // Route Builder: confirm before leaving if there's an unsaved route
  if (state.currentPage === 'routes' && page !== 'routes' && _rb.waypoints.length > 0) {
    _rbConfirmLeave(page);
    return;
  }

  // Exit fullscreen mode if leaving route builder
  document.body.classList.remove('rb-fullscreen');

  // Close dashboard FAB menu if open
  if (window._dashFabExpanded && typeof _closeDashFab === 'function') {
    _closeDashFab();
  }

  // Abort any in-flight API requests from the previous page
  _navAbort?.abort();
  _navAbort = new AbortController();

  // Detect returning to activities list from activity detail (to restore scroll)
  const _restoreActScroll = (page === 'activities' && state.currentPage === 'activity' && window._actListScrollRestore);

  // Reset scroll position (skip when returning to activities — restored below)
  if (!_restoreActScroll) window.scrollTo(0, 0);

  // Close any open dialogs when navigating away
  document.querySelectorAll('dialog[open]').forEach(d => closeModalAnimated(d));

  // Clean up charts from the page we're leaving to free memory
  if (state.currentPage) cleanupPageCharts(state.currentPage);

  // Clear scroll restore if navigating anywhere other than activities→activity round-trip
  if (!_restoreActScroll) window._actListScrollRestore = null;

  state.previousPage = state.currentPage;
  state.currentPage  = page;
  try { sessionStorage.setItem('icu_route', JSON.stringify({ type: 'page', page })); } catch {}

  // Update pill nav active state + visibility
  const _pillNav = document.getElementById('dashPillNav');
  const _pillHidePages = new Set(['settings', 'routes', 'workout', 'activity']);
  if (_pillNav) {
    _pillNav.style.display = _pillHidePages.has(page) ? 'none' : '';
  }

  // Show/hide global FABs based on current page
  const _calFab = document.getElementById('calFab');
  const _actFab = document.getElementById('actSearchFab');
  const _dashFab = document.getElementById('dashRouteFab');
  if (_calFab) _calFab.style.display = page === 'calendar' ? '' : 'none';
  if (_actFab) _actFab.style.display = page === 'activities' ? '' : 'none';
  if (_dashFab) _dashFab.style.display = page === 'dashboard' ? '' : 'none';
  document.querySelectorAll('.dash-pill-btn').forEach(btn => {
    const lbl = btn.querySelector('span')?.textContent?.toLowerCase() || '';
    const match = lbl === page || (lbl === 'home' && page === 'dashboard');
    btn.classList.toggle('active', match);
  });

  // ── Prepare page-specific UI BEFORE the swap so nothing flashes ──
  const info = {
    dashboard:  ['Summary', `Overview · Last ${state.rangeDays} days`],
    activities: ['Activities',     ''],
    calendar:   ['Calendar',       'Planned workouts & events'],
    fitness:    ['Fitness',        'CTL · ATL · TSB history'],
    power:      ['Power Curve',    'Best efforts across durations'],
    zones:      ['Training Zones', 'Time in zone breakdown'],
    compare:    ['Compare',        'Compare metrics across time periods'],
    heatmap:    ['Heat Map',       'All your rides on one map'],
    import:     ['Import',         'Upload .FIT files from Garmin, Wahoo & more'],
    goals:      ['Goals & Streaks', 'Training targets, streaks & lifetime stats'],
    weather:    ['Weather',        'Weekly forecast & riding conditions'],
    settings:   ['Settings',       'Account & connection'],
    workout:    ['Create Workout', 'Build & export custom cycling workouts'],
    guide:      ['Training Guide', 'Understanding CTL · ATL · TSB & training load'],
    gear:       ['Gear & Service', 'Bikes, components, batteries & service tracking'],
    routes:     ['Route Builder',  'Plan & build cycling routes'],
  };
  const [title, sub] = info[page] || ['CycleIQ', ''];
  document.getElementById('pageTitle').textContent    = title;
  document.getElementById('pageSubtitle').textContent = sub;

  // Headline — hidden for calendar & routes
  const headline = document.querySelector('.page-headline');
  if (headline) {
    if (page === 'calendar' || page === 'routes') headline.classList.add('page-headline--hidden');
    else headline.classList.remove('page-headline--hidden');
  }

  // Full-bleed pages — toggle padding-less mode
  const pc = document.getElementById('pageContent');
  if (pc) {
    pc.classList.toggle('page-content--calendar', page === 'calendar');
    pc.classList.toggle('page-content--heatmap', page === 'heatmap');
    pc.classList.toggle('page-content--routes', page === 'routes');
    pc.classList.toggle('page-content--has-pill', page === 'dashboard' || page === 'zones' || page === 'power' || page === 'fitness');
  }

  // Floating range pill visibility
  const pill = document.getElementById('dateRangePill');
  if (pill) {
    pill.style.display = (page === 'dashboard') ? 'flex' : 'none';
    if (page === 'dashboard') {
      const activeBtn = pill.querySelector('button.active');
      if (activeBtn) requestAnimationFrame(() => activeBtn.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'instant' }));
    }
  }
  const zonePill = document.getElementById('zoneRangePill');
  if (zonePill) {
    zonePill.style.display = (page === 'zones') ? 'flex' : 'none';
    if (page === 'zones') {
      const ab = zonePill.querySelector('button.active');
      if (ab) requestAnimationFrame(() => ab.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'instant' }));
    }
  }
  const pwrPill = document.getElementById('pwrRangePillTopbar');
  if (pwrPill) {
    pwrPill.style.display = (page === 'power') ? 'flex' : 'none';
    if (page === 'power') {
      const ab = pwrPill.querySelector('button.active');
      if (ab) requestAnimationFrame(() => ab.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'instant' }));
    }
  }
  const fitPill = document.getElementById('fitRangePillFloat');
  if (fitPill) {
    fitPill.style.display = (page === 'fitness') ? 'flex' : 'none';
    if (page === 'fitness') {
      const ab = fitPill.querySelector('button.active');
      if (ab) requestAnimationFrame(() => ab.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'instant' }));
    }
  }
  // Toggle scroll edge gradient for pages with floating pills
  const _pillPages = ['dashboard', 'zones', 'power', 'fitness'];
  document.getElementById('pageContent')?.classList.toggle('has-scroll-edge', _pillPages.includes(page));

  // Swap active page — use View Transitions API for smooth cross-fade if available
  const _swapPage = () => {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('page-' + page)?.classList.add('active');
    document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  };
  const _skipTransition = page === 'calendar' || page === 'routes' || state.previousPage === 'calendar' || state.previousPage === 'routes';
  if (document.startViewTransition && state.previousPage && state.previousPage !== page && !_skipTransition) {
    document.startViewTransition(_swapPage);
  } else {
    _swapPage();
  }

  if (page === 'dashboard') { applyDashSectionVisibility(); }
  if (page === 'settings') { renderDashSectionToggles(); renderActSectionToggles(); }

  if (page === 'dashboard' && state.synced) {
    const rail = document.getElementById('recentActScrollRail');
    if (rail) rail.scrollLeft = 0;
    renderDashboard();
  }
  if (page === 'calendar') { renderCalendar(); refreshCalendarEvents(); }
  if (page === 'fitness')  renderFitnessPage();
  if (page === 'power')    renderPowerPage();
  if (page === 'zones')    renderZonesPage();
  if (page === 'compare')  { ensureLifetimeLoaded(); renderComparePage(); }
  if (page === 'heatmap')  { ensureLifetimeLoaded(); renderHeatmapPage(); }
  if (page === 'goals')    { renderStreaksPage(); renderGoalsPage(); }
  if (page === 'workout')  { wrkRefreshStats(); wrkRender(); }
  if (page === 'settings') {
    iosSettingsInit();
    initWeatherLocationUI();
    initMapThemePicker();
    icuRenderSyncUI();
    stravaRenderSyncUI();
    updateStorageBar();
    updateLifetimeCacheUI();
    offlineSyncInitUI();
    pollRestore();
    rlUpdateUI();
    _rlStartTick();
    if (window._lbInit) _lbInit();
  } else {
    _rlStopTick();
  }
  if (page === 'activities') {
    ensureLifetimeLoaded();
    if (state.synced) renderAllActivitiesList();
    requestAnimationFrame(_updateActStickyTop);
    const tb = document.querySelector('#page-activities .acts-toolbar');
    if (tb) tb.classList.remove('acts-toolbar--hidden');
    _actScroll.lastY = window.scrollY;
  }
  if (page === 'weather')  renderWeatherPage();
  if (page === 'gear')     renderGearPage();
  if (page === 'guide')    renderGuidePage();
  if (page === 'import')   { initImportPage(); }
  if (page === 'routes')   renderRouteBuilderPage();
  // Legacy: redirect old streaks/wellness routes to merged goals page
  if (page === 'wellness' || page === 'streaks') { navigate('goals'); return; }

  // Upgrade all native selects to custom dropdowns
  requestAnimationFrame(() => initCustomDropdowns());
  _rIC(() => { if (window.refreshGlow) refreshGlow(); if (window.refreshBadgeTilt) refreshBadgeTilt(); });

  // Restore scroll position when returning to activities from activity detail
  if (_restoreActScroll) {
    const _r = window._actListScrollRestore;
    window._actListScrollRestore = null;
    // Ensure enough rows are loaded to cover the previous scroll depth
    const _ls = window._actListState?.allActivityList;
    if (_ls && _ls.cursor < _r.cursor) {
      while (_ls.cursor < _r.cursor && _ls.cursor < _ls.filtered.length) {
        _actListLoadMore('allActivityList');
      }
    }
    requestAnimationFrame(() => {
      // Restore scroll, then ensure the clicked row is visible
      window.scrollTo(0, _r.scrollY);
      if (_r.actId) {
        const row = document.querySelector(`.activity-row[data-act-id="${_r.actId}"]`);
        if (row) {
          // If row drifted out of view, scroll it into center
          const rect = row.getBoundingClientRect();
          if (rect.top < 0 || rect.bottom > window.innerHeight) {
            row.scrollIntoView({ block: 'center' });
          }
          row.classList.add('act-row--highlight');
          setTimeout(() => row.classList.remove('act-row--highlight'), 2500);
        }
      }
    });
  } else {
    window.scrollTo(0, 0);
    requestAnimationFrame(() => window.scrollTo(0, 0));
  }
}

/* ====================================================
   UNITS  (metric / imperial)
==================================================== */
function loadUnits() {
  state.units = localStorage.getItem('icu_units') || 'metric';
}

/* ── Weather location (manual city setting) ─────────────────────────────── */
let _wxSearchTimer = null;
function _initWxAutocomplete() {
  const input = document.getElementById('wxCityInput');
  if (!input || input._wxAcInit) return;
  input._wxAcInit = true;
  input.addEventListener('input', () => {
    clearTimeout(_wxSearchTimer);
    const q = (input.value || '').trim();
    if (q.length < 2) { _hideWxSuggestions(); return; }
    _wxSearchTimer = setTimeout(() => _fetchWxSuggestions(q), 300);
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') _hideWxSuggestions();
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.wx-search-wrap')) _hideWxSuggestions();
  });
}
async function _fetchWxSuggestions(query) {
  const box = document.getElementById('wxSuggestions');
  if (!box) return;
  try {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`);
    if (!res.ok) return;
    const data = await res.json();
    if (!data.results?.length) { box.innerHTML = '<div class="wx-sug-empty">No results</div>'; box.classList.add('active'); return; }
    box.innerHTML = data.results.map(r => {
      const label = [r.name, r.admin1, r.country].filter(Boolean).join(', ');
      return `<button class="wx-sug-item" data-lat="${r.latitude}" data-lng="${r.longitude}" data-label="${label.replace(/"/g, '&quot;')}">${label}</button>`;
    }).join('');
    box.classList.add('active');
    box.querySelectorAll('.wx-sug-item').forEach(btn => {
      btn.addEventListener('click', () => _selectWxSuggestion(btn));
    });
  } catch (_) {}
}
function _selectWxSuggestion(btn) {
  const lat = parseFloat(btn.dataset.lat);
  const lng = parseFloat(btn.dataset.lng);
  const label = btn.dataset.label;
  addWxLocation(lat, lng, label);
  const statusEl = document.getElementById('wxCurrentLocation');
  if (statusEl) statusEl.textContent = `${getWxLocations().length} / ${WX_MAX_LOCATIONS} locations`;
  const input = document.getElementById('wxCityInput');
  if (input) input.value = '';
  _hideWxSuggestions();
}
function _hideWxSuggestions() {
  const box = document.getElementById('wxSuggestions');
  if (box) { box.classList.remove('active'); box.innerHTML = ''; }
}

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
    _hideWxSuggestions();
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
  try {
    localStorage.setItem('icu_wx_locations', JSON.stringify(locs));
    // Keep icu_wx_coords in sync with the active location (backward compat)
    const active = locs.find(l => l.active);
    if (active) {
      localStorage.setItem('icu_wx_coords', JSON.stringify({ lat: active.lat, lng: active.lng, city: active.city }));
    } else {
      localStorage.removeItem('icu_wx_coords');
    }
  } catch (e) { console.warn('localStorage.setItem failed (wx locations):', e); }
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
  if (state.currentPage === 'weather') {
    renderWeatherPage(window.scrollY);
  }
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
  _initWxAutocomplete();
  const list = document.getElementById('wxLocationsList');
  if (!list) return;
  const locs = getWxLocations();
  if (!locs.length) {
    list.innerHTML = '<div class="ios-row"><span class="ios-row-label" style="color:var(--text-muted)">No locations added</span></div>';
    return;
  }
  list.innerHTML = locs.map(l => `
    <div class="ios-row" onclick="setActiveWxLocation(${l.id})" style="cursor:pointer">
      <span class="wx-loc-dot${l.active ? ' wx-loc-dot--on' : ''}"></span>
      <span class="ios-row-label">${l.city}</span>
      <button class="wx-loc-remove btn btn-ghost btn-sm" onclick="event.stopPropagation();removeWxLocation(${l.id})" title="Remove">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--text-muted)" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  `).join('');
  // Update the status label
  const statusEl = document.getElementById('wxCurrentLocation');
  if (statusEl) statusEl.textContent = `${locs.length} / ${WX_MAX_LOCATIONS} locations`;
}

function renderWxLocationSwitcher() {
  const locs = getWxLocations();
  if (locs.length === 0) return '';
  let wxCodes = {};
  try { wxCodes = JSON.parse(localStorage.getItem('icu_wx_today_codes') || '{}'); } catch (_) {}
  return `
    <div class="wx-loc-switcher">
      ${locs.map(l => {
        const code = wxCodes[l.id];
        const icon = code != null
          ? `<span class="wx-pill-icon">${wmoIcon(code)}</span>`
          : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M12 2a7 7 0 0 1 7 7c0 5.25-7 13-7 13S5 14.25 5 9a7 7 0 0 1 7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>`;
        return `<button class="wx-loc-pill${l.active ? ' wx-loc-pill--active' : ''}" onclick="setActiveWxLocation(${l.id})">
          ${icon}
          ${l.city}
        </button>`;
      }).join('')}
      <button class="wx-loc-pill wx-loc-pill--add" onclick="navigate('settings')" title="Add location">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
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

  // Restore FTP alert toggle
  const ftpT = document.getElementById('ftpAlertToggle');
  if (ftpT) ftpT.checked = loadFtpAlert();
}

function setWeatherModel(model) {
  try { localStorage.setItem('icu_wx_model', model); } catch (e) { console.warn('localStorage.setItem failed:', e); }
  // Clear cached forecasts so next load uses the new model
  localStorage.removeItem('icu_wx_forecast');
  localStorage.removeItem('icu_wx_forecast_ts');
  localStorage.removeItem('icu_wx_page');
  localStorage.removeItem('icu_wx_page_ts');
  showToast(`Weather model set to: ${model}`, 'success');
}

function setUnits(units) {
  state.units = units;
  try { localStorage.setItem('icu_units', units); } catch (e) { console.warn('localStorage.setItem failed:', e); }
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
  try { localStorage.setItem('icu_week_start_day', day); } catch (e) { console.warn('localStorage.setItem failed:', e); }
  // Sync toggle buttons in settings
  document.querySelectorAll('[data-weekstart]').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.weekstart) === day);
  });
  // Re-render all week-dependent views
  if (state.synced) {
    renderWeekProgress();
    renderFitnessStreak();
  }
  if (state.currentPage === 'calendar') { renderCalendar(); refreshCalendarEvents(); }
}

function rangeLabel(days) {
  return days === 365 ? 'Last year' : `Last ${days} days`;
}

function setRange(days) {
  state.rangeDays = days;
  try { localStorage.setItem('icu_range_days', days); } catch (e) { console.warn('localStorage.setItem failed:', e); }
  // Sync topbar pill
  document.querySelectorAll('#dateRangePill button').forEach(b => b.classList.remove('active'));
  const _rangeBtn = document.getElementById('range' + days);
  if (_rangeBtn) {
    _rangeBtn.classList.add('active');
    _rangeBtn.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }
  // Sync settings default-range checkmarks
  document.querySelectorAll('.ios-row--check[data-defrange]').forEach(r =>
    r.classList.toggle('active', parseInt(r.dataset.defrange) === days)
  );
  // Update main settings row value label
  const defLabel = document.getElementById('iosDefRangeVal');
  if (defLabel) defLabel.textContent = days + ' days';
  // Update Training Load card range label
  const lbl = document.getElementById('fitnessRangeLabel');
  if (lbl) lbl.textContent = rangeLabel(days);
  if (state.synced) noChartAnim(() => renderDashboard());
}

/* ====================================================
   MERGED ACTIVITY POOL  (recent + lifetime, deduped)
   Used by the Activities page so it lists everything.
==================================================== */
function getAllActivities() {
  const recent   = state.activities   || [];
  const lifetime = state.lifetimeActivities || [];
  const map = new Map();
  if (lifetime.length) {
    lifetime.forEach(a => { const id = a.id || a.icu_id; if (id) map.set(id, a); });
  }
  recent.forEach(a => { const id = a.id || a.icu_id; if (id) map.set(id, a); }); // overwrites lifetime
  // Merge locally imported FIT activities
  try {
    const fitImports = JSON.parse(localStorage.getItem('icu_fit_activities') || '[]');
    fitImports.forEach(a => { if (a.id && !map.has(a.id)) map.set(a.id, a); });
  } catch (_) {}
  // Merge Strava imported activities
  try {
    const stravaImports = JSON.parse(localStorage.getItem('icu_strava_activities') || '[]');
    stravaImports.forEach(a => { if (a.id && !map.has(a.id)) map.set(a.id, a); });
  } catch (_) {}
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

/* ── Apple-style Activity Search Modal ── */
let _actSearchDebounce = null;

function openActivitySearch() {
  const modal = document.getElementById('actSearchModal');
  if (!modal) return;
  document.body.style.overflow = 'hidden';
  modal.showModal();
  const input = document.getElementById('actSearchInput');
  if (input) {
    input.value = '';
    setTimeout(() => input.focus(), 100);
  }
  const clearBtn = document.getElementById('actSearchClear');
  if (clearBtn) clearBtn.classList.remove('visible');
  document.getElementById('actSearchResults').innerHTML =
    '<div class="act-search-empty">Type to search all activities</div>';
}

function closeActivitySearch() {
  const modal = document.getElementById('actSearchModal');
  document.body.style.overflow = '';
  if (modal) closeModalAnimated(modal);
}

function clearActivitySearch() {
  const input = document.getElementById('actSearchInput');
  if (input) { input.value = ''; input.focus(); }
  document.getElementById('actSearchClear')?.classList.remove('visible');
  document.getElementById('actSearchResults').innerHTML =
    '<div class="act-search-empty">Type to search all activities</div>';
}

function _onActivitySearchInput(e) {
  const q = e.target.value.trim();
  const clearBtn = document.getElementById('actSearchClear');
  if (clearBtn) clearBtn.classList.toggle('visible', q.length > 0);

  clearTimeout(_actSearchDebounce);
  if (!q) {
    document.getElementById('actSearchResults').innerHTML =
      '<div class="act-search-empty">Type to search all activities</div>';
    return;
  }
  _actSearchDebounce = setTimeout(() => _runActivitySearch(q), 150);
}

function _runActivitySearch(q) {
  const lower = q.toLowerCase();
  const all = getAllActivities().filter(a => !isEmptyActivity(a));
  const matches = all.filter(a => {
    const name = (a.name || a.icu_name || '').toLowerCase();
    const type = (a.sport_type || a.type || a.icu_sport_type || '').toLowerCase();
    return name.includes(lower) || type.includes(lower);
  }).sort((a, b) => {
    const da = new Date(a.start_date_local || a.start_date).getTime();
    const db = new Date(b.start_date_local || b.start_date).getTime();
    return db - da;
  });

  const container = document.getElementById('actSearchResults');
  if (!matches.length) {
    container.innerHTML = '<div class="act-search-empty">No activities found</div>';
    return;
  }

  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  let html = `<div class="act-search-count">${matches.length} result${matches.length !== 1 ? 's' : ''}</div>`;
  const limit = Math.min(matches.length, 50);
  for (let i = 0; i < limit; i++) {
    const a = matches[i];
    const rawName = (a.name && a.name.trim()) ? a.name.trim() : activityFallbackName(a);
    const { title: name } = cleanActivityName(rawName);
    const d = new Date(a.start_date_local || a.start_date);
    const dateStr = `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
    const type = a.sport_type || a.type || '';
    const dist = actVal(a, 'distance', 'icu_distance') / 1000;
    const secs = actVal(a, 'moving_time', 'elapsed_time', 'icu_moving_time', 'icu_elapsed_time', 'total_elapsed_time');
    const sub = [dateStr, type, dist > 0.05 ? dist.toFixed(1) + ' km' : '', secs > 0 ? fmtDur(secs) : ''].filter(Boolean).join(' · ');
    const tc = activityTypeClass(a);
    const icon = activityTypeIcon(a);
    // Store in lookup for navigation
    const key = '_search_' + i;
    window._actLookup[key] = a;
    html += `<div class="act-search-row" onclick="navigateToActivity('${key}');closeActivitySearch()">
      <div class="act-search-row-icon ${tc}">${icon}</div>
      <div class="act-search-row-info">
        <div class="act-search-row-name">${name}</div>
        <div class="act-search-row-sub">${sub}</div>
      </div>
      <div class="act-search-row-chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></div>
    </div>`;
  }
  if (matches.length > 50) {
    html += `<div class="act-search-empty" style="padding:16px 0;font-size:13px">Showing first 50 of ${matches.length} results</div>`;
  }
  container.innerHTML = html;
}

// Wire up the search input listener
document.addEventListener('DOMContentLoaded', () => {
  const inp = document.getElementById('actSearchInput');
  if (inp) inp.addEventListener('input', _onActivitySearchInput);
});

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
  const sportOrder = ['all', 'outdoor', 'indoor'];
  const idx = sportOrder.indexOf(state.activitiesSportFilter || 'all');
  document.querySelectorAll('[data-sport]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.sport === state.activitiesSportFilter);
  });
  const seg = document.getElementById('actsTypeSegmented');
  if (seg) seg.dataset.active = String(Math.max(0, idx));
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

function _cleanupCardGrid(containerId) {
  const gs = window._actCardGridState[containerId];
  if (!gs) return;
  if (gs.observer) gs.observer.disconnect();
  if (gs.mapObserver) gs.mapObserver.disconnect();
  gs.mapQueue = [];
  gs.mapActive = 0;
  (gs.maps || []).forEach(m => { try { m.remove(); } catch (_) {} });
  gs.maps = [];
  window._actCardGridState[containerId] = null;
}

const CARD_MAP_CONC = 2; // max simultaneous map renders

function _ensureCardMapObserver(containerId) {
  const ls = window._actCardGridState[containerId];
  if (!ls || ls.mapObserver) return;

  ls.mapObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const mapEl = entry.target;
      ls.mapObserver.unobserve(mapEl);
      // Queue it for rendering
      ls.mapQueue.push(mapEl);
    }
    _drainCardMapQueue(containerId);
  }, { rootMargin: '200px 0px' }); // start loading 200px before visible
}

function _drainCardMapQueue(containerId) {
  const ls = window._actCardGridState[containerId];
  if (!ls) return;
  while (ls.mapQueue.length > 0 && ls.mapActive < CARD_MAP_CONC) {
    const mapEl = ls.mapQueue.shift();
    const a = mapEl._activity;
    const idx = parseInt(mapEl.dataset.actIdx, 10);
    if (!a) continue;
    ls.mapActive++;
    renderRecentActCardMap(a, idx, 'actGridCard', ls.maps)
      .catch(() => {})
      .finally(() => {
        if (!window._actCardGridState[containerId]) return;
        ls.mapActive--;
        _drainCardMapQueue(containerId);
      });
  }
}

function setActivitiesView(mode) {
  state.activitiesView = mode;
  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === mode);
  });
  const listEl  = document.getElementById('allActivityList');
  const gridEl  = document.getElementById('allActivityCardGrid');
  const zonesEl = document.getElementById('allActivityZonesGrid');
  if (listEl)  listEl.style.display  = mode === 'list'  ? '' : 'none';
  if (gridEl)  gridEl.style.display  = mode === 'card'  ? '' : 'none';
  if (zonesEl) zonesEl.style.display = mode === 'zones' ? '' : 'none';

  // Clean up card grid maps when switching away to free WebGL contexts
  if (mode !== 'card') _cleanupCardGrid('allActivityCardGrid');

  renderAllActivitiesList();
}

function renderAllActivitiesList() {
  // Sync segmented control indicator
  _updateSportButtons();
  const sorted = sortedAllActivities();
  // Count placeholder activities (planned workouts never completed — all metrics zero).
  let allPool = getAllActivities().filter(a => !!(a.start_date_local || a.start_date));
  if (state.activitiesYear !== null) {
    allPool = allPool.filter(a => {
      const d = new Date(a.start_date_local || a.start_date);
      return d.getFullYear() === state.activitiesYear;
    });
  }
  const emptyCount = allPool.filter(a => isEmptyActivity(a)).length;

  const pageSub = document.getElementById('pageSubtitle');
  if (pageSub && state.currentPage === 'activities') {
    let text = `${sorted.length} ${sorted.length === 1 ? 'activity' : 'activities'}`;
    if (emptyCount > 0) text += ` · ${emptyCount} without data`;
    pageSub.textContent = text;
  }

  if (state.activitiesView === 'card') {
    renderActivityCardGrid('allActivityCardGrid', sorted);
  } else if (state.activitiesView === 'zones') {
    renderActivityZonesView('allActivityZonesGrid', sorted);
  } else {
    renderActivityList('allActivityList', sorted);
  }

  _refreshYearDropdown();
  _updateActStickyTop();
  _initActToolbarScroll();
}

/* ── Activity card grid (reuses recent-act card design) ── */
window._actCardGridState = {};
const ACT_CARD_GRID_BATCH = 12;
// In-memory + persistent cache of card map snapshots keyed by `${actId}_${theme}`
const _cardMapImgCache = new Map();
const _CARD_MAP_CACHE_NAME = 'icu-card-map-snaps-v2';
const _CARD_MAP_MAX = 120; // max snapshots to keep on disk

async function _cardMapCacheSave(key, dataUrl) {
  _cardMapImgCache.set(key, dataUrl);
  try {
    const c = await caches.open(_CARD_MAP_CACHE_NAME);
    await c.put(`/_snap/${key}`, new Response(dataUrl));
    // Prune if over limit
    const keys = await c.keys();
    if (keys.length > _CARD_MAP_MAX) {
      for (let i = 0; i < keys.length - _CARD_MAP_MAX; i++) c.delete(keys[i]);
    }
  } catch (_) {}
}

async function _cardMapCacheLoad(key) {
  // Check in-memory first
  if (_cardMapImgCache.has(key)) return _cardMapImgCache.get(key);
  // Check persistent cache
  try {
    const c = await caches.open(_CARD_MAP_CACHE_NAME);
    const resp = await c.match(`/_snap/${key}`);
    if (resp) {
      const dataUrl = await resp.text();
      _cardMapImgCache.set(key, dataUrl); // promote to memory
      return dataUrl;
    }
  } catch (_) {}
  return null;
}

function renderActivityCardGrid(containerId, activities) {
  const el = document.getElementById(containerId);
  const filtered = (activities || []).filter(a => !isEmptyActivity(a));

  // Clean up previous maps + observer
  const prev = window._actCardGridState[containerId];
  if (prev) {
    if (prev.observer) prev.observer.disconnect();
    (prev.maps || []).forEach(m => { try { m.remove(); } catch (_) {} });
  }

  if (!filtered.length) {
    el.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg><p>No activities in this period.</p></div>`;
    window._actCardGridState[containerId] = null;
    return;
  }

  window._actCardGridState[containerId] = {
    el, filtered, cursor: 0, observer: null, lastMonth: null, maps: [],
    idCounter: 0, mapObserver: null, mapQueue: [], mapActive: 0,
  };

  el.innerHTML = '';
  _actCardGridLoadMore(containerId);
}

function _actCardGridLoadMore(containerId) {
  const ls = window._actCardGridState[containerId];
  if (!ls || ls.cursor >= ls.filtered.length) return;

  const MONTH_NAMES = ['January','February','March','April','May','June',
    'July','August','September','October','November','December'];

  const end = Math.min(ls.cursor + ACT_CARD_GRID_BATCH, ls.filtered.length);
  let html = '';
  const batchStart = ls.idCounter;

  for (let i = ls.cursor; i < end; i++) {
    const a = ls.filtered[i];
    const d = new Date(a.start_date_local || a.start_date);
    const monthKey = d.getFullYear() + '-' + d.getMonth();
    if (monthKey !== ls.lastMonth) {
      ls.lastMonth = monthKey;
      const label = MONTH_NAMES[d.getMonth()] + ' ' + d.getFullYear();
      html += `<div class="act-month-divider"><span class="act-month-label">${label}</span></div>`;
    }
    html += buildRecentActCardHTML(a, ls.idCounter, 'actGridCard');
    ls.idCounter++;
  }

  // Remove old sentinel
  const oldSentinel = ls.el.querySelector('.act-list-sentinel');
  if (oldSentinel) oldSentinel.remove();

  ls.el.insertAdjacentHTML('beforeend', html);

  // Wire click handlers + lazy map observer for this batch
  let mapIdx = batchStart;
  for (let i = ls.cursor; i < end; i++) {
    const a = ls.filtered[i];
    const card = document.getElementById(`actGridCard_${mapIdx}`);
    if (card) card.onclick = () => navigateToActivity(a);

    // Register map container for lazy loading
    const mapEl = document.getElementById(`actGridCardMap_${mapIdx}`);
    if (mapEl) {
      mapEl.dataset.actIdx = mapIdx;
      mapEl.dataset.actId = a.id || a.icu_activity_id;
      mapEl._activity = a;  // keep reference for lazy loader
      _ensureCardMapObserver(containerId);
      ls.mapObserver.observe(mapEl);
    }
    mapIdx++;
  }
  ls.cursor = end;

  // Sentinel for infinite scroll
  if (ls.cursor < ls.filtered.length) {
    const sentinel = document.createElement('div');
    sentinel.className = 'act-list-sentinel';
    ls.el.appendChild(sentinel);

    if (ls.observer) ls.observer.disconnect();
    ls.observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        ls.observer.disconnect();
        _actCardGridLoadMore(containerId);
      }
    }, { rootMargin: '300px' });
    ls.observer.observe(sentinel);
  }
}

/* ── Activity zones view (intervals bar graph cards) ── */
window._actZonesState = {};
const ACT_ZONES_BATCH = 12;

function buildZonesCardHTML(a, idx) {
  const rawName = (a.name && a.name.trim()) ? a.name.trim() : (a.icu_name || 'Activity');
  const { title: name, platformTag } = cleanActivityName(rawName);
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
  const tss   = actVal(a, 'icu_training_load', 'tss');
  const watts = actVal(a, 'icu_weighted_avg_watts', 'average_watts', 'icu_average_watts');
  const hr    = actVal(a, 'average_heartrate', 'icu_average_heartrate');

  const dFmt = dist > 0 ? fmtDist(dist) : null;

  const tssClass = tss >= 250 ? 'ra-tss--extreme' : tss >= 150 ? 'ra-tss--hard' : tss >= 100 ? 'ra-tss--moderate' : tss >= 50 ? 'ra-tss--easy' : '';
  const tssBadge = tss > 0
    ? `<span class="ra-tss-badge ${tssClass}">${Math.round(tss)} TSS</span>`
    : '';

  const statItems = [
    watts > 0 && { val: Math.round(watts) + 'w', lbl: 'Power' },
    hr    > 0 && { val: Math.round(hr),          lbl: 'Avg HR' },
    secs  > 0 && { val: fmtDur(secs),            lbl: 'Time' },
    dFmt      && { val: dFmt.val + ' ' + dFmt.unit, lbl: 'Distance' },
  ].filter(Boolean);

  const statsHTML = statItems.map(s =>
    `<div class="ra-stat">
      <div class="ra-stat-val">${s.val}</div>
      <div class="ra-stat-lbl">${s.lbl}</div>
    </div>`
  ).join('');

  const badgesHTML = (tssBadge || platformTag)
    ? `<div class="zones-card-badges">${tssBadge}${platformTag ? `<span class="act-platform-tag">${platformTag}</span>` : ''}</div>`
    : '';

  return `<div class="card card--clickable zones-card" id="zonesCard_${idx}">
    <div class="zones-card-header">
      <div class="zones-card-date">${dateFmt}${timeFmt ? ' · ' + timeFmt : ''}</div>
      <div class="zones-card-name">${name}</div>
      ${badgesHTML}
    </div>
    <div class="zones-card-graph" id="zonesCardGraph_${idx}"></div>
    <div class="zones-card-stats">${statsHTML}</div>
  </div>`;
}

async function renderZonesCardIntervals(a, idx) {
  const actId = a.id || a.icu_activity_id;
  const graphEl = document.getElementById(`zonesCardGraph_${idx}`);
  if (!graphEl || !actId) return;

  try {
    let raw = await actCacheGet(actId, 'intervals');
    if (raw && raw.__noIntervals) {
      graphEl.innerHTML = '<div class="zc-empty">No interval data</div>';
      return;
    }
    if (!raw) {
      raw = await icuFetch(`/activity/${actId}/intervals`);
      actCachePut(actId, 'intervals', raw || { __noIntervals: true });
    }

    const intervals = raw?.icu_intervals;
    if (!Array.isArray(intervals) || intervals.length < 1) {
      if (!raw?.__noIntervals) actCachePut(actId, 'intervals', { __noIntervals: true });
      graphEl.innerHTML = '<div class="zc-empty">No interval data</div>';
      return;
    }

    const totalDur = intervals.reduce((s, iv) => s + (iv.moving_time || iv.elapsed_time || 0), 0);
    const maxWatts = Math.max(...intervals.map(iv => iv.average_watts || 0), 1);
    const ftp = state.athlete?.ftp || 200;
    if (totalDur <= 0) { graphEl.innerHTML = '<div class="zc-empty">No interval data</div>'; return; }

    let html = '';
    intervals.forEach(iv => {
      const dur = iv.moving_time || iv.elapsed_time || 0;
      if (dur <= 0) return;

      const watts = iv.average_watts || 0;
      const widthPct = (dur / totalDur * 100).toFixed(2);
      const heightPct = watts > 0 ? Math.max(20, (watts / maxWatts * 100)) : 20;

      let zoneIdx = (iv.zone || 0) - 1;
      if (zoneIdx < 0 && watts > 0 && ftp > 0) {
        const ratio = watts / ftp;
        if (ratio < 0.55) zoneIdx = 0;
        else if (ratio < 0.75) zoneIdx = 1;
        else if (ratio < 0.90) zoneIdx = 2;
        else if (ratio < 1.05) zoneIdx = 3;
        else if (ratio < 1.20) zoneIdx = 4;
        else zoneIdx = 5;
      }
      zoneIdx = Math.max(0, Math.min(5, zoneIdx));
      const color = ZONE_HEX[zoneIdx] || ZONE_HEX[0];

      const type = (iv.type || '').toUpperCase();
      const isRest = /REST|RECOVER/.test(type);

      html += `<div class="zc-seg${isRest ? ' zc-seg--rest' : ''}" style="width:${widthPct}%;height:${heightPct}%;background:${color}"></div>`;
    });

    graphEl.innerHTML = html;
    graphEl.classList.add('has-data');
  } catch (e) {
    graphEl.innerHTML = '<div class="zc-empty">No interval data</div>';
  }
}

function renderActivityZonesView(containerId, activities) {
  const el = document.getElementById(containerId);
  const filtered = (activities || []).filter(a => !isEmptyActivity(a));

  const prev = window._actZonesState[containerId];
  if (prev && prev.observer) prev.observer.disconnect();

  if (!filtered.length) {
    el.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg><p>No activities in this period.</p></div>`;
    window._actZonesState[containerId] = null;
    return;
  }

  window._actZonesState[containerId] = {
    el, filtered, cursor: 0, observer: null, lastMonth: null, idCounter: 0
  };

  el.innerHTML = '';
  _actZonesLoadMore(containerId);
}

function _actZonesLoadMore(containerId) {
  const ls = window._actZonesState[containerId];
  if (!ls || ls.cursor >= ls.filtered.length) return;

  const MONTH_NAMES = ['January','February','March','April','May','June',
    'July','August','September','October','November','December'];

  const end = Math.min(ls.cursor + ACT_ZONES_BATCH, ls.filtered.length);
  let html = '';
  const batchStart = ls.idCounter;

  for (let i = ls.cursor; i < end; i++) {
    const a = ls.filtered[i];
    const d = new Date(a.start_date_local || a.start_date);
    const monthKey = d.getFullYear() + '-' + d.getMonth();
    if (monthKey !== ls.lastMonth) {
      ls.lastMonth = monthKey;
      const label = MONTH_NAMES[d.getMonth()] + ' ' + d.getFullYear();
      html += `<div class="act-month-divider"><span class="act-month-label">${label}</span></div>`;
    }
    html += buildZonesCardHTML(a, ls.idCounter);
    ls.idCounter++;
  }

  const oldSentinel = ls.el.querySelector('.act-list-sentinel');
  if (oldSentinel) oldSentinel.remove();

  ls.el.insertAdjacentHTML('beforeend', html);

  // Wire click handlers + fetch intervals
  const jobs = [];
  let jobIdx = batchStart;
  for (let i = ls.cursor; i < end; i++) {
    const a = ls.filtered[i];
    const card = document.getElementById(`zonesCard_${jobIdx}`);
    if (card) card.onclick = () => navigateToActivity(a);
    jobs.push({ a, idx: jobIdx });
    jobIdx++;
  }
  ls.cursor = end;

  // Fetch intervals with limited concurrency
  (async () => {
    const CONC = 3;
    for (let i = 0; i < jobs.length; i += CONC) {
      await Promise.all(jobs.slice(i, i + CONC).map(
        j => renderZonesCardIntervals(j.a, j.idx)
      ));
    }
  })();

  // Sentinel for infinite scroll
  if (ls.cursor < ls.filtered.length) {
    const sentinel = document.createElement('div');
    sentinel.className = 'act-list-sentinel';
    ls.el.appendChild(sentinel);

    if (ls.observer) ls.observer.disconnect();
    ls.observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        ls.observer.disconnect();
        _actZonesLoadMore(containerId);
      }
    }, { rootMargin: '300px' });
    ls.observer.observe(sentinel);
  }
}

function _updateActStickyTop() {
  const toolbar = document.querySelector('#page-activities .acts-toolbar');
  if (!toolbar) return;
  const update = () => {
    const h = toolbar.offsetHeight;
    const top = h; // toolbar height (topbar removed)
    const val = top + 'px';
    const list  = document.getElementById('allActivityList');
    const grid  = document.getElementById('allActivityCardGrid');
    const zones = document.getElementById('allActivityZonesGrid');
    if (list)  list.style.setProperty('--act-sticky-top', val);
    if (grid)  grid.style.setProperty('--act-sticky-top', val);
    if (zones) zones.style.setProperty('--act-sticky-top', val);
  };
  requestAnimationFrame(update);
}

/* ── Sync month-divider sticky top with toolbar position during animation ── */
function _setActStickyTop(val) {
  const list  = document.getElementById('allActivityList');
  const grid  = document.getElementById('allActivityCardGrid');
  const zones = document.getElementById('allActivityZonesGrid');
  if (list)  list.style.setProperty('--act-sticky-top', val);
  if (grid)  grid.style.setProperty('--act-sticky-top', val);
  if (zones) zones.style.setProperty('--act-sticky-top', val);
}
function _animateActStickyTop(toolbar, isHidden) {
  if (isHidden) { _setActStickyTop('0px'); return; }
  // Toolbar revealing — track its bottom edge each frame until transition ends
  let running = true;
  function track() {
    if (!running) return;
    const bottom = Math.max(0, toolbar.getBoundingClientRect().bottom);
    _setActStickyTop(bottom + 'px');
    requestAnimationFrame(track);
  }
  toolbar.addEventListener('transitionend', function handler() {
    running = false;
    toolbar.removeEventListener('transitionend', handler);
    _setActStickyTop(toolbar.offsetHeight + 'px');
  }, { once: true });
  requestAnimationFrame(track);
}

/* ── Hide toolbar on scroll-down, reveal on scroll-up ── */
const _actScroll = { lastY: 0, ticking: false, bound: false };
function _initActToolbarScroll() {
  if (_actScroll.bound) return;
  _actScroll.bound = true;
  _actScroll.lastY = window.scrollY;

  window.addEventListener('scroll', () => {
    if (_actScroll.ticking) return;
    _actScroll.ticking = true;
    requestAnimationFrame(() => {
      _actScroll.ticking = false;
      if (state.currentPage !== 'activities') return;
      const toolbar = document.querySelector('#page-activities .acts-toolbar');
      if (!toolbar) return;

      const y = window.scrollY;
      const delta = y - _actScroll.lastY;
      // Only toggle after a 8px threshold to avoid jitter
      const wasHidden = toolbar.classList.contains('acts-toolbar--hidden');
      if (delta > 8) {
        toolbar.classList.add('acts-toolbar--hidden');
      } else if (delta < -8) {
        toolbar.classList.remove('acts-toolbar--hidden');
      }
      const isHidden = toolbar.classList.contains('acts-toolbar--hidden');
      if (wasHidden !== isHidden) _animateActStickyTop(toolbar, isHidden);
      _actScroll.lastY = y;
    });
  }, { passive: true });
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
// Build hero-style card (App Store aesthetic) for dashboard carousel
function buildHeroActCardHTML(a, idx) {
  const rawName = (a.name && a.name.trim()) ? a.name.trim() : (a.icu_name || 'Activity');
  const { title: name, platformTag } = cleanActivityName(rawName);
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
  const tss   = actVal(a, 'icu_training_load', 'tss');
  const speed = actVal(a, 'average_speed', 'icu_average_speed');

  const dFmt = dist  > 0 ? fmtDist(dist)  : null;
  const sFmt = speed > 0 ? fmtSpeed(speed) : null;

  const sportLabel = activityFallbackName(a).toUpperCase();

  const statItems = [
    dFmt && { val: dFmt.val, unit: dFmt.unit, lbl: 'Distance' },
    secs && { val: fmtDur(secs), unit: '',    lbl: 'Time' },
    sFmt && { val: sFmt.val, unit: sFmt.unit, lbl: 'Avg Speed' },
  ].filter(Boolean);

  const tssClass = tss >= 250 ? 'ra-tss--extreme' : tss >= 150 ? 'ra-tss--hard' : tss >= 100 ? 'ra-tss--moderate' : tss >= 50 ? 'ra-tss--easy' : '';
  const tssBadge = tss > 0
    ? `<span class="ra-tss-badge ${tssClass}">${Math.round(tss)} TSS</span>`
    : '';

  const wxChip = a.weather_temp != null
    ? `<div class="ra-wx-chip hero-wx-chip">
        <span class="ra-wx-icon">${weatherIconSvg(a.weather_icon)}</span>
        <span class="ra-wx-temp">${fmtTempC(a.weather_temp)}</span>
        ${a.weather_wind_speed != null ? `<span class="ra-wx-wind">${fmtWindMs(a.weather_wind_speed)}</span>` : ''}
      </div>`
    : '';

  const statsHTML = statItems.map(s =>
    `<div class="hero-stat">
      <span class="hero-stat-val">${s.val}${s.unit ? `<span class="hero-stat-unit"> ${s.unit}</span>` : ''}</span>
      <span class="hero-stat-lbl">${s.lbl}</span>
    </div>`
  ).join('');

  return `<div class="hero-act-wrap" id="recentActCard_${idx}">
    <div class="hero-act-outer-header">
      <div class="hero-act-title">${name}</div>
      <div class="hero-act-subtitle">${dateFmt}${timeFmt ? ' \u00B7 ' + timeFmt : ''}${platformTag ? ` \u00B7 ${platformTag}` : ''}</div>
    </div>
    <div class="card card--clickable hero-act-card">
      <div class="hero-act-map" id="recentActCardMap_${idx}"></div>
      <div class="hero-act-category">${sportLabel}</div>
      <div class="hero-act-bottom">
        <div class="hero-act-stats">${statsHTML}</div>
        ${(tssBadge || wxChip) ? `<div class="hero-act-trailing">${tssBadge}${wxChip}</div>` : ''}
      </div>
    </div>
  </div>`;
}

// Build HTML for a single recent-activity carousel card (used by Activities grid)
function buildRecentActCardHTML(a, idx, idPrefix = 'recentActCard') {
  const rawName = (a.name && a.name.trim()) ? a.name.trim() : (a.icu_name || 'Activity');
  const { title: name, platformTag } = cleanActivityName(rawName);
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
  const sFmt = speed > 0 ? fmtSpeed(speed) : null;

  const statItems = [
    dFmt && { val: dFmt.val, unit: dFmt.unit, lbl: 'Distance' },
    secs && { val: fmtDur(secs), unit: '',    lbl: 'Time' },
    sFmt && { val: sFmt.val, unit: sFmt.unit, lbl: 'Avg Speed' },
  ].filter(Boolean);

  const tssClass = tss >= 250 ? 'ra-tss--extreme' : tss >= 150 ? 'ra-tss--hard' : tss >= 100 ? 'ra-tss--moderate' : tss >= 50 ? 'ra-tss--easy' : '';
  const tssBadge = tss > 0
    ? `<span class="ra-tss-badge ${tssClass}">${Math.round(tss)} TSS</span>`
    : '';

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

  return `<div class="card card--clickable recent-act-card" id="${idPrefix}_${idx}">
    <div class="recent-act-body">
      <div class="recent-act-info">
        <div class="recent-act-header">
          <div class="recent-act-text">
            <div class="recent-act-date">${dateFmt}${timeFmt ? ' · ' + timeFmt : ''}</div>
            <div class="recent-act-name">${name}</div>
            <div class="recent-act-badges">${tssBadge}${platformTag ? `<span class="act-platform-tag">${platformTag}</span>` : ''}</div>
          </div>
        </div>
        <div class="recent-act-stats">${statsHTML}</div>
        ${wxChip}
      </div>
      <div class="recent-act-map" id="${idPrefix}Map_${idx}"></div>
    </div>
  </div>`;
}

// Fetch GPS and render the mini-map for one card (MapLibre GL).
// Returns a Promise that resolves once the map is fully rendered (idle)
// so callers can enforce real concurrency limits.
async function renderRecentActCardMap(a, idx, idPrefix = 'recentActCard', mapStore = null) {
  const actId = a.id || a.icu_activity_id;
  const mapEl = document.getElementById(`${idPrefix}Map_${idx}`);
  if (!mapEl) return;

  // All card types use snapshot cache — hero cards get same treatment as grid cards
  const isCardGrid = idPrefix === 'actGridCard';
  const cacheKey = `${actId}_${loadMapTheme()}`;
  const cached = await _cardMapCacheLoad(cacheKey);
  if (cached) {
    const img = document.createElement('img');
    img.src = cached;
    img.className = 'ra-card-map-img';
    img.alt = '';
    mapEl.innerHTML = '';
    mapEl.appendChild(img);
    return;
  }

  // GPS points cached — skip the API call entirely on refresh
  let points = null;
  const cachedGPS = localStorage.getItem(`icu_gps_pts_${actId}`);
  if (cachedGPS) {
    try { points = JSON.parse(cachedGPS); } catch (_) {}
  }

  // Nothing cached — fetch from API then save GPS points for next refresh
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

  // Card grid thumbnails are small — further downsample to ~150 points
  let renderPts = points;
  if (isCardGrid && points.length > 150) {
    const s = Math.ceil(points.length / 150);
    renderPts = points.filter((_, i) => i % s === 0);
    if (renderPts[renderPts.length - 1] !== points[points.length - 1]) renderPts.push(points[points.length - 1]);
  }
  const coords = renderPts.map(p => [p[1], p[0]]); // [lng, lat]

  // Compute bounds
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
  }

  // Smart framing: tilt map so route's long axis aligns with card width
  const midLat = (minLat + maxLat) / 2;
  const cosLat = Math.cos(midLat * Math.PI / 180);
  const geoW = (maxLng - minLng) * cosLat;
  const geoH = maxLat - minLat;
  const cardW = mapEl.clientWidth || 420;
  const cardH = mapEl.clientHeight || 236;
  const cardAR = cardW / cardH;
  const routeAR = geoW / (geoH || 0.0001);
  let bearing = 0;
  if (routeAR < cardAR * 0.85 && geoH > geoW * 0.8) {
    const ratio = Math.min(geoH / (geoW || 0.0001), 5);
    bearing = Math.min(ratio * 18, 70);
  }

  const map = new maplibregl.Map({
    container: mapEl,
    style: _mlGetStyle(loadMapTheme()),
    bounds: [[minLng, minLat], [maxLng, maxLat]],
    fitBoundsOptions: { padding: 20, bearing },
    interactive: false,
    attributionControl: false,
    fadeDuration: 0,
    renderWorldCopies: false,
    antialias: false,
    collectResourceTiming: false,
    trackResize: false,
    preserveDrawingBuffer: true,
    maxTileCacheSize: 30,
    pixelRatio: Math.min(devicePixelRatio, 2),
    localIdeographFontFamily: 'sans-serif',
  });

  // Track map for cleanup
  if (mapStore) {
    mapStore.push(map);
  } else {
    state.recentActivityMaps = state.recentActivityMaps || [];
    state.recentActivityMaps.push(map);
  }

  // Wait for load → add route → wait for idle → snapshot (card grid)
  return new Promise(resolve => {
    let settled = false;
    const done = () => { if (settled) return; settled = true; resolve(); };
    // Safety timeout — don't block the queue forever
    const timer = setTimeout(done, 8000);

    map.on('load', () => {
      if (_isStravaTheme()) _applyStravaOverrides(map);

      map.addSource('rc-route', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } },
      });
      map.addLayer({
        id: 'rc-route-shadow', type: 'line', source: 'rc-route',
        paint: { 'line-color': '#000', 'line-width': 7, 'line-opacity': 0.55 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
      map.addLayer({
        id: 'rc-route-line', type: 'line', source: 'rc-route',
        paint: { 'line-color': ACCENT, 'line-width': 4.5, 'line-opacity': 1 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });

      // Start / end dot markers
      const makeDot = (color) => {
        const el = document.createElement('div');
        el.style.cssText = `width:8px;height:8px;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,0.9);box-shadow:0 0 3px rgba(0,0,0,0.5)`;
        return el;
      };
      new maplibregl.Marker({ element: makeDot(ACCENT), anchor: 'center' })
        .setLngLat(coords[0]).addTo(map);
      new maplibregl.Marker({ element: makeDot('#888'), anchor: 'center' })
        .setLngLat(coords[coords.length - 1]).addTo(map);

      // Snapshot to static image once rendered, then destroy the WebGL context.
      // Applies to all card types (hero + grid) to prevent GPU exhaustion and
      // enable instant cache restore on subsequent dashboard loads.
      map.once('idle', () => {
        clearTimeout(timer);
        try {
          const canvas = map.getCanvas();
          const dataUrl = canvas.toDataURL('image/webp', 0.82);
          _cardMapCacheSave(cacheKey, dataUrl);
          const img = document.createElement('img');
          img.src = dataUrl;
          img.className = 'ra-card-map-img';
          img.alt = '';
          map.remove();
          mapEl.innerHTML = '';
          mapEl.appendChild(img);
        } catch (_) {}
        if (mapStore) {
          const mi = mapStore.indexOf(map);
          if (mi !== -1) mapStore.splice(mi, 1);
        } else {
          const si = (state.recentActivityMaps || []).indexOf(map);
          if (si !== -1) state.recentActivityMaps.splice(si, 1);
        }
        done();
      });
    });

    map.on('error', () => { clearTimeout(timer); done(); });
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
  const totalCount = pool.length;
  let html = recent.map((a, i) => buildHeroActCardHTML(a, i)).join('');
  // "View All" link card
  html += `<div class="hero-act-card hero-act-card--viewall" onclick="navigate('activities')">
    <div class="hero-viewall-inner">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="32" height="32">
        <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
        <rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>
      </svg>
      <span class="hero-viewall-label">View All</span>
      <span class="hero-viewall-count">${totalCount} activities</span>
    </div>
  </div>`;
  rail.innerHTML = html;
  if (sectionLabel) sectionLabel.style.display = '';

  recent.forEach((a, i) => {
    const card = document.getElementById(`recentActCard_${i}`);
    if (card) card.onclick = () => navigateToActivity(a);
    renderRecentActCardMap(a, i);
  });
  if (window.refreshGlow) refreshGlow(rail);

  // ── Mobile pagination dots ──
  _initRecentActDots(rail, recent.length + 1);
}

function _initRecentActDots(rail, count) {
  // Remove any existing dots
  const prev = rail.parentElement.querySelector('.recent-act-dots');
  if (prev) prev.remove();
  if (count < 2) return;

  const dotsWrap = document.createElement('div');
  dotsWrap.className = 'recent-act-dots';
  for (let i = 0; i < count; i++) {
    const dot = document.createElement('button');
    dot.className = 'recent-act-dot' + (i === 0 ? ' active' : '');
    dot.setAttribute('aria-label', `Activity ${i + 1}`);
    dot.addEventListener('click', () => {
      const card = rail.children[i];
      if (card) card.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    });
    dotsWrap.appendChild(dot);
  }
  rail.parentElement.appendChild(dotsWrap);

  // Update dots on scroll
  let scrollTick = false;
  rail.addEventListener('scroll', () => {
    if (scrollTick) return;
    scrollTick = true;
    requestAnimationFrame(() => {
      scrollTick = false;
      const cards = rail.querySelectorAll('.hero-act-wrap, .hero-act-card, .recent-act-card');
      if (!cards.length) return;
      let closest = 0;
      let minDist = Infinity;
      cards.forEach((c, i) => {
        const center = c.offsetLeft + c.offsetWidth * 0.5;
        const dist = Math.abs(center - rail.scrollLeft - rail.offsetWidth * 0.5);
        if (dist < minDist) { minDist = dist; closest = i; }
      });
      dotsWrap.querySelectorAll('.recent-act-dot').forEach((d, i) =>
        d.classList.toggle('active', i === closest));
    });
  }, { passive: true });
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

  // Arrow rotation indicator — maps % change to angle + trend class
  function applyArrow(id, cur, prev) {
    const el = document.getElementById(id);
    if (!el) return;
    let angle = 0, cls = 'trend-neutral';
    if (cur === 0 && prev === 0) {
      angle = 0; cls = 'trend-neutral';
    } else if (prev === 0) {
      angle = -70; cls = 'trend-up';
    } else {
      const pct = (cur - prev) / prev * 100;
      if (pct > 50)       { angle = -70; cls = 'trend-up'; }
      else if (pct > 10)  { angle = -45; cls = 'trend-up'; }
      else if (pct > 1)   { angle = -20; cls = 'trend-up'; }
      else if (pct >= -1) { angle = 0;   cls = 'trend-neutral'; }
      else if (pct >= -10){ angle = 20;  cls = 'trend-down'; }
      else if (pct >= -50){ angle = 45;  cls = 'trend-down'; }
      else                { angle = 70;  cls = 'trend-down'; }
    }
    el.style.transform = `rotate(${angle}deg)`;
    el.className = `stat-icon ${cls}`;
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

  // ── Arrow rotation indicators ────────────────────────────────────────────
  applyArrow('statTSSArrow',   tw.tss,   lw.tss);
  applyArrow('statDistArrow',  tw.dist,  lw.dist);
  applyArrow('statTimeArrow',  tw.time,  lw.time);
  applyArrow('statElevArrow',  tw.elev,  lw.elev);
  applyArrow('statCountArrow', tw.count, lw.count);
  applyArrow('statPowerArrow', tw.pow,   lw.pow);

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

  document.getElementById('activitiesSubtitle').textContent = `Last ${days} days · ${recent.length} activities`;

  // Fitness gauges removed — elements no longer in DOM

  renderActivityList('activityList', recent.slice(0, 10));
  renderAllActivitiesList();
  updateSortButtons();
  _updateSportButtons();
  renderWeekProgress();
  renderVitality();
  renderTrainingStatus();
  renderTodaySuggestion();
  lazyRenderChart('ytdDistChart',   () => renderYTDDistance());
  lazyRenderChart('fitnessChart',   () => renderFitnessChart(recent, days));
  lazyRenderChart('weeklyTssChart', () => renderWeeklyChart(recent));
  lazyRenderChart('avgPowerChart',  () => renderAvgPowerChart(recent));
  renderZoneDist(recent);
  lazyRenderChart('powerCurveChart', async () => { await renderPowerCurve(); renderPowerProfileRadar(); });
  lazyRenderChart('pwrHrScatterChart', () => renderPwrHrScatter(recent));
  lazyRenderChart('cyclingTrendsChart', () => renderCyclingTrends(recent, days));
  lazyRenderChart('monotonyChart', () => { renderIntensityDist(recent); renderMonotony(recent, days); });
  lazyRenderChart('aeChart', () => { renderAerobicEfficiency(recent, days); renderRampRate(recent, days); });
  renderRecentActivity();    // async — fetches GPS for map preview
  renderWeatherForecast();   // async — fetches Open-Meteo 7-day forecast
  renderGoalsDashWidget();   // goals & targets compact summary
  _rIC(() => { if (window.refreshGlow) refreshGlow(); });
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
  ride:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M5.5 17.5l3-7h4l2.5 3.5"/><path d="M15 14l3.5 3.5"/><path d="M8.5 10.5l3.5 0"/><circle cx="13" cy="6" r="1.5"/></svg>`,
  virtual:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M5.5 17.5l3-7h4l2.5 3.5"/><path d="M15 14l3.5 3.5"/><path d="M8.5 10.5l3.5 0"/><circle cx="13" cy="6" r="1.5"/><path d="M2 4l3 2-3 2" opacity="0.5"/><path d="M20 2l2 2-2 2" opacity="0.5"/></svg>`,
  run:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="14" cy="4" r="2"/><path d="M8 21l2-6"/><path d="M10 15l-2-4 4-2 3 3 3 1"/><path d="M6 12l2-4"/></svg>`,
  swim:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="6" r="2"/><path d="M18 8v4l-4-1-3 3"/><path d="M2 18c1.5-1.5 3-2 4.5-2s3 .5 4.5 2 3 2 4.5 2 3-.5 4.5-2"/></svg>`,
  walk:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4" r="2"/><path d="M14 10l-1 4-3 5"/><path d="M10 14l-2 7"/><path d="M10 10l2-2"/><path d="M14 10l2 1"/></svg>`,
  hike:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4" r="2"/><path d="M14 10l-1 4-3 5"/><path d="M10 14l-2 7"/><path d="M10 10l2-2"/><path d="M14 10l2 1"/><path d="M19 5l-1 8-1-1" opacity="0.7"/></svg>`,
  strength: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M6 5v14"/><path d="M18 5v14"/><path d="M6 12h12"/><rect x="3" y="7" width="2" height="10" rx="1"/><rect x="19" y="7" width="2" height="10" rx="1"/></svg>`,
  yoga:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4" r="2"/><path d="M12 6v6"/><path d="M12 12l-5 5"/><path d="M12 12l5 5"/><path d="M8 8l-4 1"/><path d="M16 8l4 1"/></svg>`,
  row:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l3-3 4 1 4-5 4 2 3-3"/><path d="M2 20c3-1 7-1 10 0s7 1 10 0"/></svg>`,
  ski:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="14" cy="4" r="2"/><path d="M8 21l6-9"/><path d="M14 12l-4-4-3 6"/><path d="M5 20l14-3"/></svg>`,
  default:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`
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
  if (t.includes('virtualride') || t.includes('virtual_ride')) return sportIcon.virtual;
  if (t.includes('run'))       return sportIcon.run;
  if (t.includes('swim'))      return sportIcon.swim;
  if (t.includes('walk'))      return sportIcon.walk;
  if (t.includes('hike'))      return sportIcon.hike;
  if (t.includes('weight') || t.includes('strength')) return sportIcon.strength;
  if (t.includes('yoga'))      return sportIcon.yoga;
  if (t.includes('row'))       return sportIcon.row;
  if (t.includes('ski'))       return sportIcon.ski;
  if (t.includes('ride'))      return sportIcon.ride;
  return sportIcon.default;
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

// ── Infinite-scroll state per container ──
if (!window._actListState) window._actListState = {};
const ACT_LIST_BATCH = 30;

function _actRowHTML(a, containerId, fi, powerColor) {
  const actKey  = containerId + '_' + fi;
  window._actLookup[actKey] = a;

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
  const tc      = activityTypeClass(a);

  const sportRaw = (a.sport_type || a.type || a.icu_sport_type || '').toLowerCase();
  const isVirtual = sportRaw.includes('virtual');
  const rowClass  = isVirtual ? 'virtual' : tc;

  const rawName = (a.name && a.name.trim()) ? a.name.trim() : activityFallbackName(a);
  const { title: name, platformTag } = cleanActivityName(rawName);
  const badge = a.sport_type || a.type || '';

  const statPill = (val, lbl, color = null) =>
    `<div class="act-stat"><div class="act-stat-val"${color ? ` style="color:${color}"` : ''}>${val}</div><div class="act-stat-lbl">${lbl}</div></div>`;

  const stats = [];
  stats.push(statPill(distKm > 0.05 ? distKm.toFixed(2) : '—', 'km'));
  stats.push(statPill(secs > 0 ? fmtDur(secs) : '—', 'time'));
  stats.push(statPill(elev > 0 ? elev.toLocaleString() : '—', 'elev'));
  stats.push(statPill(pwr > 0 ? Math.round(pwr) + 'w' : '—', 'power', pwr > 0 ? powerColor(pwr) : null));
  stats.push(statPill(hr > 0 ? hr : '—', 'bpm'));

  const _actId = a.id || a.icu_activity_id || '';
  return `<div class="activity-row ${rowClass}" data-act-id="${_actId}" onclick="navigateToActivity('${actKey}')">
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
}

function _actPowerColor(activities) {
  const PWR_COLORS = ['#4a9eff', ACCENT, '#ffcc00', '#ff6b35', '#ff5252'];
  const allPwrs = (activities || state.activities)
    .map(a => a.icu_weighted_avg_watts || a.average_watts || 0)
    .filter(w => w > 0)
    .sort((a, b) => a - b);
  const pThresh = allPwrs.length > 4 ? [
    allPwrs[Math.floor(allPwrs.length * 0.2)],
    allPwrs[Math.floor(allPwrs.length * 0.4)],
    allPwrs[Math.floor(allPwrs.length * 0.6)],
    allPwrs[Math.floor(allPwrs.length * 0.8)],
  ] : null;
  return function(w) {
    if (!w || !pThresh) return null;
    if (w < pThresh[0]) return PWR_COLORS[0];
    if (w < pThresh[1]) return PWR_COLORS[1];
    if (w < pThresh[2]) return PWR_COLORS[2];
    if (w < pThresh[3]) return PWR_COLORS[3];
    return PWR_COLORS[4];
  };
}

function _actListLoadMore(containerId) {
  const ls = window._actListState[containerId];
  if (!ls || ls.cursor >= ls.filtered.length) return;

  const MONTH_NAMES = ['January','February','March','April','May','June',
    'July','August','September','October','November','December'];

  const end = Math.min(ls.cursor + ACT_LIST_BATCH, ls.filtered.length);
  let html = '';
  for (let i = ls.cursor; i < end; i++) {
    const a = ls.filtered[i];
    const d = new Date(a.start_date_local || a.start_date);
    const monthKey = d.getFullYear() + '-' + d.getMonth();
    if (monthKey !== ls.lastMonth) {
      ls.lastMonth = monthKey;
      const label = MONTH_NAMES[d.getMonth()] + ' ' + d.getFullYear();
      html += `<div class="act-month-divider"><span class="act-month-label">${label}</span></div>`;
    }
    html += _actRowHTML(a, containerId, i, ls.powerColor);
  }
  ls.cursor = end;

  // Remove sentinel before appending
  const oldSentinel = ls.el.querySelector('.act-list-sentinel');
  if (oldSentinel) oldSentinel.remove();

  // Append new rows
  ls.el.insertAdjacentHTML('beforeend', html);

  // Add sentinel + observer if more items remain
  if (ls.cursor < ls.filtered.length) {
    const sentinel = document.createElement('div');
    sentinel.className = 'act-list-sentinel';
    sentinel.innerHTML = `<div class="act-skeleton-row"><div class="act-skeleton-icon"></div><div class="act-skeleton-lines"><div class="act-skeleton-line act-skeleton-line--w60"></div><div class="act-skeleton-line act-skeleton-line--w40"></div></div></div>`
      .repeat(3);
    ls.el.appendChild(sentinel);

    if (ls.observer) ls.observer.disconnect();
    ls.observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        ls.observer.disconnect();
        _actListLoadMore(containerId);
      }
    }, { rootMargin: '200px' });
    ls.observer.observe(sentinel);
  }
}

function renderActivityList(containerId, activities) {
  const el       = document.getElementById(containerId);
  const filtered = (activities || []).filter(a => !isEmptyActivity(a));

  // Clean up previous observer
  const prev = window._actListState[containerId];
  if (prev && prev.observer) prev.observer.disconnect();

  if (!filtered.length) {
    el.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg><p>No activities in this period.</p></div>`;
    window._actListState[containerId] = null;
    return;
  }

  const powerColor = _actPowerColor();

  // Store state for this list
  window._actListState[containerId] = {
    el, filtered, powerColor, cursor: 0, observer: null, lastMonth: null
  };

  // Clear and render first batch
  el.innerHTML = '';
  _actListLoadMore(containerId);
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
    const dsPtBg = Array.isArray(ds.pointBackgroundColor)
                     ? ds.pointBackgroundColor[dataIdx]
                     : ds.pointBackgroundColor;
    const candidates = [
      dsPtBg,
      dsBorder,
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
const _cs = getComputedStyle(document.documentElement);
const C_CLR_MUTED = _cs.getPropertyValue('--text-muted').trim() || 'rgba(235,235,245,0.4)';
const C_CLR_GRID  = _cs.getPropertyValue('--border').trim()     || 'rgba(255,255,255,0.04)';
let C_TICK  = { color: C_CLR_MUTED, font: { size: 10 } };
let C_GRID  = { color: C_CLR_GRID };
const C_NOGRID = { display: false };
window.C_TICK = C_TICK; window.C_GRID = C_GRID; window.C_TOOLTIP = C_TOOLTIP;
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
const C_NO_ANIM = { x: { duration: 0 }, y: { duration: 0 } };
/** Run fn() with chart animations suppressed (instant render) */
function noChartAnim(fn) {
  Chart.defaults.animations = C_NO_ANIM;
  try { fn(); } finally { Chart.defaults.animations = C_ANIM; }
}
// Resize redraws must be instant. Per-property `animations` (C_ANIM) override the
// base `animation.duration`, so we must override each property inside the resize
// transition too — otherwise the y-grow still fires on every window resize.
Chart.defaults.transitions.resize = {
  animation: { duration: 0 },
  animations: { x: { duration: 0 }, y: { duration: 0 } },
};
// Solid hover dots: auto-fill with the dataset's line colour, no border ring.
// Skips datasets that already have a per-point hover colour array.
Chart.register({
  id: 'solidHoverDots',
  beforeUpdate(chart) {
    chart.data.datasets.forEach(ds => {
      ds.pointHoverBorderWidth = 0;
      if (Array.isArray(ds.pointHoverBackgroundColor)) return; // per-point colours set explicitly
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
  const SNAP_FWD  = 0.48; // snap forward at 48% of gap (close to midpoint, avoids premature jumps)
  const SNAP_BACK = 0.52; // snap back once cursor retreats past 52% (mild hysteresis)

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
let _scrollTooltipRAF = 0;
window.addEventListener('scroll', () => {
  if (_scrollTooltipRAF) return;
  _scrollTooltipRAF = requestAnimationFrame(() => {
    _scrollTooltipRAF = 0;
    const tt = _getTooltipEl();
    if (tt.style.opacity !== '0') tt.style.opacity = '0';
  });
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
    ctx.strokeStyle = _isDark() ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.35)';
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.restore();
  },
});
// Tooltip sync between linked chart pairs (e.g. CTL/ATL + Form charts)
function _linkCharts(chartA, stateKeyA, chartB, stateKeyB) {
  _chartLinks.set(chartA, stateKeyB);
  _chartLinks.set(chartB, stateKeyA);
}
let _syncingTooltip = false;
Chart.register({
  id: 'tooltipSync',
  afterEvent(chart, args) {
    if (_syncingTooltip) return;
    const partnerKey = _chartLinks.get(chart);
    if (!partnerKey) return;
    const partner = state[partnerKey];
    if (!partner || !partner.canvas) return;

    const evt = args.event;
    if (evt.type === 'mouseout') {
      _syncingTooltip = true;
      partner.setActiveElements([]);
      partner.tooltip.setActiveElements([], { x: 0, y: 0 });
      partner.update('none');
      _syncingTooltip = false;
      return;
    }
    if (evt.type !== 'mousemove') return;

    const active = chart.tooltip?._active;
    if (!active || !active.length) return;
    const idx = active[0].index;

    _syncingTooltip = true;
    const elements = partner.data.datasets.map((ds, di) => ({ datasetIndex: di, index: idx }));
    partner.setActiveElements(elements);
    // Use partner's own element position so crosshairs align to its chart area
    const pMeta = partner.getDatasetMeta(0);
    const pPt = pMeta && pMeta.data[idx];
    const px = pPt ? pPt.x : active[0].element.x;
    const py = pPt ? pPt.y : active[0].element.y;
    partner.tooltip.setActiveElements(elements, { x: px, y: py });
    partner.update('none');
    _syncingTooltip = false;
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
    tss:       { label: 'Training Load', unit: 'TSS',  color: ACCENT, dimColor: 'rgba(0,229,160,0.08)',    fmt: v => Math.round(v),           tooltip: v => `${Math.round(v)} TSS` },
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
  let thisCum = 0, lastCum = 0;

  for (let i = 0; i < 7; i++) {
    const td    = new Date(thisMonday); td.setDate(thisMonday.getDate() + i);
    const ld    = new Date(lastMonday); ld.setDate(lastMonday.getDate() + i);
    const tdStr = toDateStr(td);
    const v1    = tdStr > todayStr ? null : (dayMap[tdStr] || 0);
    const v2    = dayMap[toDateStr(ld)] || 0;
    if (v1 !== null) { thisCum += v1; thisTotal += v1; }
    lastCum += v2; lastTotal += v2;
    thisWeekData.push(v1 !== null ? thisCum : null);
    lastWeekData.push(lastCum);
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
  const badgeMob = document.getElementById('wpTrendBadgeMobile');
  if      (ctlDiff > 1.5)  { badgeEl.textContent = '▲ Building';   badgeEl.className = 'wkp-badge wkp-badge--up'; }
  else if (ctlDiff < -1.5) { badgeEl.textContent = '▼ Declining';  badgeEl.className = 'wkp-badge wkp-badge--down'; }
  else                     { badgeEl.textContent = '→ Maintaining'; badgeEl.className = 'wkp-badge wkp-badge--flat'; }
  if (badgeMob) { badgeMob.textContent = badgeEl.textContent; badgeMob.className = 'wkp-badge wkp-mobile-badge ' + badgeEl.className.split(' ').pop(); }

  // Chart
  const ctx = document.getElementById('weekProgressChart');
  if (!ctx) return;

  const todayIdx = thisWeekData.reduce((idx, v, i) => (v !== null ? i : idx), 0);

  // Update in-place to avoid destroy/recreate flicker
  if (state.weekProgressChart) {
    const ch = state.weekProgressChart;
    ch.data.labels = dayLabels;
    ch.data.datasets[0].data = lastWeekData;
    ch.data.datasets[1].data = thisWeekData;
    ch.data.datasets[1].borderColor          = m.color;
    ch.data.datasets[1].backgroundColor      = m.dimColor;
    ch.data.datasets[1].pointRadius          = thisWeekData.map((_, i) => i === todayIdx ? 9 : 0);
    ch.data.datasets[1].pointBackgroundColor = m.color;
    ch.data.datasets[1].pointBorderColor     = 'var(--bg-card)';
    ch.options.plugins.tooltip.callbacks.label = c => `${c.dataset.label}: ${c.raw != null ? m.tooltip(c.raw) : '—'}`;
    ch.update();
    return;
  }

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
          pointRadius: 0,
          pointHoverRadius: 6,
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
          pointRadius:          thisWeekData.map((_, i) => i === todayIdx ? 9 : 0),
          pointHoverRadius: 7,
          pointBackgroundColor: m.color,
          pointBorderColor:     'var(--bg-card)',
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
      layout: { padding: { top: 12, bottom: 12 } },
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

  const color = val < 8 ? ACCENT : val < 10 ? '#f0c429' : '#ff4757';

  // Tick marks at zone boundaries
  const tickVals = [0, 3, 8, 10, 12];
  let ticks = '';
  tickVals.forEach(v => {
    const a = toA(v);
    const r1 = R + SW / 2 + 3, r2 = r1 + 7;
    ticks += `<line x1="${(CX + r1 * Math.cos(a)).toFixed(1)}" y1="${(CY - r1 * Math.sin(a)).toFixed(1)}" `
           + `x2="${(CX + r2 * Math.cos(a)).toFixed(1)}" y2="${(CY - r2 * Math.sin(a)).toFixed(1)}" `
           + `stroke="${_isDark() ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}" stroke-width="1.5" stroke-linecap="round"/>`;
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

  const dk = _isDark();
  let s = `<defs>
    <!-- Tube shading: dark edges, lighter center for 3D cylinder look -->
    <linearGradient id="tubeTrack" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${dk ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)'}"/>
      <stop offset="35%" stop-color="${dk ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'}"/>
      <stop offset="65%" stop-color="rgba(0,0,0,0.08)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.2)"/>
    </linearGradient>
    <!-- Active fill tube gradient -->
    <linearGradient id="tubeFillGreen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#5fffca"/>
      <stop offset="30%" stop-color="${ACCENT}"/>
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
  const zones = [[0, 3, ACCENT], [3, 8, ACCENT], [8, 10, '#f0c429'], [10, 12, '#ff4757']];
  zones.forEach(([lo, hi, c]) => {
    s += `<path d="${tubePath(toA(lo), toA(hi))}" fill="${c}" opacity="0.07"/>`;
  });
  // 3. Tube track — gradient overlay for 3D shading
  s += `<path d="${tubePath(Math.PI * 0.999, Math.PI * 0.001, 'round')}" fill="url(#tubeTrack)"/>`;

  // 4. Active fill — colored tube section
  const fillGrad = color === ACCENT ? 'url(#tubeFillGreen)' : color === '#f0c429' ? 'url(#tubeFillYellow)' : 'url(#tubeFillRed)';
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
     + `fill="none" stroke="${dk ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}" stroke-width="1.5" stroke-linecap="round"/>`;

  // 5. Indicator dot
  const dx = px(toA(val)), dy = py(toA(val));
  s += `<circle cx="${dx}" cy="${dy}" r="7" fill="${color}" opacity="0.3" filter="url(#trsDotGlow)"/>`;
  s += `<circle cx="${dx}" cy="${dy}" r="${SW/2 + 1}" fill="${color}"/>`;
  s += `<circle cx="${dx}" cy="${dy}" r="${SW/2 - 1}" fill="url(#tubeHighlight)"/>`;
  s += `<circle cx="${dx}" cy="${dy}" r="3" fill="rgba(255,255,255,0.6)"/>`;

  el.innerHTML = s;
}

// ── Vitality Metaball Shader ──
let _vitalityGL = null;
let _vitalityRAF = null;
let _vitalityParams = {
  radii: [0.12, 0.12, 0.12],
  ampMin: 0.15, ampMax: 0.35, freqMin: 0.8, freqMax: 1.2,
  pulse: 0.0, distortion: 0.0, glow: 0.5, saturation: 1.0, particles: 0.0,
  // Visual ranges — [min, max] each driven by a fitness data signal
  scaleRange: [0.8, 2.2],   // driver: avg fitness (CTL+ATL)
  ampRange:   [0.7, 1.5],   // driver: weekly hours
  speedRange: [0.7, 1.5],   // driver: weekly rides
  freqRange:  [1.06, 1.58], // driver: weekly rides — base freq to max freq spread
  edgeRange:  [4.0, 14.0],  // driver: TSB freshness (glow)
  kRange:     [4.0, 16.0],  // driver: inverse stress (1 - distortion)
  chrRange:   [0.3, 1.0],   // driver: weekly TSS
  // Computed each frame from ranges + drivers (read by anim loop)
  scaleOvr: 1.6, ampMult: 1.0, speedMult: 1.0, edgeOvr: 9.0, kOvr: 8.0,
};

function _initVitalityShader(canvas) {
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
  if (!gl) return null;
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  const vs = `attribute vec2 a_pos; void main(){gl_Position=vec4(a_pos,0.,1.);}`;
  const fs = `
precision mediump float;
uniform vec2 u_resolution;
uniform float u_time;
uniform vec3 u_radii;
uniform vec2 u_amplitude; // min, max
uniform vec2 u_frequency; // min, max
uniform float u_pulse;
uniform float u_distortion;
uniform float u_glow;
uniform float u_saturation;
uniform float u_particles;
uniform float u_chromatic;
uniform vec3 u_click; // xy=position in pixels, z=strength (decays over time)
uniform float u_scale;       // blob scale multiplier (default 1.6)
uniform float u_edge_thick;  // edge thickness base (default 9.0)
uniform float u_k;           // smoothMin separation k (default 8.0)

float hash(float n){
  return fract(sin(n+12452.234)*43758.5453);
}
float hash2(vec2 p){
  p=fract(p*vec2(123.34,456.21));
  p+=dot(p,p+45.32);
  return fract(p.x*p.y);
}
float noise(vec2 p){
  vec2 i=floor(p), f=fract(p);
  f=f*f*(3.0-2.0*f);
  float a=hash2(i), b=hash2(i+vec2(1,0));
  float c=hash2(i+vec2(0,1)), d=hash2(i+vec2(1,1));
  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
}
float sdfCircle(vec2 p, vec2 c, float r){
  return length(p-c)-r;
}
float smoothMin(float a, float b, float k){
  float h=clamp(0.5+0.5*(b-a)/k, 0.0, 1.0);
  return mix(b,a,h)-k*h*(1.0-h);
}

// Compute metaball field + SDF + color at a pixel position
// Returns: x=field, y=sdf, and writes color into outCol
vec2 metaScene(vec2 px, vec2 pp0, vec2 pp1, vec2 pp2, vec3 pxR, float k,
               vec3 col0, vec3 col1, vec3 col2, out vec3 outCol){
  // Warp pixel coords with noise for bubbly surface deformation
  float warpScale=0.008;
  float warpAmt=(0.3+u_distortion*0.7)*u_resolution.y*0.04;
  float wt=u_time*0.6;
  vec2 wpx=px+vec2(
    noise(px*warpScale+vec2(wt,0.0))-0.5,
    noise(px*warpScale+vec2(0.0,wt+99.0))-0.5
  )*warpAmt;

  float field=0.0;
  vec3 acc=vec3(0.0);
  float s0=pxR.x/max(length(wpx-pp0),0.1);
  float s1=pxR.y/max(length(wpx-pp1),0.1);
  float s2=pxR.z/max(length(wpx-pp2),0.1);
  field=s0+s1+s2;
  acc=col0*s0+col1*s1+col2*s2;
  outCol=acc/max(field,0.001);

  float d=sdfCircle(wpx,pp0,pxR.x);
  d=smoothMin(d,sdfCircle(wpx,pp1,pxR.y),k);
  d=smoothMin(d,sdfCircle(wpx,pp2,pxR.z),k);
  return vec2(field,d);
}

void main(){
  vec2 px=gl_FragCoord.xy;
  vec2 uv=px/u_resolution;
  vec2 center=u_resolution*0.5;
  float t=u_time*0.6;

  // Per-blob amplitude and frequency (each blob gets a different value in the range)
  float amp0=mix(u_amplitude.x, u_amplitude.y, 0.7);
  float amp1=mix(u_amplitude.x, u_amplitude.y, 1.0);
  float amp2=mix(u_amplitude.x, u_amplitude.y, 0.3);
  float frq0=mix(u_frequency.x, u_frequency.y, 0.5);
  float frq1=mix(u_frequency.x, u_frequency.y, 0.9);
  float frq2=mix(u_frequency.x, u_frequency.y, 0.2);

  // Breathing pulse
  float breathe=sin(t*frq0*3.0)*u_pulse*0.03;
  vec3 radii=u_radii+vec3(breathe);
  radii=max(radii,vec3(0.02));
  vec3 pxR=radii*u_resolution.y*u_scale;

  // Metaball positions — compound Lissajous orbits for complex, interesting motion
  vec2 p0=center+vec2(
    sin(t*0.7*frq0)*amp0 + sin(t*1.3*frq0+0.8)*amp0*0.3,
    cos(t*0.9*frq0)*amp0*0.85 + cos(t*1.6*frq0+1.2)*amp0*0.25
  )*u_resolution.y;
  vec2 p1=center+vec2(
    sin(t*0.5*frq1+3.5)*amp1 + cos(t*1.1*frq1+0.5)*amp1*0.35,
    cos(t*0.8*frq1+2.4)*amp1*0.85 + sin(t*1.4*frq1+2.0)*amp1*0.3
  )*u_resolution.y;
  vec2 p2=center+vec2(
    cos(t*0.6*frq2+5.8)*amp2 + sin(t*1.2*frq2+3.3)*amp2*0.4,
    sin(t*0.7*frq2+4.6)*amp2*0.85 + cos(t*1.5*frq2+5.1)*amp2*0.3
  )*u_resolution.y;

  // Surface distortion
  if(u_distortion>0.01){
    float nS=0.005+u_distortion*0.01;
    float nA=u_distortion*u_resolution.y*0.06;
    p0+=vec2(noise(p0*nS+t*1.3)-0.5,noise(p0*nS+t*1.7+99.0)-0.5)*nA;
    p1+=vec2(noise(p1*nS+t*1.1+33.0)-0.5,noise(p1*nS+t*1.5+77.0)-0.5)*nA;
    p2+=vec2(noise(p2*nS+t*0.9+55.0)-0.5,noise(p2*nS+t*1.2+44.0)-0.5)*nA;
  }

  // Click repulsion — smooth push away from click point
  if(u_click.z>0.005){
    vec2 cp=u_click.xy;
    float str=u_click.z;
    float repelRadius=u_resolution.y*0.5;
    float push=repelRadius*0.8;
    vec2 d0=p0-cp; float l0=length(d0); if(l0<repelRadius) p0+=normalize(d0+vec2(0.001))*str*push*(1.0-l0/repelRadius);
    vec2 d1=p1-cp; float l1=length(d1); if(l1<repelRadius) p1+=normalize(d1+vec2(0.001))*str*push*(1.0-l1/repelRadius);
    vec2 d2=p2-cp; float l2=length(d2); if(l2<repelRadius) p2+=normalize(d2+vec2(0.001))*str*push*(1.0-l2/repelRadius);
  }

  vec3 col0=vec3(0.0,0.898,0.627);  // energy green
  vec3 col1=vec3(1.0,0.42,0.21);    // fatigue orange
  vec3 col2=vec3(0.29,0.62,1.0);    // readiness blue

  float k=u_k+u_distortion*8.0;
  float edgeThick=u_edge_thick+u_distortion*3.0;

  // ── Chromatic aberration — compute scene at RGB-offset positions ──
  float abAmount=u_chromatic;
  vec2 toCenter=(uv-0.5)*0.1;

  // Red channel — offset outward
  vec3 colR;
  vec2 pxR_off=px-toCenter*abAmount*u_resolution.y;
  vec2 sceneR=metaScene(pxR_off,p0,p1,p2,pxR,k,col0,col1,col2,colR);

  // Green channel — center
  vec3 colG;
  vec2 sceneG=metaScene(px,p0,p1,p2,pxR,k,col0,col1,col2,colG);

  // Blue channel — offset inward
  vec3 colB;
  vec2 pxB_off=px+toCenter*abAmount*u_resolution.y;
  vec2 sceneB=metaScene(pxB_off,p0,p1,p2,pxR,k,col0,col1,col2,colB);

  // Use the center channel for shared calculations
  float field=sceneG.x;
  float d=sceneG.y;

  // Fill mask + outline from SDF
  float fillMask=smoothstep(0.9,1.1,field);
  float outlineR=smoothstep(0.0,edgeThick,abs(sceneR.y));
  float outlineG=smoothstep(0.0,edgeThick,abs(sceneG.y));
  float outlineB=smoothstep(0.0,edgeThick,abs(sceneB.y));
  float fillR=smoothstep(0.9,1.1,sceneR.x);
  float fillG=smoothstep(0.9,1.1,sceneG.x);
  float fillB=smoothstep(0.9,1.1,sceneB.x);

  // ── Gradient for specular + shadow ──
  vec3 dummy;
  float fieldDx=metaScene(px+vec2(1.0,0.0),p0,p1,p2,pxR,k,col0,col1,col2,dummy).x;
  float fieldDy=metaScene(px+vec2(0.0,1.0),p0,p1,p2,pxR,k,col0,col1,col2,dummy).x;
  vec2 grad=normalize(vec2(fieldDx-field,fieldDy-field)+vec2(0.0001));

  float specular=pow(max(dot(grad,normalize(vec2(0.5,0.7))),0.0),20.0);
  specular*=(0.3+u_glow*0.5);
  float shadow=pow(max(dot(grad,normalize(vec2(-0.5,-0.7))),0.0),10.0)*0.4;

  // ── Interior — subtle tint, mostly transparent ──
  // Saturation from streak
  float lum=dot(colG,vec3(0.299,0.587,0.114));
  vec3 fillColor=mix(vec3(lum),colG,u_saturation);

  vec3 interior=fillColor*0.15 + specular*0.4*vec3(1.0) + fillColor*specular*0.2;

  // ── Compose per-channel with chromatic aberration on outline ──
  // Each channel: mix(interior, outline-removed) — outline punches through to bg
  float rVal=mix(interior.r*(1.0-shadow), 0.0, outlineR) * fillR;
  float gVal=mix(interior.g*(1.0-shadow), 0.0, outlineG) * fillG;
  float bVal=mix(interior.b*(1.0-shadow), 0.0, outlineB) * fillB;

  // The outline itself should be visible as the colored edge
  // Where outline < 1 (near edge), show the fill color of that channel
  float edgeR=(1.0-outlineR)*fillR;
  float edgeG=(1.0-outlineG)*fillG;
  float edgeB=(1.0-outlineB)*fillB;

  // Edge color — use per-channel metaball colors
  vec3 edgeColor=vec3(colR.r*edgeR, colG.g*edgeG, colB.b*edgeB);

  // ── Glow aura ──
  float glow1=smoothstep(0.2,0.85,field)*(0.02+u_glow*0.10);
  float glow2=smoothstep(0.45,0.95,field)*(0.03+u_glow*0.08);
  float totalGlow=glow1+glow2;
  vec3 glowC=fillColor*totalGlow*0.5;

  // ── Particles ──
  float particleField=0.0;
  float aspect=u_resolution.x/u_resolution.y;
  if(u_particles>0.01){
    vec2 uvA=vec2(uv.x*aspect,uv.y);
    for(float i=0.0;i<20.0;i++){
      float seed=i*7.31;
      vec2 pp=vec2(
        fract(hash2(vec2(seed,1.0))+u_time*0.01*(0.5+hash2(vec2(seed,3.0))))*aspect,
        fract(hash2(vec2(seed,2.0))+u_time*0.008*(0.3+hash2(vec2(seed,4.0))))
      );
      float r=0.002+hash2(vec2(seed,5.0))*0.003;
      float dd=length(uvA-pp);
      float dot_=smoothstep(r,r*0.2,dd);
      float a=hash2(vec2(seed,6.0))*0.5+0.2;
      particleField+=dot_*a*u_particles;
    }
  }
  vec3 partC=vec3(0.3,0.5,0.4)*particleField*0.5;

  // ── Final composite ──
  vec3 final_c=vec3(rVal,gVal,bVal) + edgeColor*0.8 + glowC + partC;

  // Alpha: edge + interior + glow + particles
  float maxEdge=max(max(edgeR,edgeG),edgeB);
  float alpha=max(max(fillMask*0.15, maxEdge*0.95), max(totalGlow*0.7, particleField*0.3));

  gl_FragColor=vec4(final_c, alpha);
}`;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('Vitality shader error:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }
  const vShader = compile(gl.VERTEX_SHADER, vs);
  const fShader = compile(gl.FRAGMENT_SHADER, fs);
  if (!vShader || !fShader) return null;

  const program = gl.createProgram();
  gl.attachShader(program, vShader);
  gl.attachShader(program, fShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Vitality program error:', gl.getProgramInfoLog(program));
    return null;
  }
  gl.useProgram(program);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const u = (n) => gl.getUniformLocation(program, n);
  return {
    gl, program, canvas,
    u_resolution: u('u_resolution'), u_time: u('u_time'), u_radii: u('u_radii'),
    u_amplitude: u('u_amplitude'), u_frequency: u('u_frequency'), u_pulse: u('u_pulse'),
    u_distortion: u('u_distortion'), u_glow: u('u_glow'),
    u_saturation: u('u_saturation'), u_particles: u('u_particles'),
    u_chromatic: u('u_chromatic'), u_click: u('u_click'),
    u_scale: u('u_scale'), u_edge_thick: u('u_edge_thick'), u_k: u('u_k'),
  };
}

function _vitalityAnimLoop() {
  if (!_vitalityGL) return;
  const G = _vitalityGL;
  const { gl, program, canvas } = G;
  const P = _vitalityParams;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth * dpr | 0;
  const h = canvas.clientHeight * dpr | 0;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w; canvas.height = h;
    gl.viewport(0, 0, w, h);
  }

  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(program);
  gl.uniform2f(G.u_resolution, w, h);
  gl.uniform1f(G.u_time, performance.now() / 1000 * (P.speedMult || 1));
  gl.uniform3f(G.u_radii, P.radii[0], P.radii[1], P.radii[2]);
  gl.uniform2f(G.u_amplitude, P.ampMin * (P.ampMult || 1), P.ampMax * (P.ampMult || 1));
  gl.uniform2f(G.u_frequency, P.freqMin, P.freqMax);
  gl.uniform1f(G.u_pulse, P.pulse);
  gl.uniform1f(G.u_distortion, P.distortion);
  gl.uniform1f(G.u_glow, P.glow);
  gl.uniform1f(G.u_saturation, P.saturation);
  gl.uniform1f(G.u_particles, P.particles);
  gl.uniform1f(G.u_chromatic, P.chrOvr != null ? P.chrOvr : (P.chromatic || 0.6));
  gl.uniform1f(G.u_scale, P.scaleOvr || 1.6);
  gl.uniform1f(G.u_edge_thick, P.edgeOvr || 9.0);
  gl.uniform1f(G.u_k, P.kOvr || 8.0);
  // Smooth ramp strength + lerp click position
  var ct = P.clickTarget || 0;
  // Smoothly move the repulsion point toward latest click
  P.clickX = (P.clickX || 0) + ((P.clickTargetX || 0) - (P.clickX || 0)) * 0.04;
  P.clickY = (P.clickY || 0) + ((P.clickTargetY || 0) - (P.clickY || 0)) * 0.04;
  P.clickStr = (P.clickStr || 0) + (ct - (P.clickStr || 0)) * 0.01;
  if (ct > 0.005) P.clickTarget *= 0.994;
  else P.clickTarget = 0;
  if (P.clickStr < 0.002) P.clickStr = 0;
  gl.uniform3f(G.u_click, P.clickX, P.clickY, P.clickStr);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  // Only stop the loop when we've actually left the dashboard.
  // Do NOT gate on canvas.offsetWidth — during a startViewTransition the canvas
  // is temporarily 0-wide even though we're navigating TO the dashboard, which
  // would kill the loop before the page finishes appearing.
  if (state.currentPage === 'dashboard') {
    _vitalityRAF = requestAnimationFrame(_vitalityAnimLoop);
  } else {
    _vitalityRAF = null;
  }
}

function _stopVitality() {
  if (_vitalityRAF) { cancelAnimationFrame(_vitalityRAF); _vitalityRAF = null; }
  // Reset GL context so renderVitality() does a clean re-init on next dashboard visit.
  // getContext('webgl') on the same canvas returns the existing context, so this is cheap.
  _vitalityGL = null;
}

function _initVitalityDialog() {
  var infoBtn   = document.getElementById('vitalityInfoBtn');
  var dialog    = document.getElementById('vitalityDialog');
  var closeBtn  = document.getElementById('vitalityDialogClose');
  var resetBtn  = document.getElementById('vdReset');
  var saveBtn   = document.getElementById('vdSave');
  if (!infoBtn || !dialog) return;

  // ── Persist / restore ranges via localStorage ──────────────────────────
  var STORAGE_KEY = 'biorhythmRanges';
  function saveRanges() {
    var P = _vitalityParams;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        scaleRange: P.scaleRange, ampRange:  P.ampRange,  speedRange: P.speedRange,
        freqRange:  P.freqRange,  edgeRange: P.edgeRange, kRange:     P.kRange, chrRange: P.chrRange
      }));
    } catch(e) {}
  }
  function loadRanges() {
    try {
      var saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved) return;
      var P = _vitalityParams;
      if (saved.scaleRange) P.scaleRange = saved.scaleRange;
      if (saved.ampRange)   P.ampRange   = saved.ampRange;
      if (saved.speedRange) P.speedRange = saved.speedRange;
      if (saved.freqRange)  P.freqRange  = saved.freqRange;
      if (saved.edgeRange)  P.edgeRange  = saved.edgeRange;
      if (saved.kRange)     P.kRange     = saved.kRange;
      if (saved.chrRange)   P.chrRange   = saved.chrRange;
    } catch(e) {}
  }
  loadRanges(); // restore saved ranges immediately on init

  function fmtMult(v) { return (+v).toFixed(2) + '×'; }
  function fmtPx(v)   { return (+v).toFixed(1) + 'px'; }
  function fmt2(v)    { return (+v).toFixed(2); }

  // Update the filled track region between two thumbs
  function updateFill(fillId, loVal, hiVal, physMin, physMax) {
    var el = document.getElementById(fillId);
    if (!el) return;
    var span = physMax - physMin;
    el.style.left  = ((loVal - physMin) / span * 100) + '%';
    el.style.width = ((hiVal - loVal)   / span * 100) + '%';
  }

  // Sync both thumbs + labels + fill for a range param
  function syncRange(loId, hiId, loValId, hiValId, fillId, loVal, hiVal, physMin, physMax, fmtFn) {
    var loEl = document.getElementById(loId), hiEl = document.getElementById(hiId);
    var loVEl = document.getElementById(loValId), hiVEl = document.getElementById(hiValId);
    if (loEl) loEl.value = loVal;
    if (hiEl) hiEl.value = hiVal;
    if (loVEl) loVEl.textContent = fmtFn(loVal);
    if (hiVEl) hiVEl.textContent = fmtFn(hiVal);
    updateFill(fillId, loVal, hiVal, physMin, physMax);
  }

  function populateDialog() {
    var P        = _vitalityParams;
    var ctl      = (state.fitness && state.fitness.ctl)      || 0;
    var atl      = (state.fitness && state.fitness.atl)      || 0;
    var tsb      = (state.fitness && state.fitness.tsb  != null) ? state.fitness.tsb : (ctl - atl);
    var rampRate = (state.fitness && state.fitness.rampRate) || 0;

    // Weekly aggregates
    var today        = new Date();
    var weekStartStr = toDateStr(getWeekStart(today));
    var weekRides = 0, weekHours = 0, weekTSS = 0;
    state.activities.forEach(function(a) {
      if (isEmptyActivity(a)) return;
      var d = (a.start_date_local || a.start_date || '').slice(0, 10);
      if (d < weekStartStr) return;
      weekRides++;
      weekTSS   += actVal(a, 'icu_training_load', 'tss');
      weekHours += actVal(a, 'moving_time', 'elapsed_time', 'icu_moving_time', 'icu_elapsed_time') / 3600;
    });

    // Training streak
    var daySet = new Set();
    state.activities.forEach(function(a) {
      if (!isEmptyActivity(a)) daySet.add((a.start_date_local || a.start_date || '').slice(0, 10));
    });
    var todayStr = toDateStr(today);
    var streak = 0, startOff = daySet.has(todayStr) ? 0 : 1;
    for (var i = startOff; i < 365; i++) {
      if (daySet.has(toDateStr(new Date(Date.now() - i * 86400000)))) streak++;
      else break;
    }

    // Data rows
    function setEl(id, txt) { var e = document.getElementById(id); if (e) e.textContent = txt; }
    setEl('vdCtl',    Math.round(ctl));
    setEl('vdAtl',    Math.round(atl));
    setEl('vdTsb',    (tsb >= 0 ? '+' : '') + Math.round(tsb));
    setEl('vdRamp',   (rampRate >= 0 ? '+' : '') + rampRate.toFixed(1) + ' CTL/wk');
    setEl('vdRides',  weekRides + ' this week');
    setEl('vdHours',  weekHours.toFixed(1) + ' hrs');
    setEl('vdTss',    Math.round(weekTSS));
    setEl('vdStreak', streak + ' days');

    // Sync all range sliders
    var r = P.scaleRange;  syncRange('vdScaleLo','vdScaleHi','vdScaleLoVal','vdScaleHiVal','vdScaleFill', r[0],r[1], 0.3,4,   fmtMult);
    r = P.ampRange;        syncRange('vdAmpLo',  'vdAmpHi',  'vdAmpLoVal',  'vdAmpHiVal',  'vdAmpFill',  r[0],r[1], 0.2,3,   fmtMult);
    r = P.speedRange;      syncRange('vdSpeedLo','vdSpeedHi','vdSpeedLoVal','vdSpeedHiVal','vdSpeedFill', r[0],r[1], 0.2,3,   fmtMult);
    r = P.freqRange;       syncRange('vdFreqLo', 'vdFreqHi', 'vdFreqLoVal', 'vdFreqHiVal', 'vdFreqFill',  r[0],r[1], 0.3,3,   fmt2);
    r = P.edgeRange;       syncRange('vdEdgeLo', 'vdEdgeHi', 'vdEdgeLoVal', 'vdEdgeHiVal', 'vdEdgeFill', r[0],r[1], 1,25,    fmtPx);
    r = P.chrRange;        syncRange('vdChrLo',  'vdChrHi',  'vdChrLoVal',  'vdChrHiVal',  'vdChrFill',  r[0],r[1], 0,1,     fmt2);
    r = P.kRange;          syncRange('vdKLo',    'vdKHi',    'vdKLoVal',    'vdKHiVal',    'vdKFill',    r[0],r[1], 1,30,    fmt2);
  }

  // ── Live preview WebGL loop inside dialog ──────────────────────────────
  var previewCanvas = document.getElementById('vdPreviewCanvas');
  var _vdPreviewGL  = null;
  var _vdPreviewRAF = null;

  function _startPreview() {
    if (!previewCanvas) return;
    if (!_vdPreviewGL) _vdPreviewGL = _initVitalityShader(previewCanvas);
    if (!_vdPreviewGL) return;
    cancelAnimationFrame(_vdPreviewRAF);
    var G = _vdPreviewGL;
    function loop() {
      var gl = G.gl, canvas = G.canvas;
      var P  = _vitalityParams;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = (canvas.clientWidth  * dpr) | 0;
      var h = (canvas.clientHeight * dpr) | 0;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(G.program);
      gl.uniform2f(G.u_resolution, w, h);
      gl.uniform1f(G.u_time,       performance.now() / 1000 * (P.speedMult || 1));
      gl.uniform3f(G.u_radii,      P.radii[0], P.radii[1], P.radii[2]);
      gl.uniform2f(G.u_amplitude,  P.ampMin * (P.ampMult || 1), P.ampMax * (P.ampMult || 1));
      gl.uniform2f(G.u_frequency,  P.freqMin, P.freqMax);
      gl.uniform1f(G.u_pulse,      P.pulse);
      gl.uniform1f(G.u_distortion, P.distortion);
      gl.uniform1f(G.u_glow,       P.glow);
      gl.uniform1f(G.u_saturation, P.saturation);
      gl.uniform1f(G.u_particles,  P.particles);
      gl.uniform1f(G.u_chromatic,  P.chromatic || 0.6);
      gl.uniform1f(G.u_scale,      P.scaleOvr  || 1.6);
      gl.uniform1f(G.u_edge_thick, P.edgeOvr   || 9.0);
      gl.uniform1f(G.u_k,         P.kOvr      || 8.0);
      gl.uniform3f(G.u_click, 0, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      _vdPreviewRAF = requestAnimationFrame(loop);
    }
    loop();
  }

  function _stopPreview() {
    cancelAnimationFrame(_vdPreviewRAF);
    _vdPreviewRAF = null;
  }

  infoBtn.addEventListener('click', function() { populateDialog(); dialog.showModal(); _startPreview(); });
  closeBtn && closeBtn.addEventListener('click', function() { closeModalAnimated(dialog); });
  dialog.addEventListener('click', function(e) { if (e.target === dialog) closeModalAnimated(dialog); });
  dialog.addEventListener('close', _stopPreview);

  // Wire a dual-range pair — enforces lo ≤ hi, updates fill + labels + param array
  function onRange(loId, hiId, loValId, hiValId, fillId, physMin, physMax, fmtFn, rangeArr) {
    var loEl   = document.getElementById(loId);
    var hiEl   = document.getElementById(hiId);
    var loVEl  = document.getElementById(loValId);
    var hiVEl  = document.getElementById(hiValId);
    if (!loEl || !hiEl) return;

    function update() {
      var lo = parseFloat(loEl.value);
      var hi = parseFloat(hiEl.value);
      if (lo > hi) { lo = hi; loEl.value = lo; }  // clamp: lo ≤ hi
      if (loVEl) loVEl.textContent = fmtFn(lo);
      if (hiVEl) hiVEl.textContent = fmtFn(hi);
      updateFill(fillId, lo, hi, physMin, physMax);
      rangeArr[0] = lo;
      rangeArr[1] = hi;
    }
    loEl.addEventListener('input', update);
    hiEl.addEventListener('input', update);
  }

  var P = _vitalityParams;
  onRange('vdScaleLo','vdScaleHi','vdScaleLoVal','vdScaleHiVal','vdScaleFill', 0.3,4,  fmtMult, P.scaleRange);
  onRange('vdAmpLo',  'vdAmpHi',  'vdAmpLoVal',  'vdAmpHiVal',  'vdAmpFill',  0.2,3,  fmtMult, P.ampRange);
  onRange('vdSpeedLo','vdSpeedHi','vdSpeedLoVal','vdSpeedHiVal','vdSpeedFill', 0.2,3,  fmtMult, P.speedRange);
  onRange('vdFreqLo', 'vdFreqHi', 'vdFreqLoVal', 'vdFreqHiVal', 'vdFreqFill',  0.3,3,  fmt2,    P.freqRange);
  onRange('vdEdgeLo', 'vdEdgeHi', 'vdEdgeLoVal', 'vdEdgeHiVal', 'vdEdgeFill', 1,25,   fmtPx,   P.edgeRange);
  onRange('vdChrLo',  'vdChrHi',  'vdChrLoVal',  'vdChrHiVal',  'vdChrFill',  0,1,    fmt2,    P.chrRange);
  onRange('vdKLo',    'vdKHi',    'vdKLoVal',    'vdKHiVal',    'vdKFill',    1,30,   fmt2,    P.kRange);

  resetBtn && resetBtn.addEventListener('click', function() {
    P.scaleRange  = [0.8, 2.2];
    P.ampRange    = [0.7, 1.5];
    P.speedRange  = [0.7, 1.5];
    P.freqRange   = [1.06, 1.58];
    P.edgeRange   = [4.0, 14.0];
    P.kRange      = [4.0, 16.0];
    P.chrRange    = [0.3, 1.0];
    populateDialog();
  });

  saveBtn && saveBtn.addEventListener('click', function() {
    saveRanges();
    // Brief "Saved ✓" flash
    saveBtn.textContent = 'Saved ✓';
    saveBtn.classList.add('saved');
    setTimeout(function() {
      saveBtn.textContent = 'Save';
      saveBtn.classList.remove('saved');
    }, 1500);
  });
}

function renderVitality() {
  const canvas = document.getElementById('vitalityCanvas');
  if (!canvas) return;

  // ── Core fitness metrics ───────────────────────────────────────────────
  const ctl = state.fitness?.ctl ?? 0;
  const atl = state.fitness?.atl ?? 0;
  const tsb = state.fitness?.tsb ?? (ctl - atl);
  const rampRate = state.fitness?.rampRate ?? 0;

  // ── Update legend text ─────────────────────────────────────────────────
  const ctlEl = document.getElementById('vitalityCtl');
  const atlEl = document.getElementById('vitalityAtl');
  const tsbEl = document.getElementById('vitalityTsb');
  if (ctlEl) ctlEl.textContent = Math.round(ctl);
  if (atlEl) atlEl.textContent = Math.round(atl);
  if (tsbEl) tsbEl.textContent = (tsb >= 0 ? '+' : '') + Math.round(tsb);

  // ── Weekly aggregates (rides, hours, TSS) ──────────────────────────────
  const today = new Date();
  const weekStart = getWeekStart(today);
  const weekStartStr = toDateStr(weekStart);
  let weekRides = 0, weekHours = 0, weekTSS = 0;
  state.activities.forEach(a => {
    if (isEmptyActivity(a)) return;
    const d = (a.start_date_local || a.start_date || '').slice(0, 10);
    if (d < weekStartStr) return;
    weekRides++;
    weekTSS += actVal(a, 'icu_training_load', 'tss');
    weekHours += actVal(a, 'moving_time', 'elapsed_time', 'icu_moving_time', 'icu_elapsed_time') / 3600;
  });

  // ── Training streak (consecutive days) ─────────────────────────────────
  const daySet = new Set();
  state.activities.forEach(a => {
    if (!isEmptyActivity(a)) daySet.add((a.start_date_local || a.start_date || '').slice(0, 10));
  });
  const todayStr = toDateStr(today);
  let streak = 0;
  const startOff = daySet.has(todayStr) ? 0 : 1;
  for (let i = startOff; i < 365; i++) {
    if (daySet.has(toDateStr(new Date(Date.now() - i * 86400000)))) streak++;
    else break;
  }

  // ── Compute shader parameters ──────────────────────────────────────────
  const P = _vitalityParams;
  const maxScale = 120;

  // 1. Blob size — data-driven, scaled to Alex's radius range (25–81px on 400px canvas)
  //    Our shader: pxR = radii * resolution.y * 1.6, so radii = px / (res * 1.6)
  //    Base range mapped: 0.063 (small) → 0.203 (large)
  P.radii[0] = 0.063 + (ctl / maxScale) * 0.14;
  P.radii[1] = 0.063 + (atl / maxScale) * 0.14;
  const normTsb = (tsb + 50) / 100;
  P.radii[2] = 0.063 + normTsb * 0.14;

  // 2. Amplitude — Alex's range 49–93px on 400px canvas = 0.123–0.232
  //    Data modulates within this proven range
  const ampFactor = Math.min(1, weekHours / 15);
  P.ampMin = 0.12 + ampFactor * 0.06;   // 0.12 – 0.18
  P.ampMax = 0.22 + ampFactor * 0.08;   // 0.22 – 0.30

  // 3. Frequency — weekly rides spread the frequency from base toward max
  const freqFactor = Math.min(1, weekRides / 7);

  // 4. Pulse — ramp rate: positive=growing, negative=deflating, clamped -1 to 1
  P.pulse = Math.max(-1, Math.min(1, rampRate / 8));

  // 5. Distortion — ATL/CTL ratio: high ratio=wobbly stressed, low=smooth rested
  const aclRatio = ctl > 0 ? atl / ctl : 0;
  P.distortion = Math.max(0, Math.min(1, (aclRatio - 0.6) / 0.7));

  // 6. Glow — TSB freshness: +25=bright 1.0, 0=moderate 0.45, -30=dim 0.05
  P.glow = Math.max(0, Math.min(1, (tsb + 30) / 55));

  // 7. Saturation — streak consistency: 0 days=washed 0.4, 3=normal 0.85, 7+=vivid 1.3
  P.saturation = Math.min(1.3, 0.4 + (streak / 7) * 0.9);

  // 8. Particles — weekly TSS energy: 0=none, 300=moderate 0.5, 600+=full 1.0
  P.particles = Math.min(1, weekTSS / 600);

  // 9–14. Map each visual range to its data driver via lerp
  function _vLerp(a, b, t) { return a + Math.max(0, Math.min(1, t)) * (b - a); }
  const avgFitness = Math.min(1, (ctl + atl) / 240);  // 240 = 2 × maxScale
  const tssFactor  = Math.min(1, weekTSS / 600);
  P.scaleOvr  = _vLerp(P.scaleRange[0],  P.scaleRange[1],  avgFitness);
  P.ampMult   = _vLerp(P.ampRange[0],    P.ampRange[1],    ampFactor);
  P.speedMult = _vLerp(P.speedRange[0],  P.speedRange[1],  freqFactor);
  // Frequency: base = freqRange[0] always; max spreads toward freqRange[1] with more rides
  P.freqMin   = P.freqRange[0];
  P.freqMax   = _vLerp(P.freqRange[0],   P.freqRange[1],   freqFactor);
  P.edgeOvr   = _vLerp(P.edgeRange[0],   P.edgeRange[1],   P.glow);
  P.kOvr      = _vLerp(P.kRange[0],      P.kRange[1],      1 - P.distortion);
  P.chromatic = _vLerp(P.chrRange[0],    P.chrRange[1],    tssFactor);

  // ── Init WebGL + start loop ────────────────────────────────────────────
  if (!_vitalityGL) {
    _vitalityGL = _initVitalityShader(canvas);
    // Click interaction — blobs flee from click
    if (_vitalityGL) {
      function _vitalityHit(cx, cy) {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const P = _vitalityParams;
        P.clickTargetX = (cx - rect.left) * dpr;
        P.clickTargetY = (rect.height - (cy - rect.top)) * dpr;
        P.clickTarget = 1.0;
      }
      // Guard against duplicate listeners on repeated dashboard visits
      if (!canvas._vitalityListeners) {
        canvas.addEventListener('click', function(e) { _vitalityHit(e.clientX, e.clientY); });
        // Use touchend + movement check so scroll is never blocked
        let _vTouchStart = null;
        canvas.addEventListener('touchstart', function(e) {
          const t = e.touches[0];
          _vTouchStart = { x: t.clientX, y: t.clientY };
        }, { passive: true });
        canvas.addEventListener('touchend', function(e) {
          if (!_vTouchStart) return;
          const t = e.changedTouches[0];
          const dx = t.clientX - _vTouchStart.x;
          const dy = t.clientY - _vTouchStart.y;
          if (dx * dx + dy * dy < 100) _vitalityHit(t.clientX, t.clientY);
          _vTouchStart = null;
        }, { passive: true });
        canvas.style.cursor = 'pointer';
        canvas._vitalityListeners = true;
        _initVitalityDialog();
      }
    }
  }
  if (!_vitalityGL) return;

  if (!_vitalityRAF) _vitalityAnimLoop();
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
    if      (tsb > 25)  { fLabel = 'Peak Form';     fColor = ACCENT; fHint = 'Perfect for A-priority races'; }
    else if (tsb > 15)  { fLabel = 'Race Ready';    fColor = ACCENT; fHint = 'Target A-priority races now'; }
    else if (tsb > 5)   { fLabel = 'Fresh';         fColor = ACCENT; fHint = 'Good for B-priority races'; }
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
        borderColor: ACCENT,
        backgroundColor: 'rgba(0,229,160,0.08)',
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointBackgroundColor: ACCENT,
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

/* ── Today's Training Suggestion ──────────────────────── */

const TODAY_SUGGESTIONS = [
  { key: 'rest',     title: 'Rest Day',             desc: 'Your body needs recovery. Take the day off or do gentle stretching.',       color: 'grey'   },
  { key: 'recovery', title: 'Active Recovery',      desc: 'Easy spin, 30-45 min. Keep it in Z1 — legs moving, heart rate low.',       color: 'blue'   },
  { key: 'easy',     title: 'Easy Endurance',       desc: 'Steady Z2 ride, 1-1.5 hours. Build your aerobic base.',                    color: 'blue'   },
  { key: 'moderate', title: 'Moderate Ride',        desc: 'Endurance with some tempo. Z2-Z3 mix, 1-2 hours.',                         color: 'green'  },
  { key: 'quality',  title: 'Quality Session',      desc: 'Sweet spot or threshold work. Push Z3-Z4 intervals.',                      color: 'green'  },
  { key: 'hard',     title: 'High Intensity',       desc: 'Intervals or VO\u2082max efforts. You\'re fresh enough to go hard.',        color: 'orange' },
  { key: 'peak',     title: 'Peak Form \u2014 Go Hard', desc: 'Race-ready fitness. Make it count with a big effort!',                  color: 'orange' },
];

const _sgIcons = {
  rest:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 18a5 5 0 0 0-10 0"/><line x1="12" y1="9" x2="12" y2="2"/><line x1="4.22" y1="10.22" x2="5.64" y2="11.64"/><line x1="1" y1="18" x2="3" y2="18"/><line x1="21" y1="18" x2="23" y2="18"/><line x1="18.36" y1="11.64" x2="19.78" y2="10.22"/></svg>',
  recovery: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
  easy:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  moderate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
  quality:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  hard:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
  peak:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 3 18 9"/><polyline points="6 15 12 9 18 15"/><line x1="12" y1="9" x2="12" y2="21"/></svg>',
};

const _sgColorMap = {
  grey:   { bg: 'rgba(140,140,160,0.12)', fg: '#9ca3af', badge: 'Fatigued' },
  blue:   { bg: 'rgba(74,158,255,0.12)',  fg: '#4a9eff', badge: 'Tired'    },
  green:  { bg: 'rgba(0,229,160,0.12)',   fg: ACCENT, badge: 'Fresh'    },
  orange: { bg: 'rgba(255,107,53,0.12)',  fg: '#ff6b35', badge: 'Peak'     },
};

function renderTodaySuggestion() {
  const card    = document.getElementById('todaySuggestionCard');
  const titleEl = document.getElementById('todaySgTitle');
  const descEl  = document.getElementById('todaySgDesc');
  const iconEl  = document.getElementById('todaySgIcon');
  const badgeEl = document.getElementById('todaySgBadge');
  const ctxEl   = document.getElementById('todaySgContext');
  if (!card || !titleEl) return;

  // 1. TSB
  const tsb = state.fitness?.tsb ?? (state.fitness ? (state.fitness.ctl - state.fitness.atl) : null);
  if (tsb == null) {
    titleEl.textContent = '—';
    descEl.textContent  = 'Sync data to get your suggestion';
    if (badgeEl) { badgeEl.textContent = ''; badgeEl.style.cssText = ''; }
    if (iconEl)  iconEl.innerHTML = '';
    if (ctxEl)   ctxEl.innerHTML  = '';
    return;
  }

  // 2. Ramp rate
  const today  = new Date();
  const d7     = new Date(); d7.setDate(d7.getDate() - 7);
  const ctlNow  = computeCTLfromActivities(state.activities, today);
  const ctlPrev = computeCTLfromActivities(state.activities, d7);
  const ramp    = ctlNow - ctlPrev;

  // 3. Consecutive training days
  const daySet = new Set();
  state.activities.forEach(a => {
    if (!isEmptyActivity(a)) daySet.add((a.start_date_local || a.start_date || '').slice(0, 10));
  });
  const todayStr = toDateStr(today);
  let streak = 0;
  const startOff = daySet.has(todayStr) ? 0 : 1;
  for (let i = startOff; i < 365; i++) {
    if (daySet.has(toDateStr(new Date(Date.now() - i * 86400000)))) streak++;
    else break;
  }

  // 4. Zone distribution — last 7 days
  const cutoff7 = daysAgo(7);
  const week = state.activities.filter(a =>
    new Date(a.start_date_local || a.start_date) >= cutoff7 && !isEmptyActivity(a)
  );
  const zTotals = [0, 0, 0, 0, 0, 0];
  week.forEach(a => {
    (a.icu_zone_times || []).forEach(z => {
      const m = z.id?.match(/^Z(\d)$/);
      if (m) { const idx = parseInt(m[1]) - 1; if (idx >= 0 && idx < 6) zTotals[idx] += (z.secs || 0); }
    });
  });
  const zTotal  = zTotals.reduce((s, v) => s + v, 0);
  const highPct = zTotal > 0 ? (zTotals[3] + zTotals[4] + zTotals[5]) / zTotal : 0;
  const lowPct  = zTotal > 0 ? (zTotals[0] + zTotals[1]) / zTotal : 0;

  // 5. Base suggestion from TSB
  let idx;
  if      (tsb < -25) idx = 0; // rest
  else if (tsb < -15) idx = 1; // recovery
  else if (tsb <  -5) idx = 2; // easy
  else if (tsb <   5) idx = 3; // moderate
  else if (tsb <  15) idx = 4; // quality
  else if (tsb <  25) idx = 5; // hard
  else                idx = 6; // peak

  // 6. Modifiers
  let reason = '';
  if (streak >= 4 && idx > 1) {
    idx = Math.min(idx, 1); // cap at recovery
    reason = `${streak} days in a row — recovery needed`;
  } else if (ramp > 8 && idx > 2) {
    idx = Math.max(idx - 1, 2);
    reason = 'Fitness rising fast — don\'t overdo it';
  } else if (highPct > 0.4 && idx > 2) {
    idx = 2; // easy endurance
    reason = 'Lots of high intensity this week — aerobic base day';
  } else if (lowPct > 0.9 && zTotal > 0 && idx < 4) {
    idx = Math.max(idx, 4); // quality
    reason = 'All easy riding this week — time for some intensity';
  }

  const sg    = TODAY_SUGGESTIONS[idx];
  const cInfo = _sgColorMap[sg.color];

  // 7. Render
  titleEl.textContent = sg.title;
  descEl.textContent  = reason || sg.desc;

  if (iconEl) {
    iconEl.innerHTML = _sgIcons[sg.key] || '';
    iconEl.style.background = cInfo.bg;
    iconEl.style.color      = cInfo.fg;
  }

  if (badgeEl) {
    badgeEl.textContent    = cInfo.badge;
    badgeEl.style.background = cInfo.bg;
    badgeEl.style.color      = cInfo.fg;
  }

  // Context pills
  if (ctxEl) {
    const tsbSign = tsb >= 0 ? '+' : '';
    const rampSign = ramp >= 0 ? '+' : '';
    let pills = `<span class="today-sg-pill">TSB ${tsbSign}${Math.round(tsb)}</span>`;
    if (streak > 0) pills += `<span class="today-sg-pill">${streak} day${streak > 1 ? 's' : ''} in a row</span>`;
    pills += `<span class="today-sg-pill">Ramp ${rampSign}${ramp.toFixed(1)}/wk</span>`;
    ctxEl.innerHTML = pills;
  }
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

  state.fitnessChart = destroyChart(state.fitnessChart);
  state.fitnessChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [
      { label: 'CTL', data: ctlD, borderColor: ACCENT, backgroundColor: 'rgba(0,229,160,0.07)', borderWidth: 2, pointRadius: 0, pointHoverRadius: 7, tension: 0.4, fill: true },
      { label: 'ATL', data: atlD, borderColor: '#ff6b35', backgroundColor: 'rgba(255,107,53,0.05)', borderWidth: 2, pointRadius: 0, pointHoverRadius: 7, tension: 0.4 },
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'indexEager', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { ...C_TOOLTIP, callbacks: { labelColor: C_LABEL_COLOR } }
      },
      scales: {
        x: { grid: C_GRID, ticks: { ...C_TICK, maxTicksLimit: 8, color: 'transparent' } },
        y: { ...cScales({}).y, afterFit(axis) { axis.width = 45; } }
      }
    }
  });

  // ── Form (TSB) — separate panel below ──
  const formCanvas = document.getElementById('fitnessFormChart');
  if (formCanvas) {
    state._dashFormChart = destroyChart(state._dashFormChart);
    state._dashFormChart = new Chart(formCanvas.getContext('2d'), {
      type: 'line',
      data: { labels, datasets: [{
        label: 'Form', data: tsbD, borderColor: '#4a9eff', borderWidth: 2,
        pointRadius: 0, pointHoverRadius: 5, tension: 0.4, fill: true,
        backgroundColor: ctx => {
          const chart = ctx.chart;
          const { ctx: c, chartArea } = chart;
          if (!chartArea) return 'rgba(74,158,255,0.08)';
          const grad = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          grad.addColorStop(0, 'rgba(74,158,255,0.15)');
          grad.addColorStop(0.5, 'rgba(74,158,255,0.03)');
          grad.addColorStop(1, 'rgba(0,229,160,0.08)');
          return grad;
        },
        segment: { borderColor: ctx => { const v = ctx.p1.parsed.y; return v > 5 ? '#4a9eff' : v > -10 ? '#888' : ACCENT; } },
        pointBackgroundColor: ctx => { const v = (ctx.dataset.data[ctx.dataIndex] ?? 0); return v > 5 ? '#4a9eff' : v > -10 ? '#888' : ACCENT; }
      }]},
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'indexEager', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: { ...C_TOOLTIP, callbacks: { labelColor: C_LABEL_COLOR } }
        },
        scales: {
          ...cScales({ xExtra: { maxTicksLimit: 8 } }),
          y: { ...cScales({}).y, afterFit(axis) { axis.width = 45; }, title: { display: false }, grid: { color: 'rgba(255,255,255,0.04)' } }
        }
      }
    });
    _linkCharts(state.fitnessChart, 'fitnessChart', state._dashFormChart, '_dashFormChart');
  }
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
      datasets: [{ data: entries.map(([, v]) => Math.round(v)), backgroundColor: 'rgba(0,229,160,0.5)', hoverBackgroundColor: ACCENT, borderRadius: 4 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: { ...C_TOOLTIP, callbacks: { label: c => `${c.raw} TSS` } } },
      scales: cScales({ xGrid: false, yExtra: { maxTicksLimit: 4 } })
    }
  });
}

/* ====================================================
   CYCLING TRENDS — Energy System TSS Breakdown
==================================================== */
const ENERGY_SYSTEMS = [
  { name: 'Endure FTP',    zones: [0, 1], color: ACCENT },  // Z1+Z2
  { name: 'Breakaway MAP', zones: [2, 3], color: '#ff6b35' },  // Z3+Z4
  { name: 'Attack AC',     zones: [4],    color: '#ff4757' },   // Z5
  { name: 'Sprint NM',     zones: [5],    color: '#9b59f0' },   // Z6
];

/* ====================================================
   HEALTH METRICS  (Resting HR, HRV, Steps, Weight)
==================================================== */
function renderHealthMetrics(days) {
  const now = new Date();
  const cutoffStr = days ? toDateStr(new Date(now - days * 86400000)) : null;
  const entries = Object.values(state.wellnessHistory || {})
    .filter(e => e.id && (!cutoffStr || e.id >= cutoffStr))
    .sort((a, b) => a.id.localeCompare(b.id));

  if (!entries.length) return;

  const monthFmt = d => d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  const rangeStr = (arr) => {
    if (!arr.length) return '';
    return monthFmt(new Date(arr[0].id)) + ' – ' + monthFmt(new Date(arr[arr.length - 1].id));
  };

  // ── Shared chart builder ──
  function buildHealthChart({ canvasId, stateKey, data, labels, color, type, avgVal }) {
    state[stateKey] = destroyChart(state[stateKey]);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const datasets = [];
    if (type === 'bar') {
      datasets.push({
        data,
        backgroundColor: color + '55',
        borderRadius: 2,
        borderSkipped: false,
        barPercentage: 0.7,
        categoryPercentage: 0.9,
      });
    } else {
      const grad = ctx.getContext('2d').createLinearGradient(0, 0, 0, 140);
      grad.addColorStop(0, color + '30');
      grad.addColorStop(1, color + '05');
      datasets.push({
        data,
        borderColor: color,
        backgroundColor: grad,
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 3,
        tension: 0.35,
        fill: true,
      });
    }
    // Average dashed line
    if (avgVal != null) {
      datasets.push({
        data: new Array(data.length).fill(avgVal),
        borderColor: 'rgba(255,255,255,0.18)',
        borderWidth: 1,
        borderDash: [4, 3],
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: false,
      });
    }

    state[stateKey] = new Chart(ctx, {
      type: type === 'bar' ? 'bar' : 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...C_TOOLTIP,
            filter: item => item.datasetIndex === 0,
          },
        },
        scales: {
          x: {
            ticks: { ...C_TICK, maxTicksLimit: 6, maxRotation: 0, autoSkip: true },
            grid: { display: false },
            border: { display: false },
          },
          y: {
            ticks: C_TICK,
            grid: C_GRID,
            border: { display: false },
          },
        },
      },
    });
  }

  // ── 1. Resting HR ──
  const rhrData = entries.filter(e => e.restingHR != null);
  const rhrCard = document.getElementById('healthRHRCard');
  if (rhrData.length >= 3 && rhrCard) {
    rhrCard.style.display = '';
    const vals = rhrData.map(e => e.restingHR);
    const avg = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
    const min = Math.min(...vals);
    document.getElementById('healthRHRAvg').textContent = avg + ' bpm';
    document.getElementById('healthRHRMin').textContent = min + ' bpm';
    document.getElementById('healthRHRRange').textContent = rangeStr(rhrData);
    buildHealthChart({
      canvasId: 'healthRHRChart', stateKey: 'healthRHRChart',
      data: vals, labels: rhrData.map(e => e.id.slice(5)), // MM-DD
      color: '#ff375f', type: 'line', avgVal: avg,
    });
  } else if (rhrCard) { showCardNA('healthRHRCard'); }

  // ── 2. HRV ──
  const hrvData = entries.filter(e => (e.hrv ?? e.hrvSDNN) != null && (e.hrv ?? e.hrvSDNN) > 0);
  const hrvCard = document.getElementById('healthHRVCard');
  if (hrvData.length >= 3 && hrvCard) {
    hrvCard.style.display = '';
    const vals = hrvData.map(e => Math.round(e.hrv ?? e.hrvSDNN));
    const avg = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
    const max = Math.max(...vals);
    document.getElementById('healthHRVAvg').textContent = avg + ' ms';
    document.getElementById('healthHRVMax').textContent = max + ' ms';
    document.getElementById('healthHRVRange').textContent = rangeStr(hrvData);
    buildHealthChart({
      canvasId: 'healthHRVChart', stateKey: 'healthHRVChart',
      data: vals, labels: hrvData.map(e => e.id.slice(5)),
      color: '#ff375f', type: 'line', avgVal: avg,
    });
  } else if (hrvCard) { showCardNA('healthHRVCard'); }

  // ── 3. Steps ──
  const stepsData = entries.filter(e => e.steps != null && e.steps > 0);
  const stepsCard = document.getElementById('healthStepsCard');
  if (stepsData.length >= 3 && stepsCard) {
    stepsCard.style.display = '';
    const vals = stepsData.map(e => e.steps);
    const avg = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
    const total = vals.reduce((s, v) => s + v, 0);
    const fmtK = v => v >= 10000 ? (v / 1000).toFixed(0) + 'k' : v >= 1000 ? (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : v;
    document.getElementById('healthStepsAvg').textContent = fmtK(avg);
    document.getElementById('healthStepsTotal').textContent = total >= 1e6 ? (total / 1e6).toFixed(1) + 'M' : fmtK(total);
    document.getElementById('healthStepsRange').textContent = rangeStr(stepsData);
    buildHealthChart({
      canvasId: 'healthStepsChart', stateKey: 'healthStepsChart',
      data: vals, labels: stepsData.map(e => e.id.slice(5)),
      color: '#b8ff3e', type: 'bar', avgVal: avg,
    });
  } else if (stepsCard) { showCardNA('healthStepsCard'); }

  // ── 4. Weight ──
  const weightData = entries.filter(e => e.weight != null && e.weight > 0);
  const weightCard = document.getElementById('healthWeightCard');
  if (weightData.length >= 3 && weightCard) {
    weightCard.style.display = '';
    const vals = weightData.map(e => e.weight);
    const current = vals[vals.length - 1];
    const first = vals[0];
    const delta = current - first;
    document.getElementById('healthWeightCur').textContent = current.toFixed(1) + ' kg';
    document.getElementById('healthWeightDelta').textContent = (delta >= 0 ? '+' : '') + delta.toFixed(1) + ' kg';
    document.getElementById('healthWeightRange').textContent = rangeStr(weightData);
    buildHealthChart({
      canvasId: 'healthWeightChart', stateKey: 'healthWeightChart',
      data: vals, labels: weightData.map(e => e.id.slice(5)),
      color: '#4a9eff', type: 'line', avgVal: null,
    });
  } else if (weightCard) { showCardNA('healthWeightCard'); }
}

/* ====================================================
   WELLNESS INSIGHTS — combined wellness + cycling charts
==================================================== */
function renderWellnessInsights(days) {
  const now = new Date();
  const cutoffStr = days ? toDateStr(new Date(now - days * 86400000)) : null;
  const entries = Object.values(state.wellnessHistory || {})
    .filter(e => e.id && (!cutoffStr || e.id >= cutoffStr))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (!entries.length) return;

  // Build daily TSS map from activities
  const dailyTSS = {};
  (state.activities || []).forEach(a => {
    const d = (a.start_date_local || a.start_date || '').slice(0, 10);
    if (d) dailyTSS[d] = (dailyTSS[d] || 0) + (actVal(a, 'icu_training_load', 'tss') || 0);
  });

  // Simple linear regression helper
  function linReg(xs, ys) {
    const n = xs.length;
    if (n < 2) return { slope: 0, intercept: 0, r: 0 };
    const xM = xs.reduce((s, v) => s + v, 0) / n;
    const yM = ys.reduce((s, v) => s + v, 0) / n;
    let num = 0, dX = 0, dY = 0;
    for (let i = 0; i < n; i++) {
      const dx = xs[i] - xM, dy = ys[i] - yM;
      num += dx * dy; dX += dx * dx; dY += dy * dy;
    }
    const slope = dX ? num / dX : 0;
    return { slope, intercept: yM - slope * xM, r: (dX && dY) ? num / Math.sqrt(dX * dY) : 0 };
  }

  // Shared dual-axis scale config
  const dualScales = {
    x: { ticks: { ...C_TICK, maxTicksLimit: 6, maxRotation: 0, autoSkip: true }, grid: { display: false }, border: { display: false } },
    y:  { position: 'left',  ticks: { ...C_TICK, maxTicksLimit: 4 }, grid: C_GRID, border: { display: false } },
    y1: { position: 'right', ticks: { ...C_TICK, maxTicksLimit: 4 }, grid: { display: false }, border: { display: false } },
  };

  // ── 1. HRV vs Training Load ──
  (function() {
    const card = document.getElementById('insightHrvTssCard');
    if (!card) return;
    const labels = [], hrvVals = [], tssVals = [];
    for (let i = (days || 90); i >= 0; i--) {
      const d = toDateStr(daysAgo(i));
      const w = (state.wellnessHistory || {})[d];
      const hrv = w ? (w.hrv ?? w.hrvSDNN) : null;
      if (hrv != null && hrv > 0) {
        labels.push(d.slice(5));
        hrvVals.push(Math.round(hrv));
        tssVals.push(Math.round(dailyTSS[d] || 0));
      }
    }
    if (hrvVals.length < 7) { showCardNA('insightHrvTssCard'); return; }
    card.style.display = '';
    const hrvAvg = Math.round(hrvVals.reduce((s, v) => s + v, 0) / hrvVals.length);
    const tssAvg = Math.round(tssVals.reduce((s, v) => s + v, 0) / tssVals.length);
    document.getElementById('insightHrvAvg').textContent = hrvAvg + ' ms';
    document.getElementById('insightTssAvg').textContent = tssAvg;

    state.insightHrvTssChart = destroyChart(state.insightHrvTssChart);
    const ctx = document.getElementById('insightHrvTssChart');
    if (!ctx) return;
    state.insightHrvTssChart = new Chart(ctx, {
      data: { labels, datasets: [
        { type: 'line', label: 'HRV', data: hrvVals, borderColor: '#ff375f', backgroundColor: 'rgba(255,55,95,0.08)', borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 3, tension: 0.35, fill: true, yAxisID: 'y' },
        { type: 'bar', label: 'TSS', data: tssVals, backgroundColor: 'rgba(0,229,160,0.35)', borderRadius: 2, borderSkipped: false, barPercentage: 0.6, categoryPercentage: 0.9, yAxisID: 'y1' },
      ]},
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false }, tooltip: { ...C_TOOLTIP, callbacks: { labelColor: C_LABEL_COLOR, label: c => c.datasetIndex === 0 ? `HRV: ${c.raw} ms` : `TSS: ${c.raw}` } } },
        scales: dualScales,
      },
    });
  })();

  // ── 2. Resting HR vs CTL ──
  (function() {
    const card = document.getElementById('insightRhrCtlCard');
    if (!card) return;
    const labels = [], rhrVals = [], ctlVals = [];
    for (let i = (days || 90); i >= 0; i--) {
      const d = toDateStr(daysAgo(i));
      const w = (state.wellnessHistory || {})[d];
      if (w && w.restingHR != null && w.ctl != null) {
        labels.push(d.slice(5));
        rhrVals.push(w.restingHR);
        ctlVals.push(+w.ctl.toFixed(1));
      }
    }
    if (rhrVals.length < 7) { showCardNA('insightRhrCtlCard'); return; }
    card.style.display = '';
    document.getElementById('insightRhrCur').textContent = rhrVals[rhrVals.length - 1] + ' bpm';
    document.getElementById('insightCtlCur').textContent = Math.round(ctlVals[ctlVals.length - 1]);

    state.insightRhrCtlChart = destroyChart(state.insightRhrCtlChart);
    const ctx = document.getElementById('insightRhrCtlChart');
    if (!ctx) return;
    state.insightRhrCtlChart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [
        { label: 'Resting HR', data: rhrVals, borderColor: '#ff375f', backgroundColor: 'rgba(255,55,95,0.08)', borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 3, tension: 0.35, fill: true, yAxisID: 'y' },
        { label: 'CTL', data: ctlVals, borderColor: ACCENT, backgroundColor: 'rgba(0,229,160,0.08)', borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 3, tension: 0.35, fill: true, yAxisID: 'y1' },
      ]},
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false }, tooltip: { ...C_TOOLTIP, callbacks: { labelColor: C_LABEL_COLOR, label: c => c.datasetIndex === 0 ? `RHR: ${c.raw} bpm` : `CTL: ${c.raw}` } } },
        scales: dualScales,
      },
    });
  })();

  // ── 3. Training Load vs Weight (all weight data) ──
  (function() {
    const card = document.getElementById('insightTssWeightCard');
    if (!card) return;
    const weightEntries = entries.filter(e => e.weight != null && e.weight > 0);
    if (weightEntries.length < 7) { showCardNA('insightTssWeightCard'); return; }
    card.style.display = '';

    const labels = [], weightVals = [], tssVals = [];
    weightEntries.forEach(e => {
      labels.push(e.id.slice(5));
      weightVals.push(e.weight);
      tssVals.push(dailyTSS[e.id] || 0);
    });

    const current = weightVals[weightVals.length - 1];
    const delta = current - weightVals[0];
    document.getElementById('insightWeightCur').textContent = current.toFixed(1) + ' kg';
    document.getElementById('insightWeightDelta').textContent = (delta >= 0 ? '+' : '') + delta.toFixed(1) + ' kg';

    // Avg weekly TSS in the weight date range
    const startD = weightEntries[0].id, endD = weightEntries[weightEntries.length - 1].id;
    let rangeTss = 0;
    Object.keys(dailyTSS).forEach(d => { if (d >= startD && d <= endD) rangeTss += dailyTSS[d]; });
    const weeks = Math.max(1, (new Date(endD) - new Date(startD)) / (7 * 86400000));
    document.getElementById('insightWeeklyTss').textContent = Math.round(rangeTss / weeks);

    state.insightTssWeightChart = destroyChart(state.insightTssWeightChart);
    const ctx = document.getElementById('insightTssWeightChart');
    if (!ctx) return;
    state.insightTssWeightChart = new Chart(ctx, {
      data: { labels, datasets: [
        { type: 'line', label: 'Weight', data: weightVals, borderColor: '#4a9eff', backgroundColor: 'rgba(74,158,255,0.08)', borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 3, tension: 0.35, fill: true, yAxisID: 'y' },
        { type: 'bar', label: 'TSS', data: tssVals, backgroundColor: 'rgba(0,229,160,0.35)', borderRadius: 2, borderSkipped: false, barPercentage: 0.6, categoryPercentage: 0.9, yAxisID: 'y1' },
      ]},
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false }, tooltip: { ...C_TOOLTIP, callbacks: { labelColor: C_LABEL_COLOR, label: c => c.datasetIndex === 0 ? `Weight: ${c.raw.toFixed(1)} kg` : `TSS: ${c.raw}` } } },
        scales: dualScales,
      },
    });
  })();

  // ── 4. Rest-Day Steps vs Next-Day HRV (scatter) ──
  (function() {
    const card = document.getElementById('insightStepsHrvCard');
    if (!card) return;
    const wMap = state.wellnessHistory || {};
    const points = [];
    entries.forEach(e => {
      if ((dailyTSS[e.id] || 0) > 0) return; // not a rest day
      if (e.steps == null || e.steps <= 0) return;
      const nd = new Date(e.id); nd.setDate(nd.getDate() + 1);
      const nw = wMap[toDateStr(nd)];
      if (!nw) return;
      const nHrv = nw.hrv ?? nw.hrvSDNN;
      if (nHrv == null || nHrv <= 0) return;
      points.push({ x: e.steps, y: Math.round(nHrv) });
    });
    if (points.length < 7) { showCardNA('insightStepsHrvCard'); return; }
    card.style.display = '';

    const avgS = Math.round(points.reduce((s, p) => s + p.x, 0) / points.length);
    const avgH = Math.round(points.reduce((s, p) => s + p.y, 0) / points.length);
    const fmtK = v => v >= 10000 ? (v / 1000).toFixed(0) + 'k' : v >= 1000 ? (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(v);
    document.getElementById('insightRestSteps').textContent = fmtK(avgS);
    document.getElementById('insightNextHrv').textContent = avgH + ' ms';

    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const reg = linReg(xs, ys);
    const correlEl = document.getElementById('insightCorrelDir');
    if (Math.abs(reg.r) < 0.15) { correlEl.textContent = 'No clear link'; correlEl.style.color = ''; }
    else if (reg.r > 0) { correlEl.textContent = 'Positive ↑'; correlEl.style.color = ACCENT; }
    else { correlEl.textContent = 'Negative ↓'; correlEl.style.color = '#ff375f'; }

    const pColors = points.map(p => p.y >= avgH ? 'rgba(0,229,160,0.7)' : 'rgba(255,55,95,0.7)');
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const trend = [
      { x: xMin, y: +(reg.intercept + reg.slope * xMin).toFixed(1) },
      { x: xMax, y: +(reg.intercept + reg.slope * xMax).toFixed(1) },
    ];

    state.insightStepsHrvChart = destroyChart(state.insightStepsHrvChart);
    const ctx = document.getElementById('insightStepsHrvChart');
    if (!ctx) return;
    state.insightStepsHrvChart = new Chart(ctx, {
      type: 'scatter',
      data: { datasets: [
        { label: 'Rest Days', data: points, pointRadius: 4, pointHoverRadius: 6, pointBackgroundColor: pColors, pointBorderColor: pColors, pointBorderWidth: 0 },
        { label: 'Trend', data: trend, type: 'line', borderColor: 'rgba(255,255,255,0.3)', borderWidth: 1.5, borderDash: [5, 3], pointRadius: 0, pointHoverRadius: 0, fill: false },
      ]},
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'nearest', intersect: true },
        plugins: { legend: { display: false }, tooltip: { ...C_TOOLTIP, callbacks: { label: c => c.datasetIndex === 0 ? `Steps: ${c.raw.x.toLocaleString()} · HRV: ${c.raw.y} ms` : null } } },
        scales: {
          x: { type: 'linear', position: 'bottom', ticks: { ...C_TICK, maxTicksLimit: 5, callback: v => v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v }, grid: C_GRID, border: { display: false } },
          y: { ticks: { ...C_TICK, maxTicksLimit: 4 }, grid: C_GRID, border: { display: false } },
        },
      },
    });
  })();
}

/* ====================================================
   YEAR-TO-DATE  CUMULATIVE DISTANCE
==================================================== */
function renderYTDDistance() {
  const card = document.getElementById('ytdDistCard');
  if (!card) return;

  const now = new Date();
  const thisYear = now.getFullYear();
  const lastYear = thisYear - 1;

  const all = getAllActivities();
  const thisYearActs = [];
  const lastYearActs = [];

  all.forEach(a => {
    if (isEmptyActivity(a)) return;
    const d = a.start_date_local || a.start_date;
    if (!d) return;
    const yr = parseInt(d.slice(0, 4), 10);
    const dist = actVal(a, 'distance', 'icu_distance');
    if (!dist) return;
    if (yr === thisYear) thisYearActs.push({ date: d.slice(0, 10), dist });
    else if (yr === lastYear) lastYearActs.push({ date: d.slice(0, 10), dist });
  });

  if (!thisYearActs.length && !lastYearActs.length) { card.style.display = 'none'; return; }
  card.style.display = '';

  // Build cumulative km arrays — one entry per day of the year
  const daysInYear = yr => (new Date(yr, 1, 29).getMonth() === 1 ? 366 : 365);

  function buildCumulative(acts, year) {
    const nDays = daysInYear(year);
    const daily = new Array(nDays).fill(0);
    acts.forEach(({ date, dist }) => {
      const d = new Date(date);
      const dayOfYear = Math.floor((d - new Date(year, 0, 1)) / 86400000);
      if (dayOfYear >= 0 && dayOfYear < nDays) daily[dayOfYear] += dist / 1000; // m → km
    });
    const cum = [];
    let total = 0;
    for (let i = 0; i < nDays; i++) { total += daily[i]; cum.push(total); }
    return cum;
  }

  const cumThis = buildCumulative(thisYearActs, thisYear);
  const cumLast = buildCumulative(lastYearActs, lastYear);

  // Today's day-of-year index (0-based)
  const todayIdx = Math.floor((now - new Date(thisYear, 0, 1)) / 86400000);

  // Stats
  const thisTotal = cumThis[todayIdx] ?? cumThis[cumThis.length - 1] ?? 0;
  const lastTotal = cumLast.length > todayIdx ? (cumLast[todayIdx] ?? cumLast[cumLast.length - 1] ?? 0) : (cumLast[cumLast.length - 1] ?? 0);

  const fmt = v => v >= 1000 ? (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : Math.round(v).toString();

  document.getElementById('ytdThisYearVal').textContent = fmt(thisTotal) + ' km';
  document.getElementById('ytdLastYearVal').textContent  = fmt(lastTotal) + ' km';

  // Dynamic label — show which period we're comparing
  const lbl = document.getElementById('ytdLastYearLabel');
  if (lbl) {
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    lbl.textContent = `Jan – ${monthNames[now.getMonth()]} ${lastYear}`;
  }

  // Badge — % change vs same period last year
  const badge = document.getElementById('ytdBadge');
  if (lastTotal > 0) {
    const pctRaw = (thisTotal - lastTotal) / lastTotal * 100;
    const up = pctRaw >= 0;
    const pctStr = Math.abs(pctRaw) > 999 ? (up ? '+' : '-') + Math.round(Math.abs(pctRaw) / 100) + 'x' : (up ? '+' : '') + pctRaw.toFixed(0) + '%';
    badge.textContent = pctStr;
    badge.className = 'ytd-badge ' + (up ? 'up' : 'down');
  } else if (thisTotal > 0) {
    badge.textContent = 'New';
    badge.className = 'ytd-badge up';
  } else {
    badge.textContent = '';
    badge.className = 'ytd-badge';
  }

  // Month labels — first day-of-year index per month
  const monthStarts = [];
  const monthLabels = ['J','F','M','A','M','J','J','A','S','O','N','D'];
  for (let m = 0; m < 12; m++) {
    monthStarts.push(Math.floor((new Date(thisYear, m, 1) - new Date(thisYear, 0, 1)) / 86400000));
  }

  // Trim both arrays to show up to Dec 31 of this year (full year for last, up to today for this)
  const nDaysThis = daysInYear(thisYear);
  const labels = Array.from({ length: nDaysThis }, (_, i) => i);

  // Chart
  state.ytdDistChart = destroyChart(state.ytdDistChart);
  const ctx = document.getElementById('ytdDistChart').getContext('2d');

  // Gradient fill for this-year line
  const grad = ctx.createLinearGradient(0, 0, 0, 180);
  grad.addColorStop(0, 'rgba(0,229,160,0.25)');
  grad.addColorStop(1, 'rgba(0,229,160,0.02)');

  state.ytdDistChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: String(thisYear),
          data: cumThis.map((v, i) => i <= todayIdx ? v : null),
          borderColor: ACCENT,
          backgroundColor: grad,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.3,
          fill: true,
        },
        {
          label: String(lastYear),
          data: cumLast,
          borderColor: '#636366',
          borderWidth: 1.5,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.3,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 28 } },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...C_TOOLTIP,
          callbacks: {
            labelColor: C_LABEL_COLOR,
            label: c => `${c.dataset.label}: ${Math.round(c.raw)} km`,
          },
        },
      },
      scales: {
        x: {
          type: 'linear',
          min: 0,
          max: nDaysThis - 1,
          ticks: {
            ...C_TICK,
            callback: v => {
              const idx = monthStarts.indexOf(v);
              return idx >= 0 ? monthLabels[idx] : '';
            },
            autoSkip: false,
            maxRotation: 0,
          },
          afterBuildTicks: axis => { axis.ticks = monthStarts.map(v => ({ value: v })); },
          grid: { display: false },
          border: { display: false },
        },
        y: {
          ticks: {
            ...C_TICK,
            callback: v => v >= 1000 ? (v / 1000) + 'k' : v,
          },
          grid: C_GRID,
          border: { display: false },
        },
      },
    },
    plugins: [{
      id: 'ytdTodayLine',
      afterDraw(chart) {
        const xScale = chart.scales.x;
        const yScale = chart.scales.y;
        const x = xScale.getPixelForValue(todayIdx);
        if (x < xScale.left || x > xScale.right) return;
        const ctx2 = chart.ctx;
        ctx2.save();

        // Vertical dashed line
        ctx2.setLineDash([4, 3]);
        ctx2.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx2.lineWidth = 1;
        ctx2.beginPath();
        ctx2.moveTo(x, yScale.top);
        ctx2.lineTo(x, yScale.bottom);
        ctx2.stroke();

        // Dot on this-year line at today
        const yThis = yScale.getPixelForValue(thisTotal);
        ctx2.setLineDash([]);
        ctx2.fillStyle = ACCENT;
        ctx2.beginPath();
        ctx2.arc(x, yThis, 4, 0, Math.PI * 2);
        ctx2.fill();

        // Flag pill: this year's cumulative distance at today
        if (thisTotal > 0) {
          const label = fmt(thisTotal) + ' km';
          ctx2.font = '700 12px -apple-system, BlinkMacSystemFont, sans-serif';
          const tw = ctx2.measureText(label).width;
          const pad = 8;
          const flagW = tw + pad * 2;
          const flagH = 22;
          const flagX = Math.max(xScale.left, Math.min(x - flagW / 2, xScale.right - flagW));
          const flagY = yScale.top - flagH - 4;

          ctx2.fillStyle = ACCENT;
          ctx2.beginPath();
          ctx2.roundRect(flagX, flagY, flagW, flagH, flagH / 2);
          ctx2.fill();

          ctx2.fillStyle = '#0a0e14';
          ctx2.textAlign = 'center';
          ctx2.textBaseline = 'middle';
          ctx2.fillText(label, flagX + flagW / 2, flagY + flagH / 2);
        }

        ctx2.restore();
      },
    }],
  });
}

/* ====================================================
   POWER vs HEART RATE SCATTER  (colored by temperature)
==================================================== */
function renderPwrHrScatter(activities) {
  const card = document.getElementById('pwrHrScatterCard');
  if (!card) return;

  // Collect rides with both avg power and avg HR
  const points = [];
  let hasTemp = false;

  activities.forEach(a => {
    if (isEmptyActivity(a)) return;
    const pwr = actVal(a, 'icu_weighted_avg_watts', 'average_watts', 'icu_average_watts');
    const hr  = actVal(a, 'average_heartrate', 'icu_average_heartrate');
    if (pwr < 20 || hr < 60) return;

    const temp = a.average_temp != null ? a.average_temp : (a.weather_temp != null ? a.weather_temp : null);
    if (temp != null) hasTemp = true;

    points.push({
      x: Math.round(pwr),
      y: Math.round(hr),
      temp,
      name: a.name || 'Ride',
      date: (a.start_date_local || a.start_date || '').slice(0, 10),
    });
  });

  if (points.length < 5) { card.style.display = 'none'; return; }
  card.style.display = '';

  // Temperature gradient legend visibility
  const legendEl = document.getElementById('pwrHrTempLegend');
  if (legendEl) legendEl.style.display = hasTemp ? '' : 'none';

  // Map temperature to a 3-stop color: cold(#4a9eff) → mild(${ACCENT}) → hot(#ff6b35)
  function tempColor(t) {
    if (t == null) return 'rgba(100,120,160,0.65)';
    const n = Math.max(0, Math.min(1, (Math.max(-10, Math.min(35, t)) + 10) / 45));
    const lp = (a, b, f) => Math.round(a + (b - a) * f);
    if (n < 0.5) {
      const f = n / 0.5;
      return `rgba(${lp(74,0,f)},${lp(159,229,f)},${lp(255,160,f)},0.8)`;
    }
    const f = (n - 0.5) / 0.5;
    return `rgba(${lp(0,255,f)},${lp(229,107,f)},${lp(160,53,f)},0.8)`;
  }

  const colors = points.map(p => tempColor(p.temp));

  // Trend line via simple linear regression
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const n = xs.length;
  const xM = xs.reduce((s, v) => s + v, 0) / n;
  const yM = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0, dX = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - xM; num += dx * (ys[i] - yM); dX += dx * dx; }
  const slope = dX ? num / dX : 0, intercept = yM - slope * xM;
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const trendData = [
    { x: xMin, y: +(intercept + slope * xMin).toFixed(1) },
    { x: xMax, y: +(intercept + slope * xMax).toFixed(1) },
  ];

  // Update subtitle
  const sub = document.getElementById('pwrHrSubtitle');
  if (sub) sub.textContent = `${points.length} rides · ${hasTemp ? 'colored by temperature' : 'no temperature data'}`;

  state.pwrHrScatterChart = destroyChart(state.pwrHrScatterChart);
  const ctx = document.getElementById('pwrHrScatterChart');
  if (!ctx) return;

  state.pwrHrScatterChart = new Chart(ctx, {
    type: 'scatter',
    data: { datasets: [
      {
        label: 'Rides',
        data: points,
        pointRadius: 5,
        pointHoverRadius: 7,
        pointBackgroundColor: colors,
        pointBorderColor: colors,
        pointBorderWidth: 0,
      },
      {
        label: 'Trend',
        data: trendData,
        type: 'line',
        borderColor: 'rgba(255,255,255,0.2)',
        borderWidth: 1.5,
        borderDash: [5, 3],
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: false,
      },
    ]},
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: true },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...C_TOOLTIP,
          callbacks: {
            title: c => c[0]?.raw?.date || '',
            label: c => {
              if (c.datasetIndex !== 0) return null;
              const d = c.raw;
              const tStr = d.temp != null ? ` · ${Math.round(d.temp)}°C` : '';
              return `${d.name} · ${d.x}w · ${d.y} bpm${tStr}`;
            },
          },
        },
      },
      scales: {
        x: {
          type: 'linear',
          position: 'bottom',
          title: { display: true, text: 'Avg Power (w)', color: C_CLR_MUTED, font: { size: 10 } },
          ticks: { ...C_TICK, maxTicksLimit: 6 },
          grid: C_GRID,
          border: { display: false },
        },
        y: {
          title: { display: true, text: 'Avg HR (bpm)', color: C_CLR_MUTED, font: { size: 10 } },
          ticks: { ...C_TICK, maxTicksLimit: 5 },
          grid: C_GRID,
          border: { display: false },
        },
      },
    },
  });
}

function renderCyclingTrends(activities, days) {
  const card = document.getElementById('cyclingTrendsCard');
  if (!card) return;

  // Filter to activities with both zone data and TSS
  const withZones = activities.filter(a =>
    Array.isArray(a.icu_zone_times) &&
    a.icu_zone_times.some(z => z.id?.match(/^Z\d$/)) &&
    (a.icu_training_load || a.tss || 0) > 0
  );

  if (!withZones.length) { card.style.display = 'none'; return; }
  card.style.display = '';

  // For each activity, split TSS proportionally by zone time into 4 energy systems
  const dailyES = {};

  withZones.forEach(a => {
    const dateKey = (a.start_date_local || a.start_date || '').slice(0, 10);
    if (!dateKey) return;

    const zoneSecs = new Array(6).fill(0);
    a.icu_zone_times.forEach(z => {
      if (!z?.id) return;
      const m = z.id.match(/^Z(\d)$/);
      if (!m) return;
      const idx = +m[1] - 1;
      if (idx >= 0 && idx < 6) zoneSecs[idx] += (z.secs || 0);
    });

    const totalSecs = zoneSecs.reduce((s, v) => s + v, 0);
    if (totalSecs === 0) return;

    const tss = a.icu_training_load || a.tss || 0;
    if (!dailyES[dateKey]) dailyES[dateKey] = new Array(4).fill(0);
    ENERGY_SYSTEMS.forEach((es, esIdx) => {
      const esTime = es.zones.reduce((s, zi) => s + zoneSecs[zi], 0);
      dailyES[dateKey][esIdx] += tss * (esTime / totalSecs);
    });
  });

  // Group daily values into ISO weeks (Monday start)
  const weekMap = {};
  Object.entries(dailyES).forEach(([dateStr, vals]) => {
    const d = new Date(dateStr);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const mon = new Date(d);
    mon.setDate(d.getDate() + diff);
    const key = mon.toISOString().slice(0, 10);
    if (!weekMap[key]) weekMap[key] = new Array(4).fill(0);
    vals.forEach((v, i) => { weekMap[key][i] += v; });
  });

  const weeks = Object.keys(weekMap).sort();
  if (!weeks.length) { card.style.display = 'none'; return; }

  weeks.forEach(w => { weekMap[w] = weekMap[w].map(v => Math.round(v)); });

  // Build Chart.js stacked area datasets
  const labels = weeks.map(w => {
    const d = new Date(w);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  });

  const datasets = ENERGY_SYSTEMS.map((es, i) => ({
    label: es.name,
    data: weeks.map(w => weekMap[w][i]),
    borderColor: es.color,
    backgroundColor: es.color + '30',
    borderWidth: 2,
    pointRadius: 0,
    pointHoverRadius: 5,
    tension: 0.4,
    fill: true,
  }));

  // Render chart
  state.cyclingTrendsChart = destroyChart(state.cyclingTrendsChart);
  const ctx = document.getElementById('cyclingTrendsChart').getContext('2d');

  state.cyclingTrendsChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...C_TOOLTIP,
          callbacks: {
            labelColor: C_LABEL_COLOR,
            label: c => `${c.dataset.label}: ${c.raw} TSS`,
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          ticks: { ...C_TICK, maxTicksLimit: 10, maxRotation: 0, autoSkip: true },
          grid: { display: false },
          border: { display: false },
        },
        y: {
          stacked: true,
          ticks: C_TICK,
          grid: C_GRID,
          border: { display: false },
        },
      },
    },
  });

  // Update subtitle and range label
  const sub = document.getElementById('cyclingTrendsSub');
  if (sub) sub.textContent = `Energy system load · Last ${days} days`;

  const rlbl = document.getElementById('cyclingTrendsRangeLabel');
  if (rlbl) rlbl.textContent = rangeLabel(days);

  // Render legend badges
  _renderCyclingTrendsLegend(weeks, weekMap);
}

function _renderCyclingTrendsLegend(weeks, weekMap) {
  const el = document.getElementById('cyclingTrendsLegend');
  if (!el) return;

  const lastWeek = weeks.length >= 1 ? weekMap[weeks[weeks.length - 1]] : null;
  const prevWeek = weeks.length >= 2 ? weekMap[weeks[weeks.length - 2]] : null;

  el.innerHTML = ENERGY_SYSTEMS.map((es, i) => {
    const current = lastWeek ? lastWeek[i] : 0;

    let deltaHtml = '';
    if (prevWeek && prevWeek[i] > 0) {
      const diff = current - prevWeek[i];
      const pct = Math.round((diff / prevWeek[i]) * 100);
      const cls = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
      const sign = pct > 0 ? '+' : '';
      deltaHtml = `<span class="ct-legend-delta ${cls}">${sign}${pct}%</span>`;
    }

    return `<div class="ct-legend-item">
      <span class="ct-legend-dot" style="background:${es.color}"></span>
      <div class="ct-legend-text">
        <span class="ct-legend-label">${es.name}</span>
        <span class="ct-legend-value">${current} tl ${deltaHtml}</span>
      </div>
    </div>`;
  }).join('');
}

/* ====================================================
   INTENSITY DISTRIBUTION — Polarization Check
==================================================== */
function _showCardEmpty(card) {
  card.style.display = '';
  const bar = card.querySelector('.ti-dist-bar-wrap, .chart-wrap');
  const brk = card.querySelector('.ti-dist-breakdown');
  if (bar) bar.innerHTML = '<div class="card-empty-state">Not enough data yet</div>';
  if (brk) brk.innerHTML = '';
  const badge = card.querySelector('.ti-status-badge');
  if (badge) { badge.textContent = ''; badge.className = 'ti-status-badge'; }
}

function renderIntensityDist(activities) {
  const card = document.getElementById('intensityDistCard');
  if (!card) return;

  const withZones = activities.filter(a =>
    Array.isArray(a.icu_zone_times) && a.icu_zone_times.some(z => z.id?.match(/^Z\d$/))
  );
  if (!withZones.length) { _showCardEmpty(card); return; }
  card.style.display = '';

  // Sum zone seconds across all activities
  const zoneSecs = new Array(6).fill(0);
  withZones.forEach(a => {
    a.icu_zone_times.forEach(z => {
      if (!z?.id) return;
      const m = z.id.match(/^Z(\d)$/);
      if (!m) return;
      const idx = +m[1] - 1;
      if (idx >= 0 && idx < 6) zoneSecs[idx] += (z.secs || 0);
    });
  });

  const total = zoneSecs.reduce((s, v) => s + v, 0);
  if (total === 0) { _showCardEmpty(card); return; }

  // 3 buckets: Easy (Z1+Z2), Moderate (Z3), Hard (Z4+Z5+Z6)
  const easy = zoneSecs[0] + zoneSecs[1];
  const mod  = zoneSecs[2];
  const hard = zoneSecs[3] + zoneSecs[4] + zoneSecs[5];

  const easyPct = Math.round(easy / total * 100);
  const modPct  = Math.round(mod / total * 100);
  const hardPct = 100 - easyPct - modPct;

  // Status badge
  const badge = document.getElementById('intensityDistBadge');
  if (badge) {
    if (easyPct >= 75 && modPct <= 10) {
      badge.textContent = 'Polarized';
      badge.className = 'ti-status-badge good';
    } else if (easyPct >= 65) {
      badge.textContent = 'Pyramidal';
      badge.className = 'ti-status-badge neutral';
    } else {
      badge.textContent = 'Grey Zone Heavy';
      badge.className = 'ti-status-badge warning';
    }
  }

  // Title + icon color = dominant zone
  const titleEl = card.querySelector('.card-title');
  if (titleEl) {
    const domColor = easyPct >= modPct && easyPct >= hardPct ? 'var(--accent)'
                   : modPct >= hardPct ? 'var(--yellow)' : 'var(--red)';
    titleEl.style.color = domColor;
    const svg = titleEl.querySelector('svg');
    if (svg) svg.setAttribute('stroke', domColor);
  }

  // Stacked bar
  const barEl = document.getElementById('intensityDistBar');
  if (barEl) {
    barEl.innerHTML = `<div class="ti-dist-bar">
      <div class="ti-dist-seg" style="flex:${easyPct};background:var(--accent)">${easyPct}%</div>
      <div class="ti-dist-seg" style="flex:${modPct || 1};background:var(--yellow)">${modPct}%</div>
      <div class="ti-dist-seg" style="flex:${hardPct || 1};background:var(--red)">${hardPct}%</div>
    </div>`;
  }

  // Breakdown row
  const breakEl = document.getElementById('intensityDistBreakdown');
  if (breakEl) {
    const fmtTime = s => { const h = Math.floor(s / 3600); const m = Math.round((s % 3600) / 60); return h > 0 ? `${h}h ${m}m` : `${m}m`; };
    breakEl.innerHTML = `
      <div class="ti-dist-item">
        <div class="ti-dist-label">Easy (Z1–Z2)</div>
        <div class="ti-dist-val" style="color:var(--accent)">${easyPct}%</div>
        <div class="ti-dist-target">${fmtTime(easy)} · Target ~80%</div>
      </div>
      <div class="ti-dist-item">
        <div class="ti-dist-label">Moderate (Z3)</div>
        <div class="ti-dist-val" style="color:var(--yellow)">${modPct}%</div>
        <div class="ti-dist-target">${fmtTime(mod)} · Target <10%</div>
      </div>
      <div class="ti-dist-item">
        <div class="ti-dist-label">Hard (Z4–Z6)</div>
        <div class="ti-dist-val" style="color:var(--red)">${hardPct}%</div>
        <div class="ti-dist-target">${fmtTime(hard)} · Target ~20%</div>
      </div>`;
  }
}

/* ====================================================
   TRAINING MONOTONY & STRAIN
==================================================== */
function renderMonotony(activities, days) {
  const card = document.getElementById('monotonyCard');
  if (!card) return;

  // Build daily TSS map
  const dailyTSS = {};
  activities.forEach(a => {
    const d = (a.start_date_local || a.start_date || '').slice(0, 10);
    if (d) dailyTSS[d] = (dailyTSS[d] || 0) + (a.icu_training_load || a.tss || 0);
  });

  // Generate all dates in range, fill with 0 for rest days
  const allDays = [];
  for (let i = days; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    allDays.push({ date: key, tss: dailyTSS[key] || 0 });
  }

  if (allDays.length < 14) { _showCardEmpty(card); return; }
  card.style.display = '';

  // Rolling 7-day monotony windows
  const labels = [], monoData = [], strainData = [];
  for (let i = 6; i < allDays.length; i++) {
    const window = allDays.slice(i - 6, i + 1).map(d => d.tss);
    const sum  = window.reduce((s, v) => s + v, 0);
    const mean = sum / 7;
    const variance = window.reduce((s, v) => s + (v - mean) ** 2, 0) / 7;
    const stddev = Math.sqrt(variance);
    const mono = stddev > 0 ? +(mean / stddev).toFixed(2) : 0;
    const strain = Math.round(sum * mono);
    monoData.push(mono);
    strainData.push(strain);
    labels.push(allDays[i].date.slice(5));
  }

  if (!monoData.length) { card.style.display = 'none'; return; }

  // Current monotony for badge
  const currentMono = monoData[monoData.length - 1];
  const badge = document.getElementById('monotonyBadge');
  if (badge) {
    if (currentMono < 1.5) {
      badge.textContent = `${currentMono} · Low Risk`;
      badge.className = 'ti-status-badge good';
    } else if (currentMono < 2.0) {
      badge.textContent = `${currentMono} · Moderate`;
      badge.className = 'ti-status-badge warning';
    } else {
      badge.textContent = `${currentMono} · High Risk`;
      badge.className = 'ti-status-badge danger';
    }
  }

  // Chart
  state.monotonyChart = destroyChart(state.monotonyChart);
  const ctx = document.getElementById('monotonyChart').getContext('2d');

  state.monotonyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Monotony',
        data: monoData,
        borderColor: '#ff6b35',
        backgroundColor: 'rgba(255,107,53,0.08)',
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        tension: 0.4,
        fill: true,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { ...C_TOOLTIP, callbacks: { label: c => `Monotony: ${c.raw}` } },
        annotation: {
          annotations: {
            dangerLine: {
              type: 'line', yMin: 2.0, yMax: 2.0,
              borderColor: 'rgba(255,71,87,0.5)', borderWidth: 1, borderDash: [4, 4],
              label: { display: true, content: 'Risk', position: 'end', font: { size: 9 }, color: '#ff4757', backgroundColor: 'transparent' }
            }
          }
        }
      },
      scales: {
        x: { ticks: { ...C_TICK, maxTicksLimit: 8, maxRotation: 0, autoSkip: true }, grid: { display: false }, border: { display: false } },
        y: { ticks: C_TICK, grid: C_GRID, border: { display: false }, suggestedMin: 0, suggestedMax: 3 },
      },
    },
  });
}

/* ====================================================
   AEROBIC EFFICIENCY TREND — NP ÷ HR
==================================================== */
function renderAerobicEfficiency(activities, days) {
  const card = document.getElementById('aeCard');
  if (!card) return;

  // Filter rides with both NP and HR, duration > 30 min
  const qualifying = activities
    .filter(a => {
      const pwr = actVal(a, 'icu_weighted_avg_watts', 'average_watts');
      const hr  = actVal(a, 'average_heartrate', 'icu_average_heartrate');
      const dur = actVal(a, 'moving_time', 'icu_moving_time', 'elapsed_time');
      return pwr > 50 && hr > 50 && dur > 1800;
    })
    .sort((a, b) => new Date(a.start_date_local || a.start_date) - new Date(b.start_date_local || b.start_date));

  if (qualifying.length < 3) { _showCardEmpty(card); return; }
  card.style.display = '';

  const labels = qualifying.map(a => {
    const d = new Date(a.start_date_local || a.start_date);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  });
  const efs = qualifying.map(a => {
    const pwr = actVal(a, 'icu_weighted_avg_watts', 'average_watts');
    const hr  = actVal(a, 'average_heartrate', 'icu_average_heartrate');
    return +(pwr / hr).toFixed(3);
  });

  // Trend: compare last 3 vs first 3
  const n = Math.min(3, efs.length);
  const recent = efs.slice(-n).reduce((s, v) => s + v, 0) / n;
  const oldest = efs.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const pctChange = ((recent - oldest) / oldest * 100).toFixed(1);

  const badge = document.getElementById('aeBadge');
  if (badge) {
    const sign = pctChange >= 0 ? '+' : '';
    if (pctChange >= 1) {
      badge.textContent = `${sign}${pctChange}% · Improving`;
      badge.className = 'ti-status-badge good';
    } else if (pctChange <= -1) {
      badge.textContent = `${sign}${pctChange}% · Declining`;
      badge.className = 'ti-status-badge danger';
    } else {
      badge.textContent = `${sign}${pctChange}% · Stable`;
      badge.className = 'ti-status-badge neutral';
    }
  }

  const sub = document.getElementById('aeSub');
  if (sub) sub.textContent = `${recent.toFixed(2)} w/bpm · Last ${days} days`;

  state.aeChart = destroyChart(state.aeChart);
  const ctx = document.getElementById('aeChart').getContext('2d');

  state.aeChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Aerobic Efficiency',
        data: efs,
        borderColor: '#4a9eff',
        backgroundColor: 'rgba(74,158,255,0.08)',
        borderWidth: 2,
        pointRadius: 0,
        pointBackgroundColor: '#4a9eff',
        pointHoverRadius: 6,
        tension: 0.4,
        fill: true,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { ...C_TOOLTIP, callbacks: { label: c => `${c.raw.toFixed(3)} w/bpm` } },
      },
      scales: {
        x: { ticks: { ...C_TICK, maxTicksLimit: 8, maxRotation: 0, autoSkip: true }, grid: { display: false }, border: { display: false } },
        y: { ticks: { ...C_TICK, callback: v => v.toFixed(1) }, grid: C_GRID, border: { display: false } },
      },
    },
  });
}

/* ====================================================
   VOLUME RAMP RATE — Weekly Load Change %
==================================================== */
function renderRampRate(activities, days) {
  const card = document.getElementById('rampRateCard');
  if (!card) return;

  // Build weekly TSS totals
  const weekMap = {};
  activities.forEach(a => {
    const dateStr = (a.start_date_local || a.start_date || '').slice(0, 10);
    if (!dateStr) return;
    const d = new Date(dateStr);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const mon = new Date(d);
    mon.setDate(d.getDate() + diff);
    const key = mon.toISOString().slice(0, 10);
    weekMap[key] = (weekMap[key] || 0) + (a.icu_training_load || a.tss || 0);
  });

  const weeks = Object.keys(weekMap).sort();
  if (weeks.length < 3) { _showCardEmpty(card); return; }
  card.style.display = '';

  // Calculate % change week over week (skip first week — no baseline)
  const labels = [], rampData = [], colors = [];
  for (let i = 1; i < weeks.length; i++) {
    const prev = weekMap[weeks[i - 1]];
    const curr = weekMap[weeks[i]];
    const pct = prev > 0 ? Math.round((curr - prev) / prev * 100) : 0;
    rampData.push(pct);
    labels.push(new Date(weeks[i]).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }));
    colors.push(Math.abs(pct) <= 5 ? ACCENT : Math.abs(pct) <= 10 ? '#ff6b35' : '#ff4757');
  }

  // Current ramp rate for badge
  const currentRamp = rampData[rampData.length - 1];
  const badge = document.getElementById('rampRateBadge');
  const titleEl = document.getElementById('rampRateTitle');
  const iconEl  = document.getElementById('rampRateTitleIcon');
  const sign = currentRamp >= 0 ? '+' : '';
  let titleColor;
  if (Math.abs(currentRamp) <= 5) {
    if (badge) { badge.textContent = `${sign}${currentRamp}% · Safe`;    badge.className = 'ti-status-badge good'; }
    titleColor = ACCENT;
  } else if (Math.abs(currentRamp) <= 10) {
    if (badge) { badge.textContent = `${sign}${currentRamp}% · Caution`; badge.className = 'ti-status-badge warning'; }
    titleColor = '#ff6b35';
  } else {
    if (badge) { badge.textContent = `${sign}${currentRamp}% · Risky`;   badge.className = 'ti-status-badge danger'; }
    titleColor = '#ff4757';
  }
  if (titleEl) titleEl.style.color = titleColor;
  if (iconEl)  iconEl.setAttribute('stroke', titleColor);

  state.rampRateChart = destroyChart(state.rampRateChart);
  const ctx = document.getElementById('rampRateChart').getContext('2d');

  state.rampRateChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Ramp Rate',
        data: rampData,
        backgroundColor: colors,
        borderRadius: 4,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { ...C_TOOLTIP, callbacks: { label: c => `${c.raw > 0 ? '+' : ''}${c.raw}% week-over-week` } },
        annotation: {
          annotations: {
            safeLine: {
              type: 'line', yMin: 10, yMax: 10,
              borderColor: 'rgba(255,71,87,0.4)', borderWidth: 1, borderDash: [4, 4],
            },
            safeLineNeg: {
              type: 'line', yMin: -10, yMax: -10,
              borderColor: 'rgba(255,71,87,0.4)', borderWidth: 1, borderDash: [4, 4],
            }
          }
        }
      },
      scales: {
        x: { ticks: { ...C_TICK, maxTicksLimit: 8, maxRotation: 0, autoSkip: true }, grid: { display: false }, border: { display: false } },
        y: { ticks: { ...C_TICK, callback: v => v + '%' }, grid: C_GRID, border: { display: false } },
      },
    },
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
          backgroundColor: ACCENT,
          hoverBackgroundColor: ACCENT,
          borderWidth: 0,
          borderRadius: 4,
          order: 2
        },
        {
          label: '7-ride trend',
          data: trend,
          type: 'line',
          borderColor: '#ff6b35',
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

// Coggan power profile reference (W/kg) for radar chart normalisation — 12 durations
// Durations:         15s    30s    1m     2m     3m     5m     10m    15m    20m    30m    45m    60m
const COGGAN_POWER_PROFILE = {
  durations: [15, 30, 60, 120, 180, 300, 600, 900, 1200, 1800, 2700, 3600],
  labels:    ['15s','30s','1m','2m','3m','5m','10m','15m','20m','30m','45m','60m'],
  // Zone groupings for colored ring segments — 6 zones × 2 durations, short→long
  zones: [
    { name: 'Sprinting',  color: '#9b59f0', indices: [0, 1]   },   // 15s–30s  Anaerobic
    { name: 'Anaerobic',  color: '#ff4757', indices: [2, 3]   },   // 1m–2m    VO₂max
    { name: 'Threshold',  color: '#ff6b35', indices: [4, 5]   },   // 3m–5m    Threshold
    { name: 'Tempo',      color: '#f0c429', indices: [6, 7]   },   // 10m–15m  Tempo
    { name: 'Endurance',  color: ACCENT, indices: [8, 9]   },   // 20m–30m  Endurance
    { name: 'Recovery',   color: '#4a9eff', indices: [10, 11] },   // 45m–60m  Recovery
  ],
  categories: {
    //                  15s    30s    1m     2m     3m     5m     10m    15m    20m    30m    45m    60m
    'World Class': [24.04, 18.00, 11.50, 9.50,  8.80,  7.60,  7.00,  6.70,  6.40,  6.20,  6.10,  6.00],
    'Exceptional': [22.00, 16.00, 10.00, 8.20,  7.50,  6.50,  6.00,  5.80,  5.60,  5.40,  5.30,  5.20],
    'Excellent':   [19.00, 13.50,  8.50, 7.00,  6.50,  5.60,  5.20,  5.00,  4.80,  4.65,  4.55,  4.50],
    'Very Good':   [16.00, 11.50,  7.50, 6.00,  5.60,  4.80,  4.50,  4.35,  4.20,  4.05,  3.95,  3.90],
    'Good':        [13.50,  9.80,  6.50, 5.20,  4.80,  4.20,  3.90,  3.75,  3.60,  3.45,  3.35,  3.30],
    'Moderate':    [11.00,  8.00,  5.50, 4.40,  4.00,  3.50,  3.25,  3.12,  3.00,  2.85,  2.75,  2.70],
    'Fair':        [ 8.50,  6.50,  4.50, 3.60,  3.30,  2.80,  2.60,  2.50,  2.40,  2.25,  2.15,  2.10],
    'Untrained':   [ 6.00,  4.80,  3.50, 2.80,  2.50,  2.10,  1.95,  1.88,  1.80,  1.65,  1.55,  1.50],
  },
  // Level thresholds (percentile ranges for 8 levels)
  levels: [
    { name: 'World Class', label: 'LVL 8', min: 87.5 },
    { name: 'Elite',       label: 'LVL 7', min: 75.0 },
    { name: 'Exceptional', label: 'LVL 6', min: 62.5 },
    { name: 'Excellent',   label: 'LVL 5', min: 50.0 },
    { name: 'Sport',       label: 'LVL 4', min: 37.5 },
    { name: 'Good',        label: 'LVL 3', min: 25.0 },
    { name: 'Moderate',    label: 'LVL 2', min: 12.5 },
    { name: 'Fair',        label: 'LVL 1', min: 0 },
  ]
};

function _pprZoneLevel(normalized, indices) {
  const vals = indices.map(i => normalized[i]).filter(v => v > 0);
  if (!vals.length) return null;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  for (const lev of COGGAN_POWER_PROFILE.levels) {
    if (avg >= lev.min) return { avg, ...lev };
  }
  return { avg, name: 'Fair', label: 'LVL 1', min: 0 };
}

function classifyRiderProfile(norm) {
  const sprint = norm.slice(0, 4).reduce((a, b) => a + b, 0) / 4;
  const attack = norm.slice(4, 8).reduce((a, b) => a + b, 0) / 4;
  const climb  = norm.slice(8, 12).reduce((a, b) => a + b, 0) / 4;
  if (sprint > climb + 12 && sprint > attack + 8) return 'Sprinter';
  if (attack > sprint + 8 && attack > climb + 8)  return 'Pursuiter';
  if (climb > sprint + 12 && climb > attack + 8)  return 'Time Trialist';
  if (climb > sprint + 15)                        return 'Climber';
  return 'All-Rounder';
}

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

async function renderPowerCurve(unit) {
  const card = document.getElementById('powerCurveCard');
  if (!card) return;

  // Track current unit (default: watts)
  if (!unit) unit = state.powerCurveUnit || 'watts';
  state.powerCurveUnit = unit;

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

  const weight = state.athlete?.weight || 70;
  const isWkg = unit === 'wkg';

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
    const w = peakWatts(p.secs) || 0;
    if (!w) return '';
    if (isWkg) {
      return `<div class="curve-peak">
        <div class="curve-peak-val">${(w / weight).toFixed(2)}<span class="curve-peak-unit">w/kg</span></div>
        <div class="curve-peak-dur">${p.label}</div>
      </div>`;
    }
    return `<div class="curve-peak">
      <div class="curve-peak-val">${Math.round(w)}<span class="curve-peak-unit">w</span></div>
      <div class="curve-peak-dur">${p.label}</div>
    </div>`;
  }).join('');

  // Prepare chart data (use all available points as {x, y})
  const chartData = pc.secs
    .map((s, i) => ({ x: s, y: isWkg ? pc.watts[i] / weight : pc.watts[i] }))
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
        borderColor: ACCENT,
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
          label: ctx => isWkg
            ? `${ctx.parsed.y.toFixed(2)} W/kg`
            : `${Math.round(ctx.parsed.y)}w`,
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
          ticks: { ...C_TICK, callback: val => isWkg ? val.toFixed(1) : val }
        }
      }
    }
  });
}

function switchPowerCurveUnit(unit) {
  state.powerCurveUnit = unit;
  // Update toggle active state
  document.querySelectorAll('#pcUnitToggles .wkp-toggle-btn').forEach(btn => {
    btn.classList.toggle('wkp-toggle-btn--active', btn.dataset.pcUnit === unit);
  });
  renderPowerCurve(unit);
}

/* ====================================================
   POWER PROFILE RADAR  (dashboard card)
   Intervals.icu-style: purple fill, colored outer ring,
   watt labels, category breakdown cards.
==================================================== */

// Chart.js plugin: colored ring segments + watt labels around radar
const _pprRingPlugin = {
  id: 'pprRing',
  beforeDatasetsDraw(chart) {
    const scale = chart.scales.r;
    if (!scale) return;
    const cx = scale.xCenter, cy = scale.yCenter;
    // Use ~65% of drawingArea so gradient covers the shape, not the whole chart
    const shapeR = scale.drawingArea * 0.65;
    const grad = chart.ctx.createRadialGradient(cx, cy, 0, cx, cy, shapeR);
    grad.addColorStop(0,   'rgba(155, 100, 240, 0.55)');
    grad.addColorStop(0.5, 'rgba(130, 70, 220, 0.35)');
    grad.addColorStop(1,   'rgba(120, 50, 200, 0.30)');
    chart.data.datasets[0].backgroundColor = grad;
  },
  afterDraw(chart) {
    const meta = chart.getDatasetMeta(0);
    if (!meta || !meta.data.length) return;
    const { ctx } = chart;
    const scale = chart.scales.r;
    if (!scale) return;
    const cx = scale.xCenter, cy = scale.yCenter;
    const outerR = scale.drawingArea;
    // Guard: if layout hasn't settled, drawing area is too small — defer resize
    if (outerR < 30) { requestAnimationFrame(() => chart.resize()); return; }
    const ringW = 22;
    const n = meta.data.length;
    const startAngle = -Math.PI / 2;
    const step = (Math.PI * 2) / n;

    // Animation progress (0→1), defaults to 1 if not animating
    const p = chart.options.plugins.pprRing?._animProgress ?? 1;

    // Retrieve zone colors and watt data from chart config
    const zones = chart.options.plugins.pprRing?.zones || [];
    const rawWatts = chart.options.plugins.pprRing?.rawWatts || [];
    const labels = chart.options.plugins.pprRing?.labels || [];

    // Build index→color map from zones + detect light backgrounds needing dark text
    const colorMap = {};
    const lightBgSet = new Set();
    const _lightColors = ['#f0c429', ACCENT, '#ffd700', '#ffeb3b', '#4caf50'];
    zones.forEach(z => {
      const isLight = _lightColors.includes(z.color.toLowerCase());
      z.indices.forEach(i => { colorMap[i] = z.color; if (isLight) lightBgSet.add(i); });
    });

    const hoverIdx = chart.options.plugins.pprRing?._hoverIndex ?? -1;

    ctx.save();
    ctx.globalAlpha = p;
    // Draw colored arc segments — scale from centre
    const ringScale = 0.6 + 0.4 * p; // ring grows from 60% to 100%
    for (let i = 0; i < n; i++) {
      const a0 = startAngle + i * step - step / 2;
      const a1 = a0 + step;
      const color = colorMap[i] || '#62708a';
      const isHov = i === hoverIdx;
      const hovBump = isHov ? 6 : 0;
      ctx.beginPath();
      ctx.arc(cx, cy, (outerR - hovBump) * ringScale, a0, a1);
      ctx.arc(cx, cy, (outerR + ringW + hovBump) * ringScale, a1, a0, true);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.globalAlpha = isHov ? 1 : p;
      ctx.fill();
      if (isHov) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
      }
    }

    // Draw duration labels on ring (tangent-rotated) + watt values outside (always upright)
    // Labels fade in during the second half of the animation
    const labelAlpha = Math.max(0, (p - 0.4) / 0.6);
    for (let i = 0; i < n; i++) {
      const angle = startAngle + i * step;
      const isHov = i === hoverIdx;
      const hovBump = isHov ? 6 : 0;
      const labelR = (outerR + ringW / 2) * ringScale;
      const lx = cx + Math.cos(angle) * labelR;
      const ly = cy + Math.sin(angle) * labelR;

      ctx.globalAlpha = isHov ? 1 : labelAlpha;

      // Rotate label to follow the ring tangent — flip bottom labels so text is never upside-down
      ctx.save();
      ctx.translate(lx, ly);
      const rot = angle + Math.PI / 2;
      // If the label would be upside-down (bottom half), rotate an extra 180°
      const normRot = ((rot % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const flipped = normRot > Math.PI / 2 && normRot < Math.PI * 1.5;
      ctx.rotate(flipped ? rot + Math.PI : rot);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = isHov ? 'bold 16px system-ui, sans-serif' : 'bold 13px system-ui, sans-serif';
      ctx.fillStyle = lightBgSet.has(i) ? '#1a1a2e' : '#fff';
      ctx.fillText(labels[i] || '', 0, 0);
      ctx.restore();

      // Watt values outside ring — always upright
      const w = rawWatts[i];
      if (w && w > 0) {
        const valR = (outerR + ringW + 22 + hovBump) * ringScale;
        const vx = cx + Math.cos(angle) * valR;
        const vy = cy + Math.sin(angle) * valR;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = isHov ? 'bold 13px system-ui, sans-serif' : 'bold 10px system-ui, sans-serif';
        ctx.fillStyle = isHov ? '#f0f2fa' : '#9ba5be';
        ctx.fillText(Math.round(w) + 'w', vx, vy);
      }
    }
    ctx.restore();
  }
};

function renderPowerProfileRadar() {
  const card = document.getElementById('powerProfileCard');
  if (!card) return;

  const pc = state.powerCurve;
  const weight = state.athlete?.weight;
  if (!pc || !weight || weight <= 0) { card.style.display = 'none'; return; }

  // Build secs→watts lookup
  const lookup = {};
  pc.secs.forEach((s, i) => { if (pc.watts[i]) lookup[s] = pc.watts[i]; });
  function peakW(target) {
    if (lookup[target]) return lookup[target];
    let best = null, minD = Infinity;
    pc.secs.forEach(s => { const d = Math.abs(s - target); if (d < minD && lookup[s]) { minD = d; best = lookup[s]; } });
    return best;
  }

  const durations = COGGAN_POWER_PROFILE.durations;
  const rawWatts = durations.map(d => peakW(d) || 0);
  const rawWkg = rawWatts.map(w => w > 0 ? w / weight : 0);

  if (rawWkg.filter(v => v > 0).length < 3) { card.style.display = 'none'; return; }
  card.style.display = '';

  // Normalise 0-100 against Coggan table
  const cats = Object.values(COGGAN_POWER_PROFILE.categories);
  const normalized = rawWkg.map((wkg, i) => {
    const col = cats.map(c => c[i]);
    const min = col[col.length - 1]; // Untrained
    const max = col[0];               // World Class
    return wkg <= 0 ? 0 : Math.min(100, Math.max(0, ((wkg - min) / (max - min)) * 100));
  });
  // Display-scaled values: sqrt scaling with a floor so the shape is always visible
  const displayNorm = normalized.map(v => v <= 0 ? 0 : 20 + Math.sqrt(v / 100) * 80);

  // Classify & display rider type badge
  const riderType = classifyRiderProfile(normalized);
  document.getElementById('pprRiderTypeBadge').textContent = riderType;
  document.getElementById('powerProfileSubtitle').textContent =
    `${rawWkg.filter(v => v > 0).length}/${durations.length} durations · Last ${state.rangeDays} days`;

  // Zone category cards
  const cardsEl = document.getElementById('pprZoneCards');
  if (cardsEl) {
    cardsEl.innerHTML = COGGAN_POWER_PROFILE.zones.map(zone => {
      const level = _pprZoneLevel(normalized, zone.indices);
      if (!level) return '';
      const pct = Math.min(100, Math.round(level.avg));
      return `<div class="ppr-zone-card">
        <div class="ppr-zone-card-header">
          <span class="ppr-zone-dot" style="background:${zone.color}"></span>
          <span class="ppr-zone-name">${zone.name}</span>
          <span class="ppr-zone-level" style="color:${zone.color}">${level.name} · ${level.label}</span>
        </div>
        <div class="ppr-zone-bar-track">
          <div class="ppr-zone-bar-fill" style="width:${pct}%;background:${zone.color}"></div>
        </div>
      </div>`;
    }).join('');
  }

  // Render radar chart with grow-from-centre animation on scroll
  state.powerProfileRadarChart = destroyChart(state.powerProfileRadarChart);
  const ctx = document.getElementById('powerProfileRadarChart').getContext('2d');
  const zeroData = displayNorm.map(() => 0);

  state.powerProfileRadarChart = new Chart(ctx, {
    type: 'radar',
    plugins: [_pprRingPlugin],
    data: {
      labels: COGGAN_POWER_PROFILE.labels,
      datasets: [{
        label: 'Your Profile',
        data: [...zeroData],
        borderColor: 'transparent',
        backgroundColor: 'rgba(155, 89, 240, 0.18)', // overridden by _pprRingPlugin gradient
        borderWidth: 0,
        pointBackgroundColor: '#b47af5',
        pointBorderColor: '#b47af5',
        pointBorderWidth: 0,
        pointRadius: 2,
        pointHoverRadius: 5,
        fill: true,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: false,
      layout: { padding: { top: 66, bottom: 66, left: 66, right: 66 } },
      plugins: {
        legend: { display: false },
        pprRing: {
          zones: COGGAN_POWER_PROFILE.zones,
          rawWatts,
          rawWkg,
          normalized,
          labels: COGGAN_POWER_PROFILE.labels,
          _animProgress: 0,
          _hoverIndex: -1,
        },
        tooltip: {
          ...C_TOOLTIP,
          callbacks: {
            title: items => COGGAN_POWER_PROFILE.labels[items[0].dataIndex],
            label: ctx => {
              const i = ctx.dataIndex;
              const wkg = rawWkg[i];
              const w = rawWatts[i];
              if (wkg <= 0) return 'No data';
              return `${Math.round(w)}w · ${wkg.toFixed(2)} W/kg (${Math.round(normalized[i])}th pctl)`;
            },
          }
        }
      },
      scales: {
        r: {
          min: 0, max: 100,
          ticks: { stepSize: 10, display: false },
          grid: { color: 'rgba(255,255,255,0.12)', circular: true },
          angleLines: { color: 'rgba(255,255,255,0.12)' },
          pointLabels: { display: false }
        }
      }
    }
  });

  // Ensure correct dimensions after layout settles (fixes glitch on re-entry)
  requestAnimationFrame(() => {
    if (state.powerProfileRadarChart) state.powerProfileRadarChart.resize();
  });

  // Grow-from-centre animation triggered by IntersectionObserver
  const radarChart = state.powerProfileRadarChart;
  let _pprAnimated = false;
  const pprObs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !_pprAnimated) {
        _pprAnimated = true;
        pprObs.disconnect();
        radarChart.resize();
        const duration = 800;
        const start = performance.now();
        const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // easeInOutCubic
        function tick(now) {
          if (state.powerProfileRadarChart !== radarChart) return; // chart was replaced
          const elapsed = now - start;
          const t = Math.min(elapsed / duration, 1);
          const p = ease(t);
          radarChart.data.datasets[0].data = displayNorm.map(v => v * p);
          radarChart.options.plugins.pprRing._animProgress = p;
          radarChart.update('none');
          if (t < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      }
    });
  }, { threshold: 0.2 });
  pprObs.observe(card);
  _pageCleanupFns.push(() => pprObs.disconnect());

  // ── Ring hover: detect which segment the mouse is over ──
  const canvas = document.getElementById('powerProfileRadarChart');
  let _pprTooltip = document.getElementById('pprRingTooltip');
  if (!_pprTooltip) {
    _pprTooltip = document.createElement('div');
    _pprTooltip.id = 'pprRingTooltip';
    _pprTooltip.className = 'ppr-ring-tooltip';
    document.body.appendChild(_pprTooltip);
  }

  function pprHitTest(e) {
    const chart = state.powerProfileRadarChart;
    if (!chart) return -1;
    const scale = chart.scales.r;
    if (!scale) return -1;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height);
    const cx = scale.xCenter, cy = scale.yCenter;
    const dx = mx - cx, dy = my - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const p = chart.options.plugins.pprRing._animProgress ?? 1;
    const ringScale = 0.6 + 0.4 * p;
    const outerR = scale.drawingArea;
    const ringW = 22;
    const innerR = outerR * ringScale - 10;
    const outerRing = (outerR + ringW) * ringScale + 10;
    if (dist < innerR || dist > outerRing) return -1;
    // Determine which segment by angle
    const n = COGGAN_POWER_PROFILE.labels.length;
    const startAngle = -Math.PI / 2;
    const step = (Math.PI * 2) / n;
    let angle = Math.atan2(dy, dx);
    let rel = ((angle - startAngle + step / 2) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    return Math.floor(rel / step) % n;
  }

  function pprOnMove(e) {
    const chart = state.powerProfileRadarChart;
    if (!chart) return;
    const idx = pprHitTest(e);
    const prev = chart.options.plugins.pprRing._hoverIndex;
    if (idx === prev) {
      if (idx >= 0) {
        _pprTooltip.style.left = (e.clientX + 12) + 'px';
        _pprTooltip.style.top  = (e.clientY - 10) + 'px';
      }
      return;
    }
    chart.options.plugins.pprRing._hoverIndex = idx;
    chart.update('none');
    if (idx < 0) {
      _pprTooltip.style.display = 'none';
      canvas.style.cursor = '';
      return;
    }
    canvas.style.cursor = 'pointer';
    const opts = chart.options.plugins.pprRing;
    const w = opts.rawWatts[idx];
    const wkg = opts.rawWkg[idx];
    const pctl = opts.normalized[idx];
    const label = opts.labels[idx];
    // Find zone name for this index
    let zoneName = '';
    (opts.zones || []).forEach(z => { if (z.indices.includes(idx)) zoneName = z.name; });
    const levelObj = COGGAN_POWER_PROFILE.levels.find(l => pctl >= l.min) || {};
    _pprTooltip.innerHTML = `<div class="ppr-tt-title">${label} Peak</div>` +
      (w > 0
        ? `<div class="ppr-tt-row"><span class="ppr-tt-val">${Math.round(w)}w</span> · ${wkg.toFixed(2)} W/kg</div>
           <div class="ppr-tt-row">${zoneName} · ${levelObj.name || '—'}</div>
           <div class="ppr-tt-row">${Math.round(pctl)}th percentile</div>`
        : `<div class="ppr-tt-row">No data</div>`);
    _pprTooltip.style.display = '';
    _pprTooltip.style.left = (e.clientX + 12) + 'px';
    _pprTooltip.style.top  = (e.clientY - 10) + 'px';
  }

  function pprOnLeave() {
    const chart = state.powerProfileRadarChart;
    if (chart) { chart.options.plugins.pprRing._hoverIndex = -1; chart.update('none'); }
    if (_pprTooltip) _pprTooltip.style.display = 'none';
    canvas.style.cursor = '';
  }

  canvas.addEventListener('mousemove', pprOnMove);
  canvas.addEventListener('mouseleave', pprOnLeave);
  _pageCleanupFns.push(() => {
    canvas.removeEventListener('mousemove', pprOnMove);
    canvas.removeEventListener('mouseleave', pprOnLeave);
    if (_pprTooltip) _pprTooltip.style.display = 'none';
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
  document.querySelectorAll('#pwrRangePills button, #pwrRangePillTopbar button').forEach(b => {
    const isActive = +b.dataset.days === days;
    b.classList.toggle('active', isActive);
    if (isActive && b.closest('.floating-range-pill')) b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  });
  // Bust page-curve cache so it re-fetches for the new window
  state.powerPageCurve = null;
  state.powerPageCurveRange = null;
  noChartAnim(() => renderPowerPage());
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
  renderKjZoneChart(days, ftp);
  renderKjIntensityChart(days);
  renderKjEfficiencyChart(days);
  renderKjCumulativeChart(days);
  renderKjTssChart(days);
  renderKjCardiacChart(days);
  renderKjElevationChart(days);
  renderKjMetabolicChart(days);
  renderKjFuelingChart(days);
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
      <div class="pwr-zh-name"></div>
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
    borderColor: ACCENT,
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

  state.powerPageChart = destroyChart(state.powerPageChart);
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

  const barColors      = watts.map(w => w >= avgW ? 'rgba(0,229,160,0.75)' : 'rgba(0,229,160,0.25)');
  const barHoverColors = watts.map(w => w >= avgW ? ACCENT : 'rgba(0,229,160,0.5)');

  state.powerTrendChart = destroyChart(state.powerTrendChart);
  state.powerTrendChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'NP',
          data: watts,
          backgroundColor: barColors,
          hoverBackgroundColor: barHoverColors,
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
      interaction: { mode: 'index', intersect: false },
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

// ── kJ Energy helpers & cards ────────────────────────────────────────────────

function _getKj(a) {
  const secs = actVal(a, 'moving_time', 'icu_moving_time', 'elapsed_time');
  if (secs <= 0) return 0;

  // 1. Direct: average power × time
  const avgW = actVal(a, 'average_watts', 'icu_average_watts');
  if (avgW > 0) return avgW * secs / 1000;

  // 2. kilojoules field (Strava mechanical work)
  const kj = a.kilojoules;
  if (kj > 0) return kj;

  // 3. Normalized Power × 0.92 (estimate avg from NP via typical variability index)
  const np = actVal(a, 'icu_weighted_avg_watts');
  if (np > 0) return (np * 0.92) * secs / 1000;

  // 4. TSS + FTP → derive NP → estimate avg
  const ftp = state.athlete?.ftp;
  const tss = actVal(a, 'icu_training_load', 'tss');
  if (ftp > 0 && tss > 0) {
    const intf = Math.sqrt(tss * 3600 / (secs * ftp));
    const estNp = intf * ftp;
    return (estNp * 0.92) * secs / 1000;
  }

  // 5. Calories → ~25% mechanical efficiency
  const cals = actVal(a, 'calories', 'icu_calories');
  if (cals > 50) return cals * 0.25 * 4.184;

  return 0;
}

function _rollingAvg(arr, window) {
  return arr.map((_, i) => {
    const start = Math.max(0, i - window + 1);
    const slice = arr.slice(start, i + 1);
    return +(slice.reduce((s, v) => s + v, 0) / slice.length).toFixed(1);
  });
}

// Card 1: Weekly kJ by Zone (stacked bar)
function renderKjZoneChart(days, ftp) {
  const canvas = document.getElementById('kjZoneChart');
  if (!canvas) return;
  state.kjZoneChart = destroyChart(state.kjZoneChart);

  if (!ftp) return;

  const cutoff = Date.now() - days * 86400000;
  const acts = state.activities.filter(a =>
    new Date(a.start_date_local || a.start_date).getTime() >= cutoff
    && Array.isArray(a.icu_zone_times)
  );

  const weekMap = {};
  acts.forEach(a => {
    const d = new Date(a.start_date_local || a.start_date);
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1 - day);
    const mon = new Date(d); mon.setDate(d.getDate() + diff);
    mon.setHours(0, 0, 0, 0);
    const key = mon.toISOString().slice(0, 10);
    if (!weekMap[key]) weekMap[key] = new Array(6).fill(0);
    a.icu_zone_times.forEach(z => {
      if (!z?.id) return;
      const m = z.id.match(/^Z(\d)$/);
      if (!m) return;
      const idx = +m[1] - 1;
      if (idx >= 0 && idx < 6) {
        const { minPct, maxPct } = COGGAN_ZONES[idx];
        const midPct = (minPct + Math.min(maxPct, 1.5)) / 2;
        weekMap[key][idx] += ftp * midPct * (z.secs || 0) / 1000;
      }
    });
  });

  const weeks = Object.keys(weekMap).sort();
  if (!weeks.length) return;

  // Round values
  weeks.forEach(w => { weekMap[w] = weekMap[w].map(v => Math.round(v)); });

  const ZONE_COLORS_CHART = [
    'rgba(100,180,255,0.85)', 'rgba(0,229,160,0.85)', 'rgba(240,196,41,0.85)',
    'rgba(255,150,50,0.85)',  'rgba(255,71,87,0.85)',  'rgba(180,80,220,0.85)',
  ];
  const ZONE_HOVER_CHART = [
    'rgb(100,180,255)', 'rgb(0,229,160)', 'rgb(240,196,41)',
    'rgb(255,150,50)',  'rgb(255,71,87)',  'rgb(180,80,220)',
  ];
  const ZONE_LABELS = ['Z1 Recovery', 'Z2 Endurance', 'Z3 Tempo', 'Z4 Threshold', 'Z5 VO2max', 'Z6 Anaerobic'];

  const sub = document.getElementById('kjZoneSub');
  if (sub) sub.textContent = `kJ output per power zone · last ${days} days`;

  state.kjZoneChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: weeks.map(w => {
        const d = new Date(w);
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      }),
      datasets: ZONE_LABELS.map((label, i) => ({
        label,
        data: weeks.map(w => weekMap[w][i]),
        backgroundColor: ZONE_COLORS_CHART[i],
        hoverBackgroundColor: ZONE_HOVER_CHART[i],
        borderRadius: i === 5 ? 4 : 0,
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true, position: 'bottom',
          labels: { color: '#9ba5be', boxWidth: 12, font: { size: 10 }, padding: 12 },
        },
        tooltip: {
          ...C_TOOLTIP, mode: 'indexEager',
          callbacks: { label: item => `${item.dataset.label}: ${item.raw} kJ` },
        },
      },
      scales: {
        x: { stacked: true, ticks: { ...C_TICK, maxTicksLimit: 12 }, grid: { display: false }, border: { display: false } },
        y: { stacked: true, ticks: { ...C_TICK, callback: v => v + ' kJ' }, grid: C_GRID, border: { display: false } },
      },
    },
  });
}

// Card 2: kJ/hr Intensity Trend (bar + line)
function renderKjIntensityChart(days) {
  const canvas = document.getElementById('kjIntensityChart');
  if (!canvas) return;
  state.kjIntensityChart = destroyChart(state.kjIntensityChart);

  const cutoff = toDateStr(daysAgo(days));
  const acts = state.activities
    .filter(a => {
      const d = (a.start_date_local || a.start_date || '').slice(0, 10);
      return d >= cutoff && _getKj(a) > 0;
    })
    .sort((a, b) => (a.start_date_local || a.start_date || '').localeCompare(b.start_date_local || b.start_date || ''))
    .slice(-28);

  if (acts.length < 3) return;

  const labels = acts.map(a => (a.start_date_local || a.start_date || '').slice(5, 10).replace('-', '/'));
  const values = acts.map(a => {
    const kj   = _getKj(a);
    const hrs  = actVal(a, 'moving_time', 'icu_moving_time', 'elapsed_time') / 3600;
    return hrs > 0 ? +(kj / hrs).toFixed(1) : 0;
  });
  const trend = _rollingAvg(values, 7);

  const avg = +(values.reduce((s, v) => s + v, 0) / values.length).toFixed(0);
  const sub = document.getElementById('kjIntensitySub');
  if (sub) sub.textContent = `kJ/hr per ride · avg ${avg} kJ/hr`;

  state.kjIntensityChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'kJ/hr',
          data: values,
          backgroundColor: 'rgba(0,229,160,0.25)',
          hoverBackgroundColor: 'rgba(0,229,160,0.5)',
          borderRadius: 3,
          maxBarThickness: 14,
          order: 2,
        },
        {
          label: '7-ride avg',
          data: trend,
          type: 'line',
          borderColor: ACCENT,
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
          tension: 0.35,
          order: 1,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...C_TOOLTIP,
          callbacks: {
            label: ctx => ctx.datasetIndex === 0 ? `${ctx.parsed.y} kJ/hr` : `${ctx.parsed.y} kJ/hr avg`,
          },
        },
      },
      scales: {
        x: { grid: C_GRID, ticks: { ...C_TICK, maxRotation: 0, maxTicksLimit: 7 } },
        y: { grid: C_GRID, ticks: { ...C_TICK, callback: v => v + ' kJ/hr' } },
      },
    },
  });
}

// Card 3: Cumulative kJ Curve (area line)
function renderKjCumulativeChart(days) {
  const canvas = document.getElementById('kjCumulativeChart');
  if (!canvas) return;
  state.kjCumulativeChart = destroyChart(state.kjCumulativeChart);

  const cutoff = toDateStr(daysAgo(days));
  const acts = state.activities
    .filter(a => {
      const d = (a.start_date_local || a.start_date || '').slice(0, 10);
      return d >= cutoff && _getKj(a) > 0;
    })
    .sort((a, b) => (a.start_date_local || a.start_date || '').localeCompare(b.start_date_local || b.start_date || ''));

  if (acts.length < 2) return;

  const labels = acts.map(a => (a.start_date_local || a.start_date || '').slice(5, 10).replace('-', '/'));
  let running = 0;
  const cumulative = acts.map(a => { running += _getKj(a); return Math.round(running); });

  const sub = document.getElementById('kjCumulativeSub');
  if (sub) sub.textContent = `Running total · ${Math.round(running).toLocaleString()} kJ over ${days} days`;

  state.kjCumulativeChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Cumulative kJ',
        data: cumulative,
        borderColor: ACCENT,
        backgroundColor: 'rgba(0,229,160,0.08)',
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 6,
        fill: true,
        tension: 0.3,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...C_TOOLTIP,
          callbacks: { label: ctx => `${ctx.parsed.y.toLocaleString()} kJ total` },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { ...C_TICK, maxRotation: 0, maxTicksLimit: 8 } },
        y: { grid: C_GRID, ticks: { ...C_TICK, callback: v => v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v } },
      },
    },
  });
}

// Card 4: kJ per km Efficiency (bar + line)
function renderKjEfficiencyChart(days) {
  const canvas = document.getElementById('kjEfficiencyChart');
  if (!canvas) return;
  state.kjEfficiencyChart = destroyChart(state.kjEfficiencyChart);

  const cutoff = toDateStr(daysAgo(days));
  const acts = state.activities
    .filter(a => {
      const d = (a.start_date_local || a.start_date || '').slice(0, 10);
      const dist = actVal(a, 'distance', 'icu_distance');
      return d >= cutoff && _getKj(a) > 0 && dist > 1000;
    })
    .sort((a, b) => (a.start_date_local || a.start_date || '').localeCompare(b.start_date_local || b.start_date || ''))
    .slice(-28);

  if (acts.length < 3) return;

  const labels = acts.map(a => (a.start_date_local || a.start_date || '').slice(5, 10).replace('-', '/'));
  const values = acts.map(a => {
    const kj  = _getKj(a);
    const km  = actVal(a, 'distance', 'icu_distance') / 1000;
    return +(kj / km).toFixed(1);
  });
  const trend = _rollingAvg(values, 7);

  const avg = +(values.reduce((s, v) => s + v, 0) / values.length).toFixed(1);
  const sub = document.getElementById('kjEfficiencySub');
  if (sub) sub.textContent = `kJ per km · avg ${avg} kJ/km`;

  state.kjEfficiencyChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'kJ/km',
          data: values,
          backgroundColor: 'rgba(74,158,255,0.25)',
          hoverBackgroundColor: 'rgba(74,158,255,0.5)',
          borderRadius: 3,
          maxBarThickness: 14,
          order: 2,
        },
        {
          label: '7-ride avg',
          data: trend,
          type: 'line',
          borderColor: '#4a9eff',
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
          tension: 0.35,
          order: 1,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...C_TOOLTIP,
          callbacks: {
            label: ctx => ctx.datasetIndex === 0 ? `${ctx.parsed.y} kJ/km` : `${ctx.parsed.y} kJ/km avg`,
          },
        },
      },
      scales: {
        x: { grid: C_GRID, ticks: { ...C_TICK, maxRotation: 0, maxTicksLimit: 7 } },
        y: { grid: C_GRID, ticks: { ...C_TICK, callback: v => v + ' kJ/km' } },
      },
    },
  });
}

// Card 5: kJ/TSS Ratio (bar + line)
function renderKjTssChart(days) {
  const canvas = document.getElementById('kjTssChart');
  if (!canvas) return;
  state.kjTssChart = destroyChart(state.kjTssChart);

  const cutoff = toDateStr(daysAgo(days));
  const acts = state.activities
    .filter(a => {
      const d = (a.start_date_local || a.start_date || '').slice(0, 10);
      const tss = actVal(a, 'icu_training_load', 'tss');
      return d >= cutoff && _getKj(a) > 0 && tss > 5;
    })
    .sort((a, b) => (a.start_date_local || a.start_date || '').localeCompare(b.start_date_local || b.start_date || ''))
    .slice(-28);

  if (acts.length < 3) return;

  const labels = acts.map(a => (a.start_date_local || a.start_date || '').slice(5, 10).replace('-', '/'));
  const values = acts.map(a => {
    const kj  = _getKj(a);
    const tss = actVal(a, 'icu_training_load', 'tss');
    return +(kj / tss).toFixed(1);
  });
  const trend = _rollingAvg(values, 7);

  const avg = +(values.reduce((s, v) => s + v, 0) / values.length).toFixed(1);
  const sub = document.getElementById('kjTssSub');
  if (sub) sub.textContent = `kJ per TSS point · avg ${avg} kJ/TSS`;

  state.kjTssChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'kJ/TSS',
          data: values,
          backgroundColor: 'rgba(180,130,255,0.25)',
          hoverBackgroundColor: 'rgba(180,130,255,0.5)',
          borderRadius: 3, maxBarThickness: 14, order: 2,
        },
        {
          label: '7-ride avg',
          data: trend,
          type: 'line', borderColor: '#b482ff', borderWidth: 2,
          pointRadius: 0, fill: false, tension: 0.35, order: 1,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...C_TOOLTIP,
          callbacks: {
            label: ctx => ctx.datasetIndex === 0 ? `${ctx.parsed.y} kJ/TSS` : `${ctx.parsed.y} kJ/TSS avg`,
          },
        },
      },
      scales: {
        x: { grid: C_GRID, ticks: { ...C_TICK, maxRotation: 0, maxTicksLimit: 7 } },
        y: { grid: C_GRID, ticks: { ...C_TICK } },
      },
    },
  });
}

// Card 6: Cardiac Efficiency — Joules per heartbeat (bar + line)
function renderKjCardiacChart(days) {
  const canvas = document.getElementById('kjCardiacChart');
  if (!canvas) return;
  state.kjCardiacChart = destroyChart(state.kjCardiacChart);

  const cutoff = toDateStr(daysAgo(days));
  const acts = state.activities
    .filter(a => {
      const d = (a.start_date_local || a.start_date || '').slice(0, 10);
      const hr = actVal(a, 'average_heartrate', 'icu_average_heartrate');
      return d >= cutoff && _getKj(a) > 0 && hr > 30;
    })
    .sort((a, b) => (a.start_date_local || a.start_date || '').localeCompare(b.start_date_local || b.start_date || ''))
    .slice(-28);

  if (acts.length < 3) return;

  const labels = acts.map(a => (a.start_date_local || a.start_date || '').slice(5, 10).replace('-', '/'));
  const values = acts.map(a => {
    const kj = _getKj(a);
    const hr = actVal(a, 'average_heartrate', 'icu_average_heartrate');
    const secs = actVal(a, 'moving_time', 'icu_moving_time', 'elapsed_time');
    const totalBeats = hr * secs / 60;
    return totalBeats > 0 ? +((kj * 1000) / totalBeats).toFixed(2) : 0; // joules per beat
  });
  const trend = _rollingAvg(values, 7);

  const avg = +(values.reduce((s, v) => s + v, 0) / values.length).toFixed(1);
  const sub = document.getElementById('kjCardiacSub');
  if (sub) sub.textContent = `Joules per heartbeat · avg ${avg} J/beat`;

  state.kjCardiacChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'J/beat',
          data: values,
          backgroundColor: 'rgba(255,82,82,0.25)',
          hoverBackgroundColor: 'rgba(255,82,82,0.5)',
          borderRadius: 3, maxBarThickness: 14, order: 2,
        },
        {
          label: '7-ride avg',
          data: trend,
          type: 'line', borderColor: '#ff5252', borderWidth: 2,
          pointRadius: 0, fill: false, tension: 0.35, order: 1,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...C_TOOLTIP,
          callbacks: {
            label: ctx => ctx.datasetIndex === 0 ? `${ctx.parsed.y} J/beat` : `${ctx.parsed.y} J/beat avg`,
          },
        },
      },
      scales: {
        x: { grid: C_GRID, ticks: { ...C_TICK, maxRotation: 0, maxTicksLimit: 7 } },
        y: { grid: C_GRID, ticks: { ...C_TICK } },
      },
    },
  });
}

// Card 7: Climbing Cost — kJ per 100m elevation (bar + line)
function renderKjElevationChart(days) {
  const canvas = document.getElementById('kjElevationChart');
  if (!canvas) return;
  state.kjElevationChart = destroyChart(state.kjElevationChart);

  const cutoff = toDateStr(daysAgo(days));
  const acts = state.activities
    .filter(a => {
      const d = (a.start_date_local || a.start_date || '').slice(0, 10);
      const elev = actVal(a, 'total_elevation_gain', 'icu_total_elevation_gain');
      return d >= cutoff && _getKj(a) > 0 && elev > 100;
    })
    .sort((a, b) => (a.start_date_local || a.start_date || '').localeCompare(b.start_date_local || b.start_date || ''))
    .slice(-28);

  if (acts.length < 3) return;

  const labels = acts.map(a => (a.start_date_local || a.start_date || '').slice(5, 10).replace('-', '/'));
  const values = acts.map(a => {
    const kj   = _getKj(a);
    const elev = actVal(a, 'total_elevation_gain', 'icu_total_elevation_gain');
    return +(kj / (elev / 100)).toFixed(1); // kJ per 100m
  });
  const trend = _rollingAvg(values, 7);

  const avg = +(values.reduce((s, v) => s + v, 0) / values.length).toFixed(1);
  const sub = document.getElementById('kjElevationSub');
  if (sub) sub.textContent = `kJ per 100m climbed · avg ${avg}`;

  state.kjElevationChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'kJ/100m',
          data: values,
          backgroundColor: 'rgba(255,150,50,0.25)',
          hoverBackgroundColor: 'rgba(255,150,50,0.5)',
          borderRadius: 3, maxBarThickness: 14, order: 2,
        },
        {
          label: '7-ride avg',
          data: trend,
          type: 'line', borderColor: '#ff9632', borderWidth: 2,
          pointRadius: 0, fill: false, tension: 0.35, order: 1,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...C_TOOLTIP,
          callbacks: {
            label: ctx => ctx.datasetIndex === 0 ? `${ctx.parsed.y} kJ/100m` : `${ctx.parsed.y} kJ/100m avg`,
          },
        },
      },
      scales: {
        x: { grid: C_GRID, ticks: { ...C_TICK, maxRotation: 0, maxTicksLimit: 7 } },
        y: { grid: C_GRID, ticks: { ...C_TICK } },
      },
    },
  });
}

// Card 8: Metabolic Efficiency — mechanical kJ / total metabolic kJ (%)
function renderKjMetabolicChart(days) {
  const canvas = document.getElementById('kjMetabolicChart');
  if (!canvas) return;
  state.kjMetabolicChart = destroyChart(state.kjMetabolicChart);

  const cutoff = toDateStr(daysAgo(days));
  const acts = state.activities
    .filter(a => {
      const d = (a.start_date_local || a.start_date || '').slice(0, 10);
      const cals = actVal(a, 'calories', 'icu_calories');
      return d >= cutoff && _getKj(a) > 0 && cals > 50;
    })
    .sort((a, b) => (a.start_date_local || a.start_date || '').localeCompare(b.start_date_local || b.start_date || ''))
    .slice(-28);

  if (acts.length < 3) return;

  const labels = acts.map(a => (a.start_date_local || a.start_date || '').slice(5, 10).replace('-', '/'));
  const values = acts.map(a => {
    const mechKj = _getKj(a);
    const cals   = actVal(a, 'calories', 'icu_calories');
    const metabKj = cals * 4.184; // 1 kcal = 4.184 kJ
    return metabKj > 0 ? +((mechKj / metabKj) * 100).toFixed(1) : 0;
  });
  const trend = _rollingAvg(values, 7);

  const avg = +(values.reduce((s, v) => s + v, 0) / values.length).toFixed(1);
  const sub = document.getElementById('kjMetabolicSub');
  if (sub) sub.textContent = `Mechanical efficiency · avg ${avg}%`;

  state.kjMetabolicChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Efficiency',
          data: values,
          backgroundColor: 'rgba(0,229,160,0.25)',
          hoverBackgroundColor: 'rgba(0,229,160,0.5)',
          borderRadius: 3, maxBarThickness: 14, order: 2,
        },
        {
          label: '7-ride avg',
          data: trend,
          type: 'line', borderColor: ACCENT, borderWidth: 2,
          pointRadius: 0, fill: false, tension: 0.35, order: 1,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...C_TOOLTIP,
          callbacks: {
            label: ctx => ctx.datasetIndex === 0 ? `${ctx.parsed.y}% efficiency` : `${ctx.parsed.y}% avg`,
          },
        },
      },
      scales: {
        x: { grid: C_GRID, ticks: { ...C_TICK, maxRotation: 0, maxTicksLimit: 7 } },
        y: { grid: C_GRID, ticks: { ...C_TICK, callback: v => v + '%' } },
      },
    },
  });
}

// Card 9: Fueling Demand — kJ/hr bars color-coded by fueling zone
function renderKjFuelingChart(days) {
  const canvas = document.getElementById('kjFuelingChart');
  if (!canvas) return;
  state.kjFuelingChart = destroyChart(state.kjFuelingChart);

  const cutoff = toDateStr(daysAgo(days));
  const acts = state.activities
    .filter(a => {
      const d = (a.start_date_local || a.start_date || '').slice(0, 10);
      return d >= cutoff && _getKj(a) > 0;
    })
    .sort((a, b) => (a.start_date_local || a.start_date || '').localeCompare(b.start_date_local || b.start_date || ''))
    .slice(-28);

  if (acts.length < 3) return;

  const labels = acts.map(a => (a.start_date_local || a.start_date || '').slice(5, 10).replace('-', '/'));
  const values = acts.map(a => {
    const kj  = _getKj(a);
    const hrs = actVal(a, 'moving_time', 'icu_moving_time', 'elapsed_time') / 3600;
    return hrs > 0 ? Math.round(kj / hrs) : 0;
  });

  // Color by fueling zone: <600 green (hydration), 600-900 yellow (moderate), >900 red (aggressive)
  const barColors = values.map(v =>
    v >= 900 ? 'rgba(255,82,82,0.7)'  :
    v >= 600 ? 'rgba(255,204,0,0.7)'  :
               'rgba(0,229,160,0.7)'
  );
  const hoverColors = values.map(v =>
    v >= 900 ? 'rgb(255,82,82)'  :
    v >= 600 ? 'rgb(255,204,0)'  :
               'rgb(0,229,160)'
  );

  const sub = document.getElementById('kjFuelingSub');
  if (sub) {
    const high = values.filter(v => v >= 900).length;
    const mid  = values.filter(v => v >= 600 && v < 900).length;
    sub.textContent = `${high} high-fuel rides · ${mid} moderate · last ${days} days`;
  }

  state.kjFuelingChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'kJ/hr',
        data: values,
        backgroundColor: barColors,
        hoverBackgroundColor: hoverColors,
        borderRadius: 3,
        maxBarThickness: 16,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...C_TOOLTIP,
          callbacks: {
            label: ctx => {
              const v = ctx.parsed.y;
              const zone = v >= 900 ? 'Aggressive fueling needed' : v >= 600 ? 'Moderate fueling' : 'Hydration only';
              return `${v} kJ/hr — ${zone}`;
            },
          },
        },
        annotation: false,
      },
      scales: {
        x: { grid: { display: false }, ticks: { ...C_TICK, maxRotation: 0, maxTicksLimit: 10 }, border: { display: false } },
        y: { grid: C_GRID, ticks: { ...C_TICK, callback: v => v + ' kJ/hr' }, border: { display: false } },
      },
    },
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
  // Sync floating top pill
  const fp = document.getElementById('fitRangePillFloat');
  if (fp) {
    fp.querySelectorAll('button').forEach(b => {
      b.classList.toggle('active', parseInt(b.textContent) === days ||
        (b.textContent.trim() === '6m' && days === 180) ||
        (b.textContent.trim() === '1y' && days === 365));
    });
  }
  noChartAnim(() => {
    renderFitnessHistoryChart(days);
    renderFitnessWeeklyPageChart(days);
    renderFitnessMonthlyTable(days);
    renderFtpHistoryChart(days);
    renderPeriodizationChart(days);
    renderFitnessZoneDist(days);
    renderWellnessInsights(days);
    renderHealthMetrics(days);
  });
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

  const fd = state.fitnessRangeDays;
  renderFitnessStreak();
  renderFitnessWellness();
  renderFitnessHistoryChart(fd);
  renderFitnessHeatmap();
  renderFitnessWeeklyPageChart(fd);
  renderFitnessMonthlyTable(fd);
  renderBestEfforts();
  renderPrWall();
  renderRecoveryEstimation();
  renderRacePredictor();
  renderFatiguePredChart();
  renderFtpHistoryChart(fd);
  renderPeriodizationChart(fd);
  renderFitnessZoneDist(fd);
  renderHealthMetrics(fd);
  renderWellnessInsights(fd);
  _rIC(() => { if (window.refreshGlow) refreshGlow(); });
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

  const RAW_COLORS = ['#4a9eff',ACCENT,'#f0c429','#ff6b35','#ff4757','#9b59ff'];

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
  else if (z34r >= 0.40)                  { style='Sweet-spot'; styleColor=ACCENT; hint='Focused on productive threshold work'; }
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

  const _fitYAxisFix = axis => { axis.width = 45; };

  state.fitnessPageChart = destroyChart(state.fitnessPageChart);
  state.fitnessPageChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels, datasets: [
      { label: 'CTL', data: ctlD, borderColor: ACCENT, backgroundColor: 'rgba(0,229,160,0.08)', borderWidth: 2, pointRadius: 0, pointHoverRadius: 7, tension: 0.4, fill: true },
      { label: 'ATL', data: atlD, borderColor: '#ff6b35', backgroundColor: 'rgba(255,107,53,0.05)', borderWidth: 2, pointRadius: 0, pointHoverRadius: 7, tension: 0.4 },
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'indexEager', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { ...C_TOOLTIP, callbacks: { labelColor: C_LABEL_COLOR } }
      },
      scales: {
        x: { grid: C_GRID, ticks: { ...C_TICK, maxTicksLimit: 10, color: 'transparent' } },
        y: { ...cScales({}).y, afterFit: _fitYAxisFix }
      }
    }
  });

  // ── Form (TSB) — separate panel below ──
  const formCanvas = document.getElementById('fitnessPageFormChart');
  if (formCanvas) {
    state._fitFormChart = destroyChart(state._fitFormChart);
    state._fitFormChart = new Chart(formCanvas.getContext('2d'), {
      type: 'line',
      data: { labels, datasets: [{
        label: 'Form', data: tsbD, borderColor: '#4a9eff', borderWidth: 2,
        pointRadius: 0, pointHoverRadius: 5, tension: 0.4, fill: true,
        backgroundColor: ctx => {
          const chart = ctx.chart;
          const { ctx: c, chartArea } = chart;
          if (!chartArea) return 'rgba(74,158,255,0.08)';
          const grad = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          grad.addColorStop(0, 'rgba(74,158,255,0.15)');
          grad.addColorStop(0.5, 'rgba(74,158,255,0.03)');
          grad.addColorStop(1, 'rgba(0,229,160,0.08)');
          return grad;
        },
        segment: { borderColor: ctx => { const v = ctx.p1.parsed.y; return v > 5 ? '#4a9eff' : v > -10 ? '#888' : ACCENT; } },
        pointBackgroundColor: ctx => { const v = (ctx.dataset.data[ctx.dataIndex] ?? 0); return v > 5 ? '#4a9eff' : v > -10 ? '#888' : ACCENT; }
      }]},
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'indexEager', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: { ...C_TOOLTIP, callbacks: { labelColor: C_LABEL_COLOR } }
        },
        scales: {
          ...cScales({ xExtra: { maxTicksLimit: 10 } }),
          y: { ...cScales({}).y, afterFit: _fitYAxisFix, title: { display: false }, grid: { color: 'rgba(255,255,255,0.04)' } }
        }
      }
    });
    _linkCharts(state.fitnessPageChart, 'fitnessPageChart', state._fitFormChart, '_fitFormChart');
  }
}

/* ── Feature: FTP History Timeline ── */
function _buildFtpTimeline() {
  const all = getAllActivities().filter(a => !isEmptyActivity(a));
  const byDate = {};
  all.forEach(a => {
    const ftp = a.icu_ftp;
    if (!ftp || ftp <= 0) return;
    const d = (a.start_date_local || a.start_date || '').slice(0, 10);
    if (!d) return;
    if (!byDate[d] || ftp !== byDate[d]) byDate[d] = ftp;
  });
  const sorted = Object.entries(byDate).sort((a, b) => a[0].localeCompare(b[0]));
  // Keep only change-points (where FTP differs from previous)
  const timeline = [];
  let prev = null;
  sorted.forEach(([date, ftp]) => {
    if (ftp !== prev) { timeline.push({ date, ftp }); prev = ftp; }
  });
  return timeline;
}


function renderFtpHistoryChart(days) {
  const card = document.getElementById('fitFtpHistCard');
  if (!card) return;
  state.fitFtpHistChart = destroyChart(state.fitFtpHistChart);

  const timeline = _buildFtpTimeline();
  if (timeline.length < 2) { card.style.display = 'none'; return; }
  card.style.display = '';

  const now = new Date();
  const filtered = days > 0
    ? timeline.filter(p => (now - new Date(p.date)) / 86400000 <= days)
    : timeline;
  if (filtered.length < 2) { card.style.display = 'none'; return; }

  // Badge: current FTP + delta
  const badge = document.getElementById('fitFtpBadge');
  if (badge) {
    const curr = filtered[filtered.length - 1].ftp;
    const first = filtered[0].ftp;
    const delta = curr - first;
    const sign = delta >= 0 ? '+' : '';
    badge.textContent = `${curr}W · ${sign}${delta}W`;
    badge.className = 'trs-badge ' + (delta > 0 ? 'trs-badge--green' : delta < 0 ? 'trs-badge--red' : 'trs-badge--blue');
  }

  const labels = filtered.map(p => p.date.slice(5));
  const data   = filtered.map(p => p.ftp);
  const vals   = data.slice();
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const pad = Math.max(5, Math.round((maxV - minV) * 0.15));

  // Scatter colors: green for increases, red for decreases
  const scatterColors = filtered.map((p, i) => {
    if (i === 0) return '#4a9eff';
    return p.ftp >= filtered[i - 1].ftp ? ACCENT : '#ff4757';
  });

  const canvas = document.getElementById('fitFtpHistChart');
  if (!canvas) return;
  state.fitFtpHistChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'FTP', data, borderColor: ACCENT,
          backgroundColor: 'rgba(0,229,160,0.08)', borderWidth: 2.5,
          pointRadius: 0, pointHoverRadius: 7, tension: 0, stepped: 'before', fill: true
        },
        {
          label: 'Changes', data, type: 'scatter',
          pointRadius: 5, pointHoverRadius: 8, pointBackgroundColor: scatterColors,
          pointBorderColor: scatterColors, pointBorderWidth: 0, showLine: false
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...C_TOOLTIP,
          callbacks: {
            labelColor: C_LABEL_COLOR,
            label: c => c.datasetIndex === 0 ? `FTP: ${c.raw}W` : null
          }
        }
      },
      scales: cScales({
        xExtra: { maxTicksLimit: 8 },
        yExtra: { suggestedMin: minV - pad, suggestedMax: maxV + pad,
                  callback: v => v + 'W' }
      })
    }
  });
}

/* ── Feature: Fatigue Predictions ── */
function _computeRecentAvgDailyTSS(lookbackDays) {
  const now = new Date();
  let total = 0;
  state.activities.filter(a => !isEmptyActivity(a)).forEach(a => {
    const d = new Date(a.start_date_local || a.start_date);
    if ((now - d) / 86400000 <= lookbackDays) {
      total += (a.icu_training_load || a.tss || 0);
    }
  });
  return total / lookbackDays;
}

function setFatiguePredScenario(scenario) {
  state._fatiguePredScenario = scenario;
  document.getElementById('fitFatigueTabRest')     ?.classList.toggle('active', scenario === 'rest');
  document.getElementById('fitFatigueTabContinue') ?.classList.toggle('active', scenario === 'continue');
  renderFatiguePredChart();
}

function renderFatiguePredChart() {
  const card = document.getElementById('fitFatigueCard');
  if (!card) return;
  state.fitFatigueChart = destroyChart(state.fitFatigueChart);

  const fit = state.fitness;
  if (!fit || fit.ctl == null) { card.style.display = 'none'; return; }
  card.style.display = '';

  const scenario = state._fatiguePredScenario || 'rest';
  const avgDaily = _computeRecentAvgDailyTSS(28);

  // Build planned future TSS map
  const plannedTSS = {};
  getAllActivities().forEach(a => {
    const d = (a.start_date_local || a.start_date || '').slice(0, 10);
    const tss = a.icu_training_load || a.tss || 0;
    if (d && tss > 0) plannedTSS[d] = (plannedTSS[d] || 0) + tss;
  });

  let ctl = fit.ctl, atl = fit.atl;
  const labels = ['Today'], ctlD = [+ctl.toFixed(1)], atlD = [+atl.toFixed(1)], tsbD = [+(ctl - atl).toFixed(1)];

  let peakTSB = ctl - atl, peakDay = 0;
  for (let i = 1; i <= 14; i++) {
    const d = new Date(); d.setDate(d.getDate() + i);
    const ds = toDateStr(d);
    let dayTSS;
    if (plannedTSS[ds]) {
      dayTSS = plannedTSS[ds];
    } else {
      dayTSS = scenario === 'rest' ? 0 : avgDaily;
    }
    ctl = ctl + (dayTSS - ctl) / 42;
    atl = atl + (dayTSS - atl) / 7;
    const tsb = ctl - atl;
    if (tsb > peakTSB) { peakTSB = tsb; peakDay = i; }
    labels.push(i === 1 ? 'Tomorrow' : `+${i}d`);
    ctlD.push(+ctl.toFixed(1));
    atlD.push(+atl.toFixed(1));
    tsbD.push(+tsb.toFixed(1));
  }

  // Peak banner
  const banner = document.getElementById('fitPredPeakBanner');
  if (banner) {
    const peakDate = new Date(); peakDate.setDate(peakDate.getDate() + peakDay);
    const dateStr = peakDay === 0 ? 'Today' : peakDate.toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' });
    const badgeClass = peakTSB > 10 ? 'trs-badge--green' : peakTSB > 0 ? 'trs-badge--yellow' : 'trs-badge--red';
    const badgeText  = peakTSB > 10 ? 'Race Ready' : peakTSB > 0 ? 'Neutral' : 'Fatigued';
    banner.innerHTML = `<span class="fit-pred-peak-label">Peak Form</span>
      <span class="fit-pred-peak-date">${dateStr}</span>
      <span class="fit-pred-peak-tsb">TSB ${peakTSB >= 0 ? '+' : ''}${peakTSB.toFixed(1)}</span>
      <span class="trs-badge ${badgeClass}">${badgeText}</span>`;
  }

  const canvas = document.getElementById('fitFatigueChart');
  if (!canvas) return;
  const dashStyle = [5, 4];
  state.fitFatigueChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'CTL', data: ctlD, borderColor: ACCENT, borderWidth: 2, borderDash: dashStyle,
          pointRadius: (ctx) => ctx.dataIndex === 0 ? 5 : 0, pointBackgroundColor: ACCENT,
          pointHoverRadius: 7, tension: 0.3, fill: false },
        { label: 'ATL', data: atlD, borderColor: '#ff6b35', borderWidth: 2, borderDash: dashStyle,
          pointRadius: (ctx) => ctx.dataIndex === 0 ? 5 : 0, pointBackgroundColor: '#ff6b35',
          pointHoverRadius: 7, tension: 0.3, fill: false },
        { label: 'TSB', data: tsbD, borderColor: '#4a9eff', borderWidth: 2, borderDash: dashStyle,
          backgroundColor: 'rgba(74,158,255,0.06)',
          pointRadius: (ctx) => ctx.dataIndex === 0 ? 5 : 0,
          pointBackgroundColor: ctx => { const v = (ctx.dataset.data[ctx.dataIndex] ?? 0); return v > 5 ? '#4a9eff' : v > -10 ? '#888' : ACCENT; },
          segment: { borderColor: ctx => { const v = ctx.p1.parsed.y; return v > 5 ? '#4a9eff' : v > -10 ? '#888' : ACCENT; } },
          pointHoverRadius: 7, tension: 0.3, fill: true }
      ]
    },
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

/* ── Feature: Training Periodization ── */
const PERIOD_PHASES = {
  Recovery: { color: '#4a9eff', label: 'Recovery' },
  Base:     { color: ACCENT, label: 'Base' },
  Build:    { color: '#f0c429', label: 'Build' },
  Peak:     { color: '#ff6b35', label: 'Peak' },
  Race:     { color: '#ff4757', label: 'Race' },
};

function _classifyWeek({ weeklyTSS, rollingAvgTSS, rampRate, tsb }) {
  const ratio = rollingAvgTSS > 0 ? weeklyTSS / rollingAvgTSS : 1;
  if (tsb > 10 && ratio < 0.7)                    return 'Race';
  if (ratio < 0.6)                                 return 'Recovery';
  if (rampRate >= 5 && ratio >= 0.85)              return 'Build';
  if (tsb > 0 && ratio < 0.8)                      return 'Peak';
  return 'Base';
}


function renderPeriodizationChart(days) {
  const card = document.getElementById('fitPeriodCard');
  if (!card) return;
  state.fitPeriodChart = destroyChart(state.fitPeriodChart);

  // Build weekly TSS from activities
  const weekTSS = {};
  const now = new Date();
  const all = state.activities.filter(a => !isEmptyActivity(a));
  all.forEach(a => {
    const d = new Date(a.start_date_local || a.start_date);
    if (days > 0 && (now - d) / 86400000 > days) return;
    const wk = weekKey(d);
    weekTSS[wk] = (weekTSS[wk] || 0) + (a.icu_training_load || a.tss || 0);
  });

  // Build weekly CTL from wellness history
  const weekCTL = {};
  const wellness = state.wellnessHistory || {};
  Object.entries(wellness).forEach(([dateStr, w]) => {
    if (w && w.ctl != null) {
      const d = new Date(dateStr);
      if (days > 0 && (now - d) / 86400000 > days) return;
      const wk = weekKey(d);
      // Take the last (most recent) CTL in each week
      if (!weekCTL[wk] || dateStr > (weekCTL[wk]._date || '')) {
        weekCTL[wk] = { ctl: w.ctl, tsb: w.tsb ?? (w.ctl - (w.atl || w.ctl)), _date: dateStr };
      }
    }
  });

  const allWeeks = [...new Set([...Object.keys(weekTSS), ...Object.keys(weekCTL)])].sort();
  if (allWeeks.length < 4) { card.style.display = 'none'; return; }
  card.style.display = '';

  // Compute 4-week rolling avg TSS + ramp rate
  const weekData = allWeeks.map((wk, i) => {
    const tss = weekTSS[wk] || 0;
    const ctl = weekCTL[wk]?.ctl ?? null;
    const tsb = weekCTL[wk]?.tsb ?? 0;
    // 4-week rolling average
    let sum = 0, cnt = 0;
    for (let j = Math.max(0, i - 3); j <= i; j++) {
      sum += weekTSS[allWeeks[j]] || 0;
      cnt++;
    }
    const rollingAvg = cnt > 0 ? sum / cnt : tss;
    // Weekly ramp rate from CTL change
    let rampRate = 0;
    if (i > 0 && ctl != null) {
      const prevCtl = weekCTL[allWeeks[i - 1]]?.ctl;
      if (prevCtl != null) rampRate = ctl - prevCtl;
    }
    return { wk, tss, ctl, tsb, rollingAvg, rampRate };
  });

  // Classify each week
  const phases = weekData.map(w => _classifyWeek({
    weeklyTSS: w.tss, rollingAvgTSS: w.rollingAvg,
    rampRate: w.rampRate, tsb: w.tsb
  }));

  // Current phase badge
  const phaseBadge = document.getElementById('fitPeriodPhaseBadge');
  if (phaseBadge && phases.length) {
    const curr = phases[phases.length - 1];
    const pc = PERIOD_PHASES[curr];
    phaseBadge.textContent = pc.label;
    phaseBadge.style.background = pc.color + '22';
    phaseBadge.style.color = pc.color;
  }

  // Chart data
  const labels = weekData.map(w => 'W' + w.wk.slice(-2));
  const ctlData = weekData.map(w => w.ctl != null ? +w.ctl.toFixed(1) : null);
  const bandHeight = Math.max(...weekData.map(w => w.ctl || 0), ...weekData.map(w => w.tss || 0)) * 1.2 || 100;
  const bandData = weekData.map(() => bandHeight);
  const bandColors = phases.map(p => PERIOD_PHASES[p].color + '18');

  const canvas = document.getElementById('fitPeriodChart');
  if (!canvas) return;

  // Legend
  const legend = document.getElementById('fitPeriodLegend');
  if (legend) {
    legend.innerHTML = Object.entries(PERIOD_PHASES).map(([, p]) =>
      `<span class="fit-period-legend-item"><span class="fit-period-legend-dot" style="background:${p.color}"></span>${p.label}</span>`
    ).join('');
  }

  state.fitPeriodChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Phase', data: bandData, backgroundColor: bandColors,
          borderWidth: 0, borderRadius: 2, order: 2,
          barPercentage: 1.0, categoryPercentage: 1.0
        },
        {
          label: 'CTL', data: ctlData, type: 'line',
          borderColor: ACCENT, borderWidth: 2.5, pointRadius: 0,
          pointHoverRadius: 7, tension: 0.4, fill: false, order: 1,
          spanGaps: true
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...C_TOOLTIP,
          callbacks: {
            labelColor: C_LABEL_COLOR,
            label: c => {
              if (c.datasetIndex === 0) return `Phase: ${phases[c.dataIndex]}`;
              return `CTL: ${c.raw}`;
            }
          }
        }
      },
      scales: cScales({
        xGrid: false,
        xExtra: { maxRotation: 0, maxTicksLimit: 12 },
        yExtra: { suggestedMin: 0, maxTicksLimit: 5 }
      })
    }
  });
}

function renderFitnessWeeklyPageChart(days) {
  const canvas = document.getElementById('fitnessWeeklyPageChart');
  if (!canvas) return;
  state.fitnessWeeklyPageChart = destroyChart(state.fitnessWeeklyPageChart);

  const now = new Date();
  const cutoff = days ? new Date(now - days * 86400000) : null;
  const weeks = {};
  state.activities.forEach(a => {
    const d  = new Date(a.start_date_local || a.start_date);
    if (cutoff && d < cutoff) return;
    const wk = weekKey(d);
    weeks[wk] = (weeks[wk] || 0) + (a.icu_training_load || a.tss || 0);
  });
  const entries = Object.entries(weeks).sort((a, b) => a[0].localeCompare(b[0]));
  if (!entries.length) return;

  // Color bars by intensity relative to avg
  const vals   = entries.map(([, v]) => Math.round(v));
  const avg    = vals.reduce((s, v) => s + v, 0) / vals.length;
  const colors      = vals.map(v => v >= avg * 1.2 ? '#ff6b35' : v >= avg * 0.8 ? ACCENT : 'rgba(0,229,160,0.4)');
  const hoverColors = vals.map(v => v >= avg * 1.2 ? '#ff8c5a' : v >= avg * 0.8 ? '#33ffbc' : ACCENT);

  state.fitnessWeeklyPageChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: entries.map(([k]) => 'W' + k.slice(-2)),
      datasets: [{ data: vals, backgroundColor: colors, borderRadius: 4, hoverBackgroundColor: hoverColors }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { ...C_TOOLTIP, callbacks: { label: c => `${c.raw} TSS` } }
      },
      scales: cScales({ xGrid: false, xExtra: { maxRotation: 0 }, yExtra: { maxTicksLimit: 5 } })
    }
  });
}

function renderFitnessMonthlyTable(days) {
  const tbody = document.getElementById('fitMonthlyBody');
  if (!tbody) return;

  const now = new Date();
  const cutoff = days ? new Date(now - days * 86400000) : null;
  const months = {};
  state.activities.filter(a => !isEmptyActivity(a)).forEach(a => {
    if (cutoff) { const d = new Date(a.start_date_local || a.start_date); if (d < cutoff) return; }
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
   BEST DISTANCE EFFORTS — Fitness page
==================================================== */
const BEST_EFFORT_DISTANCES = [
  { meters: 5000,   label: '5 km'  },
  { meters: 10000,  label: '10 km' },
  { meters: 20000,  label: '20 km' },
  { meters: 30000,  label: '30 km' },
  { meters: 40000,  label: '40 km' },
  { meters: 50000,  label: '50 km' },
  { meters: 80000,  label: '80 km' },
  { meters: 90000,  label: '90 km' },
  { meters: 100000, label: '100 km' },
];

function fmtEffortTime(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.round(secs % 60);
  const ss = String(s).padStart(2, '0');
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function renderBestEfforts() {
  const grid = document.getElementById('fitBestEffortsGrid');
  if (!grid || !state.synced) return;

  const CYCLING_RE = /ride|cycling|bike|velo/i;

  const rides = (state.activities || []).filter(a => {
    if (isEmptyActivity(a)) return false;
    const sport = a.sport_type || a.type || '';
    if (!CYCLING_RE.test(sport)) return false;
    const dist = actVal(a, 'distance', 'icu_distance');
    const time = actVal(a, 'moving_time', 'elapsed_time', 'icu_moving_time', 'icu_elapsed_time');
    return dist > 0 && time > 0;
  });

  const results = BEST_EFFORT_DISTANCES.map(({ meters, label }) => {
    let best = null;
    for (const a of rides) {
      const dist = actVal(a, 'distance', 'icu_distance');
      if (dist < meters) continue;
      const time = actVal(a, 'moving_time', 'elapsed_time', 'icu_moving_time', 'icu_elapsed_time');
      const estTime = meters * time / dist;
      if (!best || estTime < best.estTime) {
        best = {
          estTime,
          avgSpeed: meters / estTime,
          date: a.start_date_local || a.start_date || '',
          name: a.name || '',
          activity: a,
        };
      }
    }
    return { label, meters, best };
  });

  grid.innerHTML = results.map(({ label, best }, idx) => {
    if (!best) {
      return `<div class="fit-kpi-card">
        <div class="fit-be-label">${label}</div>
        <div class="fit-be-time fit-be-time--empty">\u2014</div>
        <div class="fit-be-speed">No qualifying rides</div>
      </div>`;
    }
    const timeStr  = fmtEffortTime(best.estTime);
    const spd      = fmtSpeed(best.avgSpeed);
    const dateStr  = fmtDate(best.date);
    const actName  = best.name.length > 28 ? best.name.slice(0, 26) + '\u2026' : best.name;
    const metaLine = actName ? `${dateStr} \u00b7 ${actName}` : dateStr;
    return `<div class="fit-kpi-card fit-be-card--clickable" data-be-idx="${idx}">
      <div class="fit-be-label">${label}</div>
      <div class="fit-be-time">${timeStr}</div>
      <div class="fit-be-speed">${spd.val} ${spd.unit}</div>
      <div class="fit-be-meta" title="${best.name.replace(/"/g, '&quot;')} \u2014 ${dateStr}">${metaLine}</div>
    </div>`;
  }).join('');

  // Attach click handlers to navigate to the source activity
  grid.querySelectorAll('.fit-be-card--clickable').forEach(card => {
    const idx = +card.dataset.beIdx;
    const activity = results[idx]?.best?.activity;
    if (activity) card.onclick = () => navigateToActivity(activity);
  });
  if (window.refreshGlow) refreshGlow(grid);
}

/* ── Personal Records Wall ── */
function renderPrWall() {
  const grid = document.getElementById('prWallGrid');
  if (!grid || !state.synced) return;

  const CYCLING_RE = /ride|cycling|bike|velo|virtualride/i;
  const rides = (state.activities || []).filter(a => {
    if (isEmptyActivity(a)) return false;
    return CYCLING_RE.test(a.sport_type || a.type || '');
  });

  if (!rides.length) {
    grid.innerHTML = '<div class="pr-empty">No rides yet</div>';
    return;
  }

  const records = [
    { label: 'Longest Ride',       icon: '↔',  unit: 'km',
      val: a => (actVal(a, 'distance', 'icu_distance') || 0) / 1000,
      fmt: v => v.toFixed(1) },
    { label: 'Most Climbing',      icon: '▲',  unit: 'm',
      val: a => actVal(a, 'total_elevation_gain', 'icu_total_elevation_gain') || 0,
      fmt: v => Math.round(v).toLocaleString() },
    { label: 'Fastest Avg Speed',  icon: '⚡',  unit: 'km/h',
      val: a => {
        const d = actVal(a, 'distance', 'icu_distance') || 0;
        const t = actVal(a, 'moving_time', 'icu_moving_time') || 0;
        return t > 0 ? (d / t) * 3.6 : 0;
      },
      fmt: v => v.toFixed(1) },
    { label: 'Highest Avg Power',  icon: '🔋', unit: 'W',
      val: a => actVal(a, 'weighted_average_watts', 'icu_weighted_avg_watts', 'icu_average_watts', 'average_watts') || 0,
      fmt: v => Math.round(v) },
    { label: 'Biggest Load',       icon: '💪', unit: 'TSS',
      val: a => actVal(a, 'icu_training_load', 'suffer_score') || 0,
      fmt: v => Math.round(v) },
    { label: 'Most Calories',      icon: '🔥', unit: 'kcal',
      val: a => actVal(a, 'calories', 'icu_calories', 'kilojoules') || 0,
      fmt: v => Math.round(v).toLocaleString() },
  ];

  grid.innerHTML = records.map(r => {
    let best = null, bestVal = 0;
    for (const a of rides) {
      const v = r.val(a);
      if (v > bestVal) { bestVal = v; best = a; }
    }
    if (!best || bestVal <= 0) {
      return `<div class="pr-tile">
        <div class="pr-icon">${r.icon}</div>
        <div class="pr-label">${r.label}</div>
        <div class="pr-value">—</div>
      </div>`;
    }
    const dateStr = fmtDate(best.start_date_local || best.start_date || '');
    const name = (best.name || '').length > 24 ? (best.name || '').slice(0, 22) + '…' : (best.name || '');
    return `<div class="pr-tile pr-tile--clickable" data-pr-id="${best.id}">
      <div class="pr-icon">${r.icon}</div>
      <div class="pr-label">${r.label}</div>
      <div class="pr-value">${r.fmt(bestVal)} <span class="pr-unit">${r.unit}</span></div>
      <div class="pr-meta">${name} · ${dateStr}</div>
    </div>`;
  }).join('');

  // Click to navigate to source activity
  grid.querySelectorAll('.pr-tile--clickable').forEach(tile => {
    const id = tile.dataset.prId;
    const act = rides.find(a => String(a.id) === id);
    if (act) tile.onclick = () => navigateToActivity(act);
  });
  if (window.refreshGlow) refreshGlow(grid);
}

/* ====================================================
   RECOVERY ESTIMATION & RACE PREDICTOR
==================================================== */

function drawRecoveryGaugeSVG(score) {
  const el = document.getElementById('fitRecoveryGaugeSVG');
  if (!el) return;

  const CX = 100, CY = 115, R = 82, SW = 18;
  const val = Math.max(0, Math.min(100, score));

  const toA = v => Math.PI * (1 - Math.max(0, Math.min(100, v)) / 100);
  const px = a => (CX + R * Math.cos(a)).toFixed(1);
  const py = a => (CY - R * Math.sin(a)).toFixed(1);
  const arcPath = (a1, a2) => {
    const large = (a1 - a2) > Math.PI ? 1 : 0;
    return `M${px(a1)} ${py(a1)} A${R} ${R} 0 ${large} 1 ${px(a2)} ${py(a2)}`;
  };

  const Ro = R + SW / 2, Ri = R - SW / 2;
  const pxR = (a, r) => (CX + r * Math.cos(a)).toFixed(1);
  const pyR = (a, r) => (CY - r * Math.sin(a)).toFixed(1);
  const tubePath = (a1, a2, cap) => {
    const large = (a1 - a2) > Math.PI ? 1 : 0;
    if (cap === 'round') {
      return `M${pxR(a1, Ro)} ${pyR(a1, Ro)} A${Ro} ${Ro} 0 ${large} 1 ${pxR(a2, Ro)} ${pyR(a2, Ro)} `
           + `A${SW/2} ${SW/2} 0 0 1 ${pxR(a2, Ri)} ${pyR(a2, Ri)} `
           + `A${Ri} ${Ri} 0 ${large} 0 ${pxR(a1, Ri)} ${pyR(a1, Ri)} `
           + `A${SW/2} ${SW/2} 0 0 1 ${pxR(a1, Ro)} ${pyR(a1, Ro)}Z`;
    }
    return `M${pxR(a1, Ro)} ${pyR(a1, Ro)} A${Ro} ${Ro} 0 ${large} 1 ${pxR(a2, Ro)} ${pyR(a2, Ro)} `
         + `L${pxR(a2, Ri)} ${pyR(a2, Ri)} `
         + `A${Ri} ${Ri} 0 ${large} 0 ${pxR(a1, Ri)} ${pyR(a1, Ri)}Z`;
  };

  const color = val < 30 ? '#ff4757' : val < 60 ? '#f0c429' : ACCENT;

  // Tick marks at key boundaries
  const tickVals = [0, 30, 60, 100];
  let ticks = '';
  const dk = _isDark();
  tickVals.forEach(v => {
    const a = toA(v);
    const r1 = R + SW / 2 + 3, r2 = r1 + 7;
    ticks += `<line x1="${(CX + r1 * Math.cos(a)).toFixed(1)}" y1="${(CY - r1 * Math.sin(a)).toFixed(1)}" `
           + `x2="${(CX + r2 * Math.cos(a)).toFixed(1)}" y2="${(CY - r2 * Math.sin(a)).toFixed(1)}" `
           + `stroke="${dk ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}" stroke-width="1.5" stroke-linecap="round"/>`;
  });

  let s = `<defs>
    <linearGradient id="recTubeTrack" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${dk ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)'}"/>
      <stop offset="35%" stop-color="${dk ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'}"/>
      <stop offset="65%" stop-color="rgba(0,0,0,0.08)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.2)"/>
    </linearGradient>
    <linearGradient id="recTubeFillGreen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#5fffca"/>
      <stop offset="30%" stop-color="${ACCENT}"/>
      <stop offset="70%" stop-color="#00b87f"/>
      <stop offset="100%" stop-color="#008a60"/>
    </linearGradient>
    <linearGradient id="recTubeFillYellow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffe066"/>
      <stop offset="30%" stop-color="#f0c429"/>
      <stop offset="70%" stop-color="#d4a820"/>
      <stop offset="100%" stop-color="#a88518"/>
    </linearGradient>
    <linearGradient id="recTubeFillRed" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ff8a8a"/>
      <stop offset="30%" stop-color="#ff4757"/>
      <stop offset="70%" stop-color="#d63545"/>
      <stop offset="100%" stop-color="#a52835"/>
    </linearGradient>
    <linearGradient id="recTubeHighlight" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(255,255,255,0.25)"/>
      <stop offset="25%" stop-color="rgba(255,255,255,0.06)"/>
      <stop offset="50%" stop-color="rgba(255,255,255,0)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
    </linearGradient>
    <filter id="recGlow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="6" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="recDotGlow" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="3.5" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>`;

  s += ticks;

  // Tube track base
  s += `<path d="${tubePath(Math.PI * 0.999, Math.PI * 0.001, 'round')}" fill="rgba(10,12,20,0.6)"/>`;
  // Zone color hints
  const zones = [[0, 30, '#ff4757'], [30, 60, '#f0c429'], [60, 100, ACCENT]];
  zones.forEach(([lo, hi, c]) => {
    s += `<path d="${tubePath(toA(lo), toA(hi))}" fill="${c}" opacity="0.07"/>`;
  });
  // Gradient overlay
  s += `<path d="${tubePath(Math.PI * 0.999, Math.PI * 0.001, 'round')}" fill="url(#recTubeTrack)"/>`;

  // Active fill
  const fillGrad = color === ACCENT ? 'url(#recTubeFillGreen)' : color === '#f0c429' ? 'url(#recTubeFillYellow)' : 'url(#recTubeFillRed)';
  if (val > 1) {
    s += `<path d="${arcPath(Math.PI * 0.999, toA(val))}" fill="none" stroke="${color}" stroke-width="${SW + 10}" stroke-linecap="round" opacity="0.2" filter="url(#recGlow)"/>`;
    s += `<path d="${tubePath(Math.PI * 0.999, toA(val), 'round')}" fill="${fillGrad}"/>`;
    s += `<path d="${tubePath(Math.PI * 0.999, toA(val), 'round')}" fill="url(#recTubeHighlight)"/>`;
  }

  // Specular highlight on track
  const hiR = R + SW / 2 - 1;
  s += `<path d="M${pxR(Math.PI * 0.999, hiR)} ${pyR(Math.PI * 0.999, hiR)} A${hiR} ${hiR} 0 1 1 ${pxR(Math.PI * 0.001, hiR)} ${pyR(Math.PI * 0.001, hiR)}" `
     + `fill="none" stroke="${dk ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}" stroke-width="1.5" stroke-linecap="round"/>`;

  // Indicator dot
  const dx = px(toA(val)), dy = py(toA(val));
  s += `<circle cx="${dx}" cy="${dy}" r="7" fill="${color}" opacity="0.3" filter="url(#recDotGlow)"/>`;
  s += `<circle cx="${dx}" cy="${dy}" r="${SW/2 + 1}" fill="${color}"/>`;
  s += `<circle cx="${dx}" cy="${dy}" r="${SW/2 - 1}" fill="url(#recTubeHighlight)"/>`;
  s += `<circle cx="${dx}" cy="${dy}" r="3" fill="rgba(255,255,255,0.6)"/>`;

  el.innerHTML = s;
}

function renderRecoveryEstimation() {
  const card = document.getElementById('fitRecoveryCard');
  if (!card) return;

  const fit = state.fitness;
  if (!fit || fit.ctl == null) { card.style.display = 'none'; return; }

  const tsb = fit.tsb ?? 0;
  const atl = fit.atl ?? 0;
  const ctl = fit.ctl ?? 1;

  // TSB score: map [-30, +25] → [0, 100]
  const tsbScore = Math.max(0, Math.min(100, (tsb + 30) / 55 * 100));

  // HRV score: latest vs 7-day average
  const wellArr = Array.isArray(state.wellnessHistory)
    ? state.wellnessHistory
    : Object.values(state.wellnessHistory || {});
  const well = wellArr.filter(w => w && w.hrv > 0);
  let hrvScore = 50, hrvLatest = null, hrvAvg = null;
  if (well.length >= 2) {
    hrvLatest = well[well.length - 1].hrv;
    const recent7 = well.slice(-7);
    hrvAvg = recent7.reduce((s, w) => s + w.hrv, 0) / recent7.length;
    if (hrvAvg > 0) hrvScore = Math.max(0, Math.min(100, (hrvLatest / hrvAvg) * 50));
  }

  // Resting HR score: latest vs average (lower = more recovered)
  const wellHR = wellArr.filter(w => w && w.restingHR > 0);
  let hrScore = 50, hrLatest = null, hrAvg = null;
  if (wellHR.length >= 2) {
    hrLatest = wellHR[wellHR.length - 1].restingHR;
    const recent7 = wellHR.slice(-7);
    hrAvg = recent7.reduce((s, w) => s + w.restingHR, 0) / recent7.length;
    if (hrLatest > 0) hrScore = Math.max(0, Math.min(100, (hrAvg / hrLatest) * 50));
  }

  // Load score: ATL/CTL ratio — lower = more recovered
  const ratio = ctl > 0 ? atl / ctl : 1;
  const loadScore = Math.max(0, Math.min(100, (1.5 - ratio) / 1.0 * 100));

  // Composite
  const composite = Math.round(0.40 * tsbScore + 0.25 * hrvScore + 0.20 * hrScore + 0.15 * loadScore);

  card.style.display = '';
  drawRecoveryGaugeSVG(composite);

  // Label
  const pctEl = document.getElementById('fitRecoveryPct');
  const labelEl = document.getElementById('fitRecoveryLabel');
  if (pctEl) pctEl.textContent = composite + '%';
  const statusText = composite >= 75 ? 'Well Recovered' : composite >= 50 ? 'Moderately Recovered' : composite >= 30 ? 'Fatigued' : 'Very Fatigued';
  if (labelEl) labelEl.textContent = statusText;

  // Sub-metric cards
  const metricsEl = document.getElementById('fitRecoveryMetrics');
  if (metricsEl) {
    const tsbColor = tsb >= 5 ? 'var(--accent)' : tsb >= -10 ? 'var(--yellow)' : 'var(--red)';
    const hrvTrend = hrvLatest && hrvAvg ? (hrvLatest >= hrvAvg ? '↑' : '↓') : '';
    const hrvColor = hrvLatest && hrvAvg ? (hrvLatest >= hrvAvg ? 'var(--accent)' : 'var(--red)') : 'var(--text-secondary)';
    const hrTrend = hrLatest && hrAvg ? (hrLatest <= hrAvg ? '↓' : '↑') : '';
    const hrColor = hrLatest && hrAvg ? (hrLatest <= hrAvg ? 'var(--accent)' : 'var(--red)') : 'var(--text-secondary)';
    const ratioColor = ratio <= 0.9 ? 'var(--accent)' : ratio <= 1.1 ? 'var(--yellow)' : 'var(--red)';

    metricsEl.innerHTML = `
      <div class="fit-rec-metric">
        <div class="fit-rec-metric-label">TSB (Form)</div>
        <div class="fit-rec-metric-val" style="color:${tsbColor}">${tsb >= 0 ? '+' : ''}${tsb.toFixed(1)}</div>
        <div class="fit-rec-metric-hint">${tsb >= 5 ? 'Fresh' : tsb >= -10 ? 'Neutral' : 'Fatigued'}</div>
      </div>
      <div class="fit-rec-metric">
        <div class="fit-rec-metric-label">HRV Trend</div>
        <div class="fit-rec-metric-val" style="color:${hrvColor}">${hrvLatest ? hrvLatest.toFixed(0) + ' ' + hrvTrend : '—'}</div>
        <div class="fit-rec-metric-hint">${hrvAvg ? 'Avg ' + hrvAvg.toFixed(0) + ' ms' : 'No data'}</div>
      </div>
      <div class="fit-rec-metric">
        <div class="fit-rec-metric-label">Resting HR</div>
        <div class="fit-rec-metric-val" style="color:${hrColor}">${hrLatest ? hrLatest + ' ' + hrTrend : '—'}</div>
        <div class="fit-rec-metric-hint">${hrAvg ? 'Avg ' + hrAvg.toFixed(0) + ' bpm' : 'No data'}</div>
      </div>
      <div class="fit-rec-metric">
        <div class="fit-rec-metric-label">Load Ratio</div>
        <div class="fit-rec-metric-val" style="color:${ratioColor}">${ratio.toFixed(2)}</div>
        <div class="fit-rec-metric-hint">ATL / CTL${ratio <= 0.9 ? ' · Recovering' : ratio <= 1.1 ? ' · Balanced' : ' · Overreaching'}</div>
      </div>`;
    if (window.refreshGlow) refreshGlow(metricsEl);
  }

  // ETA until fresh
  const etaEl = document.getElementById('fitRecoveryEta');
  if (etaEl) {
    if (tsb >= 5) {
      etaEl.textContent = "You're fresh! TSB is above +5 — ready to perform.";
    } else {
      // Estimate daily TSB gain: TSB rises when not training. Rough model: ~2-3 TSB/day at rest
      const dailyGain = ctl > 0 ? Math.max(0.5, (ctl - atl) / 42) : 1.5;
      const daysToFresh = dailyGain > 0 ? Math.ceil((5 - tsb) / dailyGain) : 99;
      if (daysToFresh <= 1) {
        etaEl.textContent = 'Estimated ~1 day of rest until fresh (TSB ≥ +5)';
      } else if (daysToFresh <= 14) {
        etaEl.textContent = `Estimated ~${daysToFresh} days of easy training until fresh (TSB ≥ +5)`;
      } else {
        etaEl.textContent = 'Recovery may take 2+ weeks with reduced training load';
      }
    }
  }

  const subtitle = document.getElementById('fitRecoverySubtitle');
  if (subtitle) subtitle.textContent = `TSB ${tsb >= 0 ? '+' : ''}${tsb.toFixed(1)} · ATL/CTL ${ratio.toFixed(2)}`;
}

function solveSpeed(power, CdA, mass) {
  const rho = 1.225, Crr = 0.004, g = 9.81;
  let v = 10; // initial guess m/s
  for (let i = 0; i < 20; i++) {
    const f  = 0.5 * rho * CdA * v * v * v + Crr * mass * g * v - power;
    const fp = 1.5 * rho * CdA * v * v     + Crr * mass * g;
    if (Math.abs(fp) < 1e-10) break;
    v = v - f / fp;
    if (v < 0.5) v = 0.5;
  }
  return v;
}

function renderRacePredictor() {
  const card = document.getElementById('fitRacePredCard');
  if (!card) return;

  const ftp = state.athlete?.ftp;
  const weight = state.athlete?.weight;
  if (!ftp || !weight) { card.style.display = 'none'; return; }

  const mass = weight + 8; // rider + bike

  const events = [
    { label: '10 km',  type: 'TT',   dist: 10000,  intensity: 1.05, CdA: 0.25 },
    { label: '20 km',  type: 'TT',   dist: 20000,  intensity: 1.00, CdA: 0.25 },
    { label: '40 km',  type: 'TT',   dist: 40000,  intensity: 0.95, CdA: 0.25 },
    { label: '100 km', type: 'Road', dist: 100000, intensity: 0.78, CdA: 0.32 },
    { label: '160 km', type: 'Road', dist: 160000, intensity: 0.72, CdA: 0.32 },
  ];

  card.style.display = '';
  const grid = document.getElementById('fitRacePredGrid');
  if (!grid) return;

  grid.innerHTML = events.map(ev => {
    const power = Math.round(ftp * ev.intensity);
    const v = solveSpeed(power, ev.CdA, mass);
    const timeSecs = ev.dist / v;
    const speedKmh = v * 3.6;

    return `<div class="fit-rp-card">
      <div class="fit-rp-dist">${ev.label}</div>
      <div class="fit-rp-type">${ev.type}</div>
      <div class="fit-rp-time">${fmtEffortTime(timeSecs)}</div>
      <div class="fit-rp-speed">${speedKmh.toFixed(1)} km/h</div>
      <div class="fit-rp-power">${power}W · ${(power / weight).toFixed(1)} W/kg</div>
    </div>`;
  }).join('');

  const note = document.getElementById('fitRacePredNote');
  if (note) note.textContent = 'Estimates assume flat terrain, sea level, no wind. TT uses aero position (CdA 0.25), Road uses drops (CdA 0.32).';
  if (window.refreshGlow) refreshGlow(grid);
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
  document.querySelectorAll('#zoneRangePill button').forEach(b => {
    const isActive = +b.dataset.zdays === days;
    b.classList.toggle('active', isActive);
    if (isActive) b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  });
  noChartAnim(() => renderZonesPage());
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
  const ptColors = values.map(v => Math.abs(v)<5 ? ACCENT : Math.abs(v)<8 ? '#fbbf24' : '#f87171');
  const avg      = +(values.reduce((s,v)=>s+v,0)/values.length).toFixed(1);

  if (subEl)   subEl.textContent   = `HR drift vs power · last ${acts.length} rides`;
  if (badgeEl) badgeEl.textContent = `avg ${avg}%`;

  state._znpDecoupleChart = destroyChart(state._znpDecoupleChart);
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


/* ── Swipe-to-dismiss on mobile modal sheets ── */
function initModalSwipeDismiss(dialog) {
  if (!dialog) return;
  const inner = dialog.querySelector('.modal');
  if (!inner) return;

  let startY = 0, lastY = 0, currentDy = 0;
  // idle → pending → dragging | scrolling
  let gesture = 'idle';
  let startedOnHeader = false;
  let scrollWasAtTop = false;

  function onTouchStart(e) {
    if (e.touches.length !== 1) return;
    startY = e.touches[0].clientY;
    lastY = startY;
    currentDy = 0;
    startedOnHeader = !!e.target.closest('.modal-drag-indicator, .modal-header');
    const scrollEl = inner.querySelector('.modal-body');
    scrollWasAtTop = !scrollEl || scrollEl.scrollTop <= 0;

    if (startedOnHeader) {
      gesture = 'pending';
    } else if (scrollWasAtTop) {
      gesture = 'pending';
    } else {
      // Content is scrolled down — always scroll, never dismiss
      gesture = 'scrolling';
    }
  }

  function onTouchMove(e) {
    if (gesture === 'scrolling' || gesture === 'idle' || e.touches.length !== 1) return;
    const y = e.touches[0].clientY;
    const dy = y - startY;

    if (gesture === 'pending') {
      if (Math.abs(dy) < 8) { lastY = y; return; } // dead zone

      if (dy > 0) {
        // Pulling down — check scroll position RIGHT NOW
        const scrollEl = inner.querySelector('.modal-body');
        const atTop = !scrollEl || scrollEl.scrollTop <= 0;
        if (atTop) {
          gesture = 'dragging';
          // Set inline transform BEFORE adding .dragging so when the
          // animation fill is killed, the inline value is already there
          inner.style.transform = 'translateY(0)';
          inner.classList.add('dragging');
          startY = y; // reset origin
          currentDy = 0;
          if (!startedOnHeader && scrollEl) {
            // Prevent the scroll from bouncing while we drag
            scrollEl.style.overflowY = 'hidden';
          }
        } else {
          gesture = 'scrolling';
        }
      } else {
        // Pulling up — let content scroll
        gesture = 'scrolling';
      }
      lastY = y;
      return;
    }

    // gesture === 'dragging'
    const dragDy = y - startY;
    if (dragDy < 0) { currentDy = 0; inner.style.transform = 'translateY(0)'; lastY = y; return; }
    currentDy = dragDy;
    const visual = dragDy < 100 ? dragDy : 100 + (dragDy - 100) * 0.3;
    inner.style.transform = `translateY(${visual}px)`;
    if (dragDy > 10) e.preventDefault();
    lastY = y;
  }

  function onTouchEnd() {
    // Restore scroll if we locked it
    const scrollEl = inner.querySelector('.modal-body');
    if (scrollEl) scrollEl.style.overflowY = '';

    if (gesture === 'dragging') {
      if (currentDy > 120) {
        // Dismiss — DON'T remove dragging here, let closeModalAnimated
        // handle it atomically to prevent sheet-enter animation replay
        closeModalAnimated(dialog);
      } else {
        // Snap back: keep .dragging on (kills animation), use inline transition
        // to smoothly return to 0, then clean up ONLY the transition (keep transform)
        inner.style.transition = 'transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1)';
        inner.style.transform = 'translateY(0)';
        inner.addEventListener('transitionend', () => {
          inner.style.transition = '';
          // Remove sheet-enter BEFORE removing dragging so the animation
          // can't replay. The inline transform: translateY(0) keeps it in place.
          inner.classList.remove('sheet-enter');
          inner.classList.remove('dragging');
        }, { once: true });
      }
    }
    gesture = 'idle';
    currentDy = 0;
  }

  dialog.addEventListener('touchstart', onTouchStart, { passive: true });
  dialog.addEventListener('touchmove', onTouchMove, { passive: false });
  dialog.addEventListener('touchend', onTouchEnd, { passive: true });
}

// Auto-init swipe dismiss on all modal dialogs
document.querySelectorAll('.modal-dialog').forEach(initModalSwipeDismiss);

// ESC key closes mobile sheets (show() doesn't handle this natively)
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    const open = document.querySelector('dialog.modal-dialog.sheet-open[open]');
    if (open) { e.preventDefault(); closeModalAnimated(open); }
  }
});

/* ── Mobile bottom-sheet system ──
   On mobile (≤600px), we bypass showModal() entirely because iOS Safari's
   top-layer positioning fights with CSS overrides causing overshoot/jump.
   Instead we use dialog.show() + a manual backdrop div for full control.
   On desktop, showModal() works fine and is used as normal.
── */
const _origShowModal = HTMLDialogElement.prototype.showModal;
const _origClose = HTMLDialogElement.prototype.close;
const _isMobileSheet = () => window.innerWidth <= 600;

// Shared backdrop element for mobile sheets
let _sheetBackdrop = null;
function _getBackdrop() {
  if (!_sheetBackdrop) {
    _sheetBackdrop = document.createElement('div');
    _sheetBackdrop.className = 'sheet-backdrop';
    _sheetBackdrop.addEventListener('click', () => {
      // Close the topmost open dialog
      const open = document.querySelector('dialog.modal-dialog[open]');
      if (open) closeModalAnimated(open);
    });
    document.body.appendChild(_sheetBackdrop);
  }
  return _sheetBackdrop;
}

function _lockSheetScroll() {
  if (document.body.dataset.sheetLocked === '1') return;
  document.body.dataset.sheetLocked = '1';
  document.body.dataset.sheetScrollY = window.scrollY;
  document.body.style.position = 'fixed';
  document.body.style.width = '100%';
  document.body.style.top = `-${window.scrollY}px`;
  document.body.style.overflow = 'hidden';
}

function _unlockSheetScroll() {
  if (document.body.dataset.sheetLocked !== '1') return;
  delete document.body.dataset.sheetLocked;
  const y = parseInt(document.body.dataset.sheetScrollY || '0', 10);
  delete document.body.dataset.sheetScrollY;
  document.body.style.position = '';
  document.body.style.width = '';
  document.body.style.top = '';
  document.body.style.overflow = '';
  window.scrollTo(0, y);
}

function _cleanSheet(inner) {
  if (!inner) return;
  inner.classList.remove('sheet-enter', 'sheet-dismiss', 'dragging');
  inner.style.transform = '';
  inner.style.transition = '';
  inner.style.animation = '';
}

// ── iOS keyboard-aware viewport tracking ──
// When the virtual keyboard opens on iOS, visualViewport shrinks.
// Instead of repositioning the dialog (which causes flyaway), we keep the
// dialog fixed full-screen and add bottom padding to the scroll body so the
// user can scroll inputs above the keyboard.
let _sheetVVHandler = null;
function _startViewportTracking(dialog) {
  if (!window.visualViewport) return;
  _stopViewportTracking();

  const vv = window.visualViewport;

  function onVVResize() {
    if (!dialog.open || !dialog.classList.contains('sheet-open')) return;

    const kbHeight = window.innerHeight - vv.height;
    const inner = dialog.querySelector('.modal');
    // Find the scrollable body inside the modal
    const body = inner && (inner.querySelector('.cev-body') || inner.querySelector('.modal-body') || inner.querySelector('.act-search-results'));

    if (kbHeight > 50) {
      // Keyboard is open — add padding so user can scroll past keyboard
      if (body) body.style.paddingBottom = (kbHeight + 20) + 'px';
      // Also shrink the modal max-height so it doesn't extend behind keyboard
      if (inner) inner.style.maxHeight = (vv.height - 20) + 'px';
    } else {
      // Keyboard hidden — reset
      if (body) body.style.paddingBottom = '';
      if (inner) inner.style.maxHeight = '';
    }
  }

  _sheetVVHandler = onVVResize;
  vv.addEventListener('resize', onVVResize);
  vv.addEventListener('scroll', onVVResize);
}

function _stopViewportTracking() {
  if (_sheetVVHandler && window.visualViewport) {
    window.visualViewport.removeEventListener('resize', _sheetVVHandler);
    window.visualViewport.removeEventListener('scroll', _sheetVVHandler);
    _sheetVVHandler = null;
  }
  // Reset any keyboard adjustments on all open modals
  document.querySelectorAll('dialog.modal-dialog[open] .modal').forEach(inner => {
    inner.style.maxHeight = '';
    const body = inner.querySelector('.cev-body') || inner.querySelector('.modal-body') || inner.querySelector('.act-search-results');
    if (body) body.style.paddingBottom = '';
  });
}

// Prevent iOS from scrolling the page when focusing inputs inside sheets.
// Instead, scroll the input into view within the modal's own scroll container.
document.addEventListener('focusin', function(e) {
  if (!_isMobileSheet()) return;
  const sheet = e.target.closest('dialog.modal-dialog.sheet-open');
  if (!sheet) return;
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    // Small delay to let keyboard animation settle, then scroll within modal
    setTimeout(function() {
      const modalBody = e.target.closest('.cev-body') || e.target.closest('.modal-body');
      if (modalBody) {
        const rect = e.target.getBoundingClientRect();
        const bodyRect = modalBody.getBoundingClientRect();
        // If the input is below the visible area of the modal body, scroll it up
        if (rect.bottom > bodyRect.bottom - 20 || rect.top < bodyRect.top + 20) {
          e.target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }
    }, 300);
  }
});

HTMLDialogElement.prototype.showModal = function() {
  const inner = this.querySelector('.modal');

  if (!_isMobileSheet()) {
    // Desktop: use native showModal() — works perfectly
    _origShowModal.call(this);
    if (this.classList.contains('modal-dialog') && !this._swipeInited) {
      initModalSwipeDismiss(this);
      this._swipeInited = true;
    }
    return;
  }

  // ── MOBILE: bypass showModal(), use show() + manual backdrop ──
  _lockSheetScroll();
  _cleanSheet(inner);

  // Show backdrop
  const backdrop = _getBackdrop();
  backdrop.classList.add('active');

  // Use show() instead of showModal() — no top-layer, no UA positioning
  this.show();
  this.classList.add('sheet-open');

  // Init swipe dismiss once
  if (this.classList.contains('modal-dialog') && !this._swipeInited) {
    initModalSwipeDismiss(this);
    this._swipeInited = true;
  }

  // Start tracking visualViewport for keyboard avoidance
  _startViewportTracking(this);

  // Trigger slide-in: start off-screen, force paint, then animate.
  // Double-RAF ensures DOM mutations (custom controls, etc.) have settled
  // before starting the animation — prevents overshoot on first open.
  if (inner) {
    inner.style.transform = 'translateY(100%)';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!this.open) return;
        void inner.offsetHeight; // force paint of off-screen state
        inner.classList.add('sheet-enter');
        // After animation duration (350ms + 50ms buffer), replace the
        // animation with a stable inline transform. animationend events
        // are unreliable with fill-mode:both + inline styles.
        setTimeout(() => {
          if (inner.classList.contains('sheet-enter')) {
            inner.classList.remove('sheet-enter');
            inner.style.transform = 'translateY(0)';
          }
        }, 400);
      });
    });
  }
};

HTMLDialogElement.prototype.close = function(rv) {
  const inner = this.querySelector('.modal');
  _cleanSheet(inner);
  this.classList.remove('sheet-open');
  // Reset any keyboard viewport adjustments
  if (inner) {
    inner.style.maxHeight = '';
    const body = inner.querySelector('.cev-body') || inner.querySelector('.modal-body') || inner.querySelector('.act-search-results');
    if (body) body.style.paddingBottom = '';
  }
  _origClose.call(this, rv);
  // Hide backdrop + unlock scroll if no other sheets are open
  if (!document.querySelector('dialog.modal-dialog[open]')) {
    _stopViewportTracking();
    if (_sheetBackdrop) _sheetBackdrop.classList.remove('active');
    _unlockSheetScroll();
  }
};

function closeModalAnimated(dialog) {
  if (!dialog || !dialog.open) return;
  const inner = dialog.querySelector('.modal');

  if (!inner || !_isMobileSheet()) {
    dialog.close();
    return;
  }

  // Get current drag position for smooth dismiss continuation
  const ct = inner.style.transform;
  const match = ct && ct.match(/translateY\((\d+)/);
  inner.style.setProperty('--sheet-dy', match ? `${match[1]}px` : '0px');

  // Atomic class swap: set the dismiss animation in one className write
  // to prevent any frame where sheet-enter could replay
  const classes = inner.className
    .replace(/\bsheet-enter\b/, '')
    .replace(/\bdragging\b/, '')
    .trim();
  inner.className = classes + ' sheet-dismiss';
  // Clear inline transition (keep transform — animation overrides it with fill:both)
  inner.style.transition = '';

  // Fade backdrop during dismiss
  if (_sheetBackdrop) _sheetBackdrop.classList.add('fading');

  function onDone() {
    inner.removeEventListener('animationend', onDone);
    inner.style.removeProperty('--sheet-dy');
    if (_sheetBackdrop) _sheetBackdrop.classList.remove('fading');
    dialog.close();
  }
  inner.addEventListener('animationend', onDone, { once: true });

  // Fallback
  setTimeout(() => {
    if (dialog.open) {
      inner.removeEventListener('animationend', onDone);
      inner.style.removeProperty('--sheet-dy');
      if (_sheetBackdrop) _sheetBackdrop.classList.remove('fading');
      dialog.close();
    }
  }, 400);
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

function showConfirmDialog(title, message, onConfirm) {
  // Remove any existing confirm dialog
  document.getElementById('confirmDialog')?.remove();

  const backdrop = document.createElement('dialog');
  backdrop.id = 'confirmDialog';
  backdrop.className = 'modal-dialog';
  backdrop.innerHTML = `
    <div class="modal" style="max-width:400px">
      <div class="modal-header" style="padding:20px 24px 8px">
        <div><div class="modal-title" style="font-size:var(--text-md)">${title}</div></div>
        <button class="modal-close" id="confirmClose" aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div style="padding:8px 24px 20px;color:var(--text-secondary);font-size:var(--text-sm);line-height:1.5">${message}</div>
      <div style="display:flex;gap:10px;justify-content:flex-end;padding:0 24px 20px">
        <button class="btn btn-ghost" id="confirmCancel">Cancel</button>
        <button class="btn btn-primary" id="confirmOk" style="background:var(--red);border-color:var(--red)">Confirm</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  backdrop.showModal();

  const close = () => {
    backdrop.close();
    setTimeout(() => backdrop.remove(), 200);
  };
  backdrop.querySelector('#confirmClose').onclick = close;
  backdrop.querySelector('#confirmCancel').onclick = close;
  backdrop.querySelector('#confirmOk').onclick = () => { close(); onConfirm(); };
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
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

// Fetch planned events (workouts, notes, races, goals) from intervals.icu
async function fetchCalendarEvents() {
  if (!state.athleteId || !state.apiKey) return;
  const m = getCalMonth();
  const year = m.getFullYear(), month = m.getMonth();
  const oldest = toDateStr(new Date(year, month - 1, 1));
  const newest = toDateStr(new Date(year, month + 2, 0));
  try {
    const data = await icuFetch(`/athlete/${state.athleteId}/events?oldest=${oldest}&newest=${newest}`);
    state.calEvents = Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn('Failed to fetch calendar events:', e);
    state.calEvents = [];
  }
}

// Fetch events then re-render calendar (non-blocking background refresh)
function refreshCalendarEvents() {
  fetchCalendarEvents().then(() => renderCalendar());
}

function calPrevMonth() {
  const m = getCalMonth();
  state.calMonth = new Date(m.getFullYear(), m.getMonth() - 1, 1);
  renderCalendar();
  if (window.innerWidth > 600) _calSwipeAnim('right');
  refreshCalendarEvents();
}

function calNextMonth() {
  const m = getCalMonth();
  state.calMonth = new Date(m.getFullYear(), m.getMonth() + 1, 1);
  renderCalendar();
  if (window.innerWidth > 600) _calSwipeAnim('left');
  refreshCalendarEvents();
}

// Animate grid on month change (mobile only)
function _calSwipeAnim(dir) {
  if (window.innerWidth > 600) return;
  const grid = document.getElementById('calGrid');
  if (!grid) return;
  grid.classList.remove('cal-swipe-left', 'cal-swipe-right');
  void grid.offsetWidth; // force reflow
  grid.classList.add(dir === 'left' ? 'cal-swipe-left' : 'cal-swipe-right');
  grid.addEventListener('animationend', () => {
    grid.classList.remove('cal-swipe-left', 'cal-swipe-right');
  }, { once: true });
}

function calGoToday() {
  const now = new Date();
  state.calMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  state.calSelectedDate = toDateStr(now);
  renderCalendar();
  refreshCalendarEvents();
}

// ── Band drag: real-time horizontal drag to change months (mobile) ────────
(function _initCalBandDrag() {
  let startX = 0, startY = 0, isHoriz = null, dragging = false;
  const SNAP = 60; // px drag needed to commit month change

  function getState() {
    const track   = document.getElementById('calBandTrack');
    const wrapper = document.getElementById('calBandWrapper');
    if (!track || !wrapper) return null;
    return { track, w: wrapper.offsetWidth };
  }

  function resetToCenter(track, w, animate) {
    track.style.transition = animate ? 'transform 0.3s cubic-bezier(0.2,0.9,0.3,1)' : 'none';
    track.style.transform = `translateX(${-w}px)`;
  }

  document.addEventListener('touchstart', e => {
    if (state.currentPage !== 'calendar' || window.innerWidth > 600) return;
    const wrapper = document.getElementById('calBandWrapper');
    if (!wrapper || !wrapper.contains(e.target)) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    isHoriz = null;
    dragging = false;
    const s = getState();
    if (s) s.track.style.transition = 'none';
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (state.currentPage !== 'calendar' || window.innerWidth > 600) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (isHoriz === null && (Math.abs(dx) > 5 || Math.abs(dy) > 5))
      isHoriz = Math.abs(dx) > Math.abs(dy);
    if (!isHoriz) return;
    dragging = true;
    const s = getState();
    if (!s) return;
    s.track.style.transform = `translateX(${-s.w + dx}px)`;
  }, { passive: true });

  document.addEventListener('touchend', e => {
    if (!dragging || !isHoriz) { isHoriz = null; dragging = false; return; }
    dragging = false; isHoriz = null;
    const dx = e.changedTouches[0].clientX - startX;
    const s = getState();
    if (!s) return;
    if (Math.abs(dx) >= SNAP) {
      const toNext = dx < 0;
      s.track.style.transition = 'transform 0.28s cubic-bezier(0.2,0.9,0.3,1)';
      s.track.style.transform = `translateX(${toNext ? -2 * s.w : 0}px)`;
      s.track.addEventListener('transitionend', () => {
        if (toNext) calNextMonth(); else calPrevMonth();
      }, { once: true });
    } else {
      resetToCenter(s.track, s.w, true);
    }
  }, { passive: true });
})();

function toggleCalPanel() {
  const body = document.querySelector('.cal-body');
  const btn  = document.getElementById('calPanelToggle');
  if (!body) return;
  body.classList.toggle('cal-body--panel-hidden');
  const hidden = body.classList.contains('cal-body--panel-hidden');
  if (btn) btn.classList.toggle('active', !hidden);
  try { localStorage.setItem('icu_cal_panel_hidden', hidden ? '1' : ''); } catch (_) {}
}

// Restore panel state on load
(function _restoreCalPanel() {
  if (localStorage.getItem('icu_cal_panel_hidden') === '1') {
    // Defer until calendar DOM exists
    const _obs = new MutationObserver(() => {
      const body = document.querySelector('.cal-body');
      if (body) { body.classList.add('cal-body--panel-hidden'); _obs.disconnect(); }
    });
    _obs.observe(document.body, { childList: true, subtree: true });
  }
})();

/* ── Calendar: Create / Edit Event Modal ──────────────────────── */

let _editingCalEvent = null; // null = create mode, event object = edit mode

const _calEvPresets = {
  easy:      { cat: 'WORKOUT', sport: 'Ride',        name: 'Easy Endurance',   dur: '1h 0m',  tss: 45  },
  intervals: { cat: 'WORKOUT', sport: 'Ride',        name: 'Interval Session', dur: '1h 0m',  tss: 75  },
  long:      { cat: 'WORKOUT', sport: 'Ride',        name: 'Long Ride',        dur: '2h 30m', tss: 120 },
  rest:      { cat: 'NOTE',    sport: '',             name: 'Rest Day',         dur: '',       tss: ''  },
  race:      { cat: 'RACE',    sport: 'Ride',        name: 'Race',             dur: '1h 0m',  tss: 100 },
};

function openCalEventModal(presetDateOrEvent) {
  const modal = document.getElementById('calEventModal');
  if (!modal) return;

  const isEdit = presetDateOrEvent && typeof presetDateOrEvent === 'object' && presetDateOrEvent.id;

  if (isEdit) {
    // ── EDIT MODE ──
    _editingCalEvent = presetDateOrEvent;
    const ev = presetDateOrEvent;

    document.getElementById('calEvDate').value       = (ev.start_date_local || '').slice(0, 10);
    document.getElementById('calEvCategory').value    = ev.category || 'WORKOUT';
    document.getElementById('calEvName').value        = ev.name || '';
    document.getElementById('calEvSport').value       = ev.type || 'Ride';
    document.getElementById('calEvDuration').value    = ev.moving_time > 0 ? fmtDur(ev.moving_time) : '';
    document.getElementById('calEvDistance').value     = ev.distance > 0 ? (ev.distance / 1000).toFixed(1) : '';
    document.getElementById('calEvTss').value         = ev.icu_training_load || '';
    // Parse location from description if present (stored as first line: "📍 Location")
    const _desc = ev.description || '';
    const _locMatch = _desc.match(/^📍\s*(.+)\n?/);
    document.getElementById('calEvLocation').value    = _locMatch ? _locMatch[1].trim() : '';
    document.getElementById('calEvDesc').value        = _locMatch ? _desc.replace(/^📍\s*.+\n?\n?/, '') : _desc;

    document.querySelector('#calEventModal .cev-hdr-title').textContent = 'Edit Event';
    document.getElementById('calEvPresets').style.display  = 'none';
    const delSection = document.getElementById('calEvDeleteSection');
    delSection.style.display = '';
    const delBtn = document.getElementById('calEvDeleteBtn');
    delBtn.textContent = 'Delete Event';
    delBtn.classList.remove('cev-delete-btn--confirm');
    _calEvDeleteConfirm = false;
  } else {
    // ── CREATE MODE ──
    _editingCalEvent = null;
    const date = presetDateOrEvent || state.calSelectedDate || toDateStr(new Date());
    document.getElementById('calEvDate').value       = date;
    document.getElementById('calEvCategory').value    = 'WORKOUT';
    document.getElementById('calEvName').value        = '';
    document.getElementById('calEvSport').value       = 'Ride';
    document.getElementById('calEvDuration').value    = '';
    document.getElementById('calEvDistance').value     = '';
    document.getElementById('calEvTss').value         = '';
    document.getElementById('calEvLocation').value    = '';
    document.getElementById('calEvDesc').value        = '';

    document.querySelector('#calEventModal .cev-hdr-title').textContent = 'New';
    document.getElementById('calEvPresets').style.display  = '';
    document.getElementById('calEvDeleteSection').style.display = 'none';
  }

  // Clear active preset highlight & validation errors
  document.querySelectorAll('#calEvPresets button').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#calEventModal .error').forEach(el => el.classList.remove('error'));

  _calEvCategoryChanged();
  _initModalControls();
  _syncModalControls();
  modal.showModal();
}

function closeCalEventModal() {
  const modal = document.getElementById('calEventModal');
  if (modal) closeModalAnimated(modal);
}

function _calEvCategoryChanged() {
  const cat = document.getElementById('calEvCategory').value;
  const showMetrics = cat === 'WORKOUT' || cat === 'RACE';
  document.getElementById('calEvSportField').style.display   = showMetrics ? '' : 'none';
  document.getElementById('calEvMetricsRow').style.display    = showMetrics ? '' : 'none';
}

function _applyCalEvPreset(key) {
  const p = _calEvPresets[key];
  if (!p) return;

  document.querySelectorAll('#calEvPresets button').forEach(b => {
    b.classList.toggle('active', b.dataset.preset === key);
  });

  document.getElementById('calEvCategory').value = p.cat;
  document.getElementById('calEvName').value     = p.name;
  if (p.sport) document.getElementById('calEvSport').value = p.sport;
  document.getElementById('calEvDuration').value = p.dur;
  document.getElementById('calEvTss').value      = p.tss;
  _calEvCategoryChanged();
  _syncModalControls();
}

// Wire preset buttons
document.addEventListener('click', e => {
  const btn = e.target.closest('#calEvPresets button[data-preset]');
  if (btn) _applyCalEvPreset(btn.dataset.preset);
});

// Backdrop click to close (animated)
document.addEventListener('click', e => {
  const modal = document.getElementById('calEventModal');
  if (e.target === modal) closeModalAnimated(modal);
  const tpModal = document.getElementById('trainingPlanModal');
  if (e.target === tpModal) closeModalAnimated(tpModal);
});

/* ── Custom Form Controls (iOS-style select & date picker) ──────── */

// Close any open custom dropdowns on outside click
document.addEventListener('click', () => {
  document.querySelectorAll('.cs-wrap--open, .dp-wrap--open').forEach(w => w.classList.remove('cs-wrap--open', 'dp-wrap--open'));
});

// Upgrade a <select> to a custom styled dropdown
function _upgradeSelect(sel) {
  if (sel.dataset.csReady) return;
  sel.dataset.csReady = '1';
  sel.style.display = 'none';

  const wrap = document.createElement('div');
  wrap.className = 'cs-wrap';
  sel.parentNode.insertBefore(wrap, sel);

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'cs-trigger';
  const valSpan = document.createElement('span');
  valSpan.className = 'cs-value';
  valSpan.textContent = sel.options[sel.selectedIndex]?.text || '';
  trigger.appendChild(valSpan);
  trigger.insertAdjacentHTML('beforeend',
    '<svg class="cs-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>');
  wrap.appendChild(trigger);

  const dd = document.createElement('div');
  dd.className = 'cs-dropdown';
  Array.from(sel.options).forEach(opt => {
    const row = document.createElement('div');
    row.className = 'cs-option' + (opt.value === sel.value ? ' cs-option--sel' : '');
    row.dataset.value = opt.value;
    row.textContent = opt.text;
    row.addEventListener('click', e => {
      e.stopPropagation();
      sel.value = opt.value;
      sel.dispatchEvent(new Event('change'));
      valSpan.textContent = opt.text;
      dd.querySelectorAll('.cs-option').forEach(r => r.classList.toggle('cs-option--sel', r.dataset.value === opt.value));
      wrap.classList.remove('cs-wrap--open');
    });
    dd.appendChild(row);
  });
  wrap.appendChild(dd);

  trigger.addEventListener('click', e => {
    e.stopPropagation();
    document.querySelectorAll('.cs-wrap--open, .dp-wrap--open').forEach(w => { if (w !== wrap) w.classList.remove('cs-wrap--open', 'dp-wrap--open'); });
    wrap.classList.toggle('cs-wrap--open');
  });

  // Sync method: call after programmatic value change on the native select
  wrap._sync = () => {
    valSpan.textContent = sel.options[sel.selectedIndex]?.text || '';
    dd.querySelectorAll('.cs-option').forEach(r => r.classList.toggle('cs-option--sel', r.dataset.value === sel.value));
  };
}

// Upgrade an <input type="date"> to a custom calendar picker
function _upgradeDateInput(input) {
  if (input.dataset.dpReady) return;
  input.dataset.dpReady = '1';
  input.type = 'hidden'; // hide native, keep value accessible

  const wrap = document.createElement('div');
  wrap.className = 'dp-wrap';
  input.parentNode.insertBefore(wrap, input);

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'dp-trigger';
  const valSpan = document.createElement('span');
  valSpan.className = 'dp-value';
  trigger.appendChild(valSpan);
  trigger.insertAdjacentHTML('beforeend',
    '<svg class="dp-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>');
  wrap.appendChild(trigger);

  const dd = document.createElement('div');
  dd.className = 'dp-dropdown';
  wrap.appendChild(dd);

  let dpY, dpM;

  function fmtPick(str) {
    if (!str) return 'Select date';
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function render() {
    const val = input.value;
    if (val && dpY === undefined) { const [y, m] = val.split('-').map(Number); dpY = y; dpM = m - 1; }
    if (dpY === undefined) { const n = new Date(); dpY = n.getFullYear(); dpM = n.getMonth(); }
    valSpan.textContent = fmtPick(val);

    const first = new Date(dpY, dpM, 1);
    const last  = new Date(dpY, dpM + 1, 0);
    const startDow = (first.getDay() - (state.weekStartDay || 1) + 7) % 7;
    const mLabel = first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    const todayStr = toDateStr(new Date());
    const dowNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    if (state.weekStartDay === 0) { dowNames.unshift(dowNames.pop()); }

    let h = `<div class="dp-head">
      <button type="button" class="dp-nav" data-d="-1"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg></button>
      <span class="dp-month">${mLabel}</span>
      <button type="button" class="dp-nav" data-d="1"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg></button>
    </div>`;
    h += '<div class="dp-dow">' + dowNames.map(d => `<span>${d.slice(0,2)}</span>`).join('') + '</div>';
    h += '<div class="dp-grid">';
    for (let i = startDow - 1; i >= 0; i--) {
      const d = new Date(dpY, dpM, -i);
      const ds = toDateStr(d);
      h += `<button type="button" class="dp-day dp-day--other${ds === val ? ' dp-day--sel' : ''}" data-d="${ds}">${d.getDate()}</button>`;
    }
    for (let d = 1; d <= last.getDate(); d++) {
      const ds = toDateStr(new Date(dpY, dpM, d));
      const cls = ['dp-day'];
      if (ds === val) cls.push('dp-day--sel');
      if (ds === todayStr) cls.push('dp-day--today');
      h += `<button type="button" class="${cls.join(' ')}" data-d="${ds}">${d}</button>`;
    }
    const tot = startDow + last.getDate();
    const rem = tot % 7;
    if (rem > 0) for (let i = 1; i <= 7 - rem; i++) {
      const d = new Date(dpY, dpM + 1, i);
      const ds = toDateStr(d);
      h += `<button type="button" class="dp-day dp-day--other${ds === val ? ' dp-day--sel' : ''}" data-d="${ds}">${d.getDate()}</button>`;
    }
    h += '</div>';
    dd.innerHTML = h;

    dd.querySelectorAll('.dp-nav').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      dpM += parseInt(b.dataset.d);
      if (dpM < 0) { dpM = 11; dpY--; } else if (dpM > 11) { dpM = 0; dpY++; }
      render();
    }));
    dd.querySelectorAll('.dp-day').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      input.value = b.dataset.d;
      input.dispatchEvent(new Event('change'));
      wrap.classList.remove('dp-wrap--open');
      const [ny, nm] = b.dataset.d.split('-').map(Number);
      dpY = ny; dpM = nm - 1;
      render();
    }));
  }

  trigger.addEventListener('click', e => {
    e.stopPropagation();
    document.querySelectorAll('.cs-wrap--open, .dp-wrap--open').forEach(w => { if (w !== wrap) w.classList.remove('cs-wrap--open', 'dp-wrap--open'); });
    wrap.classList.toggle('dp-wrap--open');
    if (wrap.classList.contains('dp-wrap--open')) render();
  });

  wrap._sync = () => {
    const val = input.value;
    if (val) { const [y, m] = val.split('-').map(Number); dpY = y; dpM = m - 1; }
    valSpan.textContent = fmtPick(val);
  };
  render();
}

// Initialize and sync all custom controls in the modal
function _initModalControls() {
  document.querySelectorAll('#calEventModal select').forEach(_upgradeSelect);
  const dateInput = document.getElementById('calEvDate');
  if (dateInput) _upgradeDateInput(dateInput);
}
function _syncModalControls() {
  document.querySelectorAll('#calEventModal .cs-wrap').forEach(w => w._sync && w._sync());
  document.querySelectorAll('#calEventModal .dp-wrap').forEach(w => w._sync && w._sync());
}

function _parseDurationToSecs(str) {
  if (!str) return 0;
  let secs = 0;
  const hMatch = str.match(/(\d+)\s*h/i);
  const mMatch = str.match(/(\d+)\s*m/i);
  if (hMatch) secs += parseInt(hMatch[1]) * 3600;
  if (mMatch) secs += parseInt(mMatch[1]) * 60;
  if (!hMatch && !mMatch) {
    const n = parseFloat(str);
    if (!isNaN(n)) secs = n * 60; // treat bare number as minutes
  }
  return secs;
}

async function saveCalEvent() {
  const nameEl = document.getElementById('calEvName');
  const dateEl = document.getElementById('calEvDate');
  const name = nameEl.value.trim();
  const date = dateEl.value;
  const cat  = document.getElementById('calEvCategory').value;

  // Inline validation — highlight empty required fields
  nameEl.classList.toggle('error', !name);
  dateEl.classList.toggle('error', !date);
  if (!name) { nameEl.focus(); return; }
  if (!date) { dateEl.focus(); return; }

  const saveBtn = document.getElementById('calEvSaveBtn');
  saveBtn.disabled = true;
  saveBtn.style.opacity = '0.4';

  try {
    const payload = {
      start_date_local: date + 'T00:00:00',
      name,
      category: cat,
    };

    if (cat === 'WORKOUT' || cat === 'RACE') {
      const sport = document.getElementById('calEvSport').value;
      if (sport) payload.type = sport;

      const durSecs = _parseDurationToSecs(document.getElementById('calEvDuration').value);
      if (durSecs > 0) payload.moving_time = durSecs;

      const distKm = parseFloat(document.getElementById('calEvDistance').value);
      if (distKm > 0) payload.distance = distKm * 1000; // API expects metres

      const tss = parseInt(document.getElementById('calEvTss').value);
      if (tss > 0) payload.icu_training_load = tss;
    }

    const loc  = document.getElementById('calEvLocation').value.trim();
    const desc = document.getElementById('calEvDesc').value.trim();
    const fullDesc = (loc ? '📍 ' + loc + '\n\n' : '') + desc;
    if (fullDesc.trim()) payload.description = fullDesc.trim();

    if (_editingCalEvent) {
      await icuPut(`/athlete/${state.athleteId}/events/${_editingCalEvent.id}`, payload);
      showToast('Event updated', 'success');
    } else {
      await icuPost(`/athlete/${state.athleteId}/events`, payload);
      showToast('Event added to calendar', 'success');
    }
    closeCalEventModal();
    await fetchCalendarEvents();
    renderCalendar();
  } catch (err) {
    showToast('Failed to save: ' + err.message, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.style.opacity = '';
  }
}

let _calEvDeleteConfirm = false;

async function deleteCalEvent() {
  if (!_editingCalEvent || !_editingCalEvent.id) return;

  const deleteBtn = document.getElementById('calEvDeleteBtn');

  // Two-tap confirmation: first tap turns red with "Confirm Delete", second tap actually deletes
  if (!_calEvDeleteConfirm) {
    _calEvDeleteConfirm = true;
    deleteBtn.textContent = 'Confirm Delete';
    deleteBtn.classList.add('cev-delete-btn--confirm');
    return;
  }

  _calEvDeleteConfirm = false;
  deleteBtn.disabled = true;
  deleteBtn.textContent = 'Deleting...';

  try {
    await icuDelete(`/athlete/${state.athleteId}/events/${_editingCalEvent.id}`);
    showToast('Event deleted', 'success');
    closeCalEventModal();
    await fetchCalendarEvents();
    renderCalendar();
  } catch (err) {
    showToast('Failed to delete: ' + err.message, 'error');
  } finally {
    deleteBtn.disabled = false;
    deleteBtn.textContent = 'Delete Event';
    deleteBtn.classList.remove('cev-delete-btn--confirm');
  }
}

/* ====================================================
   TRAINING PLAN BUILDER
==================================================== */
const _tpDayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
let _tpWeekSlots = [[], [], [], [], [], [], []]; // 7 days, each an array of { name, dur, tss, cat }

function openTrainingPlanModal() {
  const modal = document.getElementById('trainingPlanModal');
  if (!modal) return;

  // Reset week slots
  _tpWeekSlots = [[], [], [], [], [], [], []];

  // Set default start date to next Monday
  const now = new Date();
  const dayOff = (8 - now.getDay()) % 7 || 7; // days until next Monday
  const nextMon = new Date(now);
  nextMon.setDate(now.getDate() + dayOff);
  document.getElementById('tpStartDate').value = toDateStr(nextMon);
  document.getElementById('tpWeeks').value = '4';

  renderTpWeek();
  modal.showModal();
}

function closeTrainingPlanModal() {
  const modal = document.getElementById('trainingPlanModal');
  if (modal) closeModalAnimated(modal);
}

function renderTpWeek() {
  const grid = document.getElementById('tpWeekGrid');
  if (!grid) return;

  grid.innerHTML = _tpDayNames.map((day, di) => {
    const slots = _tpWeekSlots[di];
    const slotsHtml = slots.map((s, si) => `
      <div class="tp-slot">
        <div class="tp-slot-info">
          <span class="tp-slot-name">${s.name}</span>
          ${s.dur ? `<span class="tp-slot-detail">${s.dur}</span>` : ''}
          ${s.tss ? `<span class="tp-slot-detail">${s.tss} TSS</span>` : ''}
        </div>
        <span class="tp-slot-remove" onclick="removeTpSlot(${di},${si})" title="Remove">×</span>
      </div>
    `).join('');

    return `<div class="tp-day">
      <div class="tp-day-label">${day}</div>
      ${slotsHtml}
      <button class="tp-add-btn" onclick="showTpSlotForm(${di})">+ Add</button>
      <div class="tp-slot-form" id="tpForm${di}" style="display:none">
        <input type="text" class="tp-input" id="tpName${di}" placeholder="Workout name">
        <div class="tp-form-row">
          <input type="text" class="tp-input tp-input--sm" id="tpDur${di}" placeholder="e.g. 1h 30m">
          <input type="number" class="tp-input tp-input--sm" id="tpTss${di}" placeholder="TSS">
        </div>
        <div class="tp-form-actions">
          <button class="tp-confirm-btn" onclick="addTpSlot(${di})">Add</button>
          <button class="tp-cancel-btn" onclick="hideTpSlotForm(${di})">Cancel</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function showTpSlotForm(dayIdx) {
  const form = document.getElementById(`tpForm${dayIdx}`);
  if (form) {
    form.style.display = '';
    const nameInput = document.getElementById(`tpName${dayIdx}`);
    if (nameInput) { nameInput.value = ''; nameInput.focus(); }
    const durInput = document.getElementById(`tpDur${dayIdx}`);
    if (durInput) durInput.value = '';
    const tssInput = document.getElementById(`tpTss${dayIdx}`);
    if (tssInput) tssInput.value = '';
  }
}

function hideTpSlotForm(dayIdx) {
  const form = document.getElementById(`tpForm${dayIdx}`);
  if (form) form.style.display = 'none';
}

function addTpSlot(dayIdx) {
  const name = (document.getElementById(`tpName${dayIdx}`)?.value || '').trim();
  if (!name) {
    document.getElementById(`tpName${dayIdx}`)?.classList.add('error');
    return;
  }
  const dur = (document.getElementById(`tpDur${dayIdx}`)?.value || '').trim();
  const tss = parseInt(document.getElementById(`tpTss${dayIdx}`)?.value) || 0;

  _tpWeekSlots[dayIdx].push({ name, dur, tss, cat: 'WORKOUT' });
  renderTpWeek();
}

function removeTpSlot(dayIdx, slotIdx) {
  _tpWeekSlots[dayIdx].splice(slotIdx, 1);
  renderTpWeek();
}

async function applyTrainingPlan() {
  const startDate = document.getElementById('tpStartDate')?.value;
  const weeks = parseInt(document.getElementById('tpWeeks')?.value) || 4;

  if (!startDate) {
    showToast('Please set a start date', 'error');
    return;
  }

  // Count total events to create
  const totalSlots = _tpWeekSlots.reduce((sum, d) => sum + d.length, 0);
  if (totalSlots === 0) {
    showToast('Add at least one workout to the plan', 'error');
    return;
  }

  const btn = document.getElementById('tpApplyBtn');
  btn.disabled = true;
  btn.textContent = 'Applying...';

  const totalEvents = totalSlots * weeks;
  let created = 0;
  let failed = 0;

  try {
    // Build all event payloads
    const events = [];
    const baseDate = new Date(startDate + 'T00:00:00');

    for (let w = 0; w < weeks; w++) {
      for (let d = 0; d < 7; d++) {
        for (const slot of _tpWeekSlots[d]) {
          const eventDate = new Date(baseDate);
          eventDate.setDate(baseDate.getDate() + w * 7 + d);
          const dateStr = toDateStr(eventDate);

          const payload = {
            start_date_local: dateStr + 'T00:00:00',
            name: slot.name,
            category: slot.cat || 'WORKOUT',
            type: 'Ride',
          };

          const durSecs = _parseDurationToSecs(slot.dur);
          if (durSecs > 0) payload.moving_time = durSecs;
          if (slot.tss > 0) payload.icu_training_load = slot.tss;

          events.push(payload);
        }
      }
    }

    // Batch create with concurrency limit
    const BATCH = 5;
    for (let i = 0; i < events.length; i += BATCH) {
      const batch = events.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(ev => icuPost(`/athlete/${state.athleteId}/events`, ev))
      );
      results.forEach(r => {
        if (r.status === 'fulfilled') created++;
        else failed++;
      });
      btn.textContent = `Creating... (${created}/${totalEvents})`;
    }

    closeTrainingPlanModal();
    if (failed > 0) {
      showToast(`Plan applied: ${created} events created, ${failed} failed`, 'info');
    } else {
      showToast(`Training plan applied — ${created} events created`, 'success');
    }
    await fetchCalendarEvents();
    renderCalendar();
  } catch (err) {
    showToast('Failed to apply plan: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Apply to Calendar';
  }
}

// Returns a tiny SVG intensity bar icon (4 ascending bars, bottom-aligned)
function calIntensityBars(tss) {
  if (!tss || tss <= 0) return '';
  const level  = tss < 30 ? 1 : tss < 60 ? 2 : tss < 100 ? 3 : 4;
  const color  = level === 1 ? '#4caf7d' : level === 2 ? '#e0c040' : level === 3 ? '#f0a500' : '#e84b3a';
  const dim    = _isDark() ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)';
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
  // Merge planned events from intervals.icu
  if (state.calEvents && state.calEvents.length) {
    state.calEvents.forEach(ev => {
      const d = (ev.start_date_local || ev.start_date || '').slice(0, 10);
      if (!d) return;
      if (!actMap[d]) actMap[d] = [];
      actMap[d].push({ a: ev, stateIdx: -1, isEvent: true });
    });
  }
  return actMap;
}

// Build simplified grid HTML for the prev/next band slides (mobile only)
function _buildCalSideGridHTML(year, month, actMap, todayStr) {
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  const startDow = (firstDay.getDay() - state.weekStartDay + 7) % 7;
  const cells = [];
  for (let i = startDow - 1; i >= 0; i--)
    cells.push({ date: new Date(year, month, -i), thisMonth: false });
  for (let d = 1; d <= lastDay.getDate(); d++)
    cells.push({ date: new Date(year, month, d), thisMonth: true });
  const rem = cells.length % 7;
  if (rem > 0)
    for (let i = 1; i <= 7 - rem; i++)
      cells.push({ date: new Date(year, month + 1, i), thisMonth: false });

  return cells.map(({ date, thisMonth }) => {
    const dateStr  = toDateStr(date);
    const items    = actMap[dateStr] || [];
    const realActs = items.filter(({ a, isEvent }) => !isEvent && !isEmptyActivity(a));
    const events   = items.filter(({ isEvent }) => isEvent);
    const isToday  = dateStr === todayStr;
    const dow      = date.getDay();
    const isWeekend = dow === 0 || dow === 6;
    const cls = ['cal-day',
      !thisMonth  ? 'cal-day--other-month' : '',
      isToday     ? 'cal-day--today'       : '',
      isWeekend   ? 'cal-day--weekend'     : '',
    ].filter(Boolean).join(' ');
    const seenTypes = new Set();
    const eventDots = events.reduce((acc, { a }) => {
      const key = 'cal-ev--' + (a.category || '').toLowerCase();
      if (!seenTypes.has(key) && seenTypes.size < 3) { seenTypes.add(key); acc += `<div class="cal-dot cal-dot--planned ${key}"></div>`; }
      return acc;
    }, '');
    const dots = realActs.reduce((acc, { a }) => {
      const tc = calEventClass(a);
      if (!seenTypes.has(tc) && seenTypes.size < 3) { seenTypes.add(tc); acc += `<div class="cal-dot ${tc}"></div>`; }
      return acc;
    }, eventDots);
    return `<div class="${cls}" data-date="${dateStr}"><div class="cal-day-num">${date.getDate()}</div><div class="cal-dots">${dots}</div></div>`;
  }).join('');
}

function renderCalendar() {
  window._calEvLookup = {};

  const m     = getCalMonth();
  const year  = m.getFullYear();
  const month = m.getMonth(); // 0-based

  const actMap   = buildCalActMap();
  const todayStr = toDateStr(new Date());

  // Default selected date to today on first render
  if (!state.calSelectedDate) state.calSelectedDate = todayStr;

  // ── Month stats (only completed activities, skip planned events) ──
  let totalActs = 0, totalDist = 0, totalTSS = 0, totalSecs = 0, totalCals = 0;
  Object.entries(actMap).forEach(([d, items]) => {
    const [y, mo] = d.split('-').map(Number);
    if (y === year && mo === month + 1) {
      items.forEach(({ a, isEvent }) => {
        if (isEvent || isEmptyActivity(a)) return;
        totalActs++;
        totalDist += actVal(a, 'distance', 'icu_distance');
        totalTSS  += actVal(a, 'icu_training_load', 'tss');
        totalSecs += actVal(a, 'moving_time', 'elapsed_time', 'icu_moving_time', 'icu_elapsed_time');
        totalCals += actVal(a, 'calories', 'icu_calories') || 0;
      });
    }
  });

  const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  // Month title label
  const _calMonthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const _calTitleEl = document.getElementById('calMonthTitle');
  if (_calTitleEl) _calTitleEl.innerHTML = `<span class="cal-month-name">${_calMonthNames[month]}</span> <span class="cal-month-year">${year}</span>`;

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
    const allItems  = actMap[dateStr] || [];
    const realActs  = allItems.filter(({ a, isEvent }) => !isEvent && !isEmptyActivity(a));
    const events    = allItems.filter(({ isEvent }) => isEvent);
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
    const combined = [...events, ...realActs]; // events first, then completed activities
    const shownItems = combined.slice(0, maxCards);
    const extraItems = combined.length - maxCards;

    const cardsHtml = shownItems.map(({ a, stateIdx, isEvent: isEv }) => {
      if (isEv) {
        // Planned event card (workout, note, race, goal)
        const evName = a.name || a.category || 'Event';
        const cat = (a.category || '').toUpperCase();
        const catLabel = cat === 'WORKOUT' ? 'Workout' : cat === 'RACE' ? 'Race' : cat === 'GOAL' ? 'Goal' : 'Note';
        const catCls = 'cal-ev-cat--' + catLabel.toLowerCase();
        window._calEvLookup[a.id] = a;
        return `<div class="cal-day-card cal-day-card--planned ${catCls}" onclick="event.stopPropagation();openCalEventModal(window._calEvLookup[${a.id}])">
          <div class="cal-day-card-top">
            <span class="cal-ev-badge ${catCls}">${catLabel}</span>
          </div>
          <div class="cal-day-card-name">${evName}</div>
        </div>`;
      }
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
    const moreHtml = extraItems > 0 ? `<div class="cal-day-more">+${extraItems} more</div>` : '';
    const desktopHtml = `<div class="cal-day-cards">${cardsHtml}${moreHtml}</div>`;

    // ── Mobile: dot indicators (hidden on desktop via CSS) ──
    const seenTypes = new Set();
    // Show event dots first (hollow ring style handled via CSS)
    const eventDots = events.reduce((acc, { a }) => {
      const cat = (a.category || '').toLowerCase();
      const key = 'cal-ev--' + cat;
      if (!seenTypes.has(key) && seenTypes.size < 3) {
        seenTypes.add(key);
        acc += `<div class="cal-dot cal-dot--planned ${key}"></div>`;
      }
      return acc;
    }, '');
    const dots = realActs.reduce((acc, { a }) => {
      const tc = calEventClass(a);
      if (!seenTypes.has(tc) && seenTypes.size < 3) {
        seenTypes.add(tc);
        acc += `<div class="cal-dot ${tc}"></div>`;
      }
      return acc;
    }, eventDots);
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

  // On mobile: fill prev/next band slides and reset track to center
  if (window.innerWidth <= 600) {
    const prevM = new Date(year, month - 1, 1);
    const nextM = new Date(year, month + 1, 1);
    const prevGrid = document.getElementById('calGridPrev');
    const nextGrid = document.getElementById('calGridNext');
    if (prevGrid) prevGrid.innerHTML = _buildCalSideGridHTML(prevM.getFullYear(), prevM.getMonth(), actMap, todayStr);
    if (nextGrid) nextGrid.innerHTML = _buildCalSideGridHTML(nextM.getFullYear(), nextM.getMonth(), actMap, todayStr);
    const track = document.getElementById('calBandTrack');
    const wrapper = document.getElementById('calBandWrapper');
    if (track && wrapper) {
      track.style.transition = 'none';
      track.style.transform = `translateX(${-wrapper.offsetWidth}px)`;
    }
  }
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
  const allItems = map[dateStr] || [];
  const events = allItems.filter(({ isEvent }) => isEvent);
  const acts   = allItems.filter(({ a, isEvent }) => !isEvent && !isEmptyActivity(a));

  if (events.length === 0 && acts.length === 0) {
    list.innerHTML = '<div class="cal-day-empty">No activities</div>';
    return;
  }

  const chevronSvg = `<svg class="cal-list-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;

  // Render planned events first
  const evHtml = events.map(({ a }) => {
    const evName = a.name || a.category || 'Event';
    const cat = (a.category || '').toUpperCase();
    const catLabel = cat === 'WORKOUT' ? 'Workout' : cat === 'RACE' ? 'Race' : cat === 'GOAL' ? 'Goal' : 'Note';
    const catCls = 'cal-ev-cat--' + catLabel.toLowerCase();
    const desc = a.description ? `<div class="cal-list-meta">${a.description.slice(0, 60)}${a.description.length > 60 ? '...' : ''}</div>` : '';
    const tss = a.icu_training_load || 0;
    const dist = (a.distance || 0) / 1000;
    const secs = a.moving_time || 0;
    const meta = [
      dist > 0.1 ? dist.toFixed(1) + ' km' : '',
      secs > 0   ? fmtDur(secs) : '',
    ].filter(Boolean).join(' · ');
    if (!window._calEvLookup) window._calEvLookup = {};
    window._calEvLookup[a.id] = a;
    return `<div class="cal-list-item cal-list-item--planned" onclick="openCalEventModal(window._calEvLookup[${a.id}])">
      <div class="cal-list-dot cal-list-dot--planned ${catCls}"></div>
      <div class="cal-list-info">
        <div class="cal-list-name">${evName}</div>
        ${meta ? `<div class="cal-list-meta">${meta}</div>` : desc}
      </div>
      ${tss > 0 ? `<div class="cal-list-tss">${Math.round(tss)} TSS</div>` : `<span class="cal-ev-badge ${catCls}">${catLabel}</span>`}
      ${chevronSvg}
    </div>`;
  }).join('');

  // Render completed activities
  const actHtml = acts.map(({ a, stateIdx }) => {
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

  list.innerHTML = evHtml + actHtml;
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

  // Save scroll position for restoring when navigating back to activities list
  if (!fromStep && state.currentPage === 'activities') {
    const _ls = window._actListState?.allActivityList;
    window._actListScrollRestore = {
      scrollY: window.scrollY,
      cursor: _ls ? _ls.cursor : 0,
      actId: String(activity.id || activity.icu_activity_id || '')
    };
  }

  if (!fromStep) state.previousPage = state.currentPage;
  state.currentPage = 'activity';
  const _pillEl = document.getElementById('dashPillNav');
  if (_pillEl) _pillEl.style.display = 'none';

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
  // Sync sheet-mode floating nav
  const sPrev = document.getElementById('sheetNavPrev');
  const sNext = document.getElementById('sheetNavNext');
  const sCtr  = document.getElementById('sheetNavCounter');
  if (sPrev) sPrev.disabled = poolIdx <= 0;
  if (sNext) sNext.disabled = poolIdx < 0 || poolIdx >= pool.length - 1;
  if (sCtr)  sCtr.textContent = poolIdx >= 0 ? `${poolIdx + 1} / ${pool.length}` : '';

  // Prevent flash of stale content: hide content, do all setup, then reveal
  const _actPage = document.getElementById('page-activity');
  const pageContent = document.getElementById('pageContent');
  if (!fromStep && pageContent) {
    pageContent.style.visibility = 'hidden';
    destroyActivityCharts();
  }

  // Hide floating range pill when entering activity page
  const _pill = document.getElementById('dateRangePill');
  if (_pill) _pill.style.display = 'none';
  document.querySelector('.page-headline')?.classList.add('page-headline--hidden');
  if (pageContent) pageContent.classList.remove('page-content--calendar');

  // Show the activity page
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  _actPage.classList.add('active');
  if (!fromStep) {
    window.scrollTo(0, 0);
    const _sheetScroll = document.getElementById('actSheetScroll');
    if (_sheetScroll) _sheetScroll.scrollTop = 0;
  }

  // Render basic info immediately from cached data
  renderActivityBasic(activity);

  // Reveal after all sync DOM updates are done — rAF ensures browser
  // paints the new content, not the stale old layout
  if (!fromStep && pageContent) requestAnimationFrame(() => { pageContent.style.visibility = ''; });


  // Reset charts — when stepping prev/next, use skeleton overlays instead of hiding cards
  const _loadingEl = document.getElementById('detailChartsLoading');
  if (fromStep) {
    skeletonCards(true);
    destroyChartInstances();
  }
  _loadingEl.style.display = 'none';

  // Only try to fetch detail/streams if we have an id
  const actId = activity.id;
  if (!actId) { skeletonCards(false); return; }

  if (!fromStep) _loadingEl.style.display = 'flex';

  // Pre-warm the MapLibre map immediately (loads style + tiles in parallel with API fetches)
  _preWarmActivityMap();

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
      _loadingEl.innerHTML = '<div class="spinner"></div><span>Parsing FIT file…</span>';
      _loadingEl.style.display = 'flex';
      try {
        const fitBuf = await fetchFitFile(actId);
        if (fitBuf) {
          const fitRecords = parseFitBuffer(fitBuf);
          const fitStreams  = fitRecordsToStreams(fitRecords);
          if (fitStreams) streams = fitStreams;
        }
      } catch (_) { /* FIT unavailable — fall through to zone bar charts */ }
      _loadingEl.style.display = 'none';
    } else {
      _loadingEl.style.display = 'none';
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
    // Check cache first, then try streams, then fallback endpoints.
    const gpsCached = await actCacheGet(actId, 'gps');
    let latlngForMap = gpsCached;
    let gpsAlreadyResolved = false;
    // Sentinel means "we already tried and there's no GPS for this activity"
    if (gpsCached && gpsCached.__noGPS) { latlngForMap = null; gpsAlreadyResolved = true; }
    if (gpsCached) {
      gpsAlreadyResolved = true;
      // Backfill local folder from IDB (catches activities viewed before this feature)
      if (!gpsCached.__noGPS && window._fitOfflineSave) _fitOfflineSave(actId, 'gps', gpsCached);
    }

    // Check local backup folder if IDB missed
    if (!gpsAlreadyResolved && window._fitOfflineRead) {
      const localGps = await _fitOfflineRead(actId, 'gps');
      if (localGps) {
        latlngForMap = localGps.__noGPS ? null : localGps;
        gpsAlreadyResolved = true;
        actCachePut(actId, 'gps', localGps);
      }
    }

    if (!gpsAlreadyResolved) {
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

      // Cache the resolved GPS for next time (or sentinel if none found)
      const gpsToCache = latlngForMap || { __noGPS: true };
      actCachePut(actId, 'gps', gpsToCache);
      // Also save to local backup folder (fire-and-forget)
      if (latlngForMap && window._fitOfflineSave) _fitOfflineSave(actId, 'gps', gpsToCache);
    }
    renderActivityMap(latlngForMap, normStreams);

    // Show/hide "Save Route" button — only for outdoor activities with GPS data
    const saveBtn = document.getElementById('actSaveRouteBtn');
    if (saveBtn) {
      const hasGPS = Array.isArray(latlngForMap) && latlngForMap.filter(p => p).length >= 2;
      const isOutdoor = calActivityEnvironment(richActivity) === 'outdoor';
      if (hasGPS && isOutdoor) {
        saveBtn.style.display = '';
        // Store refs for the save handler
        saveBtn._actData = { activity: richActivity, latlng: latlngForMap, normStreams };
      } else {
        saveBtn.style.display = 'none';
      }
    }

    // Stream charts when data came back; fall back to zone bar charts if not
    if (streams) {
      renderStreamCharts(normStreams, richActivity);
      // Append L/R balance tile to secondary stats if stream data exists
      const _lrRaw = normStreams.lrbalance || normStreams.left_right_balance || [];
      const _lrValid = _lrRaw.filter(v => v != null && v > 0);
      if (_lrValid.length > 10) {
        const _lrAvg = _lrValid.reduce((a, b) => a + b, 0) / _lrValid.length;
        const _lrLeft = Math.round(100 - _lrAvg);
        const _lrRight = Math.round(_lrAvg);
        const _secEl = document.getElementById('actSecondaryStats');
        if (_secEl) {
          _secEl.insertAdjacentHTML('beforeend', `<div class="act-sstat">
            <div class="act-sstat-top">
              <div class="act-sstat-icon purple"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg></div>
              <div class="act-sstat-lbl">L/R Bal</div>
            </div>
            <div class="act-sstat-val">${_lrLeft}/${_lrRight}%</div>
          </div>`);
        }
      }
    } else {
      renderActivityZoneCharts(richActivity);
    }

    // Supplementary cards — each shows/hides itself based on data availability
    renderDetailPerformance(richActivity, actId, normStreams);
    renderDetailDecoupleChart(normStreams, richActivity);
    renderDetailLRBalance(normStreams, richActivity);
    renderDetailZones(richActivity);
    renderDetailHRZones(richActivity);
    initZonesCarousel();
    renderActivityIntervals(actId);  // async — shows/hides its own card
    renderLapSplits(richActivity);
    // Both zone cards always show now (with NA if no data), so the row is always two-column
    renderDetailHistogram(richActivity, normStreams);
    renderDetailTempChart(normStreams, richActivity);
    renderDetailGradientProfile(normStreams, richActivity);
    renderClimbDetection(normStreams, richActivity);
    renderDetailCadenceHist(normStreams, richActivity);
    renderDetailCurve(actId, normStreams);   // async — shows/hides its own card
    renderDetailHRCurve(normStreams);        // async — shows/hides its own card
  } catch (err) {
    console.error('[Activity detail] Unhandled error:', err);
    _loadingEl.style.display = 'none';
    skeletonCards(false);
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

/* ── Unified keyboard shortcuts ── */
function toggleKbOverlay() {
  const o = document.getElementById('kbShortcutsOverlay');
  if (!o) return;
  o.style.display = o.style.display === 'flex' ? 'none' : 'flex';
}
document.addEventListener('keydown', (e) => {
  // Skip when typing in form fields (Escape still blurs)
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
    if (e.key === 'Escape') document.activeElement.blur();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  // Escape → close fullscreen map / keyboard overlay / open dialogs
  if (e.key === 'Escape') {
    if (document.getElementById('detailMapCard')?.classList.contains('map-fullscreen')) {
      toggleMapFullscreen(); return;
    }
    const overlay = document.getElementById('kbShortcutsOverlay');
    if (overlay?.style.display === 'flex') { overlay.style.display = 'none'; return; }
    return;
  }

  // 1-8 → navigate pages
  const PAGE_KEYS = {
    '1': 'dashboard', '2': 'activities', '3': 'calendar', '4': 'fitness',
    '5': 'power', '6': 'zones', '7': 'goals', '8': 'settings'
  };
  if (PAGE_KEYS[e.key]) { e.preventDefault(); navigate(PAGE_KEYS[e.key]); return; }

  // Arrow keys → step activity (on activity page)
  if (state.currentPage === 'activity') {
    if (e.key === 'ArrowLeft')  { e.preventDefault(); stepActivity(-1); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); stepActivity(1);  return; }
  }

  // S → open activity search modal on activities page
  if (e.key === 's' && state.currentPage === 'activities') {
    e.preventDefault();
    openActivitySearch();
    return;
  }

  // R → refresh / sync
  if (e.key === 'r') { e.preventDefault(); syncData(true); return; }

  // ? → toggle keyboard shortcut help
  if (e.key === '?') { e.preventDefault(); toggleKbOverlay(); return; }
});

function toggleMapStats() {
  const panel = document.getElementById('mapStatsPanel');
  if (!panel) return;
  panel.classList.toggle('collapsed');
}

// Save the GPS route from current activity to Route Builder's saved routes (IndexedDB)
async function saveActivityRoute() {
  const btn = document.getElementById('actSaveRouteBtn');
  if (!btn?._actData) return;
  const { activity, latlng, normStreams: ns } = btn._actData;

  // Filter valid GPS points
  const pts = latlng.filter(p => p && p[0] != null && p[1] != null);
  if (pts.length < 2) { showToast('No GPS data to save', 'error'); return; }

  // Build elevation data from altitude + distance streams
  const altArr  = ns?.altitude  || [];
  const distArr = ns?.distance  || [];
  const elevData = [];
  if (altArr.length && distArr.length && altArr.length === distArr.length) {
    for (let i = 0; i < altArr.length; i++) {
      if (altArr[i] == null || distArr[i] == null) continue;
      const prev = elevData.length > 0 ? elevData[elevData.length - 1] : null;
      const grade = prev && (distArr[i] - prev.dist) > 0
        ? ((altArr[i] - prev.elev) / (distArr[i] - prev.dist)) * 100 : 0;
      const pt = pts[Math.min(i, pts.length - 1)];
      elevData.push({ dist: distArr[i], elev: altArr[i], grade, lat: pt[0], lng: pt[1] });
    }
  }

  // Distance in meters
  const dist = activity.distance || activity.icu_distance || 0;
  const elevGain = activity.total_elevation_gain || 0;
  const elevLoss = activity.elev_loss || 0;

  const route = {
    id:        crypto.randomUUID(),
    name:      activity.name || 'Activity Route',
    ts:        Date.now(),
    waypoints: [
      { lat: pts[0][0], lng: pts[0][1] },
      { lat: pts[pts.length - 1][0], lng: pts[pts.length - 1][1] }
    ],
    routePoints:   pts,
    elevationData: elevData,
    distance:      dist,
    elevGain,
    elevLoss,
    segments: [{
      points:          pts,
      distance:        dist,
      duration:        activity.moving_time || activity.elapsed_time || 0,
      annotations:     null,
      brouterSurfaces: null,
    }],
    fromActivity: true,
  };

  try {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('cycleiq_routes', 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('routes'))
          d.createObjectStore('routes', { keyPath: 'id' }).createIndex('ts', 'ts', { unique: false });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
    const tx = db.transaction('routes', 'readwrite');
    tx.objectStore('routes').put(route);
    await new Promise((r, j) => { tx.oncomplete = r; tx.onerror = j; });
    db.close();
    showToast('Route saved — click to open in Route Builder', 'success');
    // Also save to local backup folder (fire-and-forget)
    if (window._routeOfflineSave) _routeOfflineSave(route);
    // Make toast clickable to navigate to Route Builder
    const toast = document.querySelector('.toast-container .toast:last-child');
    if (toast) {
      toast.style.cursor = 'pointer';
      toast.addEventListener('click', () => navigate('routeBuilder'));
    }
    // Disable button after save to prevent duplicates
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Saved';
  } catch (e) {
    console.error('[saveActivityRoute]', e);
    showToast('Failed to save route', 'error');
  }
}

function toggleMapFullscreen() {
  const card = document.getElementById('detailMapCard');
  if (!card) return;

  if (!card.classList.contains('map-fullscreen')) {
    _onMapFullscreenEnter(card);
  } else {
    _onMapFullscreenExit(card);
  }
}

function _onMapFullscreenEnter(card) {
  card.classList.add('map-fullscreen');
  const mapBg = document.getElementById('actSheetMapBg');
  if (mapBg) mapBg.classList.add('map-fullscreen');
  const btn = document.getElementById('mapExpandBtn');
  if (btn) {
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';
    btn.title = 'Close fullscreen';
  }
  document.body.style.overflow = 'hidden';
  setTimeout(() => { if (state.activityMap) state.activityMap.resize(); }, 120);
}

function _onMapFullscreenExit(card) {
  card.classList.add('map-fullscreen-exit');
  card.classList.remove('map-fullscreen');
  const mapBg = document.getElementById('actSheetMapBg');
  if (mapBg) mapBg.classList.remove('map-fullscreen');
  setTimeout(() => card.classList.remove('map-fullscreen-exit'), 250);
  const btn = document.getElementById('mapExpandBtn');
  if (btn) {
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';
    btn.title = 'Expand map';
  }
  document.body.style.overflow = '';
  setTimeout(() => { if (state.activityMap) state.activityMap.resize(); }, 120);
}

/* ====================================================
   BOTTOM SHEET — Strava-style map-behind-sheet layout
==================================================== */
// ── Shared Bottom Sheet Controller Factory ─────────────────────────────────
// Used by both the Activity page and Route Builder page.
// config: { sheetEl, scrollEl, handleSelector, onStateChange(newState),
//           SNAP_PEEK, SNAP_EXPANDED, SNAP_HIDDEN }
function createSheetController(config) {
  const SNAP_PEEK     = config.SNAP_PEEK     ?? 0.50;
  const SNAP_EXPANDED = config.SNAP_EXPANDED ?? 0;
  const SNAP_HIDDEN   = config.SNAP_HIDDEN   ?? 0.85;
  const handleSel     = config.handleSelector || '[class*="sheet-handle"]';

  const s = {
    el: config.sheetEl,
    scroll: config.scrollEl,
    state: 'peek',
    currentY: 0,
    startY: 0,
    startSheetY: 0,
    velocity: 0,
    prevY: 0,
    prevT: 0,
    tracking: false,
    directionLocked: false,
    touchOnHandle: false,
    active: false,
    routeBounds: null,
    _onTouch: null, _onMove: null, _onEnd: null,
    _onMouse: null, _onResize: null, _onWheel: null,
    _wheelLocked: false,
  };

  function _setState(newState) {
    const vh = window.innerHeight;
    let targetY;
    switch (newState) {
      case 'expanded': targetY = vh * SNAP_EXPANDED; break;
      case 'peek':     targetY = vh * SNAP_PEEK; break;
      case 'hidden':   targetY = vh * SNAP_HIDDEN; break;
      default:         targetY = vh * SNAP_PEEK;
    }
    s.currentY = targetY;
    s.state = newState;
    s.el.classList.remove('dragging');
    s.el.style.transform = `translateY(${targetY}px)`;
    s.el.classList.toggle('sheet-expanded', newState === 'expanded');
    if (newState === 'hidden') {
      s.el.classList.add('sheet-peek');
      s.scroll.style.overflowY = 'hidden';
    } else {
      s.el.classList.remove('sheet-peek');
      s.scroll.style.overflowY = 'auto';
    }
    if (config.onStateChange) config.onStateChange(newState, s);
  }

  function _touchStart(e) {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    s.startY = touch.clientY;
    s.prevY = touch.clientY;
    s.prevT = e.timeStamp;
    s.velocity = 0;
    s.directionLocked = false;
    s.tracking = false;
    s.startSheetY = s.currentY;
    const handle = s.el.querySelector(handleSel);
    s.touchOnHandle = handle && handle.contains(e.target);
  }

  function _touchMove(e) {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const dy = touch.clientY - s.startY;
    const absDy = Math.abs(dy);
    if (!s.directionLocked) {
      if (absDy < 8) return;
      s.directionLocked = true;
      if (s.state === 'expanded' && !s.touchOnHandle) {
        if (dy > 0 && s.scroll.scrollTop <= 1) { s.tracking = true; }
        else { s.tracking = false; return; }
      } else { s.tracking = true; }
      s.el.classList.add('dragging');
    }
    if (!s.tracking) return;
    e.preventDefault();
    const dt = e.timeStamp - s.prevT;
    if (dt > 0) {
      const instantV = (touch.clientY - s.prevY) / dt;
      s.velocity = 0.4 * s.velocity + 0.6 * instantV;
    }
    s.prevY = touch.clientY;
    s.prevT = e.timeStamp;
    const vh = window.innerHeight;
    const newY = s.startSheetY + dy;
    const clamped = Math.max(0, Math.min(vh * SNAP_HIDDEN, newY));
    s.currentY = clamped;
    s.el.style.transform = `translateY(${clamped}px)`;
  }

  function _touchEnd() {
    if (!s.tracking) { s.directionLocked = false; return; }
    s.el.classList.remove('dragging');
    const vh = window.innerHeight;
    const currentFrac = s.currentY / vh;
    const VEL = 0.4;
    let target;
    if (Math.abs(s.velocity) > VEL) {
      target = s.velocity > 0
        ? (s.state === 'expanded' ? 'peek' : 'hidden')
        : (s.state === 'hidden' ? 'peek' : 'expanded');
    } else {
      target = currentFrac < 0.22 ? 'expanded' : currentFrac < 0.68 ? 'peek' : 'hidden';
    }
    _setState(target);
    s.tracking = false;
    s.directionLocked = false;
  }

  function _mouseDown(e) {
    e.preventDefault();
    s.startY = e.clientY;
    s.startSheetY = s.currentY;
    s.el.classList.add('dragging');
    const onMove = (ev) => {
      const dy = ev.clientY - s.startY;
      const vh = window.innerHeight;
      const newY = Math.max(0, Math.min(vh * SNAP_HIDDEN, s.startSheetY + dy));
      s.currentY = newY;
      s.el.style.transform = `translateY(${newY}px)`;
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      s.el.classList.remove('dragging');
      const vh = window.innerHeight;
      const frac = s.currentY / vh;
      _setState(frac < 0.22 ? 'expanded' : frac < 0.68 ? 'peek' : 'hidden');
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  return {
    get state()  { return s.state; },
    get active() { return s.active; },
    get routeBounds() { return s.routeBounds; },
    set routeBounds(v) { s.routeBounds = v; },

    activate() {
      if (s.active) return;
      s.active = true;
      if (s.scroll) s.scroll.scrollTop = 0;
      _setState('peek');

      s._onTouch = _touchStart;
      s._onMove  = _touchMove;
      s._onEnd   = _touchEnd;
      s.el.addEventListener('touchstart', s._onTouch, { passive: true });
      s.el.addEventListener('touchmove',  s._onMove,  { passive: false });
      s.el.addEventListener('touchend',   s._onEnd,   { passive: true });

      const handle = s.el.querySelector(handleSel);
      if (handle) { s._onMouse = _mouseDown; handle.addEventListener('mousedown', s._onMouse); }

      s._wheelLocked = false;
      s._onWheel = (e) => {
        if (s._wheelLocked) { if (s.state === 'peek') e.preventDefault(); return; }
        if (s.state === 'peek' && e.deltaY > 0) {
          e.preventDefault(); s._wheelLocked = true; _setState('expanded');
          setTimeout(() => { s._wheelLocked = false; }, 400); return;
        }
        if (s.state === 'expanded' && e.deltaY < 0 && s.scroll.scrollTop <= 0) {
          e.preventDefault(); s._wheelLocked = true; _setState('peek');
          setTimeout(() => { s._wheelLocked = false; }, 400); return;
        }
      };
      s.el.addEventListener('wheel', s._onWheel, { passive: false });

      s._onResize = () => { if (s.active) _setState(s.state); };
      window.addEventListener('resize', s._onResize);
    },

    deactivate() {
      if (!s.active) return;
      s.el.removeEventListener('touchstart', s._onTouch);
      s.el.removeEventListener('touchmove',  s._onMove);
      s.el.removeEventListener('touchend',   s._onEnd);
      const handle = s.el.querySelector(handleSel);
      if (handle && s._onMouse) handle.removeEventListener('mousedown', s._onMouse);
      if (s._onWheel) s.el.removeEventListener('wheel', s._onWheel);
      if (s._onResize) window.removeEventListener('resize', s._onResize);
      s.el.style.transform = '';
      s.el.classList.remove('dragging', 'sheet-peek', 'sheet-expanded');
      if (s.scroll) s.scroll.style.overflowY = '';
      s.active = false;
      s.state = 'peek';
    },

    setState(name) { _setState(name); },
  };
}
window.createSheetController = createSheetController;

// ── Activity-page sheet (uses shared controller) ───────────────────────────
const _sheet = {
  _ctrl: null,
  mapBg: null,
  get state()       { return this._ctrl ? this._ctrl.state : 'peek'; },
  get active()      { return this._ctrl ? this._ctrl.active : false; },
  get routeBounds() { return this._ctrl ? this._ctrl.routeBounds : null; },
  set routeBounds(v){ if (this._ctrl) this._ctrl.routeBounds = v; },
  SNAP_PEEK: 0.50,
  SNAP_EXPANDED: 0,
  SNAP_HIDDEN: 0.85,
};

function activateSheetMode() {
  const page = document.getElementById('page-activity');
  const mapEl = document.getElementById('activityMap');
  const mapBg = document.getElementById('actSheetMapBg');
  const sheet = document.getElementById('actBottomSheet');
  if (!page || !mapEl || !mapBg || !sheet) return;

  page.classList.add('act-sheet-mode');

  // Reparent map into background container
  mapBg.appendChild(mapEl);

  // Move floating controls to map background
  const mapCard = document.getElementById('detailMapCard');
  if (mapCard) {
    const floatTop = mapCard.querySelector('.map-float-top');
    const statsPanel = mapCard.querySelector('.map-stats-panel');
    const ftBar = document.getElementById('flythroughBar');
    const fsBottom = mapCard.querySelector('.fs-bottom-row');
    if (floatTop) mapBg.appendChild(floatTop);
    if (statsPanel) mapBg.appendChild(statsPanel);
    if (ftBar) sheet.appendChild(ftBar);
    if (fsBottom) mapBg.appendChild(fsBottom);
  }

  // Resize map after reparenting
  requestAnimationFrame(() => {
    if (state.activityMap) state.activityMap.resize();
  });

  _sheet.mapBg = mapBg;

  // Create the shared controller
  _sheet._ctrl = createSheetController({
    sheetEl: sheet,
    scrollEl: document.getElementById('actSheetScroll'),
    handleSelector: '.act-sheet-handle',
    SNAP_PEEK: _sheet.SNAP_PEEK,
    SNAP_EXPANDED: _sheet.SNAP_EXPANDED,
    SNAP_HIDDEN: _sheet.SNAP_HIDDEN,
    onStateChange(newState) {
      // Hide floating menu button when sheet covers the title area
      const menuBtn = document.getElementById('floatingMenuBtn');
      if (menuBtn) menuBtn.style.display = (newState === 'hidden') ? 'none' : '';
      // Collapse flythrough bar
      if (newState !== 'hidden') {
        const ftBarEl = document.getElementById('flythroughBar');
        if (ftBarEl && ftBarEl.classList.contains('ft-expanded')) {
          ftBarEl.classList.remove('ft-expanded');
          if (state.flythrough && state.flythrough.playing) window.ftTogglePlay();
        }
      }
      // Resize map and refit route
      const vh = window.innerHeight;
      setTimeout(() => {
        if (state.activityMap) {
          state.activityMap.resize();
          if (_sheet.routeBounds) {
            const bPad = newState === 'hidden'
              ? Math.round(vh * (1 - _sheet.SNAP_HIDDEN)) + 80
              : Math.round(vh * (newState === 'peek' ? _sheet.SNAP_PEEK : 0.15)) + 120;
            state.activityMap.fitBounds(_sheet.routeBounds, {
              padding: { top: 64, right: 40, bottom: bPad, left: 40 },
              duration: 400
            });
          }
        }
      }, 400);
    },
  });
  _sheet._ctrl.activate();

  // ── Horizontal swipe on sheet handle → step between activities ──
  const handle = sheet.querySelector('.act-sheet-handle');
  if (handle) {
    let swStartX = 0, swStartY = 0, swTracking = false;
    function swTouchStart(e) {
      if (e.touches.length !== 1) return;
      swStartX = e.touches[0].clientX;
      swStartY = e.touches[0].clientY;
      swTracking = true;
    }
    function swTouchMove(e) {
      if (!swTracking || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - swStartX;
      const dy = e.touches[0].clientY - swStartY;
      // Only process horizontal swipes (ratio > 2:1, min 50px)
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 2) {
        swTracking = false;
        stepActivity(dx < 0 ? 1 : -1); // swipe left = older, right = newer
      }
    }
    function swTouchEnd() { swTracking = false; }
    handle.addEventListener('touchstart', swTouchStart, { passive: true });
    handle.addEventListener('touchmove', swTouchMove, { passive: true });
    handle.addEventListener('touchend', swTouchEnd, { passive: true });
    _pageCleanupFns.push(() => {
      handle.removeEventListener('touchstart', swTouchStart);
      handle.removeEventListener('touchmove', swTouchMove);
      handle.removeEventListener('touchend', swTouchEnd);
    });
  }
}

function deactivateSheetMode() {
  const page = document.getElementById('page-activity');
  if (!page || !_sheet.active) return;

  page.classList.remove('act-sheet-mode');

  // Reparent map + controls back to #detailMapCard
  const mapEl = document.getElementById('activityMap');
  const mapCard = document.getElementById('detailMapCard');
  const mapBg = _sheet.mapBg;

  if (mapEl && mapCard) {
    const mapWrap = mapCard.querySelector('.act-map-wrap') || mapCard;
    mapWrap.insertBefore(mapEl, mapWrap.firstChild);
  }
  if (mapBg && mapCard) {
    const floatTop = mapBg.querySelector('.map-float-top');
    const statsPanel = mapBg.querySelector('.map-stats-panel');
    const ftBar = document.getElementById('flythroughBar');
    const fsBottom = mapBg.querySelector('.fs-bottom-row');
    if (floatTop) mapCard.appendChild(floatTop);
    if (statsPanel) mapCard.appendChild(statsPanel);
    if (ftBar) mapCard.appendChild(ftBar);
    if (fsBottom) mapCard.appendChild(fsBottom);
  }

  if (_sheet._ctrl) _sheet._ctrl.deactivate();
  _sheet._ctrl = null;
  _sheet.mapBg = null;
  // Restore floating menu button visibility
  const menuBtn = document.getElementById('floatingMenuBtn');
  if (menuBtn) menuBtn.style.display = '';
}

// Compatibility wrapper — code outside may call _setSheetState directly
function _setSheetState(newState) {
  if (_sheet._ctrl) _sheet._ctrl.setState(newState);
}

// ── Skeleton helpers for smooth activity stepping ──────────────
const _DETAIL_CARD_IDS = [
  'detailMapCard', 'detailStreamsCard', 'detailChartsRow', 'detailZonesCard', 'detailHRZonesCard',
  'detailHistogramCard', 'detailCurveCard', 'detailHRCurveCard', 'detailPerfCard',
  'detailWeatherCard', 'detailTempCard', 'detailDecoupleCard', 'detailLRBalanceCard',
  'detailGradientCard', 'detailClimbsCard', 'detailCadenceCard', 'detailCompareCard',
  'detailZonesCarouselCard', 'detailCurvesRow', 'detailIntervalsCard', 'detailLapSplitsCard', 'detailNotesCard'];

function skeletonCards(show) {
  _DETAIL_CARD_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (show) {
      if (el.style.display !== 'none') el.classList.add('card-skeleton');
    } else {
      el.classList.remove('card-skeleton');
    }
  });
}
function unskeletonCard(id) {
  document.getElementById(id)?.classList.remove('card-skeleton');
}

// Destroy Chart.js / Leaflet instances only (no card hiding)
function destroyChartInstances() {
  if (state.flythrough?.rafId) { cancelAnimationFrame(state.flythrough.rafId); }
  state.flythrough = null;
  const _miniC = document.getElementById('fsMiniChart');
  if (_miniC) _miniC.classList.remove('mc-ready');
  if (state._preWarmMap) { try { state._preWarmMap.remove(); } catch(_){} state._preWarmMap = null; }
  if (state.activityMap) { state.activityMap.remove(); state.activityMap = null; }
  state._actMapThemeKey = null;
  state.activityStreamsChart   = destroyChart(state.activityStreamsChart);
  state.activityPowerChart     = destroyChart(state.activityPowerChart);
  state.activityHRChart        = destroyChart(state.activityHRChart);
  state.activityCurveChart     = destroyChart(state.activityCurveChart);
  state.activityHRCurveChart   = destroyChart(state.activityHRCurveChart);
  state.activityHistogramChart = destroyChart(state.activityHistogramChart);
  state.activityGradientChart  = destroyChart(state.activityGradientChart);
  state.activityCadenceChart   = destroyChart(state.activityCadenceChart);
  window._tempChart = destroyChart(window._tempChart);
  state._detailDecoupleChart = destroyChart(state._detailDecoupleChart);
  state._detailLRBalChart = destroyChart(state._detailLRBalChart);
  // Clear NA overlays so they don't double-up
  _DETAIL_CARD_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.querySelectorAll('.detail-na-inject').forEach(e => e.remove());
    el.querySelectorAll('[data-na-hidden]').forEach(e => { e.style.display = ''; delete e.dataset.naHidden; });
  });
}

function destroyActivityCharts() {
  // Deactivate bottom sheet before destroying map
  deactivateSheetMode();
  // Exit map fullscreen if active
  const mapCard = document.getElementById('detailMapCard');
  if (mapCard?.classList.contains('map-fullscreen')) {
    mapCard.classList.remove('map-fullscreen');
    document.body.style.overflow = '';
  }
  destroyChartInstances();
  _DETAIL_CARD_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = 'none';
    el.classList.remove('card-skeleton');
  });
}

/* ====================================================
   ACTIVITY DETAIL CACHE  (IndexedDB)
   Caches detail, streams, GPS, and power curve for
   recently viewed activities.  Keeps last 20 activities;
   auto-prunes older entries (up to 4 entries per activity).
==================================================== */
const ACT_CACHE_DB   = 'cycleiq_actcache';
const ACT_CACHE_VER  = 1;
const ACT_CACHE_MAX_DEFAULT = 20;

/* ── Offline storage config ── */
const OFFLINE_LIMITS      = [0, 50, 100, 200, Infinity];
const OFFLINE_AVG_SIZE    = 100 * 1024; // ~100 KB per activity
const OFFLINE_THROTTLE_MS = 400;

function getOfflineLimit() {
  const raw = localStorage.getItem('icu_offline_limit');
  if (raw === null) return 0;
  if (raw === 'Infinity') return Infinity;
  const n = Number(raw);
  return OFFLINE_LIMITS.includes(n) ? n : 0;
}
function setOfflineLimit(limit) {
  localStorage.setItem('icu_offline_limit', String(limit));
}
function getActCacheMax() {
  const ol = getOfflineLimit();
  return ol > 0 ? Math.max(ol, ACT_CACHE_MAX_DEFAULT) : ACT_CACHE_MAX_DEFAULT;
}

function _actCacheDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(ACT_CACHE_DB, ACT_CACHE_VER);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('items')) {
        const store = db.createObjectStore('items', { keyPath: 'key' });
        store.createIndex('ts', 'ts', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

/** Get cached data — returns null on miss */
async function actCacheGet(activityId, type) {
  try {
    const db  = await _actCacheDB();
    const key = `${activityId}_${type}`;
    return new Promise(resolve => {
      const tx  = db.transaction('items', 'readonly');
      const req = tx.objectStore('items').get(key);
      req.onsuccess = () => {
        const row = req.result;
        if (!row) return resolve(null);
        actCacheTouch(activityId, type);
        resolve(row.data);
      };
      req.onerror = () => resolve(null);
    });
  } catch (_) { return null; }
}

/** Store data in cache + auto-prune */
async function actCachePut(activityId, type, data) {
  try {
    const db  = await _actCacheDB();
    const key = `${activityId}_${type}`;
    const tx  = db.transaction('items', 'readwrite');
    tx.objectStore('items').put({ key, data, ts: Date.now() });
    await new Promise(r => { tx.oncomplete = r; tx.onerror = r; });
    actCachePrune();
  } catch (_) {}
}

/** Update timestamp (LRU touch) so recently viewed stays cached */
async function actCacheTouch(activityId, type) {
  try {
    const db  = await _actCacheDB();
    const key = `${activityId}_${type}`;
    const tx  = db.transaction('items', 'readwrite');
    const store = tx.objectStore('items');
    const req = store.get(key);
    req.onsuccess = () => {
      const row = req.result;
      if (row) { row.ts = Date.now(); store.put(row); }
    };
  } catch (_) {}
}

/** Keep only newest ACT_CACHE_MAX * 4 entries (detail + streams + gps + pcurve) */
async function actCachePrune() {
  try {
    const db    = await _actCacheDB();
    const tx    = db.transaction('items', 'readwrite');
    const store = tx.objectStore('items');
    const idx   = store.index('ts');
    const countReq = store.count();
    countReq.onsuccess = () => {
      const total = countReq.result;
      const maxEntries = getActCacheMax() * 4;
      if (total <= maxEntries) return;
      const deleteCount = total - maxEntries;
      let deleted = 0;
      const cursor = idx.openCursor();
      cursor.onsuccess = e => {
        const c = e.target.result;
        if (c && deleted < deleteCount) {
          c.delete();
          deleted++;
          c.continue();
        }
      };
    };
  } catch (_) {}
}

/** Get set of activity IDs that have both detail + streams cached (key-only scan) */
async function actCacheGetCachedIds() {
  try {
    const db = await _actCacheDB();
    const tx = db.transaction('items', 'readonly');
    const keys = await new Promise((res, rej) => {
      const req = tx.objectStore('items').getAllKeys();
      req.onsuccess = () => res(req.result);
      req.onerror   = () => rej(req.error);
    });
    const detailIds = new Set(), streamIds = new Set();
    for (const key of keys) {
      if (key.endsWith('_detail'))  detailIds.add(key.slice(0, -7));
      if (key.endsWith('_streams')) streamIds.add(key.slice(0, -8));
    }
    const fully = new Set();
    for (const id of detailIds) { if (streamIds.has(id)) fully.add(id); }
    return fully;
  } catch (_) { return new Set(); }
}

/* ====================================================
   ACTIVITY DETAIL — DATA FETCHING
==================================================== */
async function fetchActivityDetail(activityId) {
  // 1. IDB (fastest — same device)
  const cached = await actCacheGet(activityId, 'detail');
  if (cached) {
    // Backfill local folder if not there yet (catches activities viewed before this feature)
    if (window._fitOfflineSave) _fitOfflineSave(activityId, 'detail', cached);
    return cached;
  }

  // 2. Local backup folder (works on fresh installs / other devices)
  if (window._fitOfflineRead) {
    const local = await _fitOfflineRead(activityId, 'detail');
    if (local) { actCachePut(activityId, 'detail', local); return local; }
  }

  // 3. Network
  const raw = await icuFetch(`/athlete/${state.athleteId}/activities/${activityId}`);
  const result = Array.isArray(raw) ? raw[0] : raw;

  if (result) {
    actCachePut(activityId, 'detail', result);
    // Save to local folder in background (fire-and-forget)
    if (window._fitOfflineSave) _fitOfflineSave(activityId, 'detail', result);
  }
  return result;
}

async function fetchActivityStreams(activityId) {
  // 1. IDB (fastest — same device)
  const cached = await actCacheGet(activityId, 'streams');
  if (cached) {
    if (cached.__noStreams) return null;  // sentinel: known to have no streams
    // Backfill local JSON only — never download FIT from IDB path (avoids API calls)
    if (window._fitOfflineSave) _fitOfflineSave(activityId, 'streams', cached);
    return cached;
  }

  // 2. Local backup folder (works on fresh installs / other devices)
  if (window._fitOfflineRead) {
    const local = await _fitOfflineRead(activityId, 'streams');
    if (local) {
      actCachePut(activityId, 'streams', local);
      return local.__noStreams ? null : local;
    }
  }

  const types   = 'time,watts,heartrate,cadence,velocity_smooth,altitude,distance,latlng,lat,lng,grade_smooth,temp,temperature,lrbalance';
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
    rlTrackRequest();
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
        rlTrackRequest();
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
    // 3a. Cache in IDB and local folder, then return
    actCachePut(activityId, 'streams', streams);
    if (window._fitOfflineSave)    _fitOfflineSave(activityId, 'streams', streams);   // background
    if (window._fitOfflineSaveFit) _fitOfflineSaveFit(activityId);                    // background
    return streams;
  }

  // Full fallback: unfiltered endpoint
  try {
    const res = await fetch(ICU_BASE + `/activity/${activityId}/streams`, { headers });
    rlTrackRequest();
    if (res.ok) {
      const data = await res.json();
      if (data && (Array.isArray(data) ? data.length : Object.keys(data).length)) {
        actCachePut(activityId, 'streams', data);
        // 3b. Also save to local folder
        if (window._fitOfflineSave)    _fitOfflineSave(activityId, 'streams', data);  // background
        if (window._fitOfflineSaveFit) _fitOfflineSaveFit(activityId);                // background
        return data;
      }
    }
  } catch (_) {}

  // Cache sentinel so we don't retry on next visit
  actCachePut(activityId, 'streams', { __noStreams: true });
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
    if (res.ok) { rlTrackRequest(); return res.arrayBuffer(); }
  }
  return null;
}

// Fetch GPS track from intervals.icu's map endpoint.
// Their website uses /api/activity/{id}/map but that lacks CORS headers.
// We try /api/v1/ variants first (CORS-enabled), then the internal one as a last hope.
// Returns [[lat,lng],...] pairs or null.
async function fetchMapGPS(activityId) {
  const numericId = String(activityId).replace(/^i/, '');
  // Two URLs: primary authenticated endpoint, then proxy fallback
  const urls = [
    ICU_BASE + `/activity/${activityId}/map`,
    `http://localhost:8080/icu-internal/activity/${numericId}/map`,
  ];

  let data = null;
  let definitive404 = false;

  for (const url of urls) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(url, { headers: authHeader(), signal: ctrl.signal });
      clearTimeout(timer);

      if (url.includes('intervals.icu')) rlTrackRequest();

      if (res.status === 404) { definitive404 = true; break; }
      if (res.status === 429) {
        // Rate limited — throw so caller can distinguish
        const err = new Error('RATE_LIMITED');
        err.rateLimited = true;
        throw err;
      }
      if (!res.ok) continue;

      data = await res.json();
      break;
    } catch (err) {
      if (err.rateLimited) throw err;    // propagate rate limit
      if (err.name === 'AbortError') continue; // timeout — try next URL
      // Network error — try fallback
    }
  }

  // Definitive no-GPS: API said 404
  if (definitive404) return null;

  // No data from any URL — transient failure
  if (!data) {
    const err = new Error('GPS_FETCH_FAILED');
    err.transient = true;
    throw err;
  }

  // Parse GPS track from response
  const track =
    data.latlngs     ||
    data.latlng      ||
    data.track       ||
    data.route       ||
    data.coordinates ||
    null;

  if (Array.isArray(track) && track.length > 0) {
    const firstNonNull = track.find(p => p != null);
    if (Array.isArray(firstNonNull)) return track;
    if (typeof firstNonNull === 'number' && track.length % 2 === 0) {
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

  // API responded 200 but no GPS tracks in the data — definitive no-GPS
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
        rlTrackRequest();
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
      if (res.ok) { rlTrackRequest(); break; }
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
/* ====================================================
   SIMILAR RIDES FINDER
==================================================== */
let _similarRidesRef = null;

function computeSimilarityScore(ref, cand) {
  const rSport = (ref.sport_type || ref.type || '').toLowerCase();
  const cSport = (cand.sport_type || cand.type || '').toLowerCase();
  if (rSport !== cSport) return 0;
  const rId = String(ref.id || ref.icu_activity_id || '');
  const cId = String(cand.id || cand.icu_activity_id || '');
  if (rId && cId && rId === cId) return 0;

  let score = 0;
  const rDist = actVal(ref, 'distance', 'icu_distance');
  const cDist = actVal(cand, 'distance', 'icu_distance');
  if (rDist > 0 && cDist > 0) {
    const r = cDist / rDist;
    if (r < 0.8 || r > 1.2) return 0;
    score += (1 - Math.abs(1 - r) / 0.2) * 30;
  }
  const rTime = actVal(ref, 'moving_time', 'elapsed_time', 'icu_moving_time');
  const cTime = actVal(cand, 'moving_time', 'elapsed_time', 'icu_moving_time');
  if (rTime > 0 && cTime > 0) {
    const r = cTime / rTime;
    if (r < 0.8 || r > 1.2) return 0;
    score += (1 - Math.abs(1 - r) / 0.2) * 30;
  }
  const rElev = actVal(ref, 'total_elevation_gain', 'icu_total_elevation_gain');
  const cElev = actVal(cand, 'total_elevation_gain', 'icu_total_elevation_gain');
  if (rElev > 50 && cElev > 50) {
    const r = cElev / rElev;
    if (r >= 0.7 && r <= 1.3) score += (1 - Math.abs(1 - r) / 0.3) * 20;
  }
  const rPwr = actVal(ref, 'icu_weighted_avg_watts', 'average_watts');
  const cPwr = actVal(cand, 'icu_weighted_avg_watts', 'average_watts');
  if (rPwr > 0 && cPwr > 0) {
    const r = cPwr / rPwr;
    if (r >= 0.85 && r <= 1.15) score += (1 - Math.abs(1 - r) / 0.15) * 20;
  }
  return Math.round(score);
}

function findSimilarRides(ref, limit = 10) {
  return getAllActivities().filter(a => !isEmptyActivity(a))
    .map(a => ({ activity: a, score: computeSimilarityScore(ref, a) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function openSimilarRidesModal() {
  const a = _similarRidesRef;
  if (!a) return;
  const results = findSimilarRides(a, 10);
  const list = document.getElementById('similarRidesList');
  const desc = document.getElementById('similarRidesDesc');

  const refDist = actVal(a, 'distance', 'icu_distance');
  const refTime = actVal(a, 'moving_time', 'elapsed_time', 'icu_moving_time');
  const dF = refDist > 0 ? fmtDist(refDist) : null;
  desc.textContent = `${results.length} rides similar to ${dF ? dF.val + ' ' + dF.unit : ''} ${refTime ? fmtDur(refTime) : ''} ${a.sport_type || a.type || 'ride'}`;

  if (!results.length) {
    list.innerHTML = '<div class="sim-empty">No similar rides found. Try syncing more activities.</div>';
  } else {
    list.innerHTML = results.map(({ activity: r, score }) => {
      const dist = actVal(r, 'distance', 'icu_distance');
      const secs = actVal(r, 'moving_time', 'elapsed_time', 'icu_moving_time');
      const pwr  = actVal(r, 'icu_weighted_avg_watts', 'average_watts');
      const dFmt = dist > 0 ? fmtDist(dist) : null;
      const name = (r.name || r.icu_name || 'Activity').slice(0, 40);
      const date = fmtDate(r.start_date_local || r.start_date);
      const actId = r.id || r.icu_activity_id;
      return `<div class="sim-ride-card card" onclick="closeSimilarRidesModal();navigateToActivity(window._simLookup['${actId}'])">
        <div class="sim-ride-top">
          <div class="sim-ride-info">
            <div class="sim-ride-name">${_escHtml(name)}</div>
            <div class="sim-ride-date">${date}</div>
          </div>
          <div class="sim-ride-score">${score}%</div>
        </div>
        <div class="sim-ride-stats">
          ${dFmt ? `<span>${dFmt.val} ${dFmt.unit}</span>` : ''}
          ${secs ? `<span>${fmtDur(secs)}</span>` : ''}
          ${pwr ? `<span>${Math.round(pwr)} W</span>` : ''}
        </div>
      </div>`;
    }).join('');
    // Store references for navigation
    window._simLookup = {};
    results.forEach(({ activity: r }) => {
      window._simLookup[r.id || r.icu_activity_id] = r;
    });
  }
  document.getElementById('similarRidesModal').showModal();
}

function closeSimilarRidesModal() {
  const modal = document.getElementById('similarRidesModal');
  if (modal) closeModalAnimated(modal);
}

/* ====================================================
   ACTIVITY DETAIL — basic rendering
==================================================== */
function renderActivityBasic(a) {
  applyActSectionVisibility();
  // ── Eyebrow: icon · type · TSS ────────────────────────────────────────────
  const iconEl = document.getElementById('detailIcon');
  iconEl.className = 'activity-type-icon ' + activityTypeClass(a);
  iconEl.innerHTML = activityTypeIcon(a);
  document.getElementById('detailType').textContent = a.sport_type || a.type || '';

  const tss   = Math.round(actVal(a, 'icu_training_load', 'tss'));
  const tssEl = document.getElementById('detailTSSBadge');
  tssEl.textContent   = tss > 0 ? `${tss} TSS` : '';
  tssEl.style.display = tss > 0 ? 'flex' : 'none';

  // ── Effort type classification ─────────────────────────────────────────────
  const effortTag = document.getElementById('detailEffortTag');
  if (effortTag) {
    effortTag.style.display = 'none';
    let zonePcts = null;
    const zt = a.icu_zone_times;
    const hzt = a.icu_hr_zone_times;
    if (Array.isArray(zt) && zt.length > 0) {
      const totals = new Array(6).fill(0);
      let totalSecs = 0;
      zt.forEach(z => {
        if (!z || typeof z.id !== 'string') return;
        const m = z.id.match(/^Z(\d)$/);
        if (!m) return;
        const idx = parseInt(m[1], 10) - 1;
        if (idx >= 0 && idx < 6) { totals[idx] += (z.secs || 0); totalSecs += (z.secs || 0); }
      });
      if (totalSecs > 0) zonePcts = totals.map(s => s / totalSecs * 100);
    }
    if (!zonePcts && Array.isArray(hzt) && hzt.length > 0) {
      const totals = [];
      let totalSecs = 0;
      hzt.forEach(z => {
        const s = typeof z === 'number' ? z : (z.secs || 0);
        totals.push(s); totalSecs += s;
      });
      if (totalSecs > 0) {
        const mapped = new Array(6).fill(0);
        totals.forEach((s, i) => { mapped[Math.min(i, 5)] += s; });
        zonePcts = mapped.map(s => s / totalSecs * 100);
      }
    }
    if (zonePcts) {
      const z12 = (zonePcts[0] || 0) + (zonePcts[1] || 0);
      const z3  = zonePcts[2] || 0;
      const z4  = zonePcts[3] || 0;
      const z56 = (zonePcts[4] || 0) + (zonePcts[5] || 0);
      const z6  = zonePcts[5] || 0;
      let label, color;
      if (z6 >= 10)       { label = 'Anaerobic';   color = '#b482ff'; }
      else if (z56 >= 15) { label = 'VO2max';      color = '#ff4757'; }
      else if (z4 >= 20)  { label = 'Threshold';   color = '#ff6b35'; }
      else if (z3 >= 40)  { label = 'Tempo';       color = '#f0c429'; }
      else if (z12 >= 60) { label = 'Endurance';   color = '#00e5a0'; }
      else                { label = 'Mixed Effort'; color = '#4a9eff'; }
      effortTag.textContent = label;
      effortTag.style.background = color + '1a';
      effortTag.style.borderColor = color + '47';
      effortTag.style.color = color;
      effortTag.style.display = '';
    }
  }

  // ── Similar ride preview card ────────────────────────────────────────────
  _similarRidesRef = a;
  const simCard = document.getElementById('similarRideCard');
  if (simCard) {
    simCard.style.display = 'none';
    const hasDist = actVal(a, 'distance', 'icu_distance') > 0;
    const hasTime = actVal(a, 'moving_time', 'elapsed_time', 'icu_moving_time') > 0;
    if (hasDist || hasTime) {
      _rIC(() => {
        const results = findSimilarRides(a, 1);
        if (!results.length) return;
        const { activity: r, score } = results[0];
        const name = (r.name || r.icu_name || 'Activity').slice(0, 50);
        const date = fmtDate(r.start_date_local || r.start_date);
        const dist = actVal(r, 'distance', 'icu_distance');
        const secs = actVal(r, 'moving_time', 'elapsed_time', 'icu_moving_time');
        const parts = [date];
        if (dist > 0) { const d = fmtDist(dist); parts.push(d.val + ' ' + d.unit); }
        if (secs > 0) parts.push(fmtDur(secs));
        document.getElementById('similarRideScore').textContent = score + '% match';
        document.getElementById('similarRideName').textContent = name;
        document.getElementById('similarRideMeta').textContent = parts.join(' \u00b7 ');
        simCard.style.display = '';
      });
    }
  }

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
  // Offline tag — check if activity detail+streams are cached in IDB
  const offlineTagEl = document.getElementById('detailOfflineTag');
  if (offlineTagEl) {
    offlineTagEl.style.display = 'none';
    const _actId = String(a.id || a.icu_activity_id || '');
    if (_actId) {
      actCacheGetCachedIds().then(ids => {
        offlineTagEl.style.display = ids.has(_actId) ? '' : 'none';
      });
    }
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

  // ── Estimated power when no direct power data ──
  let estAvgW = 0, estKj = 0, powerEstimated = false;
  if (avgW <= 0 && np <= 0 && secs > 0) {
    const ftp = state.athlete?.ftp || 0;
    const _tss = actVal(a, 'icu_training_load', 'tss');
    const _cals = actVal(a, 'calories', 'icu_calories') || (a.other && a.other.calories) || 0;
    if (a.kilojoules > 0) {
      estKj = a.kilojoules;
      estAvgW = Math.round(estKj * 1000 / secs);
      powerEstimated = true;
    } else if (ftp > 0 && _tss > 0) {
      const intf = Math.sqrt(_tss * 3600 / (secs * ftp));
      const estNp = intf * ftp;
      estAvgW = Math.round(estNp * 0.92);
      estKj = estAvgW * secs / 1000;
      powerEstimated = true;
    } else if (_cals > 50) {
      estKj = _cals * 0.25 * 4.184;
      estAvgW = Math.round(estKj * 1000 / secs);
      powerEstimated = true;
    }
  }
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
  const pStat = (val, lbl, accent = false, cmpPct = null, iconKey = '', color = '') => {
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
    const iconHtml = P_ICONS[iconKey] ? `<div class="act-pstat-icon ${color}">${P_ICONS[iconKey]}</div>` : '';
    const valColor = color ? `val-${color}` : '';
    return `<div class="act-pstat">
       <div class="act-pstat-top">${iconHtml}<div class="act-pstat-lbl">${lbl}</div></div>
       <div class="act-pstat-val ${valColor}">${val}</div>
       ${cmpHtml}
     </div>`;
  };

  const primary = [];
  if (distKm > 0.05) primary.push(pStat(distKm.toFixed(1) + ' km', 'Distance', false, pctDist, 'km', 'blue'));
  if (secs > 0)      primary.push(pStat(fmtDur(secs), 'Duration', false, pctSecs, 'duration', 'blue'));
  if (np > 0)             primary.push(pStat(Math.round(np) + 'W', 'Norm Power', true, pctPow, 'power', 'green'));
  else if (avgW > 0)      primary.push(pStat(Math.round(avgW) + 'W', 'Avg Power', true, pctPow, 'power', 'green'));
  else if (powerEstimated) primary.push(pStat(estAvgW + 'W', 'Est. Power', true, null, 'power', 'green'));
  if (avgHR > 0)     primary.push(pStat(Math.round(avgHR), 'Avg BPM', false, pctHR, 'bpm', 'red'));
  else if (speedKmh > 0.5) primary.push(pStat(speedKmh.toFixed(1), 'Avg Speed', false, pctSpd, 'speed', 'blue'));

  const primaryEl = document.getElementById('actPrimaryStats');
  primaryEl.innerHTML = primary.slice(0, 4).join('');
  primaryEl.dataset.count = Math.min(primary.length, 4);

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
  if (speedKmh > 0.5)           sec += sStat(speedKmh.toFixed(1) + ' km/h','Avg Speed',   'speed',  'blue',   pctSpd,  true);
  if (avgW > 0 && np > 0)        sec += sStat(Math.round(avgW) + 'W',       'Avg Power',   'zap',    'orange', pctPow,  true);
  else if (powerEstimated)       sec += sStat(estAvgW + 'W',               'Est. Power',  'zap',    'orange', null,    false);
  if (maxW > 0)                  sec += sStat(Math.round(maxW) + 'W',       'Max Power',   'zap',    'orange', null,    false);
  if (powerEstimated && estKj > 0) sec += sStat(Math.round(estKj) + ' kJ', 'Est. Energy', 'fire',   'yellow', null,    false);
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

  // ── Activity notes ──────────────────────────────────────────────────────
  renderActivityNotes(a);

  // ── Render the "How You Compare" card ────────────────────────────────────
  renderDetailComparison(a);

  // ── Data source / device footer ───────────────────────────────────────────
  renderDetailSourceFooter(a);

  // ── Export options ─────────────────────────────────────────────────────────
  renderDetailExport(a);
}

function renderDetailComparison(a) {
  const card    = document.getElementById('detailCompareCard');
  const rowsEl  = document.getElementById('detailCmpRows');
  const subtEl  = document.getElementById('detailCompareSubtitle');
  const badgeEl = document.getElementById('detailCmpBadge');
  if (!card) return;

  const avgs = a._avgs || {};
  if (!avgs.peerCount || avgs.peerCount < 3) { showCardNA('detailCompareCard'); return; }

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
                    : positive     ? ACCENT   // performing better than avg → green
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

  if (!html.trim()) { showCardNA('detailCompareCard'); return; }

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
  unskeletonCard('detailCompareCard');
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

function renderDetailExport(a) {
  const buttonsEl = document.getElementById('detailExportButtons');
  if (!buttonsEl) return;

  const actId = a.id || a.icu_activity_id;
  if (!actId) { buttonsEl.style.display = 'none'; return; }

  const buttons = [];

  // Download original file (if available)
  buttons.push(`
    <button class="btn btn-ghost detail-export-btn" title="Download original activity file" onclick="downloadActivityFile('${actId}')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      <span>Original File</span>
    </button>
  `);

  // Download as FIT
  buttons.push(`
    <button class="btn btn-ghost detail-export-btn" title="Download as Garmin FIT format" onclick="downloadFITFile('${actId}')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      <span>Garmin (.fit)</span>
    </button>
  `);

  // Download as GPX
  buttons.push(`
    <button class="btn btn-ghost detail-export-btn" title="Download as GPX format (GPS data)" onclick="downloadGPXFile('${actId}')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      <span>GPX (GPS)</span>
    </button>
  `);

  // Share route image
  buttons.push(`
    <button class="btn btn-ghost detail-export-btn" title="Generate a shareable route image" onclick="openShareModal('${actId}')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
      <span>Share</span>
    </button>
  `);

  buttonsEl.innerHTML = buttons.join('');
  buttonsEl.style.display = '';
}

// ── Download functions ─────────────────────────────────────────────────────
async function downloadActivityFile(actId) {
  try {
    const urls = [
      ICU_BASE + `/activity/${actId}/file`,
      ICU_BASE + `/activity/${actId}/original`,
      ICU_BASE + `/athlete/${state.athleteId}/activities/${actId}/original`,
    ];
    let data = null;
    for (const u of urls) {
      data = await fetch(u, { headers: authHeader() });
      if (data.ok) { rlTrackRequest(); break; }
      data = null;
    }
    if (!data) throw new Error('Original file not available for this activity');
    const blob = await data.blob();
    const cd = data.headers.get('content-disposition') || '';
    const fnMatch = cd.match(/filename="?([^";\n]+)"?/);
    const filename = fnMatch ? fnMatch[1] : `activity-${actId}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Activity downloaded', 'success');
  } catch (err) {
    showToast('Download failed: ' + err.message, 'error');
  }
}

async function downloadFITFile(actId) {
  try {
    const urls = [
      ICU_BASE + `/activity/${actId}.fit`,
      ICU_BASE + `/athlete/${state.athleteId}/activities/${actId}.fit`,
    ];
    let data = null;
    for (const u of urls) {
      data = await fetch(u, { headers: authHeader() });
      if (data.ok) { rlTrackRequest(); break; }
      data = null;
    }
    if (!data) throw new Error('FIT file not available for this activity');
    const blob = await data.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-${actId}.fit`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('FIT file downloaded', 'success');
  } catch (err) {
    showToast('Download failed: ' + err.message, 'error');
  }
}

async function downloadGPXFile(actId) {
  try {
    const urls = [
      ICU_BASE + `/activity/${actId}.gpx`,
      ICU_BASE + `/athlete/${state.athleteId}/activities/${actId}.gpx`,
    ];
    let data = null;
    for (const u of urls) {
      data = await fetch(u, { headers: authHeader() });
      if (data.ok) { rlTrackRequest(); break; }
      data = null;
    }
    if (!data) throw new Error('GPX file not available for this activity');
    const blob = await data.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-${actId}.gpx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('GPX file downloaded', 'success');
  } catch (err) {
    showToast('Download failed: ' + err.message, 'error');
  }
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
      const col = _isDark()
        ? (isMajor ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.11)')
        : (isMajor ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.09)');
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
            <stop offset="100%" stop-color="${ACCENT}"/>
          </linearGradient>
        </defs>
        <path class="g-track" d="${GAUGE_TRACK_PATH}"/>
        <path class="g-fill"  d="M 0 0"/>
        ${tickMarks}
        <text class="g-num"  x="60" y="72"
              fill="${_isDark() ? '#e2e8f0' : '#1a1d24'}" text-anchor="middle">—</text>
        <text class="g-unit" x="60" y="85"
              fill="${_isDark() ? '#94a3b8' : '#555e72'}" text-anchor="middle">km/h</text>
        <text class="g-zero" x="20.4" y="108"
              fill="${_isDark() ? '#64748b' : '#848d9f'}" text-anchor="middle">0</text>
        <text class="g-max"  x="99.6" y="108"
              fill="${_isDark() ? '#64748b' : '#848d9f'}" text-anchor="middle">${maxLabel}</text>
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

// ── MapLibre unified style registry ──────────────────────────────────────────
// Three OpenFreeMap vector styles + Esri satellite raster.
// Vector entries have `.style` (URL); raster entries have `.tiles` (URL template).
var MAP_STYLES = {
  liberty:   { label: 'Liberty',   style: 'https://tiles.openfreemap.org/styles/liberty',   bg: '#f0ede4' },
  positron:  { label: 'Positron',  style: 'https://tiles.openfreemap.org/styles/positron',  bg: '#f5f4f0' },
  dark:      { label: 'Dark',      style: 'https://tiles.openfreemap.org/styles/dark',      bg: '#1a1c22' },
  strava:    { label: 'Strava',    style: 'https://tiles.openfreemap.org/styles/dark',      bg: '#192428', custom: true },
  satellite: { label: 'Satellite', tiles: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', bg: '#1a1c22' },
};

// Pre-fetch current map style JSON so it's cached when an activity is opened
setTimeout(() => {
  const themeKey = loadMapTheme();
  const entry = MAP_STYLES[themeKey];
  if (entry && entry.style) fetch(entry.style, { priority: 'low' }).catch(() => {});
}, 2000);

// ── Strava-inspired map color overrides ─────────────────────────────────────
// Applied after the OpenFreeMap dark style loads to produce a Strava-like look:
// tinted navy background, subtle blue water, muted green parks, warm-grey roads.
var _STRAVA_OVERRIDES = {
  // Background & land — dark teal tint (Strava's signature blue-green)
  background:           { 'background-color': '#192428' },
  landcover_wood:       { 'fill-color': '#1a3630', 'fill-opacity': 1 },
  landuse_park:         { 'fill-color': '#1a3630', 'fill-opacity': 1 },
  landuse_residential:  { 'fill-color': '#1c2628' },
  landcover_ice_shelf:  { 'fill-color': '#192428' },
  landcover_glacier:    { 'fill-color': '#192428' },
  road_area_pier:       { 'fill-color': '#192428' },
  road_pier:            { 'line-color': '#192428' },
  // Water — darker teal, distinct from land
  water:                { 'fill-color': '#121e22' },
  waterway:             { 'line-color': '#121e22' },
  water_name:           { 'text-color': 'rgba(60,90,100,0.6)' },
  // Buildings — subtle blue-grey
  building:             { 'fill-color': '#1e2a2e', 'fill-outline-color': '#263234' },
  // Roads — blue-grey tints
  highway_path:         { 'line-color': '#263032' },
  highway_minor:        { 'line-color': '#283234' },
  highway_major_subtle: { 'line-color': '#2c3638' },
  highway_major_inner:  { 'line-color': '#2e3a3c' },
  highway_major_casing: { 'line-color': 'rgba(50,68,72,0.6)' },
  highway_motorway_subtle: { 'line-color': '#323e40' },
  highway_motorway_inner:  { 'line-color': '#323e40' },
  highway_motorway_casing: { 'line-color': 'rgba(50,68,72,0.6)' },
  // Rail
  railway:              { 'line-color': '#263032' },
  railway_transit:      { 'line-color': '#263032' },
  railway_minor:        { 'line-color': '#263032' },
  // Boundaries
  boundary_state:       { 'line-color': 'rgba(70,95,100,0.25)' },
  'boundary_country_z0-4':{ 'line-color': 'rgba(70,95,100,0.35)' },
  'boundary_country_z5-': { 'line-color': 'rgba(70,95,100,0.35)' },
  // Labels — cool grey with slight blue
  place_other:          { 'text-color': '#546468' },
  place_suburb:         { 'text-color': '#546468' },
  place_village:        { 'text-color': '#647478' },
  place_town:           { 'text-color': '#748488' },
  place_city:           { 'text-color': '#8a9a9e' },
  place_city_large:     { 'text-color': '#9aaaae' },
  place_state:          { 'text-color': '#4a5a5e' },
  place_country_other:  { 'text-color': '#546468' },
  place_country_minor:  { 'text-color': '#546468' },
  place_country_major:  { 'text-color': '#647478' },
  highway_name_other:   { 'text-color': '#4a5a5e' },
  highway_name_motorway:{ 'text-color': '#546468' },
};

function _applyStravaOverrides(map) {
  // Remove wood fill-pattern first so solid fill-color shows through
  try { if (map.getLayer('landcover_wood')) map.setPaintProperty('landcover_wood', 'fill-pattern', undefined); } catch (_) {}
  for (const [layerId, props] of Object.entries(_STRAVA_OVERRIDES)) {
    if (!map.getLayer(layerId)) continue;
    for (const [prop, value] of Object.entries(props)) {
      try { map.setPaintProperty(layerId, prop, value); } catch (_) {}
    }
  }
}

function _isStravaTheme() {
  return (MAP_STYLES[loadMapTheme()] || {}).custom === true;
}
window._applyStravaOverrides = _applyStravaOverrides;
window._isStravaTheme = _isStravaTheme;

// Returns a MapLibre-compatible style for a given key.
// Vector → URL string; raster → {version:8, sources, layers} object.
function _mlGetStyle(key) {
  const entry = MAP_STYLES[key];
  if (!entry) return MAP_STYLES.liberty.style;          // fallback to Liberty
  if (entry.style) return entry.style;                  // vector style URL
  // Raster tile wrapper
  return {
    version: 8,
    sources: { 'raster-tiles': { type: 'raster', tiles: [entry.tiles], tileSize: 256, attribution: '&copy; Esri' } },
    layers: [{ id: 'raster-layer', type: 'raster', source: 'raster-tiles' }],
  };
}

// ── 3D Terrain (DEM) ────────────────────────────────────────────────────────
var TERRAIN_DEM_SRC = 'terrain-dem';
var TERRAIN_DEM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
var TERRAIN_EXAG = 1.2;

function loadTerrainEnabled() {
  return localStorage.getItem('icu_terrain_3d') === 'true';
}
function setTerrainEnabled(on) {
  try { localStorage.setItem('icu_terrain_3d', on ? 'true' : 'false'); } catch (e) {}
}
function loadRoadSafetyEnabled() { return localStorage.getItem('icu_road_safety') === 'true'; }
function setRoadSafetyEnabled(on) { try { localStorage.setItem('icu_road_safety', on ? 'true' : 'false'); } catch(e){} }
function loadCyclOSMEnabled() { return localStorage.getItem('icu_cyclosm') === 'true'; }
function setCyclOSMEnabled(on) { try { localStorage.setItem('icu_cyclosm', on ? 'true' : 'false'); } catch(e){} }

// ── Road Safety overlay — color-code roads by cycling safety ─────────────
function _addRoadSafetyLayer(map) {
  if (!map.getSource('openmaptiles')) return false;
  if (map.getLayer('road-safety-layer')) return true;
  const beforeId = map.getLayer('route-shadow-layer') ? 'route-shadow-layer'
    : map.getLayer('rb-route') ? 'rb-route' : undefined;
  map.addLayer({
    id: 'road-safety-layer',
    type: 'line',
    source: 'openmaptiles',
    'source-layer': 'transportation',
    filter: ['in', 'class', 'motorway','trunk','primary','secondary','tertiary','minor','service','path'],
    paint: {
      'line-color': [
        'case',
        ['in', ['get','class'], ['literal',['motorway','trunk']]], '#ff4757',
        ['==', ['get','class'], 'primary'], '#ff6b35',
        ['==', ['get','class'], 'secondary'], '#f0c429',
        ['==', ['get','class'], 'tertiary'], '#b8e000',
        ['in', ['get','class'], ['literal',['minor','service']]], '#00e55a',
        ['all', ['==',['get','class'],'path'], ['any', ['==',['get','subclass'],'cycleway'], ['==',['get','bicycle'],'designated']]], '#00d4aa',
        ['==', ['get','class'], 'path'], '#00e55a',
        '#888888'
      ],
      'line-width': ['interpolate',['linear'],['zoom'], 8,1, 12,2, 14,3, 16,4],
      'line-opacity': 0.7,
    },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  }, beforeId);
  return true;
}
function _removeRoadSafetyLayer(map) {
  try { if (map.getLayer('road-safety-layer')) map.removeLayer('road-safety-layer'); } catch(_){}
}

// ── CyclOSM overlay — cycling-focused raster tiles ──────────────────────
function _addCyclOSMLayer(map) {
  if (map.getLayer('cyclosm-layer')) return;
  if (!map.getSource('cyclosm-tiles')) {
    map.addSource('cyclosm-tiles', {
      type: 'raster',
      tiles: [
        'https://a.tile-cyclosm.openstreetmap.fr/cyclosm-lite/{z}/{x}/{y}.png',
        'https://b.tile-cyclosm.openstreetmap.fr/cyclosm-lite/{z}/{x}/{y}.png',
        'https://c.tile-cyclosm.openstreetmap.fr/cyclosm-lite/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '&copy; <a href="https://www.cyclosm.org">CyclOSM</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxzoom: 19,
    });
  }
  const beforeId = map.getLayer('route-shadow-layer') ? 'route-shadow-layer'
    : map.getLayer('rb-route') ? 'rb-route' : undefined;
  map.addLayer({ id: 'cyclosm-layer', type: 'raster', source: 'cyclosm-tiles', paint: { 'raster-opacity': 0.5 } }, beforeId);
}
function _removeCyclOSMLayer(map) {
  try { if (map.getLayer('cyclosm-layer')) map.removeLayer('cyclosm-layer'); } catch(_){}
  try { if (map.getSource('cyclosm-tiles')) map.removeSource('cyclosm-tiles'); } catch(_){}
}

/** Apply or remove 3D terrain on a MapLibre map. Idempotent — safe after style.load. */
function _mlApplyTerrain(map) {
  if (!map) return;
  if (loadTerrainEnabled()) {
    if (!map.getSource(TERRAIN_DEM_SRC)) {
      map.addSource(TERRAIN_DEM_SRC, {
        type: 'raster-dem',
        tiles: [TERRAIN_DEM_URL],
        tileSize: 256,
        encoding: 'terrarium',
        maxzoom: 15,
      });
    }
    map.setTerrain({ source: TERRAIN_DEM_SRC, exaggeration: TERRAIN_EXAG });
  } else {
    try { map.setTerrain(null); } catch (_) {}
  }
}

// ── Pre-warm activity map ───────────────────────────────────────────────────
// Creates the MapLibre map instance immediately so style JSON + vector tiles
// start downloading in parallel with the activity API fetches.
function _preWarmActivityMap() {
  // Don't double-warm or warm if a map already exists
  if (state._preWarmMap || state.activityMap) return;
  const mapEl = document.getElementById('activityMap');
  if (!mapEl) return;

  const card = document.getElementById('detailMapCard');
  if (card) { card.style.display = ''; }

  const themeKey = loadMapTheme();
  const themeDef = MAP_STYLES[themeKey] || MAP_STYLES.liberty;
  mapEl.style.background = themeDef.bg;

  if (themeDef.custom) {
    mapEl.style.opacity = '0';
    mapEl.style.transition = 'opacity 0.3s ease';
  }

  const _actTerrainOn = loadTerrainEnabled();
  try {
    const map = new maplibregl.Map({
      container: mapEl,
      style: _mlGetStyle(themeKey),
      attributionControl: true,
      dragRotate: true,
      pitchWithRotate: true,
      scrollZoom: false,
      maxPitch: 85,
      fadeDuration: 0,
      renderWorldCopies: false,
      antialias: false,
      collectResourceTiming: false,
      maxTileCacheSize: 150,
      pixelRatio: Math.min(devicePixelRatio, 2),
      localIdeographFontFamily: 'sans-serif',
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), 'top-left');
    state._preWarmMap = map;
    state._preWarmTheme = themeKey;
  } catch (e) {
    console.warn('[Map] Pre-warm failed:', e);
    state._preWarmMap = null;
  }
}

function renderActivityMap(latlng, streams) {

  const card = document.getElementById('detailMapCard');
  if (!card) return;

  if (!latlng || latlng.length < 2) {
    // No GPS — discard pre-warmed map
    if (state._preWarmMap) { try { state._preWarmMap.remove(); } catch(_){} state._preWarmMap = null; }
    showCardNA('detailMapCard'); return;
  }

  const pairs = latlng.filter(p => Array.isArray(p) && p[0] != null && p[1] != null);
  const valid = pairs.filter(p => Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180);
  if (valid.length < 2) {
    if (state._preWarmMap) { try { state._preWarmMap.remove(); } catch(_){} state._preWarmMap = null; }
    showCardNA('detailMapCard'); return;
  }
  clearCardNA(card);

  // Downsample for rendering — keep full `valid` array for hover detection
  const step   = Math.max(1, Math.floor(valid.length / 600));
  const points = valid.filter((_, i) => i % step === 0);
  if (points[points.length - 1] !== valid[valid.length - 1]) points.push(valid[valid.length - 1]);

  card.style.display = '';
  unskeletonCard('detailMapCard');

  requestAnimationFrame(() => {
    // Reuse pre-warmed map if available and theme matches, otherwise create fresh
    let map = null;
    const themeKey = loadMapTheme();

    // Destroy stale map from a previous activity (e.g. rapid prev/next stepping)
    if (state.activityMap) { state.activityMap.remove(); state.activityMap = null; }

    if (state._preWarmMap && state._preWarmTheme === themeKey) {
      // Reuse — style + tiles already loading/loaded
      map = state._preWarmMap;
      state._preWarmMap = null;
      state._preWarmTheme = null;
    } else {
      // Discard stale pre-warm if theme changed
      if (state._preWarmMap) { try { state._preWarmMap.remove(); } catch(_){} state._preWarmMap = null; }

      const themeDef = MAP_STYLES[themeKey] || MAP_STYLES.liberty;
      const mapEl    = document.getElementById('activityMap');
      mapEl.style.background = themeDef.bg;
      if (themeDef.custom) {
        mapEl.style.opacity = '0';
        mapEl.style.transition = 'opacity 0.3s ease';
      }

      map = new maplibregl.Map({
        container: mapEl,
        style: _mlGetStyle(themeKey),
        attributionControl: true,
        dragRotate: true,
        pitchWithRotate: true,
        scrollZoom: false,
        maxPitch: 85,
        fadeDuration: 0,
        renderWorldCopies: false,
        antialias: false,
        collectResourceTiming: false,
        maxTileCacheSize: 150,
        pixelRatio: Math.min(devicePixelRatio, 2),
        localIdeographFontFamily: 'sans-serif',
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), 'top-left');
    }

    try {
      let isSatellite = false;
      state._actMapThemeKey = themeKey; // track for hot-swap

      // ── Pre-compute per-mode maxima ──────────────────────────────────────
      const spdArr  = streams.velocity_smooth;
      const maxSpdKmh = (Array.isArray(spdArr) && spdArr.length)
        ? Math.ceil(safeMax(spdArr.filter(v => v != null)) * 3.6 / 5) * 5
        : 50;

      const hrArr = streams.heartrate || streams.heart_rate;
      const maxHR = (Array.isArray(hrArr) && hrArr.length)
        ? Math.round(safeMax(hrArr.filter(v => v != null)))
        : 190;

      const wArr = streams.watts || streams.power;
      const maxWatts = (Array.isArray(wArr) && wArr.length)
        ? Math.ceil(safeMax(wArr.filter(v => v != null)) / 50) * 50
        : 400;

      const altArr = streams.altitude;
      const minAlt = (Array.isArray(altArr) && altArr.length)
        ? safeMin(altArr.filter(v => v != null)) : 0;
      const maxAlt = (Array.isArray(altArr) && altArr.length)
        ? safeMax(altArr.filter(v => v != null)) : 100;

      const maxes = { maxSpdKmh, maxHR, maxWatts, minAlt, maxAlt };

      // ── Colour mode state ────────────────────────────────────────────────
      let activeMode = 'default';

      // Build GeoJSON for a color mode — returns array of {color, geojson} features
      const buildRouteGeoJSON = (mode) => {
        const segs = buildColoredSegments(points, streams, mode, maxes);
        // Group consecutive segments with same color for fewer features
        const features = segs.map((seg, i) => ({
          type: 'Feature',
          properties: { color: seg.color, idx: i },
          geometry: {
            type: 'LineString',
            coordinates: seg.points.map(p => [p[1], p[0]]), // [lng, lat]
          },
        }));
        return { type: 'FeatureCollection', features };
      };

      // Build the full route as a single LineString for shadow
      const routeLineCoords = points.map(p => [p[1], p[0]]);
      const shadowGeoJSON = {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: routeLineCoords },
      };

      const applyColorMode = (mode) => {
        activeMode = mode;
        const geojson = buildRouteGeoJSON(mode);

        // Update sources
        const shadowSrc = map.getSource('route-shadow');
        const colorSrc  = map.getSource('route-color');
        if (shadowSrc) shadowSrc.setData(shadowGeoJSON);
        if (colorSrc)  colorSrc.setData(geojson);

        // Keep toggle buttons in sync (desktop pills)
        document.querySelectorAll('.map-mode-btn').forEach(btn =>
          btn.classList.toggle('active', btn.dataset.mode === mode));
        // Sync mobile dropdown trigger + menu
        document.querySelectorAll('.map-toggle-opt').forEach(opt =>
          opt.classList.toggle('active', opt.dataset.mode === mode));
        const activeBtn = document.querySelector(`.map-mode-btn[data-mode="${mode}"]`);
        const trigLabel = document.querySelector('.map-toggle-label');
        const trigIcon = document.querySelector('.map-toggle-trigger > .map-mode-icon');
        if (activeBtn && trigLabel) {
          const ico = activeBtn.querySelector('.map-mode-icon');
          if (ico && trigIcon) trigIcon.textContent = ico.textContent;
          trigLabel.textContent = activeBtn.textContent.trim().replace(ico?.textContent || '', '').trim();
        }
      };

      // ── Map load — add sources, layers, markers, controls ────────────────
      // If pre-warmed map already loaded its style, fire immediately; else wait
      const _onMapReady = () => {
        const mapEl = map.getContainer();
        if (_isStravaTheme()) _applyStravaOverrides(map);
        if (mapEl.style.opacity === '0') requestAnimationFrame(() => { mapEl.style.opacity = '1'; });
        // Shadow layer (single thick dark line under the route)
        map.addSource('route-shadow', { type: 'geojson', data: shadowGeoJSON });
        map.addLayer({
          id: 'route-shadow-layer',
          type: 'line',
          source: 'route-shadow',
          paint: {
            'line-color': '#000',
            'line-width': ['interpolate', ['linear'], ['zoom'], 8, 5, 12, 7, 14, 9, 16, 11],
            'line-opacity': 0.55,
          },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        });

        // Color segments layer — uses data-driven styling from feature properties
        const initialGeoJSON = buildRouteGeoJSON('default');
        map.addSource('route-color', { type: 'geojson', data: initialGeoJSON });
        map.addLayer({
          id: 'route-color-layer',
          type: 'line',
          source: 'route-color',
          paint: {
            'line-color': ['get', 'color'],
            'line-width': ['interpolate', ['linear'], ['zoom'], 8, 3, 12, 4.5, 14, 6, 16, 8],
            'line-opacity': 1,
          },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        });

        // Route layers visible immediately (no trace animation)

        // ── Start/End markers ────────────────────────────────────────────
        const makeDotEl = (color, label) => {
          const el = document.createElement('div');
          el.style.cssText = `width:14px;height:14px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.7),0 0 0 2px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;`;
          if (label) el.innerHTML = `<span style="color:#fff;font-size:7px;font-weight:900;line-height:1">${label}</span>`;
          return el;
        };
        new maplibregl.Marker({ element: makeDotEl(ACCENT, 'S'), anchor: 'center' })
          .setLngLat([points[0][1], points[0][0]]).addTo(map);
        new maplibregl.Marker({ element: makeDotEl('#ff4444', 'F'), anchor: 'center' })
          .setLngLat([points[points.length-1][1], points[points.length-1][0]]).addTo(map);

        // ── Hover dot (hidden circle marker on route) ────────────────────
        map.addSource('hover-dot', {
          type: 'geojson',
          data: { type: 'Feature', geometry: { type: 'Point', coordinates: [valid[0][1], valid[0][0]] }, properties: { color: '#fff' } },
        });
        map.addLayer({
          id: 'hover-dot-outline',
          type: 'circle',
          source: 'hover-dot',
          paint: {
            'circle-radius': 7, 'circle-color': '#fff',
            'circle-stroke-width': 2.5, 'circle-stroke-color': '#fff',
            'circle-opacity': 0, 'circle-stroke-opacity': 0,
          },
        });
        map.addLayer({
          id: 'hover-dot-fill',
          type: 'circle',
          source: 'hover-dot',
          paint: {
            'circle-radius': 5,
            'circle-color': ['get', 'color'],
            'circle-opacity': 0,
          },
        });

        // ── Hover scrubbing ──────────────────────────────────────────────
        const statsEl = document.getElementById('mapStatsPanel');
        const hasStreams = streams && (streams.watts || streams.heartrate || streams.cadence
                                       || streams.velocity_smooth || streams.altitude);
        const timeLen = streams.time?.length || valid.length;

        if (hasStreams && statsEl) {
          const statsContent = statsEl.querySelector('.map-stats-content') || statsEl;
          statsContent.innerHTML = buildMapStatsHTML(streams, maxSpdKmh, maxHR);
          statsEl.querySelectorAll('.mm-cell').forEach(el => {
            if (!el.dataset.glow) { el.dataset.glow = '1'; window.attachCardGlow && window.attachCardGlow(el); }
          });
          requestAnimationFrame(() => map.resize());

          let _lastHoverIdx = -1;
          let _hoverRaf = 0;

          map.on('mousemove', (e) => {
            if (state.flythrough?.playing) return;
            // Skip expensive point lookup while user is panning/zooming the map
            if (map.isMoving() || map.isZooming()) return;
            const { lat, lng } = e.lngLat;

            // Find nearest GPS point with hysteresis to avoid jumps at route crossings
            let bestIdx = 0, bestDist = Infinity;
            for (let i = 0; i < valid.length; i++) {
              const dlat = valid[i][0] - lat;
              const dlng = valid[i][1] - lng;
              const d    = dlat * dlat + dlng * dlng;
              if (d < bestDist) { bestDist = d; bestIdx = i; }
            }

            // Hysteresis: if the previous index is nearly as close, prefer it
            // to prevent the scrubber from jumping between overlapping route segments
            if (_lastHoverIdx >= 0) {
              const WINDOW = Math.max(20, Math.round(valid.length * 0.02));
              const lo = Math.max(0, _lastHoverIdx - WINDOW);
              const hi = Math.min(valid.length - 1, _lastHoverIdx + WINDOW);
              let localBest = _lastHoverIdx, localDist = Infinity;
              for (let i = lo; i <= hi; i++) {
                const dlat = valid[i][0] - lat;
                const dlng = valid[i][1] - lng;
                const d    = dlat * dlat + dlng * dlng;
                if (d < localDist) { localDist = d; localBest = i; }
              }
              // Keep local result if it's within 1.5× the global best distance
              if (localDist < bestDist * 2.25) bestIdx = localBest;
            }
            _lastHoverIdx = bestIdx;

            // Throttle DOM/canvas updates to one per frame
            if (_hoverRaf) cancelAnimationFrame(_hoverRaf);
            const capturedIdx = bestIdx;
            _hoverRaf = requestAnimationFrame(() => {
              _hoverRaf = 0;
              const si = Math.round(capturedIdx * (timeLen - 1) / (valid.length - 1));
              const dotColor = routePointColor(activeMode, streams, si, maxes);

              // Update hover dot
              const hoverSrc = map.getSource('hover-dot');
              if (hoverSrc) {
                hoverSrc.setData({
                  type: 'Feature',
                  geometry: { type: 'Point', coordinates: [valid[capturedIdx][1], valid[capturedIdx][0]] },
                  properties: { color: dotColor },
                });
              }
              if (map.getLayer('hover-dot-outline')) {
                map.setPaintProperty('hover-dot-outline', 'circle-opacity', 1);
                map.setPaintProperty('hover-dot-outline', 'circle-stroke-opacity', 1);
              }
              if (map.getLayer('hover-dot-fill')) {
                map.setPaintProperty('hover-dot-fill', 'circle-opacity', 1);
              }

              refreshMapStats(statsEl, streams, si, maxSpdKmh, maxHR);
              if (state.flythrough?._drawMiniChart) state.flythrough._drawMiniChart(capturedIdx);
            });
          });

          map.getContainer().addEventListener('mouseleave', () => {
            _lastHoverIdx = -1;
            if (_hoverRaf) { cancelAnimationFrame(_hoverRaf); _hoverRaf = 0; }
            if (state.flythrough?.playing) return;
            if (map.getLayer('hover-dot-outline')) {
              map.setPaintProperty('hover-dot-outline', 'circle-opacity', 0);
              map.setPaintProperty('hover-dot-outline', 'circle-stroke-opacity', 0);
            }
            if (map.getLayer('hover-dot-fill')) {
              map.setPaintProperty('hover-dot-fill', 'circle-opacity', 0);
            }
            resetMapStats(statsEl);
          });
        }

        // ── Toggle buttons ───────────────────────────────────────────────
        const togglesEl = document.getElementById('mapColorToggles');
        if (togglesEl) {
          const modes = [
            { key: 'default',  label: 'Route',    icon: '◉' },
            hrArr?.length   ? { key: 'hr',       label: 'HR',       icon: '♥' } : null,
            spdArr?.length  ? { key: 'speed',    label: 'Speed',    icon: '⚡' } : null,
            wArr?.length    ? { key: 'power',    label: 'Power',    icon: '◈' } : null,
            altArr?.length  ? { key: 'altitude', label: 'Altitude', icon: '▲' } : null,
          ].filter(Boolean);

          // Desktop inline pills
          togglesEl.innerHTML = modes.map(m =>
            `<button class="map-mode-btn${m.key === 'default' ? ' active' : ''}" data-mode="${m.key}">
               <span class="map-mode-icon">${m.icon}</span>${m.label}
             </button>`
          ).join('');

          togglesEl.querySelectorAll('.map-mode-btn').forEach(btn =>
            btn.addEventListener('click', () => applyColorMode(btn.dataset.mode)));

          // Mobile: Export-style dropdown
          const mtWrap = document.createElement('div');
          mtWrap.className = 'map-toggle-wrap';
          const mtTrigger = document.createElement('button');
          mtTrigger.className = 'map-toggle-trigger';
          mtTrigger.innerHTML = `<span class="map-mode-icon">${modes[0].icon}</span><span class="map-toggle-label">${modes[0].label}</span><svg class="map-toggle-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"><polyline points="6 9 12 15 18 9"/></svg>`;
          const mtMenu = document.createElement('div');
          mtMenu.className = 'map-toggle-menu';
          modes.forEach(m => {
            const opt = document.createElement('button');
            opt.className = 'map-toggle-opt' + (m.key === 'default' ? ' active' : '');
            opt.dataset.mode = m.key;
            opt.innerHTML = `<span class="map-mode-icon">${m.icon}</span>${m.label}`;
            mtMenu.appendChild(opt);
          });
          mtWrap.appendChild(mtTrigger);
          mtWrap.appendChild(mtMenu);
          togglesEl.appendChild(mtWrap);

          mtTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            mtWrap.classList.toggle('map-toggle-wrap--open');
          });
          document.addEventListener('click', () => mtWrap.classList.remove('map-toggle-wrap--open'));
          mtWrap.addEventListener('click', (e) => e.stopPropagation());
          mtMenu.querySelectorAll('.map-toggle-opt').forEach(opt =>
            opt.addEventListener('click', () => {
              applyColorMode(opt.dataset.mode);
              mtWrap.classList.remove('map-toggle-wrap--open');
            }));

          // Append satellite + recentre buttons to the NavigationControl group
          const navGroup = map.getContainer().querySelector('.maplibregl-ctrl-group');
          if (navGroup) {
            const satBtn = document.createElement('button');
            satBtn.className = 'act-map-tool-btn';
            satBtn.title = 'Toggle satellite imagery';
            satBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><ellipse cx="12" cy="12" rx="5" ry="10"/></svg>';
            // Persistent handler: re-add route layers after any style swap
            function _readdRouteLayers() {
              try {
                if (!map.getSource('route-shadow')) {
                  map.addSource('route-shadow', { type: 'geojson', data: shadowGeoJSON });
                  map.addLayer({
                    id: 'route-shadow-layer', type: 'line', source: 'route-shadow',
                    paint: { 'line-color': '#000', 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 5, 12, 7, 14, 9, 16, 11], 'line-opacity': 0.55 },
                    layout: { 'line-cap': 'round', 'line-join': 'round' },
                  });
                }
                if (!map.getSource('route-color')) {
                  map.addSource('route-color', { type: 'geojson', data: buildRouteGeoJSON(activeMode) });
                  map.addLayer({
                    id: 'route-color-layer', type: 'line', source: 'route-color',
                    paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 3, 12, 4.5, 14, 6, 16, 8], 'line-opacity': 1 },
                    layout: { 'line-cap': 'round', 'line-join': 'round' },
                  });
                }
                if (!map.getSource('hover-dot')) {
                  map.addSource('hover-dot', {
                    type: 'geojson',
                    data: { type: 'Feature', geometry: { type: 'Point', coordinates: [valid[0][1], valid[0][0]] }, properties: { color: '#fff' } },
                  });
                  map.addLayer({ id: 'hover-dot-outline', type: 'circle', source: 'hover-dot',
                    paint: { 'circle-radius': 7, 'circle-color': '#fff', 'circle-stroke-width': 2.5, 'circle-stroke-color': '#fff', 'circle-opacity': 0, 'circle-stroke-opacity': 0 } });
                  map.addLayer({ id: 'hover-dot-fill', type: 'circle', source: 'hover-dot',
                    paint: { 'circle-radius': 5, 'circle-color': ['get', 'color'], 'circle-opacity': 0 } });
                }
                _mlApplyTerrain(map);
              } catch (_) {}
            }
            satBtn.addEventListener('click', () => {
              isSatellite = !isSatellite;
              state._actIsSatellite = isSatellite;
              map.setStyle(isSatellite ? _mlGetStyle('satellite') : _mlGetStyle(state._actMapThemeKey || themeKey));
              satBtn.classList.toggle('active', isSatellite);
              // Use 'idle' (reliable for both vector + raster styles) to re-add layers
              map.once('idle', _readdRouteLayers);
            });
            navGroup.appendChild(satBtn);

            const recentreBtn = document.createElement('button');
            recentreBtn.className = 'act-map-tool-btn';
            recentreBtn.title = 'Recentre map';
            recentreBtn.innerHTML = '<svg viewBox="0 0 18 18" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="9" cy="9" r="3"/><line x1="9" y1="1" x2="9" y2="5"/><line x1="9" y1="13" x2="9" y2="17"/><line x1="1" y1="9" x2="5" y2="9"/><line x1="13" y1="9" x2="17" y2="9"/></svg>';
            recentreBtn.addEventListener('click', () => {
              const rPad = _sheet.active ? Math.round(window.innerHeight * _sheet.SNAP_PEEK) : 0;
              map.fitBounds(routeBounds, { padding: { top: 64, right: 40, bottom: rPad + 120, left: 40 }, duration: 600 });
            });
            navGroup.appendChild(recentreBtn);

            const terrainBtn = document.createElement('button');
            terrainBtn.className = 'act-map-tool-btn' + (loadTerrainEnabled() ? ' active' : '');
            terrainBtn.title = 'Toggle 3D terrain';
            terrainBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20l5-10 4 6 3-4 6 8"/><circle cx="17" cy="7" r="2"/></svg>';
            terrainBtn.addEventListener('click', () => {
              const on = !loadTerrainEnabled();
              setTerrainEnabled(on);
              _mlApplyTerrain(map);
              terrainBtn.classList.toggle('active', on);
              // Sync settings page toggle if it exists
              const settingsEl = document.getElementById('terrain3dToggle');
              if (settingsEl) settingsEl.checked = on;
              if (on) {
                map.easeTo({ pitch: 55, duration: 600 });
              } else {
                map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
              }
            });
            navGroup.appendChild(terrainBtn);

            // Color-mode cycle button (cycles through available route color modes)
            const colorModeIcons = { default: '◉', hr: '♥', speed: '⚡', power: '◈', altitude: '▲' };
            const colorModeColors = { default: '#00e5a0', hr: '#f87171', speed: '#3b82f6', power: '#f97316', altitude: '#7c3aed' };
            const colorCycleBtn = document.createElement('button');
            colorCycleBtn.className = 'act-map-tool-btn';
            colorCycleBtn.title = 'Cycle route color';
            colorCycleBtn.innerHTML = `<span style="font-size:14px;line-height:1">${colorModeIcons[activeMode] || '◉'}</span>`;
            colorCycleBtn.style.color = colorModeColors[activeMode] || '#00e5a0';
            colorCycleBtn.addEventListener('click', () => {
              const idx = modes.findIndex(m => m.key === activeMode);
              const next = modes[(idx + 1) % modes.length];
              applyColorMode(next.key);
              colorCycleBtn.innerHTML = `<span style="font-size:14px;line-height:1">${colorModeIcons[next.key] || '◉'}</span>`;
              colorCycleBtn.style.color = colorModeColors[next.key] || '#00e5a0';
              colorCycleBtn.title = `Route: ${next.label}`;
            });
            navGroup.appendChild(colorCycleBtn);
          }
        }

        // ── Flythrough (always initialised when GPS data is present) ─────
        initFlythrough(map, valid, streams, maxes, maxSpdKmh, maxHR,
                       hasStreams ? statsEl : null, timeLen, () => activeMode);

        // ── 3D terrain ─────────────────────────────────────────────────────
        _mlApplyTerrain(map);
      }; // end _onMapReady
      if (map.isStyleLoaded()) _onMapReady(); else map.on('load', _onMapReady);

      // ── Fit bounds ─────────────────────────────────────────────────────
      // Compute LngLatBounds from points
      const lngLats = points.map(p => [p[1], p[0]]);
      const routeBounds = lngLats.reduce(
        (b, c) => b.extend(c),
        new maplibregl.LngLatBounds(lngLats[0], lngLats[0])
      );
      state.activityMap = map;

      // ── Activate bottom-sheet layout ──────────────────────────────────────
      activateSheetMode();

      // Set route bounds AFTER activateSheetMode so _sheet._ctrl exists
      _sheet.routeBounds = routeBounds;

      // Fit route with bottom padding to account for the sheet overlay
      // Must wait for rAF so the map resizes after reparenting into sheet bg
      requestAnimationFrame(() => {
        map.resize();
        const sheetPad = Math.round(window.innerHeight * _sheet.SNAP_PEEK);
        map.fitBounds(routeBounds, { padding: { top: 64, right: 40, bottom: sheetPad + 120, left: 40 }, duration: 0 });
      });

      // ── Scroll-to-zoom on hover + right-click 3D tilt ─────────────────────
      const mapContainer = map.getContainer();

      // Enable scroll zoom only while mouse is over the map
      mapContainer.addEventListener('mouseenter', () => map.scrollZoom.enable());
      mapContainer.addEventListener('mouseleave', () => map.scrollZoom.disable());

      // Enable right-click drag for 3D tilt/rotate (bearing + pitch)
      map.dragRotate.enable();
      map.keyboard.enable();

    } catch(e) { console.error('[Map] MapLibre error:', e); }
  });
}

/* ====================================================
   MAP FLYTHROUGH — animated dot traverses the route
==================================================== */
function initFlythrough(map, valid, streams, maxes, maxSpdKmh, maxHR, statsEl, timeLen, getMode) {
  const ft = {
    playing: false,
    idx: 0,
    speed: 15,   // multiplier: GPS points are ~1Hz, so 15× ≈ 15 pts/sec
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

  // Flythrough dot marker (MapLibre)
  const ftDotEl = document.createElement('div');
  ftDotEl.className = 'ft-dot-wrap';
  ftDotEl.innerHTML = `<div class="ft-dot-core" style="background:${ACCENT}"></div><div class="ft-dot-ring" style="border-color:${ACCENT}aa"></div>`;

  const makeFtIcon = (color) => {
    const core = ftDotEl.querySelector('.ft-dot-core');
    const ring = ftDotEl.querySelector('.ft-dot-ring');
    if (core) core.style.background = color;
    if (ring) ring.style.borderColor = color + 'aa';
  };

  const ftMarker = new maplibregl.Marker({ element: ftDotEl, anchor: 'center' })
    .setLngLat([valid[0][1], valid[0][0]]);

  // ── Fullscreen mini sparkline chart ──────────────────────────────────
  const _mc = { canvas: null, ctx: null, layers: [], layerOn: {}, cached: null, w: 0, h: 0 };

  const MC_METRICS = [
    { key: 'heartrate',       alt: 'heart_rate',     label: 'HR',       color: '#ff6b35', unit: 'bpm' },
    { key: 'watts',           alt: 'power',          label: 'Power',    color: ACCENT, unit: 'w'   },
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
        const range = max - min;
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
          const y = pad + drawH - (range === 0 ? 0.5 : (v - min) / range) * drawH;
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
      const range = max - min;
      const di = Math.min(si, data.length - 1);
      const v = data[di];
      if (v == null) return;
      const y = dotPad + dotDrawH - (range === 0 ? 0.5 : (v - min) / range) * dotDrawH;
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

  let _lastStatsIdx = -1;
  function _updatePosition(idxForStats, pos) {
    const lngLat = Array.isArray(pos) ? [pos[1], pos[0]] : pos;
    // Always update marker + camera at full 60fps for smooth movement
    ftMarker.setLngLat(lngLat);
    if (!ftMarker._map) ftMarker.addTo(map);
    if (ft.follow) map.jumpTo({ center: lngLat });

    // Throttle heavier UI updates to when the integer index changes
    if (idxForStats !== _lastStatsIdx) {
      _lastStatsIdx = idxForStats;
      const si = Math.round(idxForStats * (timeLen - 1) / (valid.length - 1));
      const color = routePointColor(getMode(), streams, si, maxes);
      makeFtIcon(color);
      if (statsEl) refreshMapStats(statsEl, streams, si, maxSpdKmh, maxHR);
      drawMiniChart(idxForStats);
    }

    // Scrubber is cheap — update every frame
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
    const btn = document.getElementById('ftPlayBtn');
    if (btn) btn.innerHTML = ICON_PAUSE;
    // Sheet mode: expand bar and collapse sheet for more map
    const ftBarEl = document.getElementById('flythroughBar');
    if (ftBarEl) ftBarEl.classList.add('ft-expanded');
    if (_sheet.active) _setSheetState('hidden');
    // Zoom into the current position, then start animation after zoom completes
    const pos = valid[ft.idx];
    if (pos && map.getZoom() < FT_ZOOM - 1) {
      ft.playing = true; // mark playing so pause works during zoom
      map.once('moveend', () => { if (ft.playing) { ft.lastTs = null; ft.rafId = requestAnimationFrame(step); } });
      map.easeTo({ center: [pos[1], pos[0]], zoom: FT_ZOOM, duration: 600 });
      return;
    }
    ft.rafId = requestAnimationFrame(step);
  }

  function ftPause() {
    ft.playing = false;
    if (ft.rafId) { cancelAnimationFrame(ft.rafId); ft.rafId = null; }
    const btn = document.getElementById('ftPlayBtn');
    if (btn) btn.innerHTML = ICON_PLAY;
    // Keep current zoom/position on pause — don't zoom back out
  }

  // ── Window-level handlers (attached to buttons via onclick) ─────────────
  window.ftTogglePlay = () => { ft.playing ? ftPause() : ftPlay(); };
  window.ftSetSpeed   = (s) => { ft.speed = +s; };
  const FT_SPEEDS = [1, 5, 15, 30, 60];
  const FT_LABELS = ['1×', '5×', '15×', '30×', '60×'];
  window.ftCycleSpeed = () => {
    const idx = FT_SPEEDS.indexOf(ft.speed);
    const next = (idx + 1) % FT_SPEEDS.length;
    ft.speed = FT_SPEEDS[next];
    const btn = document.getElementById('ftSpeedToggle');
    if (btn) btn.textContent = FT_LABELS[next];
  };
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
    let _ftMoveRAF = 0;
    const ftMoveDoc = (e) => { if (!dragging) return; const cx = e.clientX; if (_ftMoveRAF) return; _ftMoveRAF = requestAnimationFrame(() => { _ftMoveRAF = 0; goTo(idxFromEvent(cx)); }); };
    const ftUpDoc = () => { if (!dragging) return; dragging = false; if (ft._resumeOnRelease) ftPlay(); };
    const ftTouchMoveDoc = (e) => { if (dragging) goTo(idxFromEvent(e.touches[0].clientX)); };
    const ftTouchEndDoc = () => { if (!dragging) return; dragging = false; if (ft._resumeOnRelease) ftPlay(); };
    document.addEventListener('mousemove', ftMoveDoc);
    document.addEventListener('mouseup', ftUpDoc);

    track.addEventListener('touchstart', (e) => {
      dragging = true;
      ft._resumeOnRelease = ft.playing;
      ftPause();
      goTo(idxFromEvent(e.touches[0].clientX));
    }, { passive: true });
    document.addEventListener('touchmove', ftTouchMoveDoc, { passive: true });
    document.addEventListener('touchend', ftTouchEndDoc);

    _pageCleanupFns.push(() => {
      document.removeEventListener('mousemove', ftMoveDoc);
      document.removeEventListener('mouseup', ftUpDoc);
      document.removeEventListener('touchmove', ftTouchMoveDoc);
      document.removeEventListener('touchend', ftTouchEndDoc);
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
    { key: 'watts',           label: 'Power',    color: ACCENT, unit: 'w',    yAxis: 'yPower',   borderWidth: 1.5, fill: false,    alpha: 0 },
    { key: 'heartrate',       label: 'HR',       color: '#ff6b35', unit: ' bpm', yAxis: 'yHR',      borderWidth: 1.5, fill: false,    alpha: 0 },
    { key: 'cadence',         label: 'Cadence',  color: '#4a9eff', unit: ' rpm', yAxis: 'yCadence', borderWidth: 1.5, fill: false,    alpha: 0 },
    { key: 'velocity_smooth', label: 'Speed',    color: '#f0c429', unit: ' km/h',yAxis: 'ySpeed',   borderWidth: 1.5, fill: false,    alpha: 0 },
    { key: 'lrbalance',       label: 'L/R Bal',  color: '#e84393', unit: '%',    yAxis: 'yLRBal',   borderWidth: 1.5, fill: false,    alpha: 0 },
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
    yLRBal:   { display: false, min: 40, max: 60 },
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
  const STREAM_META = { watts: ACCENT, heartrate: '#ff6b35', cadence: '#4a9eff', velocity_smooth: '#f0c429', altitude: '#9b59ff', lrbalance: '#e84393' };
  const STREAM_LABEL = { watts: 'Power', heartrate: 'HR', cadence: 'Cadence', velocity_smooth: 'Speed', altitude: 'Altitude', lrbalance: 'L/R Bal' };
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
  unskeletonCard('detailStreamsCard');
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
const ZONE_HEX = ['#4a9eff', ACCENT, '#ffcc00', '#ff6b35', '#ff5252', '#b482ff'];

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
    const hoverColors = colors.map(c => c.length === 9 ? c.slice(0, 7) : c);
    return {
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: colors, hoverBackgroundColor: hoverColors, borderRadius: 4 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
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
      state.activityPowerChart = destroyChart(state.activityPowerChart);
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
      state.activityHRChart = destroyChart(state.activityHRChart);
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
    unskeletonCard('detailChartsRow');
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
  unskeletonCard(cardId);
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
  try { localStorage.setItem('icu_hide_empty_cards', String(enabled)); } catch (e) { console.warn('localStorage.setItem failed:', e); }
  const toggle = document.getElementById('hideEmptyCardsToggle');
  if (toggle) toggle.checked = enabled;
}

/* ── FTP change alert toggle ── */
function loadFtpAlert() {
  return localStorage.getItem('icu_ftp_alert') !== 'false'; // default ON
}
function setFtpAlert(on) {
  try { localStorage.setItem('icu_ftp_alert', String(on)); } catch (e) { console.warn('localStorage.setItem failed:', e); }
  const t = document.getElementById('ftpAlertToggle');
  if (t) t.checked = on;
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
  if (np > 0)           metrics.push(tile(Math.round(np) + 'w',       'Normalized Power',   'NP',               ACCENT));
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
  unskeletonCard('detailPerfCard');
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

  state._detailDecoupleChart = destroyChart(state._detailDecoupleChart);
  const ctx = document.getElementById('detailDecoupleChart')?.getContext('2d');
  if (!ctx) return;

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
          pointHoverBackgroundColor: ptColors,
          pointHoverBorderColor:     ptColors,
          pointRadius: 0,
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
          borderColor: _isDark() ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)',
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
            labelColor: c => {
              const col = ptColors[c.dataIndex] || '#60a5fa';
              return { backgroundColor: col, borderColor: col, borderWidth: 0, borderRadius: 3 };
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
  unskeletonCard('detailDecoupleCard');
}

// ── L/R Power Balance card ───────────────────────────────────────────────────
function renderDetailLRBalance(streams, activity) {
  const card = document.getElementById('detailLRBalanceCard');
  if (!card) return;

  const lrRaw = streams.lrbalance || streams.left_right_balance || [];
  const hasData = lrRaw.length > 10 && lrRaw.some(v => v != null && v > 0);
  if (!hasData) { showCardNA('detailLRBalanceCard'); return; }

  // Compute average (lrbalance = right leg %; left = 100 - value)
  const valid = lrRaw.filter(v => v != null && v > 0);
  const avgBalance = valid.reduce((s, v) => s + v, 0) / valid.length;
  const leftPct  = +(100 - avgBalance).toFixed(1);
  const rightPct = +avgBalance.toFixed(1);

  // Badge color: green if <2% imbalance, yellow <4%, red >4%
  const imbalance = Math.abs(avgBalance - 50);
  const badgeColor = imbalance < 2 ? ACCENT : imbalance < 4 ? '#f0c429' : '#ff4757';
  const badgeLabel = imbalance < 2 ? 'Balanced' : imbalance < 4 ? 'Slight imbalance' : 'Imbalanced';

  const badgeEl = document.getElementById('detailLRBalBadge');
  const subEl   = document.getElementById('detailLRBalSub');
  const summEl  = document.getElementById('detailLRBalSummary');

  if (badgeEl) { badgeEl.textContent = `${leftPct}% / ${rightPct}%`; badgeEl.style.color = badgeColor; }
  if (subEl) subEl.textContent = `Left vs Right pedal power · ${badgeLabel}`;

  if (summEl) {
    summEl.innerHTML = `
      <div class="detail-lrbal-side">
        <div class="detail-lrbal-side-label">Left</div>
        <div class="detail-lrbal-side-val" style="color:#4a9eff">${leftPct}%</div>
      </div>
      <div class="detail-lrbal-bar-wrap">
        <div class="detail-lrbal-bar">
          <div class="detail-lrbal-bar-left" style="width:${leftPct}%"></div>
          <div class="detail-lrbal-bar-right" style="width:${rightPct}%"></div>
        </div>
        <div class="detail-lrbal-bar-label" style="color:${badgeColor}">${badgeLabel}</div>
      </div>
      <div class="detail-lrbal-side">
        <div class="detail-lrbal-side-label">Right</div>
        <div class="detail-lrbal-side-val" style="color:#e84393">${rightPct}%</div>
      </div>`;
  }

  // Downsample for chart
  const ds = downsampleStreams({ lrbalance: lrRaw, time: streams.time || [] }, 200);
  const chartData = ds.lrbalance || lrRaw;
  const rawTime   = ds.time || [];

  const labels = chartData.map((_, i) => {
    const s = rawTime[i] != null ? rawTime[i] : i;
    const m = Math.floor(s / 60);
    const sec = Math.round(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  });

  state._detailLRBalChart = destroyChart(state._detailLRBalChart);
  const ctx = document.getElementById('detailLRBalChart')?.getContext('2d');
  if (!ctx) return;

  state._detailLRBalChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'L/R Balance',
          data: chartData,
          borderColor: '#e84393',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 5,
          tension: 0.4,
          fill: false,
          spanGaps: true,
        },
        {
          label: '50% line',
          data: chartData.map(() => 50),
          borderColor: 'rgba(255,255,255,0.2)',
          borderWidth: 1,
          borderDash: [6, 4],
          pointRadius: 0,
          fill: false,
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'indexEager', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...C_TOOLTIP,
          callbacks: {
            title: c => c[0].label,
            label: c => {
              if (c.datasetIndex !== 0 || c.raw == null) return null;
              return `L ${(100 - c.raw).toFixed(1)}% / R ${c.raw.toFixed(1)}%`;
            },
          }
        }
      },
      scales: {
        x: { grid: C_GRID, ticks: { ...C_TICK, maxRotation: 0, maxTicksLimit: 8, autoSkip: true } },
        y: {
          grid: C_GRID,
          min: 40, max: 60,
          ticks: { ...C_TICK, callback: v => v === 50 ? '50%' : v + '%', stepSize: 2 },
        }
      }
    }
  });

  clearCardNA(card);
  card.style.display = '';
  unskeletonCard('detailLRBalanceCard');
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
  unskeletonCard('detailZonesCard');
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
  unskeletonCard('detailHRZonesCard');
}

// ── Zones carousel (mobile swipe between Power Zones ↔ HR Zones) ─────────────
function initZonesCarousel() {
  const wrapper = document.getElementById('detailZonesCarouselCard');
  const row     = document.getElementById('detailZonesRow');
  const dots    = document.getElementById('zonesCarouselDots');
  const pwrCard = document.getElementById('detailZonesCard');
  const hrCard  = document.getElementById('detailHRZonesCard');
  if (!wrapper || !row) return;

  // Show wrapper — always visible (both zone cards use showCardNA when no data)
  const hasPwr = pwrCard && !pwrCard.classList.contains('card--na');
  const hasHR  = hrCard  && !hrCard.classList.contains('card--na');
  wrapper.style.display = '';
  unskeletonCard('detailZonesCarouselCard');

  // If only one card, mark as single (no carousel needed)
  if (!hasPwr || !hasHR) {
    row.classList.add('detail-zones-row--single');
    if (dots) dots.style.display = 'none';
    return;
  }
  row.classList.remove('detail-zones-row--single');

  // Scroll listener for dot updates
  if (dots) {
    const allDots = dots.querySelectorAll('.zones-carousel-dot');
    function updateDots() {
      const scrollLeft = row.scrollLeft;
      const cardW = row.scrollWidth / 2;
      const idx = scrollLeft > cardW * 0.5 ? 1 : 0;
      allDots.forEach((d, i) => d.classList.toggle('active', i === idx));
    }
    row.addEventListener('scroll', updateDots, { passive: true });

    // Dot click → scroll to card
    allDots.forEach(d => {
      d.addEventListener('click', () => {
        const idx = parseInt(d.dataset.idx, 10);
        const cardW = row.scrollWidth / 2;
        row.scrollTo({ left: idx * cardW, behavior: 'smooth' });
      });
    });
  }
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
  unskeletonCard('detailTempCard');

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

    window._tempChart = destroyChart(window._tempChart);
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
  const minT  = safeMin(valid);
  const maxT  = safeMax(valid);
  const avgT  = Math.round(valid.reduce((a, b) => a + b, 0) / valid.length * 10) / 10;

  if (subtitle) subtitle.textContent = `Avg ${avgT}${deg} · Min ${minT}${deg} · Max ${maxT}${deg}`;

  // Gradient fill — blue at cold end, orange-red at warm end
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 180);
  grad.addColorStop(0,   'rgba(251,146,60,0.35)');  // warm top
  grad.addColorStop(1,   'rgba(96,165,250,0.05)');  // cool bottom

  window._tempChart = destroyChart(window._tempChart);
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
          backgroundColor: _isDark() ? 'rgba(15,20,30,0.85)' : 'rgba(255,255,255,0.92)',
          titleColor: _isDark() ? '#94a3b8' : '#555e72',
          bodyColor: _isDark() ? '#f1f5f9' : '#1a1d24',
          borderColor: _isDark() ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
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
  unskeletonCard('detailHistogramCard');

  state.activityHistogramChart = destroyChart(state.activityHistogramChart);
  state.activityHistogramChart = new Chart(
    document.getElementById('activityHistogramChart').getContext('2d'), {
      type: 'bar',
      data: {
        labels: entries.map(e => e.watts + 'w'),
        datasets: [{
          data:  entries.map(e => e.mins),
          backgroundColor: 'rgba(0,229,160,0.45)',
          hoverBackgroundColor: ACCENT,
          borderRadius: 2,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
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
  // Check cache first — use sentinel object for "known 404 / no data"
  const cached = await actCacheGet(activityId, 'pcurve');
  if (cached) {
    // Sentinel means "we already know there's no power curve for this activity"
    if (cached.__noData) return null;
    return cached;
  }

  const res = await fetch(
    ICU_BASE + `/athlete/${state.athleteId}/activities/${activityId}/power-curve`,
    { headers: { ...authHeader(), 'Accept': 'application/json' } }
  );
  if (res.status === 404) {
    // Cache the 404 so we never re-fetch this activity's missing power curve
    actCachePut(activityId, 'pcurve', { __noData: true });
    return null;
  }
  rlTrackRequest();
  if (!res.ok) throw new Error(`${res.status}: ${await res.text().catch(() => res.statusText)}`);
  const data = await res.json();
  if (data) actCachePut(activityId, 'pcurve', data);
  else actCachePut(activityId, 'pcurve', { __noData: true });
  return data;
}

// ── In-memory cache for athlete-level range curves (TTL = 10 min) ────────
const _rangeCurveCache = {};
const RANGE_CURVE_TTL = 10 * 60 * 1000; // 10 minutes

function _rcKey(prefix, oldest, newest) { return `${prefix}|${oldest}|${newest}`; }

const _RC_MISS = Symbol('miss');

function _rcGet(key) {
  const entry = _rangeCurveCache[key];
  if (!entry) return _RC_MISS;
  if (Date.now() - entry.ts > RANGE_CURVE_TTL) { delete _rangeCurveCache[key]; return _RC_MISS; }
  return entry.data;
}

function _rcPut(key, data) {
  _rangeCurveCache[key] = { data, ts: Date.now() };
}

// Fetch athlete-level power curve for a date range + activity type
async function fetchRangePowerCurve(oldest, newest) {
  const cacheKey = _rcKey('pc', oldest, newest);
  const cached = _rcGet(cacheKey);
  if (cached !== _RC_MISS) return cached;

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
        _rcPut(cacheKey, candidate);
        return candidate;
      }
    } catch (_) { /* try next type */ }
  }
  _rcPut(cacheKey, null);
  return null;
}

// ── Feature 1: Elevation / Gradient Profile ─────────────────────────────────
function renderDetailGradientProfile(streams, activity) {
  const card = document.getElementById('detailGradientCard');
  if (!card) return;
  const alt  = streams?.altitude;
  const dist = streams?.distance;
  if (!Array.isArray(alt) || alt.length < 2) { showCardNA('detailGradientCard'); return; }

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
  unskeletonCard('detailGradientCard');
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
        interaction: { mode: 'index', intersect: false },
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
            ticks: { ...C_TICK, maxTicksLimit: 8,
              callback: v => distDS[v] !== undefined ? distDS[v] + ' km' : '' },
            grid: { display: false },
            border: { display: false },
          },
          y: {
            ticks: { ...C_TICK,
              callback: v => v + 'm' },
            grid: C_GRID,
            border: { display: false },
          }
        }
      }
    }
  );
}

// ── Climb Detection ─────────────────────────────────────────────────────────
function renderClimbDetection(streams, activity) {
  const card = document.getElementById('detailClimbsCard');
  const body = document.getElementById('detailClimbsBody');
  const sub  = document.getElementById('detailClimbsSubtitle');
  if (!card || !body) return;

  const alt  = streams?.altitude;
  const dist = streams?.distance;
  const time = streams?.time;
  const watts = streams?.watts;

  if (!Array.isArray(alt) || !Array.isArray(dist) || alt.length < 50) {
    card.style.display = 'none'; return;
  }

  // Step 1: Smooth altitude (rolling average, half-window = 10)
  const SW = 10;
  const smooth = alt.map((_, i) => {
    const lo = Math.max(0, i - SW), hi = Math.min(alt.length - 1, i + SW);
    let s = 0, n = 0;
    for (let j = lo; j <= hi; j++) { if (alt[j] != null) { s += alt[j]; n++; } }
    return n > 0 ? s / n : alt[i];
  });

  // Step 2: Detect uphill segments (>=2% over >=300m)
  const raw = [];
  let segStart = null;
  for (let i = 1; i < smooth.length; i++) {
    const dd = dist[i] - dist[i - 1];
    const grade = dd > 0 ? ((smooth[i] - smooth[i - 1]) / dd) * 100 : 0;
    if (grade >= 2) {
      if (segStart === null) segStart = i - 1;
    } else {
      if (segStart !== null) {
        if (dist[i - 1] - dist[segStart] >= 300) raw.push({ s: segStart, e: i - 1 });
        segStart = null;
      }
    }
  }
  if (segStart !== null && dist[dist.length - 1] - dist[segStart] >= 300)
    raw.push({ s: segStart, e: dist.length - 1 });

  // Step 3: Merge segments <200m apart
  const merged = [];
  raw.forEach(seg => {
    if (merged.length && dist[seg.s] - dist[merged[merged.length - 1].e] < 200)
      merged[merged.length - 1].e = seg.e;
    else merged.push({ ...seg });
  });

  // Step 4: Calculate per-climb stats
  const climbs = merged.map(seg => {
    const climbDist = dist[seg.e] - dist[seg.s];
    const elevGain  = smooth[seg.e] - smooth[seg.s];
    const avgGrade  = climbDist > 0 ? (elevGain / climbDist) * 100 : 0;
    // Max gradient (50m rolling)
    let maxGrade = 0;
    for (let i = seg.s; i <= seg.e; i++) {
      const lo = Math.max(seg.s, i - 25), hi = Math.min(seg.e, i + 25);
      const d = dist[hi] - dist[lo];
      if (d > 10) { const g = ((smooth[hi] - smooth[lo]) / d) * 100; if (g > maxGrade) maxGrade = g; }
    }
    let duration = 0;
    if (Array.isArray(time) && time.length > seg.e)
      duration = (time[seg.e] || 0) - (time[seg.s] || 0);
    const vam = duration > 0 ? Math.round(elevGain / (duration / 3600)) : 0;
    let avgPower = 0;
    if (Array.isArray(watts) && watts.length > seg.e) {
      let ws = 0, wc = 0;
      for (let i = seg.s; i <= seg.e; i++) { if (watts[i] > 0) { ws += watts[i]; wc++; } }
      avgPower = wc > 0 ? Math.round(ws / wc) : 0;
    }
    // Category
    const dk = climbDist / 1000;
    let cat;
    if (dk < 2)                                                cat = 'Climb';
    else if (elevGain >= 1200)                                 cat = 'HC';
    else if (elevGain >= 800)                                  cat = 'Cat 1';
    else if (elevGain >= 500 || (avgGrade >= 8 && dk >= 5))    cat = 'Cat 2';
    else if (elevGain >= 250 || (avgGrade >= 5 && dk >= 3))    cat = 'Cat 3';
    else if (elevGain >= 100 || (avgGrade >= 2 && dk >= 2))    cat = 'Cat 4';
    else                                                       cat = 'Climb';
    // Grade color
    const gc = avgGrade < 5 ? 'var(--accent)' : avgGrade < 8 ? 'var(--yellow)' : avgGrade < 12 ? 'var(--orange)' : 'var(--red)';
    return { s: seg.s, e: seg.e, climbDist, elevGain, avgGrade, maxGrade, duration, vam, avgPower, cat, gc };
  }).filter(c => c.elevGain >= 20);

  if (!climbs.length) { card.style.display = 'none'; return; }

  // Step 5: Render
  const totalGain = climbs.reduce((s, c) => s + c.elevGain, 0);
  sub.textContent = `${climbs.length} climb${climbs.length !== 1 ? 's' : ''} detected · +${Math.round(totalGain)}m total`;

  body.innerHTML = climbs.map((c, i) => {
    // SVG sparkline
    const pts = [];
    const sparkN = Math.min(30, c.e - c.s);
    const step = Math.max(1, Math.floor((c.e - c.s) / sparkN));
    for (let j = c.s; j <= c.e; j += step) pts.push(smooth[j]);
    const mn = Math.min(...pts), mx = Math.max(...pts), rng = mx - mn || 1;
    const W = 80, H = 32;
    const path = pts.map((v, idx) => {
      const x = (idx / (pts.length - 1)) * W;
      const y = H - ((v - mn) / rng) * (H - 4);
      return `${idx === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');

    const catColor = c.cat === 'HC' ? 'var(--red)' : c.cat === 'Cat 1' ? 'var(--orange)' : c.cat === 'Cat 2' ? 'var(--yellow)' : c.gc;

    return `<div class="act-climb-pill">
      <div class="act-climb-pill-top">
        <span class="act-climb-num">#${i + 1}</span>
        <span class="act-climb-cat" style="color:${catColor}">${c.cat}</span>
      </div>
      <svg class="act-climb-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        <path d="${path}" fill="none" stroke="${c.gc}" stroke-width="2"/>
      </svg>
      <div class="act-climb-stats">
        <div class="act-climb-stat"><span class="act-climb-stat-val">${(c.climbDist / 1000).toFixed(1)}</span><span class="act-climb-stat-lbl">km</span></div>
        <div class="act-climb-stat"><span class="act-climb-stat-val">+${Math.round(c.elevGain)}</span><span class="act-climb-stat-lbl">m</span></div>
        <div class="act-climb-stat"><span class="act-climb-stat-val">${c.avgGrade.toFixed(1)}</span><span class="act-climb-stat-lbl">% avg</span></div>
        ${c.duration > 0 ? `<div class="act-climb-stat"><span class="act-climb-stat-val">${fmtDur(c.duration)}</span><span class="act-climb-stat-lbl">time</span></div>` : ''}
        ${c.vam > 0 ? `<div class="act-climb-stat"><span class="act-climb-stat-val">${c.vam}</span><span class="act-climb-stat-lbl">VAM</span></div>` : ''}
        ${c.avgPower > 0 ? `<div class="act-climb-stat"><span class="act-climb-stat-val">${c.avgPower}</span><span class="act-climb-stat-lbl">W</span></div>` : ''}
      </div>
    </div>`;
  }).join('');

  card.style.display = '';
  unskeletonCard('detailClimbsCard');
}

// ── Lap Splits ──────────────────────────────────────────────────────────────
function renderLapSplits(activity) {
  const card = document.getElementById('detailLapSplitsCard');
  const body = document.getElementById('detailLapSplitsBody');
  const sub  = document.getElementById('detailLapSplitsSubtitle');
  if (!card || !body) return;

  const laps = activity.icu_laps || activity.laps;
  if (!Array.isArray(laps) || laps.length <= 1) { showCardNA('detailLapSplitsCard'); return; }

  const totalDist = laps.reduce((s, l) => s + (l.distance || 0), 0);
  const totalDistKm = (totalDist / 1000).toFixed(1);
  sub.textContent = `${laps.length} laps · ${totalDistKm} km`;

  // Find best lap (highest avg speed)
  let bestIdx = -1, bestSpd = 0;
  laps.forEach((l, i) => {
    const spd = l.average_speed || 0;
    if (spd > bestSpd) { bestSpd = spd; bestIdx = i; }
  });

  let html = `<table class="act-ivl-table">
    <thead><tr>
      <th>#</th><th>Distance</th><th>Duration</th>
      <th>Avg Speed</th><th>Avg Power</th><th>Avg HR</th>
      <th>Avg Cad</th><th>Elev</th>
    </tr></thead><tbody>`;

  laps.forEach((l, i) => {
    const dist  = l.distance ? (l.distance / 1000).toFixed(2) + ' km' : '—';
    const secs  = l.moving_time || l.elapsed_time || 0;
    const dur   = secs > 0 ? fmtDur(secs) : '—';
    const spd   = l.average_speed ? (l.average_speed * 3.6).toFixed(1) + ' km/h' : '—';
    const watts = l.average_watts ? Math.round(l.average_watts) + ' W' : '—';
    const hr    = l.average_heartrate ? Math.round(l.average_heartrate) + ' bpm' : '—';
    const cad   = l.average_cadence ? Math.round(l.average_cadence) + ' rpm' : '—';
    const elev  = l.total_elevation_gain ? Math.round(l.total_elevation_gain) + ' m' : '—';
    const best  = i === bestIdx ? ' style="color:var(--accent)"' : '';
    html += `<tr>
      <td>${i + 1}</td><td>${dist}</td><td>${dur}</td>
      <td${best}>${spd}</td><td>${watts}</td><td>${hr}</td>
      <td>${cad}</td><td>${elev}</td>
    </tr>`;
  });

  html += '</tbody></table>';
  body.innerHTML = html;
  card.style.display = '';
  unskeletonCard('detailLapSplitsCard');
}

// ── Feature 2: Cadence Distribution ─────────────────────────────────────────
function renderDetailCadenceHist(streams, activity) {
  const card = document.getElementById('detailCadenceCard');
  if (!card) return;
  const cad = streams?.cadence;
  if (!Array.isArray(cad) || !cad.some(v => v != null && v > 0)) {
    showCardNA('detailCadenceCard'); return;
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
    i === maxIdx ? ACCENT : 'rgba(74,158,255,0.5)'
  );
  const hoverColors = minutes.map((_, i) =>
    i === maxIdx ? ACCENT : '#4a9eff'
  );

  const sub = document.getElementById('detailCadenceSubtitle');
  if (sub && totalSecs > 0) {
    const avgCad = cad.filter(v => v > 0).reduce((s, v) => s + v, 0) /
                   cad.filter(v => v > 0).length;
    sub.textContent = `Avg ${Math.round(avgCad)} rpm · ${labels[maxIdx]} most common`;
  }

  card.style.display = '';
  unskeletonCard('detailCadenceCard');
  state.activityCadenceChart = destroyChart(state.activityCadenceChart);
  state.activityCadenceChart = new Chart(
    document.getElementById('detailCadenceChart').getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data: minutes,
          backgroundColor: colors,
          hoverBackgroundColor: hoverColors,
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
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
            ticks: C_TICK,
            grid: { display: false },
            border: { display: false },
          },
          y: {
            ticks: { ...C_TICK,
              callback: v => v + ' min' },
            grid: C_GRID,
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
  const ZONE_HOVER_CHART = [
    'rgb(100,180,255)',  // Z1 blue
    'rgb(0,229,160)',    // Z2 green
    'rgb(240,196,41)',   // Z3 yellow
    'rgb(255,150,50)',   // Z4 orange
    'rgb(255,71,87)',    // Z5 red
    'rgb(180,80,220)',   // Z6 purple
  ];
  const ZONE_LABELS = ['Z1 Recovery','Z2 Endurance','Z3 Tempo','Z4 Threshold','Z5 VO2max','Z6 Anaerobic'];

  const datasets = ZONE_LABELS.map((label, i) => ({
    label,
    data: weeks.map(w => +weekMap[w][i].toFixed(2)),
    backgroundColor: ZONE_COLORS_CHART[i],
    hoverBackgroundColor: ZONE_HOVER_CHART[i],
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
      interaction: { mode: 'index', intersect: false },
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
          ticks: { ...C_TICK, maxTicksLimit: 12 },
          grid: { display: false },
          border: { display: false },
        },
        y: {
          stacked: true,
          ticks: { ...C_TICK,
            callback: v => v + 'h' },
          grid: C_GRID,
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
    try { localStorage.setItem(seenKey, JSON.stringify([...seenSet])); } catch (_e) {}
  }
  _rIC(() => { if (window.refreshGlow) refreshGlow(); });
  _rIC(() => { if (window.refreshBadgeTilt) refreshBadgeTilt(); });
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
  unskeletonCard('detailCurveCard');

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
      raw     && { label: 'This ride', color: ACCENT },
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
      borderColor: ACCENT, backgroundColor: 'rgba(0,229,160,0.08)',
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
  const cacheKey = _rcKey('hr', oldest, newest);
  const cached = _rcGet(cacheKey);
  if (cached !== _RC_MISS) return cached;

  try {
    const data = await icuFetch(
      `/athlete/${state.athleteId}/hr-curves?oldest=${oldest}&newest=${newest}`
    );
    const candidate = Array.isArray(data) ? data[0] : (data?.list?.[0] ?? data);
    if (candidate && Array.isArray(candidate.secs) && candidate.secs.length > 0 &&
        Array.isArray(candidate.heartrate) && candidate.heartrate.some(h => h != null && h > 0)) {
      _rcPut(cacheKey, candidate);
      return candidate;
    }
  } catch (_) {}
  _rcPut(cacheKey, null);
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
  unskeletonCard('detailHRCurveCard');

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
          <div class="curve-peak-val" style="color:#f87171">${bpm}<span class="curve-peak-unit">bpm</span></div>
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

/* ====================================================
   SETUP LINK (cross-device credential sharing)
==================================================== */
function _collectTransferableSettings() {
  const keys = [
    'icu_units', 'icu_theme', 'icu_map_theme', 'icu_app_font',
    'icu_range_days', 'icu_week_start_day', 'icu_terrain_3d',
    'icu_hide_empty_cards', 'icu_smooth_flyover', 'icu_physics_scroll',
    'icu_smart_poll', 'icu_smart_poll_interval',
    'icu_wx_locations', 'icu_wx_model', 'icu_wx_coords',
    'icu_goals', 'icu_dash_sections', 'icu_ors_api_key',
    'icu_avatar', 'icu_cal_panel_hidden',
  ];
  const cfg = {};
  for (const k of keys) {
    const v = localStorage.getItem(k);
    if (v != null && v !== '') cfg[k] = v;
  }
  return cfg;
}

function _applyTransferredSettings(cfg) {
  if (!cfg || typeof cfg !== 'object') return;
  for (const [k, v] of Object.entries(cfg)) {
    if (typeof k === 'string' && k.startsWith('icu_') && v != null) {
      try { localStorage.setItem(k, v); } catch (_) {}
    }
  }
}

function copySetupLink() {
  if (!state.athleteId || !state.apiKey) {
    showToast('Connect first to generate a setup link', 'error');
    return;
  }
  const cfg = _collectTransferableSettings();
  const cfgStr = btoa(unescape(encodeURIComponent(JSON.stringify(cfg))));
  const url = window.location.origin + window.location.pathname +
    '#id=' + encodeURIComponent(state.athleteId) +
    '&key=' + encodeURIComponent(state.apiKey) +
    '&cfg=' + cfgStr;
  // Try clipboard API first, then fallback to execCommand, then prompt
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      showToast('Setup link copied — includes credentials + all settings', 'success');
    }).catch(() => _copyFallback(url));
  } else {
    _copyFallback(url);
  }
}

function _copyFallback(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  try {
    const ok = document.execCommand('copy');
    if (ok) { showToast('Setup link copied — includes credentials + all settings', 'success'); }
    else { prompt('Copy this link manually:', text); }
  } catch (_) {
    prompt('Copy this link manually:', text);
  }
  document.body.removeChild(ta);
}

function applySetupLink(inputId) {
  const input = document.getElementById(inputId || 'setupLinkInput');
  const raw = (input?.value || '').trim();
  if (!raw) { showToast('Paste a setup link first', 'info'); return; }

  // Extract hash fragment from the pasted URL
  const hashIdx = raw.indexOf('#');
  if (hashIdx < 0) { showToast('Invalid setup link — no data found', 'error'); return; }

  const p = new URLSearchParams(raw.slice(hashIdx + 1));
  const id  = p.get('id');
  const key = p.get('key');
  if (!id || !key) { showToast('Invalid setup link — missing credentials', 'error'); return; }

  // Decode settings if present
  const cfgB64 = p.get('cfg');
  let cfgObj = null;
  if (cfgB64) {
    try { cfgObj = JSON.parse(decodeURIComponent(escape(atob(cfgB64)))); } catch (_) {}
  }
  const hasSettings = cfgObj && Object.keys(cfgObj).length > 0;

  // Close the connect modal if it's open (so confirm dialog is visible)
  const connectModal = document.getElementById('connectModal');
  if (connectModal?.open) closeModalAnimated(connectModal);

  showConfirmDialog(
    'Apply Setup Link',
    `Connect with Athlete ID: <strong>${id}</strong>${hasSettings ? ` and apply ${Object.keys(cfgObj).length} saved settings (theme, units, goals, weather, etc.)?` : '?'}`,
    () => {
      clearActivityCache();
      clearFitnessCache();
      saveCredentials(id, key);
      if (hasSettings) _applyTransferredSettings(cfgObj);
      input.value = '';
      showToast('Setup link applied — reloading...', 'success');
      setTimeout(() => window.location.reload(), 400);
    }
  );
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

let _gearActiveTab = 'components';
function gearSwitchTab(tab) {
  _gearActiveTab = tab;
  document.querySelectorAll('#page-gear .imp-tab').forEach(t => t.classList.toggle('imp-tab--active', t.dataset.gear === tab));
  ['components', 'batteries', 'service'].forEach(k => {
    const p = document.getElementById('gearPanel' + k.charAt(0).toUpperCase() + k.slice(1));
    if (p) p.style.display = k === tab ? '' : 'none';
  });
}

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
  try { localStorage.setItem(GEAR_STORE_KEY, JSON.stringify(arr)); } catch (e) { console.warn('localStorage.setItem failed:', e); }
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
  renderGearBatteries();
  renderGearServices();
}

function gearSelectBike(id) {
  _gearSelectedBike = (_gearSelectedBike === id) ? null : id; // toggle
  // Re-highlight cards
  document.querySelectorAll('.gear-bike-card').forEach(el => {
    const elId = el.getAttribute('onclick').match(/'([^']+)'/)?.[1];
    el.classList.toggle('gear-bike-card--active', elId === _gearSelectedBike);
  });
  renderGearComponents();
  renderGearBatteries();
  renderGearServices();
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

  modal.showModal();
  initCustomDropdowns(modal);
  document.getElementById('gearFormBike')?._cddRefresh?.();
  document.getElementById('gearFormCategory')?._cddRefresh?.();
}

function closeGearModal() {
  const modal = document.getElementById('gearModal');
  if (modal?.open) closeModalAnimated(modal);
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
// GEAR — BATTERY TRACKING
// ─────────────────────────────────────────────────────────────────────────────

const BATTERY_STORE_KEY = 'icu_gear_batteries';
const BATTERY_SYSTEMS = {
  sram_axs: {
    label: 'SRAM AXS',
    components: {
      rear_derailleur:       { label: 'Rear Derailleur',        ratedHours: 60,   ratedKm: null, type: 'rechargeable', chargeTime: 60  },
      front_derailleur:      { label: 'Front Derailleur',       ratedHours: 60,   ratedKm: null, type: 'rechargeable', chargeTime: 60  },
      rear_derailleur_eagle: { label: 'Rear Derailleur (Eagle)',ratedHours: 20,   ratedKm: null, type: 'rechargeable', chargeTime: 60  },
      dropper_post:          { label: 'Reverb AXS Dropper',    ratedHours: 40,   ratedKm: null, type: 'rechargeable', chargeTime: 60  },
      shifter_left:          { label: 'Left Shifter (CR2032)',  ratedHours: null, ratedKm: null, type: 'coin_cell',    lifeYears: 2   },
      shifter_right:         { label: 'Right Shifter (CR2032)', ratedHours: null, ratedKm: null, type: 'coin_cell',    lifeYears: 2   },
    }
  },
  shimano_di2: {
    label: 'Shimano Di2',
    components: {
      internal_battery: { label: 'Internal Battery (DN110/DN300)', ratedHours: null, ratedKm: 1000, type: 'rechargeable', chargeTime: 90 },
      shifter_left:     { label: 'Left Shifter (CR1632)',          ratedHours: null, ratedKm: null, type: 'coin_cell',    lifeYears: 2  },
      shifter_right:    { label: 'Right Shifter (CR1632)',         ratedHours: null, ratedKm: null, type: 'coin_cell',    lifeYears: 2  },
    }
  },
  campagnolo_eps: {
    label: 'Campagnolo EPS',
    components: {
      power_pack: { label: 'EPS Power Pack', ratedHours: null, ratedKm: 2000, type: 'rechargeable', chargeTime: 120 },
    }
  },
  other: {
    label: 'Other / Custom',
    components: {
      custom: { label: 'Custom Battery', ratedHours: 40, ratedKm: null, type: 'rechargeable', chargeTime: 60 },
    }
  }
};

function loadGearBatteries() {
  try { return JSON.parse(localStorage.getItem(BATTERY_STORE_KEY)) || []; }
  catch { return []; }
}
function saveGearBatteries(arr) {
  try { localStorage.setItem(BATTERY_STORE_KEY, JSON.stringify(arr)); } catch (e) { console.warn('localStorage.setItem failed:', e); }
}

/* ── Charge calculation ── */

function calcBatteryPercent(bat) {
  if (bat.batteryType === 'coin_cell') return calcCoinCellPercent(bat);

  const sinceDate = new Date(bat.lastChargeDate);
  if (isNaN(sinceDate.getTime())) return null;

  // Gather all activities: cached + lifetime
  const allActs = [...(state.activities || []), ...(state.lifetimeActivities || [])];
  // Deduplicate by id
  const seen = new Set();
  const acts = allActs.filter(a => {
    if (!a || !a.id || seen.has(a.id)) return false;
    seen.add(a.id);
    const aDate = new Date(a.start_date_local || a.start_date);
    if (isNaN(aDate.getTime()) || aDate <= sinceDate) return false;
    // Filter by bike if set
    if (bat.bikeId && a.gear_id && a.gear_id !== bat.bikeId) return false;
    // Only cycling activities
    const t = (a.type || '').toLowerCase();
    if (!t.includes('ride') && !t.includes('cycling') && !t.includes('ebikeride')) return false;
    return true;
  });

  if (bat.ratedLifeHours) {
    let totalH = 0;
    acts.forEach(a => {
      const s = a.moving_time || a.elapsed_time || a.icu_moving_time || 0;
      totalH += s / 3600;
    });
    const usedPct = Math.min(100, Math.round((totalH / bat.ratedLifeHours) * 100));
    return { percent: Math.max(0, 100 - usedPct), usedHours: totalH, ratedHours: bat.ratedLifeHours, count: acts.length };
  }

  if (bat.ratedLifeKm) {
    let totalKm = 0;
    acts.forEach(a => {
      const d = a.distance || a.icu_distance || 0;
      totalKm += d > 1000 ? d / 1000 : d; // handle both m and km
    });
    const usedPct = Math.min(100, Math.round((totalKm / bat.ratedLifeKm) * 100));
    return { percent: Math.max(0, 100 - usedPct), usedKm: totalKm, ratedKm: bat.ratedLifeKm, count: acts.length };
  }

  return null;
}

function calcCoinCellPercent(bat) {
  const spec = BATTERY_SYSTEMS[bat.system]?.components[bat.componentType];
  const lifeYears = spec?.lifeYears || 2;
  const lifeDays = lifeYears * 365;
  const since = new Date(bat.lastChargeDate || bat.installDate);
  if (isNaN(since.getTime())) return null;
  const elapsed = (Date.now() - since.getTime()) / (1000 * 60 * 60 * 24);
  const usedPct = Math.min(100, Math.round((elapsed / lifeDays) * 100));
  return { percent: Math.max(0, 100 - usedPct), elapsedDays: Math.round(elapsed), lifeDays, isCoinCell: true };
}

function batteryColor(pct) {
  if (pct > 50)  return 'var(--accent)';
  if (pct > 25)  return '#f0c429';
  if (pct > 10)  return '#ff6b35';
  return 'var(--red)';
}
function batteryColorClass(pct) {
  if (pct > 50)  return 'battery--green';
  if (pct > 25)  return 'battery--yellow';
  if (pct > 10)  return 'battery--orange';
  return 'battery--red';
}

/* ── Rendering ── */

function renderGearBatteries() {
  const grid = document.getElementById('gearBatteriesGrid');
  if (!grid) return;

  const all = loadGearBatteries();
  const showObsolete = document.getElementById('batteryShowObsolete')?.checked;
  const toggleEl = document.getElementById('batteryObsoleteToggle');

  // Show toggle only if there are obsolete batteries
  if (toggleEl) toggleEl.style.display = all.some(b => b.obsolete) ? '' : 'none';

  let filtered = showObsolete ? all : all.filter(b => !b.obsolete);

  // Filter by selected bike
  if (_gearSelectedBike) {
    filtered = filtered.filter(b => b.bikeId === _gearSelectedBike);
  }

  if (!filtered.length) {
    grid.innerHTML = `<div class="battery-empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36" style="opacity:.4">
        <rect x="6" y="4" width="12" height="18" rx="2"/><line x1="10" y1="1" x2="14" y2="1" stroke-width="3" stroke-linecap="round"/>
      </svg>
      <span>No batteries tracked yet</span>
    </div>`;
    return;
  }

  grid.innerHTML = filtered.map(b => batteryCard(b)).join('');
}

function batteryCard(bat) {
  const calc = calcBatteryPercent(bat);
  const pct = calc ? calc.percent : 100;
  const color = batteryColor(pct);
  const colorCls = batteryColorClass(pct);
  const isObsolete = bat.obsolete;

  // Usage stats text
  let statsText = '';
  if (calc) {
    if (calc.isCoinCell) {
      const monthsLeft = Math.max(0, Math.round((calc.lifeDays - calc.elapsedDays) / 30));
      statsText = `${calc.elapsedDays} days old · ~${monthsLeft} months remaining`;
    } else if (calc.usedHours !== undefined) {
      statsText = `${calc.usedHours.toFixed(1)}h used / ${calc.ratedHours}h rated`;
    } else if (calc.usedKm !== undefined) {
      statsText = `${Math.round(calc.usedKm)} km used / ${calc.ratedKm} km rated`;
    }
  }

  // Last charged text
  let chargeText = '';
  if (bat.lastChargeDate) {
    const d = new Date(bat.lastChargeDate);
    const days = Math.round((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
    const dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    chargeText = bat.batteryType === 'coin_cell'
      ? `Replaced: ${dateStr} (${days}d ago)`
      : `Last charged: ${dateStr} (${days}d ago)`;
  }

  // System label
  const sysLabel = BATTERY_SYSTEMS[bat.system]?.label || bat.system || '';

  // Bike name
  const bike = _gearBikeCache.find(b => b.id === bat.bikeId);
  const bikeName = bike ? bike.name : '';

  // Fill height — min 8% so the shape is always visible
  const fillH = Math.max(8, pct);
  const pctInFill = pct >= 15;

  return `<div class="battery-card ${colorCls}${isObsolete ? ' battery-card--obsolete' : ''}" data-id="${bat.id}">
    <div class="battery-shape">
      <div class="battery-terminal"></div>
      <div class="battery-body">
        <div class="battery-fill${pctInFill ? '' : ' battery-fill--low'}" style="height:${fillH}%;background:${color}">
          ${pctInFill ? `<span class="battery-pct">${pct}%</span>` : ''}
        </div>
      </div>
      ${!pctInFill ? `<span class="battery-pct-outside">${pct}%</span>` : ''}
    </div>
    <div class="battery-info">
      <div class="battery-comp-top">
        <div class="battery-name">${bat.name || 'Battery'}</div>
        <div class="gear-comp-actions">
          ${!isObsolete ? `<button class="gear-icon-btn gear-icon-btn--charge" title="${bat.batteryType === 'coin_cell' ? 'Mark replaced' : 'Mark charged'}" onclick="chargeBattery('${bat.id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          </button>` : ''}
          <button class="gear-icon-btn" title="Edit" onclick="openBatteryModal('${bat.id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
          </button>
          ${isObsolete
            ? `<button class="gear-icon-btn" title="Reactivate" onclick="reactivateBattery('${bat.id}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
              </button>
              <button class="gear-icon-btn gear-icon-btn--del" title="Delete permanently" onclick="deleteBatteryPermanent('${bat.id}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>`
            : `<button class="gear-icon-btn gear-icon-btn--del" title="Retire" onclick="retireBattery('${bat.id}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg>
              </button>`
          }
        </div>
      </div>
      <div class="battery-meta">
        ${sysLabel ? `<span class="battery-system-badge">${sysLabel}</span>` : ''}
        ${bikeName ? `<span class="gear-comp-dot">&middot;</span><span>${bikeName}</span>` : ''}
        ${isObsolete ? `<span class="gear-comp-dot">&middot;</span><span class="battery-retired-badge">Retired</span>` : ''}
      </div>
      ${statsText ? `<div class="battery-stats">${statsText}</div>` : ''}
      ${chargeText ? `<div class="battery-charge-info">${chargeText}</div>` : ''}
    </div>
  </div>`;
}

/* ── Battery Modal ── */

function openBatteryModal(editId) {
  const modal = document.getElementById('batteryModal');
  const titleEl = document.getElementById('batteryModalTitle');
  document.getElementById('batteryEditId').value = editId || '';

  // Populate system dropdown
  const sysSel = document.getElementById('batteryFormSystem');
  sysSel.innerHTML = '<option value="">— Select system —</option>' +
    Object.entries(BATTERY_SYSTEMS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');

  // Populate bike dropdown from cache
  const bikeSel = document.getElementById('batteryFormBike');
  bikeSel.innerHTML = '<option value="">— Select bike —</option>' +
    _gearBikeCache.map(b => `<option value="${b.id}">${b.name}</option>`).join('');

  // Reset component dropdown
  document.getElementById('batteryFormComponent').innerHTML = '<option value="">— Select component —</option>';

  if (editId) {
    titleEl.textContent = 'Edit Battery';
    const bat = loadGearBatteries().find(b => b.id === editId);
    if (bat) {
      bikeSel.value = bat.bikeId || '';
      sysSel.value = bat.system || '';
      onBatterySystemChange(); // populate components
      document.getElementById('batteryFormComponent').value = bat.componentType || '';
      document.getElementById('batteryFormName').value = bat.name || '';
      document.getElementById('batteryFormChargeDate').value = bat.lastChargeDate || '';
      document.getElementById('batteryFormInstallDate').value = bat.installDate || '';
      document.getElementById('batteryFormRatedHours').value = bat.ratedLifeHours || '';
      document.getElementById('batteryFormRatedKm').value = bat.ratedLifeKm || '';
      document.getElementById('batteryFormNotes').value = bat.notes || '';
      // Show correct rated field
      const spec = BATTERY_SYSTEMS[bat.system]?.components[bat.componentType];
      const useKm = spec ? (spec.ratedKm && !spec.ratedHours) : !!bat.ratedLifeKm;
      document.getElementById('batteryRatedHoursField').style.display = useKm ? 'none' : '';
      document.getElementById('batteryRatedKmField').style.display = useKm ? '' : 'none';
    }
  } else {
    titleEl.textContent = 'Add Battery';
    document.getElementById('batteryFormName').value = '';
    document.getElementById('batteryFormChargeDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('batteryFormInstallDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('batteryFormRatedHours').value = '';
    document.getElementById('batteryFormRatedKm').value = '';
    document.getElementById('batteryFormNotes').value = '';
    document.getElementById('batteryRatedHoursField').style.display = '';
    document.getElementById('batteryRatedKmField').style.display = 'none';
    // Pre-select bike if filtered
    if (_gearSelectedBike) bikeSel.value = _gearSelectedBike;
  }

  modal.showModal();
  refreshCustomDropdowns(modal);
}

function closeBatteryModal() {
  const m = document.getElementById('batteryModal');
  if (m?.open) closeModalAnimated(m);
}

function onBatterySystemChange() {
  const sysKey = document.getElementById('batteryFormSystem').value;
  const compSel = document.getElementById('batteryFormComponent');
  const sys = BATTERY_SYSTEMS[sysKey];

  if (!sys) {
    compSel.innerHTML = '<option value="">— Select component —</option>';
    return;
  }

  compSel.innerHTML = '<option value="">— Select component —</option>' +
    Object.entries(sys.components).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
}

function onBatteryComponentChange() {
  const sysKey = document.getElementById('batteryFormSystem').value;
  const compKey = document.getElementById('batteryFormComponent').value;
  const spec = BATTERY_SYSTEMS[sysKey]?.components[compKey];
  if (!spec) return;

  // Auto-fill name
  const nameEl = document.getElementById('batteryFormName');
  if (!nameEl.value) nameEl.value = spec.label;

  // Show correct rated life field and auto-fill
  const useKm = spec.ratedKm && !spec.ratedHours;
  document.getElementById('batteryRatedHoursField').style.display = useKm ? 'none' : '';
  document.getElementById('batteryRatedKmField').style.display = useKm ? '' : 'none';

  if (spec.ratedHours) document.getElementById('batteryFormRatedHours').value = spec.ratedHours;
  if (spec.ratedKm) document.getElementById('batteryFormRatedKm').value = spec.ratedKm;
}

function submitBatteryForm() {
  const name = document.getElementById('batteryFormName').value.trim();
  const system = document.getElementById('batteryFormSystem').value;
  if (!name) { showToast('Please enter a display name', 'error'); return; }
  if (!system) { showToast('Please select a system', 'error'); return; }

  const editId = document.getElementById('batteryEditId').value;
  const spec = BATTERY_SYSTEMS[system]?.components[document.getElementById('batteryFormComponent').value];

  const bat = {
    id:             editId || ('bat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)),
    bikeId:         document.getElementById('batteryFormBike').value,
    system:         system,
    componentType:  document.getElementById('batteryFormComponent').value,
    name:           name,
    lastChargeDate: document.getElementById('batteryFormChargeDate').value,
    installDate:    document.getElementById('batteryFormInstallDate').value,
    ratedLifeHours: parseFloat(document.getElementById('batteryFormRatedHours').value) || null,
    ratedLifeKm:    parseFloat(document.getElementById('batteryFormRatedKm').value) || null,
    batteryType:    spec?.type || 'rechargeable',
    notes:          document.getElementById('batteryFormNotes').value.trim(),
    obsolete:       false,
    obsoleteDate:   null,
  };

  const all = loadGearBatteries();
  const idx = all.findIndex(b => b.id === editId);
  if (idx >= 0) {
    bat.obsolete = all[idx].obsolete;
    bat.obsoleteDate = all[idx].obsoleteDate;
    all[idx] = bat;
  } else {
    all.push(bat);
  }

  saveGearBatteries(all);
  closeBatteryModal();
  renderGearBatteries();
  showToast(editId ? 'Battery updated' : 'Battery added', 'success');
}

/* ── Battery actions ── */

function chargeBattery(id) {
  const all = loadGearBatteries();
  const bat = all.find(b => b.id === id);
  if (!bat) return;
  bat.lastChargeDate = new Date().toISOString().split('T')[0];
  saveGearBatteries(all);
  renderGearBatteries();
  showToast(bat.batteryType === 'coin_cell' ? 'Battery marked as replaced' : 'Battery marked as charged', 'success');
}

function retireBattery(id) {
  if (!confirm('Retire this battery? It will be hidden but kept in history.')) return;
  const all = loadGearBatteries();
  const bat = all.find(b => b.id === id);
  if (!bat) return;
  bat.obsolete = true;
  bat.obsoleteDate = new Date().toISOString().split('T')[0];
  saveGearBatteries(all);
  renderGearBatteries();
  showToast('Battery retired', 'info');
}

function reactivateBattery(id) {
  const all = loadGearBatteries();
  const bat = all.find(b => b.id === id);
  if (!bat) return;
  bat.obsolete = false;
  bat.obsoleteDate = null;
  saveGearBatteries(all);
  renderGearBatteries();
  showToast('Battery reactivated', 'success');
}

function deleteBatteryPermanent(id) {
  if (!confirm('Permanently delete this battery? This cannot be undone.')) return;
  const all = loadGearBatteries().filter(b => b.id !== id);
  saveGearBatteries(all);
  renderGearBatteries();
  showToast('Battery deleted', 'info');
}

// ─────────────────────────────────────────────────────────────────────────────
// GEAR — BIKE SERVICE TRACKING
// ─────────────────────────────────────────────────────────────────────────────

const SERVICE_STORE_KEY = 'icu_gear_services';
const SERVICE_SHOP_STORE_KEY = 'icu_gear_service_shops';

function loadGearServices()   { try { return JSON.parse(localStorage.getItem(SERVICE_STORE_KEY)) || []; } catch { return []; } }
function saveGearServices(arr) { try { localStorage.setItem(SERVICE_STORE_KEY, JSON.stringify(arr)); } catch { showToast('Storage limit reached', 'error'); } }
function loadServiceShops()   { try { return JSON.parse(localStorage.getItem(SERVICE_SHOP_STORE_KEY)) || []; } catch { return []; } }
function saveServiceShops(arr) { try { localStorage.setItem(SERVICE_SHOP_STORE_KEY, JSON.stringify(arr)); } catch { showToast('Storage limit reached', 'error'); } }

// ── Resolve shop name & phone for a service record ──────────────────────────
function _resolveShop(svc) {
  if (svc.shopId) {
    const shop = loadServiceShops().find(s => s.id === svc.shopId);
    if (shop) return { name: shop.name, phone: shop.phone, address: shop.address };
  }
  return { name: svc.shopNameOverride || '', phone: svc.phoneOverride || '', address: '' };
}

// ── Calculate next-service progress ─────────────────────────────────────────
function calcServiceProgress(svc) {
  if (!svc.nextServiceMode) return null;
  let pct = 0, label = '', used = 0, target = 0, unit = '';
  if (svc.nextServiceMode === 'km') {
    const bike = _gearBikeCache.find(b => b.id === svc.bikeId);
    const currentKm = bike ? bike.km : 0;
    used = Math.max(0, currentKm - (svc.bikeKmAtService || 0));
    target = svc.nextServiceKm || 0;
    unit = 'km';
  } else if (svc.nextServiceMode === 'months') {
    const sDate = new Date(svc.serviceDate);
    const now = new Date();
    used = (now.getFullYear() - sDate.getFullYear()) * 12 + (now.getMonth() - sDate.getMonth());
    target = svc.nextServiceMonths || 0;
    unit = 'mo';
  }
  if (target <= 0) return null;
  pct = Math.min(100, Math.round(used / target * 100));
  const warn = pct >= 75;
  const overdue = pct >= 100;
  if (overdue) label = 'Service Due';
  else if (warn) label = 'Soon';
  else label = pct + '%';
  return { pct, label, warn, overdue, used: Math.round(used), target, unit };
}

// ── Service card HTML ───────────────────────────────────────────────────────
function serviceCard(bikeId, services) {
  const bike = _gearBikeCache.find(b => b.id === bikeId);
  const bikeName = bike ? bike.name : 'Unknown Bike';
  // Sort newest first
  const sorted = [...services].sort((a, b) => (b.serviceDate || '').localeCompare(a.serviceDate || ''));
  const latest = sorted[0];
  if (!latest) return '';

  const shop = _resolveShop(latest);
  const dateStr = latest.serviceDate ? new Date(latest.serviceDate + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const phoneHref = shop.phone ? shop.phone.replace(/[\s\-()]/g, '') : '';
  const prog = calcServiceProgress(latest);

  let cardClass = 'service-card';
  if (prog?.overdue) cardClass += ' service-card--overdue';
  else if (prog?.warn) cardClass += ' service-card--warn';

  const editSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>`;
  const histSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`;
  const plusSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;

  let barHtml = '';
  if (prog) {
    const color = prog.overdue ? 'var(--red)' : prog.warn ? '#f97316' : 'var(--accent)';
    const lblClass = prog.overdue ? ' gear-comp-bar-label--red' : prog.warn ? ' gear-comp-bar-label--warn' : '';
    barHtml = `
      <div class="service-card-km">${prog.used.toLocaleString()} ${prog.unit} since last service / ${prog.target.toLocaleString()} ${prog.unit}</div>
      <div class="gear-comp-bar-wrap">
        <div class="gear-comp-bar-track">
          <div class="gear-comp-bar-fill" style="width:${prog.pct}%;background:${color}"></div>
        </div>
        <span class="gear-comp-bar-label${lblClass}">${prog.overdue ? '&#9888; ' : prog.warn ? '&#9888; ' : ''}${prog.label}</span>
      </div>`;
  }

  return `
    <div class="${cardClass}">
      <div class="service-card-top">
        <div class="service-card-name">${bikeName}</div>
        <div class="gear-comp-actions">
          <button class="gear-icon-btn" title="Add service" onclick="openServiceModal(null,'${bikeId}')">${plusSvg}</button>
          <button class="gear-icon-btn" title="Edit last service" onclick="openServiceModal('${latest.id}')">${editSvg}</button>
          <button class="gear-icon-btn" title="Service history" onclick="openServiceHistory('${bikeId}')">${histSvg}</button>
        </div>
      </div>
      <div class="service-card-meta">
        <span>${dateStr}</span>
        ${shop.name ? `<span class="gear-comp-dot">&middot;</span><span>${shop.name}</span>` : ''}
        ${shop.phone ? `<span class="gear-comp-dot">&middot;</span><a href="tel:${phoneHref}" class="service-phone-link">${shop.phone}</a>` : ''}
      </div>
      <div class="service-card-work">${latest.workDone || ''}</div>
      ${latest.cost ? `<div class="service-card-cost">&euro;${Number(latest.cost).toFixed(2)}</div>` : ''}
      ${latest.notes ? `<div class="service-card-notes">${latest.notes}</div>` : ''}
      ${barHtml}
      ${sorted.length > 1 ? `<div style="font-size:var(--text-xs);color:var(--text-muted);margin-top:4px">${sorted.length - 1} previous service${sorted.length > 2 ? 's' : ''}</div>` : ''}
    </div>`;
}

// ── Render service section ──────────────────────────────────────────────────
function renderGearServices() {
  const grid  = document.getElementById('gearServiceGrid');
  const title = document.getElementById('gearServiceTitle');
  const sub   = document.getElementById('gearServiceSub');
  if (!grid) return;

  const all = loadGearServices();
  const filtered = _gearSelectedBike
    ? all.filter(s => s.bikeId === _gearSelectedBike)
    : all;

  if (title) {
    const bike = _gearBikeCache.find(b => b.id === _gearSelectedBike);
    title.textContent = bike ? `${bike.name} — Service` : 'Bike Service';
  }
  if (sub) {
    sub.textContent = filtered.length
      ? `${filtered.length} service record${filtered.length > 1 ? 's' : ''}`
      : 'Track servicing history and upcoming maintenance';
  }

  if (!filtered.length) {
    grid.innerHTML = `
      <div class="service-empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40" style="opacity:.4">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
        </svg>
        <div>No services tracked yet</div>
        <button class="btn btn-primary btn-sm" onclick="openServiceModal()">Add First Service</button>
      </div>`;
    return;
  }

  // Group by bikeId
  const grouped = {};
  filtered.forEach(s => {
    if (!grouped[s.bikeId]) grouped[s.bikeId] = [];
    grouped[s.bikeId].push(s);
  });

  grid.innerHTML = Object.entries(grouped).map(([bid, svcs]) => serviceCard(bid, svcs)).join('');
}

// ── Service Modal ───────────────────────────────────────────────────────────
function openServiceModal(editId, presetBikeId) {
  const modal = document.getElementById('serviceModal');
  if (!modal) return;

  // Reset form
  document.getElementById('serviceEditId').value = '';
  document.getElementById('serviceFormBike').value = '';
  document.getElementById('serviceFormShop').value = '';
  document.getElementById('serviceFormShopName').value = '';
  document.getElementById('serviceFormShopPhone').value = '';
  document.getElementById('serviceFormDate').value = new Date().toISOString().slice(0, 10);
  document.getElementById('serviceFormCost').value = '';
  document.getElementById('serviceFormWork').value = '';
  document.getElementById('serviceFormNotes').value = '';
  document.getElementById('serviceFormNextMode').value = '';
  document.getElementById('serviceFormNextKm').value = '';
  document.getElementById('serviceFormNextMonths').value = '';
  document.getElementById('serviceNextKmField').style.display = 'none';
  document.getElementById('serviceNextMonthsField').style.display = 'none';

  // Populate bike select
  const bikeSelect = document.getElementById('serviceFormBike');
  bikeSelect.innerHTML = '<option value="">— Select bike —</option>' +
    _gearBikeCache.map(b => `<option value="${b.id}">${b.name}</option>`).join('');

  // Populate shop select
  const shops = loadServiceShops();
  const shopSelect = document.getElementById('serviceFormShop');
  shopSelect.innerHTML = '<option value="">— Select or enter below —</option>' +
    shops.map(s => `<option value="${s.id}">${s.name}</option>`).join('') +
    '<option value="__new__">+ Add New Shop…</option>';

  // Show inline shop fields by default
  document.getElementById('serviceShopNameField').style.display = '';
  document.getElementById('serviceShopPhoneField').style.display = '';

  // Pre-select bike
  if (presetBikeId) bikeSelect.value = presetBikeId;
  else if (_gearSelectedBike) bikeSelect.value = _gearSelectedBike;

  // Title
  document.getElementById('serviceModalTitle').textContent = editId ? 'Edit Service' : 'Add Service';

  // If editing, populate fields
  if (editId) {
    const svc = loadGearServices().find(s => s.id === editId);
    if (svc) {
      document.getElementById('serviceEditId').value = svc.id;
      bikeSelect.value = svc.bikeId || '';
      if (svc.shopId) {
        shopSelect.value = svc.shopId;
        document.getElementById('serviceShopNameField').style.display = 'none';
        document.getElementById('serviceShopPhoneField').style.display = 'none';
      } else {
        shopSelect.value = svc.shopNameOverride ? '__new__' : '';
        document.getElementById('serviceFormShopName').value = svc.shopNameOverride || '';
        document.getElementById('serviceFormShopPhone').value = svc.phoneOverride || '';
      }
      document.getElementById('serviceFormDate').value = svc.serviceDate || '';
      document.getElementById('serviceFormCost').value = svc.cost || '';
      document.getElementById('serviceFormWork').value = svc.workDone || '';
      document.getElementById('serviceFormNotes').value = svc.notes || '';
      document.getElementById('serviceFormNextMode').value = svc.nextServiceMode || '';
      if (svc.nextServiceMode === 'km') {
        document.getElementById('serviceNextKmField').style.display = '';
        document.getElementById('serviceFormNextKm').value = svc.nextServiceKm || '';
      } else if (svc.nextServiceMode === 'months') {
        document.getElementById('serviceNextMonthsField').style.display = '';
        document.getElementById('serviceFormNextMonths').value = svc.nextServiceMonths || '';
      }
    }
  }

  modal.showModal();
  if (typeof initCustomDropdowns === 'function') initCustomDropdowns(modal);
}

function closeServiceModal() {
  const m = document.getElementById('serviceModal');
  if (m?.open) closeModalAnimated(m);
}

function onServiceShopChange() {
  const val = document.getElementById('serviceFormShop').value;
  const showInline = !val || val === '__new__';
  document.getElementById('serviceShopNameField').style.display = showInline ? '' : 'none';
  document.getElementById('serviceShopPhoneField').style.display = showInline ? '' : 'none';
  if (!showInline) {
    // Auto-fill inline fields from saved shop for reference
    const shop = loadServiceShops().find(s => s.id === val);
    if (shop) {
      document.getElementById('serviceFormShopName').value = shop.name;
      document.getElementById('serviceFormShopPhone').value = shop.phone || '';
    }
  }
}

function onServiceNextModeChange() {
  const mode = document.getElementById('serviceFormNextMode').value;
  document.getElementById('serviceNextKmField').style.display = mode === 'km' ? '' : 'none';
  document.getElementById('serviceNextMonthsField').style.display = mode === 'months' ? '' : 'none';
}

function submitServiceForm() {
  const bikeId = document.getElementById('serviceFormBike').value;
  const workDone = document.getElementById('serviceFormWork').value.trim();
  if (!bikeId) { showToast('Please select a bike', 'error'); return; }
  if (!workDone) { showToast('Please describe the work performed', 'error'); return; }

  const editId = document.getElementById('serviceEditId').value;
  const shopVal = document.getElementById('serviceFormShop').value;
  let shopId = '', shopNameOverride = '', phoneOverride = '';

  if (shopVal && shopVal !== '__new__') {
    shopId = shopVal;
  } else {
    shopNameOverride = document.getElementById('serviceFormShopName').value.trim();
    phoneOverride = document.getElementById('serviceFormShopPhone').value.trim();
    // If new shop name provided, save it for future reuse
    if (shopNameOverride && shopVal === '__new__') {
      const shops = loadServiceShops();
      const newShop = {
        id: 'shop_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        name: shopNameOverride,
        phone: phoneOverride,
        address: ''
      };
      shops.push(newShop);
      saveServiceShops(shops);
      shopId = newShop.id;
      shopNameOverride = '';
      phoneOverride = '';
    }
  }

  const nextMode = document.getElementById('serviceFormNextMode').value;
  const bike = _gearBikeCache.find(b => b.id === bikeId);

  const svc = {
    id: editId || ('svc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)),
    bikeId,
    shopId,
    shopNameOverride,
    phoneOverride,
    serviceDate: document.getElementById('serviceFormDate').value,
    workDone,
    cost: parseFloat(document.getElementById('serviceFormCost').value) || null,
    notes: document.getElementById('serviceFormNotes').value.trim(),
    nextServiceMode: nextMode || '',
    nextServiceKm: nextMode === 'km' ? (parseInt(document.getElementById('serviceFormNextKm').value) || null) : null,
    nextServiceMonths: nextMode === 'months' ? (parseInt(document.getElementById('serviceFormNextMonths').value) || null) : null,
    bikeKmAtService: bike ? bike.km : 0
  };

  const all = loadGearServices();
  if (editId) {
    const idx = all.findIndex(s => s.id === editId);
    if (idx >= 0) {
      // Preserve original bikeKmAtService when editing unless bike changed
      if (all[idx].bikeId === svc.bikeId) svc.bikeKmAtService = all[idx].bikeKmAtService;
      all[idx] = svc;
    } else all.push(svc);
  } else {
    all.push(svc);
  }

  saveGearServices(all);
  closeServiceModal();
  renderGearServices();
  showToast(editId ? 'Service updated' : 'Service recorded', 'success');
}

// ── Service Shop Management ─────────────────────────────────────────────────
function openServiceShopModal() {
  const modal = document.getElementById('serviceShopModal');
  if (!modal) return;
  document.getElementById('shopEditId').value = '';
  document.getElementById('shopFormName').value = '';
  document.getElementById('shopFormPhone').value = '';
  document.getElementById('shopFormAddress').value = '';
  renderServiceShopList();
  modal.showModal();
}

function closeServiceShopModal() {
  const m = document.getElementById('serviceShopModal');
  if (m?.open) closeModalAnimated(m);
}

function renderServiceShopList() {
  const container = document.getElementById('serviceShopList');
  if (!container) return;
  const shops = loadServiceShops();
  if (!shops.length) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:var(--text-sm);padding:8px 0">No shops saved yet.</div>';
    return;
  }
  const editSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>`;
  const delSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
  container.innerHTML = shops.map(s => {
    const phoneHref = s.phone ? s.phone.replace(/[\s\-()]/g, '') : '';
    return `
      <div class="service-shop-item">
        <div class="service-shop-info">
          <div class="service-shop-name">${s.name}</div>
          <div class="service-shop-detail">
            ${s.phone ? `<a href="tel:${phoneHref}" class="service-phone-link">${s.phone}</a>` : ''}
            ${s.address ? `${s.phone ? ' &middot; ' : ''}${s.address}` : ''}
            ${!s.phone && !s.address ? 'No details' : ''}
          </div>
        </div>
        <div class="gear-comp-actions">
          <button class="gear-icon-btn" title="Edit" onclick="editServiceShop('${s.id}')">${editSvg}</button>
          <button class="gear-icon-btn gear-icon-btn--del" title="Delete" onclick="deleteServiceShop('${s.id}')">${delSvg}</button>
        </div>
      </div>`;
  }).join('');
}

function editServiceShop(id) {
  const shop = loadServiceShops().find(s => s.id === id);
  if (!shop) return;
  document.getElementById('shopEditId').value = shop.id;
  document.getElementById('shopFormName').value = shop.name;
  document.getElementById('shopFormPhone').value = shop.phone || '';
  document.getElementById('shopFormAddress').value = shop.address || '';
}

function saveServiceShop() {
  const name = document.getElementById('shopFormName').value.trim();
  if (!name) { showToast('Shop name is required', 'error'); return; }
  const editId = document.getElementById('shopEditId').value;
  const shops = loadServiceShops();
  const shop = {
    id: editId || ('shop_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)),
    name,
    phone: document.getElementById('shopFormPhone').value.trim(),
    address: document.getElementById('shopFormAddress').value.trim()
  };
  if (editId) {
    const idx = shops.findIndex(s => s.id === editId);
    if (idx >= 0) shops[idx] = shop; else shops.push(shop);
  } else {
    shops.push(shop);
  }
  saveServiceShops(shops);
  document.getElementById('shopEditId').value = '';
  document.getElementById('shopFormName').value = '';
  document.getElementById('shopFormPhone').value = '';
  document.getElementById('shopFormAddress').value = '';
  renderServiceShopList();
  showToast(editId ? 'Shop updated' : 'Shop saved', 'success');
}

function deleteServiceShop(id) {
  if (!confirm('Delete this shop?')) return;
  const shops = loadServiceShops().filter(s => s.id !== id);
  saveServiceShops(shops);
  renderServiceShopList();
  showToast('Shop deleted', 'info');
}

// ── Service History Modal ───────────────────────────────────────────────────
function openServiceHistory(bikeId) {
  const modal = document.getElementById('serviceHistoryModal');
  if (!modal) return;
  const bike = _gearBikeCache.find(b => b.id === bikeId);
  document.getElementById('serviceHistoryDesc').textContent = bike ? `All services for ${bike.name}` : 'All services for this bike';
  renderServiceHistoryList(bikeId);
  modal.showModal();
}

function closeServiceHistory() {
  const m = document.getElementById('serviceHistoryModal');
  if (m?.open) closeModalAnimated(m);
}

function renderServiceHistoryList(bikeId) {
  const container = document.getElementById('serviceHistoryList');
  if (!container) return;
  const all = loadGearServices().filter(s => s.bikeId === bikeId)
    .sort((a, b) => (b.serviceDate || '').localeCompare(a.serviceDate || ''));

  if (!all.length) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:var(--text-sm);padding:16px 0;text-align:center">No service history.</div>';
    return;
  }

  const totalCost = all.reduce((sum, s) => sum + (s.cost || 0), 0);
  const editSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>`;
  const delSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;

  const summaryHtml = `
    <div class="service-history-summary">
      <span><strong>${all.length}</strong> service${all.length > 1 ? 's' : ''}</span>
      ${totalCost > 0 ? `<span>Total: <strong>&euro;${totalCost.toFixed(2)}</strong></span>` : ''}
    </div>`;

  const itemsHtml = all.map(svc => {
    const shop = _resolveShop(svc);
    const dateStr = svc.serviceDate ? new Date(svc.serviceDate + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
    const phoneHref = shop.phone ? shop.phone.replace(/[\s\-()]/g, '') : '';
    return `
      <div class="service-history-item">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div class="service-history-date">${dateStr}</div>
          <div class="service-history-actions">
            <button class="gear-icon-btn" title="Edit" onclick="closeServiceHistory();openServiceModal('${svc.id}')">${editSvg}</button>
            <button class="gear-icon-btn gear-icon-btn--del" title="Delete" onclick="deleteServiceFromHistory('${svc.id}','${bikeId}')">${delSvg}</button>
          </div>
        </div>
        ${shop.name ? `<div class="service-history-shop">${shop.name}${shop.phone ? ` &middot; <a href="tel:${phoneHref}" class="service-phone-link">${shop.phone}</a>` : ''}</div>` : ''}
        <div class="service-history-work">${svc.workDone || ''}</div>
        <div class="service-history-meta">
          ${svc.cost ? `<span>&euro;${Number(svc.cost).toFixed(2)}</span>` : ''}
          ${svc.notes ? `<span>${svc.notes}</span>` : ''}
          ${svc.bikeKmAtService ? `<span>@ ${Math.round(svc.bikeKmAtService).toLocaleString()} km</span>` : ''}
        </div>
      </div>`;
  }).join('');

  container.innerHTML = summaryHtml + itemsHtml;
}

function deleteServiceFromHistory(id, bikeId) {
  if (!confirm('Delete this service record?')) return;
  const all = loadGearServices().filter(s => s.id !== id);
  saveGearServices(all);
  renderServiceHistoryList(bikeId);
  renderGearServices();
  showToast('Service deleted', 'info');
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
      { label: '< 2.5', desc: 'Beginner', pct: 20, color: 'var(--text-muted)' },
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
  try { localStorage.setItem('icu_dash_sections', JSON.stringify(prefs)); } catch (e) { console.warn('localStorage.setItem failed:', e); }
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

// ── Activity detail section visibility toggles ───────────────────────────────
const ACT_DETAIL_SECTIONS = [
  { key: 'map',         label: 'Route Map',              cardId: 'detailMapCard' },
  { key: 'streams',     label: 'Activity Streams',       cardId: 'detailStreamsCard' },
  { key: 'charts',      label: 'Power & HR Charts',      cardId: 'detailChartsRow' },
  { key: 'performance', label: 'Performance Analysis',    cardId: 'detailPerfCard' },
  { key: 'decoupling',  label: 'Aerobic Decoupling',     cardId: 'detailDecoupleCard' },
  { key: 'lrbalance',   label: 'L/R Power Balance',      cardId: 'detailLRBalanceCard' },
  { key: 'powerZones',  label: 'Power Zones',            cardId: 'detailZonesCard' },
  { key: 'hrZones',     label: 'HR Zones',               cardId: 'detailHRZonesCard' },
  { key: 'intervals',   label: 'Intervals',              cardId: 'detailIntervalsCard' },
  { key: 'lapSplits',   label: 'Lap Splits',             cardId: 'detailLapSplitsCard' },
  { key: 'powerCurve',  label: 'Power Curve',            cardId: 'detailCurveCard' },
  { key: 'hrCurve',     label: 'Heart Rate Curve',       cardId: 'detailHRCurveCard' },
  { key: 'gradient',    label: 'Elevation Profile',      cardId: 'detailGradientCard' },
  { key: 'climbs',      label: 'Climbs',                 cardId: 'detailClimbsCard' },
  { key: 'cadence',     label: 'Cadence Distribution',   cardId: 'detailCadenceCard' },
  { key: 'histogram',   label: 'Power Distribution',     cardId: 'detailHistogramCard' },
  { key: 'temperature', label: 'Temperature',            cardId: 'detailTempCard' },
  { key: 'weather',     label: 'Weather Conditions',     cardId: 'detailWeatherCard' },
  { key: 'compare',     label: 'How You Compare',        cardId: 'detailCompareCard' },
  { key: 'notes',       label: 'Notes',                  cardId: 'detailNotesCard' },
  { key: 'export',      label: 'Export',                 cardId: 'detailExportButtons' },
];

function loadActSectionPrefs() {
  try { const r = localStorage.getItem('icu_act_sections'); return r ? JSON.parse(r) : {}; }
  catch(e) { return {}; }
}
function saveActSectionPref(key, visible) {
  const prefs = loadActSectionPrefs();
  prefs[key] = visible;
  try { localStorage.setItem('icu_act_sections', JSON.stringify(prefs)); } catch(e) {}
}
function isActSectionVisible(key) {
  const prefs = loadActSectionPrefs();
  if (prefs[key] !== undefined) return prefs[key];
  return true; // all default on
}
function applyActSectionVisibility() {
  for (const sec of ACT_DETAIL_SECTIONS) {
    const el = document.getElementById(sec.cardId);
    if (el) el.classList.toggle('act-hidden', !isActSectionVisible(sec.key));
  }
}
function renderActSectionToggles() {
  const container = document.getElementById('actSectionToggles');
  if (!container) return;
  container.innerHTML = '';
  for (const sec of ACT_DETAIL_SECTIONS) {
    const on = isActSectionVisible(sec.key);
    const row = document.createElement('div');
    row.className = 'stt-row stt-row--toggle';
    row.innerHTML = `
      <div class="stt-row-info">
        <div class="stt-row-label">${sec.label}</div>
      </div>
      <label class="settings-ios-toggle">
        <input type="checkbox" ${on ? 'checked' : ''} data-act-toggle="${sec.key}">
        <span class="settings-ios-slider"></span>
      </label>`;
    const cb = row.querySelector('input');
    cb.addEventListener('change', () => {
      saveActSectionPref(sec.key, cb.checked);
      applyActSectionVisibility();
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
function saveGoals(goals) { try { localStorage.setItem('icu_goals', JSON.stringify(goals)); } catch (e) { console.warn('localStorage.setItem failed:', e); } }

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
        <select id="goalFormMetric" class="app-select">
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
        <select id="goalFormPeriod" class="app-select">
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

  // Section divider between streaks and goals
  const sectionDivider = `<div class="goals-section-divider">
    <div class="card-title" style="margin-bottom:4px">Training Goals</div>
    <div class="card-subtitle">Set targets and track your progress</div>
  </div>`;

  if (!goals.length) {
    container.innerHTML = sectionDivider + `
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
  let html = sectionDivider + `<div class="goals-header">
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
  initCustomDropdowns(overlay);
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
      metricEl._cddRefresh?.();
      periodEl._cddRefresh?.();
      return;
    }
  }
  titleEl.textContent = 'Add Goal';
  idEl.value = '';
  metricEl.value = 'distance';
  targetEl.value = '';
  periodEl.value = 'week';
  metricEl._cddRefresh?.();
  periodEl._cddRefresh?.();
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
  const section   = document.getElementById('goalsDashSection');
  if (!container) return;
  const goals = loadGoals();
  if (!goals.length) { if (section) section.style.display = 'none'; return; }
  if (section) section.style.display = '';

  const periodLabel = { week: 'This Week', month: 'This Month', year: 'This Year' };
  const statusLabel = { ahead: 'Ahead', 'on-track': 'On Track', caution: 'Caution', behind: 'Behind' };
  const statusCls   = { ahead: 'green', 'on-track': 'green', caution: 'yellow', behind: 'red' };
  let html = '';

  goals.forEach(goal => {
    const m = GOAL_METRICS[goal.metric];
    if (!m) return;
    const p = computeGoalProgress(goal);

    html += `
    <div class="goal-dash-card card" onclick="navigate('goals')">
      <div class="goal-dash-top">
        <div class="goal-metric-icon ${m.icon}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <circle cx="12" cy="12" r="10"/><path d="M12 8v4l2 2"/>
          </svg>
        </div>
        <div class="goal-dash-info">
          <div class="goal-dash-title">${m.label}</div>
          <div class="goal-dash-period">${periodLabel[goal.period]} · ${p.remaining}d left</div>
        </div>
      </div>
      <div class="goal-dash-progress">
        <div class="goal-progress-bar-wrap">
          <div class="goal-progress-bar goal-progress-bar--${statusCls[p.status]}" style="width:${p.pct.toFixed(1)}%"></div>
          <div class="goal-progress-expected" style="left:${Math.min(p.elapsed / p.totalDays * 100, 100).toFixed(1)}%"></div>
        </div>
        <div class="goal-dash-stats">
          <span class="goal-dash-value">${m.fmt(p.current)} / ${m.fmt(p.target)} ${m.unit}</span>
          <span class="goal-progress-badge goal-progress-badge--${statusCls[p.status]}">${statusLabel[p.status]}</span>
        </div>
        <div class="goal-dash-pct">${Math.round(p.pct)}% complete</div>
      </div>
    </div>`;
  });

  container.innerHTML = html;
}

// ========================== COMPARE PAGE FUNCTIONS ==========================

// Compare page state
const _compare = {
  periodDays: 28,
  grouping: 'week',  // week, biweek, month
  chartType: 'bar',  // bar or line
  cards: [],  // Array of {id, metric, chart}
  nextCardId: 0,
  _cachedPeriods: null,  // { key, current, previous }
  activeTab: 'trends',   // 'trends' | 'h2h'
  h2hActivities: [],     // selected activities for head-to-head
};

/** Return cached { current, previous } period aggregations, recomputing only when inputs change. */
function _cmpPeriods() {
  const key = _compare.periodDays + '|' + _compare.grouping + '|' + (state.activities?.length || 0);
  if (_compare._cachedPeriods && _compare._cachedPeriods.key === key) return _compare._cachedPeriods;
  const currentEnd = new Date();
  const currentStart = daysAgo(_compare.periodDays);
  const prevEnd = new Date(currentStart);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - _compare.periodDays);
  const current = aggregateDataForComparison(currentStart, currentEnd, _compare.grouping);
  const previous = aggregateDataForComparison(prevStart, prevEnd, _compare.grouping);
  _compare._cachedPeriods = { key, current, previous };
  return _compare._cachedPeriods;
}

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
  const card = { id: cardId, metric: metric, chartType: _compare.chartType, chart: null };
  _compare.cards.push(card);

  document.getElementById('compareEmptyState').style.display = 'none';
  const container = document.getElementById('compareMetricsContainer');
  container.insertAdjacentHTML('beforeend', _compareCardHTML(card));

  // Upgrade selects on the new card only
  const newCardEl = container.querySelector(`.compare-metric-card[data-card-id="${cardId}"]`);
  if (newCardEl) refreshCustomDropdowns(newCardEl);

  // Generate chart + stats only for the new card using cached aggregation
  const p = _cmpPeriods();
  generateCompareChartForCard(cardId, p.current, p.previous, metric, card.chartType, true);
  generateCompareStatsForCard(cardId, p.current, p.previous, metric);

  if (newCardEl) setTimeout(() => newCardEl.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
}

function removeCompareCard(cardId) {
  const card = _compare.cards.find(c => c.id === cardId);
  if (card && card.chart) card.chart = destroyChart(card.chart);
  _compare.cards = _compare.cards.filter(c => c.id !== cardId);

  // Remove only this card's DOM element
  const cardEl = document.querySelector(`.compare-metric-card[data-card-id="${cardId}"]`);
  if (cardEl) cardEl.remove();

  if (_compare.cards.length === 0) {
    document.getElementById('compareEmptyState').style.display = 'block';
  }
}

function setComparePeriod(days) {
  _compare.periodDays = days;
  document.querySelectorAll('.compare-range-pills button').forEach(b => b.classList.remove('active'));
  event?.target?.classList.add('active');
  updateComparePage(new Set());
}

function setCompareCardChartType(cardId, type) {
  const card = _compare.cards.find(c => c.id === cardId);
  if (!card) return;
  card.chartType = type;
  const cardEl = document.querySelector(`.compare-metric-card[data-card-id="${cardId}"]`);
  if (cardEl) {
    cardEl.querySelectorAll('.compare-chart-type-toggle button').forEach(b => b.classList.remove('active'));
    if (type === 'bar') {
      cardEl.querySelector('.compareBarBtn')?.classList.add('active');
    } else {
      cardEl.querySelector('.compareLineBtn')?.classList.add('active');
    }
  }
  // Re-render only this card's chart using cached aggregation
  const p = _cmpPeriods();
  generateCompareChartForCard(cardId, p.current, p.previous, card.metric, type);
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

function generateCompareChartForCard(cardId, currentPeriods, previousPeriods, metric, chartType, animate = true) {
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
      animation: animate ? undefined : false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: C_CLR_MUTED, font: { size: 12 } } },
        tooltip: { ...C_TOOLTIP }
      },
      scales: cScales({ xGrid: false, yExtra: { maxTicksLimit: 6 } })
    }
  };

  card.chart = destroyChart(card.chart);
  card.chart = new Chart(ctx, config);
}

function _cmpFmtVal(v, metric) {
  const units = {
    distance: ' km', time: ' hrs', elevation: ' m', power: ' w',
    heartrate: ' bpm', tss: '', ctl: '', atl: '', tsb: '', count: ''
  };
  const decimals = { distance: 1, time: 1, elevation: 0, power: 0, heartrate: 0,
    tss: 0, ctl: 1, atl: 1, tsb: 1, count: 0 };
  const d = decimals[metric] != null ? decimals[metric] : 2;
  const unit = units[metric] || '';
  return (typeof v === 'number' ? v.toFixed(d) : parseFloat(v).toFixed(d)) + unit;
}

function generateCompareStatsForCard(cardId, currentPeriods, previousPeriods, metric) {
  const currentValues = currentPeriods.map(p => p.data[metric] || 0);
  const previousValues = previousPeriods.map(p => p.data[metric] || 0);

  const currentSum = currentValues.reduce((a, b) => a + b, 0);
  const previousSum = previousValues.reduce((a, b) => a + b, 0);
  const currentAvg = currentValues.length ? currentSum / currentValues.length : 0;
  const previousAvg = previousValues.length ? previousSum / previousValues.length : 0;

  const change = previousSum > 0 ? (((currentSum - previousSum) / previousSum) * 100).toFixed(1) : 0;
  const changeClass = change > 0 ? 'stat-positive' : (change < 0 ? 'stat-negative' : '');

  let html = '<div class="compare-card-stats-summary">';
  html += `<div class="stat-item"><span>Total</span><strong>${_cmpFmtVal(currentSum, metric)}</strong><span class="stat-prev">(${_cmpFmtVal(previousSum, metric)})</span></div>`;
  html += `<div class="stat-item"><span>Average</span><strong>${_cmpFmtVal(currentAvg, metric)}</strong><span class="stat-prev">(${_cmpFmtVal(previousAvg, metric)})</span></div>`;
  html += `<div class="stat-item"><span>Change</span><strong class="${changeClass}">${change > 0 ? '+' : ''}${change}%</strong></div>`;
  html += '</div>';

  document.getElementById(`compareStats${cardId}`).innerHTML = html;
}

function _compareCardHTML(card) {
  const metricOptions = getMetricOptions();
  return `
    <div class="compare-metric-card" data-card-id="${card.id}">
      <div class="compare-metric-header">
        <select class="app-select compare-card-metric-select" onchange="updateCompareCardMetric(${card.id}, this.value)">
          ${Object.entries(metricOptions).map(([value, label]) =>
            `<option value="${value}" ${card.metric === value ? 'selected' : ''}>${label}</option>`
          ).join('')}
        </select>
        <button class="compare-card-remove" onclick="removeCompareCard(${card.id})">✕</button>
      </div>
      <div class="compare-metric-content">
        <div class="compare-chart-wrapper">
          <div class="compare-chart-type-toggle">
            <button class="compareBarBtn ${(card.chartType || _compare.chartType) === 'bar' ? 'active' : ''}" onclick="setCompareCardChartType(${card.id}, 'bar')">Bar</button>
            <button class="compareLineBtn ${(card.chartType || _compare.chartType) === 'line' ? 'active' : ''}" onclick="setCompareCardChartType(${card.id}, 'line')">Line</button>
          </div>
          <div class="chart-wrap chart-wrap--lg">
            <canvas id="compareChart${card.id}"></canvas>
          </div>
        </div>
        <div class="compare-card-stats" id="compareStats${card.id}"></div>
      </div>
    </div>`;
}

function renderCompareMetrics() {
  if (_compare.cards.length === 0) {
    document.getElementById('compareMetricsContainer').innerHTML = '';
    document.getElementById('compareEmptyState').style.display = 'block';
    return;
  }

  document.getElementById('compareEmptyState').style.display = 'none';
  const container = document.getElementById('compareMetricsContainer');
  container.innerHTML = _compare.cards.map(card => _compareCardHTML(card)).join('');

  // Upgrade the dynamically-created selects to custom dropdowns
  refreshCustomDropdowns(container);
}

function updateCompareCardMetric(cardId, metric) {
  const card = _compare.cards.find(c => c.id === cardId);
  if (!card) return;
  card.metric = metric;
  // Only re-render this single card's chart + stats, not all cards
  const p = _cmpPeriods();
  generateCompareChartForCard(cardId, p.current, p.previous, metric, card.chartType || _compare.chartType, false);
  generateCompareStatsForCard(cardId, p.current, p.previous, metric);
}

function renderComparePage() {
  setCompareTab(_compare.activeTab || 'trends');
  _compare.grouping = document.getElementById('compareGrouping')?.value || 'week';
  if (_compare.activeTab !== 'h2h') {
    if (_compare.cards.length === 0) renderCompareMetrics();
    updateComparePage();
  }
}

function updateComparePage(animateCardIds) {
  if (_compare.cards.length === 0) {
    return;
  }

  // Invalidate cache so _cmpPeriods() recomputes with current settings
  _compare._cachedPeriods = null;
  const p = _cmpPeriods();

  if (p.current.length === 0) {
    document.getElementById('compareEmptyState').style.display = 'block';
    document.getElementById('compareMetricsContainer').innerHTML = '';
    return;
  }

  // Show/hide metrics container
  document.getElementById('compareEmptyState').style.display = 'none';

  // Generate chart and stats for each card
  const animateAll = !animateCardIds;
  for (const card of _compare.cards) {
    const shouldAnimate = animateAll || (animateCardIds && animateCardIds.has(card.id));
    generateCompareChartForCard(card.id, p.current, p.previous, card.metric, card.chartType || _compare.chartType, shouldAnimate);
    generateCompareStatsForCard(card.id, p.current, p.previous, card.metric);
  }
}

/* ── Compare: Tab Switching ──────────────────────────── */

function setCompareTab(tab) {
  _compare.activeTab = tab;
  const btnT = document.getElementById('compareTabBtnTrends');
  const btnH = document.getElementById('compareTabBtnH2h');
  const panT = document.getElementById('compareTabTrends');
  const panH = document.getElementById('compareTabH2H');
  if (btnT) btnT.classList.toggle('active', tab === 'trends');
  if (btnH) btnH.classList.toggle('active', tab === 'h2h');
  if (panT) panT.classList.toggle('active', tab === 'trends');
  if (panH) panH.classList.toggle('active', tab === 'h2h');
  if (tab === 'h2h') { h2hRenderChips(); h2hRenderSpreadsheet(); }
}

/* ── Head-to-Head: Stats Config ─────────────────────── */

const H2H_STATS = [
  // Duration & Distance
  { key: 'time',     label: 'Moving Time',     group: 'Duration & Distance',
    extract: a => actVal(a, 'moving_time', 'elapsed_time', 'icu_moving_time', 'icu_elapsed_time'),
    format: v => fmtDur(v), higherIsBetter: null },
  { key: 'dist',     label: 'Distance',        group: 'Duration & Distance',
    extract: a => actVal(a, 'distance', 'icu_distance'),
    format: v => { const f = fmtDist(v); return f.val + ' ' + f.unit; }, higherIsBetter: true },
  { key: 'elev',     label: 'Elevation Gain',   group: 'Duration & Distance',
    extract: a => actVal(a, 'total_elevation_gain', 'icu_total_elevation_gain'),
    format: v => { const f = fmtElev(v); return f.val + ' ' + f.unit; }, higherIsBetter: true },

  // Speed
  { key: 'speed',    label: 'Avg Speed',        group: 'Speed',
    extract: a => actVal(a, 'average_speed', 'icu_average_speed'),
    format: v => { const f = fmtSpeed(v); return f.val + ' ' + f.unit; }, higherIsBetter: true },

  // Power
  { key: 'power',    label: 'Avg Power',        group: 'Power',
    extract: a => actVal(a, 'icu_weighted_avg_watts', 'average_watts', 'icu_average_watts'),
    format: v => Math.round(v) + ' W', higherIsBetter: true },
  { key: 'maxw',     label: 'Max Power',        group: 'Power',
    extract: a => actVal(a, 'max_watts', 'icu_max_watts'),
    format: v => Math.round(v) + ' W', higherIsBetter: true },
  { key: 'wpkg',     label: 'W/kg',             group: 'Power',
    extract: a => actVal(a, 'icu_watts_per_kg'),
    format: v => v > 0 ? v.toFixed(2) : '—', higherIsBetter: true },

  // Heart Rate
  { key: 'hr',       label: 'Avg Heart Rate',   group: 'Heart Rate',
    extract: a => actVal(a, 'average_heartrate', 'icu_average_heartrate'),
    format: v => Math.round(v) + ' bpm', higherIsBetter: false },
  { key: 'maxhr',    label: 'Max Heart Rate',   group: 'Heart Rate',
    extract: a => actVal(a, 'max_heartrate', 'icu_max_heartrate'),
    format: v => Math.round(v) + ' bpm', higherIsBetter: null },

  // Cadence
  { key: 'cad',      label: 'Avg Cadence',      group: 'Cadence',
    extract: a => actVal(a, 'average_cadence', 'icu_average_cadence'),
    format: v => Math.round(v) + ' rpm', higherIsBetter: null },

  // Training Load
  { key: 'tss',      label: 'Training Load',    group: 'Training Load',
    extract: a => actVal(a, 'icu_training_load', 'tss'),
    format: v => Math.round(v), higherIsBetter: null },
  { key: 'if',       label: 'Intensity Factor',  group: 'Training Load',
    extract: a => actVal(a, 'icu_intensity', 'intensity_factor'),
    format: v => v > 0 ? v.toFixed(2) : '—', higherIsBetter: true },

  // Energy
  { key: 'cal',      label: 'Calories',          group: 'Energy',
    extract: a => actVal(a, 'calories', 'icu_calories'),
    format: v => Math.round(v).toLocaleString() + ' kcal', higherIsBetter: null },
  { key: 'kj',       label: 'Kilojoules',        group: 'Energy',
    extract: a => actVal(a, 'kilojoules'),
    format: v => Math.round(v).toLocaleString() + ' kJ', higherIsBetter: null },
];

/* ── Head-to-Head: Activity Search ──────────────────── */

let _h2hDebounce = null;
function h2hSearch(query) {
  clearTimeout(_h2hDebounce);
  _h2hDebounce = setTimeout(() => _h2hDoSearch(query), 120);
}

function _h2hDoSearch(query) {
  const dd = document.getElementById('h2hDropdown');
  if (!dd) return;

  const selectedIds = new Set(_compare.h2hActivities.map(a => a.id));
  let acts = getAllActivities().filter(a => !isEmptyActivity(a) && !selectedIds.has(a.id));

  const q = (query || '').trim().toLowerCase();
  if (q) {
    acts = acts.filter(a => {
      const name = (a.name || a.icu_name || '').toLowerCase();
      const type = (a.type || a.icu_type || '').toLowerCase();
      return name.includes(q) || type.includes(q);
    });
  }

  // Sort by date desc, take top 15
  acts.sort((a, b) => new Date(b.start_date_local || b.start_date) - new Date(a.start_date_local || a.start_date));
  acts = acts.slice(0, 15);

  if (acts.length === 0) {
    dd.innerHTML = '<div class="h2h-dropdown-empty">No matching activities</div>';
  } else {
    dd.innerHTML = acts.map(a => {
      const name = a.name || a.icu_name || 'Untitled';
      const date = fmtDate(a.start_date_local || a.start_date);
      const d = fmtDist(actVal(a, 'distance', 'icu_distance'));
      const t = fmtDur(actVal(a, 'moving_time', 'elapsed_time', 'icu_moving_time'));
      return `<div class="h2h-dropdown-item" onclick="h2hAddActivity('${a.id}')">
        <div class="h2h-dropdown-name">${_escHtml(name)}</div>
        <div class="h2h-dropdown-meta">${date} · ${d.val} ${d.unit} · ${t}</div>
      </div>`;
    }).join('');
  }
  dd.classList.add('open');
}

function _escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function h2hAddActivity(actId) {
  const all = getAllActivities();
  const a = all.find(x => String(x.id) === String(actId));
  if (!a || _compare.h2hActivities.some(x => String(x.id) === String(actId))) return;
  _compare.h2hActivities.push(a);

  const dd = document.getElementById('h2hDropdown');
  if (dd) dd.classList.remove('open');
  const inp = document.getElementById('h2hSearch');
  if (inp) inp.value = '';

  h2hRenderChips();
  h2hRenderSpreadsheet();
}

function h2hRemoveActivity(actId) {
  _compare.h2hActivities = _compare.h2hActivities.filter(a => String(a.id) !== String(actId));
  h2hRenderChips();
  h2hRenderSpreadsheet();
}

// Close dropdown when clicking outside
document.addEventListener('click', e => {
  const wrap = document.querySelector('.h2h-search-wrap');
  const dd = document.getElementById('h2hDropdown');
  if (dd && wrap && !wrap.contains(e.target)) dd.classList.remove('open');
});

/* ── Head-to-Head: Chips ────────────────────────────── */

function h2hRenderChips() {
  const el = document.getElementById('h2hSelectedChips');
  if (!el) return;
  el.innerHTML = _compare.h2hActivities.map(a => {
    const name = a.name || a.icu_name || 'Untitled';
    const date = fmtDate(a.start_date_local || a.start_date);
    return `<span class="h2h-chip">
      <span class="h2h-chip-name">${_escHtml(name)}</span>
      <span class="h2h-chip-date">${date}</span>
      <button class="h2h-chip-remove" onclick="h2hRemoveActivity('${a.id}')">&times;</button>
    </span>`;
  }).join('');
}

/* ── Head-to-Head: Spreadsheet ──────────────────────── */

function h2hRenderSpreadsheet() {
  const wrap = document.getElementById('h2hSpreadsheet');
  const empty = document.getElementById('h2hEmptyState');
  if (!wrap || !empty) return;

  const acts = _compare.h2hActivities;
  if (acts.length < 2) {
    wrap.style.display = 'none';
    empty.style.display = '';
    return;
  }
  wrap.style.display = '';
  empty.style.display = 'none';

  // Build header
  const colCount = acts.length + 1;
  const defaultW = Math.max(160, Math.floor(800 / colCount));
  let html = `<table class="h2h-table"><colgroup><col style="width:140px">`;
  acts.forEach(() => { html += `<col style="width:${defaultW}px">`; });
  html += '</colgroup><thead><tr><th>Stat<span class="h2h-col-resize" data-col="0"></span></th>';
  acts.forEach((a, i) => {
    const fullName = a.name || a.icu_name || 'Untitled';
    const name = fullName.length > 20 ? fullName.slice(0, 20) + '…' : fullName;
    const date = fmtDate(a.start_date_local || a.start_date);
    html += `<th title="${_escHtml(fullName)}">${_escHtml(name)}<br><span style="font-weight:400;font-size:var(--text-xs);color:var(--text-secondary)">${date}</span><span class="h2h-col-resize" data-col="${i + 1}"></span></th>`;
  });
  html += '</tr></thead><tbody>';

  // Build rows by group
  let lastGroup = '';
  for (const stat of H2H_STATS) {
    // Group separator
    if (stat.group !== lastGroup) {
      lastGroup = stat.group;
      html += `<tr class="h2h-group-row"><td colspan="${acts.length + 1}">${stat.group}</td></tr>`;
    }

    const values = acts.map(a => stat.extract(a) || 0);
    const diffs = _h2hCalcDiffs(values, stat.higherIsBetter);

    html += `<tr><td>${stat.label}</td>`;
    values.forEach((v, i) => {
      if (!v || v <= 0) {
        html += '<td><span class="h2h-na">—</span></td>';
      } else {
        const formatted = stat.format(v);
        const d = diffs[i];
        let badge = '';
        if (d) {
          if (d.isBest)  badge = `<span class="h2h-diff ${stat.higherIsBetter === null ? 'h2h-neutral' : 'h2h-best'}">Best</span>`;
          else            badge = `<span class="h2h-diff ${stat.higherIsBetter === null ? 'h2h-neutral' : 'h2h-worse'}">${d.pct > 0 ? '+' : ''}${d.pct.toFixed(1)}%</span>`;
        }
        html += `<td><span class="h2h-value">${formatted}</span>${badge}</td>`;
      }
    });
    html += '</tr>';
  }

  html += '</tbody></table>';
  wrap.innerHTML = html;

  // Column resize drag logic
  const table = wrap.querySelector('.h2h-table');
  if (table) {
    const cols = table.querySelectorAll('colgroup col');
    const ths = table.querySelectorAll('thead th');

    // Freeze all cols to their rendered widths — batch reads then writes
    let totalW = 0;
    const widths = Array.from(ths, th => th.getBoundingClientRect().width);
    widths.forEach((w, i) => {
      if (cols[i]) cols[i].style.width = w + 'px';
      totalW += w;
    });
    table.style.width = totalW + 'px';

    wrap.querySelectorAll('.h2h-col-resize').forEach(handle => {
      handle.addEventListener('mousedown', e => {
        e.preventDefault();
        const colIdx = +handle.dataset.col;
        const col = cols[colIdx];
        if (!col) return;

        const startX = e.clientX;
        const startColW = parseFloat(col.style.width);
        const startTableW = parseFloat(table.style.width);
        handle.classList.add('active');

        const onMove = ev => {
          const delta = ev.clientX - startX;
          const newColW = Math.max(80, startColW + delta);
          const actualDelta = newColW - startColW;
          col.style.width = newColW + 'px';
          table.style.width = (startTableW + actualDelta) + 'px';
        };
        const onUp = () => {
          handle.classList.remove('active');
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    });
  }
}

function _h2hCalcDiffs(values, higherIsBetter) {
  const valid = values.filter(v => v > 0);
  if (valid.length < 2) return values.map(() => null);

  const best = higherIsBetter === false ? Math.min(...valid) : Math.max(...valid);
  if (best === 0) return values.map(() => null);

  return values.map(v => {
    if (!v || v <= 0) return null;
    const pct = ((v - best) / Math.abs(best)) * 100;
    return { pct, isBest: Math.abs(pct) < 0.05 };
  });
}

// Capture any saved route before navigate() overwrites sessionStorage
const _initRoute = (() => { try { return JSON.parse(sessionStorage.getItem('icu_route')); } catch { return null; } })();
const _validInitPages = ['dashboard','activities','calendar','fitness','power','zones','weather','settings','workout','guide','compare','heatmap','goals','import'];
const _startPage = (_initRoute && _initRoute.type === 'page' && _validInitPages.includes(_initRoute.page)) ? _initRoute.page : 'dashboard';

// navigate(_startPage) is called after cache loading below

// Check URL hash for setup link credentials (e.g. #id=i12345&key=abc...)
// The hash is never sent to any server, so credentials stay private.
let _hashSetupPending = false;
(function applyHashCredentials() {
  const hash = window.location.hash.slice(1);
  if (!hash) return;
  const p = new URLSearchParams(hash);
  const hashId  = p.get('id');
  const hashKey = p.get('key');
  // Always clear the hash from the URL first for safety
  history.replaceState(null, '', window.location.pathname + window.location.search);
  if (hashId && hashKey) {
    _hashSetupPending = true; // prevent openModal() from blocking the confirm dialog
    // Decode transferred settings if present
    const cfgB64 = p.get('cfg');
    let cfgObj = null;
    if (cfgB64) {
      try { cfgObj = JSON.parse(decodeURIComponent(escape(atob(cfgB64)))); } catch (_) {}
    }
    const hasSettings = cfgObj && Object.keys(cfgObj).length > 0;
    // Defer so it runs after openModal() would have fired, then show on top
    setTimeout(() => {
      // Close connect modal if it opened
      const cm = document.getElementById('connectModal');
      if (cm?.open) closeModalAnimated(cm);
      showConfirmDialog(
        'Setup Link Detected',
        `Connect with Athlete ID: <strong>${hashId}</strong>${hasSettings ? ` and apply ${Object.keys(cfgObj).length} saved settings (theme, units, goals, weather, etc.)?` : '?'}`,
        () => {
          clearActivityCache();
          clearFitnessCache();
          saveCredentials(hashId, hashKey);
          if (hasSettings) _applyTransferredSettings(cfgObj);
          showToast('Setup link applied — reloading...', 'success');
          setTimeout(() => window.location.reload(), 400);
        }
      );
    }, 100);
  }
})();

/* ── Strava OAuth callback handler ── */
(function handleStravaCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code || !params.get('scope')) return; // not a Strava callback
  history.replaceState(null, '', window.location.pathname + window.location.hash);
  stravaExchangeCode(code);
})();

const hasCredentials = loadCredentials();
if (hasCredentials) {
  // Pre-load cached activities so pages render instantly,
  // then syncData() will fetch only what's new in the background.
  const cached = loadActivityCache();
  if (cached) {
    state.activities = cached.activities;
    loadFitnessCache();
    updateSidebarCTL();
    state.synced = true;
    updateConnectionUI(true);
    updateLastSyncLabel(cached.lastSync);
  } else {
    updateConnectionUI(false);
  }
  // Always load lifetime cache (independent of activity cache)
  const ltCached = loadLifetimeCache();
  if (ltCached) {
    state.lifetimeActivities = ltCached.activities;
    state.lifetimeLastSync   = ltCached.lastSync;
  }
  // navigate(_startPage) is deferred to end of file so all declarations (e.g. _hm) are ready
  syncData();
} else {
  openModal();
}

// Close modal on backdrop click (only when already connected)
document.getElementById('connectModal').addEventListener('click', function(e) {
  if (e.target === this && (state.athleteId && state.apiKey)) closeModal();
});

/* ====================================================
   CARD GLOW — Apple TV–style spotlight + rim glow
==================================================== */
(function initCardGlow() {
  const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;

  function attachGlow(el) {
    if (isTouchDevice) return;   // no mouse on touch — skip entirely
    let glowRAF = 0;
    el.addEventListener('mousemove', e => {
      if (glowRAF) return;
      glowRAF = requestAnimationFrame(() => {
        glowRAF = 0;
        const r = el.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width  * 100).toFixed(1) + '%';
        const y = ((e.clientY - r.top)  / r.height * 100).toFixed(1) + '%';
        el.style.setProperty('--mouse-x', x);
        el.style.setProperty('--mouse-y', y);
      });
    }, { passive: true });
  }
  // expose so other parts of the app can attach glow to late-rendered elements
  window.attachCardGlow = attachGlow;

  const GLOW_SEL = '.stat-card, .recent-act-card, .hero-act-card, .perf-metric, .act-pstat, .act-similar-card, .mm-cell, .wxp-day-card, .fit-kpi-card, .wx-day, .znp-kpi-card, .wxp-st, .wxp-best-card, .stk-hero-card, .stk-pb-card, .stk-badge--earned, .stk-stat-tile, .goal-dash-card, .fit-rec-metric, .fit-rp-card';

  function attachGlowAndPress(el) {
    attachGlow(el);
  }

  // Skip everything on touch devices — no hover effects needed
  if (isTouchDevice) {
    window.refreshGlow = function() {};
    return;
  }

  // Attach to all current glow cards
  document.querySelectorAll(GLOW_SEL).forEach(attachGlowAndPress);

  // Expose a manual refresh for use after dynamic renders (replaces MutationObserver)
  window.refreshGlow = function(root) {
    (root || document).querySelectorAll(GLOW_SEL).forEach(el => {
      if (el.dataset.glow) return;
      el.dataset.glow = '1';
      attachGlowAndPress(el);
    });
  };
})();

/* ====================================================
   BADGE TILT — 3D medal tilt for earned achievement badges
==================================================== */
(function initBadgeTilt() {
  if (window.matchMedia('(pointer: coarse)').matches) {
    window.refreshBadgeTilt = function() {};
    return;
  }

  const MAX_TILT = 8; // degrees

  function attachTilt(el) {
    if (el.dataset.tilt) return;
    el.dataset.tilt = '1';

    let tiltRAF = 0;
    el.addEventListener('mousemove', e => {
      if (tiltRAF) return;
      tiltRAF = requestAnimationFrame(() => {
        tiltRAF = 0;
        const rect = el.getBoundingClientRect();
        const dx = (e.clientX - rect.left  - rect.width  / 2) / (rect.width  / 2); // -1..1
        const dy = (e.clientY - rect.top   - rect.height / 2) / (rect.height / 2); // -1..1
        const rx = (-dy * MAX_TILT).toFixed(2);
        const ry = ( dx * MAX_TILT).toFixed(2);
        el.classList.remove('badge-tilt-reset');
        el.style.transform = `perspective(480px) rotateX(${rx}deg) rotateY(${ry}deg) scale(1.03)`;
      });
    }, { passive: true });

    el.addEventListener('mouseleave', () => {
      el.classList.add('badge-tilt-reset');
      el.style.transform = '';
    });
  }

  // Attach to any already-rendered earned badges
  document.querySelectorAll('.stk-badge--earned').forEach(attachTilt);

  // Expose a manual refresh for use after dynamic renders (replaces MutationObserver)
  window.refreshBadgeTilt = function(root) {
    (root || document).querySelectorAll('.stk-badge--earned').forEach(el => {
      if (!el.dataset.tilt) attachTilt(el);
    });
  };
})();

/* ====================================================
   RATE LIMIT TRACKER
   Fixed 15-minute window.  Max 200 requests per window.
   When the window expires everything resets to 0.
==================================================== */
const RL_WINDOW_MS = 15 * 60 * 1000;   // 15 minutes
const RL_MAX       = 200;

const _rl = {
  count:       0,  // requests in current window
  windowStart: 0,  // timestamp when window began (0 = no active window)
};

// Restore from localStorage so count survives page refreshes
try {
  const saved = JSON.parse(localStorage.getItem('icu_rl_win') || 'null');
  if (saved && typeof saved.count === 'number' && typeof saved.windowStart === 'number') {
    // Window still active?
    if (Date.now() - saved.windowStart < RL_WINDOW_MS) {
      _rl.count       = saved.count;
      _rl.windowStart = saved.windowStart;
    }
    // else: window expired — start fresh (defaults are 0/0)
  }
} catch (_) {}
// Clean up old sliding-window key if it exists
try { localStorage.removeItem('icu_rl_ts'); } catch (_) {}

function _rlPersist() {
  try {
    localStorage.setItem('icu_rl_win', JSON.stringify({ count: _rl.count, windowStart: _rl.windowStart }));
  } catch (_) {}
}

/** Check if the current window has expired; if so, reset. */
function _rlCheckExpiry() {
  if (_rl.windowStart && Date.now() - _rl.windowStart >= RL_WINDOW_MS) {
    _rl.count = 0;
    _rl.windowStart = 0;
    _rlPersist();
  }
}

/** Call on every icuFetch to record a request */
function rlTrackRequest() {
  _rlCheckExpiry();
  if (!_rl.windowStart) _rl.windowStart = Date.now(); // start a new window
  _rl.count++;
  _rlPersist();
  rlUpdateUI();
}

/** Return count in current window (0 if expired) */
function rlGetCount() {
  _rlCheckExpiry();
  return _rl.count;
}

/** Seconds until the entire window resets to 0 */
function rlSecsUntilReset() {
  if (!_rl.windowStart) return 0;
  const diff = (_rl.windowStart + RL_WINDOW_MS) - Date.now();
  return Math.max(0, Math.ceil(diff / 1000));
}

/** Update the settings UI bar */
function rlUpdateUI() {
  _rlCheckExpiry();
  const used  = _rl.count;
  const pct   = Math.min(100, (used / RL_MAX) * 100);
  const left  = RL_MAX - used;

  const elUsed  = document.getElementById('rlBarUsed');
  const elFill  = document.getElementById('rlBarFill');
  const elHint  = document.getElementById('rlBarHint');
  const elReset = document.getElementById('rlBarReset');

  if (elUsed) elUsed.textContent = used;
  if (elFill) {
    elFill.style.width = pct + '%';
    elFill.classList.remove('rl-bar-fill--warn', 'rl-bar-fill--danger');
    if (pct >= 90)      elFill.classList.add('rl-bar-fill--danger');
    else if (pct >= 60) elFill.classList.add('rl-bar-fill--warn');
  }
  if (elHint) {
    if (used === 0) {
      elHint.textContent = 'No requests tracked yet';
    } else {
      elHint.textContent = `${left} request${left !== 1 ? 's' : ''} remaining`;
    }
  }
  if (elReset) {
    const secs = rlSecsUntilReset();
    if (secs > 0) {
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      elReset.textContent = `Resets in ${m}:${String(s).padStart(2, '0')}`;
    } else {
      elReset.textContent = used > 0 ? '' : '';
    }
  }
}

// Tick the reset countdown only while on settings page (start/stop on navigation)
let _rlTimer = null;
function _rlStartTick() {
  if (_rlTimer) return;
  _rlTimer = setInterval(() => {
    if (state.currentPage !== 'settings') { _rlStopTick(); return; }
    _rlCheckExpiry();
    rlUpdateUI();
    // Stop ticking when no active window
    if (!_rl.windowStart) _rlStopTick();
  }, 1000);
}
function _rlStopTick() {
  if (_rlTimer) { clearInterval(_rlTimer); _rlTimer = null; }
}


/* ====================================================
   OFFLINE ACTIVITY SYNC
   Progressively downloads detail + streams into IDB
   for full offline analysis.
==================================================== */
const _offlineSync = {
  inProgress: false,
  cancelled:  false,
  cached:     0,
  total:      0,
  errors:     0,
};

async function offlineSyncStart() {
  if (_offlineSync.inProgress) { showToast('Offline sync already running', 'info'); return; }
  if (!navigator.onLine) { showToast('No internet connection', 'error'); return; }
  const limit = getOfflineLimit();
  if (limit <= 0) return;

  _offlineSync.inProgress = true;
  _offlineSync.cancelled  = false;
  _offlineSync.errors     = 0;

  // Ensure we have the full activity list
  ensureLifetimeLoaded();
  const all = state.lifetimeActivities || state.activities || [];
  if (!all.length) {
    showToast('No activities to cache', 'info');
    _offlineSync.inProgress = false;
    return;
  }

  // Sort newest-first
  const sorted = [...all].sort((a, b) =>
    new Date(b.start_date_local || b.start_date) - new Date(a.start_date_local || a.start_date)
  );
  const target = limit === Infinity ? sorted : sorted.slice(0, limit);

  // Skip already-cached
  const cachedIds = await actCacheGetCachedIds();
  const toDownload = target.filter(a => !cachedIds.has(String(a.id)));

  _offlineSync.total  = target.length;
  _offlineSync.cached = target.length - toDownload.length;
  offlineSyncUpdateUI();

  if (!toDownload.length) {
    showToast('All activities already cached', 'success');
    _offlineSync.inProgress = false;
    offlineSyncUpdateUI();
    return;
  }

  const syncBtn = document.getElementById('offlineSyncBtn');
  if (syncBtn) syncBtn.disabled = true;

  for (let i = 0; i < toDownload.length; i++) {
    if (_offlineSync.cancelled) break;
    if (!navigator.onLine) { showToast('Connection lost — sync paused', 'error'); break; }

    const actId = String(toDownload[i].id);

    try {
      // Rate limit check
      if (rlGetCount() >= RL_MAX - 5) {
        const wait = rlSecsUntilReset();
        offlineSyncSetStatus(`Rate limited — waiting ${wait}s…`);
        await new Promise(r => setTimeout(r, (wait + 2) * 1000));
      }

      await fetchActivityDetail(actId);
      await new Promise(r => setTimeout(r, OFFLINE_THROTTLE_MS));
      if (_offlineSync.cancelled) break;

      await fetchActivityStreams(actId);
      _offlineSync.cached++;
    } catch (e) {
      console.warn('Offline sync: failed', actId, e);
      _offlineSync.errors++;
    }

    offlineSyncUpdateUI();
    await new Promise(r => setTimeout(r, OFFLINE_THROTTLE_MS));
  }

  _offlineSync.inProgress = false;
  if (syncBtn) syncBtn.disabled = false;

  if (_offlineSync.cancelled) {
    showToast(`Sync cancelled — ${_offlineSync.cached}/${_offlineSync.total} cached`, 'info');
  } else if (_offlineSync.errors > 0) {
    showToast(`Sync done (${_offlineSync.errors} errors) — ${_offlineSync.cached}/${_offlineSync.total}`, 'info');
  } else {
    showToast(`Offline sync complete — ${_offlineSync.cached}/${_offlineSync.total} cached`, 'success');
  }
  offlineSyncUpdateUI();
  updateStorageBar();
}

function offlineSyncCancel() {
  _offlineSync.cancelled = true;
}

function offlineSyncSetStatus(text) {
  const el = document.getElementById('offlineSyncText');
  if (el) el.textContent = text;
}

function offlineSyncUpdateUI() {
  const fillEl    = document.getElementById('offlineSyncFill');
  const textEl    = document.getElementById('offlineSyncText');
  const progressEl = document.getElementById('offlineSyncProgress');
  const countEl   = document.getElementById('offlineCachedCount');
  const sizeEl    = document.getElementById('offlineCacheSize');
  const syncBtn   = document.getElementById('offlineSyncBtn');
  const cancelBtn = document.getElementById('offlineSyncCancelBtn');

  const { cached, total, inProgress } = _offlineSync;
  const pct = total > 0 ? Math.round((cached / total) * 100) : 0;

  if (fillEl) fillEl.style.width = pct + '%';
  if (textEl) textEl.textContent = inProgress
    ? `Caching ${cached}/${total} activities…`
    : (total > 0 ? `${cached}/${total} activities cached` : '');
  if (progressEl) progressEl.style.display = (inProgress || cached > 0) ? '' : 'none';
  if (cancelBtn)  cancelBtn.style.display = inProgress ? '' : 'none';
  if (syncBtn && !inProgress) syncBtn.disabled = false;

  // Async: update cached count + size
  if (countEl || sizeEl) {
    getActCacheIDBSize().then(info => {
      if (countEl) countEl.textContent = `${info.activityIds.size} activities`;
      if (sizeEl)  sizeEl.textContent  = fmtBytes(info.bytes);
    });
  }
}

function offlineSyncInitUI() {
  const limit = getOfflineLimit();
  const toggle = document.getElementById('offlineToggle');
  if (toggle) toggle.checked = limit > 0;

  const depRows = ['offlineLimitRow', 'offlineSizeEstRow', 'offlineCacheRow', 'offlineCacheRow2', 'offlineSyncRow', 'offlineSyncActions'];
  depRows.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = limit > 0 ? '' : 'none';
  });

  // Highlight active pill
  document.querySelectorAll('#offlineLimitPills button').forEach(b => {
    const val = b.dataset.offlineLimit === 'all' ? Infinity : Number(b.dataset.offlineLimit);
    b.classList.toggle('active', val === limit);
  });

  offlineUpdateEstimate(limit);
  offlineSyncUpdateUI();
}

function setOfflineEnabled(on) {
  if (on) {
    if (getOfflineLimit() <= 0) setOfflineLimit(50);
  } else {
    setOfflineLimit(0);
    if (_offlineSync.inProgress) offlineSyncCancel();
  }
  offlineSyncInitUI();
}

function setOfflineLimitPill(str) {
  const limit = str === 'all' ? Infinity : Number(str);
  setOfflineLimit(limit);
  document.querySelectorAll('#offlineLimitPills button').forEach(b => {
    const val = b.dataset.offlineLimit === 'all' ? Infinity : Number(b.dataset.offlineLimit);
    b.classList.toggle('active', val === limit);
  });
  offlineUpdateEstimate(limit);
}

function offlineUpdateEstimate(limit) {
  const el = document.getElementById('offlineSizeEst');
  if (!el) return;
  if (limit <= 0) { el.textContent = '—'; return; }
  const totalActs = state.lifetimeActivities
    ? state.lifetimeActivities.length
    : (state.activities ? state.activities.length : 0);
  const count = limit === Infinity ? totalActs : Math.min(limit, totalActs);
  el.textContent = `~${fmtBytes(count * OFFLINE_AVG_SIZE)} for ${count} activities`;
}

function offlineClearCache() {
  showConfirmDialog(
    'Clear Offline Cache',
    'Remove all downloaded activity detail and stream data. Summary data is not affected.',
    async () => {
      if (_offlineSync.inProgress) offlineSyncCancel();
      try {
        const db = await _actCacheDB();
        const tx = db.transaction('items', 'readwrite');
        tx.objectStore('items').clear();
        await new Promise(r => { tx.oncomplete = r; tx.onerror = r; });
      } catch (_) {}
      _offlineSync.cached = 0;
      _offlineSync.total  = 0;
      offlineSyncUpdateUI();
      updateStorageBar();
      showToast('Offline cache cleared', 'success');
    }
  );
}

/* ====================================================
   SMART POLLING  —  auto-sync while user is active
==================================================== */
const _poll = {
  enabled:   false,
  intervalM: 15,       // minutes between checks
  timer:     null,
  idleTimer: null,
  idle:      false,
  lastCheck: null,
  checking:  false,
};

/** Toggle smart polling on/off */
function setSmartPoll(on) {
  _poll.enabled = on;
  try { localStorage.setItem('icu_smart_poll', on ? '1' : '0'); } catch (e) { console.warn('localStorage.setItem failed:', e); }

  // Show/hide interval row & status rows
  const intRow  = document.getElementById('icuSmartPollIntervalRow');
  const statRow = document.getElementById('icuSmartPollStatusRow');
  const lastRow = document.getElementById('icuSmartPollLastRow');
  if (intRow)  intRow.style.display  = on ? '' : 'none';
  if (statRow) statRow.style.display = on ? '' : 'none';
  if (lastRow) lastRow.style.display = on ? '' : 'none';

  if (on) {
    pollStart();
  } else {
    pollStop();
  }
  pollUpdateStatusUI();
}

/** Set polling interval */
function setSmartPollInterval(minutes) {
  _poll.intervalM = minutes;
  try { localStorage.setItem('icu_smart_poll_interval', String(minutes)); } catch (e) { console.warn('localStorage.setItem failed:', e); }

  // Update active pill
  document.querySelectorAll('#icuSmartPollIntervalPills button').forEach(b => {
    b.classList.toggle('active', Number(b.dataset.poll) === minutes);
  });

  // Restart timer with new interval
  if (_poll.enabled) { pollStop(); pollStart(); }
}

/** Start the polling timer */
function pollStart() {
  pollStop();
  if (!_poll.enabled || !state.athleteId) return;

  const ms = _poll.intervalM * 60 * 1000;
  _poll.timer = setInterval(() => {
    if (!_poll.idle && document.visibilityState === 'visible') {
      pollCheck();
    }
  }, ms);

  // Idle detection — pause polling after 5 min of no interaction
  pollResetIdle();
  pollUpdateStatusUI();
}

/** Stop polling */
function pollStop() {
  if (_poll.timer) { clearInterval(_poll.timer); _poll.timer = null; }
  if (_poll.idleTimer) { clearTimeout(_poll.idleTimer); _poll.idleTimer = null; }
  pollUpdateStatusUI();
}

/** Reset idle timer on user activity */
function pollResetIdle() {
  _poll.idle = false;
  if (_poll.idleTimer) clearTimeout(_poll.idleTimer);
  _poll.idleTimer = setTimeout(() => {
    _poll.idle = true;
    pollUpdateStatusUI();
  }, 5 * 60 * 1000); // 5 minutes idle threshold
}

/** Perform an incremental sync check */
async function pollCheck() {
  if (_poll.checking || !state.athleteId || !state.apiKey) return;

  // Rate limit safety — don't poll if we've used > 80% of our budget
  if (rlGetCount() > RL_MAX * 0.8) {
    pollSetStatus('Paused — rate limit');
    return;
  }

  _poll.checking = true;
  pollSetStatus('Checking…');

  try {
    const cache = loadActivityCache();
    if (!cache || !cache.activities.length) {
      pollSetStatus('No cache — use manual sync first');
      _poll.checking = false;
      return;
    }

    // Fetch only recent activities (last 2 days)
    const since = new Date();
    since.setDate(since.getDate() - 2);
    const oldest = toDateStr(since);
    const newest = toDateStr(new Date());

    const data = await icuFetch(
      `/athlete/${state.athleteId}/activities?oldest=${oldest}&newest=${newest}&limit=50`
    );
    const chunk = Array.isArray(data) ? data : (data.activities || []);

    // Find genuinely new activities
    const existingIds = new Set(state.activities.map(a => a.id));
    const newOnes = chunk.filter(a => !existingIds.has(a.id));

    _poll.lastCheck = new Date();

    if (newOnes.length) {
      // Merge and save
      state.activities = [...newOnes, ...state.activities];
      saveActivityCache(state.activities);

      // Refresh dashboard if visible
      if (state.currentPage === 'dashboard') renderDashboard();
      if (state.currentPage === 'activities') ensureLifetimeLoaded();

      showToast(`${newOnes.length} new activit${newOnes.length > 1 ? 'ies' : 'y'} synced`, 'success');
      pollSetStatus(`Found ${newOnes.length} new`);
    } else {
      pollSetStatus('Up to date');
    }
  } catch (err) {
    console.warn('Smart poll error:', err);
    pollSetStatus('Error — will retry');
  }

  _poll.checking = false;
  pollUpdateLastCheck();
}

/** Update status text */
function pollSetStatus(text) {
  const el = document.getElementById('icuSmartPollStatus');
  if (el) el.textContent = text;
}

/** Update last check time */
function pollUpdateLastCheck() {
  const el = document.getElementById('icuSmartPollLastCheck');
  if (!el) return;
  if (!_poll.lastCheck) { el.textContent = '—'; return; }
  el.textContent = _poll.lastCheck.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

/** Update overall status UI */
function pollUpdateStatusUI() {
  const el = document.getElementById('icuSmartPollStatus');
  if (!el) return;
  if (!_poll.enabled) {
    el.textContent = 'Disabled';
  } else if (_poll.idle) {
    el.textContent = 'Paused — idle';
  } else if (_poll.timer) {
    el.textContent = _poll.lastCheck ? 'Active' : 'Waiting for first check…';
  } else {
    el.textContent = 'Starting…';
  }
}

/** Restore smart poll settings on page load */
function pollRestore() {
  const on = localStorage.getItem('icu_smart_poll') === '1';
  const intv = parseInt(localStorage.getItem('icu_smart_poll_interval') || '15', 10);
  _poll.intervalM = [5, 10, 15, 30].includes(intv) ? intv : 15;

  // Restore toggle UI
  const toggle = document.getElementById('icuSmartPollToggle');
  if (toggle) toggle.checked = on;

  // Restore interval pills
  document.querySelectorAll('#icuSmartPollIntervalPills button').forEach(b => {
    b.classList.toggle('active', Number(b.dataset.poll) === _poll.intervalM);
  });

  // Show/hide dependent rows
  const intRow  = document.getElementById('icuSmartPollIntervalRow');
  const statRow = document.getElementById('icuSmartPollStatusRow');
  const lastRow = document.getElementById('icuSmartPollLastRow');
  if (intRow)  intRow.style.display  = on ? '' : 'none';
  if (statRow) statRow.style.display = on ? '' : 'none';
  if (lastRow) lastRow.style.display = on ? '' : 'none';

  if (on) {
    _poll.enabled = true;
    pollStart();
  }
}

// Listen for user activity to reset idle timer (throttled to max once per 10s)
let _pollIdleThrottled = 0;
['mousemove', 'keydown', 'scroll', 'click', 'touchstart'].forEach(evt => {
  document.addEventListener(evt, () => {
    if (!_poll.enabled) return;
    if (_poll.idle) { _poll.idle = false; pollUpdateStatusUI(); }
    const now = Date.now();
    if (now - _pollIdleThrottled < 10000) return; // throttle: max once per 10s
    _pollIdleThrottled = now;
    pollResetIdle();
  }, { passive: true });
});

// Pause work when tab hidden, resume when visible
document.addEventListener('visibilitychange', () => {
  if (_poll.enabled) pollUpdateStatusUI();
  if (document.hidden) {
    _rlStopTick(); // stop settings countdown
  } else {
    if (state.currentPage === 'settings') _rlStartTick();
  }
});

// Restore on app boot (after DOM ready)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', pollRestore);
} else {
  pollRestore();
}


/* ====================================================
   WINDOW EXPOSURE — make functions available to onclick handlers
   ES modules have their own scope, so onclick="fn()" needs window.fn
==================================================== */

// ── From state.js ──
Object.assign(window, { state, ICU_BASE, STRAVA_API_BASE, STRAVA_AUTH_BASE,
  STRAVA_AUTH_URL, STORAGE_LIMIT, safeMax, safeMin, _rIC, GREETINGS, _pageCleanupFns });

// ── From weather.js ──
Object.assign(window, { weatherIconSvg, wmoIcon, wmoLabel, windDir, fmtTempC,
  fmtWindMs, renderActivityWeather, renderActivityNotes, renderActivityIntervals,
  renderWeatherForecast, renderWeatherPage, renderWeatherDayDetail, refreshWeatherPage });

// ── From share.js ──
Object.assign(window, { openShareModal, closeShareModal, shareUpdateSetting,
  shareRender, shareImageDownload, shareImageCopy });

// ── From routes.js ──
Object.assign(window, { renderRouteBuilderPage, rbUndo, rbRedo, rbReverse,
  rbOutAndBack, rbLoopBack, rbClear, rbSave, rbSaveEdit, rbCancelEdit, rbLoadRoute, rbDeleteSavedRoute,
  rbExportGPX, rbExportFIT, rbImportGPX, rbToggleElevPanel, rbToggleSidePanel,
  closeExportHelper, _rbSetPoiMode, _rbTogglePoiCat, _rbSwitchExportTab,
  _rbToggleFullscreen, _rbToggleSurfaceMode, _rbToggleRoadSafety,
  _rbToggleCyclOSM, _rbToggleTerrain,
  rbToggleSnap, rbToggleAvoidUnpaved, rbToggleAvoidHighways,
  rbSetGradient, rbToggleElevShading, rbToggleWind });

// ── From heatmap.js ──
Object.assign(window, { renderHeatmapPage, hmLoadAllRoutes, hmApplyFilters,
  hmRedraw, hmToggleAnimate, hmRescanGPS });

// ── From workout.js (includes settings/theme functions) ──
Object.assign(window, { wrkRender, wrkRefreshStats, wrkSetName, wrkAddSegment, wrkRemove, wrkMove,
  wrkToggleEdit, wrkSet, wrkClear, wrkExportZwo, wrkExportFit, wrkDownload,
  wrkSetFtp, buildFitWorkout, loadMapTheme, setMapTheme, loadAppFont, setAppFont,
  copyShareLink, shareToTwitter, shareToWhatsApp, shareToReddit,
  _isDark, _updateChartColors, setTheme, loadPhysicsScroll, setPhysicsScroll,
  loadSmoothFlyover, toggleSmoothFlyover, toggleTerrain3d });

// ── From strava.js ──
Object.assign(window, { saveStravaCredentials, loadStravaCredentials,
  clearStravaCredentials, isStravaConnected, stravaStartAuth, stravaExchangeCode,
  stravaDisconnect, stravaSyncActivities, stravaCancelSync,
  icuRenderSyncUI, stravaRenderSyncUI, stravaSaveAndAuth,
  stravaClearActivities, icuSaveAndConnect, saveOrsApiKey,
  stravaFetch, stravaMapType, stravaSaveStreamsToIDB, stravaLoadStreamsFromIDB });

// ── From import.js ──
Object.assign(window, { initImportPage, impSwitchTab, impAddFiles,
  impRemoveFromQueue, impClearQueue, impProcessAll, impToggleSettings,
  impToggleStream, impRenderHistory, impClearHistory, impSaveRouteToIDB });

// ── From app.js (local functions referenced by onclick) ──
Object.assign(window, {
  navigate, navigateBack, navigateToActivity, pwaInstall,
  showToast, showConfirmDialog, handleConnect, syncData, disconnect,
  confirmSyncData, confirmFullResync, closeModal, openModal,
  toggleApiKeyVisibility, toggleSidebar, closeSidebar,
  setRange, setFitnessRange, setPwrRange, setZnpRange,
  setActivitiesSort, setActivitiesSport, setActivitiesYear, setActivitiesSearch, setActivitiesView,
  stepActivity, streamsZoomIn, streamsZoomOut, streamsResetZoom,
  toggleMapFullscreen, toggleMapStats, saveActivityRoute,
  openGearModal, closeGearModal, submitGearForm,
  openBatteryModal, closeBatteryModal, submitBatteryForm,
  onBatterySystemChange, onBatteryComponentChange, renderGearBatteries,
  openServiceModal, closeServiceModal, submitServiceForm,
  openServiceShopModal, closeServiceShopModal, saveServiceShop, closeServiceHistory,
  calPrevMonth, calNextMonth, calGoToday, toggleCalPanel,
  openTrainingPlanModal, closeTrainingPlanModal, applyTrainingPlan,
  showTpSlotForm, hideTpSlotForm, addTpSlot, removeTpSlot,
  setHideEmptyCards, setFtpAlert,
  gearSwitchTab, addCompareCard, setComparePeriod, updateComparePage,
  clearAllCaches, clearLifetimeCache, exportFullBackup, importFullBackup,
  exportLifetimeJSON, importLifetimeJSON, resyncLifetimeData,
  updateStorageBar, setUnits, copySetupLink, applySetupLink, handleAvatarUpload, removeAvatar,
  setWeatherCity, useMyLocation, clearWeatherLocation, setWeekStartDay,
  offlineSyncStart, offlineSyncCancel, offlineClearCache,
  setOfflineEnabled, setOfflineLimitPill, setSmartPoll, setSmartPollInterval,
  pollRestore, rlUpdateUI,
  // Functions called by modules via window proxy
  skeletonCards, unskeletonCard, destroyChartInstances,
  icuFetch, authHeader, destroyChart, cleanupPageCharts, lazyRenderChart,
  getAllActivities, fetchMapGPS, actCacheGet, actCachePut,
  _isMobile, getActiveWxLocation, showCardNA, clearCardNA,
  _mlGetStyle, _mlApplyTerrain,
  _addCyclOSMLayer, _removeCyclOSMLayer, _addRoadSafetyLayer, _removeRoadSafetyLayer,
  setRoadSafetyEnabled, setCyclOSMEnabled,
  loadTerrainEnabled, loadRoadSafetyEnabled, loadCyclOSMEnabled,
  MAP_STYLES, renderDashboard, isEmptyActivity, _compare,
  renderFitnessPage, renderPowerPage, renderCalendar, renderActivityBasic, renderZonesPage,
  setTerrainEnabled, fetchAthleteProfile, saveCredentials, updateConnectionUI,
  _hmOpenDB, updateLifetimeCacheUI, fmtDur, renderWeekProgress,
  setFatiguePredScenario,
  onServiceShopChange, onServiceNextModeChange,
  updateCompareCardMetric, setCompareCardChartType, removeCompareCard,
  renderWxLocationSwitcher, getWxLocations, setActiveWxLocation,
  removeWxLocation, initWeatherLocationUI,
  // Gear page
  gearSelectBike, deleteGearComponent,
  chargeBattery, reactivateBattery, deleteBatteryPermanent, retireBattery,
  editServiceShop, deleteServiceShop, openServiceHistory, deleteServiceFromHistory,
  // Activity detail
  selectCalDay, downloadActivityFile, downloadFITFile, downloadGPXFile,
  toggleStreamLayer,
  // Goals
  goalNumStep, hideGoalForm, submitGoalForm, showGoalForm, deleteGoal,
  // Settings / data
  setWeatherModel, renderDashSectionToggles,
  openSettingsSubpage, closeSettingsSubpage, iosSettingsInit,
  // Vitality shader + Dashboard FAB gooey expand
  renderVitality, toggleDashFab,
  // Calendar create/edit event
  icuPost, icuPut, icuDelete, openCalEventModal, closeCalEventModal, saveCalEvent, deleteCalEvent,
  // Head-to-head compare
  setCompareTab, h2hSearch, h2hAddActivity, h2hRemoveActivity,
  // Similar rides & radar
  openSimilarRidesModal, closeSimilarRidesModal, renderPowerProfileRadar, switchPowerCurveUnit,
  // Activity search modal
  openActivitySearch, closeActivitySearch, clearActivitySearch,
  // Weather performance proxies
  actVal, fmtDate, fmtDist, fmtSpeed,
  C_TOOLTIP, C_TICK, C_GRID,
});

// ── Also expose constants ──
window.COGGAN_ZONES = COGGAN_ZONES;
window.ZONE_HEX = ZONE_HEX;

// ── Dashboard FAB gooey expand/collapse (legacy stub — pill nav replaces this) ──
function toggleDashFab(e) { /* replaced by dash-pill-nav */ }
function _closeDashFab() { /* replaced by dash-pill-nav */ }

// ── Pill nav active state ──
(function initPillNav() {
  const pillBtns = document.querySelectorAll('.dash-pill-btn');
  if (!pillBtns.length) return;
  // Highlight active tab based on current page
  function updatePillActive() {
    const cur = window._currentPage || 'dashboard';
    pillBtns.forEach(btn => {
      const lbl = btn.querySelector('span')?.textContent?.toLowerCase() || '';
      btn.classList.toggle('active', cur === lbl || (lbl === 'menu' && false));
    });
  }
  window.addEventListener('pagechange', updatePillActive);
  updatePillActive();
})();

// ── Bubble FAB physics ──
// bubbleFabs removed — FABs are static
if (false) (function bubbleFabs() {
  const fabIds = ['actSearchFab', 'calFab'];
  const fabs = fabIds.map(id => document.getElementById(id)).filter(Boolean);
  if (!fabs.length) return;

  const CFG = {
    attractRadius: 200, pullStrength: 0.08, maxDisplace: 20,
    returnSpring: 0.04, friction: 0.82, scaleFriction: 0.7,
    scaleSpring: 0.12, wobbleAmount: 0.18,
  };

  let globalMouseX = -9999, globalMouseY = -9999;

  const phys = fabs.map(() => ({
    posX: 0, posY: 0, velX: 0, velY: 0,
    scaleX: 1, scaleY: 1, sVelX: 0, sVelY: 0,
    restX: 0, restY: 0, restDirty: true, running: false,
  }));

  function isActive() { return true; }

  function calcRest(fab, s) {
    const r = fab.getBoundingClientRect();
    if (r.width === 0) return false;
    s.restX = r.left + r.width / 2 - s.posX;
    s.restY = r.top + r.height / 2 - s.posY;
    s.restDirty = false;
    return true;
  }

  function resetState(fab, s) {
    fab.style.removeProperty('transform');
    s.posX = s.posY = s.velX = s.velY = 0;
    s.scaleX = s.scaleY = 1; s.sVelX = s.sVelY = 0;
    s.running = false;
  }

  function makeTick(fab, s, idx) {
    return function tick() {
      // If this fab became inactive mid-animation, settle immediately
      if (!isActive()) { resetState(fab, s); return; }
      if (s.restDirty && !calcRest(fab, s)) { s.running = false; return; }

      const dx = globalMouseX - (s.restX + s.posX);
      const dy = globalMouseY - (s.restY + s.posY);
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < CFG.attractRadius && dist > 1) {
        const t = 1 - dist / CFG.attractRadius;
        const centerFade = Math.min(1, dist / 40);
        const strength = t * t * centerFade * CFG.pullStrength;
        s.velX += (dx / dist) * strength * CFG.maxDisplace;
        s.velY += (dy / dist) * strength * CFG.maxDisplace;

        const ang = Math.atan2(dy, dx);
        const wobble = t * centerFade * CFG.wobbleAmount;
        const stretchDir = 1 + wobble, squishDir = 1 - wobble * 0.5;
        const cx = Math.abs(Math.cos(ang)), cy = Math.abs(Math.sin(ang));
        s.sVelX += ((cx * stretchDir + (1 - cx) * squishDir) - s.scaleX) * CFG.scaleSpring;
        s.sVelY += ((cy * stretchDir + (1 - cy) * squishDir) - s.scaleY) * CFG.scaleSpring;
      }

      s.velX -= s.posX * CFG.returnSpring;
      s.velY -= s.posY * CFG.returnSpring;
      s.velX *= CFG.friction; s.velY *= CFG.friction;
      s.posX += s.velX; s.posY += s.velY;

      const len = Math.sqrt(s.posX * s.posX + s.posY * s.posY);
      if (len > CFG.maxDisplace) { s.posX *= CFG.maxDisplace / len; s.posY *= CFG.maxDisplace / len; }

      s.sVelX += (1 - s.scaleX) * CFG.scaleSpring;
      s.sVelY += (1 - s.scaleY) * CFG.scaleSpring;
      s.sVelX *= CFG.scaleFriction; s.sVelY *= CFG.scaleFriction;
      s.scaleX += s.sVelX; s.scaleY += s.sVelY;

      fab.style.setProperty('transform',
        `translate(${s.posX.toFixed(1)}px,${s.posY.toFixed(1)}px) scale(${s.scaleX.toFixed(3)},${s.scaleY.toFixed(3)})`,
        'important');

      const motion = Math.abs(s.velX) + Math.abs(s.velY) + Math.abs(s.posX) + Math.abs(s.posY) +
                     Math.abs(s.sVelX) + Math.abs(s.sVelY) + Math.abs(1 - s.scaleX) + Math.abs(1 - s.scaleY);
      if (motion > 0.05) {
        requestAnimationFrame(tick);
      } else {
        resetState(fab, s);
      }
    };
  }

  const tickers = fabs.map((fab, i) => makeTick(fab, phys[i], i));

  function startFab(i) {
    if (!isActive()) return;
    const s = phys[i];
    if (!s.running) { s.restDirty = true; s.running = true; requestAnimationFrame(tickers[i]); }
  }

  let _fabResizeT = 0;
  window.addEventListener('resize', () => {
    clearTimeout(_fabResizeT);
    _fabResizeT = setTimeout(() => phys.forEach(s => { s.restDirty = true; }), 120);
  }, { passive: true });

  // Desktop: mousemove drives all visible FABs (throttled to RAF)
  let _fabMoveRAF = 0;
  // Cache which FABs are visible — recompute on resize, not per mousemove
  let _fabVisible = fabs.map(() => true);
  function _refreshFabVis() { fabs.forEach((fab, i) => { _fabVisible[i] = fab.offsetWidth > 0; }); }
  _refreshFabVis();
  window.addEventListener('resize', _refreshFabVis, { passive: true });

  document.addEventListener('mousemove', e => {
    globalMouseX = e.clientX; globalMouseY = e.clientY;
    if (_fabMoveRAF) return;
    _fabMoveRAF = requestAnimationFrame(() => {
      _fabMoveRAF = 0;
      for (let i = 0; i < fabs.length; i++) { if (_fabVisible[i]) startFab(i); }
    });
  }, { passive: true });

  // Per-FAB events
  fabs.forEach((fab, i) => {
    fab.addEventListener('mouseleave', () => {
      if (!isActive()) return;
      const s = phys[i];
      s.velX += (Math.random() - 0.5) * 4; s.velY -= 3;
      s.sVelX += 0.12; s.sVelY -= 0.12;
      startFab(i);
    });
    fab.addEventListener('pointerdown', () => {
      if (!isActive()) return;
      const s = phys[i]; s.sVelX -= 0.2; s.sVelY -= 0.2; startFab(i);
    });
    fab.addEventListener('pointerup', () => {
      if (!isActive()) return;
      const s = phys[i]; s.sVelX += 0.25; s.sVelY += 0.25; s.velY -= 2; startFab(i);
    });
  });

  // ── Mobile idle breathing ──
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (isTouchDevice) {
    const breathStates = fabs.map(() => ({ phase: Math.random() * Math.PI * 2, breathing: false, timer: null }));

    function breathe(fabEl, bs, idx) {
      if (!bs.breathing || !isActive()) return;
      if (fabEl.offsetWidth === 0) { requestAnimationFrame(() => breathe(fabEl, bs, idx)); return; }
      bs.phase += 0.035;
      const s1 = Math.sin(bs.phase), s2 = Math.sin(bs.phase * 1.7 + 0.5);
      const bx = 1 + s1 * 0.03 + s2 * 0.015, by = 1 - s1 * 0.025 + s2 * 0.012;
      const fx = Math.sin(bs.phase * 0.6) * 2.5, fy = Math.cos(bs.phase * 0.8) * 2;
      fabEl.style.setProperty('transform',
        `translate(${fx.toFixed(1)}px,${fy.toFixed(1)}px) scale(${bx.toFixed(3)},${by.toFixed(3)})`, 'important');
      requestAnimationFrame(() => breathe(fabEl, bs, idx));
    }

    fabs.forEach((fab, i) => {
      const bs = breathStates[i];
      const startB = () => { if (!bs.breathing && isActive()) { bs.breathing = true; requestAnimationFrame(() => breathe(fab, bs, i)); } };
      const stopB = () => { bs.breathing = false; clearTimeout(bs.timer); bs.timer = setTimeout(startB, 2000); };
      fab.addEventListener('pointerdown', stopB);
      fab.addEventListener('pointerup', () => { clearTimeout(bs.timer); bs.timer = setTimeout(startB, 2000); });
      bs.timer = setTimeout(startB, 1500 + i * 300);
    });
  }
})();

/* ====================================================
   LOCAL FOLDER BACKUP  (File System Access API)
   Lets users pick a folder on their PC, save all data
   to cycleiq-backup.json, and restore on any new device.
==================================================== */
(function() {
  const FS_DB          = 'cycleiq_fshandles';
  const FS_STORE       = 'handles';
  const BACKUP_FILE    = 'cycleiq-backup.json';
  const LS_LAST_BACKUP = 'icu_local_backup_last';
  const LS_AUTO_BACKUP = 'icu_local_backup_auto';
  let _lbDirHandle     = null;

  // ── IndexedDB helpers for persisting the directory handle ──────
  function _lbOpenDB() {
    return new Promise((res, rej) => {
      const req = indexedDB.open(FS_DB, 1);
      req.onupgradeneeded = e => e.target.result.createObjectStore(FS_STORE, { keyPath: 'id' });
      req.onsuccess = e => res(e.target.result);
      req.onerror   = e => rej(e);
    });
  }
  async function _lbSaveHandle(handle) {
    try {
      const db = await _lbOpenDB();
      const tx = db.transaction(FS_STORE, 'readwrite');
      tx.objectStore(FS_STORE).put({ id: 'localBackupDir', handle });
      await new Promise(r => { tx.oncomplete = r; tx.onerror = r; });
    } catch(e) {}
  }
  async function _lbLoadHandle() {
    try {
      const db  = await _lbOpenDB();
      const tx  = db.transaction(FS_STORE, 'readonly');
      const req = tx.objectStore(FS_STORE).get('localBackupDir');
      return await new Promise(r => { req.onsuccess = e => r(e.target.result?.handle || null); req.onerror = () => r(null); });
    } catch(e) { return null; }
  }

  // ── UI ─────────────────────────────────────────────────────────
  function _lbUpdateUI() {
    const has = !!_lbDirHandle;
    ['lbBackupRow', 'lbRestoreRow', 'lbAutoRow'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = has ? '' : 'none';
    });
    const nameEl = document.getElementById('lbFolderName');
    if (nameEl) nameEl.textContent = has ? '📁 ' + _lbDirHandle.name : 'No folder selected';
    const lastEl = document.getElementById('lbLastBackup');
    if (lastEl) {
      const ts = localStorage.getItem(LS_LAST_BACKUP);
      lastEl.textContent = ts ? new Date(ts).toLocaleString() : 'Never';
    }
    const autoEl = document.getElementById('lbAutoToggle');
    if (autoEl) autoEl.checked = localStorage.getItem(LS_AUTO_BACKUP) === '1';
  }

  // ── Pick folder ────────────────────────────────────────────────
  async function _lbPickFolder() {
    if (!('showDirectoryPicker' in window)) { showToast('Not supported in this browser', 'error'); return; }
    try {
      const h = await window.showDirectoryPicker({ mode: 'readwrite', id: 'cycleiq-backup', startIn: 'documents' });
      _lbDirHandle = h;
      await _lbSaveHandle(h);
      _lbUpdateUI();
      if (window._fitOfflineInvalidate) _fitOfflineInvalidate(); // reset cached subfolder handle
      showToast('Folder selected: ' + h.name, 'success');
    } catch(e) { if (e.name !== 'AbortError') showToast('Could not select folder', 'error'); }
  }

  // ── Backup ─────────────────────────────────────────────────────
  async function _lbBackup() {
    if (!_lbDirHandle) return;
    const btn = document.getElementById('lbBackupBtn');
    if (btn) { btn.textContent = 'Saving…'; btn.disabled = true; }
    try {
      if (await _lbDirHandle.requestPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('Permission denied');
      const lsData = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        lsData[k] = localStorage.getItem(k);
      }
      const payload = JSON.stringify({ version: 1, app: 'CycleIQ', createdAt: new Date().toISOString(), localStorage: lsData }, null, 2);
      const fh = await _lbDirHandle.getFileHandle(BACKUP_FILE, { create: true });
      const w  = await fh.createWritable();
      await w.write(payload);
      await w.close();
      localStorage.setItem(LS_LAST_BACKUP, new Date().toISOString());
      _lbUpdateUI();
      showToast('Backup saved ✓', 'success');
    } catch(e) { showToast('Backup failed: ' + (e.message || e), 'error'); }
    finally { if (btn) { btn.textContent = 'Backup Now'; btn.disabled = false; } }
  }

  // ── Restore ────────────────────────────────────────────────────
  async function _lbRestore() {
    if (!_lbDirHandle) return;
    const btn = document.getElementById('lbRestoreBtn');
    if (btn) { btn.textContent = 'Restoring…'; btn.disabled = true; }
    try {
      if (await _lbDirHandle.requestPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('Permission denied');
      let fh;
      try { fh = await _lbDirHandle.getFileHandle(BACKUP_FILE); }
      catch(e) { throw new Error('No backup file found in this folder'); }
      const backup = JSON.parse(await (await fh.getFile()).text());
      if (!backup.localStorage) throw new Error('Invalid backup file');
      const skip = ['iosInstallDismissed', LS_LAST_BACKUP, LS_AUTO_BACKUP];
      Object.entries(backup.localStorage).forEach(([k, v]) => { if (!skip.includes(k)) localStorage.setItem(k, v); });
      showToast('Data restored — reloading…', 'success');
      setTimeout(() => window.location.reload(), 1500);
    } catch(e) { showToast('Restore failed: ' + (e.message || e), 'error'); }
    finally { if (btn) { btn.textContent = 'Restore'; btn.disabled = false; } }
  }

  // ── Auto-backup toggle ─────────────────────────────────────────
  function _lbSetAuto(checked) { localStorage.setItem(LS_AUTO_BACKUP, checked ? '1' : '0'); }

  // ── Called after every sync if auto-backup is on ───────────────
  async function _lbAutoBackupIfEnabled() {
    if (localStorage.getItem(LS_AUTO_BACKUP) !== '1' || !_lbDirHandle) return;
    try {
      if (await _lbDirHandle.queryPermission({ mode: 'readwrite' }) !== 'granted') return;
      await _lbBackup();
    } catch(e) {}
  }

  // ── Init: called whenever Settings page opens ──────────────────
  async function _lbInit() {
    const notSupEl = document.getElementById('lbNotSupportedRow');
    const pickBtn  = document.getElementById('lbPickFolderBtn');
    if (!('showDirectoryPicker' in window)) {
      if (notSupEl) notSupEl.style.display = '';
      if (pickBtn)  pickBtn.style.display  = 'none';
      return;
    }
    if (!_lbDirHandle) {
      const saved = await _lbLoadHandle();
      if (saved) { try { _lbDirHandle = saved; } catch(e) { _lbDirHandle = null; } }
    }
    _lbUpdateUI();
    // Wire buttons once
    const pickEl    = document.getElementById('lbPickFolderBtn');
    const backupEl  = document.getElementById('lbBackupBtn');
    const restoreEl = document.getElementById('lbRestoreBtn');
    const autoEl    = document.getElementById('lbAutoToggle');
    if (pickEl    && !pickEl._lbWired)    { pickEl.addEventListener('click',    _lbPickFolder); pickEl._lbWired = true; }
    if (backupEl  && !backupEl._lbWired)  { backupEl.addEventListener('click',  _lbBackup);     backupEl._lbWired = true; }
    if (restoreEl && !restoreEl._lbWired) { restoreEl.addEventListener('click', _lbRestore);    restoreEl._lbWired = true; }
    if (autoEl    && !autoEl._lbWired)    { autoEl.addEventListener('change', e => _lbSetAuto(e.target.checked)); autoEl._lbWired = true; }
  }

  // Lazily ensure the dir handle is loaded from IDB even if Settings was never visited
  window._lbEnsureHandle = async function() {
    if (_lbDirHandle) return _lbDirHandle;
    const saved = await _lbLoadHandle();
    if (saved) _lbDirHandle = saved;
    return _lbDirHandle;
  };

  // Expose for settings page navigate hook, post-sync hook, and FIT cache module
  window._lbInit                = _lbInit;
  window._lbAutoBackupIfEnabled = _lbAutoBackupIfEnabled;
  window._lbGetDirHandle        = () => _lbDirHandle;
})();

// ── Offline FIT / Stream Cache ──────────────────────────────────────────────
// When a user opens an activity the first time we:
//  1. Save streams + detail JSON to <backup-folder>/activities/{id}-streams.json
//  2. Download the raw FIT binary to <backup-folder>/activities/{id}.fit
// On subsequent visits (any device with the same folder) we serve from local files,
// never hitting intervals.icu again for that activity.
(function() {
  let _activitiesDir = null; // cached handle to the 'activities/' subfolder

  async function _getDir() {
    if (_activitiesDir) return _activitiesDir;
    // Use _lbEnsureHandle so the dir is available even if Settings was never visited
    const root = window._lbEnsureHandle ? await _lbEnsureHandle() : (window._lbGetDirHandle && window._lbGetDirHandle());
    if (!root) return null;
    try {
      // Don't query/request permission explicitly — just attempt the operation.
      // If permission was previously granted it works; if not, the catch handles it silently.
      _activitiesDir = await root.getDirectoryHandle('activities', { create: true });
      return _activitiesDir;
    } catch(e) { console.warn('[FIT cache] _getDir failed:', e); return null; }
  }

  // Read JSON from activities/{id}-{type}.json
  async function _read(id, type) {
    try {
      const dir = await _getDir();
      if (!dir) return null;
      const fh   = await dir.getFileHandle(`${id}-${type}.json`);
      const file = await fh.getFile();
      return JSON.parse(await file.text());
    } catch(e) { return null; }
  }

  // Write JSON to activities/{id}-{type}.json — skips if already saved (no API calls, no rewrites)
  async function _save(id, type, data) {
    try {
      const dir = await _getDir();
      if (!dir) return;
      // Skip if file already exists — avoids redundant writes on every activity open
      try { await dir.getFileHandle(`${id}-${type}.json`); return; } catch(e) {}
      const fh = await dir.getFileHandle(`${id}-${type}.json`, { create: true });
      const w  = await fh.createWritable();
      await w.write(JSON.stringify(data));
      await w.close();
    } catch(e) { console.warn('[FIT cache] _save failed:', e); }
  }

  // Download raw FIT binary to activities/{id}.fit (skips if already saved)
  async function _saveFit(id) {
    try {
      const dir = await _getDir();
      if (!dir) return;
      // Skip if file already exists
      try { await dir.getFileHandle(`${id}.fit`); return; } catch(e) {}
      // Try the same URL patterns fetchFitFile uses
      const headers = { ...authHeader(), 'Accept': 'application/octet-stream' };
      const urls = [
        ICU_BASE + `/activity/${id}.fit`,
        ICU_BASE + `/athlete/${state.athleteId}/activities/${id}.fit`,
        ICU_BASE + `/activity/${id}/original`,
        ICU_BASE + `/athlete/${state.athleteId}/activities/${id}/original`,
      ];
      let buf = null;
      for (const url of urls) {
        try {
          const res = await fetch(url, { headers });
          if (res.ok) { rlTrackRequest(); buf = await res.arrayBuffer(); break; }
        } catch(e) {}
      }
      if (!buf) return;
      const fh = await dir.getFileHandle(`${id}.fit`, { create: true });
      const w  = await fh.createWritable();
      await w.write(buf);
      await w.close();
    } catch(e) { console.warn('[FIT cache] _saveFit failed:', e); }
  }

  // ── Routes subfolder ─────────────────────────────────────────────────────
  let _routesDir = null;

  async function _getRoutesDir() {
    if (_routesDir) return _routesDir;
    const root = window._lbEnsureHandle ? await _lbEnsureHandle() : (window._lbGetDirHandle && window._lbGetDirHandle());
    if (!root) return null;
    try {
      _routesDir = await root.getDirectoryHandle('routes', { create: true });
      return _routesDir;
    } catch(e) { console.warn('[Route cache] _getRoutesDir failed:', e); return null; }
  }

  // Save a single route object to routes/{id}.json
  async function _saveRoute(route) {
    if (!route || !route.id) return;
    try {
      const dir = await _getRoutesDir();
      if (!dir) return;
      const fh = await dir.getFileHandle(`${route.id}.json`, { create: true });
      const w  = await fh.createWritable();
      await w.write(JSON.stringify(route));
      await w.close();
    } catch(e) { console.warn('[Route cache] _saveRoute failed:', e); }
  }

  // Delete routes/{id}.json when a route is deleted in-app
  async function _deleteRoute(id) {
    try {
      const dir = await _getRoutesDir();
      if (!dir) return;
      await dir.removeEntry(`${id}.json`);
    } catch(e) { /* silent — file may not exist yet */ }
  }

  // Read every .json file from routes/ and return as array
  async function _loadAllRoutes() {
    try {
      const dir = await _getRoutesDir();
      if (!dir) return [];
      const routes = [];
      for await (const [name, handle] of dir.entries()) {
        if (handle.kind !== 'file' || !name.endsWith('.json')) continue;
        try {
          const file  = await handle.getFile();
          const route = JSON.parse(await file.text());
          if (route && route.id) routes.push(route);
        } catch(e) {}
      }
      return routes;
    } catch(e) { console.warn('[Route cache] _loadAllRoutes failed:', e); return []; }
  }

  // Called when the user picks a new backup folder so we re-resolve both subfolders
  function _invalidateDir() { _activitiesDir = null; _routesDir = null; }

  // ── Activity list ─────────────────────────────────────────────────────────
  // Saved as activities-list.json at the root of the backup folder (not in activities/)
  async function _saveActivityList(activities, lastSync) {
    try {
      const root = window._lbEnsureHandle ? await _lbEnsureHandle() : (window._lbGetDirHandle && window._lbGetDirHandle());
      if (!root) return;
      const fh = await root.getFileHandle('activities-list.json', { create: true });
      const w  = await fh.createWritable();
      await w.write(JSON.stringify({ activities, lastSync }));
      await w.close();
    } catch(e) { console.warn('[FIT cache] _saveActivityList failed:', e); }
  }

  async function _loadActivityList() {
    try {
      const root = window._lbEnsureHandle ? await _lbEnsureHandle() : (window._lbGetDirHandle && window._lbGetDirHandle());
      if (!root) return null;
      const fh   = await root.getFileHandle('activities-list.json');
      const file = await fh.getFile();
      const data = JSON.parse(await file.text());
      if (data && Array.isArray(data.activities) && data.activities.length > 0) return data;
    } catch(e) {}
    return null;
  }

  window._fitOfflineRead         = _read;
  window._fitOfflineSave         = _save;
  window._fitOfflineSaveFit      = _saveFit;
  window._fitOfflineInvalidate   = _invalidateDir;
  window._routeOfflineSave       = _saveRoute;
  window._routeOfflineDelete     = _deleteRoute;
  window._routeOfflineLoadAll    = _loadAllRoutes;
  window._localSaveActivityList  = _saveActivityList;
  window._localLoadActivityList  = _loadActivityList;
})();

// ── Deferred initial navigation ──
// Placed at the very end so all const declarations (e.g. _hm, _poll) are initialized.
navigate(_startPage);
// Restore activity detail page if the user was viewing one before refresh
if (_initRoute && _initRoute.type === 'activity' && _initRoute.actId) {
  const _restoredAct = (state.activities || []).find(a => String(a.id) === String(_initRoute.actId));
  if (_restoredAct) navigateToActivity(_restoredAct);
}
