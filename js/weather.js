/* Weather module — extracted from app.js */
import { state, ICU_BASE } from './state.js';

/* ── Lazy proxies for functions defined in other modules ── */
const _app = (fn) => (...a) => window[fn](...a);
const showToast         = _app('showToast');
const navigate          = _app('navigate');
const icuFetch          = _app('icuFetch');
const authHeader        = _app('authHeader');
const clearCardNA       = _app('clearCardNA');
const showCardNA        = _app('showCardNA');
const actCacheGet       = _app('actCacheGet');
const actCachePut       = _app('actCachePut');
const getActiveWxLocation = _app('getActiveWxLocation');
const fmtDur              = _app('fmtDur');
/* COGGAN_ZONES and ZONE_HEX accessed via window at call time */

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
export function weatherIconSvg(iconStr) {
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
export function wmoIcon(code) {
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
export function wmoLabel(code) {
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
export function windDir(deg) {
  if (deg == null) return '';
  return ['N','NE','E','SE','S','SW','W','NW'][Math.round(deg / 45) % 8];
}

// Riding tip based on current weather conditions
export function _wxRidingTip(current, daily) {
  const tips = [];
  const temp = current?.temperature_2m;
  const feelsLike = current?.apparent_temperature;
  const wind = current?.windspeed_10m ?? 0;
  const precip = current?.precipitation ?? 0;
  const uv = current?.uv_index ?? 0;
  const vis = current?.visibility ?? 99999;
  const code = current?.weathercode ?? 0;
  const rainProb = daily?.precipitation_probability_max?.[0] ?? 0;

  if (temp != null && temp < 5) tips.push('Cold ride — full winter gear recommended');
  else if (temp != null && temp < 12) tips.push('Cool — arm warmers + vest recommended');
  else if (temp != null && temp > 32) tips.push('Very hot — stay hydrated, avoid midday');

  if (rainProb > 60 || precip > 0.5) tips.push('Rain likely — pack a rain jacket');
  if (wind > 30) tips.push('Very windy — be prepared for gusts');
  if (uv >= 6) tips.push('High UV — apply sunscreen');
  if (vis < 2000) tips.push('Low visibility — use lights');
  if ([95,96,99].includes(code)) tips.push('Thunderstorms — consider staying indoors');

  return tips.length ? tips.join(' · ') : 'Great conditions for a ride!';
}

// Temperature: intervals.icu always stores °C
export function fmtTempC(c) {
  if (c == null) return '—';
  if (state.units === 'imperial') return Math.round(c * 9/5 + 32) + '°F';
  return Math.round(c) + '°C';
}

// Wind: intervals.icu stores m/s
export function fmtWindMs(ms) {
  if (ms == null) return '—';
  if (state.units === 'imperial') return Math.round(ms * 2.23694) + ' mph';
  return Math.round(ms * 3.6) + ' km/h';
}

// ── Activity weather card (data from intervals.icu activity fields) ──────────
export function renderActivityWeather(a) {
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

  if (temp == null) {
    // No intervals.icu weather — try Open-Meteo historical for outdoor rides
    _fetchHistoricalWeather(a);
    return;
  }
  _paintWeatherCard(card, temp, feels, windMs, windDeg, humidity, icon, summary, uv, pressure, precip);
}

// Paint the weather card with given data
export function _paintWeatherCard(card, temp, feels, windMs, windDeg, humidity, icon, summary, uv, pressure, precip, source) {
  clearCardNA(card);
  card.style.display = '';

  const isRain  = icon && (icon.includes('rain') || icon.includes('drizzle') || icon.includes('storm') || icon.includes('sleet'));
  const isSnow  = icon && (icon.includes('snow') || icon.includes('blizzard'));
  const isCold  = state.units === 'imperial' ? (temp * 9/5 + 32) < 40 : temp < 5;
  const quality = (isSnow || isCold) ? 'poor' : isRain ? 'fair' : 'good';
  const qLabel  = quality === 'good' ? 'Good riding conditions' : quality === 'fair' ? 'Marginal conditions' : 'Tough conditions';

  const tiles = [];
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
  if (source) tiles.push(`<div class="wx-tile wx-tile--source"><div class="wx-lbl" style="font-size:9px;opacity:0.5">${source}</div></div>`);

  document.getElementById('wxTiles').innerHTML = tiles.join('');
}

// Fetch historical weather from Open-Meteo archive API for outdoor activities
export async function _fetchHistoricalWeather(a) {
  const card = document.getElementById('detailWeatherCard');
  if (!card) return;

  // Only for outdoor activities with a date
  const type = (a.type || a.sport_type || '').toLowerCase();
  const isIndoor = /virtual|trainer|indoor|zwift|wahoo/i.test(type) || a.trainer;
  const dateStr = (a.start_date_local || a.start_date || '').substring(0, 10);
  if (!dateStr || isIndoor) { showCardNA('detailWeatherCard'); return; }

  // Get coordinates: try activity start_latlng, then user's saved weather location
  let lat = null, lng = null;
  if (a.start_latlng && Array.isArray(a.start_latlng) && a.start_latlng.length === 2) {
    lat = a.start_latlng[0]; lng = a.start_latlng[1];
  }
  if (lat == null) {
    try {
      const saved = JSON.parse(localStorage.getItem('icu_wx_coords') || 'null');
      if (saved) { lat = saved.lat; lng = saved.lng; }
    } catch (_) {}
  }
  if (lat == null || lng == null) { showCardNA('detailWeatherCard'); return; }

  // Determine ride start hour
  const startHour = new Date(a.start_date_local || a.start_date).getHours() || 12;

  try {
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}`
      + `&start_date=${dateStr}&end_date=${dateStr}`
      + `&hourly=temperature_2m,apparent_temperature,windspeed_10m,winddirection_10m,relativehumidity_2m,weathercode,surface_pressure`
      + `&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) { showCardNA('detailWeatherCard'); return; }
    const data = await res.json();
    const h = data.hourly;
    if (!h || !h.time || !h.time.length) { showCardNA('detailWeatherCard'); return; }

    // Find the hour closest to ride start
    const idx = Math.min(startHour, h.time.length - 1);

    const temp     = h.temperature_2m?.[idx];
    const feels    = h.apparent_temperature?.[idx];
    const windKmh  = h.windspeed_10m?.[idx];
    const windDeg  = h.winddirection_10m?.[idx];
    const humidity = h.relativehumidity_2m?.[idx];
    const code     = h.weathercode?.[idx];
    const pressure = h.surface_pressure?.[idx];

    if (temp == null) { showCardNA('detailWeatherCard'); return; }

    // Convert WMO code to icon name and summary
    const icon    = wmoLabel(code ?? 0).toLowerCase();
    const summary = wmoLabel(code ?? 0);
    // Wind: Open-Meteo returns km/h, convert to m/s for fmtWindMs
    const windMs  = windKmh != null ? windKmh / 3.6 : null;
    // Humidity: Open-Meteo returns 0-100, convert to 0-1
    const humFrac = humidity != null ? humidity / 100 : null;

    _paintWeatherCard(card, temp, feels, windMs, windDeg, humFrac, icon, summary, null, pressure, null, 'Historical · Open-Meteo');
  } catch (_) {
    showCardNA('detailWeatherCard');
  }
}

// ── Activity Notes (read/write description via intervals.icu API) ────────────
export function renderActivityNotes(a) {
  const card  = document.getElementById('detailNotesCard');
  const input = document.getElementById('actNotesInput');
  const stat  = document.getElementById('actNotesStatus');
  if (!card || !input) return;

  card.style.display = '';
  const orig = a.description || '';
  input.value = orig;
  stat.textContent = '';
  stat.className = 'act-notes-status';

  // Remove old listeners by cloning
  const fresh = input.cloneNode(true);
  input.parentNode.replaceChild(fresh, input);
  fresh.value = orig;

  let saveTimer = null;
  fresh.addEventListener('input', () => {
    clearTimeout(saveTimer);
    stat.textContent = '';
    saveTimer = setTimeout(() => _saveActivityNotes(a, fresh, stat, orig), 1200);
  });
  fresh.addEventListener('blur', () => {
    clearTimeout(saveTimer);
    if (fresh.value !== orig) _saveActivityNotes(a, fresh, stat, orig);
  });
}

export async function _saveActivityNotes(a, textarea, statusEl, origText) {
  const text = textarea.value;
  if (text === origText) return;

  statusEl.textContent = 'Saving…';
  statusEl.className = 'act-notes-status act-notes-status--saving';

  try {
    const actId = a.id;
    const res = await fetch(ICU_BASE + `/activity/${actId}`, {
      method: 'PUT',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: text }),
    });
    if (!res.ok) throw new Error(res.status);
    // Update local cache so re-renders don't lose the edit
    a.description = text;
    // Also update IDB cache so re-navigation shows the saved text
    const cached = await actCacheGet(a.id, 'detail');
    if (cached) { cached.description = text; actCachePut(a.id, 'detail', cached); }
    statusEl.textContent = 'Saved';
    statusEl.className = 'act-notes-status act-notes-status--saved';
    setTimeout(() => { statusEl.textContent = ''; }, 2500);
  } catch (e) {
    console.error('[Notes] Save failed:', e);
    statusEl.textContent = 'Save failed';
    statusEl.className = 'act-notes-status';
    showToast('Could not save notes — check connection', 'error');
  }
}

// ── Activity Intervals (fetched from intervals.icu) ──────────────────────────
export async function renderActivityIntervals(activityId) {
  const card = document.getElementById('detailIntervalsCard');
  const body = document.getElementById('detailIntervalsBody');
  const sub  = document.getElementById('detailIntervalsSubtitle');
  if (!card || !body) return;

  try {
    const raw = await icuFetch(`/activity/${activityId}/intervals`);
    const intervals = raw?.icu_intervals;
    if (!Array.isArray(intervals) || intervals.length === 0) {
      card.style.display = 'none';
      return;
    }

    // Classify interval type from API type field
    const classify = (ivl) => {
      const t = (ivl.type || '').toUpperCase();
      if (/WORK/.test(t)) return 'work';
      if (/REST|RECOVER/.test(t)) return 'rest';
      if (/WARM/.test(t)) return 'warmup';
      if (/COOL/.test(t)) return 'cooldown';
      return '';
    };

    const workCount = intervals.filter(iv => classify(iv) === 'work').length;
    sub.textContent = workCount > 0
      ? `${workCount} work interval${workCount !== 1 ? 's' : ''} · ${intervals.length} total`
      : `${intervals.length} interval${intervals.length !== 1 ? 's' : ''}`;

    // Zone column: API returns 1-indexed zone number; map to 0-indexed for ZONE_HEX/COGGAN_ZONES
    const hasZones = intervals.some(iv => iv.zone > 0);

    let html = `<table class="act-ivl-table">
      <thead><tr>
        <th>#</th><th>Type</th><th>Duration</th>
        <th>Avg Power</th><th>Avg HR</th><th>Avg Cad</th>
        ${hasZones ? '<th>Zone</th>' : ''}
      </tr></thead><tbody>`;

    intervals.forEach((ivl, i) => {
      const type  = classify(ivl);
      const secs  = ivl.moving_time || ivl.elapsed_time || 0;
      const watts = Math.round(ivl.average_watts || 0);
      const hr    = Math.round(ivl.average_heartrate || 0);
      const cad   = Math.round(ivl.average_cadence || 0);
      const zIdx  = ivl.zone > 0 ? ivl.zone - 1 : null;  // API is 1-indexed
      const typeCls = type ? `act-ivl-type act-ivl-type--${type}` : 'act-ivl-type';
      const typeLabel = type || (ivl.type || '—').toLowerCase();
      const name  = ivl.label || '';

      html += `<tr>
        <td>${i + 1}</td>
        <td><span class="${typeCls}">${typeLabel}</span>${name ? ` <span class="act-ivl-name">${name}</span>` : ''}</td>
        <td>${secs > 0 ? fmtDur(secs) : '—'}</td>
        <td>${watts > 0 ? watts + ' W' : '—'}</td>
        <td>${hr > 0 ? hr + ' bpm' : '—'}</td>
        <td>${cad > 0 ? cad + ' rpm' : '—'}</td>
        ${hasZones ? `<td>${zIdx != null && window.COGGAN_ZONES[zIdx] ? `<span class="act-ivl-zone" style="background:${window.ZONE_HEX[zIdx]}"></span>${window.COGGAN_ZONES[zIdx].name}` : '—'}</td>` : ''}
      </tr>`;
    });

    html += '</tbody></table>';
    body.innerHTML = html;
    card.style.display = '';
  } catch (e) {
    console.error('[Intervals] Fetch failed:', e);
    card.style.display = 'none';
  }
}

// ── 7-day riding forecast (Open-Meteo, free, no API key) ────────────────────
export async function renderWeatherForecast() {
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
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode,windspeed_10m_max&hourly=weathercode&timezone=auto&forecast_days=7&temperature_unit=${tUnit}&wind_speed_unit=${wUnit}&models=${wxModel}`;
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

  // Cache today's weather code per location for pill icons
  try {
    const wxCodes = JSON.parse(localStorage.getItem('icu_wx_today_codes') || '{}');
    const activeLoc = getActiveWxLocation();
    if (activeLoc && forecast.daily.weathercode) {
      wxCodes[activeLoc.id] = forecast.daily.weathercode[0];
      localStorage.setItem('icu_wx_today_codes', JSON.stringify(wxCodes));
    }
  } catch (_) {}

  const { time, temperature_2m_max: highs, temperature_2m_min: lows,
          precipitation_probability_max: precips, weathercode: _fDailyCodes,
          windspeed_10m_max: winds } = forecast.daily;

  // Derive smarter representative weathercode per day from hourly data (6am–9pm)
  const codes = (() => {
    const hCodes = forecast.hourly?.weathercode;
    if (!hCodes || !hCodes.length) return _fDailyCodes;
    const severity = c => {
      if ([95,96,99].includes(c)) return 90;
      if ([71,73,75,77,85,86].includes(c)) return 80;
      if ([66,67].includes(c)) return 75;
      if ([61,63,65,80,81,82].includes(c)) return 70;
      if ([56,57].includes(c)) return 65;
      if ([51,53,55].includes(c)) return 50;
      if ([45,48].includes(c)) return 30;
      if (c === 3) return 15;
      if (c === 2) return 10;
      if (c === 1) return 5;
      return 0;
    };
    return _fDailyCodes.map((fallback, i) => {
      const dayStart = i * 24 + 6;
      const dayEnd   = i * 24 + 21;
      const slice = hCodes.slice(dayStart, dayEnd);
      if (!slice.length) return fallback;
      const freq = {};
      slice.forEach(c => { freq[c] = (freq[c] || 0) + 1; });
      let best = slice[0], bestCount = 0;
      for (const [code, count] of Object.entries(freq)) {
        const c = Number(code);
        if (count > bestCount || (count === bestCount && severity(c) > severity(best))) {
          best = c; bestCount = count;
        }
      }
      return best;
    });
  })();

  const deg = state.units === 'imperial' ? '°F' : '°C';

  // Score each day for cycling suitability (harsher, mirrors weather page rideScore)
  function ridingScore(i) {
    const code   = codes[i];
    const wind   = winds?.[i] ?? 0;
    const precip = precips?.[i] ?? 0;
    const high   = highs[i];
    const isMetric = state.units !== 'imperial';

    const isStorm = [95,96,99].includes(code);
    const isSnow  = [71,73,75,77,85,86].includes(code);
    const isRain  = [51,53,55,56,57,61,63,65,67,80,81,82].includes(code);
    const isDriz  = [51,53,55].includes(code);
    const isFog   = [45,48].includes(code);
    const isCloudy= [2,3].includes(code);

    const coldThresh = isMetric ? 4 : 40;
    const windPoor   = isMetric ? 52 : 32;
    const windHigh   = isMetric ? 32 : 20;

    let score = 100;

    // Weather condition
    if (isStorm)               score -= 80;
    else if (isSnow)           score -= 70;
    else if (isRain && !isDriz) score -= 50 + Math.min(precip, 55) * 0.6;
    else if (isDriz)           score -= 38;
    else if (isFog)            score -= 35;
    else if (isCloudy)         score -= 5;

    // Precipitation probability
    if (!isRain && !isDriz && !isSnow && !isStorm) {
      if      (precip >= 60) score -= 35;
      else if (precip >= 40) score -= 22;
      else if (precip >= 25) score -= 14;
      else if (precip >= 10) score -= 6;
    }

    // Temperature
    if (high < coldThresh)                     score -= 40;
    else if (high < (isMetric ? 8  : 46))      score -= 25;
    else if (high < (isMetric ? 12 : 54))      score -= 10;
    else if (high > (isMetric ? 35 : 95))      score -= 30;
    else if (high > (isMetric ? 32 : 90))      score -= 12;

    // Wind
    if (wind > windPoor)      score -= 40;
    else if (wind > windHigh) score -= 25;
    else if (wind > (isMetric ? 20 : 12)) score -= 8;

    score = Math.max(0, Math.min(100, Math.round(score)));
    return score >= 85 ? 'good' : score >= 35 ? 'fair' : 'poor';
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

/* ── Sun arc helper (sunrise/sunset visual) ── */
export function _buildSunArc(sunProgress, heroSr, heroSs) {
  const p = Math.max(0, Math.min(1, sunProgress));
  const isDay = sunProgress >= 0 && sunProgress <= 1;
  const W = 240, H = 72, PAD = 20;
  const arcD = 'M' + PAD + ',' + H + ' Q' + (W/2) + ',' + (-H*0.7) + ' ' + (W-PAD) + ',' + H;
  // Sun position on quadratic bezier
  const t = p;
  const x0 = PAD, y0 = H, x1 = W/2, y1 = -H*0.7, x2 = W-PAD, y2 = H;
  const sx = (1-t)*(1-t)*x0 + 2*(1-t)*t*x1 + t*t*x2;
  const sy = (1-t)*(1-t)*y0 + 2*(1-t)*t*y1 + t*t*y2;
  const isNight = !isDay;
  const primaryLabel = isNight ? 'SUNRISE' : 'SUNSET';
  const primaryTime = isNight ? heroSr : heroSs;
  const secondaryLabel = isNight ? 'Sunset: ' + heroSs : 'Sunrise: ' + heroSr;
  // Sun dot: show on arc during day, or on horizon line at night
  const dotX = isDay ? sx : (sunProgress <= 0 ? PAD : W - PAD);
  const dotY = isDay ? sy : H;
  const dotColor = isDay ? '#FFD93D' : 'rgba(255,217,61,0.4)';
  const dotStroke = isDay ? '#FFB800' : 'rgba(255,184,0,0.4)';

  let svg = '<svg class="wxp-sun-svg" viewBox="0 0 ' + W + ' ' + (H + 12) + '" preserveAspectRatio="xMidYMid meet">';
  // Filled area under the traversed arc (subtle glow)
  if (isDay && t > 0.02) {
    // Build the fill: arc up to current point, then line back to start
    var fillArc = 'M' + PAD + ',' + H;
    var steps = Math.ceil(t * 30);
    for (var s = 0; s <= steps; s++) {
      var tt = (s / steps) * t;
      var fx = (1-tt)*(1-tt)*x0 + 2*(1-tt)*tt*x1 + tt*tt*x2;
      var fy = (1-tt)*(1-tt)*y0 + 2*(1-tt)*tt*y1 + tt*tt*y2;
      fillArc += ' L' + fx.toFixed(1) + ',' + fy.toFixed(1);
    }
    fillArc += ' L' + sx.toFixed(1) + ',' + H + ' Z';
    svg += '<path d="' + fillArc + '" fill="var(--accent)" opacity="0.08"/>';
  }
  // Dashed arc (full path)
  svg += '<path d="' + arcD + '" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="2" stroke-dasharray="5 4"/>';
  // Solid accent arc (traversed portion)
  if (isDay && t > 0.01) svg += '<path d="' + arcD + '" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-dasharray="' + (t * 320) + ' 320" opacity="0.9"/>';
  // Horizon line
  svg += '<line x1="' + PAD + '" y1="' + H + '" x2="' + (W-PAD) + '" y2="' + H + '" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>';
  // Sunrise/sunset markers
  svg += '<circle cx="' + PAD + '" cy="' + H + '" r="2" fill="rgba(255,255,255,0.25)"/>';
  svg += '<circle cx="' + (W-PAD) + '" cy="' + H + '" r="2" fill="rgba(255,255,255,0.25)"/>';
  // Sun dot
  svg += '<circle cx="' + dotX.toFixed(1) + '" cy="' + dotY.toFixed(1) + '" r="12" fill="' + dotColor + '" opacity="0.12"/>';
  svg += '<circle cx="' + dotX.toFixed(1) + '" cy="' + dotY.toFixed(1) + '" r="6" fill="' + dotColor + '" stroke="' + dotStroke + '" stroke-width="1.5"/>';
  svg += '</svg>';

  return '<div class="wxp-sun-arc">'
    + '<div class="wxp-sun-arc-label">' + primaryLabel + '</div>'
    + '<div class="wxp-sun-arc-time">' + primaryTime + '</div>'
    + svg
    + '<div class="wxp-sun-arc-times"><span>☀️ ' + heroSr + '</span><span>🌙 ' + heroSs + '</span></div>'
    + '</div>';
}

/* ====================================================
   WEATHER PAGE
==================================================== */
export async function renderWeatherPage(_restoreScrollY) {
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

  // Ensure the sticky location switcher + body wrapper exist
  if (!container.querySelector('#wxPageBody')) {
    container.innerHTML = `${renderWxLocationSwitcher()}<div id="wxPageBody"></div>`;
  } else {
    // Update pill active states in-place
    const locs = getWxLocations();
    container.querySelectorAll('.wx-loc-pill').forEach(p => {
      const m = p.getAttribute('onclick')?.match(/(\d+)/);
      const pid = m ? parseInt(m[1], 10) : -1;
      p.classList.toggle('wx-loc-pill--active', locs.some(l => l.id === pid && l.active));
    });
  }
  const body = document.getElementById('wxPageBody');

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
    body.innerHTML = `
      <div class="wx-page-empty">
        <div class="wx-page-empty-icon">${WEATHER_SVGS.fog}</div>
        <h3>No location set</h3>
        <p>Set your city in Settings to get your riding forecast.</p>
        <button class="btn btn-primary" onclick="navigate('settings')">Go to Settings</button>
      </div>`;
    return;
  }

  // Only show loading spinner on first render; skip during location switches to preserve scroll
  if (!body.children.length || body.querySelector('.wx-page-loading')) {
    body.innerHTML = `<div class="wx-page-loading"><div class="spinner"></div><p>Fetching forecast…</p></div>`;
  }

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
      `&current=temperature_2m,weathercode,windspeed_10m,winddirection_10m,relative_humidity_2m,apparent_temperature,precipitation,cloud_cover,surface_pressure,uv_index,visibility,is_day` +
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
    body.innerHTML = `<div class="wx-page-empty"><p>Could not load forecast. Check your connection.</p></div>`;
    return;
  }

  // Save to state so day-detail sub-page can access it
  state.weatherPageData = data;
  state.weatherPageMeta = { deg, windLbl, locationLabel, lat, lng };

  // Cache today's weather code per location for pill icons
  try {
    const wxCodes = JSON.parse(localStorage.getItem('icu_wx_today_codes') || '{}');
    const activeLoc = getActiveWxLocation();
    if (activeLoc && data.daily?.weathercode) {
      wxCodes[activeLoc.id] = data.daily.weathercode[0];
      localStorage.setItem('icu_wx_today_codes', JSON.stringify(wxCodes));
    }
  } catch (_) {}

  const { time, weathercode: _dailyCodes, temperature_2m_max: highs, temperature_2m_min: lows,
          precipitation_probability_max: precips, precipitation_sum: rainMm,
          windspeed_10m_max: winds, winddirection_10m_dominant: windDirs,
          uv_index_max: uvs, sunrise: sunrises, sunset: sunsets } = data.daily;

  // Derive smarter representative weathercode per day from hourly data (6am–9pm).
  // Falls back to daily WMO code if hourly data unavailable.
  const codes = (() => {
    const hCodes = data.hourly?.weathercode;
    if (!hCodes || !hCodes.length) return _dailyCodes;
    // Severity rank — higher = more impactful for a cyclist
    const severity = c => {
      if ([95,96,99].includes(c)) return 90; // storm
      if ([71,73,75,77,85,86].includes(c)) return 80; // snow
      if ([66,67].includes(c)) return 75; // freezing rain
      if ([61,63,65,80,81,82].includes(c)) return 70; // rain/showers
      if ([56,57].includes(c)) return 65; // freezing drizzle
      if ([51,53,55].includes(c)) return 50; // drizzle
      if ([45,48].includes(c)) return 30; // fog
      if (c === 3) return 15; // overcast
      if (c === 2) return 10; // mostly cloudy
      if (c === 1) return 5;  // partly cloudy
      return 0; // clear
    };
    return _dailyCodes.map((fallback, i) => {
      const dayStart = i * 24 + 6;  // 6am
      const dayEnd   = i * 24 + 21; // 9pm
      const slice = hCodes.slice(dayStart, dayEnd);
      if (!slice.length) return fallback;
      // Count frequency of each code
      const freq = {};
      slice.forEach(c => { freq[c] = (freq[c] || 0) + 1; });
      // Pick most frequent; break ties by higher severity
      let best = slice[0], bestCount = 0;
      for (const [code, count] of Object.entries(freq)) {
        const c = Number(code);
        if (count > bestCount || (count === bestCount && severity(c) > severity(best))) {
          best = c; bestCount = count;
        }
      }
      return best;
    });
  })();

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
    if (isStorm)               { score -= 80; reasons.push('⛈ Thunderstorms expected'); }
    else if (isSnow)           { score -= 70; reasons.push('❄️ Snow or sleet forecast'); }
    else if (isRain && !isDriz){ score -= 50 + Math.min(precip, 55) * 0.6; reasons.push(`🌧 Rain (${Math.round(precip)}% chance)`); }
    else if (isDriz)           { score -= 38; reasons.push(`🌦 Drizzle expected — wet roads`); }
    else if (isFog)            { score -= 35; reasons.push('🌫 Foggy — poor visibility, dangerous'); }
    else if (isCloudy)         { score -= 5;  reasons.push('⛅ Overcast skies'); }

    // ── Precipitation probability (catches mismatches where code looks clear
    //    but rain chance is still significant) ─────────────────────────────
    if (!isRain && !isDriz && !isSnow && !isStorm) {
      if      (precip >= 60) { score -= 35; reasons.push(`🌧 ${Math.round(precip)}% rain chance`); }
      else if (precip >= 40) { score -= 22; reasons.push(`🌦 ${Math.round(precip)}% rain chance`); }
      else if (precip >= 25) { score -= 14; reasons.push(`🌂 ${Math.round(precip)}% rain chance`); }
      else if (precip >= 10) { score -= 6;  reasons.push(`🌂 ${Math.round(precip)}% rain chance`); }
    }

    // ── Actual rainfall mm (wet roads even if code doesn't say "rain") ───
    if (!isRain && !isDriz && rain > 0) {
      if      (rain >= 5) { score -= 20; reasons.push(`💧 ${rain.toFixed(1)} mm rain expected`); }
      else if (rain >= 1) { score -= 12; reasons.push(`💧 ${rain.toFixed(1)} mm rain expected — wet roads`); }
      else if (rain > 0.3){ score -= 5;  reasons.push(`💧 Light rain (${rain.toFixed(1)} mm)`); }
    }

    // ── Temperature ───────────────────────────────────────────────────────
    if (high < coldThresh)               { score -= 40; reasons.push(`🥶 Very cold (high ${Math.round(high)}${deg})`); }
    else if (high < (isMetric ? 8 : 46)) { score -= 25; reasons.push(`🌡 Chilly (high ${Math.round(high)}${deg})`); }
    else if (high < (isMetric ? 12 : 54)){ score -= 10; reasons.push(`🌡 Cool (high ${Math.round(high)}${deg})`); }
    else if (high > hotThresh)           { score -= 30; reasons.push(`🥵 Extreme heat (${Math.round(high)}${deg})`); }
    else if (high > (isMetric ? 32 : 90)){ score -= 12; reasons.push(`🥵 Hot (${Math.round(high)}${deg})`); }

    // ── Wind ──────────────────────────────────────────────────────────────
    if (wind > windPoor)       { score -= 40; reasons.push(`💨 Very strong winds (${Math.round(wind)} ${windLbl})`); }
    else if (wind > windThresh){ score -= 25; reasons.push(`💨 Windy (${Math.round(wind)} ${windLbl})`); }
    else if (wind > (isMetric ? 20 : 12)){ score -= 8;  reasons.push(`💨 Breezy (${Math.round(wind)} ${windLbl})`); }

    // ── Positive indicators (only on genuinely good days) ─────────────────
    if (score >= 85) {
      if (isClear)   reasons.unshift('☀️ Clear skies');
      if (uv >= 6)   reasons.push(`🕶 High UV (${uv}) — wear sunscreen`);
    }

    score = Math.max(0, Math.min(100, Math.round(score)));
    // Stricter thresholds — a great day should genuinely be great
    const label = score >= 85 ? 'great' : score >= 60 ? 'good' : score >= 35 ? 'fair' : 'poor';
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

  // ── Current conditions hero card data ─────────────────────────────────────
  const cur = data.current || {};
  const curTemp = cur.temperature_2m;
  const curFeels = cur.apparent_temperature;
  const curCode = cur.weathercode ?? codes[0];
  const curWind = cur.windspeed_10m ?? 0;
  const curWindDir = windDir(cur.winddirection_10m);
  const curHumidity = cur.relative_humidity_2m;
  const curCloud = cur.cloud_cover;
  const curPressure = cur.surface_pressure;
  const curUV = cur.uv_index ?? uvs?.[0] ?? 0;
  const curVis = cur.visibility; // in metres
  const curPrecipProb = precips?.[0] ?? 0;
  const ridingTip = _wxRidingTip(cur, data.daily);

  // Format visibility
  let visStr = '—';
  if (curVis != null) {
    visStr = curVis >= 10000 ? '10+ km' : (curVis / 1000).toFixed(1) + ' km';
  }

  // Sunrise/sunset for today
  let heroSr = '—', heroSs = '—';
  let sunProgress = -1; // 0..1 during daylight, <0 before sunrise, >1 after sunset
  try {
    heroSr = new Date(sunrises[0]).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    heroSs = new Date(sunsets[0]).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const srMs = new Date(sunrises[0]).getTime();
    const ssMs = new Date(sunsets[0]).getTime();
    const nowMs = Date.now();
    if (ssMs > srMs) sunProgress = (nowMs - srMs) / (ssMs - srMs);
  } catch (_) {}

  // Lock page height before DOM swap to prevent scroll clamping during location switch
  if (_restoreScrollY != null) {
    const h = container.scrollHeight;
    container.style.minHeight = h + 'px';
  }

  body.innerHTML = `
    <!-- Current conditions + ride window row -->
    <div class="wxp-top-row">
    <div class="card wxp-hero">
      <div class="card-header">
        <div>
          <div class="card-title">Right Now</div>
          <div class="card-subtitle">${wmoLabel(curCode)}</div>
        </div>
        <div class="wxp-hero-temps">${Math.round(highs[0])}° / ${Math.round(lows[0])}°</div>
      </div>
      <div class="wxp-hero-main">
        <div class="wxp-hero-icon">${wmoIcon(curCode)}</div>
        <div class="wxp-hero-temp">${curTemp != null ? Math.round(curTemp) : '—'}<span>${deg}</span></div>
        <div class="wxp-hero-feels">Feels ${curFeels != null ? Math.round(curFeels) + deg : '—'}</div>
      </div>
      <div class="wxp-hero-grid">
        <div class="wxp-hero-stat">
          <div class="wxp-st-icon">💨</div>
          <div class="wxp-st-val">${Math.round(curWind)}<span> ${windLbl}</span></div>
          <div class="wxp-st-lbl">Wind ${curWindDir}</div>
        </div>
        <div class="wxp-hero-stat">
          <div class="wxp-st-icon">🌧</div>
          <div class="wxp-st-val">${Math.round(curPrecipProb)}<span>%</span></div>
          <div class="wxp-st-lbl">Rain Chance</div>
        </div>
        <div class="wxp-hero-stat">
          <div class="wxp-st-icon">☀️</div>
          <div class="wxp-st-val">${Math.round(curUV)}</div>
          <div class="wxp-st-lbl">UV Index</div>
        </div>
        <div class="wxp-hero-stat">
          <div class="wxp-st-icon">💧</div>
          <div class="wxp-st-val">${curHumidity != null ? Math.round(curHumidity) : '—'}<span>%</span></div>
          <div class="wxp-st-lbl">Humidity</div>
        </div>
        <div class="wxp-hero-stat">
          <div class="wxp-st-icon">👁</div>
          <div class="wxp-st-val">${visStr}</div>
          <div class="wxp-st-lbl">Visibility</div>
        </div>
        <div class="wxp-hero-stat">
          <div class="wxp-st-icon">☁️</div>
          <div class="wxp-st-val">${curCloud != null ? Math.round(curCloud) : '—'}<span>%</span></div>
          <div class="wxp-st-lbl">Cloud Cover</div>
        </div>
        <div class="wxp-hero-stat">
          <div class="wxp-st-icon">🧭</div>
          <div class="wxp-st-val">${curPressure != null ? Math.round(curPressure) : '—'}<span> hPa</span></div>
          <div class="wxp-st-lbl">Pressure</div>
        </div>
        <div class="wxp-hero-stat">
          <div class="wxp-st-icon">🌅</div>
          <div class="wxp-st-val">${heroSr}</div>
          <div class="wxp-st-lbl">Sunrise</div>
        </div>
      </div>
      <div class="wxp-hero-tip">${ridingTip}</div>
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
      ${_buildSunArc(sunProgress, heroSr, heroSs)}
    </div>` : ''}
    </div><!-- /wxp-top-row -->

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

  // Restore scroll position after location switch
  if (_restoreScrollY != null) {
    // Force the container to keep its height so scroll position isn't clamped
    container.style.minHeight = container.scrollHeight + 'px';
    requestAnimationFrame(() => {
      window.scrollTo(0, _restoreScrollY);
      requestAnimationFrame(() => { container.style.minHeight = ''; });
    });
  }

  // Attach click handlers on day cards (with drag-detection guard)
  body.querySelectorAll('.wxp-day-card, .wxp-best-card').forEach(card => {
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
  const rail = body.querySelector('.wxp-week-scroll');
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
    const wxWeekUp = () => { isDown = false; rail.classList.remove('is-dragging'); };
    let _wxMoveRAF = 0;
    const wxWeekMove = e => {
      if (!isDown) return;
      const px = e.pageX;
      if (_wxMoveRAF) return;
      _wxMoveRAF = requestAnimationFrame(() => {
        _wxMoveRAF = 0;
        const x = px - rail.getBoundingClientRect().left;
        rail.scrollLeft = scrollLeft - (x - startX);
      });
    };
    document.addEventListener('mouseup', wxWeekUp);
    document.addEventListener('mousemove', wxWeekMove);
    _pageCleanupFns.push(() => {
      document.removeEventListener('mouseup', wxWeekUp);
      document.removeEventListener('mousemove', wxWeekMove);
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
  _rIC(() => { if (window.refreshGlow) refreshGlow(); });
}

export function refreshWeatherPage() {
  localStorage.removeItem('icu_wx_page');
  localStorage.removeItem('icu_wx_page_ts');
  localStorage.removeItem('icu_wx_forecast');
  localStorage.removeItem('icu_wx_forecast_ts');
  renderWeatherPage();
}

/* ====================================================
   WEATHER DAY DETAIL SUB-PAGE
==================================================== */
export function renderWeatherDayDetail(dayIdx) {
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
    const wxHourUp = () => { isDown = false; hRail.classList.remove('is-dragging'); };
    let _wxHourRAF = 0;
    const wxHourMove = e => {
      if (!isDown) return;
      const px = e.pageX;
      if (_wxHourRAF) return;
      _wxHourRAF = requestAnimationFrame(() => {
        _wxHourRAF = 0;
        const x = px - hRail.getBoundingClientRect().left;
        hRail.scrollLeft = scrollLeft - (x - startX);
      });
    };
    document.addEventListener('mouseup', wxHourUp);
    document.addEventListener('mousemove', wxHourMove);
    _pageCleanupFns.push(() => {
      document.removeEventListener('mouseup', wxHourUp);
      document.removeEventListener('mousemove', wxHourMove);
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

