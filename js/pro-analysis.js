/* ══════════════════════════════════════════════════════════════
   PRO ANALYSIS MODULE — Lazy-loaded fullscreen activity workbench
   Only loaded when user clicks the Pro Analysis FAB on desktop.
══════════════════════════════════════════════════════════════ */

const PRO_STREAMS = [
  { key: 'watts',          label: 'Power',        unit: 'W',    color: '#00e5a0' },
  { key: 'heartrate',      label: 'Heart Rate',   unit: 'bpm',  color: '#ff6b35' },
  { key: 'cadence',        label: 'Cadence',      unit: 'rpm',  color: '#4a9eff' },
  { key: 'velocity_smooth',label: 'Speed',        unit: 'km/h', color: '#f0c429' },
  { key: 'altitude',       label: 'Elevation',    unit: 'm',    color: '#9b59ff' },
  { key: 'temp',           label: 'Temperature',  unit: '°C',   color: '#ff9500' },
  { key: 'lrbalance',      label: 'L/R Balance',  unit: '%',    color: '#ff69b4' },
  { key: 'grade_smooth',   label: 'Gradient',     unit: '%',    color: '#8b5cf6' },
  { key: 'wbal',           label: "W' Balance",   unit: 'kJ',   color: '#e74c3c', computed: true },
  { key: 'ef',             label: 'Efficiency',   unit: 'W/bpm',color: '#2ecc71', computed: true },
  { key: 'gear_ratio',     label: 'Gear Ratio',   unit: '',     color: '#95a5a6', computed: true },
];

let _proChart = null;
let _proStreams = null;
let _proActivity = null;
let _proIntervals = null;
let _proActiveStreams = new Set(['watts', 'heartrate']);
let _proXAxis = 'time'; // 'time' | 'distance'
let _proSmoothing = 5;
let _proShowZones = false;
let _proShowIntervals = false;
let _proShowLaps = false;
let _proShowClimbs = false;
let _proBrushStart = null;
let _proClimbs = null;
let _proBrushEnd = null;
let _proChartMode = 'timeseries'; // 'timeseries' | 'histogram'
let _proStacked = false;
let _proStackedCharts = [];
let _playInterval = null;
let _playIdx = 0;
const PLAY_SPEEDS = [1, 2, 5, 10, 20, 50];
let _playSpeedIdx = 0;
let _proLineWidth = 1.5;
let _proOpacity = 1;
let _proFillOpacity = 0;
let _proZoomLevel = 1;
let _proFatigueThreshold = 0; // 0 = off, 0.1–1 = filter intensity
let _proAnomalySensitivity = 0; // 0 = off, 0.1–1 = highlight sensitivity
let _proDensity = 1; // 1 = all points, 0.1 = every 10th point
let _proCompareStreams = null;
let _proCompareActivity = null;
let _proLaps = null;
let _proKeyHandler = null; // named ref for cleanup
const _smoothCache = new Map(); // cache smoothed arrays

/* ── Shared Helpers ─────────────────────────────────── */
function _fmtTime(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function _fmtStreamVal(val, unit) {
  if (val == null) return '—';
  const noDecimal = ['bpm', 'rpm', 'm', 'W', '%'].includes(unit);
  return noDecimal ? Math.round(val) : (Math.round(val * 100) / 100);
}

function _buildXLabels() {
  const time = _proStreams?.time || [];
  const dist = _proStreams?.distance || [];
  let labels = _proXAxis === 'distance' && dist.length
    ? dist.map(d => (d / 1000).toFixed(1))
    : time.map(t => _fmtTime(t));
  if (_proDensity < 1 && labels.length > 100) {
    const nth = Math.max(1, Math.round(1 / _proDensity));
    labels = labels.filter((_, i) => i % nth === 0);
  }
  return labels;
}

function _smoothCached(data, key, win) {
  if (!data || win <= 1) return data;
  const ck = `${key}_${win}`;
  if (_smoothCache.has(ck)) return _smoothCache.get(ck);
  const result = _smooth(data, win);
  _smoothCache.set(ck, result);
  return result;
}

function _activateCrosshairAtIndex(idx) {
  if (!_proChart) return;
  const n = _proChart.data.datasets.length;
  const els = [];
  let pt = null;
  for (let di = 0; di < n; di++) {
    const m = _proChart.getDatasetMeta(di);
    if (m?.data?.[idx]) {
      els.push({ datasetIndex: di, index: idx });
      if (!pt) pt = m.data[idx];
    }
  }
  if (pt && els.length) {
    _proChart.tooltip.setActiveElements(els, { x: pt.x, y: pt.y });
    _proChart.setActiveElements(els);
    _proChart.update('none');
  }
}

const ZONE_COLORS = [
  { min: 0,   max: 0.55, color: 'rgba(74,158,255,0.06)',  label: 'Z1' },
  { min: 0.55,max: 0.75, color: 'rgba(0,229,160,0.06)',   label: 'Z2' },
  { min: 0.75,max: 0.90, color: 'rgba(240,196,41,0.06)',  label: 'Z3' },
  { min: 0.90,max: 1.05, color: 'rgba(255,149,0,0.06)',   label: 'Z4' },
  { min: 1.05,max: 1.20, color: 'rgba(255,69,58,0.06)',   label: 'Z5' },
  { min: 1.20,max: 2.00, color: 'rgba(175,82,222,0.06)',  label: 'Z6' },
];

/* ── Init ─────────────────────────────────────────────── */
function _proInit(streams, activity, intervals) {
  _proStreams = streams;
  _proActivity = activity;
  _proIntervals = intervals;
  _proLaps = activity?.icu_laps || activity?.laps || null;

  // Compute derived channels
  _computeDerivedStreams();

  // Set default active streams — always show elevation + first available data stream
  _proActiveStreams.clear();
  if (_proStreams.altitude?.length) _proActiveStreams.add('altitude');
  if (_proStreams.watts?.length) _proActiveStreams.add('watts');
  else if (_proStreams.heartrate?.length) _proActiveStreams.add('heartrate');

  _smoothCache.clear();
  _proClimbs = null;
  _buildStreamList();
  _buildChart();
  _updateStats();
  _bindControls();
  _initRangeBar();

  // Refresh rides panel if open
  const rp = document.getElementById('proRidesPanel');
  if (rp && rp.classList.contains('pro-rides-open')) {
    setTimeout(() => {
      const rl = document.getElementById('proRidesList');
      if (rl && window._proPopulateRides) window._proPopulateRides();
    }, 100);
  }

  console.info('[ProAnalysis] Initialized with', Object.keys(streams || {}).length, 'stream keys');
}

/* ── Compute derived streams (W'bal, EF, gear ratio) ── */
function _computeDerivedStreams() {
  if (!_proStreams) return;
  const watts = _proStreams.watts;
  const hr = _proStreams.heartrate;
  const speed = _proStreams.velocity_smooth;
  const cadence = _proStreams.cadence;
  const time = _proStreams.time;

  // W'bal (Skiba differential model)
  // W' = anaerobic capacity (default 20kJ), CP = critical power (use FTP as proxy)
  if (watts && watts.length > 0) {
    const cp = _proActivity?.icu_ftp || _proActivity?.ftp || 200;
    const wPrime = 20000; // 20kJ default W'
    const wbal = new Array(watts.length);
    wbal[0] = wPrime;
    for (let i = 1; i < watts.length; i++) {
      const dt = (time && time[i] && time[i-1]) ? (time[i] - time[i-1]) : 1;
      const p = watts[i] || 0;
      if (p > cp) {
        // Depleting
        wbal[i] = wbal[i-1] - (p - cp) * dt;
      } else {
        // Recovering: exponential recharge
        const tau = 546 * Math.exp(-0.01 * (cp - p)) + 316;
        wbal[i] = wbal[i-1] + (wPrime - wbal[i-1]) * (1 - Math.exp(-dt / tau));
      }
      wbal[i] = Math.max(0, Math.min(wPrime, wbal[i]));
    }
    // Convert to kJ for display
    _proStreams.wbal = wbal.map(v => v / 1000);
  }

  // Efficiency Factor (Power / HR)
  if (watts && hr && watts.length === hr.length) {
    _proStreams.ef = watts.map((w, i) => {
      const h = hr[i];
      return (w > 0 && h > 60) ? Math.round((w / h) * 100) / 100 : null;
    });
  }

  // Gear ratio approximation (speed / cadence)
  if (speed && cadence && speed.length === cadence.length) {
    _proStreams.gear_ratio = speed.map((s, i) => {
      const c = cadence[i];
      return (s > 1 && c > 20) ? Math.round((s / c) * 100) / 100 : null;
    });
  }
}
window._proInit = _proInit;

/* ── Close / Cleanup ──────────────────────────────────── */
function _proClose() {
  if (_proChart) {
    _proChart.destroy();
    _proChart = null;
  }
  _proStreams = null;
  _proActivity = null;
  _proIntervals = null;
  _proLaps = null;
  _proClimbs = null;
  _proCompareStreams = null;
  _proCompareActivity = null;
  _proBrushStart = null;
  _proBrushEnd = null;
  _proChartMode = 'timeseries';
  _proStacked = false;
  _destroyStackedCharts();
  // Stop playback
  if (_playInterval) { clearInterval(_playInterval); _playInterval = null; }
  // Remove keyboard listener
  if (_proKeyHandler) { document.removeEventListener('keydown', _proKeyHandler); _proKeyHandler = null; }
  // Clean tooltip DOM
  document.getElementById('proTooltip')?.remove();
  // Clear smooth cache
  _smoothCache.clear();
  // Reset range bar state
  _rS = 0; _rE = 1; _rangeBound = false;
}
window._proClose = _proClose;

/* ── Stacked charts — each stream in its own horizontal strip ── */
function _destroyStackedCharts() {
  for (const c of _proStackedCharts) c.destroy();
  _proStackedCharts = [];
  const container = document.getElementById('proStackedWrap');
  if (container) container.remove();
}

function _buildStackedCharts() {
  _destroyStackedCharts();
  // Hide main chart
  if (_proChart) { _proChart.destroy(); _proChart = null; }
  const mainCanvas = document.getElementById('proAnalysisChart');
  if (mainCanvas) mainCanvas.style.display = 'none';

  const wrap = document.createElement('div');
  wrap.id = 'proStackedWrap';
  wrap.style.cssText = 'position:absolute;inset:0;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding:12px 16px';
  mainCanvas.parentElement.appendChild(wrap);

  // Build labels (shared X axis)
  const timeArr = _proStreams?.time;
  const distArr = _proStreams?.distance;
  const xLabels = _proXAxis === 'distance' && distArr
    ? distArr.map(d => (d / 1000).toFixed(1))
    : (timeArr || []).map(t => {
        const m = Math.floor(t / 60), s = Math.floor(t % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
      });

  const activeStreams = PRO_STREAMS.filter(s => _proActiveStreams.has(s.key) && _proStreams[s.key]?.length);
  const minStripHeight = 120;
  const availH = wrap.parentElement?.clientHeight || 600;
  const stripHeight = Math.max(minStripHeight, Math.floor((availH - activeStreams.length * 24) / Math.max(activeStreams.length, 1)));

  for (const s of activeStreams) {
    // Title above strip
    const titleEl = document.createElement('div');
    titleEl.style.cssText = `font-size:13px;font-weight:600;color:${s.color};padding:0 4px;font-family:var(--font-num)`;
    titleEl.textContent = s.label;
    wrap.appendChild(titleEl);

    const strip = document.createElement('div');
    strip.style.cssText = `min-height:${stripHeight}px;height:${stripHeight}px;flex-shrink:0;position:relative;background:rgba(255,255,255,0.02);border-radius:6px;overflow:hidden`;
    const canvas = document.createElement('canvas');
    strip.appendChild(canvas);
    wrap.appendChild(strip);

    const data = _smoothCached(_proStreams[s.key], s.key, _proSmoothing);
    const chart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: xLabels,
        datasets: [{
          label: s.label,
          data: data,
          borderColor: s.color,
          backgroundColor: s.color + '18',
          fill: true,
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.2,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false, axis: 'x' },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: false,
            external: (context) => {
              const { chart: c, tooltip: tt } = context;
              let el = c.canvas.parentElement.querySelector('.pro-stack-tip');
              if (!el) {
                el = document.createElement('div');
                el.className = 'pro-stack-tip';
                c.canvas.parentElement.appendChild(el);
              }
              if (tt.opacity === 0) { el.style.opacity = '0'; return; }
              el.style.opacity = '1';
              const items = tt.dataPoints || [];
              if (!items.length) { el.style.opacity = '0'; return; }
              const item = items[0];
              const val = item.parsed?.y;
              if (val == null) { el.style.opacity = '0'; return; }
              const noDecimal = ['bpm', 'rpm', 'm', 'W', '%'].includes(s.unit);
              el.style.background = s.color;
              el.style.borderColor = s.color;
              el.innerHTML = `<span style="color:#000;font-weight:700">${noDecimal ? Math.round(val) : (Math.round(val * 10) / 10)}</span><span style="color:rgba(0,0,0,0.5);margin-left:3px">${s.unit}</span>`;
              const cx = tt.caretX || 0;
              const elW = el.offsetWidth || 60;
              let xp = cx + 12;
              if (xp + elW > c.width) xp = cx - elW - 12;
              el.style.left = xp + 'px';
              el.style.top = '4px';
            }
          },
        },
        scales: {
          x: {
            display: true,
            ticks: { color: 'rgba(255,255,255,0.3)', maxTicksLimit: 15, font: { size: 9 } },
            grid: { color: 'rgba(255,255,255,0.04)' },
          },
          y: {
            display: true,
            position: 'left',
            ticks: {
              color: s.color + 'aa',
              font: { size: 9, family: 'var(--font-num)' },
              maxTicksLimit: 4,
              callback: (v, i) => i === 0 ? s.unit : Math.round(v),
            },
            grid: { color: 'rgba(255,255,255,0.04)' },
          }
        }
      }
    });


    _proStackedCharts.push(chart);
  }

  // Update stats bar
  _updateStats();
}

/* ── Build sidebar stream list ────────────────────────── */
function _buildStreamList() {
  const list = document.getElementById('proStreamList');
  if (!list) return;

  list.innerHTML = PRO_STREAMS.map(s => {
    const hasData = _proStreams?.[s.key]?.length > 0;
    const isActive = _proActiveStreams.has(s.key);
    return `<div class="pro-stream-chip ${isActive ? 'active' : ''} ${!hasData ? 'pro-stream-disabled' : ''}"
                 data-stream="${s.key}" onclick="_proToggleStream('${s.key}')">
      <div class="pro-stream-dot" style="background:${s.color}${!hasData ? ';opacity:0.2' : ''}"></div>
      <span class="pro-stream-name">${s.label}</span>
      <svg class="pro-stream-eye icon" width="16" height="16"><use href="icons.svg#icon-eye"/></svg>
    </div>`;
  }).join('');
}

/* ── Toggle stream on/off ─────────────────────────────── */
function _proToggleStream(key) {
  const hasData = _proStreams?.[key]?.length > 0;
  if (!hasData) return;

  if (_proActiveStreams.has(key)) {
    _proActiveStreams.delete(key);
  } else {
    _proActiveStreams.add(key);
  }

  // Update chip UI
  const chip = document.querySelector(`.pro-stream-chip[data-stream="${key}"]`);
  if (chip) chip.classList.toggle('active', _proActiveStreams.has(key));

  // Rebuild chart — stop playback if active
  if (_playInterval) { clearInterval(_playInterval); _playInterval = null; }
  if (_proStacked) _buildStackedCharts(); else _buildChart();
  _updateStats();
}
window._proToggleStream = _proToggleStream;

/* ── Smooth data with moving average ──────────────────── */
function _smooth(data, win) {
  if (!data || win <= 1) return data;
  const n = data.length, out = new Array(n);
  const half = Math.floor(win / 2);
  for (let i = 0; i < n; i++) {
    let sum = 0, cnt = 0;
    const lo = Math.max(0, i - half), hi = Math.min(n - 1, i + half);
    for (let j = lo; j <= hi; j++) {
      if (data[j] != null && !isNaN(data[j])) { sum += data[j]; cnt++; }
    }
    out[i] = cnt > 0 ? sum / cnt : null;
  }
  return out;
}

/* ── Build the multi-axis chart ───────────────────────── */
function _buildChart() {
  if (_proChart) { _proChart.destroy(); _proChart = null; }

  const canvas = document.getElementById('proAnalysisChart');
  if (!canvas || !_proStreams) return;

  const time = _proStreams.time || [];
  const dist = _proStreams.distance || [];
  const len = time.length;
  if (len === 0) return;

  // Build x-axis labels
  let labels = _proXAxis === 'distance'
    ? dist.map(d => (d / 1000).toFixed(1))
    : time.map(t => {
        const m = Math.floor(t / 60), s = Math.floor(t % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
      });
  // Downsample labels to match data density
  if (_proDensity < 1 && labels.length > 100) {
    const nth = Math.max(1, Math.round(1 / _proDensity));
    labels = labels.filter((_, i) => i % nth === 0);
  }

  // Detect climbs — cache, only compute once per activity
  if (!_proClimbs) {
    _proClimbs = _detectClimbs(
      _proStreams.altitude,
      _proStreams.distance,
      _proStreams.grade_smooth
    );
  }

  // Build datasets + axes
  const datasets = [];
  const scales = {};
  const isHist = _proChartMode === 'histogram';

  if (isHist) {
    // Histogram mode — bar chart of value distribution
    const firstStream = PRO_STREAMS.find(s => _proActiveStreams.has(s.key) && _proStreams[s.key]?.length);
    if (!firstStream) return;
    const raw = _proStreams[firstStream.key];
    const vals = raw.filter(v => v != null && !isNaN(v));
    if (vals.length < 10) return;
    let min = Infinity, max = -Infinity;
    for (const v of vals) { if (v < min) min = v; if (v > max) max = v; }
    min = Math.floor(min); max = Math.ceil(max);
    if (max <= min) max = min + 1;
    const binCount = Math.min(25, Math.max(10, max - min));
    const binSize = (max - min) / binCount;
    const bins = new Array(binCount).fill(0);
    const binLabels = [];
    // Single pass binning
    for (const v of vals) {
      const bi = Math.min(Math.floor((v - min) / binSize), binCount - 1);
      if (bi >= 0) bins[bi]++;
    }
    for (let i = 0; i < binCount; i++) {
      binLabels.push(Math.round(min + i * binSize));
    }
    // Convert seconds count to minutes
    const timeBins = bins.map(b => Math.round(b / 60 * 10) / 10);

    datasets.push({
      label: firstStream.label,
      data: timeBins,
      backgroundColor: firstStream.color + '80',
      borderColor: firstStream.color,
      borderWidth: 1,
      barPercentage: 0.95,
      categoryPercentage: 1.0,
    });

    // Compare overlay histogram
    if (_proCompareStreams) {
      const compRaw = _proCompareStreams[firstStream.key === 'watts' ? 'watts' : firstStream.key];
      if (compRaw?.length) {
        const compBins = new Array(binCount).fill(0);
        for (const v of compRaw.filter(v => v != null && v > 0)) {
          const bi = Math.min(Math.floor((v - min) / binSize), binCount - 1);
          if (bi >= 0 && bi < binCount) compBins[bi]++;
        }
        datasets.push({
          label: `${firstStream.label} (compare)`,
          data: compBins.map(b => Math.round(b / 60 * 10) / 10),
          backgroundColor: 'rgba(255,255,255,0.15)',
          borderColor: 'rgba(255,255,255,0.4)',
          borderWidth: 1,
          barPercentage: 0.95,
          categoryPercentage: 1.0,
        });
      }
    }

    labels.length = 0;
    labels.push(...binLabels.map(String));
    scales.x = {
      display: true,
      ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 11 } },
      grid: { color: 'rgba(255,255,255,0.08)' },
      title: { display: true, text: firstStream.unit, color: 'rgba(255,255,255,0.3)', font: { size: 11 } }
    };
    scales.y = {
      display: true,
      ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 10 }, callback: v => Math.round(v) + 'm' },
      grid: { color: 'rgba(255,255,255,0.08)' },
      title: { display: true, text: 'minutes', color: 'rgba(255,255,255,0.3)', font: { size: 11 } }
    };
  } else {
    // Timeseries mode
    scales.x = {
      display: true,
      ticks: { color: 'rgba(255,255,255,0.4)', maxTicksLimit: 20, font: { size: 11 } },
      grid: { color: 'rgba(255,255,255,0.08)' },
      title: { display: true, text: _proXAxis === 'distance' ? 'km' : 'time', color: 'rgba(255,255,255,0.3)', font: { size: 11 } }
    };

    let axisIdx = 0;
    const alphaHex = Math.round(_proOpacity * 255).toString(16).padStart(2, '0');
    const fillAlpha = Math.round(_proFillOpacity * 255).toString(16).padStart(2, '0');
    for (const s of PRO_STREAMS) {
      if (!_proActiveStreams.has(s.key)) continue;
      const raw = _proStreams[s.key];
      if (!raw || raw.length === 0) continue;

      let data = _smoothCached(raw, s.key, _proSmoothing);
      // Data density — downsample for performance
      if (_proDensity < 1 && data.length > 100) {
        const nth = Math.max(1, Math.round(1 / _proDensity));
        data = data.filter((_, i) => i % nth === 0);
      }
      const axisId = `y_${s.key}`;
      const isLeft = axisIdx % 2 === 0;

      datasets.push({
        label: s.label,
        data: data,
        borderColor: s.color + alphaHex,
        backgroundColor: s.color + fillAlpha,
        borderWidth: _proLineWidth,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: s.color,
        tension: 0.2,
        fill: _proFillOpacity > 0 || s.key === 'altitude',
        yAxisID: axisId,
      });

      scales[axisId] = {
        type: 'linear',
        position: isLeft ? 'left' : 'right',
        display: true,
        grid: { drawOnChartArea: axisIdx === 0, color: 'rgba(255,255,255,0.04)' },
        ticks: {
          color: s.color + '99',
          font: { size: 10 },
          callback: (v, i) => i === 0 ? s.unit : Math.round(v),
        },
        title: { display: false },
      };
      axisIdx++;
    }

    // Add compare streams as dashed overlays
    if (_proCompareStreams && !isHist) {
      for (const s of PRO_STREAMS) {
        if (!_proActiveStreams.has(s.key)) continue;
        const compKey = s.key === 'watts' ? 'watts' : s.key;
        const compRaw = _proCompareStreams[compKey];
        if (!compRaw?.length) continue;
        const axisId = `y_${s.key}`;
        datasets.push({
          label: `${s.label} (compare)`,
          data: _smoothCached(compRaw, 'comp_' + s.key, _proSmoothing),
          borderColor: s.color + '60',
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderDash: [5, 3],
          pointRadius: 0,
          tension: 0.2,
          fill: false,
          yAxisID: axisId,
        });
      }
    }
  }

  if (datasets.length === 0) return;

  // Zone shading plugin (draws colored bands behind data)
  const zonePlugin = {
    id: 'proZoneShading',
    beforeDraw(chart) {
      if (!_proShowZones || !_proActiveStreams.has('watts')) return;
      const ftp = _proActivity?.icu_ftp || _proActivity?.ftp || 200;
      const yAxis = chart.scales['y_watts'];
      if (!yAxis) return;
      const ctx = chart.ctx;
      const { left, right } = chart.chartArea;
      for (const z of ZONE_COLORS) {
        const top = yAxis.getPixelForValue(z.max * ftp);
        const bot = yAxis.getPixelForValue(z.min * ftp);
        ctx.fillStyle = z.color;
        ctx.fillRect(left, Math.max(top, chart.chartArea.top), right - left, Math.min(bot, chart.chartArea.bottom) - Math.max(top, chart.chartArea.top));
      }
    }
  };

  // Interval marker plugin (draws vertical bands for work intervals)
  const intervalPlugin = {
    id: 'proIntervalMarkers',
    afterDraw(chart) {
      if (!_proShowIntervals || !_proIntervals?.length) return;
      const ctx = chart.ctx;
      const xAxis = chart.scales.x;
      const { top, bottom } = chart.chartArea;
      const totalLabels = labels.length;
      if (totalLabels === 0) return;
      ctx.save();
      for (const ivl of _proIntervals) {
        // Show work intervals as orange bands, rest as subtle
        const isWork = (ivl.type === 'WORK' || ivl.type === 'work');
        const si = ivl.start_index ?? 0;
        const ei = ivl.end_index ?? si;
        if (si >= totalLabels) continue;
        const x1 = xAxis.getPixelForValue(Math.min(si, totalLabels - 1));
        const x2 = xAxis.getPixelForValue(Math.min(ei, totalLabels - 1));
        // Band fill
        ctx.fillStyle = isWork ? 'rgba(255,107,53,0.10)' : 'rgba(0,229,160,0.04)';
        ctx.fillRect(x1, top, x2 - x1, bottom - top);
        // Left edge
        if (isWork) {
          ctx.strokeStyle = 'rgba(255,107,53,0.35)';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.beginPath(); ctx.moveTo(x1, top); ctx.lineTo(x1, bottom); ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      ctx.restore();
    }
  };

  // Lap marker plugin (thin white dashed lines at lap boundaries)
  const lapPlugin = {
    id: 'proLapMarkers',
    afterDraw(chart) {
      if (!_proShowLaps || !_proLaps?.length) return;
      const ctx = chart.ctx;
      const xAxis = chart.scales.x;
      const { top, bottom } = chart.chartArea;
      const timeArr = _proStreams?.time;
      if (!timeArr) return;
      ctx.save();
      let cumTime = 0;
      for (let li = 0; li < _proLaps.length; li++) {
        const lap = _proLaps[li];
        cumTime += (lap.elapsed_time || lap.moving_time || 0);
        // Find the closest index
        let idx = 0;
        for (let j = 0; j < timeArr.length; j++) {
          if (timeArr[j] >= cumTime) { idx = j; break; }
        }
        if (idx <= 0 || idx >= labels.length - 1) continue;
        const x = xAxis.getPixelForValue(idx);
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
        // Lap number label
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = '10px var(--font-num)';
        ctx.textAlign = 'center';
        ctx.fillText(`L${li + 1}`, x, top + 12);
      }
      ctx.restore();
    }
  };

  // Climb detection — find sustained uphill segments
  function _detectClimbs(altArr, distArr, gradeArr) {
    if (!altArr?.length || !distArr?.length) return [];
    const climbs = [];
    let inClimb = false, startIdx = 0, startAlt = 0;
    const MIN_GAIN = 20; // min 20m elevation gain
    const MIN_GRADE = 2; // min 2% average gradient

    for (let i = 1; i < altArr.length; i++) {
      const grade = gradeArr?.[i] ?? ((altArr[i] - altArr[i-1]) / ((distArr[i] - distArr[i-1]) * 1000 || 1) * 100);
      if (!inClimb && grade >= MIN_GRADE) {
        inClimb = true;
        startIdx = i;
        startAlt = altArr[i];
      } else if (inClimb && (grade < 0 || i === altArr.length - 1)) {
        const gain = altArr[i] - startAlt;
        const dist = distArr[i] - distArr[startIdx];
        if (gain >= MIN_GAIN && dist > 0) {
          const avgGrade = (gain / (dist * 1000)) * 100;
          // HC/1/2/3/4 category based on difficulty score
          const score = gain * avgGrade / 100;
          let cat = '4';
          if (score > 800) cat = 'HC';
          else if (score > 400) cat = '1';
          else if (score > 200) cat = '2';
          else if (score > 80) cat = '3';

          const catColors = { 'HC': '#ff453a', '1': '#ff6b35', '2': '#ff9500', '3': '#f0c429', '4': '#4a9eff' };
          climbs.push({
            startIdx, endIdx: i,
            gain: Math.round(gain),
            dist: dist.toFixed(1),
            avgGrade: avgGrade.toFixed(1),
            cat,
            color: catColors[cat] || '#4a9eff'
          });
        }
        inClimb = false;
      }
    }
    return climbs;
  }

  // Climb overlay plugin
  const climbPlugin = {
    id: 'proClimbMarkers',
    afterDraw(chart) {
      if (!_proShowClimbs || !_proClimbs?.length) return;
      const ctx = chart.ctx;
      const xAxis = chart.scales.x;
      const { top, bottom, height } = chart.chartArea;
      ctx.save();
      for (const c of _proClimbs) {
        if (c.startIdx >= labels.length || c.endIdx >= labels.length) continue;
        const x1 = xAxis.getPixelForValue(c.startIdx);
        const x2 = xAxis.getPixelForValue(c.endIdx);
        const w = x2 - x1;
        if (w < 4) continue;

        // Gradient band at bottom
        const bandH = 28;
        const grad = ctx.createLinearGradient(0, bottom - bandH, 0, bottom);
        grad.addColorStop(0, 'transparent');
        grad.addColorStop(1, c.color + '25');
        ctx.fillStyle = grad;
        ctx.fillRect(x1, bottom - bandH, w, bandH);

        // Top accent line
        ctx.strokeStyle = c.color + '60';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x1, bottom - bandH); ctx.lineTo(x2, bottom - bandH); ctx.stroke();

        // Label
        if (w > 40) {
          ctx.fillStyle = c.color;
          ctx.font = 'bold 9px var(--font-num)';
          ctx.textAlign = 'center';
          const label = `Cat ${c.cat} · ${c.gain}m · ${c.avgGrade}%`;
          ctx.fillText(label, (x1 + x2) / 2, bottom - bandH - 4);
        } else if (w > 20) {
          ctx.fillStyle = c.color;
          ctx.font = 'bold 10px var(--font-num)';
          ctx.textAlign = 'center';
          ctx.fillText(c.cat, (x1 + x2) / 2, bottom - bandH - 4);
        }
      }
      ctx.restore();
    }
  };

  // Brush selection plugin — shift+drag to select range
  const brushPlugin = {
    id: 'proBrush',
    beforeEvent(chart, { event }) {
      if (!event.native?.shiftKey) return;
      const xAxis = chart.scales.x;
      const { left, right } = chart.chartArea;
      const x = event.x;
      if (x < left || x > right) return;
      const idx = Math.round(xAxis.getValueForPixel(x));
      if (event.type === 'mousedown' || event.type === 'pointerdown') {
        _proBrushStart = idx;
        _proBrushEnd = null;
      } else if ((event.type === 'mousemove' || event.type === 'pointermove') && _proBrushStart != null) {
        _proBrushEnd = idx;
        chart.draw();
      } else if (event.type === 'mouseup' || event.type === 'pointerup') {
        if (_proBrushStart != null && _proBrushEnd != null) {
          const s = Math.min(_proBrushStart, _proBrushEnd);
          const e = Math.max(_proBrushStart, _proBrushEnd);
          if (e - s > 5) _updateStats(s, e);
        }
      }
    },
    afterDraw(chart) {
      if (_proBrushStart == null || _proBrushEnd == null) return;
      const ctx = chart.ctx;
      const xAxis = chart.scales.x;
      const { top, bottom } = chart.chartArea;
      const s = Math.min(_proBrushStart, _proBrushEnd);
      const e = Math.max(_proBrushStart, _proBrushEnd);
      const x1 = xAxis.getPixelForValue(s);
      const x2 = xAxis.getPixelForValue(e);
      ctx.save();
      ctx.fillStyle = 'rgba(0,229,160,0.12)';
      ctx.fillRect(x1, top, x2 - x1, bottom - top);
      ctx.strokeStyle = 'rgba(0,229,160,0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(x1, top); ctx.lineTo(x1, bottom); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x2, top); ctx.lineTo(x2, bottom); ctx.stroke();
      ctx.restore();
    }
  };

  // Crosshair plugin
  const crosshairPlugin = {
    id: 'proCrosshair',
    afterDraw(chart) {
      if (chart.tooltip?._active?.length) {
        const x = chart.tooltip._active[0].element.x;
        const { top, bottom } = chart.chartArea;
        const ctx = chart.ctx;
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
        ctx.restore();
      }
    }
  };

  _proChart = new Chart(canvas.getContext('2d'), {
    type: isHist ? 'bar' : 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false, axis: 'x' },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: false,
          external: (context) => {
            const { chart, tooltip } = context;
            let el = document.getElementById('proTooltip');
            if (!el) {
              el = document.createElement('div');
              el.id = 'proTooltip';
              el.className = 'pro-tip';
              chart.canvas.parentElement.appendChild(el);
            }
            if (tooltip.opacity === 0) { el.style.visibility = 'hidden'; return; }
            el.style.visibility = 'visible';
            // Follow crosshair X, mouse Y — clamped to chart area
            const caretX = tooltip.caretX || 0;
            const caretY = tooltip.caretY || 0;
            const area = chart.chartArea || {};
            const chartLeft = area.left || 0;
            const chartRight = area.right || chart.width;
            const chartTop = area.top || 0;
            const chartBottom = area.bottom || chart.height;
            const elW = el.offsetWidth || 200;
            const elH = el.offsetHeight || 40;
            // X: follow crosshair, offset from line
            let xPos = caretX + 24;
            if (xPos + elW > chartRight) xPos = caretX - elW - 24;
            if (xPos < chartLeft) xPos = chartLeft;
            // Y: always pin to bottom of chart
            let yPos = chartBottom - elH - 8;
            el.style.left = xPos + 'px';
            el.style.top = yPos + 'px';
            const items = tooltip.dataPoints || [];
            if (!items.length) return;
            // Time label
            const timeLabel = items[0]?.label || '';
            let html = `<span class="pro-tip-label">${timeLabel}</span>`;
            // Show ALL active streams — use "—" for missing data (prevents height jump)
            for (const stream of PRO_STREAMS) {
              if (!_proActiveStreams.has(stream.key)) continue;
              const item = items.find(it => it.dataset.label === stream.label);
              const val = item?.parsed?.y;
              const unit = stream.unit || '';
              const noDecimal = ['bpm', 'rpm', 'm', 'W', '%'].includes(unit);
              const formatted = val != null ? (noDecimal ? Math.round(val) : (Math.round(val * 100) / 100)) : '—';
              const color = val != null ? stream.color : 'var(--text-faint)';
              html += `<span class="pro-tip-val" style="color:${color}">${formatted}<span class="pro-tip-unit">${unit}</span></span>`;
            }
            el.innerHTML = html;
          }
        },
        zoom: {
          zoom: {
            wheel: { enabled: true, speed: 0.1 },
            pinch: { enabled: true },
            mode: 'x',
          },
          pan: {
            enabled: true,
            mode: 'x',
            threshold: 10,
          }
        }
      },
      scales,
    },
    plugins: [zonePlugin, intervalPlugin, lapPlugin, climbPlugin, brushPlugin, crosshairPlugin]
  });

  // Redraw range minimap after chart builds
  requestAnimationFrame(() => {
    if (window._proDrawMinimap) window._proDrawMinimap();
  });
}

/* ── Update stats bar ─────────────────────────────────── */
function _updateStats(startIdx, endIdx) {
  const bar = document.getElementById('proStatsBar');
  if (!bar || !_proStreams) return;

  const time = _proStreams.time || [];
  const s = startIdx ?? 0;
  const e = endIdx ?? time.length - 1;
  const duration = (time[e] || 0) - (time[s] || 0);

  const stats = [];

  // Range label
  if (startIdx != null) {
    const fmt = t => { const m = Math.floor(t/60); const sec = Math.floor(t%60); return `${m}:${sec.toString().padStart(2,'0')}`; };
    stats.push({ label: 'Selection', val: `${fmt(time[s])} – ${fmt(time[e])}` });
  } else {
    stats.push({ label: 'Selection', val: 'Full Ride' });
  }
  stats.push({ label: 'Duration', val: _fmtDuration(duration) });

  // Compute averages for active streams
  for (const sk of PRO_STREAMS) {
    if (!_proActiveStreams.has(sk.key)) continue;
    const raw = _proStreams[sk.key];
    if (!raw) continue;

    let sum = 0, cnt = 0, max = -Infinity;
    for (let i = s; i <= e; i++) {
      if (raw[i] != null && !isNaN(raw[i])) {
        sum += raw[i]; cnt++;
        if (raw[i] > max) max = raw[i];
      }
    }
    const avg = cnt > 0 ? sum / cnt : 0;
    stats.push({ label: `Avg ${sk.label}`, val: `${Math.round(avg)} ${sk.unit}`, color: sk.color });
    stats.push({ label: `Max ${sk.label}`, val: `${Math.round(max)} ${sk.unit}`, color: sk.color });
  }

  // NP if power active
  if (_proActiveStreams.has('watts') && _proStreams.watts) {
    const np = _computeNP(_proStreams.watts, s, e);
    if (np > 0) stats.push({ label: 'NP', val: `${Math.round(np)} W`, color: '#00e5a0' });
  }

  bar.innerHTML = stats.map(st =>
    `<div class="pro-stat">
      <span class="pro-stat-label">${st.label}</span>
      <span class="pro-stat-val" ${st.color ? `style="color:${st.color}"` : ''}>${st.val}</span>
    </div>`
  ).join('');
}

/* ── Compute Normalized Power ─────────────────────────── */
function _computeNP(watts, s, e) {
  if (!watts) return 0;
  const win = 30;
  if (e - s < win) return 0;
  // O(n) running sum approach
  let runSum = 0, validN = 0, sum4 = 0, cnt = 0;
  for (let j = s; j < s + win && j <= e; j++) {
    if (watts[j] != null) { runSum += watts[j]; validN++; }
  }
  for (let i = s + win; i <= e; i++) {
    if (watts[i] != null) { runSum += watts[i]; validN++; }
    if (watts[i - win] != null) { runSum -= watts[i - win]; validN--; }
    if (validN > 0) { const avg = runSum / validN; sum4 += avg ** 4; cnt++; }
  }
  return cnt > 0 ? (sum4 / cnt) ** 0.25 : 0;
}

/* ── Format duration ──────────────────────────────────── */
function _fmtDuration(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/* ── Bind sidebar controls ────────────────────────────── */
function _bindControls() {
  // Smoothing pill — snaps to 1, 5, 10, 30, 60 with rebuild on release
  const sPill = document.getElementById('proSmoothPill');
  const sFill = sPill?.querySelector('.pro-pill-fill');
  const sVal = sPill?.querySelector('.pro-pill-val');
  if (sPill && !sPill._inited) {
    sPill._inited = true;
    const STEPS = [1, 5, 10, 30, 60];
    let sDrag = false, sDebounce = 0;
    const sApply = (pct) => {
      pct = Math.max(0, Math.min(1, pct));
      const idx = Math.round(pct * (STEPS.length - 1));
      const v = STEPS[Math.max(0, Math.min(STEPS.length - 1, idx))];
      const realPct = idx / (STEPS.length - 1);
      _proSmoothing = v;
      _smoothCache.clear();
      if (sFill) sFill.style.width = (realPct * 100) + '%';
      if (sVal) sVal.textContent = v + 's';
    };
    // Init
    const initIdx = STEPS.indexOf(_proSmoothing);
    sApply(initIdx >= 0 ? initIdx / (STEPS.length - 1) : 0.25);
    sPill.addEventListener('pointerdown', e => {
      sDrag = true; sPill.setPointerCapture(e.pointerId);
      const r = sPill.getBoundingClientRect();
      sApply((e.clientX - r.left) / r.width);
    });
    sPill.addEventListener('pointermove', e => {
      if (!sDrag) return;
      const r = sPill.getBoundingClientRect();
      const raw = (e.clientX - r.left) / r.width;
      sApply(raw);
      if (raw < -0.02) {
        const pull = Math.min(12, Math.abs(raw) * 60);
        sPill.style.borderRadius = `${10 + pull}px 10px 10px ${10 + pull}px`;
        sPill.style.transform = `translateX(${-pull * 0.4}px)`;
      } else if (raw > 1.02) {
        const pull = Math.min(12, (raw - 1) * 60);
        sPill.style.borderRadius = `10px ${10 + pull}px ${10 + pull}px 10px`;
        sPill.style.transform = `translateX(${pull * 0.4}px)`;
      } else { sPill.style.borderRadius = ''; sPill.style.transform = ''; }
    });
    const sEnd = () => {
      if (!sDrag) return; sDrag = false;
      sPill.style.transition = 'transform 0.4s cubic-bezier(0.34,1.56,0.64,1), border-radius 0.4s cubic-bezier(0.34,1.56,0.64,1)';
      sPill.style.transform = ''; sPill.style.borderRadius = '';
      setTimeout(() => { sPill.style.transition = ''; }, 450);
      clearTimeout(sDebounce);
      sDebounce = setTimeout(() => { _buildChart(); }, 50);
    };
    sPill.addEventListener('pointerup', sEnd);
    sPill.addEventListener('pointercancel', sEnd);
    sPill.addEventListener('wheel', e => {
      e.preventDefault();
      const cur = STEPS.indexOf(_proSmoothing);
      const dir = e.deltaY > 0 ? -1 : 1;
      const ni = Math.max(0, Math.min(STEPS.length - 1, cur + dir));
      sApply(ni / (STEPS.length - 1));
      clearTimeout(sDebounce);
      sDebounce = setTimeout(() => { _buildChart(); }, 200);
    }, { passive: false });
  }

  // Generic pill slider factory
  function _initPill(id, { min, max, step, value, fmt, onUpdate }) {
    const el = document.getElementById(id);
    if (!el || el._inited) return;
    el._inited = true;
    const fill = el.querySelector('.pro-pill-fill');
    const valEl = el.querySelector('.pro-pill-val');
    let cur = value, drag = false, debounce = 0;
    const apply = (pct) => {
      pct = Math.max(0, Math.min(1, pct));
      cur = min + pct * (max - min);
      if (step) cur = Math.round(cur / step) * step;
      cur = Math.max(min, Math.min(max, cur));
      if (fill) fill.style.width = (((cur - min) / (max - min)) * 100) + '%';
      if (valEl) valEl.textContent = fmt(cur);
      onUpdate(cur);
    };
    apply(((value - min) / (max - min)));
    el.addEventListener('pointerdown', e => {
      drag = true; el.setPointerCapture(e.pointerId);
      const r = el.getBoundingClientRect();
      apply((e.clientX - r.left) / r.width);
    });
    el.addEventListener('pointermove', e => {
      if (!drag) return;
      const r = el.getBoundingClientRect();
      const raw = (e.clientX - r.left) / r.width;
      apply(raw);
      // Rubber band — stretch only the edge being dragged past
      if (raw < -0.02) {
        const pull = Math.min(12, Math.abs(raw) * 60);
        el.style.borderRadius = `${10 + pull}px 10px 10px ${10 + pull}px`;
        el.style.transform = `translateX(${-pull * 0.4}px)`;
      } else if (raw > 1.02) {
        const pull = Math.min(12, (raw - 1) * 60);
        el.style.borderRadius = `10px ${10 + pull}px ${10 + pull}px 10px`;
        el.style.transform = `translateX(${pull * 0.4}px)`;
      } else {
        el.style.borderRadius = '';
        el.style.transform = '';
      }
    });
    const end = () => {
      if (!drag) return; drag = false;
      // Spring snap back
      el.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), border-radius 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
      el.style.transform = '';
      el.style.borderRadius = '';
      setTimeout(() => { el.style.transition = ''; }, 450);
      clearTimeout(debounce);
      debounce = setTimeout(() => { if (_proStacked) _buildStackedCharts(); else _buildChart(); }, 150);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', e => { e.preventDefault(); const d = e.deltaY > 0 ? -1 : 1; const s = step || ((max - min) / 20); cur = Math.max(min, Math.min(max, cur + d * s)); const pct = (cur - min) / (max - min); if (fill) fill.style.width = (pct * 100) + '%'; if (valEl) valEl.textContent = fmt(cur); onUpdate(cur); clearTimeout(debounce); debounce = setTimeout(() => { if (_proStacked) _buildStackedCharts(); else _buildChart(); }, 300); }, { passive: false });
  }

  // Helper: live-update chart datasets without full rebuild
  function _liveUpdateChart() {
    if (!_proChart) return;
    _proChart.data.datasets.forEach(ds => {
      if (ds._isCompare || ds._isFatigue || ds._isAnomaly) return;
      const alphaHex = Math.round(_proOpacity * 255).toString(16).padStart(2, '0');
      const fillHex = Math.round(_proFillOpacity * 255).toString(16).padStart(2, '0');
      const baseColor = ds.borderColor?.slice(0, 7) || '#ffffff';
      ds.borderColor = baseColor + alphaHex;
      ds.backgroundColor = baseColor + fillHex;
      ds.borderWidth = _proLineWidth;
      ds.fill = _proFillOpacity > 0;
    });
    _proChart.update('none');
  }

  // Fatigue filter — dims non-fatigued sections, highlights fatigue
  function _liveUpdateFatigue() {
    if (!_proChart || !_proStreams) return;
    // Remove existing fatigue overlay
    _proChart.data.datasets = _proChart.data.datasets.filter(ds => !ds._isFatigue);
    if (_proFatigueThreshold <= 0) { _proChart.update('none'); return; }

    // Find fatigue from HR or power data
    const hr = _proStreams.heartrate;
    const watts = _proStreams.watts;
    const source = hr?.length ? hr : watts;
    if (!source?.length) return;

    // Compute rolling max and flag sections where value > threshold% of max
    let maxVal = 0;
    for (const v of source) { if (v > maxVal) maxVal = v; }
    const threshold = maxVal * (1 - _proFatigueThreshold * 0.3); // e.g., at 100% filter, shows >70% of max
    const fatigueData = source.map(v => v >= threshold ? v : null);

    _proChart.data.datasets.push({
      label: 'Fatigue',
      data: fatigueData,
      borderColor: 'rgba(255,69,58,0.8)',
      backgroundColor: 'rgba(255,69,58,0.12)',
      borderWidth: 2.5,
      pointRadius: 0,
      tension: 0.2,
      fill: true,
      yAxisID: hr?.length ? 'y_heartrate' : 'y_watts',
      _isFatigue: true,
    });
    _proChart.update('none');
  }

  // Anomaly detection — highlights spikes and drops
  function _liveUpdateAnomalies() {
    if (!_proChart || !_proStreams) return;
    _proChart.data.datasets = _proChart.data.datasets.filter(ds => !ds._isAnomaly);
    if (_proAnomalySensitivity <= 0) { _proChart.update('none'); return; }

    // Detect anomalies in all active streams
    for (const s of PRO_STREAMS) {
      if (!_proActiveStreams.has(s.key)) continue;
      const raw = _proStreams[s.key];
      if (!raw?.length) continue;

      // Compute rolling mean and stddev (30s window)
      const win = 30;
      const anomalyPoints = raw.map((v, i) => {
        if (v == null || i < win) return null;
        let sum = 0, cnt = 0;
        for (let j = i - win; j < i; j++) { if (raw[j] != null) { sum += raw[j]; cnt++; } }
        if (cnt < 10) return null;
        const mean = sum / cnt;
        let sqSum = 0;
        for (let j = i - win; j < i; j++) { if (raw[j] != null) sqSum += (raw[j] - mean) ** 2; }
        const std = Math.sqrt(sqSum / cnt);
        // Threshold: lower sensitivity = only big spikes (3σ), higher = small deviations (1σ)
        const sigmas = 3 - _proAnomalySensitivity * 2; // 3σ at 0%, 1σ at 100%
        return Math.abs(v - mean) > std * sigmas ? v : null;
      });

      const hasAnomalies = anomalyPoints.some(v => v !== null);
      if (!hasAnomalies) continue;

      _proChart.data.datasets.push({
        label: `${s.label} anomaly`,
        data: anomalyPoints,
        borderColor: 'transparent',
        backgroundColor: '#ffcc00',
        pointRadius: anomalyPoints.map(v => v !== null ? 4 : 0),
        pointBackgroundColor: '#ffcc00',
        pointBorderColor: 'rgba(255,204,0,0.4)',
        pointBorderWidth: 6,
        showLine: false,
        yAxisID: `y_${s.key}`,
        _isAnomaly: true,
      });
    }
    _proChart.update('none');
  }

  // Line width pill (0.5–4px)
  _initPill('proLineWidthPill', {
    min: 0.5, max: 4, step: 0.5, value: _proLineWidth,
    fmt: v => v.toFixed(1) + 'px',
    onUpdate: v => { _proLineWidth = v; _liveUpdateChart(); }
  });

  // Opacity pill (20–100%)
  _initPill('proOpacityPill', {
    min: 0.2, max: 1, step: 0.05, value: _proOpacity,
    fmt: v => Math.round(v * 100) + '%',
    onUpdate: v => { _proOpacity = v; _liveUpdateChart(); }
  });

  // Fill opacity pill (0–50%)
  _initPill('proFillPill', {
    min: 0, max: 0.5, step: 0.05, value: _proFillOpacity,
    fmt: v => Math.round(v * 100) + '%',
    onUpdate: v => { _proFillOpacity = v; _liveUpdateChart(); }
  });

  // Zoom pill (50–500%) — applies live via scale manipulation, no rebuild
  const zoomPillEl = document.getElementById('proZoomPill');
  if (zoomPillEl && !zoomPillEl._inited) {
    zoomPillEl._inited = true;
    const zFill = zoomPillEl.querySelector('.pro-pill-fill');
    const zVal = zoomPillEl.querySelector('.pro-pill-val');
    let zDrag = false, zDebounce = 0;
    const zApply = (pct) => {
      pct = Math.max(0, Math.min(1, pct));
      const v = Math.round(50 + pct * 450);
      _proZoomLevel = v / 100;
      if (zFill) zFill.style.width = (pct * 100) + '%';
      if (zVal) zVal.textContent = v + '%';
      // Apply zoom by adjusting x-axis min/max
      if (_proChart && _proChart.data.labels?.length) {
        const total = _proChart.data.labels.length;
        const visible = Math.max(10, Math.round(total / _proZoomLevel));
        const center = Math.round(total / 2);
        const half = Math.round(visible / 2);
        _proChart.options.scales.x.min = Math.max(0, center - half);
        _proChart.options.scales.x.max = Math.min(total - 1, center + half);
        _proChart.update('none');
      }
    };
    // Init
    zApply((100 - 50) / 450);
    zoomPillEl.addEventListener('pointerdown', e => {
      zDrag = true; zoomPillEl.setPointerCapture(e.pointerId);
      const r = zoomPillEl.getBoundingClientRect();
      zApply((e.clientX - r.left) / r.width);
    });
    zoomPillEl.addEventListener('pointermove', e => {
      if (!zDrag) return;
      const r = zoomPillEl.getBoundingClientRect();
      const raw = (e.clientX - r.left) / r.width;
      zApply(raw);
      if (raw < -0.02) {
        const pull = Math.min(12, Math.abs(raw) * 60);
        zoomPillEl.style.borderRadius = `${10 + pull}px 10px 10px ${10 + pull}px`;
        zoomPillEl.style.transform = `translateX(${-pull * 0.4}px)`;
      } else if (raw > 1.02) {
        const pull = Math.min(12, (raw - 1) * 60);
        zoomPillEl.style.borderRadius = `10px ${10 + pull}px ${10 + pull}px 10px`;
        zoomPillEl.style.transform = `translateX(${pull * 0.4}px)`;
      } else { zoomPillEl.style.borderRadius = ''; zoomPillEl.style.transform = ''; }
    });
    const zEnd = () => {
      if (!zDrag) return; zDrag = false;
      zoomPillEl.style.transition = 'transform 0.4s cubic-bezier(0.34,1.56,0.64,1), border-radius 0.4s cubic-bezier(0.34,1.56,0.64,1)';
      zoomPillEl.style.transform = ''; zoomPillEl.style.borderRadius = '';
      setTimeout(() => { zoomPillEl.style.transition = ''; }, 450);
    };
    zoomPillEl.addEventListener('pointerup', zEnd);
    zoomPillEl.addEventListener('pointercancel', zEnd);
    zoomPillEl.addEventListener('wheel', e => {
      e.preventDefault();
      const cur = _proZoomLevel * 100;
      const nv = Math.max(50, Math.min(500, cur + (e.deltaY > 0 ? -10 : 10)));
      zApply((nv - 50) / 450);
    }, { passive: false });
  }

  // Fatigue filter pill (0 = off, 100 = max filter)
  _initPill('proFatiguePill', {
    min: 0, max: 100, step: 5, value: 0,
    fmt: v => v === 0 ? 'Off' : Math.round(v) + '%',
    onUpdate: v => { _proFatigueThreshold = v / 100; _liveUpdateFatigue(); }
  });

  // Anomaly sensitivity pill (0 = off, 100 = max)
  _initPill('proAnomalyPill', {
    min: 0, max: 100, step: 5, value: 0,
    fmt: v => v === 0 ? 'Off' : Math.round(v) + '%',
    onUpdate: v => { _proAnomalySensitivity = v / 100; _liveUpdateAnomalies(); }
  });

  // Data density pill (10–100%)
  _initPill('proDensityPill', {
    min: 10, max: 100, step: 5, value: 100,
    fmt: v => Math.round(v) + '%',
    onUpdate: v => { _proDensity = v / 100; }
  });

  // X-axis toggle
  document.querySelectorAll('.pro-xaxis-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.pro-xaxis-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _proXAxis = btn.dataset.axis;
      _buildChart();
    };
  });

  // Export PNG
  const exportBtn = document.getElementById('proExportPng');
  if (exportBtn) {
    exportBtn.onclick = () => {
      const canvas = document.getElementById('proAnalysisChart');
      if (!canvas) return;
      const link = document.createElement('a');
      link.download = `pro-analysis-${_proActivity?.name || 'ride'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
  }

  // Export CSV
  const csvBtn = document.getElementById('proExportCsv');
  if (csvBtn) {
    csvBtn.onclick = () => {
      if (!_proStreams) return;
      const keys = ['time', ...Array.from(_proActiveStreams)];
      const headers = keys.map(k => PRO_STREAMS.find(s => s.key === k)?.label || k);
      const len = _proStreams.time?.length || 0;
      let csv = headers.join(',') + '\n';
      for (let i = 0; i < len; i++) {
        csv += keys.map(k => {
          if (k === 'time') return (_proStreams.time?.[i] ?? '').toString();
          const arr = _proStreams[k];
          return arr?.[i] != null ? Math.round(arr[i] * 100) / 100 : '';
        }).join(',') + '\n';
      }
      const blob = new Blob([csv], { type: 'text/csv' });
      const link = document.createElement('a');
      link.download = `pro-analysis-${_proActivity?.name || 'ride'}.csv`;
      link.href = URL.createObjectURL(blob);
      link.click();
      URL.revokeObjectURL(link.href);
    };
  }

  // ── Ride Playback (expandable button → progress scrubber) ──
  const player = document.getElementById('proPlayer');
  const playBtn = document.getElementById('proPlayBtn');
  const playerTrack = document.getElementById('proPlayerTrack');
  const playerFill = document.getElementById('proPlayerFill');
  const playerTime = document.getElementById('proPlayerTime');
  const playerSpeed = document.getElementById('proPlayerSpeed');

  function _updatePlayerProgress() {
    if (!_proChart) return;
    const total = _proChart.data.labels?.length || 1;
    const pct = (_playIdx / total * 100).toFixed(1);
    if (playerFill) playerFill.style.width = pct + '%';
    // Show current time
    const timeArr = _proStreams?.time;
    if (timeArr && playerTime) {
      const sec = timeArr[Math.min(_playIdx, timeArr.length - 1)] || 0;
      const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
      playerTime.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    }
  }

  function _stopPlayback() {
    if (_playInterval) { clearInterval(_playInterval); _playInterval = null; }
    if (playBtn) playBtn.innerHTML = '<svg class="icon" width="14" height="14"><use href="icons.svg#icon-play"/></svg>';
    // Keep chart locked — only _closePlayer unlocks
  }

  function _closePlayer() {
    _stopPlayback();
    if (player) player.classList.remove('pro-player--open');
    _playIdx = 0;
    if (playerFill) playerFill.style.width = '0%';
    if (playerTime) playerTime.textContent = '0:00';
    // Re-enable chart interaction only on close
    if (_proChart) {
      _proChart.options.interaction.mode = 'index';
      _proChart.options.events = ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove'];
      _proChart.update('none');
    }
    const canvas = document.getElementById('proAnalysisChart');
    if (canvas) canvas.style.pointerEvents = '';
  }

  function _startPlayback() {
    if (!_proChart) return;
    const total = _proChart.data.labels?.length || 0;
    if (total < 10) return;
    // Open the player bar
    if (player) player.classList.add('pro-player--open');
    if (playBtn) playBtn.innerHTML = '<svg class="icon" width="14" height="14"><use href="icons.svg#icon-pause"/></svg>';
    // Disable chart interaction
    _proChart.options.interaction.mode = null;
    _proChart.options.events = [];
    _proChart.update('none');
    const canvas = document.getElementById('proAnalysisChart');
    if (canvas) canvas.style.pointerEvents = 'none';

    const fps = 30;
    _playInterval = setInterval(() => {
      _playIdx += PLAY_SPEEDS[_playSpeedIdx];
      if (_playIdx >= total) { _playIdx = 0; _stopPlayback(); return; }
      _activateCrosshairAtIndex(_playIdx);
      _updatePlayerProgress();
      // Throttle stats to every 5th frame
      if (_playIdx % 5 === 0) _updateStats(_playIdx, _playIdx);
    }, 1000 / fps);
  }

  if (playBtn) {
    playBtn.onclick = () => {
      if (_playInterval) _stopPlayback();
      else _startPlayback();
    };
  }

  if (playerSpeed) {
    playerSpeed.onclick = () => {
      _playSpeedIdx = (_playSpeedIdx + 1) % PLAY_SPEEDS.length;
      playerSpeed.textContent = PLAY_SPEEDS[_playSpeedIdx] + '×';
    };
  }

  const playerClose = document.getElementById('proPlayerClose');
  if (playerClose) {
    playerClose.onclick = () => _closePlayer();
  }

  // Track scrubbing — drag to seek
  if (playerTrack) {
    let _trackDrag = false;
    const scrubTo = (clientX) => {
      if (!_proChart) return;
      const r = playerTrack.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      const total = _proChart.data.labels?.length || 1;
      _playIdx = Math.round(pct * (total - 1));
      _updatePlayerProgress();
      _activateCrosshairAtIndex(_playIdx);
      _updateStats(_playIdx, _playIdx);
    };
    playerTrack.addEventListener('pointerdown', e => {
      _trackDrag = true;
      playerTrack.setPointerCapture(e.pointerId);
      // Pause during scrub
      if (_playInterval) { clearInterval(_playInterval); _playInterval = null; }
      scrubTo(e.clientX);
    });
    playerTrack.addEventListener('pointermove', e => {
      if (_trackDrag) scrubTo(e.clientX);
    });
    playerTrack.addEventListener('pointerup', () => { _trackDrag = false; });
    playerTrack.addEventListener('pointercancel', () => { _trackDrag = false; });
  }

  // Space bar toggles playback
  document.getElementById('proAnalysis')?.addEventListener('keydown', e => {
    if (e.code === 'Space' && !e.target.matches('input,select,textarea')) {
      e.preventDefault();
      if (_playInterval) _stopPlayback(); else _startPlayback();
    }
  });

  // Histogram mode toggle
  const histBtn = document.getElementById('proHistogramBtn');
  if (histBtn) {
    histBtn.onclick = () => {
      _proChartMode = _proChartMode === 'histogram' ? 'timeseries' : 'histogram';
      histBtn.classList.toggle('pro-mode-active', _proChartMode === 'histogram');
      _buildProChart();
    };
  }

  // Stacked toggle
  const stackBtn = document.getElementById('proStackedBtn');
  if (stackBtn) {
    stackBtn.onclick = () => {
      _proStacked = !_proStacked;
      stackBtn.classList.toggle('pro-mode-active', _proStacked);
      if (_proStacked) {
        _buildStackedCharts();
      } else {
        _destroyStackedCharts();
        const mc = document.getElementById('proAnalysisChart');
        if (mc) mc.style.display = '';
        _buildChart();
      }
    };
  }

  // Rides panel — toggle open/close, populate with state.activities
  const ridesBtn = document.getElementById('proRidesBtn');
  const ridesPanel = document.getElementById('proRidesPanel');
  const ridesList = document.getElementById('proRidesList');
  const ridesClose = document.getElementById('proRidesClose');

  function _toggleRidesPanel() {
    if (!ridesPanel) return;
    const isOpen = ridesPanel.classList.contains('pro-rides-open');
    if (isOpen) {
      ridesPanel.classList.remove('pro-rides-open');
      ridesBtn?.classList.remove('pro-mode-active');
      return;
    }
    ridesPanel.classList.add('pro-rides-open');
    ridesBtn?.classList.add('pro-mode-active');
    _populateRidesList();
  }

  function _populateRidesList() {
    if (!ridesList) return;
    const activities = window.state?.activities || [];
    const actId = _proActivity?.id;
    if (!activities.length) {
      ridesList.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px">No rides loaded</div>';
      return;
    }
    ridesList.innerHTML = activities.map(a => {
      const d = a.start_date_local ? new Date(a.start_date_local) : null;
      const dateStr = d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
      const dist = a.distance ? (a.distance / 1000).toFixed(1) + ' km' : '';
      const dur = a.moving_time ? _fmtDuration(a.moving_time) : '';
      const tss = a.icu_training_load ? Math.round(a.icu_training_load) : '';
      const isCurrent = String(a.id) === String(actId);
      return `<div class="pro-ride-item ${isCurrent ? 'pro-ride-active' : ''}" data-id="${a.id}" data-idx="${activities.indexOf(a)}">
        <div class="pro-ride-info">
          <div class="pro-ride-name">${a.name || 'Ride'}</div>
          <div class="pro-ride-meta">${dateStr} · ${dist} · ${dur}</div>
        </div>
        ${tss ? `<div class="pro-ride-tss">${tss}</div>` : ''}
      </div>`;
    }).join('');

    // Click to navigate or compare
    ridesList.onclick = (e) => {
      const item = e.target.closest('.pro-ride-item');
      if (!item) return;
      const idx = parseInt(item.dataset.idx);
      if (isNaN(idx)) return;
      // Navigate to this activity
      if (window._proNavActivity) {
        const currentIdx = window.state?.currentActivityIdx || 0;
        const diff = idx - currentIdx;
        if (diff !== 0) window._proNavActivity(diff);
      }
    };
  }

  if (ridesBtn) ridesBtn.onclick = _toggleRidesPanel;
  if (ridesClose) ridesClose.onclick = _toggleRidesPanel;
  window._proPopulateRides = _populateRidesList;

  // Compare button — opens ride picker panel on right side
  const compareBtn = document.getElementById('proCompareBtn');
  let _comparePanel = null;
  if (compareBtn) {
    compareBtn.onclick = async () => {
      // If already comparing, remove comparison
      if (_proCompareStreams) {
        _proCompareStreams = null;
        _proCompareActivity = null;
        compareBtn.classList.remove('pro-mode-active');
        compareBtn.textContent = 'Compare';
        _buildProChart();
        return;
      }
      // If panel already open, close it
      if (_comparePanel) {
        _comparePanel.remove();
        _comparePanel = null;
        return;
      }
      // Build and show the ride picker panel
      _comparePanel = document.createElement('div');
      _comparePanel.className = 'pro-compare-panel';
      _comparePanel.innerHTML = `
        <div class="pro-compare-header">
          <span style="font-weight:600;font-size:15px">Select Ride to Compare</span>
          <button class="pro-compare-close" onclick="this.closest('.pro-compare-panel').remove();window._proComparePanel=null">
            <svg class="icon" width="18" height="18"><use href="icons.svg#icon-x"/></svg>
          </button>
        </div>
        <div class="pro-compare-list" style="padding:8px;overflow-y:auto;flex:1">
          <div style="text-align:center;color:var(--text-muted);padding:20px">Loading rides...</div>
        </div>
      `;
      document.getElementById('proAnalysis').appendChild(_comparePanel);

      // Use already-loaded activities from state
      try {
        const actId = _proActivity?.id;
        const activities = window.state?.activities;
        const list = _comparePanel.querySelector('.pro-compare-list');
        if (!activities?.length) {
          list.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px">No rides found</div>';
          return;
        }
        // Filter out current activity, show last 30
        const rides = activities.filter(a => a.id !== actId).slice(0, 30);
        list.innerHTML = rides.map(a => {
          const d = a.start_date_local ? new Date(a.start_date_local) : null;
          const dateStr = d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
          const dist = a.distance ? (a.distance / 1000).toFixed(1) + ' km' : '';
          const dur = a.moving_time ? _fmtDuration(a.moving_time) : '';
          const tss = a.icu_training_load ? Math.round(a.icu_training_load) + ' TSS' : '';
          return `<div class="pro-compare-ride" data-id="${a.id}" data-name="${(a.name || '').replace(/"/g, '&quot;')}">
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${a.name || 'Ride'}</div>
              <div style="font-size:12px;color:var(--text-muted);margin-top:2px">${dateStr} · ${dist} · ${dur}</div>
            </div>
            <div style="font-size:12px;color:var(--text-faint);flex-shrink:0">${tss}</div>
          </div>`;
        }).join('');

        // Click handler for ride selection
        list.addEventListener('click', async (e) => {
          const ride = e.target.closest('.pro-compare-ride');
          if (!ride) return;
          const id = ride.dataset.id;
          const name = ride.dataset.name;
          ride.style.opacity = '0.5';
          ride.textContent = 'Loading...';
          try {
            const resp = await window.icuFetch?.(`/activity/${id}/streams?types=watts,heartrate,cadence,velocity_smooth,altitude,time,distance`);
            if (resp) {
              _proCompareStreams = resp;
              _proCompareActivity = { id, name };
              compareBtn.classList.add('pro-mode-active');
              compareBtn.textContent = `✕ ${name.substring(0, 12)}`;
              _buildProChart();
              // Close panel
              _comparePanel.remove();
              _comparePanel = null;
            }
          } catch (err) {
            ride.style.opacity = '1';
            ride.textContent = 'Failed — try again';
          }
        });
      } catch (e) {
        const list = _comparePanel?.querySelector('.pro-compare-list');
        if (list) list.innerHTML = '<div style="text-align:center;color:var(--red);padding:20px">Failed to load rides</div>';
      }
    };
  }

  // Clear brush on click without shift
  const _brushCanvas = document.getElementById('proAnalysisChart');
  _brushCanvas?.addEventListener('click', (e) => {
    if (!e.shiftKey && _proBrushStart != null) {
      _proBrushStart = null;
      _proBrushEnd = null;
      _updateStats();
      _proChart?.update();
    }
  });

  // Overlay toggles
  const zonesCheck = document.getElementById('proShowZones');
  if (zonesCheck) {
    zonesCheck.checked = _proShowZones;
    zonesCheck.onchange = () => { _proShowZones = zonesCheck.checked; _proChart?.update(); };
  }
  const ivlCheck = document.getElementById('proShowIntervals');
  if (ivlCheck) {
    ivlCheck.checked = _proShowIntervals;
    ivlCheck.onchange = () => { _proShowIntervals = ivlCheck.checked; _proChart?.update(); };
  }
  const lapCheck = document.getElementById('proShowLaps');
  if (lapCheck) {
    lapCheck.checked = _proShowLaps;
    lapCheck.onchange = () => { _proShowLaps = lapCheck.checked; _proChart?.update(); };
  }

  const climbCheck = document.getElementById('proShowClimbs');
  if (climbCheck) {
    climbCheck.checked = _proShowClimbs;
    climbCheck.onchange = () => { _proShowClimbs = climbCheck.checked; _proChart?.update(); };
  }

  // Range bar is initialized separately after _bindControls
  // (see _initRangeBar below)

  // Keyboard shortcuts — remove old first to prevent accumulation
  document.removeEventListener('keydown', _proKeyHandler);
  document.addEventListener('keydown', _proKeyHandler);
}

/* ── Range Bar — module-level, outside _bindControls ──────── */
let _rS = 0, _rE = 1, _rangeMode = null, _rangeBound = false;

function _initRangeBar() {
  const bar = document.getElementById('proRange');
  if (!bar) return;

  _rS = 0; _rE = 1;

  // Draw minimap
  function drawMini() {
    const c = document.getElementById('proRangeMini');
    if (!c || !_proStreams) return;
    const w = bar.offsetWidth, h = bar.offsetHeight;
    if (w < 20) return;
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    for (const s of PRO_STREAMS) {
      if (!_proActiveStreams.has(s.key)) continue;
      const d = _proStreams[s.key];
      if (!d?.length) continue;
      let mn = Infinity, mx = -Infinity;
      for (const v of d) if (v != null) { if (v < mn) mn = v; if (v > mx) mx = v; }
      if (mx <= mn) mx = mn + 1;
      ctx.beginPath(); ctx.moveTo(0, h);
      for (let i = 0; i < d.length; i++) {
        const x = i / (d.length - 1) * w;
        const y = h - ((d[i] != null ? d[i] : mn) - mn) / (mx - mn) * h * 0.85;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h); ctx.closePath();
      ctx.fillStyle = s.color + '18'; ctx.fill();
      ctx.beginPath();
      for (let i = 0; i < d.length; i++) {
        const x = i / (d.length - 1) * w;
        const y = h - ((d[i] != null ? d[i] : mn) - mn) / (mx - mn) * h * 0.85;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.strokeStyle = s.color + '55'; ctx.lineWidth = 1; ctx.stroke();
    }
  }
  window._proDrawMinimap = drawMini;

  // Sync visual + chart zoom
  function sync() {
    bar.style.setProperty('--sel-left', (_rS * 100) + '%');
    bar.style.setProperty('--sel-right', ((1 - _rE) * 100) + '%');
    if (_proChart?.data?.labels) {
      const n = _proChart.data.labels.length;
      _proChart.options.scales.x.min = Math.round(_rS * (n - 1));
      _proChart.options.scales.x.max = Math.round(_rE * (n - 1));
      _proChart.update('none');
      _updateStats(Math.round(_rS * (n - 1)), Math.round(_rE * (n - 1)));
    }
  }

  // Draw + sync after short delay for layout
  setTimeout(() => { drawMini(); sync(); }, 300);

  // Only bind events once
  if (_rangeBound) return;
  _rangeBound = true;

  let mode = null, sx = 0, sL = 0, sR = 0;

  bar.addEventListener('mousedown', e => {
    const rect = bar.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    sx = e.clientX; sL = _rS; sR = _rE;

    const t = e.target;
    if (t.id === 'proGrabL' || t.closest?.('.pro-range-grab--l')) {
      mode = 'L';
    } else if (t.id === 'proGrabR' || t.closest?.('.pro-range-grab--r')) {
      mode = 'R';
    } else if (pct > _rS + 0.03 && pct < _rE - 0.03) {
      mode = 'M';
    } else if (Math.abs(pct - _rS) < Math.abs(pct - _rE)) {
      _rS = Math.max(0, Math.min(_rE - 0.02, pct)); sL = _rS; mode = 'L';
    } else {
      _rE = Math.min(1, Math.max(_rS + 0.02, pct)); sR = _rE; mode = 'R';
    }
    sync();
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!mode) return;
    const w = bar.offsetWidth;
    if (w < 10) return;
    const dx = (e.clientX - sx) / w;
    if (mode === 'L') _rS = Math.max(0, Math.min(_rE - 0.02, sL + dx));
    else if (mode === 'R') _rE = Math.min(1, Math.max(_rS + 0.02, sR + dx));
    else {
      const span = sR - sL;
      let nL = sL + dx, nR = sR + dx;
      if (nL < 0) { nL = 0; nR = span; }
      if (nR > 1) { nR = 1; nL = 1 - span; }
      _rS = nL; _rE = nR;
    }
    sync();
  });

  document.addEventListener('mouseup', () => { mode = null; });
  bar.addEventListener('dblclick', () => { _rS = 0; _rE = 1; sync(); });

}

_proKeyHandler = function(e) {
  const el = document.getElementById('proAnalysis');
  if (!el || el.style.display === 'none') return;

  // Escape to close
  if (e.key === 'Escape') { closeProAnalysis(); return; }

  // Z = toggle zones
  if (e.key === 'z' || e.key === 'Z') {
    _proShowZones = !_proShowZones;
    const zc = document.getElementById('proShowZones');
    if (zc) zc.checked = _proShowZones;
    _proChart?.update();
    return;
  }
  // I = toggle intervals
  if (e.key === 'i' || e.key === 'I') {
    _proShowIntervals = !_proShowIntervals;
    const ic = document.getElementById('proShowIntervals');
    if (ic) ic.checked = _proShowIntervals;
    _proChart?.update();
    return;
  }
  // C = toggle climbs
  if (e.key === 'c' || e.key === 'C') {
    _proShowClimbs = !_proShowClimbs;
    const cc = document.getElementById('proShowClimbs');
    if (cc) cc.checked = _proShowClimbs;
    _proChart?.update();
    return;
  }
  // R = reset zoom
  if (e.key === 'r' || e.key === 'R') {
    _proChart?.resetZoom();
    return;
  }

  // Number keys 1-9,0 to toggle streams
  const num = e.key === '0' ? 10 : parseInt(e.key);
  if (num >= 1 && num <= PRO_STREAMS.length) {
    e.preventDefault();
    _proToggleStream(PRO_STREAMS[num - 1].key);
  }
};

console.info('[ProAnalysis] Module loaded');
