# CycleIQ UI Component Skill

Use this skill when building or fixing UI components in the CycleIQ cycling PWA. It contains all design tokens, component patterns, edge cases, and battle-tested fixes discovered during development.

## When to Use

Invoke this skill when:
- Building slide-in sheets, modals, or overlays
- Creating new cards, charts, or data displays
- Adding scrubber/slider inputs
- Fixing iOS/mobile scroll or touch issues
- Working with Chart.js tooltips or axes
- Building any new page or subpage

## Architecture

- **Stack**: Single-page vanilla JS app (no framework)
- **Files**: `index.html`, `app.js`, `styles.css`, `sw.js`, plus `js/*.js` modules
- **CSS**: `@layer` cascade ordering (base, tokens, layout, components, pages, utilities, themes)
- **Design tokens**: `:root` block in styles.css
- **Data source**: intervals.icu API
- **State**: `js/state.js` exports a global `state` object

## Design Tokens

```css
--bg-base: #000000;           /* Pure black background */
--bg-card: #1c1c1e;           /* iOS-style card surface */
--surface-1: #1c1c1e;         /* Primary surface */
--surface-2: #2c2c2e;         /* Secondary surface */
--accent: #00e5a0;            /* Brand green — preserved everywhere */
--text-primary: #ffffff;
--text-muted: rgba(255,255,255,0.55);
--text-faint: rgba(255,255,255,0.25);
--red: #ff453a;               /* iOS system red */
--radius: 16px;               /* Standard card radius */
--radius-sm: 8px;             /* Small elements */
--radius-sheet: 24px;         /* Sheet top corners */
--pad-card: 16px;             /* Card internal padding */
--pad-page: 16px;             /* Page horizontal padding */
--gap-layout: 16px;           /* Gap between sections */
--font-num: 'DM Sans', sans-serif;  /* Numeric/data font */
```

## Slide-in Sheets (Critical Edge Cases)

### Opening a Sheet
```javascript
_openOverlaySheet('sheetId');  // Handles body scroll lock, sheet stack, swipe-dismiss
```

### NEVER Do
- `position: fixed` on `<body>` for scroll lock — causes iOS keyboard black bar
- `overflow: hidden` on the sheet panel — use `overflow-y: auto` + `overscroll-behavior: contain`
- Forget to call `_closeOverlaySheet('sheetId')` when dismissing

### Sheet Scroll Lock (iOS Fix)
The sheet overlay handles background scroll prevention via:
```javascript
// In _openOverlaySheet — touchmove handler on overlay
sheet.addEventListener('touchmove', e => {
  const panel = sheet.querySelector('.wxd-sheet');
  if (panel && !panel.contains(e.target)) {
    e.preventDefault();  // Block backdrop scroll
  }
}, { passive: false });
```

### Sheet Body Scroll Containment
```css
.wxd-sheet-body {
  overflow-y: auto;
  overscroll-behavior: contain;  /* Prevents scroll chaining to page */
  -webkit-overflow-scrolling: touch;
}
```

### Partial vs Full-Screen Sheets
- `wxd-sheet--partial`: Bottom sheet, auto-height, max-width 480px
- Without `--partial`: Full-screen on mobile, 85vh modal on desktop
- Always add `overflow: hidden` on the sheet container (not body) if content shouldn't scroll

## Horizontal Scrubber Input

The scrubber component is used for duration, distance, TSS, weight, and workout builder inputs.

### Key Pattern
```
touch-action: pan-y     → Let browser handle vertical scroll
Horizontal threshold: 10px → Only start scrubbing after 10px horizontal movement
pointerdown: set pending, record startX/startY
pointermove: if pending && dx > 10px → commit to drag, setPointerCapture
touchmove: only preventDefault when dragging (not pending)
pointerup: push to history stack for undo
```

### NEVER Do
- `touch-action: none` globally — blocks page scroll through scrubber area
- `e.preventDefault()` on touchstart — prevents vertical scrolling
- Start changing values immediately on pointerdown — use 10px threshold

### Undo Support
Each scrubber maintains a history stack. On pointerup, if value changed, push `dragStartStep` to stack. Undo button pops from stack.

## Chart.js Conventions

### Tooltip System
All charts use the external tooltip handler `externalTooltipHandler`:
- Tooltip background = dataset's borderColor (solid, no transparency)
- Text color = black (#000) for contrast on colored backgrounds
- No dot indicator — tooltip color IS the indicator
- Border radius: 6px, no divider line between title and body
- Position: centered above chart area, touching the top edge
- Font: 13px body, 14px title

### Y-Axis Labels
- First tick (position 0): Show unit name ('W', 'BPM', 'rpm', 'kph', 'm')
- All other ticks: Just the number, no unit suffix
- No decimals on any axis labels — always `Math.round()`

### Grid Lines
```javascript
const C_GRID = { color: 'rgba(255,255,255,0.06)', drawBorder: false };
```

### Color Palette for Streams
```
Power:     #00e5a0 (accent green)
HR:        #ff6b35 (orange)
Cadence:   #4a9eff (blue)
Speed:     #f0c429 (yellow)
Elevation: #9b59ff (purple)
```

### Crosshair Line
Drawn by `crosshairLine` Chart.js plugin — 1.5px white line from top to bottom of chart area at the hovered x position.

## Activity Page Cards

### Card Header Pattern
```html
<div class="card-header">
  <div style="display:flex;align-items:center;gap:8px">
    <div class="card-title" style="flex:1 1 0%">
      <svg>...</svg> Title
    </div>
    <button class="act-card-info-btn">ⓘ</button>
  </div>
</div>
```

### Card Dividers
Injected via JS `_injectActCardDividers()` — adds `.act-card-divider` divs between visible cards.

### "Data Not Available" State
Cards with no data get class `card--na` and show a wave placeholder:
```javascript
_injectCardNA(card);  // Adds animated wave SVG + "Data not available" text
```
The info page for NA cards shows what hardware/sensors are needed.

### Zone Bars
- Left edge: sharp (border-radius: 0)
- Right edge: rounded (border-radius: 4px)
- No decimals on percentages — always `Math.round()`

## Info Subpages (More Info)

### Structure
```javascript
_openActCardInfo(cardId, info);  // Opens overlay with cloned chart + controls
```

### Custom Pages
Cards define `customRender` in `_ACT_CARD_INFO[cardId]`:
```javascript
_ACT_CARD_INFO.detailZonesCard.customRender = function(page, activity) {
  page.classList.add('aci-custom-page');
  // Build unique content
};
```

### Guide Section (Bottom)
Every info page gets an educational "How to Use This Data" section with:
- Lighter background (`rgba(255,255,255,0.06)`)
- iOS grouped inset card style for each topic
- Full-width (negative margins to go edge-to-edge)
- Absorbs bottom padding (no black gap at bottom)

## iOS-Specific Fixes

### Keyboard Black Bar
**Problem**: Setting `position: fixed` on `<body>` when a sheet is open causes iOS Safari to show a black bar below the keyboard.
**Fix**: Use `overflow: hidden` on both `<html>` and `<body>` — never `position: fixed`.

### Sheet Scroll Containment
**Problem**: `overflow: hidden` on slide-in sheets prevents internal scrolling.
**Fix**: Use `overflow-y: auto` + `overscroll-behavior: contain` on the sheet body.

### Touch Scrubber vs Page Scroll
**Problem**: Horizontal scrubbers capture touch and prevent page scrolling.
**Fix**: Use `touch-action: pan-y` + 10px horizontal threshold before committing to drag.

### PWA Cache Refresh
**Problem**: iOS PWA aggressively caches old service workers.
**Fix**: Bump `APP_CACHE` version in `sw.js` on every deploy. For stuck caches, user must delete and re-add the PWA from Home Screen.

## Widget System (Dashboard)

Dashboard sections are widgets with `data-dash-section` attribute:
```
summary, recentActivities, goalsTargets, quickLinks,
weather, batteryStatus
```

Widget order and visibility stored in `icu_dash_widgets` localStorage key.
`_applyWidgetOrder()` reorders DOM elements based on saved order.

## Performance Monitor

Toggle in Settings → Developer. Shows FPS, heap, DOM count, Chart.js instances, localStorage usage as floating overlay.

## File Organization

```
index.html          — All HTML (pages, modals, sheets, overlays)
app.js              — Main logic (~34k lines)
styles.css          — All CSS (~29k lines)
sw.js               — Service worker with cache versioning
js/state.js         — Global state object
js/weather.js       — Weather API + forecast rendering
js/routes.js        — Route builder
js/workout.js       — Workout builder
js/share.js         — Share/export
js/heatmap.js       — Activity heatmap
js/strava.js        — Strava integration
js/import.js        — Data import
GUIDELINES.md       — Full design system reference
```

## Common Patterns

### Navigation
```javascript
navigate('pageName');           // Switch to a page
navigateToActivity(actObj);     // Open activity detail
openSettingsSubpage('subpage');  // Settings sub-navigation
```

### Toast Notifications
```javascript
showToast('Message', 'success');  // success, error, info
```

### Confirmation Sheets
```javascript
_showConfirmSheet({
  title: 'Are you sure?',
  message: 'This cannot be undone.',
  confirmText: 'Delete',
  confirmClass: 'btn-danger',
  onConfirm: () => { /* action */ }
});
```

### Custom Dropdowns
```javascript
initCustomDropdowns(container);  // Initialize .cdd-wrap elements
```
Always use `<select class="app-select">` or custom dropdown — never `<datalist>`.

### Gear Component Images
Fallback chain: brand/model match → category image → generic SVG icon.
Category images in `img/components/categories/` (cassette.webp, chain.webp, etc.)
