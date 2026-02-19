import * as THREE from 'three';

const canvas = document.getElementById('game');
const hud = document.getElementById('hud');
const menuOverlay = document.getElementById('menu-overlay');
const menuTitle = document.getElementById('menu-title');
const menuSubtitle = document.getElementById('menu-subtitle');
const menuActions = document.getElementById('menu-actions');

const menuDefinitions = {
  welcome: {
    title: 'SOULLIKE',
    subtitle: 'A dark mage rises. Begin your journey.',
    actions: [{ label: 'Enter Dashboard', next: 'dashboard', primary: true }],
  },
  dashboard: {
    title: 'Dashboard',
    subtitle: 'Choose your next action.',
    actions: [
      { label: 'Fight a boss', next: 'boss-select', primary: true },
      { label: 'Parameters', next: 'parameters' },
      { label: 'Inventory', next: 'inventory' },
      { label: 'Back to Title', next: 'welcome' },
    ],
  },
  'boss-select': {
    title: 'Fight a Boss',
    subtitle: 'Only one encounter is available right now.',
    actions: [
      { label: 'Current Fight Scene', next: 'fight', primary: true },
      { label: 'Back', next: 'dashboard' },
    ],
  },
  parameters: {
    title: 'Parameters',
    subtitle: 'Configuration scene placeholder.',
    actions: [{ label: 'Back', next: 'dashboard', primary: true }],
  },
  inventory: {
    title: 'Inventory',
    subtitle: 'Inventory scene placeholder.',
    actions: [{ label: 'Back', next: 'dashboard', primary: true }],
  },
};

let currentScene = 'welcome';

function releasePointerLock() {
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}

function clearCombatInputs() {
  keys.clear();
  mouseOrbit = false;
  mouseAttackHold = false;
  state.isChargingShot = false;
  chargeStart = null;
}

function changeScene(nextScene) {
  currentScene = nextScene;
  const def = menuDefinitions[nextScene];

  if (nextScene === 'fight') {
    menuOverlay.classList.add('hidden');
    hud.style.display = 'block';
    return;
  }

  releasePointerLock();
  clearCombatInputs();
  menuOverlay.classList.remove('hidden');
  hud.style.display = 'none';
  menuTitle.textContent = def.title;
  menuSubtitle.textContent = def.subtitle;
  menuActions.innerHTML = '';

  def.actions.forEach((action) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = action.primary ? 'menu-btn primary' : 'menu-btn';
    button.textContent = action.label;
    button.addEventListener('click', () => changeScene(action.next));
    menuActions.appendChild(button);
  });
}

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

const robe = new THREE.Mesh(
  new THREE.CylinderGeometry(0.28, 0.52, 1.2, 12),
  new THREE.MeshStandardMaterial({ color: 0x4338ca, roughness: 0.72 })
);
robe.castShadow = true;
robe.position.y = 0.75;
player.add(robe);

const chest = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.26, 0.36, 4, 8),
  new THREE.MeshStandardMaterial({ color: 0x6366f1, roughness: 0.5 })
);
chest.castShadow = true;
chest.position.y = 1.25;
player.add(chest);

const head = new THREE.Mesh(
  new THREE.SphereGeometry(0.2, 14, 12),
  new THREE.MeshStandardMaterial({ color: 0xf1c27d, roughness: 0.7 })
);
head.castShadow = true;
head.position.y = 1.67;
player.add(head);

const hatBrim = new THREE.Mesh(
  new THREE.CylinderGeometry(0.34, 0.34, 0.035, 20),
  new THREE.MeshStandardMaterial({ color: 0x1e1b4b, roughness: 0.6 })
);
hatBrim.castShadow = true;
hatBrim.position.y = 1.84;
player.add(hatBrim);

const hatCone = new THREE.Mesh(
  new THREE.ConeGeometry(0.22, 0.55, 16),
  new THREE.MeshStandardMaterial({ color: 0x312e81, roughness: 0.62 })
);
hatCone.castShadow = true;
hatCone.position.y = 2.1;
hatCone.rotation.z = -0.09;
player.add(hatCone);

const sleeveL = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.1, 0.36, 4, 6),
  new THREE.MeshStandardMaterial({ color: 0x4f46e5, roughness: 0.58 })
);
sleeveL.castShadow = true;
sleeveL.position.set(-0.33, 1.22, 0.04);
sleeveL.rotation.z = 0.45;
player.add(sleeveL);

const sleeveR = sleeveL.clone();
sleeveR.position.x = 0.33;
sleeveR.rotation.z = -0.45;
player.add(sleeveR);

const firestaff = new THREE.Group();
const staffShaft = new THREE.Mesh(
  new THREE.CylinderGeometry(0.045, 0.06, 1.15, 10),
  new THREE.MeshStandardMaterial({ color: 0x6b4f3a, roughness: 0.72 })
);
staffShaft.rotation.z = 0.2;
firestaff.add(staffShaft);

const staffCore = new THREE.Mesh(
  new THREE.SphereGeometry(0.12, 12, 10),
  new THREE.MeshStandardMaterial({ color: 0xfb923c, emissive: 0xea580c, emissiveIntensity: 0.85 })
);
staffCore.position.set(0, 0.58, 0);
firestaff.add(staffCore);

firestaff.position.set(0.45, 1.18, 0.1);
firestaff.rotation.z = 0.4;
player.add(firestaff);
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
  new THREE.MeshBasicMaterial({ color: 0xf97316 })
);
attackArc.visible = false;
attackArc.rotation.x = Math.PI / 2;
scene.add(attackArc);

const keys = new Set();
let chargeStart = null;
let mouseOrbit = false;
let mouseAttackHold = false;
const fireballs = [];

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
  dashBinding: 'key:shift',
  isRebindingDash: false,
  pointerLocked: false,
  stamina: 100,
  attackTime: 0,
  attackPower: 0,
  isChargingShot: false,
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

function normalizeKey(event) {
  if (event.key === ' ') return 'space';
  return event.key.toLowerCase();
}

function keyBinding(key) {
  return `key:${key}`;
}

function mouseBinding(button) {
  return `mouse:${button}`;
}

function keyLabel(key) {
  if (key === ' ') return 'Space';
  if (key === 'space') return 'Space';
  return key.length === 1 ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1);
}

function mouseButtonLabel(button) {
  const labels = { 0: 'Mouse Left', 1: 'Mouse Middle', 2: 'Mouse Right', 3: 'Mouse Back', 4: 'Mouse Forward' };
  return labels[button] ?? `Mouse ${button}`;
}

function bindingLabel(binding) {
  if (binding.startsWith('key:')) return keyLabel(binding.slice(4));
  if (binding.startsWith('mouse:')) return mouseButtonLabel(Number(binding.slice(6)));
  return binding;
}

function getCameraGroundForward() {
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  if (forward.lengthSq() < 0.0001) return new THREE.Vector3(Math.sin(state.yaw), 0, Math.cos(state.yaw));
  return forward.normalize();
}

function activateDash() {
  if (state.dashCooldown <= 0 && state.stamina >= 20) {
    state.dashTime = 0.16;
    state.dashCooldown = 0.6;
    state.stamina -= 20;
  }
}

function applyEnemyDamage(amount) {
  if (state.enemyHitLock > 0 || state.enemyHp <= 0) return;
  state.enemyHp = Math.max(0, state.enemyHp - amount);
  state.enemyHitLock = 0.08;
  enemy.material.color.set(state.enemyHp > 0 ? 0xf97393 : 0x6b7280);
}

function spawnFireball(power) {
  const forward = getCameraGroundForward();
  const spawn = new THREE.Vector3().copy(state.pos).add(new THREE.Vector3(0, 1.12, 0)).add(forward.clone().multiplyScalar(1.05));
  const radius = THREE.MathUtils.lerp(0.16, 0.45, Math.min((power - 1) / 2.2, 1));
  const speed = 16 + power * 6;

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 18, 14),
    new THREE.MeshStandardMaterial({
      color: power > 1.3 ? 0xfb7185 : 0xfb923c,
      emissive: 0xea580c,
      emissiveIntensity: 1.2,
      roughness: 0.3,
      metalness: 0.05,
    })
  );
  mesh.position.copy(spawn);
  mesh.castShadow = true;
  scene.add(mesh);

  fireballs.push({ mesh, velocity: forward.multiplyScalar(speed), radius, life: 2.4, damage: Math.round(12 * power) });

  state.attackTime = power > 1.25 ? 0.42 : 0.24;
  state.attackPower = power;
}

function releaseFireShot() {
  if (chargeStart === null) return;
  const held = Math.min((performance.now() - chargeStart) / 1000, 1.8);
  const charged = held >= 0.28;
  const cost = charged ? 26 : 12;

  if (state.stamina >= cost) {
    state.stamina -= cost;
    const power = charged ? Math.max(1.3, Math.min(3.2, 1.3 + held * 1.2)) : 1;
    spawnFireball(power);
  }

  chargeStart = null;
  state.isChargingShot = false;
  mouseAttackHold = false;
}

window.addEventListener('keydown', (e) => {
  const k = normalizeKey(e);

  if (currentScene !== 'fight') return;

  if (state.isRebindingDash) {
    e.preventDefault();
    if (k !== 'escape') state.dashBinding = keyBinding(k);
    state.isRebindingDash = false;
    return;
  }

  keys.add(k);

  if (k === 'b') {
    state.isRebindingDash = true;
    return;
  }

  if (k === 'm') {
    changeScene('dashboard');
    return;
  }

  if (k === 'v') {
    const idx = viewModes.indexOf(state.viewMode);
    state.viewMode = viewModes[(idx + 1) % viewModes.length];
  }

  if (e.code === 'Space') {
    e.preventDefault();
    if (state.pos.y <= 0.001) state.velY = 7.8;
  }

  if (state.dashBinding === keyBinding(k)) activateDash();
});

window.addEventListener('keyup', (e) => {
  if (currentScene !== 'fight') return;
  keys.delete(normalizeKey(e));
});

document.addEventListener('pointerlockchange', () => {
  state.pointerLocked = document.pointerLockElement === canvas;
  canvas.classList.toggle('cursor-locked', state.pointerLocked);
  if (!state.pointerLocked) mouseOrbit = false;
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('mousedown', (e) => {
  if (currentScene !== 'fight') return;

  if (state.isRebindingDash) {
    e.preventDefault();
    state.dashBinding = mouseBinding(e.button);
    state.isRebindingDash = false;
    return;
  }

  if (document.pointerLockElement !== canvas) canvas.requestPointerLock();

  if (state.dashBinding === mouseBinding(e.button)) activateDash();

  if (e.button === 2) {
    mouseOrbit = true;
    return;
  }

  if (e.button === 0 && chargeStart === null) {
    chargeStart = performance.now();
    state.isChargingShot = true;
    mouseAttackHold = true;
  }
});

window.addEventListener('mouseup', (e) => {
  if (currentScene !== 'fight') return;
  if (e.button === 2) mouseOrbit = false;
  if (e.button === 0 && mouseAttackHold) releaseFireShot();
});

window.addEventListener('mousemove', (e) => {
  if (currentScene !== 'fight') return;
  if (!state.pointerLocked && !mouseOrbit) return;
  const sensitivity = 0.005;
  const verticalSense = 0.004;
  state.cameraYaw -= e.movementX * sensitivity;
  state.cameraPitch = THREE.MathUtils.clamp(state.cameraPitch + e.movementY * verticalSense, 0.12, 1.05);
});

function updateFireballs(dt) {
  for (let i = fireballs.length - 1; i >= 0; i -= 1) {
    const ball = fireballs[i];
    ball.life -= dt;
    ball.mesh.position.addScaledVector(ball.velocity, dt);

    const toEnemy = new THREE.Vector3().subVectors(enemy.position, ball.mesh.position);
    const hitRadius = ball.radius + 0.78;
    const hitEnemy = state.enemyHp > 0 && toEnemy.length() <= hitRadius;

    if (hitEnemy) {
      applyEnemyDamage(ball.damage);
      ball.life = 0;
    }

    if (ball.life <= 0) {
      scene.remove(ball.mesh);
      ball.mesh.geometry.dispose();
      ball.mesh.material.dispose();
      fireballs.splice(i, 1);
    }
  }
}

let prev = performance.now();
function tick(now) {
  const dt = Math.min((now - prev) / 1000, 0.033);
  prev = now;
  if (currentScene === 'fight') update(dt);
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

    desiredYaw = Math.atan2(input.x, input.z);

    const currentSpeed = state.dashTime > 0 ? state.dashSpeed : state.speed;
    state.pos.x += input.x * currentSpeed * dt;
    state.pos.z += input.z * currentSpeed * dt;
  } else if (state.isChargingShot) {
    const cameraForward = getCameraGroundForward();
    desiredYaw = Math.atan2(cameraForward.x, cameraForward.z);
  }

  state.yaw = lerpAngle(state.yaw, desiredYaw, state.isChargingShot ? 0.24 : 0.18);

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

  firestaff.rotation.x = state.attackTime > 0 ? -0.75 : 0;
  firestaff.rotation.y = state.attackTime > 0 ? 0.2 : 0;
  staffCore.material.emissiveIntensity = state.isChargingShot ? 1.8 : 0.85;

  attackArc.visible = state.attackTime > 0 || state.isChargingShot;
  if (attackArc.visible) {
    const cameraForward = getCameraGroundForward();
    attackArc.position.copy(state.pos).add(new THREE.Vector3(cameraForward.x * 1.05, 1.0, cameraForward.z * 1.05));
    attackArc.rotation.z = Math.atan2(cameraForward.x, cameraForward.z);
    attackArc.material.color.set(state.attackPower > 1.25 || state.isChargingShot ? 0xfb7185 : 0xf97316);
  }

  updateFireballs(dt);

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
  if (state.viewMode === 'fortnite') lookTarget.add(right.clone().multiplyScalar(0.45));
  camera.lookAt(lookTarget);

  const hold = chargeStart ? ((performance.now() - chargeStart) / 1000).toFixed(2) : '0.00';
  const lock = state.pointerLocked ? 'LOCKED' : 'CLICK CANVAS';
  const dashLabel = bindingLabel(state.dashBinding);
  const dashBindStatus = state.isRebindingDash ? 'PRESS A KEY OR MOUSE BUTTON...' : 'B TO REBIND';
  hud.textContent = `View ${state.viewMode.toUpperCase()} (V) | Mouse ${lock} | Camera Orbit Right Click | Attack Left Click (Hold/Release) | Dash ${dashLabel} (${dashBindStatus}) | Menu M | Charge ${hold}s | Stamina ${state.stamina.toFixed(0)} | Dash CD ${state.dashCooldown.toFixed(2)} | Enemy HP ${state.enemyHp}`;
}

window.addEventListener('resize', () => {
  const width = canvas.clientWidth;
  const height = (width * 9) / 16;
  canvas.width = width;
  canvas.height = height;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
});

changeScene('welcome');
