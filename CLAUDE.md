# CycleIQ — Cycling Analytics PWA

Vanilla JS single-page app pulling data from intervals.icu. No frameworks.

## Quick Reference

- **Design system, coding patterns, edge cases**: see `GUIDELINES.md`
- **Feature list**: see `FEATURES.md`
- When designing new cards, card sections or graphs, always reference existing design cues of already designed components.

## Architecture

| File | Lines | Role |
|------|-------|------|
| `index.html` | ~6,500 | DOM skeleton for 22 pages, modals, sheets, toasts |
| `app.js` | ~41,000 | Navigation, rendering, state, API calls, UI interactions |
| `styles.css` | ~31,500 | Design system: @layer cascade, 150+ tokens, themes |
| `sw.js` | ~160 | Service Worker: app shell (network-first) + map tiles (cache-first) |
| `js/state.js` | ~100 | Shared state object, constants, API endpoints, `_app` proxy |
| `js/badges3d.js` | ~2,400 | Three.js 3D cards: shared renderer, cached env maps, portal effect, glitter shader |
| `js/weather.js` | ~4,000 | Weather page, forecast, radar |
| `js/routes.js` | ~6,000 | Route Builder: MapLibre 3D maps, elevation, GPX/FIT export |
| `js/workout.js` | ~2,000 | Workout Builder: intervals, .zwo export, theme/font settings |
| `js/heatmap.js` | ~1,800 | Heatmap overlay, route clustering, IndexedDB |
| `js/import.js` | ~900 | FIT file importer, Garmin/Wahoo parsing |
| `js/strava.js` | ~900 | Strava OAuth + sync, IndexedDB stream cache |
| `js/share.js` | ~600 | Share cards, canvas screenshot, social URLs |
| `js/pro-analysis.js` | ~2,600 | Power curves, HR zones, decouple, metabolic data |

## Key Patterns

- **`navigate(page)`** — Page router, handles cleanup/render/scroll/FABs
- **`_pageListener(el, event, fn)`** — Auto-remove listeners on navigate
- **`_pageChartKeys`** — Map page→chart keys for auto-destroy
- **`_openUniSheet(opts)`** — Universal reusable modal sheet
- **`showToast(msg, type)`** — Toast notifications
- **`_app('funcName')`** — Lazy proxy to window functions (avoids circular imports)
- **`C_TOOLTIP`** — Global Chart.js tooltip config (MUST use in all charts)

## 3D Card System (Three.js r150)

- Lazy-loaded from CDN on first badge open
- **Shared WebGLRenderer** — one context reused across rider + badge cards
- **Cached env maps** — rider (studio lighting) and badge (rainbow holo, per-color)
- **28 achievement badges** with procedural geometry, PBR materials, unique holo patterns
- **Rider card** — profile info, parallax level number, glow halo shader
- **Badge cards** — holo shimmer (env map UV offset sweep), moving spotlight, glitter sparkle shader (additive blending)
- **Half Year portal** — mountain world rendered to RenderTarget, screen-space sampling shader, 7 parallax depth layers (sky→aurora→mountains→hills→trees→close trees→fireflies)
- **Intro animation** — 0.5s easeOutBack flip-in from 108° with scale 0.7→1.0
- **Interaction** — trail-based velocity tracking, 0.96 friction, auto-spin at 30fps, 60fps on drag

## Storage

- **localStorage** (`icu_*` prefix) — credentials, caches, goals, gear, settings (8MB limit)
- **IndexedDB** — heatmap routes, activity streams, Strava streams
- **sessionStorage** — route state for back navigation

## CDN Dependencies

Chart.js 4.4, MapLibre GL 5.1, Three.js r150, Leaflet 1.9, Hammer.js, PeerJS, jsQR

## Deployment

GitHub Pages + Service Worker versioning (`icu-app-shell-vNNN`). Bump SW version on every deploy.
