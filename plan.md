# Modernization Plan — All 5 Points

## 1. Split app.js into ES Modules

**Strategy:** Create `js/` folder with focused modules. Convert `app.js` to `<script type="module">` entry point that imports everything and exposes onclick-referenced functions to `window`.

### Module structure:
```
js/
├── state.js            — state object, constants (GREETINGS, ICU_BASE, etc.)
├── utils.js            — safeMax, safeMin, fmtBytes, _rIC, unit formatting
├── api.js              — icuFetch, fetchAthleteProfile, fetchActivities, fetchFitness, authHeader
├── storage.js          — credentials, caches (activity, fitness, lifetime), storage mgmt, IDB helpers
├── ui.js               — dropdowns, toasts, sidebar, theme, glow, tilt, avatar
├── charts.js           — destroyChart, lazyRenderChart, cleanupPageCharts, CHART_COLORS, CHART_STYLES
├── router.js           — navigate(), page swap, view transitions, swipe/gesture
├── sync.js             — syncData, disconnect, smart polling, rate limiting, offline sync
├── dashboard.js        — renderDashboard, week progress, training status, power curve card, zone card
├── fitness.js          — renderFitnessPage, best distances, recovery, race predictor
├── power.js            — renderPowerPage, power curve analysis
├── activities.js       — activity list, sorting, filtering, virtual scroll
├── activity-detail.js  — renderActivity, activity map, flythrough, detail cards, FIT parser
├── calendar.js         — renderCalendar, month nav, event rendering
├── weather.js          — weather forecast fetch/render, weather page, day detail
├── share.js            — share modal, shareRender, format/style/color selection
├── routes.js           — route builder (map, waypoints, routing, elevation, export)
├── heatmap.js          — heatmap page, IDB caching
├── workout.js          — workout builder page
├── settings.js         — settings page, section toggles, units, weather locations
├── strava.js           — Strava OAuth, activity sync, stream cache
├── import.js           — FIT file import page, offline sync UI
├── modals.js           — connect modal, gear/battery/service modals, export helper
├── compare.js          — re-export from compare-functions.js
├── zones.js            — zones page rendering
```

### How it works:
- `app.js` becomes the entry: imports all modules, calls `init()`, exposes ~100 onclick functions to `window`
- `<script src="app.js" defer>` → `<script type="module" src="app.js">`
- Modules are deferred by default, so load order is preserved
- Each module imports what it needs from other modules (state, api, charts, etc.)
- The shared `state` object lives in state.js and is imported everywhere

### onclick exposure pattern:
```js
// app.js (entry)
import { navigate } from './js/router.js';
import { handleConnect } from './js/modals.js';
// ...
window.navigate = navigate;
window.handleConnect = handleConnect;
// etc for all ~100 onclick-referenced functions
```

## 2. CSS Container Queries

Add `container-type: inline-size` to `.card` so child elements respond to the card's own width instead of viewport width.

**Changes:**
- `.card { container-type: inline-size; }`
- Convert key media queries inside cards to `@container` queries
- Focus on: KPI grids, stat rows, chart layouts that currently use `@media (max-width: 900px)` etc.
- Cards with `auto-fill` minmax() grids mostly self-adapt already — focus on the fixed `repeat(N, 1fr)` grids

## 3. Native `<dialog>` Elements

Convert all 8 modals from `div.modal-backdrop` → `<dialog>`.

**Changes per modal:**
- `<div class="modal-backdrop" id="connectModal">` → `<dialog class="modal-dialog" id="connectModal">`
- Remove outer backdrop div (dialog provides `::backdrop` natively)
- CSS: `dialog::backdrop { background: rgba(0,0,0,0.75); }` replaces `.modal-backdrop` styles
- JS: `el.showModal()` / `el.close()` replaces classList toggle
- Free: Escape key closing, focus trapping, backdrop click (with `click` handler on dialog itself)
- Keep `.modal` inner div for existing card styling

**Modals to convert:**
1. connectModal
2. gearModal
3. batteryModal
4. serviceModal
5. serviceShopModal
6. serviceHistoryModal
7. exportHelperModal
8. shareModal

## 4. CSS @layer

Wrap all CSS in cascade layers for clear specificity ordering.

```css
@layer base, tokens, layout, components, pages, utilities, themes;
```

- `base` — reset, scrollbar hiding, touch-action
- `tokens` — :root custom properties
- `layout` — sidebar, main, topbar, page structure
- `components` — card, button, modal, dropdown, toast, badge, form inputs
- `pages` — dashboard, fitness, power, calendar, activity, weather, routes, etc.
- `utilities` — .dash-hidden, .act-hidden, .visually-hidden, etc.
- `themes` — [data-theme="light"] overrides

This means utilities always win over components without needing `!important`.

## 5. CSS Subgrid

Add subgrid to `.card-row` so cards in the same row align their headers and content areas.

**Changes:**
- `.card-row > .card { display: grid; grid-template-rows: subgrid; grid-row: span 2; }`
- This aligns card-header rows across cards in the same grid row
- Focus on: `.card-row` (2-col), `.fit-card-flex` parent grids, KPI card grids
- Only where cards have consistent internal structure (header + content)
