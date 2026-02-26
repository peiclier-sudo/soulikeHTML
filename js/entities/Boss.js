/**
 * Boss - Minotaur humanoid with Punch, Leap Slam, and Spin Attack.
 * Uses pre-allocated VFX pool for zero-allocation particle effects.
 */

import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { Enemy } from './Enemy.js';

const BOSS_NAMES = ['Gorrath the Unbroken', 'Malkhor Ironhide', 'Thurnax Bloodhorn', 'Varok the Trampler', 'Grommash Skullsplitter'];
const BOSS_COLOR = 0x5a3a2a;

const ATK = { PUNCH: 0, LEAPSLAM: 1, SPIN: 2 };
const ATK_COUNT = 3;

const POOL_SIZE = 60;

export class Boss extends Enemy {
    constructor(scene, position, config = {}) {
        const health = config.health ?? 2000;
        super(scene, position, {
            ...config,
            health,
            damage: config.damage ?? 25,
            speed: config.speed ?? 7.0,
            attackRange: config.attackRange ?? 30,
            detectionRange: config.detectionRange ?? 50
        });
        this.maxHealth = health;
        this.name = config.name ?? BOSS_NAMES[Math.floor(Math.random() * BOSS_NAMES.length)];
        this.isBoss = true;
        this.hitRadius = 2.0;

        this.activeAttack = -1;
        this.activeAttackTimer = 0;
        this._attackDuration = 0;
        this._attackHitDealt = false;
        this._atkCooldowns = new Float32Array(ATK_COUNT);
        this.globalAttackCooldown = 0;
        this._playerRef = null;
        this._gameState = null;
        this._skipMeshSync = false;

        this._leapStart = new THREE.Vector3();
        this._leapTarget = new THREE.Vector3();
        this._leapPeakY = 0;

        this._idleTimer = 0;
        this._strafeDir = 1;
    }

    createMesh(config) {
        this.mixer = null;
        this.actions = {};
        this.currentAnimName = null;

        const assets = config?.assets;
        const template = assets?.models?.boss;
        const animData = assets?.animations?.boss;

        if (template) {
            const model = SkeletonUtils.clone(template);
            model.scale.setScalar(9.0);
            model.visible = true;
            model.traverse((child) => {
                if (child.isMesh && child.material) {
                    child.visible = true;
                    child.castShadow = true;
                    child.receiveShadow = true;
                    child.material = child.material.clone();
                    if (child.material.color) child.material.color.setHex(BOSS_COLOR);
                    child.material.metalness = 0.35;
                    child.material.roughness = 0.7;
                }
            });

            this.mesh = model;
            this.mesh.userData.enemy = this;

            if (animData?.clips?.length > 0) {
                this.mixer = new THREE.AnimationMixer(model);
                const map = animData.map || {};

                this._rootBone = null;
                for (let i = 0; i < model.children.length; i++) {
                    const child = model.children[i];
                    if (child.isBone || child.type === 'Bone' || child.name === 'Armature' || child.isObject3D) {
                        this._rootBone = child;
                        break;
                    }
                }

                animData.clips.forEach((clip) => {
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
                if (map['Attack']) {
                    this.actions['Attack'] = this.mixer.clipAction(map['Attack']);
                    this.actions['Attack'].setLoop(THREE.LoopOnce);
                    this.actions['Attack'].clampWhenFinished = true;
                }
                if (map['Jumpattack']) {
                    this.actions['Jumpattack'] = this.mixer.clipAction(map['Jumpattack']);
                    this.actions['Jumpattack'].setLoop(THREE.LoopOnce);
                    this.actions['Jumpattack'].clampWhenFinished = true;
                }
                if (map['Turnattack']) {
                    this.actions['Turnattack'] = this.mixer.clipAction(map['Turnattack']);
                    this.actions['Turnattack'].setLoop(THREE.LoopOnce);
                    this.actions['Turnattack'].clampWhenFinished = true;
                }

                if (animData.clips.length === 1) {
                    const a = this.mixer.clipAction(animData.clips[0]);
                    if (!this.actions['Idle']) this.actions['Idle'] = a;
                    if (!this.actions['Run']) this.actions['Run'] = a;
                }

                const idle = this.actions['Idle'] || this.actions['Walk'] || Object.values(this.actions)[0];
                if (idle) {
                    this.currentAnimName = 'Idle';
                    idle.setLoop(THREE.LoopRepeat);
                    idle.reset().setEffectiveWeight(1).play();
                }
            }

            model.position.set(0, 0, 0);
            if (this.mixer) this.mixer.update(0);
            model.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(model);
            this._bossFloorOffset = -box.min.y;
            this._bossHeight = box.max.y - box.min.y;
            const sizeX = box.max.x - box.min.x;
            const sizeZ = box.max.z - box.min.z;
            this.hitRadius = Math.max(sizeX, sizeZ) * 0.5 + 0.5;

            this._punchRange = this.hitRadius + 5;
            this._spinRange = this.hitRadius + 7;
            this._leapMinRange = this.hitRadius + 2;
            this._leapMaxRange = 25;
            this._chaseStopDist = this.hitRadius + 1;

            console.log(`Boss created: hitRadius=${this.hitRadius.toFixed(1)}, height=${this._bossHeight.toFixed(1)}, floorOffset=${this._bossFloorOffset.toFixed(1)}`);

            model.position.copy(this.position);
            model.position.y = this.position.y + this._bossFloorOffset;

            this.scene.add(this.mesh);
            this._initPool();
            return;
        }
        this._createProceduralBoss(config);
        this._punchRange = this.hitRadius + 5;
        this._spinRange = this.hitRadius + 7;
        this._leapMinRange = this.hitRadius + 2;
        this._leapMaxRange = 25;
        this._chaseStopDist = this.hitRadius + 1;
        this._initPool();
    }

    _createProceduralBoss(config) {
        const group = new THREE.Group();
        const s = 1.5;
        const bodyMat = new THREE.MeshStandardMaterial({ color: BOSS_COLOR, roughness: 0.7, metalness: 0.3 });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.45 * s, 0.55 * s, 1.6 * s, 10), bodyMat);
        body.position.y = 0.8 * s;
        group.add(body);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.3 * s, 10, 10), bodyMat);
        head.position.y = 1.8 * s;
        group.add(head);
        this.mesh = group;
        this.mesh.position.copy(this.position);
        this.mesh.userData.enemy = this;
        this.mesh.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
        this._bossHeight = 2.5;
        this.hitRadius = 1.5;
        this.scene.add(this.mesh);
    }

    // ===================== VFX POOL =====================

    _initPool() {
        this._pool = [];
        this._tmpVec = this._tmpVec || new THREE.Vector3();
        this._tmpDir = this._tmpDir || new THREE.Vector3();
        const geo = new THREE.SphereGeometry(1, 5, 5);
        for (let i = 0; i < POOL_SIZE; i++) {
            const mat = new THREE.MeshBasicMaterial({ color: 0xaa6633, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.visible = false;
            mesh.frustumCulled = false;
            this.scene.add(mesh);
            this._pool.push({ mesh, mat, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, size: 0.15 });
        }
        this._poolReady = true;

        this._light = new THREE.PointLight(0xcc6633, 0, 30, 2);
        this.scene.add(this._light);

        this._ringGeo = new THREE.RingGeometry(1, 8, 24);
        this._ringMat = new THREE.MeshBasicMaterial({ color: 0xcc4400, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
        this._ringMesh = new THREE.Mesh(this._ringGeo, this._ringMat);
        this._ringMesh.rotation.x = -Math.PI / 2;
        this._ringMesh.visible = false;
        this.scene.add(this._ringMesh);
    }

    _spawnParticle(x, y, z, vx, vy, vz, size, maxLife, color) {
        for (let i = 0; i < this._pool.length; i++) {
            const p = this._pool[i];
            if (p.life >= p.maxLife) {
                p.mesh.position.set(x, y, z);
                p.vx = vx; p.vy = vy; p.vz = vz;
                p.size = size; p.life = 0; p.maxLife = maxLife;
                p.mat.color.setHex(color || 0xaa6633);
                p.mat.opacity = 0.9;
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
            p.vy -= 2 * dt;
            const t = p.life / p.maxLife;
            p.mat.opacity = 0.9 * (1 - t);
            p.mesh.scale.setScalar(p.size * (1 + t * 2));
        }
    }

    // ===================== HELPERS =====================

    _getFistPos(out) {
        const h = (this._bossHeight ?? 2.5) * 0.55;
        this._getForward(this._tmpDir);
        const reach = this.hitRadius * 0.8;
        out.set(
            this.position.x + this._tmpDir.x * reach,
            this.position.y + h,
            this.position.z + this._tmpDir.z * reach
        );
    }

    _resetRootMotion() {
        if (this._rootBone) {
            this._rootBone.position.set(0, 0, 0);
        }
    }

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
        const ab = 18.5;
        this.position.x = Math.max(-ab, Math.min(ab, this.position.x));
        this.position.z = Math.max(-ab, Math.min(ab, this.position.z));
    }

    setGameState(gs) { this._gameState = gs; }

    _dealDamage(amount) {
        if (this._gameState?.takeDamage) this._gameState.takeDamage(amount);
    }

    // ===================== UPDATE =====================

    update(deltaTime, playerPosition) {
        if (!this.isAlive) return;
        this._playerRef = playerPosition;

        this.globalAttackCooldown = Math.max(0, this.globalAttackCooldown - deltaTime);
        for (let i = 0; i < ATK_COUNT; i++) this._atkCooldowns[i] = Math.max(0, this._atkCooldowns[i] - deltaTime);

        if (this.staggerTimer > 0) {
            this.staggerTimer -= deltaTime;
            this.mesh.position.copy(this.position);
            if (this._bossFloorOffset != null) this.mesh.position.y = this.position.y + this._bossFloorOffset;
            if (this.mixer) { this.updateBossAnimation(); this.mixer.update(deltaTime); this._resetRootMotion(); }
            this._updatePool(deltaTime);
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

        if (this.mixer) { this.updateBossAnimation(); this.mixer.update(deltaTime); this._resetRootMotion(); }
        this._updatePool(deltaTime);
    }

    _updateAI(dt, playerPos) {
        if (this.attackCooldown > 0) this.attackCooldown -= dt;
        const dist = this.position.distanceTo(playerPos);

        if (this.attackCooldown <= 0 && this.globalAttackCooldown <= 0) {
            this._pickAndStartAttack(dist);
            if (this.activeAttack >= 0) return;
        }

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

            if (this._idleTimer > 1.0) {
                this.state = 'chase';
                this._getForward(this._tmpDir);
                const rightX = -this._tmpDir.z;
                const rightZ = this._tmpDir.x;
                this.position.x += rightX * this._strafeDir * this.speed * 0.4 * dt;
                this.position.z += rightZ * this._strafeDir * this.speed * 0.4 * dt;
                this._clampArena();
                if (this._idleTimer > 2.5) {
                    this._idleTimer = 0;
                    this._strafeDir *= -1;
                }
            } else {
                this.state = 'idle';
            }
        }
    }

    attack() {
        if (this.activeAttack >= 0 || this.globalAttackCooldown > 0) return this.damage;
        const dist = this._playerRef ? this.position.distanceTo(this._playerRef) : 999;
        this._pickAndStartAttack(dist);
        return this.damage;
    }

    _pickAndStartAttack(dist) {
        const avail = [];

        if (this._atkCooldowns[ATK.PUNCH] <= 0 && dist < this._punchRange) {
            avail.push({ t: ATK.PUNCH, w: dist < this.hitRadius + 3 ? 6 : 3 });
        }
        if (this._atkCooldowns[ATK.LEAPSLAM] <= 0 && dist >= this._leapMinRange && dist < this._leapMaxRange) {
            avail.push({ t: ATK.LEAPSLAM, w: 5 });
        }
        if (this._atkCooldowns[ATK.SPIN] <= 0 && dist < this._spinRange) {
            avail.push({ t: ATK.SPIN, w: dist < this.hitRadius + 4 ? 5 : 2 });
        }

        if (avail.length === 0 && this._atkCooldowns[ATK.LEAPSLAM] <= 0 && dist < this._leapMaxRange) {
            avail.push({ t: ATK.LEAPSLAM, w: 5 });
        }
        if (avail.length === 0 && this._atkCooldowns[ATK.PUNCH] <= 0 && dist < this._spinRange) {
            avail.push({ t: ATK.PUNCH, w: 4 });
        }
        if (avail.length === 0 && this._atkCooldowns[ATK.SPIN] <= 0 && dist < this._leapMaxRange) {
            avail.push({ t: ATK.SPIN, w: 3 });
        }

        if (avail.length === 0) { this.attackCooldown = 0.3; return; }

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
            case ATK.PUNCH:
                this._attackDuration = 2.2;
                this._atkCooldowns[chosen] = 2.0;
                break;
            case ATK.LEAPSLAM:
                this._attackDuration = 2.7;
                this._atkCooldowns[chosen] = 4.5;
                this._leapStart.copy(this.position);
                this._leapTarget.copy(this._playerRef || this.position);
                const leapDist = this._leapStart.distanceTo(this._leapTarget);
                this._leapPeakY = Math.min(10, leapDist * 0.4);
                break;
            case ATK.SPIN:
                this._attackDuration = 2.5;
                this._atkCooldowns[chosen] = 3.5;
                break;
        }
        this.globalAttackCooldown = this._attackDuration + 0.3;
    }

    _updateActiveAttack(dt, playerPos) {
        this.activeAttackTimer += dt;
        const t = this.activeAttackTimer;

        if (this.activeAttack !== ATK.LEAPSLAM || t < 0.3) this._faceTarget(playerPos);

        switch (this.activeAttack) {
            case ATK.PUNCH: this._tickPunch(dt, t, playerPos); break;
            case ATK.LEAPSLAM: this._tickLeapSlam(dt, t, playerPos); break;
            case ATK.SPIN: this._tickSpin(dt, t, playerPos); break;
        }

        if (t >= this._attackDuration) this._endAttack();
    }

    _endAttack() {
        this._light.intensity = 0;
        this._ringMesh.visible = false;
        this._skipMeshSync = false;
        this.activeAttack = -1;
        this.activeAttackTimer = 0;
        this.state = 'idle';
        this.attackCooldown = 0.15;
    }

    // ===================== PUNCH =====================

    _tickPunch(dt, t, playerPos) {
        const hitStart = 0.8, hitEnd = 1.2;

        if (t < hitStart * 0.5) {
            if (playerPos) {
                this._tmpVec.subVectors(playerPos, this.position).normalize();
                this._tmpVec.y = 0;
                this.position.addScaledVector(this._tmpVec, this.speed * 0.5 * dt);
                this._clampArena();
            }
        }

        if (t >= hitStart && t <= hitEnd) {
            this._getFistPos(this._tmpVec);
            this._light.position.copy(this._tmpVec);
            this._light.intensity = 20 + 8 * Math.sin(t * 20);
            this._light.color.setHex(0xcc6633);

            if (Math.random() < 0.5) {
                const s = this.hitRadius * 0.3;
                this._spawnParticle(
                    this._tmpVec.x + (Math.random() - 0.5) * s,
                    this._tmpVec.y + (Math.random() - 0.5) * s * 0.5,
                    this._tmpVec.z + (Math.random() - 0.5) * s,
                    (Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4,
                    0.1 + Math.random() * 0.08, 0.3 + Math.random() * 0.2, 0xddaa44
                );
            }

            if (!this._attackHitDealt && playerPos) {
                const dist = this.position.distanceTo(playerPos);
                if (dist < this._punchRange) {
                    this._getForward(this._tmpDir);
                    const toX = playerPos.x - this.position.x;
                    const toZ = playerPos.z - this.position.z;
                    const len = Math.sqrt(toX * toX + toZ * toZ) || 1;
                    const dot = (toX * this._tmpDir.x + toZ * this._tmpDir.z) / len;
                    if (dot > 0.2) {
                        this._dealDamage(30);
                        this._attackHitDealt = true;
                    }
                }
            }
        }

        if (t > hitEnd) {
            this._light.intensity = Math.max(0, this._light.intensity - dt * 50);
        }
    }

    // ===================== LEAP SLAM =====================

    _tickLeapSlam(dt, t, playerPos) {
        const windEnd = 0.5;
        const airStart = 0.5;
        const landAt = 1.8;

        if (t < windEnd) {
            this._faceTarget(playerPos);
            const wt = t / windEnd;
            this.mesh.position.copy(this.position);
            this.mesh.position.y = (this._bossFloorOffset ?? 0) - wt * 0.5;
            this._skipMeshSync = true;
        } else if (t < landAt) {
            const ct = (t - airStart) / (landAt - airStart);
            const e = ct * ct * (3 - 2 * ct);
            this.position.lerpVectors(this._leapStart, this._leapTarget, e);
            this._clampArena();

            const arc = Math.sin(ct * Math.PI) * this._leapPeakY;
            this.mesh.position.copy(this.position);
            this.mesh.position.y = (this._bossFloorOffset ?? 0) + arc;
            this._skipMeshSync = true;

            if (Math.random() < 0.4) {
                const s = this.hitRadius * 0.5;
                this._spawnParticle(
                    this.position.x + (Math.random() - 0.5) * s, 0.5 + Math.random(), this.position.z + (Math.random() - 0.5) * s,
                    (Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3,
                    0.08 + Math.random() * 0.06, 0.3 + Math.random() * 0.2, 0x886644
                );
            }
        } else {
            this._skipMeshSync = false;

            if (!this._attackHitDealt) {
                this._attackHitDealt = true;

                this._ringMesh.visible = true;
                this._ringMesh.position.set(this.position.x, 0.1, this.position.z);
                this._ringMesh.scale.setScalar(0.2);
                this._ringMat.opacity = 0.9;
                this._ringMat.color.setHex(0xcc6633);

                this._light.position.set(this.position.x, 2, this.position.z);
                this._light.intensity = 60;
                this._light.color.setHex(0xcc4400);

                const aoeRadius = this.hitRadius + 6;
                for (let i = 0; i < 24; i++) {
                    const a = (i / 24) * Math.PI * 2;
                    const r = 1 + Math.random() * aoeRadius * 0.6;
                    this._spawnParticle(
                        this.position.x + Math.cos(a) * r, 0.3, this.position.z + Math.sin(a) * r,
                        Math.cos(a) * (5 + Math.random() * 5), 4 + Math.random() * 5, Math.sin(a) * (5 + Math.random() * 5),
                        0.1 + Math.random() * 0.08, 0.5 + Math.random() * 0.4, 0x886644
                    );
                }

                if (playerPos) {
                    const d = this.position.distanceTo(playerPos);
                    if (d < aoeRadius) this._dealDamage(Math.floor(45 * Math.max(0.2, 1 - d / aoeRadius)));
                }
            }

            const st = (t - landAt) / (this._attackDuration - landAt);
            const ringScale = this.hitRadius + 6;
            this._ringMesh.scale.setScalar(0.2 + Math.min(1, st * 2) * ringScale * 0.4);
            this._ringMat.opacity = 0.9 * (1 - st);
            this._light.intensity = 60 * (1 - st);
            if (st >= 1) { this._ringMesh.visible = false; this._light.intensity = 0; }
        }
    }

    // ===================== SPIN ATTACK =====================

    _tickSpin(dt, t, playerPos) {
        const hitStart = 0.8, hitEnd = 1.5;

        if (t < hitStart * 0.5 && playerPos) {
            this._tmpVec.subVectors(playerPos, this.position).normalize();
            this._tmpVec.y = 0;
            this.position.addScaledVector(this._tmpVec, this.speed * 0.3 * dt);
            this._clampArena();
        }

        if (t >= hitStart && t <= hitEnd) {
            const spinProgress = (t - hitStart) / (hitEnd - hitStart);
            const spinAngle = spinProgress * Math.PI * 2;
            this.mesh.rotation.y += dt * 14;

            if (!this._ringMesh.visible) {
                this._ringMesh.visible = true;
                this._ringMesh.position.set(this.position.x, 0.3, this.position.z);
                this._ringMesh.scale.setScalar(0.5);
            }
            this._ringMat.opacity = 0.6 * (1 - spinProgress);
            this._ringMat.color.setHex(0xcc6633);
            const ringScale = this.hitRadius * 0.8;
            this._ringMesh.scale.setScalar(0.5 + spinProgress * ringScale);

            this._light.position.set(this.position.x, 2, this.position.z);
            this._light.intensity = 25 + 12 * Math.sin(t * 15);
            this._light.color.setHex(0xcc6633);

            if (Math.random() < 0.6) {
                const pAngle = spinAngle + (Math.random() - 0.5);
                const r = this.hitRadius * 0.6 + Math.random() * 2;
                this._spawnParticle(
                    this.position.x + Math.cos(pAngle) * r,
                    0.5 + Math.random() * 2,
                    this.position.z + Math.sin(pAngle) * r,
                    Math.cos(pAngle) * 6, 2 + Math.random() * 3, Math.sin(pAngle) * 6,
                    0.08 + Math.random() * 0.06, 0.3 + Math.random() * 0.2, 0xddaa44
                );
            }

            if (!this._attackHitDealt && playerPos) {
                const dist = this.position.distanceTo(playerPos);
                if (dist < this._spinRange) {
                    this._dealDamage(35);
                    this._attackHitDealt = true;
                }
            }
        }

        if (t > hitEnd) {
            this._ringMesh.visible = false;
            this._light.intensity = Math.max(0, this._light.intensity - dt * 50);
        }
    }

    // ===================== ANIMATION =====================

    updateBossAnimation() {
        let targetAnim = 'Idle';
        let timeScale = 1.0;

        if (this.activeAttack >= 0) {
            switch (this.activeAttack) {
                case ATK.PUNCH:
                    targetAnim = 'Attack';
                    timeScale = 1.0;
                    break;
                case ATK.LEAPSLAM:
                    targetAnim = 'Jumpattack';
                    timeScale = 1.0;
                    break;
                case ATK.SPIN:
                    targetAnim = 'Turnattack';
                    timeScale = 1.0;
                    break;
            }
        } else if (this.state === 'chase') {
            targetAnim = this.actions['Run'] ? 'Run' : (this.actions['Walk'] ? 'Walk' : 'Idle');
            timeScale = 1.3;
        } else if (this.state === 'stagger') {
            targetAnim = 'Idle';
            timeScale = 0.3;
        }

        if (!this.actions[targetAnim]) targetAnim = 'Idle';

        if (targetAnim !== this.currentAnimName && this.actions[targetAnim]) {
            const prev = this.actions[this.currentAnimName];
            if (prev) { prev.fadeOut(0.15); prev.setEffectiveTimeScale(1); }
            const next = this.actions[targetAnim];
            next.reset().fadeIn(0.15).play();
            this.currentAnimName = targetAnim;
        }

        const action = this.actions[this.currentAnimName];
        if (action) action.setEffectiveTimeScale(timeScale);
    }

    die() {
        this.isAlive = false;
        this.state = 'dead';
        this._endAttack();

        for (const p of this._pool) { p.life = p.maxLife; p.mesh.visible = false; }

        if (this.mixer && this.actions['Death']) {
            const prev = this.actions[this.currentAnimName];
            if (prev) prev.fadeOut(0.1);
            const da = this.actions['Death'];
            da.reset().setLoop(THREE.LoopOnce);
            da.clampWhenFinished = true;
            da.play();
            this.currentAnimName = 'Death';
            setTimeout(() => { if (this.mesh && this.scene) this.scene.remove(this.mesh); }, Math.max(4000, da.getClip().duration * 1000 + 500));
            return;
        }
        const animate = () => {
            if (this.mesh && this.mesh.rotation.x < Math.PI / 2) {
                this.mesh.rotation.x += 0.06;
                requestAnimationFrame(animate);
            } else {
                setTimeout(() => { if (this.mesh && this.scene) this.scene.remove(this.mesh); }, 4000);
            }
        };
        animate();
    }
}
