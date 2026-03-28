# CycleIQ — Complete Feature Set

## Pages (22 total)

### Dashboard
- Summary cards: weekly stats, fitness snapshot, recent activities
- Gear carousel (bike fleet with dot navigation)
- Route Builder map widget (MapLibre 3D)
- Weather forecast rail (click to expand)
- Battery status cards (Garmin, SRAM AXS, coin cells)
- Widget system: reorderable, hideable, drag-and-drop editor
- Training load sparkline (CTL/ATL/TSB)

### Activities List
- Card/list view toggle
- Filters: sport type, year, date range
- Sort: date, distance, duration, TSS
- Search by activity name
- Infinite scroll with lazy loading
- Scroll position restoration on back-nav

### Activity Detail
- Interactive map (MapLibre 3D terrain)
- Multi-stream chart: power, HR, cadence, speed, elevation, temperature
- Zone distribution (power + HR donut charts)
- Interval detection and analysis
- Climb detection with gradient bands
- Lap/split breakdown table
- Similar rides comparison
- Share card generation (canvas screenshot)
- Save route to library

### Fitness & Training Load
- CTL/ATL/TSB chart with interactive date range
- FTP history timeline
- Wellness insights (HRV, sleep, resting HR)
- Race prediction calculator
- Training recommendations
- 7 new analytics: Gear ROI, Fueling Plan, Tapering Wizard, Weather-Performance Correlation, What If CTL Simulator, Race Pacing, Heat/Altitude Acclimatization

### Power Analysis
- Power curve (all-time, 90d, 28d, 7d)
- Zone distribution (time in zones)
- Power profile radar chart
- Strength/weakness analysis
- W' balance chart

### Goals & Streaks
- Week/day/month streak tracking with hero cards
- Personal bests (best streaks, total active weeks)
- Weekly activity calendar heatmap (last 52 weeks)
- Month calendar view
- Year overview (rides per month)
- 28 achievement badges with 3D holographic cards
- Achievement subpage (earned/locked sections)
- Lifetime stats list (15 metrics: distance, elevation, time, calories, TSS, etc.)
- Training goals with progress rings (weekly/monthly/yearly targets)

### Achievements System (28 badges)
**Streak-based:** On Fire (3w), Week Warrior (5w), Diamond Streak (10w), Streak King (20w), Daily Grinder (7d), Month Maker (3mo), Best Week Ever, Century Club (100w), Half Year (26w), Consistent (50w)
**Seasonal:** Winter Warrior (Jan/Feb), Summer Beast (Jul/Aug)
**Distance:** Explorer (1,000km), Iron Legs (5,000km), Marathon Rider (100km ride)
**Climbing:** Hill Climber (10,000m total), Everesting (8,849m single ride)
**Speed:** Speedster (40+ km/h avg)
**Time:** Saddle Time (100+ hrs), Endurance King (5+ hr ride)
**Special dates:** Valentine Rider (Feb 14), Spooky Rider (Oct 31), New Year Ride (Jan 1), Christmas Ride (Dec 25)
**Milestones:** First Ride, 500 Club
**Time of day:** Early Bird (before 6 AM), Night Owl (after 9 PM)

### 3D Badge Cards
- Procedural card geometry with rounded corners
- PBR materials: metalness/roughness maps with unique holo patterns per badge
- Rainbow env map with 3x repeating spectrum + scanline bands
- Moving spotlight that orbits based on card tilt
- Glitter sparkle shader (additive blending, angle-dependent flash)
- Auto-spin with tilt rocking (30fps idle, 60fps interact)
- 0.5s intro animation (easeOutBack flip-in)
- Drag interaction with trail-based velocity + momentum
- Half Year special: portal effect with 7-layer mountain diorama
- Card preview thumbnails in achievements grid (earned=color, locked=greyscale+lock)

### Weather
- 7-day forecast with ride-quality badges
- Hourly breakdown chart
- Wind rose visualization
- Multi-location support
- Temperature/precipitation/UV charts

### Calendar
- Month and week views
- Activity markers with intensity colors
- Event creation for planned rides
- Training plan integration

### Gear (My Garage)
- Bike fleet management with photos
- Component tracking (groupset, wheels, tires, accessories)
- Battery monitoring (SRAM AXS hourly drain, coin cell monthly decay)
- Tire pressure calculator (SRAM/Zipp, Silca, Berto models)
- Service history and maintenance reminders
- Component wear tracking

### Workout Builder
- Visual interval designer
- Segment types: warmup, steady, interval, cooldown, ramp
- Zwift .zwo file export
- Power/HR target zones
- Drag-to-reorder segments

### Route Builder
- MapLibre 3D terrain maps
- Click-to-add waypoints
- Auto-routing via road network
- Elevation profile with gradient bands
- Distance/elevation stats
- GPX and FIT file export
- POI mode (points of interest)

### Routes Library
- Saved routes browser
- Edit, rename, delete routes
- Route cards with map preview

### Heatmap
- Lifetime activity overlay on map
- Route clustering for dense areas
- Date range filters
- IndexedDB caching for performance

### Import
- FIT file upload and parsing
- Garmin/Wahoo device support
- Stream injection into intervals.icu
- Export history

### Compare
- Period-to-period metric comparison
- Side-by-side charts
- Delta indicators (up/down/neutral)

### Settings
- Account management (intervals.icu + Strava)
- Sport-specific thresholds (FTP, LTHR, max HR)
- Theme selection (dark, light, editorial/awwwards)
- Font picker
- Widget ordering
- Notification preferences
- Storage management with usage bar
- P2P device sync (PeerJS WebRTC + QR pairing)

## Data Integrations

### Air Quality (Open-Meteo)
- Current European AQI + PM2.5 displayed on dashboard
- Color-coded badge: Good/Fair/Moderate/Poor/Very Poor
- 30-minute sessionStorage cache
- No API key required

### Reverse Geocoding (Nominatim)
- Activity start location resolved to city name
- Shown on activity cards: "📍 Ljubljana"
- localStorage cache (200 entries) — instant for repeat locations
- Respects 1 req/sec Nominatim rate limit

## Technical Features

### Offline & PWA
- Service Worker: network-first app shell + cache-first map tiles
- Full offline functionality after first load
- 3000-tile map cache with hysteresis pruning
- Navigation preload for fast SW boot
- Install prompt with custom banner

### Performance
- Shared WebGL renderer (one context for all 3D cards)
- Cached env map textures
- Lazy chart rendering via IntersectionObserver
- Frame skipping (30fps idle, 60fps interact)
- DPR capped at 1.5 (44% fewer pixels vs DPR 2)
- Reduced geometry complexity (bevel 3, curve 16)
- DOM cleanup on page navigate
- Visibility-based pause (tabs, background)

### Data & Sync
- intervals.icu API integration
- Strava OAuth + activity sync
- IndexedDB for stream caching
- localStorage with 8MB limit tracking
- Incremental sync (only fetch new activities)
- Full backup export/import (JSON)
- P2P WebRTC sync between devices

### Design System
- 150+ CSS custom properties (design tokens)
- @layer cascade: base → tokens → layout → components → pages → utilities → themes
- 4 themes: dark (default), light, editorial (awwwards), custom
- iOS-native aesthetics: safe areas, Dynamic Type scale, sheet gestures
- Icon sprite sheet (120+ Lucide-based SVG symbols)
