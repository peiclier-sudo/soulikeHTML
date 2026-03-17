/**
 * RogueBoss — PvP-style boss using the RogueV3 character model.
 * 5 attacks: Quick Slash, Dash Strike, Poison Blade, Teleport Behind, Spinning Blades.
 * Green/poison VFX theme matching the shadow assassin kit.
 */

import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { Enemy } from './Enemy.js';

const ROGUE_NAMES = [
    'Kael the Unseen', 'Shade of Nyroth', 'Vex Nighthollow',
    'Silas Daggermind', 'Mira the Silent'
];

const ATK = { SLASH: 0, DASH: 1, POISON: 2, TELEPORT: 3, SPIN: 4 };
const ATK_COUNT = 5;
const POOL_SIZE = 24;

// Poison green palette
const CLR = {
    primary:  0x1fbf4c,
    dark:     0x0b6e2a,
    bright:   0x44ff88,
    poison:   0x33dd55,
    warning:  0xaaff66,
};

export class RogueBoss extends Enemy {
    constructor(scene, position, config = {}) {
        const health = config.health ?? 1600;
        super(scene, position, {
            ...config,
            health,
            damage: config.damage ?? 22,
            speed: config.speed ?? 9.5,
            attackRange: config.attackRange ?? 25,
            detectionRange: config.detectionRange ?? 50
        });
        this.maxHealth = health;
        this.name = config.name ?? ROGUE_NAMES[Math.floor(Math.random() * ROGUE_NAMES.length)];
        this.isBoss = true;
        this.hitRadius = 0.8;

        this.activeAttack = -1;
        this.activeAttackTimer = 0;
        this._attackDuration = 0;
        this._attackHitDealt = false;
        this._atkCooldowns = new Float32Array(ATK_COUNT);
        this.globalAttackCooldown = 0;
        this._playerRef = null;
        this._gameState = null;
        this._skipMeshSync = false;

        this._idleTimer = 0;
        this._strafeDir = 1;

        // Teleport state
        this._teleportOrigin = new THREE.Vector3();
        this._teleportTarget = new THREE.Vector3();
        this._isVanished = false;

        // Dash state
        this._dashDir = new THREE.Vector3();
        this._dashOrigin = new THREE.Vector3();

        // Poison projectile
        this._poisonProjectiles = [];

        // Reusable vectors
        this._tmpVec = new THREE.Vector3();
        this._tmpDir = new THREE.Vector3();
    }

    createMesh(config) {
        this.mixer = null;
        this.actions = {};
        this.currentAnimName = null;

        const assets = config?.assets;
        // Use the rogue model (same as player's shadow assassin)
        const template = assets?.models?.character_3k_rogue;
        const animData = assets?.animations?.character_3k_rogue;

        if (template) {
            const model = SkeletonUtils.clone(template);
            model.scale.setScalar(1.5);
            model.visible = true;

            // Tint materials with poison green hue
            model.traverse((child) => {
                if (child.isMesh && child.material) {
                    if (child.geometry?.isBufferGeometry) {
                        child.geometry.computeVertexNormals();
                    }
                    child.visible = true;
                    child.castShadow = true;
                    child.receiveShadow = true;
                    const wasArray = Array.isArray(child.material);
                    const mats = wasArray ? child.material : [child.material];
                    child.material = mats.map(m => {
                        const mat = m.clone();
                        mat.transparent = false;
                        mat.opacity = 1.0;
                        mat.alphaTest = 0.0;
                        if ('alphaMap' in mat) mat.alphaMap = null;
                        if ('transmission' in mat) mat.transmission = 0;
                        if ('premultipliedAlpha' in mat) mat.premultipliedAlpha = false;
                        if ('blending' in mat) mat.blending = THREE.NormalBlending;
                        if ('side' in mat) mat.side = THREE.FrontSide;
                        mat.depthWrite = true;
                        mat.depthTest = true;
                        mat.flatShading = false;
                        if ('metalness' in mat) mat.metalness = 0.05;
                        if ('roughness' in mat) mat.roughness = 0.9;
                        if ('envMapIntensity' in mat) mat.envMapIntensity = 0.0;
                        if ('emissiveIntensity' in mat) mat.emissiveIntensity = 0.15;
                        if ('emissive' in mat) mat.emissive.setHex(CLR.dark);
                        if (mat.map) { mat.map.premultiplyAlpha = false; mat.map.needsUpdate = true; }
                        mat.needsUpdate = true;
                        return mat;
                    });
                    if (!wasArray) child.material = child.material[0];
                }
            });

            this.mesh = model;
            this.mesh.userData.enemy = this;
            this._addToonOutline(this.mesh, 1.03);

            // Setup animation mixer
            if (animData?.clips?.length > 0) {
                this.mixer = new THREE.AnimationMixer(model);
                const map = animData.map || {};

                animData.clips.forEach(clip => {
                    const action = this.mixer.clipAction(clip);
                    this.actions[clip.name] = action;
                    action.setLoop(THREE.LoopRepeat);
                });

                if (map['Idle']) {
                    this.actions['Idle'] = this.mixer.clipAction(map['Idle']);
                    this.actions['Idle'].setLoop(THREE.LoopRepeat);
                }
                if (map['Run']) {
                    this.actions['Run'] = this.mixer.clipAction(map['Run']);
                    this.actions['Run'].setLoop(THREE.LoopRepeat);
                }
                if (map['Walk']) {
                    this.actions['Walk'] = this.mixer.clipAction(map['Walk']);
                    this.actions['Walk'].setLoop(THREE.LoopRepeat);
                }

                const idle = this.actions['Idle'] || Object.values(this.actions)[0];
                if (idle) {
                    this.currentAnimName = 'Idle';
                    idle.setLoop(THREE.LoopRepeat);
                    idle.reset().setEffectiveWeight(1).play();
                }
            }

            // Measure model for positioning
            model.position.set(0, 0, 0);
            if (this.mixer) this.mixer.update(0);
            model.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(model);
            this._bossFloorOffset = -box.min.y;
            this._bossHeight = box.max.y - box.min.y;
            this.hitRadius = 0.8;

            // Attack ranges (rogue is nimble, shorter melee but has ranged/mobility)
            this._slashRange = this.hitRadius + 3.5;
            this._dashRange = this.hitRadius + 14;
            this._poisonRange = this.hitRadius + 18;
            this._teleportRange = this.hitRadius + 20;
            this._spinRange = this.hitRadius + 4;
            this._chaseStopDist = this.hitRadius + 2.5;

            model.position.copy(this.position);
            model.position.y = this.position.y + this._bossFloorOffset;

            this.scene.add(this.mesh);
            this._initPool();
            return;
        }

        // Fallback: procedural rogue
        this._createProceduralRogue();
        this._slashRange = this.hitRadius + 3.5;
        this._dashRange = this.hitRadius + 14;
        this._poisonRange = this.hitRadius + 18;
        this._teleportRange = this.hitRadius + 20;
        this._spinRange = this.hitRadius + 4;
        this._chaseStopDist = this.hitRadius + 2.5;
        this._initPool();
    }

    _addToonOutline(root, thickness) {
        const outlineMat = new THREE.MeshBasicMaterial({
            color: 0x000000, side: THREE.BackSide, transparent: false, opacity: 1.0,
            depthWrite: true, depthTest: true, toneMapped: false,
            polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
        });
        root.traverse(child => {
            if (!child.isMesh || !child.geometry || child.userData?.isOutline) return;
            let outline;
            if (child.isSkinnedMesh && child.skeleton) {
                outline = new THREE.SkinnedMesh(child.geometry, outlineMat);
                outline.bind(child.skeleton, child.bindMatrix);
                outline.bindMode = child.bindMode;
            } else {
                outline = new THREE.Mesh(child.geometry, outlineMat);
            }
            outline.userData.isOutline = true;
            outline.renderOrder = (child.renderOrder || 0) - 0.2;
            outline.frustumCulled = false;
            outline.position.copy(child.position);
            outline.quaternion.copy(child.quaternion);
            outline.scale.copy(child.scale).multiplyScalar(thickness);
            outline.castShadow = false;
            outline.receiveShadow = false;
            if (child.parent) child.parent.add(outline);
        });
    }

    _createProceduralRogue() {
        const group = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: CLR.dark, roughness: 0.8, metalness: 0.2 });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 1.3, 8), mat);
        body.position.y = 0.65;
        group.add(body);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), mat);
        head.position.y = 1.45;
        group.add(head);
        // Glowing green eyes
        const eyeMat = new THREE.MeshBasicMaterial({ color: CLR.bright });
        const eyeGeo = new THREE.SphereGeometry(0.04, 6, 6);
        const lEye = new THREE.Mesh(eyeGeo, eyeMat);
        lEye.position.set(-0.07, 1.5, 0.15);
        group.add(lEye);
        const rEye = new THREE.Mesh(eyeGeo, eyeMat);
        rEye.position.set(0.07, 1.5, 0.15);
        group.add(rEye);
        // Daggers
        const daggerMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.9 });
        const daggerGeo = new THREE.BoxGeometry(0.03, 0.5, 0.015);
        const lDagger = new THREE.Mesh(daggerGeo, daggerMat);
        lDagger.position.set(-0.35, 0.7, 0);
        lDagger.rotation.z = -0.3;
        group.add(lDagger);
        const rDagger = new THREE.Mesh(daggerGeo, daggerMat);
        rDagger.position.set(0.35, 0.7, 0);
        rDagger.rotation.z = 0.3;
        group.add(rDagger);

        this.mesh = group;
        this.mesh.position.copy(this.position);
        this.mesh.userData.enemy = this;
        this.mesh.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
        this._bossHeight = 1.7;
        this._bossFloorOffset = 0;
        this.hitRadius = 0.8;
        this.scene.add(this.mesh);
    }

    // ===================== VFX POOL =====================

    _initPool() {
        this._pool = [];
        const geo = new THREE.SphereGeometry(1, 4, 3);
        for (let i = 0; i < POOL_SIZE; i++) {
            const mat = new THREE.MeshBasicMaterial({
                color: CLR.primary, transparent: true, opacity: 0,
                blending: THREE.AdditiveBlending, depthWrite: false
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.visible = false;
            mesh.frustumCulled = false;
            this.scene.add(mesh);
            this._pool.push({ mesh, mat, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, size: 0.1 });
        }

        this._light = new THREE.PointLight(CLR.primary, 0, 12, 2);
        this.scene.add(this._light);

        this._ringGeo = new THREE.RingGeometry(0.8, 6, 14);
        this._ringMat = new THREE.MeshBasicMaterial({
            color: CLR.primary, transparent: true, opacity: 0,
            side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false
        });
        this._ringMesh = new THREE.Mesh(this._ringGeo, this._ringMat);
        this._ringMesh.rotation.x = -Math.PI / 2;
        this._ringMesh.visible = false;
        this.scene.add(this._ringMesh);

        // Poison projectile mesh (reusable)
        const bladeMat = new THREE.MeshBasicMaterial({
            color: CLR.poison, transparent: true, opacity: 0.8,
            blending: THREE.AdditiveBlending, depthWrite: false
        });
        const bladeGeo = new THREE.ConeGeometry(0.15, 0.8, 4);
        this._poisonBladeMesh = new THREE.Mesh(bladeGeo, bladeMat);
        this._poisonBladeMesh.visible = false;
        this._poisonBladeMesh.frustumCulled = false;
        this.scene.add(this._poisonBladeMesh);
    }

    _spawnParticle(x, y, z, vx, vy, vz, size, maxLife, color) {
        for (let i = 0; i < this._pool.length; i++) {
            const p = this._pool[i];
            if (p.life >= p.maxLife) {
                p.mesh.position.set(x, y, z);
                p.vx = vx; p.vy = vy; p.vz = vz;
                p.size = size; p.life = 0; p.maxLife = maxLife;
                p.mat.color.setHex(color || CLR.primary);
                p.mat.opacity = 0.5;
                p.mesh.scale.setScalar(size);
                p.mesh.visible = true;
                return;
            }
        }
    }

    _updatePool(dt) {
        for (let i = 0; i < this._pool.length; i++) {
            const p = this._pool[i];
            if (p.life >= p.maxLife) { if (p.mesh.visible) p.mesh.visible = false; continue; }
            p.life += dt;
            if (p.life >= p.maxLife) { p.mesh.visible = false; continue; }
            p.mesh.position.x += p.vx * dt;
            p.mesh.position.y += p.vy * dt;
            p.mesh.position.z += p.vz * dt;
            p.vy -= 1.5 * dt;
            const t = p.life / p.maxLife;
            p.mat.opacity = 0.5 * (1 - t);
            p.mesh.scale.setScalar(p.size * (1 + t * 1.5));
        }
    }

    // ===================== HELPERS =====================

    _getForward(out) {
        out.set(0, 0, 1).applyEuler(this.mesh.rotation);
        out.y = 0;
        out.normalize();
    }

    _faceTarget(target) {
        if (!target) return;
        this.mesh.rotation.y = Math.atan2(target.x - this.position.x, target.z - this.position.z);
    }

    _clampArena() {
        const ab = 38;
        this.position.x = Math.max(-ab, Math.min(ab, this.position.x));
        this.position.z = Math.max(-ab, Math.min(ab, this.position.z));
    }

    _getHandPos(out) {
        const h = (this._bossHeight ?? 1.7) * 0.55;
        this._getForward(this._tmpDir);
        out.set(
            this.position.x + this._tmpDir.x * 0.6,
            this.position.y + h,
            this.position.z + this._tmpDir.z * 0.6
        );
    }

    setGameState(gs) { this._gameState = gs; }

    _dealDamage(amount) {
        if (this._gameState?.takeDamage) this._gameState.takeDamage(amount);
    }

    // ===================== UPDATE =====================

    update(deltaTime, playerPosition) {
        if (!this.isAlive) return;
        this._playerRef = playerPosition;

        // Vanished player: lose focus
        const isPlayerVanished = this._gameState?.combat?.vanishRemaining > 0;
        if (isPlayerVanished) {
            this.globalAttackCooldown = Math.max(0, this.globalAttackCooldown - deltaTime);
            for (let i = 0; i < ATK_COUNT; i++) this._atkCooldowns[i] = Math.max(0, this._atkCooldowns[i] - deltaTime);
            if (this.activeAttack >= 0) this._endAttack();
            this.state = 'idle';
            this._idleTimer += deltaTime;
            if (this._idleTimer > 1.0) {
                this._getForward(this._tmpDir);
                this.position.x += -this._tmpDir.z * this._strafeDir * this.speed * 0.3 * deltaTime;
                this.position.z += this._tmpDir.x * this._strafeDir * this.speed * 0.3 * deltaTime;
                this._clampArena();
                if (this._idleTimer > 2.5) { this._idleTimer = 0; this._strafeDir *= -1; }
            }
            this.mesh.position.copy(this.position);
            if (this._bossFloorOffset != null) this.mesh.position.y = this.position.y + this._bossFloorOffset;
            if (this.mixer) { this._updateAnimation(); this.mixer.update(deltaTime); }
            this._updatePool(deltaTime);
            this._updatePoisonProjectiles(deltaTime, playerPosition);
            return;
        }

        this.globalAttackCooldown = Math.max(0, this.globalAttackCooldown - deltaTime);
        for (let i = 0; i < ATK_COUNT; i++) this._atkCooldowns[i] = Math.max(0, this._atkCooldowns[i] - deltaTime);

        if (this.staggerTimer > 0) {
            this.staggerTimer -= deltaTime;
            this.mesh.position.copy(this.position);
            if (this._bossFloorOffset != null) this.mesh.position.y = this.position.y + this._bossFloorOffset;
            if (this._staggerFlinchT > 0) {
                this._staggerFlinchT = Math.max(0, this._staggerFlinchT - deltaTime * 10);
                this.mesh.rotation.x = this._staggerFlinchT * 0.12;
            }
            if (this.staggerTimer <= 0) { this._staggerFlinchT = 0; this.mesh.rotation.x = 0; }
            if (this.mixer) { this._updateAnimation(); this.mixer.update(deltaTime); }
            this._updatePool(deltaTime);
            this._updatePoisonProjectiles(deltaTime, playerPosition);
            return;
        }

        this._skipMeshSync = false;

        if (this.activeAttack >= 0) {
            this._updateActiveAttack(deltaTime, playerPosition);
        } else {
            this._updateAI(deltaTime, playerPosition);
        }

        if (!this._skipMeshSync) {
            this.mesh.position.copy(this.position);
            if (this._bossFloorOffset != null) this.mesh.position.y = this.position.y + this._bossFloorOffset;
        }

        // Vanish/reappear mesh visibility
        if (this.mesh) this.mesh.visible = !this._isVanished;

        if (this.mixer) { this._updateAnimation(); this.mixer.update(deltaTime); }
        this._updatePool(deltaTime);
        this._updatePoisonProjectiles(deltaTime, playerPosition);
    }

    // ===================== AI =====================

    _updateAI(dt, playerPos) {
        if (this.attackCooldown > 0) this.attackCooldown -= dt;
        const dist = this.position.distanceTo(playerPos);

        if (this.attackCooldown <= 0 && this.globalAttackCooldown <= 0) {
            this._pickAttack(dist, playerPos);
            if (this.activeAttack >= 0) return;
        }

        // Movement: aggressive pursuit with strafing at close range
        if (dist > this._chaseStopDist) {
            this.state = 'chase';
            this._tmpVec.subVectors(playerPos, this.position).normalize();
            this._tmpVec.y = 0;
            this.position.addScaledVector(this._tmpVec, this.speed * dt);
            this._clampArena();
            this._faceTarget(playerPos);
            this._idleTimer = 0;
        } else {
            this._idleTimer += dt;
            this._faceTarget(playerPos);

            // Aggressive strafing — circle the player quickly
            if (this._idleTimer > 0.6) {
                this.state = 'chase';
                this._getForward(this._tmpDir);
                const rightX = -this._tmpDir.z;
                const rightZ = this._tmpDir.x;
                this.position.x += rightX * this._strafeDir * this.speed * 0.55 * dt;
                this.position.z += rightZ * this._strafeDir * this.speed * 0.55 * dt;
                this._clampArena();
                if (this._idleTimer > 1.8) { this._idleTimer = 0; this._strafeDir *= -1; }
            } else {
                this.state = 'idle';
            }
        }

        // Ambient poison particles when idle/close
        if (dist < 6 && Math.random() < 0.04) {
            const a = Math.random() * Math.PI * 2;
            this._spawnParticle(
                this.position.x + Math.cos(a) * 0.5, 0.5 + Math.random(),
                this.position.z + Math.sin(a) * 0.5,
                Math.cos(a) * 0.8, 1 + Math.random(), Math.sin(a) * 0.8,
                0.06, 0.5, CLR.primary
            );
        }
    }

    _pickAttack(dist, playerPos) {
        const avail = [];

        // Quick Slash: melee range, high priority when close
        if (this._atkCooldowns[ATK.SLASH] <= 0 && dist < this._slashRange) {
            avail.push({ t: ATK.SLASH, w: dist < this.hitRadius + 2 ? 7 : 4 });
        }
        // Dash Strike: medium range gap-closer
        if (this._atkCooldowns[ATK.DASH] <= 0 && dist > 3 && dist < this._dashRange) {
            avail.push({ t: ATK.DASH, w: dist > 6 ? 6 : 3 });
        }
        // Poison Blade: ranged attack, prefer at distance
        if (this._atkCooldowns[ATK.POISON] <= 0 && dist < this._poisonRange) {
            avail.push({ t: ATK.POISON, w: dist > 5 ? 5 : 2 });
        }
        // Teleport Behind: gap closer + backstab, prefer mid-range
        if (this._atkCooldowns[ATK.TELEPORT] <= 0 && dist > 2 && dist < this._teleportRange) {
            avail.push({ t: ATK.TELEPORT, w: dist > 4 ? 5 : 2 });
        }
        // Spinning Blades: AoE, when player is very close
        if (this._atkCooldowns[ATK.SPIN] <= 0 && dist < this._spinRange) {
            avail.push({ t: ATK.SPIN, w: dist < this.hitRadius + 2 ? 6 : 3 });
        }

        // Fallback: always allow dash or poison if nothing else available
        if (avail.length === 0 && this._atkCooldowns[ATK.DASH] <= 0 && dist < this._dashRange + 5) {
            avail.push({ t: ATK.DASH, w: 4 });
        }
        if (avail.length === 0 && this._atkCooldowns[ATK.POISON] <= 0) {
            avail.push({ t: ATK.POISON, w: 3 });
        }

        if (avail.length === 0) { this.attackCooldown = 0.25; return; }

        // Weighted random
        let total = 0;
        for (const a of avail) total += a.w;
        let r = Math.random() * total;
        let chosen = avail[0].t;
        for (const a of avail) { r -= a.w; if (r <= 0) { chosen = a.t; break; } }

        this.activeAttack = chosen;
        this.activeAttackTimer = 0;
        this._attackHitDealt = false;
        this.state = 'attack';

        switch (chosen) {
            case ATK.SLASH:
                this._attackDuration = 0.8;
                this._atkCooldowns[chosen] = 1.0;
                break;
            case ATK.DASH:
                this._attackDuration = 1.0;
                this._atkCooldowns[chosen] = 2.5;
                this._dashOrigin.copy(this.position);
                this._dashDir.subVectors(playerPos, this.position).normalize();
                this._dashDir.y = 0;
                break;
            case ATK.POISON:
                this._attackDuration = 0.9;
                this._atkCooldowns[chosen] = 2.0;
                break;
            case ATK.TELEPORT:
                this._attackDuration = 1.4;
                this._atkCooldowns[chosen] = 4.0;
                this._teleportOrigin.copy(this.position);
                break;
            case ATK.SPIN:
                this._attackDuration = 1.2;
                this._atkCooldowns[chosen] = 3.0;
                break;
        }
        this.globalAttackCooldown = this._attackDuration + 0.2;
    }

    _updateActiveAttack(dt, playerPos) {
        this.activeAttackTimer += dt;
        const t = this.activeAttackTimer;

        switch (this.activeAttack) {
            case ATK.SLASH:    this._tickSlash(dt, t, playerPos); break;
            case ATK.DASH:     this._tickDash(dt, t, playerPos); break;
            case ATK.POISON:   this._tickPoison(dt, t, playerPos); break;
            case ATK.TELEPORT: this._tickTeleport(dt, t, playerPos); break;
            case ATK.SPIN:     this._tickSpin(dt, t, playerPos); break;
        }

        if (t >= this._attackDuration) this._endAttack();
    }

    _endAttack() {
        this._light.intensity = 0;
        this._ringMesh.visible = false;
        this._skipMeshSync = false;
        this._isVanished = false;
        if (this.mesh) this.mesh.visible = true;
        this.activeAttack = -1;
        this.activeAttackTimer = 0;
        this.state = 'idle';
        this.attackCooldown = 0.1;

        // Reset emissive
        if (this.mesh) {
            this.mesh.traverse(c => {
                if (c.isMesh && c.material && !c.userData?.isOutline && 'emissive' in c.material) {
                    c.material.emissive.setHex(CLR.dark);
                    c.material.emissiveIntensity = 0.15;
                }
            });
        }
    }

    attack() {
        if (this.activeAttack >= 0 || this.globalAttackCooldown > 0) return this.damage;
        const dist = this._playerRef ? this.position.distanceTo(this._playerRef) : 999;
        this._pickAttack(dist, this._playerRef);
        return this.damage;
    }

    // ===================== QUICK SLASH =====================

    _tickSlash(dt, t, playerPos) {
        const windEnd = 0.25;
        const hitStart = 0.28;
        const hitEnd = 0.5;

        this._faceTarget(playerPos);

        if (t < windEnd) {
            const p = t / windEnd;
            // Quick backstep then lunge
            if (t < 0.12 && playerPos) {
                this._tmpVec.subVectors(this.position, playerPos).normalize();
                this._tmpVec.y = 0;
                this.position.addScaledVector(this._tmpVec, this.speed * 0.3 * dt);
                this._clampArena();
            } else if (playerPos) {
                this._tmpVec.subVectors(playerPos, this.position).normalize();
                this._tmpVec.y = 0;
                this.position.addScaledVector(this._tmpVec, this.speed * 0.8 * dt);
                this._clampArena();
            }

            // Green slash telegraph
            this._ringMesh.visible = true;
            this._ringMesh.position.set(this.position.x, 0.12, this.position.z);
            this._ringMat.color.setHex(CLR.primary);
            this._ringMesh.scale.setScalar(0.2 + p * 0.4);
            this._ringMat.opacity = 0.06 + p * 0.1;

            this._getHandPos(this._tmpVec);
            this._light.position.copy(this._tmpVec);
            this._light.intensity = p * 4;
            this._light.color.setHex(CLR.primary);
        }

        if (t >= hitStart && t <= hitEnd) {
            this._getHandPos(this._tmpVec);
            this._light.position.copy(this._tmpVec);
            this._light.intensity = 5 + 3 * Math.sin(t * 30);
            this._light.color.setHex(CLR.bright);

            // Slash particles
            if (Math.random() < 0.25) {
                this._spawnParticle(
                    this._tmpVec.x + (Math.random() - 0.5) * 0.5,
                    this._tmpVec.y + (Math.random() - 0.5) * 0.3,
                    this._tmpVec.z + (Math.random() - 0.5) * 0.5,
                    (Math.random() - 0.5) * 5, 2 + Math.random() * 3, (Math.random() - 0.5) * 5,
                    0.08, 0.25, CLR.bright
                );
            }

            if (!this._attackHitDealt && playerPos) {
                const dist = this.position.distanceTo(playerPos);
                if (dist < this._slashRange) {
                    this._getForward(this._tmpDir);
                    const toX = playerPos.x - this.position.x;
                    const toZ = playerPos.z - this.position.z;
                    const len = Math.sqrt(toX * toX + toZ * toZ) || 1;
                    const dot = (toX * this._tmpDir.x + toZ * this._tmpDir.z) / len;
                    if (dot > 0.15) {
                        this._dealDamage(22);
                        this._attackHitDealt = true;
                    }
                }
            }
        }

        if (t > hitEnd) {
            this._light.intensity = Math.max(0, this._light.intensity - dt * 40);
            this._ringMat.opacity = Math.max(0, this._ringMat.opacity - dt * 3);
            if (this._ringMat.opacity <= 0.01) this._ringMesh.visible = false;
        }
    }

    // ===================== DASH STRIKE =====================

    _tickDash(dt, t, playerPos) {
        const windEnd = 0.3;
        const dashStart = 0.3;
        const dashEnd = 0.65;
        const hitStart = 0.35;
        const hitEnd = 0.6;

        if (t < windEnd) {
            const p = t / windEnd;
            this._faceTarget(playerPos);
            // Update dash direction during windup
            if (playerPos) {
                this._dashDir.subVectors(playerPos, this.position).normalize();
                this._dashDir.y = 0;
            }

            // Crouching telegraph - green line toward target
            this._ringMesh.visible = true;
            this._ringMesh.position.set(this.position.x, 0.1, this.position.z);
            this._ringMat.color.setHex(CLR.warning);
            this._ringMesh.scale.setScalar(0.15 + p * 0.3);
            this._ringMat.opacity = 0.08 + p * 0.12;

            this._light.position.set(this.position.x, 0.8, this.position.z);
            this._light.intensity = p * 3;
            this._light.color.setHex(CLR.warning);

            // Crouch particles
            if (Math.random() < 0.08 * p) {
                this._spawnParticle(
                    this.position.x + (Math.random() - 0.5) * 0.4, 0.1,
                    this.position.z + (Math.random() - 0.5) * 0.4,
                    this._dashDir.x * 2, 0.5, this._dashDir.z * 2,
                    0.06, 0.3, CLR.warning
                );
            }
        }

        // Dash phase: fast movement along dash direction
        if (t >= dashStart && t <= dashEnd) {
            const dashSpeed = this.speed * 4.5;
            this.position.x += this._dashDir.x * dashSpeed * dt;
            this.position.z += this._dashDir.z * dashSpeed * dt;
            this._clampArena();

            // Trail particles
            if (Math.random() < 0.4) {
                this._spawnParticle(
                    this.position.x + (Math.random() - 0.5) * 0.3,
                    0.3 + Math.random() * 0.8,
                    this.position.z + (Math.random() - 0.5) * 0.3,
                    -this._dashDir.x * 3, 1 + Math.random(), -this._dashDir.z * 3,
                    0.1, 0.35, CLR.primary
                );
            }

            this._light.position.copy(this.position);
            this._light.position.y = 1;
            this._light.intensity = 8;
            this._light.color.setHex(CLR.bright);
        }

        // Hit check during dash
        if (t >= hitStart && t <= hitEnd && !this._attackHitDealt && playerPos) {
            const dist = this.position.distanceTo(playerPos);
            if (dist < this.hitRadius + 2.5) {
                this._dealDamage(28);
                this._attackHitDealt = true;
                // Impact burst
                for (let i = 0; i < 5; i++) {
                    const a = Math.random() * Math.PI * 2;
                    this._spawnParticle(
                        playerPos.x + Math.cos(a) * 0.3, 0.5 + Math.random(),
                        playerPos.z + Math.sin(a) * 0.3,
                        Math.cos(a) * 4, 2 + Math.random() * 2, Math.sin(a) * 4,
                        0.1, 0.3, CLR.bright
                    );
                }
            }
        }

        if (t > dashEnd) {
            this._light.intensity = Math.max(0, this._light.intensity - dt * 30);
            this._ringMat.opacity = Math.max(0, this._ringMat.opacity - dt * 3);
            if (this._ringMat.opacity <= 0.01) this._ringMesh.visible = false;
        }
    }

    // ===================== POISON BLADE =====================

    _tickPoison(dt, t, playerPos) {
        const throwTime = 0.35;

        this._faceTarget(playerPos);

        if (t < throwTime) {
            const p = t / throwTime;
            this._getHandPos(this._tmpVec);
            this._light.position.copy(this._tmpVec);
            this._light.intensity = p * 5;
            this._light.color.setHex(CLR.poison);

            // Charge-up particles at hand
            if (Math.random() < 0.12 * p) {
                this._spawnParticle(
                    this._tmpVec.x + (Math.random() - 0.5) * 0.3,
                    this._tmpVec.y + (Math.random() - 0.5) * 0.2,
                    this._tmpVec.z + (Math.random() - 0.5) * 0.3,
                    0, 1.5, 0, 0.06, 0.25, CLR.poison
                );
            }
        }

        // Throw the projectile
        if (t >= throwTime && !this._attackHitDealt && playerPos) {
            this._attackHitDealt = true;
            const dir = this._tmpVec.subVectors(playerPos, this.position).normalize();
            dir.y = 0;
            this._poisonProjectiles.push({
                x: this.position.x + dir.x * 0.8,
                y: 1.0,
                z: this.position.z + dir.z * 0.8,
                vx: dir.x * 22,
                vz: dir.z * 22,
                life: 0,
                maxLife: 1.2,
                damage: 18,
                hit: false
            });
        }

        if (t > throwTime) {
            this._light.intensity = Math.max(0, this._light.intensity - dt * 20);
        }
    }

    _updatePoisonProjectiles(dt, playerPos) {
        for (let i = this._poisonProjectiles.length - 1; i >= 0; i--) {
            const p = this._poisonProjectiles[i];
            p.life += dt;
            if (p.life >= p.maxLife) {
                this._poisonProjectiles.splice(i, 1);
                continue;
            }

            p.x += p.vx * dt;
            p.z += p.vz * dt;

            // Trail particles
            if (Math.random() < 0.3) {
                this._spawnParticle(
                    p.x + (Math.random() - 0.5) * 0.2, p.y,
                    p.z + (Math.random() - 0.5) * 0.2,
                    (Math.random() - 0.5) * 1.5, 0.5 + Math.random(), (Math.random() - 0.5) * 1.5,
                    0.08, 0.3, CLR.poison
                );
            }

            // Hit check
            if (!p.hit && playerPos) {
                const dx = p.x - playerPos.x;
                const dz = p.z - playerPos.z;
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist < 1.2) {
                    p.hit = true;
                    this._dealDamage(p.damage);
                    // Impact burst
                    for (let j = 0; j < 4; j++) {
                        const a = Math.random() * Math.PI * 2;
                        this._spawnParticle(
                            p.x + Math.cos(a) * 0.3, p.y,
                            p.z + Math.sin(a) * 0.3,
                            Math.cos(a) * 3, 2, Math.sin(a) * 3,
                            0.1, 0.35, CLR.bright
                        );
                    }
                    p.maxLife = p.life; // Kill projectile
                }
            }

            // Update visual (reuse single mesh for last active projectile)
            if (i === this._poisonProjectiles.length - 1) {
                this._poisonBladeMesh.visible = !p.hit;
                this._poisonBladeMesh.position.set(p.x, p.y, p.z);
                this._poisonBladeMesh.rotation.x = Math.PI / 2;
                this._poisonBladeMesh.rotation.y = Math.atan2(p.vx, p.vz);
            }
        }

        if (this._poisonProjectiles.length === 0) {
            this._poisonBladeMesh.visible = false;
        }
    }

    // ===================== TELEPORT BEHIND =====================

    _tickTeleport(dt, t, playerPos) {
        const vanishTime = 0.3;
        const reappearTime = 0.75;
        const hitStart = 0.85;
        const hitEnd = 1.1;

        // Phase 1: Vanish (0 - 0.3s)
        if (t < vanishTime) {
            const p = t / vanishTime;
            this._faceTarget(playerPos);

            // Swirl particles around body
            for (let i = 0; i < 2; i++) {
                if (Math.random() < 0.3 + p * 0.5) {
                    const a = Math.random() * Math.PI * 2;
                    const r = 0.4 + (1 - p) * 0.6;
                    this._spawnParticle(
                        this.position.x + Math.cos(a) * r,
                        0.3 + Math.random() * 1.5,
                        this.position.z + Math.sin(a) * r,
                        -Math.cos(a) * 3, 2, -Math.sin(a) * 3,
                        0.08, 0.3, CLR.primary
                    );
                }
            }

            this._light.position.copy(this.position);
            this._light.position.y = 1;
            this._light.intensity = p * 8;
            this._light.color.setHex(CLR.primary);

            // Fade mesh opacity
            if (this.mesh) {
                this.mesh.traverse(c => {
                    if (c.isMesh && c.material && !c.userData?.isOutline) {
                        if (!c.material._origTransparent) c.material._origTransparent = c.material.transparent;
                        c.material.transparent = true;
                        c.material.opacity = 1 - p;
                    }
                });
            }

            if (p > 0.9) {
                this._isVanished = true;
            }
        }

        // Phase 2: Vanished, moving to position behind player (0.3 - 0.75s)
        if (t >= vanishTime && t < reappearTime) {
            this._isVanished = true;
            this._light.intensity = Math.max(0, this._light.intensity - dt * 15);

            // Calculate position behind player
            if (playerPos) {
                // Get player's facing direction (approximate from rogue's last known direction)
                this._tmpVec.subVectors(this.position, playerPos).normalize();
                this._tmpVec.y = 0;
                // Place behind player (opposite of where rogue was)
                this._teleportTarget.set(
                    playerPos.x - this._tmpVec.x * 2.5,
                    this.position.y,
                    playerPos.z - this._tmpVec.z * 2.5
                );
            }
        }

        // Phase 3: Reappear (0.75s)
        if (t >= reappearTime && this._isVanished) {
            this._isVanished = false;
            this.position.copy(this._teleportTarget);
            this._clampArena();
            this._faceTarget(playerPos);

            // Reappear burst
            for (let i = 0; i < 8; i++) {
                const a = Math.random() * Math.PI * 2;
                this._spawnParticle(
                    this.position.x + Math.cos(a) * 0.5,
                    0.3 + Math.random() * 1.2,
                    this.position.z + Math.sin(a) * 0.5,
                    Math.cos(a) * 4, 2 + Math.random() * 2, Math.sin(a) * 4,
                    0.1, 0.35, CLR.bright
                );
            }

            this._light.position.copy(this.position);
            this._light.position.y = 1;
            this._light.intensity = 10;

            // Restore mesh opacity
            if (this.mesh) {
                this.mesh.traverse(c => {
                    if (c.isMesh && c.material && !c.userData?.isOutline) {
                        c.material.transparent = c.material._origTransparent || false;
                        c.material.opacity = 1.0;
                    }
                });
            }
        }

        // Phase 4: Backstab hit (0.85 - 1.1s)
        if (t >= reappearTime && !this._isVanished) {
            this._faceTarget(playerPos);

            // Lunge forward slightly
            if (playerPos && t < hitEnd) {
                this._tmpVec.subVectors(playerPos, this.position).normalize();
                this._tmpVec.y = 0;
                this.position.addScaledVector(this._tmpVec, this.speed * 0.6 * dt);
                this._clampArena();
            }
        }

        if (t >= hitStart && t <= hitEnd) {
            this._getHandPos(this._tmpVec);
            this._light.position.copy(this._tmpVec);
            this._light.intensity = 7;
            this._light.color.setHex(CLR.bright);

            if (Math.random() < 0.2) {
                this._spawnParticle(
                    this._tmpVec.x, this._tmpVec.y, this._tmpVec.z,
                    (Math.random() - 0.5) * 4, 2, (Math.random() - 0.5) * 4,
                    0.08, 0.25, CLR.bright
                );
            }

            if (!this._attackHitDealt && playerPos) {
                const dist = this.position.distanceTo(playerPos);
                if (dist < this._slashRange + 1) {
                    // Backstab does extra damage
                    this._dealDamage(35);
                    this._attackHitDealt = true;
                }
            }
        }

        if (t > hitEnd) {
            this._light.intensity = Math.max(0, this._light.intensity - dt * 30);
        }
    }

    // ===================== SPINNING BLADES =====================

    _tickSpin(dt, t, playerPos) {
        const windEnd = 0.35;
        const spinStart = 0.35;
        const spinEnd = 0.9;

        if (t < windEnd) {
            const p = t / windEnd;
            this._faceTarget(playerPos);

            // Growing green ring
            this._ringMesh.visible = true;
            this._ringMesh.position.set(this.position.x, 0.12, this.position.z);
            this._ringMat.color.setHex(CLR.primary);
            const pulse = 0.5 + 0.5 * Math.sin(t * (8 + p * 20));
            this._ringMesh.scale.setScalar(0.2 + p * 0.6);
            this._ringMat.opacity = (0.05 + p * 0.15) * (0.4 + 0.6 * pulse);

            this._light.position.set(this.position.x, 1.2, this.position.z);
            this._light.intensity = p * 6;
            this._light.color.setHex(CLR.primary);

            // Emissive buildup
            if (this.mesh) {
                this.mesh.traverse(c => {
                    if (c.isMesh && c.material && !c.userData?.isOutline && 'emissive' in c.material) {
                        c.material.emissive.setHex(CLR.primary);
                        c.material.emissiveIntensity = 0.15 + p * 0.4;
                    }
                });
            }
        }

        // Spin phase: rapid rotation + AoE damage
        if (t >= spinStart && t <= spinEnd) {
            // Spin the mesh rapidly
            this.mesh.rotation.y += dt * 25;
            this._skipMeshSync = true;
            this.mesh.position.copy(this.position);
            if (this._bossFloorOffset != null) this.mesh.position.y = this.position.y + this._bossFloorOffset;

            // Expanding ring
            this._ringMesh.visible = true;
            this._ringMesh.position.set(this.position.x, 0.14, this.position.z);
            this._ringMat.color.setHex(CLR.bright);
            const spinP = (t - spinStart) / (spinEnd - spinStart);
            this._ringMesh.scale.setScalar(0.5 + spinP * 0.5);
            this._ringMat.opacity = 0.2 + 0.1 * Math.sin(t * 40);

            this._light.position.set(this.position.x, 1.2, this.position.z);
            this._light.intensity = 8 + 4 * Math.sin(t * 30);
            this._light.color.setHex(CLR.bright);

            // Spiral particles
            if (Math.random() < 0.35) {
                const a = t * 12 + Math.random() * 0.5;
                const r = 0.5 + Math.random() * 1.5;
                this._spawnParticle(
                    this.position.x + Math.cos(a) * r, 0.5 + Math.random(),
                    this.position.z + Math.sin(a) * r,
                    Math.cos(a + 1.5) * 4, 1.5, Math.sin(a + 1.5) * 4,
                    0.1, 0.3, Math.random() < 0.5 ? CLR.bright : CLR.primary
                );
            }

            // Multi-hit: deal damage at 3 points during spin
            if (!this._attackHitDealt && playerPos) {
                const checkPoints = [0.4, 0.55, 0.7];
                for (const cp of checkPoints) {
                    if (t >= cp && t < cp + dt * 2) {
                        const dist = this.position.distanceTo(playerPos);
                        if (dist < this._spinRange) {
                            this._dealDamage(12);
                            this._attackHitDealt = true;
                            break;
                        }
                    }
                }
            }
        }

        if (t > spinEnd) {
            this._skipMeshSync = false;
            this._light.intensity = Math.max(0, this._light.intensity - dt * 25);
            this._ringMat.opacity = Math.max(0, this._ringMat.opacity - dt * 2);
            if (this._ringMat.opacity <= 0.01) this._ringMesh.visible = false;

            // Reset emissive
            if (this.mesh) {
                this.mesh.traverse(c => {
                    if (c.isMesh && c.material && !c.userData?.isOutline && 'emissive' in c.material) {
                        c.material.emissiveIntensity = Math.max(0.15, c.material.emissiveIntensity - dt * 2);
                    }
                });
            }
        }
    }

    // ===================== ANIMATION =====================

    _updateAnimation() {
        let targetAnim = 'Idle';
        let timeScale = 1.0;

        if (this.activeAttack >= 0) {
            switch (this.activeAttack) {
                case ATK.SLASH:
                    targetAnim = this.actions['Run'] ? 'Run' : 'Idle';
                    timeScale = 2.2;
                    break;
                case ATK.DASH:
                    targetAnim = this.actions['Run'] ? 'Run' : 'Idle';
                    if (this.activeAttackTimer < 0.3) timeScale = 0.5;
                    else timeScale = 3.0;
                    break;
                case ATK.POISON:
                    targetAnim = 'Idle';
                    timeScale = 1.5;
                    break;
                case ATK.TELEPORT:
                    if (this._isVanished) {
                        targetAnim = 'Idle';
                        timeScale = 0.3;
                    } else {
                        targetAnim = this.actions['Run'] ? 'Run' : 'Idle';
                        timeScale = 2.0;
                    }
                    break;
                case ATK.SPIN:
                    targetAnim = this.actions['Run'] ? 'Run' : 'Idle';
                    timeScale = 2.5;
                    break;
            }
        } else if (this.state === 'chase') {
            targetAnim = this.actions['Run'] ? 'Run' : (this.actions['Walk'] ? 'Walk' : 'Idle');
            timeScale = 1.2;
        } else if (this.state === 'stagger') {
            targetAnim = 'Idle';
            timeScale = 0.3;
        }

        if (!this.actions[targetAnim]) targetAnim = 'Idle';

        if (targetAnim !== this.currentAnimName && this.actions[targetAnim]) {
            const prev = this.actions[this.currentAnimName];
            if (prev) { prev.fadeOut(0.12); prev.setEffectiveTimeScale(1); }
            const next = this.actions[targetAnim];
            next.reset().fadeIn(0.12).play();
            this.currentAnimName = targetAnim;
        }

        const action = this.actions[this.currentAnimName];
        if (action) action.setEffectiveTimeScale(timeScale);
    }

    // ===================== DEATH =====================

    die() {
        this.isAlive = false;
        this.state = 'dead';
        this._endAttack();
        this._poisonProjectiles.length = 0;
        this._poisonBladeMesh.visible = false;

        for (const p of this._pool) { p.life = p.maxLife; p.mesh.visible = false; }

        // Death burst particles
        for (let i = 0; i < 12; i++) {
            const a = Math.random() * Math.PI * 2;
            this._spawnParticle(
                this.position.x + Math.cos(a) * 0.5,
                0.5 + Math.random() * 1.5,
                this.position.z + Math.sin(a) * 0.5,
                Math.cos(a) * 5, 3 + Math.random() * 3, Math.sin(a) * 5,
                0.15, 0.5, CLR.bright
            );
        }

        if (this.mixer && this.actions['Death']) {
            const prev = this.actions[this.currentAnimName];
            if (prev) prev.fadeOut(0.1);
            const da = this.actions['Death'];
            da.reset().setLoop(THREE.LoopOnce);
            da.clampWhenFinished = true;
            da.play();
            this.currentAnimName = 'Death';
            setTimeout(() => { if (this.mesh && this.scene) this.scene.remove(this.mesh); },
                Math.max(4000, da.getClip().duration * 1000 + 500));
            return;
        }

        // Fallback death: fall over
        const animate = () => {
            if (this.mesh && this.mesh.rotation.x < Math.PI / 2) {
                this.mesh.rotation.x += 0.08;
                requestAnimationFrame(animate);
            } else {
                setTimeout(() => { if (this.mesh && this.scene) this.scene.remove(this.mesh); }, 3000);
            }
        };
        animate();
    }
}
