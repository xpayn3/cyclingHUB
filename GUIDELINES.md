# CycleIQ — Development Guidelines & Design System Reference

## Architecture

- **Stack**: Single-page vanilla JS app (no framework)
- **Files**: `index.html`, `app.js`, `styles.css`, `sw.js`, plus JS modules in `js/`
- **CSS**: Uses `@layer` cascade ordering (base, tokens, layout, components, pages, utilities, themes)
- **Data source**: intervals.icu API
- **Storage**: All gear/battery/tire/service data in localStorage
- **PWA**: Service worker with app shell + map tile cache

## Design Tokens (`:root` in styles.css)

| Token | Value | Usage |
|-------|-------|-------|
| `--accent` | `#00e5a0` | Brand green, primary accent |
| `--red` | `#FF453A` | iOS system red |
| `--bg-card` | `rgba(255,255,255,0.04)` | Card backgrounds |
| `--surface-1` | `rgba(255,255,255,0.06)` | Elevated surface |
| `--surface-2` | `rgba(255,255,255,0.1)` | Higher elevation |
| `--text-primary` | `#ffffff` | Primary text |
| `--text-muted` | `rgba(255,255,255,0.55)` | Secondary text |
| `--text-faint` | `rgba(255,255,255,0.25)` | Tertiary/disabled |
| `--radius` | `16px` | Standard border radius |
| `--radius-sm` | `8px` | Small radius |
| `--pad-card` | `16px` | Card inner padding |
| `--pad-page` | `16px` | Page horizontal padding |
| `--gap-layout` | `16px` | Gap between dashboard sections |
| `--font-num` | `'Space Grotesk', monospace` | Numeric/data font |

## Color System

### Zone Colors (Power)
| Zone | Color |
|------|-------|
| Z1 Recovery | `#4a9eff` |
| Z2 Endurance | `#00e5a0` |
| Z3 Tempo | `#f0c429` |
| Z4 Threshold | `#ff9500` |
| Z5 VO2max | `#ff453a` |
| Z6 Anaerobic | `#af52de` |

### Stream/Metric Colors
| Metric | Color |
|--------|-------|
| Power | `#00e5a0` (accent) |
| Heart Rate | `#ff6b35` |
| Cadence | `#4a9eff` |
| Speed | `#f0c429` |
| Elevation | `#9b59ff` |
| Temperature | `#ff9500` |

### Achievement Colors
| Achievement | Color |
|-------------|-------|
| PR (Personal Record) | `#f0c429` (gold) |
| LTHR | `#9b59ff` (purple) |
| FTP | `#00e5a0` (green) |
| Climbing | `#ff6b35` (orange) |

### Comparison/Delta Colors
| State | Color |
|-------|-------|
| Up/Better | `var(--accent)` / `#22c55e` |
| Down/Worse | `var(--red)` / `#ff453a` |
| Neutral | `var(--text-muted)` |
| Warning | `#ffcc00` |

## Typography

- **Font**: Inter (primary), Space Grotesk (numbers)
- **Scale**: iOS Dynamic Type (11px–34px)
- **Touch targets**: 44px minimum on all interactive elements
- **Body text**: 16px minimum on mobile (avoids iOS auto-zoom)

## Component Patterns

### Cards
- Borderless, iOS grouped-list style
- `background: var(--bg-card)` or transparent
- `border-radius: var(--radius)` (16px)
- No borders/strokes around cards

### Sheets/Modals
- iOS sheet style with drag indicator
- Use `_openOverlaySheet(id)` / `_closeOverlaySheet(id)` helpers
- Body scroll lock: `overflow: hidden` on html+body, NOT `position: fixed`
- Sheet scroll containment: `overflow-y: auto` + `overscroll-behavior: contain`
- Background scroll prevention: touchmove handler on overlay backdrop

### Tooltips (Chart.js)
- External tooltip handler (`externalTooltipHandler`)
- Background color matches the dataset's line/bar color
- Text color: black on colored backgrounds
- No dot indicators (color is in the background)
- Border radius: 6px
- Values stack vertically (each on its own line via `<br>`)
- Position: bottom of chart area, not floating
- Hide on scroll via `_tooltipScrollHide`

### Horizontal Scrubber Input
- Used for: calendar event metrics, goal targets, workout builder, tire pressure
- `touch-action: pan-y` (browser handles vertical, JS handles horizontal)
- 10px horizontal threshold before committing to drag
- `pointerdown` → pending → `pointermove` threshold → dragging → `pointerup`
- History stack for undo (per-drag, not per-tick)
- Color-coded values (TSS: green→yellow→orange→red)

### Dropdowns
- Always use `<select class="app-select">`, never `<datalist>`

### Horizontal Scroll Carousels
- Per-card margins, NOT container padding
- `scroll-snap-type: x mandatory`
- `scrollbar-width: none` / `::-webkit-scrollbar { display: none }`

## Chart.js Conventions

### Global Config Object: `C_TOOLTIP`
- All charts MUST use `...C_TOOLTIP` in their tooltip config
- External tooltip handler positions tooltip at chart top edge
- Colored background matching dataset color

### Axis Labels
- Y-axis: show unit name at position 0 (e.g., "W", "rpm", "BPM"), plain numbers elsewhere
- X-axis: no unit suffix on every tick, round to whole numbers
- Grid: `rgba(255,255,255,0.06)` — subtle but visible
- No decimals on any axis ticks (use `Math.round`)

### Crosshair
- Vertical line at hovered x position
- Color: white at 90% opacity (default) or dataset-specific

### "Data Not Available" State
- Show faded wave canvas with overlay text
- Don't hide the card — user should see what data is missing
- In info subpage: show what sensor/device is needed

## Activity Page Patterns

### Card Headers
- Title + info button in same flex row: `display: flex; align-items: center; gap: 8px`
- Info button: `.act-card-info-btn` — 28x28 circle, right-aligned via `margin-left: auto`
- Subtitles: hidden (`display: none`), data shown in summary rows below chart instead

### Card Dividers
- Injected via `_injectActCardDividers()` after render
- `<div class="act-card-divider">` — 1px line at `rgba(255,255,255,0.06)`
- Between adjacent `.card` elements only

### Info Subpages (More Info)
- Activity Data (`detailStreamsCard`): unique layout with per-metric breakdown charts + elevation ghost layer
- Power/HR Zones: donut chart + zone rows + training style + guide section
- Other cards: cloned chart + summary stats + guide section
- Guide section: grey background (`rgba(255,255,255,0.06)`), full-width, extends to bottom

### Summary Rows Below Charts
- `.detail-zone-summary` container
- `.detail-zone-summary-row` — flex row, label left, value right
- Font: 14px, weight 500 for labels, 600 for values

## Dashboard Widget System

- Each section has `data-dash-section="id"` attribute
- Widget order saved in `localStorage('icu_widget_order')`
- Hidden widgets saved in `localStorage('icu_widget_hidden')`
- Hidden class: `.widget-hidden { display: none !important }`
- Reorder via drag-and-drop in widget editor
- Settings > General > Dashboard Widgets → subpage
- Home page "Edit Widgets" button → sheet overlay

## Battery Optimization

- `visibilitychange` listener pauses all work when tab hidden:
  - Vitality WebGL RAF loop stops
  - Weather radar timer cleared
  - CSS animations paused via `.tab-hidden` class
  - Everything resumes on tab visible
- No `watchPosition` — only one-shot `getCurrentPosition`
- Charts lazy-loaded via IntersectionObserver
- Smart polling has visibility gate

## Gear/Component System

### Image Fallbacks
- `_GEAR_CATEGORY_IMAGES` maps category names to default images
- `onerror` on `<img>` falls back to category image via `_gearImgFallback()`
- Images stored in `img/components/categories/` and `img/components/sram/`

### Battery System
- Rechargeable (SRAM AXS): hourly drain model
- Coin cell (CR2032): monthly decay model
- Undo last charge: `undoChargeBattery()` restores previous state
- Battery detail sheet with segmented gauge (5 bars)

### Tire Pressure Calculator
- Three models: SRAM/Zipp, Silca, Berto
- Inputs: weight, width, surface, tubeless toggle
- Front/rear split: 45/55 weight distribution

## iOS/Mobile Edge Cases

### Keyboard Black Bar Fix (CRITICAL)
**Problem:** On iOS Safari PWA, opening the virtual keyboard while a sheet/modal is open causes a persistent black bar at the bottom. The bar stays even after the keyboard closes.

**Root Cause:** Using `body { position: fixed; top: -scrollY }` for scroll-locking creates a new CSS formatting context. iOS Safari repositions fixed children (the sheet) incorrectly when the keyboard animates.

**The ONLY working fix:**
```javascript
// CORRECT — overflow lock only, NO position:fixed
document.documentElement.style.overflow = 'hidden';
document.body.style.overflow = 'hidden';

// On close — just clear them
document.documentElement.style.overflow = '';
document.body.style.overflow = '';
```

**Rules:**
- NEVER use `position: fixed` on `<body>` for scroll-lock
- NEVER use `top: -scrollY` trick on body
- NEVER use `width: 100%` + `position: fixed` on body
- Both `_lockSheetScroll()` and `_openOverlaySheet()` must use overflow-only
- This SPA never scrolls at body level, so no scroll position save/restore needed

### Sheet Scroll Containment (CRITICAL)
**Problem:** Background page scrolls when user drags inside a slide-in sheet on iOS.

**Root Cause:** `overflow: hidden` on a sheet kills its scroll container behavior, so `overscroll-behavior: contain` has no effect and touch events pass through.

**The fix:**
- NEVER set `overflow: hidden` on `.wxd-sheet` or any slide-in sheet
- ALWAYS use `overflow-y: auto` + `overscroll-behavior: contain` on the scrollable sheet element
- The `.wxd-overlay` container should also have `overscroll-behavior: contain`
- Reference the profile sheet (`.prof-scroll`) as the gold standard
- For goal/calendar sheets: add touchmove handler on overlay backdrop that calls `e.preventDefault()`

### Sheet Background Scroll Lock
**Problem:** Even with `overflow: hidden` on body, iOS Safari still scrolls the page behind sheets.

**Fix:** Add touchmove prevention on the overlay element:
```javascript
sheet.addEventListener('touchmove', e => {
  const panel = sheet.querySelector('.wxd-sheet');
  if (panel && !panel.contains(e.target)) e.preventDefault();
}, { passive: false });
```
Also add `e.preventDefault()` on the backdrop's touchmove.

### Scrubber Scroll Lock
**Problem:** Horizontal drag scrubbers accidentally trigger page scroll, especially on iOS.

**Fix:**
- Use `touch-action: pan-y` (let browser handle vertical, JS handles horizontal)
- Add 10px horizontal movement threshold before committing to drag
- During pending state, check if `abs(dx) > threshold` before `setPointerCapture`
- If vertical movement wins first, let it scroll (browser sends `pointercancel`)
- `touchmove` handler: only `e.preventDefault()` when `dragging === true`, NOT during `pending`
- Keep `lockScroll` flag true until `touchend` (not `pointerup`) to prevent late scroll leaks

### Touch Scrubber Direction
- Delta is NEGATED: `applyStep(dragStartStep - delta / PX_PER_STEP)`
- Drag left = ruler moves left = bigger values come into view
- This feels natural like panning a number line

### Safe Areas
- Use `env(safe-area-inset-*)` for all fixed elements
- Bottom nav: `padding-bottom: env(safe-area-inset-bottom)`
- Sheets: `padding-bottom: env(safe-area-inset-bottom, 20px)`
- Top bar: `padding-top: env(safe-area-inset-top)`
- Keep primary touch targets away from notch, Dynamic Island, gesture bar

### PWA Cache Refresh
- iOS PWA caches aggressively — users may need to delete and re-add the app from Home Screen
- Always bump SW cache version (`icu-app-shell-vNNN`) on every deploy
- GitHub Pages can take 1-2 minutes to propagate changes
- If user reports stale content: tell them to force-close app, or unregister SW in DevTools

### iOS Input Zoom Prevention
- Inputs with `font-size < 16px` trigger iOS Safari auto-zoom on focus
- All form inputs must be `font-size: 16px` minimum
- Or use `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">`

### Bounce/Overscroll
- iOS Safari has rubber-band overscroll on the `<body>`
- Use `overscroll-behavior: none` on page containers to prevent
- But NOT on sheet bodies (they need `contain` for scroll containment)

## Service Worker

- Cache name: `icu-app-shell-vNNN` — bump on every deploy
- App shell files cached on install
- Map tiles cached separately with 3000-tile limit
- Navigation preload enabled for faster loads

## 3D Badge System (js/badges3d.js)

### Architecture
- **Three.js r134** lazy-loaded from CDN on first badge open
- **Shared WebGLRenderer** — `_getRenderer(THREE, canvasEl)` reuses one context
- **Cached env maps** — `_cachedRiderEnvTex` (studio), `_cachedBadgeEnvTexMap[colorHex]` (holo)
- Don't dispose env maps on card destroy — they're cached for reuse
- Don't dispose renderer on destroy — call `_releaseRenderer()` instead

### Badge Definitions (BADGE_PROCEDURAL)
- 28 badges: b1–b28 with `shape`, `color`, `accent`, `label`, `iconPath`, `holo`, optional `scene`
- Shapes: circle, shield, diamond, hexagon, star
- Holo patterns: flame, chevron, diamond, crown, bolt, ripple, grid, wave, frost, sunray, starburst

### Card Types
1. **Rider Card** (`initRiderCard3D`) — Profile info, parallax level number with glow shader
2. **Badge Card** (`initBadgeCard3D`) — Per-badge themed, holo shimmer, glitter sparkles, moving spotlight
3. **Portal Card** (b9 Half Year) — Mountain world rendered to RenderTarget, 7 depth layers, screen-space shader

### Materials
- Front: `MeshStandardMaterial` with metalnessMap (holo pattern), roughnessMap, envMap (rainbow bands)
- Back: `MeshStandardMaterial` with back texture
- Edge: `MeshStandardMaterial` chrome finish
- Glitter: `ShaderMaterial` with `AdditiveBlending`, hash-based sparkle grid, angle-dependent flash
- Portal: `ShaderMaterial` sampling `gl_FragCoord.xy / resolution` from RenderTarget

### Interaction Physics
- Trail-based velocity: last 6 pointer positions, filtered to 80ms window
- Velocity multiplier: 0.25 (px/ms → rotation/frame)
- Friction: 0.96 per frame
- Stop threshold: speed < 0.002
- Auto-spin: 0.006 rad/frame with tilt rocking
- Frame skip: every other frame during auto-spin (30fps), full 60fps on interact

### Intro Animation
- 0.5s duration, `easeOutBack` curve (slight overshoot)
- Start: rotY = ±108°, rotX = 0.3, rotZ = ±0.15, scale = 0.7
- End: rest position (rotX=0.06, rotY=0.08), scale = 1.0
- Auto-spin starts after intro completes

### Performance Rules
- DPR capped at 1.5 (not 2)
- Geometry: bevelSegments=3, curveSegments=16
- Lights: max 3 DirectionalLights (no SpotLights — too expensive)
- No MeshPhysicalMaterial (clearcoat shader compilation is 200-400ms)
- Frame skip during idle auto-spin

### Portal Effect (Half Year Card)
- Mountain layers in separate `THREE.Scene` at z=-14 to z=+0.5
- Rendered to `WebGLRenderTarget` each frame
- Portal plane on card face uses screen-space UV: `gl_FragCoord.xy / resolution`
- Camera parallax: shifts based on card tilt angle
- 7 layers: sky/stars/moon, aurora/clouds, far mountains, mid hills, trees, close framing trees, fireflies
- Text overlay with bottom gradient scrim

### Badge Preview (Grid Thumbnails)
- `renderBadgePreview(badgeId, name, desc, locked)` — returns data URL
- 200px wide, card aspect ratio, rounded corners
- Locked: greyscale + dark overlay + lock icon + "LOCKED" text
- Cached in `_previewCache` by `badgeId + locked`

## Goals & Streaks Page

### Layout
- `#goalsStreaksSection` — flex column with 24px gap
- Hero streak cards (3-column grid, 2+1 on mobile)
- PB cards: 2-column grid, minimal row layout (icon + value/label)
- Year overview: page-headline + months grid (no wrapping card)
- Achievements: first 6 earned + "View all" button → achievement subpage
- Lifetime stats: vertical list, show 5 + "Show all" expand button
- Dark gradient on body: `linear-gradient(#000 → #060606 → #000)` via `.goals-bg`

### Achievement Subpage
- Opens via `_openAchievementsPage()` in full-screen universal sheet
- Two sections: Earned (full color) + Locked (greyscale)
- Tilt hover + glow effects attached after render

### Badge Viewer
- Mobile: bottom sheet via `_openUniSheet`, dark gradient background
- Desktop: floating dialog (`.badge-dialog-overlay`)
- Navigation: left/right arrows (desktop overlay, mobile inline with dots)
- Dark background: `linear-gradient(to bottom, #1a1a1a, #0a0a0a)`
- No scrollbar: `overflow: hidden` on sheet panel

## Build & Deploy

- **Source files**: edit `app.js`, `styles.css`, `index.html`, `js/*.js` directly
- **Production build**: `node build.js` → minifies into `docs/` folder
- **Deploy**: `bash deploy.sh "commit message"` — builds, copies assets, commits, pushes
- **GitHub Pages**: serves from `/docs` branch `main` (minified)
- **Local preview**: `npx http-server . -p 8080 -c-1 --host 0.0.0.0` — accessible on PC + iPhone at `http://192.168.0.111:8080` (same Wi-Fi)
- **Build script** (`build.js`): outputs to `docs/`, rewrites `import()` paths to `.min.js`, patches SW precache list
- **Never edit files in `docs/`** — they get overwritten by build

## Git Conventions

- "push and commit" or "pc" = stage, commit, push immediately, no approval needed
- Commit messages: imperative mood, concise
- Co-authored-by: Claude Opus 4.6
- Never use `--no-verify` or `--force`

## Common Gotchas & Lessons Learned

### Chart.js Tooltip Not Showing
- Charts inside info subpages or dynamically created containers need `C_TOOLTIP` with `external: externalTooltipHandler`
- The tooltip element (`#chartjs-tooltip`) is shared globally — only one exists
- Charts that use Chart.js default tooltip (no `external`) will show transparent/ugly tooltips

### Chart Axis Jumping/Deforming
- When toggling datasets on the streams chart, hidden axes still reserve space
- Fix: dynamically show/hide axes in `toggleStreamLayer` and call `chart.update('none')`
- Use `afterFit: axis => { axis.width = N }` to constrain axis width
- The streams chart was rewritten from scratch to fix persistent deformation issues

### Canvas Charts Not Appearing
- If a canvas is inside a `display: none` container when Chart.js initializes, the chart renders at 0x0
- Always ensure the container is visible before creating the chart
- Use `requestAnimationFrame` to delay chart creation if the container animates in

### Tooltips Not Disappearing on Scroll
- Chart.js tooltips stay visible when scrolling the page
- Fix: add scroll listener on the sheet/page that hides the tooltip element
- `_tooltipScrollHide` listens for scroll and sets tooltip opacity to 0

### Line Dividers Between Cards
- `::after` pseudo-elements and `border-bottom` approaches failed due to card backgrounds/overflow
- Working solution: inject actual `<div class="act-card-divider">` elements between cards via JS
- `_injectActCardDividers()` runs after all cards render (with 300ms delay for async cards)

### Numbers Formatting
- No decimals on chart axes — always `Math.round()`
- Cadence average from API (`average_cadence`) comes with 5 decimal places — must round
- Distance on elevation chart x-axis: use `Math.round()` not `.toFixed(3)`
- Speed values: 1 decimal place (e.g., "21.6 km/h")
- Power/HR/Cadence: whole numbers only

### Zone Percentage Rounding
- Zone percentages should show whole numbers (e.g., "27%" not "27.9%")
- Use `Math.round()` before display

### Power Curve Card Visibility
- `detailCurveCard` lives inside `detailCurvesRow` (a flex container)
- If both cards inside start hidden, the row collapses to 0 height
- The render function must show the row container too, not just the card

### Bike Photo Transparency
- Photos uploaded as JPEG lose transparency (black background)
- Must save as WebP: `canvas.toDataURL('image/webp', 0.85)`
- Background color picker sets `--bike-bg-color` CSS variable on the card

### localStorage Keys Naming
- All app keys prefixed with `icu_` (e.g., `icu_activities_cache`, `icu_gear_components`)
- Widget system: `icu_widget_order`, `icu_widget_hidden`
- Full backup export includes ALL `icu_*` keys

### Global Function Exposure
- Functions called from `onclick` in HTML must be on `window`
- Pattern: `window.myFunction = myFunction;` after function declaration
- Common mistake: function works in dev but not in production because it's module-scoped

### Pill Nav Bounce Animation
- Original: CSS class toggle + `void element.offsetWidth` forced reflow (low FPS)
- Fix: Web Animations API `element.animate()` — runs on compositor thread, no layout reflow
- Duration: 320ms, easing: `cubic-bezier(0.34, 1.56, 0.64, 1)`

### Map Tiles Not Loading
- MapLibre map inside a card that's `display: none` when initialized won't load tiles
- Call `map.resize()` after the container becomes visible
- Dashboard route map: init only when the card is in viewport

### Confirmation Sheets
- Use `_openOverlaySheet` system, not `confirm()` or custom dialogs
- iOS 26 SwiftUI style: rounded buttons, accent/destructive colors
- Always provide cancel option

## Data Export/Sync

- Full backup: all localStorage keys → JSON file
- PeerJS P2P sync: sends full backup JSON over WebRTC data channel
- Setup link: encodes athlete ID + API key + settings in URL hash
