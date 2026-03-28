// ── 3D Badge Viewer (Three.js) ──
// Lazy-loads Three.js CDN, creates procedural gold shield badge, interactive spin

let _THREE = null;
let _badgeScene = null;
let _badgeCamera = null;
let _badgeRenderer = null;
let _badgeMesh = null;
let _badgeRaf = null;
let _badgeDragging = false;
let _badgeAutoRotate = true;
let _badgeStartX = 0;
let _badgeStartY = 0;
let _badgeRotX = 0;
let _badgeRotY = 0;

let _GLTFLoader = null;

// ── Shared renderer pool ─────────────────────────────────────────────────────
// One WebGLRenderer reused across rider card, badge card, and badge viewer.
// Creating a WebGL context is expensive (~50-100ms); reusing saves that cost.
let _sharedRenderer = null;
let _sharedRendererCanvas = null; // the canvas currently bound

function _getRenderer(THREE, canvasEl, opts) {
  if (_sharedRenderer && _sharedRendererCanvas === canvasEl) return _sharedRenderer;
  if (_sharedRenderer) {
    try { _sharedRenderer.dispose(); } catch {}
    _sharedRenderer = null;
  }
  _sharedRenderer = new THREE.WebGLRenderer({
    canvas: canvasEl, alpha: true, antialias: true, stencil: true,
    powerPreference: 'high-performance'
  });
  _sharedRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  _sharedRenderer.toneMappingExposure = 1.0;
  _sharedRenderer.sortObjects = false;
  _sharedRenderer.localClippingEnabled = true;
  _sharedRendererCanvas = canvasEl;
  return _sharedRenderer;
}

function _releaseRenderer() {
  // Keep renderer alive for reuse on same canvas, dispose on new canvas
}

// Env map cache with LRU eviction (max 6 badge env maps)
const _ENV_CACHE_MAX = 6;
function _evictEnvCache() {
  const keys = Object.keys(_cachedBadgeEnvTexMap);
  if (keys.length <= _ENV_CACHE_MAX) return;
  const oldest = keys[0];
  try { _cachedBadgeEnvTexMap[oldest].dispose(); } catch {}
  delete _cachedBadgeEnvTexMap[oldest];
}

// ── Cached env maps ──────────────────────────────────────────────────────────
// Env maps are expensive (1024x512 canvas + gradient fills). Cache by type.
let _cachedRiderEnvTex = null;
let _cachedBadgeEnvTexMap = {}; // keyed by badge color hex

// Load Three.js + GLTFLoader via ESM importmap (defined in index.html)
// importmap maps 'three' → three@0.183.0 ESM build on jsDelivr
// Works on all modern browsers: Safari 16.4+, Chrome 89+, Firefox 108+
async function _loadThreeJS() {
  if (_THREE) return _THREE;

  try {
    _THREE = await import('three');
  } catch (e) {
    throw new Error('Failed to load Three.js: ' + e.message);
  }

  if (!_GLTFLoader) {
    try {
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      _GLTFLoader = GLTFLoader;
    } catch (e) {
      console.warn('GLTFLoader not available, using procedural badges');
    }
  }

  return _THREE;
}

// Create a shield-shaped geometry (procedural)
function _createShieldGeometry(THREE) {
  const shape = new THREE.Shape();
  // Shield outline: wide top, narrowing to a point at bottom
  const w = 1.0, h = 1.4;
  shape.moveTo(0, h * 0.45);
  // Top edge (slight curve)
  shape.bezierCurveTo(w * 0.3, h * 0.5, w * 0.8, h * 0.48, w, h * 0.35);
  // Right side curving inward to bottom point
  shape.bezierCurveTo(w * 0.95, h * 0.1, w * 0.6, -h * 0.2, 0, -h * 0.5);
  // Left side (mirror)
  shape.bezierCurveTo(-w * 0.6, -h * 0.2, -w * 0.95, h * 0.1, -w, h * 0.35);
  // Back to top
  shape.bezierCurveTo(-w * 0.8, h * 0.48, -w * 0.3, h * 0.5, 0, h * 0.45);

  const extrudeSettings = {
    depth: 0.15,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelOffset: 0,
    bevelSegments: 8,
    curveSegments: 32,
  };

  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geometry.center();
  return geometry;
}

// Create gold PBR material with rich procedural environment map
function _createGoldMaterial(THREE) {
  // Generate a high-quality environment map with varied brightness for realistic reflections
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size / 2; // equirectangular = 2:1 aspect
  const ctx = canvas.getContext('2d');

  // Dark studio background
  ctx.fillStyle = '#1a1408';
  ctx.fillRect(0, 0, size, size / 2);

  // Warm gradient sky (top portion)
  const skyGrad = ctx.createLinearGradient(0, 0, 0, size / 4);
  skyGrad.addColorStop(0, '#4a3520');
  skyGrad.addColorStop(0.5, '#2a1a0a');
  skyGrad.addColorStop(1, '#0a0804');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, size, size / 4);

  // Bright hotspot (simulates studio softbox — creates specular highlight)
  const hotspot = ctx.createRadialGradient(size * 0.35, size * 0.12, 0, size * 0.35, size * 0.12, size * 0.2);
  hotspot.addColorStop(0, '#ffffff');
  hotspot.addColorStop(0.2, '#fff5e0');
  hotspot.addColorStop(0.5, '#ffcc44');
  hotspot.addColorStop(1, 'transparent');
  ctx.fillStyle = hotspot;
  ctx.fillRect(0, 0, size, size / 2);

  // Second hotspot (fill light — softer, opposite side)
  const hotspot2 = ctx.createRadialGradient(size * 0.75, size * 0.2, 0, size * 0.75, size * 0.2, size * 0.15);
  hotspot2.addColorStop(0, '#ffe0a0');
  hotspot2.addColorStop(0.3, '#cc9933');
  hotspot2.addColorStop(1, 'transparent');
  ctx.fillStyle = hotspot2;
  ctx.fillRect(0, 0, size, size / 2);

  // Bottom reflection (ground bounce — warm)
  const groundGrad = ctx.createLinearGradient(0, size * 0.35, 0, size / 2);
  groundGrad.addColorStop(0, 'transparent');
  groundGrad.addColorStop(1, '#3a2810');
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, size * 0.35, size, size / 2);

  const envTexture = new THREE.CanvasTexture(canvas);
  envTexture.mapping = THREE.EquirectangularReflectionMapping;

  // True gold RGB: slightly darker than pure #FFD700 for realism
  return new THREE.MeshPhysicalMaterial({
    color: 0xD4A843,       // warm gold (not bright yellow)
    metalness: 1.0,
    roughness: 0.12,       // very smooth — more reflective
    envMap: envTexture,
    envMapIntensity: 2.5,  // strong reflections
    clearcoat: 0.8,
    clearcoatRoughness: 0.1,
  });
}

// Create embossed icon on shield face (SVG path → 3D)
function _createIconMesh(THREE, svgPath, scale) {
  // Simple approach: create a plane with the icon as a slightly raised surface
  const iconGeo = new THREE.PlaneGeometry(scale, scale, 1, 1);
  const iconMat = new THREE.MeshPhysicalMaterial({
    color: 0xb8860b,
    metalness: 0.9,
    roughness: 0.3,
    transparent: true,
    opacity: 0.6,
    clearcoat: 0.5,
    clearcoatRoughness: 0.2,
  });
  const mesh = new THREE.Mesh(iconGeo, iconMat);
  mesh.position.z = 0.12; // Slightly in front of shield
  return mesh;
}

// Try loading a GLB model file for a badge
function _loadGLB(THREE, path) {
  return new Promise((resolve, reject) => {
    if (!_GLTFLoader) { reject(new Error('No GLTFLoader')); return; }
    const loader = new _GLTFLoader();
    loader.load(
      path,
      gltf => resolve(gltf),
      undefined,
      err => reject(err)
    );
  });
}

// Badge GLB file mapping — keys are badge IDs, values are paths to .glb files
const BADGE_GLB_MAP = {
  _default: null,
  'b2': 'img/badges/Week_Warrior.glb',
};

// Procedural badge definitions — shape, color, icon SVG path
const BADGE_PROCEDURAL = {
  b1:  { shape: 'circle',  color: 0xff6b35, accent: 0xffaa00, label: 'ON FIRE',       iconPath: 'M12 12c2-2.96 0-7-1-8 0 3.038-1.773 4.741-3 6-1.226 1.26-2 3.24-2 5a6 6 0 1 0 12 0c0-1.532-1.056-3.94-2-5-1.786 3-2.791 3-4 2z', holo: 'flame' },
  b2:  { shape: 'shield',  color: 0x00e5a0, accent: 0x44ffbb, label: 'WARRIOR',       iconPath: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', holo: 'chevron' },
  b3:  { shape: 'diamond', color: 0x9b59ff, accent: 0xcc88ff, label: 'DIAMOND',       iconPath: 'M6 3h12l4 6-10 12L2 9z', holo: 'diamond' },
  b4:  { shape: 'shield',  color: 0xffd700, accent: 0xffee88, label: 'KING',          iconPath: 'm2 4 3 12h14l3-12-5 4-5-6-5 6Z', holo: 'crown' },
  b5:  { shape: 'hexagon', color: 0x4a9eff, accent: 0x88ccff, label: 'GRINDER',       iconPath: 'M13 2 3 14h9l-1 8 10-12h-9l1-8z', holo: 'bolt' },
  b6:  { shape: 'circle',  color: 0x9b59ff, accent: 0xbb88ff, label: 'MONTH',         iconPath: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z', holo: 'ripple' },
  b7:  { shape: 'star',    color: 0xffd700, accent: 0xffee44, label: 'BEST WEEK',     iconPath: 'M6 9H4.5a2.5 2.5 0 0 1 0-5H6 M18 9h1.5a2.5 2.5 0 0 0 0-5H18 M4 22h16 M18 2H6v7a6 6 0 0 0 12 0V2z', holo: 'starburst' },
  b8:  { shape: 'hexagon', color: 0x00e5a0, accent: 0x44ffbb, label: '100 CLUB',      iconPath: 'M18.5 17.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0zM5.5 17.5a3.5 3.5 0 1 1-7 0', holo: 'grid' },
  b9:  { shape: 'circle',  color: 0x4a9eff, accent: 0x88bbff, label: 'HALF YEAR',     iconPath: 'M3 4h18v18H3zM16 2v4M8 2v4M3 10h18', holo: 'wave', scene: 'mountain' },
  b10: { shape: 'star',    color: 0xffd700, accent: 0xffdd66, label: 'CONSISTENT',    iconPath: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01z', holo: 'starburst' },
  b11: { shape: 'shield',  color: 0x88ccff, accent: 0xbbddff, label: 'WINTER',        iconPath: 'M2 12h20M12 2v20 M20 16l-4-4 4-4M4 8l4 4-4 4M16 4l-4 4-4-4M8 20l4-4 4 4', holo: 'frost' },
  b12: { shape: 'circle',  color: 0xff9500, accent: 0xffcc44, label: 'SUMMER',        iconPath: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41', holo: 'sunray' },
  // Distance milestones
  b13: { shape: 'hexagon', color: 0x00ccff, accent: 0x66ddff, label: 'EXPLORER',      iconPath: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z', holo: 'ripple' },
  b14: { shape: 'star',    color: 0xff2a6d, accent: 0xff6699, label: 'IRONLEGS',      iconPath: 'M18 20V10M12 20V4M6 20v-6', holo: 'bolt' },
  b15: { shape: 'diamond', color: 0x00e5a0, accent: 0x44ffcc, label: 'MARATHON',      iconPath: 'M22 12h-4l-3 9L9 3l-3 9H2', holo: 'wave' },
  // Climbing
  b16: { shape: 'shield',  color: 0xff6b35, accent: 0xff9966, label: 'CLIMBER',       iconPath: 'M8 6l4-4 4 4M4 18l4-4 4 4 4-4 4 4', holo: 'chevron' },
  b17: { shape: 'star',    color: 0xffd700, accent: 0xffee88, label: 'EVEREST',       iconPath: 'M2 20L8.5 8 12 14l3-4 7 10z', holo: 'crown' },
  // Speed
  b18: { shape: 'hexagon', color: 0xff2a6d, accent: 0xff5588, label: 'SPEEDSTER',     iconPath: 'M13 2l-1 5h5l-6 9 1-5H7l6-9z', holo: 'bolt' },
  // Time on bike
  b19: { shape: 'circle',  color: 0x9b59ff, accent: 0xbb88ff, label: 'SADDLE TIME',   iconPath: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 6v4l3 3', holo: 'ripple' },
  b20: { shape: 'shield',  color: 0x00e5a0, accent: 0x44ffbb, label: 'ENDURANCE',     iconPath: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 6v4l3 3', holo: 'grid' },
  // Special occasions
  b21: { shape: 'star',    color: 0xff2a6d, accent: 0xff6699, label: 'VALENTINE',     iconPath: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z', holo: 'starburst' },
  b22: { shape: 'diamond', color: 0xff9500, accent: 0xffcc44, label: 'SPOOKY',        iconPath: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-1-1 1-1zm4 0l1-1-1-1zM8.5 9a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm7 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z', holo: 'flame' },
  b23: { shape: 'circle',  color: 0x00ccff, accent: 0x88ddff, label: 'NYE RIDE',      iconPath: 'M5 8l4 4-4 4M12 4v16M15 8l4 4-4 4', holo: 'frost' },
  b24: { shape: 'star',    color: 0xffd700, accent: 0xffee44, label: 'XMAS RIDE',     iconPath: 'M12 2l1 7h5l-4 4 2 7-6-4-6 4 2-7-4-4h5z', holo: 'starburst' },
  // Ride count milestones
  b25: { shape: 'hexagon', color: 0x4a9eff, accent: 0x88ccff, label: 'FIRST RIDE',    iconPath: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z', holo: 'wave' },
  b26: { shape: 'shield',  color: 0x9b59ff, accent: 0xcc88ff, label: '500 CLUB',      iconPath: 'M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z', holo: 'diamond' },
  // Early bird / night owl
  b27: { shape: 'circle',  color: 0xff9500, accent: 0xffbb44, label: 'EARLY BIRD',    iconPath: 'M12 2v4M4.93 4.93l2.83 2.83M2 12h4M12 18a6 6 0 0 0 0-12', holo: 'sunray' },
  b28: { shape: 'circle',  color: 0x4a9eff, accent: 0x6688ff, label: 'NIGHT OWL',     iconPath: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79zM12 8v4l2 2', holo: 'ripple' },
};

// Create procedural badge shape geometry
function _createBadgeShape(THREE, type) {
  const shape = new THREE.Shape();
  if (type === 'circle') {
    const r = 1.2, segs = 48;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y);
    }
  } else if (type === 'hexagon') {
    const r = 1.2;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y);
    }
    shape.closePath();
  } else if (type === 'diamond') {
    const w = 1.1, h = 1.4;
    shape.moveTo(0, h); shape.lineTo(w, 0); shape.lineTo(0, -h); shape.lineTo(-w, 0); shape.closePath();
  } else if (type === 'star') {
    const outer = 1.3, inner = 0.55, points = 5;
    for (let i = 0; i < points * 2; i++) {
      const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? outer : inner;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y);
    }
    shape.closePath();
  } else { // shield
    return _createShieldGeometry(THREE);
  }
  return new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 6, curveSegments: 32 });
}

// Create procedural badge face texture
function _createBadgeFaceTexture(THREE, def, size) {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Dark metallic base
  const bg = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  const r = (def.color >> 16) & 255, g = (def.color >> 8) & 255, b = def.color & 255;
  bg.addColorStop(0, `rgb(${Math.round(r*0.3)},${Math.round(g*0.3)},${Math.round(b*0.3)})`);
  bg.addColorStop(0.7, `rgb(${Math.round(r*0.15)},${Math.round(g*0.15)},${Math.round(b*0.15)})`);
  bg.addColorStop(1, `rgb(${Math.round(r*0.08)},${Math.round(g*0.08)},${Math.round(b*0.08)})`);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);


  // Icon — centered, large, SVG paths use 0-24 coordinate space
  ctx.save();
  const iconScale = size / 28;
  ctx.translate(size/2 - 12 * iconScale, size*0.28 - 12 * iconScale);
  ctx.scale(iconScale, iconScale);
  const path = new Path2D(def.iconPath);
  // Shadow for depth
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 2;
  ctx.strokeStyle = `rgba(${Math.min(255,r+80)},${Math.min(255,g+80)},${Math.min(255,b+80)},0.8)`;
  ctx.lineWidth = 1.2;
  ctx.stroke(path);
  ctx.shadowBlur = 0;
  // Bright gradient fill
  const iconGrad = ctx.createLinearGradient(0, 0, 24, 24);
  iconGrad.addColorStop(0, `rgba(${Math.min(255,r+120)},${Math.min(255,g+120)},${Math.min(255,b+120)},0.7)`);
  iconGrad.addColorStop(1, `rgba(${r},${g},${b},0.4)`);
  ctx.fillStyle = iconGrad;
  ctx.fill(path);
  ctx.restore();

  // Label — centered, bigger
  ctx.font = `800 ${size*0.12}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = `rgba(${Math.min(255,r+100)},${Math.min(255,g+100)},${Math.min(255,b+100)},0.7)`;
  ctx.fillText(def.label, size/2, size*0.82);

  return new THREE.CanvasTexture(canvas);
}

// Create procedural badge normal map
function _createBadgeNormalMap(THREE, def, size) {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgb(128,128,255)';
  ctx.fillRect(0, 0, size, size);
  // Emboss the icon — same positioning as face texture
  ctx.save();
  const nIconScale = size / 28;
  ctx.translate(size/2 - 12 * nIconScale, size*0.28 - 12 * nIconScale);
  ctx.scale(nIconScale, nIconScale);
  const npath = new Path2D(def.iconPath);
  ctx.fillStyle = 'rgb(90,90,255)';
  ctx.translate(-1.5, -1.5);
  ctx.fill(npath);
  ctx.translate(3, 3);
  ctx.fillStyle = 'rgb(166,166,255)';
  ctx.fill(npath);
  ctx.restore();
  // Emboss label
  ctx.font = `800 ${size*0.12}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgb(110,110,255)';
  ctx.fillText(def.label, size/2 - 1, size*0.82 - 1);
  ctx.fillStyle = 'rgb(146,146,255)';
  ctx.fillText(def.label, size/2 + 1, size*0.82 + 1);
  return new THREE.CanvasTexture(canvas);
}

// Initialize the 3D scene in a canvas
export async function initBadge3D(canvasEl, badgeId) {
  const THREE = await _loadThreeJS();

  // Ensure canvas has dimensions
  let w = canvasEl.clientWidth;
  let h = canvasEl.clientHeight;
  if (!w || w < 50) w = canvasEl.parentElement?.clientWidth || 280;
  if (!h || h < 50) h = 280;
  canvasEl.width = w * Math.min(window.devicePixelRatio, 2.0);
  canvasEl.height = h * Math.min(window.devicePixelRatio, 2.0);
  canvasEl.style.width = w + 'px';
  canvasEl.style.height = h + 'px';

  // Scene
  _badgeScene = new THREE.Scene();

  // Camera
  _badgeCamera = new THREE.PerspectiveCamera(35, w / h, 0.1, 100);
  _badgeCamera.position.set(0, 0, 4.5);

  // Renderer
  _badgeRenderer = new THREE.WebGLRenderer({
    canvas: canvasEl,
    alpha: true,
    antialias: true,
  });
  _badgeRenderer.setSize(w, h);
  _badgeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));
  _badgeRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  _badgeRenderer.toneMappingExposure = 1.2;

  // Lighting — studio setup for gold
  // Dramatic studio lighting — deep shadows, strong highlights
  const ambientLight = new THREE.AmbientLight(0x1a1408, 0.15);
  _badgeScene.add(ambientLight);

  // Key light (high right, hard — strong specular, casts deep shadows)
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
  keyLight.position.set(5, 6, 2);
  _badgeScene.add(keyLight);

  // Fill light (low left, very dim — just enough to see shadow side)
  const fillLight = new THREE.DirectionalLight(0xffc850, 0.15);
  fillLight.position.set(-4, -1, 2);
  _badgeScene.add(fillLight);

  // Rim light (behind + above, strong — dramatic edge separation)
  const rimLight = new THREE.DirectionalLight(0xffe8a0, 1.8);
  rimLight.position.set(-2, 3, -5);
  _badgeScene.add(rimLight);

  // Top spot (narrow, intense — hero highlight on badge face)
  const spotLight = new THREE.SpotLight(0xffffff, 3.0, 15, Math.PI / 8, 0.6, 1.5);
  spotLight.position.set(1, 7, 3);
  spotLight.target.position.set(0, 0, 0);
  _badgeScene.add(spotLight);
  _badgeScene.add(spotLight.target);

  // No bottom bounce — let the underside go dark for drama

  // Try loading GLB model first, fall back to procedural shield
  const glbPath = BADGE_GLB_MAP[badgeId] || BADGE_GLB_MAP._default;
  let loaded = false;

  if (glbPath && _GLTFLoader) {
    try {
      const gltf = await _loadGLB(THREE, glbPath);
      _badgeMesh = gltf.scene;

      // Apply gold material to all meshes that have no texture
      const goldMat = _createGoldMaterial(THREE);
      _badgeMesh.traverse(child => {
        if (child.isMesh) {
          const mat = child.material;
          // If model has no texture map, apply our gold PBR material
          if (!mat.map && !mat.normalMap && !mat.roughnessMap) {
            child.material = goldMat;
          }
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      // Auto-center and scale the model
      const box = new THREE.Box3().setFromObject(_badgeMesh);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = 2.5 / maxDim;
      _badgeMesh.scale.setScalar(scale);
      _badgeMesh.position.sub(center.multiplyScalar(scale));
      _badgeScene.add(_badgeMesh);
      loaded = true;
      console.log('Loaded GLB badge:', glbPath, '| meshes:', gltf.scene.children.length);
    } catch (e) {
      console.warn('GLB load failed, using procedural:', e.message);
    }
  }

  // Fallback: procedural badge with unique shape + colors per achievement
  if (!loaded) {
    const def = BADGE_PROCEDURAL[badgeId];
    if (def) {
      const geo = _createBadgeShape(THREE, def.shape);
      geo.center();
      // Fix UV mapping — map position to 0-1 range so texture fills face
      const bPos = geo.attributes.position;
      const bUv = geo.attributes.uv;
      const bbox = geo.boundingBox || geo.computeBoundingBox() || geo.boundingBox;
      const bMin = bbox.min, bMax = bbox.max;
      const bW = bMax.x - bMin.x, bH = bMax.y - bMin.y;
      for (let i = 0; i < bUv.count; i++) {
        const x = bPos.getX(i), y = bPos.getY(i);
        bUv.setXY(i, (x - bMin.x) / bW, (y - bMin.y) / bH);
      }
      geo.attributes.uv.needsUpdate = true;
      const texSize = 512;
      const faceTex = _createBadgeFaceTexture(THREE, def, texSize);
      const normTex = _createBadgeNormalMap(THREE, def, texSize);
      if (_badgeRenderer) {
        const maxAniso = _badgeRenderer.capabilities.getMaxAnisotropy();
        faceTex.anisotropy = maxAniso;
        normTex.anisotropy = maxAniso;
      }

      // Rich env map for this badge's color
      const envC = document.createElement('canvas');
      envC.width = 512; envC.height = 256;
      const ec = envC.getContext('2d');
      ec.fillStyle = '#0a0a0a';
      ec.fillRect(0, 0, 512, 256);
      // Center softbox
      const sb = ec.createRadialGradient(256, 128, 0, 256, 128, 200);
      sb.addColorStop(0, '#ffffff');
      sb.addColorStop(0.3, '#dddddd');
      sb.addColorStop(0.6, '#444444');
      sb.addColorStop(1, 'transparent');
      ec.fillStyle = sb;
      ec.fillRect(0, 0, 512, 256);
      // Colored accent light
      const r = (def.accent >> 16) & 255, g = (def.accent >> 8) & 255, b = def.accent & 255;
      const ac = ec.createRadialGradient(100, 60, 0, 100, 60, 100);
      ac.addColorStop(0, `rgba(${r},${g},${b},0.5)`);
      ac.addColorStop(1, 'transparent');
      ec.fillStyle = ac;
      ec.fillRect(0, 0, 512, 256);
      const envTex = new THREE.CanvasTexture(envC);
      envTex.mapping = THREE.EquirectangularReflectionMapping;

      const mat = new THREE.MeshPhysicalMaterial({
        map: faceTex, normalMap: normTex, normalScale: new THREE.Vector2(0.8, 0.8),
        metalness: 0.85, roughness: 0.15, envMap: envTex, envMapIntensity: 1.5,
        clearcoat: 0.8, clearcoatRoughness: 0.1,
        iridescence: 1.0, iridescenceIOR: 1.3,
      });
      // Edge material — silver chrome
      const edgeMat = new THREE.MeshPhysicalMaterial({
        color: def.color, metalness: 1.0, roughness: 0.1, envMap: envTex, envMapIntensity: 1.8,
        clearcoat: 0.8, clearcoatRoughness: 0.1,
      });

      _badgeMesh = new THREE.Mesh(geo, [mat, edgeMat]);
      _badgeMesh.rotation.x = 0.1;
      _badgeScene.add(_badgeMesh);
    } else {
      // Ultimate fallback — gold shield
      const shieldGeo = _createShieldGeometry(THREE);
      const goldMat = _createGoldMaterial(THREE);
      _badgeMesh = new THREE.Mesh(shieldGeo, goldMat);
      _badgeMesh.rotation.x = 0.1;
      _badgeScene.add(_badgeMesh);
    }
  }

  // Default front-facing rotation (slight tilt for depth)
  const REST_X = 0.08;
  const REST_Y = 0;

  // Spring physics state — soft, luxurious return with gentle overshoot
  let velX = 0, velY = 0;
  const SPRING = 0.015;   // very soft pull back
  const DAMPING = 0.96;   // slow, cinematic settle
  const OVERSHOOT = 1.3;

  if (_badgeMesh) {
    _badgeMesh.rotation.x = REST_X;
    _badgeMesh.rotation.y = REST_Y;
  }

  _badgeDragging = false;
  _badgeAutoRotate = false; // no auto-rotate, badge faces front

  _animate_spring(REST_X, REST_Y, SPRING, DAMPING);
  _setupBadgeInteraction_spring(canvasEl, REST_X, REST_Y, SPRING, DAMPING);
}

// Spring-back animation loop
let _springRestX = 0, _springRestY = 0, _springK = 0.08, _springD = 0.82;
let _velX = 0, _velY = 0;

function _animate_spring(restX, restY, spring, damping) {
  _springRestX = restX;
  _springRestY = restY;
  _springK = spring;
  _springD = damping;
  _velX = 0;
  _velY = 0;

  function loop() {
    _badgeRaf = requestAnimationFrame(loop);
    if (!_badgeMesh) return;

    if (!_badgeDragging) {
      // Spring force towards rest position
      const dx = _springRestX - _badgeMesh.rotation.x;
      const dy = _springRestY - _badgeMesh.rotation.y;

      // Apply spring acceleration
      _velX += dx * _springK;
      _velY += dy * _springK;

      // Apply damping
      _velX *= _springD;
      _velY *= _springD;

      // Update rotation
      _badgeMesh.rotation.x += _velX;
      _badgeMesh.rotation.y += _velY;

      // Add subtle idle wobble when nearly at rest (alive feel)
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist < 0.01) {
        const t = Date.now() * 0.001;
        _badgeMesh.rotation.y = _springRestY + Math.sin(t * 0.8) * 0.015;
        _badgeMesh.rotation.x = _springRestX + Math.sin(t * 0.6 + 1) * 0.015;
      }
    }

    if (_badgeRenderer && _badgeScene && _badgeCamera) {
      _badgeRenderer.render(_badgeScene, _badgeCamera);
    }
  }
  loop();
}

function _setupBadgeInteraction_spring(canvasEl) {
  let lastX = 0, lastY = 0;

  canvasEl.addEventListener('pointerdown', e => {
    _badgeDragging = true;
    _velX = 0;
    _velY = 0;
    lastX = e.clientX;
    lastY = e.clientY;
    canvasEl.setPointerCapture(e.pointerId);
    canvasEl.style.cursor = 'grabbing';
  });

  canvasEl.addEventListener('pointermove', e => {
    if (!_badgeDragging || !_badgeMesh) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    _badgeMesh.rotation.y += dx * 0.012;
    _badgeMesh.rotation.x += dy * 0.008;
    // Allow full rotation on Y, limit X tilt
    _badgeMesh.rotation.x = Math.max(-1.0, Math.min(1.0, _badgeMesh.rotation.x));
    lastX = e.clientX;
    lastY = e.clientY;
  });

  const endDrag = (e) => {
    _badgeDragging = false;
    canvasEl.style.cursor = 'grab';
    // Give spring some initial velocity from last drag movement for natural feel
  };
  canvasEl.addEventListener('pointerup', endDrag);
  canvasEl.addEventListener('pointercancel', endDrag);
}

// Cleanup
export function destroyBadge3D() {
  if (_badgeRaf) cancelAnimationFrame(_badgeRaf);
  _badgeRaf = null;
  if (_badgeRenderer) _badgeRenderer.dispose();
  _badgeRenderer = null;
  _badgeScene = null;
  _badgeCamera = null;
  _badgeMesh = null;
}

// Resize handler
export function resizeBadge3D(canvasEl) {
  if (!_badgeRenderer || !_badgeCamera) return;
  const w = canvasEl.clientWidth || 280;
  const h = canvasEl.clientHeight || 320;
  _badgeRenderer.setSize(w, h);
  _badgeCamera.aspect = w / h;
  _badgeCamera.updateProjectionMatrix();
}

// ─────────────────────────────────────────────────────────────────────────────
// 3D RIDER CARD — Credit card style, interactive tilt
// ─────────────────────────────────────────────────────────────────────────────

let _rcScene, _rcCamera, _rcRenderer, _rcMesh, _rcRaf, _rcCanvas = null;
let _rcDragging = false, _rcStartX = 0, _rcStartY = 0, _rcRotX = 0, _rcRotY = 0;
let _rcTrail = [];
let _rcDragVelX = 0, _rcDragVelY = 0;
let _rcReleaseTime = 0, _rcSpinning = false, _rcIdle = false, _rcAutoSpin = false, _rcAutoSpinStart = 0;
let _rcFrameSkip = 0;
let _rcAbort = null;

export async function initRiderCard3D(canvasEl, data) {
  const THREE = await _loadThreeJS();

  _rcCanvas = canvasEl;
  let w = canvasEl.clientWidth || 340;
  let h = canvasEl.clientHeight || 220;
  canvasEl.width = w * Math.min(window.devicePixelRatio, 2.0);
  canvasEl.height = h * Math.min(window.devicePixelRatio, 2.0);
  canvasEl.style.width = w + 'px';
  canvasEl.style.height = h + 'px';

  _rcScene = new THREE.Scene();
  _rcCamera = new THREE.PerspectiveCamera(30, w / h, 0.1, 100);
  _rcCamera.position.set(0, 0, 6.2);

  _rcRenderer = _getRenderer(THREE, canvasEl);
  _rcRenderer.setSize(w, h);
  _rcRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));

  // Lighting — bright enough for matte card, chrome pops on edges
  _rcScene.add(new THREE.AmbientLight(0x333344, 0.8));
  const key = new THREE.DirectionalLight(0xffffff, 3.0);
  key.position.set(3, 5, 4);
  _rcScene.add(key);
  const fill = new THREE.DirectionalLight(0xeeeeff, 1.2);
  fill.position.set(-2, 2, 5);
  _rcScene.add(fill);
  const rim = new THREE.DirectionalLight(0x4a9eff, 1.5);
  rim.position.set(-4, 3, -5);
  _rcScene.add(rim);

  // Card geometry — vertical name tag with rounded corners
  const cardW = 1.8, cardH = 2.6, cardD = 0.005, cardR = 0.18;
  const shape = new THREE.Shape();
  const hw = cardW / 2, hh = cardH / 2, r = cardR;
  shape.moveTo(-hw + r, -hh);
  shape.lineTo(hw - r, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
  shape.lineTo(hw, hh - r);
  shape.quadraticCurveTo(hw, hh, hw - r, hh);
  shape.lineTo(-hw + r, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
  shape.lineTo(-hw, -hh + r);
  shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  const cardGeo = new THREE.ExtrudeGeometry(shape, { depth: cardD, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 6, curveSegments: 16 });
  cardGeo.center();
  // Fix UV mapping per face group
  const pos = cardGeo.attributes.position;
  const uv = cardGeo.attributes.uv;
  const norm = cardGeo.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const nz = norm.getZ(i);
    if (nz > 0.5) {
      // Front face — normal UV
      uv.setXY(i, (x + hw) / cardW, (y + hh) / cardH);
    } else if (nz < -0.5) {
      // Back face — flip X so texture isn't mirrored
      uv.setXY(i, 1 - (x + hw) / cardW, (y + hh) / cardH);
    }
  }
  cardGeo.attributes.uv.needsUpdate = true;

  // Card material — dark metallic with accent edge glow (cached env map)
  if (!_cachedRiderEnvTex) {
  const envCanvas = document.createElement('canvas');
  const eW = 1024, eH = 512;
  envCanvas.width = eW; envCanvas.height = eH;
  const ctx = envCanvas.getContext('2d');

  const base = ctx.createLinearGradient(0, 0, 0, eH);
  base.addColorStop(0, '#141414');
  base.addColorStop(0.4, '#0a0a0a');
  base.addColorStop(0.7, '#080808');
  base.addColorStop(1, '#0c0c0c');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, eW, eH);

  // Main softbox — big bright center
  const sb1 = ctx.createRadialGradient(eW * 0.5, eH * 0.5, 0, eW * 0.5, eH * 0.5, eW * 0.35);
  sb1.addColorStop(0, '#ffffff');
  sb1.addColorStop(0.15, '#ffffff');
  sb1.addColorStop(0.35, '#d0d0ff');
  sb1.addColorStop(0.6, '#606090');
  sb1.addColorStop(1, 'transparent');
  ctx.fillStyle = sb1;
  ctx.fillRect(0, 0, eW, eH);

  // Upper fill — slightly above center
  const sb1b = ctx.createRadialGradient(eW * 0.5, eH * 0.3, 0, eW * 0.5, eH * 0.3, eW * 0.25);
  sb1b.addColorStop(0, '#ffffff');
  sb1b.addColorStop(0.3, '#e8eeff');
  sb1b.addColorStop(1, 'transparent');
  ctx.fillStyle = sb1b;
  ctx.fillRect(0, 0, eW, eH);

  // Warm key — right, orange/gold
  const sb2 = ctx.createRadialGradient(eW * 0.82, eH * 0.35, 0, eW * 0.82, eH * 0.35, eW * 0.14);
  sb2.addColorStop(0, '#ffcc44');
  sb2.addColorStop(0.3, '#ff9922');
  sb2.addColorStop(0.7, '#663300');
  sb2.addColorStop(1, 'transparent');
  ctx.fillStyle = sb2;
  ctx.fillRect(0, 0, eW, eH);

  // Vibrant green — left
  const sb3 = ctx.createRadialGradient(eW * 0.12, eH * 0.4, 0, eW * 0.12, eH * 0.4, eW * 0.12);
  sb3.addColorStop(0, '#00ff88');
  sb3.addColorStop(0.3, '#00cc66');
  sb3.addColorStop(1, 'transparent');
  ctx.fillStyle = sb3;
  ctx.fillRect(0, 0, eW, eH);

  // Electric blue — bottom left
  const sb4 = ctx.createRadialGradient(eW * 0.2, eH * 0.75, 0, eW * 0.2, eH * 0.75, eW * 0.15);
  sb4.addColorStop(0, '#2288ff');
  sb4.addColorStop(0.4, '#1144cc');
  sb4.addColorStop(1, 'transparent');
  ctx.fillStyle = sb4;
  ctx.fillRect(0, 0, eW, eH);

  // Hot pink — top right
  const sb5 = ctx.createRadialGradient(eW * 0.78, eH * 0.15, 0, eW * 0.78, eH * 0.15, eW * 0.1);
  sb5.addColorStop(0, '#ff2266');
  sb5.addColorStop(0.4, '#aa1144');
  sb5.addColorStop(1, 'transparent');
  ctx.fillStyle = sb5;
  ctx.fillRect(0, 0, eW, eH);

  // Purple — bottom right
  const sb6 = ctx.createRadialGradient(eW * 0.85, eH * 0.7, 0, eW * 0.85, eH * 0.7, eW * 0.12);
  sb6.addColorStop(0, '#9944ff');
  sb6.addColorStop(0.4, '#5522aa');
  sb6.addColorStop(1, 'transparent');
  ctx.fillStyle = sb6;
  ctx.fillRect(0, 0, eW, eH);

  // Cyan spot — top left
  const sb7 = ctx.createRadialGradient(eW * 0.15, eH * 0.15, 0, eW * 0.15, eH * 0.15, eW * 0.08);
  sb7.addColorStop(0, '#00ddff');
  sb7.addColorStop(0.5, '#0088aa');
  sb7.addColorStop(1, 'transparent');
  ctx.fillStyle = sb7;
  ctx.fillRect(0, 0, eW, eH);

  // Scattered small hotspots — creates intricate reflections on chrome
  const spots = [
    [0.3, 0.2, 40, '#ffffff'], [0.7, 0.6, 30, '#ffe0a0'], [0.6, 0.15, 25, '#aaffcc'],
    [0.4, 0.8, 35, '#88aaff'], [0.9, 0.5, 20, '#ffaacc'], [0.1, 0.6, 25, '#aaeeff'],
    [0.55, 0.7, 30, '#ffcc88'], [0.35, 0.45, 20, '#ccffcc'], [0.65, 0.35, 25, '#ffbbdd'],
    [0.45, 0.15, 15, '#ffffff'], [0.8, 0.45, 20, '#ddddff'], [0.25, 0.55, 18, '#aaddff'],
  ];
  spots.forEach(([x, y, r, col]) => {
    const s = ctx.createRadialGradient(eW * x, eH * y, 0, eW * x, eH * y, r);
    s.addColorStop(0, col);
    s.addColorStop(1, 'transparent');
    ctx.fillStyle = s;
    ctx.fillRect(0, 0, eW, eH);
  });


  // Rainbow iridescent band
  const rainbow = ctx.createLinearGradient(0, 0, eW, 0);
  rainbow.addColorStop(0, 'rgba(255,0,80,0.15)');
  rainbow.addColorStop(0.17, 'rgba(255,160,0,0.15)');
  rainbow.addColorStop(0.33, 'rgba(255,255,0,0.12)');
  rainbow.addColorStop(0.5, 'rgba(0,255,140,0.15)');
  rainbow.addColorStop(0.67, 'rgba(0,150,255,0.15)');
  rainbow.addColorStop(0.83, 'rgba(150,0,255,0.15)');
  rainbow.addColorStop(1, 'rgba(255,0,120,0.15)');
  ctx.fillStyle = rainbow;
  ctx.fillRect(0, eH * 0.25, eW, eH * 0.5);

  _cachedRiderEnvTex = new THREE.CanvasTexture(envCanvas);
  _cachedRiderEnvTex.mapping = THREE.EquirectangularReflectionMapping;
  }
  const envTex = _cachedRiderEnvTex;

  // Front face texture — vertical name tag layout
  const faceCanvas = document.createElement('canvas');
  const fW = 720, fH = Math.round(fW * (cardH / cardW));
  faceCanvas.width = fW; faceCanvas.height = fH;
  const fc = faceCanvas.getContext('2d');

  // Background — flat dark
  fc.fillStyle = '#080808';
  fc.fillRect(0, 0, fW, fH);
  // Dither noise to break up color banding
  const dither = fc.getImageData(0, 0, fW, fH);
  const d = dither.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = Math.random() * 6 - 3;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i+1] = Math.max(0, Math.min(255, d[i+1] + n));
    d[i+2] = Math.max(0, Math.min(255, d[i+2] + n));
  }
  fc.putImageData(dither, 0, 0);

  // Shared chrome gradient for logo + level number
  const chromeGrad = fc.createLinearGradient(0, 0, fW, fH);
  chromeGrad.addColorStop(0, 'rgba(180,180,200,0.35)');
  chromeGrad.addColorStop(0.3, 'rgba(255,255,255,0.5)');
  chromeGrad.addColorStop(0.5, 'rgba(120,200,180,0.4)');
  chromeGrad.addColorStop(0.7, 'rgba(255,255,255,0.5)');
  chromeGrad.addColorStop(1, 'rgba(150,170,200,0.3)');

  // App name — top right, clean white
  fc.font = '700 32px Inter, system-ui, sans-serif';
  fc.fillStyle = 'rgba(255,255,255,0.5)';
  fc.textAlign = 'right';
  fc.fillText('CycleIQ', fW - 60, 55);

  // Level — Apple-style premium number
  fc.font = '800 280px Inter, system-ui, sans-serif';
  fc.textAlign = 'center';
  const lvlStr = String(data.level || '0');
  const lvlX = fW / 2, lvlY = fH * 0.56;

  // Layer 1: Dark inner body — base color
  fc.fillStyle = 'rgba(40,40,50,0.5)';
  fc.fillText(lvlStr, lvlX, lvlY);

  // Layer 3: Main gold/chrome gradient fill
  const goldGrad = fc.createLinearGradient(0, 0, fW, fH);
  goldGrad.addColorStop(0, 'rgba(220,200,160,0.6)');
  goldGrad.addColorStop(0.25, 'rgba(255,255,240,0.7)');
  goldGrad.addColorStop(0.5, 'rgba(180,160,120,0.5)');
  goldGrad.addColorStop(0.75, 'rgba(255,250,230,0.65)');
  goldGrad.addColorStop(1, 'rgba(160,140,100,0.4)');
  fc.fillStyle = goldGrad;
  fc.fillText(lvlStr, lvlX, lvlY);

  // Layer 4: Specular highlight — bright line across top third
  fc.save();
  fc.beginPath();
  fc.rect(0, lvlY - 250, fW, 120);
  fc.clip();
  fc.fillStyle = 'rgba(255,255,255,0.35)';
  fc.fillText(lvlStr, lvlX, lvlY);
  fc.restore();

  // Layer 5: Soft accent glow
  fc.shadowColor = 'rgba(0,229,160,0.3)';
  fc.shadowBlur = 30;
  fc.fillStyle = 'rgba(0,229,160,0.05)';
  fc.fillText(lvlStr, lvlX, lvlY);
  fc.shadowBlur = 0; fc.shadowColor = 'transparent';

  // Rider name — centered, prominent
  fc.font = '700 58px Inter, system-ui, sans-serif';
  fc.fillStyle = '#ffffff';
  fc.textAlign = 'center';
  fc.fillText(data.name || 'Cyclist', fW / 2, fH * 0.17);

  // Level title — below name, with more gap
  fc.font = '500 38px Inter, system-ui, sans-serif';
  fc.fillStyle = '#00e5a0';
  fc.fillText(data.title || 'Rider', fW / 2, fH * 0.17 + 55);

  // XP bar — centered
  const barW = fW - 100, barX = 50, barY = fH * 0.74, barH = 24;
  fc.fillStyle = 'rgba(255,255,255,0.08)';
  fc.beginPath(); fc.rect(barX, barY, barW, barH); fc.fill();
  const pct = data.xpPct || 0;
  fc.fillStyle = '#00e5a0';
  fc.beginPath(); fc.rect(barX, barY, barW * pct, barH); fc.fill();

  // XP text
  fc.font = '600 36px Inter, system-ui, sans-serif';
  fc.fillStyle = 'rgba(255,255,255,0.5)';
  fc.textAlign = 'left';
  fc.fillText('LVL ' + (data.level || 0), barX, barY - 16);
  fc.textAlign = 'right';
  fc.fillText((data.currentXP || 0) + ' / ' + (data.nextXP || 100) + ' XP', barX + barW, barY - 14);

  // Stats — bottom, three columns
  fc.textAlign = 'center';
  const sy = fH * 0.88;
  fc.font = '700 54px Inter, system-ui, sans-serif';
  fc.fillStyle = 'rgba(255,255,255,0.85)';
  fc.fillText(data.totalRides || '0', fW * 0.2, sy);
  fc.fillText(data.totalDist || '0', fW * 0.5, sy);
  fc.fillText(data.totalElev || '0', fW * 0.8, sy);
  fc.font = '500 30px Inter, system-ui, sans-serif';
  fc.fillStyle = 'rgba(255,255,255,0.5)';
  fc.fillText('rides', fW * 0.2, sy + 42);
  fc.fillText('km', fW * 0.5, sy + 42);
  fc.fillText('m elev', fW * 0.8, sy + 42);

  const faceTex = new THREE.CanvasTexture(faceCanvas);
  faceTex.anisotropy = _rcRenderer.capabilities.getMaxAnisotropy();

  // Normal map — emboss the level number + CycleIQ logo
  const normCanvas = document.createElement('canvas');
  normCanvas.width = fW; normCanvas.height = fH;
  const nc = normCanvas.getContext('2d');
  // Flat normal = rgb(128,128,255)
  nc.fillStyle = 'rgb(128,128,255)';
  nc.fillRect(0, 0, fW, fH);
  // Draw the level number as a height bump — white = raised
  nc.font = '800 280px Inter, system-ui, sans-serif';
  nc.textAlign = 'center';
  // Offset slightly left/up for emboss light direction
  nc.fillStyle = 'rgb(90,90,255)'; // stronger left-down normal = deeper emboss
  nc.fillText(String(data.level || '0'), fW / 2 - 2, fH * 0.56 - 2);
  nc.fillStyle = 'rgb(166,166,255)'; // stronger right-up = deeper shadow edge
  nc.fillText(String(data.level || '0'), fW / 2 + 2, fH * 0.56 + 2);
  nc.fillStyle = 'rgb(128,128,255)'; // center pass
  nc.fillText(String(data.level || '0'), fW / 2, fH * 0.56);
  // Also emboss CycleIQ logo
  nc.font = '700 32px Inter, system-ui, sans-serif';
  nc.textAlign = 'right';
  nc.fillStyle = 'rgb(115,115,255)';
  nc.fillText('CycleIQ', fW - 58, 57);
  nc.fillStyle = 'rgb(141,141,255)';
  nc.fillText('CycleIQ', fW - 62, 53);
  const normalTex = new THREE.CanvasTexture(normCanvas);
  normalTex.anisotropy = _rcRenderer.capabilities.getMaxAnisotropy();

  // Metalness + Roughness map — chrome where level number is, matte elsewhere
  // Green channel = roughness (black=smooth, white=rough)
  // Blue channel = metalness (black=dielectric, white=metal)
  const mrCanvas = document.createElement('canvas');
  mrCanvas.width = fW; mrCanvas.height = fH;
  const mc = mrCanvas.getContext('2d');
  // Base: low metalness, very high roughness = matte card background
  mc.fillStyle = 'rgb(0,235,30)';
  mc.fillRect(0, 0, fW, fH);
  // Level number: chrome with noise texture
  mc.font = '800 280px Inter, system-ui, sans-serif';
  mc.textAlign = 'center';
  mc.fillStyle = 'rgb(0,8,255)';
  mc.fillText(String(data.level || '0'), fW / 2, fH * 0.56);
  // Add roughness noise inside the number only
  // Step 1: noise canvas with random roughness per pixel
  const noiseCanvas = document.createElement('canvas');
  noiseCanvas.width = fW; noiseCanvas.height = fH;
  const nctx = noiseCanvas.getContext('2d');
  const noiseData = nctx.createImageData(fW, fH);
  for (let i = 0; i < noiseData.data.length; i += 4) {
    const rough = Math.floor(Math.random() * 35);
    noiseData.data[i] = 0;
    noiseData.data[i+1] = rough;
    noiseData.data[i+2] = 255;
    noiseData.data[i+3] = 255;
  }
  nctx.putImageData(noiseData, 0, 0);
  // Step 2: mask canvas — number shape
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = fW; maskCanvas.height = fH;
  const mctx = maskCanvas.getContext('2d');
  mctx.font = '800 280px Inter, system-ui, sans-serif';
  mctx.textAlign = 'center';
  mctx.fillStyle = '#ffffff';
  mctx.fillText(String(data.level || '0'), fW / 2, fH * 0.56);
  // Step 3: use mask to cut noise to number shape
  mctx.globalCompositeOperation = 'source-in';
  mctx.drawImage(noiseCanvas, 0, 0);
  // Step 4: composite masked noise onto metalness/roughness map
  mc.drawImage(maskCanvas, 0, 0);
  // XP bar fill: slightly metallic
  mc.fillStyle = 'rgb(0,40,200)';
  mc.fillRect(50, fH * 0.74, (fW - 100) * (data.xpPct || 0), 24);
  // CycleIQ logo: same chrome metalness as level number
  mc.font = '700 32px Inter, system-ui, sans-serif';
  mc.textAlign = 'right';
  mc.fillStyle = 'rgb(0,8,255)';
  mc.fillText('CycleIQ', fW - 60, 55);
  const mrTex = new THREE.CanvasTexture(mrCanvas);
  mrTex.anisotropy = _rcRenderer.capabilities.getMaxAnisotropy();

  // Back face texture — today's date in calendar style
  const backCanvas = document.createElement('canvas');
  backCanvas.width = fW; backCanvas.height = fH;
  const bc = backCanvas.getContext('2d');

  // Background — flat dark
  bc.fillStyle = '#080808';
  bc.fillRect(0, 0, fW, fH);
  // Dither noise
  const bDither = bc.getImageData(0, 0, fW, fH);
  const bd = bDither.data;
  for (let i = 0; i < bd.length; i += 4) {
    const n = Math.random() * 6 - 3;
    bd[i] = Math.max(0, Math.min(255, bd[i] + n));
    bd[i+1] = Math.max(0, Math.min(255, bd[i+1] + n));
    bd[i+2] = Math.max(0, Math.min(255, bd[i+2] + n));
  }
  bc.putImageData(bDither, 0, 0);

  const now = new Date();
  const dayName = now.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
  const monthName = now.toLocaleDateString('en-US', { month: 'long' }).toUpperCase();
  const dayNum = now.getDate();
  const year = now.getFullYear();

  // Day of week — small, top
  bc.font = '600 28px Inter, system-ui, sans-serif';
  bc.fillStyle = '#00e5a0';
  bc.textAlign = 'center';
  bc.fillText(dayName, fW / 2, fH * 0.2);

  // Day number — massive, center
  bc.font = '800 240px Inter, system-ui, sans-serif';
  bc.fillStyle = 'rgba(255,255,255,0.9)';
  bc.fillText(String(dayNum), fW / 2, fH * 0.58);

  // Month — below day number
  bc.font = '700 36px Inter, system-ui, sans-serif';
  bc.fillStyle = 'rgba(255,255,255,0.4)';
  bc.fillText(monthName, fW / 2, fH * 0.72);

  // Year — bottom
  bc.font = '500 24px Inter, system-ui, sans-serif';
  bc.fillStyle = 'rgba(255,255,255,0.2)';
  bc.fillText(String(year), fW / 2, fH * 0.82);

  // CycleIQ watermark — bottom
  bc.font = '700 20px Inter, system-ui, sans-serif';
  bc.fillStyle = 'rgba(0,229,160,0.15)';
  bc.fillText('CycleIQ', fW / 2, fH * 0.93);

  const backTex = new THREE.CanvasTexture(backCanvas);
  backTex.anisotropy = _rcRenderer.capabilities.getMaxAnisotropy();

  // ExtrudeGeometry groups: 0 = faces, 1 = sides (extruded edges)
  const edgeMat = new THREE.MeshStandardMaterial({
    color: 0xc0c0c0, metalness: 1.0, roughness: 0.08, envMap: envTex, envMapIntensity: 2.0
  });
  const frontMat = new THREE.MeshStandardMaterial({
    map: faceTex,
    normalMap: normalTex, normalScale: new THREE.Vector2(1.0, 1.0),
    metalnessMap: mrTex, roughnessMap: mrTex,
    metalness: 1.0, roughness: 1.0,
    envMap: envTex, envMapIntensity: 0.6,
    side: THREE.FrontSide
  });

  // Split ExtrudeGeometry into 3 material groups: front, back, sides
  const backMat = new THREE.MeshStandardMaterial({
    map: backTex, metalness: 0.15, roughness: 0.5, envMap: envTex, envMapIntensity: 0.3
  });

  // Ensure geometry is indexed so we can split groups
  if (!cardGeo.index) {
    const vCount = cardGeo.attributes.position.count;
    const indices = [];
    for (let i = 0; i < vCount; i++) indices.push(i);
    cardGeo.setIndex(indices);
  }

  // Split into front/back/side groups by checking normal Z per triangle
  const nrm = cardGeo.attributes.normal;
  const idx = cardGeo.index;
  const frontIdx = [], backIdx = [], sideIdx = [];
  for (const grp of cardGeo.groups) {
    for (let i = grp.start; i < grp.start + grp.count; i += 3) {
      const a = idx.getX(i), b = idx.getX(i+1), c = idx.getX(i+2);
      const nz = (nrm.getZ(a) + nrm.getZ(b) + nrm.getZ(c)) / 3;
      if (grp.materialIndex === 1) { sideIdx.push(a, b, c); }
      else if (nz > 0.5) { frontIdx.push(a, b, c); }
      else if (nz < -0.5) { backIdx.push(a, b, c); }
      else { sideIdx.push(a, b, c); }
    }
  }
  cardGeo.setIndex([...frontIdx, ...backIdx, ...sideIdx]);
  cardGeo.clearGroups();
  cardGeo.addGroup(0, frontIdx.length, 0);
  cardGeo.addGroup(frontIdx.length, backIdx.length, 1);
  cardGeo.addGroup(frontIdx.length + backIdx.length, sideIdx.length, 2);

  // Fix back face UVs — flip X so date text reads correctly
  const bkPos = cardGeo.attributes.position;
  const bkUv = cardGeo.attributes.uv;
  for (let ii = 0; ii < backIdx.length; ii++) {
    const vi = backIdx[ii];
    const x = bkPos.getX(vi), y = bkPos.getY(vi);
    bkUv.setXY(vi, 1 - (x + hw) / cardW, (y + hh) / cardH);
  }

  // 0 = front (profile), 1 = back (date), 2 = sides (chrome edge)
  const cardMesh = new THREE.Mesh(cardGeo, [frontMat, backMat, edgeMat]);

  // Parallax layers — transparent planes at different depths inside the card
  // Layer 1: Level number (deepest — moves most)
  const lvlCanvas = document.createElement('canvas');
  lvlCanvas.width = fW; lvlCanvas.height = fH;
  const lc = lvlCanvas.getContext('2d');
  lc.font = '800 280px Inter, system-ui, sans-serif';
  lc.textAlign = 'center';
  const lvlGrad2 = lc.createLinearGradient(0, 0, fW, fH);
  lvlGrad2.addColorStop(0, 'rgba(220,200,160,0.5)');
  lvlGrad2.addColorStop(0.3, 'rgba(255,255,240,0.6)');
  lvlGrad2.addColorStop(0.5, 'rgba(180,160,120,0.4)');
  lvlGrad2.addColorStop(0.7, 'rgba(255,250,230,0.55)');
  lvlGrad2.addColorStop(1, 'rgba(160,140,100,0.35)');
  lc.fillStyle = lvlGrad2;
  lc.fillText(String(data.level || '0'), fW / 2, fH * 0.56);
  const lvlTex = new THREE.CanvasTexture(lvlCanvas);
  const lvlPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(cardW * 0.95, cardH * 0.95),
    new THREE.MeshPhysicalMaterial({
      map: lvlTex, transparent: true, depthWrite: false,
      metalness: 0.8, roughness: 0.15, envMap: envTex, envMapIntensity: 2.0,
      clearcoat: 0.6, clearcoatRoughness: 0.1,
    })
  );
  lvlPlane.position.z = cardD * 0.5 + 0.02;

  // Glow halo behind the level number
  const lvlGlowCanvas = document.createElement('canvas');
  lvlGlowCanvas.width = fW; lvlGlowCanvas.height = fH;
  const lgc = lvlGlowCanvas.getContext('2d');
  // Soft radial glow centered on the number
  const gx = fW / 2, gy = fH * 0.44;
  const glowRad = lgc.createRadialGradient(gx, gy, 0, gx, gy, fW * 0.4);
  glowRad.addColorStop(0, 'rgba(90,140,230,0.35)');
  glowRad.addColorStop(0.4, 'rgba(90,140,230,0.12)');
  glowRad.addColorStop(1, 'transparent');
  lgc.fillStyle = glowRad; lgc.fillRect(0, 0, fW, fH);
  // Redraw number text as bright core
  lgc.font = '800 280px Inter, system-ui, sans-serif';
  lgc.textAlign = 'center';
  lgc.shadowColor = 'rgba(100,160,255,0.8)'; lgc.shadowBlur = 40;
  lgc.fillStyle = 'rgba(140,180,255,0.2)';
  lgc.fillText(String(data.level || '0'), fW / 2, fH * 0.56);
  lgc.shadowBlur = 0;
  const lvlGlowTex = new THREE.CanvasTexture(lvlGlowCanvas);
  const lvlGlowMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {
      map: { value: lvlGlowTex },
      intensity: { value: 0.5 }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D map;
      uniform float intensity;
      varying vec2 vUv;
      void main() {
        vec4 texel = texture2D(map, vUv);
        gl_FragColor = vec4(texel.rgb, texel.a * intensity);
      }
    `
  });
  const lvlGlowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(cardW * 0.95, cardH * 0.95), lvlGlowMat
  );
  lvlGlowPlane.position.z = cardD * 0.5 + 0.015;

  _rcMesh = new THREE.Group();
  _rcMesh.add(cardMesh);
  _rcMesh.add(lvlPlane);
  _rcMesh.add(lvlGlowPlane);
  _rcMesh._parallax = [
    { mesh: lvlGlowPlane, depth: 0.005 },
    { mesh: lvlPlane, depth: 0.005 },
  ];

  // Intro animation — card flips in from edge, scales up
  _rcMesh.rotation.x = 0.3;
  _rcMesh.rotation.y = Math.PI * 0.6;
  _rcMesh.rotation.z = -0.15;
  _rcMesh.scale.setScalar(0.7);
  _rcScene.add(_rcMesh);

  const REST_X = 0.06, REST_Y = 0.08;
  const _rcIntroStart = Date.now();
  const _rcIntroDur = 500; // ms
  let velX = 0, velY = 0;
  const SPRING = 0.008, DAMP = 0.97;
  // Reset all interaction state for this session
  _rcDragVelX = 0; _rcDragVelY = 0;
  _rcReleaseTime = 0; _rcSpinning = false; _rcIdle = false; _rcAutoSpin = false;
  _rcFrameSkip = 0; _rcDragging = false;
  // Clean up any listeners from a previous open
  if (_rcAbort) { _rcAbort.abort(); _rcAbort = null; }
  _rcAbort = new AbortController();
  const rcSig = { signal: _rcAbort.signal };

  function _easeOutBack(t) { const c = 1.4; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }

  function loop() {
    _rcRaf = requestAnimationFrame(loop);
    if (!_rcMesh || !_rcRenderer || !_rcScene || !_rcCamera) return;
    if (_rcIdle) return;
    try {

    // Live resize — corrects size if canvas was measured before sheet animation completed
    if (_rcCanvas) {
      const cw = _rcCanvas.clientWidth, ch = _rcCanvas.clientHeight;
      if (cw > 10 && ch > 10 && (Math.abs(cw - _rcRenderer.domElement.clientWidth) > 2 || Math.abs(ch - _rcRenderer.domElement.clientHeight) > 2)) {
        _rcRenderer.setSize(cw, ch);
        _rcRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        _rcCamera.aspect = cw / ch;
        _rcCamera.updateProjectionMatrix();
      }
    }

    // Intro animation
    const introElapsed = Date.now() - _rcIntroStart;
    if (introElapsed < _rcIntroDur) {
      const p = _easeOutBack(Math.min(1, introElapsed / _rcIntroDur));
      _rcMesh.rotation.x = 0.3 + (REST_X - 0.3) * p;
      _rcMesh.rotation.y = Math.PI * 0.6 + (REST_Y - Math.PI * 0.6) * p;
      _rcMesh.rotation.z = -0.15 * (1 - p);
      _rcMesh.scale.setScalar(0.7 + 0.3 * p);
      _rcRenderer.render(_rcScene, _rcCamera);
      return;
    } else if (!_rcAutoSpin && !_rcSpinning && !_rcDragging) {
      _rcAutoSpin = true; // transition to auto-spin after intro
    }

    // Skip every other frame — only after settled (3s grace for smooth transition)
    if (_rcAutoSpin && !_rcDragging && !_rcSpinning && (Date.now() - _rcReleaseTime) > 3000) {
      if (++_rcFrameSkip % 2 !== 0) return;
    } else { _rcFrameSkip = 0; }

    // Shimmer — normal scale pulse + level glow + tilt-based env boost
    const rotY = _rcMesh.rotation.y || 0;
    const rotX = _rcMesh.rotation.x || 0;
    const t = Date.now() * 0.001;
    const ns = 0.85 + Math.sin(t + rotY * 3) * 0.15;
    frontMat.normalScale.set(ns, ns);
    const tilt = 1 - Math.max(0, Math.cos(rotY) * Math.cos(rotX));
    frontMat.envMapIntensity = 0.6 + tilt * 2.5;
    lvlGlowMat.uniforms.intensity.value = 0.4 + Math.sin(t * 1.2 + rotY * 2) * 0.2;

    if (!_rcDragging) {
      const timeSinceRelease = Date.now() - _rcReleaseTime;

      if (_rcSpinning) {
        // Coast with momentum — gradual friction
        const speed = Math.abs(_rcDragVelX) + Math.abs(_rcDragVelY);
        if (speed > 0.002) {
          _rcDragVelX *= 0.96;
          _rcDragVelY *= 0.96;
          _rcMesh.rotation.x += _rcDragVelX;
          _rcMesh.rotation.y += _rcDragVelY;
          _rcMesh.rotation.x += (REST_X - _rcMesh.rotation.x) * 0.005;
        } else {
          // Momentum died — transition to auto-spin
          _rcSpinning = false;
          _rcAutoSpin = true; _rcAutoSpinStart = Date.now();
        }
      } else if (_rcAutoSpin || timeSinceRelease > 2000) {
        _rcAutoSpin = true;
        if (!_rcAutoSpinStart) _rcAutoSpinStart = Date.now();
        const ast = Date.now() * 0.001;
        const spinEase = Math.min(1, (Date.now() - _rcAutoSpinStart) / 500);
        _rcMesh.rotation.y += 0.006 * spinEase;
        _rcMesh.rotation.x += (REST_X + Math.sin(ast * 0.8) * 0.2 - _rcMesh.rotation.x) * (0.01 + 0.03 * spinEase);
        _rcMesh.rotation.z += (Math.sin(ast * 0.5 + 1) * 0.05 - _rcMesh.rotation.z) * (0.01 + 0.02 * spinEase);
      }
    }
    // Parallax — shift layers based on card tilt
    if (_rcMesh._parallax) {
      // Offset from rest — small values only when near front view
      let dy = _rcMesh.rotation.y - REST_Y;
      dy = dy - Math.round(dy / (Math.PI * 2)) * Math.PI * 2; // normalize to -PI..PI
      const dx = _rcMesh.rotation.x - REST_X;
      // Only parallax when close to front view
      if (Math.abs(dy) < 0.8 && Math.abs(dx) < 0.8) {
        _rcMesh._parallax.forEach(l => {
          l.mesh.position.x += (-dy * l.depth * 5 - l.mesh.position.x) * 0.15;
          l.mesh.position.y += (dx * l.depth * 5 - l.mesh.position.y) * 0.15;
        });
      } else {
        _rcMesh._parallax.forEach(l => {
          l.mesh.position.x *= 0.85;
          l.mesh.position.y *= 0.85;
        });
      }
    }
    _rcRenderer.render(_rcScene, _rcCamera);
    } catch(e) { console.warn('Rider card render error:', e.message); cancelAnimationFrame(_rcRaf); _rcRaf = null; }
  }
  loop();

  // Interaction — tilt on drag, prevent sheet scroll, double tap to flip
  let _rcLastTap = 0;
  canvasEl.addEventListener('pointerdown', e => {
    const now = Date.now();
    _rcIdle = false; _rcAutoSpin = false; _rcAutoSpinStart = 0;
    if (now - _rcLastTap < 350 && _rcMesh) {
      _rcDragVelX = 0;
      _rcDragVelY = 0.08;
      _rcReleaseTime = Date.now();
      _rcSpinning = true;
      _rcDragging = false;
      _rcLastTap = 0;
      return;
    }
    _rcLastTap = now;
    _rcDragging = true;
    _rcStartX = e.clientX; _rcStartY = e.clientY;
    _rcRotX = _rcMesh.rotation.x; _rcRotY = _rcMesh.rotation.y;
    _rcTrail = [{ x: e.clientX, y: e.clientY, t: Date.now() }];
    canvasEl.setPointerCapture(e.pointerId);
    canvasEl.style.cursor = 'grabbing';
  }, rcSig);
  canvasEl.addEventListener('pointermove', e => {
    if (!_rcDragging || !_rcMesh) return;
    _rcMesh.rotation.y = _rcRotY + (e.clientX - _rcStartX) * 0.015;
    _rcMesh.rotation.x = _rcRotX + (e.clientY - _rcStartY) * 0.015;
    _rcTrail.push({ x: e.clientX, y: e.clientY, t: Date.now() });
    if (_rcTrail.length > 6) _rcTrail.shift();
  }, rcSig);
  canvasEl.addEventListener('touchstart', e => { e.stopPropagation(); }, { passive: true, signal: _rcAbort.signal });
  canvasEl.addEventListener('touchmove', e => { e.preventDefault(); e.stopPropagation(); }, { passive: false, signal: _rcAbort.signal });
  const endDrag = () => {
    if (!_rcDragging) return;
    _rcDragging = false;
    canvasEl.style.cursor = 'grab';
    _rcDragVelX = 0; _rcDragVelY = 0;
    const now = Date.now();
    if (_rcTrail && _rcTrail.length >= 2) {
      const recent = _rcTrail.filter(p => now - p.t < 80);
      if (recent.length >= 2) {
        const a = recent[0], b = recent[recent.length - 1];
        const dt = Math.max(1, b.t - a.t);
        _rcDragVelY = (b.x - a.x) / dt * 0.25;
        _rcDragVelX = (b.y - a.y) / dt * 0.25;
      }
    }
    _rcReleaseTime = now;
    _rcSpinning = Math.abs(_rcDragVelX) + Math.abs(_rcDragVelY) > 0.001;
  };
  canvasEl.addEventListener('pointerup', endDrag, rcSig);
  canvasEl.addEventListener('pointercancel', endDrag, rcSig);
  canvasEl.addEventListener('pointerleave', endDrag, rcSig);
}

// ─────────────────────────────────────────────────────────────────────────────
// BADGE CARD PREVIEW — static front-face render for grid thumbnails
// ─────────────────────────────────────────────────────────────────────────────
const _previewCache = {};
export function renderBadgePreview(badgeId, name, desc, locked) {
  const cacheKey = badgeId + (locked ? '_locked' : '');
  if (_previewCache[cacheKey]) return _previewCache[cacheKey];
  const def = BADGE_PROCEDURAL[badgeId];
  if (!def) return '';

  const r = (def.color >> 16) & 255, g = (def.color >> 8) & 255, b = def.color & 255;
  const cardAspect = 2.6 / 1.8;
  const fW = 200, fH = Math.round(fW * cardAspect);
  const c = document.createElement('canvas'); c.width = fW; c.height = fH;
  const fc = c.getContext('2d');
  const ribbonH = 16;

  if (def.scene === 'mountain') {
    // Portal preview — mountain scene visible through dark frame
    // First draw the mountain scene
    const skyG = fc.createLinearGradient(0, 0, 0, fH);
    skyG.addColorStop(0, '#05061a'); skyG.addColorStop(0.35, '#1a1850');
    skyG.addColorStop(0.55, '#2d1d4a'); skyG.addColorStop(1, '#1a1a38');
    fc.fillStyle = skyG; fc.fillRect(0, 0, fW, fH);
    for (let i = 0; i < 25; i++) {
      fc.fillStyle = `rgba(255,255,255,${0.2 + Math.random() * 0.5})`;
      fc.beginPath(); fc.arc(Math.random() * fW, Math.random() * fH * 0.5, 0.5 + Math.random(), 0, Math.PI * 2); fc.fill();
    }
    fc.fillStyle = '#fffae8'; fc.beginPath(); fc.arc(fW * 0.75, fH * 0.16, 6, 0, Math.PI * 2); fc.fill();
    fc.fillStyle = '#0f0f2a';
    fc.beginPath(); fc.moveTo(0, fH * 0.5);
    fc.lineTo(fW * 0.4, fH * 0.22); fc.lineTo(fW * 0.7, fH * 0.18);
    fc.lineTo(fW, fH * 0.35); fc.lineTo(fW, fH); fc.lineTo(0, fH); fc.fill();
    fc.fillStyle = '#14142e';
    fc.beginPath(); fc.moveTo(0, fH * 0.62);
    fc.quadraticCurveTo(fW * 0.4, fH * 0.5, fW * 0.8, fH * 0.48);
    fc.lineTo(fW, fH); fc.lineTo(0, fH); fc.fill();
    fc.fillStyle = '#0e0e24';
    fc.beginPath(); fc.moveTo(0, fH * 0.74);
    fc.quadraticCurveTo(fW * 0.5, fH * 0.68, fW, fH * 0.7);
    fc.lineTo(fW, fH); fc.lineTo(0, fH); fc.fill();
    // Now overlay the dark frame with window cutout
    const bW = fW * 0.08, bT = fH * 0.06, bB = fH * 0.22;
    fc.save(); fc.globalCompositeOperation = 'source-over';
    // Draw frame on a temp canvas, then composite
    const frm = document.createElement('canvas'); frm.width = fW; frm.height = fH;
    const frc = frm.getContext('2d');
    frc.fillStyle = '#080808'; frc.fillRect(0, 0, fW, fH);
    // Cut window
    frc.globalCompositeOperation = 'destination-out';
    const wcr = 5;
    frc.beginPath();
    frc.moveTo(bW + wcr, bT); frc.lineTo(fW - bW - wcr, bT);
    frc.quadraticCurveTo(fW - bW, bT, fW - bW, bT + wcr);
    frc.lineTo(fW - bW, fH - bB - wcr);
    frc.quadraticCurveTo(fW - bW, fH - bB, fW - bW - wcr, fH - bB);
    frc.lineTo(bW + wcr, fH - bB);
    frc.quadraticCurveTo(bW, fH - bB, bW, fH - bB - wcr);
    frc.lineTo(bW, bT + wcr);
    frc.quadraticCurveTo(bW, bT, bW + wcr, bT);
    frc.closePath(); frc.fill();
    fc.drawImage(frm, 0, 0);
    fc.restore();
    // Text on frame
    fc.textAlign = 'center';
    fc.shadowColor = `rgba(${r},${g},${b},0.5)`; fc.shadowBlur = 6;
    fc.font = '700 13px Inter, system-ui, sans-serif';
    fc.fillStyle = '#fff';
    fc.fillText(name, fW / 2, fH - bB * 0.42);
    fc.shadowBlur = 0;
    fc.font = '500 8px Inter, system-ui, sans-serif';
    fc.fillStyle = `rgba(${Math.min(255,r+60)},${Math.min(255,g+60)},${Math.min(255,b+60)},0.7)`;
    fc.fillText(desc, fW / 2, fH - bB * 0.42 + 12);
  } else {
    // Standard dark card
    fc.fillStyle = '#080808'; fc.fillRect(0, 0, fW, fH);
    // Dither
    const d = fc.getImageData(0, 0, fW, fH); const dd = d.data;
    for (let i = 0; i < dd.length; i += 4) { const n = Math.random() * 6 - 3; dd[i] = Math.max(0, dd[i] + n); dd[i+1] = Math.max(0, dd[i+1] + n); dd[i+2] = Math.max(0, dd[i+2] + n); }
    fc.putImageData(d, 0, 0);
    // Ribbon
    fc.fillStyle = `rgb(${r},${g},${b})`; fc.fillRect(0, 11, fW, ribbonH);
    fc.font = '900 italic 11px "Source Serif 4", Georgia, serif';
    fc.fillStyle = 'rgba(0,0,0,0.6)'; fc.textBaseline = 'middle';
    fc.fillText((name.toUpperCase() + '  ·  ').repeat(10), 0, 11 + ribbonH / 2 + 1);
    // Icon
    try {
      fc.save();
      const s = fW / 30;
      fc.translate(fW/2 - 12 * s, fH * 0.44 - 12 * s); fc.scale(s, s);
      const path = new Path2D(def.iconPath);
      fc.strokeStyle = `rgba(${Math.min(255,r+80)},${Math.min(255,g+80)},${Math.min(255,b+80)},0.6)`;
      fc.lineWidth = 1.5; fc.stroke(path);
      const ig = fc.createLinearGradient(0, 0, 24, 24);
      ig.addColorStop(0, `rgba(${Math.min(255,r+120)},${Math.min(255,g+120)},${Math.min(255,b+120)},0.5)`);
      ig.addColorStop(1, `rgba(${r},${g},${b},0.3)`);
      fc.fillStyle = ig; fc.fill(path);
      fc.restore();
    } catch(_) {}
    // Name
    fc.font = '700 15px Inter, system-ui, sans-serif';
    fc.fillStyle = '#fff'; fc.textAlign = 'center';
    fc.fillText(name, fW / 2, fH * 0.78);
    // Desc
    fc.font = '500 9px Inter, system-ui, sans-serif';
    fc.fillStyle = `rgba(${r},${g},${b},0.8)`;
    fc.fillText(desc, fW / 2, fH * 0.78 + 14);
    // Earned
    fc.font = '600 7px Inter, system-ui, sans-serif';
    fc.fillStyle = 'rgba(255,255,255,0.25)';
    fc.fillText('EARNED', fW / 2, fH * 0.9);
  }

  // Round corners
  const out = document.createElement('canvas'); out.width = fW; out.height = fH;
  const oc = out.getContext('2d');
  const cr = 10;
  oc.beginPath();
  oc.moveTo(cr, 0); oc.lineTo(fW - cr, 0); oc.quadraticCurveTo(fW, 0, fW, cr);
  oc.lineTo(fW, fH - cr); oc.quadraticCurveTo(fW, fH, fW - cr, fH);
  oc.lineTo(cr, fH); oc.quadraticCurveTo(0, fH, 0, fH - cr);
  oc.lineTo(0, cr); oc.quadraticCurveTo(0, 0, cr, 0);
  oc.closePath(); oc.clip();
  oc.drawImage(c, 0, 0);

  // Locked state: desaturate + darken + lock icon
  if (locked) {
    // Greyscale overlay
    const imgData = oc.getImageData(0, 0, fW, fH);
    const px = imgData.data;
    for (let i = 0; i < px.length; i += 4) {
      const grey = px[i] * 0.3 + px[i+1] * 0.59 + px[i+2] * 0.11;
      px[i] = grey * 0.4; px[i+1] = grey * 0.4; px[i+2] = grey * 0.45;
    }
    oc.putImageData(imgData, 0, 0);
    // Dark overlay
    oc.fillStyle = 'rgba(0,0,0,0.3)'; oc.fillRect(0, 0, fW, fH);
    // Lock icon
    oc.save(); oc.translate(fW / 2, fH * 0.42);
    oc.strokeStyle = 'rgba(255,255,255,0.25)'; oc.lineWidth = 2; oc.lineCap = 'round';
    // Lock body
    const lw = 14, lh = 12, lr = 3;
    oc.beginPath();
    oc.moveTo(-lw/2 + lr, -lh/2); oc.lineTo(lw/2 - lr, -lh/2);
    oc.quadraticCurveTo(lw/2, -lh/2, lw/2, -lh/2 + lr);
    oc.lineTo(lw/2, lh/2 - lr);
    oc.quadraticCurveTo(lw/2, lh/2, lw/2 - lr, lh/2);
    oc.lineTo(-lw/2 + lr, lh/2);
    oc.quadraticCurveTo(-lw/2, lh/2, -lw/2, lh/2 - lr);
    oc.lineTo(-lw/2, -lh/2 + lr);
    oc.quadraticCurveTo(-lw/2, -lh/2, -lw/2 + lr, -lh/2);
    oc.closePath(); oc.stroke();
    // Lock shackle
    oc.beginPath(); oc.arc(0, -lh/2 - 4, 6, Math.PI, 0); oc.stroke();
    oc.restore();
    // "LOCKED" text
    oc.font = '600 8px Inter, system-ui, sans-serif';
    oc.fillStyle = 'rgba(255,255,255,0.2)'; oc.textAlign = 'center';
    oc.fillText('LOCKED', fW / 2, fH * 0.58);
  }

  const url = out.toDataURL('image/png');
  _previewCache[cacheKey] = url;
  return url;
}

// ─────────────────────────────────────────────────────────────────────────────
// BADGE CARD — Achievement card style (like rider card but per-badge themed)
// ─────────────────────────────────────────────────────────────────────────────
let _bcScene, _bcCamera, _bcRenderer, _bcMesh, _bcRaf, _bcCanvas = null, _bcDragging = false;
let _bcStartX = 0, _bcStartY = 0, _bcRotX = 0, _bcRotY = 0;
let _bcDragVelX = 0, _bcDragVelY = 0;
let _bcReleaseTime = 0, _bcSpinning = false, _bcIdle = false, _bcAutoSpin = true, _bcAutoSpinStart = 0;
let _bcTrail = [];
let _bcAbort = null;

export async function initBadgeCard3D(canvasEl, badgeId, name, desc) {
  const THREE = await _loadThreeJS();
  const def = BADGE_PROCEDURAL[badgeId];
  if (!def) return;

  // Reset interaction state and clean up any previous open's listeners
  _bcDragVelX = 0; _bcDragVelY = 0;
  _bcReleaseTime = 0; _bcSpinning = false; _bcIdle = false; _bcAutoSpin = true;
  _bcDragging = false;
  if (_bcAbort) { _bcAbort.abort(); _bcAbort = null; }
  _bcAbort = new AbortController();
  const bcSig = { signal: _bcAbort.signal };

  _bcCanvas = canvasEl;
  let w = canvasEl.clientWidth || 340, h = canvasEl.clientHeight || 380;
  canvasEl.width = w * Math.min(window.devicePixelRatio, 2.0);
  canvasEl.height = h * Math.min(window.devicePixelRatio, 2.0);

  _bcScene = new THREE.Scene();
  _bcCamera = new THREE.PerspectiveCamera(30, w / h, 0.1, 100);
  _bcCamera.position.set(0, 0, 6.8);
  _bcRenderer = _getRenderer(THREE, canvasEl);
  _bcRenderer.setSize(w, h);
  _bcRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));

  // Lighting — bright ambient + key + fill + colored rim
  _bcScene.add(new THREE.AmbientLight(0x333344, 0.8));
  const key = new THREE.DirectionalLight(0xffffff, 3.0); key.position.set(3, 5, 4); _bcScene.add(key);
  const fill = new THREE.DirectionalLight(0xeeeeff, 1.2); fill.position.set(-2, 2, 5); _bcScene.add(fill);
  const r = (def.color >> 16) & 255, g = (def.color >> 8) & 255, b = def.color & 255;
  const rim = new THREE.DirectionalLight(def.color, 1.5); rim.position.set(-4, 3, -5); _bcScene.add(rim);

  // Moving specular spotlight — orbits based on card tilt for glare hotspot
  const holoSpot = new THREE.PointLight(0xffffff, 4, 8, 2);
  holoSpot.position.set(0, 1, 3);
  _bcScene.add(holoSpot);

  // Env map — vivid repeating rainbow bands (cached per badge color)
  const colorKey = def.color.toString(16);
  if (!_cachedBadgeEnvTexMap[colorKey]) {
  const envC = document.createElement('canvas'); envC.width = 1024; envC.height = 512;
  const ec = envC.getContext('2d');
  ec.fillStyle = '#080808'; ec.fillRect(0, 0, 1024, 512);
  // Studio light — bright center highlight
  const sb = ec.createRadialGradient(440, 220, 0, 440, 220, 400);
  sb.addColorStop(0, '#ffffff'); sb.addColorStop(0.15, '#cccccc'); sb.addColorStop(0.4, '#333333'); sb.addColorStop(1, 'transparent');
  ec.fillStyle = sb; ec.fillRect(0, 0, 1024, 512);
  // Repeating rainbow bands — 3 full cycles across (like repeating-linear-gradient)
  const spectrum = ['#ff2a6d','#ff8c00','#f5d300','#01ff89','#05d9e8','#4a9eff','#9b59ff','#ff2a6d'];
  for (let cycle = 0; cycle < 3; cycle++) {
    const cx = (cycle / 3) * 1024, cw = 1024 / 3;
    for (let s = 0; s < spectrum.length - 1; s++) {
      const x0 = cx + (s / (spectrum.length - 1)) * cw;
      const x1 = cx + ((s + 1) / (spectrum.length - 1)) * cw;
      const sg = ec.createLinearGradient(x0, 0, x1, 0);
      sg.addColorStop(0, spectrum[s]); sg.addColorStop(1, spectrum[s + 1]);
      ec.globalAlpha = 0.55;
      ec.fillStyle = sg; ec.fillRect(x0, 0, x1 - x0, 512);
    }
  }
  ec.globalAlpha = 1;
  // Vertical cross-holo (diagonal sweep)
  const rb2 = ec.createLinearGradient(0, 0, 512, 512);
  rb2.addColorStop(0, 'rgba(0,255,200,0.25)'); rb2.addColorStop(0.25, 'rgba(255,100,0,0.25)');
  rb2.addColorStop(0.5, 'rgba(100,0,255,0.25)'); rb2.addColorStop(0.75, 'rgba(255,255,0,0.25)');
  rb2.addColorStop(1, 'rgba(0,150,255,0.25)');
  ec.fillStyle = rb2; ec.fillRect(0, 0, 1024, 512);
  // Badge accent color hot spot
  const ac = ec.createRadialGradient(200, 120, 0, 200, 120, 180);
  ac.addColorStop(0, `rgba(${r},${g},${b},0.4)`); ac.addColorStop(1, 'transparent');
  ec.fillStyle = ac; ec.fillRect(0, 0, 1024, 512);
  // Scanline-like horizontal bands for foil shimmer
  ec.globalAlpha = 0.12;
  for (let y = 0; y < 512; y += 4) {
    ec.fillStyle = (y % 8 === 0) ? '#000' : '#fff';
    ec.fillRect(0, y, 1024, 2);
  }
  ec.globalAlpha = 1;
  const _et = new THREE.CanvasTexture(envC);
  _et.mapping = THREE.EquirectangularReflectionMapping;
  _et.wrapS = THREE.ClampToEdgeWrapping;
  _et.wrapT = THREE.ClampToEdgeWrapping;
  _cachedBadgeEnvTexMap[colorKey] = _et;
  _evictEnvCache();
  }
  const envTex = _cachedBadgeEnvTexMap[colorKey];

  // Card geometry
  const cardW = 1.8, cardH = 2.6, cardD = 0.005, cardR = 0.18;
  const shape = new THREE.Shape();
  const hw = cardW / 2, hh = cardH / 2, cr = cardR;
  shape.moveTo(-hw + cr, -hh); shape.lineTo(hw - cr, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + cr); shape.lineTo(hw, hh - cr);
  shape.quadraticCurveTo(hw, hh, hw - cr, hh); shape.lineTo(-hw + cr, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - cr); shape.lineTo(-hw, -hh + cr);
  shape.quadraticCurveTo(-hw, -hh, -hw + cr, -hh);
  const cardGeo = new THREE.ExtrudeGeometry(shape, { depth: cardD, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 6, curveSegments: 16 });
  cardGeo.center();

  // Fix UVs
  const pos = cardGeo.attributes.position, uv = cardGeo.attributes.uv, norm = cardGeo.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), nz = norm.getZ(i);
    if (nz > 0.5) uv.setXY(i, (x + hw) / cardW, (y + hh) / cardH);
    else if (nz < -0.5) uv.setXY(i, 1 - (x + hw) / cardW, (y + hh) / cardH);
  }
  cardGeo.attributes.uv.needsUpdate = true;

  // Front face texture
  const fW = 720, fH = Math.round(fW * (cardH / cardW));
  const fCanvas = document.createElement('canvas'); fCanvas.width = fW; fCanvas.height = fH;
  const fc = fCanvas.getContext('2d');

  const ribbonH = 56;
  const ribbonText = (name.toUpperCase() + '  ·  ').repeat(20);

  if (def.scene === 'mountain') {
    // ── Portal card — fully transparent front, portal fills entire card ─────
    // Face is entirely transparent — the portal plane covers the whole front
    // Just leave the canvas blank (transparent)

  } else {
    // ── Standard dark card ────────────────────────────────────────
    // Dark background with dither
    fc.fillStyle = '#080808'; fc.fillRect(0, 0, fW, fH);
    const dither = fc.getImageData(0, 0, fW, fH); const dd = dither.data;
    for (let i = 0; i < dd.length; i += 4) { const n = Math.random() * 6 - 3; dd[i] = Math.max(0, dd[i] + n); dd[i+1] = Math.max(0, dd[i+1] + n); dd[i+2] = Math.max(0, dd[i+2] + n); }
    fc.putImageData(dither, 0, 0);

    // Colored ribbon at top with repeating name
    fc.fillStyle = `rgb(${r},${g},${b})`; fc.fillRect(0, 40, fW, ribbonH);
    fc.font = '900 italic 38px "Source Serif 4", Georgia, "Times New Roman", serif';
    fc.letterSpacing = '0px';
    fc.fillStyle = 'rgba(0,0,0,0.6)'; fc.textBaseline = 'middle';
    fc.fillText(ribbonText, 0, 40 + ribbonH / 2 + 2);
    fc.fillText(ribbonText, 0.5, 40 + ribbonH / 2 + 2);

    // Icon — large, centered
    try {
      fc.save();
      const iconScale = fW / 30;
      fc.translate(fW/2 - 12 * iconScale, fH * 0.44 - 12 * iconScale);
      fc.scale(iconScale, iconScale);
      const path = new Path2D(def.iconPath);
      fc.strokeStyle = `rgba(${Math.min(255,r+80)},${Math.min(255,g+80)},${Math.min(255,b+80)},0.6)`;
      fc.lineWidth = 1.5; fc.stroke(path);
      const ig = fc.createLinearGradient(0, 0, 24, 24);
      ig.addColorStop(0, `rgba(${Math.min(255,r+120)},${Math.min(255,g+120)},${Math.min(255,b+120)},0.5)`);
      ig.addColorStop(1, `rgba(${r},${g},${b},0.3)`);
      fc.fillStyle = ig; fc.fill(path);
      fc.restore();
    } catch(_) {}

    // Achievement name
    fc.font = '700 52px Inter, system-ui, sans-serif';
    fc.fillStyle = '#ffffff'; fc.textAlign = 'center';
    fc.fillText(name, fW / 2, fH * 0.78);

    // Description
    fc.font = '500 30px Inter, system-ui, sans-serif';
    fc.fillStyle = `rgba(${r},${g},${b},0.8)`;
    fc.fillText(desc, fW / 2, fH * 0.78 + 44);

    // "EARNED" label
    fc.font = '600 22px Inter, system-ui, sans-serif';
    fc.fillStyle = 'rgba(255,255,255,0.25)';
    fc.fillText('EARNED', fW / 2, fH * 0.9);
  }

  const faceTex = new THREE.CanvasTexture(fCanvas);
  faceTex.anisotropy = _bcRenderer.capabilities.getMaxAnisotropy();

  // Normal map
  const nCanvas = document.createElement('canvas'); nCanvas.width = fW; nCanvas.height = fH;
  const nc = nCanvas.getContext('2d');
  nc.fillStyle = 'rgb(128,128,255)'; nc.fillRect(0, 0, fW, fH);
  if (def.scene === 'mountain') {
    // Subtle terrain-like normal variation for the landscape
    for (let y = 0; y < fH; y += 4) {
      for (let x = 0; x < fW; x += 4) {
        const nx = 128 + (Math.random() - 0.5) * 12;
        const ny = 128 + (Math.random() - 0.5) * 12;
        nc.fillStyle = `rgb(${Math.round(nx)},${Math.round(ny)},255)`;
        nc.fillRect(x, y, 4, 4);
      }
    }
  } else {
    // Emboss the icon
    try {
      nc.save();
      const nis = fW / 30;
      nc.translate(fW/2 - 12 * nis, fH * 0.44 - 12 * nis); nc.scale(nis, nis);
      const np = new Path2D(def.iconPath);
      nc.fillStyle = 'rgb(90,90,255)'; nc.translate(-2, -2); nc.fill(np);
      nc.translate(4, 4); nc.fillStyle = 'rgb(166,166,255)'; nc.fill(np);
      nc.restore();
    } catch(_) {}
  }
  const normalTex = new THREE.CanvasTexture(nCanvas);
  normalTex.anisotropy = _bcRenderer.capabilities.getMaxAnisotropy();

  // Metalness/roughness map — unique holographic pattern per badge
  const mCanvas = document.createElement('canvas'); mCanvas.width = fW; mCanvas.height = fH;
  const mc = mCanvas.getContext('2d');
  const hcx = fW / 2, hcy = fH * 0.44;
  const holo = def.holo || 'starburst';

  if (def.scene === 'mountain') {
    // Landscape card: low metalness, medium roughness — matte painting look
    // with glossy varnish over the sky portion for subtle reflections
    mc.fillStyle = 'rgb(0,180,40)'; mc.fillRect(0, 0, fW, fH);
    // Slightly more reflective in the sky area (moon, stars catch light)
    const skySheen = mc.createLinearGradient(0, 0, 0, fH * 0.4);
    skySheen.addColorStop(0, 'rgb(30,120,60)'); skySheen.addColorStop(1, 'transparent');
    mc.fillStyle = skySheen; mc.fillRect(0, 0, fW, fH * 0.4);
    // Snow caps get a slight metallic sheen
    mc.fillStyle = 'rgb(60,80,80)';
    [[0.42, 0.22, 0.06], [0.72, 0.18, 0.05], [0.9, 0.25, 0.04]].forEach(([px, py, sw]) => {
      mc.beginPath(); mc.moveTo(fW * px, fH * py);
      mc.lineTo(fW * (px - sw * 0.6), fH * (py + 0.06)); mc.lineTo(fW * (px + sw * 0.6), fH * (py + 0.06)); mc.fill();
    });
  } else {
    mc.fillStyle = 'rgb(0,235,30)'; mc.fillRect(0, 0, fW, fH);
  }

  if (def.scene === 'mountain') {
    // Mountain card MR map already set above — skip holo patterns
  } else if (holo === 'flame') {
    // Subtle wavy horizontal bands — gentle heat shimmer
    for (let y = 0; y < fH; y += 8) {
      const wave = Math.sin(y * 0.03) * 12;
      const rough = 35 + Math.abs(wave) * 1.5;
      mc.fillStyle = `rgb(0,${Math.round(rough)},180)`;
      mc.fillRect(0, y, fW, 6);
    }
  } else if (holo === 'chevron') {
    for (let y = -fH; y < fH * 2; y += 16) {
      mc.save(); mc.translate(hcx, y);
      mc.beginPath(); mc.moveTo(-fW, 0); mc.lineTo(0, -30); mc.lineTo(fW, 0); mc.lineTo(fW, 4); mc.lineTo(0, -26); mc.lineTo(-fW, 4); mc.closePath();
      mc.fillStyle = `rgb(0,${(y % 48 === 0) ? 30 : 70},190)`;
      mc.fill(); mc.restore();
    }
  } else if (holo === 'diamond') {
    for (let i = -fW; i < fW * 2; i += 18) {
      const rough = (Math.floor(i / 18) % 3 === 0) ? 30 : 65;
      mc.save(); mc.translate(i, 0); mc.rotate(0.6);
      mc.fillStyle = `rgb(0,${rough},190)`; mc.fillRect(0, -fH, 2, fH * 3);
      mc.restore();
      mc.save(); mc.translate(i, 0); mc.rotate(-0.6);
      mc.fillStyle = `rgb(0,${rough},190)`; mc.fillRect(0, -fH, 2, fH * 3);
      mc.restore();
    }
  } else if (holo === 'crown') {
    for (let r2 = 10; r2 < Math.max(fW, fH); r2 += 14) {
      mc.beginPath(); mc.arc(hcx, hcy, r2, 0, Math.PI * 2);
      mc.strokeStyle = `rgb(0,${(r2 % 42 === 0) ? 28 : 65},195)`;
      mc.lineWidth = 3; mc.stroke();
    }
  } else if (holo === 'bolt') {
    for (let x = 0; x < fW; x += 20) {
      const rough = (Math.floor(x / 20) % 3 === 0) ? 30 : 60;
      mc.beginPath();
      for (let y = 0; y < fH; y += 20) {
        mc.lineTo(x + ((y / 20) % 2 === 0 ? 0 : 8), y);
      }
      mc.strokeStyle = `rgb(0,${rough},185)`; mc.lineWidth = 2; mc.stroke();
    }
  } else if (holo === 'ripple') {
    for (let r2 = 5; r2 < Math.max(fW, fH); r2 += 10) {
      mc.beginPath(); mc.arc(hcx, hcy, r2, 0, Math.PI * 2);
      mc.strokeStyle = `rgb(0,${(r2 % 30 === 0) ? 28 : 60},185)`;
      mc.lineWidth = 2; mc.stroke();
    }
  } else if (holo === 'grid') {
    const s = 22;
    for (let row = 0; row < fH / s + 1; row++) {
      for (let col = 0; col < fW / s + 1; col++) {
        const x = col * s + (row % 2) * s / 2, y = row * s * 0.866;
        const rough = ((row + col) % 3 === 0) ? 30 : 65;
        mc.beginPath(); mc.arc(x, y, 5, 0, Math.PI * 2);
        mc.fillStyle = `rgb(0,${rough},190)`; mc.fill();
      }
    }
  } else if (holo === 'wave') {
    for (let y = 0; y < fH; y += 8) {
      mc.beginPath();
      for (let x = 0; x < fW; x += 2) {
        mc.lineTo(x, y + Math.sin(x * 0.025 + y * 0.015) * 8);
      }
      mc.strokeStyle = `rgb(0,${(y % 24 === 0) ? 28 : 60},180)`;
      mc.lineWidth = 1.5; mc.stroke();
    }
  } else if (holo === 'frost') {
    for (let a = 0; a < 6; a++) {
      mc.save(); mc.translate(hcx, hcy); mc.rotate(a * Math.PI / 3);
      for (let d = 10; d < Math.max(fW, fH); d += 16) {
        mc.fillStyle = `rgb(0,${(d % 48 === 0) ? 28 : 60},185)`;
        mc.fillRect(-1, 0, 2, d);
        if (d % 32 === 0) {
          mc.save(); mc.translate(0, d); mc.rotate(0.5);
          mc.fillRect(0, 0, 1.5, 16); mc.restore();
          mc.save(); mc.translate(0, d); mc.rotate(-0.5);
          mc.fillRect(0, 0, 1.5, 16); mc.restore();
        }
      }
      mc.restore();
    }
  } else if (holo === 'sunray') {
    const numRays = 20;
    for (let i = 0; i < numRays; i++) {
      mc.save(); mc.translate(hcx, hcy); mc.rotate((i / numRays) * Math.PI * 2);
      mc.fillStyle = `rgb(0,${(i % 3 === 0) ? 30 : 65},185)`;
      mc.fillRect(-3, 0, 6, Math.max(fW, fH));
      mc.restore();
    }
  } else {
    // Default starburst
    const numRays = 48;
    for (let i = 0; i < numRays; i++) {
      mc.save(); mc.translate(hcx, hcy); mc.rotate((i / numRays) * Math.PI * 2);
      mc.fillStyle = `rgb(0,${(i % 3 === 0) ? 35 : (i % 3 === 1) ? 75 : 55},175)`;
      mc.fillRect(-1.5, 0, 3, Math.max(fW, fH));
      mc.restore();
    }
  }

  if (def.scene !== 'mountain') {
    // Ribbon — same chrome as icon
    mc.fillStyle = 'rgb(0,5,255)';
    mc.fillRect(0, 40, fW, ribbonH);

    // Icon area — full chrome on top of pattern
    try {
      mc.save();
      const mis = fW / 30;
      mc.translate(fW/2 - 12 * mis, fH * 0.44 - 12 * mis); mc.scale(mis, mis);
      mc.fillStyle = 'rgb(0,5,255)'; mc.fill(new Path2D(def.iconPath));
      mc.restore();
    } catch(_) {}
  }
  const mrTex = new THREE.CanvasTexture(mCanvas);
  mrTex.anisotropy = _bcRenderer.capabilities.getMaxAnisotropy();

  // Back face — badge info
  const bCanvas = document.createElement('canvas'); bCanvas.width = fW; bCanvas.height = fH;
  const bc = bCanvas.getContext('2d');
  bc.fillStyle = '#080808'; bc.fillRect(0, 0, fW, fH);
  const bDither = bc.getImageData(0, 0, fW, fH); const bd = bDither.data;
  for (let i = 0; i < bd.length; i += 4) { const n = Math.random() * 6 - 3; bd[i] = Math.max(0, bd[i] + n); bd[i+1] = Math.max(0, bd[i+1] + n); bd[i+2] = Math.max(0, bd[i+2] + n); }
  bc.putImageData(bDither, 0, 0);
  bc.fillStyle = `rgb(${r},${g},${b})`; bc.fillRect(0, fH - ribbonH, fW, ribbonH);
  bc.font = '900 italic 38px "Source Serif 4", Georgia, "Times New Roman", serif'; bc.letterSpacing = '0px'; bc.fillStyle = 'rgba(0,0,0,0.6)'; bc.textBaseline = 'middle';
  bc.fillText(ribbonText, 0, fH - ribbonH / 2);
  bc.fillText(ribbonText, 0.5, fH - ribbonH / 2);
  bc.font = '800 140px Inter, system-ui, sans-serif'; bc.fillStyle = `rgba(${r},${g},${b},0.15)`; bc.textAlign = 'center';
  bc.fillText(def.label, fW / 2, fH * 0.4);
  bc.font = '600 40px Inter, system-ui, sans-serif'; bc.fillStyle = 'rgba(255,255,255,0.5)';
  bc.fillText(name, fW / 2, fH * 0.55);
  bc.font = '400 28px Inter, system-ui, sans-serif'; bc.fillStyle = 'rgba(255,255,255,0.3)';
  bc.fillText(desc, fW / 2, fH * 0.55 + 42);
  bc.font = '500 22px Inter, system-ui, sans-serif'; bc.fillStyle = 'rgba(255,255,255,0.15)';
  bc.fillText('CycleIQ', fW / 2, fH * 0.85);
  const backTex = new THREE.CanvasTexture(bCanvas);
  backTex.anisotropy = _bcRenderer.capabilities.getMaxAnisotropy();

  // Back face MR map — chrome on text areas
  // CRITICAL: back texture inherits textBaseline='middle' from ribbon drawing,
  // so all text Y positions are relative to middle baseline. MR map must match.
  const bMrCanvas = document.createElement('canvas'); bMrCanvas.width = fW; bMrCanvas.height = fH;
  const bmc = bMrCanvas.getContext('2d');
  bmc.fillStyle = 'rgb(0,235,30)'; bmc.fillRect(0, 0, fW, fH);
  bmc.textBaseline = 'middle'; // match back texture
  bmc.textAlign = 'center';
  // Ribbon
  bmc.fillStyle = 'rgb(0,5,255)'; bmc.fillRect(0, fH - ribbonH, fW, ribbonH);
  // Big label
  bmc.font = '800 140px Inter, system-ui, sans-serif';
  bmc.fillStyle = 'rgb(0,8,255)'; bmc.fillText(def.label, fW / 2, fH * 0.4);
  // Achievement name
  bmc.font = '600 40px Inter, system-ui, sans-serif';
  bmc.fillStyle = 'rgb(0,10,240)'; bmc.fillText(name, fW / 2, fH * 0.55);
  // Description
  bmc.font = '400 28px Inter, system-ui, sans-serif';
  bmc.fillStyle = 'rgb(0,12,230)'; bmc.fillText(desc, fW / 2, fH * 0.55 + 42);
  const backMrTex = new THREE.CanvasTexture(bMrCanvas);

  // Materials
  const isMountain = def.scene === 'mountain';
  const frontMat = new THREE.MeshStandardMaterial({
    map: faceTex, normalMap: normalTex, normalScale: new THREE.Vector2(isMountain ? 0.3 : 1.2, isMountain ? 0.3 : 1.2),
    metalnessMap: mrTex, roughnessMap: mrTex, metalness: 1, roughness: 1,
    envMap: envTex, envMapIntensity: isMountain ? 0.3 : 0.6,
    side: THREE.FrontSide,
    transparent: isMountain, alphaTest: isMountain ? 0.01 : 0
  });
  const backMat = new THREE.MeshStandardMaterial({
    map: backTex, metalnessMap: backMrTex, roughnessMap: backMrTex,
    metalness: 1, roughness: 1, envMap: envTex, envMapIntensity: 0.6
  });
  const edgeMat = new THREE.MeshStandardMaterial({
    color: def.color, metalness: 1, roughness: 0.05, envMap: envTex, envMapIntensity: 3
  });

  // Split geometry groups
  if (!cardGeo.index) { const indices = []; for (let i = 0; i < cardGeo.attributes.position.count; i++) indices.push(i); cardGeo.setIndex(indices); }
  const nrm = cardGeo.attributes.normal, idx = cardGeo.index;
  const fIdx = [], bIdx = [], sIdx = [];
  for (const grp of cardGeo.groups) {
    for (let i = grp.start; i < grp.start + grp.count; i += 3) {
      const a = idx.getX(i), bv = idx.getX(i+1), c = idx.getX(i+2);
      const nz = (nrm.getZ(a) + nrm.getZ(bv) + nrm.getZ(c)) / 3;
      if (grp.materialIndex === 1) sIdx.push(a, bv, c);
      else if (nz > 0.5) fIdx.push(a, bv, c);
      else if (nz < -0.5) bIdx.push(a, bv, c);
      else sIdx.push(a, bv, c);
    }
  }
  cardGeo.setIndex([...fIdx, ...bIdx, ...sIdx]);
  cardGeo.clearGroups();
  cardGeo.addGroup(0, fIdx.length, 0);
  cardGeo.addGroup(fIdx.length, bIdx.length, 1);
  cardGeo.addGroup(fIdx.length + bIdx.length, sIdx.length, 2);

  // Icon parallax layer
  const iCanvas = document.createElement('canvas'); iCanvas.width = fW; iCanvas.height = fH;
  const ic = iCanvas.getContext('2d');
  try {
    ic.save();
    const iis = fW / 30;
    ic.translate(fW/2 - 12 * iis, fH * 0.44 - 12 * iis); ic.scale(iis, iis);
    const ip = new Path2D(def.iconPath);
    const iGrad = ic.createLinearGradient(0, 0, 24, 24);
    iGrad.addColorStop(0, `rgba(${Math.min(255,r+120)},${Math.min(255,g+120)},${Math.min(255,b+120)},0.6)`);
    iGrad.addColorStop(1, `rgba(${r},${g},${b},0.4)`);
    ic.fillStyle = iGrad; ic.fill(ip);
    ic.restore();
  } catch(_) {}
  const iconPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(cardW * 0.95, cardH * 0.95),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(iCanvas), transparent: true, depthWrite: false })
  );
  iconPlane.position.z = cardD * 0.5 + 0.01;

  // Glitter/sparkle layer — additive blending for bright sparkles
  const glitterMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      time: { value: 0 },
      rotY: { value: 0 },
      rotX: { value: 0 },
      sparkleColor: { value: new THREE.Color(r / 255, g / 255, b / 255) }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform float rotY;
      uniform float rotX;
      uniform vec3 sparkleColor;
      varying vec2 vUv;

      // Hash for pseudo-random sparkle positions
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      void main() {
        vec2 grid = floor(vUv * 60.0);
        float rnd = hash(grid);
        if (rnd > 0.35) discard;

        vec2 cell = fract(vUv * 60.0);
        vec2 center = vec2(hash(grid + 0.5), hash(grid + 1.3));
        float dist = length(cell - center);
        if (dist > 0.06) discard;

        // Each sparkle flashes at unique rotation angles
        float phase = rnd * 6.28;
        float f1 = sin(rotY * 6.0 + phase);
        float f2 = sin(rotX * 4.0 + phase * 1.7);
        float f3 = sin(time * 2.0 + phase * 0.5);
        float flash = (f1 + f2 + f3) / 3.0;
        flash = smoothstep(0.15, 0.7, flash);

        if (flash < 0.01) discard;

        // Bright white core
        float core = 1.0 - smoothstep(0.0, 0.04, dist);
        vec3 col = mix(sparkleColor + 0.5, vec3(1.0), core);

        gl_FragColor = vec4(col * flash * 0.45, flash * 0.45);
      }
    `
  });
  const glitterPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(cardW * 0.95, cardH * 0.95), glitterMat
  );
  glitterPlane.position.z = cardD * 0.5 + 0.015;

  _bcMesh = new THREE.Group();
  _bcMesh.add(new THREE.Mesh(cardGeo, [frontMat, backMat, edgeMat]));

  if (def.scene === 'mountain') {
    // ── Portal via stencil mask — mountain layers in main scene, clipped by card shape ──

    // Step 1: Stencil mask — card-shaped plane that writes stencil=1, no color/depth
    const maskGeo = new THREE.PlaneGeometry(cardW * 0.98, cardH * 0.98);
    const maskMat = new THREE.MeshBasicMaterial({
      colorWrite: false, depthWrite: false,
    });
    maskMat.stencilWrite = true;
    maskMat.stencilRef = 1;
    maskMat.stencilFunc = THREE.AlwaysStencilFunc;
    maskMat.stencilFail = THREE.ReplaceStencilOp;
    maskMat.stencilZFail = THREE.ReplaceStencilOp;
    maskMat.stencilZPass = THREE.ReplaceStencilOp;
    const maskPlane = new THREE.Mesh(maskGeo, maskMat);
    maskPlane.position.z = cardD * 0.5 + 0.0005;
    maskPlane.renderOrder = 0;
    _bcMesh.add(maskPlane);

    // Step 2: Mountain layers — in main scene BEHIND the card, stencil-clipped
    const camDist = 6.8; // main camera z position
    const camFov = 30;
    const makeLayer = (drawFn, zBehind) => {
      const c = document.createElement('canvas'); c.width = fW; c.height = fH;
      drawFn(c.getContext('2d'), fW, fH);
      // Size layer to overfill the card at its depth
      const dist = camDist + zBehind; // total distance from camera
      const vH = 2 * Math.tan((camFov * Math.PI / 180) / 2) * dist * 0.6;
      const vW = vH * (w / h);
      const mat = new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false
      });
      mat.stencilWrite = false;
      mat.stencilRef = 1;
      mat.stencilFunc = THREE.EqualStencilFunc;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(vW, vH), mat);
      m.position.z = -(cardD * 0.5) - zBehind; // behind the card
      m.renderOrder = 1;
      _bcMesh.add(m);
      return m;
    };

    // Layer 0: Deep night sky — rich nebula, milky way, dense starfield
    const sky = makeLayer((ctx, w2, h2) => {
      // Deep space base — very dark with slight blue
      ctx.fillStyle = '#020412'; ctx.fillRect(0, 0, w2, h2);

      // Vertical atmosphere gradient — horizon glow
      const atmo = ctx.createLinearGradient(0, 0, 0, h2);
      atmo.addColorStop(0, 'rgba(3,4,20,1)');
      atmo.addColorStop(0.3, 'rgba(8,10,35,1)');
      atmo.addColorStop(0.55, 'rgba(15,12,40,0.9)');
      atmo.addColorStop(0.75, 'rgba(35,18,50,0.7)');
      atmo.addColorStop(0.88, 'rgba(60,25,45,0.5)');
      atmo.addColorStop(1, 'rgba(20,15,35,0.3)');
      ctx.fillStyle = atmo; ctx.fillRect(0, 0, w2, h2);

      // Milky way band — diagonal nebula cloud
      ctx.save();
      ctx.translate(w2 * 0.5, h2 * 0.35);
      ctx.rotate(-0.35);
      const milky = ctx.createRadialGradient(0, 0, 0, 0, 0, w2 * 0.5);
      milky.addColorStop(0, 'rgba(80,70,120,0.12)');
      milky.addColorStop(0.3, 'rgba(60,50,100,0.08)');
      milky.addColorStop(0.6, 'rgba(40,30,80,0.04)');
      milky.addColorStop(1, 'transparent');
      ctx.fillStyle = milky;
      ctx.fillRect(-w2 * 0.6, -h2 * 0.15, w2 * 1.2, h2 * 0.3);
      ctx.restore();

      // Nebula patches — colored gas clouds
      const nebulae = [
        [w2*0.2, h2*0.25, w2*0.18, 'rgba(60,20,80,0.08)', 'rgba(40,10,60,0.03)'],
        [w2*0.7, h2*0.3, w2*0.15, 'rgba(20,40,80,0.07)', 'rgba(10,20,50,0.02)'],
        [w2*0.4, h2*0.15, w2*0.12, 'rgba(80,30,50,0.06)', 'rgba(40,15,30,0.02)'],
        [w2*0.85, h2*0.45, w2*0.1, 'rgba(30,50,70,0.06)', 'rgba(15,25,40,0.02)'],
        [w2*0.15, h2*0.5, w2*0.13, 'rgba(50,20,60,0.05)', 'rgba(25,10,35,0.01)'],
      ];
      nebulae.forEach(([nx, ny, nr, c1, c2]) => {
        const ng = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
        ng.addColorStop(0, c1); ng.addColorStop(0.6, c2); ng.addColorStop(1, 'transparent');
        ctx.fillStyle = ng; ctx.fillRect(0, 0, w2, h2);
      });

      // Dense starfield — 3 layers of different sizes for depth
      // Tiny distant stars
      for (let i = 0; i < 300; i++) {
        const a = 0.1 + Math.random() * 0.3;
        ctx.fillStyle = `rgba(180,190,220,${a})`;
        ctx.fillRect(Math.random() * w2, Math.random() * h2, 1, 1);
      }
      // Medium stars
      for (let i = 0; i < 80; i++) {
        const a = 0.2 + Math.random() * 0.5;
        const sz = 1 + Math.random() * 1.5;
        ctx.fillStyle = `rgba(220,225,255,${a})`;
        ctx.beginPath(); ctx.arc(Math.random() * w2, Math.random() * h2 * 0.75, sz, 0, Math.PI * 2); ctx.fill();
      }
      // Bright stars with color tint and glow
      const starColors = ['200,220,255', '255,240,220', '180,200,255', '255,220,200', '220,255,240'];
      for (let i = 0; i < 20; i++) {
        const sx = Math.random() * w2, sy = Math.random() * h2 * 0.65;
        const col = starColors[Math.floor(Math.random() * starColors.length)];
        const sz = 1.5 + Math.random() * 2;
        // Glow halo
        const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sz * 5);
        sg.addColorStop(0, `rgba(${col},0.5)`);
        sg.addColorStop(0.3, `rgba(${col},0.1)`);
        sg.addColorStop(1, 'transparent');
        ctx.fillStyle = sg; ctx.fillRect(sx - sz * 6, sy - sz * 6, sz * 12, sz * 12);
        // Core
        ctx.fillStyle = `rgba(${col},0.9)`;
        ctx.beginPath(); ctx.arc(sx, sy, sz, 0, Math.PI * 2); ctx.fill();
        // Cross spike on brightest
        if (i < 6) {
          ctx.strokeStyle = `rgba(${col},0.15)`;
          ctx.lineWidth = 0.5;
          ctx.beginPath(); ctx.moveTo(sx - sz * 4, sy); ctx.lineTo(sx + sz * 4, sy); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(sx, sy - sz * 4); ctx.lineTo(sx, sy + sz * 4); ctx.stroke();
        }
      }

      // Moon — large, detailed, with halo
      const mx = w2 * 0.72, my = h2 * 0.18, mr2 = 35;
      // Outer halo
      const mh = ctx.createRadialGradient(mx, my, mr2 * 0.8, mx, my, mr2 * 3);
      mh.addColorStop(0, 'rgba(200,200,180,0.06)');
      mh.addColorStop(0.5, 'rgba(150,150,140,0.02)');
      mh.addColorStop(1, 'transparent');
      ctx.fillStyle = mh; ctx.fillRect(mx - mr2 * 4, my - mr2 * 4, mr2 * 8, mr2 * 8);
      // Inner glow
      const mg = ctx.createRadialGradient(mx - 5, my - 5, 0, mx, my, mr2 * 1.3);
      mg.addColorStop(0, 'rgba(255,252,240,0.95)');
      mg.addColorStop(0.4, 'rgba(255,245,220,0.5)');
      mg.addColorStop(0.7, 'rgba(200,190,170,0.15)');
      mg.addColorStop(1, 'transparent');
      ctx.fillStyle = mg; ctx.fillRect(mx - mr2 * 2, my - mr2 * 2, mr2 * 4, mr2 * 4);
      // Moon disc
      ctx.fillStyle = '#faf6e8'; ctx.beginPath(); ctx.arc(mx, my, mr2, 0, Math.PI * 2); ctx.fill();
      // Subtle craters
      ctx.fillStyle = 'rgba(210,200,175,0.3)';
      ctx.beginPath(); ctx.arc(mx - 10, my - 8, 6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(mx + 12, my + 10, 4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(mx + 3, my + 15, 5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(mx - 15, my + 5, 3, 0, Math.PI * 2); ctx.fill();
    }, 3.0);

    // Layer 0.5: Distant aurora / cloud band (between sky and mountains)
    const aurora = makeLayer((ctx, w2, h2) => {
      // Soft horizontal aurora bands
      for (let i = 0; i < 4; i++) {
        const ay = h2 * (0.2 + i * 0.1) + Math.sin(i * 2.1) * h2 * 0.05;
        const ah = h2 * 0.06 + Math.sin(i * 1.7) * h2 * 0.02;
        const ag = ctx.createLinearGradient(0, ay, 0, ay + ah);
        const hue = [120, 180, 200, 160][i];
        ag.addColorStop(0, 'transparent');
        ag.addColorStop(0.3, `hsla(${hue},60%,40%,0.04)`);
        ag.addColorStop(0.5, `hsla(${hue},50%,50%,0.06)`);
        ag.addColorStop(0.7, `hsla(${hue},60%,40%,0.04)`);
        ag.addColorStop(1, 'transparent');
        ctx.fillStyle = ag; ctx.fillRect(0, ay, w2, ah);
      }
      // Wispy cloud shapes
      for (let i = 0; i < 6; i++) {
        const cx = Math.random() * w2, cy = h2 * 0.25 + Math.random() * h2 * 0.2;
        const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 40 + Math.random() * 30);
        cg.addColorStop(0, 'rgba(50,50,80,0.05)');
        cg.addColorStop(0.5, 'rgba(30,30,60,0.02)');
        cg.addColorStop(1, 'transparent');
        ctx.fillStyle = cg; ctx.fillRect(0, 0, w2, h2);
      }
    }, 2.2);

    // Layer 1: Far mountains
    const farMtn = makeLayer((ctx, w2, h2) => {
      ctx.fillStyle = '#0f0f2a';
      ctx.beginPath(); ctx.moveTo(0,h2*0.5);
      ctx.lineTo(w2*0.1,h2*0.35); ctx.lineTo(w2*0.25,h2*0.42); ctx.lineTo(w2*0.4,h2*0.2);
      ctx.lineTo(w2*0.55,h2*0.35); ctx.lineTo(w2*0.7,h2*0.15); ctx.lineTo(w2*0.85,h2*0.28);
      ctx.lineTo(w2,h2*0.35); ctx.lineTo(w2,h2); ctx.lineTo(0,h2); ctx.fill();
      ctx.fillStyle = 'rgba(200,215,255,0.3)';
      [[0.4,0.2],[0.7,0.15]].forEach(([px,py]) => {
        ctx.beginPath(); ctx.moveTo(w2*px,h2*py);
        ctx.lineTo(w2*(px-0.04),h2*(py+0.07)); ctx.lineTo(w2*(px+0.04),h2*(py+0.07)); ctx.fill();
      });
    }, 1.6);

    // Layer 2: Mid hills
    const midHill = makeLayer((ctx, w2, h2) => {
      ctx.fillStyle = '#14142e';
      ctx.beginPath(); ctx.moveTo(0,h2*0.62);
      ctx.quadraticCurveTo(w2*0.2,h2*0.48,w2*0.4,h2*0.55);
      ctx.quadraticCurveTo(w2*0.6,h2*0.62,w2*0.8,h2*0.5);
      ctx.quadraticCurveTo(w2*0.95,h2*0.42,w2,h2*0.52);
      ctx.lineTo(w2,h2); ctx.lineTo(0,h2); ctx.fill();
    }, 1.0);

    // Layer 3: Foreground trees
    const fg = makeLayer((ctx, w2, h2) => {
      ctx.fillStyle = '#0e0e24';
      ctx.beginPath(); ctx.moveTo(0,h2*0.74);
      ctx.quadraticCurveTo(w2*0.3,h2*0.67,w2*0.5,h2*0.72);
      ctx.quadraticCurveTo(w2*0.7,h2*0.77,w2,h2*0.7);
      ctx.lineTo(w2,h2); ctx.lineTo(0,h2); ctx.fill();
      for (let i = 0; i < 14; i++) {
        const tx = w2*0.03+Math.random()*w2*0.94, tBase = h2*0.68+Math.random()*h2*0.1;
        const tH2 = 30+Math.random()*50, tW2 = 8+Math.random()*10;
        ctx.fillStyle = '#0a0a1e'; ctx.fillRect(tx-1.5,tBase,3,10);
        for (let j = 0; j < 3; j++) {
          const ly = tBase-tH2*(0.3+j*0.25), lw = tW2*(1-j*0.25);
          ctx.beginPath(); ctx.moveTo(tx,ly); ctx.lineTo(tx-lw,ly+tH2*0.35); ctx.lineTo(tx+lw,ly+tH2*0.35); ctx.fill();
        }
      }
      for (let i = 0; i < 25; i++) {
        ctx.fillStyle = `rgba(200,210,255,${0.1+Math.random()*0.2})`;
        ctx.beginPath(); ctx.arc(Math.random()*w2,Math.random()*h2,1+Math.random()*2,0,Math.PI*2); ctx.fill();
      }
    }, 0.5);

    // Layer 4: Close silhouette trees at edges — framing the scene
    const closeTrees = makeLayer((ctx, w2, h2) => {
      ctx.fillStyle = '#060614';
      // Left cluster — large pines peeking in from left edge
      for (let i = 0; i < 4; i++) {
        const tx = w2 * 0.02 + i * w2 * 0.04;
        const tBase = h2 * 0.55 + i * h2 * 0.06;
        const tH2 = h2 * 0.2 + Math.random() * h2 * 0.15;
        const tW2 = w2 * 0.03 + Math.random() * w2 * 0.02;
        for (let j = 0; j < 4; j++) {
          const ly = tBase - tH2 * (0.2 + j * 0.22);
          const lw = tW2 * (1 - j * 0.2);
          ctx.beginPath(); ctx.moveTo(tx, ly); ctx.lineTo(tx - lw, ly + tH2 * 0.28); ctx.lineTo(tx + lw, ly + tH2 * 0.28); ctx.fill();
        }
      }
      // Right cluster
      for (let i = 0; i < 4; i++) {
        const tx = w2 * 0.92 + i * w2 * 0.025;
        const tBase = h2 * 0.58 + i * h2 * 0.05;
        const tH2 = h2 * 0.18 + Math.random() * h2 * 0.12;
        const tW2 = w2 * 0.025 + Math.random() * w2 * 0.015;
        for (let j = 0; j < 4; j++) {
          const ly = tBase - tH2 * (0.2 + j * 0.22);
          const lw = tW2 * (1 - j * 0.2);
          ctx.beginPath(); ctx.moveTo(tx, ly); ctx.lineTo(tx - lw, ly + tH2 * 0.28); ctx.lineTo(tx + lw, ly + tH2 * 0.28); ctx.fill();
        }
      }
      // Ground strip
      ctx.fillRect(0, h2 * 0.88, w2, h2 * 0.12);
    }, 0.2);

    // Layer 5: Floating particles / fireflies — closest, most parallax
    const particles = makeLayer((ctx, w2, h2) => {
      for (let i = 0; i < 15; i++) {
        const px2 = Math.random() * w2, py2 = h2 * 0.3 + Math.random() * h2 * 0.5;
        const sz = 1.5 + Math.random() * 2.5;
        const a = 0.15 + Math.random() * 0.25;
        // Warm firefly glow
        const pg = ctx.createRadialGradient(px2, py2, 0, px2, py2, sz * 4);
        pg.addColorStop(0, `rgba(255,240,180,${a})`);
        pg.addColorStop(0.4, `rgba(255,200,100,${a * 0.3})`);
        pg.addColorStop(1, 'transparent');
        ctx.fillStyle = pg; ctx.fillRect(px2 - sz * 5, py2 - sz * 5, sz * 10, sz * 10);
        ctx.fillStyle = `rgba(255,250,200,${a * 1.5})`;
        ctx.beginPath(); ctx.arc(px2, py2, sz * 0.5, 0, Math.PI * 2); ctx.fill();
      }
    }, 0.05);

    // Text overlay on top of portal — achievement name + desc
    const txtCanvas = document.createElement('canvas'); txtCanvas.width = fW; txtCanvas.height = fH;
    const tc = txtCanvas.getContext('2d');
    // Gradient scrim at bottom for text readability
    const scrim = tc.createLinearGradient(0, fH * 0.65, 0, fH);
    scrim.addColorStop(0, 'transparent'); scrim.addColorStop(0.5, 'rgba(0,0,0,0.4)'); scrim.addColorStop(1, 'rgba(0,0,0,0.7)');
    tc.fillStyle = scrim; tc.fillRect(0, fH * 0.65, fW, fH * 0.35);
    tc.textAlign = 'center';
    tc.shadowColor = 'rgba(0,0,0,0.8)'; tc.shadowBlur = 12;
    tc.font = '700 42px Inter, system-ui, sans-serif';
    tc.fillStyle = '#fff';
    tc.fillText(name, fW / 2, fH * 0.88);
    tc.font = '500 24px Inter, system-ui, sans-serif';
    tc.fillStyle = `rgba(${Math.min(255,r+60)},${Math.min(255,g+60)},${Math.min(255,b+60)},0.8)`;
    tc.fillText(desc, fW / 2, fH * 0.88 + 32);
    tc.shadowBlur = 0;
    const txtPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(cardW * 0.95, cardH * 0.95),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(txtCanvas), transparent: true, depthWrite: false })
    );
    txtPlane.position.z = cardD * 0.5 + 0.003;
    _bcMesh.add(txtPlane);

    // Set render order on card body so it renders after mask
    _bcMesh.children[0].renderOrder = 2; // card body
    txtPlane.renderOrder = 3;

    _bcMesh.add(glitterPlane);
    glitterPlane.renderOrder = 4;

    // Parallax — layers shift when card tilts, deeper layers move more
    _bcMesh._parallax = [
      { mesh: sky, depth: 0.025 },
      { mesh: aurora, depth: 0.02 },
      { mesh: farMtn, depth: 0.015 },
      { mesh: midHill, depth: 0.01 },
      { mesh: fg, depth: 0.006 },
      { mesh: closeTrees, depth: 0.003 },
      { mesh: particles, depth: 0.001 },
    ];
    _bcMesh._portal = null; // no render target needed
  } else {
    _bcMesh.add(iconPlane);
    _bcMesh.add(glitterPlane);
    _bcMesh._parallax = [{ mesh: iconPlane, depth: 0.003 }];
  }

  // Intro animation — card flips in from edge
  _bcMesh.rotation.x = 0.3;
  _bcMesh.rotation.y = -Math.PI * 0.6;
  _bcMesh.rotation.z = 0.15;
  _bcMesh.scale.setScalar(0.7);
  _bcScene.add(_bcMesh);

  const REST_X = 0.06, REST_Y = 0.08;
  const _bcIntroStart = Date.now();
  const _bcIntroDur = 500;
  let velX = 0, velY = 0;
  const SPRING = 0.008, DAMP = 0.97;
  let _bcFrameSkip = 0;

  function _easeOutBack2(t) { const c = 1.4; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }

  function loop() {
    _bcRaf = requestAnimationFrame(loop);
    if (!_bcMesh || !_bcRenderer || !_bcScene || !_bcCamera) return;
    if (_bcIdle) return;
    try {

    // Live resize — corrects size if canvas was measured before sheet animation completed
    if (_bcCanvas) {
      const cw = _bcCanvas.clientWidth, ch = _bcCanvas.clientHeight;
      if (cw > 10 && ch > 10 && (Math.abs(cw - _bcRenderer.domElement.clientWidth) > 2 || Math.abs(ch - _bcRenderer.domElement.clientHeight) > 2)) {
        _bcRenderer.setSize(cw, ch);
        _bcRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        _bcCamera.aspect = cw / ch;
        _bcCamera.updateProjectionMatrix();
      }
    }

    // Always update glitter uniforms
    const t = Date.now() * 0.001;
    glitterMat.uniforms.time.value = t;
    glitterMat.uniforms.rotY.value = _bcMesh.rotation.y || 0;
    glitterMat.uniforms.rotX.value = _bcMesh.rotation.x || 0;

    // Intro animation
    const introElapsed = Date.now() - _bcIntroStart;
    if (introElapsed < _bcIntroDur) {
      const p = _easeOutBack2(Math.min(1, introElapsed / _bcIntroDur));
      _bcMesh.rotation.x = 0.3 + (REST_X - 0.3) * p;
      _bcMesh.rotation.y = -Math.PI * 0.6 + (REST_Y - (-Math.PI * 0.6)) * p;
      _bcMesh.rotation.z = 0.15 * (1 - p);
      _bcMesh.scale.setScalar(0.7 + 0.3 * p);
      glitterMat.uniforms.rotY.value = _bcMesh.rotation.y;
      glitterMat.uniforms.rotX.value = _bcMesh.rotation.x;
      _bcRenderer.render(_bcScene, _bcCamera);
      return;
    } else if (!_bcAutoSpin && !_bcSpinning && !_bcDragging) {
      _bcAutoSpin = true;
    }

    // Skip every other frame during auto-spin — but only after settling (1s grace)
    if (_bcAutoSpin && !_bcDragging && !_bcSpinning && (Date.now() - _bcReleaseTime) > 3000) {
      if (++_bcFrameSkip % 2 !== 0) return;
    } else { _bcFrameSkip = 0; }

    // Holo shimmer — sweep rainbow env map based on rotation angle
    const ry = _bcMesh.rotation.y || 0, rx = _bcMesh.rotation.x || 0;
    if (!isMountain) {
      // Sweep env map offset for rainbow shift on rotation
      envTex.offset.x = (ry * 0.4) % 1;
      envTex.offset.y = (rx * 0.15) % 1;
      envTex.needsUpdate = false;
      // Boost env intensity when tilted — chrome pops on rotation, subtle when facing
      const tilt = 1 - Math.max(0, Math.cos(ry) * Math.cos(rx));
      frontMat.envMapIntensity = 0.6 + tilt * 2.5;
    }
    // Moving spotlight — orbits opposite to card tilt for specular hotspot
    holoSpot.position.x = -Math.sin(ry) * 3;
    holoSpot.position.y = Math.sin(rx) * 2 + 1;
    holoSpot.position.z = Math.cos(ry) * 3 + 1;
    holoSpot.intensity = 2 + Math.max(0, Math.cos(ry)) * 4;
    if (!_bcDragging) {
      const timeSinceRelease = Date.now() - _bcReleaseTime;
      if (_bcSpinning) {
        const speed = Math.abs(_bcDragVelX) + Math.abs(_bcDragVelY);
        if (speed > 0.002) {
          _bcDragVelX *= 0.96; _bcDragVelY *= 0.96;
          _bcMesh.rotation.x += _bcDragVelX; _bcMesh.rotation.y += _bcDragVelY;
          _bcMesh.rotation.x += (REST_X - _bcMesh.rotation.x) * 0.005;
        } else {
          _bcSpinning = false; _bcAutoSpin = true; _bcAutoSpinStart = Date.now();
        }
      } else if (_bcAutoSpin || timeSinceRelease > 2000) {
        _bcAutoSpin = true;
        if (!_bcAutoSpinStart) _bcAutoSpinStart = Date.now();
        const bst = Date.now() * 0.001;
        // Ease into auto-spin speed over 0.5s
        const spinEase = Math.min(1, (Date.now() - _bcAutoSpinStart) / 500);
        _bcMesh.rotation.y += 0.006 * spinEase;
        _bcMesh.rotation.x += (REST_X + Math.sin(bst * 0.8) * 0.2 - _bcMesh.rotation.x) * (0.01 + 0.03 * spinEase);
        _bcMesh.rotation.z += (Math.sin(bst * 0.5 + 1) * 0.05 - _bcMesh.rotation.z) * (0.01 + 0.02 * spinEase);
      }
    }
    // Parallax — move layers in portal scene or icon plane
    let dy = _bcMesh.rotation.y - REST_Y; dy -= Math.round(dy / (Math.PI * 2)) * Math.PI * 2;
    const dx = _bcMesh.rotation.x - REST_X;
    if (_bcMesh._parallax && _bcMesh._parallax.length) {
      if (Math.abs(dy) < 0.8 && Math.abs(dx) < 0.8) {
        _bcMesh._parallax.forEach(l => { l.mesh.position.x += (-dy * l.depth * 6 - l.mesh.position.x) * 0.15; l.mesh.position.y += (dx * l.depth * 6 - l.mesh.position.y) * 0.15; });
      } else { _bcMesh._parallax.forEach(l => { l.mesh.position.x *= 0.85; l.mesh.position.y *= 0.85; }); }
    }
    _bcRenderer.render(_bcScene, _bcCamera);
    } catch(e) { console.warn('Badge card render error:', e.message); cancelAnimationFrame(_bcRaf); _bcRaf = null; }
  }
  loop();

  // Interaction
  let lastTap = 0;
  canvasEl.addEventListener('pointerdown', e => {
    _bcIdle = false; _bcAutoSpin = false; _bcAutoSpinStart = 0;
    const now = Date.now();
    if (now - lastTap < 350 && _bcMesh) { _bcDragVelX = 0; _bcDragVelY = 0.08; _bcReleaseTime = now; _bcSpinning = true; _bcDragging = false; lastTap = 0; return; }
    lastTap = now;
    _bcDragging = true; _bcStartX = e.clientX; _bcStartY = e.clientY;
    _bcRotX = _bcMesh.rotation.x; _bcRotY = _bcMesh.rotation.y;
    _bcTrail = [{ x: e.clientX, y: e.clientY, t: Date.now() }];
    canvasEl.setPointerCapture(e.pointerId); canvasEl.style.cursor = 'grabbing';
  }, bcSig);
  canvasEl.addEventListener('pointermove', e => {
    if (!_bcDragging || !_bcMesh) return;
    _bcMesh.rotation.y = _bcRotY + (e.clientX - _bcStartX) * 0.015;
    _bcMesh.rotation.x = _bcRotX + (e.clientY - _bcStartY) * 0.015;
    _bcTrail.push({ x: e.clientX, y: e.clientY, t: Date.now() });
    if (_bcTrail.length > 6) _bcTrail.shift();
  }, bcSig);
  canvasEl.addEventListener('touchstart', e => { e.stopPropagation(); }, { passive: true, signal: _bcAbort.signal });
  canvasEl.addEventListener('touchmove', e => { e.preventDefault(); e.stopPropagation(); }, { passive: false, signal: _bcAbort.signal });
  const endDrag = () => {
    if (!_bcDragging) return;
    _bcDragging = false; canvasEl.style.cursor = 'grab';
    _bcDragVelX = 0; _bcDragVelY = 0;
    const now = Date.now();
    if (_bcTrail && _bcTrail.length >= 2) {
      const recent = _bcTrail.filter(p => now - p.t < 80);
      if (recent.length >= 2) {
        const a = recent[0], b = recent[recent.length - 1];
        const dt = Math.max(1, b.t - a.t);
        _bcDragVelY = (b.x - a.x) / dt * 0.25;
        _bcDragVelX = (b.y - a.y) / dt * 0.25;
      }
    }
    _bcReleaseTime = now;
    _bcSpinning = Math.abs(_bcDragVelX) + Math.abs(_bcDragVelY) > 0.001;
  };
  canvasEl.addEventListener('pointerup', endDrag, bcSig);
  canvasEl.addEventListener('pointercancel', endDrag, bcSig);
  canvasEl.addEventListener('pointerleave', endDrag, bcSig);
}

export function destroyBadgeCard3D() {
  try {
    if (_bcRaf) cancelAnimationFrame(_bcRaf);
    _bcRaf = null;
    if (_bcAbort) { try { _bcAbort.abort(); } catch(_){} _bcAbort = null; }
    if (_bcScene) _bcScene.traverse(child => {
      try {
        if (child.geometry) child.geometry.dispose();
        if (child.material) { const mats = Array.isArray(child.material) ? child.material : [child.material]; mats.forEach(m => { try { if (m.map) m.map.dispose(); if (m.normalMap) m.normalMap.dispose(); if (m.metalnessMap) m.metalnessMap.dispose(); if (m.roughnessMap) m.roughnessMap.dispose(); m.dispose(); } catch(_){} }); }
      } catch(_){}
    });
    // Portal layers are children of _bcMesh — cleaned up by scene traverse above
    _releaseRenderer();
  } catch(_){}
  _bcRenderer = null; _bcScene = null; _bcCamera = null; _bcMesh = null; _bcCanvas = null; _bcDragging = false;
}

export function destroyRiderCard3D() {
  try {
    if (_rcRaf) cancelAnimationFrame(_rcRaf);
    _rcRaf = null;
    if (_rcAbort) { try { _rcAbort.abort(); } catch(_){} _rcAbort = null; }
    if (_rcScene) {
      _rcScene.traverse(child => {
        try {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach(m => { try { if (m.map) m.map.dispose(); if (m.normalMap) m.normalMap.dispose(); if (m.metalnessMap) m.metalnessMap.dispose(); if (m.roughnessMap) m.roughnessMap.dispose(); m.dispose(); } catch(_){} });
          }
        } catch(_){}
      });
    }
  } catch(_){}
  _releaseRenderer();
  _rcRenderer = null; _rcScene = null; _rcCamera = null; _rcMesh = null; _rcCanvas = null;
  _rcDragging = false;
}
