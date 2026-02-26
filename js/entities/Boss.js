/**
 * Boss - Minotaur humanoid with Punch, Reverse Punch, and Charged Smash.
 * Uses pre-allocated VFX pool for zero-allocation particle effects.
 */

import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { Enemy } from './Enemy.js';

const BOSS_NAMES = ['Gorrath the Unbroken', 'Malkhor Ironhide', 'Thurnax Bloodhorn', 'Varok the Trampler', 'Grommash Skullsplitter'];
const BOSS_COLOR = 0x3a2818; // procedural fallback only; loaded GLB boss material pass is handled in AssetLoader

const ATK = { PUNCH: 0, REVERSE: 1, CHARGED: 2 };
const ATK_COUNT = 3;

const POOL_SIZE = 36;

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
            model.scale.setScalar(2.1);
            model.visible = true;
            model.traverse((child) => {
                if (child.isMesh && child.material) {
                    if (child.geometry?.isBufferGeometry) {
                        child.geometry.computeVertexNormals();
                        if (typeof child.geometry.normalizeNormals === 'function') {
                            child.geometry.normalizeNormals();
                        }
                    }
                    child.visible = true;
                    child.castShadow = true;
                    child.receiveShadow = true;
                    const wasArrayMaterial = Array.isArray(child.material);
                    const materials = wasArrayMaterial ? child.material : [child.material];
                    child.material = materials.map((m) => {
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
                        if ('envMap' in mat) mat.envMap = null;
                        if ('envMapIntensity' in mat) mat.envMapIntensity = 0.0;
                        if ('metalness' in mat) mat.metalness = 0.02;
                        if ('roughness' in mat) mat.roughness = 0.98;
                        if ('specularIntensity' in mat) mat.specularIntensity = 0.02;
                        if ('clearcoat' in mat) mat.clearcoat = 0.0;
                        if ('sheen' in mat) mat.sheen = 0.0;
                        if ('emissive' in mat) mat.emissive.setRGB(0, 0, 0);
                        if ('emissiveIntensity' in mat) mat.emissiveIntensity = 0.0;
                        if ('emissiveMap' in mat) mat.emissiveMap = null;
                        if (mat.map) {
                            mat.map.premultiplyAlpha = false;
                            mat.map.needsUpdate = true;
                        }
                        mat.needsUpdate = true;
                        return mat;
                    });
                    if (!wasArrayMaterial) child.material = child.material[0];
                }
            });

            this.mesh = model;
            this.mesh.userData.enemy = this;
            this.addToonOutline(this.mesh, 1.04);

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
                if (map['ReversePunch']) {
                    this.actions['ReversePunch'] = this.mixer.clipAction(map['ReversePunch']);
                    this.actions['ReversePunch'].setLoop(THREE.LoopOnce);
                    this.actions['ReversePunch'].clampWhenFinished = true;
                }
                if (map['Charged']) {
                    this.actions['Charged'] = this.mixer.clipAction(map['Charged']);
                    this.actions['Charged'].setLoop(THREE.LoopOnce);
                    this.actions['Charged'].clampWhenFinished = true;
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
            this._reverseRange = this.hitRadius + 6;
            this._chargedRange = this.hitRadius + 10;
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
        this._reverseRange = this.hitRadius + 6;
        this._chargedRange = this.hitRadius + 10;
        this._chaseStopDist = this.hitRadius + 1;
        this._initPool();
    }

    addToonOutline(root, thickness = 1.04) {
        if (!root) return;
        const outlineMat = new THREE.MeshBasicMaterial({
            color: 0x000000,
            side: THREE.BackSide,
            transparent: false,
            opacity: 1.0,
            depthWrite: true,
            depthTest: true,
            toneMapped: false,
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1
        });

        root.traverse((child) => {
            if (!child.isMesh || !child.geometry) return;
            if (child.userData?.isOutline) return;

            let outline = null;
            if (child.isSkinnedMesh && child.skeleton) {
                outline = new THREE.SkinnedMesh(child.geometry, outlineMat);
                outline.bind(child.skeleton, child.bindMatrix);
                outline.bindMode = child.bindMode;
            } else {
                outline = new THREE.Mesh(child.geometry, outlineMat);
            }

            outline.name = `${child.name || 'bossMesh'}_outline`;
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
        if (this._atkCooldowns[ATK.REVERSE] <= 0 && dist < this._reverseRange) {
            avail.push({ t: ATK.REVERSE, w: dist < this.hitRadius + 4 ? 5 : 2 });
        }
        if (this._atkCooldowns[ATK.CHARGED] <= 0 && dist < this._chargedRange) {
            avail.push({ t: ATK.CHARGED, w: dist > this.hitRadius + 3 ? 5 : 3 });
        }

        if (avail.length === 0 && this._atkCooldowns[ATK.CHARGED] <= 0 && dist < this._chargedRange + 4) {
            avail.push({ t: ATK.CHARGED, w: 5 });
        }
        if (avail.length === 0 && this._atkCooldowns[ATK.PUNCH] <= 0 && dist < this._reverseRange) {
            avail.push({ t: ATK.PUNCH, w: 4 });
        }
        if (avail.length === 0 && this._atkCooldowns[ATK.REVERSE] <= 0 && dist < this._chargedRange) {
            avail.push({ t: ATK.REVERSE, w: 3 });
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
                this._attackDuration = 1.55;
                this._atkCooldowns[chosen] = 1.6;
                break;
            case ATK.REVERSE:
                this._attackDuration = 1.75;
                this._atkCooldowns[chosen] = 2.4;
                break;
            case ATK.CHARGED:
                this._attackDuration = 2.55;
                this._atkCooldowns[chosen] = 4.2;
                break;
        }
        this.globalAttackCooldown = this._attackDuration + 0.3;
    }

    _updateActiveAttack(dt, playerPos) {
        this.activeAttackTimer += dt;
        const t = this.activeAttackTimer;

        if (this.activeAttack !== ATK.CHARGED || t < 1.0) this._faceTarget(playerPos);

        switch (this.activeAttack) {
            case ATK.PUNCH: this._tickPunch(dt, t, playerPos); break;
            case ATK.REVERSE: this._tickReversePunch(dt, t, playerPos); break;
            case ATK.CHARGED: this._tickChargedSmash(dt, t, playerPos); break;
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
        const hitStart = 0.58, hitEnd = 0.9;

        if (t < 0.28 && playerPos) {
            // Short backward windup before the punch.
            this._tmpVec.subVectors(this.position, playerPos).normalize();
            this._tmpVec.y = 0;
            this.position.addScaledVector(this._tmpVec, this.speed * 0.14 * dt);
            this._clampArena();
        } else if (t < hitStart * 0.5) {
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
            // Warmup telegraph ring for clearer read before damage frame.
            if (!this._ringMesh.visible) this._ringMesh.visible = true;
            this._ringMesh.position.set(this.position.x, 0.14, this.position.z);
            this._ringMat.color.setHex(0xffaa66);
            this._ringMat.opacity = 0.35;
            this._ringMesh.scale.setScalar(this.hitRadius * 0.42);

            if (Math.random() < 0.25) {
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
            this._ringMat.opacity = Math.max(0, this._ringMat.opacity - dt * 2.5);
            if (this._ringMat.opacity <= 0.01) this._ringMesh.visible = false;
        }
    }

    // ===================== REVERSE PUNCH =====================

    _tickReversePunch(dt, t, playerPos) {
        const hitStart = 0.68;
        const hitEnd = 1.06;

        if (t < hitStart * 0.45 && playerPos) {
            this._tmpVec.subVectors(playerPos, this.position).normalize();
            this._tmpVec.y = 0;
            this.position.addScaledVector(this._tmpVec, this.speed * 0.28 * dt);
            this._clampArena();
        }

        if (t > 0.35 && t < 0.8) {
            // Give reverse punch extra body twist for readability.
            this.mesh.rotation.y += dt * 1.8;
        }

        if (t >= hitStart && t <= hitEnd) {
            this._getFistPos(this._tmpVec);
            this._light.position.copy(this._tmpVec);
            this._light.intensity = 24 + 10 * Math.sin(t * 22);
            this._light.color.setHex(0xbb55cc);
            if (!this._ringMesh.visible) this._ringMesh.visible = true;
            this._ringMesh.position.set(this.position.x, 0.16, this.position.z);
            this._ringMat.color.setHex(0xcc88ff);
            this._ringMat.opacity = 0.4;
            this._ringMesh.scale.setScalar(this.hitRadius * 0.52);

            if (Math.random() < 0.3) {
                const s = this.hitRadius * 0.36;
                this._spawnParticle(
                    this._tmpVec.x + (Math.random() - 0.5) * s,
                    this._tmpVec.y + (Math.random() - 0.5) * s * 0.5,
                    this._tmpVec.z + (Math.random() - 0.5) * s,
                    (Math.random() - 0.5) * 4.6, 2 + Math.random() * 3.2, (Math.random() - 0.5) * 4.6,
                    0.1 + Math.random() * 0.1, 0.3 + Math.random() * 0.24, 0xcc66dd
                );
            }

            if (!this._attackHitDealt && playerPos) {
                const dist = this.position.distanceTo(playerPos);
                if (dist < this._reverseRange) {
                    this._dealDamage(34);
                    this._attackHitDealt = true;
                }
            }
        }

        if (t > hitEnd) {
            this._light.intensity = Math.max(0, this._light.intensity - dt * 45);
            this._ringMat.opacity = Math.max(0, this._ringMat.opacity - dt * 2.2);
            if (this._ringMat.opacity <= 0.01) this._ringMesh.visible = false;
        }
    }

    // ===================== CHARGED SMASH =====================

    _tickChargedSmash(dt, t, playerPos) {
        const windStart = 0.0;
        const windEnd = 1.2;
        const hitStart = 1.28;
        const hitEnd = 1.6;

        if (t >= windStart && t < windEnd) {
            // Charged pressure: walk the boss forward slowly while building VFX.
            if (playerPos) {
                this._tmpVec.subVectors(playerPos, this.position).normalize();
                this._tmpVec.y = 0;
                this.position.addScaledVector(this._tmpVec, this.speed * 0.18 * dt);
                this._clampArena();
            }

            const p = (t - windStart) / (windEnd - windStart);
            const pulse = 0.5 + 0.5 * Math.sin(t * 24);
            this._light.position.set(this.position.x, (this._bossHeight ?? 2.5) * 0.65, this.position.z);
            this._light.intensity = 8 + p * 40 + pulse * 8;
            this._light.color.setHex(0xaa2211);

            this._ringMesh.visible = true;
            this._ringMesh.position.set(this.position.x, 0.15, this.position.z);
            this._ringMesh.scale.setScalar(0.45 + p * (this.hitRadius * 0.42));
            this._ringMat.opacity = 0.45 + p * 0.35;
            this._ringMat.color.setHex(0xcc3300);
            // Telegraph pulse: the faster it pulses, the closer the slam.
            const pulseAlpha = 0.2 + 0.8 * (0.5 + 0.5 * Math.sin(t * (10 + p * 16)));
            this._ringMat.opacity *= pulseAlpha;

            if (Math.random() < 0.25) {
                const a = Math.random() * Math.PI * 2;
                const r = this.hitRadius * (0.35 + Math.random() * 0.5);
                this._spawnParticle(
                    this.position.x + Math.cos(a) * r,
                    0.25 + Math.random() * 1.4,
                    this.position.z + Math.sin(a) * r,
                    Math.cos(a) * (2 + Math.random() * 2), 2 + Math.random() * 3, Math.sin(a) * (2 + Math.random() * 2),
                    0.1 + Math.random() * 0.08, 0.35 + Math.random() * 0.25, 0xcc5511
                );
            }
        }

        if (t >= hitStart && t <= hitEnd) {
            if (!this._attackHitDealt && playerPos) {
                const aoeRadius = this.hitRadius + 7.5;
                const d = this.position.distanceTo(playerPos);
                if (d < aoeRadius) {
                    const scaled = Math.floor(65 * Math.max(0.28, 1 - d / aoeRadius));
                    this._dealDamage(scaled);
                }
                this._attackHitDealt = true;
            }

            this._ringMesh.visible = true;
            this._ringMesh.position.set(this.position.x, 0.16, this.position.z);
            this._ringMesh.scale.setScalar((this.hitRadius + 7.5) * 0.55);
            this._ringMat.opacity = 0.95;
            this._ringMat.color.setHex(0xff6633);
            this._light.intensity = 72;
        }

        if (t > hitEnd) {
            const ft = Math.min(1, (t - hitEnd) / Math.max(0.2, this._attackDuration - hitEnd));
            this._light.intensity = 72 * (1 - ft);
            this._ringMat.opacity = 0.95 * (1 - ft);
            this._ringMesh.scale.multiplyScalar(1 + dt * 1.3);
            if (ft >= 1) this._ringMesh.visible = false;
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
                    if (this.activeAttackTimer < 0.28) timeScale = 0.78;
                    else if (this.activeAttackTimer < 0.92) timeScale = 1.68;
                    else timeScale = 0.88;
                    break;
                case ATK.REVERSE:
                    targetAnim = this.actions['ReversePunch'] ? 'ReversePunch' : 'Attack';
                    if (this.activeAttackTimer < 0.36) timeScale = 0.76;
                    else if (this.activeAttackTimer < 1.05) timeScale = 1.72;
                    else timeScale = 0.86;
                    break;
                case ATK.CHARGED:
                    targetAnim = this.actions['Charged']
                        ? 'Charged'
                        : (this.actions['ReversePunch'] ? 'ReversePunch' : 'Attack');
                    // Slow windup then violent release.
                    if (this.activeAttackTimer < 1.1) timeScale = 0.52;
                    else if (this.activeAttackTimer < 1.68) timeScale = 2.25;
                    else timeScale = 0.9;
                    break;
            }
        } else if (this.state === 'chase') {
            targetAnim = this.actions['Run'] ? 'Run' : (this.actions['Walk'] ? 'Walk' : 'Idle');
            timeScale = 1.18;
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
