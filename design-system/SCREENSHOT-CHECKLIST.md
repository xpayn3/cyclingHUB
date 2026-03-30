# CycleIQ Design System — Screenshot Checklist

Capture each state on mobile (375px) and desktop. Save in `screenshots/` folder.

## Pages

### Dashboard
- [ ] `01-dashboard-top.png` — Summary, profile pic, time range pill, recent activities carousel
- [ ] `02-dashboard-goals.png` — Goals cards (square with ring progress)
- [ ] `03-dashboard-stats.png` — Weekly stats horizontal scroll cards
- [ ] `04-dashboard-charts.png` — Fitness chart, power curve, training status
- [ ] `05-dashboard-bottom.png` — Weekly load, power profile radar, bottom nav pill

### Activities List
- [ ] `10-activities-list.png` — Card view with maps, year picker, view toggle
- [ ] `11-activities-list-view.png` — List view
- [ ] `12-activities-zones-view.png` — Zones view
- [ ] `13-activities-search.png` — Command palette search (Fuse.js, ghost autocomplete)

### Single Activity
- [ ] `20-activity-hero.png` — Map, title, TSS badge, XP badge, primary stats
- [ ] `21-activity-secondary.png` — Secondary stat grid (elevation, speed, power, etc.)
- [ ] `22-activity-streams.png` — Power/HR/cadence stream charts
- [ ] `23-activity-zones.png` — Zone distribution charts
- [ ] `24-activity-laps.png` — Lap splits table
- [ ] `25-activity-advanced.png` — Advanced cards expanded (perf, decouple, L/R, gradient, climbs)
- [ ] `26-activity-save-route.png` — Save route FAB visible

### Calendar
- [ ] `30-calendar-month.png` — Month grid with activity dots, workout cards
- [ ] `31-calendar-day-panel.png` — Day panel expanded with activity list
- [ ] `32-calendar-create-event.png` — New event modal sheet
- [ ] `33-calendar-drag-drop.png` — Dragging a workout card (desktop)

### Fitness
- [ ] `40-fitness-top.png` — CTL/ATL/TSB chart, recovery card
- [ ] `41-fitness-predictions.png` — Race predictions, best efforts
- [ ] `42-fitness-personal-records.png` — PR wall grid

### Power
- [ ] `50-power-curve.png` — Power curve chart with range pill
- [ ] `51-power-zones.png` — Zone time distribution
- [ ] `52-power-kj.png` — Energy expenditure section

### Heatmap
- [ ] `60-heatmap.png` — Heat map with routes
- [ ] `61-heatmap-sheet.png` — Bottom sheet with stats, filters (segmented controls)
- [ ] `62-heatmap-satellite.png` — Satellite view

### Route Builder
- [ ] `70-route-builder.png` — Map with search bar, routing button
- [ ] `71-route-builder-sheet.png` — Bottom sheet with action pills, waypoints
- [ ] `72-route-builder-weather.png` — Weather pill on map
- [ ] `73-route-builder-poi.png` — POI filter chips

### My Routes
- [ ] `75-my-routes.png` — Saved routes library with map previews

### Workout Builder
- [ ] `76-workout-builder.png` — Visual interval designer with colored bars
- [ ] `77-workout-scrubbers.png` — Duration/power/reps scrubber inputs

### Goals & Streaks
- [ ] `80-goals-page.png` — Goals with progress rings, streak hero cards
- [ ] `81-goals-streaks.png` — Activity calendar heatmap, streak counters, lifetime stats
- [ ] `82-achievements.png` — Achievement subpage with earned/locked badge grid
- [ ] `83-badge-3d.png` — 3D holographic badge card viewer

### Weather
- [ ] `85-weather-forecast.png` — 7-day forecast with ride-quality badges
- [ ] `86-weather-hourly.png` — Hourly breakdown charts

### Compare
- [ ] `87-compare.png` — Period-to-period metric comparison with delta indicators

### Gear (My Garage)
- [ ] `88-gear-fleet.png` — Bike fleet with photo cards
- [ ] `89-gear-components.png` — Component tracking, battery gauges

### Settings
- [ ] `90-settings-main.png` — iOS grouped list, theme toggle, profile card
- [ ] `91-settings-leveling.png` — Leveling subpage with hero card, XP formula
- [ ] `92-settings-weather.png` — Weather locations
- [ ] `93-settings-map-theme.png` — Map theme picker

### Profile Modal
- [ ] `100-profile-modal.png` — Full sheet: avatar, level badge, XP bar, radar chart
- [ ] `101-profile-stats.png` — Stats grid + top 3 rides
- [ ] `102-profile-sticky-header.png` — Scrolled state with sticky pill header

### Modals & Overlays
- [ ] `110-sidebar.png` — Sidebar menu open
- [ ] `111-connect-modal.png` — Connect intervals.icu modal
- [ ] `112-splash-screen.png` — App splash screen

### Bottom Nav & PTR
- [ ] `120-bottom-nav.png` — Pill nav with Home/Activities/Calendar/Fitness
- [ ] `121-bottom-nav-fab.png` — FAB buttons (calendar +, route builder +, search)
- [ ] `122-pull-to-refresh.png` — Right-edge PTR bar with snap points

### Responsive
- [ ] `130-desktop-dashboard.png` — Desktop layout with floating sheets
- [ ] `131-desktop-calendar.png` — Desktop calendar with side panel
- [ ] `132-mobile-dashboard.png` — Mobile PWA layout

## Design Tokens Reference
- Background: #000000
- Card: var(--bg-card)
- Accent: #00e5a0
- Font: Inter
- Border radius: 16px (standard), 8px (small)
- Touch targets: 44px minimum
