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
  b1:  { shape: 'circle',  color: 0xff6b35, accent: 0xffaa00, label: 'ON FIRE',       iconPath: 'M12 12c2-2.96 0-7-1-8 0 3.038-1.773 4.741-3 6-1.226 1.26-2 3.24-2 5a6 6 0 1 0 12 0c0-1.532-1.056-3.94-2-5-1.786 3-2.791 3-4 2z' },
  b3:  { shape: 'diamond', color: 0x9b59ff, accent: 0xcc88ff, label: 'DIAMOND',       iconPath: 'M6 3h12l4 6-10 12L2 9z' },
  b4:  { shape: 'shield',  color: 0xffd700, accent: 0xffee88, label: 'KING',          iconPath: 'm2 4 3 12h14l3-12-5 4-5-6-5 6Z' },
  b5:  { shape: 'hexagon', color: 0x4a9eff, accent: 0x88ccff, label: 'GRINDER',       iconPath: 'M13 2 3 14h9l-1 8 10-12h-9l1-8z' },
  b6:  { shape: 'circle',  color: 0x9b59ff, accent: 0xbb88ff, label: 'MONTH',         iconPath: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z' },
  b7:  { shape: 'star',    color: 0xffd700, accent: 0xffee44, label: 'BEST WEEK',     iconPath: 'M6 9H4.5a2.5 2.5 0 0 1 0-5H6 M18 9h1.5a2.5 2.5 0 0 0 0-5H18 M4 22h16 M18 2H6v7a6 6 0 0 0 12 0V2z' },
  b8:  { shape: 'hexagon', color: 0x00e5a0, accent: 0x44ffbb, label: '100 CLUB',      iconPath: 'M18.5 17.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0zM5.5 17.5a3.5 3.5 0 1 1-7 0' },
  b9:  { shape: 'circle',  color: 0x4a9eff, accent: 0x88bbff, label: 'HALF YEAR',     iconPath: 'M3 4h18v18H3zM16 2v4M8 2v4M3 10h18' },
  b10: { shape: 'star',    color: 0xffd700, accent: 0xffdd66, label: 'CONSISTENT',    iconPath: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01z' },
  b11: { shape: 'shield',  color: 0x88ccff, accent: 0xbbddff, label: 'WINTER',        iconPath: 'M2 12h20M12 2v20 M20 16l-4-4 4-4M4 8l4 4-4 4M16 4l-4 4-4-4M8 20l4-4 4 4' },
  b12: { shape: 'circle',  color: 0xff9500, accent: 0xffcc44, label: 'SUMMER',        iconPath: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41' },
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

  // Brushed metal — very subtle
  for (let y = 0; y < size; y += 2) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.01})`;
    ctx.fillRect(0, y, size, 1);
  }

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
        _badgeMesh.rotation.x = _springRestX + Math.sin(t * 0.6 + 1) * 0.008;
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
  _rcCamera.position.set(0, 0, 5.5);

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
  const cardW = 1.8, cardH = 2.6, cardD = 0.01, cardR = 0.18;
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

  // Background — dark with subtle gradient
  const bg = fc.createLinearGradient(0, 0, 0, fH);
  bg.addColorStop(0, '#0e0e0e');
  bg.addColorStop(0.5, '#101010');
  bg.addColorStop(1, '#0a0a0a');
  fc.fillStyle = bg;
  fc.fillRect(0, 0, fW, fH);

  // Brushed metal texture — very subtle
  for (let y = 0; y < fH; y += 2) {
    const alpha = Math.random() * 0.012;
    fc.fillStyle = `rgba(255,255,255,${alpha})`;
    fc.fillRect(0, y, fW, 1);
  }
  // Faint vertical grain
  for (let x = 0; x < fW; x += 4) {
    const alpha = Math.random() * 0.006;
    fc.fillStyle = `rgba(255,255,255,${alpha})`;
    fc.fillRect(x, 0, 1, fH);
  }

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
  const lvlX = fW / 2, lvlY = fH * 0.52;

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
  nc.fillText(String(data.level || '0'), fW / 2 - 2, fH * 0.52 - 2);
  nc.fillStyle = 'rgb(166,166,255)'; // stronger right-up = deeper shadow edge
  nc.fillText(String(data.level || '0'), fW / 2 + 2, fH * 0.52 + 2);
  nc.fillStyle = 'rgb(128,128,255)'; // center pass
  nc.fillText(String(data.level || '0'), fW / 2, fH * 0.52);
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
  mc.fillStyle = 'rgb(0,180,30)';
  mc.fillRect(0, 0, fW, fH);
  // Level number: chrome with noise texture
  mc.font = '800 280px Inter, system-ui, sans-serif';
  mc.textAlign = 'center';
  mc.fillStyle = 'rgb(0,8,255)';
  mc.fillText(String(data.level || '0'), fW / 2, fH * 0.52);
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
  mctx.fillText(String(data.level || '0'), fW / 2, fH * 0.52);
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

  // Background — darker, metallic
  const bbg = bc.createLinearGradient(0, 0, 0, fH);
  bbg.addColorStop(0, '#0e0e0e');
  bbg.addColorStop(0.5, '#101010');
  bbg.addColorStop(1, '#0a0a0a');
  bc.fillStyle = bbg;
  bc.fillRect(0, 0, fW, fH);

  // Brushed metal texture — very subtle
  for (let y = 0; y < fH; y += 2) {
    const alpha = Math.random() * 0.012;
    bc.fillStyle = `rgba(255,255,255,${alpha})`;
    bc.fillRect(0, y, fW, 1);
  }
  // Faint vertical grain
  for (let x = 0; x < fW; x += 4) {
    const alpha = Math.random() * 0.006;
    bc.fillStyle = `rgba(255,255,255,${alpha})`;
    bc.fillRect(x, 0, 1, fH);
  }

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

  // Card body — front faces only (back culled so back plane shows through)
  const cardMesh = new THREE.Mesh(cardGeo, [frontMat, edgeMat]);

  // Back plane — same rounded shape, flipped, with date texture
  const backGeo = new THREE.ShapeGeometry(shape, 16);
  const bPos = backGeo.attributes.position;
  const bUv = backGeo.attributes.uv;
  for (let i = 0; i < bUv.count; i++) {
    bUv.setXY(i, 1 - (bPos.getX(i) + hw) / cardW, (bPos.getY(i) + hh) / cardH);
  }
  const backPlaneMesh = new THREE.Mesh(backGeo, new THREE.MeshStandardMaterial({
    map: backTex, metalness: 0.7, roughness: 0.3, envMap: envTex, envMapIntensity: 0.8, side: THREE.DoubleSide
  }));
  backPlaneMesh.position.z = -cardD * 0.5;
  backPlaneMesh.scale.x = -1;

  _rcMesh = new THREE.Group();
  _rcMesh.add(cardMesh);
  _rcMesh.add(backPlaneMesh);
  // Cinematic reveal — starts back-facing (180° Y), slight tilt on X/Z
  _rcMesh.rotation.x = 0.35;
  _rcMesh.rotation.y = Math.PI;
  _rcMesh.rotation.z = 0.35;
  _rcMesh.scale.setScalar(0.9);
  _rcScene.add(_rcMesh);

  // Dim all lights for reveal — they'll fade up
  const allLights = [];
  _rcScene.traverse(c => { if (c.isLight && c !== _rcScene) allLights.push({ light: c, target: c.intensity }); });
  allLights.forEach(l => { l.light.intensity = 0; });

  const REST_X = 0.05, REST_Y = 0;
  let velX = 0, velY = 0;
  const SPRING = 0.015, DAMP = 0.96;
  let _rcDragVelX = 0, _rcDragVelY = 0, _rcLastMoveX = 0, _rcLastMoveY = 0;
  let _rcReleaseTime = 0, _rcSpinning = false;

  const introStart = Date.now();
  const INTRO_DUR = 2500;
  let _rcIntroFinished = false;

  function loop() {
    _rcRaf = requestAnimationFrame(loop);
    if (!_rcMesh) return;

    const elapsed = Date.now() - introStart;
    const introT = Math.min(elapsed / INTRO_DUR, 1);

    // Shimmer — subtle variation, not too dramatic
    const rotY = _rcMesh.rotation.y || 0;
    const t = Date.now() * 0.001;
    if (introT >= 1) {
      frontMat.envMapIntensity = 1.2 + Math.sin(t * 1.5 + rotY * 5) * 0.5;
      const ns = 0.85 + Math.sin(t + rotY * 3) * 0.15;
      frontMat.normalScale.set(ns, ns);
    }

    // Cinematic intro — skip if user grabs the card
    if (introT < 1 && !_rcDragging) {
      // Gentle elastic ease — smooth flip with soft overshoot then settle
      const e = 1 - Math.pow(1 - introT, 4);
      const overshoot = 1 + Math.sin(introT * Math.PI * 2) * 0.04 * (1 - introT);

      _rcMesh.rotation.x = 0.35 + (REST_X - 0.35) * e * overshoot;
      _rcMesh.rotation.y = Math.PI + (REST_Y - Math.PI) * e * overshoot;
      _rcMesh.rotation.z = 0.35 * (1 - e * overshoot);
      _rcMesh.scale.setScalar(0.9 + 0.1 * e);

      // Lights fade in — early reveal
      const lightE = Math.pow(Math.min(introT * 2, 1), 1.5); // reach full brightness at 50% of intro
      allLights.forEach(l => { l.light.intensity = l.target * lightE; });

      // Env map intensity builds up — match shimmer's resting value
      frontMat.envMapIntensity = lightE * 1.2;
      const ins = 0.85;
      frontMat.normalScale.set(ins, ins);

      _rcRenderer.render(_rcScene, _rcCamera);
      return;
    }

    // Restore final light intensities — only once
    if (!_rcIntroFinished) {
      _rcIntroFinished = true;
      allLights.forEach(l => { l.light.intensity = l.target; });
      frontMat.envMapIntensity = 1.2;
      frontMat.normalScale.set(0.85, 0.85);
    }

    if (!_rcDragging) {
      // Free spin phase — coast with drag velocity before spring kicks in
      const timeSinceRelease = Date.now() - _rcReleaseTime;
      const freeSpinDur = 3000;

      if (_rcSpinning && timeSinceRelease < freeSpinDur) {
        // Coast — apply drag velocity with friction
        _rcDragVelX *= 0.985;
        _rcDragVelY *= 0.985;
        _rcMesh.rotation.x += _rcDragVelX;
        _rcMesh.rotation.y += _rcDragVelY;
      } else {
        // Spring back to rest
        if (_rcSpinning) { _rcSpinning = false; velX = _rcDragVelX; velY = _rcDragVelY; }
        const dx = REST_X - _rcMesh.rotation.x;
        // Normalize Y rotation to nearest rest (handle multiple full spins)
        let dy = REST_Y - _rcMesh.rotation.y;
        dy = dy - Math.round(dy / (Math.PI * 2)) * Math.PI * 2;
        velX += dx * SPRING; velY += dy * SPRING;
        velX *= DAMP; velY *= DAMP;
        _rcMesh.rotation.x += velX; _rcMesh.rotation.y += velY;
        const dist = Math.abs(dx) + Math.abs(dy);
        if (dist < 0.001 && Math.abs(velX) < 0.0005 && Math.abs(velY) < 0.0005) {
          velX = 0; velY = 0;
          _rcMesh.rotation.x = REST_X;
          _rcMesh.rotation.y = REST_Y;
        }
      }
    }
    _rcRenderer.render(_rcScene, _rcCamera);
  }
  loop();

  // Interaction — tilt on drag, prevent sheet scroll, double tap to flip
  let _rcLastTap = 0;
  canvasEl.addEventListener('pointerdown', e => {
    const now = Date.now();
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
    _rcDragging = true; _rcStartX = e.clientX; _rcStartY = e.clientY;
    _rcRotX = _rcMesh.rotation.x; _rcRotY = _rcMesh.rotation.y;
    canvasEl.setPointerCapture(e.pointerId);
    canvasEl.style.cursor = 'grabbing';
  });
  canvasEl.addEventListener('pointermove', e => {
    if (!_rcDragging || !_rcMesh) return;
    const dx = (e.clientX - _rcStartX) * 0.005;
    const dy = (e.clientY - _rcStartY) * 0.005;
    const newY = _rcRotY + dx;
    const newX = _rcRotX - dy;
    // Track velocity for momentum spin
    _rcDragVelX = _rcMesh.rotation.x - _rcLastMoveX;
    _rcDragVelY = _rcMesh.rotation.y - _rcLastMoveY;
    _rcMesh.rotation.y = newY;
    _rcMesh.rotation.x = newX;
    _rcLastMoveX = newX;
    _rcLastMoveY = newY;
  });
  // Block sheet scroll while dragging the card
  canvasEl.addEventListener('touchmove', e => {
    if (_rcDragging) e.preventDefault();
  }, { passive: false });
  const endDrag = () => {
    _rcDragging = false;
    canvasEl.style.cursor = 'grab';
    _rcReleaseTime = Date.now();
    _rcSpinning = Math.abs(_rcDragVelY) > 0.001 || Math.abs(_rcDragVelX) > 0.001;
  };
  canvasEl.addEventListener('pointerup', endDrag);
  canvasEl.addEventListener('pointercancel', endDrag);
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
