# Slide-in Sheet Component

Build slide-in bottom sheets for the CycleIQ app. This skill contains the complete implementation pattern, all edge cases, and every iOS fix discovered during development.

## When to Use

Invoke when:
- Creating any new slide-in sheet/modal/overlay
- Fixing sheet scroll issues (background leaking, content not scrolling)
- iOS keyboard causing black bar or layout shift
- Sheet not dismissing properly
- Touch events passing through to background

## Quick Start — New Sheet

### 1. HTML (in index.html)

```html
<!-- Add inside <main> but outside any page div -->
<div class="wxd-overlay" id="mySheetOverlay" style="display:none">
    <div class="wxd-backdrop" onclick="_closeOverlaySheet('mySheetOverlay')"></div>
    <div class="wxd-sheet wxd-sheet--partial" style="max-width:480px">
        <div class="modal-drag-indicator"></div>
        <div class="modal-header">
            <div class="modal-title">Sheet Title</div>
            <button class="modal-close" onclick="_closeOverlaySheet('mySheetOverlay')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
        <div class="wxd-sheet-body">
            <!-- Your content here -->
        </div>
    </div>
</div>
```

### 2. JS (open/close)

```javascript
function openMySheet() {
    _openOverlaySheet('mySheetOverlay');
}

function closeMySheet() {
    _closeOverlaySheet('mySheetOverlay');
}
```

That's it. `_openOverlaySheet` handles:
- Body scroll lock
- Sheet stack management (nested sheets)
- Swipe-to-dismiss
- Background scroll prevention on iOS
- Keyboard avoidance on mobile
- Animation (slide up 0.35s cubic-bezier)

## Sheet Variants

### Partial Sheet (Bottom card)
```html
<div class="wxd-sheet wxd-sheet--partial" style="max-width:480px">
```
- Auto-height based on content
- Rounded top corners (24px radius)
- Max-width 480px, centered on desktop
- Does NOT go full screen on mobile

### Full-Screen Sheet (Mobile)
```html
<div class="wxd-sheet">
```
- Full screen on mobile (<600px)
- 85vh modal with flex layout on desktop
- Sheet itself becomes the scroll container on mobile
- Modal body becomes scroll container on desktop

### Non-Scrollable Sheet
Add `overflow: hidden` on the sheet element:
```html
<div class="wxd-sheet wxd-sheet--partial" style="max-width:480px;overflow:hidden">
```
Use when all content fits without scrolling (e.g., goal edit form).

## Critical Rules — NEVER Break These

### Rule 1: NEVER use `position: fixed` on `<body>` for scroll lock

**Why**: iOS Safari creates a formatting context that mispositions fixed children during keyboard events. Results in a black bar below the keyboard.

**Correct approach**:
```javascript
// In _openOverlaySheet (already implemented):
document.documentElement.style.overflow = 'hidden';
document.body.style.overflow = 'hidden';
document.body.classList.add('sheet-locked');
```

### Rule 2: NEVER use `overflow: hidden` on the sheet panel for scroll containment

**Why**: Prevents internal content from scrolling at all.

**Correct approach**:
```css
.wxd-sheet-body {
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
}
```

### Rule 3: Background scroll prevention requires touchmove handler

**Why**: `overflow: hidden` on body doesn't prevent scroll on iOS Safari. The sheet overlay needs an explicit touchmove handler.

**Implementation** (already in `_openOverlaySheet`):
```javascript
sheet.addEventListener('touchmove', e => {
    const panel = sheet.querySelector('.wxd-sheet');
    if (panel && !panel.contains(e.target)) {
        e.preventDefault(); // Block backdrop scroll
    }
}, { passive: false });

const backdrop = sheet.querySelector('.wxd-backdrop');
if (backdrop) {
    backdrop.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
}
```

### Rule 4: Page content needs touch-action: none when sheet is open

```css
body.sheet-locked .page-content {
    overflow: hidden !important;
    touch-action: none;
}
```

### Rule 5: Horizontal scrubbers inside sheets need special touch handling

If the sheet contains horizontal scrubbers (drag inputs):
```javascript
// On the scrubber element:
scrubber.style.setProperty('touch-action', 'pan-y', 'important');

// touchmove handler — only preventDefault when DRAGGING (not pending):
scrubber.addEventListener('touchmove', e => {
    if (dragging) e.preventDefault();  // Lock scroll only after horizontal drag confirmed
}, { passive: false });

// Use 10px horizontal threshold before committing to drag
// This lets vertical scrolling work through the scrubber area
```

## Sheet Anatomy

```
.wxd-overlay                    ← Full-screen overlay container (display:none → shown)
  .wxd-backdrop                 ← Semi-transparent backdrop (click to dismiss)
  .wxd-sheet                    ← The sheet panel itself
    .modal-drag-indicator       ← Grey drag handle bar at top
    .modal-header               ← Title + close button row
      .modal-title
      .modal-close
    .wxd-sheet-body             ← Scrollable content area
      (your content)
```

## CSS Classes Reference

| Class | Purpose |
|-------|---------|
| `.wxd-overlay` | Full-screen fixed container, flex centered |
| `.wxd-backdrop` | Black 50% opacity background, click to dismiss |
| `.wxd-sheet` | The white/dark panel that slides up |
| `.wxd-sheet--partial` | Bottom sheet variant (auto-height, not full screen) |
| `.wxd-open` | Added when sheet is visible (triggers animation) |
| `.modal-drag-indicator` | 36x5px grey bar for drag affordance |
| `.modal-header` | Flex row: title left, close button right |
| `.modal-close` | 36x36px circle button with X icon |
| `.wxd-sheet-body` | Scrollable content container |

## Animation

```css
.wxd-sheet {
    transform: translateY(100%);
    transition: transform 0.35s cubic-bezier(0.2, 0.9, 0.3, 1);
}
.wxd-open .wxd-sheet {
    transform: translateY(0);
}
```

Swipe-to-dismiss is handled by `_initSheetSwipeDismiss()` — called automatically in `_openOverlaySheet`.

## Sheet Stack (Nested Sheets)

The system supports opening sheets on top of sheets:
```javascript
_openOverlaySheet('sheet1');  // Opens first
_openOverlaySheet('sheet2');  // Opens on top, sheet1 stays

_closeOverlaySheet('sheet2'); // Closes top sheet
// sheet1 is still open

_closeOverlaySheet('sheet1'); // Closes last sheet, unlocks body scroll
```

Body scroll lock is only released when the last sheet in the stack closes.

## Common Patterns Inside Sheets

### iOS Grouped List Rows
```html
<div class="cev-group">
    <div class="cev-group-row">
        <span class="cev-group-icon"><svg>...</svg></span>
        <span class="cev-group-label">Label</span>
        <span class="cev-group-value">Value</span>
    </div>
    <div class="cev-group-row">
        <span class="cev-group-icon"><svg>...</svg></span>
        <span class="cev-group-label">Toggle</span>
        <label class="ios-switch">
            <input type="checkbox">
            <span class="ios-switch-slider"></span>
        </label>
    </div>
</div>
```

### Action Buttons (Bottom of Sheet)
```html
<div style="display:flex;gap:8px;padding:16px 0">
    <button class="btn btn-ghost" style="flex:1" onclick="edit()">
        <svg>...</svg> Edit
    </button>
    <button class="btn btn-ghost" style="flex:1;color:var(--red)" onclick="del()">
        <svg>...</svg> Delete
    </button>
</div>
```

### Custom Dropdowns in Sheets
```javascript
// After opening sheet:
initCustomDropdowns(document.getElementById('mySheetOverlay'));
```
Always use `<select class="app-select">` or custom `.cdd-wrap` dropdown — never `<datalist>`.

## Troubleshooting

### Sheet opens but background still scrolls
→ Check that `_openOverlaySheet` is called (not manual display toggle)
→ Verify `.sheet-locked` class is on body
→ Check touchmove handler on overlay backdrop

### Black bar appears below keyboard on iOS
→ You used `position: fixed` on body somewhere — remove it
→ Use only `overflow: hidden` on html + body

### Sheet content doesn't scroll
→ Check `.wxd-sheet-body` has `overflow-y: auto`
→ On mobile full-screen sheets, the sheet itself scrolls (not the body)
→ Don't put `overflow: hidden` on the sheet panel

### Scrubber inside sheet moves the sheet when dragging
→ Add `touch-action: pan-y` on the scrubber element
→ Use 10px horizontal threshold before calling `e.preventDefault()`
→ Only prevent default in touchmove when `dragging === true` (not during `pending`)

### Sheet doesn't close on swipe down
→ `_initSheetSwipeDismiss` is called automatically by `_openOverlaySheet`
→ Check the sheet has `.modal-drag-indicator` (swipe target)

### Sheet close button doesn't work
→ Make sure onclick calls `_closeOverlaySheet('exactId')` with the correct overlay ID
→ If using `window.functionName`, ensure function is on `window` scope

## Testing Checklist

- [ ] Sheet opens with smooth slide-up animation
- [ ] Backdrop click dismisses sheet
- [ ] Swipe down on drag indicator dismisses sheet
- [ ] Close button (X) dismisses sheet
- [ ] Background page does NOT scroll while sheet is open
- [ ] Sheet content scrolls internally if it overflows
- [ ] On iOS: no black bar when keyboard opens
- [ ] On iOS: sheet scroll doesn't leak to background
- [ ] If sheet has scrubbers: horizontal drag works without moving sheet vertically
- [ ] If sheet has scrubbers: vertical scroll through scrubber area still works
- [ ] Nested sheet (opening sheet from sheet) works correctly
- [ ] Last sheet close properly unlocks body scroll
