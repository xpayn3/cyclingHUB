# Chart.js Graphs Component

Build Chart.js charts for the CycleIQ cycling PWA. Contains the complete styling system, tooltip handler, axis conventions, color palette, and all edge cases.

## When to Use

Invoke when:
- Creating any new Chart.js chart (line, bar, scatter, doughnut, radar)
- Fixing tooltip styling or positioning
- Adjusting axis labels, grid lines, or tick formatting
- Adding crosshair/hover interactions
- Charts showing decimals when they shouldn't
- Chart not fitting the card width properly

## Chart.js Version & Plugins

```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/hammer.js/2.0.8/hammer.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-zoom@2.0.1/dist/chartjs-plugin-zoom.min.js"></script>
```

## Shared Constants

Always use these — never define chart styles inline:

```javascript
const C_GRID = { color: 'rgba(255,255,255,0.06)', drawBorder: false };
const C_TICK = { color: 'rgba(255,255,255,0.4)', font: { size: 10 } };
const C_TOOLTIP = {
    enabled: false,
    external: externalTooltipHandler,  // Custom tooltip system
    mode: 'index',
    intersect: false,
    position: 'aboveLine',
};
```

## Color Palette

### Stream/Activity Colors
```
Power:     #00e5a0  (accent green)
HR:        #ff6b35  (orange)
Cadence:   #4a9eff  (blue)
Speed:     #f0c429  (yellow)
Elevation: #9b59ff  (purple)
Temperature: #ff6b35 (orange)
```

### Zone Colors (Power)
```
Z1 Recovery:   #4a9eff  (blue)
Z2 Endurance:  #00e5a0  (green)
Z3 Tempo:      #f0c429  (yellow)
Z4 Threshold:  #ff9500  (orange)
Z5 VO2max:     #ff453a  (red)
Z6 Anaerobic:  #ff375f  (hot pink)
Z7 Sprint:     #bf5af2  (purple)
```

### Zone Colors (HR)
```
Z1: #4a9eff
Z2: #00e5a0
Z3: #f0c429
Z4: #ff9500
Z5: #ff453a
```

### Fitness Colors
```
CTL/Fitness: var(--accent) / #00e5a0
ATL/Fatigue: #ff9500
TSB/Form:    #4a9eff
```

## Tooltip System (Critical)

### How It Works
All charts use `externalTooltipHandler` — a custom DOM-based tooltip that replaces Chart.js default canvas tooltip.

### Tooltip Styling Rules
1. **Background color** = the dataset's `borderColor` (solid, no transparency)
2. **Text color** = `#000` (black) for contrast on colored backgrounds
3. **No dot/circle indicator** — the tooltip color IS the indicator
4. **Border radius**: 6px
5. **No divider line** between title and body
6. **Position**: Centered above chart area, touching the top edge of the chart
7. **Font**: 13px body, 14px title (bold)
8. **Multi-line values**: Use `<br>` to stack, not concatenate

### Tooltip Config for a Chart
```javascript
plugins: {
    tooltip: {
        ...C_TOOLTIP,
        callbacks: {
            title: items => formatTitle(items),
            label: ctx => formatLabel(ctx),
        }
    }
}
```

### Tooltip Color Detection
The handler extracts color from:
1. `dataset.borderColor` (primary — vivid line/stroke color)
2. `labelColors[i].borderColor` (fallback)
3. `dataset.backgroundColor` (last resort — for bar charts)

Skips black, transparent, or very dark colors. For bar charts with per-bar color arrays, indexes into the array using `dataIndex`.

### Bar Chart Tooltips
Bar charts often have `backgroundColor` as an array. The tooltip handler indexes:
```javascript
const bgArr = ds.backgroundColor;
const color = Array.isArray(bgArr) ? bgArr[dataIdx] : bgArr;
```

## Y-Axis Conventions

### Unit Label at Zero Position
The first tick (position 0) shows the unit name instead of "0":
```javascript
ticks: {
    ...C_TICK,
    callback: function(v, i) {
        return i === 0 ? 'W' : Math.round(v);  // Unit at bottom, numbers above
    }
}
```

### Common Units
```
Power:      'W'
Heart Rate: 'BPM'
Cadence:    'rpm'
Speed:      'kph'
Elevation:  'm'
Temperature:'°C'
Energy:     'kJ'
Time:       'min'
```

### No Decimals — Ever
Always round tick values:
```javascript
callback: function(v, i) {
    return i === 0 ? 'W' : Math.round(v);
}
```

### Axis Width Control
Use `afterFit` to prevent axis from expanding and shrinking the chart:
```javascript
afterFit: axis => { axis.width = 28; }
```
Keep width ≤30px. Use short unit names ('kph' not 'km/h') to fit.

## X-Axis Conventions

### Time-Based (Streams)
```javascript
x: {
    type: 'category',
    ticks: {
        ...C_TICK,
        maxTicksLimit: 7,
        maxRotation: 0,
        callback: function(v) { return formatTime(v); }
    }
}
```

### Distance-Based (Elevation Profile)
```javascript
callback: function(v) {
    const km = parseFloat(v);
    return Number.isInteger(km) ? km : Math.round(km);  // No decimals
}
```

First tick shows 'km' instead of '0'.

## Grid Lines

```javascript
const C_GRID = {
    color: 'rgba(255,255,255,0.06)',  // Very subtle
    drawBorder: false                  // No axis border line
};
```

For charts needing slightly more visible grids (activity page):
```javascript
color: 'rgba(255,255,255,0.08)'
```

## Chart Creation Pattern

### Standard Line Chart
```javascript
const chart = new Chart(canvas, {
    type: 'line',
    data: {
        labels: [...],
        datasets: [{
            data: [...],
            borderColor: '#00e5a0',
            backgroundColor: 'transparent',
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0.3,
            fill: false,
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: { display: false },
            tooltip: { ...C_TOOLTIP, callbacks: { ... } }
        },
        scales: {
            x: { grid: { display: false }, ticks: { ...C_TICK, maxTicksLimit: 7, maxRotation: 0 } },
            y: { grid: C_GRID, ticks: { ...C_TICK, callback: (v,i) => i === 0 ? 'W' : Math.round(v) } }
        }
    }
});
```

### Standard Bar Chart
```javascript
const chart = new Chart(canvas, {
    type: 'bar',
    data: {
        labels: [...],
        datasets: [{
            data: [...],
            backgroundColor: '#00e5a0',  // SOLID — no transparency on bars
            borderRadius: 4,
            borderSkipped: false,
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
            legend: { display: false },
            tooltip: { ...C_TOOLTIP }
        },
        scales: {
            x: { grid: { display: false }, ticks: { ...C_TICK } },
            y: { grid: C_GRID, beginAtZero: true, ticks: { ...C_TICK } }
        }
    }
});
```

### Doughnut Chart (Zone Distribution)
```javascript
new Chart(canvas, {
    type: 'doughnut',
    data: {
        datasets: [{
            data: zonePcts,
            backgroundColor: zoneColors,
            borderWidth: 0,
        }]
    },
    options: {
        cutout: '65%',
        responsive: false,
        animation: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } }
    }
});
```

## Chart Cleanup

ALWAYS destroy charts before creating new ones:
```javascript
if (state.myChart) { state.myChart.destroy(); state.myChart = null; }
state.myChart = new Chart(canvas, config);
```

Use the helper if available:
```javascript
destroyChart('myChart');  // Safely destroys state.myChart
```

## Crosshair Plugin

A global Chart.js plugin draws a vertical line at the hovered x position:

```javascript
Chart.register({
    id: 'crosshairLine',
    afterDraw(chart) {
        const active = chart.tooltip?._active;
        if (!active?.length) return;
        const { ctx, chartArea: { top, bottom } } = chart;
        const x = active[0].element.x;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.stroke();
        ctx.restore();
    }
});
```

## Tooltip Dismiss on Scroll

Tooltips must hide when the user scrolls the page:
```javascript
document.addEventListener('scroll', () => {
    const tt = document.getElementById('ctf');
    if (tt?.style.opacity !== '0') tt.style.opacity = '0';
}, { passive: true, capture: true });
```

## Elevation Ghost Layer

On the Activity Data subpage, each individual stream chart shows a faint elevation profile behind it:
```javascript
// Add as first dataset (draws behind the main data):
{
    data: elevationData,
    borderColor: 'rgba(155, 89, 255, 0.08)',
    backgroundColor: 'rgba(155, 89, 255, 0.04)',
    borderWidth: 1,
    pointRadius: 0,
    fill: true,
    tension: 0.3,
    yAxisID: 'yElev',  // Separate axis, display: false
}
```

## Chart Responsiveness

### Canvas Container
```html
<div class="chart-wrap" style="height: 220px">
    <canvas id="myChart"></canvas>
</div>
```

### CSS
```css
.chart-wrap {
    position: relative;
    width: 100%;
}
.chart-wrap canvas {
    display: block;
    width: 100% !important;
}
```

### Edge-to-Edge Charts (Activity Page)
Charts that need to go to card edges use negative margin on `.chart-wrap`:
```css
.chart-wrap {
    margin: 0 calc(-1 * var(--pad-card));
}
```

## Common Mistakes

### DON'T: Use transparent bar backgrounds
```javascript
// BAD — bars look washed out
backgroundColor: 'rgba(0,229,160,0.45)'

// GOOD — solid bars
backgroundColor: '#00e5a0'
```

### DON'T: Show decimals on axes
```javascript
// BAD
callback: v => v

// GOOD
callback: (v, i) => i === 0 ? 'W' : Math.round(v)
```

### DON'T: Forget animation: false
```javascript
// BAD — charts animate on every update, causes jank
animation: { duration: 400 }

// GOOD — instant render
animation: false
```

### DON'T: Use Chart.js default tooltip
```javascript
// BAD — ugly default canvas tooltip
tooltip: { enabled: true }

// GOOD — custom external handler with colored background
tooltip: { ...C_TOOLTIP }
```

### DON'T: Create chart without destroying previous
```javascript
// BAD — memory leak, ghost charts
state.myChart = new Chart(canvas, config);

// GOOD
if (state.myChart) state.myChart.destroy();
state.myChart = new Chart(canvas, config);
```

## Testing Checklist

- [ ] Chart renders without decimals on any axis
- [ ] Y-axis first tick shows unit name (W, BPM, rpm, etc.)
- [ ] Tooltip has colored background matching the dataset
- [ ] Tooltip text is black for contrast
- [ ] No dot/circle indicator in tooltip
- [ ] Tooltip disappears when scrolling the page
- [ ] Grid lines are subtle (rgba 0.06-0.08)
- [ ] Chart is responsive — fills container width
- [ ] Previous chart instance destroyed before creating new one
- [ ] Bar charts have solid (non-transparent) fills
- [ ] animation: false is set
- [ ] Chart.js legend is hidden (legend: { display: false })
