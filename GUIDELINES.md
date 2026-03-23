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

### Keyboard Black Bar Fix
- NEVER use `position: fixed` on body for scroll-lock
- Always use `overflow: hidden` only

### Sheet Scroll Containment
- NEVER use `overflow: hidden` on slide-in sheets
- Use `overflow-y: auto` + `overscroll-behavior: contain`

### Touch Scrubber Direction
- Delta is NEGATED: `applyStep(dragStartStep - delta / PX_PER_STEP)`
- Drag left = increase value (like scrolling a number line)

### Safe Areas
- Use `env(safe-area-inset-*)` for all fixed elements
- Bottom nav accounts for gesture bar
- Sheets add `padding-bottom: env(safe-area-inset-bottom)`

## Service Worker

- Cache name: `icu-app-shell-vNNN` — bump on every deploy
- App shell files cached on install
- Map tiles cached separately with 3000-tile limit
- Navigation preload enabled for faster loads

## Git Conventions

- Only push when user explicitly says to
- "push and commit" = stage, commit, push in one go
- Commit messages: imperative mood, concise
- Co-authored-by: Claude Opus 4.6
- Never use `--no-verify` or `--force`

## Data Export/Sync

- Full backup: all localStorage keys → JSON file
- PeerJS P2P sync: sends full backup JSON over WebRTC data channel
- Setup link: encodes athlete ID + API key + settings in URL hash
