# Cycling App - Features

## 🎯 Major Features

**Dashboard Overview**
- Real-time training metrics: CTL (Chronic Training Load/Fitness), ATL (Acute Training Load/Fatigue), and TSB (Training Stress Balance/Form)
- Visual training status indicator with color-coded glow effect (green = fresh, blue = peaked, orange = fatigued, red = overreached)
- Quick-glance performance summary updated daily

**Activity Management**
- Browse recent activities in a beautiful carousel with map previews and weather data
- Detailed activity pages showing distance, duration, elevation, average speed, pace, power, heart rate data
- Full GPS map visualization with route display
- Weather conditions at the time of activity (temperature, wind speed, conditions)
- Complete metric breakdown and performance analysis

**Goals & Streaks**
- Set and track weekly, monthly, and yearly training goals
- Visual progress cards with time remaining
- Goal status indicators (ahead, on-track, caution, behind)
- Streak tracking for consistency
- Achievement badges for milestones

**Workout Planning & Calendar**
- Interactive calendar for planning and reviewing workouts
- View planned workouts alongside completed activities
- Monthly and weekly navigation
- Integration with your training schedule

**Data Export**
- Download original activity files (FIT, GPX, or source format)
- Export in multiple formats for use with other tools
- Quick access from activity detail pages

**Weather Integration**
- Current conditions with temperature, wind, and weather icons
- 7-day forecast view
- Historical weather for completed activities
- Beautiful weather cards with detailed breakdowns

**Performance Metrics & Analysis**
- Power curve analysis showing peak efforts at various durations
- Heart rate curves and zones
- Pace curves for running activities (with grade-adjusted pace for trails)
- Training load visualization by week and month
- Weekly statistics and trend analysis

**Gear Tracking**
- Log and manage all your equipment (bikes, shoes, trainers, wetsuits)
- Usage statistics and mileage/hours tracking
- Customizable maintenance reminders (distance or time-based)
- Quick access to gear info from activities

**Intervals.icu Integration**
- Seamless data sync with your intervals.icu account
- Real-time metrics and activity data
- Customizable sport settings (FTP, FTHR, pace thresholds)
- Multi-sport support (cycling, running, swimming)

**Wellness Tracking**
- Log daily wellness metrics: HRV, sleep quality, resting heart rate
- Track subjective metrics: fatigue, soreness, mood, motivation, stress
- See how wellness correlates with training
- Daily readiness score

**Responsive Design**
- Fully optimized for mobile and tablet
- Edge-to-edge scrolling carousels (Apple Music style)
- Touch-friendly interface
- Viewport-aware layouts

---

## ✨ Design & UX Polish

**Visual Design**
- Clean, modern interface with smooth animations
- Card-based layout with hover effects and spotlight glow
- Color-coded metrics based on training status
- Consistent typography and spacing throughout
- System-optimized font rendering

**Interactions**
- Smooth page transitions and navigation
- Animated metric counters
- Hover effects on interactive elements (glow spotlight + rim glow)
- Touch-optimized for mobile gestures
- Momentum scrolling on mobile

**Data Presentation**
- TSS (Training Stress Score) badges on recent activities
- Temperature and wind speed indicators with icons
- Weather condition icons integrated into cards
- Compact metric displays with units
- Time-formatted activity data (readable durations)

**Mobile Optimizations**
- Portrait-optimized layouts
- Collapsible sections to save screen space
- Full-width maps on mobile (no wasted gutters)
- Touch-friendly button sizing
- Landscape support for calendar and detailed views

**Accessibility**
- Keyboard navigation support
- Screen reader friendly semantic HTML
- High contrast color scheme
- Clear visual hierarchy

**Performance**
- Cached activity data for instant loading
- Lazy-loaded maps with snapshot caching
- Optimized image handling and compression
- Responsive images based on device
- Smooth 60fps animations

**Settings & Customization**
- Sport-specific thresholds (FTP, FTHR, pace zones)
- Map theme selection (topo, satellite, street)
- Activity filtering by year
- Customizable metric displays
- Credential management

---

## 🔧 Technical Highlights

- Built with vanilla JavaScript (no framework bloat)
- Leaflet.js for high-performance mapping
- Local storage for offline access and caching
- Real-time data sync with intervals.icu API
- Canvas-based visualizations
- Responsive CSS Grid and Flexbox layouts
- Service worker ready for PWA capabilities

---

Perfect for cyclists serious about tracking training, analyzing performance, and staying motivated. Whether you're training for a race, logging daily rides, or just tracking progress—this app gives you the insights you need, beautifully presented.
