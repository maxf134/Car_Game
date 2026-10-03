import * as THREE from 'three';
import { Howl } from 'howler';
import './style.css';

// ---------------------------
// 1. Сцена
// ---------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

// ---------------------------
// 2. Камера
// ---------------------------
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(30, 20, 30);

// ---------------------------
// 3. Рендерер
// ---------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
document.getElementById('app').appendChild(renderer.domElement);

// ---------------------------
// 4. Свет
// ---------------------------
scene.add(new THREE.AmbientLight(0xffffff, 0.65));

const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(60, 80, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -120;
sun.shadow.camera.right = 120;
sun.shadow.camera.top = 120;
sun.shadow.camera.bottom = -120;
scene.add(sun);

// ---------------------------
// 5. Земля
// ---------------------------
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400),
  new THREE.MeshStandardMaterial({ color: 0x3cba54 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ---------------------------
// 6. Трасса
// ---------------------------
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
const trackLength = curve.getLength();

const ROAD_WIDTH = 9;
const SEGMENTS = 220;
const roadMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
const tileDepth = (trackLength / SEGMENTS) * 1.35;

for (let i = 0; i < SEGMENTS; i++) {
  const t = i / SEGMENTS;
  const pos = curve.getPointAt(t);
  const tan = curve.getTangentAt(t);
  const angle = Math.atan2(tan.x, tan.z);

  const tile = new THREE.Mesh(
    new THREE.BoxGeometry(ROAD_WIDTH, 0.05, tileDepth),
    roadMat
  );
  tile.position.set(pos.x, 0.02, pos.z);
  tile.rotation.y = angle;
  tile.receiveShadow = true;
  scene.add(tile);
}

function outwardAt(t) {
  const p = curve.getPointAt(t);
  const tan = curve.getTangentAt(t);
  const perp = new THREE.Vector3(tan.z, 0, -tan.x).normalize();
  const toPoint = new THREE.Vector3(p.x, 0, p.z).normalize();
  return perp.dot(toPoint) > 0 ? perp : perp.clone().negate();
}

// ---------------------------
// 7. Стрелки
// ---------------------------
const arrowShape = new THREE.Shape();
arrowShape.moveTo(0, 0.9);
arrowShape.lineTo(0.65, -0.25);
arrowShape.lineTo(0.25, -0.25);
arrowShape.lineTo(0.25, -0.9);
arrowShape.lineTo(-0.25, -0.9);
arrowShape.lineTo(-0.25, -0.25);
arrowShape.lineTo(-0.65, -0.25);
arrowShape.closePath();

const arrowGeo = new THREE.ShapeGeometry(arrowShape);
arrowGeo.rotateX(Math.PI / 2);

const arrowMat = new THREE.MeshBasicMaterial({
  color: 0xffee00,
  side: THREE.DoubleSide,
});

const ARROW_COUNT = 6;
for (let i = 0; i < ARROW_COUNT; i++) {
  const t = i / ARROW_COUNT;
  const pos = curve.getPointAt(t);
  const tan = curve.getTangentAt(t);
  const angle = Math.atan2(tan.x, tan.z);

  const arrow = new THREE.Mesh(arrowGeo, arrowMat);
  arrow.position.set(pos.x, 0.06, pos.z);
  arrow.rotation.y = angle;
  scene.add(arrow);
}

// ---------------------------
// 8. Забор (только снаружи)
// ---------------------------
const obstacles = [];
const FENCE_OFFSET = ROAD_WIDTH / 2 + 0.4;
const FENCE_HEIGHT = 1.4;
const FENCE_THICKNESS = 0.15;
const FENCE_PANELS = 200;

for (let i = 0; i < FENCE_PANELS; i++) {
  const t1 = i / FENCE_PANELS;
  const t2 = ((i + 1) % FENCE_PANELS) / FENCE_PANELS;

  const p1 = curve.getPointAt(t1);
  const p2 = curve.getPointAt(t2);
  const o1 = outwardAt(t1);
  const o2 = outwardAt(t2);

  const fp1 = new THREE.Vector3(
    p1.x + o1.x * FENCE_OFFSET,
    FENCE_HEIGHT / 2,
    p1.z + o1.z * FENCE_OFFSET
  );
  const fp2 = new THREE.Vector3(
    p2.x + o2.x * FENCE_OFFSET,
    FENCE_HEIGHT / 2,
    p2.z + o2.z * FENCE_OFFSET
  );

  const mid = fp1.clone().add(fp2).multiplyScalar(0.5);
  const len = fp1.distanceTo(fp2);
  const ang = Math.atan2(fp2.x - fp1.x, fp2.z - fp1.z);

  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(FENCE_THICKNESS, FENCE_HEIGHT, len),
    new THREE.MeshStandardMaterial({
      color: 0xf0f0f0,
      transparent: true,
      opacity: 1,
    })
  );
  panel.position.copy(mid);
  panel.rotation.y = ang;
  panel.castShadow = true;
  panel.receiveShadow = true;
  scene.add(panel);
  obstacles.push(panel);
}

// ---------------------------
// 9. Дома
// ---------------------------
const BUILDING_COUNT = 10;
for (let i = 0; i < BUILDING_COUNT; i++) {
  const t = (i + 0.5) / BUILDING_COUNT;
  const p = curve.getPointAt(t);
  const o = outwardAt(t);

  const dist = 22 + Math.random() * 6;
  const h = 8 + Math.random() * 16;
  const w = 5 + Math.random() * 3;
  const d = 5 + Math.random() * 3;

  const building = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(
        0.55 + Math.random() * 0.1,
        0.18,
        0.45 + Math.random() * 0.25
      ),
      transparent: true,
      opacity: 1,
    })
  );
  building.position.set(p.x + o.x * dist, h / 2, p.z + o.z * dist);
  building.rotation.y = Math.random() * Math.PI;
  building.castShadow = true;
  building.receiveShadow = true;
  scene.add(building);
  obstacles.push(building);
}

// ---------------------------
// 10. Машинка
// ---------------------------
const car = new THREE.Group();

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

const wheels = [];
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
  mark.castShadow = true;
  wheel.add(mark);

  car.add(pivot);
  wheels.push(wheel);
}
createWheel(1, 0.9);
createWheel(1, -0.9);
createWheel(-1, 0.9);
createWheel(-1, -0.9);

const startPos = curve.getPointAt(0);
const startTan = curve.getTangentAt(0);
car.position.copy(startPos);
car.rotation.y = Math.atan2(startTan.x, startTan.z);
scene.add(car);

// ==========================================================
// 11. ЗВУК — 3D через PositionalAudio + музыка через Howler
// ==========================================================

// Слушатель — «уши» камеры. От него считается расстояние до источников.
const listener = new THREE.AudioListener();
camera.add(listener);

const audioLoader = new THREE.AudioLoader();

// --- Звук двигателя. Привязан к машине, едет вместе с ней. ---
const engineSound = new THREE.PositionalAudio(listener);
engineSound.setRefDistance(4);       // расстояние, где звук «нормальной» громкости
engineSound.setRolloffFactor(1.6);   // как быстро глохнет с расстоянием
engineSound.setLoop(true);
engineSound.setVolume(0.6);
audioLoader.load(import.meta.env.BASE_URL + 'sounds/engine.mp3',
  (buffer) => engineSound.setBuffer(buffer));
car.add(engineSound);

// --- Звук удара. Пул из 6 объектов, чтобы можно было играть несколько подряд. ---
const HIT_POOL_SIZE = 6;
const hitPool = [];
for (let i = 0; i < HIT_POOL_SIZE; i++) {
  const hit = new THREE.PositionalAudio(listener);
  hit.setRefDistance(6);
  hit.setRolloffFactor(1.2);
  hit.setVolume(0.9);import.meta.env.BASE_URL + 'sounds/hit.mp3',
  hit.setVolume(0.9);
  audioLoader.load(import.meta.env.BASE_URL + 'sounds/hit.mp3',
  (buffer) => hit.setBuffer(buffer));
  scene.add(hit);
  hitPool.push(hit);
}
let hitIndex = 0;

function playHitAt(x, y, z) {
  const hit = hitPool[hitIndex];
  hit.position.set(x, y, z);
  if (hit.isPlaying) hit.stop();
  if (hit.buffer) hit.play();
  hitIndex = (hitIndex + 1) % hitPool.length;
}

// --- Фоновая музыка через Howler (не 3D, играет «в голове») ---
const bgMusic = new Howl({
   src: [import.meta.env.BASE_URL + 'sounds/background.mp3'],
  loop: true,
  volume: 0.1,
  preload: true,
  format: ['mp3'],
  onload: () => console.log('Музыка загружена'),
  onloaderror: (id, err) => console.error('Ошибка загрузки музыки:', err),
  onplayerror: (id, err) => {
    console.error('Ошибка воспроизведения музыки:', err);
    // Пробуем возобновить воспроизведение после разблокировки
    bgMusic.once('unlock', () => bgMusic.play());
  },
});

// Запускаем звук только после первого действия пользователя —
// браузеры блокируют автовоспроизведение.
let audioStarted = false;
function startAudioOnce() {
  if (audioStarted) return;
  audioStarted = true;
  if (engineSound.buffer) engineSound.play();
  bgMusic.play();
}

// ---------------------------
// 12. Кубики на трассе
// ---------------------------
const cubes = [];
for (let i = 0; i < 18; i++) {
  const t = 0.05 + Math.random() * 0.9;
  const p = curve.getPointAt(t);
  const tan = curve.getTangentAt(t);
  const perp = new THREE.Vector3(tan.z, 0, -tan.x).normalize();
  const offset = (Math.random() - 0.5) * (ROAD_WIDTH - 2.5);

  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: Math.random() * 0xffffff })
  );
  cube.position.set(p.x + perp.x * offset, 0.5, p.z + perp.z * offset);
  cube.castShadow = true;
  cube.receiveShadow = true;
  cube.userData.velX = 0;
  cube.userData.velZ = 0;
  scene.add(cube);
  cubes.push(cube);
}

// ---------------------------
// 13. Ввод
// ---------------------------
const keys = { w: false, a: false, s: false, d: false };
const codeMap = {
  KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd',
  ArrowUp: 'w', ArrowLeft: 'a', ArrowDown: 's', ArrowRight: 'd',
};
window.addEventListener('keydown', (e) => {
  const k = codeMap[e.code];
  if (k) {
    keys[k] = true;
    e.preventDefault();
    hideHint();
    startAudioOnce();
  }
});
window.addEventListener('keyup', (e) => {
  const k = codeMap[e.code];
  if (k) { keys[k] = false; e.preventDefault(); }
});

// ---------------------------
// 14. Подсказка
// ---------------------------
const hint = document.getElementById('hint');
let hintHidden = false;
function hideHint() {
  if (hintHidden || !hint) return;
  hintHidden = true;
  hint.classList.add('hidden');
  setTimeout(() => hint.remove(), 700);
}

// ---------------------------
// 15. Параметры движения
// ---------------------------
const MAX_SPEED = 28;
const ACCELERATION = 14;
const BRAKE = 30;
const FRICTION = 6;
const TURN_SPEED = 1.6;

let speed = 0;

const CAR_RADIUS = 1.6;
const CUBE_RADIUS = 0.7;

// ---------------------------
// 16. Геометрия коллизий с забором
// ---------------------------
const TRACK_COLLISION_RES = 400;
const trackPolyline = [];
for (let i = 0; i < TRACK_COLLISION_RES; i++) {
  trackPolyline.push(curve.getPointAt(i / TRACK_COLLISION_RES));
}

const FENCE_INNER = FENCE_OFFSET - FENCE_THICKNESS / 2;
const CAR_HALF_DIAGONAL = Math.hypot(1.5, 0.8);
const CUBE_HALF_DIAGONAL = Math.hypot(0.5, 0.5);

const MAX_DIST_CAR  = FENCE_INNER - CAR_HALF_DIAGONAL - 0.02;
const MAX_DIST_CUBE = FENCE_INNER - CUBE_HALF_DIAGONAL - 0.02;

function nearestOnTrack(x, z) {
  let bestDistSq = Infinity;
  let projX = 0, projZ = 0, tanX = 0, tanZ = 0;

  for (let i = 0; i < TRACK_COLLISION_RES; i++) {
    const a = trackPolyline[i];
    const b = trackPolyline[(i + 1) % TRACK_COLLISION_RES];

    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const apx = x - a.x;
    const apz = z - a.z;

    const abLenSq = abx * abx + abz * abz;
    let t = abLenSq > 0 ? (apx * abx + apz * abz) / abLenSq : 0;
    t = Math.max(0, Math.min(1, t));

    const cx = a.x + abx * t;
    const cz = a.z + abz * t;
    const dx = x - cx;
    const dz = z - cz;
    const dsq = dx * dx + dz * dz;

    if (dsq < bestDistSq) {
      bestDistSq = dsq;
      projX = cx;
      projZ = cz;
      tanX = abx;
      tanZ = abz;
    }
  }

  const dist = Math.sqrt(bestDistSq);
  const tLen = Math.hypot(tanX, tanZ) || 1;

  let perpX = tanZ / tLen;
  let perpZ = -tanX / tLen;
  if (perpX * projX + perpZ * projZ < 0) {
    perpX = -perpX;
    perpZ = -perpZ;
  }

  return { projX, projZ, perpX, perpZ, dist };
}

function constrainCarToFence(pos) {
  const { projX, projZ, perpX, perpZ, dist } = nearestOnTrack(pos.x, pos.z);
  if (dist < 1e-4) return false;

  const dx = pos.x - projX;
  const dz = pos.z - projZ;
  const outwardDot = dx * perpX + dz * perpZ;

  if (outwardDot <= 0) return false;
  if (dist <= MAX_DIST_CAR) return false;

  pos.x = projX + perpX * MAX_DIST_CAR;
  pos.z = projZ + perpZ * MAX_DIST_CAR;
  return true;
}

function constrainCubeToFence(cube) {
  const { projX, projZ, perpX, perpZ, dist } = nearestOnTrack(
    cube.position.x,
    cube.position.z
  );
  if (dist < 1e-4) return;

  const dx = cube.position.x - projX;
  const dz = cube.position.z - projZ;
  const outwardDot = dx * perpX + dz * perpZ;

  if (outwardDot <= 0) return;
  if (dist <= MAX_DIST_CUBE) return;

  cube.position.x = projX + perpX * MAX_DIST_CUBE;
  cube.position.z = projZ + perpZ * MAX_DIST_CUBE;

  const vDotN = cube.userData.velX * perpX + cube.userData.velZ * perpZ;
  if (vDotN > 0) {
    const e = 0.6;
    cube.userData.velX -= (1 + e) * vDotN * perpX;
    cube.userData.velZ -= (1 + e) * vDotN * perpZ;
  }
}

// ---------------------------
// 17. Raycast для прозрачности
// ---------------------------
const raycaster = new THREE.Raycaster();
const camToCar = new THREE.Vector3();

// ---------------------------
// 18. Анимация
// ---------------------------
const clock = new THREE.Clock();
const forward = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  // Разгон / торможение
  if (keys.w) speed += ACCELERATION * dt;
  else if (keys.s) speed -= BRAKE * dt;
  else {
    if (speed > 0) speed = Math.max(0, speed - FRICTION * dt);
    else if (speed < 0) speed = Math.min(0, speed + FRICTION * dt);
  }
  speed = THREE.MathUtils.clamp(speed, -MAX_SPEED, MAX_SPEED);

  // Поворот
  const turnFactor = Math.min(Math.abs(speed) / 3, 1);
  if (keys.a) car.rotation.y += TURN_SPEED * dt * turnFactor;
  if (keys.d) car.rotation.y -= TURN_SPEED * dt * turnFactor;

  // Движение
  forward.set(1, 0, 0).applyQuaternion(car.quaternion);
  car.position.addScaledVector(forward, speed * dt);

  constrainCarToFence(car.position);

  // Колёса
  wheels.forEach((w) => { w.rotation.y -= speed * dt * 3; });

  // Кубики
  for (const c of cubes) {
    const dx = c.position.x - car.position.x;
    const dz = c.position.z - car.position.z;
    const dist = Math.hypot(dx, dz);
    const minDist = CAR_RADIUS + CUBE_RADIUS;

    if (dist < minDist && dist > 0.0001) {
      const nx = dx / dist;
      const nz = dz / dist;
      c.position.x = car.position.x + nx * minDist;
      c.position.z = car.position.z + nz * minDist;

      const kick = Math.max(Math.abs(speed), 3);
      c.userData.velX = nx * kick * 1.5;
      c.userData.velZ = nz * kick * 1.5;
      speed *= 0.9;

      // ЗВУК УДАРА — 3D, играем из точки столкновения
      playHitAt(c.position.x, 0.5, c.position.z);
    }

    if (c.userData.velX !== 0 || c.userData.velZ !== 0) {
      c.position.x += c.userData.velX * dt;
      c.position.z += c.userData.velZ * dt;

      const decay = Math.pow(0.3, dt);
      c.userData.velX *= decay;
      c.userData.velZ *= decay;
      if (Math.abs(c.userData.velX) < 0.02) c.userData.velX = 0;
      if (Math.abs(c.userData.velZ) < 0.02) c.userData.velZ = 0;
    }

    constrainCubeToFence(c);
  }

  // Камера
  const cameraOffset = new THREE.Vector3(16, 16, 16);
  const desiredPos = cameraOffset.clone().add(car.position);
  camera.position.lerp(desiredPos, 1 - Math.pow(0.001, dt));
  camera.lookAt(car.position);

  // Звук двигателя — меняем тон в зависимости от скорости
  if (engineSound.isPlaying) {
    const speedRatio = Math.abs(speed) / MAX_SPEED;
    engineSound.setPlaybackRate(0.8 + speedRatio * 0.7);
    engineSound.setVolume(0.45 + speedRatio * 0.7);
  }

  // Автопрозрачность
  camToCar.subVectors(car.position, camera.position);
  const camDist = camToCar.length();
  camToCar.normalize();
  raycaster.set(camera.position, camToCar);
  raycaster.far = camDist - 1.5;

  for (const o of obstacles) o.material.opacity = 1;
  const hits = raycaster.intersectObjects(obstacles, false);
  for (const hit of hits) hit.object.material.opacity = 0.25;

  renderer.render(scene, camera);
}
animate();

// ---------------------------
// 19. Resize
// ---------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
