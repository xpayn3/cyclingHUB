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

// Lazy-load Three.js + GLTFLoader from CDN
async function _loadThreeJS() {
  if (_THREE) return _THREE;
  // Load Three.js core
  await new Promise((resolve, reject) => {
    if (window.THREE) { resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js';
    script.crossOrigin = 'anonymous';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Failed to load Three.js'));
    document.head.appendChild(script);
  });
  _THREE = window.THREE;

  // Load GLTFLoader
  if (!_GLTFLoader) {
    await new Promise((resolve, reject) => {
      if (window.THREE.GLTFLoader) { resolve(); return; }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/three@0.134.0/examples/js/loaders/GLTFLoader.js';
      script.crossOrigin = 'anonymous';
      script.onload = resolve;
      script.onerror = () => { console.warn('GLTFLoader not available, using procedural badges'); resolve(); };
      document.head.appendChild(script);
    });
    _GLTFLoader = window.THREE.GLTFLoader || null;
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
  return new THREE.MeshStandardMaterial({
    color: 0xD4A843,       // warm gold (not bright yellow)
    metalness: 1.0,
    roughness: 0.12,       // very smooth — more reflective
    envMap: envTexture,
    envMapIntensity: 2.5,  // strong reflections
  });
}

// Create embossed icon on shield face (SVG path → 3D)
function _createIconMesh(THREE, svgPath, scale) {
  // Simple approach: create a plane with the icon as a slightly raised surface
  const iconGeo = new THREE.PlaneGeometry(scale, scale, 1, 1);
  const iconMat = new THREE.MeshStandardMaterial({
    color: 0xb8860b,
    metalness: 0.9,
    roughness: 0.3,
    transparent: true,
    opacity: 0.6,
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
  canvasEl.width = w * Math.min(window.devicePixelRatio, 2);
  canvasEl.height = h * Math.min(window.devicePixelRatio, 2);
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
  _badgeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
      const texSize = 512;
      const faceTex = _createBadgeFaceTexture(THREE, def, texSize);
      const normTex = _createBadgeNormalMap(THREE, def, texSize);

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

      const mat = new THREE.MeshStandardMaterial({
        map: faceTex, normalMap: normTex, normalScale: new THREE.Vector2(0.8, 0.8),
        metalness: 0.85, roughness: 0.15, envMap: envTex, envMapIntensity: 1.5,
      });
      // Edge material — silver chrome
      const edgeMat = new THREE.MeshStandardMaterial({
        color: def.color, metalness: 1.0, roughness: 0.1, envMap: envTex, envMapIntensity: 1.8,
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

let _rcScene, _rcCamera, _rcRenderer, _rcMesh, _rcRaf;
let _rcDragging = false, _rcStartX = 0, _rcStartY = 0, _rcRotX = 0, _rcRotY = 0;

export async function initRiderCard3D(canvasEl, data) {
  const THREE = await _loadThreeJS();

  let w = canvasEl.clientWidth || 340;
  let h = canvasEl.clientHeight || 220;
  canvasEl.width = w * Math.min(window.devicePixelRatio, 2);
  canvasEl.height = h * Math.min(window.devicePixelRatio, 2);
  canvasEl.style.width = w + 'px';
  canvasEl.style.height = h + 'px';

  _rcScene = new THREE.Scene();
  _rcCamera = new THREE.PerspectiveCamera(30, w / h, 0.1, 100);
  _rcCamera.position.set(0, 0, 6.2);

  _rcRenderer = new THREE.WebGLRenderer({ canvas: canvasEl, alpha: true, antialias: true });
  _rcRenderer.setSize(w, h);
  _rcRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  _rcRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  _rcRenderer.toneMappingExposure = 1.0;

  // Dramatic spotlight lighting
  _rcScene.add(new THREE.AmbientLight(0x0a0a14, 0.1));
  // Hero spotlight — intense top-center, narrow cone
  const spot = new THREE.SpotLight(0xffffff, 4.0, 20, Math.PI / 7, 0.5, 1.5);
  spot.position.set(0, 6, 5);
  spot.target.position.set(0, 0, 0);
  _rcScene.add(spot);
  _rcScene.add(spot.target);
  // Key light — bright, from the side
  const key = new THREE.DirectionalLight(0xffffff, 2.5);
  key.position.set(5, 4, 2);
  _rcScene.add(key);
  // Rim light — blue, strong edge separation
  const rim = new THREE.DirectionalLight(0x4a9eff, 2.0);
  rim.position.set(-4, 3, -5);
  _rcScene.add(rim);
  // Accent kick — green from below
  const accent = new THREE.DirectionalLight(0x00e5a0, 0.6);
  accent.position.set(1, -4, 3);
  _rcScene.add(accent);

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
  const cardGeo = new THREE.ExtrudeGeometry(shape, { depth: cardD, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 8, curveSegments: 32 });
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

  // Card material — dark metallic with accent edge glow
  const envCanvas = document.createElement('canvas');
  const eW = 1024, eH = 512;
  envCanvas.width = eW; envCanvas.height = eH;
  const ctx = envCanvas.getContext('2d');

  // Metallic studio base — dark but not black
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

  const envTex = new THREE.CanvasTexture(envCanvas);
  envTex.mapping = THREE.EquirectangularReflectionMapping;

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
  // Base: low metalness (30), high roughness (180) = matte card
  mc.fillStyle = 'rgb(0,170,50)';
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
    envMap: envTex, envMapIntensity: 2.5,
    side: THREE.FrontSide
  });

  // Split ExtrudeGeometry into 3 material groups: front, back, sides
  const backMat = new THREE.MeshStandardMaterial({
    map: backTex, metalness: 0.7, roughness: 0.3, envMap: envTex, envMapIntensity: 0.8
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
      metalness: 0.6, roughness: 0.2, envMap: envTex, envMapIntensity: 1.5,
      clearcoat: 1.0, clearcoatRoughness: 0.05
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

  _rcMesh.rotation.x = 0.06;
  _rcMesh.rotation.y = 0.08;
  _rcScene.add(_rcMesh);

  const REST_X = 0.06, REST_Y = 0.08;
  let velX = 0, velY = 0;
  const SPRING = 0.008, DAMP = 0.97;
  let _rcDragVelX = 0, _rcDragVelY = 0, _rcLastMoveX = 0, _rcLastMoveY = 0;
  let _rcReleaseTime = 0, _rcSpinning = false, _rcIdle = false, _rcAutoSpin = true;

  function loop() {
    _rcRaf = requestAnimationFrame(loop);
    if (!_rcMesh) return;
    if (_rcIdle) return;

    // Shimmer
    const rotY = _rcMesh.rotation.y || 0;
    const t = Date.now() * 0.001;
    frontMat.envMapIntensity = 1.2 + Math.sin(t * 1.5 + rotY * 5) * 0.5;
    const ns = 0.85 + Math.sin(t + rotY * 3) * 0.15;
    frontMat.normalScale.set(ns, ns);
    // Level number glow pulse
    lvlGlowMat.uniforms.intensity.value = 0.4 + Math.sin(t * 1.2 + rotY * 2) * 0.2;

    if (!_rcDragging) {
      const timeSinceRelease = Date.now() - _rcReleaseTime;

      if (_rcSpinning) {
        // Coast with momentum — gradual friction
        const speed = Math.abs(_rcDragVelX) + Math.abs(_rcDragVelY);
        if (speed > 0.0003) {
          _rcDragVelX *= 0.992;
          _rcDragVelY *= 0.992;
          _rcMesh.rotation.x += _rcDragVelX;
          _rcMesh.rotation.y += _rcDragVelY;
          _rcMesh.rotation.x += (REST_X - _rcMesh.rotation.x) * 0.005;
        } else {
          // Momentum died — transition to auto-spin
          _rcSpinning = false;
          _rcAutoSpin = true;
        }
      } else if (_rcAutoSpin || timeSinceRelease > 2000) {
        _rcAutoSpin = true;
        const ast = Date.now() * 0.001;
        _rcMesh.rotation.y += 0.006;
        _rcMesh.rotation.x += (REST_X + Math.sin(ast * 0.8) * 0.2 - _rcMesh.rotation.x) * 0.04;
        _rcMesh.rotation.z += (Math.sin(ast * 0.5 + 1) * 0.05 - _rcMesh.rotation.z) * 0.03;
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
  }
  loop();

  // Interaction — tilt on drag, prevent sheet scroll, double tap to flip
  let _rcLastTap = 0;
  canvasEl.addEventListener('pointerdown', e => {
    const now = Date.now();
    _rcIdle = false; _rcAutoSpin = false;
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
    // Track last 3 positions with timestamps for velocity
    _rcTrail = [{ x: e.clientX, y: e.clientY, t: Date.now() }];
    canvasEl.setPointerCapture(e.pointerId);
    canvasEl.style.cursor = 'grabbing';
  });
  canvasEl.addEventListener('pointermove', e => {
    if (!_rcDragging || !_rcMesh) return;
    _rcMesh.rotation.y = _rcRotY + (e.clientX - _rcStartX) * 0.015;
    _rcMesh.rotation.x = _rcRotX + (e.clientY - _rcStartY) * 0.015;
    // Keep trail of last 6 positions
    _rcTrail.push({ x: e.clientX, y: e.clientY, t: Date.now() });
    if (_rcTrail.length > 6) _rcTrail.shift();
  });
  canvasEl.addEventListener('touchmove', e => { if (_rcDragging) e.preventDefault(); }, { passive: false });
  const endDrag = () => {
    if (!_rcDragging) return;
    _rcDragging = false;
    canvasEl.style.cursor = 'grab';
    // Compute velocity from recent trail entries only (last 80ms)
    _rcDragVelX = 0; _rcDragVelY = 0;
    const now = Date.now();
    if (_rcTrail.length >= 2) {
      // Find oldest entry within 80ms window
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
  canvasEl.addEventListener('pointerup', endDrag);
  canvasEl.addEventListener('pointercancel', endDrag);
  canvasEl.addEventListener('pointerleave', endDrag);
}

// ─────────────────────────────────────────────────────────────────────────────
// BADGE CARD — Achievement card style (like rider card but per-badge themed)
// ─────────────────────────────────────────────────────────────────────────────
let _bcScene, _bcCamera, _bcRenderer, _bcMesh, _bcRaf, _bcDragging = false;
let _bcStartX = 0, _bcStartY = 0, _bcRotX = 0, _bcRotY = 0;
let _bcDragVelX = 0, _bcDragVelY = 0, _bcLastMoveX = 0, _bcLastMoveY = 0;
let _bcReleaseTime = 0, _bcSpinning = false, _bcIdle = false, _bcAutoSpin = true;

export async function initBadgeCard3D(canvasEl, badgeId, name, desc) {
  const THREE = await _loadThreeJS();
  const def = BADGE_PROCEDURAL[badgeId];
  if (!def) return;

  let w = canvasEl.clientWidth || 340, h = canvasEl.clientHeight || 380;
  canvasEl.width = w * Math.min(window.devicePixelRatio, 2);
  canvasEl.height = h * Math.min(window.devicePixelRatio, 2);

  _bcScene = new THREE.Scene();
  _bcCamera = new THREE.PerspectiveCamera(30, w / h, 0.1, 100);
  _bcCamera.position.set(0, 0, 6.8);
  _bcRenderer = new THREE.WebGLRenderer({ canvas: canvasEl, alpha: true, antialias: true });
  _bcRenderer.setSize(w, h);
  _bcRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  _bcRenderer.toneMapping = THREE.ACESFilmicToneMapping;

  // Dramatic lighting
  _bcScene.add(new THREE.AmbientLight(0x0a0a0a, 0.15));
  const spot = new THREE.SpotLight(0xffffff, 3.5, 20, Math.PI / 7, 0.5, 1.5);
  spot.position.set(0, 6, 5); spot.target.position.set(0, 0, 0);
  _bcScene.add(spot); _bcScene.add(spot.target);
  const key = new THREE.DirectionalLight(0xffffff, 2.0); key.position.set(5, 4, 2); _bcScene.add(key);
  const r = (def.color >> 16) & 255, g = (def.color >> 8) & 255, b = def.color & 255;
  const rim = new THREE.DirectionalLight(def.color, 1.5); rim.position.set(-4, 3, -5); _bcScene.add(rim);

  // Env map
  const envC = document.createElement('canvas'); envC.width = 1024; envC.height = 512;
  const ec = envC.getContext('2d');
  ec.fillStyle = '#0c0c0c'; ec.fillRect(0, 0, 1024, 512);
  const sb = ec.createRadialGradient(440, 240, 0, 440, 240, 350);
  sb.addColorStop(0, '#ffffff'); sb.addColorStop(0.2, '#dddddd'); sb.addColorStop(0.5, '#444444'); sb.addColorStop(1, 'transparent');
  ec.fillStyle = sb; ec.fillRect(0, 0, 1024, 512);
  const ac = ec.createRadialGradient(200, 120, 0, 200, 120, 150);
  ac.addColorStop(0, `rgba(${r},${g},${b},0.5)`); ac.addColorStop(1, 'transparent');
  ec.fillStyle = ac; ec.fillRect(0, 0, 1024, 512);
  // Strong rainbow bands — full coverage, vivid
  const rb1 = ec.createLinearGradient(0, 0, 1024, 0);
  rb1.addColorStop(0, 'rgba(255,0,60,0.45)');
  rb1.addColorStop(0.15, 'rgba(255,140,0,0.45)');
  rb1.addColorStop(0.3, 'rgba(255,255,0,0.4)');
  rb1.addColorStop(0.45, 'rgba(0,255,120,0.45)');
  rb1.addColorStop(0.6, 'rgba(0,140,255,0.45)');
  rb1.addColorStop(0.75, 'rgba(150,0,255,0.45)');
  rb1.addColorStop(0.9, 'rgba(255,0,180,0.45)');
  rb1.addColorStop(1, 'rgba(255,0,60,0.45)');
  ec.fillStyle = rb1; ec.fillRect(0, 0, 1024, 512);
  // Second rainbow layer — vertical for cross-holo effect
  const rb2 = ec.createLinearGradient(0, 0, 0, 512);
  rb2.addColorStop(0, 'rgba(0,255,200,0.2)');
  rb2.addColorStop(0.25, 'rgba(255,100,0,0.2)');
  rb2.addColorStop(0.5, 'rgba(100,0,255,0.2)');
  rb2.addColorStop(0.75, 'rgba(255,255,0,0.2)');
  rb2.addColorStop(1, 'rgba(0,150,255,0.2)');
  ec.fillStyle = rb2; ec.fillRect(0, 0, 1024, 512);
  // Vivid color spots
  const spots = [
    [150,80,'rgba(255,0,100,0.5)'],[400,350,'rgba(0,255,136,0.5)'],
    [700,150,'rgba(68,136,255,0.5)'],[900,300,'rgba(255,68,204,0.5)'],
    [300,200,'rgba(255,204,0,0.5)'],[550,100,'rgba(0,255,255,0.4)'],
    [800,400,'rgba(255,100,0,0.4)'],[100,350,'rgba(160,0,255,0.4)'],
  ];
  spots.forEach(([x,y,c]) => { const s = ec.createRadialGradient(x,y,0,x,y,100); s.addColorStop(0,c); s.addColorStop(1,'transparent'); ec.fillStyle = s; ec.fillRect(0,0,1024,512); });
  const envTex = new THREE.CanvasTexture(envC); envTex.mapping = THREE.EquirectangularReflectionMapping;

  // Card geometry
  const cardW = 1.8, cardH = 2.6, cardD = 0.005, cardR = 0.18;
  const shape = new THREE.Shape();
  const hw = cardW / 2, hh = cardH / 2, cr = cardR;
  shape.moveTo(-hw + cr, -hh); shape.lineTo(hw - cr, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + cr); shape.lineTo(hw, hh - cr);
  shape.quadraticCurveTo(hw, hh, hw - cr, hh); shape.lineTo(-hw + cr, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - cr); shape.lineTo(-hw, -hh + cr);
  shape.quadraticCurveTo(-hw, -hh, -hw + cr, -hh);
  const cardGeo = new THREE.ExtrudeGeometry(shape, { depth: cardD, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 8, curveSegments: 32 });
  cardGeo.center();

  // Fix UVs
  const pos = cardGeo.attributes.position, uv = cardGeo.attributes.uv, norm = cardGeo.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), nz = norm.getZ(i);
    if (nz > 0.5) uv.setXY(i, (x + hw) / cardW, (y + hh) / cardH);
    else if (nz < -0.5) uv.setXY(i, 1 - (x + hw) / cardW, (y + hh) / cardH);
  }

  // Front face texture
  const fW = 720, fH = Math.round(fW * (cardH / cardW));
  const fCanvas = document.createElement('canvas'); fCanvas.width = fW; fCanvas.height = fH;
  const fc = fCanvas.getContext('2d');

  const ribbonH = 56;
  const ribbonText = (name.toUpperCase() + '  ·  ').repeat(20);

  if (def.scene === 'mountain') {
    // ── Full mountain landscape artwork ──────────────────────────
    // Night sky gradient
    const skyG = fc.createLinearGradient(0, 0, 0, fH);
    skyG.addColorStop(0, '#05061a'); skyG.addColorStop(0.15, '#0c1035');
    skyG.addColorStop(0.35, '#1a1850'); skyG.addColorStop(0.55, '#2d1d4a');
    skyG.addColorStop(0.7, '#4a2040'); skyG.addColorStop(0.85, '#6b3045');
    skyG.addColorStop(1, '#1a1a38');
    fc.fillStyle = skyG; fc.fillRect(0, 0, fW, fH);

    // Stars — varied sizes and brightness
    for (let i = 0; i < 120; i++) {
      const sx = Math.random() * fW, sy = Math.random() * fH * 0.55;
      const sa = 0.15 + Math.random() * 0.7, ss = 0.5 + Math.random() * 2;
      fc.fillStyle = `rgba(255,255,255,${sa})`;
      fc.beginPath(); fc.arc(sx, sy, ss, 0, Math.PI * 2); fc.fill();
    }
    // A few bright stars with glow
    [[fW*0.15, fH*0.08], [fW*0.72, fH*0.12], [fW*0.45, fH*0.05], [fW*0.88, fH*0.18]].forEach(([sx,sy]) => {
      const glow = fc.createRadialGradient(sx, sy, 0, sx, sy, 8);
      glow.addColorStop(0, 'rgba(200,220,255,0.8)'); glow.addColorStop(0.4, 'rgba(150,180,255,0.2)'); glow.addColorStop(1, 'transparent');
      fc.fillStyle = glow; fc.fillRect(sx - 10, sy - 10, 20, 20);
      fc.fillStyle = 'rgba(255,255,255,0.9)';
      fc.beginPath(); fc.arc(sx, sy, 1.5, 0, Math.PI * 2); fc.fill();
    });

    // Moon
    const mx = fW * 0.78, my = fH * 0.14, mr = 28;
    const moonG = fc.createRadialGradient(mx - 4, my - 4, mr * 0.1, mx, my, mr * 1.4);
    moonG.addColorStop(0, 'rgba(255,248,230,0.95)'); moonG.addColorStop(0.3, 'rgba(255,240,200,0.6)');
    moonG.addColorStop(0.6, 'rgba(200,180,160,0.15)'); moonG.addColorStop(1, 'transparent');
    fc.fillStyle = moonG; fc.fillRect(mx - mr * 2, my - mr * 2, mr * 4, mr * 4);
    fc.fillStyle = '#fffae8'; fc.beginPath(); fc.arc(mx, my, mr, 0, Math.PI * 2); fc.fill();
    // Moon craters (subtle)
    fc.fillStyle = 'rgba(220,210,180,0.4)';
    fc.beginPath(); fc.arc(mx - 8, my - 5, 5, 0, Math.PI * 2); fc.fill();
    fc.beginPath(); fc.arc(mx + 10, my + 8, 3, 0, Math.PI * 2); fc.fill();
    fc.beginPath(); fc.arc(mx + 2, my + 12, 4, 0, Math.PI * 2); fc.fill();

    // Aurora / atmospheric glow
    const auroG = fc.createLinearGradient(0, fH * 0.15, 0, fH * 0.45);
    auroG.addColorStop(0, 'transparent'); auroG.addColorStop(0.3, 'rgba(40,180,120,0.06)');
    auroG.addColorStop(0.6, 'rgba(60,100,180,0.08)'); auroG.addColorStop(1, 'transparent');
    fc.fillStyle = auroG; fc.fillRect(0, fH * 0.15, fW, fH * 0.3);

    // Far mountain range (dark blue/purple)
    fc.fillStyle = '#0f0f2a';
    fc.beginPath(); fc.moveTo(0, fH * 0.52);
    fc.lineTo(fW * 0.05, fH * 0.4); fc.lineTo(fW * 0.12, fH * 0.44);
    fc.lineTo(fW * 0.22, fH * 0.3); fc.lineTo(fW * 0.32, fH * 0.42);
    fc.lineTo(fW * 0.42, fH * 0.22); fc.lineTo(fW * 0.52, fH * 0.35);
    fc.lineTo(fW * 0.6, fH * 0.28); fc.lineTo(fW * 0.72, fH * 0.18);
    fc.lineTo(fW * 0.82, fH * 0.3); fc.lineTo(fW * 0.9, fH * 0.25);
    fc.lineTo(fW, fH * 0.38); fc.lineTo(fW, fH); fc.lineTo(0, fH); fc.fill();

    // Snow on far peaks
    fc.fillStyle = 'rgba(200,215,255,0.25)';
    [[0.42, 0.22, 0.06], [0.72, 0.18, 0.05], [0.9, 0.25, 0.04]].forEach(([px, py, sw]) => {
      fc.beginPath(); fc.moveTo(fW * px, fH * py);
      fc.lineTo(fW * (px - sw * 0.6), fH * (py + 0.06)); fc.lineTo(fW * (px + sw * 0.6), fH * (py + 0.06)); fc.fill();
    });

    // Mid hills (dark indigo)
    fc.fillStyle = '#14142e';
    fc.beginPath(); fc.moveTo(0, fH * 0.65);
    fc.quadraticCurveTo(fW * 0.15, fH * 0.52, fW * 0.3, fH * 0.58);
    fc.quadraticCurveTo(fW * 0.45, fH * 0.64, fW * 0.55, fH * 0.54);
    fc.quadraticCurveTo(fW * 0.7, fH * 0.44, fW * 0.85, fH * 0.52);
    fc.quadraticCurveTo(fW * 0.95, fH * 0.56, fW, fH * 0.5);
    fc.lineTo(fW, fH); fc.lineTo(0, fH); fc.fill();

    // Foreground hills (darkest)
    fc.fillStyle = '#0e0e24';
    fc.beginPath(); fc.moveTo(0, fH * 0.76);
    fc.quadraticCurveTo(fW * 0.2, fH * 0.68, fW * 0.4, fH * 0.73);
    fc.quadraticCurveTo(fW * 0.6, fH * 0.78, fW * 0.75, fH * 0.7);
    fc.quadraticCurveTo(fW * 0.9, fH * 0.64, fW, fH * 0.72);
    fc.lineTo(fW, fH); fc.lineTo(0, fH); fc.fill();

    // Pine trees silhouettes
    const treeColor = '#0a0a1e';
    for (let i = 0; i < 18; i++) {
      const tx = fW * 0.02 + Math.random() * fW * 0.96;
      const tBase = fH * 0.7 + Math.random() * fH * 0.1;
      const tHeight = 25 + Math.random() * 50;
      const tWidth = 8 + Math.random() * 10;
      fc.fillStyle = treeColor;
      // Trunk
      fc.fillRect(tx - 1.5, tBase, 3, 10);
      // Tree layers
      for (let j = 0; j < 3; j++) {
        const ly = tBase - tHeight * (0.3 + j * 0.25);
        const lw = tWidth * (1 - j * 0.25);
        fc.beginPath(); fc.moveTo(tx, ly); fc.lineTo(tx - lw, ly + tHeight * 0.35); fc.lineTo(tx + lw, ly + tHeight * 0.35); fc.fill();
      }
    }

    // Winding path/river reflection
    fc.strokeStyle = 'rgba(100,120,180,0.12)'; fc.lineWidth = 3;
    fc.beginPath(); fc.moveTo(fW * 0.5, fH * 0.85);
    fc.quadraticCurveTo(fW * 0.45, fH * 0.78, fW * 0.52, fH * 0.7);
    fc.quadraticCurveTo(fW * 0.58, fH * 0.62, fW * 0.48, fH * 0.55);
    fc.stroke();

    // Ground fog layer
    const fogG = fc.createLinearGradient(0, fH * 0.72, 0, fH * 0.85);
    fogG.addColorStop(0, 'transparent'); fogG.addColorStop(0.5, 'rgba(30,30,60,0.15)'); fogG.addColorStop(1, 'transparent');
    fc.fillStyle = fogG; fc.fillRect(0, fH * 0.72, fW, fH * 0.13);

    // Dither noise over whole scene
    const dither = fc.getImageData(0, 0, fW, fH); const dd = dither.data;
    for (let i = 0; i < dd.length; i += 4) { const n = Math.random() * 4 - 2; dd[i] = Math.max(0, Math.min(255, dd[i] + n)); dd[i+1] = Math.max(0, Math.min(255, dd[i+1] + n)); dd[i+2] = Math.max(0, Math.min(255, dd[i+2] + n)); }
    fc.putImageData(dither, 0, 0);

    // Achievement text — overlaid at bottom, glowing
    fc.textAlign = 'center';
    fc.shadowColor = `rgba(${r},${g},${b},0.6)`; fc.shadowBlur = 20;
    fc.font = '700 52px Inter, system-ui, sans-serif';
    fc.fillStyle = '#ffffff';
    fc.fillText(name, fW / 2, fH * 0.88);
    fc.shadowBlur = 0;

    fc.font = '500 28px Inter, system-ui, sans-serif';
    fc.fillStyle = `rgba(${Math.min(255,r+60)},${Math.min(255,g+60)},${Math.min(255,b+60)},0.8)`;
    fc.fillText(desc, fW / 2, fH * 0.88 + 38);

    // Small "EARNED" at very bottom
    fc.font = '600 20px Inter, system-ui, sans-serif';
    fc.fillStyle = 'rgba(255,255,255,0.2)';
    fc.fillText('EARNED', fW / 2, fH * 0.97);

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
    // Text area gets chrome highlight
    mc.fillStyle = 'rgb(40,60,200)';
    mc.fillRect(fW * 0.15, fH * 0.84, fW * 0.7, fH * 0.1);
  } else {
    mc.fillStyle = 'rgb(0,170,50)'; mc.fillRect(0, 0, fW, fH);
  }

  if (def.scene === 'mountain') {
    // Mountain card MR map already set above — skip holo patterns
  } else if (holo === 'flame') {
    // Wavy horizontal bands — like heat shimmer
    for (let y = 0; y < fH; y += 5) {
      const wave = Math.sin(y * 0.05) * 20;
      const rough = 15 + Math.abs(wave) * 2;
      mc.fillStyle = `rgb(0,${Math.round(rough)},210)`;
      mc.fillRect(0, y, fW, 4);
    }
  } else if (holo === 'chevron') {
    // V-shaped chevron lines pointing up
    for (let y = -fH; y < fH * 2; y += 12) {
      mc.save(); mc.translate(hcx, y);
      mc.beginPath(); mc.moveTo(-fW, 0); mc.lineTo(0, -30); mc.lineTo(fW, 0); mc.lineTo(fW, 4); mc.lineTo(0, -26); mc.lineTo(-fW, 4); mc.closePath();
      mc.fillStyle = `rgb(0,${(y % 36 === 0) ? 15 : 60},220)`;
      mc.fill(); mc.restore();
    }
  } else if (holo === 'diamond') {
    // Diamond grid — crossing diagonals
    for (let i = -fW; i < fW * 2; i += 14) {
      const rough = (Math.floor(i / 14) % 3 === 0) ? 10 : 55;
      mc.save(); mc.translate(i, 0); mc.rotate(0.6);
      mc.fillStyle = `rgb(0,${rough},230)`; mc.fillRect(0, -fH, 3, fH * 3);
      mc.restore();
      mc.save(); mc.translate(i, 0); mc.rotate(-0.6);
      mc.fillStyle = `rgb(0,${rough},230)`; mc.fillRect(0, -fH, 3, fH * 3);
      mc.restore();
    }
  } else if (holo === 'crown') {
    // Concentric circles — regal rings
    for (let r = 10; r < Math.max(fW, fH); r += 10) {
      mc.beginPath(); mc.arc(hcx, hcy, r, 0, Math.PI * 2);
      mc.strokeStyle = `rgb(0,${(r % 30 === 0) ? 12 : 55},240)`;
      mc.lineWidth = 4; mc.stroke();
    }
  } else if (holo === 'bolt') {
    // Zigzag lightning pattern
    for (let x = 0; x < fW; x += 16) {
      const rough = (Math.floor(x / 16) % 3 === 0) ? 10 : 50;
      mc.beginPath();
      for (let y = 0; y < fH; y += 20) {
        mc.lineTo(x + ((y / 20) % 2 === 0 ? 0 : 10), y);
      }
      mc.strokeStyle = `rgb(0,${rough},220)`; mc.lineWidth = 3; mc.stroke();
    }
  } else if (holo === 'ripple') {
    // Concentric ripples from center — like moon on water
    for (let r = 5; r < Math.max(fW, fH); r += 7) {
      mc.beginPath(); mc.arc(hcx, hcy, r, 0, Math.PI * 2);
      mc.strokeStyle = `rgb(0,${(r % 21 === 0) ? 10 : 50},215)`;
      mc.lineWidth = 3; mc.stroke();
    }
  } else if (holo === 'grid') {
    // Hex grid pattern
    const s = 18;
    for (let row = 0; row < fH / s + 1; row++) {
      for (let col = 0; col < fW / s + 1; col++) {
        const x = col * s + (row % 2) * s / 2, y = row * s * 0.866;
        const rough = ((row + col) % 3 === 0) ? 12 : 55;
        mc.beginPath(); mc.arc(x, y, 6, 0, Math.PI * 2);
        mc.fillStyle = `rgb(0,${rough},225)`; mc.fill();
      }
    }
  } else if (holo === 'wave') {
    // Sine wave bands
    for (let y = 0; y < fH; y += 6) {
      mc.beginPath();
      for (let x = 0; x < fW; x += 2) {
        mc.lineTo(x, y + Math.sin(x * 0.03 + y * 0.02) * 10);
      }
      mc.strokeStyle = `rgb(0,${(y % 18 === 0) ? 10 : 50},210)`;
      mc.lineWidth = 2; mc.stroke();
    }
  } else if (holo === 'frost') {
    // Snowflake/crystal radial pattern — 6-fold symmetry
    for (let a = 0; a < 6; a++) {
      mc.save(); mc.translate(hcx, hcy); mc.rotate(a * Math.PI / 3);
      for (let d = 10; d < Math.max(fW, fH); d += 12) {
        mc.fillStyle = `rgb(0,${(d % 36 === 0) ? 10 : 50},220)`;
        mc.fillRect(-1.5, 0, 3, d);
        // Branches
        if (d % 24 === 0) {
          mc.save(); mc.translate(0, d); mc.rotate(0.5);
          mc.fillRect(0, 0, 2, 20); mc.restore();
          mc.save(); mc.translate(0, d); mc.rotate(-0.5);
          mc.fillRect(0, 0, 2, 20); mc.restore();
        }
      }
      mc.restore();
    }
  } else if (holo === 'sunray') {
    // Thick radiating sun rays
    const numRays = 24;
    for (let i = 0; i < numRays; i++) {
      mc.save(); mc.translate(hcx, hcy); mc.rotate((i / numRays) * Math.PI * 2);
      mc.fillStyle = `rgb(0,${(i % 3 === 0) ? 12 : 55},215)`;
      mc.fillRect(-4, 0, 8, Math.max(fW, fH));
      mc.restore();
    }
  } else {
    // Default starburst — radial lines
    const numRays = 60;
    for (let i = 0; i < numRays; i++) {
      mc.save(); mc.translate(hcx, hcy); mc.rotate((i / numRays) * Math.PI * 2);
      mc.fillStyle = `rgb(0,${(i % 3 === 0) ? 20 : (i % 3 === 1) ? 80 : 50},200)`;
      mc.fillRect(-2, 0, 4, Math.max(fW, fH));
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

  // Materials
  const isMountain = def.scene === 'mountain';
  const frontMat = new THREE.MeshStandardMaterial({
    map: faceTex, normalMap: normalTex, normalScale: new THREE.Vector2(isMountain ? 0.3 : 1, isMountain ? 0.3 : 1),
    metalnessMap: mrTex, roughnessMap: mrTex, metalness: 1, roughness: 1,
    envMap: envTex, envMapIntensity: isMountain ? 0.8 : 2.5, side: THREE.FrontSide
  });
  const backMat = new THREE.MeshStandardMaterial({ map: backTex, metalness: 0.5, roughness: 0.4, envMap: envTex, envMapIntensity: 0.6 });
  const edgeMat = new THREE.MeshStandardMaterial({ color: def.color, metalness: 1, roughness: 0.08, envMap: envTex, envMapIntensity: 2 });

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

  _bcMesh = new THREE.Group();
  _bcMesh.add(new THREE.Mesh(cardGeo, [frontMat, backMat, edgeMat]));

  if (def.scene === 'mountain') {
    // Mountain diorama — parallax depth layers floating above the painted face
    const pw = cardW * 0.92, ph = cardH * 0.92;
    const makePlane = (drawFn, z) => {
      const c = document.createElement('canvas'); c.width = fW; c.height = fH;
      drawFn(c.getContext('2d'), fW, fH);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
      m.position.z = z;
      return m;
    };

    // Layer 1: Floating mist/fog wisps (mid-depth)
    const mist = makePlane((ctx, w, h) => {
      for (let i = 0; i < 5; i++) {
        const my = h * 0.55 + Math.random() * h * 0.2;
        const mx = Math.random() * w;
        const mg = ctx.createRadialGradient(mx, my, 0, mx, my, 80 + Math.random() * 60);
        mg.addColorStop(0, 'rgba(80,80,140,0.08)'); mg.addColorStop(0.5, 'rgba(60,60,120,0.04)'); mg.addColorStop(1, 'transparent');
        ctx.fillStyle = mg; ctx.fillRect(0, 0, w, h);
      }
    }, cardD * 0.5 + 0.015);

    // Layer 2: Snow/dust particles (closer)
    const snow = makePlane((ctx, w, h) => {
      for (let i = 0; i < 40; i++) {
        const sx = Math.random() * w, sy = Math.random() * h;
        const ss = 1 + Math.random() * 3;
        const sa = 0.1 + Math.random() * 0.25;
        ctx.fillStyle = `rgba(200,210,255,${sa})`;
        ctx.beginPath(); ctx.arc(sx, sy, ss, 0, Math.PI * 2); ctx.fill();
      }
    }, cardD * 0.5 + 0.035);

    // Layer 3: Close foreground pine silhouettes (shallowest, most parallax)
    const closeTrees = makePlane((ctx, w, h) => {
      ctx.fillStyle = 'rgba(8,8,20,0.7)';
      // Left tree cluster peeking from edge
      for (let i = 0; i < 3; i++) {
        const tx = w * 0.02 + i * 22, tBase = h * 0.82, tH = 60 + i * 15;
        ctx.beginPath(); ctx.moveTo(tx, tBase - tH); ctx.lineTo(tx - 14, tBase); ctx.lineTo(tx + 14, tBase); ctx.fill();
      }
      // Right tree cluster
      for (let i = 0; i < 3; i++) {
        const tx = w * 0.88 + i * 22, tBase = h * 0.8, tH = 50 + i * 18;
        ctx.beginPath(); ctx.moveTo(tx, tBase - tH); ctx.lineTo(tx - 12, tBase); ctx.lineTo(tx + 12, tBase); ctx.fill();
      }
    }, cardD * 0.5 + 0.055);

    // Layer 4: Moon glow overlay (subtle, deep)
    const moonGlow = makePlane((ctx, w, h) => {
      const gx = w * 0.78, gy = h * 0.14;
      const mg = ctx.createRadialGradient(gx, gy, 0, gx, gy, 100);
      mg.addColorStop(0, 'rgba(255,248,220,0.06)'); mg.addColorStop(0.5, 'rgba(200,190,170,0.02)'); mg.addColorStop(1, 'transparent');
      ctx.fillStyle = mg; ctx.fillRect(0, 0, w, h);
    }, cardD * 0.5 + 0.008);

    _bcMesh.add(moonGlow); _bcMesh.add(mist); _bcMesh.add(snow); _bcMesh.add(closeTrees);
    _bcMesh._parallax = [
      { mesh: moonGlow, depth: 0.002 },
      { mesh: mist, depth: 0.006 },
      { mesh: snow, depth: 0.01 },
      { mesh: closeTrees, depth: 0.015 },
    ];
  } else {
    _bcMesh.add(iconPlane);
    _bcMesh._parallax = [{ mesh: iconPlane, depth: 0.003 }];
  }

  _bcMesh.rotation.x = 0.06;
  _bcMesh.rotation.y = 0.08;
  _bcScene.add(_bcMesh);

  const REST_X = 0.06, REST_Y = 0.08;
  let velX = 0, velY = 0;
  const SPRING = 0.008, DAMP = 0.97;

  function loop() {
    _bcRaf = requestAnimationFrame(loop);
    if (!_bcMesh) return;
    if (_bcIdle) return;
    // Shimmer
    const t = Date.now() * 0.001, ry = _bcMesh.rotation.y || 0;
    frontMat.envMapIntensity = isMountain
      ? 0.5 + Math.sin(t * 0.8 + ry * 3) * 0.15
      : 1.2 + Math.sin(t * 1.5 + ry * 5) * 0.3;
    if (!_bcDragging) {
      const timeSinceRelease = Date.now() - _bcReleaseTime;
      if (_bcSpinning) {
        const speed = Math.abs(_bcDragVelX) + Math.abs(_bcDragVelY);
        if (speed > 0.0003) {
          _bcDragVelX *= 0.992; _bcDragVelY *= 0.992;
          _bcMesh.rotation.x += _bcDragVelX; _bcMesh.rotation.y += _bcDragVelY;
          _bcMesh.rotation.x += (REST_X - _bcMesh.rotation.x) * 0.005;
        } else {
          _bcSpinning = false; _bcAutoSpin = true;
        }
      } else if (_bcAutoSpin || timeSinceRelease > 2000) {
        _bcAutoSpin = true;
        const bst = Date.now() * 0.001;
        _bcMesh.rotation.y += 0.006;
        _bcMesh.rotation.x += (REST_X + Math.sin(bst * 0.8) * 0.2 - _bcMesh.rotation.x) * 0.04;
        _bcMesh.rotation.z += (Math.sin(bst * 0.5 + 1) * 0.05 - _bcMesh.rotation.z) * 0.03;
      }
    }
    // Parallax
    if (_bcMesh._parallax) {
      let dy = _bcMesh.rotation.y - REST_Y; dy -= Math.round(dy / (Math.PI * 2)) * Math.PI * 2;
      const dx = _bcMesh.rotation.x - REST_X;
      if (Math.abs(dy) < 0.8 && Math.abs(dx) < 0.8) {
        _bcMesh._parallax.forEach(l => { l.mesh.position.x += (-dy * l.depth * 6 - l.mesh.position.x) * 0.15; l.mesh.position.y += (dx * l.depth * 6 - l.mesh.position.y) * 0.15; });
      } else { _bcMesh._parallax.forEach(l => { l.mesh.position.x *= 0.85; l.mesh.position.y *= 0.85; }); }
    }
    _bcRenderer.render(_bcScene, _bcCamera);
  }
  loop();

  // Interaction
  let lastTap = 0;
  canvasEl.addEventListener('pointerdown', e => {
    _bcIdle = false; _bcAutoSpin = false;
    const now = Date.now();
    if (now - lastTap < 350 && _bcMesh) { _bcDragVelX = 0; _bcDragVelY = 0.08; _bcReleaseTime = now; _bcSpinning = true; _bcDragging = false; lastTap = 0; return; }
    lastTap = now;
    _bcDragging = true; _bcStartX = e.clientX; _bcStartY = e.clientY;
    _bcRotX = _bcMesh.rotation.x; _bcRotY = _bcMesh.rotation.y;
    _bcTrail = [{ x: e.clientX, y: e.clientY, t: Date.now() }];
    canvasEl.setPointerCapture(e.pointerId); canvasEl.style.cursor = 'grabbing';
  });
  canvasEl.addEventListener('pointermove', e => {
    if (!_bcDragging || !_bcMesh) return;
    _bcMesh.rotation.y = _bcRotY + (e.clientX - _bcStartX) * 0.015;
    _bcMesh.rotation.x = _bcRotX + (e.clientY - _bcStartY) * 0.015;
    _bcTrail.push({ x: e.clientX, y: e.clientY, t: Date.now() });
    if (_bcTrail.length > 6) _bcTrail.shift();
  });
  canvasEl.addEventListener('touchstart', e => { e.stopPropagation(); }, { passive: true });
  canvasEl.addEventListener('touchmove', e => { e.preventDefault(); e.stopPropagation(); }, { passive: false });
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
  canvasEl.addEventListener('pointerup', endDrag);
  canvasEl.addEventListener('pointercancel', endDrag);
  canvasEl.addEventListener('pointerleave', endDrag);
}

export function destroyBadgeCard3D() {
  if (_bcRaf) cancelAnimationFrame(_bcRaf); _bcRaf = null;
  if (_bcScene) _bcScene.traverse(child => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) { const mats = Array.isArray(child.material) ? child.material : [child.material]; mats.forEach(m => { if (m.map) m.map.dispose(); if (m.normalMap) m.normalMap.dispose(); if (m.metalnessMap) m.metalnessMap.dispose(); if (m.roughnessMap) m.roughnessMap.dispose(); if (m.envMap) m.envMap.dispose(); m.dispose(); }); }
  });
  if (_bcRenderer) _bcRenderer.dispose();
  _bcRenderer = null; _bcScene = null; _bcCamera = null; _bcMesh = null; _bcDragging = false;
}

export function destroyRiderCard3D() {
  if (_rcRaf) cancelAnimationFrame(_rcRaf);
  _rcRaf = null;
  // Dispose all textures, geometries, materials in the scene
  if (_rcScene) {
    _rcScene.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach(m => {
          if (m.map) m.map.dispose();
          if (m.normalMap) m.normalMap.dispose();
          if (m.metalnessMap) m.metalnessMap.dispose();
          if (m.roughnessMap) m.roughnessMap.dispose();
          if (m.envMap) m.envMap.dispose();
          m.dispose();
        });
      }
    });
  }
  if (_rcRenderer) _rcRenderer.dispose();
  _rcRenderer = null; _rcScene = null; _rcCamera = null; _rcMesh = null;
  _rcDragging = false;
}
