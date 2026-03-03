# Vitality Metaball Shader — Data-Driven Behavior Overhaul

## Concept
Transform the static 3-blob shader into a living organism that **feels** different based on training data. Each parameter maps to a visual behavior — glance at it and sense whether you're fresh, tired, building, or overcooked.

## Data Parameters → Visual Mappings

### 1. Blob Size (keep existing)
- CTL → Energy blob radius
- ATL → Fatigue blob radius
- TSB → Readiness blob radius

### 2. Movement Speed — "How active am I?"
- **Weekly ride count**: More rides = faster orbits, fewer = slow dreamy drift
- 0 rides → barely moving, sleepy
- 7+ rides → energetic, buzzing
- Uniform: `u_speed` (0.15 – 1.2)

### 3. Orbit Amplitude — "How much volume?"
- **Weekly hours**: More hours = wider erratic orbits, less = tight centered
- 0h → huddled together
- 15h+ → spread wide, chaotic
- Uniform: `u_orbit` (0.3 – 1.2)

### 4. Pulse / Breathing — "Am I building or detraining?"
- **Ramp rate**: Positive = pulsing/growing, negative = deflating
- rampRate > 3 → noticeable pulse (~8% scale oscillation)
- rampRate ≈ 0 → calm
- rampRate < -3 → slow deflating breath
- Uniform: `u_pulse` (-1 to 1)

### 5. Surface Distortion — "Fatigue texture"
- **ATL/CTL ratio**: High = wobbly stressed surface, low = smooth rested
- ratio < 0.6 → smooth blobs
- ratio > 1.3 → heavy distortion (overreaching)
- Uniform: `u_distortion` (0 – 1)

### 6. Glow Intensity — "Freshness"
- **TSB**: Positive = bright glow aura, negative = dim muted
- TSB +25 → bright (race ready!)
- TSB -30 → almost no glow
- Uniform: `u_glow` (0 – 1)

### 7. Color Saturation — "Streak / consistency"
- **Training streak**: Longer = vivid colors, no streak = washed out
- 0 days → desaturated
- 7+ days → vibrant
- Uniform: `u_saturation` (0.4 – 1.3)

### 8. Background Particles — "Weekly energy"
- **Weekly TSS**: Higher = background sparkle, low = empty
- 0 TSS → nothing
- 600+ TSS → lots of floating specks
- Uniform: `u_particles` (0 – 1)

## New Uniforms
```
u_speed      float  (0.15 – 1.2)
u_orbit      float  (0.3 – 1.2)
u_pulse      float  (-1 to 1)
u_distortion float  (0 – 1)
u_glow       float  (0 – 1)
u_saturation float  (0.4 – 1.3)
u_particles  float  (0 – 1)
```

## Files Changed

### `app.js` only
1. **`renderVitality()`** — Compute all 7 new params from activities + fitness + wellness. Set uniforms.
2. **`_initVitalityShader()`** — New fragment shader with all behaviors. Cache 7 new uniform locations.
3. **`_vitalityAnimLoop()`** — Pass new uniforms each frame.

### No changes to `index.html` or `styles.css`
