/* Workout Builder module — v424 */
import { state } from './state.js';

/* ── Lazy proxies for functions defined in other modules ── */
const _app = (fn) => (...a) => window[fn](...a);
const showToast            = _app('showToast');
const cleanupPageCharts    = _app('cleanupPageCharts');
const _mlGetStyle          = _app('_mlGetStyle');
const _mlApplyTerrain      = _app('_mlApplyTerrain');
const loadTerrainEnabled   = _app('loadTerrainEnabled');
const hmRedraw             = _app('hmRedraw');
const renderDashboard      = _app('renderDashboard');
const renderFitnessPage    = _app('renderFitnessPage');
const renderPowerPage      = _app('renderPowerPage');
const renderCalendar       = _app('renderCalendar');
const renderActivityBasic  = _app('renderActivityBasic');
const renderWeatherPage    = _app('renderWeatherPage');
const renderHeatmapPage    = _app('renderHeatmapPage');
const renderZonesPage      = _app('renderZonesPage');
const updateComparePage    = _app('updateComparePage');
/* _hm, _rb, _compare accessed via window for cross-module state */

/* ====================================================
   WORKOUT BUILDER
==================================================== */
const wrkState = {
  name: 'New Workout',
  segments: [],
  editIdx: null,
  ftpOverride: null,
  saveId: null,
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
export function wrkZoneColor(pct, alpha = 0.88) {
  if (pct < 55)  return `rgba(110,110,150,${alpha})`;
  if (pct < 75)  return `rgba(74,158,255,${alpha})`;
  if (pct < 90)  return `rgba(0,229,160,${alpha})`;
  if (pct < 105) return `rgba(255,204,0,${alpha})`;
  if (pct < 120) return `rgba(255,107,53,${alpha})`;
  return             `rgba(255,82,82,${alpha})`;
}

export function wrkGetFtp() {
  if (wrkState.ftpOverride) return wrkState.ftpOverride;
  const ftp = state.athlete?.ftp || state.athlete?.icu_ftp || state.athlete?.threshold_power;
  return (ftp && ftp > 0) ? ftp : 250;
}

export function wrkSegDuration(seg) {
  return seg.type === 'interval'
    ? seg.reps * (seg.onDuration + seg.offDuration)
    : seg.duration;
}

export function wrkTotalSecs() {
  return wrkState.segments.reduce((s, seg) => s + wrkSegDuration(seg), 0);
}

export function wrkFmtTime(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

export function wrkEstimateTSS() {
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

export function wrkSetName(val) {
  wrkState.name = val;
  wrkRefreshStats();
}

export function wrkSetFtp(val) {
  wrkState.ftpOverride = val ? parseInt(val) : null;
  wrkRefreshStats();
  wrkDrawChart();
}

export function wrkRefreshStats() {
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
export function wrkDrawChart() {
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

  const PAD_T = 6, PAD_B = 22, PAD_L = 4, PAD_R = 4;
  const cW = W - PAD_L - PAD_R;
  const cH = H - PAD_T - PAD_B;
  const totalSecs = wrkTotalSecs();
  const MAX_PCT = 160;

  // Background
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.clearRect(0, 0, W, H);

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

    // Selection highlight — subtle bottom accent line
    if (isSelected) {
      ctx.strokeStyle = 'rgba(0,229,160,0.5)';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(x, PAD_T + cH); ctx.lineTo(x + segW, PAD_T + cH); ctx.stroke();
    }

    // Time label at segment start (skip first and very narrow ones)
    if (idx > 0 && segW > 30) {
      ctx.fillStyle = _isDark() ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)';
      ctx.textAlign = 'center';
      ctx.font = '9px Inter, sans-serif';
      ctx.fillText(wrkFmtTime(Math.round(curSec)), x, PAD_T + cH + 16);
    }

    curSec += dur;
  });

  // Final time label
  ctx.fillStyle = _isDark() ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)';
  ctx.textAlign = 'center';
  ctx.font = '9px Inter, sans-serif';
  ctx.fillText(wrkFmtTime(Math.round(totalSecs)), PAD_L + cW, PAD_T + cH + 14);

  // Y-axis grid lines + labels (drawn on top of bars)
  const gridPcts = [50, 75, 100, 125];
  gridPcts.forEach(pct => {
    const y = PAD_T + cH * (1 - pct / MAX_PCT);
    const dk = _isDark();
    ctx.strokeStyle = pct === 100
      ? (dk ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)')
      : (dk ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)');
    ctx.lineWidth = pct === 100 ? 1 : 0.5;
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(PAD_L + cW, y); ctx.stroke();
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = pct === 100
      ? (dk ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)')
      : (dk ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.35)');
    ctx.fillText(pct, PAD_L + 3, y - 3);
  });
}

export function wrkDrawBlock(ctx, x, w, pct, maxPct, padT, cH) {
  const barH = Math.max(2, (pct / maxPct) * cH);
  const y = padT + cH - barH;
  ctx.fillStyle = wrkZoneColor(pct);
  ctx.fillRect(x, y, Math.max(1, w), barH);
}

export function wrkDrawRamp(ctx, x, w, pctFrom, pctTo, maxPct, padT, cH) {
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

export function wrkDrawFree(ctx, x, w, maxPct, padT, cH) {
  const pct  = 50;
  const barH = (pct / maxPct) * cH;
  const y    = padT + cH - barH;
  ctx.fillStyle = 'rgba(120,120,140,0.35)';
  ctx.fillRect(x, y, Math.max(1, w), barH);
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  for (let i = 0; i < w; i += 8) ctx.fillRect(x + i, y, 4, barH);
}

/* ── Segment list rendering ───────────────────── */
export function wrkRender() {
  wrkDrawChart();
  wrkRefreshStats();

  const list = document.getElementById('wrkSegmentList');
  if (!list) return;
  const segs = wrkState.segments;

  if (!segs.length) {
    list.innerHTML = '<div class="wrk-list-empty">No segments yet — add one above</div>';
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

  // Init scrubber interactions after DOM update
  requestAnimationFrame(() => wrkInitScrubbers());
}

function _wrkFmtSecs(secs) {
  const m = Math.floor(secs / 60), s = secs % 60;
  if (m > 0 && s > 0) return `${m}m ${s}s`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

function _wrkScrub(idx, field, val, min, max, unit, isPower, step) {
  const color = isPower ? `style="color:${wrkZoneColor(val, 1)}"` : '';
  const isDur = unit === 'dur';
  const display = isDur ? _wrkFmtSecs(val) : val;
  const unitText = isDur ? '' : unit;
  return `<div class="wrk-scrub" data-idx="${idx}" data-field="${field}" data-min="${min}" data-max="${max}" data-val="${val}" data-step="${step || 1}" ${isPower ? 'data-power="1"' : ''} ${isDur ? 'data-fmt="dur"' : ''}>
      <div class="wrk-scrub-head">
        <span class="wrk-scrub-val" ${color}>${display}</span>
        ${unitText ? `<span class="wrk-scrub-unit">${unitText}</span>` : ''}
      </div>
      <div class="wrk-scrub-track"><div class="wrk-scrub-ruler"></div></div>
    </div>`;
}

function _wrkDurRow(label, idx, field, secs, maxSecs, step) {
  return `<div class="wrk-edit-row">
      <label>${label}</label>
      ${_wrkScrub(idx, field, secs, 0, maxSecs || 3600, 'dur', false, step || 15)}
    </div>`;
}

function _wrkPowerRow(label, idx, field, val, min, max) {
  return `<div class="wrk-edit-row">
      <label>${label}</label>
      ${_wrkScrub(idx, field, val, min, max, '%', true)}
    </div>`;
}

export function wrkBuildEditPanel(seg, idx) {
  let fields = '';
  if (seg.type === 'steady') {
    fields = _wrkDurRow('Duration', idx, 'duration', seg.duration, 3600, 15)
           + _wrkPowerRow('Power', idx, 'power', seg.power, 40, 160);
  } else if (seg.type === 'warmup' || seg.type === 'cooldown') {
    fields = _wrkDurRow('Duration', idx, 'duration', seg.duration, 3600, 15)
           + _wrkPowerRow('Power from', idx, 'powerLow', seg.powerLow, 30, 130)
           + _wrkPowerRow('Power to', idx, 'powerHigh', seg.powerHigh, 30, 130);
  } else if (seg.type === 'interval') {
    fields = `<div class="wrk-edit-row">
        <label>Reps</label>
        ${_wrkScrub(idx, 'reps', seg.reps, 1, 50, '×')}
      </div>`
           + _wrkDurRow('Work', idx, 'onDuration', seg.onDuration, 600, 5)
           + _wrkPowerRow('Work power', idx, 'onPower', seg.onPower, 50, 200)
           + _wrkDurRow('Rest', idx, 'offDuration', seg.offDuration, 600, 5)
           + _wrkPowerRow('Rest power', idx, 'offPower', seg.offPower, 30, 100);
  } else if (seg.type === 'free') {
    fields = _wrkDurRow('Duration', idx, 'duration', seg.duration, 3600, 15);
  }

  return `<div class="wrk-edit-panel">${fields}</div>`;
}

// ── Init scrubbers after wrkRender ──────────────────────────
const _WRK_PX = 6;
const _WRK_THRESHOLD = 10;

export function wrkInitScrubbers() {
  document.querySelectorAll('#wrkSegmentList .wrk-scrub').forEach(el => {
    const idx   = +el.dataset.idx;
    const field = el.dataset.field;
    const min   = +el.dataset.min;
    const max   = +el.dataset.max;
    const step  = +(el.dataset.step || 1);
    const isPow = el.dataset.power === '1';
    const isDur = el.dataset.fmt === 'dur';
    let val     = +el.dataset.val;

    const ruler   = el.querySelector('.wrk-scrub-ruler');
    const valEl   = el.querySelector('.wrk-scrub-val');
    let dragStartX = 0, dragStartVal = 0;
    let pending = false, dragging = false, pid = 0;

    function apply(v) {
      val = Math.max(min, Math.min(max, Math.round(v / step) * step));
      const trackW = el.querySelector('.wrk-scrub-track').clientWidth || 60;
      const stepIdx = (val - min) / step;
      ruler.style.transform = `translateX(${trackW / 2 - stepIdx * _WRK_PX}px)`;
      valEl.textContent = isDur ? _wrkFmtSecs(val) : val;
      if (isPow) valEl.style.color = wrkZoneColor(val, 1);
      el.dataset.val = val;
      wrkSet(idx, field, val);
    }

    // Set initial ruler position
    const trackW = el.querySelector('.wrk-scrub-track').clientWidth || 60;
    const stepIdx = (val - min) / step;
    ruler.style.transform = `translateX(${trackW / 2 - stepIdx * _WRK_PX}px)`;

    el.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      dragStartX = e.clientX;
      dragStartVal = val;
      pending = true;
      pid = e.pointerId;
    });

    el.addEventListener('pointermove', e => {
      if (pending) {
        if (Math.abs(e.clientX - dragStartX) < _WRK_THRESHOLD) return;
        pending = false;
        dragging = true;
        el.setPointerCapture(pid);
      }
      if (!dragging) return;
      apply(dragStartVal - (e.clientX - dragStartX) / _WRK_PX * step);
    });

    el.addEventListener('touchmove', e => { if (dragging || pending) e.preventDefault(); }, { passive: false });

    const end = () => { pending = false; dragging = false; };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  });
}

/* ── Segment operations ───────────────────────── */
export function wrkAddSegment(type) {
  wrkState.segments.push({ ...WRK_DEFAULTS[type] });
  wrkState.editIdx = wrkState.segments.length - 1;
  wrkRender();
}

export function wrkRemove(idx) {
  wrkState.segments.splice(idx, 1);
  if (wrkState.editIdx === idx) wrkState.editIdx = null;
  else if (wrkState.editIdx > idx) wrkState.editIdx--;
  wrkRender();
}

export function wrkMove(idx, dir) {
  const segs = wrkState.segments;
  const ni = idx + dir;
  if (ni < 0 || ni >= segs.length) return;
  [segs[idx], segs[ni]] = [segs[ni], segs[idx]];
  if (wrkState.editIdx === idx) wrkState.editIdx = ni;
  else if (wrkState.editIdx === ni) wrkState.editIdx = idx;
  wrkRender();
}

export function wrkToggleEdit(idx) {
  wrkState.editIdx = wrkState.editIdx === idx ? null : idx;
  wrkRender();
}

export function wrkSet(idx, field, val) {
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

export function wrkClear() {
  if (wrkState.segments.length && !confirm('Start a new workout? Current workout will be lost.')) return;
  wrkState.segments = [];
  wrkState.editIdx  = null;
  wrkState.name     = 'New Workout';
  wrkState.saveId   = null;
  const inp = document.getElementById('wrkNameInput');
  if (inp) inp.value = 'New Workout';
  wrkRender();
}

/* ── Exports ──────────────────────────────────── */
export function wrkExportZwo() {
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

export function wrkExportFit() {
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

/* ── Send to Calendar (intervals.icu) ──────────── */
const icuPost            = _app('icuPost');
const fetchCalendarEvents = _app('fetchCalendarEvents');

function _wrkFmtDur(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0 && m > 0 && s > 0) return `${h}h${m}m${s}s`;
  if (h > 0 && m > 0) return `${h}h${m}m`;
  if (h > 0) return `${h}h`;
  if (m > 0 && s > 0) return `${m}m${s}s`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

export function wrkToDescription() {
  const lines = [];
  let hasWarmup = false, hasMain = false, hasCooldown = false;

  wrkState.segments.forEach(seg => {
    if (seg.type === 'warmup' && !hasWarmup) {
      lines.push('Warmup');
      hasWarmup = true;
    } else if (seg.type === 'cooldown' && !hasCooldown) {
      if (hasMain || hasWarmup) lines.push('');
      lines.push('Cooldown');
      hasCooldown = true;
    } else if (!hasMain && seg.type !== 'warmup') {
      if (hasWarmup) lines.push('');
      lines.push('Main Set');
      hasMain = true;
    }

    const dur = _wrkFmtDur(seg.duration || 0);
    if (seg.type === 'warmup') {
      lines.push(`- ${dur} ramp ${seg.powerLow}%-${seg.powerHigh}%`);
    } else if (seg.type === 'cooldown') {
      const hi = Math.max(seg.powerLow, seg.powerHigh);
      const lo = Math.min(seg.powerLow, seg.powerHigh);
      lines.push(`- ${dur} ramp ${hi}%-${lo}%`);
    } else if (seg.type === 'steady') {
      lines.push(`- ${dur} ${seg.power}%`);
    } else if (seg.type === 'interval') {
      const onDur = _wrkFmtDur(seg.onDuration);
      const offDur = _wrkFmtDur(seg.offDuration);
      lines.push(`${seg.reps}x`);
      lines.push(`- ${onDur} ${seg.onPower}%`);
      lines.push(`- ${offDur} ${seg.offPower}%`);
    } else if (seg.type === 'free') {
      lines.push(`- ${dur} freeride`);
    }
  });

  return lines.join('\n');
}

export async function wrkSendToCalendar() {
  if (!wrkState.segments.length) { showToast('Add segments first', 'error'); return; }
  if (!state.athleteId) { showToast('Connect to intervals.icu first', 'error'); return; }

  // Open a date picker sheet
  const overlay = document.getElementById('wrkCalDateOverlay');
  if (overlay) {
    overlay.style.display = '';
    requestAnimationFrame(() => overlay.classList.add('active'));
    // Init to today
    const today = new Date();
    window._wrkCalDateMonth = { year: today.getFullYear(), month: today.getMonth() };
    window._wrkCalDateSelected = null;
    _wrkCalDateRender();
  }
}

function _wrkCalDateRender() {
  const grid = document.getElementById('wrkCalDateGrid');
  const label = document.getElementById('wrkCalDateMonthLabel');
  if (!grid || !label) return;
  const { year, month } = window._wrkCalDateMonth;
  label.textContent = new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const first = new Date(year, month, 1);
  let startDay = first.getDay() - 1;
  if (startDay < 0) startDay = 6;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = new Date().toISOString().slice(0, 10);

  let html = '';
  for (let i = 0; i < startDay; i++) html += '<span class="gd-empty"></span>';
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const cls = ['gd-day'];
    if (ds === window._wrkCalDateSelected) cls.push('gd-day--selected');
    if (ds === todayStr) cls.push('gd-day--today');
    html += `<button class="${cls.join(' ')}" onclick="_wrkCalDatePick('${ds}')">${d}</button>`;
  }
  const totalCells = startDay + daysInMonth;
  for (let i = totalCells; i < 42; i++) html += '<span class="gd-empty"></span>';
  grid.innerHTML = html;
}

function _wrkCalDateNav(dir) {
  const m = window._wrkCalDateMonth;
  m.month += dir;
  if (m.month > 11) { m.month = 0; m.year++; }
  if (m.month < 0)  { m.month = 11; m.year--; }
  _wrkCalDateRender();
}

function _wrkCalDateToday() {
  const t = new Date();
  window._wrkCalDateMonth = { year: t.getFullYear(), month: t.getMonth() };
  window._wrkCalDateSelected = t.toISOString().slice(0, 10);
  _wrkCalDateRender();
  _wrkCalDateConfirm();
}

async function _wrkCalDatePick(ds) {
  window._wrkCalDateSelected = ds;
  _wrkCalDateRender();
  // Auto-confirm after selection
  await _wrkCalDateConfirm();
}

async function _wrkCalDateConfirm() {
  const date = window._wrkCalDateSelected;
  if (!date) return;

  const overlay = document.getElementById('wrkCalDateOverlay');
  const btn = overlay?.querySelector('.gd-day--selected');
  if (btn) { btn.style.pointerEvents = 'none'; btn.style.opacity = '0.5'; }

  try {
    const name = wrkState.name || 'CycleIQ Workout';
    const description = wrkToDescription();
    const totalSecs = wrkTotalSecs();
    const tss = wrkEstimateTSS();

    const payload = {
      start_date_local: date + 'T00:00:00',
      name,
      category: 'WORKOUT',
      type: 'Ride',
      description,
    };
    if (totalSecs > 0) payload.moving_time = totalSecs;
    if (tss > 0) payload.icu_training_load = tss;

    await icuPost(`/athlete/${state.athleteId}/events`, payload);
    _wrkCalDateClose();
    showToast('Workout added to calendar — syncs to Garmin automatically', 'success');

    // Refresh calendar if visible
    try { await fetchCalendarEvents(); renderCalendar(); } catch {}
  } catch (err) {
    showToast('Failed: ' + err.message, 'error');
  } finally {
    if (btn) { btn.style.pointerEvents = ''; btn.style.opacity = ''; }
  }
}

function _wrkCalDateClose() {
  const overlay = document.getElementById('wrkCalDateOverlay');
  if (overlay) {
    overlay.classList.remove('active');
    setTimeout(() => overlay.style.display = 'none', 300);
  }
}

// Expose to window for onclick handlers
Object.assign(window, {
  wrkSendToCalendar, wrkToDescription, _wrkCalDateNav, _wrkCalDateToday, _wrkCalDatePick, _wrkCalDateClose,
});

/* ── Workout persistence (IndexedDB) ──────────── */
const WRK_DB = 'cycleiq_workouts';
const WRK_STORE = 'workouts';

async function _wrkOpenDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(WRK_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(WRK_STORE))
        db.createObjectStore(WRK_STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function wrkSave() {
  if (!wrkState.segments.length) { showToast('Add segments first', 'error'); return; }
  try {
    const db = await _wrkOpenDB();
    const workout = {
      id: wrkState.saveId || crypto.randomUUID(),
      name: wrkState.name || 'Untitled Workout',
      ts: Date.now(),
      segments: JSON.parse(JSON.stringify(wrkState.segments)),
      tssEstimate: wrkEstimateTSS(),
      totalDuration: wrkTotalSecs(),
      ftpOverride: wrkState.ftpOverride,
    };
    const tx = db.transaction(WRK_STORE, 'readwrite');
    tx.objectStore(WRK_STORE).put(workout);
    await new Promise((r, j) => { tx.oncomplete = r; tx.onerror = j; });
    db.close();
    wrkState.saveId = workout.id;
    showToast('Workout saved', 'success');
  } catch (e) {
    console.error('wrkSave', e);
    showToast('Failed to save workout', 'error');
  }
}

export async function wrkLoadAll() {
  try {
    const db = await _wrkOpenDB();
    const tx = db.transaction(WRK_STORE, 'readonly');
    const all = await new Promise((r, j) => {
      const req = tx.objectStore(WRK_STORE).getAll();
      req.onsuccess = () => r(req.result || []);
      req.onerror = j;
    });
    db.close();
    return all.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  } catch { return []; }
}

export async function wrkDeleteSaved(id) {
  try {
    const db = await _wrkOpenDB();
    const tx = db.transaction(WRK_STORE, 'readwrite');
    tx.objectStore(WRK_STORE).delete(id);
    await new Promise((r, j) => { tx.oncomplete = r; tx.onerror = j; });
    db.close();
  } catch {}
}

export function wrkLoadWorkout(workout) {
  wrkState.name = workout.name || 'Untitled Workout';
  wrkState.segments = JSON.parse(JSON.stringify(workout.segments || []));
  wrkState.editIdx = null;
  wrkState.ftpOverride = workout.ftpOverride || null;
  wrkState.saveId = workout.id;
  const inp = document.getElementById('wrkNameInput');
  if (inp) inp.value = wrkState.name;
  const ftpInp = document.getElementById('wrkFtpInput');
  if (ftpInp) ftpInp.value = wrkState.ftpOverride || '';
  wrkRender();
}

export function wrkDownload(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/* ── Garmin FIT encoder ───────────────────────── */
export function buildFitWorkout(segments, name, ftp) {
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

// Sticky chart: toggle .wrk-chart-stuck when card hits top
(function() {
  const initSticky = () => {
    const card = document.querySelector('.wrk-chart-card');
    if (!card) return;
    // Sentinel div placed just before the card to detect when it leaves viewport
    let sentinel = document.getElementById('wrkStickySentinel');
    if (!sentinel) {
      sentinel = document.createElement('div');
      sentinel.id = 'wrkStickySentinel';
      sentinel.style.height = '1px';
      sentinel.style.marginBottom = '-1px';
      card.parentNode.insertBefore(sentinel, card);
    }
    const obs = new IntersectionObserver(([e]) => {
      card.classList.toggle('wrk-chart-stuck', !e.isIntersecting);
      // Redraw canvas since width may have changed
      if (state.currentPage === 'workout') setTimeout(wrkDrawChart, 50);
    }, { threshold: 0 });
    obs.observe(sentinel);
  };
  // Re-init when navigating to workout page
  const origNav = window.navigate;
  if (origNav) {
    const _check = () => setTimeout(initSticky, 100);
    document.addEventListener('click', (e) => {
      if (state.currentPage === 'workout') return;
      // Will be called after navigate
    });
  }
  // Init on DOM ready
  setTimeout(initSticky, 500);
  // Also hook into page transitions
  new MutationObserver(() => {
    if (document.getElementById('page-workout')?.classList.contains('active')) {
      setTimeout(initSticky, 100);
    }
  }).observe(document.getElementById('pageContent') || document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
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

    let _carouselMoveRAF = 0;
    window.addEventListener('mousemove', e => {
      if (!isDragging) return;
      const cx = e.clientX;
      const dx = cx - startX;
      if (Math.abs(dx) > 4) moved = true;
      velBuf.push({ x: cx, t: performance.now() });
      if (_carouselMoveRAF) return;
      _carouselMoveRAF = requestAnimationFrame(() => {
        _carouselMoveRAF = 0;
        rail.scrollLeft = rubberClamp(startScroll - (cx - startX));
      });
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
    if (_carouselObserver) _carouselObserver.disconnect();
    _carouselObserver = new MutationObserver(() => {
      const rail = document.getElementById('recentActScrollRail');
      if (rail) { initCarouselDrag(rail); _carouselObserver.disconnect(); _carouselObserver = null; }
    });
    _carouselObserver.observe(document.body, { childList: true, subtree: true });
  }
})();

// ── Physics scroll setting ────────────────────────────────────────────────────
export function loadPhysicsScroll() {
  const saved = localStorage.getItem('icu_physics_scroll');
  return saved === null ? true : saved === 'true'; // default ON
}
export function setPhysicsScroll(enabled) {
  try { localStorage.setItem('icu_physics_scroll', String(enabled)); } catch (e) { console.warn('localStorage.setItem failed:', e); }
  const toggle = document.getElementById('physicsScrollToggle');
  if (toggle) toggle.checked = enabled;
}
// Init toggle state on settings page load
(function() {
  const toggle = document.getElementById('physicsScrollToggle');
  if (toggle) toggle.checked = loadPhysicsScroll();
})();

// ── Map theme setting ─────────────────────────────────────────────────────────

export function loadMapTheme() {
  const saved = localStorage.getItem('icu_map_theme');
  // Validate against MAP_STYLES; old raster keys ('topo','voyager',etc.) fallback to 'liberty'
  const styles = window.MAP_STYLES || {};
  if (saved && styles[saved] && saved !== 'satellite') return saved;
  return 'strava';
}
export function setMapTheme(key) {
  if (!(window.MAP_STYLES || {})[key] || key === 'satellite') return;
  try { localStorage.setItem('icu_map_theme', key); } catch (e) { console.warn('localStorage.setItem failed:', e); }
  // Update active state on picker buttons
  document.querySelectorAll('#mapThemePicker .app-theme-card').forEach(b =>
    b.classList.toggle('active', b.dataset.theme === key));

  const style = _mlGetStyle(key);
  const bg = (window.MAP_STYLES[key] || {}).bg;

  // Hot-swap Activity map if open
  if (state.activityMap) {
    state._actMapThemeKey = key;
    state._actIsSatellite = false;  // exit satellite mode on theme change
    const satBtn = state.activityMap.getContainer().querySelector('.map-sat-control');
    if (satBtn) satBtn.classList.remove('active');
    state.activityMap.setStyle(style);
    if (typeof state._actReaddRouteLayers === 'function') {
      state.activityMap.once('idle', state._actReaddRouteLayers);
    } else {
      state.activityMap.once('style.load', () => _mlApplyTerrain(state.activityMap));
    }
    if ((window.MAP_STYLES[key] || {}).custom && typeof window._applyStravaOverrides === 'function') {
      state.activityMap.once('style.load', () => window._applyStravaOverrides(state.activityMap));
    }
    if (bg) state.activityMap.getContainer().style.background = bg;
  }

  // Hot-swap Heatmap map if open
  if (window._hm.map) {
    window._hm._isSatellite = false;
    const hmSatBtn = document.querySelector('#heatmapMap .map-sat-control');
    if (hmSatBtn) hmSatBtn.classList.remove('active');
    window._hm.map.setStyle(style);
    window._hm.map.once('style.load', () => {
      if ((window.MAP_STYLES[key] || {}).custom && typeof window._applyStravaOverrides === 'function') window._applyStravaOverrides(window._hm.map);
      hmRedraw(); _mlApplyTerrain(window._hm.map);
    });
    const hmEl = document.getElementById('heatmapMap');
    if (hmEl && bg) hmEl.style.background = bg;
  }

  // Hot-swap Route Builder map if open (routes.js module)
  if (window._rb && window._rb.map) {
    window._rb.map.setStyle(style);
    if ((window.MAP_STYLES[key] || {}).custom && typeof window._applyStravaOverrides === 'function') {
      window._rb.map.once('style.load', () => window._applyStravaOverrides(window._rb.map));
    }
    if (window._rbRestoreMapLayers) window._rb.map.once('idle', window._rbRestoreMapLayers);
    const rbBtn = document.getElementById('rbLayerBtn');
    if (rbBtn) { rbBtn.classList.remove('rb-layer-active'); rbBtn.title = 'Switch map layer'; }
    if (typeof window._rbLayerIdx !== 'undefined') {
      window._rbLayerIdx = Object.keys(window.MAP_STYLES).filter(k => k !== 'satellite').indexOf(key);
      if (window._rbLayerIdx < 0) window._rbLayerIdx = 0;
    }
  }

  // Clear cached map snapshots so they regenerate with the new theme
  Object.keys(localStorage)
    .filter(k => k.startsWith('icu_map_snap_'))
    .forEach(k => localStorage.removeItem(k));
}
// Deferred — called when Settings page opens (MAP_STYLES not yet on window at module eval)
export function initMapThemePicker() {
  document.querySelectorAll('#mapThemePicker .app-theme-card').forEach(b =>
    b.classList.toggle('active', b.dataset.theme === loadMapTheme()));
}

// ── Font picker ──────────────────────────────────────────────────────────────
const FONT_OPTIONS = {
  'inter':         "'Inter', system-ui, -apple-system, sans-serif",
  'dm-sans':       "'DM Sans', system-ui, -apple-system, sans-serif",
  'outfit':        "'Outfit', system-ui, -apple-system, sans-serif",
  'space-grotesk': "'Space Grotesk', system-ui, -apple-system, sans-serif",
};

export function loadAppFont() {
  return localStorage.getItem('icu_app_font') || 'inter';
}

export function setAppFont(key) {
  if (!FONT_OPTIONS[key]) return;
  try { localStorage.setItem('icu_app_font', key); } catch (e) { console.warn('localStorage.setItem failed:', e); }
  const family = FONT_OPTIONS[key];
  document.documentElement.style.setProperty('--font-ui', family);
  document.documentElement.style.setProperty('--font-num', family);
  // Update active pill
  document.querySelectorAll('.font-option').forEach(b =>
    b.classList.toggle('active', b.dataset.font === key));
}

(function initFontPicker() {
  const saved = loadAppFont();
  // Apply saved font immediately
  if (saved !== 'inter' && FONT_OPTIONS[saved]) {
    const family = FONT_OPTIONS[saved];
    document.documentElement.style.setProperty('--font-ui', family);
    document.documentElement.style.setProperty('--font-num', family);
  }
  // Set active state on buttons
  document.querySelectorAll('.font-option').forEach(b =>
    b.classList.toggle('active', b.dataset.font === saved));
})();

// ── Share & Donate ────────────────────────────────────────────────────────────
const SHARE_URL  = 'https://cycleiq.app';
const SHARE_TEXT = 'CycleIQ — a free, open-source cycling dashboard that pulls your data from intervals.icu';

export function copyShareLink() {
  const btn = document.getElementById('shareCopyBtn');
  navigator.clipboard.writeText(SHARE_URL).then(() => {
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
  }).catch(() => {
    document.getElementById('shareLink').select();
    document.execCommand('copy');
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
  });
}

export function shareToTwitter() {
  window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(SHARE_TEXT)}&url=${encodeURIComponent(SHARE_URL)}`, '_blank');
}
export function shareToWhatsApp() {
  window.open(`https://wa.me/?text=${encodeURIComponent(SHARE_TEXT + ' ' + SHARE_URL)}`, '_blank');
}
export function shareToReddit() {
  window.open(`https://www.reddit.com/submit?url=${encodeURIComponent(SHARE_URL)}&title=${encodeURIComponent(SHARE_TEXT)}`, '_blank');
}

// ── Theme setting ─────────────────────────────────────────────────────────────
export function _isDark() {
  return document.documentElement.getAttribute('data-theme') !== 'light';
}

export function _updateChartColors() {
  const cs = getComputedStyle(document.documentElement);
  const tickColor = cs.getPropertyValue('--chart-tick').trim() || (_isDark() ? '#62708a' : '#8892a6');
  const gridColor = cs.getPropertyValue('--chart-grid').trim() || (_isDark() ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)');
  window.C_TICK = { color: tickColor, font: { size: 10 } };
  window.C_GRID = { color: gridColor };
}

function _resolveTheme(mode) {
  if (mode === 'auto') return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  return mode;
}

function _applyResolvedTheme(resolved) {
  document.documentElement.setAttribute('data-theme', resolved);
  const tc = document.querySelector('meta[name="theme-color"]');
  if (tc) tc.setAttribute('content', resolved === 'light' ? '#f2f3f5' : resolved === 'tdf' ? '#000000' : '#090b0e');
  _updateChartColors();
  // Switch map theme to match: light → liberty, dark → strava
  if (window.MAP_STYLES) {
    const targetMap = resolved === 'light' ? 'liberty' : 'strava';
    if (loadMapTheme() !== targetMap) setMapTheme(targetMap);
  }
}

export function setTheme(mode) {
  try { localStorage.setItem('icu_theme', mode); } catch (e) { console.warn('localStorage.setItem failed:', e); }

  const resolved = _resolveTheme(mode);
  _applyResolvedTheme(resolved);

  // Refresh colour palette so zone colours match the new theme
  if (typeof refreshPalette === 'function') refreshPalette();

  // Update toggle button active states
  const toggle = document.getElementById('themePills');
  if (toggle) toggle.setAttribute('data-active', mode);
  document.querySelectorAll('#themePills .theme-toggle-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.themeVal === mode)
  );

  // Update theme picker active states (new UI)
  document.querySelectorAll('#appThemePicker .app-theme-card').forEach(c => {
    c.classList.toggle('active', c.dataset.themeVal === mode);
  });
  const themeLabel = document.getElementById('iosCurrentTheme');
  if (themeLabel) {
    const labels = { dark: 'Dark', light: 'Light', tdf: 'Tour de France', auto: 'Auto' };
    themeLabel.textContent = labels[mode] || mode;
  }

  // Re-render charts on the current page
  const pg = state.currentPage;
  if (pg) {
    cleanupPageCharts(pg);
    if (pg === 'dashboard')   renderDashboard();
    else if (pg === 'fitness')  renderFitnessPage();
    else if (pg === 'power')    renderPowerPage();
    else if (pg === 'compare')  { if (window._compare) window._compare._cachedPeriods = null; updateComparePage(); }
    else if (pg === 'calendar') renderCalendar();
    else if (pg === 'activity' && state.currentActivity) renderActivityBasic(state.currentActivity);
    else if (pg === 'weather')  renderWeatherPage();
    else if (pg === 'heatmap')  renderHeatmapPage();
    else if (pg === 'zones')    renderZonesPage();
  }
}

(function initTheme() {
  const saved = localStorage.getItem('icu_theme') || 'dark';
  const resolved = _resolveTheme(saved);
  _applyResolvedTheme(resolved);

  // Listen for system theme changes when in auto mode
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (localStorage.getItem('icu_theme') === 'auto') {
      const r = _resolveTheme('auto');
      _applyResolvedTheme(r);
      // Re-render current page charts
      const pg = state.currentPage;
      if (pg) {
        cleanupPageCharts(pg);
        if (pg === 'dashboard') renderDashboard();
        else if (pg === 'fitness') renderFitnessPage();
        else if (pg === 'power') renderPowerPage();
      }
    }
  });

  const applyToggle = () => {
    const toggle = document.getElementById('themePills');
    if (toggle) toggle.setAttribute('data-active', saved);
    document.querySelectorAll('#themePills .theme-toggle-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.themeVal === saved));
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyToggle);
  } else {
    applyToggle();
  }
})();

// ── Smooth flyover setting ───────────────────────────────────────────────────
export function loadSmoothFlyover() {
  return localStorage.getItem('icu_smooth_flyover') !== 'false'; // default on
}
export function toggleSmoothFlyover(on) {
  try { localStorage.setItem('icu_smooth_flyover', on ? 'true' : 'false'); } catch (e) { console.warn('localStorage.setItem failed:', e); }
}
(function initSmoothFlyoverToggle() {
  const el = document.getElementById('smoothFlyoverToggle');
  if (el) el.checked = loadSmoothFlyover();
})();

// ── 3D Terrain setting ──────────────────────────────────────────────────────
export function toggleTerrain3d(on) {
  window.setTerrainEnabled(on);

  // Apply / remove terrain on all live map instances
  _mlApplyTerrain(state.activityMap);
  _mlApplyTerrain(window._hm.map);
  _mlApplyTerrain(window._rb.map);

  // Enable / disable pitch controls on Activity & Heatmap maps
  // (Route Builder has its own custom pitch handler — leave it alone)
  if (state.activityMap) {
    if (on) {
      state.activityMap.dragRotate.enable();
    } else {
      state.activityMap.dragRotate.disable();
      state.activityMap.setPitch(0);
      state.activityMap.setBearing(0);
    }
  }
  if (window._hm.map) {
    if (on) {
      window._hm.map.dragRotate.enable();
    } else {
      window._hm.map.dragRotate.disable();
      window._hm.map.setPitch(0);
      window._hm.map.setBearing(0);
    }
  }

  showToast(on ? '3D terrain enabled — tilt the map to see elevation' : '3D terrain disabled', 'info');
}
// Deferred — loadTerrainEnabled may not be on window at import time
document.addEventListener('DOMContentLoaded', () => {
  const el = document.getElementById('terrain3dToggle');
  if (el && window.loadTerrainEnabled) el.checked = window.loadTerrainEnabled();
});

// ── Page-level grab-to-scroll with momentum (Figma-style) ────────────────────
(function() {
  // Only skip elements that need their own mouse behaviour (text inputs, maps, sidebar)
  // Buttons, links, cards etc. are fine — moved-flag suppresses accidental clicks after a drag
  const SKIP = 'input,select,textarea,.sidebar,.map-container,.activity-map,.recent-act-scroll-rail,.wxp-week-scroll,.hm-map,.leaflet-container';

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

  let _pageDragRAF = 0;
  window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    const cx = e.clientX, cy = e.clientY;
    const dy = cy - startY;
    const dx = cx - startX;
    if (Math.abs(dy) > 4 || Math.abs(dx) > 4) {
      moved = true;
      document.documentElement.style.cursor = 'grabbing';
    }
    velBuf.push({ x: cx, y: cy, t: performance.now() });
    if (_pageDragRAF) return;
    _pageDragRAF = requestAnimationFrame(() => {
      _pageDragRAF = 0;
      window.scrollTo(startScrollX - (cx - startX), startScrollY - (cy - startY));
    });
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

