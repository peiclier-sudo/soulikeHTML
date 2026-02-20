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
let heroActions = {
  idle: null,
  walk: null,
  run: null,
  jump: null,
  basicAttack: null,
  chargedAttack: null,
  idleIsStaticPose: false,
};
let activeHeroAttackAction = null;
let heroIsCharging = false;
let heroCurrentLocomotionAction = null;
let heroJumpingActionActive = false;
let heroRootMotionLocks = [];
let heroJumpQueued = false;
let heroModelRoot = null;
let characterModelLoaded = false;
let heroModelStatus = 'LOADING HERO...';
let heroFacingOffset = Math.PI;
let heroAnimationMap = {};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070d1a);
scene.fog = new THREE.Fog(0x070d1a, 24, 130);

const camera = new THREE.PerspectiveCamera(65, canvas.width / canvas.height, 0.1, 220);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(canvas.width, canvas.height, false);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;

const hemi = new THREE.HemisphereLight(0xb8d3ff, 0x1a2233, 1.45);
scene.add(hemi);
const moon = new THREE.DirectionalLight(0xf3f7ff, 2.15);
moon.position.set(10, 20, 8);
moon.castShadow = true;
scene.add(moon);
const rim = new THREE.DirectionalLight(0xa7d3ff, 1.2);
rim.position.set(-7, 9, -10);
scene.add(rim);
const fill = new THREE.PointLight(0x60a5fa, 1.4, 36, 2);
fill.position.set(0, 4.5, 3.2);
scene.add(fill);

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

function normalizeClipName(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function findClipByConfiguredName(animations, configuredName) {
  if (!configuredName || typeof configuredName !== 'string') return null;
  const wanted = normalizeClipName(configuredName);
  if (!wanted) return null;

  return animations.find((clip) => normalizeClipName(clip.name) === wanted)
    || animations.find((clip) => normalizeClipName(clip.name).includes(wanted));
}

function applyLoadedHero(gltf, sourcePath) {
  const modelRoot = new THREE.Group();
  modelRoot.name = 'hero-model-root';
  modelRoot.add(gltf.scene);
  modelRoot.scale.setScalar(1.55);
  modelRoot.position.y = 0;
  modelRoot.rotation.y = heroFacingOffset;

  const heroBounds = new THREE.Box3().setFromObject(gltf.scene);
  if (Number.isFinite(heroBounds.min.y)) {
    modelRoot.position.y -= heroBounds.min.y;
    modelRoot.position.y += 0.08;
  }
  modelRoot.userData.baseY = modelRoot.position.y;

  gltf.scene.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.castShadow = true;
    obj.receiveShadow = true;

    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    materials.forEach((material) => {
      if (!material) return;
      material.transparent = false;
      material.opacity = 1;
      material.alphaTest = 0;
      material.depthWrite = true;
      material.needsUpdate = true;
    });
  });

  characterVisualRoot.visible = false;
  player.add(modelRoot);
  heroModelRoot = modelRoot;
  characterModelLoaded = true;
  heroModelStatus = `GLB HERO (${sourcePath})`;

  characterMixer = null;
  heroActions = {
    idle: null,
    walk: null,
    run: null,
    jump: null,
    basicAttack: null,
    chargedAttack: null,
    idleIsStaticPose: false,
  };
  activeHeroAttackAction = null;
  heroCurrentLocomotionAction = null;
  heroJumpingActionActive = false;
  heroRootMotionLocks = [];
  heroJumpQueued = false;
  if (gltf.animations && gltf.animations.length > 0) {
    characterMixer = new THREE.AnimationMixer(gltf.scene);
    heroRootMotionLocks = collectHeroRootMotionLocks(gltf.scene, gltf.animations);

    const trueIdleClip = findClipByConfiguredName(gltf.animations, heroAnimationMap.idle)
      || gltf.animations.find((clip) => /inactif\s*1|inactive\s*1|idle|breath|stand|rest|rested/i.test(clip.name))
      || null;

    const walkClip = findClipByConfiguredName(gltf.animations, heroAnimationMap.walk)
      || gltf.animations.find((clip) => /walk/i.test(clip.name))
      || null;

    const runFastClip = gltf.animations.find((clip) => /run\s*fast|runfast/i.test(clip.name)) || null;
    const runClip = runFastClip
      || findClipByConfiguredName(gltf.animations, heroAnimationMap.run)
      || gltf.animations.find((clip) => /run|jog|sprint/i.test(clip.name))
      || null;

    const jumpClip = findClipByConfiguredName(gltf.animations, heroAnimationMap.jump)
      || gltf.animations.find((clip) => /jump/i.test(clip.name))
      || null;

    const locomotionClip = findClipByConfiguredName(gltf.animations, heroAnimationMap.locomotion)
      || walkClip
      || runClip
      || gltf.animations[0]
      || null;

    const poseFallbackClip = gltf.animations.find((clip) => /pose|aim/i.test(clip.name)) || null;
    const idleClip = trueIdleClip || (poseFallbackClip !== locomotionClip ? poseFallbackClip : null);

    const chargedAttackClip = findClipByConfiguredName(gltf.animations, heroAnimationMap.chargedAttack)
      || gltf.animations.find((clip) => /mage[\s_-]*soell[\s_-]*(cast|lance).*\b3\b/i.test(clip.name) && clip !== idleClip)
      || gltf.animations.find((clip) => /charge|heavy|power|cast[_-]?3|spell[_-]?3|_3$/i.test(clip.name) && clip !== idleClip)
      || null;

    const basicAttackClip = findClipByConfiguredName(gltf.animations, heroAnimationMap.basicAttack)
      || gltf.animations.find((clip) => /mage[\s_-]*soell[\s_-]*lance[\s_-]*sort.*\b4\b/i.test(clip.name) && clip !== idleClip && clip !== chargedAttackClip)
      || gltf.animations.find((clip) => /attack|cast|spell|slash|hit|cast[_-]?4|spell[_-]?4|_4$/i.test(clip.name) && clip !== idleClip && clip !== chargedAttackClip)
      || null;

    if (idleClip) {
      heroActions.idle = characterMixer.clipAction(idleClip);
      heroActions.idleIsStaticPose = !trueIdleClip;
      if (heroActions.idleIsStaticPose) {
        heroActions.idle.setLoop(THREE.LoopOnce, 1);
        heroActions.idle.clampWhenFinished = true;
        heroActions.idle.play();
        heroActions.idle.time = Math.max(0, idleClip.duration * 0.9);
        heroActions.idle.paused = true;
      } else {
        heroActions.idle.play();
      }
    }

    if (walkClip || locomotionClip) {
      heroActions.walk = characterMixer.clipAction(walkClip || locomotionClip);
      heroActions.walk.enabled = true;
      heroActions.walk.play();
    }

    if (runClip) {
      heroActions.run = characterMixer.clipAction(runClip);
      heroActions.run.enabled = true;
      heroActions.run.play();
    }

    if (jumpClip) {
      heroActions.jump = characterMixer.clipAction(jumpClip);
      heroActions.jump.enabled = true;
      heroActions.jump.setLoop(THREE.LoopOnce, 1);
      heroActions.jump.clampWhenFinished = true;
      heroActions.jump.play();
      heroActions.jump.paused = true;
      heroActions.jump.setEffectiveWeight(0);
    }

    if (basicAttackClip) {
      heroActions.basicAttack = characterMixer.clipAction(basicAttackClip);
      heroActions.basicAttack.setLoop(THREE.LoopOnce, 1);
      heroActions.basicAttack.clampWhenFinished = true;
      heroActions.basicAttack.enabled = false;
      heroActions.basicAttack.setEffectiveWeight(0);
    }

    if (chargedAttackClip) {
      heroActions.chargedAttack = characterMixer.clipAction(chargedAttackClip);
      heroActions.chargedAttack.setLoop(THREE.LoopOnce, 1);
      heroActions.chargedAttack.clampWhenFinished = true;
      heroActions.chargedAttack.enabled = false;
      heroActions.chargedAttack.setEffectiveWeight(0);
    }

    if (heroActions.idle && heroActions.walk) {
      heroActions.idle.setEffectiveWeight(1);
      heroActions.walk.setEffectiveWeight(0);
      if (heroActions.run) heroActions.run.setEffectiveWeight(0);
      heroCurrentLocomotionAction = heroActions.idle;
    } else if (!heroActions.idle && heroActions.walk) {
      heroActions.walk.setEffectiveWeight(1);
      if (heroActions.run) heroActions.run.setEffectiveWeight(0);
      heroCurrentLocomotionAction = heroActions.walk;
    }
  }
}

function crossFadeHeroBaseAction(nextAction, duration = 0.18) {
  if (!nextAction || heroCurrentLocomotionAction === nextAction) return;
  nextAction.enabled = true;
  nextAction.reset();
  nextAction.play();

  if (heroCurrentLocomotionAction) {
    heroCurrentLocomotionAction.crossFadeTo(nextAction, duration, true);
  }

  heroCurrentLocomotionAction = nextAction;
}


function collectHeroRootMotionLocks(sceneRoot, animations) {
  const positionTrackNodeNames = new Set();

  animations.forEach((clip) => {
    clip.tracks.forEach((track) => {
      if (!track.name.endsWith('.position')) return;
      const nodeName = track.name.slice(0, -9);
      if (!nodeName) return;
      if (!/root|armature/i.test(nodeName)) return;
      positionTrackNodeNames.add(nodeName);
    });
  });

  const locks = [];
  positionTrackNodeNames.forEach((name) => {
    const node = sceneRoot.getObjectByName(name);
    if (!node) return;
    locks.push({ node, baseX: node.position.x, baseZ: node.position.z });
  });

  return locks;
}

function applyHeroRootMotionLock() {
  if (!heroRootMotionLocks || heroRootMotionLocks.length === 0) return;
  heroRootMotionLocks.forEach((lock) => {
    lock.node.position.x = lock.baseX;
    lock.node.position.z = lock.baseZ;
  });
}

function loadHeroModel() {
  const loader = new GLTFLoader();
  const fallbackHeroFile = 'hero.glb';

  function toUrlVariants(path) {
    if (!path || typeof path !== 'string') return [];

    const clean = path.trim();
    if (!clean) return [];

    if (/^https?:\/\//i.test(clean)) return [clean];

    // If caller provided an absolute path, respect it exactly.
    if (clean.startsWith('/')) return [clean];

    // If caller explicitly gave models/*, try both relative + absolute under models.
    if (clean.startsWith('models/')) return [clean, `/${clean}`];

    // Default behavior: model names are expected inside /models/.
    return [`models/${clean}`, `/models/${clean}`];
  }

  function setFallback(reason) {
    characterModelLoaded = false;
    characterVisualRoot.visible = true;
    heroModelStatus = `FALLBACK HERO (${reason})`;
  }

  function loadCandidates(candidates) {
    const unique = [...new Set(candidates.flatMap((candidate) => toUrlVariants(candidate)).filter(Boolean))];

    if (unique.length === 0) {
      setFallback('NO MODEL PATH CONFIGURED');
      console.warn('No model path configured. Set models/manifest.json (hero field) or ?hero=/models/your-file.glb');
      return;
    }

    function tryPath(index) {
      if (index >= unique.length) {
        setFallback('MODEL NOT FOUND OR UNREADABLE');
        console.warn('Unable to load hero model. Tried:', unique.join(', '));
        return;
      }

      const path = unique[index];
      loader.load(
        path,
        (gltf) => applyLoadedHero(gltf, path),
        undefined,
        () => tryPath(index + 1)
      );
    }

    tryPath(0);
  }

  function parseFacingOffset(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return THREE.MathUtils.degToRad(n);
  }

  function fetchManifest() {
    const manifestUrls = ['models/manifest.json', '/models/manifest.json'];

    function tryUrl(index) {
      if (index >= manifestUrls.length) return Promise.resolve({});

      return fetch(manifestUrls[index], { cache: 'no-store' })
        .then((res) => {
          if (!res.ok) throw new Error('manifest not found');
          return res.json();
        })
        .catch(() => tryUrl(index + 1));
    }

    return tryUrl(0);
  }

  const query = new URLSearchParams(window.location.search);
  const queryHero = query.get('hero');
  const queryFacingOffset = parseFacingOffset(query.get('heroFacingDeg'));
  const localStorageHero = window.localStorage.getItem('heroModelPath');
  const localStorageFacingOffset = parseFacingOffset(window.localStorage.getItem('heroFacingDeg'));

  fetchManifest().then((manifest) => {
    const manifestHero = manifest?.hero || fallbackHeroFile;
    const manifestPaths = Array.isArray(manifest?.paths) ? manifest.paths : [];
    const manifestFacingOffset = parseFacingOffset(manifest?.facingDeg);
    heroFacingOffset = queryFacingOffset ?? localStorageFacingOffset ?? manifestFacingOffset ?? Math.PI;
    heroAnimationMap = (manifest?.animations && typeof manifest.animations === 'object') ? manifest.animations : {};

    const candidates = [queryHero, localStorageHero, manifestHero, ...manifestPaths, fallbackHeroFile];
    loadCandidates(candidates);
  });
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
  fortnite: { dist: 4.0, eyeHeight: 1.55, sideOffset: 0, lookHeight: 1.4 },
};

const state = {
  pos: new THREE.Vector3(0, 0, 4),
  vel: new THREE.Vector3(0, 0, 0),
  velY: 0,
  baseSpeed: 8.3,
  accel: 42,
  drag: 19,
  airControl: 0.22,
  dashSpeed: 16,
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
    state.dashTime = 0.1;
    state.dashCooldown = 0.52;
    state.stamina -= 18;
    dashTrailTimer = 0.12;
    const forward = getCameraGroundForward();
    state.vel.x = forward.x * state.dashSpeed;
    state.vel.z = forward.z * state.dashSpeed;
    state.yaw = Math.atan2(forward.x, forward.z);
    applyCameraKick(0.01);
  }

  chargeStart = null;
  state.isChargingShot = false;
  mouseAttackHold = false;
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
  playHeroAttackAnimation(power);
}

function playHeroAttackAnimation(power) {
  heroIsCharging = false;
  const wantsCharged = power > 1.25;
  const chosenAction = wantsCharged
    ? (heroActions.chargedAttack || heroActions.basicAttack)
    : (heroActions.basicAttack || heroActions.chargedAttack);

  if (!chosenAction) return;
  activeHeroAttackAction = chosenAction;
  chosenAction.enabled = true;
  chosenAction.paused = false;
  // For charged attacks the animation was already playing during wind-up; resume at full speed.
  // For basic attacks reset to the start so the full motion plays.
  if (!wantsCharged) chosenAction.time = 0;
  chosenAction.setEffectiveWeight(1);
  chosenAction.timeScale = wantsCharged ? 1.05 : 1.2;
  chosenAction.play();
}

function startHeroChargeAnimation() {
  const chargeAction = heroActions.chargedAttack || heroActions.basicAttack;
  if (!chargeAction) return;
  heroIsCharging = true;
  activeHeroAttackAction = chargeAction;
  chargeAction.enabled = true;
  chargeAction.paused = false;
  chargeAction.time = 0;
  chargeAction.setEffectiveWeight(1);
  // Play slowly to show the wind-up pose; speed will jump to 1.05 on release.
  chargeAction.timeScale = 0.4;
  chargeAction.play();
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
  // If no fireball was spawned (stamina too low, etc.) clear the charge animation.
  heroIsCharging = false;
}



function triggerHeroJumpAction(boost = 1.95) {
  if (!heroActions.jump) return;
  heroJumpingActionActive = true;
  heroActions.jump.reset();
  heroActions.jump.paused = false;
  heroActions.jump.enabled = true;
  heroActions.jump.setEffectiveWeight(1);
  heroActions.jump.timeScale = boost;
  heroActions.jump.play();
}

function updateCharacterAnimation(dt, now, stride) {
  const attackWeight = activeHeroAttackAction ? activeHeroAttackAction.getEffectiveWeight() : 0;
  const attackActive = activeHeroAttackAction && (state.attackTime > 0 || attackWeight > 0.04 || heroIsCharging);

  const isAirborne = state.pos.y > 0.03 || state.velY > 0.2;

  if (heroJumpingActionActive && heroActions.jump) {
    const jumpProgress = heroActions.jump.time / Math.max(heroActions.jump.getClip().duration, 0.001);
    const isLanding = state.pos.y <= 0.001 && state.velY <= 0;
    if (jumpProgress >= 0.9 || (isLanding && jumpProgress >= 0.32)) {
      heroJumpingActionActive = false;
      heroActions.jump.setEffectiveWeight(0);
      heroActions.jump.paused = true;
    } else if (isLanding) {
      // Finish quickly once grounded, without freezing the next jump trigger.
      heroActions.jump.timeScale = 2.6;
      heroActions.jump.setEffectiveWeight(1);
    }
  } else if (!isAirborne && heroActions.jump) {
    heroActions.jump.setEffectiveWeight(0);
    heroActions.jump.paused = true;
  }

  if (characterMixer && (heroActions.walk || heroActions.run)) {
    if (!heroJumpingActionActive) {
      const wantsRun = stride > 0.82;
      const isMoving = stride > 0.08 && !attackActive;
      const desiredBaseAction = isMoving
        ? (wantsRun ? (heroActions.run || heroActions.walk) : (heroActions.walk || heroActions.run))
        : heroActions.idle || heroActions.walk || heroActions.run;

      if (desiredBaseAction) crossFadeHeroBaseAction(desiredBaseAction);
    }

    if (heroActions.walk) {
      heroActions.walk.timeScale = THREE.MathUtils.lerp(0.8, 1.1, Math.min(stride / 0.82, 1));
      heroActions.walk.setEffectiveWeight(heroJumpingActionActive ? 0.35 : (heroCurrentLocomotionAction === heroActions.walk ? 1 : 0));
    }
    if (heroActions.run) {
      heroActions.run.timeScale = THREE.MathUtils.lerp(0.95, 1.28, stride);
      heroActions.run.setEffectiveWeight(heroJumpingActionActive ? 0.35 : (heroCurrentLocomotionAction === heroActions.run ? 1 : 0));
    }
    if (heroActions.idle) {
      heroActions.idle.setEffectiveWeight(heroJumpingActionActive ? 0.12 : (heroCurrentLocomotionAction === heroActions.idle ? 1 : 0));
    }
  }

  const attackActions = [heroActions.basicAttack, heroActions.chargedAttack].filter(Boolean);
  if (attackActions.length > 0) {
    attackActions.forEach((action) => {
      const isActiveAction = activeHeroAttackAction === action;
      const targetAttackWeight = isActiveAction && (state.attackTime > 0 || heroIsCharging) ? 1 : 0;
      const nextAttackWeight = THREE.MathUtils.damp(action.getEffectiveWeight(), targetAttackWeight, 16, dt);
      action.setEffectiveWeight(nextAttackWeight);
      action.enabled = nextAttackWeight > 0.01;
    });

    const activeWeight = activeHeroAttackAction ? activeHeroAttackAction.getEffectiveWeight() : 0;
    if (activeWeight <= 0.01 && state.attackTime <= 0 && !heroIsCharging) activeHeroAttackAction = null;

    if (heroActions.idle) {
      heroActions.idle.setEffectiveWeight(heroActions.idle.getEffectiveWeight() * (1 - activeWeight));
    }
    if (heroActions.walk) {
      heroActions.walk.setEffectiveWeight(heroActions.walk.getEffectiveWeight() * (1 - activeWeight));
    }
    if (heroActions.run) {
      heroActions.run.setEffectiveWeight(heroActions.run.getEffectiveWeight() * (1 - activeWeight));
    }
    if (heroActions.jump) heroActions.jump.setEffectiveWeight(heroActions.jump.getEffectiveWeight() * (1 - activeWeight));
  }

  if (heroModelRoot && !characterMixer) {
    const bob = Math.sin(now * (4 + stride * 8)) * (0.02 + stride * 0.02);
    const sway = Math.sin(now * 5) * 0.03 * (0.3 + stride);
    heroModelRoot.position.y = heroModelRoot.userData.baseY + bob;
    heroModelRoot.rotation.z = sway;
  }
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
    heroJumpQueued = true;
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
    startHeroChargeAnimation();
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
  if (characterMixer) {
    characterMixer.update(dt);
    applyHeroRootMotionLock();
  }

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
  if (heroJumpQueued) {
    if (grounded && state.attackRecover <= 0) {
      state.velY = 6.6;
      triggerHeroJumpAction(2.05);
    }
    heroJumpQueued = false;
  }
  const accel = state.accel * (grounded ? 1 : state.airControl);
  const targetSpeed = state.baseSpeed * (state.dashTime > 0 ? 1.3 : 1) * (grounded ? 1 : 0.72);

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
  updateCharacterAnimation(dt, now, stride);

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
  state.camPos.lerp(targetCamPos, 0.24);
  camera.position.copy(state.camPos);

  const lookTarget = new THREE.Vector3().copy(state.pos).add(new THREE.Vector3(0, mode.lookHeight, 0));
  const lookWithKick = lookTarget.clone()
    .add(new THREE.Vector3(Math.sin(state.cameraYaw + Math.PI / 2) * cameraKick.x, 0, Math.cos(state.cameraYaw + Math.PI / 2) * cameraKick.x))
    .add(new THREE.Vector3(0, cameraKick.y, 0));
  camera.lookAt(lookWithKick);

  const hold = chargeStart ? ((performance.now() - chargeStart) / 1000).toFixed(2) : '0.00';
  const lock = state.pointerLocked ? 'LOCKED' : 'CLICK CANVAS';
  const dashLabel = bindingLabel(state.dashBinding);
  const dashBindStatus = state.isRebindingDash ? 'PRESS A KEY OR MOUSE BUTTON...' : 'B TO REBIND';
  const heroStatus = `${heroModelStatus} | facing ${(THREE.MathUtils.radToDeg(heroFacingOffset)).toFixed(0)}°`;
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
