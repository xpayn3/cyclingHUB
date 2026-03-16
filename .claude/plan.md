# Settings Page Redesign — iOS Style

## Overview
Redesign the settings page from a 2-column card grid into a modern iOS Settings-style single-column layout with:
- **Profile card** at top (iCloud-style account banner)
- **Grouped inset lists** with rounded corners (iOS grouped tableview style)
- **Navigation rows** that push to subpages for complex sections
- **Section headers** as small uppercase grey labels above each group

## Architecture: Main Page + Subpages

### Main Settings Page (single scrollable column)
```
┌──────────────────────────────┐
│  ← Settings                  │
├──────────────────────────────┤
│ ┌──────────────────────────┐ │
│ │ 👤 xpayne                │ │  Profile card (iCloud-style)
│ │    Connected · i148049   │ │  Avatar + name + subtitle
│ │                      ›   │ │  Taps into Account subpage
│ └──────────────────────────┘ │
│                              │
│ GENERAL                      │  section label
│ ┌──────────────────────────┐ │
│ │ Theme            Dark  › │ │  value shown inline
│ ├──────────────────────────┤ │
│ │ Units         Metric   › │ │
│ ├──────────────────────────┤ │
│ │ Font            Inter  › │ │
│ ├──────────────────────────┤ │
│ │ Default Range      30d   │ │  pill selector inline
│ └──────────────────────────┘ │
│                              │
│ DISPLAY                      │
│ ┌──────────────────────────┐ │
│ │ Physics Scroll       🔘  │ │  toggle
│ ├──────────────────────────┤ │
│ │ Hide Empty Cards     🔘  │ │
│ └──────────────────────────┘ │
│                              │
│ MAP                          │
│ ┌──────────────────────────┐ │
│ │ Map Theme       Strava › │ │  taps to Map Theme subpage
│ ├──────────────────────────┤ │
│ │ Smooth Flyover       🔘  │ │
│ ├──────────────────────────┤ │
│ │ 3D Terrain           🔘  │ │
│ └──────────────────────────┘ │
│                              │
│ WEATHER                      │
│ ┌──────────────────────────┐ │
│ │ Weather          2 loc › │ │  taps to Weather subpage
│ └──────────────────────────┘ │
│                              │
│ CONNECTIONS                  │
│ ┌──────────────────────────┐ │
│ │ intervals.icu  Connected │ │  taps to ICU subpage
│ ├──────────────────────────┤ │
│ │ Strava      Not Connected│ │  taps to Strava subpage
│ └──────────────────────────┘ │
│                              │
│ CUSTOMIZE                    │
│ ┌──────────────────────────┐ │
│ │ Dashboard Sections     › │ │
│ ├──────────────────────────┤ │
│ │ Activity Sections      › │ │
│ └──────────────────────────┘ │
│                              │
│ DATA                         │
│ ┌──────────────────────────┐ │
│ │ Backup & Restore       › │ │
│ ├──────────────────────────┤ │
│ │ Route Builder API      › │ │
│ └──────────────────────────┘ │
│                              │
│ ABOUT                        │
│ ┌──────────────────────────┐ │
│ │ Share Setup Link         │ │
│ ├──────────────────────────┤ │
│ │ Import Setup Link        │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

### Subpages (pushed via JS, slide from right)
Clicking a `›` row navigates to a subpage rendered inside `#page-settings`, with a back button. Each subpage contains the detailed controls currently on the main page.

**Subpages:**
1. **Account** — Profile photo, athlete name, avatar upload/remove
2. **intervals.icu** — Connection form OR connected card (Data & Storage, Lifetime, Offline, Smart Sync, API Usage)
3. **Strava** — Connection form OR connected card + sync options + history
4. **Weather** — Location list, add, forecast model, clear
5. **Map Theme** — Visual map theme picker (swatches)
6. **Dashboard Sections** — Toggle list
7. **Activity Sections** — Toggle list
8. **Backup & Restore** — Export/import backup, lifetime JSON
9. **Route Builder** — ORS API key input

## Implementation Steps

### Step 1: CSS — iOS Grouped List Styles (~100 lines)
New classes in `styles.css`:
- `.ios-settings` — single-column, max-width 600px, centered, padding 16px
- `.ios-group` — `background: var(--bg-card); border-radius: 12px; overflow: hidden`
- `.ios-group-label` — uppercase, `var(--text-muted)`, `var(--text-2xs)`, `letter-spacing: 0.05em`, padding `8px 16px 6px`
- `.ios-row` — flex, `min-height: 44px`, padding `12px 16px`, separator via `border-bottom: 0.5px solid var(--border)` except `:last-child`
- `.ios-row[data-nav]` — clickable with chevron, cursor pointer
- `.ios-chevron` — `›` character or SVG, `var(--text-muted)`, opacity 0.4
- `.ios-row-value` — right-aligned secondary text
- `.ios-profile-card` — taller row (72px), avatar 48px, two-line text
- `.ios-subpage` — `position: absolute; inset: 0; transform: translateX(100%); transition: transform 0.3s ease`
- `.ios-subpage.active` — `transform: translateX(0)`

### Step 2: HTML — Restructure `#page-settings`
Replace the 2-column `settings-grid` with:
- `.ios-settings` container with main view + hidden subpage containers
- Profile card as first element
- Grouped sections with rows
- Subpage `<div>` elements containing the existing detailed HTML (moved, not rewritten)
- All existing `id` attributes preserved

### Step 3: JS — Subpage Navigation (~30 lines)
- `openSettingsSubpage(id)` — hides main, shows subpage with slide-in
- `closeSettingsSubpage()` — reverse animation
- Wire up `onclick` on navigation rows
- Existing init functions still called on `navigate('settings')`

### Step 4: Migrate controls
- Move existing toggle/pill HTML into new row structure
- Move connection cards, weather, etc. into subpage containers
- No logic changes — only DOM restructuring

### Step 5: Responsive
- Mobile: full width, 16px padding
- Desktop: `max-width: 600px`, centered (iOS Settings on iPad style)

## Design Tokens
- Group bg: `var(--bg-card)`
- Group radius: `12px`
- Row min-height: `44px`
- Row padding: `12px 16px`
- Separator: `0.5px solid var(--border)`, left-indented 16px
- Section label: `var(--text-muted)`, `11px`, uppercase
- Chevron: `var(--text-muted)`, 0.4 opacity
- Profile avatar: `48px`, rounded
- Subpage transition: `300ms cubic-bezier(0.25, 0.1, 0.25, 1)`

## Files Modified
- `index.html` — settings page HTML restructured
- `styles.css` — iOS grouped list styles
- `app.js` — subpage nav functions, settings init
- `sw.js` — bump cache version
