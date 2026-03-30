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

## Features

See `FEATURES.md` for the complete feature list (22 pages, 28 achievement badges, 3D cards, etc.)

---

## UI Innovations Worth Showcasing

### Horizontal Drag Scrubber
Custom radio-dial-style input for numbers. User drags left/right on a ruled track with tick marks. Used for duration, distance, TSS, power, weight. Includes undo history, color-coded values by zone, and touch-action handling for iOS.

### Battery Gauge
Horizontal 5-segment battery icon in detail sheets. Segments fill based on charge level with zone-appropriate colors. Charge animation with count-up, fill, and glow effect.

### Tire Pressure Calculator
3 industry-standard formulas (SRAM/Zipp, Silca, Berto 15% Drop) with live calculation as you adjust rider weight, tire width, surface type, riding style, and tube type. Shows front/rear split with range bars.

### 3D Holographic Badge Cards
28 achievement badges rendered in Three.js with procedural geometry, PBR materials, rainbow holo shimmer, glitter sparkle shader, and drag interaction with momentum physics.

### Command Palette Search
Fuse.js fuzzy search across activities, pages, commands, and settings with ghost autocomplete and keyboard navigation.

### iOS Sheet System
All modals use slide-up sheets with drag indicators, swipe-to-dismiss, and scroll containment that prevents background page scrolling (iOS Safari compatible).

---

## Technical Highlights for Developer Audience

- **Zero dependencies** — No React, Vue, or framework. Pure vanilla JS/HTML/CSS
- **22 pages** in a single-page app with custom router
- **~98k lines** of source code across 14 files
- **150+ CSS custom properties** organized in `@layer` cascade
- **PWA** with Service Worker, offline support, installable
- **8+ API integrations** (intervals.icu, Strava, OpenMeteo, MapLibre, Chart.js, logo.dev, etc.)
- **IndexedDB + localStorage** hybrid storage architecture
- **iOS-first design** — Dynamic Type scale, safe areas, sheet modals, haptic patterns

---

## Presentation Page Structure Suggestion

1. **Hero** — App name, tagline, phone mockup with dashboard screenshot, CTA button
2. **Feature Showcase** — Alternating left/right sections with screenshots + descriptions
3. **UI Innovation Reel** — Animated GIFs or videos of scrubber, battery charge, workout builder
4. **Stats Strip** — "22 pages | 98k lines | 0 frameworks | 100% offline-ready"
5. **Gear Management** — Deep dive into the garage system with component photos
6. **Integration Logos** — intervals.icu, Strava, Zwift, Garmin, MapLibre, Chart.js
7. **Mobile First** — Side-by-side mobile + desktop screenshots
8. **CTA Footer** — "Try CycleIQ" button + GitHub link

---

## Assets Available

- `/img/components/categories/` — Component category images
- `/img/components/sram/` — SRAM product photos
- `/img/components/favero/` — Favero Assioma pedal photos
- `/img/intervals-icu-logo.webp` — intervals.icu logo

---

## Tone & Voice

- **Professional but approachable** — Serious training tool with beautiful design
- **Data-driven** — Highlight the analytics depth
- **Offline-first** — Emphasize PWA capabilities
- **iOS-native feel** — SwiftUI-inspired design on a web platform
- **For cyclists, by cyclists** — Authentic, not generic fitness
