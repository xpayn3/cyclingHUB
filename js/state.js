/* ====================================================
   STATE — shared application state & constants
   All modules import from here.
==================================================== */
export const state = {
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
  fitFatigueChart: null,
  fitFtpHistChart: null,
  fitPeriodChart: null,
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
  weekStartDay: 1,
  efSparkChart: null,
  calMonth: null,
  calSelectedDate: null,
  currentPage: 'dashboard',
  previousPage: null,
  synced: false,
  activitiesSort: 'date',
  activitiesSortDir: 'desc',
  activitiesYear: new Date().getFullYear(),
  activitiesSportFilter: 'all',
  activitiesSearch: '',
  activitiesView: 'list',
  flythrough: null,
  weatherPageData: null,
  weatherPageMeta: null,
  lifetimeActivities: null,
  lifetimeLastSync: null,
  _lifetimeSyncDone: false,
};

export const ICU_BASE = 'https://intervals.icu/api/v1';
export const STRAVA_API_BASE  = '/strava-internal/';
export const STRAVA_AUTH_BASE = '/strava-auth/';
export const STRAVA_AUTH_URL  = 'https://www.strava.com/oauth/authorize';
export const STORAGE_LIMIT = 8 * 1024 * 1024;

export function safeMax(arr) { let m = -Infinity; for (let i = 0; i < arr.length; i++) if (arr[i] > m) m = arr[i]; return m; }
export function safeMin(arr) { let m = Infinity;  for (let i = 0; i < arr.length; i++) if (arr[i] < m) m = arr[i]; return m; }

export const _rIC = window.requestIdleCallback
  ? (fn, ms) => requestIdleCallback(fn, { timeout: ms || 2000 })
  : (fn, ms) => setTimeout(fn, 0);

export const GREETINGS = [
  "Welcome back!",
  "Good to see you! Let's ride.",
  "Ready to crush it today?",
  "Keep up the great work!",
  "Your progress is looking great.",
  "Every ride counts. Let's go!",
  "You're on a roll — keep it up!",
  "Another day, another ride.",
  "Stay consistent, stay strong.",
  "Great athletes review their data.",
  "You've got this. One pedal at a time.",
  "Champions train even when it's hard.",
  "Your legs are stronger than you think.",
  "Pain is temporary. Fitness is forever.",
  "Looking strong — keep pushing forward!",
];
