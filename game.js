import * as THREE from 'three';

const canvas = document.getElementById('game');
const hud = document.getElementById('hud');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1220);
scene.fog = new THREE.Fog(0x0a1220, 20, 110);

const camera = new THREE.PerspectiveCamera(65, canvas.width / canvas.height, 0.1, 200);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(canvas.width, canvas.height, false);
renderer.shadowMap.enabled = true;

const hemi = new THREE.HemisphereLight(0x9fb7ff, 0x121212, 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(8, 16, 6);
sun.castShadow = true;
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(120, 120),
  new THREE.MeshStandardMaterial({ color: 0x22334a, roughness: 0.9, metalness: 0.05 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(120, 60, 0x4b5f88, 0x334562);
scene.add(grid);

const player = new THREE.Group();
const body = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.45, 0.8, 5, 8),
  new THREE.MeshStandardMaterial({ color: 0x31d6f5, roughness: 0.45 })
);
body.castShadow = true;
body.position.y = 0.9;
player.add(body);

const sword = new THREE.Mesh(
  new THREE.BoxGeometry(0.1, 0.1, 0.9),
  new THREE.MeshStandardMaterial({ color: 0xe5e7eb })
);
sword.position.set(0.32, 0.9, 0.2);
player.add(sword);
scene.add(player);

const enemy = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.5, 1.0, 6, 10),
  new THREE.MeshStandardMaterial({ color: 0xfb7185, roughness: 0.6 })
);
enemy.position.set(0, 1, -7);
enemy.castShadow = true;
scene.add(enemy);

const attackArc = new THREE.Mesh(
  new THREE.TorusGeometry(1.4, 0.05, 8, 32, Math.PI * 0.9),
  new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
);
attackArc.visible = false;
attackArc.rotation.x = Math.PI / 2;
scene.add(attackArc);

const keys = new Set();
let chargeStart = null;
let mouseOrbit = false;
let mouseAim = false;

const viewModes = ['classic', 'fortnite'];
const cameraModeConfig = {
  classic: { dist: 6.6, eyeHeight: 2.2, sideOffset: 0, lookHeight: 1.2 },
  fortnite: { dist: 3.8, eyeHeight: 1.45, sideOffset: 1.2, lookHeight: 1.4 },
};

const state = {
  pos: new THREE.Vector3(0, 0, 4),
  velY: 0,
  speed: 7.5,
  dashSpeed: 22,
  dashTime: 0,
  dashCooldown: 0,
  stamina: 100,
  attackTime: 0,
  attackPower: 0,
  yaw: Math.PI,
  cameraYaw: Math.PI,
  cameraPitch: 0.38,
  enemyHp: 100,
  enemyHitLock: 0,
  viewMode: 'classic',
  camPos: new THREE.Vector3(0, 4.5, 8),
};

function lerpAngle(current, target, alpha) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * alpha;
}

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  keys.add(k);

  if (k === 'v') {
    const idx = viewModes.indexOf(state.viewMode);
    state.viewMode = viewModes[(idx + 1) % viewModes.length];
  }

  if (e.code === 'Space') {
    e.preventDefault();
    if (state.pos.y <= 0.001) state.velY = 7.8;
  }
  if (e.key === 'Shift' && state.dashCooldown <= 0 && state.stamina >= 20) {
    state.dashTime = 0.16;
    state.dashCooldown = 0.6;
    state.stamina -= 20;
  }
  if (k === 'j' && state.attackTime <= 0 && state.stamina >= 12) {
    state.attackTime = 0.2;
    state.attackPower = 1;
    state.stamina -= 12;
    tryHitEnemy(1);
  }
  if (k === 'k' && chargeStart === null) chargeStart = performance.now();
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.key.toLowerCase());
  if (e.key.toLowerCase() === 'k' && chargeStart !== null && state.attackTime <= 0) {
    const held = Math.min((performance.now() - chargeStart) / 1000, 1.8);
    const power = Math.max(1.2, Math.min(3.2, 1.2 + held * 1.2));
    if (state.stamina >= 26) {
      state.attackTime = 0.38;
      state.attackPower = power;
      state.stamina -= 26;
      tryHitEnemy(power);
    }
    chargeStart = null;
  }
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0) {
    mouseAim = true;
    canvas.style.cursor = 'grabbing';
  }
  if (e.button === 2) mouseOrbit = true;
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) {
    mouseAim = false;
    canvas.style.cursor = 'default';
  }
  if (e.button === 2) mouseOrbit = false;
});
window.addEventListener('mousemove', (e) => {
  if (!mouseOrbit && !mouseAim) return;
  const sensitivity = mouseAim ? 0.0045 : 0.005;
  state.cameraYaw -= e.movementX * sensitivity;
  state.cameraPitch = THREE.MathUtils.clamp(state.cameraPitch - e.movementY * 0.004, 0.12, 1.05);
});

function tryHitEnemy(power) {
  if (state.enemyHitLock > 0 || state.enemyHp <= 0) return;
  const toEnemy = new THREE.Vector3().subVectors(enemy.position, state.pos);
  const dist = toEnemy.length();
  if (dist > 3.2) return;
  const forward = new THREE.Vector3(Math.sin(state.yaw), 0, Math.cos(state.yaw)).normalize();
  const angle = forward.angleTo(toEnemy.setY(0).normalize());
  if (angle > 0.9) return;

  const dmg = Math.round(12 * power);
  state.enemyHp = Math.max(0, state.enemyHp - dmg);
  state.enemyHitLock = 0.12;
  enemy.material.color.set(state.enemyHp > 0 ? 0xf97393 : 0x6b7280);
}

let prev = performance.now();
function tick(now) {
  const dt = Math.min((now - prev) / 1000, 0.033);
  prev = now;
  update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

function update(dt) {
  let ix = 0;
  let iz = 0;
  if (keys.has('z') || keys.has('w')) iz -= 1;
  if (keys.has('s')) iz += 1;
  if (keys.has('q') || keys.has('a')) ix -= 1;
  if (keys.has('d')) ix += 1;

  const input = new THREE.Vector3(ix, 0, iz);
  let desiredYaw = state.yaw;

  if (input.lengthSq() > 0) {
    input.normalize();
    const yawMatrix = new THREE.Matrix4().makeRotationY(state.cameraYaw);
    input.applyMatrix4(yawMatrix);

    desiredYaw = mouseAim ? state.cameraYaw : Math.atan2(input.x, input.z);

    const currentSpeed = state.dashTime > 0 ? state.dashSpeed : state.speed;
    state.pos.x += input.x * currentSpeed * dt;
    state.pos.z += input.z * currentSpeed * dt;
  } else if (mouseAim) {
    desiredYaw = state.cameraYaw;
  }

  state.yaw = lerpAngle(state.yaw, desiredYaw, mouseAim ? 0.25 : 0.18);

  state.dashTime = Math.max(0, state.dashTime - dt);
  state.dashCooldown = Math.max(0, state.dashCooldown - dt);
  state.attackTime = Math.max(0, state.attackTime - dt);
  state.enemyHitLock = Math.max(0, state.enemyHitLock - dt);

  state.velY -= 19 * dt;
  state.pos.y += state.velY * dt;
  if (state.pos.y < 0) {
    state.pos.y = 0;
    state.velY = 0;
  }

  state.pos.x = THREE.MathUtils.clamp(state.pos.x, -24, 24);
  state.pos.z = THREE.MathUtils.clamp(state.pos.z, -24, 24);
  state.stamina = Math.min(100, state.stamina + (state.attackTime > 0 ? 10 : 18) * dt);

  player.position.copy(state.pos);
  player.rotation.y = state.yaw;

  sword.rotation.x = state.attackTime > 0 ? -1.1 : 0;
  sword.rotation.y = state.attackTime > 0 ? 0.25 : 0;

  attackArc.visible = state.attackTime > 0;
  if (attackArc.visible) {
    attackArc.position.copy(state.pos).add(new THREE.Vector3(Math.sin(state.yaw) * 1.2, 1.0, Math.cos(state.yaw) * 1.2));
    attackArc.rotation.z = state.yaw;
    attackArc.material.color.set(state.attackPower > 1.2 ? 0xfb7185 : 0xfbbf24);
  }

  const mode = cameraModeConfig[state.viewMode];
  const back = new THREE.Vector3(
    Math.sin(state.cameraYaw) * mode.dist * Math.cos(state.cameraPitch),
    Math.sin(state.cameraPitch) * mode.dist + mode.eyeHeight,
    Math.cos(state.cameraYaw) * mode.dist * Math.cos(state.cameraPitch)
  );

  const right = new THREE.Vector3(
    Math.sin(state.cameraYaw + Math.PI / 2),
    0,
    Math.cos(state.cameraYaw + Math.PI / 2)
  ).multiplyScalar(mode.sideOffset);

  const targetCamPos = new THREE.Vector3().copy(state.pos).add(back).add(right);
  state.camPos.lerp(targetCamPos, 0.12);
  camera.position.copy(state.camPos);

  const lookTarget = new THREE.Vector3().copy(state.pos).add(new THREE.Vector3(0, mode.lookHeight, 0));
  if (state.viewMode === 'fortnite') {
    lookTarget.add(right.clone().multiplyScalar(0.45));
  }
  camera.lookAt(lookTarget);

  const hold = chargeStart ? ((performance.now() - chargeStart) / 1000).toFixed(2) : '0.00';
  const aim = mouseAim ? 'ON' : 'OFF';
  hud.textContent = `View ${state.viewMode.toUpperCase()} (V) | Aim Drag ${aim} (Hold Left Click) | Stamina ${state.stamina.toFixed(0)} | Dash CD ${state.dashCooldown.toFixed(2)} | Enemy HP ${state.enemyHp} | Charge ${hold}s`;
}

window.addEventListener('resize', () => {
  const width = canvas.clientWidth;
  const height = width * 9 / 16;
  canvas.width = width;
  canvas.height = height;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
});
