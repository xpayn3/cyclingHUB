# CycleIQ — Presentation Page Design Brief

## For: Landing/Presentation Page Designer Agent

---

## What is CycleIQ?

CycleIQ is a **professional-grade cycling analytics PWA** that connects to intervals.icu and Strava to give cyclists a beautiful, iOS-native-feeling dashboard for all their training data, gear management, route planning, and workout design — all in a single offline-capable app.

**Tech Stack:** Vanilla JS, HTML, CSS (no framework). PWA with Service Worker. Dark-first iOS/SwiftUI design language.

**Live URL:** Hosted on GitHub Pages (static site)

---

## Brand Identity

- **App Name:** CycleIQ
- **Accent Color:** `#00e5a0` (vibrant cycling green)
- **Background:** Pure black `#000000` (iOS primary)
- **Card Surfaces:** `#1C1C1E` (iOS secondary)
- **Font:** Inter (system-ui fallback)
- **Border Radius:** 16px cards, 24px sheets, 10px chips
- **Design Language:** iOS 18 / SwiftUI — borderless cards, grouped lists, sheet modals, drag indicators

---

## Key Features to Highlight (by section)

### 1. Dashboard (Hero Section)
- Real-time training summary with CTL/ATL/TSB fitness chart
- Recent activity cards with GPS map previews and achievement badges (PR, LTHR)
- Weekly comparison stats (this week vs last week with trend arrows)
- Goals progress rings
- Weather forecast carousel with ride-quality scoring
- Biorhythm energy/fatigue/readiness gauges
- My Garage bike photo carousel
- Battery status grid for electronic shifting (SRAM AXS, Shimano Di2)

### 2. Activity Analytics
- 3 view modes: card grid, list, zone analysis
- Per-activity detail: interactive map, power/HR/cadence stream charts, zone distribution, lap splits, climb detection
- Achievement badges on cards (PR, LTHR) with subtle color-tinted backgrounds
- Sort by date, distance, time, elevation, power, BPM

### 3. Fitness Intelligence
- Training Load history (CTL/ATL/TSB) with 14d/30d/90d range pills
- FTP history tracking
- Power curve analysis
- Race predictor
- Recovery estimation
- Training monotony detection
- Periodization guidance
- Cycling trends (weekly/monthly breakdowns)

### 4. Power & Zones
- Power zone distribution with 6-zone color system
- HR zone comparison
- Power curve chart
- Power profile radar (spider chart comparing strengths)
- PwrHR scatter analysis
- Decouple analysis
- Energy expenditure (kJ, intensity, efficiency, metabolic)

### 5. Workout Builder
- Visual workout designer with colored interval bars
- Segment types: Warmup, Steady, Interval, Cooldown, Free Ride
- Horizontal scrubber inputs for duration/power/reps
- Sticky chart preview with segment highlighting
- Zwift message markers on timeline
- Export: .zwo (Zwift), .fit (Garmin), send to intervals.icu calendar
- Favorite workouts library

### 6. Route Builder
- Interactive MapLibre GL map with 3D terrain
- Click-to-add waypoints, drag to adjust
- Elevation profile
- Undo/redo, reverse, out-and-back
- Export: .gpx, .fit
- Save routes to local library (IndexedDB)

### 7. My Garage (Gear Management)
- Bike fleet with photo backgrounds
- Component tracking with 90+ brand/model image database
- Category fallback images (crankset, derailleur, wheels, tires, etc.)
- Battery monitoring with segmented gauge visualization
- Animated charge popup with glow effect
- Charge undo history
- Tire pressure calculator (3 formulas: SRAM/Zipp, Silca, Berto 15%)
- Service history timeline with shop directory

### 8. Calendar
- Month grid view with day detail panel
- List view with chronological scrolling
- Event creation with color picker
- Training plan integration
- Horizontal scrubber inputs for duration/distance/TSS targets

### 9. Heatmap
- Lifetime activity overlay on map
- Route clustering
- Filter by activity type, month, year

### 10. Weather
- 7-day forecast with ride-quality badges (Great/Fair/Poor)
- Hourly breakdown
- Wind, precipitation, temperature
- Multi-location support

---

## UI Innovations Worth Showcasing

### Horizontal Drag Scrubber
Custom radio-dial-style input for numbers. User drags left/right on a ruled track with tick marks. Used for duration, distance, TSS, power, weight. Includes undo history, color-coded values by zone, and touch-action handling for iOS.

### Battery Gauge
Horizontal 5-segment battery icon in detail sheets. Segments fill based on charge level with zone-appropriate colors. Charge animation with count-up, fill, and glow effect.

### Tire Pressure Calculator
3 industry-standard formulas (SRAM/Zipp, Silca, Berto 15% Drop) with live calculation as you adjust rider weight, tire width, surface type, riding style, and tube type. Shows front/rear split with range bars.

### Achievement Badges
PR and LTHR badges appear on activity cards with subtle card background tinting in the achievement color.

### Vitality WebGL Renderer
Real-time shader with physics-based metaball particles, chromatic aberration, gradient specular, and aura glow for the fitness level indicator.

### iOS Sheet System
All modals use slide-up sheets with drag indicators, swipe-to-dismiss, and scroll containment that prevents background page scrolling (iOS Safari compatible).

---

## Design Screenshots to Capture

1. **Dashboard** — Full scroll showing fitness chart, activity carousel, stats grid, goals, weather, garage
2. **Activity Detail** — Map + stream charts + zone bars
3. **Workout Builder** — Interval chart with segments + edit panel with scrubbers
4. **My Garage** — Bike photo card + battery cards + tire pressure calculator
5. **Route Builder** — Map with route drawn + elevation profile
6. **Calendar** — Month view + list view toggle
7. **Fitness Page** — Training load chart + KPI cards
8. **Settings** — iOS-style grouped sections with subpage navigation

---

## Technical Highlights for Developer Audience

- **Zero dependencies** — No React, Vue, or framework. Pure vanilla JS/HTML/CSS
- **22 pages** in a single-page app with custom router
- **50+ render functions** for dynamic content
- **150+ CSS custom properties** organized in `@layer` cascade
- **PWA** with Service Worker, offline support, installable
- **8+ API integrations** (intervals.icu, Strava, OpenMeteo, MapLibre, Chart.js, logo.dev, etc.)
- **IndexedDB + localStorage** hybrid storage architecture
- **iOS-first design** — Dynamic Type scale, safe areas, sheet modals, haptic patterns
- **Accessibility** — 44px touch targets, ARIA labels, semantic HTML, keyboard navigation

---

## Presentation Page Structure Suggestion

1. **Hero** — App name, tagline, phone mockup with dashboard screenshot, CTA button
2. **Feature Showcase** — Alternating left/right sections with screenshots + descriptions
3. **UI Innovation Reel** — Animated GIFs or videos of scrubber, battery charge, workout builder
4. **Stats Strip** — "22 pages | 50+ features | 0 frameworks | 100% offline-ready"
5. **Gear Management** — Deep dive into the garage system with component photos
6. **Integration Logos** — intervals.icu, Strava, Zwift, Garmin, MapLibre, Chart.js
7. **Mobile First** — Side-by-side mobile + desktop screenshots
8. **CTA Footer** — "Try CycleIQ" button + GitHub link

---

## Assets Available

- `/img/components/categories/` — Component category images (crankset, derailleur, wheels, tires, etc.)
- `/img/components/sram/` — SRAM shifter/derailleur product photos
- `/img/components/favero/` — Favero Assioma pedal photos
- `/img/intervals-icu-logo.webp` — intervals.icu logo
- App icon and splash can be generated from the accent green + cycling motif

---

## Tone & Voice

- **Professional but approachable** — This is a serious training tool with beautiful design
- **Data-driven** — Highlight the analytics depth
- **Offline-first** — Emphasize PWA capabilities
- **iOS-native feel** — Stress the SwiftUI-inspired design on a web platform
- **For cyclists, by cyclists** — Authentic, not generic fitness
