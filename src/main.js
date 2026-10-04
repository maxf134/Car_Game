import * as THREE from 'three';
import { Howl } from 'howler';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import './style.css';

// ===================
// 1. Сцена / камера / рендерер
// ===================
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 1, 12000);
camera.position.set(260, 30, 30);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('app').appendChild(renderer.domElement);

// ===================
// 2. Небо, туман, свет
// ===================
const skyColorTop = new THREE.Color(0x1a2a4a);
const skyColorMid = new THREE.Color(0x4a4a6a);
const skyColorBot = new THREE.Color(0x6a5a5a);
scene.background = skyColorBot;

scene.fog = new THREE.Fog(0x4a5570, 150, 900);

const skyGeo = new THREE.SphereGeometry(3000, 32, 16);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  uniforms: {
    topColor: { value: skyColorTop },
    midColor: { value: skyColorMid },
    botColor: { value: skyColorBot },
  },
  vertexShader: `
    varying vec3 vPos;
    void main() {
      vPos = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying vec3 vPos;
    uniform vec3 topColor;
    uniform vec3 midColor;
    uniform vec3 botColor;
    void main() {
      float h = normalize(vPos).y;
      vec3 col;
      if (h > 0.15) col = mix(midColor, topColor, smoothstep(0.15, 1.0, h));
      else col = mix(botColor, midColor, smoothstep(-0.2, 0.15, h));
      gl_FragColor = vec4(col, 1.0);
    }
  `,
});
const sky = new THREE.Mesh(skyGeo, skyMat);
sky.frustumCulled = false;
sky.renderOrder = -1000;
scene.add(sky);

// Меньше ambient — фонари ярче
scene.add(new THREE.AmbientLight(0x556677, 0.4));

const hemi = new THREE.HemisphereLight(0x5566aa, 0x223322, 0.35);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xdde8ff, 0.5);
sun.position.set(500, 350, 300);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -700;
sun.shadow.camera.right = 700;
sun.shadow.camera.top = 700;
sun.shadow.camera.bottom = -700;
sun.shadow.bias = -0.003;
sun.shadow.normalBias = 0.05;
sun.shadow.camera.far = 2500;
scene.add(sun);

// ===================
// 3. Параметры мира
// ===================
const MAP_SIZE        = 3600;
const GROUND_SEGMENTS = 300;

const PARK_RADIUS      = 180;
const PARK_PATH_WIDTH  = 21;

const RING1_RADIUS = 260;
const RING1_WIDTH  = 14;
const RING2_RADIUS = 460;
const RING2_WIDTH  = 16;

const STREET_OUTER = RING2_RADIUS + 260;

const MOUNTAINS_MIN = 900;

const LAKES = [
  { x:  110, z:  110, r: 40, depth: 5 },
  { x: -110, z:  110, r: 40, depth: 5 },
  { x: -110, z: -110, r: 40, depth: 5 },
  { x:  110, z: -110, r: 40, depth: 5 },
  { x:  370, z:  370, r: 35, depth: 4 },
  { x: -370, z: -370, r: 35, depth: 4 },
  { x:  370, z: -370, r: 35, depth: 4 },
  { x: -370, z:  370, r: 35, depth: 4 },
];

// ===================
// 4. Рельеф
// ===================
function getHeight(x, z) {
  const r = Math.hypot(x, z);

  let h = 0;
  h += Math.sin(x * 0.006) * 2.0;
  h += Math.cos(z * 0.007) * 1.8;
  h += Math.sin((x + z) * 0.004) * 2.5;
  h += Math.sin(x * 0.025) * 0.5;
  h += Math.cos(z * 0.022) * 0.4;

  if (r < PARK_RADIUS + 30) h *= 0.2;
  else if (r < RING2_RADIUS + 80) h *= 0.5;

  for (const lake of LAKES) {
    const dx = x - lake.x, dz = z - lake.z;
    const dist = Math.hypot(dx, dz);
    if (dist < lake.r) {
      const t = 1 - dist / lake.r;
      h -= lake.depth * t * t;
    }
  }

  if (r > MOUNTAINS_MIN) {
    const t = Math.min((r - MOUNTAINS_MIN) / 700, 1);
    h += t * t * 130;
    h += Math.sin(x * 0.008) * 12 * t;
    h += Math.cos(z * 0.009) * 12 * t;
    h += Math.sin(x * 0.03 + z * 0.025) * 5 * t;
  }

  return h;
}

const groundGeo = new THREE.PlaneGeometry(
  MAP_SIZE, MAP_SIZE, GROUND_SEGMENTS, GROUND_SEGMENTS
);
groundGeo.rotateX(-Math.PI / 2);

const gPos = groundGeo.attributes.position;
for (let i = 0; i < gPos.count; i++) {
  const x = gPos.getX(i);
  const z = gPos.getZ(i);
  gPos.setY(i, getHeight(x, z));
}
gPos.needsUpdate = true;
groundGeo.computeVertexNormals();

const ground = new THREE.Mesh(
  groundGeo,
  new THREE.MeshStandardMaterial({ color: 0x4a8a4a, roughness: 0.95 })
);
ground.receiveShadow = false;
scene.add(ground);

// ===================
// 5. Вода
// ===================
const waterUniforms = { uTime: { value: 0 } };

function makeWaterMaterial() {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x1a3d5c,
    roughness: 0.35,
    metalness: 0.2,
    transparent: true,
    opacity: 0.95,
  });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = waterUniforms.uTime;

    shader.vertexShader = `
      uniform float uTime;
    ` + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      vec3 transformed = vec3(position);
      float t = uTime;
      float w1 = sin(position.x * 0.25 + t * 0.9) * 0.12;
      float w2 = cos(position.z * 0.3 + t * 1.1) * 0.10;
      float w3 = sin((position.x + position.z) * 0.18 + t * 0.7) * 0.08;
      transformed.y += w1 + w2 + w3;
      `
    );
  };
  return mat;
}

function makeLake(lake) {
  const centerH = getHeight(lake.x, lake.z);
  const waterLevel = centerH + lake.depth * 0.55;

  const waterSeg = new THREE.CircleGeometry(lake.r * 0.95, 40, 0, Math.PI * 2);
  waterSeg.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(waterSeg, makeWaterMaterial());
  water.position.set(lake.x, waterLevel, lake.z);
  water.renderOrder = 1;
  scene.add(water);
}

for (const lake of LAKES) makeLake(lake);

// ===================
// 6. Дороги
// ===================
function makePolylineFromCurve(curve, segments, closed = true) {
  const pts = [];
  const total = closed ? segments : segments + 1;
  for (let i = 0; i < total; i++) {
    const t = Math.min(i / segments, 1);
    const p = curve.getPointAt(t);
    pts.push({ x: p.x, z: p.z });
  }
  return pts;
}

function makeStraightPts(x1, z1, x2, z2, segments) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    pts.push({ x: x1 + (x2 - x1) * t, z: z1 + (z2 - z1) * t });
  }
  return pts;
}

function ring1RadiusAt(a) {
  return RING1_RADIUS + Math.sin(a * 4) * 10 + Math.cos(a * 7) * 6;
}
function ring2RadiusAt(a) {
  return RING2_RADIUS + Math.sin(a * 3) * 14 + Math.cos(a * 6) * 8;
}

const ring1Points = [];
for (let i = 0; i < 32; i++) {
  const a = (i / 32) * Math.PI * 2;
  const r = ring1RadiusAt(a);
  ring1Points.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
}
const ring1Curve = new THREE.CatmullRomCurve3(ring1Points, true, 'catmullrom', 0.5);
const ring1Pts = makePolylineFromCurve(ring1Curve, 300, true);

const ring2Points = [];
for (let i = 0; i < 40; i++) {
  const a = (i / 40) * Math.PI * 2;
  const r = ring2RadiusAt(a);
  ring2Points.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
}
const ring2Curve = new THREE.CatmullRomCurve3(ring2Points, true, 'catmullrom', 0.5);
const ring2Pts = makePolylineFromCurve(ring2Curve, 400, true);

const spokeAngles = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2];
const spokeTracks = [];
for (const a of spokeAngles) {
  const r1 = ring1RadiusAt(a);
  const r2 = ring2RadiusAt(a);
  const x1 = Math.cos(a) * r1;
  const z1 = Math.sin(a) * r1;
  const x2 = Math.cos(a) * r2;
  const z2 = Math.sin(a) * r2;
  spokeTracks.push({
    pts: makeStraightPts(x1, z1, x2, z2, 100),
    width: 12,
    closed: false,
    type: 'branch',
  });
}

const streetAngles = [];
for (let i = 0; i < 8; i++) {
  streetAngles.push((i / 8) * Math.PI * 2);
}
const streetTracks = [];
for (const a of streetAngles) {
  const r2 = ring2RadiusAt(a);
  const x1 = Math.cos(a) * r2;
  const z1 = Math.sin(a) * r2;
  const x2 = Math.cos(a) * STREET_OUTER;
  const z2 = Math.sin(a) * STREET_OUTER;
  streetTracks.push({
    pts: makeStraightPts(x1, z1, x2, z2, 120),
    width: 12,
    closed: false,
    type: 'branch',
  });
}

// Парковые дорожки — НЕ доходят до RING1 на 5 единиц, чтобы не пересекаться
const parkAngles = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2];
const parkTracks = [];
for (const a of parkAngles) {
  const r1 = ring1RadiusAt(a);
  const x1 = Math.cos(a) * (PARK_PATH_WIDTH / 2);
  const z1 = Math.sin(a) * (PARK_PATH_WIDTH / 2);
  // Заканчиваем за 5 единиц ДО кольца — не пересекаемся
  const x2 = Math.cos(a) * (r1 - 5);
  const z2 = Math.sin(a) * (r1 - 5);
  parkTracks.push({
    pts: makeStraightPts(x1, z1, x2, z2, 80),
    width: PARK_PATH_WIDTH,
    closed: false,
    type: 'park',
  });
}

const tracks = [
  { pts: ring1Pts, width: RING1_WIDTH, closed: true, name: 'ring1', type: 'ring' },
  { pts: ring2Pts, width: RING2_WIDTH, closed: true, name: 'ring2', type: 'ring' },
  ...spokeTracks.map((t, i) => ({ ...t, name: 'spoke' + i })),
  ...streetTracks.map((t, i) => ({ ...t, name: 'street' + i })),
  ...parkTracks.map((t, i) => ({ ...t, name: 'park' + i })),
];

for (const tr of tracks) {
  const n = tr.pts.length;
  const half = tr.width / 2;
  tr.roadY = [];

  // Разные высоты — гарантирует отсутствие z-fighting на стыках
  let raise;
  if (tr.type === 'park') raise = 0.35;
  else if (tr.type === 'ring') raise = 0.5;
  else raise = 0.45;

  for (let i = 0; i < n; i++) {
    const p = tr.pts[i];
    const prev = tr.closed
      ? tr.pts[(i - 1 + n) % n]
      : tr.pts[Math.max(0, i - 1)];
    const next = tr.closed
      ? tr.pts[(i + 1) % n]
      : tr.pts[Math.min(n - 1, i + 1)];

    let tx = next.x - prev.x, tz = next.z - prev.z;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;
    const px = tz, pz = -tx;

    let maxH = -Infinity;
    for (const f of [-0.5, -0.35, -0.2, 0, 0.2, 0.35, 0.5]) {
      const sx = p.x + px * half * f;
      const sz = p.z + pz * half * f;
      const h = getHeight(sx, sz);
      if (h > maxH) maxH = h;
    }
    tr.roadY.push(maxH + raise);
  }

  const smoothed = tr.roadY.slice();
  for (let pass = 0; pass < 2; pass++) {
    const copy = smoothed.slice();
    for (let i = 0; i < n; i++) {
      const a = tr.closed ? copy[(i - 1 + n) % n] : copy[Math.max(0, i - 1)];
      const b = copy[i];
      const c = tr.closed ? copy[(i + 1) % n] : copy[Math.min(n - 1, i + 1)];
      smoothed[i] = a * 0.25 + b * 0.5 + c * 0.25;
    }
  }
  for (let i = 0; i < n; i++) {
    tr.roadY[i] = Math.max(smoothed[i], tr.roadY[i]);
  }
}

const roadMatRing = new THREE.MeshStandardMaterial({
  color: 0x2a2a2a,
  roughness: 0.9,
  side: THREE.DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: -4,
  polygonOffsetUnits: -4,
});

const roadMatBranch = new THREE.MeshStandardMaterial({
  color: 0x2a2a2a,
  roughness: 0.9,
  side: THREE.DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
});

const roadMatPark = new THREE.MeshStandardMaterial({
  color: 0x8a7a5a,
  roughness: 0.9,
  side: THREE.DoubleSide,
});

function buildRoadMesh(track) {
  const n = track.pts.length;
  const half = track.width / 2;
  const vertices = [];
  const indices = [];

  const perps = [];
  for (let i = 0; i < n; i++) {
    const prev = track.closed
      ? track.pts[(i - 1 + n) % n]
      : track.pts[Math.max(0, i - 1)];
    const next = track.closed
      ? track.pts[(i + 1) % n]
      : track.pts[Math.min(n - 1, i + 1)];
    let tx = next.x - prev.x;
    let tz = next.z - prev.z;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;
    perps.push({ x: tz, z: -tx });
  }

  for (let i = 0; i < n; i++) {
    const p = track.pts[i];
    const pp = perps[i];
    const y = track.roadY[i];
    vertices.push(p.x + pp.x * half, y, p.z + pp.z * half);
    vertices.push(p.x - pp.x * half, y, p.z - pp.z * half);
  }

  const segCount = track.closed ? n : n - 1;
  for (let i = 0; i < segCount; i++) {
    const next = (i + 1) % n;
    const a = i * 2, b = i * 2 + 1;
    const c = next * 2, d = next * 2 + 1;
    indices.push(a, b, c);
    indices.push(b, d, c);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  g.setIndex(indices);
  g.computeVertexNormals();

  let mat;
  if (track.type === 'ring') mat = roadMatRing;
  else if (track.type === 'park') mat = roadMatPark;
  else mat = roadMatBranch;

  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = false;
  scene.add(mesh);
}

for (const tr of tracks) buildRoadMesh(tr);

function nearestOnAnyTrack(x, z) {
  let bestDist = Infinity;
  let bestY = null;
  let bestTrack = null;

  for (const tr of tracks) {
    const n = tr.pts.length;
    const segCount = tr.closed ? n : n - 1;
    for (let i = 0; i < segCount; i++) {
      const a = tr.pts[i];
      const b = tr.pts[(i + 1) % n];
      const abx = b.x - a.x, abz = b.z - a.z;
      const apx = x - a.x, apz = z - a.z;
      const abLenSq = abx * abx + abz * abz;
      let t = abLenSq > 0 ? (apx * abx + apz * abz) / abLenSq : 0;
      t = Math.max(0, Math.min(1, t));
      const cx = a.x + abx * t;
      const cz = a.z + abz * t;
      const dx = x - cx, dz = z - cz;
      const d2 = dx * dx + dz * dz;

      if (d2 < bestDist * bestDist) {
        bestDist = Math.sqrt(d2);
        const y1 = tr.roadY[i];
        const y2 = tr.roadY[(i + 1) % n];
        bestY = y1 + (y2 - y1) * t;
        bestTrack = tr;
      }
    }
  }

  return { dist: bestDist, y: bestY, track: bestTrack };
}

function getSurfaceHeight(x, z) {
  const n = nearestOnAnyTrack(x, z);
  if (n.track && n.dist <= n.track.width / 2) return n.y;
  if (n.track && n.dist < n.track.width / 2 + 5) {
    const t = (n.dist - n.track.width / 2) / 5;
    return n.y * (1 - t) + getHeight(x, z) * t;
  }
  return getHeight(x, z);
}

// ===================
// 7. Реестры
// ===================
const staticObjects = [];
const dynamicObjects = [];
const occupiedZones = [];
const swayers = [];
const lamps = [];

function overlapsOccupied(x, z, radius, padding = 0.5) {
  for (const o of occupiedZones) {
    const dx = x - o.x, dz = z - o.z;
    const md = radius + o.radius + padding;
    if (dx * dx + dz * dz < md * md) return true;
  }
  return false;
}

function registerZone(x, z, radius) {
  occupiedZones.push({ x, z, radius });
}

function isTooCloseToTracks(x, z, minDist) {
  const n = nearestOnAnyTrack(x, z);
  if (!n.track) return false;
  return n.dist < n.track.width / 2 + minDist;
}

function isInLake(x, z, extra = 0) {
  for (const lake of LAKES) {
    if (Math.hypot(x - lake.x, z - lake.z) < lake.r + extra) return true;
  }
  return false;
}

// ===================
// 8. Пул PointLight — яркий, с медленным затуханием
// ===================
const LIGHT_POOL_SIZE = 12;
const lightPool = [];
for (let i = 0; i < LIGHT_POOL_SIZE; i++) {
  // (цвет, интенсивность, distance, decay)
  // decay 1 — медленное затухание, свет доходит до земли
  const light = new THREE.PointLight(0xffaa55, 0, 15, 1);
  light.position.set(0, -1000, 0);
  scene.add(light);
  lightPool.push(light);
}

let lightUpdateTimer = 9999;
function updateLampLights(dt, carPos) {
  lightUpdateTimer += dt;
  if (lightUpdateTimer < 0.15) return;
  lightUpdateTimer = 0;

  for (const light of lightPool) light.intensity = 0;
  for (const lamp of lamps) lamp.light = null;

  const sorted = [];
  for (const lamp of lamps) {
    const d = (lamp.x - carPos.x) ** 2 + (lamp.z - carPos.z) ** 2;
    sorted.push({ lamp, d });
  }
  sorted.sort((a, b) => a.d - b.d);

  const count = Math.min(LIGHT_POOL_SIZE, sorted.length);
  for (let i = 0; i < count; i++) {
    const lamp = sorted[i].lamp;
    const light = lightPool[i];
    light.position.set(lamp.x, lamp.y + 5, lamp.z);
    light.intensity = 30;
    lamp.light = light;
  }
}

// ===================
// 9. Модели
// ===================
const loader = new GLTFLoader();
const models = {};
const MODEL_PATHS = {
  car: 'models/car.glb',
  house: 'models/house.glb',
  tree: 'models/tree.glb',
  rock: 'models/rock.glb',
};

async function loadAllModels() {
  for (const [key, path] of Object.entries(MODEL_PATHS)) {
    try {
      const url = import.meta.env.BASE_URL + path;
      const gltf = await loader.loadAsync(url);
      models[key] = gltf.scene;
      console.log(`✅ Модель "${key}" загружена`);
    } catch (err) {
      console.warn(`⚠️ Модель "${key}" не загружена — используется примитив`);
    }
  }
}

function createModelInstance(key, options = {}) {
  if (!models[key]) return null;
  const inst = models[key].clone();
  if (options.uniqueMaterials) {
    inst.traverse((node) => {
      if (node.isMesh) node.material = node.material.clone();
    });
  }
  inst.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = false;
    }
  });
  return inst;
}

function scaleModelToSize(model, targetSize) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim > 0.01) {
    const k = targetSize / maxDim;
    model.scale.multiplyScalar(k);
  }
}

// ===================
// 10. Фабрики
// ===================

function makeCrate(x, z) {
  if (isInLake(x, z, 2)) return;
  const y = getSurfaceHeight(x, z);
  const g = new THREE.Group();
  const size = 2.5;
  const geo = new THREE.BoxGeometry(size, size, size);
  const box = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color: 0x9c6a3a, roughness: 0.85 })
  );
  box.position.y = size / 2;
  box.castShadow = true;
  box.receiveShadow = false;
  g.add(box);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: 0x3a1f08 })
  );
  edges.position.y = size / 2;
  g.add(edges);
  g.position.set(x, y, z);
  scene.add(g);
  dynamicObjects.push({ mesh: g, radius: 1.2, vx: 0, vz: 0, wasColliding: false });
  registerZone(x, z, 1.2);
}

function makeCone(x, z) {
  if (isInLake(x, z, 1)) return;
  const y = getSurfaceHeight(x, z);
  const g = new THREE.Group();
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.5, 1.1, 12),
    new THREE.MeshStandardMaterial({ color: 0xff5500 })
  );
  cone.position.y = 0.6;
  cone.castShadow = true;
  g.add(cone);
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.08, 0.9),
    new THREE.MeshStandardMaterial({ color: 0x222222 })
  );
  base.position.y = 0.04;
  base.castShadow = true;
  g.add(base);
  g.position.set(x, y, z);
  scene.add(g);
  dynamicObjects.push({ mesh: g, radius: 0.5, vx: 0, vz: 0, wasColliding: false });
  registerZone(x, z, 0.5);
}

function makeBush(x, z) {
  if (isInLake(x, z, 3)) return;
  const y = getHeight(x, z);
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x3a6a2e });
  const s1 = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 6), mat);
  s1.position.y = 0.7; s1.castShadow = true; g.add(s1);
  const s2 = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), mat);
  s2.position.set(0.55, 0.5, 0.2); s2.castShadow = true; g.add(s2);
  const s3 = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), mat);
  s3.position.set(-0.45, 0.55, 0.4); s3.castShadow = true; g.add(s3);
  g.position.set(x, y, z);
  scene.add(g);
  registerZone(x, z, 0.9);
  swayers.push({
    mesh: g,
    amountZ: 0.06 + Math.random() * 0.06,
    amountX: 0.03 + Math.random() * 0.04,
    phaseZ: Math.random() * Math.PI * 2,
    phaseX: Math.random() * Math.PI * 2,
    speedZ: 1.2 + Math.random() * 1.0,
    speedX: 0.9 + Math.random() * 0.8,
  });
}

// Фонарь — тонкий столб, яркий шар с Bloom
function makeLamp(x, z) {
  if (isInLake(x, z, 3)) return;
  const y = getHeight(x, z);

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.1, 5, 8),
    new THREE.MeshStandardMaterial({ color: 0x333333 })
  );
  pole.position.set(x, y + 2.5, z);
  pole.castShadow = true;
  scene.add(pole);

  // Шар — очень яркий emissive, чтобы Bloom его уловил
  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffcc55,
    emissiveIntensity: 8,
  });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 16), bulbMat);
  bulb.position.set(x, y + 5, z);
  scene.add(bulb);

  staticObjects.push({ x, z, radius: 0.35 });
  registerZone(x, z, 0.35);

  lamps.push({
    x, y, z,
    headMaterial: bulbMat,
    baseEmissive: 4,
    phase: Math.random() * Math.PI * 2,
    light: null,
  });
}

function makeTree(x, z, size = 8) {
  if (isInLake(x, z, 4)) return;
  const y = getHeight(x, z);
  const g = new THREE.Group();
  const model = createModelInstance('tree');
  if (model) {
    scaleModelToSize(model, size);
    g.add(model);
  } else {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.5, 3.5, 8),
      new THREE.MeshStandardMaterial({ color: 0x4a2a10 })
    );
    trunk.position.y = 1.75;
    trunk.castShadow = true;
    g.add(trunk);
    const fol = new THREE.Mesh(
      new THREE.ConeGeometry(1.8, 3.8, 8),
      new THREE.MeshStandardMaterial({ color: 0x2a5a2e })
    );
    fol.position.y = 4.8;
    fol.castShadow = true;
    g.add(fol);
  }
  g.position.set(x, y, z);
  scene.add(g);
  const radius = size * 0.15;
  staticObjects.push({ x, z, radius });
  registerZone(x, z, radius);
  const sizeFactor = 0.6 + Math.random() * 0.4;
  swayers.push({
    mesh: g,
    amountZ: (0.09 + Math.random() * 0.06) * sizeFactor,
    amountX: (0.04 + Math.random() * 0.04) * sizeFactor,
    phaseZ: Math.random() * Math.PI * 2,
    phaseX: Math.random() * Math.PI * 2,
    speedZ: 0.8 + Math.random() * 0.7,
    speedX: 0.5 + Math.random() * 0.6,
  });
}

function makeRock(x, z, size) {
  const y = getHeight(x, z);
  const g = new THREE.Group();
  const model = createModelInstance('rock');
  if (model) {
    scaleModelToSize(model, size);
    model.rotation.y = Math.random() * Math.PI * 2;
    g.add(model);
  } else {
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(size * 0.35, 0),
      new THREE.MeshStandardMaterial({ color: 0x7a7060, flatShading: true })
    );
    rock.position.y = size * 0.2;
    rock.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    rock.castShadow = true;
    rock.receiveShadow = false;
    g.add(rock);
  }
  g.position.set(x, y, z);
  scene.add(g);
  const radius = size * 0.35;
  staticObjects.push({ x, z, radius });
  registerZone(x, z, radius);
}

function makeHouseRotated(x, z, rotY) {
  if (isInLake(x, z, 6)) return;
  const y = getHeight(x, z);
  const g = new THREE.Group();
  const model = createModelInstance('house', { uniqueMaterials: true });
  if (model) {
    scaleModelToSize(model, 20);
    g.add(model);
  } else {
    const w = 6 + Math.random() * 3;
    const d = 6 + Math.random() * 3;
    const h = 6 + Math.random() * 5;
    const walls = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color: 0xa88a68 })
    );
    walls.position.y = h / 2;
    walls.castShadow = true;
    walls.receiveShadow = false;
    g.add(walls);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(w, d) * 0.8, 3.5, 4),
      new THREE.MeshStandardMaterial({ color: 0x7a2a1a })
    );
    roof.position.y = h + 1.7;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    g.add(roof);
  }
  g.position.set(x, y, z);
  g.rotation.y = rotY + Math.PI;
  scene.add(g);
  staticObjects.push({ x, z, radius: 9 });
  registerZone(x, z, 10);
}

// ===================
// 11. Пыль
// ===================
const DUST_COUNT = 120;
const dustPositions = new Float32Array(DUST_COUNT * 3);
const dustVelocities = new Float32Array(DUST_COUNT * 3);
const dustLife = new Float32Array(DUST_COUNT);
const dustMaxLife = new Float32Array(DUST_COUNT);
const dustSizes = new Float32Array(DUST_COUNT);
const dustAlphas = new Float32Array(DUST_COUNT);
const dustColors = new Float32Array(DUST_COUNT * 3);
const dustMaxSizes = new Float32Array(DUST_COUNT);

for (let i = 0; i < DUST_COUNT; i++) {
  dustPositions[i * 3] = 9999;
  dustPositions[i * 3 + 1] = 9999;
  dustPositions[i * 3 + 2] = 9999;
}

const dustGeo = new THREE.BufferGeometry();
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
dustGeo.setAttribute('aSize', new THREE.BufferAttribute(dustSizes, 1));
dustGeo.setAttribute('aAlpha', new THREE.BufferAttribute(dustAlphas, 1));
dustGeo.setAttribute('aColor', new THREE.BufferAttribute(dustColors, 3));

const dustMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  vertexShader: `
    attribute float aSize;
    attribute float aAlpha;
    attribute vec3 aColor;
    varying float vAlpha;
    varying vec3 vColor;
    void main() {
      vAlpha = aAlpha;
      vColor = aColor;
      vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = min(aSize * (400.0 / -mvPos.z), 60.0);
      gl_Position = projectionMatrix * mvPos;
    }
  `,
  fragmentShader: `
    varying float vAlpha;
    varying vec3 vColor;
    void main() {
      vec2 c = gl_PointCoord - vec2(0.5);
      float d = length(c);
      if (d > 0.5) discard;
      float a = vAlpha * (1.0 - smoothstep(0.15, 0.5, d));
      gl_FragColor = vec4(vColor, a);
    }
  `,
});
const dustPoints = new THREE.Points(dustGeo, dustMat);
dustPoints.frustumCulled = false;
scene.add(dustPoints);

let dustIndex = 0;
function emitDust(x, y, z, drift) {
  const i = dustIndex;
  dustIndex = (dustIndex + 1) % DUST_COUNT;
  dustPositions[i * 3] = x + (Math.random() - 0.5) * 1.5;
  dustPositions[i * 3 + 1] = y + 0.15 + Math.random() * 0.2;
  dustPositions[i * 3 + 2] = z + (Math.random() - 0.5) * 1.5;
  dustVelocities[i * 3] = (Math.random() - 0.5) * 1.5 + (drift?.x || 0);
  dustVelocities[i * 3 + 1] = 0.8 + Math.random() * 1.2;
  dustVelocities[i * 3 + 2] = (Math.random() - 0.5) * 1.5 + (drift?.z || 0);
  dustMaxLife[i] = 0.5 + Math.random() * 0.5;
  dustLife[i] = 1.0;
  dustMaxSizes[i] = 3.0 + Math.random() * 2.5;
  dustSizes[i] = 0.6 + Math.random() * 0.5;
  dustAlphas[i] = 0.75;
  const shade = 0.75 + Math.random() * 0.15;
  dustColors[i * 3] = 0.78 * shade;
  dustColors[i * 3 + 1] = 0.70 * shade;
  dustColors[i * 3 + 2] = 0.58 * shade;
}

function updateDust(dt) {
  for (let i = 0; i < DUST_COUNT; i++) {
    if (dustLife[i] <= 0) continue;
    dustLife[i] -= dt / dustMaxLife[i];
    if (dustLife[i] <= 0) {
      dustPositions[i * 3] = 9999;
      dustPositions[i * 3 + 1] = 9999;
      dustPositions[i * 3 + 2] = 9999;
      dustAlphas[i] = 0;
      dustSizes[i] = 0;
      continue;
    }
    const t = 1 - dustLife[i];
    dustPositions[i * 3] += dustVelocities[i * 3] * dt;
    dustPositions[i * 3 + 1] += dustVelocities[i * 3 + 1] * dt;
    dustPositions[i * 3 + 2] += dustVelocities[i * 3 + 2] * dt;
    const gravity = 2.5 * (1 - t * 0.7);
    dustVelocities[i * 3 + 1] -= gravity * dt;
    const drag = Math.pow(0.05, dt);
    dustVelocities[i * 3] *= drag;
    dustVelocities[i * 3 + 1] *= drag;
    dustVelocities[i * 3 + 2] *= drag;
    dustSizes[i] = (0.6 + Math.random() * 0.5) + (dustMaxSizes[i] - 0.6) * t;
    if (t < 0.15) dustAlphas[i] = 0.75 * (t / 0.15);
    else dustAlphas[i] = 0.75 * (1 - (t - 0.15) / 0.85);
  }
  dustGeo.attributes.position.needsUpdate = true;
  dustGeo.attributes.aSize.needsUpdate = true;
  dustGeo.attributes.aAlpha.needsUpdate = true;
  dustGeo.attributes.aColor.needsUpdate = true;
}

// ===================
// 12. Машина
// ===================
const car = new THREE.Group();
const wheels = [];
const CAR_RADIUS = 2.0;

function buildCar() {
  const model = createModelInstance('car');
  if (model) {
    scaleModelToSize(model, 6);
    model.rotation.y = Math.PI / 2;
    car.add(model);
  } else {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(3, 0.8, 1.6),
      new THREE.MeshStandardMaterial({ color: 0xff3333 })
    );
    body.position.y = 0.6;
    body.castShadow = true;
    car.add(body);
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.7, 1.4),
      new THREE.MeshStandardMaterial({ color: 0xff3333 })
    );
    cabin.position.set(-0.2, 1.35, 0);
    cabin.castShadow = true;
    car.add(cabin);
    function createWheel(x, z) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.4, z);
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.4, 0.3, 12),
        new THREE.MeshStandardMaterial({ color: 0x111111 })
      );
      wheel.rotation.x = Math.PI / 2;
      wheel.castShadow = true;
      pivot.add(wheel);
      car.add(pivot);
      wheels.push(wheel);
    }
    createWheel(1, 0.9); createWheel(1, -0.9);
    createWheel(-1, 0.9); createWheel(-1, -0.9);
  }
}

// ===================
// 13. Звук
// ===================
const listener = new THREE.AudioListener();
camera.add(listener);
const audioLoader = new THREE.AudioLoader();
const SOUND_BASE = import.meta.env.BASE_URL + 'sounds/';

const engineSound = new THREE.PositionalAudio(listener);
engineSound.setRefDistance(4);
engineSound.setRolloffFactor(1.2);
engineSound.setLoop(true);
engineSound.setVolume(0.6);
let engineBufferReady = false;
audioLoader.load(SOUND_BASE + 'engine.mp3', (b) => {
  engineSound.setBuffer(b);
  engineBufferReady = true;
  if (audioStarted) engineSound.play();
});
car.add(engineSound);

const HIT_POOL_SIZE = 10;
const hitPool = [];
for (let i = 0; i < HIT_POOL_SIZE; i++) {
  const hit = new THREE.PositionalAudio(listener);
  hit.setRefDistance(6);
  hit.setRolloffFactor(1.0);
  hit.setVolume(0.9);
  audioLoader.load(SOUND_BASE + 'hit.mp3', (b) => hit.setBuffer(b));
  scene.add(hit);
  hitPool.push(hit);
}
let hitIndex = 0;
function playHitAt(x, y, z) {
  const hit = hitPool[hitIndex];
  if (!hit || !hit.buffer) return;
  hit.position.set(x, y, z);
  if (hit.isPlaying) hit.stop();
  hit.play();
  hitIndex = (hitIndex + 1) % hitPool.length;
}

const bgMusic = new Howl({
  src: [SOUND_BASE + 'background.mp3'],
  loop: true,
  volume: 0.1,
  preload: true,
  format: ['mp3'],
});

let audioStarted = false;
function startAudioOnce() {
  if (audioStarted) return;
  audioStarted = true;
  if (listener.context.state === 'suspended') listener.context.resume();
  if (engineBufferReady) engineSound.play();
  bgMusic.play();
}

window.addEventListener('touchstart', startAudioOnce, { once: true, passive: true });
window.addEventListener('click', startAudioOnce, { once: true });
window.addEventListener('keydown', startAudioOnce, { once: true });

// ===================
// 14. Клавиатура
// ===================
const keys = { w: false, a: false, s: false, d: false };
const codeMap = {
  KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd',
  ArrowUp: 'w', ArrowLeft: 'a', ArrowDown: 's', ArrowRight: 'd',
};
window.addEventListener('keydown', (e) => {
  const k = codeMap[e.code];
  if (k) { keys[k] = true; e.preventDefault(); hideHint(); startAudioOnce(); }
});
window.addEventListener('keyup', (e) => {
  const k = codeMap[e.code];
  if (k) { keys[k] = false; e.preventDefault(); }
});

// ===================
// 15. Тач-джойстик
// ===================
let joystickForward = 0;
let joystickTurn = 0;

const isTouchDevice =
  ('ontouchstart' in window) ||
  (navigator.maxTouchPoints > 0) ||
  (navigator.msMaxTouchPoints > 0);

if (isTouchDevice) {
  const stickBase = document.createElement('div');
  stickBase.style.cssText = `
    position: fixed; width: 100px; height: 100px; border-radius: 50%;
    background: rgba(0, 0, 0, 0.25); border: 2px solid rgba(255, 255, 255, 0.4);
    display: none; pointer-events: none; z-index: 60;
    transform: translate(-50%, -50%);
  `;
  document.body.appendChild(stickBase);

  const stickThumb = document.createElement('div');
  stickThumb.style.cssText = `
    position: fixed; width: 44px; height: 44px; border-radius: 50%;
    background: rgba(0, 0, 0, 0.55); border: 2px solid rgba(255, 255, 255, 0.6);
    display: none; pointer-events: none; z-index: 61;
    transform: translate(-50%, -50%);
  `;
  document.body.appendChild(stickThumb);

  const MAX_DIST = 50;
  let activePointerId = null;
  let startX = 0, startY = 0;

  function onPointerDown(e) {
    if (activePointerId !== null) return;
    activePointerId = e.pointerId;
    startX = e.clientX; startY = e.clientY;
    stickBase.style.left = startX + 'px';
    stickBase.style.top = startY + 'px';
    stickThumb.style.left = startX + 'px';
    stickThumb.style.top = startY + 'px';
    stickBase.style.display = 'block';
    stickThumb.style.display = 'block';
    hideHint();
    startAudioOnce();
  }

  function onPointerMove(e) {
    if (e.pointerId !== activePointerId) return;
    let dx = e.clientX - startX;
    let dy = e.clientY - startY;
    const dist = Math.hypot(dx, dy);
    if (dist > MAX_DIST) {
      dx = (dx / dist) * MAX_DIST;
      dy = (dy / dist) * MAX_DIST;
    }
    stickThumb.style.left = (startX + dx) + 'px';
    stickThumb.style.top = (startY + dy) + 'px';
    joystickTurn = dx / MAX_DIST;
    joystickForward = -dy / MAX_DIST;
  }

  function onPointerUp(e) {
    if (e.pointerId !== activePointerId) return;
    activePointerId = null;
    joystickForward = 0;
    joystickTurn = 0;
    stickBase.style.display = 'none';
    stickThumb.style.display = 'none';
  }

  window.addEventListener('pointerdown', onPointerDown, { passive: true });
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerup', onPointerUp, { passive: true });
  window.addEventListener('pointercancel', onPointerUp, { passive: true });
}

const hint = document.getElementById('hint');
let hintHidden = false;
function hideHint() {
  if (hintHidden || !hint) return;
  hintHidden = true;
  hint.classList.add('hidden');
  setTimeout(() => hint.remove(), 700);
}

// ===================
// 16. Параметры движения
// ===================
const MAX_SPEED = 35;
const ACCELERATION = 16;
const BRAKE = 32;
const FRICTION = 6;
const TURN_SPEED = 1.6;
let speed = 0;
let prevSpeed = 0;
let smoothTurn = 0;

// ===================
// 17. Post-processing с Bloom
// ===================
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

// Bloom — даёт мягкое свечение вокруг ярких источников (фонарей)
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(innerWidth, innerHeight),
  0.3,    // strength — сила свечения
  0.3,    // radius — радиус ореола
  0.3    // threshold — порог, ниже которого не светится
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// ===================
// 18. Физика
// ===================
function updatePhysics(dt) {
  for (const o of dynamicObjects) {
    o.mesh.position.x += o.vx * dt;
    o.mesh.position.z += o.vz * dt;
    o.mesh.position.y = getSurfaceHeight(o.mesh.position.x, o.mesh.position.z);
    const decay = Math.pow(0.3, dt);
    o.vx *= decay;
    o.vz *= decay;
    if (Math.abs(o.vx) < 0.02) o.vx = 0;
    if (Math.abs(o.vz) < 0.02) o.vz = 0;
  }

  for (const s of staticObjects) {
    const dx = s.x - car.position.x;
    const dz = s.z - car.position.z;
    const d2 = dx * dx + dz * dz;
    const md = CAR_RADIUS + s.radius;
    if (d2 >= md * md || d2 < 1e-6) { s.wasColliding = false; continue; }
    const d = Math.sqrt(d2);
    const nx = dx / d, nz = dz / d;
    const overlap = md - d;
    car.position.x -= nx * overlap;
    car.position.z -= nz * overlap;
    speed *= Math.pow(0.3, dt);
    if (!s.wasColliding) {
      playHitAt(car.position.x + nx * CAR_RADIUS, car.position.y + 0.5, car.position.z + nz * CAR_RADIUS);
      s.wasColliding = true;
    }
  }

  for (const o of dynamicObjects) {
    const dx = o.mesh.position.x - car.position.x;
    const dz = o.mesh.position.z - car.position.z;
    const d2 = dx * dx + dz * dz;
    const md = CAR_RADIUS + o.radius;
    if (d2 >= md * md || d2 < 1e-6) { o.wasColliding = false; continue; }
    const d = Math.sqrt(d2);
    const nx = dx / d, nz = dz / d;
    const overlap = md - d;
    car.position.x -= nx * overlap * 0.3;
    car.position.z -= nz * overlap * 0.3;
    o.mesh.position.x += nx * overlap * 0.7;
    o.mesh.position.z += nz * overlap * 0.7;
    if (!o.wasColliding) {
      const kick = Math.max(Math.abs(speed) * 0.5, 4);
      o.vx = nx * kick * 1.5;
      o.vz = nz * kick * 1.5;
      speed *= 0.9;
      playHitAt(o.mesh.position.x, o.mesh.position.y + 0.8, o.mesh.position.z);
      o.wasColliding = true;
    }
  }

  for (const o of dynamicObjects) {
    for (const s of staticObjects) {
      const dx = s.x - o.mesh.position.x;
      const dz = s.z - o.mesh.position.z;
      const d2 = dx * dx + dz * dz;
      const md = o.radius + s.radius;
      if (d2 >= md * md || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d, nz = dz / d;
      const overlap = md - d;
      o.mesh.position.x -= nx * overlap;
      o.mesh.position.z -= nz * overlap;
      const vn = o.vx * nx + o.vz * nz;
      if (vn > 0) {
        const e = 0.5;
        o.vx -= (1 + e) * vn * nx;
        o.vz -= (1 + e) * vn * nz;
      }
    }
  }

  for (let i = 0; i < dynamicObjects.length; i++) {
    for (let j = i + 1; j < dynamicObjects.length; j++) {
      const a = dynamicObjects[i];
      const b = dynamicObjects[j];
      const dx = b.mesh.position.x - a.mesh.position.x;
      const dz = b.mesh.position.z - a.mesh.position.z;
      const d2 = dx * dx + dz * dz;
      const md = a.radius + b.radius;
      if (d2 >= md * md || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d, nz = dz / d;
      const overlap = md - d;
      a.mesh.position.x -= nx * overlap * 0.5;
      a.mesh.position.z -= nz * overlap * 0.5;
      b.mesh.position.x += nx * overlap * 0.5;
      b.mesh.position.z += nz * overlap * 0.5;
      const vn = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
      if (vn > 0) {
        const e = 0.5;
        a.vx -= (1 + e) * vn * 0.5 * nx;
        a.vz -= (1 + e) * vn * 0.5 * nz;
        b.vx += (1 + e) * vn * 0.5 * nx;
        b.vz += (1 + e) * vn * 0.5 * nz;
      }
    }
  }
}

// ===================
// 19. Анимация
// ===================
let lastTime = performance.now();
const forwardVec = new THREE.Vector3();
const driftVec = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  const timeSec = now * 0.001;

  const kbThrottle = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);
  const jsThrottle = joystickForward > 0.15 ? joystickForward
                    : joystickForward < -0.15 ? joystickForward : 0;

  if (kbThrottle !== 0) {
    if (kbThrottle > 0) speed += ACCELERATION * dt;
    else speed -= BRAKE * dt;
  } else if (jsThrottle !== 0) {
    if (jsThrottle > 0) speed += ACCELERATION * jsThrottle * dt;
    else speed -= BRAKE * Math.abs(jsThrottle) * dt;
  } else {
    if (speed > 0) speed = Math.max(0, speed - FRICTION * dt);
    else if (speed < 0) speed = Math.min(0, speed + FRICTION * dt);
  }
  speed = THREE.MathUtils.clamp(speed, -MAX_SPEED, MAX_SPEED);

  const turnFactor = Math.min(Math.abs(speed) / 3, 1);
  let turnInput = 0;
  if (keys.a) turnInput += 1;
  if (keys.d) turnInput -= 1;
  if (Math.abs(joystickTurn) > 0.15) turnInput -= joystickTurn;
  car.rotation.y += TURN_SPEED * dt * turnFactor * turnInput;

  smoothTurn += (turnInput - smoothTurn) * Math.min(1, dt * 4);
  const rollAmount  = -smoothTurn * turnFactor * 0.10;
  const pitchAmount = -Math.sign(speed) * Math.min(Math.abs(speed) / MAX_SPEED, 1) * 0.05;
  if (car.children[0]) {
    car.children[0].rotation.z = rollAmount;
    car.children[0].rotation.x = pitchAmount;
  }

  forwardVec.set(1, 0, 0).applyQuaternion(car.quaternion);
  car.position.x += forwardVec.x * speed * dt;
  car.position.z += forwardVec.z * speed * dt;
  const targetY = getSurfaceHeight(car.position.x, car.position.z) + 0.35;
  car.position.y += (targetY - car.position.y) * Math.min(1, dt * 12);

  updatePhysics(dt);
  wheels.forEach((w) => { w.rotation.y -= speed * dt * 3; });

  const accel = (speed - prevSpeed) / Math.max(dt, 1e-4);
  prevSpeed = speed;

  if (Math.abs(speed) > 6) {
    const emitRate = Math.min(Math.abs(speed) / MAX_SPEED, 1.0);
    if (Math.random() < emitRate * 1.2) {
      const rearX = car.position.x - forwardVec.x * 2.0;
      const rearZ = car.position.z - forwardVec.z * 2.0;
      driftVec.set(-forwardVec.x * speed * 0.15, 0, -forwardVec.z * speed * 0.15);
      emitDust(rearX, car.position.y, rearZ, driftVec);
    }
  }
  if (accel < -20 && Math.abs(speed) > 3) {
    if (Math.random() < 0.4) {
      const rearX = car.position.x - forwardVec.x * 1.8;
      const rearZ = car.position.z - forwardVec.z * 1.8;
      driftVec.set(forwardVec.x * Math.abs(accel) * 0.05, 0, forwardVec.z * Math.abs(accel) * 0.05);
      emitDust(rearX, car.position.y, rearZ, driftVec);
    }
  }
  updateDust(dt);

  updateLampLights(dt, car.position);

  for (const lamp of lamps) {
    const flick = 0.9 + Math.sin(timeSec * 7 + lamp.phase) * 0.08
                + Math.sin(timeSec * 13 + lamp.phase * 1.7) * 0.04;
    lamp.headMaterial.emissiveIntensity = lamp.baseEmissive * flick;
    if (lamp.light) lamp.light.intensity = 30 * flick;
  }

  for (const s of swayers) {
    s.mesh.rotation.z = Math.sin(timeSec * s.speedZ + s.phaseZ) * s.amountZ;
    s.mesh.rotation.x = Math.sin(timeSec * s.speedX + s.phaseX) * s.amountX;
  }

  const cameraOffset = new THREE.Vector3(16, 16, 16);
  const desiredPos = cameraOffset.clone().add(car.position);
  camera.position.lerp(desiredPos, 1 - Math.pow(0.0001, dt));
  camera.lookAt(car.position.x, car.position.y + 1.2, car.position.z);

  if (engineSound.isPlaying) {
    const sr = Math.abs(speed) / MAX_SPEED;
    engineSound.setPlaybackRate(0.8 + sr * 0.7);
    engineSound.setVolume(0.4 + sr * 0.5);
  }

  sky.position.copy(camera.position);
  waterUniforms.uTime.value = timeSec;

  composer.render();
}

// ===================
// 20. Точка входа
// ===================
async function start() {
  await loadAllModels();
  buildCar();

  // Парк — фонари по бокам дорожек
  const pathAngles = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2];
  for (const angle of pathAngles) {
    const dirX = Math.cos(angle);
    const dirZ = Math.sin(angle);
    const perpX = -dirZ;
    const perpZ = dirX;
    for (let d = 20; d < PARK_RADIUS - 10; d += 40) {
      for (const side of [-1, 1]) {
        const off = PARK_PATH_WIDTH / 2 + 2;
        const x = dirX * d + perpX * off * side;
        const z = dirZ * d + perpZ * off * side;
        if (isInLake(x, z, 3)) continue;
        makeLamp(x, z);
      }
    }
  }

  let parkTrees = 0, parkTries = 0;
  while (parkTrees < 60 && parkTries < 700) {
    parkTries++;
    const a = Math.random() * Math.PI * 2;
    const r = PARK_PATH_WIDTH + 5 + Math.random() * (PARK_RADIUS - PARK_PATH_WIDTH - 8);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (isTooCloseToTracks(x, z, 6)) continue;
    if (isInLake(x, z, 4)) continue;
    if (overlapsOccupied(x, z, 3, 3)) continue;
    makeTree(x, z, 8 + Math.random() * 4);
    parkTrees++;
  }

  let parkBushes = 0, bushTries = 0;
  while (parkBushes < 25 && bushTries < 400) {
    bushTries++;
    const a = Math.random() * Math.PI * 2;
    const r = PARK_PATH_WIDTH + 3 + Math.random() * (PARK_RADIUS - PARK_PATH_WIDTH - 6);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (isTooCloseToTracks(x, z, 4)) continue;
    if (isInLake(x, z, 4)) continue;
    if (overlapsOccupied(x, z, 1, 2)) continue;
    makeBush(x, z);
    parkBushes++;
  }

  // RING1 — фонари
  const ring1 = tracks[0];
  for (let i = 0; i < 40; i++) {
    const t = i / 40;
    const idx = Math.floor(t * (ring1.pts.length - 1));
    const p = ring1.pts[idx];
    const toR = Math.atan2(p.z, p.x);
    const outwardX = Math.cos(toR);
    const outwardZ = Math.sin(toR);
    const dist = RING1_WIDTH / 2 + 3;
    makeLamp(p.x + outwardX * dist, p.z + outwardZ * dist);
  }

  for (let i = 0; i < 60; i++) {
    const t = Math.random();
    const idx = Math.floor(t * (ring1.pts.length - 1));
    const p = ring1.pts[idx];
    const toR = Math.atan2(p.z, p.x);
    const outwardX = Math.cos(toR);
    const outwardZ = Math.sin(toR);
    const side = Math.random() < 0.5 ? 1 : -1;
    const dist = RING1_WIDTH / 2 + 3 + Math.random() * 6;
    const x = p.x + outwardX * dist * side;
    const z = p.z + outwardZ * dist * side;
    if (isTooCloseToTracks(x, z, 3)) continue;
    if (overlapsOccupied(x, z, 1, 1.5)) continue;
    makeBush(x, z);
  }

  // RING2 — фонари
  const ring2 = tracks[1];
  for (let i = 0; i < 60; i++) {
    const t = i / 60;
    const idx = Math.floor(t * (ring2.pts.length - 1));
    const p = ring2.pts[idx];
    const toR = Math.atan2(p.z, p.x);
    const outwardX = Math.cos(toR);
    const outwardZ = Math.sin(toR);
    const side = Math.random() < 0.5 ? 1 : -1;
    const dist = RING2_WIDTH / 2 + 3;
    makeLamp(p.x + outwardX * dist * side, p.z + outwardZ * dist * side);
  }

  // Спицы — кусты
  for (let i = 2; i < 6; i++) {
    const tr = tracks[i];
    for (let j = 0; j < 15; j++) {
      const t = Math.random();
      const idx = Math.floor(t * (tr.pts.length - 1));
      const p = tr.pts[idx];
      const ang = Math.atan2(p.z, p.x);
      const perpX = -Math.sin(ang);
      const perpZ = Math.cos(ang);
      const side = Math.random() < 0.5 ? 1 : -1;
      const dist = tr.width / 2 + 3 + Math.random() * 4;
      const x = p.x + perpX * dist * side;
      const z = p.z + perpZ * dist * side;
      if (overlapsOccupied(x, z, 1, 1.5)) continue;
      makeBush(x, z);
    }
  }

  // Улицы с домами
  const HOUSE_FACADE_OFFSET = 12;
  const HOUSE_STREET_OFFSET = 26;

  for (let i = 6; i < 14; i++) {
    const tr = tracks[i];
    const len = tr.pts.length;
    const startIdx = 12;
    const endIdx = len - 12;
    const step = 8;

    for (let idx = startIdx; idx < endIdx; idx += step) {
      const p = tr.pts[idx];
      if (!p) continue;

      const pNext = tr.pts[Math.min(idx + 5, len - 1)];
      let dxN = pNext.x - p.x;
      let dzN = pNext.z - p.z;
      const dLen = Math.hypot(dxN, dzN) || 1;
      dxN /= dLen;
      dzN /= dLen;

      const perp2X = -dzN;
      const perp2Z = dxN;

      for (const side of [-1, 1]) {
        const x = p.x + perp2X * HOUSE_STREET_OFFSET * side;
        const z = p.z + perp2Z * HOUSE_STREET_OFFSET * side;
        if (isTooCloseToTracks(x, z, 8)) continue;
        if (isInLake(x, z, 6)) continue;
        if (overlapsOccupied(x, z, 8, 4)) continue;

        const toStreetX = -perp2X * side;
        const toStreetZ = -perp2Z * side;

        makeHouseRotated(x, z, Math.atan2(toStreetX, toStreetZ));

        const alongX = dxN;
        const alongZ = dzN;

        const lampOffsetAlong = 10;
        const lx = x + toStreetX * HOUSE_FACADE_OFFSET + alongX * lampOffsetAlong;
        const lz = z + toStreetZ * HOUSE_FACADE_OFFSET + alongZ * lampOffsetAlong;
        if (!overlapsOccupied(lx, lz, 0.3, 0.5)) makeLamp(lx, lz);

        const bushBaseX = x + toStreetX * (HOUSE_FACADE_OFFSET - 2) - alongX * lampOffsetAlong;
        const bushBaseZ = z + toStreetZ * (HOUSE_FACADE_OFFSET - 2) - alongZ * lampOffsetAlong;
        for (const s of [-1, 1]) {
          const bx = bushBaseX + alongX * 3 * s;
          const bz = bushBaseZ + alongZ * 3 * s;
          if (!overlapsOccupied(bx, bz, 1, 1.2)) makeBush(bx, bz);
        }
      }
    }
  }

  // Горы
  for (let i = 0; i < 90; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = MOUNTAINS_MIN + Math.random() * 600;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (Math.abs(x) > MAP_SIZE / 2 - 40) continue;
    if (Math.abs(z) > MAP_SIZE / 2 - 40) continue;
    const t = Math.min((r - MOUNTAINS_MIN) / 500, 1);
    const size = 25 + t * 40 + Math.random() * 20;
    makeRock(x, z, size);
  }

  // Поля
  for (let i = 0; i < 200; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = RING2_RADIUS + 30 + Math.random() * (MOUNTAINS_MIN - RING2_RADIUS - 60);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (isTooCloseToTracks(x, z, 12)) continue;
    if (isInLake(x, z, 4)) continue;
    if (overlapsOccupied(x, z, 5, 3)) continue;
    if (Math.abs(x) > MAP_SIZE / 2 - 40) continue;
    if (Math.abs(z) > MAP_SIZE / 2 - 40) continue;
    makeTree(x, z, 8 + Math.random() * 6);
  }

  for (let i = 0; i < 250; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = RING2_RADIUS + 25 + Math.random() * (MOUNTAINS_MIN - RING2_RADIUS - 50);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (isTooCloseToTracks(x, z, 8)) continue;
    if (isInLake(x, z, 4)) continue;
    if (overlapsOccupied(x, z, 1.5, 2)) continue;
    if (Math.abs(x) > MAP_SIZE / 2 - 30) continue;
    if (Math.abs(z) > MAP_SIZE / 2 - 30) continue;
    makeBush(x, z);
  }

  for (let i = 0; i < 60; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = PARK_RADIUS + 20 + Math.random() * (RING1_RADIUS - PARK_RADIUS - 40);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (isTooCloseToTracks(x, z, 8)) continue;
    if (isInLake(x, z, 5)) continue;
    if (overlapsOccupied(x, z, 3, 2)) continue;
    if (Math.random() < 0.6) makeTree(x, z, 6 + Math.random() * 4);
    else makeBush(x, z);
  }

  // Ящики и конусы на RING1
  for (let i = 0; i < 20; i++) {
    const t = Math.random();
    const idx = Math.floor(t * (ring1.pts.length - 1));
    const p = ring1.pts[idx];
    const nxt = ring1.pts[(idx + 1) % ring1.pts.length];
    const tang = Math.atan2(nxt.z - p.z, nxt.x - p.x);
    const perpX = -Math.sin(tang);
    const perpZ = Math.cos(tang);
    const off = (Math.random() - 0.5) * (RING1_WIDTH - 4);
    makeCrate(p.x + perpX * off, p.z + perpZ * off);
  }
  for (let i = 0; i < 10; i++) {
    const t = Math.random();
    const idx = Math.floor(t * (ring1.pts.length - 1));
    const p = ring1.pts[idx];
    const nxt = ring1.pts[(idx + 1) % ring1.pts.length];
    const tang = Math.atan2(nxt.z - p.z, nxt.x - p.x);
    const perpX = -Math.sin(tang);
    const perpZ = Math.cos(tang);
    const off = (Math.random() - 0.5) * (RING1_WIDTH - 4);
    makeCone(p.x + perpX * off, p.z + perpZ * off);
  }

  // Машина
  const sp = ring1.pts[0];
  const spNext = ring1.pts[1];
  car.position.set(sp.x, getHeight(sp.x, sp.z) + 0.6, sp.z);
  car.rotation.y = Math.atan2(spNext.x - sp.x, spNext.z - sp.z);
  scene.add(car);

  animate();
}

start();

// ===================
// 21. Resize
// ===================
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  bloomPass.setSize(innerWidth, innerHeight);
});