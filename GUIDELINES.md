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
  - Dashboard RAF loops stop
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

## Performance Optimizations (Applied)

### Dashboard
- Above-fold content renders sync, below-fold widgets deferred to `_rIC()`
- 7 charts lazy-loaded via `lazyRenderChart()` (IntersectionObserver)
- `renderAllActivitiesList()` removed from dashboard render (was wrong page)
- Cross-page render guards: `renderDashboard()` only when `state.currentPage === 'dashboard'`

### Fitness Page
- 13 chart functions wrapped in `lazyRenderChart()` — only render on scroll
- Recovery, race predictor, acclimatization deferred to `_rIC()`

### Power Page
- 9 kJ charts deferred until collapse section opened (not rendered on page load)

### Calendar Page
- Only render desktop cards OR mobile dots (not both) — saves ~50% day cell nodes
- Prev/next month grids deferred until first swipe touch
- List view: infinite scroll — 30 days per batch, loads more on scroll

### Modals
- `gearModal` (~120 DOM nodes) and `batteryModal` (~40 nodes) lazy-created on first open
- Removed from initial HTML — saves ~160 DOM nodes on every page load

### 3D Cards
- Shared WebGLRenderer (one context reused)
- Cached env maps with LRU eviction (max 6)
- DPR capped at 1.5, geometry bevel 3/curve 16
- Frame skip: 30fps during auto-spin (after 3s grace), 60fps on interact
- CDN load timeout: 10s
- No MeshPhysicalMaterial (clearcoat shader too expensive)
- Max 4 DirectionalLights (no SpotLights)

### Removed Features
- Vitality Metaball Shader (738 lines, ~30KB) — was creating WebGL context + shader on every dashboard visit
- Biorhythm card + settings dialog (159 lines HTML)

### Build
- Production build (`node build.js`) minifies to `docs/`: 3.3MB → 2.1MB (38% smaller)
- GitHub Pages serves from `/docs` (minified)

## Data Export/Sync

- Full backup: all localStorage keys → JSON file
- PeerJS P2P sync: sends full backup JSON over WebRTC data channel
- Setup link: encodes athlete ID + API key + settings in URL hash

## Edge Cases & Gotchas

See `GUIDELINES-EDGE-CASES.md` for iOS/mobile fixes, robustness rules, and common gotchas.
