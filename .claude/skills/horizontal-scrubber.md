# Horizontal Scrubber Input Component

Build horizontal drag scrubber inputs for the CycleIQ cycling PWA. A radio-dial-style input where users drag left/right to change numeric values. Used for duration, distance, TSS, weight, power, repetitions, and goal targets.

## When to Use

Invoke when:
- Building any numeric input that should be a drag scrubber (not a text field)
- User says "slider", "scrubber", "dial", or "drag input"
- Replacing plain number inputs with touch-friendly controls
- Fixing scrubber touch issues (inverted direction, page scroll, accidental changes)

## Architecture

Three implementations exist in the codebase:

1. **Calendar Event Scrubbers** (`_initCalScrubbers`) — Duration, Distance, TSS in event modal
2. **Goal Scrubbers** (`_initGoalScrubber`) — Target value in goal edit sheet
3. **Workout Builder Scrubbers** (`wrkInitScrubbers`) — Duration, Power, Reps in workout segments

All share the same interaction pattern but have different configs.

## Quick Start — New Scrubber

### HTML
```html
<div class="cev-target-card">
    <label>My Value</label>
    <input type="hidden" id="myValue" value="">
    <div class="cev-scrubber" data-metric="myMetric">
        <div class="cev-scrubber-value-row">
            <div class="cev-scrubber-value">—</div>
            <span class="cev-scrubber-unit">kg</span>
        </div>
        <div class="cev-scrubber-track">
            <div class="cev-scrubber-ruler"></div>
        </div>
    </div>
</div>
```

### Ruler Generation
The ruler is a series of tick marks generated in JS:
```javascript
let ticks = '';
for (let i = -200; i <= 200; i++) {
    const isMajor = i % 5 === 0;
    ticks += `<div class="cev-tick${isMajor ? ' cev-tick--major' : ''}"></div>`;
}
ruler.innerHTML = ticks;
```

### CSS (Already in styles.css)
```css
.cev-scrubber {
    touch-action: pan-y;  /* Let browser handle vertical scroll */
    user-select: none;
}
.cev-scrubber-track {
    height: 48px;
    overflow: hidden;
    position: relative;
    mask-image: linear-gradient(90deg, transparent, #000 15%, #000 85%, transparent);
}
.cev-scrubber-ruler {
    display: flex;
    position: absolute;
    top: 0;
    height: 100%;
}
.cev-tick {
    width: 6px;        /* PX_PER_STEP */
    flex-shrink: 0;
    border-right: 1px solid rgba(255,255,255,0.15);
    height: 60%;
    align-self: flex-end;
}
.cev-tick--major {
    height: 100%;
    border-right-color: rgba(255,255,255,0.35);
}
```

## Touch Interaction Pattern (Critical)

### The Flow
```
pointerdown → set pending=true, record startX/startY, pointerId
pointermove → if pending:
                if abs(dx) > THRESHOLD(10px): commit to drag
                else: wait (let browser decide vertical vs horizontal)
             if dragging:
                calculate new step, apply value
touchmove   → only preventDefault when dragging===true (NOT during pending)
pointerup   → if value changed, push dragStartStep to history stack
```

### Why This Pattern (Not Simpler)

1. **10px threshold** prevents accidental value changes when scrolling past the scrubber
2. **`touch-action: pan-y`** lets the browser handle vertical scroll naturally
3. **Only preventDefault when dragging** means vertical scroll still works through the scrubber area
4. **History stack** enables per-interaction undo (not reset to original)

### Complete JS Implementation
```javascript
const THRESHOLD = 10;
const PX_PER_STEP = 6;
let step = 0, dragging = false, pending = false;
let dragStartX = 0, dragStartStep = 0, pendingPid = 0;
let history = [];

function applyStep(s) {
    step = Math.max(min, Math.min(max, Math.round(s)));
    const trackW = scrubber.querySelector('.cev-scrubber-track').clientWidth || 80;
    ruler.style.transform = `translateX(${trackW / 2 - step * PX_PER_STEP}px)`;
    // Update display value, hidden input, colors, undo button...
}

// Set touch-action directly (overrides global rules)
scrubber.style.setProperty('touch-action', 'pan-y', 'important');

scrubber.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    dragStartX = e.clientX;
    dragStartStep = step;
    pending = true;
    pendingPid = e.pointerId;
});

scrubber.addEventListener('pointermove', e => {
    if (pending) {
        if (Math.abs(e.clientX - dragStartX) < THRESHOLD) return;
        pending = false;
        dragging = true;
        scrubber.setPointerCapture(pendingPid);
    }
    if (!dragging) return;
    // NEGATE delta: drag right = ruler moves left = bigger values
    applyStep(dragStartStep - (e.clientX - dragStartX) / PX_PER_STEP);
});

// Only prevent scroll when actually dragging — NOT during pending
scrubber.addEventListener('touchmove', e => {
    if (dragging) e.preventDefault();
}, { passive: false });

const endDrag = () => {
    if (pending) { pending = false; return; }
    if (!dragging) return;
    dragging = false;
    if (step !== dragStartStep) {
        history.push(dragStartStep);  // Push for undo
        syncUndoBtn();
    }
};
scrubber.addEventListener('pointerup', endDrag);
scrubber.addEventListener('pointercancel', endDrag);
```

## Direction

**Drag RIGHT → value INCREASES** (ruler moves left, showing bigger numbers)
**Drag LEFT → value DECREASES** (ruler moves right, showing smaller numbers)

This is achieved by NEGATING the delta:
```javascript
applyStep(dragStartStep - delta / PX_PER_STEP);
//                       ^ minus = negate
```

## Undo System

Each scrubber maintains a history stack:
- **On drag end**: if value changed, push `dragStartStep` to `history[]`
- **Undo button click**: pop from `history[]`, apply that step
- **Show undo button**: when `history.length > 0`
- **Clear history**: when modal opens / value synced from external source

### Undo Button HTML
```html
<button class="cev-undo-btn" style="display:none">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
         stroke="currentColor" stroke-width="2">
        <path d="M3 10h10a5 5 0 0 1 0 10H12"/>
        <polyline points="7 6 3 10 7 14"/>
    </svg>
</button>
```

Positioned absolutely in the top-right of the card.

## Value Display & Colors

### Duration Scrubber
```javascript
// Step = 5 minutes, display as "Xh Ym" or "Ym"
const mins = step * 5;
const h = Math.floor(mins / 60), m = mins % 60;
display = h > 0 ? (m > 0 ? `${h}h ${m}` : `${h}`) : `${m}`;
unit = h > 0 && m === 0 ? 'h' : 'm';
```

### TSS Scrubber (Color-coded by intensity)
```javascript
function tssColor(val) {
    if (val <= 0) return '';
    if (val < 100) return 'var(--accent)';      // Easy
    if (val < 200) return '#f0c429';             // Moderate
    if (val < 300) return '#ff9500';             // Hard
    return 'var(--red)';                          // Very hard
}
```

### Goal Scrubber (Metric-specific)
Each metric has its own config:
```javascript
const _GOAL_SCRUB_CFGS = {
    distance:  { stepVal: 5, maxSteps: 200, unit: 'km', fmt: v => v, color: ... },
    time:      { stepVal: 0.5, maxSteps: 100, unit: 'h', fmt: v => v.toFixed(1), color: ... },
    tss:       { stepVal: 10, maxSteps: 200, unit: '', fmt: v => v, color: tssColor },
    elevation: { stepVal: 50, maxSteps: 200, unit: 'm', fmt: v => v, color: ... },
    power:     { stepVal: 5, maxSteps: 120, unit: 'w', fmt: v => v, color: powerZoneColor },
    count:     { stepVal: 1, maxSteps: 50, unit: '', fmt: v => v, color: ... },
    hr:        { stepVal: 1, maxSteps: 100, unit: 'bpm', fmt: v => v, color: ... },
};
```

## Workout Builder Scrubbers (Compact Variant)

Smaller, no cards, inline with edit rows:
```html
<div class="wrk-scrub" data-idx="0" data-field="duration"
     data-min="0" data-max="3600" data-val="300" data-step="15" data-fmt="dur">
    <div class="wrk-scrub-head">
        <span class="wrk-scrub-val">5m</span>
        <span class="wrk-scrub-unit"></span>
    </div>
    <div class="wrk-scrub-track">
        <div class="wrk-scrub-ruler"></div>
    </div>
</div>
```

Key differences:
- `data-step` attribute for step size (15s for duration, 1 for power %)
- `data-fmt="dur"` triggers duration formatting (Xm Ys)
- Calls `wrkSet(idx, field, val)` on change
- Power scrubber shows zone color: `wrkZoneColor(val, 1)`

## Inside Slide-in Sheets

When scrubbers are inside a slide-in sheet (goal editor, calendar event):

### Problem: Dragging scrubber moves the sheet
### Fix: `touch-action: pan-y` + threshold

The browser's `touch-action: pan-y` lets vertical scroll work naturally. The 10px horizontal threshold ensures we don't accidentally capture vertical gestures. Only after confirming horizontal intent do we call `setPointerCapture` and `preventDefault`.

### Problem: Background page scrolls while sheet is open
### Fix: Handled by `_openOverlaySheet` — body gets `overflow: hidden`

### Problem: Sheet scrolls when scrubbing horizontally
### Fix: `touchmove` only calls `preventDefault` when `dragging === true`

## Syncing Values

### On Modal Open
```javascript
function _syncCalScrubbers() {
    scrubbers.forEach(scrubber => {
        const input = document.getElementById(scrubber.inputId);
        const step = def.toStep(input.value);
        scrubber._cevApplyStep(step);  // Sets value + clears history
    });
}
```

### On Save (Reading Values)
The hidden `<input>` always has the current value:
```javascript
const duration = _parseDurationToSecs(document.getElementById('calEvDuration').value);
const distance = parseFloat(document.getElementById('calEvDistance').value);
const tss = parseInt(document.getElementById('calEvTss').value);
```

## Layout Options

### Full-Width Stacked (Calendar Event)
```css
.cev-targets {
    display: flex;
    flex-direction: column;
    gap: 12px;
}
.cev-target-card {
    width: 100%;
}
```

### Side-by-Side (Duration + Distance)
```css
.cev-targets {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
}
/* TSS spans full width below */
#calEvTssField { grid-column: 1 / -1; }
```

### Compact Inline (Workout Builder)
```css
.wrk-scrub {
    touch-action: pan-y;
}
.wrk-scrub-track {
    height: 32px;  /* Shorter than calendar version */
}
```

## Common Mistakes

### DON'T: Use `touch-action: none`
```javascript
// BAD — blocks all page scroll through scrubber
scrubber.style.touchAction = 'none';

// GOOD — lets vertical scroll work
scrubber.style.setProperty('touch-action', 'pan-y', 'important');
```

### DON'T: preventDefault on touchstart
```javascript
// BAD — immediately captures touch, prevents scroll
scrubber.addEventListener('touchstart', e => e.preventDefault());

// GOOD — let browser decide direction first
// Only preventDefault on touchmove AFTER confirming horizontal drag
```

### DON'T: Start changing value immediately on touch
```javascript
// BAD — accidental changes when scrolling past
scrubber.addEventListener('pointerdown', e => {
    dragging = true;  // Immediately!
});

// GOOD — wait for 10px horizontal movement
pending = true;  // Wait...
// In pointermove: if (abs(dx) > 10) dragging = true;
```

### DON'T: Reset to original on undo
```javascript
// BAD — undo jumps back to modal-open value
undoBtn.onclick = () => applyStep(originalStep);

// GOOD — undo goes back ONE step (Ctrl+Z behavior)
undoBtn.onclick = () => {
    if (history.length) applyStep(history.pop());
};
```

### DON'T: Forget to negate delta
```javascript
// BAD — drag left increases value (feels inverted)
applyStep(dragStartStep + delta / PX);

// GOOD — drag right increases (natural)
applyStep(dragStartStep - delta / PX);
```

## Testing Checklist

- [ ] Drag right increases value
- [ ] Drag left decreases value
- [ ] Vertical scroll works when touching/passing through scrubber area
- [ ] No accidental value change when scrolling vertically past scrubber
- [ ] Scrubber doesn't move the page when dragging horizontally
- [ ] Inside sheets: sheet doesn't scroll while scrubbing
- [ ] Undo button appears after changing value
- [ ] Undo goes back one step (not reset to original)
- [ ] Multiple undos work (stack-based)
- [ ] Value correctly synced to hidden input
- [ ] Display updates in real-time during drag
- [ ] Color changes based on value (TSS, power zones)
- [ ] Duration shows formatted time (1h 30m, 45m)
- [ ] Zero shows as "—" with muted style
