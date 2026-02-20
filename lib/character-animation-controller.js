import * as THREE from 'three';

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

export class CharacterAnimationController {
  constructor(modelScene) {
    this.mixer = new THREE.AnimationMixer(modelScene);
    this.actions = {};
    this.currentLocomotion = null;
    this.activeAttack = null;
    this.isCharging = false;
    this.isCrouching = false;
    this.jumpActive = false;
  }

  initFromManifest(animationsArray, manifestMap) {
    console.log('%c🎬 MESHY ANIMATIONS LOADED', 'color:#60a5fa;font-weight:bold;font-size:14px');
    animationsArray.forEach((clip, i) => console.log(`  ${i}: "${clip.name}" (${clip.duration.toFixed(2)}s)`));
    console.log('heroAnimationMap from manifest:', manifestMap);

    const renameMap = { 'Run_and_Jump - basic jump': 'Jump' };
    animationsArray.forEach((clip) => {
      if (renameMap[clip.name]) {
        console.log(`✅ Renamed "${clip.name}" → "${renameMap[clip.name]}"`);
        clip.name = renameMap[clip.name];
      }
    });

    const fallbackMatchers = {
      idle: /inactif\s*1|inactive\s*1|idle|breath|stand|rest|rested/i,
      walk: /walk/i,
      run: /run|jog|sprint/i,
      jump: /jump/i,
      crouch: /crouch/i,
      basicAttack: /attack|cast|spell|slash|hit|cast[_-]?4|spell[_-]?4|_4$/i,
      chargedAttack: /charge|heavy|power|cast[_-]?3|spell[_-]?3|_3$/i,
      ability1: /ability[_\s-]*1|spell[_\s-]*1/i,
      ability2: /ability[_\s-]*2|spell[_\s-]*2/i,
      ability3: /ability[_\s-]*3|spell[_\s-]*3/i,
    };

    Object.keys(fallbackMatchers).forEach((key) => {
      const configuredName = manifestMap?.[key];
      const clip = findClipByConfiguredName(animationsArray, configuredName)
        || animationsArray.find((item) => fallbackMatchers[key].test(item.name));
      if (!clip) return;
      this.actions[key] = this.mixer.clipAction(clip);
    });

    const oneShots = ['jump', 'basicAttack', 'chargedAttack', 'ability1', 'ability2', 'ability3'];
    oneShots.forEach((key) => {
      if (!this.actions[key]) return;
      this.actions[key].setLoop(THREE.LoopOnce, 1);
      this.actions[key].clampWhenFinished = true;
      this.actions[key].enabled = false;
      this.actions[key].setEffectiveWeight(0);
    });

    const start = this.actions.idle || this.actions.walk || this.actions.run;
    if (start) {
      start.reset().play();
      start.setEffectiveWeight(1);
      this.currentLocomotion = start;
    }
  }

  setCrouch(next) {
    this.isCrouching = !!next;
  }

  crossFade(nextAction, duration = 0.18) {
    if (!nextAction || this.currentLocomotion === nextAction) return;
    nextAction.enabled = true;
    nextAction.reset();
    nextAction.play();
    if (this.currentLocomotion) this.currentLocomotion.crossFadeTo(nextAction, duration, true);
    this.currentLocomotion = nextAction;
  }

  startCharge() {
    const action = this.actions.chargedAttack || this.actions.basicAttack;
    if (!action) return null;
    this.isCharging = true;
    this.activeAttack = action;
    action.enabled = true;
    action.paused = false;
    action.reset();
    action.setEffectiveWeight(1);
    action.setEffectiveTimeScale(0.4);
    action.play();
    return action;
  }

  playAttack(power) {
    this.isCharging = false;
    const wantsCharged = power > 1.25;
    const action = wantsCharged
      ? (this.actions.chargedAttack || this.actions.basicAttack)
      : (this.actions.basicAttack || this.actions.chargedAttack);
    if (!action) return null;
    this.activeAttack = action;
    action.enabled = true;
    action.paused = false;
    if (!wantsCharged || action !== this.actions.chargedAttack) action.reset();
    action.setEffectiveWeight(1);
    action.setEffectiveTimeScale(wantsCharged ? 1.05 : 1.2);
    action.play();
    return action;
  }

  playAbility(key, onFinish = null) {
    const action = this.actions[key];
    if (!action) return false;
    this.activeAttack = action;
    action.enabled = true;
    action.reset();
    action.setEffectiveWeight(1);
    action.setEffectiveTimeScale(1);
    action.play();

    if (onFinish) {
      const listener = (event) => {
        if (event.action !== action) return;
        this.mixer.removeEventListener('finished', listener);
        onFinish();
      };
      this.mixer.addEventListener('finished', listener);
    }
    return true;
  }

  update(dt, { stride, isAirborne, attackWindowActive }) {
    const attackActive = this.activeAttack && (attackWindowActive || this.isCharging || this.activeAttack.getEffectiveWeight() > 0.04);
    const wantsRun = stride > 0.82;
    const isMoving = stride > 0.08 && !attackActive;

    const desiredBaseAction = this.isCrouching
      ? (this.actions.crouch || this.actions.idle || this.actions.walk || this.actions.run)
      : (isMoving
        ? ((wantsRun && this.actions.run) ? this.actions.run : this.actions.walk || this.actions.run)
        : this.actions.idle || this.actions.walk || this.actions.run);

    if (!this.jumpActive && desiredBaseAction) this.crossFade(desiredBaseAction);

    if (this.actions.jump) {
      if (isAirborne && !attackActive && !this.jumpActive) {
        this.jumpActive = true;
        this.actions.jump.reset();
        this.actions.jump.paused = false;
        this.actions.jump.setEffectiveWeight(1);
        this.actions.jump.timeScale = 1.6;
        this.actions.jump.play();
      } else if (!isAirborne && this.jumpActive) {
        const jumpProgress = this.actions.jump.time / Math.max(this.actions.jump.getClip().duration, 0.001);
        if (jumpProgress >= 0.88) {
          this.jumpActive = false;
          this.actions.jump.setEffectiveWeight(0);
          this.actions.jump.paused = true;
        } else {
          this.actions.jump.timeScale = 2.1;
          this.actions.jump.setEffectiveWeight(1);
        }
      }
    }

    if (this.actions.walk) this.actions.walk.timeScale = THREE.MathUtils.lerp(0.8, 1.1, Math.min(stride / 0.82, 1));
    if (this.actions.run) this.actions.run.timeScale = THREE.MathUtils.lerp(0.95, 1.28, stride);

    const overlayActions = [this.actions.basicAttack, this.actions.chargedAttack, this.actions.ability1, this.actions.ability2, this.actions.ability3].filter(Boolean);
    overlayActions.forEach((action) => {
      const isActiveAction = this.activeAttack === action;
      const targetAttackWeight = isActiveAction && (attackWindowActive || this.isCharging) ? 1 : 0;
      const nextAttackWeight = THREE.MathUtils.damp(action.getEffectiveWeight(), targetAttackWeight, 16, dt);
      action.setEffectiveWeight(nextAttackWeight);
      action.enabled = nextAttackWeight > 0.01;
    });

    const activeWeight = this.activeAttack ? this.activeAttack.getEffectiveWeight() : 0;
    if (activeWeight <= 0.01 && !attackWindowActive && !this.isCharging) this.activeAttack = null;

    [this.actions.idle, this.actions.walk, this.actions.run, this.actions.jump].filter(Boolean).forEach((action) => {
      const isCurrent = this.currentLocomotion === action || (this.jumpActive && action === this.actions.jump);
      const baseWeight = isCurrent ? 1 : 0;
      action.setEffectiveWeight(baseWeight * (1 - activeWeight));
    });

    this.mixer.update(dt);
  }
}
