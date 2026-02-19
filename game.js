import * as THREE from 'three';
import { GLTFLoader } from 'GLTFLoader';

const canvas = document.getElementById('game');
const hud = document.getElementById('hud');
const menuOverlay = document.getElementById('menu-overlay');
const menuTitle = document.getElementById('menu-title');
const menuSubtitle = document.getElementById('menu-subtitle');
const menuActions = document.getElementById('menu-actions');

const menuDefinitions = {
  welcome: {
    title: 'SOULLIKE',
    subtitle: 'Ascend from ember to legend.',
    actions: [{ label: 'Enter Dashboard', next: 'dashboard', primary: true }],
  },
  dashboard: {
    title: 'Dashboard',
    subtitle: 'Choose your path.',
    actions: [
      { label: 'Fight a boss', next: 'boss-select', primary: true },
      { label: 'Parameters', next: 'parameters' },
      { label: 'Inventory', next: 'inventory' },
      { label: 'Back to Title', next: 'welcome' },
    ],
  },
  'boss-select': {
    title: 'Fight a Boss',
    subtitle: 'Only one encounter is available.',
    actions: [
      { label: 'Current Fight Scene', next: 'fight', primary: true },
      { label: 'Back', next: 'dashboard' },
    ],
  },
  parameters: {
    title: 'Parameters',
    subtitle: 'Settings scene placeholder.',
    actions: [{ label: 'Back', next: 'dashboard', primary: true }],
  },
  inventory: {
    title: 'Inventory',
    subtitle: 'Inventory scene placeholder.',
    actions: [{ label: 'Back', next: 'dashboard', primary: true }],
  },
};

let currentScene = 'welcome';
let characterMixer = null;
let characterModelLoaded = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070d1a);
scene.fog = new THREE.Fog(0x070d1a, 24, 130);

const camera = new THREE.PerspectiveCamera(65, canvas.width / canvas.height, 0.1, 220);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(canvas.width, canvas.height, false);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.03;

const hemi = new THREE.HemisphereLight(0x8eb9ff, 0x0f1218, 0.85);
scene.add(hemi);
const moon = new THREE.DirectionalLight(0xdbeafe, 1.25);
moon.position.set(10, 20, 8);
moon.castShadow = true;
scene.add(moon);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(180, 180),
  new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.9, metalness: 0.02 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(160, 80, 0x334155, 0x1f2937);
grid.material.opacity = 0.32;
grid.material.transparent = true;
scene.add(grid);

const platform = new THREE.Mesh(
  new THREE.CylinderGeometry(9, 10, 0.28, 60),
  new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.55, metalness: 0.16, emissive: 0x1d4ed8, emissiveIntensity: 0.1 })
);
platform.position.y = 0.14;
platform.receiveShadow = true;
scene.add(platform);

const player = new THREE.Group();
const characterVisualRoot = new THREE.Group();
player.add(characterVisualRoot);

const coat = new THREE.Mesh(
  new THREE.CylinderGeometry(0.28, 0.62, 1.35, 14),
  new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.68, metalness: 0.08 })
);
coat.position.y = 0.86;
coat.castShadow = true;
characterVisualRoot.add(coat);

const chest = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.3, 0.4, 5, 8),
  new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.5, metalness: 0.18 })
);
chest.position.y = 1.34;
chest.castShadow = true;
characterVisualRoot.add(chest);

const mantle = new THREE.Mesh(
  new THREE.TorusGeometry(0.35, 0.06, 12, 20),
  new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.42, metalness: 0.28, emissive: 0x1d4ed8, emissiveIntensity: 0.22 })
);
mantle.position.y = 1.5;
mantle.rotation.x = Math.PI / 2;
characterVisualRoot.add(mantle);

const head = new THREE.Mesh(
  new THREE.SphereGeometry(0.2, 18, 14),
  new THREE.MeshStandardMaterial({ color: 0xe5c39d, roughness: 0.72 })
);
head.position.y = 1.75;
head.castShadow = true;
characterVisualRoot.add(head);

const helmRing = new THREE.Mesh(
  new THREE.TorusGeometry(0.26, 0.03, 12, 26),
  new THREE.MeshStandardMaterial({ color: 0x60a5fa, emissive: 0x1d4ed8, emissiveIntensity: 0.45 })
);
helmRing.position.y = 2.0;
helmRing.rotation.x = Math.PI / 2;
characterVisualRoot.add(helmRing);

const crown = new THREE.Mesh(
  new THREE.ConeGeometry(0.24, 0.6, 18),
  new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.55, metalness: 0.22 })
);
crown.position.y = 2.22;
crown.rotation.z = -0.1;
crown.castShadow = true;
characterVisualRoot.add(crown);

const shoulderL = new THREE.Mesh(
  new THREE.SphereGeometry(0.12, 12, 10),
  new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.5, metalness: 0.25 })
);
shoulderL.position.set(-0.32, 1.45, 0.03);
characterVisualRoot.add(shoulderL);

const shoulderR = shoulderL.clone();
shoulderR.position.x = 0.32;
characterVisualRoot.add(shoulderR);

const firestaff = new THREE.Group();
const staffShaft = new THREE.Mesh(
  new THREE.CylinderGeometry(0.045, 0.06, 1.3, 12),
  new THREE.MeshStandardMaterial({ color: 0x4b3b2b, roughness: 0.75 })
);
staffShaft.rotation.z = 0.28;
firestaff.add(staffShaft);

const staffGuard = new THREE.Mesh(
  new THREE.TorusGeometry(0.11, 0.02, 10, 20),
  new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xb45309, emissiveIntensity: 0.5 })
);
staffGuard.position.y = 0.55;
staffGuard.rotation.x = Math.PI / 2;
firestaff.add(staffGuard);

const staffCore = new THREE.Mesh(
  new THREE.SphereGeometry(0.13, 14, 12),
  new THREE.MeshStandardMaterial({ color: 0xfb923c, emissive: 0xea580c, emissiveIntensity: 0.9 })
);
staffCore.position.y = 0.62;
firestaff.add(staffCore);

firestaff.position.set(0.46, 1.24, 0.08);
firestaff.rotation.z = 0.48;
characterVisualRoot.add(firestaff);

function loadHeroModel() {
  const loader = new GLTFLoader();
  loader.load(
    '/models/hero.glb',
    (gltf) => {
      const modelRoot = new THREE.Group();
      modelRoot.name = 'hero-model-root';
      modelRoot.add(gltf.scene);
      modelRoot.scale.setScalar(1.05);
      modelRoot.position.y = 0;
      modelRoot.rotation.y = Math.PI;

      gltf.scene.traverse((obj) => {
        if (!obj.isMesh) return;
        obj.castShadow = true;
        obj.receiveShadow = true;
      });

      characterVisualRoot.visible = false;
      player.add(modelRoot);
      characterModelLoaded = true;

      if (gltf.animations && gltf.animations.length > 0) {
        characterMixer = new THREE.AnimationMixer(gltf.scene);
        const idle = characterMixer.clipAction(gltf.animations[0]);
        idle.play();
      }
    },
    undefined,
    () => {
      characterModelLoaded = false;
      characterVisualRoot.visible = true;
    }
  );
}

loadHeroModel();
scene.add(player);

const enemy = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.55, 1.2, 7, 12),
  new THREE.MeshStandardMaterial({ color: 0xfb7185, roughness: 0.6 })
);
enemy.position.set(0, 1.1, -9);
enemy.castShadow = true;
scene.add(enemy);

const attackArc = new THREE.Mesh(
  new THREE.TorusGeometry(1.5, 0.06, 12, 30, Math.PI * 0.9),
  new THREE.MeshBasicMaterial({ color: 0xf97316 })
);
attackArc.visible = false;
attackArc.rotation.x = Math.PI / 2;
scene.add(attackArc);

const keys = new Set();
let chargeStart = null;
let mouseOrbit = false;
let mouseAttackHold = false;
let dashTrailTimer = 0;

const fireballs = [];
const cameraKick = new THREE.Vector2(0, 0);

const viewModes = ['classic', 'fortnite'];
const cameraModeConfig = {
  classic: { dist: 7.2, eyeHeight: 2.3, sideOffset: 0, lookHeight: 1.2 },
  fortnite: { dist: 4.0, eyeHeight: 1.55, sideOffset: 1.25, lookHeight: 1.4 },
};

const state = {
  pos: new THREE.Vector3(0, 0, 4),
  vel: new THREE.Vector3(0, 0, 0),
  velY: 0,
  baseSpeed: 8.3,
  accel: 42,
  drag: 19,
  airControl: 0.45,
  dashSpeed: 28,
  dashTime: 0,
  dashCooldown: 0,
  dashBinding: 'key:shift',
  isRebindingDash: false,
  pointerLocked: false,
  stamina: 100,
  attackTime: 0,
  attackPower: 0,
  attackRecover: 0,
  isChargingShot: false,
  yaw: Math.PI,
  cameraYaw: Math.PI,
  cameraPitch: 0.36,
  enemyHp: 100,
  enemyHitLock: 0,
  viewMode: 'classic',
  camPos: new THREE.Vector3(0, 4.5, 8),
};

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

function applyCameraKick(strength) {
  cameraKick.x += (Math.random() - 0.5) * strength * 0.8;
  cameraKick.y += strength;
}

function activateDash() {
  if (state.dashCooldown <= 0 && state.stamina >= 18) {
    state.dashTime = 0.17;
    state.dashCooldown = 0.52;
    state.stamina -= 18;
    dashTrailTimer = 0.12;
    const forward = getCameraGroundForward();
    state.vel.x = forward.x * state.dashSpeed;
    state.vel.z = forward.z * state.dashSpeed;
    state.yaw = Math.atan2(forward.x, forward.z);
    applyCameraKick(0.01);
  }
}

function applyEnemyDamage(amount) {
  if (state.enemyHitLock > 0 || state.enemyHp <= 0) return;
  state.enemyHp = Math.max(0, state.enemyHp - amount);
  state.enemyHitLock = 0.07;
  enemy.material.color.set(state.enemyHp > 0 ? 0xfb7185 : 0x6b7280);
  enemy.scale.set(1.06, 1.0, 1.06);
}

function spawnFireball(power) {
  const forward = getCameraGroundForward();
  const spawn = new THREE.Vector3().copy(state.pos).add(new THREE.Vector3(0, 1.15, 0)).add(forward.clone().multiplyScalar(1.0));
  const radius = THREE.MathUtils.lerp(0.16, 0.48, Math.min((power - 1) / 2.2, 1));
  const speed = 18 + power * 7;

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 20, 16),
    new THREE.MeshStandardMaterial({
      color: power > 1.3 ? 0xfb7185 : 0xfb923c,
      emissive: 0xea580c,
      emissiveIntensity: 1.4,
      roughness: 0.26,
      metalness: 0.06,
    })
  );
  mesh.position.copy(spawn);
  mesh.castShadow = true;
  scene.add(mesh);

  fireballs.push({
    mesh,
    velocity: forward.multiplyScalar(speed),
    radius,
    life: 2.0,
    damage: Math.round(11 + 10 * power),
    pulse: Math.random() * 3,
  });

  state.attackTime = power > 1.25 ? 0.48 : 0.26;
  state.attackPower = power;
  state.attackRecover = power > 1.25 ? 0.14 : 0.08;
  applyCameraKick(power > 1.25 ? 0.016 : 0.008);
}

function releaseFireShot() {
  if (chargeStart === null || state.attackRecover > 0) return;
  const held = Math.min((performance.now() - chargeStart) / 1000, 1.8);
  const charged = held >= 0.32;
  const cost = charged ? 24 : 10;

  if (state.stamina >= cost) {
    state.stamina -= cost;
    const power = charged ? Math.max(1.4, Math.min(3.2, 1.3 + held * 1.2)) : 1;
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
    if (state.pos.y <= 0.001) state.velY = 8.2;
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
  const sensitivity = 0.0045;
  const verticalSense = 0.0038;
  state.cameraYaw -= e.movementX * sensitivity;
  state.cameraPitch = THREE.MathUtils.clamp(state.cameraPitch + e.movementY * verticalSense, 0.1, 1.05);
});

function updateFireballs(dt, now) {
  for (let i = fireballs.length - 1; i >= 0; i -= 1) {
    const ball = fireballs[i];
    ball.life -= dt;
    ball.pulse += dt * 10;
    ball.mesh.position.addScaledVector(ball.velocity, dt);
    const pulseScale = 1 + Math.sin(ball.pulse) * 0.05;
    ball.mesh.scale.setScalar(pulseScale);

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

  if (dashTrailTimer > 0) {
    dashTrailTimer = Math.max(0, dashTrailTimer - dt);
    if (Math.floor(now * 120) % 2 === 0) {
      const echo = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.36, 1.0, 4, 6),
        new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.28 })
      );
      echo.position.copy(state.pos).add(new THREE.Vector3(0, 0.92, 0));
      echo.rotation.y = state.yaw;
      scene.add(echo);
      setTimeout(() => {
        scene.remove(echo);
        echo.geometry.dispose();
        echo.material.dispose();
      }, 80);
    }
  }
}

let prev = performance.now();
function tick(now) {
  const dt = Math.min((now - prev) / 1000, 0.033);
  prev = now;

  if (currentScene === 'fight') update(dt, now / 1000);
  if (characterMixer) characterMixer.update(dt);

  cameraKick.multiplyScalar(Math.pow(0.001, dt));
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

function update(dt, now) {
  let ix = 0;
  let iz = 0;
  if (keys.has('z') || keys.has('w')) iz -= 1;
  if (keys.has('s')) iz += 1;
  if (keys.has('q') || keys.has('a')) ix -= 1;
  if (keys.has('d')) ix += 1;

  const moveInput = new THREE.Vector3(ix, 0, iz);
  if (moveInput.lengthSq() > 0) {
    moveInput.normalize();
    moveInput.applyAxisAngle(new THREE.Vector3(0, 1, 0), state.cameraYaw);
  }

  const grounded = state.pos.y <= 0.001;
  const accel = state.accel * (grounded ? 1 : state.airControl);
  const targetSpeed = state.baseSpeed * (state.dashTime > 0 ? 1.45 : 1);

  const targetVelX = moveInput.x * targetSpeed;
  const targetVelZ = moveInput.z * targetSpeed;

  state.vel.x = THREE.MathUtils.damp(state.vel.x, targetVelX, accel, dt);
  state.vel.z = THREE.MathUtils.damp(state.vel.z, targetVelZ, accel, dt);

  if (moveInput.lengthSq() === 0 && state.dashTime <= 0) {
    state.vel.x = THREE.MathUtils.damp(state.vel.x, 0, state.drag, dt);
    state.vel.z = THREE.MathUtils.damp(state.vel.z, 0, state.drag, dt);
  }

  state.pos.x += state.vel.x * dt;
  state.pos.z += state.vel.z * dt;

  let desiredYaw = state.yaw;
  if (moveInput.lengthSq() > 0) desiredYaw = Math.atan2(moveInput.x, moveInput.z);
  else if (state.isChargingShot) {
    const cameraForward = getCameraGroundForward();
    desiredYaw = Math.atan2(cameraForward.x, cameraForward.z);
  }

  const turnSpeed = state.dashTime > 0 ? 0.26 : state.isChargingShot ? 0.22 : 0.16;
  state.yaw = lerpAngle(state.yaw, desiredYaw, turnSpeed);

  state.dashTime = Math.max(0, state.dashTime - dt);
  state.dashCooldown = Math.max(0, state.dashCooldown - dt);
  state.attackTime = Math.max(0, state.attackTime - dt);
  state.attackRecover = Math.max(0, state.attackRecover - dt);
  state.enemyHitLock = Math.max(0, state.enemyHitLock - dt);

  state.velY -= 20 * dt;
  state.pos.y += state.velY * dt;
  if (state.pos.y < 0) {
    state.pos.y = 0;
    state.velY = 0;
  }

  state.pos.x = THREE.MathUtils.clamp(state.pos.x, -30, 30);
  state.pos.z = THREE.MathUtils.clamp(state.pos.z, -30, 30);
  state.stamina = Math.min(100, state.stamina + (state.attackTime > 0 ? 10 : 20) * dt);

  player.position.copy(state.pos);
  player.rotation.y = state.yaw;
  const stride = Math.min(1, new THREE.Vector2(state.vel.x, state.vel.z).length() / state.baseSpeed);
  coat.rotation.z = Math.sin(now * 12) * 0.03 * stride;
  mantle.material.emissiveIntensity = state.isChargingShot ? 0.55 : 0.22;

  firestaff.rotation.x = state.attackTime > 0 ? -0.86 : -0.12 + Math.sin(now * 4) * 0.05;
  firestaff.rotation.y = state.attackTime > 0 ? 0.24 : 0;
  staffCore.material.emissiveIntensity = state.isChargingShot ? 2.2 : 1.0 + Math.sin(now * 6) * 0.08;

  enemy.scale.lerp(new THREE.Vector3(1, 1, 1), 0.12);

  attackArc.visible = state.attackTime > 0 || state.isChargingShot;
  if (attackArc.visible) {
    const cameraForward = getCameraGroundForward();
    attackArc.position.copy(state.pos).add(new THREE.Vector3(cameraForward.x * 1.08, 1.0, cameraForward.z * 1.08));
    attackArc.rotation.z = Math.atan2(cameraForward.x, cameraForward.z);
    attackArc.material.color.set(state.attackPower > 1.25 || state.isChargingShot ? 0xfb7185 : 0xf97316);
  }

  updateFireballs(dt, now);

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

  const lookWithKick = lookTarget.clone()
    .add(new THREE.Vector3(Math.sin(state.cameraYaw + Math.PI / 2) * cameraKick.x, 0, Math.cos(state.cameraYaw + Math.PI / 2) * cameraKick.x))
    .add(new THREE.Vector3(0, cameraKick.y, 0));
  camera.lookAt(lookWithKick);

  const hold = chargeStart ? ((performance.now() - chargeStart) / 1000).toFixed(2) : '0.00';
  const lock = state.pointerLocked ? 'LOCKED' : 'CLICK CANVAS';
  const dashLabel = bindingLabel(state.dashBinding);
  const dashBindStatus = state.isRebindingDash ? 'PRESS A KEY OR MOUSE BUTTON...' : 'B TO REBIND';
  const heroStatus = characterModelLoaded ? 'GLB HERO' : 'FALLBACK HERO';
  hud.textContent = `View ${state.viewMode.toUpperCase()} (V) | ${heroStatus} | Mouse ${lock} | Attack Left Click | Dash ${dashLabel} (${dashBindStatus}) | Menu M | Charge ${hold}s | Stamina ${state.stamina.toFixed(0)} | Dash CD ${state.dashCooldown.toFixed(2)} | Enemy HP ${state.enemyHp}`;
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
