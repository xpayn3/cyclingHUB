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
const renderWxLocationSwitcher = _app('renderWxLocationSwitcher');
const getWxLocations           = _app('getWxLocations');
const getAllActivities          = _app('getAllActivities');
const actVal                    = _app('actVal');
const isEmptyActivity           = _app('isEmptyActivity');
const fmtDate                   = _app('fmtDate');
const fmtDist                   = _app('fmtDist');
const fmtSpeed                  = _app('fmtSpeed');
const destroyChart              = _app('destroyChart');
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
  uv: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="20" r="7" fill="#FBBF24"/><g stroke="#FBBF24" stroke-width="2" stroke-linecap="round"><line x1="20" y1="5" x2="20" y2="9"/><line x1="20" y1="31" x2="20" y2="35"/><line x1="5" y1="20" x2="9" y2="20"/><line x1="31" y1="20" x2="35" y2="20"/><line x1="9.4" y1="9.4" x2="12.2" y2="12.2"/><line x1="27.8" y1="27.8" x2="30.6" y2="30.6"/><line x1="30.6" y1="9.4" x2="27.8" y2="12.2"/><line x1="12.2" y1="27.8" x2="9.4" y2="30.6"/></g><text x="20" y="23" text-anchor="middle" font-size="10" font-weight="700" fill="#78350F" font-family="system-ui">UV</text></svg>`,
  humidity: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 6 C20 6 10 18 10 24a10 10 0 0 0 20 0C30 18 20 6 20 6z" fill="#60A5FA" opacity="0.9"/><path d="M18 28a4 4 0 0 1-4-4" stroke="#fff" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/></svg>`,
  pressure: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="22" r="14" stroke="#94A3B8" stroke-width="2" fill="none"/><circle cx="20" cy="22" r="2" fill="#94A3B8"/><line x1="20" y1="22" x2="28" y2="14" stroke="#94A3B8" stroke-width="2" stroke-linecap="round"/><g fill="#94A3B8"><circle cx="10" cy="30" r="1.5"/><circle cx="30" cy="30" r="1.5"/><circle cx="8" cy="22" r="1.5"/><circle cx="20" cy="10" r="1.5"/></g></svg>`,
  visibility: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 20s6-10 16-10 16 10 16 10-6 10-16 10S4 20 4 20z" fill="none" stroke="#94A3B8" stroke-width="2"/><circle cx="20" cy="20" r="5" fill="#60A5FA" opacity="0.8"/><circle cx="20" cy="20" r="2" fill="#1D4ED8"/></svg>`,
  sunrise_icon: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><line x1="6" y1="30" x2="34" y2="30" stroke="#94A3B8" stroke-width="2" stroke-linecap="round"/><path d="M20 28a8 8 0 0 1 8-8" stroke="#FBBF24" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M20 28a8 8 0 0 0-8-8" stroke="#FBBF24" stroke-width="2" fill="none" stroke-linecap="round"/><line x1="20" y1="8" x2="20" y2="16" stroke="#FBBF24" stroke-width="2" stroke-linecap="round"/><polyline points="15,13 20,8 25,13" stroke="#FBBF24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`,
  sunset_icon: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><line x1="6" y1="30" x2="34" y2="30" stroke="#94A3B8" stroke-width="2" stroke-linecap="round"/><path d="M20 28a8 8 0 0 1 8-8" stroke="#FB923C" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M20 28a8 8 0 0 0-8-8" stroke="#FB923C" stroke-width="2" fill="none" stroke-linecap="round"/><line x1="20" y1="8" x2="20" y2="16" stroke="#FB923C" stroke-width="2" stroke-linecap="round"/><polyline points="15,11 20,16 25,11" stroke="#FB923C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`,
  feelslike: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="16" y="4" width="8" height="24" rx="4" stroke="#94A3B8" stroke-width="2" fill="none"/><circle cx="20" cy="32" r="5" fill="#F87171"/><rect x="18" y="16" width="4" height="14" rx="2" fill="#F87171"/><path d="M28 12h4" stroke="#94A3B8" stroke-width="1.5" stroke-linecap="round"/><path d="M28 18h4" stroke="#94A3B8" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  bike: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="11" cy="28" r="6" stroke="#94A3B8" stroke-width="2" fill="none"/><circle cx="29" cy="28" r="6" stroke="#94A3B8" stroke-width="2" fill="none"/><polyline points="11,28 18,16 24,28 29,28" stroke="#00e5a0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><line x1="18" y1="16" x2="26" y2="16" stroke="#00e5a0" stroke-width="2" stroke-linecap="round"/><circle cx="26" cy="16" r="2" fill="#00e5a0"/></svg>`,
  caution: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 4L2 36h36L20 4z" fill="#FBBF24" opacity="0.15" stroke="#FBBF24" stroke-width="2" stroke-linejoin="round"/><line x1="20" y1="16" x2="20" y2="26" stroke="#FBBF24" stroke-width="2.5" stroke-linecap="round"/><circle cx="20" cy="31" r="1.5" fill="#FBBF24"/></svg>`,
  kit: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 12h16v20H12z" fill="#60A5FA" opacity="0.2" stroke="#60A5FA" stroke-width="2" rx="2"/><path d="M16 12V8h8v4" stroke="#60A5FA" stroke-width="2" stroke-linecap="round"/><line x1="20" y1="18" x2="20" y2="26" stroke="#60A5FA" stroke-width="2" stroke-linecap="round"/><line x1="16" y1="22" x2="24" y2="22" stroke="#60A5FA" stroke-width="2" stroke-linecap="round"/></svg>`,
  sunprotect: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="18" r="8" fill="#FBBF24" opacity="0.3"/><circle cx="20" cy="18" r="8" stroke="#FBBF24" stroke-width="2" fill="none"/><path d="M14 28c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="#94A3B8" stroke-width="2" stroke-linecap="round" fill="none"/><line x1="20" y1="28" x2="20" y2="36" stroke="#94A3B8" stroke-width="2" stroke-linecap="round"/></svg>`,
  hydration: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 8h12l2 10v14a4 4 0 0 1-4 4h-8a4 4 0 0 1-4-4V18l2-10z" fill="#60A5FA" opacity="0.2" stroke="#60A5FA" stroke-width="2"/><path d="M12 22h16" stroke="#60A5FA" stroke-width="1.5" opacity="0.5"/><path d="M12 26h16" stroke="#60A5FA" stroke-width="1.5" opacity="0.3"/></svg>`,
  raingear: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 20a12 12 0 0 1 24 0" stroke="#64748B" stroke-width="2" fill="none"/><line x1="20" y1="20" x2="20" y2="32" stroke="#64748B" stroke-width="2" stroke-linecap="round"/><path d="M20 32c0 2.2-1.8 4-4 4" stroke="#64748B" stroke-width="2" stroke-linecap="round" fill="none"/><g stroke="#60A5FA" stroke-width="2" stroke-linecap="round"><line x1="30" y1="24" x2="29" y2="28"/><line x1="34" y1="24" x2="33" y2="28"/></g></svg>`,
  windstrat: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 14h18a4 4 0 1 0-4-4" stroke="#94A3B8" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M6 22h24a4 4 0 1 1-4 4" stroke="#00e5a0" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M10 30h10a3 3 0 1 0-3-3" stroke="#94A3B8" stroke-width="2" stroke-linecap="round" fill="none"/></svg>`,
  checkmark: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="20" r="14" fill="#00e5a0" opacity="0.15"/><polyline points="13,20 18,26 28,14" stroke="#00e5a0" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`,
};

function _radarPlayIcon() { return '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><polygon points="6,4 20,12 6,20"/></svg>'; }
function _radarPauseIcon() { return '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><rect x="5" y="4" width="4" height="16" rx="1"/><rect x="15" y="4" width="4" height="16" rx="1"/></svg>'; }
let _wxRadarMap = null, _wxRadarFrames = [], _wxRadarIdx = 0, _wxRadarTimer = null;

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

// Weather-based page gradient
function wxPageGradient(code, isDay) {
  // Gradient strategy: weather colour covers the hero, fades to app black
  // by the time the hourly strip ends (~30% of page height on mobile).
  // Stops: [weather-top 0%] → [weather-mid 12%] → [#000 32%]
  // Night
  if (!isDay) {
    if ([51,53,55,61,63,65,66,67,80,81,82].includes(code)) return 'linear-gradient(180deg, #1a2744 0%, #1e3352 12%, #000000 32%)';
    if ([95,96,99].includes(code))                          return 'linear-gradient(180deg, #201840 0%, #2e2050 12%, #000000 32%)';
    if ([71,73,75,77,85,86].includes(code))                 return 'linear-gradient(180deg, #2a3448 0%, #354260 12%, #000000 32%)';
    if ([45,48].includes(code))                             return 'linear-gradient(180deg, #262640 0%, #32324e 12%, #000000 32%)';
    if (code >= 2)                                          return 'linear-gradient(180deg, #182038 0%, #222e4a 12%, #000000 32%)';
    return 'linear-gradient(180deg, #101840 0%, #1e2a5c 12%, #000000 32%)'; // clear night
  }
  // Thunderstorm
  if ([95,96,99].includes(code))                           return 'linear-gradient(180deg, #2c2c3a 0%, #3d3552 12%, #000000 32%)';
  // Rain / showers / drizzle
  if ([51,53,55,61,63,65,66,67,80,81,82].includes(code))  return 'linear-gradient(180deg, #3a4a5c 0%, #4a5a6c 12%, #000000 32%)';
  // Snow
  if ([71,73,75,77,85,86].includes(code))                  return 'linear-gradient(180deg, #6b7b8d 0%, #8a9aac 12%, #000000 32%)';
  // Fog
  if ([45,48].includes(code))                              return 'linear-gradient(180deg, #4a5568 0%, #5a6578 12%, #000000 32%)';
  // Overcast
  if (code === 3)                                          return 'linear-gradient(180deg, #4a5a6c 0%, #5a6a7c 12%, #000000 32%)';
  // Mostly cloudy
  if (code === 2)                                          return 'linear-gradient(180deg, #3a5068 0%, #4a6078 12%, #000000 32%)';
  // Partly cloudy
  if (code === 1)                                          return 'linear-gradient(180deg, #2a4a6e 0%, #3a6a9e 12%, #000000 32%)';
  // Clear sky
  return 'linear-gradient(180deg, #1e3a5f 0%, #2a6cb5 12%, #000000 32%)';
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
  unskeletonCard('detailWeatherCard');

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
  unskeletonCard('detailNotesCard');
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
    // Check IDB cache first to avoid unnecessary API calls
    let raw = await actCacheGet(activityId, 'intervals');
    if (raw && raw.__noIntervals) { showCardNA('detailIntervalsCard'); return; }
    if (!raw) {
      raw = await icuFetch(`/activity/${activityId}/intervals`);
      // Cache result (or sentinel if no intervals) so we never re-fetch
      actCachePut(activityId, 'intervals', raw || { __noIntervals: true });
    }
    const intervals = raw?.icu_intervals;
    if (!Array.isArray(intervals) || intervals.length === 0) {
      actCachePut(activityId, 'intervals', { __noIntervals: true });
      showCardNA('detailIntervalsCard');
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

    const typeColors = {
      work: '#ff6b35', rest: 'rgba(0,229,160,0.7)', warmup: '#4a9eff', cooldown: '#9b59ff', '': 'rgba(255,255,255,0.15)'
    };
    const typeSolid = {
      work: '#ff6b35', rest: '#00e5a0', warmup: '#4a9eff', cooldown: '#9b59ff', '': '#555'
    };

    // Build canvas chart — horizontal bar chart like workout builder
    body.innerHTML = `<div class="act-ivl-chart-wrap" style="position:relative;height:160px;margin-bottom:8px">
      <canvas id="actIvlCanvas" style="width:100%;height:100%"></canvas>
    </div><div class="act-ivl-legend" id="actIvlLegend"></div>`;

    requestAnimationFrame(() => {
      const canvas = document.getElementById('actIvlCanvas');
      if (!canvas) return;
      const wrap = canvas.parentElement;
      const W = wrap.clientWidth;
      const H = wrap.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);

      const PAD_L = 35, PAD_R = 8, PAD_T = 8, PAD_B = 24;
      const chartW = W - PAD_L - PAD_R;
      const chartH = H - PAD_T - PAD_B;

      const totalSecs = intervals.reduce((s, iv) => s + (iv.moving_time || iv.elapsed_time || 0), 0) || 1;
      const maxPower = Math.max(...intervals.map(iv => iv.average_watts || 0), 50);
      const yMax = Math.ceil(maxPower / 25) * 25;

      // Grid lines
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = '10px Inter, system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const gridSteps = 4;
      for (let i = 0; i <= gridSteps; i++) {
        const val = Math.round(yMax * i / gridSteps);
        const y = PAD_T + chartH - (val / yMax * chartH);
        ctx.beginPath();
        ctx.moveTo(PAD_L, y);
        ctx.lineTo(W - PAD_R, y);
        ctx.stroke();
        ctx.fillText(i === 0 ? 'W' : val, PAD_L - 4, y);
      }

      // Draw bars
      let x = PAD_L;
      let cumTime = 0;
      intervals.forEach((ivl, i) => {
        const secs = ivl.moving_time || ivl.elapsed_time || 0;
        const watts = ivl.average_watts || 0;
        const type = classify(ivl);
        const barW = Math.max(chartW * (secs / totalSecs), 2);
        const barH = Math.max(chartH * (watts / yMax), 2);
        const barY = PAD_T + chartH - barH;

        ctx.fillStyle = typeColors[type] || typeColors[''];
        ctx.beginPath();
        ctx.roundRect(x, barY, Math.max(barW - 1, 1), barH, [3, 3, 0, 0]);
        ctx.fill();

        // Power label inside bar if wide enough
        if (barW > 28 && watts > 0) {
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 10px Inter, system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(Math.round(watts), x + barW / 2, barY + Math.min(barH / 2, barH - 8));
        }

        x += barW;
        cumTime += secs;
      });

      // Time axis labels
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = '10px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const timeSteps = Math.min(6, intervals.length);
      for (let i = 0; i <= timeSteps; i++) {
        const t = Math.round(totalSecs * i / timeSteps);
        const tx = PAD_L + chartW * (i / timeSteps);
        const m = Math.floor(t / 60), s = t % 60;
        ctx.fillText(m > 0 ? `${m}:${String(s).padStart(2,'0')}` : `0:${String(s).padStart(2,'0')}`, tx, H - PAD_B + 6);
      }

      // Legend
      const legend = document.getElementById('actIvlLegend');
      if (legend) {
        const types = [...new Set(intervals.map(classify))].filter(Boolean);
        legend.innerHTML = types.map(t =>
          `<span class="act-ivl-leg-item"><span class="act-ivl-leg-dot" style="background:${typeSolid[t]}"></span>${t}</span>`
        ).join('');
      }
    });
    card.style.display = '';
    unskeletonCard('detailIntervalsCard');
  } catch (e) {
    console.error('[Intervals] Fetch failed:', e);
    showCardNA('detailIntervalsCard');
  }
}

// ── 7-day riding forecast (Open-Meteo, free, no API key) ────────────────────
export async function renderWeatherForecast() {
  const section = document.getElementById('forecastSection');
  const rail    = document.getElementById('forecastRail');
  const locEl   = document.getElementById('forecastLocation');
  // Backward compat: also check old card element
  const card    = section || document.getElementById('forecastCard');
  if (!card) return;

  // Get coordinates — try cached coords first, then geocode from city/country
  let lat = null, lng = null;

  try {
    const cached = localStorage.getItem('icu_wx_coords');
    if (cached) { const c = JSON.parse(cached); lat = c.lat; lng = c.lng; }
  } catch (_) {}

  if (lat == null) {
    if (section) {
      section.style.display = '';
      if (locEl) locEl.textContent = 'Set your location to see the weather';
      if (rail) rail.innerHTML = `<div class="card" style="margin:0 var(--pad-page);padding:20px;text-align:center">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32" style="opacity:0.4;margin-bottom:8px"><path d="M12 2a7 7 0 0 1 7 7c0 5.25-7 13-7 13S5 14.25 5 9a7 7 0 0 1 7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
        <p style="color:var(--text-muted);font-size:13px">Add your city in <strong>Settings → Weather</strong></p>
        <button class="btn btn-primary btn-sm" onclick="navigate('settings')">Go to Settings</button>
      </div>`;
    }
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

  if (!forecast?.daily) { if (section) section.style.display = 'none'; else if (card) card.style.display = 'none'; return; }

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
    else if (isCloudy)         score -= 12;

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
    else if (high < (isMetric ? 18 : 64))      score -= 5;
    else if (high > (isMetric ? 35 : 95))      score -= 30;
    else if (high > (isMetric ? 32 : 90))      score -= 12;

    // Wind
    if (wind > windPoor)      score -= 40;
    else if (wind > windHigh) score -= 25;
    else if (wind > (isMetric ? 20 : 12)) score -= 15;
    else if (wind > (isMetric ? 12 : 8))  score -= 8;

    score = Math.max(0, Math.min(100, Math.round(score)));
    return score >= 75 ? 'good' : score >= 35 ? 'fair' : 'poor';
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
      <div class="wx-day-card wx-day--${score}${isToday ? ' wx-day--today' : ''}" onclick="renderWeatherDayDetail(${i})">
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

  if (section && rail) {
    // New scroll rail layout
    section.style.display = '';
    if (locEl) locEl.textContent = location;
    rail.innerHTML = days;
  } else if (card) {
    // Fallback to old card layout
    card.style.display = '';
    card.innerHTML = `
      <div class="card-header">
        <div>
          <div class="card-title">Riding Forecast</div>
          <div class="card-subtitle">${location}</div>
        </div>
      </div>
      <div class="wx-forecast-row">${days}</div>`;
  }
}

/* ── Sun arc helper (sunrise/sunset visual) ── */
export function _buildSunArc(sunProgress, heroSr, heroSs) {
  const p = Math.max(0, Math.min(1, sunProgress));
  const isDay = sunProgress >= 0 && sunProgress <= 1;
  const W = 240, BASE = 80, PAD = 20;
  const H = BASE;
  // Bell curve / gaussian shape like Apple Weather — steep sides, pointed peak
  const cx1 = PAD + (W - 2*PAD) * 0.38, cy1 = -BASE * 0.15;
  const cx2 = W - PAD - (W - 2*PAD) * 0.38, cy2 = -BASE * 0.15;
  const arcD = 'M' + PAD + ',' + BASE + ' C' + cx1 + ',' + cy1 + ' ' + cx2 + ',' + cy2 + ' ' + (W-PAD) + ',' + BASE;
  // Sun position on cubic bezier
  const t = p;
  const x0 = PAD, y0 = H, x3 = W-PAD, y3 = H;
  const sx = (1-t)*(1-t)*(1-t)*x0 + 3*(1-t)*(1-t)*t*cx1 + 3*(1-t)*t*t*cx2 + t*t*t*x3;
  const sy = (1-t)*(1-t)*(1-t)*y0 + 3*(1-t)*(1-t)*t*cy1 + 3*(1-t)*t*t*cy2 + t*t*t*y3;
  const isNight = !isDay;
  const primaryLabel = isNight ? 'SUNRISE' : 'SUNSET';
  const primaryTime = isNight ? heroSr : heroSs;
  const secondaryLabel = isNight ? 'Sunset: ' + heroSs : 'Sunrise: ' + heroSr;
  // Sun dot: show on arc during day, or on horizon line at night
  const dotX = isDay ? sx : (sunProgress <= 0 ? PAD : W - PAD);
  const dotY = isDay ? sy : H;
  const dotColor = isDay ? '#FFD93D' : 'rgba(255,217,61,0.4)';
  const dotStroke = isDay ? '#FFB800' : 'rgba(255,184,0,0.4)';

  let svg = '<svg class="aw-sun-svg" viewBox="0 0 ' + W + ' ' + (BASE + 12) + '" preserveAspectRatio="xMidYMid meet">';
  // Filled area under the traversed arc (subtle glow)
  if (isDay && t > 0.02) {
    // Build the fill: arc up to current point, then line back to start
    var fillArc = 'M' + PAD + ',' + H;
    var steps = Math.ceil(t * 30);
    for (var s = 0; s <= steps; s++) {
      var tt = (s / steps) * t;
      var fx = (1-tt)*(1-tt)*(1-tt)*x0 + 3*(1-tt)*(1-tt)*tt*cx1 + 3*(1-tt)*tt*tt*cx2 + tt*tt*tt*x3;
      var fy = (1-tt)*(1-tt)*(1-tt)*y0 + 3*(1-tt)*(1-tt)*tt*cy1 + 3*(1-tt)*tt*tt*cy2 + tt*tt*tt*y3;
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

  return '<div class="aw-sun-arc">'
    + '<div class="aw-sun-arc-label">' + primaryLabel + '</div>'
    + '<div class="aw-sun-arc-time">' + primaryTime + '</div>'
    + svg
    + '<div class="aw-sun-arc-times"><span class="aw-sun-arc-sr">' + WEATHER_SVGS.sunrise_icon + heroSr + '</span><span class="aw-sun-arc-ss">' + WEATHER_SVGS.sunset_icon + heroSs + '</span></div>'
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
      `&hourly=temperature_2m,precipitation_probability,precipitation,weathercode,windspeed_10m` +
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
    if (isStorm)               { score -= 80; reasons.push({ svg: 'storm', text: 'Thunderstorms expected' }); }
    else if (isSnow)           { score -= 70; reasons.push({ svg: 'snow', text: 'Snow or sleet forecast' }); }
    else if (isRain && !isDriz){ score -= 50 + Math.min(precip, 55) * 0.6; reasons.push({ svg: 'rain', text: `Rain (${Math.round(precip)}% chance)` }); }
    else if (isDriz)           { score -= 38; reasons.push({ svg: 'drizzle', text: 'Drizzle expected — wet roads' }); }
    else if (isFog)            { score -= 35; reasons.push({ svg: 'fog', text: 'Foggy — poor visibility, dangerous' }); }
    else if (isCloudy)         { score -= 12; reasons.push({ svg: 'pcloud', text: 'Overcast skies' }); }

    // ── Precipitation probability (catches mismatches where code looks clear
    //    but rain chance is still significant) ─────────────────────────────
    if (!isRain && !isDriz && !isSnow && !isStorm) {
      if      (precip >= 60) { score -= 35; reasons.push({ svg: 'rain', text: `${Math.round(precip)}% rain chance` }); }
      else if (precip >= 40) { score -= 22; reasons.push({ svg: 'drizzle', text: `${Math.round(precip)}% rain chance` }); }
      else if (precip >= 25) { score -= 14; reasons.push({ svg: 'rain', text: `${Math.round(precip)}% rain chance` }); }
      else if (precip >= 10) { score -= 6;  reasons.push({ svg: 'rain', text: `${Math.round(precip)}% rain chance` }); }
    }

    // ── Actual rainfall mm (wet roads even if code doesn't say "rain") ───
    if (!isRain && !isDriz && rain > 0) {
      if      (rain >= 5) { score -= 20; reasons.push({ svg: 'humidity', text: `${rain.toFixed(1)} mm rain expected` }); }
      else if (rain >= 1) { score -= 12; reasons.push({ svg: 'humidity', text: `${rain.toFixed(1)} mm rain expected — wet roads` }); }
      else if (rain > 0.3){ score -= 5;  reasons.push({ svg: 'humidity', text: `Light rain (${rain.toFixed(1)} mm)` }); }
    }

    // ── Temperature ───────────────────────────────────────────────────────
    if (high < coldThresh)               { score -= 40; reasons.push({ svg: 'temp', text: `Very cold (high ${Math.round(high)}${deg})` }); }
    else if (high < (isMetric ? 8 : 46)) { score -= 25; reasons.push({ svg: 'temp', text: `Chilly (high ${Math.round(high)}${deg})` }); }
    else if (high < (isMetric ? 12 : 54)){ score -= 10; reasons.push({ svg: 'temp', text: `Cool (high ${Math.round(high)}${deg})` }); }
    else if (high < (isMetric ? 18 : 64)){ score -= 5;  reasons.push({ svg: 'temp', text: `Mild (high ${Math.round(high)}${deg})` }); }
    else if (high > hotThresh)           { score -= 30; reasons.push({ svg: 'temp', text: `Extreme heat (${Math.round(high)}${deg})` }); }
    else if (high > (isMetric ? 32 : 90)){ score -= 12; reasons.push({ svg: 'temp', text: `Hot (${Math.round(high)}${deg})` }); }

    // ── Wind ──────────────────────────────────────────────────────────────
    if (wind > windPoor)       { score -= 40; reasons.push({ svg: 'wind', text: `Very strong winds (${Math.round(wind)} ${windLbl})` }); }
    else if (wind > windThresh){ score -= 25; reasons.push({ svg: 'wind', text: `Windy (${Math.round(wind)} ${windLbl})` }); }
    else if (wind > (isMetric ? 20 : 12)){ score -= 15; reasons.push({ svg: 'wind', text: `Moderate wind (${Math.round(wind)} ${windLbl})` }); }
    else if (wind > (isMetric ? 12 : 8)) { score -= 8;  reasons.push({ svg: 'wind', text: `Breezy (${Math.round(wind)} ${windLbl})` }); }

    // ── Positive indicators (only on genuinely good days) ─────────────────
    if (score >= 85) {
      if (isClear)   reasons.unshift({ svg: 'sun', text: 'Clear skies' });
      if (uv >= 6)   reasons.push({ svg: 'uv', text: `High UV (${uv}) — wear sunscreen` });
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

  // Weekly summary stats
  const avgHigh    = Math.round(highs.reduce((s,v)=>s+v,0)/highs.length);
  const maxWind    = Math.round(Math.max(...winds));
  const rainDays   = codes.filter(c => [51,53,55,56,57,61,63,65,67,80,81,82,95,96,99].includes(c)).length;
  const rideableDays = time.filter((_, i) => rideScore(i).score >= 50).length;

  // Compute weekly min/max for gradient temperature bars
  const weekMin = Math.min(...lows);
  const weekMax = Math.max(...highs);
  const weekRange = weekMax - weekMin || 1;

  // ── Current conditions data (needed before forecast rows) ───────────────
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
  let sunProgress = -1;
  let daylightHrs = '', daylightMin = '', sunTimeLeft = '', sunNextEvent = '', sunNextLabel = '';
  let goldenStart = '', goldenEnd = '', tomorrowSr = '';
  try {
    heroSr = new Date(sunrises[0]).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    heroSs = new Date(sunsets[0]).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const srMs = new Date(sunrises[0]).getTime();
    const ssMs = new Date(sunsets[0]).getTime();
    const nowMs = Date.now();
    if (ssMs > srMs) sunProgress = (nowMs - srMs) / (ssMs - srMs);
    // Daylight duration
    const dlMs = ssMs - srMs;
    daylightHrs = Math.floor(dlMs / 3600000);
    daylightMin = Math.round((dlMs % 3600000) / 60000);
    // Time remaining until next event
    if (nowMs < srMs) {
      const diff = srMs - nowMs;
      sunTimeLeft = `${Math.floor(diff / 3600000)}h ${Math.round((diff % 3600000) / 60000)}m`;
      sunNextEvent = heroSr;
      sunNextLabel = 'Sunrise in';
    } else if (nowMs < ssMs) {
      const diff = ssMs - nowMs;
      sunTimeLeft = `${Math.floor(diff / 3600000)}h ${Math.round((diff % 3600000) / 60000)}m`;
      sunNextEvent = heroSs;
      sunNextLabel = 'Sunset in';
    } else {
      sunNextLabel = 'Sun has set';
      sunTimeLeft = '';
    }
    // Golden hour (last hour before sunset)
    const ghStart = new Date(ssMs - 3600000);
    const ghEnd = new Date(ssMs);
    goldenStart = ghStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    goldenEnd = ghEnd.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    // Tomorrow's sunrise
    if (sunrises[1]) {
      tomorrowSr = new Date(sunrises[1]).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
  } catch (_) {}

  // Hourly strip for main page (from current hour, ~24h)
  let hourlyStripHtml = '';
  let tempCurveHtml = '';
  if (data.hourly) {
    const { time: hTimes, temperature_2m: hTemps, weathercode: hCodes, precipitation_probability: hPrecip, precipitation: hRainMm } = data.hourly;
    const nowISO = new Date().toISOString().slice(0, 13);
    const startIdx = hTimes.findIndex(t => t.startsWith(nowISO.slice(0, 13)));
    const start = startIdx >= 0 ? startIdx : 0;
    const end = Math.min(start + 24, hTimes.length);
    for (let hi = start; hi < end; hi++) {
      const hDate = new Date(hTimes[hi]);
      const h = hDate.getHours();
      const isNow = hi === start;
      const label = isNow ? 'Now' : (h === 0 ? '12am' : h < 12 ? h + 'am' : h === 12 ? '12pm' : (h - 12) + 'pm');
      const temp = hTemps[hi] != null ? Math.round(hTemps[hi]) : '—';
      const cod = hCodes[hi] ?? 0;
      hourlyStripHtml += `<div class="aw-hour${isNow ? ' aw-hour--now' : ''}"><div class="aw-hour-time">${label}</div><div class="aw-hour-icon">${wmoIcon(cod)}</div><div class="aw-hour-temp">${temp}°</div></div>`;
    }

    // ── Temperature curve chart ──
    const cCount = end - start;
    if (cCount > 2) {
      const cTemps = [], cLabels = [], cIcons = [], cPrecip = [], cNowIdx = 0;
      for (let ci = start; ci < end; ci++) {
        const d = new Date(hTimes[ci]);
        const hr = d.getHours();
        const isNow = ci === start;
        cTemps.push(hTemps[ci] != null ? Math.round(hTemps[ci]) : null);
        cLabels.push(isNow ? 'Now' : (hr === 0 ? '12am' : hr < 12 ? hr + 'am' : hr === 12 ? '12pm' : (hr - 12) + 'pm'));
        cIcons.push(hCodes[ci] ?? 0);
        cPrecip.push(hPrecip?.[ci] ?? 0);
      }
      // Show every 3rd hour
      const step = 3;
      const pts = [];
      for (let i = 0; i < cCount; i += step) {
        if (cTemps[i] != null) pts.push({ i, t: cTemps[i] });
      }
      if (pts.length > 1) {
        const tMin = Math.min(...pts.map(p => p.t));
        const tMax = Math.max(...pts.map(p => p.t));
        const tRange = tMax - tMin || 1;
        const colW = 64, chartH = 80, padTop = 56, padBot = 8;
        const totalW = (pts.length - 1) * colW + 40;
        const svgH = chartH + padTop + padBot;
        // Map temp to y
        const yOf = t => padTop + (1 - (t - tMin) / tRange) * chartH;
        // Build points
        const coords = pts.map((p, idx) => ({ x: 20 + idx * colW, y: yOf(p.t) }));
        // Smooth cubic spline path
        let path = 'M' + coords[0].x + ',' + coords[0].y;
        for (let ci = 0; ci < coords.length - 1; ci++) {
          const c = coords[ci], n = coords[ci + 1];
          const cpx = (n.x - c.x) * 0.4;
          path += ' C' + (c.x + cpx) + ',' + c.y + ' ' + (n.x - cpx) + ',' + n.y + ' ' + n.x + ',' + n.y;
        }
        // Fill path under curve
        const fillPath = path + ' L' + coords[coords.length-1].x + ',' + (svgH) + ' L' + coords[0].x + ',' + (svgH) + ' Z';

        let curveSvg = `<svg class="aw-tcurve-svg" viewBox="0 0 ${totalW} ${svgH}" preserveAspectRatio="none">`;
        curveSvg += `<path d="${fillPath}" fill="url(#tcGrad)" opacity="0.15"/>`;
        curveSvg += `<defs><linearGradient id="tcGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--accent)"/><stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>`;
        curveSvg += `<path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
        // Dots + temp labels
        coords.forEach((c, idx) => {
          const isNow = pts[idx].i === 0;
          curveSvg += `<circle cx="${c.x}" cy="${c.y}" r="${isNow ? 5 : 3.5}" fill="${isNow ? 'var(--accent)' : 'rgba(255,255,255,0.9)'}" stroke="${isNow ? '#fff' : 'none'}" stroke-width="${isNow ? 2 : 0}"/>`;
          curveSvg += `<text x="${c.x}" y="${c.y - 14}" text-anchor="middle" fill="var(--text-primary)" font-size="12" font-weight="600" font-family="var(--font-num)">${pts[idx].t}°</text>`;
        });
        curveSvg += '</svg>';

        // Weather icons overlaid above temp labels on chart
        let iconOverlayHtml = '';
        coords.forEach((c, idx) => {
          const precip = cPrecip[pts[idx].i];
          const precipStr = precip > 0 ? `<div class="aw-tcurve-precip">${precip}%</div>` : '';
          // Position icon above the temp text (which is at y - 14 in SVG coords)
          // SVG viewBox height is svgH, CSS height is 120px, so scale: 120/svgH
          const scale = 120 / svgH;
          const topPx = (c.y - 38) * scale;
          iconOverlayHtml += `<div class="aw-tcurve-icon-overlay" style="left:${c.x}px;top:${topPx}px">
            <div class="aw-tcurve-icon">${wmoIcon(cIcons[pts[idx].i])}</div>
            ${precipStr}
          </div>`;
        });
        // Separate time strip
        let timeHtml = '';
        pts.forEach((p, idx) => {
          timeHtml += `<span class="aw-tcurve-time-mark${p.i === 0 ? ' aw-tcurve-time--now' : ''}" style="left:${20 + idx * colW}px">${cLabels[p.i]}</span>`;
        });

        // Period headers — centered across each period's column span (sequential grouping)
        const getPeriod = hr => {
          if (hr >= 5 && hr < 12) return 'Morning';
          if (hr >= 12 && hr < 17) return 'Afternoon';
          if (hr >= 17 && hr < 21) return 'Evening';
          return 'Overnight';
        };
        const periodRuns = [];
        let lastPeriod = null;
        pts.forEach((p, idx) => {
          const hr = new Date(hTimes[start + p.i]).getHours();
          const pName = getPeriod(hr);
          if (pName !== lastPeriod) {
            periodRuns.push({ name: pName, positions: [] });
            lastPeriod = pName;
          }
          periodRuns[periodRuns.length - 1].positions.push(20 + idx * colW);
        });
        let periodHtml = '';
        // Evenly distribute period labels across the chart width
        const periodSpacing = totalW / (periodRuns.length + 1);
        periodRuns.forEach((run, ri) => {
          const centerX = periodSpacing * (ri + 1);
          periodHtml += `<span class="aw-tcurve-period" style="left:${centerX}px">${run.name}</span>`;
        });

        tempCurveHtml = `<div class="card aw-card">
          <div class="aw-card-label">${WEATHER_SVGS.thermometer || ''} TEMPERATURE</div>
          <div class="aw-tcurve-wrap">
            <div class="aw-tcurve-periods">${periodHtml}</div>
            <div class="aw-tcurve-chart" style="width:${totalW}px">
              ${curveSvg}
              ${iconOverlayHtml}
            </div>
            <div class="aw-tcurve-timeline" style="width:${totalW}px">${timeHtml}</div>
          </div>
        </div>`;
      }
    }

    // ── Rain mm bar chart ──
    const rainData = hRainMm || hPrecip?.map(() => 0) || [];
    if (cCount > 2) {
      const rStep = 3;
      const rPts = [];
      for (let i = 0; i < cCount; i += rStep) {
        const mm = rainData[start + i] ?? 0;
        const hr = new Date(hTimes[start + i]).getHours();
        const isNow = i === 0;
        const label = isNow ? 'Now' : (hr === 0 ? '12am' : hr < 12 ? hr + 'am' : hr === 12 ? '12pm' : (hr - 12) + 'pm');
        rPts.push({ i, mm, label, isNow, code: hCodes[start + i] ?? 0 });
      }
      const rMax = Math.max(...rPts.map(p => p.mm), 1);
      const rColW = 36, rBarMaxH = 80, rTotalW = (rPts.length - 1) * rColW + 40;

      let rainBarsHtml = '';
      let rainTimeHtml = '';
      rPts.forEach((p, idx) => {
        const x = 20 + idx * rColW;
        const barH = (p.mm / rMax) * rBarMaxH;
        const mmLabel = p.mm > 0 ? (p.mm < 0.1 ? p.mm.toFixed(2) : p.mm.toFixed(1)) : '0';
        rainBarsHtml += `<div class="aw-rain-col" style="left:${x}px">
          <div class="aw-rain-val">${mmLabel}</div>
          <div class="aw-rain-bar" style="height:${Math.max(barH, 6)}px"></div>
        </div>`;
        rainTimeHtml += `<span class="aw-tcurve-time-mark${p.isNow ? ' aw-tcurve-time--now' : ''}" style="left:${x}px">${p.label}</span>`;
      });

      tempCurveHtml += `<div class="card aw-card">
        <div class="aw-card-label">${WEATHER_SVGS.rain || ''} PRECIPITATION</div>
        <div class="aw-tcurve-wrap">
          <div class="aw-rain-chart" style="width:${rTotalW}px">
            <div class="aw-rain-bars">${rainBarsHtml}</div>
          </div>
          <div class="aw-tcurve-timeline" style="width:${rTotalW}px">${rainTimeHtml}</div>
        </div>
      </div>`;
    }
  }

  // 7-day forecast rows
  const forecastRows = time.map((dateStr, i) => {
    const d = new Date(dateStr + 'T12:00:00');
    const dayName = i === 0 ? 'Today' : DAYS_OF_WEEK[d.getDay()];
    const { score, label } = rideScore(i);
    const lo = Math.round(lows[i]);
    const hi = Math.round(highs[i]);
    const leftPct = ((lows[i] - weekMin) / weekRange * 100).toFixed(1);
    const widthPct = ((highs[i] - lows[i]) / weekRange * 100).toFixed(1);
    // Current temp dot position (only for today)
    let dotHtml = '';
    if (i === 0 && curTemp != null) {
      const dotPct = ((curTemp - weekMin) / weekRange * 100).toFixed(1);
      dotHtml = `<div class="aw-bar-dot" style="left:${dotPct}%"></div>`;
    }
    return `<div class="aw-forecast-row" data-day-idx="${i}"><span class="aw-fc-day">${dayName}</span><span class="aw-fc-icon">${wmoIcon(codes[i])}</span><span class="aw-fc-lo">${lo}°</span><div class="aw-fc-bar-track"><div class="aw-fc-bar" style="left:${leftPct}%;width:${widthPct}%"></div>${dotHtml}</div><span class="aw-fc-hi">${hi}°</span><span class="aw-fc-dot aw-fc-dot--${label}"></span></div>`;
  }).join('');

  // Today's ride score
  const todayScore = rideScore(0);
  const topReasons = todayScore.reasons.slice(0, 3);
  const reasonsHtml = topReasons.map(r => `<div class="aw-reason-row"><span class="aw-reason-icon">${WEATHER_SVGS[r.svg] || ''}</span><span class="aw-reason-text">${r.text}</span></div>`).join('');

  // UV description helper
  const uvDesc = v => v >= 11 ? 'Extreme' : v >= 8 ? 'Very High' : v >= 6 ? 'High' : v >= 3 ? 'Moderate' : 'Low';
  const feelsDesc = (f, a) => {
    if (f == null) return '';
    const diff = f - a;
    if (Math.abs(diff) < 2) return 'Similar to the actual temperature';
    return diff > 0 ? 'Wind is making it feel warmer' : 'Wind is making it feel colder';
  };

  // Lock page height before DOM swap to prevent scroll clamping during location switch
  if (_restoreScrollY != null) {
    const h = container.scrollHeight;
    container.style.minHeight = h + 'px';
  }

  const isDay = cur.is_day != null ? !!cur.is_day : true;
  const wxScene = [95,96,99].includes(curCode) ? 'storm'
    : [61,63,65,66,67,80,81,82].includes(curCode) ? 'rain'
    : [71,73,75,77,85,86].includes(curCode) ? 'snow'
    : [45,48].includes(curCode) ? 'fog'
    : curCode >= 2 ? 'cloudy'
    : 'clear';

  // Insert horizon backdrop into the page container (outside body flow)
  let horizonEl = container.querySelector('.aw-horizon');
  if (!horizonEl) {
    horizonEl = document.createElement('div');
    container.insertBefore(horizonEl, container.firstChild);
  }
  horizonEl.className = `aw-horizon ${isDay ? 'aw-horizon--day' : 'aw-horizon--night'} aw-horizon--${wxScene}`;

  body.innerHTML = `
    <!-- Apple Weather Hero -->
    <div class="aw-hero">
      <div class="aw-hero-condition">${wmoLabel(curCode)}</div>
      <div class="aw-hero-temp">${curTemp != null ? Math.round(curTemp) : '—'}°</div>
      <div class="aw-hero-hl">H:${Math.round(highs[0])}°  L:${Math.round(lows[0])}°</div>
    </div>

    <!-- Hourly Forecast -->
    ${hourlyStripHtml ? `
    <div class="card aw-card">
      <div class="aw-card-label">HOURLY FORECAST</div>
      <div class="aw-hourly-scroll">${hourlyStripHtml}</div>
    </div>` : ''}

    ${tempCurveHtml}

    <!-- Radar Map -->
    <div class="card aw-card aw-radar-card">
      <div class="aw-card-label">${WEATHER_SVGS.cloud || ''} PRECIPITATION RADAR</div>
      <div class="aw-radar-wrap">
        <div id="wxRadarMap" class="aw-radar-map"></div>
        <div class="aw-radar-controls">
          <button class="aw-radar-btn aw-radar-play" id="wxRadarPlay" aria-label="Play">${_radarPlayIcon()}</button>
          <div class="aw-radar-timeline" id="wxRadarTimeline"></div>
          <span class="aw-radar-time" id="wxRadarTimeLabel">Now</span>
        </div>
      </div>
    </div>

    <!-- 7-Day Forecast -->
    <div class="card aw-card">
      <div class="aw-card-label">7-DAY FORECAST</div>
      <div class="aw-forecast-list">${forecastRows}</div>
    </div>

    <!-- Ride Score -->
    <div class="card aw-card">
      <div class="aw-card-label">TODAY'S RIDE SCORE</div>
      <div class="aw-ride-score">
        <div class="aw-rs-top">
          <div class="aw-rs-num">${todayScore.score}</div>
          <div class="aw-rs-label">${todayScore.label === 'great' ? 'Great Day' : todayScore.label === 'good' ? 'Good Day' : todayScore.label === 'fair' ? 'Fair Day' : 'Poor Day'}</div>
        </div>
        <div class="aw-rs-bar-track"><div class="aw-rs-bar aw-rs-bar--${todayScore.label}" style="width:${todayScore.score}%"></div></div>
        ${rideWindow ? `<div class="aw-rs-window">${WEATHER_SVGS.bike}<span>${rideWindowMissed ? 'Best window passed' : 'Best window'}: ${rideWindow.label}</span></div>` : ''}
        <div class="aw-rs-reasons">${reasonsHtml}</div>
      </div>
    </div>

    <!-- Conditions Grid — SwiftUI style -->
    <div class="aw-conditions-grid">
      ${(() => {
        const dewPt = curTemp != null && curHumidity != null ? Math.round(curTemp - ((100 - curHumidity) / 5)) : null;
        const dewDesc = dewPt == null ? '' : dewPt <= -5 ? 'The air is very dry' : dewPt <= 5 ? 'The air is dry' : dewPt <= 12 ? 'Comfortable' : dewPt <= 18 ? 'Slightly humid' : 'Muggy';
        const windDeg = cur.winddirection_10m ?? 0;
        const pressureDesc = curPressure != null ? (curPressure > 1025 ? 'Currently rising rapidly' : curPressure > 1013 ? 'Currently rising' : curPressure < 1000 ? 'Currently falling rapidly' : curPressure < 1013 ? 'Currently falling' : 'Stable') : '';
        const pressureAngle = curPressure != null ? Math.min(Math.max((curPressure - 960) / (1060 - 960), 0), 1) * 240 - 120 : 0;
        const visDesc = curVis != null && curVis >= 10000 ? 'Unlimited visibility' : curVis != null && curVis >= 5000 ? 'Good visibility' : 'Reduced visibility';
        const visKm = curVis != null ? (curVis >= 10000 ? (curVis / 1000).toFixed(2) : (curVis / 1000).toFixed(1)) : '—';
        return `
      <div class="card aw-tile aw-tile--viz">
        <div class="aw-tile-label">${WEATHER_SVGS.uv} UV index</div>
        <div class="aw-tile-desc">${uvDesc(curUV)} rest of day</div>
        <div class="aw-tile-viz">
          <div class="aw-tile-big">${curUV <= 2 ? 'Low' : curUV <= 5 ? 'Moderate' : curUV <= 7 ? 'High' : curUV <= 10 ? 'Very High' : 'Extreme'}</div>
          <div class="aw-uv-bar">
            <div class="aw-uv-bar-track"></div>
            <div class="aw-uv-dot" style="left:clamp(11px, ${Math.min(curUV / 11 * 100, 100)}%, calc(100% - 11px))"><span>${Math.round(curUV)}</span></div>
          </div>
        </div>
      </div>
      <div class="card aw-tile aw-tile--viz">
        <div class="aw-tile-label">${WEATHER_SVGS.humidity} Humidity</div>
        <div class="aw-tile-desc">${curHumidity != null ? (Math.abs((curHumidity) - 50) < 15 ? 'Similar to yesterday' : curHumidity > 70 ? 'Feels muggy' : 'Dry air') : ''}</div>
        <div class="aw-tile-viz">
          <div class="aw-tile-big">${curHumidity != null ? Math.round(curHumidity) + '%' : '—'}</div>
          <div class="aw-humidity-bar">
            <div class="aw-humidity-fill" style="width:${curHumidity ?? 0}%"></div>
          </div>
        </div>
      </div>
      <div class="card aw-tile aw-tile--viz">
        <div class="aw-tile-label">${WEATHER_SVGS.wind} Wind</div>
        <div class="aw-tile-desc">${curWind < 5 ? "It's calm" : curWind < 20 ? 'Light breeze' : curWind < 40 ? 'Breezy' : 'Strong wind'}</div>
        <div class="aw-tile-viz">
          <div class="aw-compass">
            <svg viewBox="0 0 140 140" class="aw-compass-svg">
              <!-- Outer ring band (thick stroke) -->
              <circle cx="70" cy="70" r="57" fill="none" stroke="var(--text-muted)" stroke-width="14" opacity="0.18"/>
              <circle cx="70" cy="70" r="69" fill="none" stroke="var(--text-muted)" stroke-width="1" opacity="0.2"/>
              <circle cx="70" cy="70" r="45" fill="none" stroke="var(--text-muted)" stroke-width="1" opacity="0.2"/>
              <!-- Cardinal labels centered in the ring band (radially aligned) -->
              <text x="70" y="13" text-anchor="middle" dominant-baseline="central" fill="#FF453A" font-size="11" font-weight="700">N</text>
              <text x="127" y="70" text-anchor="middle" dominant-baseline="central" fill="var(--text-muted)" font-size="10" font-weight="600" transform="rotate(90, 127, 70)">E</text>
              <text x="70" y="127" text-anchor="middle" dominant-baseline="central" fill="var(--text-muted)" font-size="10" font-weight="600" transform="rotate(180, 70, 127)">S</text>
              <text x="13" y="70" text-anchor="middle" dominant-baseline="central" fill="var(--text-muted)" font-size="10" font-weight="600" transform="rotate(-90, 13, 70)">W</text>
              <!-- Intercardinal labels in the ring band (radially aligned) -->
              <text x="110" y="30" text-anchor="middle" dominant-baseline="central" fill="var(--text-muted)" font-size="7" opacity="0.45" transform="rotate(45, 110, 30)">NE</text>
              <text x="110" y="110" text-anchor="middle" dominant-baseline="central" fill="var(--text-muted)" font-size="7" opacity="0.45" transform="rotate(135, 110, 110)">SE</text>
              <text x="30" y="110" text-anchor="middle" dominant-baseline="central" fill="var(--text-muted)" font-size="7" opacity="0.45" transform="rotate(-135, 30, 110)">SW</text>
              <text x="30" y="30" text-anchor="middle" dominant-baseline="central" fill="var(--text-muted)" font-size="7" opacity="0.45" transform="rotate(-45, 30, 30)">NW</text>
              <!-- Tick marks on inner edge of ring -->
              ${[0,45,90,135,180,225,270,315].map(a => {const ri=42,ro=45,cx2=70,cy2=70,rad=a*Math.PI/180;return '<line x1="'+(cx2+ri*Math.sin(rad))+'" y1="'+(cy2-ri*Math.cos(rad))+'" x2="'+(cx2+ro*Math.sin(rad))+'" y2="'+(cy2-ro*Math.cos(rad))+'" stroke="var(--text-muted)" stroke-width="1" opacity="0.3"/>'}).join('')}
              <!-- Wind direction arrow -->
              <g transform="rotate(${windDeg}, 70, 70)">
                <path d="M70,28 L76,42 Q70,40 64,42 Z" fill="var(--text-primary)" opacity="0.9"/>
              </g>
            </svg>
            <div class="aw-compass-center">
              <div class="aw-compass-speed">${Math.round(curWind)}</div>
              <div class="aw-compass-unit">${windLbl}</div>
            </div>
          </div>
        </div>
      </div>
      <div class="card aw-tile aw-tile--viz">
        <div class="aw-tile-label">${WEATHER_SVGS.humidity} Dew point</div>
        <div class="aw-tile-desc">${dewDesc}</div>
        <div class="aw-tile-viz">
          <div class="aw-tile-huge">${dewPt != null ? dewPt + '°' : '—'}</div>
        </div>
      </div>
      <div class="card aw-tile aw-tile--viz">
        <div class="aw-tile-label">${WEATHER_SVGS.pressure} Pressure</div>
        <div class="aw-tile-desc">${pressureDesc}</div>
        <div class="aw-tile-viz">
          <div class="aw-gauge">
            <svg viewBox="0 0 140 120" class="aw-gauge-svg">
              ${(() => {
                const cx=70,cy=70,r=52,pNorm=curPressure!=null?Math.min(Math.max((curPressure-960)/(1060-960),0),1):0.5;
                const gapDeg=108,arcDeg=360-gapDeg;
                const startDeg=90+gapDeg/2,endDeg=startDeg+arcDeg;
                const toRad=d=>d*Math.PI/180;
                const pt=(deg)=>[cx+r*Math.cos(toRad(deg)),cy+r*Math.sin(toRad(deg))];
                const s=pt(startDeg),e=pt(endDeg);
                const bg='M '+s[0].toFixed(1)+' '+s[1].toFixed(1)+' A '+r+' '+r+' 0 1 1 '+e[0].toFixed(1)+' '+e[1].toFixed(1);
                const fillDeg=startDeg+arcDeg*pNorm;
                const fillPt=pt(fillDeg);
                const large=arcDeg*pNorm>180?1:0;
                const fg='M '+s[0].toFixed(1)+' '+s[1].toFixed(1)+' A '+r+' '+r+' 0 '+large+' 1 '+fillPt[0].toFixed(1)+' '+fillPt[1].toFixed(1);
                const val = curPressure != null ? curPressure.toFixed(1) : '—';
                return '<path d="'+bg+'" fill="none" stroke="var(--text-muted)" stroke-width="10" stroke-linecap="round" opacity="0.15"/>'
                  +'<path d="'+fg+'" fill="none" stroke="var(--text-primary)" stroke-width="10" stroke-linecap="round" opacity="0.7"/>'
                  +'<text x="70" y="68" text-anchor="middle" dominant-baseline="central" fill="var(--text-primary)" font-size="28" font-weight="500" font-family="var(--font-num)">'+val+'</text>'
                  +'<text x="70" y="108" text-anchor="middle" dominant-baseline="central" fill="var(--text-muted)" font-size="14" font-weight="500">mb</text>';
              })()}
            </svg>
          </div>
        </div>
      </div>
      <div class="card aw-tile aw-tile--viz">
        <div class="aw-tile-label">${WEATHER_SVGS.visibility} Visibility</div>
        <div class="aw-tile-desc">${visDesc}</div>
        <div class="aw-tile-viz">
          <div class="aw-tile-huge">${visKm}<span> km</span></div>
        </div>
      </div>`;
      })()}
    </div>

    <!-- Sunrise & Sunset — full-width premium card -->
    <div class="card aw-card aw-sun-card">
      <div class="aw-card-label">${WEATHER_SVGS.sunrise_icon} SUNRISE & SUNSET</div>
      <div class="aw-sun-card-body">
        <div class="aw-sun-card-hero">
          <div class="aw-sun-card-next">
            <div class="aw-sun-card-next-label">${sunNextLabel}</div>
            <div class="aw-sun-card-next-time">${sunTimeLeft || '—'}</div>
          </div>
        </div>
        ${_buildSunArc(sunProgress, heroSr, heroSs)}
        <div class="aw-sun-row">
          <div class="aw-sun-stat">
            <div class="aw-sun-stat-icon">${WEATHER_SVGS.sunrise_icon}</div>
            <div class="aw-sun-stat-label">Sunrise</div>
            <div class="aw-sun-stat-val">${heroSr}</div>
          </div>
          <div class="aw-sun-stat">
            <div class="aw-sun-stat-icon">${WEATHER_SVGS.sunset_icon}</div>
            <div class="aw-sun-stat-label">Sunset</div>
            <div class="aw-sun-stat-val">${heroSs}</div>
          </div>
          <div class="aw-sun-stat">
            <div class="aw-sun-stat-icon">${WEATHER_SVGS.sun}</div>
            <div class="aw-sun-stat-label">Daylight</div>
            <div class="aw-sun-stat-val">${daylightHrs}h ${daylightMin}m</div>
          </div>
        </div>
        <div class="aw-sun-golden">
          <div class="aw-sun-stat-icon"><svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="20" r="8" fill="#FFB800" opacity="0.2"/><circle cx="20" cy="20" r="5" fill="#FFB800"/></svg></div>
          <span class="aw-sun-golden-label">Golden Hour</span>
          <span class="aw-sun-golden-val">${goldenStart} – ${goldenEnd}</span>
        </div>
        ${tomorrowSr ? `<div class="aw-sun-card-tomorrow">Tomorrow's sunrise: <strong>${tomorrowSr}</strong></div>` : ''}
      </div>
    </div>

    <!-- Weather vs Performance -->
    <div class="aw-card-label" style="margin-top:8px">WEATHER VS PERFORMANCE</div>
    <div id="wxPerfSection" class="wxp-perf-section">
      <div class="wxp-perf-loading"><div class="spinner"></div><p>Analysing ride data...</p></div>
    </div>

    <!-- Footer -->
    <div class="aw-footer">Data from <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a> · ${localStorage.getItem('icu_wx_model') || 'best_match'} · ${lat.toFixed(2)}°N, ${lng.toFixed(2)}°E</div>
  `;

  // Detect sticky state on location switcher for fade gradient
  const switcher = container.querySelector('.wx-loc-switcher');
  if (switcher && !switcher._stickyObs) {
    const sentinel = document.createElement('div');
    sentinel.style.cssText = 'height:1px;margin-bottom:-1px;pointer-events:none;';
    switcher.parentNode.insertBefore(sentinel, switcher);
    const obs = new IntersectionObserver(([e]) => {
      switcher.classList.toggle('is-stuck', !e.isIntersecting);
    }, { threshold: 0 });
    obs.observe(sentinel);
    switcher._stickyObs = obs;
  }

  // Apply weather-based background gradient to the scrollable page container
  const pageContent = document.getElementById('pageContent');
  if (pageContent) {
    pageContent.style.background = wxPageGradient(curCode, isDay);
  }

  // Restore scroll position after location switch
  if (_restoreScrollY != null) {
    // Force the container to keep its height so scroll position isn't clamped
    container.style.minHeight = container.scrollHeight + 'px';
    requestAnimationFrame(() => {
      window.scrollTo(0, _restoreScrollY);
      requestAnimationFrame(() => { container.style.minHeight = ''; });
    });
  }

  // Attach click handlers on forecast rows (with drag-detection guard)
  body.querySelectorAll('.aw-forecast-row').forEach(card => {
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

  // Drag-to-scroll on hourly strip
  const hStrip = body.querySelector('.aw-hourly-scroll');
  if (hStrip) {
    let isDown = false, startX = 0, scrollLeft = 0;
    hStrip.addEventListener('mousedown', e => {
      isDown = true; hStrip.classList.add('is-dragging');
      startX = e.pageX - hStrip.getBoundingClientRect().left;
      scrollLeft = hStrip.scrollLeft;
      e.preventDefault();
    });
    const wxHUp = () => { isDown = false; hStrip.classList.remove('is-dragging'); };
    let _wxHRAF = 0;
    const wxHMove = e => {
      if (!isDown) return;
      const px = e.pageX;
      if (_wxHRAF) return;
      _wxHRAF = requestAnimationFrame(() => {
        _wxHRAF = 0;
        const x = px - hStrip.getBoundingClientRect().left;
        hStrip.scrollLeft = scrollLeft - (x - startX);
      });
    };
    document.addEventListener('mouseup', wxHUp);
    document.addEventListener('mousemove', wxHMove);
    _pageCleanupFns.push(() => {
      document.removeEventListener('mouseup', wxHUp);
      document.removeEventListener('mousemove', wxHMove);
    });
  }
  // Init radar map
  _rIC(() => _initWxRadar(lat, lng));
  _rIC(() => { if (window.refreshGlow) refreshGlow(); });
  _rIC(() => renderWeatherPerformance());
}

async function _initWxRadar(lat, lng) {
  const el = document.getElementById('wxRadarMap');
  if (!el || !window.maplibregl) return;

  // Cleanup previous
  if (_wxRadarMap) { _wxRadarMap.remove(); _wxRadarMap = null; }
  if (_wxRadarTimer) { clearInterval(_wxRadarTimer); _wxRadarTimer = null; }

  // Fetch RainViewer radar timestamps
  let frames;
  try {
    const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
    const rv = await res.json();
    frames = [...(rv.radar?.past || []), ...(rv.radar?.nowcast || [])];
    _wxRadarFrames = frames;
  } catch (_) { return; }
  if (!frames.length) return;

  _wxRadarIdx = frames.length - 1; // start at latest

  // Create map
  _wxRadarMap = new maplibregl.Map({
    container: el,
    style: 'https://tiles.openfreemap.org/styles/dark', // strava base
    center: [lng, lat],
    zoom: 9,
    minZoom: 4,
    maxZoom: 12,
    attributionControl: false,
    interactive: true,
    dragRotate: false,
    pitchWithRotate: false,
    touchZoomRotate: true,
  });

  _wxRadarMap.on('load', () => {
    // Remove ne2_shaded raster layer that shows "Zoom Level Not Supported" watermark
    const layers = _wxRadarMap.getStyle().layers;
    layers.forEach(l => {
      if (l.source === 'ne2_shaded') _wxRadarMap.removeLayer(l.id);
    });
    if (_wxRadarMap.getSource('ne2_shaded')) _wxRadarMap.removeSource('ne2_shaded');
    // Apply strava-style paint overrides
    if (window._applyStravaOverrides) window._applyStravaOverrides(_wxRadarMap);
    // Add all radar frames as sources + layers (hidden initially)
    frames.forEach((f, i) => {
      const id = 'radar-' + i;
      _wxRadarMap.addSource(id, {
        type: 'raster',
        tiles: [`https://tilecache.rainviewer.com${f.path}/256/{z}/{x}/{y}/6/1_1.png`],
        tileSize: 256,
        maxzoom: 8
      });
      _wxRadarMap.addLayer({
        id: id,
        type: 'raster',
        source: id,
        paint: { 'raster-opacity': i === _wxRadarIdx ? 0.7 : 0 }
      });
    });

    // Build timeline dots
    _buildRadarTimeline(frames);
  });

  // Play/pause button
  const playBtn = document.getElementById('wxRadarPlay');
  if (playBtn) {
    playBtn.addEventListener('click', () => {
      if (_wxRadarTimer) {
        clearInterval(_wxRadarTimer);
        _wxRadarTimer = null;
        playBtn.innerHTML = _radarPlayIcon();
      } else {
        playBtn.innerHTML = _radarPauseIcon();
        _wxRadarTimer = setInterval(() => {
          _wxRadarIdx = (_wxRadarIdx + 1) % _wxRadarFrames.length;
          _showRadarFrame(_wxRadarIdx);
        }, 500);
      }
    });
  }

  _pageCleanupFns.push(() => {
    if (_wxRadarTimer) { clearInterval(_wxRadarTimer); _wxRadarTimer = null; }
    if (_wxRadarMap) { _wxRadarMap.remove(); _wxRadarMap = null; }
  });
}

function _showRadarFrame(idx) {
  if (!_wxRadarMap) return;
  _wxRadarFrames.forEach((_, i) => {
    const id = 'radar-' + i;
    if (_wxRadarMap.getLayer(id)) {
      _wxRadarMap.setPaintProperty(id, 'raster-opacity', i === idx ? 0.7 : 0);
    }
  });
  // Update time label
  const lbl = document.getElementById('wxRadarTimeLabel');
  if (lbl && _wxRadarFrames[idx]) {
    const d = new Date(_wxRadarFrames[idx].time * 1000);
    const h = d.getHours(), m = d.getMinutes();
    const isPast = idx < _wxRadarFrames.length - 1;
    const now = idx === _wxRadarFrames.length - 1;
    lbl.textContent = now ? 'Now' : (h % 12 || 12) + ':' + String(m).padStart(2, '0') + (h < 12 ? 'am' : 'pm');
  }
  // Update timeline active dot
  const dots = document.querySelectorAll('.aw-radar-dot');
  dots.forEach((d, i) => d.classList.toggle('active', i === idx));
}

function _buildRadarTimeline(frames) {
  const el = document.getElementById('wxRadarTimeline');
  if (!el) return;
  el.innerHTML = frames.map((f, i) =>
    `<span class="aw-radar-dot${i === _wxRadarIdx ? ' active' : ''}" data-idx="${i}"></span>`
  ).join('');
  el.addEventListener('click', e => {
    const dot = e.target.closest('.aw-radar-dot');
    if (dot) {
      _wxRadarIdx = +dot.dataset.idx;
      _showRadarFrame(_wxRadarIdx);
    }
  });
}

export function refreshWeatherPage() {
  localStorage.removeItem('icu_wx_page');
  localStorage.removeItem('icu_wx_page_ts');
  localStorage.removeItem('icu_wx_forecast');
  localStorage.removeItem('icu_wx_forecast_ts');
  renderWeatherPage();
}

/* Fetch weather page data without requiring the DOM container */
async function _wxFetchPageData() {
  if (state.weatherPageData?.daily) return; // already have it
  let lat = null, lng = null;
  try { const c = JSON.parse(localStorage.getItem('icu_wx_coords')); lat = c.lat; lng = c.lng; } catch (_) {}
  if (lat == null) return;
  const CACHE_KEY = 'icu_wx_page';
  const CACHE_TS = 'icu_wx_page_ts';
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const ts = +localStorage.getItem(CACHE_TS);
    if (raw && ts && Date.now() - ts < 30 * 60000) {
      const d = JSON.parse(raw);
      if (d?.daily) { state.weatherPageData = d; state.weatherPageMeta = _wxBuildMeta(lat, lng); return; }
    }
  } catch (_) {}
  const isImp = state.units === 'imperial';
  const tU = isImp ? 'fahrenheit' : 'celsius';
  const wU = isImp ? 'mph' : 'kmh';
  const mdl = localStorage.getItem('icu_wx_model') || 'best_match';
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,windspeed_10m_max,winddirection_10m_dominant,uv_index_max,sunrise,sunset&hourly=temperature_2m,precipitation_probability,weathercode,windspeed_10m&current=temperature_2m,weathercode,windspeed_10m,winddirection_10m&timezone=auto&forecast_days=7&temperature_unit=${tU}&wind_speed_unit=${wU}&models=${mdl}`);
    if (res.ok) {
      const d = await res.json();
      if (d?.daily) {
        state.weatherPageData = d;
        state.weatherPageMeta = _wxBuildMeta(lat, lng);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(d)); localStorage.setItem(CACHE_TS, '' + Date.now()); } catch (_) {}
      }
    }
  } catch (_) {}
}

function _wxBuildMeta(lat, lng) {
  const isImp = state.units === 'imperial';
  const athleteCity = state.athlete?.city;
  const athleteCountry = state.athlete?.country;
  const loc = athleteCity ? [athleteCity, athleteCountry].filter(Boolean).join(', ') : 'Your area';
  return { deg: isImp ? '°F' : '°C', windLbl: isImp ? 'mph' : 'km/h', locationLabel: loc, lat, lng };
}

/* ====================================================
   WEATHER DAY DETAIL SUB-PAGE
==================================================== */
export function renderWeatherDayDetail(dayIdx) {
  const sheet = document.getElementById('wxDaySheet');
  const container = document.getElementById('wxDaySheetBody');
  if (!sheet || !container) return;

  let data = state.weatherPageData;
  let meta = state.weatherPageMeta;

  // If weather page hasn't been loaded yet, fetch data directly
  if (!data?.daily) {
    _wxFetchPageData().then(() => renderWeatherDayDetail(dayIdx));
    return;
  }

  if (!meta) {
    const isImperial = state.units === 'imperial';
    meta = { deg: isImperial ? '°F' : '°C', windLbl: isImperial ? 'mph' : 'km/h' };
  }
  if (!data?.daily) return;

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
  if (isStorm)               { score -= 75; reasons.push({ svg: 'storm', text: 'Thunderstorms expected' }); }
  else if (isSnow)           { score -= 65; reasons.push({ svg: 'snow', text: 'Snow or sleet forecast' }); }
  else if (isRain && !isDriz){ score -= 45 + Math.min(precip, 55) * 0.5; reasons.push({ svg: 'rain', text: `Rain (${Math.round(precip)}% chance)` }); }
  else if (isDriz)           { score -= 30; reasons.push({ svg: 'drizzle', text: 'Drizzle expected' }); }
  else if (isFog)            { score -= 25; reasons.push({ svg: 'fog', text: 'Foggy — low visibility' }); }
  else if ([2,3].includes(code)) { score -= 12; reasons.push({ svg: 'pcloud', text: 'Overcast skies' }); }
  if (!isRain && !isDriz && !isSnow && !isStorm) {
    if      (precip >= 60) { score -= 30; reasons.push({ svg: 'rain', text: `${Math.round(precip)}% rain chance` }); }
    else if (precip >= 40) { score -= 18; reasons.push({ svg: 'drizzle', text: `${Math.round(precip)}% rain chance` }); }
    else if (precip >= 25) { score -= 8;  reasons.push({ svg: 'rain', text: `${Math.round(precip)}% rain chance` }); }
  }
  if (high < coldThresh)               { score -= 35; reasons.push({ svg: 'temp', text: `Very cold (high ${Math.round(high)}${deg})` }); }
  else if (high < (isMetric ? 8 : 46)) { score -= 20; reasons.push({ svg: 'temp', text: `Chilly (high ${Math.round(high)}${deg})` }); }
  else if (high < (isMetric ? 12 : 54)){ score -= 10; reasons.push({ svg: 'temp', text: `Cool (high ${Math.round(high)}${deg})` }); }
  else if (high < (isMetric ? 18 : 64)){ score -= 5;  reasons.push({ svg: 'temp', text: `Mild (high ${Math.round(high)}${deg})` }); }
  else if (high > hotThresh)           { score -= 25; reasons.push({ svg: 'temp', text: `Extreme heat (${Math.round(high)}${deg})` }); }
  if (wind > windPoor)       { score -= 35; reasons.push({ svg: 'wind', text: `Very strong winds (${Math.round(wind)} ${windLbl})` }); }
  else if (wind > windThresh){ score -= 20; reasons.push({ svg: 'wind', text: `Windy (${Math.round(wind)} ${windLbl})` }); }
  else if (wind > (isMetric ? 20 : 12)){ score -= 15; reasons.push({ svg: 'wind', text: `Moderate wind (${Math.round(wind)} ${windLbl})` }); }
  else if (wind > (isMetric ? 12 : 8)) { score -= 8;  reasons.push({ svg: 'wind', text: `Breezy (${Math.round(wind)} ${windLbl})` }); }
  if (score >= 80) {
    if (isClear) reasons.unshift({ svg: 'sun', text: 'Clear skies' });
    else         reasons.unshift({ svg: 'pcloud', text: 'Mostly cloudy but dry' });
    if (uv >= 6) reasons.push({ svg: 'uv', text: `High UV (${uv}) — wear sunscreen` });
  }
  score = Math.max(0, Math.min(100, Math.round(score)));
  const label = score >= 80 ? 'great' : score >= 55 ? 'good' : score >= 30 ? 'fair' : 'poor';


  // ── Sunrise / sunset ─────────────────────────────────────────────────────
  let srStr = '—', ssStr = '—';
  let sunProgress = -1;
  try {
    srStr = new Date(sunrises[i]).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    ssStr = new Date(sunsets[i]).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const srMs = new Date(sunrises[i]).getTime();
    const ssMs = new Date(sunsets[i]).getTime();
    const nowMs = Date.now();
    if (ssMs > srMs) sunProgress = (nowMs - srMs) / (ssMs - srMs);
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
      const dotHtml = dotLabel ? `<div class="aw-h-dot aw-h-dot--${dotLabel}"></div>` : '';
      return `
        <div class="aw-hour">
          <div class="aw-hour-time">${hDisp}</div>
          <div class="aw-hour-icon">${wmoIcon(cod)}</div>
          <div class="aw-hour-temp">${temp}°</div>
          <div class="aw-hour-wind">${wnd} ${windLbl}</div>
          <div class="aw-hour-rain">${Math.round(pr)}%</div>
          ${dotHtml}
        </div>`;
    }).join('');
  }

  // ── Ride Planner tips ─────────────────────────────────────────────────────
  function plannerTips() {
    const tips = [];

    // Kit recommendation
    if (high < coldThresh)               tips.push({ svg: 'kit', title: 'Kit', body: `Cold day — full thermal kit, wind vest, gloves & overshoes. Dress for ${Math.round(high)}${deg}.` });
    else if (high < (isMetric ? 10 : 50)) tips.push({ svg: 'kit', title: 'Kit', body: `Chilly — bib tights, long-sleeve base layer, arm warmers. High: ${Math.round(high)}${deg}.` });
    else if (high < (isMetric ? 18 : 65)) tips.push({ svg: 'kit', title: 'Kit', body: `Cool — jersey + arm warmers, knee warmers. May warm up midday.` });
    else if (high > hotThresh)            tips.push({ svg: 'kit', title: 'Kit', body: `Hot day — minimal kit, light colours, cooling vest if available. ${Math.round(high)}${deg} expected.` });
    else                                  tips.push({ svg: 'kit', title: 'Kit', body: `Comfortable temps — standard jersey & bibs. High: ${Math.round(high)}${deg}.` });

    // Rain gear
    if (isStorm)      tips.push({ svg: 'raingear', title: 'Rain Gear', body: 'Thunderstorm forecast — consider an indoor session or reschedule.' });
    else if (isSnow)  tips.push({ svg: 'raingear', title: 'Rain Gear', body: 'Snow forecast — not recommended. If riding, use full waterproofs & studded tyres.' });
    else if (isRain)  tips.push({ svg: 'raingear', title: 'Rain Gear', body: 'Rain expected — waterproof jacket essential, mudguards recommended, check braking distance.' });
    else if (isDriz)  tips.push({ svg: 'raingear', title: 'Rain Gear', body: 'Drizzle possible — light rain jacket or gilet in back pocket. Avoid white kit.' });
    else if (precip >= 40) tips.push({ svg: 'raingear', title: 'Rain Gear', body: `${Math.round(precip)}% rain chance — pack a lightweight gilet as insurance.` });
    else              tips.push({ svg: 'checkmark', title: 'Rain Gear', body: 'Dry conditions expected — no rain gear needed. Leave the jacket at home.' });

    // Wind strategy
    if (wind > windPoor)        tips.push({ svg: 'windstrat', title: 'Wind Strategy', body: `Strong winds (${Math.round(wind)} ${windLbl} ${wdir}) — ride into the wind on the way out so you have it at your back coming home.` });
    else if (wind > windThresh) tips.push({ svg: 'windstrat', title: 'Wind Strategy', body: `Moderate wind (${Math.round(wind)} ${windLbl} ${wdir}) — expect effort spikes on exposed roads. Draft where possible.` });
    else                        tips.push({ svg: 'windstrat', title: 'Wind Strategy', body: `Light winds (${Math.round(wind)} ${windLbl}) — great day for time-trial efforts or PB attempts.` });

    // Sun / UV
    if (uv >= 8)       tips.push({ svg: 'sunprotect', title: 'Sun Protection', body: `Very high UV index (${uv}) — SPF 50+ on all exposed skin, quality sunglasses essential.` });
    else if (uv >= 5)  tips.push({ svg: 'sunprotect', title: 'Sun Protection', body: `Moderate UV (${uv}) — apply sunscreen before heading out, especially on shoulders & neck.` });
    else               tips.push({ svg: 'sunprotect', title: 'Sun Protection', body: `Low UV (${uv}) — no special precautions needed. Sunglasses still useful for road debris.` });

    // Hydration
    if (high > (isMetric ? 28 : 82))   tips.push({ svg: 'hydration', title: 'Hydration', body: `Hot day — aim for at least 1 bottle (500ml) per 45 min. Add electrolyte mix in one bottle.` });
    else if (high > (isMetric ? 20 : 68)) tips.push({ svg: 'hydration', title: 'Hydration', body: `Warm — 500ml/hr is a solid target. Note any cafes or water stops along the route.` });
    else                                tips.push({ svg: 'hydration', title: 'Hydration', body: `Cool weather suppresses thirst — still drink 400–500ml/hr to stay on top of it.` });

    return tips;
  }

  const tips = plannerTips();
  const tipsHtml = tips.map(t => `
    <div class="aw-tip-row">
      <div class="aw-tip-icon">${WEATHER_SVGS[t.svg] || ''}</div>
      <div class="aw-tip-body">
        <div class="aw-tip-title">${t.title}</div>
        <div class="aw-tip-text">${t.body}</div>
      </div>
    </div>`).join('');

  // ── Score color bar / badge ───────────────────────────────────────────────
  const reasonsHtml = reasons.map(r => `<div class="aw-reason-row"><span class="aw-reason-icon">${WEATHER_SVGS[r.svg] || ''}</span><span class="aw-reason-text">${r.text}</span></div>`).join('');

  // ── Show back button in topbar, update page title ────────────────────────
  const wxdBack = document.getElementById('wxdTopbarBack');
  // ── Build sheet content ───────────────────────────────────────────────────
  const scoreLabelText = label === 'great' ? 'Great' : label === 'good' ? 'Good' : label === 'fair' ? 'Fair' : 'Poor';

  // ── Build conditions mini-grid data ─────────────────────────────────────
  const uvLabel = uv <= 2 ? 'Low' : uv <= 5 ? 'Moderate' : uv <= 7 ? 'High' : uv <= 10 ? 'Very High' : 'Extreme';
  const windDesc2 = wind < 5 ? 'Calm' : wind < 20 ? 'Light' : wind < 40 ? 'Breezy' : 'Strong';
  const precipDesc = rain > 0.5 ? `${rain.toFixed(1)} mm expected` : precip > 0 ? `${Math.round(precip)}% chance` : 'None expected';

  container.innerHTML = `
    <div class="aw-detail-wrap">

    <!-- Hero — centered Apple weather style -->
    <div class="wxd-hero">
      <div class="wxd-hero-day">${dayName}</div>
      <div class="wxd-hero-icon">${wmoIcon(codes[i])}</div>
      <div class="wxd-hero-condition">${wmoLabel(codes[i])}</div>
      <div class="wxd-hero-temp">${Math.round(high)}°<span class="wxd-hero-lo">/${Math.round(low)}°</span></div>
      <div class="wxd-hero-score">
        <div class="aw-score-badge aw-score--${label}">${score}</div>
        <div class="wxd-hero-score-label">${scoreLabelText}</div>
      </div>
    </div>

    <!-- Hourly forecast strip -->
    ${hourlyHtml ? `
    <div class="card aw-card">
      <div class="aw-card-label">${WEATHER_SVGS.clock || ''} HOURLY FORECAST</div>
      <div class="aw-hourly-scroll">${hourlyHtml}</div>
    </div>` : ''}

    <!-- Conditions mini-grid -->
    <div class="wxd-grid">
      <div class="wxd-grid-tile">
        <div class="wxd-gt-label">${WEATHER_SVGS.wind} Wind</div>
        <div class="wxd-gt-val">${Math.round(wind)} <span>${windLbl}</span></div>
        <div class="wxd-gt-desc">${windDesc2} · ${wdir}</div>
      </div>
      <div class="wxd-grid-tile">
        <div class="wxd-gt-label">${WEATHER_SVGS.uv} UV Index</div>
        <div class="wxd-gt-val">${Math.round(uv)}</div>
        <div class="wxd-gt-desc">${uvLabel}</div>
      </div>
      <div class="wxd-grid-tile">
        <div class="wxd-gt-label">${WEATHER_SVGS.rain} Precipitation</div>
        <div class="wxd-gt-val">${Math.round(precip)}<span>%</span></div>
        <div class="wxd-gt-desc">${precipDesc}</div>
      </div>
      <div class="wxd-grid-tile">
        <div class="wxd-gt-label">${WEATHER_SVGS.sunrise_icon || WEATHER_SVGS.sun} Daylight</div>
        <div class="wxd-gt-val" style="font-size:18px">${srStr}</div>
        <div class="wxd-gt-desc">Sunset ${ssStr}</div>
      </div>
    </div>

    <!-- Best Ride Window — accent card -->
    ${bestWindowStr ? `
    <div class="card aw-card wxd-window-card">
      <div class="aw-card-label">${WEATHER_SVGS.bike} BEST RIDE WINDOW</div>
      <div class="wxd-window-body">
        <div class="aw-window-time">${bestWindowStr}</div>
        ${_buildSunArc(sunProgress, srStr, ssStr)}
      </div>
    </div>` : ''}

    <!-- Ride Assessment — clean grouped list -->
    ${reasonsHtml ? `
    <div class="card aw-card">
      <div class="aw-card-label">RIDE ASSESSMENT</div>
      <div class="aw-reasons-list">${reasonsHtml}</div>
    </div>` : ''}

    <!-- Ride Planner — grouped tips -->
    <div class="card aw-card">
      <div class="aw-card-label">RIDE PLANNER</div>
      <div class="aw-tips-list">${tipsHtml}</div>
    </div>

    </div><!-- /.aw-detail-wrap -->
  `;

  // Open the sheet overlay
  if (sheet.style.display === 'none' || !sheet.classList.contains('wxd-open')) {
    window._openOverlaySheet('wxDaySheet');
  }

  // Drag-to-scroll on hourly rail
  const hRail = container.querySelector('.aw-hourly-scroll');
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

/* ====================================================
   WEATHER vs PERFORMANCE  (scatter plots)
==================================================== */
const SEASON_COLORS = { Spring:'#00e5a0', Summer:'#ff6b35', Autumn:'#f0c429', Winter:'#4a9eff' };

function _getSeason(dateStr) {
  const m = new Date(dateStr).getMonth();
  if (m >= 2 && m <= 4) return 'Spring';
  if (m >= 5 && m <= 7) return 'Summer';
  if (m >= 8 && m <= 10) return 'Autumn';
  return 'Winter';
}

export function renderWeatherPerformance() {
  const section = document.getElementById('wxPerfSection');
  if (!section) return;

  let allActs;
  try { allActs = getAllActivities().filter(a => !isEmptyActivity(a)); }
  catch { section.innerHTML = '<div class="wxp-perf-empty">Sync activities to see weather impact.</div>'; return; }

  const rides = allActs.filter(a => {
    const temp = a.average_weather_temp ?? a.average_temp ?? null;
    const speed = actVal(a, 'average_speed', 'icu_average_speed');
    return temp != null && speed > 0;
  });

  if (rides.length < 5) {
    section.innerHTML = `<div class="wxp-perf-empty">
      <p>Not enough weather data yet (${rides.length}/5 rides needed).</p>
      <p style="margin-top:6px;font-size:var(--text-xs);opacity:.7">Weather is automatically attached to outdoor rides with GPS data.</p>
    </div>`;
    return;
  }

  // Group scatter data by season
  const tempSpeedData = {}, tempPowerData = {}, windSpeedData = {};
  const useImperial = state.units === 'imperial';
  const spdUnit = useImperial ? 'mph' : 'km/h';
  const spdMul  = useImperial ? 2.23694 : 3.6;
  const tempUnit = useImperial ? '°F' : '°C';

  rides.forEach(a => {
    let temp = a.average_weather_temp ?? a.average_temp;
    if (useImperial) temp = temp * 9/5 + 32;
    const speed = actVal(a, 'average_speed', 'icu_average_speed') * spdMul;
    const power = actVal(a, 'icu_weighted_avg_watts', 'average_watts', 'icu_average_watts');
    const wind  = a.average_wind_speed ?? a.weather_wind_speed;
    const season = _getSeason(a.start_date_local || a.start_date);
    const name = (a.name || 'Ride').slice(0, 30);
    const date = fmtDate(a.start_date_local || a.start_date);

    if (!tempSpeedData[season]) tempSpeedData[season] = [];
    tempSpeedData[season].push({ x: +temp.toFixed(1), y: +speed.toFixed(1), name, date });

    if (power > 0) {
      if (!tempPowerData[season]) tempPowerData[season] = [];
      tempPowerData[season].push({ x: +temp.toFixed(1), y: Math.round(power), name, date });
    }
    if (wind != null && wind >= 0) {
      if (!windSpeedData[season]) windSpeedData[season] = [];
      windSpeedData[season].push({ x: +(wind * spdMul).toFixed(1), y: +speed.toFixed(1), name, date });
    }
  });

  function buildDS(grouped) {
    return Object.entries(grouped).map(([season, pts]) => ({
      label: season, data: pts,
      backgroundColor: SEASON_COLORS[season] + '99', borderColor: SEASON_COLORS[season],
      borderWidth: 1, pointRadius: 4, pointHoverRadius: 7,
    }));
  }

  // Insight text
  let insightHtml = '';
  const _getTemp = a => a.average_weather_temp ?? a.average_temp;
  const optRides = rides.filter(a => _getTemp(a) >= 15 && _getTemp(a) <= 20);
  const hotRides = rides.filter(a => _getTemp(a) > 30);
  if (optRides.length >= 3 && hotRides.length >= 3) {
    const optAvg = optRides.reduce((s, a) => s + actVal(a, 'average_speed', 'icu_average_speed') * spdMul, 0) / optRides.length;
    const hotAvg = hotRides.reduce((s, a) => s + actVal(a, 'average_speed', 'icu_average_speed') * spdMul, 0) / hotRides.length;
    const pct = ((optAvg - hotAvg) / hotAvg * 100).toFixed(1);
    if (pct > 0) {
      insightHtml = `<div class="wxp-perf-insight">You average <strong>${pct}% faster</strong> in 15–20°C compared to rides above 30°C (${optAvg.toFixed(1)} vs ${hotAvg.toFixed(1)} ${spdUnit}).</div>`;
    }
  }

  const legendHtml = Object.entries(SEASON_COLORS).map(([s, c]) =>
    `<span class="wxp-perf-legend-item"><span class="wxp-perf-dot" style="background:${c}"></span>${s}</span>`
  ).join('');

  const hasWind = Object.keys(windSpeedData).length > 0;
  section.innerHTML = `
    ${insightHtml}
    <div class="card-row">
      <div class="card"><div class="card-header"><div>
        <div class="card-title">Temperature vs Speed</div>
        <div class="card-subtitle">${rides.length} rides with temperature data</div>
      </div></div><div class="chart-wrap"><canvas id="wxPerfTempSpeedChart"></canvas></div></div>
      <div class="card"><div class="card-header"><div>
        <div class="card-title">Temperature vs Power</div>
        <div class="card-subtitle">Coloured by season</div>
      </div></div><div class="chart-wrap"><canvas id="wxPerfTempPowerChart"></canvas></div></div>
    </div>
    ${hasWind ? `<div class="card" style="margin-top:var(--gap-layout)"><div class="card-header"><div>
      <div class="card-title">Wind Speed vs Avg Speed</div>
      <div class="card-subtitle">Impact of wind on performance</div>
    </div></div><div class="chart-wrap"><canvas id="wxPerfWindSpeedChart"></canvas></div></div>` : ''}
    <div class="wxp-perf-legend">${legendHtml}</div>`;

  // Chart tooltip config
  const C_TOOLTIP = window.C_TOOLTIP || {};
  const C_TICK    = window.C_TICK || { color: '#62708a', font: { size: 10 } };
  const C_GRID    = window.C_GRID || { color: 'rgba(255,255,255,0.04)' };

  const scatterOpts = (xLbl, yLbl) => ({
    responsive: true, maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...C_TOOLTIP,
        callbacks: {
          title: items => items[0].raw.name,
          label: ctx => `${ctx.raw.date} — ${ctx.parsed.x} ${xLbl}, ${ctx.parsed.y} ${yLbl}`,
        }
      }
    },
    scales: {
      x: { grid: C_GRID, ticks: C_TICK, title: { display: true, text: xLbl, color: '#62708a', font: { size: 10 } } },
      y: { grid: C_GRID, ticks: C_TICK, title: { display: true, text: yLbl, color: '#62708a', font: { size: 10 } } },
    }
  });

  const Chart = window.Chart;
  if (!Chart) return;

  const tsDs = buildDS(tempSpeedData);
  if (tsDs.length) {
    window._wxPerfTempSpeedChart = destroyChart(window._wxPerfTempSpeedChart);
    window._wxPerfTempSpeedChart = new Chart(
      document.getElementById('wxPerfTempSpeedChart').getContext('2d'),
      { type: 'scatter', data: { datasets: tsDs }, options: scatterOpts(tempUnit, spdUnit) }
    );
  }

  const tpDs = buildDS(tempPowerData);
  if (tpDs.length) {
    window._wxPerfTempPowerChart = destroyChart(window._wxPerfTempPowerChart);
    window._wxPerfTempPowerChart = new Chart(
      document.getElementById('wxPerfTempPowerChart').getContext('2d'),
      { type: 'scatter', data: { datasets: tpDs }, options: scatterOpts(tempUnit, 'W') }
    );
  }

  const wsDs = buildDS(windSpeedData);
  if (wsDs.length) {
    window._wxPerfWindSpeedChart = destroyChart(window._wxPerfWindSpeedChart);
    window._wxPerfWindSpeedChart = new Chart(
      document.getElementById('wxPerfWindSpeedChart').getContext('2d'),
      { type: 'scatter', data: { datasets: wsDs }, options: scatterOpts(spdUnit + ' (wind)', spdUnit) }
    );
  }
}

