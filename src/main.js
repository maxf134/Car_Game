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

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(30, 30, 30);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('app').appendChild(renderer.domElement);

// ===================
// 2. Небо, туман, свет
// ===================
const skyColorTop = new THREE.Color(0x2a4a7a);
const skyColorMid = new THREE.Color(0xff9966);
const skyColorBot = new THREE.Color(0xffcc88);
scene.background = skyColorMid;

scene.fog = new THREE.Fog(0xffaa77, 80, 220);

const skyGeo = new THREE.SphereGeometry(400, 32, 16);
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
      if (h > 0.15) {
        col = mix(midColor, topColor, smoothstep(0.15, 1.0, h));
      } else {
        col = mix(botColor, midColor, smoothstep(-0.2, 0.15, h));
      }
      gl_FragColor = vec4(col, 1.0);
    }
  `,
});
const sky = new THREE.Mesh(skyGeo, skyMat);
sky.frustumCulled = false;
scene.add(sky);

scene.add(new THREE.AmbientLight(0xffe0b8, 0.35));

const hemi = new THREE.HemisphereLight(0xffd9a8, 0x2e4423, 0.7);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffb070, 2.2);
sun.position.set(80, 50, 60);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -120;
sun.shadow.camera.right = 120;
sun.shadow.camera.top = 120;
sun.shadow.camera.bottom = -120;
sun.shadow.bias = -0.0005;
scene.add(sun);

const fill = new THREE.DirectionalLight(0x6688cc, 0.35);
fill.position.set(-60, 40, -40);
scene.add(fill);

// ===================
// 3. Рельеф
// ===================
const WATER_LEVEL = -4;

function getHeight(x, z) {
  let h = 0;
  h += Math.sin(x * 0.030) * 2.5;
  h += Math.cos(z * 0.035) * 2.0;
  h += Math.sin((x + z) * 0.020) * 3.0;
  h += Math.sin(x * 0.080) * 0.3;
  h += Math.cos(z * 0.070) * 0.2;
  return h;
}

const GROUND_SIZE = 400;
const GROUND_SEGMENTS = 200;

const groundGeo = new THREE.PlaneGeometry(
  GROUND_SIZE, GROUND_SIZE, GROUND_SEGMENTS, GROUND_SEGMENTS
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
  new THREE.MeshStandardMaterial({ color: 0x4aa04a, roughness: 0.95 })
);
ground.receiveShadow = true;
scene.add(ground);

// ===================
// 4. Вода
// ===================
const WATER_RES = 96;

const waterGeo = new THREE.PlaneGeometry(
  GROUND_SIZE, GROUND_SIZE, WATER_RES, WATER_RES
);
waterGeo.rotateX(-Math.PI / 2);

const waterMat = new THREE.MeshStandardMaterial({
  color: 0x123a5c,
  transparent: true,
  opacity: 0.9,
  roughness: 0.85,
  metalness: 0.0,
});

const waterUniforms = { uTime: { value: 0 } };

waterMat.onBeforeCompile = (shader) => {
  shader.uniforms.uTime = waterUniforms.uTime;

  shader.vertexShader = `
    uniform float uTime;
  ` + shader.vertexShader;

  shader.vertexShader = shader.vertexShader.replace(
    '#include <begin_vertex>',
    `
    vec3 transformed = vec3(position);
    float t = uTime;
    float w1 = sin(position.x * 0.15 + t * 0.9) * 0.15;
    float w2 = cos(position.z * 0.18 + t * 1.1) * 0.12;
    float w3 = sin((position.x + position.z) * 0.09 + t * 0.6) * 0.10;
    transformed.y += w1 + w2 + w3;
    `
  );
};

const water = new THREE.Mesh(waterGeo, waterMat);
water.position.y = WATER_LEVEL;
scene.add(water);

// ===================
// 5. Трасса
// ===================
const trackPoints = [
  new THREE.Vector3(0, 0, -70),
  new THREE.Vector3(40, 0, -60),
  new THREE.Vector3(65, 0, -30),
  new THREE.Vector3(60, 0, 10),
  new THREE.Vector3(35, 0, 40),
  new THREE.Vector3(0, 0, 20),
  new THREE.Vector3(-35, 0, 40),
  new THREE.Vector3(-60, 0, 10),
  new THREE.Vector3(-65, 0, -30),
  new THREE.Vector3(-40, 0, -60),
];
const curve = new THREE.CatmullRomCurve3(trackPoints, true, 'catmullrom', 0.5);

const ROAD_WIDTH = 9;
const ROAD_SEGMENTS = 600;
const ROAD_SMOOTH_PASSES = 6;
const ROAD_RAISE = 0.2;

const halfRoad = ROAD_WIDTH / 2;

const centers = [];
for (let i = 0; i < ROAD_SEGMENTS; i++) {
  const t = i / ROAD_SEGMENTS;
  const p = curve.getPointAt(t);
  centers.push({ x: p.x, z: p.z });
}

const perps = [];
for (let i = 0; i < ROAD_SEGMENTS; i++) {
  const prev = centers[(i - 1 + ROAD_SEGMENTS) % ROAD_SEGMENTS];
  const next = centers[(i + 1) % ROAD_SEGMENTS];
  let tx = next.x - prev.x;
  let tz = next.z - prev.z;
  const tlen = Math.hypot(tx, tz) || 1;
  tx /= tlen;
  tz /= tlen;
  perps.push({ x: tz, z: -tx });
}

const roadHeights = [];
for (let i = 0; i < ROAD_SEGMENTS; i++) {
  const c = centers[i];
  const pp = perps[i];
  let maxH = getHeight(c.x, c.z);
  for (const frac of [-0.5, -0.25, 0.25, 0.5]) {
    const sx = c.x + pp.x * halfRoad * frac;
    const sz = c.z + pp.z * halfRoad * frac;
    const h = getHeight(sx, sz);
    if (h > maxH) maxH = h;
  }
  roadHeights.push(maxH);
}

const smoothedH = roadHeights.slice();
for (let pass = 0; pass < ROAD_SMOOTH_PASSES; pass++) {
  const copy = smoothedH.slice();
  const n = smoothedH.length;
  for (let i = 0; i < n; i++) {
    const a = copy[(i - 1 + n) % n];
    const b = copy[i];
    const c = copy[(i + 1) % n];
    smoothedH[i] = a * 0.25 + b * 0.5 + c * 0.25;
  }
}

const roadVertices = [];
const roadIndices = [];
for (let i = 0; i < ROAD_SEGMENTS; i++) {
  const c = centers[i];
  const pp = perps[i];
  const y = smoothedH[i] + ROAD_RAISE;
  roadVertices.push(c.x + pp.x * halfRoad, y, c.z + pp.z * halfRoad);
  roadVertices.push(c.x - pp.x * halfRoad, y, c.z - pp.z * halfRoad);
}
for (let i = 0; i < ROAD_SEGMENTS; i++) {
  const next = (i + 1) % ROAD_SEGMENTS;
  const a = i * 2, b = i * 2 + 1;
  const c = next * 2, d = next * 2 + 1;
  roadIndices.push(a, b, c);
  roadIndices.push(b, d, c);
}
const roadGeo = new THREE.BufferGeometry();
roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadVertices, 3));
roadGeo.setIndex(roadIndices);
roadGeo.computeVertexNormals();

const road = new THREE.Mesh(
  roadGeo,
  new THREE.MeshStandardMaterial({
    color: 0x333333, roughness: 0.9, side: THREE.DoubleSide,
  })
);
road.receiveShadow = true;
scene.add(road);

const TRACK_RES = 400;
const trackPolyline = [];
for (let i = 0; i < TRACK_RES; i++) {
  trackPolyline.push(curve.getPointAt(i / TRACK_RES));
}

function nearestOnTrack(x, z) {
  let best = Infinity, px = 0, pz = 0;
  for (let i = 0; i < TRACK_RES; i++) {
    const a = trackPolyline[i];
    const b = trackPolyline[(i + 1) % TRACK_RES];
    const abx = b.x - a.x, abz = b.z - a.z;
    const apx = x - a.x, apz = z - a.z;
    const abLenSq = abx * abx + abz * abz;
    let t = abLenSq > 0 ? (apx * abx + apz * abz) / abLenSq : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = a.x + abx * t, cz = a.z + abz * t;
    const dx = x - cx, dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < best) { best = d2; px = cx; pz = cz; }
  }
  return { x: px, z: pz, dist: Math.sqrt(best) };
}

function getSurfaceHeight(x, z) {
  const n = nearestOnTrack(x, z);
  const roadHalf = ROAD_WIDTH / 2;
  const blend = 3;

  let bestIdx = 0;
  let bestD2 = Infinity;
  for (let i = 0; i < centers.length; i++) {
    const dx = x - centers[i].x;
    const dz = z - centers[i].z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) { bestD2 = d2; bestIdx = i; }
  }
  const roadH = smoothedH[bestIdx] + ROAD_RAISE;
  const terrainH = getHeight(x, z);

  if (n.dist <= roadHalf) return roadH;
  if (n.dist >= roadHalf + blend) return terrainH;

  const t = (n.dist - roadHalf) / blend;
  return roadH * (1 - t) + terrainH * t;
}

// ===================
// 6. Реестры
// ===================
const staticObjects = [];
const dynamicObjects = [];
const occupiedZones = [];

const lampFlickers = [];
const swayers = [];

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

function findFreeSpot(getPos, radius, padding = 0.5, attempts = 30) {
  for (let i = 0; i < attempts; i++) {
    const p = getPos();
    if (!overlapsOccupied(p.x, p.z, radius, padding)) return p;
  }
  return null;
}

// ===================
// 7. Генераторы позиций
// ===================
function randomOffTrackPos(minR, maxR, margin) {
  for (let tries = 0; tries < 100; tries++) {
    const ang = Math.random() * Math.PI * 2;
    const r = minR + Math.random() * (maxR - minR);
    const x = Math.cos(ang) * r;
    const z = Math.sin(ang) * r;
    if (nearestOnTrack(x, z).dist > ROAD_WIDTH / 2 + margin) return { x, z };
  }
  return { x: 80, z: 80 };
}

function randomOnTrackPos(offsetFrac = 0.4) {
  const t = Math.random();
  const p = curve.getPointAt(t);
  const tan = curve.getTangentAt(t);
  const perp = new THREE.Vector3(tan.z, 0, -tan.x).normalize();
  const off = (Math.random() - 0.5) * ROAD_WIDTH * offsetFrac;
  return { x: p.x + perp.x * off, z: p.z + perp.z * off };
}

function alongTrackPos(offsetFromCenter, useOutward = true) {
  const t = Math.random();
  const p = curve.getPointAt(t);
  const tan = curve.getTangentAt(t);
  const perp = new THREE.Vector3(tan.z, 0, -tan.x).normalize();
  const toPoint = new THREE.Vector3(p.x, 0, p.z).normalize();
  let side = perp.dot(toPoint) > 0 ? 1 : -1;
  if (!useOutward) side = -side;
  return {
    x: p.x + perp.x * offsetFromCenter * side,
    z: p.z + perp.z * offsetFromCenter * side,
  };
}

// ===================
// 8. Загрузка моделей
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
      node.receiveShadow = true;
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
// 9. Фабрики объектов
// ===================

function makeCrate(x, z) {
  const y = getHeight(x, z);
  if (y < WATER_LEVEL + 0.5) return;

  const g = new THREE.Group();
  const size = 2;
  const geo = new THREE.BoxGeometry(size, size, size);
  const box = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color: 0x9c6a3a, roughness: 0.85 })
  );
  box.position.y = size / 2;
  box.castShadow = true;
  box.receiveShadow = true;
  g.add(box);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: 0x3a1f08 })
  );
  edges.position.y = size / 2;
  g.add(edges);

  g.position.set(x, y, z);
  scene.add(g);
  dynamicObjects.push({ mesh: g, radius: 1.0, vx: 0, vz: 0, wasColliding: false });
  registerZone(x, z, 1.0);
}

function makeCone(x, z) {
  const y = getHeight(x, z);
  if (y < WATER_LEVEL + 0.5) return;

  const g = new THREE.Group();

  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.4, 0.9, 12),
    new THREE.MeshStandardMaterial({
      color: 0xff5500,
      emissive: 0x441100,
      emissiveIntensity: 0.4,
    })
  );
  cone.position.y = 0.5;
  cone.castShadow = true;
  g.add(cone);

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.08, 0.8),
    new THREE.MeshStandardMaterial({ color: 0x222222 })
  );
  base.position.y = 0.04;
  base.castShadow = true;
  g.add(base);

  g.position.set(x, y, z);
  scene.add(g);
  dynamicObjects.push({ mesh: g, radius: 0.4, vx: 0, vz: 0, wasColliding: false });
  registerZone(x, z, 0.4);
}

function makeBush(x, z) {
  const y = getHeight(x, z);
  if (y < WATER_LEVEL + 0.5) return;

  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x3d7a2e });
  const s1 = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), mat);
  s1.position.y = 0.55; s1.castShadow = true; g.add(s1);
  const s2 = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), mat);
  s2.position.set(0.45, 0.4, 0.15); s2.castShadow = true; g.add(s2);
  const s3 = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), mat);
  s3.position.set(-0.35, 0.45, 0.3); s3.castShadow = true; g.add(s3);

  g.position.set(x, y, z);
  scene.add(g);
  registerZone(x, z, 0.7);

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

function makeLamp(x, z) {
  const y = getHeight(x, z);
  if (y < WATER_LEVEL + 0.5) return;

  const g = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.15, 5.5, 8),
    new THREE.MeshStandardMaterial({ color: 0x2a2a2a })
  );
  pole.position.y = 2.75;
  pole.castShadow = true;
  g.add(pole);

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.35, 0.7),
    new THREE.MeshStandardMaterial({
      color: 0xffe070,
      emissive: 0xffcc44,
      emissiveIntensity: 1.8,
    })
  );
  head.position.y = 5.6;
  head.castShadow = true;
  g.add(head);

  const lampLight = new THREE.PointLight(0xffcc66, 0.6, 30, 1.2);
  lampLight.position.y = 5.4;
  g.add(lampLight);

  g.position.set(x, y, z);
  scene.add(g);
  staticObjects.push({ x, z, radius: 0.3 });
  registerZone(x, z, 0.3);

  lampFlickers.push({
    light: lampLight,
    headMaterial: head.material,
    baseIntensity: 0.6,
    baseEmissive: 1.8,
    phase: Math.random() * Math.PI * 2,
  });
}

function makeTree(x, z) {
  const y = getHeight(x, z);
  if (y < WATER_LEVEL + 0.5) return;

  const g = new THREE.Group();
  const model = createModelInstance('tree');

  if (model) {
    scaleModelToSize(model, 8);
    g.add(model);
  } else {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.4, 2.8, 8),
      new THREE.MeshStandardMaterial({ color: 0x5a3a1a })
    );
    trunk.position.y = 1.4;
    trunk.castShadow = true;
    g.add(trunk);

    const fol = new THREE.Mesh(
      new THREE.ConeGeometry(1.6, 3.2, 8),
      new THREE.MeshStandardMaterial({ color: 0x24582a })
    );
    fol.position.y = 4.2;
    fol.castShadow = true;
    g.add(fol);
  }

  g.position.set(x, y, z);
  scene.add(g);
  staticObjects.push({ x, z, radius: 1.4 });
  registerZone(x, z, 1.4);

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
  if (y < WATER_LEVEL + 0.5) return;

  const g = new THREE.Group();
  const model = createModelInstance('rock');

  if (model) {
    scaleModelToSize(model, size * 3);
    model.rotation.y = Math.random() * Math.PI * 2;
    g.add(model);
  } else {
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(size, 0),
      new THREE.MeshStandardMaterial({ color: 0x7a7060, flatShading: true })
    );
    rock.position.y = size * 0.6;
    rock.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    rock.castShadow = true;
    rock.receiveShadow = true;
    g.add(rock);
  }

  g.position.set(x, y, z);
  scene.add(g);
  staticObjects.push({ x, z, radius: size * 0.75 });
  registerZone(x, z, size * 0.75);
}

function makeHouse(x, z) {
  const y = getHeight(x, z);
  if (y < WATER_LEVEL + 0.5) return;

  const g = new THREE.Group();
  const model = createModelInstance('house', { uniqueMaterials: true });

  if (model) {
    scaleModelToSize(model, 12);
    g.add(model);
  } else {
    const w = 4 + Math.random() * 3;
    const d = 4 + Math.random() * 3;
    const h = 4 + Math.random() * 6;

    const walls = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(
          0.08 + Math.random() * 0.06, 0.35, 0.6 + Math.random() * 0.15
        ),
      })
    );
    walls.position.y = h / 2;
    walls.castShadow = true;
    walls.receiveShadow = true;
    g.add(walls);

    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(w, d) * 0.8, 2.5, 4),
      new THREE.MeshStandardMaterial({ color: 0x7a2a1a })
    );
    roof.position.y = h + 1.2;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    g.add(roof);

    const win = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 1.1, 0.1),
      new THREE.MeshStandardMaterial({
        color: 0x88ccff,
        emissive: 0xffcc66,
        emissiveIntensity: 2.5,
      })
    );
    win.position.set(w / 2 + 0.05, h * 0.6, 0);
    win.rotation.y = Math.PI / 2;
    g.add(win);
  }

  g.position.set(x, y, z);
  g.rotation.y = Math.random() * Math.PI * 2;
  scene.add(g);

  const radius = 3.5;
  staticObjects.push({ x, z, radius });
  registerZone(x, z, 4);
}

function makeGrassPatch(x, z, radius) {
  const y = getHeight(x, z);
  if (y < WATER_LEVEL + 0.2) return;

  const m = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 16),
    new THREE.MeshStandardMaterial({ color: 0x2f7a35 })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y + 0.05, z);
  scene.add(m);
  registerZone(x, z, radius);
}

// ===================
// 10. Пыль
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
  dustPositions[i * 3]     = 9999;
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
  blending: THREE.NormalBlending,
  uniforms: {},
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
      gl_PointSize = aSize * (400.0 / -mvPos.z);
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

  dustPositions[i * 3]     = x + (Math.random() - 0.5) * 1.5;
  dustPositions[i * 3 + 1] = y + 0.15 + Math.random() * 0.2;
  dustPositions[i * 3 + 2] = z + (Math.random() - 0.5) * 1.5;

  const upSpeed = 0.8 + Math.random() * 1.2;
  dustVelocities[i * 3]     = (Math.random() - 0.5) * 1.5 + (drift?.x || 0);
  dustVelocities[i * 3 + 1] = upSpeed;
  dustVelocities[i * 3 + 2] = (Math.random() - 0.5) * 1.5 + (drift?.z || 0);

  dustMaxLife[i] = 0.5 + Math.random() * 0.5;
  dustLife[i] = 1.0;

  dustMaxSizes[i] = 3.0 + Math.random() * 2.5;
  dustSizes[i] = 0.6 + Math.random() * 0.5;
  dustAlphas[i] = 0.75;

  const shade = 0.75 + Math.random() * 0.15;
  dustColors[i * 3]     = 0.78 * shade;
  dustColors[i * 3 + 1] = 0.70 * shade;
  dustColors[i * 3 + 2] = 0.58 * shade;
}

function updateDust(dt) {
  for (let i = 0; i < DUST_COUNT; i++) {
    if (dustLife[i] <= 0) continue;

    dustLife[i] -= dt / dustMaxLife[i];

    if (dustLife[i] <= 0) {
      dustPositions[i * 3]     = 9999;
      dustPositions[i * 3 + 1] = 9999;
      dustPositions[i * 3 + 2] = 9999;
      dustAlphas[i] = 0;
      dustSizes[i] = 0;
      continue;
    }

    const t = 1 - dustLife[i];

    dustPositions[i * 3]     += dustVelocities[i * 3]     * dt;
    dustPositions[i * 3 + 1] += dustVelocities[i * 3 + 1] * dt;
    dustPositions[i * 3 + 2] += dustVelocities[i * 3 + 2] * dt;

    const gravity = 2.5 * (1 - t * 0.7);
    dustVelocities[i * 3 + 1] -= gravity * dt;

    const drag = Math.pow(0.05, dt);
    dustVelocities[i * 3]     *= drag;
    dustVelocities[i * 3 + 1] *= drag;
    dustVelocities[i * 3 + 2] *= drag;

    dustSizes[i] = (0.6 + Math.random() * 0.5) + (dustMaxSizes[i] - 0.6) * t;

    if (t < 0.15) {
      dustAlphas[i] = 0.75 * (t / 0.15);
    } else {
      dustAlphas[i] = 0.75 * (1 - (t - 0.15) / 0.85);
    }
  }

  dustGeo.attributes.position.needsUpdate = true;
  dustGeo.attributes.aSize.needsUpdate = true;
  dustGeo.attributes.aAlpha.needsUpdate = true;
  dustGeo.attributes.aColor.needsUpdate = true;
}

// ===================
// 11. Машина
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
    console.log('🚗 Используется 3D-модель машины');
  } else {
    console.log('🚗 Используется примитив машины');
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

      const mark = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 0.15, 0.35),
        new THREE.MeshStandardMaterial({ color: 0xffd700 })
      );
      mark.position.set(0.42, 0, 0);
      wheel.add(mark);

      car.add(pivot);
      wheels.push(wheel);
    }
    createWheel(1, 0.9);
    createWheel(1, -0.9);
    createWheel(-1, 0.9);
    createWheel(-1, -0.9);
  }
}

// ===================
// 12. Звук
// ===================
const listener = new THREE.AudioListener();
camera.add(listener);
const audioLoader = new THREE.AudioLoader();
const SOUND_BASE = import.meta.env.BASE_URL + 'sounds/';

console.log('🔊 Путь к звукам:', SOUND_BASE);

const engineSound = new THREE.PositionalAudio(listener);
engineSound.setRefDistance(4);
engineSound.setRolloffFactor(1.2);
engineSound.setLoop(true);
engineSound.setVolume(0.6);
let engineBufferReady = false;
audioLoader.load(
  SOUND_BASE + 'engine.mp3',
  (b) => {
    engineSound.setBuffer(b);
    engineBufferReady = true;
    console.log('✅ Звук двигателя загружен');
    if (audioStarted) engineSound.play();
  },
  undefined,
  (err) => console.error('❌ Ошибка загрузки engine.mp3:', err)
);
car.add(engineSound);

const HIT_POOL_SIZE = 10;
const hitPool = [];
for (let i = 0; i < HIT_POOL_SIZE; i++) {
  const hit = new THREE.PositionalAudio(listener);
  hit.setRefDistance(6);
  hit.setRolloffFactor(1.0);
  hit.setVolume(0.9);
  audioLoader.load(
    SOUND_BASE + 'hit.mp3',
    (b) => hit.setBuffer(b),
    undefined,
    (err) => console.error('❌ Ошибка загрузки hit.mp3:', err)
  );
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
  onloaderror: (id, err) => console.error('❌ Ошибка загрузки музыки:', err),
  onload: () => console.log('✅ Фоновая музыка загружена'),
});

let audioStarted = false;
function startAudioOnce() {
  if (audioStarted) return;
  audioStarted = true;
  console.log('🔊 Запуск звука...');
  if (listener.context.state === 'suspended') {
    listener.context.resume();
  }
  if (engineBufferReady) engineSound.play();
  bgMusic.play();
}

window.addEventListener('touchstart', startAudioOnce, { once: true, passive: true });
window.addEventListener('click', startAudioOnce, { once: true });
window.addEventListener('keydown', startAudioOnce, { once: true });

// ===================
// 13. Клавиатура
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
// 13b. КАСТОМНЫЙ ТАЧ-ДЖОЙСТИК
// ===================
let joystickForward = 0;
let joystickTurn = 0;

const isTouchDevice =
  ('ontouchstart' in window) ||
  (navigator.maxTouchPoints > 0) ||
  (navigator.msMaxTouchPoints > 0);

if (isTouchDevice) {
  // Создаём визуальные элементы
  const stickBase = document.createElement('div');
  stickBase.style.cssText = `
    position: fixed;
    width: 100px;
    height: 100px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.25);
    border: 2px solid rgba(255, 255, 255, 0.4);
    display: none;
    pointer-events: none;
    z-index: 60;
    transform: translate(-50%, -50%);
    backdrop-filter: blur(2px);
  `;
  document.body.appendChild(stickBase);

  const stickThumb = document.createElement('div');
  stickThumb.style.cssText = `
    position: fixed;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.55);
    border: 2px solid rgba(255, 255, 255, 0.6);
    display: none;
    pointer-events: none;
    z-index: 61;
    transform: translate(-50%, -50%);
  `;
  document.body.appendChild(stickThumb);

  const MAX_DIST = 50;
  let touchId = null;
  let startX = 0;
  let startY = 0;

  function onTouchStart(e) {
    if (touchId !== null) return;
    const touch = e.changedTouches[0];
    touchId = touch.identifier;
    startX = touch.clientX;
    startY = touch.clientY;

    stickBase.style.left = startX + 'px';
    stickBase.style.top = startY + 'px';
    stickThumb.style.left = startX + 'px';
    stickThumb.style.top = startY + 'px';
    stickBase.style.display = 'block';
    stickThumb.style.display = 'block';

    hideHint();
    startAudioOnce();
  }

  function onTouchMove(e) {
    if (touchId === null) return;
    for (const touch of e.changedTouches) {
      if (touch.identifier !== touchId) continue;

      let dx = touch.clientX - startX;
      let dy = touch.clientY - startY;
      const dist = Math.hypot(dx, dy);

      if (dist > MAX_DIST) {
        dx = (dx / dist) * MAX_DIST;
        dy = (dy / dist) * MAX_DIST;
      }

      stickThumb.style.left = (startX + dx) + 'px';
      stickThumb.style.top = (startY + dy) + 'px';

      // dx/MAX_DIST: -1..1 (вправо положительно)
      // dy/MAX_DIST: -1..1 (вниз положительно)
      joystickTurn = dx / MAX_DIST;
      joystickForward = -dy / MAX_DIST;  // вверх = вперёд
    }
  }

  function onTouchEnd(e) {
    if (touchId === null) return;
    for (const touch of e.changedTouches) {
      if (touch.identifier !== touchId) continue;
      touchId = null;
      joystickForward = 0;
      joystickTurn = 0;
      stickBase.style.display = 'none';
      stickThumb.style.display = 'none';
    }
  }

  document.addEventListener('touchstart', onTouchStart, { passive: true });
  document.addEventListener('touchmove', onTouchMove, { passive: true });
  document.addEventListener('touchend', onTouchEnd, { passive: true });
  document.addEventListener('touchcancel', onTouchEnd, { passive: true });

  console.log('🕹️ Тач-джойстик активирован');
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
// 14. Параметры движения
// ===================
const MAX_SPEED = 28;
const ACCELERATION = 14;
const BRAKE = 30;
const FRICTION = 6;
const TURN_SPEED = 1.6;
let speed = 0;
let prevSpeed = 0;
let smoothTurn = 0;

// ===================
// 15. Post-processing
// ===================
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

let bloomPass = null;
if (!isTouchDevice) {
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(innerWidth, innerHeight),
    0.45,
    0.6,
    0.7
  );
  composer.addPass(bloomPass);
}

composer.addPass(new OutputPass());

// ===================
// 16. Физика
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
// 17. Анимация
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

  for (const f of lampFlickers) {
    const flick = 0.85 + Math.sin(timeSec * 7 + f.phase) * 0.1
                + Math.sin(timeSec * 13 + f.phase * 1.7) * 0.05;
    f.light.intensity = f.baseIntensity * flick;
    f.headMaterial.emissiveIntensity = f.baseEmissive * flick;
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

  waterUniforms.uTime.value = timeSec;

  composer.render();
}

// ===================
// 18. Точка входа
// ===================
async function start() {
  await loadAllModels();

  buildCar();

  const startP = curve.getPointAt(0);
  const startT = curve.getTangentAt(0);
  car.position.set(startP.x, getHeight(startP.x, startP.z) + 0.2, startP.z);
  car.rotation.y = Math.atan2(startT.x, startT.z);
  scene.add(car);

  for (let i = 0; i < 12; i++) {
    const spot = findFreeSpot(() => randomOnTrackPos(0.6), 1.0, 1.5);
    if (spot) makeCrate(spot.x, spot.z);
  }
  for (let i = 0; i < 15; i++) {
    const spot = findFreeSpot(() => randomOnTrackPos(0.7), 0.4, 1.0);
    if (spot) makeCone(spot.x, spot.z);
  }
  for (let i = 0; i < 12; i++) {
    const spot = findFreeSpot(
      () => alongTrackPos(ROAD_WIDTH / 2 + 1.5 + Math.random() * 2, true),
      0.7, 1.0
    );
    if (spot) makeBush(spot.x, spot.z);
  }
  for (let i = 0; i < 10; i++) {
    const t = i / 10;
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    const perp = new THREE.Vector3(tan.z, 0, -tan.x).normalize();
    const toPoint = new THREE.Vector3(p.x, 0, p.z).normalize();
    const out = perp.dot(toPoint) > 0 ? perp : perp.clone().negate();
    const dist = ROAD_WIDTH / 2 + 1.5;
    makeLamp(p.x + out.x * dist, p.z + out.z * dist);
  }
  for (let i = 0; i < 8; i++) {
    const spot = findFreeSpot(
      () => alongTrackPos(ROAD_WIDTH / 2 + 10 + Math.random() * 6, true),
      7, 4
    );
    if (spot) makeHouse(spot.x, spot.z);
  }
  for (let i = 0; i < 15; i++) {
    const spot = findFreeSpot(() => randomOffTrackPos(30, 90, 3), 3, 4);
    if (spot) makeTree(spot.x, spot.z);
  }
  for (let i = 0; i < 14; i++) {
    const spot = findFreeSpot(
      () => {
        const p = randomOffTrackPos(25, 100, 3);
        return { x: p.x, z: p.z };
      },
      3, 2
    );
    if (spot) makeRock(spot.x, spot.z, 1.5 + Math.random() * 2.5);
  }
  for (let i = 0; i < 20; i++) {
    const spot = findFreeSpot(
      () => {
        const p = randomOffTrackPos(20, 110, 4);
        return { x: p.x, z: p.z };
      },
      3, 0.5, 10
    );
    if (spot) makeGrassPatch(spot.x, spot.z, 2 + Math.random() * 3);
  }

  animate();
}

start();

// ===================
// 19. Resize
// ===================
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  if (bloomPass) bloomPass.setSize(innerWidth, innerHeight);
});