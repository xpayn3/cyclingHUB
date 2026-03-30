# CycleIQ — Edge Cases, Gotchas & Platform Fixes

Only read this file when working on sheets, modals, iOS touch handling, Chart.js, or navigation cleanup.

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

## Robustness Rules

### navigateToActivity() bypasses navigate()
- It directly sets `state.currentPage = 'activity'` without calling `navigate()`
- MUST call `cleanupPageCharts()` + `_cleanupPageDOM()` at the start (wrapped in try-catch)
- All `setTimeout` callbacks inside MUST check `if (state.currentPage !== 'activity') return`

### Async Callbacks After Navigation
- Any `.then()` or `await` callback that touches DOM MUST check `state.currentPage` first
- Use `element.isConnected` to verify DOM elements aren't detached
- `fetchCalendarEvents().then()` must guard with `if (state.currentPage === 'calendar')`

### 3D Destroy Safety
- Every `.dispose()` call wrapped in individual try-catch
- RAF loops: check null BEFORE `requestAnimationFrame()`, not after
- All event listeners use AbortController signals, aborted on destroy
- `webglcontextlost` handler stops all RAF loops

### DOM Cleanup on Navigate
- `cleanupPageCharts()`: destroys Chart.js instances + clears lazy observer
- `_cleanupPageDOM()`: strips innerHTML of heavy containers (NOT canvases)
- Never clear fitness page canvases — they're reused on revisit
- Calendar list view cleared on navigate away

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
