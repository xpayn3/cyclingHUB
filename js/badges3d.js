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

// Create gold PBR material
function _createGoldMaterial(THREE) {
  // Generate a simple gradient environment map for reflections
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Warm gradient for gold reflections
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, '#ffe8a0');
  grad.addColorStop(0.3, '#fff5d4');
  grad.addColorStop(0.5, '#ffd700');
  grad.addColorStop(0.7, '#b8860b');
  grad.addColorStop(1, '#8b6914');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const envTexture = new THREE.CanvasTexture(canvas);
  envTexture.mapping = THREE.EquirectangularReflectionMapping;

  return new THREE.MeshStandardMaterial({
    color: 0xffd700,
    metalness: 1.0,
    roughness: 0.18,
    envMap: envTexture,
    envMapIntensity: 1.5,
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
// Use '_default' as fallback for all badges without a specific model
const BADGE_GLB_MAP = {
  _default: 'img/badges/achievment.glb',
  // 'b1': 'img/badges/on-fire.glb',
  // 'b2': 'img/badges/week-warrior.glb',
};

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

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xfff5e0, 0.4);
  _badgeScene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
  keyLight.position.set(2, 3, 4);
  _badgeScene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xffd700, 0.5);
  fillLight.position.set(-2, -1, 3);
  _badgeScene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xffe8a0, 0.8);
  rimLight.position.set(0, 2, -3);
  _badgeScene.add(rimLight);

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

  // Fallback: procedural gold shield
  if (!loaded) {
    const shieldGeo = _createShieldGeometry(THREE);
    const goldMat = _createGoldMaterial(THREE);
    _badgeMesh = new THREE.Mesh(shieldGeo, goldMat);
    _badgeMesh.rotation.x = 0.1;
    _badgeScene.add(_badgeMesh);
  }

  // Start render loop
  _badgeAutoRotate = true;
  _badgeRotX = 0.1;
  _badgeRotY = 0;
  _animate();

  // Touch/mouse interaction for spinning
  _setupBadgeInteraction(canvasEl);
}

function _animate() {
  _badgeRaf = requestAnimationFrame(_animate);
  if (_badgeAutoRotate && _badgeMesh) {
    _badgeMesh.rotation.y += 0.008;
  }
  if (_badgeRenderer && _badgeScene && _badgeCamera) {
    _badgeRenderer.render(_badgeScene, _badgeCamera);
  }
}

function _setupBadgeInteraction(canvasEl) {
  let lastX = 0, lastY = 0;

  canvasEl.addEventListener('pointerdown', e => {
    _badgeDragging = true;
    _badgeAutoRotate = false;
    lastX = e.clientX;
    lastY = e.clientY;
    canvasEl.setPointerCapture(e.pointerId);
  });

  canvasEl.addEventListener('pointermove', e => {
    if (!_badgeDragging || !_badgeMesh) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    _badgeMesh.rotation.y += dx * 0.01;
    _badgeMesh.rotation.x += dy * 0.01;
    // Clamp X rotation
    _badgeMesh.rotation.x = Math.max(-0.8, Math.min(0.8, _badgeMesh.rotation.x));
    lastX = e.clientX;
    lastY = e.clientY;
  });

  const endDrag = () => {
    _badgeDragging = false;
    // Resume auto-rotate after 3s
    setTimeout(() => { if (!_badgeDragging) _badgeAutoRotate = true; }, 3000);
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
