# Unique Info Pages Plan — Activity Card Detail Subpages

Each card's ⓘ info page should be unique with advanced pro analytics.
Activity Data (detailStreamsCard) is ALREADY unique — skip it.

## Implementation Pattern

Each page uses `_openActCardInfo(cardId, info)` which renders into `#actCardInfoPage`.
Add a `customRender` function to `_ACT_CARD_INFO[cardId]` that replaces the generic layout.

```js
_ACT_CARD_INFO.detailXxxCard.customRender = function(page, activity, streams) {
  // Build unique HTML for this card's info page
};
```

## Per-Card Unique Content

### 1. Performance Analysis (detailPerfCard)
- **Hero**: Large EF (Efficiency Factor) gauge with trend arrow
- **Charts**: EF over time (last 30 rides), NP vs HR scatter
- **Advanced**: IF/VI breakdown, aerobic/anaerobic contribution split
- **Insights**: Auto-generated text about ride efficiency

### 2. Aerobic Decoupling (detailDecoupleCard)
- **Hero**: Decoupling % with color gauge (green < 5%, yellow 5-8%, red > 8%)
- **Charts**: First-half vs second-half power/HR overlay, cardiac drift timeline
- **Advanced**: Per-interval decoupling, drift rate per minute
- **Insights**: Aerobic base assessment, recommendations

### 3. L/R Power Balance (detailLRBalanceCard)
- **Hero**: Left/Right gauge with animated balance indicator
- **Charts**: L/R over time (stream), L/R by power zone
- **Advanced**: Torque effectiveness & pedal smoothness if available
- **Insights**: Imbalance patterns, injury risk notes

### 4. Power Zones (detailZonesCard)
- **Hero**: Donut/pie showing zone distribution
- **Charts**: Zone time bars + comparison with last 5 rides
- **Advanced**: Time above/below FTP, zone transition count
- **Insights**: Training type classification, zone target recommendations

### 5. HR Zones (detailHRZonesCard)
- **Hero**: Donut/pie showing HR zone distribution
- **Charts**: HR zone time bars + HR drift timeline
- **Advanced**: Time at max HR, recovery rate between efforts
- **Insights**: Cardiovascular load assessment

### 6. Intervals (detailIntervalsCard)
- **Hero**: Interval consistency score (how uniform were work intervals)
- **Charts**: Stacked horizontal bar chart (work/rest), power/HR per interval bar
- **Advanced**: Fade analysis (are later intervals weaker?), rest quality
- **Insights**: Interval prescription compliance

### 7. Elevation Profile (detailGradientCard)
- **Hero**: Total climbing stats (gain, max grade, VAM)
- **Charts**: Gradient histogram, power vs gradient scatter
- **Advanced**: Climbing category breakdown (HC, Cat 1-4), W/kg on climbs
- **Insights**: Climbing efficiency analysis

### 8. Climbs (detailClimbsCard)
- **Hero**: Number of climbs + total vertical
- **Charts**: Individual climb profiles side by side, VAM comparison
- **Advanced**: Climb categorization (Tour de France style), power curve on climb
- **Insights**: Best climb performance, climbing improvements

### 9. Power Distribution (detailHistogramCard)
- **Hero**: Peak power bucket + time at 0W
- **Charts**: Histogram + cumulative distribution overlay
- **Advanced**: Zone boundary markers, NP position on histogram
- **Insights**: Coasting % analysis, intensity distribution type

### 10. Cadence Distribution (detailCadenceCard)
- **Hero**: Optimal cadence % + peak RPM range
- **Charts**: Histogram + cadence vs power scatter
- **Advanced**: Cadence by terrain (flat vs climb), standing vs seated estimate
- **Insights**: Pedaling efficiency tips

### 11. Power Curve (detailCurveCard)
- **Hero**: Peak values at 5s, 1m, 5m, 20m with W/kg
- **Charts**: Curve + overlay with all-time/season best
- **Advanced**: Fatigue profile (how curve shape compares fresh vs fatigued)
- **Insights**: Rider type from curve shape, improvement areas

### 12. HR Curve (detailHRCurveCard)
- **Hero**: Peak sustained HR at key durations
- **Charts**: HR curve + cardiac drift correlation
- **Advanced**: HR response time, recovery speed analysis
- **Insights**: Max HR validation, cardiac fitness indicators

### 13. Temperature (detailTempCard)
- **Hero**: Avg temp, min/max with weather icon
- **Charts**: Temp timeline + HR overlay (heat impact)
- **Advanced**: Performance adjustment factor for heat/cold
- **Insights**: Temperature impact on HR and power

### 14. How You Compare (detailCompareCard)
- **Already unique** with bar chart comparison — enhance with:
- **Charts**: Metric-by-metric trend over last 10 rides
- **Advanced**: Percentile rank among all your rides
- **Insights**: Which metrics improved/declined most

### 15. Ride Conditions (detailWeatherCard)
- **Hero**: Weather summary with ride comfort score
- **Charts**: Temp + wind over ride duration overlay
- **Advanced**: Headwind/tailwind estimate from speed data
- **Insights**: Weather impact on performance

## CSS Design Tokens (iOS 26 / SwiftUI style)

Each unique page should use:
- `--aci-hero-bg`: surface-1 with subtle gradient
- Hero section: large number + unit + gauge/ring
- Stats grid: 2x2 iOS grouped inset cards
- Charts: edge-to-edge, matching activity page graph style
- Section titles: SF Pro style, uppercase label, 11px, muted
- Smooth section transitions with subtle fade-in on scroll

## Priority Order
1. Power Zones (most viewed)
2. Elevation Profile (most visual impact)
3. Intervals (most actionable)
4. Performance Analysis (most analytical)
5. Power Curve (most comparison value)
6. Rest can follow in any order
