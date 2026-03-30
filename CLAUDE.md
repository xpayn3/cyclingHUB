# CycleIQ — Cycling Analytics PWA

Vanilla JS single-page app pulling data from intervals.icu. No frameworks.

## Quick Reference

- **Design system, coding patterns, conventions**: see `GUIDELINES.md`
- **iOS/mobile edge cases, common gotchas**: see `GUIDELINES-EDGE-CASES.md`
- **Feature list**: see `FEATURES.md`
- **Build & deploy**: see `GUIDELINES.md` → "Build & Deploy"
- When designing new cards, card sections or graphs, always reference existing design cues of already designed components.

## Architecture

| File | Lines | Role |
|------|-------|------|
| `index.html` | ~6,100 | DOM skeleton for 22 pages, modals, sheets, toasts |
| `app.js` | ~42,100 | Navigation, rendering, state, API calls, UI interactions |
| `styles.css` | ~32,100 | Design system: @layer cascade, 150+ tokens, themes |
| `sw.js` | ~160 | Service Worker: app shell (network-first) + map tiles (cache-first) |
| `js/state.js` | ~100 | Shared state object, constants, API endpoints, `_app` proxy |
| `js/badges3d.js` | ~2,900 | Three.js 3D cards: shared renderer, env maps, portal, glitter |
| `js/weather.js` | ~2,500 | Weather page, forecast, radar |
| `js/routes.js` | ~4,400 | Route Builder: MapLibre 3D maps, elevation, GPX/FIT export |
| `js/workout.js` | ~1,800 | Workout Builder: intervals, .zwo export, theme/font settings |
| `js/heatmap.js` | ~1,600 | Heatmap overlay, route clustering, IndexedDB |
| `js/import.js` | ~650 | FIT file importer, Garmin/Wahoo parsing |
| `js/strava.js` | ~650 | Strava OAuth + sync, IndexedDB stream cache |
| `js/share.js` | ~560 | Share cards, canvas screenshot, social URLs |
| `js/pro-analysis.js` | ~2,300 | Power curves, HR zones, decouple, metabolic data |

## Key Patterns

- **`navigate(page)`** — Page router, handles cleanup/render/scroll/FABs
- **`_pageListener(el, event, fn)`** — Auto-remove listeners on navigate
- **`_pageChartKeys`** — Map page→chart keys for auto-destroy
- **`_openUniSheet(opts)`** — Universal reusable modal sheet
- **`showToast(msg, type)`** — Toast notifications
- **`_app('funcName')`** — Lazy proxy to window functions (avoids circular imports)
- **`C_TOOLTIP`** — Global Chart.js tooltip config (MUST use in all charts)
