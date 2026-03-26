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
let _proCompareStreams = null;
let _proCompareActivity = null;

const ZONE_COLORS = [
  { min: 0,   max: 0.55, color: 'rgba(74,158,255,0.06)',  label: 'Z1' },
  { min: 0.55,max: 0.75, color: 'rgba(0,229,160,0.06)',   label: 'Z2' },
  { min: 0.75,max: 0.90, color: 'rgba(240,196,41,0.06)',  label: 'Z3' },
  { min: 0.90,max: 1.05, color: 'rgba(255,149,0,0.06)',   label: 'Z4' },
  { min: 1.05,max: 1.20, color: 'rgba(255,69,58,0.06)',   label: 'Z5' },
  { min: 1.20,max: 2.00, color: 'rgba(175,82,222,0.06)',  label: 'Z6' },
];

/* ── Init ─────────────────────────────────────────────── */
let _proLaps = null;

function _proInit(streams, activity, intervals) {
  _proStreams = streams;
  _proActivity = activity;
  _proIntervals = intervals;
  _proLaps = activity?.icu_laps || activity?.laps || null;

  // Compute derived channels
  _computeDerivedStreams();

  _buildStreamList();
  _buildChart();
  _updateStats();
  _bindControls();

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
}
window._proClose = _proClose;

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

  // Rebuild chart with new streams
  _buildChart();
  _updateStats();
}
window._proToggleStream = _proToggleStream;

/* ── Smooth data with moving average ──────────────────── */
function _smooth(data, window) {
  if (!data || window <= 1) return data;
  const out = new Array(data.length);
  const half = Math.floor(window / 2);
  for (let i = 0; i < data.length; i++) {
    let sum = 0, cnt = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(data.length - 1, i + half); j++) {
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
  const labels = _proXAxis === 'distance'
    ? dist.map(d => (d / 1000).toFixed(1))
    : time.map(t => {
        const m = Math.floor(t / 60), s = Math.floor(t % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
      });

  // Detect climbs from elevation + distance + gradient
  _proClimbs = _detectClimbs(
    _proStreams.altitude,
    _proStreams.distance,
    _proStreams.grade_smooth
  );

  // Build datasets + axes
  const datasets = [];
  const scales = {};
  const isHist = _proChartMode === 'histogram';

  if (isHist) {
    // Histogram mode — bar chart of value distribution
    const firstStream = PRO_STREAMS.find(s => _proActiveStreams.has(s.key) && _proStreams[s.key]?.length);
    if (!firstStream) return;
    const raw = _proStreams[firstStream.key];
    const vals = raw.filter(v => v != null && v > 0);
    if (!vals.length) return;
    const min = Math.floor(Math.min(...vals));
    const max = Math.ceil(Math.max(...vals));
    const binCount = Math.min(30, max - min);
    const binSize = (max - min) / binCount || 1;
    const bins = new Array(binCount).fill(0);
    const binLabels = [];
    for (let i = 0; i < binCount; i++) {
      binLabels.push(Math.round(min + i * binSize));
      for (const v of vals) {
        const bi = Math.min(Math.floor((v - min) / binSize), binCount - 1);
        if (bi === i) bins[i]++;
      }
    }
    // Convert to time in minutes
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
      grid: { color: 'rgba(255,255,255,0.04)' },
      title: { display: true, text: firstStream.unit, color: 'rgba(255,255,255,0.3)', font: { size: 11 } }
    };
    scales.y = {
      display: true,
      ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 10 }, callback: v => Math.round(v) + 'm' },
      grid: { color: 'rgba(255,255,255,0.04)' },
      title: { display: true, text: 'minutes', color: 'rgba(255,255,255,0.3)', font: { size: 11 } }
    };
  } else {
    // Timeseries mode
    scales.x = {
      display: true,
      ticks: { color: 'rgba(255,255,255,0.4)', maxTicksLimit: 20, font: { size: 11 } },
      grid: { color: 'rgba(255,255,255,0.04)' },
      title: { display: true, text: _proXAxis === 'distance' ? 'km' : 'time', color: 'rgba(255,255,255,0.3)', font: { size: 11 } }
    };

    let axisIdx = 0;
    for (const s of PRO_STREAMS) {
      if (!_proActiveStreams.has(s.key)) continue;
      const raw = _proStreams[s.key];
      if (!raw || raw.length === 0) continue;

      const data = _smooth(raw, _proSmoothing);
      const axisId = `y_${s.key}`;
      const isLeft = axisIdx % 2 === 0;

      datasets.push({
        label: s.label,
        data: data,
        borderColor: s.color,
        backgroundColor: s.color + '15',
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: s.color,
        tension: 0.2,
        fill: s.key === 'altitude',
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
          data: _smooth(compRaw, _proSmoothing),
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
          enabled: true,
          mode: 'index',
          intersect: false,
          backgroundColor: 'rgba(0,0,0,0.9)',
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8,
          bodyFont: { family: 'var(--font-num)', size: 12 },
          callbacks: {
            label: ctx => {
              const s = PRO_STREAMS.find(p => p.label === ctx.dataset.label);
              const v = ctx.parsed?.y;
              if (v == null) return '';
              return ` ${ctx.dataset.label}: ${Math.round(v * 10) / 10} ${s?.unit || ''}`;
            }
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
}

function _fmtTime(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
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
  // 30s rolling average, then 4th power
  const window = 30;
  let sum4 = 0, cnt = 0;
  for (let i = s + window; i <= e; i++) {
    let avg = 0, n = 0;
    for (let j = i - window; j < i; j++) {
      if (watts[j] != null) { avg += watts[j]; n++; }
    }
    if (n > 0) { avg /= n; sum4 += Math.pow(avg, 4); cnt++; }
  }
  return cnt > 0 ? Math.pow(sum4 / cnt, 0.25) : 0;
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
  // Smoothing
  const smoothSel = document.getElementById('proSmoothing');
  if (smoothSel) {
    smoothSel.value = _proSmoothing;
    smoothSel.onchange = () => {
      _proSmoothing = parseInt(smoothSel.value) || 5;
      _buildChart();
    };
  }

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

  // Histogram mode toggle
  const histBtn = document.getElementById('proHistogramBtn');
  if (histBtn) {
    histBtn.onclick = () => {
      _proChartMode = _proChartMode === 'histogram' ? 'timeseries' : 'histogram';
      histBtn.classList.toggle('pro-mode-active', _proChartMode === 'histogram');
      _buildProChart();
    };
  }

  // Compare button — load another activity overlay
  const compareBtn = document.getElementById('proCompareBtn');
  if (compareBtn) {
    compareBtn.onclick = async () => {
      if (_proCompareStreams) {
        _proCompareStreams = null;
        _proCompareActivity = null;
        compareBtn.classList.remove('pro-mode-active');
        compareBtn.textContent = 'Compare';
        _buildProChart();
        return;
      }
      compareBtn.textContent = 'Loading...';
      try {
        // Fetch recent activities to find a similar one
        const actId = _proActivity?.id;
        let compareId = null;
        let compareName = '';

        // Try similar rides first
        const similar = window.state?._similarRides;
        if (similar?.length) {
          compareId = similar[0].id;
          compareName = similar[0].name || 'Similar ride';
        } else {
          // Fallback: fetch recent activities and pick previous one
          const recent = await window.icuFetch?.(`/activities?oldest=${new Date(Date.now() - 90*86400000).toISOString().split('T')[0]}&newest=${new Date().toISOString().split('T')[0]}`);
          if (recent?.length > 1) {
            const other = recent.find(a => a.id !== actId);
            if (other) { compareId = other.id; compareName = other.name || 'Previous ride'; }
          }
        }

        if (!compareId) {
          compareBtn.textContent = 'Compare';
          if (window._showToast) window._showToast('No comparable ride found', 'warning');
          return;
        }

        const resp = await window.icuFetch?.(`/activity/${compareId}/streams?types=watts,heartrate,cadence,velocity_smooth,altitude,time,distance`);
        if (resp) {
          _proCompareStreams = resp;
          _proCompareActivity = { id: compareId, name: compareName };
          compareBtn.classList.add('pro-mode-active');
          compareBtn.textContent = `✕ ${compareName.substring(0, 15)}`;
          _buildProChart();
        } else {
          compareBtn.textContent = 'Compare';
        }
      } catch (e) {
        compareBtn.textContent = 'Compare';
        if (window._showToast) window._showToast('Failed to load comparison', 'error');
      }
    };
  }

  // Clear brush on click without shift
  canvas.addEventListener('click', (e) => {
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

  // Keyboard shortcuts
  document.addEventListener('keydown', _proKeyHandler);
}

function _proKeyHandler(e) {
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
}

console.info('[ProAnalysis] Module loaded');
