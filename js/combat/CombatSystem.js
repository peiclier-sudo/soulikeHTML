/**
 * Combat System - Handles attacks, combos, and hit detection
 */

import * as THREE from 'three';
import { createBloodFireMaterial, updateBloodFireMaterial } from '../shaders/BloodFireShader.js';
import { createBloodFireVFX } from '../effects/BloodFireVFX.js';
import { createIceMaterial, updateIceMaterial } from '../shaders/IceShader.js';
import { FrostCombat } from './FrostCombat.js';
import { DaggerCombat } from './DaggerCombat.js';

export class CombatSystem {
    constructor(scene, character, gameState, particleSystem = null, onProjectileHit = null) {
        this.scene = scene;
        this.character = character;
        this.gameState = gameState;
        this.particleSystem = particleSystem;
        this.onProjectileHit = onProjectileHit;

        // Read kit combat config (falls back to Blood Mage defaults if no kit set)
        const kit = gameState.selectedKit;
        const kc = kit?.combat || {};
        const basic = kc.basicAttack || {};
        const charged = kc.chargedAttack || {};
        const abilQ = kc.abilityQ || {};
        const abilE = kc.abilityE || {};
        const abilX = kc.abilityX || {};
        const abilC = kc.abilityC || {};
        const abilF = kc.abilityF || {};

        // Raycaster for hit detection
        this.raycaster = new THREE.Raycaster();

        // Attack properties (2x faster - Basic attack animation only)
        this.attackDuration = 0.25;
        this.attackTimer = 0;
        this.comboWindow = 0.15;
        this.comboTimer = 0;
        this.maxCombo = 3;

        // Projectiles (fireballs)
        this.projectiles = [];

        // Kit-driven basic/charged projectile params
        this.basicDamage = basic.damage ?? 20;
        this.basicSpeed = basic.speed ?? 20;
        this.basicRadius = basic.radius ?? 0.25;
        this.basicLifetime = basic.lifetime ?? 1.5;
        this.chargedDamage = charged.damage ?? 55;
        this.chargedSpeed = charged.speed ?? 20;
        this.chargedRadius = charged.radius ?? 0.72;
        this.chargedLifetime = charged.lifetime ?? 2.4;

        // Charge orb (grows at hand while charging)
        this.chargeOrb = null;

        // Charged attack (right click hold then release)
        this.chargeTimer = 0;
        this.chargeDuration = charged.chargeDuration ?? 1.0;
        this.minChargeToRelease = this.chargeDuration;
        this.chargedAttackTimer = 0;
        this.chargedAttackDuration = 0.55;

        // Enemies in scene (for hit detection)
        this.enemies = [];
        // Reused in updateProjectiles to avoid per-frame allocations
        this._velNorm = new THREE.Vector3();
        this._deltaPos = new THREE.Vector3();
        this._enemyPos = new THREE.Vector3();
        this._centerFlat = new THREE.Vector3();

        this.poolBasic = [];
        this.poolCharged = [];
        this.maxPoolSize = 8;
        this._warmupDone = false;

        this._ultimatePool = null;

        // Ultimate: Zangetsu-style blood crescent slash (piercing, high damage)
        this.ultimateSlash = null;
        this._ultimateHitSet = new Set(); // enemies already hit by current slash
        this.ultimateDamage = abilF.damage ?? 120;

        // E spell: Blood Crescend discharge, scales with bleed stacks
        this.bloodCrescend = null;

        // Crimson Eruption / Q ability: ground target circle
        this.crimsonEruptionPreview = null;
        this.crimsonEruptionRadius = abilQ.radius ?? 3.5;
        this.crimsonEruptionCooldown = 0;
        this.crimsonEruptionCooldownDuration = abilQ.cooldown ?? 8;
        this.crimsonEruptionDamage = abilQ.damage ?? 50;
        this.crimsonEruptionVfx = null;

        // Whip/finisher (E ability): CAC blood-fire slash, impactful
        this.whipTimer = null;
        this.whipDuration = 0.48;
        this.whipRange = abilE.range ?? 3.8;
        this.whipDamage = abilE.baseDamage ?? 45;
        this.whipHitOnce = false;

        // Life drain (X): channel 2.5s, damage target and heal self (WoW-style)
        this.lifeDrainDuration = 2.5;
        this.lifeDrainTimer = 0;
        this.lifeDrainTarget = null;       // enemy (userData.enemy)
        this.lifeDrainTargetMesh = null;   // mesh for position
        this.lifeDrainCooldown = 0;
        this.lifeDrainCooldownDuration = 12;
        this.lifeDrainTickInterval = 0.25;
        this.lifeDrainNextTick = 0;
        this.lifeDrainDamagePerTick = 8;
        this.lifeDrainHealRatio = 1;      // 100% of damage as heal
        this.lifeDrainRange = 16;
        this.lifeDrainBeam = null;
        this.lifeDrainBeamTime = 0;
        this._drainBeamMats = [];
        this._drainBeamGeoms = [];
        this._drainBeamSegments = [];
        this._drainZapNumPointsMax = 140;
        this._drainMaxSegmentLength = 0.11;
        this._drainTargetLight = null;
        this._drainRight = new THREE.Vector3();
        this._drainUp = new THREE.Vector3();
        this._drainPath = Array.from({ length: 140 }, () => new THREE.Vector3());
        this._lastDrainBloodSecond = 0; // +1 blood charge per full second of life drain

        // Blood Nova / X ability: short blood burst that roots/freezes enemies
        this.bloodNovaCooldown = 0;
        this.bloodNovaCooldownDuration = abilX.cooldown ?? 10;
        this.bloodNovaRadius = abilX.radius ?? 12;
        this.bloodNovaDamage = abilX.damage ?? 35;
        this.bloodNovaFreezeDuration = abilX.freezeDuration ?? 2.4;
        this.bloodNovaWindup = 0;
        this.bloodNovaWindupDuration = 0.12;
        this._bloodNovaPendingCenter = new THREE.Vector3();
        this._bloodNovaPreview = null;

        // Shield duration from kit
        this.shieldDuration = abilC.duration ?? 6;

        // Kit-specific combat module
        this.isFrostKit = (kit?.id === 'frost_mage');
        this.frostCombat = this.isFrostKit ? new FrostCombat(this) : null;
        this.isDaggerKit = (kit?.id === 'shadow_assassin');
        this.daggerCombat = this.isDaggerKit ? new DaggerCombat(this) : null;
    }

    /** Crescent / croissant shape for ultimate slash (arc shape) */
    _createCrescentGeometry(innerRadius, outerRadius, angleSpan, segments = 32) {
        const shape = new THREE.Shape();
        const startAngle = 0;
        const endAngle = angleSpan;
        shape.absarc(0, 0, outerRadius, startAngle, endAngle, false);
        shape.absarc(0, 0, innerRadius, endAngle, startAngle, true);
        const geom = new THREE.ShapeGeometry(shape);
        geom.rotateX(-Math.PI / 2);
        // Mirror in plane so round (convex) edge faces shot direction; mesh still faces camera
        geom.scale(1, 1, -1);
        return geom;
    }

    /**
     * Call once after scene/camera/renderer are ready to compile BloodFire shaders off the first attack.
     */
    warmupShaders(renderer, scene, camera) {
        if (this._warmupDone || !renderer || !scene || !camera) return;
        this._warmupDone = true;

        const dummyPos = new THREE.Vector3(0, 0, -200);
        const dummyDir = new THREE.Vector3(0, 0, -1);

        for (let i = 0; i < 6; i++) this.poolBasic.push(this._createProjectile(false, dummyPos, dummyDir));
        for (let i = 0; i < 3; i++) this.poolCharged.push(this._createProjectile(true, dummyPos, dummyDir));
        this._ultimatePool = this._createUltimateOrb();

        const allMeshes = [];
        const setFrustumCull = (obj, val) => {
            obj.frustumCulled = val;
            if (obj.children) obj.children.forEach(c => setFrustumCull(c, val));
        };
        for (const p of this.poolBasic) {
            scene.add(p.mesh); p.mesh.position.set(0, -500, 0);
            setFrustumCull(p.mesh, false);
            allMeshes.push(p);
        }
        for (const p of this.poolCharged) {
            scene.add(p.mesh); p.mesh.position.set(0, -500, 0);
            setFrustumCull(p.mesh, false);
            allMeshes.push(p);
        }
        scene.add(this._ultimatePool.group);
        this._ultimatePool.group.position.set(0, -500, 0);
        setFrustumCull(this._ultimatePool.group, false);

        renderer.render(scene, camera);

        for (const p of allMeshes) {
            setFrustumCull(p.mesh, true);
            scene.remove(p.mesh);
        }
        setFrustumCull(this._ultimatePool.group, true);
        scene.remove(this._ultimatePool.group);
    }

    _createProjectile(isCharged, startPos, dir) {
        const radius = isCharged ? this.chargedRadius : this.basicRadius;
        const speed = isCharged ? this.chargedSpeed : this.basicSpeed;
        const seg = isCharged ? 12 : 8;
        const group = new THREE.Group();
        group.position.copy(startPos);
        group.castShadow = false;

        const materials = [];
        const geometries = [];

        const outerMat = createBloodFireMaterial({
            coreBrightness: isCharged ? 1.0 : 0.9,
            plasmaSpeed: isCharged ? 3.5 : 3.8,
            isCharged: isCharged ? 1.0 : 0.0,
            layerScale: isCharged ? 0.7 : 0.85,
            rimPower: isCharged ? 2.0 : 1.8,
            redTint: 0.92
        });
        outerMat.uniforms.alpha.value = isCharged ? 0.5 : 0.45;
        const outerGeo = new THREE.SphereGeometry(radius, seg, seg);
        group.add(new THREE.Mesh(outerGeo, outerMat));
        materials.push(outerMat);
        geometries.push(outerGeo);

        const coreMat = createBloodFireMaterial({
            coreBrightness: isCharged ? 2.2 : 2.0,
            plasmaSpeed: isCharged ? 6.5 : 5.5,
            isCharged: isCharged ? 1.0 : 0.0,
            layerScale: isCharged ? 1.6 : 1.3,
            rimPower: isCharged ? 2.0 : 1.8,
            redTint: 0.92
        });
        const coreGeo = new THREE.SphereGeometry(radius * 0.55, seg, seg);
        group.add(new THREE.Mesh(coreGeo, coreMat));
        materials.push(coreMat);
        geometries.push(coreGeo);

        const vfx = createBloodFireVFX(this.scene, group, { isCharged });
        const velocity = new THREE.Vector3().copy(dir).normalize().multiplyScalar(speed);
        return {
            mesh: group, velocity, lifetime: 0,
            maxLifetime: isCharged ? this.chargedLifetime : this.basicLifetime,
            damage: isCharged ? this.chargedDamage : this.basicDamage,
            releaseBurst: isCharged ? 0.15 : 0,
            isCharged: !!isCharged,
            materials, geometries, vfx
        };
    }
    
    /** Get best target for life drain: first enemy hit by raycast in front, or closest in range */
    getLifeDrainTarget() {
        const origin = this.character.getWeaponPosition().clone();
        const forward = this.character.getForwardDirection().clone().normalize();
        this.raycaster.set(origin, forward);
        this.raycaster.far = this.lifeDrainRange;
        const intersects = this.raycaster.intersectObjects(this.enemies, true);
        if (intersects.length > 0) {
            const enemy = this._getEnemyFromHitObject(intersects[0].object);
            if (enemy && enemy.isAlive !== false && enemy.health > 0) return { enemy, mesh: intersects[0].object };
        }
        let closest = null;
        let closestDist = this.lifeDrainRange;
        const charPos = this.character.position;
        for (const enemyMesh of this.enemies) {
            if (!enemyMesh.userData?.enemy) continue;
            const enemy = enemyMesh.userData.enemy;
            if (enemy.isAlive === false || enemy.health <= 0) continue;
            enemyMesh.getWorldPosition(this._enemyPos);
            const dist = charPos.distanceTo(this._enemyPos);
            if (dist > closestDist) continue;
            const toEnemy = this._enemyPos.clone().sub(charPos).normalize();
            if (toEnemy.dot(forward) < 0.4) continue;
            closestDist = dist;
            closest = { enemy, mesh: enemyMesh };
        }
        return closest;
    }



    _getDamageAnchorId(enemy) {
        if (!enemy) return null;
        if (!enemy._damageAnchorId) enemy._damageAnchorId = `enemy-${Math.random().toString(36).slice(2, 10)}`;
        return enemy._damageAnchorId;
    }



    _ensureBloodNovaPreview() {
        if (this._bloodNovaPreview) return;
        const r = this.bloodNovaRadius * 0.85;
        const geo = new THREE.RingGeometry(r - 0.22, r + 0.18, 64);
        const mat = new THREE.MeshBasicMaterial({
            color: 0xaa1030,
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.visible = false;
        this.scene.add(mesh);
        this._bloodNovaPreview = { mesh, geo, mat };
    }

    _beginBloodNova(center) {
        this._bloodNovaPendingCenter.copy(center);
        this.bloodNovaWindup = this.bloodNovaWindupDuration;
        this._ensureBloodNovaPreview();
        if (this._bloodNovaPreview) {
            const p = this._bloodNovaPreview;
            p.mesh.position.copy(center);
            p.mesh.position.y = 0.03;
            p.mesh.scale.setScalar(0.1);
            p.mat.opacity = 0.0;
            p.mesh.visible = true;
        }
        if (this.particleSystem) {
            this.particleSystem.emitSparks(center, 18);
            this.particleSystem.emitEmbers(center, 12);
        }
        if (this.onProjectileHit) this.onProjectileHit({ whipWindup: true });
    }

    _releaseBloodNova() {
        const center = this._bloodNovaPendingCenter.clone();
        let hitCount = 0;
        for (const enemyMesh of this.enemies) {
            const enemy = enemyMesh.userData?.enemy;
            if (!enemy || enemy.isAlive === false || enemy.health <= 0) continue;
            enemyMesh.getWorldPosition(this._enemyPos);
            const dist = center.distanceTo(this._enemyPos);
            const modelRadius = enemy.hitRadius ?? (enemy.isBoss ? 2.5 : 0.8);
            if (dist > this.bloodNovaRadius + modelRadius) continue;
            enemy.takeDamage(this.bloodNovaDamage);
            enemy.staggerTimer = Math.max(enemy.staggerTimer, this.bloodNovaFreezeDuration + (enemy.isBoss ? 0.8 : 0.0));
            enemy.state = 'stagger';
            hitCount++;
            this.gameState.emit('damageNumber', {
                position: this._enemyPos.clone(),
                damage: this.bloodNovaDamage,
                isCritical: enemy.isBoss === true,
                kind: 'ability',
                anchorId: this._getDamageAnchorId(enemy)
            });
        }
        if (this._bloodNovaPreview) this._bloodNovaPreview.mesh.visible = false;
        if (hitCount > 0) {
            this.bloodNovaCooldown = this.bloodNovaCooldownDuration;
            this.gameState.addBloodCharge(1);
            if (this.particleSystem) {
                this.particleSystem.emitBloodNovaBurst(center, this.bloodNovaRadius * 1.15);
                this.particleSystem.emitBloodMatterExplosion(center);
                this.particleSystem.emitUltimateExplosion(center);
                this.particleSystem.emitUltimateEndExplosion(center);
                this.particleSystem.emitSparks(center, 45);
                this.particleSystem.emitEmbers(center, 35);
            }
            if (this.onProjectileHit) this.onProjectileHit({ bloodNova: true, hits: hitCount, novaRadius: this.bloodNovaRadius });
            return true;
        }
        return false;
    }
    castBloodNova() {
        if (this.bloodNovaCooldown > 0 || this.bloodNovaWindup > 0) return false;
        this._beginBloodNova(this.character.position.clone());
        return true;
    }

    update(deltaTime, input) {
        if (this.crimsonEruptionCooldown > 0) this.crimsonEruptionCooldown -= deltaTime;
        if (this.bloodNovaCooldown > 0) this.bloodNovaCooldown -= deltaTime;
        if (input.bloodNova && !this.isDaggerKit) {
            if (this.isFrostKit && this.frostCombat) {
                this.frostCombat.beginStalactiteTargeting();
            } else {
                this.castBloodNova();
            }
        }
        if (this.bloodNovaWindup > 0) {
            this.bloodNovaWindup -= deltaTime;
            if (this._bloodNovaPreview) {
                const t = 1 - Math.max(0, this.bloodNovaWindup) / this.bloodNovaWindupDuration;
                const pulse = 0.15 + t * 1.0;
                this._bloodNovaPreview.mesh.position.copy(this._bloodNovaPendingCenter);
                this._bloodNovaPreview.mesh.position.y = 0.03;
                this._bloodNovaPreview.mesh.scale.setScalar(pulse);
                this._bloodNovaPreview.mat.opacity = 0.2 + 0.6 * t;
                this._bloodNovaPreview.mesh.visible = true;
            }
            if (this.bloodNovaWindup <= 0) this._releaseBloodNova();
        }
        if (this.gameState.combat.isLifeDraining) {
            if (input.lifeDrain) {
                this._endLifeDrain(true);
            } else {
                this.lifeDrainTimer -= deltaTime;
                this.lifeDrainNextTick -= deltaTime;
                if (this.lifeDrainTarget && this.lifeDrainTargetMesh) {
                    this.lifeDrainTargetMesh.getWorldPosition(this._enemyPos);
                    const dist = this.character.position.distanceTo(this._enemyPos);
                    if (dist > this.lifeDrainRange || this.lifeDrainTarget.health <= 0) {
                        this._endLifeDrain(false);
                    } else {
                        while (this.lifeDrainNextTick <= 0) {
                            this.lifeDrainNextTick += this.lifeDrainTickInterval;
                            const damage = this.lifeDrainDamagePerTick;
                            this.lifeDrainTarget.takeDamage(damage);
                            const heal = Math.floor(damage * this.lifeDrainHealRatio);
                            this.gameState.heal(heal);
                            this.gameState.addUltimateCharge('basic');
                            const elapsed = this.lifeDrainDuration - this.lifeDrainTimer;
                            const secondsFull = Math.floor(elapsed);
                            if (secondsFull > this._lastDrainBloodSecond) {
                                this.gameState.addBloodCharge(1);
                                this._lastDrainBloodSecond = secondsFull;
                            }
                            this.gameState.emit('damageNumber', { position: this._enemyPos.clone(), damage, isCritical: false, anchorId: this._getDamageAnchorId(this.lifeDrainTarget) });
                            if (this.particleSystem) this.particleSystem.emitDrainFlow(this._enemyPos, this.character.position, 18);
                        }
                        this.lifeDrainBeamTime += deltaTime;
                        this._updateLifeDrainBeam();
                        if (this.particleSystem) {
                            this._drainFlowAccum = (this._drainFlowAccum || 0) + deltaTime;
                            if (this._drainFlowAccum >= 0.08) {
                                this._drainFlowAccum = 0;
                                this.particleSystem.emitDrainFlow(this._enemyPos, this.character.position, 10);
                            }
                            this._drainTargetBurstAccum = (this._drainTargetBurstAccum || 0) + deltaTime;
                            if (this._drainTargetBurstAccum >= 0.15) {
                                this._drainTargetBurstAccum = 0;
                                this.particleSystem.emitDrainTargetBurst(this._enemyPos);
                            }
                        }
                    }
                } else this._endLifeDrain(false);
                if (this.lifeDrainTimer <= 0) this._endLifeDrain(false);
            }
        } else {
            this.lifeDrainCooldown -= deltaTime;
            if (input.lifeDrain && this.lifeDrainCooldown <= 0 && !this.gameState.combat.isWhipAttacking &&
                !this.gameState.combat.isCharging && !this.gameState.combat.isChargedAttacking && !this.gameState.combat.isAttacking && !this.gameState.combat.isLifeDraining) {
                const target = this.getLifeDrainTarget();
                if (target) {
                    this.gameState.combat.isLifeDraining = true;
                    this.lifeDrainTimer = this.lifeDrainDuration;
                    this.lifeDrainNextTick = this.lifeDrainTickInterval;
                    this.lifeDrainTarget = target.enemy;
                    this.lifeDrainTargetMesh = target.mesh;
                    this.lifeDrainBeamTime = 0;
                    this._lastDrainBloodSecond = 0;
                    this._createLifeDrainBeam();
                    if (this.particleSystem) {
                        const targetPos = this.lifeDrainTargetMesh.getWorldPosition(new THREE.Vector3());
                        this.particleSystem.emitDrainFlow(targetPos.clone(), this.character.position.clone(), 40);
                        this.particleSystem.emitDrainTargetBurst(targetPos.clone());
                    }
                }
            }
        }
        if (this.gameState.combat.isWhipAttacking) {
            if (this.whipTimer === null) {
                this.whipTimer = this.whipDuration;
                this.whipHitOnce = false;
                if (this.particleSystem) this.particleSystem.emitPunchBurst(this.character.getWeaponPosition().clone());
                if (this.onProjectileHit) this.onProjectileHit({ whipWindup: true });
            }
            this.whipTimer -= deltaTime;
            const whipT = 1 - this.whipTimer / this.whipDuration;
            if (whipT >= 0.2 && whipT <= 0.65 && !this.whipHitOnce) this.checkWhipHits();
            if (this.particleSystem && this.whipTimer > 0 && whipT < 0.9) {
                const wpos = this.character.getWeaponPosition();
                const wdir = this.character.getForwardDirection();
                this.particleSystem.emitSlashTrail(wpos, wdir, 18);
                this.particleSystem.emitOrbTrail(wpos, wdir, 10);
            }
            if (this.whipTimer <= 0) {
                this.gameState.combat.isWhipAttacking = false;
                this.whipTimer = null;
            }
        }
        if (this.crimsonEruptionVfx) {
            const v = this.crimsonEruptionVfx;
            v.elapsed += deltaTime;
            const t = v.elapsed / v.duration;
            const expandDuration = 0.22;
            const expandT = Math.min(1, v.elapsed / expandDuration);
            const scale = v.radius * (1 - (1 - expandT) * (1 - expandT));
            v.disc.scale.setScalar(scale);
            const alpha = t < 0.15 ? 0.9 : Math.max(0, 0.9 * (1 - (t - 0.15) / 0.85));
            if (v.material.uniforms) updateBloodFireMaterial(v.material, v.elapsed * 8, alpha);
            if (v.elapsed >= v.duration) {
                this.scene.remove(v.group);
                v.geometry?.dispose();
                v.material?.dispose();
                this.crimsonEruptionVfx = null;
            }
        }
        if (this.gameState.combat.isChargedAttacking) {
            if (this.isDaggerKit && this.chargedAttackTimer > 0 && this.chargedAttackTimer <= 0.2 && !this._meleeHitThisSwing) {
                this.checkHits();
            }
            this.chargedAttackTimer -= deltaTime;
            if (this.chargedAttackTimer <= 0) {
                if (!this.isDaggerKit) this.spawnFireball(true);
                this.gameState.combat.isChargedAttacking = false;
            }
        } else if (this.gameState.combat.isAttacking) {
            this.updateAttack(deltaTime);
        } else {
            if (input.chargedAttackRelease) {
                if (this.chargeTimer >= this.minChargeToRelease && this.gameState.useStamina(10)) {
                    this.gameState.combat.isChargedAttacking = true;
                    this.chargedAttackTimer = this.isDaggerKit ? 0.45 : (1 - this.chargeTimer / this.chargeDuration) * this.chargeDuration;
                    this.gameState.combat.releasedCharge = this.chargeTimer;
                    if (this.isDaggerKit) this._nextMeleeIsCharged = true;
                }
                this.chargeTimer = 0;
                this.gameState.combat.isCharging = false;
                this.gameState.combat.chargeTimer = 0;
            } else if (input.chargedAttack && !this.gameState.combat.isAttacking) {
                this.gameState.combat.isCharging = true;
                this.gameState.combat.minChargeToRelease = this.minChargeToRelease;
                this.chargeTimer = Math.min(this.chargeDuration, this.chargeTimer + deltaTime);
                this.gameState.combat.chargeTimer = this.chargeTimer;
            } else {
                this.gameState.combat.isCharging = false;
                this.chargeTimer = 0;
                this.gameState.combat.chargeTimer = 0;
            }
            if (input.attack && !input.chargedAttack) {
                this.startAttack();
            }
        }
        
        if (this.comboTimer > 0) {
            this.comboTimer -= deltaTime;
            if (this.comboTimer <= 0) {
                this.gameState.combat.comboCount = 0;
            }
        }
        
        this.updateChargeOrb(deltaTime);
        this.updateProjectiles(deltaTime);
        this.updateUltimateSlash(deltaTime);
        this.updateBloodCrescend(deltaTime);
        if (this.frostCombat) this.frostCombat.update(deltaTime);
        if (this.daggerCombat) this.daggerCombat.update(deltaTime);
    }

    updateChargeOrb(deltaTime) {
        const combat = this.gameState.combat;
        if (combat.isCharging && combat.chargeTimer > 0) {
            if (!this.chargeOrb) {
                const geometry = new THREE.SphereGeometry(0.22, 32, 32);
                const material = this.isFrostKit
                    ? createIceMaterial({
                        coreBrightness: 0.9,
                        iceSpeed: 4.5,
                        isCharged: 1.0,
                        layerScale: 1.2,
                        rimPower: 2.0,
                        displaceAmount: 0.3
                    })
                    : createBloodFireMaterial({
                        coreBrightness: 0.9,
                        plasmaSpeed: 4.5,
                        isCharged: 1.0,
                        layerScale: 1.2,
                        rimPower: 2.0,
                        redTint: 0.92
                    });
                this.chargeOrb = new THREE.Mesh(geometry, material);
                this.chargeOrb.castShadow = false;
                this.chargeOrb.userData.orbTime = 0;
                // Tightening ring of embers
                const ringCount = 36;
                const ringPos = new Float32Array(ringCount * 3);
                const ringGeo = new THREE.BufferGeometry();
                ringGeo.setAttribute('position', new THREE.BufferAttribute(ringPos, 3));
                const ringMat = new THREE.PointsMaterial({
                    size: 0.04,
                    color: this.isFrostKit ? 0x44aaff : 0xaa0a0a,
                    transparent: true,
                    opacity: 0.9,
                    depthWrite: false,
                    blending: THREE.AdditiveBlending
                });
                const ring = new THREE.Points(ringGeo, ringMat);
                this.chargeOrb.add(ring);
                this.chargeOrb.userData.ringGeo = ringGeo;
                this.chargeOrb.userData.ringMat = ringMat;
                this.scene.add(this.chargeOrb);
            }
            this.chargeOrb.userData.orbTime += deltaTime;
            const t = Math.min(1, combat.chargeTimer / this.chargeDuration);
            const scale = 0.2 + 1.6 * t;
            this.chargeOrb.scale.setScalar(scale);
            const wpos = this.character.getWeaponPosition();
            const wdir = this.character.getForwardDirection();
            this.chargeOrb.position.set(wpos.x + wdir.x * 0.4, wpos.y + wdir.y * 0.4, wpos.z + wdir.z * 0.4);
            // Pulse: brightness and alpha increase with charge
            const pulse = 0.95 + 0.15 * Math.sin(this.chargeOrb.userData.orbTime * 6);
            this.chargeOrb.material.uniforms.time.value = this.chargeOrb.userData.orbTime;
            this.chargeOrb.material.uniforms.alpha.value = 0.75 + 0.25 * t * pulse;
            this.chargeOrb.material.uniforms.coreBrightness.value = 0.9 + 0.6 * t * pulse;
            // Ring tightens and brightens with charge
            const ringRadius = 0.5 * (1.2 - 0.9 * t);
            const ringGeo = this.chargeOrb.userData.ringGeo;
            const posAttr = ringGeo.getAttribute('position');
            for (let i = 0; i < 36; i++) {
                const a = (i / 36) * Math.PI * 2 + this.chargeOrb.userData.orbTime * 2;
                posAttr.array[i * 3] = Math.cos(a) * ringRadius;
                posAttr.array[i * 3 + 1] = Math.sin(a) * ringRadius;
                posAttr.array[i * 3 + 2] = 0;
            }
            posAttr.needsUpdate = true;
            this.chargeOrb.userData.ringMat.opacity = 0.5 + 0.5 * t;
        } else {
            if (this.chargeOrb) {
                this.scene.remove(this.chargeOrb);
                this.chargeOrb.geometry.dispose();
                this.chargeOrb.material.dispose();
                if (this.chargeOrb.userData.ringGeo) {
                    this.chargeOrb.userData.ringGeo.dispose();
                    this.chargeOrb.userData.ringMat.dispose();
                }
                this.chargeOrb = null;
            }
        }
    }
    


    _consumeNextAttackMultiplier() {
        const m = Math.max(1, this.gameState?.combat?.nextAttackDamageMultiplier ?? 1);
        if (m > 1) this.gameState.combat.nextAttackDamageMultiplier = 1.0;
        return m;
    }
    startAttack() {
        if (!this.gameState.startAttack()) {
            return;
        }

        if (!this.isDaggerKit) this.spawnFireball(false);

        const basicClip = this.character.actions?.['Basic attack']?.getClip();
        const basicTimeScale = 3.8;
        this.attackDuration = basicClip?.duration ? basicClip.duration / basicTimeScale : 0.28;
        this.attackTimer = this.attackDuration;
        this._meleeHitThisSwing = false;

        // Increment combo or reset
        const now = performance.now() / 1000;
        const timeSinceLastAttack = now - this.gameState.combat.lastAttackTime;

        if (timeSinceLastAttack < this.comboWindow + this.attackDuration &&
            this.gameState.combat.comboCount < this.maxCombo) {
            this.gameState.combat.comboCount++;
        } else {
            this.gameState.combat.comboCount = 1;
        }

        this.gameState.combat.attackPhase = this.gameState.combat.comboCount;
        this.gameState.combat.lastAttackTime = now;
        this.comboTimer = this.comboWindow + this.attackDuration;
    }

    updateAttack(deltaTime) {
        this.attackTimer -= deltaTime;

        // Check for hits at attack midpoint
        if (this.attackTimer <= this.attackDuration * 0.65 &&
            this.attackTimer > this.attackDuration * 0.35) {
            this.checkHits();
        }

        if (this.attackTimer <= 0) {
            this.gameState.endAttack();
        }
    }

    checkHits() {
        if (this._meleeHitThisSwing) return;
        const weaponPos = this.character.getWeaponPosition();
        const playerForward = this.character.getForwardDirection();
        const range = this.gameState.equipment.weapon.range;
        if (!this._meleeToEnemy) this._meleeToEnemy = new THREE.Vector3();

        for (const enemyMesh of this.enemies) {
            const enemy = enemyMesh.userData?.enemy;
            if (!enemy || enemy.health <= 0) continue;
            enemyMesh.getWorldPosition(this._enemyPos);
            this._meleeToEnemy.subVectors(this._enemyPos, weaponPos);
            const dist = this._meleeToEnemy.length();
            const hitRadius = enemy.hitRadius ?? (enemy.isBoss ? 2.5 : 0.8);
            if (dist > range + hitRadius) continue;
            this._meleeToEnemy.normalize();
            // Slightly wider lateral hit cone to reduce near-miss frustration at close range.
            if (this._meleeToEnemy.dot(playerForward) < 0.22) continue;
            this._meleeHitThisSwing = true;
            this.onHit({ object: enemyMesh, point: this._enemyPos.clone(), distance: dist });
            return;
        }
    }

    onHit(hitInfo) {
        const isCharged = this._nextMeleeIsCharged === true;
        if (this._nextMeleeIsCharged) this._nextMeleeIsCharged = false;

        let baseDamage = this.gameState.equipment.weapon.damage;
        if (this.isDaggerKit && isCharged) {
            const charged = this.gameState.selectedKit?.combat?.chargedAttack;
            baseDamage = charged?.damage ?? baseDamage * 2;
        }
        const comboMultiplier = 1 + (this.gameState.combat.comboCount - 1) * 0.2;
        const isCritical = Math.random() < 0.15;

        let mult = this._consumeNextAttackMultiplier();
        const c = this.gameState.combat;
        if (c.teleportDamageBuffRemaining > 0) mult *= 2.0;
        if (c.poisonDamageBuffRemaining > 0) mult *= (c.poisonDamageBuffMultiplier ?? 1);
        let damage = Math.floor(baseDamage * comboMultiplier * mult);
        if (isCritical) {
            damage = Math.floor(damage * 1.5);
        }

        if (hitInfo.object.userData.enemy) {
            hitInfo.object.userData.enemy.takeDamage(damage);
            this.gameState.addUltimateCharge(isCharged ? 'charged' : 'basic');
            if (this.isDaggerKit) {
                this.gameState.addPoisonCharge(isCharged ? 2 : 1);
            }
            const hitPos = hitInfo.point?.clone() ?? hitInfo.object.getWorldPosition?.(new THREE.Vector3()) ?? this.character.position.clone();
            this.gameState.emit('damageNumber', { position: hitPos, damage, isCritical, anchorId: this._getDamageAnchorId(hitInfo.object.userData.enemy) });
        }
    }

    _getEnemyFromHitObject(obj) {
        let o = obj;
        while (o) {
            if (o.userData && o.userData.enemy) return o.userData.enemy;
            o = o.parent;
        }
        return null;
    }

    checkWhipHits() {
        if (this.whipHitOnce) return;
        const weaponPos = this.character.getWeaponPosition();
        const playerForward = this.character.getForwardDirection().clone().normalize();
        this.raycaster.set(weaponPos, playerForward);
        this.raycaster.far = this.whipRange;
        const intersects = this.raycaster.intersectObjects(this.enemies, true);
        if (intersects.length > 0) {
            const hit = intersects[0];
            const enemy = this._getEnemyFromHitObject(hit.object);
            if (enemy) {
                this.whipHitOnce = true;
                const whipDamage = Math.floor(this.whipDamage * this._consumeNextAttackMultiplier());
                enemy.takeDamage(whipDamage);
                enemy.staggerTimer = Math.max(enemy.staggerTimer, 0.72);
                enemy.state = 'stagger';
                this.gameState.addUltimateCharge('charged');
                if (this.particleSystem) {
                    hit.object.getWorldPosition(this._enemyPos);
                    this.particleSystem.emitPunchBurst(this._enemyPos.clone());
                    this.particleSystem.emitBloodMatterExplosion(this._enemyPos.clone());
                    this.particleSystem.emitSparks(this._enemyPos.clone(), 36);
                    this.particleSystem.emitEmbers(this._enemyPos.clone(), 28);
                }
                if (this.onProjectileHit) this.onProjectileHit({ whipHit: true, punchFinish: true });
            }
        }
    }

    /** E = Blood Crescend / Frost Beam: consume stacks and discharge. */
    executeBloodflail(chargesUsed, multiplier) {
        if (this.isFrostKit && this.frostCombat) {
            this.frostCombat.executeFrostBeam(chargesUsed, multiplier);
            return;
        }
        this.executeBloodCrescend(chargesUsed, multiplier);
    }

    executeBloodCrescend(chargesUsed, multiplier) {
        if (this.bloodCrescend) return;
        const weaponPos = this.character.getWeaponPosition();

        // Always launch horizontally in the current camera angle (yaw), blade-like.
        const dir = this.character.getForwardDirection().clone();
        dir.y = 0;
        if (dir.lengthSq() < 0.0001) dir.set(0, 0, -1);
        dir.normalize();

        this.spawnBloodCrescend(weaponPos.clone().addScaledVector(dir, 0.8), dir, chargesUsed, multiplier);
        this.gameState.combat.isWhipAttacking = true;
        this.whipTimer = this.whipDuration;
        this.whipHitOnce = true;
        if (this.onProjectileHit) this.onProjectileHit({ whipHit: true, bloodflailCharges: chargesUsed, punchFinish: true });
    }

    spawnFireball(isCharged = false) {
        if (!this._fbStartPos) this._fbStartPos = new THREE.Vector3();
        if (!this._fbDir) this._fbDir = new THREE.Vector3();
        const wp = this.character.getWeaponPosition();
        const fd = this.character.getForwardDirection();
        this._fbDir.copy(fd).normalize();
        this._fbStartPos.copy(wp).addScaledVector(this._fbDir, 0.5);
        const startPos = this._fbStartPos;
        const dir = this._fbDir;

        if (this.particleSystem) {
            if (this.isFrostKit) {
                this.particleSystem.emitIceBurst(startPos, isCharged ? 10 : 5);
            } else {
                this.particleSystem.emitSparks(startPos, isCharged ? 10 : 5);
                this.particleSystem.emitEmbers(startPos, isCharged ? 6 : 3);
            }
        }

        const speed = isCharged ? this.chargedSpeed : this.basicSpeed;
        const damage = Math.floor((isCharged ? this.chargedDamage : this.basicDamage) * this._consumeNextAttackMultiplier());
        const maxLifetime = isCharged ? this.chargedLifetime : this.basicLifetime;
        const releaseBurst = isCharged ? 0.15 : 0;

        // Frost kit: create ice javelins (no pool reuse for now)
        if (this.isFrostKit && this.frostCombat) {
            const p = this.frostCombat.createIceProjectile(isCharged, startPos.clone(), dir.clone());
            p.damage = damage;
            p.maxLifetime = maxLifetime;
            p.releaseBurst = releaseBurst;
            this.scene.add(p.mesh);
            this.projectiles.push(p);
            return;
        }

        const pool = isCharged ? this.poolCharged : this.poolBasic;
        if (pool.length > 0) {
            const p = pool.pop();
            p.mesh.position.copy(startPos);
            p.mesh.rotation.set(0, 0, 0);
            p.mesh.scale.setScalar(1);
            p.velocity.copy(dir).multiplyScalar(speed);
            p.lifetime = 0;
            p.maxLifetime = maxLifetime;
            p.damage = damage;
            p.releaseBurst = releaseBurst;
            if (p.vfx && p.vfx.reset) p.vfx.reset();
            this.scene.add(p.mesh);
            this.projectiles.push(p);
            return;
        }

        const p = this._createProjectile(isCharged, startPos, dir);
        p.maxLifetime = maxLifetime;
        p.damage = damage;
        p.releaseBurst = releaseBurst;
        this.scene.add(p.mesh);
        this.projectiles.push(p);
    }

    updateProjectiles(deltaTime) {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            this._deltaPos.copy(p.velocity).multiplyScalar(deltaTime);
            p.mesh.position.add(this._deltaPos);
            p.lifetime += deltaTime;

            if (p.releaseBurst > 0) {
                p.releaseBurst -= deltaTime;
                const burstScale = p.isCharged ? 0.5 : 0.3;
                const burstDur = p.isCharged ? 0.15 : 0.12;
                const s = p.releaseBurst > 0 ? 1 + burstScale * (p.releaseBurst / burstDur) : 1;
                p.mesh.scale.setScalar(s);
            }

            if (p.vfx) {
                p.vfx.update(deltaTime, p.mesh.position, p.velocity, p.lifetime, p.maxLifetime);
                const deltaSpiral = p.vfx.getSpiralDelta();
                if (deltaSpiral !== 0 && p.velocity.lengthSq() > 1e-6) {
                    this._velNorm.copy(p.velocity).normalize();
                    p.mesh.rotateOnWorldAxis(this._velNorm, deltaSpiral);
                }
            }

            const lifePct = 1.0 - p.lifetime / p.maxLifetime;
            const alpha = 0.92 * lifePct;
            if (p.materials) {
                p.materials.forEach((mat, idx) => {
                    const layerAlpha = idx === 0 ? alpha * 0.5 : alpha;
                    if (p.isFrost) {
                        updateIceMaterial(mat, p.lifetime, layerAlpha);
                    } else {
                        updateBloodFireMaterial(mat, p.lifetime, layerAlpha);
                    }
                });
            }

            if (p.lifetime >= p.maxLifetime) {
                if (this.particleSystem) {
                    if (p.isFrost) {
                        this.particleSystem.emitIceBurst(p.mesh.position, p.isCharged ? 8 : 3);
                    } else {
                        this.particleSystem.emitSmoke(p.mesh.position, p.isCharged ? 3 : 1);
                    }
                }
                this.disposeProjectile(p);
                this.projectiles.splice(i, 1);
                continue;
            }

            let hit = false;
            const fireballPos = p.mesh.position;
            for (const enemyMesh of this.enemies) {
                enemyMesh.getWorldPosition(this._enemyPos);
                const enemy = enemyMesh.userData?.enemy;
                if (!enemy) continue;
                const modelRadius = enemy.hitRadius ?? (enemy.isBoss ? 2.5 : 0.8);
                const hitRadius = modelRadius + (p.isCharged ? 0.6 : 0.3);
                if (fireballPos.distanceTo(this._enemyPos) < hitRadius) {
                    enemyMesh.userData.enemy.takeDamage(p.damage);
                    hit = true;
                    this.gameState.addUltimateCharge(p.isCharged ? 'charged' : 'basic');
                    // Frost: add frost stacks instead of blood charges
                    if (p.isFrost && this.frostCombat) {
                        this.frostCombat.addFrostStack(enemy, p.isCharged ? 2 : 1);
                    } else {
                        this.gameState.addBloodCharge(p.isCharged ? 2 : 1);
                    }
                    this.gameState.emit('damageNumber', { position: this._enemyPos.clone(), damage: p.damage, isCritical: false, anchorId: this._getDamageAnchorId(enemy) });
                    if (this.particleSystem) {
                        if (p.isFrost) {
                            this.particleSystem.emitIceBurst(fireballPos, p.isCharged ? 12 : 6);
                            this.particleSystem.emitIceShatter(fireballPos, p.isCharged ? 8 : 4);
                        } else {
                            this.particleSystem.emitHitEffect(fireballPos);
                            this.particleSystem.emitEmbers(fireballPos, p.isCharged ? 6 : 3);
                        }
                    }
                    if (this.onProjectileHit) {
                        this.onProjectileHit({ charged: p.isCharged, isBoss: !!enemy.isBoss });
                    }
                    break;
                }
            }
            if (hit) {
                this.disposeProjectile(p);
                this.projectiles.splice(i, 1);
            }
        }
    }

    /** Crimson Eruption (A): preview circle under mouse */
    updateCrimsonEruptionPreview(worldPosition) {
        if (!worldPosition) return;
        if (this.crimsonEruptionCooldown > 0) return;
        if (!this.crimsonEruptionPreview) {
            const r = this.crimsonEruptionRadius;
            const ringGeo = new THREE.RingGeometry(r - 0.35, r, 48);
            const mat = new THREE.MeshBasicMaterial({
                color: 0x880808,
                transparent: true,
                opacity: 0.5,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            this.crimsonEruptionPreview = new THREE.Mesh(ringGeo, mat);
            this.crimsonEruptionPreview.rotation.x = -Math.PI / 2;
            this.crimsonEruptionPreview.position.y = 0.02;
            this.crimsonEruptionPreview.visible = false;
            this.scene.add(this.crimsonEruptionPreview);
        }
        this.crimsonEruptionPreview.position.x = worldPosition.x;
        this.crimsonEruptionPreview.position.z = worldPosition.z;
        this.crimsonEruptionPreview.visible = true;
    }

    hideCrimsonEruptionPreview() {
        if (this.crimsonEruptionPreview) this.crimsonEruptionPreview.visible = false;
    }

    /** Shader material for dark matter noyau: surface displacement (not a perfect sphere), movement over time */
    _createDarkMatterNoyauMaterial() {
        const vertexShader = `
            uniform float time;
            varying vec3 vNormal;
            varying vec3 vPosition;
            float hash(vec3 p) {
                return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
            }
            float noise3(vec3 p) {
                vec3 i = floor(p);
                vec3 f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                float n000 = hash(i);
                float n100 = hash(i + vec3(1,0,0));
                float n010 = hash(i + vec3(0,1,0));
                float n110 = hash(i + vec3(1,1,0));
                float n001 = hash(i + vec3(0,0,1));
                float n101 = hash(i + vec3(1,0,1));
                float n011 = hash(i + vec3(0,1,1));
                float n111 = hash(i + vec3(1,1,1));
                return mix(
                    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
                    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
            }
            float fbm(vec3 p) {
                float v = 0.0;
                float a = 0.5;
                float f = 1.0;
                for (int i = 0; i < 4; i++) {
                    v += a * noise3(p * f);
                    f *= 2.0;
                    a *= 0.5;
                }
                return v;
            }
            void main() {
                vNormal = normalize(normalMatrix * normal);
                vec3 pos = position;
                vec3 q = pos * 3.0 + vec3(0, 0, time * 2.5);
                vec3 q2 = pos * 6.0 + vec3(time * 3.0, time * 1.7, 0);
                vec3 q3 = pos * 11.0 + vec3(0, time * 4.2, time * 2.1);
                float n = fbm(q) - 0.5;
                n += 0.4 * fbm(q * 2.1 + vec3(time * 1.2, 0, 0));
                float erratic = fbm(q2) - 0.5;
                float spikeNoise = noise3(q3);
                float spike = smoothstep(0.65, 0.92, spikeNoise) * (0.4 + 0.6 * fract(spikeNoise * 10.0 + time));
                float disp = n * 0.12 + erratic * 0.14 + spike * 0.18;
                pos += normal * disp;
                vPosition = pos;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
        `;
        const fragmentShader = `
            uniform float alpha;
            varying vec3 vNormal;
            varying vec3 vPosition;
            void main() {
                vec3 col = vec3(0.02, 0.0, 0.01);
                float fresnel = pow(1.0 - max(dot(normalize(vNormal), vec3(0, 0, 1)), 0.0), 1.5);
                col += vec3(0.03, 0.0, 0.01) * fresnel;
                gl_FragColor = vec4(col, alpha);
            }
        `;
        const mat = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                alpha: { value: 0.92 }
            },
            vertexShader,
            fragmentShader,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        return mat;
    }

    /** Single unified orb material: one mesh, radial blend from dark core to red surface (no visible layers) */
    _createUltimateOrbMaterial() {
        const vertexShader = `
            uniform float time;
            uniform float uRadius;
            varying vec3 vNormal;
            varying vec3 vPosition;
            varying float vRadial;
            float hash(vec3 p) {
                return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
            }
            float noise3(vec3 p) {
                vec3 i = floor(p);
                vec3 f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                float n000 = hash(i);
                float n100 = hash(i + vec3(1,0,0));
                float n010 = hash(i + vec3(0,1,0));
                float n110 = hash(i + vec3(1,1,0));
                float n001 = hash(i + vec3(0,0,1));
                float n101 = hash(i + vec3(1,0,1));
                float n011 = hash(i + vec3(0,1,1));
                float n111 = hash(i + vec3(1,1,1));
                return mix(
                    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
                    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
            }
            float fbm(vec3 p) {
                float v = 0.0;
                float a = 0.5;
                float f = 1.0;
                for (int i = 0; i < 4; i++) {
                    v += a * noise3(p * f);
                    f *= 2.0;
                    a *= 0.5;
                }
                return v;
            }
            void main() {
                vNormal = normalize(normalMatrix * normal);
                vec3 pos = position;
                vec3 q = pos * 3.0 + vec3(0, 0, time * 2.5);
                vec3 q2 = pos * 6.0 + vec3(time * 3.0, time * 1.7, 0);
                vec3 q3 = pos * 11.0 + vec3(0, time * 4.2, time * 2.1);
                float n = fbm(q) - 0.5;
                n += 0.4 * fbm(q * 2.1 + vec3(time * 1.2, 0, 0));
                float erratic = fbm(q2) - 0.5;
                float spikeNoise = noise3(q3);
                float spike = smoothstep(0.65, 0.92, spikeNoise) * (0.4 + 0.6 * fract(spikeNoise * 10.0 + time));
                float disp = n * 0.12 + erratic * 0.14 + spike * 0.18;
                pos += normal * disp;
                vPosition = pos;
                vRadial = length(pos) / max(uRadius, 0.001);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
        `;
        const fragmentShader = `
            uniform float alpha;
            uniform float time;
            varying vec3 vNormal;
            varying vec3 vPosition;
            varying float vRadial;
            float n(vec3 p) {
                return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
            }
            void main() {
                float r = vRadial;
                float noise = n(vPosition * 8.0 + time) * 0.08;
                r += noise;
                r = clamp(r, 0.0, 1.0);
                vec3 darkCore = vec3(0.03, 0.0, 0.005);
                vec3 darkMid = vec3(0.12, 0.0, 0.01);
                vec3 bloodMid = vec3(0.38, 0.01, 0.02);
                vec3 bloodOuter = vec3(0.72, 0.02, 0.03);
                vec3 redSurface = vec3(0.95, 0.04, 0.05);
                float fresnel = pow(1.0 - max(dot(normalize(vNormal), vec3(0, 0, 1)), 0.0), 1.8);
                vec3 col = mix(darkCore, darkMid, smoothstep(0.0, 0.35, r));
                col = mix(col, bloodMid, smoothstep(0.35, 0.6, r));
                col = mix(col, bloodOuter, smoothstep(0.6, 0.82, r));
                col = mix(col, redSurface, smoothstep(0.82, 1.0, r));
                col += vec3(0.2, 0.02, 0.02) * fresnel;
                gl_FragColor = vec4(col, alpha);
            }
        `;
        const mat = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                alpha: { value: 0.9 },
                uRadius: { value: 0.52 }
            },
            vertexShader,
            fragmentShader,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        return mat;
    }

    _spawnCrimsonEruptionVfx(center, radius) {
        if (this.crimsonEruptionVfx) {
            this.scene.remove(this.crimsonEruptionVfx.group);
            this.crimsonEruptionVfx.geometry?.dispose();
            this.crimsonEruptionVfx.material?.dispose();
        }
        const discGeo = new THREE.CircleGeometry(1, 48);
        const mat = createBloodFireMaterial({
            coreBrightness: 2.2,
            plasmaSpeed: 12,
            isCharged: 1.0,
            layerScale: 2.5,
            rimPower: 3.0,
            alpha: 0.9,
            redTint: 0.92
        });
        mat.side = THREE.DoubleSide;
        const disc = new THREE.Mesh(discGeo, mat);
        disc.rotation.x = -Math.PI / 2;
        disc.position.copy(center);
        disc.position.y = 0.02;
        disc.scale.setScalar(0);
        disc.frustumCulled = false;
        const group = new THREE.Group();
        group.add(disc);
        this.scene.add(group);
        this.crimsonEruptionVfx = {
            group,
            disc,
            material: mat,
            geometry: discGeo,
            radius,
            duration: 1.35,
            elapsed: 0
        };
    }

    /** Spawn blood fire eruption at position; damage and stagger enemies in radius */
    spawnCrimsonEruption(center) {
        if (!center || this.crimsonEruptionCooldown > 0) return;
        this.crimsonEruptionCooldown = this.crimsonEruptionCooldownDuration;
        const r = this.crimsonEruptionRadius;
        if (this.particleSystem) {
            this.particleSystem.emitCrimsonEruptionRing(center, r);
            this.particleSystem.emitBloodMatterExplosion(center);
            this.particleSystem.emitUltimateEndExplosion(center);
        }
        this._spawnCrimsonEruptionVfx(center, r);
        this._centerFlat.set(center.x, 0, center.z);
        let crimsonHitCount = 0;
        for (const enemyMesh of this.enemies) {
            if (!enemyMesh.userData?.enemy) continue;
            enemyMesh.getWorldPosition(this._enemyPos);
            this._enemyPos.y = 0;
            if (this._centerFlat.distanceTo(this._enemyPos) > r) continue;
            enemyMesh.userData.enemy.takeDamage(this.crimsonEruptionDamage);
            enemyMesh.userData.enemy.staggerTimer = Math.max(enemyMesh.userData.enemy.staggerTimer, 0.8);
            enemyMesh.userData.enemy.state = 'stagger';
            enemyMesh.getWorldPosition(this._enemyPos);
            this.gameState.emit('damageNumber', { position: this._enemyPos.clone(), damage: this.crimsonEruptionDamage, isCritical: false, kind: 'ability', anchorId: this._getDamageAnchorId(enemyMesh.userData.enemy) });
            crimsonHitCount++;
        }
        if (crimsonHitCount > 0) this.gameState.addBloodCharge(2);
        if (this.onProjectileHit) this.onProjectileHit({ crimsonEruption: true });
    }

    _createUltimateOrb() {
        const radius = 0.52;
        const sphereGeo = new THREE.SphereGeometry(radius, 16, 16);
        const orbMat = this._createUltimateOrbMaterial();
        orbMat.uniforms.uRadius.value = radius;
        const mesh = new THREE.Mesh(sphereGeo, orbMat);
        mesh.castShadow = false;
        const group = new THREE.Group();
        group.frustumCulled = false;
        const orbLight = new THREE.PointLight(0xc1081a, 0, 55, 2.5);
        const outerGlow = new THREE.PointLight(0x7a0010, 0, 35, 1.2);
        group.add(mesh); group.add(orbLight); group.add(outerGlow);
        return { group, orbMat, sphereGeo, orbLight, outerGlow, velocity: new THREE.Vector3() };
    }

    spawnUltimateSlash(position, direction) {
        if (this.ultimateSlash) return;
        if (!this._ultimatePool) this._ultimatePool = this._createUltimateOrb();
        const u = this._ultimatePool;
        u.group.position.copy(position);
        u.group.scale.setScalar(1);
        u.velocity.copy(direction).normalize().multiplyScalar(32);
        u.orbMat.uniforms.time.value = 0;
        u.orbMat.uniforms.alpha.value = 0.92;
        u.orbLight.intensity = 38;
        u.outerGlow.intensity = 14;
        this.scene.add(u.group);

        this.ultimateSlash = {
            mesh: u.group, velocity: u.velocity,
            lifetime: 0, maxLifetime: 2.4,
            baseDamage: 280, scaleStart: 0.28, scaleEnd: 4.5, growthDuration: 0.8,
            materials: [u.orbMat], timeScales: [1], geometries: [],
            light: u.orbLight, outerGlow: u.outerGlow, hitOnce: false, _pooled: true
        };
        this._ultimateHitSet.clear();
        if (this.particleSystem) {
            this.particleSystem.emitUltimateLaunch(position);
            this.particleSystem.emitSparks(position, 15);
            this.particleSystem.emitEmbers(position, 10);
        }
    }

    updateUltimateSlash(deltaTime) {
        const s = this.ultimateSlash;
        if (!s) return;
        s.mesh.position.addScaledVector(s.velocity, deltaTime);
        s.lifetime += deltaTime;

        // Grow from scaleStart to scaleEnd over growthDuration, then stay at scaleEnd
        const growthT = Math.min(1, s.lifetime / s.growthDuration);
        const smoothT = growthT * growthT * (3 - 2 * growthT);
        const baseScale = s.scaleStart + (s.scaleEnd - s.scaleStart) * smoothT;
        const pulse = 1 + 0.08 * Math.sin(s.lifetime * 14);
        s.currentScale = baseScale * pulse;
        s.mesh.scale.setScalar(s.currentScale);

        const lifePct = 1.0 - s.lifetime / s.maxLifetime;
        if (s.materials && s.timeScales) {
            const alphas = [0.9 * lifePct];
            s.materials.forEach((mat, i) => {
                if (mat.uniforms) updateBloodFireMaterial(mat, s.lifetime * s.timeScales[i], alphas[i]);
                else if (mat.opacity !== undefined) mat.opacity = alphas[i];
            });
        } else if (s.materials) {
            s.materials.forEach((mat, i) => {
                if (mat.uniforms) updateBloodFireMaterial(mat, s.lifetime, 0.9 * lifePct);
                else if (mat.opacity !== undefined) mat.opacity = 0.9 * lifePct;
            });
        }
        if (s.light) s.light.intensity = (38 + 10 * Math.sin(s.lifetime * 10)) * lifePct;
        if (s.outerGlow) s.outerGlow.intensity = (14 + 4 * Math.sin(s.lifetime * 8)) * lifePct;

        // Trail every 2nd frame + reuse dir to avoid allocations and reduce lag
        if (this.particleSystem && s.lifetime < s.maxLifetime - 0.1) {
            const trailTick = (s._trailTick = (s._trailTick || 0) + 1);
            if (trailTick % 2 === 0) {
                if (!this._ultimateTrailDir) this._ultimateTrailDir = new THREE.Vector3();
                this._ultimateTrailDir.copy(s.velocity).normalize();
                this.particleSystem.emitOrbTrail(s.mesh.position, this._ultimateTrailDir, 14);
                this.particleSystem.emitSlashTrail(s.mesh.position, this._ultimateTrailDir, 6);
            }
        }

        const orbPos = s.mesh.position;
        for (const enemyMesh of this.enemies) {
            if (!enemyMesh.userData?.enemy) continue;
            const enemy = enemyMesh.userData.enemy;
            enemyMesh.getWorldPosition(this._enemyPos);
            const hitRadius = (enemy.hitRadius ?? (enemy.isBoss ? 2.5 : 0.8)) + 0.8;
            if (orbPos.distanceTo(this._enemyPos) < hitRadius) {
                const damage = Math.floor(s.baseDamage * Math.min(1.5, Math.max(0.3, s.currentScale)));
                enemyMesh.userData.enemy.takeDamage(damage);
                this.gameState.emit('damageNumber', { position: this._enemyPos.clone(), damage, isCritical: true, kind: 'heavy', anchorId: this._getDamageAnchorId(enemyMesh.userData.enemy) });
                if (this.particleSystem) {
                    this.particleSystem.emitUltimateEndExplosion(orbPos);
                }
                if (this.onProjectileHit) this.onProjectileHit({ charged: true, isBoss: !!enemy.isBoss, isUltimate: true });
                this.scene.remove(s.mesh);
                if (!s._pooled) {
                    if (s.geometries) s.geometries.forEach(g => g.dispose());
                    if (s.materials) s.materials.forEach(m => m.dispose());
                }
                this.ultimateSlash = null;
                return;
            }
        }

        if (s.lifetime >= s.maxLifetime) {
            if (this.particleSystem) {
                this.particleSystem.emitUltimateEndExplosion(orbPos);
            }
            this.scene.remove(s.mesh);
            if (!s._pooled) {
                if (s.geometries) s.geometries.forEach(g => g.dispose());
                if (s.materials) s.materials.forEach(m => m.dispose());
            }
            this.ultimateSlash = null;
        }
    }


    spawnBloodCrescend(position, direction, chargesUsed, multiplier) {
        if (this.bloodCrescend) return;

        const stackRatio = Math.min(1, Math.max(0, chargesUsed / 8));
        const stackScale = 1 + 1.1 * Math.pow(stackRatio, 1.35);
        const bladeLen = (2.2 + chargesUsed * 0.5) * stackScale;
        const bladeWidth = (0.74 + chargesUsed * 0.16) * (0.92 + 0.45 * stackScale);
        const makeCrescentShape = (length, width, insetMul = 0.48) => {
            const tipX = length * 0.5;
            const tailX = -length * 0.5;
            const bellyX = length * 0.16;
            const shape = new THREE.Shape();
            shape.moveTo(tailX, width * 0.48);
            shape.quadraticCurveTo(-length * 0.05, width * 0.72, tipX, 0);
            shape.quadraticCurveTo(-length * 0.08, -width * 0.9, tailX * 0.1, -width * 0.38);
            shape.quadraticCurveTo(bellyX, -width * insetMul, tailX, width * 0.12);
            shape.closePath();
            return shape;
        };

        const geoOuter = new THREE.ShapeGeometry(makeCrescentShape(bladeLen, bladeWidth, 0.44), 42);
        const matOuter = createBloodFireMaterial({
            coreBrightness: 1.55 + chargesUsed * 0.18 + stackScale * 0.18,
            plasmaSpeed: 7.0 + stackScale * 0.6,
            isCharged: 1.0,
            layerScale: 1.36,
            rimPower: 1.5,
            alpha: Math.min(1.0, 0.96 + stackScale * 0.04),
            redTint: 0.95
        });
        const meshOuter = new THREE.Mesh(geoOuter, matOuter);

        const geoInner = new THREE.ShapeGeometry(makeCrescentShape(bladeLen * 0.86, bladeWidth * 0.74, 0.5), 34);
        const matInner = new THREE.MeshBasicMaterial({
            color: 0xff4a4a, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false
        });
        const meshInner = new THREE.Mesh(geoInner, matInner);

        const geoCore = new THREE.ShapeGeometry(makeCrescentShape(bladeLen * 0.68, bladeWidth * 0.5, 0.54), 28);
        const matCore = new THREE.MeshBasicMaterial({
            color: 0xffc0a0, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false
        });
        const meshCore = new THREE.Mesh(geoCore, matCore);

        // Put blade in horizontal plane (XZ), then yaw it to the camera-facing direction.
        meshOuter.rotation.x = -Math.PI * 0.5;
        meshInner.rotation.x = -Math.PI * 0.5;
        meshCore.rotation.x = -Math.PI * 0.5;

        const group = new THREE.Group();
        group.add(meshOuter);
        group.add(meshInner);
        group.add(meshCore);
        group.position.copy(position);

        const dirNorm = direction.clone();
        dirNorm.y = 0;
        if (dirNorm.lengthSq() < 0.0001) dirNorm.set(0, 0, -1);
        dirNorm.normalize();
        group.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dirNorm);
        this.scene.add(group);

        const speed = 25 + chargesUsed * 1.45;
        const baseDamage = 85 + chargesUsed * 36;
        const totalDamage = Math.floor(baseDamage * (multiplier ?? 1) * this._consumeNextAttackMultiplier());

        this.bloodCrescend = {
            mesh: group,
            velocity: dirNorm.clone().multiplyScalar(speed),
            lifetime: 0,
            maxLifetime: 1.2 + chargesUsed * 0.07 + stackScale * 0.08,
            hitRadius: 2.05 + chargesUsed * 0.34 + stackScale * 0.5,
            damage: totalDamage,
            chargesUsed,
            materials: [matOuter, matInner, matCore],
            geometries: [geoOuter, geoInner, geoCore],
            hitSet: new Set(),
            stackScale
        };

        if (this.particleSystem) {
            this.particleSystem.emitUltimateLaunch(position);
            this.particleSystem.emitSparks(position, 42 + chargesUsed * 12);
            this.particleSystem.emitEmbers(position, 36 + chargesUsed * 10);
            this.particleSystem.emitSlashTrail(position, dirNorm, 22 + chargesUsed * 3);
        }
    }

    updateBloodCrescend(deltaTime) {
        const c = this.bloodCrescend;
        if (!c) return;
        c.lifetime += deltaTime;
        c.mesh.position.addScaledVector(c.velocity, deltaTime);
        const lifePct = 1 - c.lifetime / c.maxLifetime;
        const scaleBoost = c.stackScale ?? 1;
        const pulse = 1 + (0.22 + 0.08 * (scaleBoost - 1)) * Math.sin(c.lifetime * 24);
        c.mesh.scale.set((1 + 0.2 * Math.sin(c.lifetime * 16)) * scaleBoost, pulse * scaleBoost, scaleBoost);

        const fireMat = c.materials[0];
        if (fireMat?.uniforms) updateBloodFireMaterial(fireMat, c.lifetime * 10, Math.max(0, 0.98 * lifePct));
        if (c.materials[1]) c.materials[1].opacity = Math.max(0, 0.5 * lifePct);
        if (c.materials[2]) c.materials[2].opacity = Math.max(0, 0.3 * lifePct);

        if (this.particleSystem) {
            c._trailTick = (c._trailTick || 0) + 1;
            if (c._trailTick % 2 === 0) {
                const trailDir = c.velocity.clone().normalize();
                this.particleSystem.emitSlashTrail(c.mesh.position, trailDir, 12 + c.chargesUsed * 2);
                this.particleSystem.emitOrbTrail(c.mesh.position, trailDir, 10 + c.chargesUsed * 2);
            }
        }

        for (const enemyMesh of this.enemies) {
            const enemy = enemyMesh.userData?.enemy;
            if (!enemy || enemy.health <= 0 || c.hitSet.has(enemy)) continue;
            enemyMesh.getWorldPosition(this._enemyPos);
            const hitRadius = (enemy.hitRadius ?? (enemy.isBoss ? 2.5 : 0.8)) + c.hitRadius;
            if (c.mesh.position.distanceTo(this._enemyPos) <= hitRadius) {
                c.hitSet.add(enemy);
                enemy.takeDamage(c.damage);
                enemy.staggerTimer = Math.max(enemy.staggerTimer, 0.95);
                enemy.state = 'stagger';
                this.gameState.addUltimateCharge('charged');
                this.gameState.emit('damageNumber', {
                    position: this._enemyPos.clone(),
                    damage: c.damage,
                    isCritical: c.chargesUsed >= 6,
                    kind: 'heavy',
                    anchorId: this._getDamageAnchorId(enemy)
                });
                if (this.particleSystem) {
                    this.particleSystem.emitPunchBurst(this._enemyPos.clone());
                    this.particleSystem.emitBloodMatterExplosion(this._enemyPos.clone());
                    this.particleSystem.emitUltimateEndExplosion(this._enemyPos.clone());
                }
                if (this.onProjectileHit) this.onProjectileHit({ charged: true, isBoss: !!enemy.isBoss, whipHit: true, bloodflailCharges: c.chargesUsed, punchFinish: true });
            }
        }

        if (c.lifetime >= c.maxLifetime) {
            this.scene.remove(c.mesh);
            c.geometries.forEach(g => g.dispose());
            c.materials.forEach(m => m.dispose());
            this.bloodCrescend = null;
        }
    }

    disposeProjectile(p) {
        const pool = p.isCharged ? this.poolCharged : this.poolBasic;
        if (pool.length < this.maxPoolSize && p.vfx && p.vfx.reset) {
            p.vfx.reset();
            this.scene.remove(p.mesh);
            pool.push(p);
            return;
        }
        if (p.vfx) p.vfx.dispose();
        this.scene.remove(p.mesh);
        if (p.geometries) {
            p.geometries.forEach(g => g.dispose());
        }
        if (p.materials) {
            p.materials.forEach(m => m.dispose());
        }
    }

    _createLifeDrainBeam() {
        if (this.lifeDrainBeam) return;
        const group = new THREE.Group();
        group.visible = false;
        const numSegments = this._drainZapNumPointsMax - 1;
        const allMats = [];
        const allGeoms = [];
        for (let s = 0; s < numSegments; s++) {
            const segGroup = new THREE.Group();
            const coreGeom = new THREE.CylinderGeometry(0.007, 0.013, 1, 8);
            const coreMat = createBloodFireMaterial({
                coreBrightness: 1.5,
                plasmaSpeed: 10,
                isCharged: 0.4,
                layerScale: 1.3,
                rimPower: 2.2,
                redTint: 0.92
            });
            coreMat.side = THREE.DoubleSide;
            coreMat.uniforms.alpha.value = 0.88;
            segGroup.add(new THREE.Mesh(coreGeom, coreMat));
            const outerGeom = new THREE.CylinderGeometry(0.019, 0.028, 1, 8);
            const outerMat = createBloodFireMaterial({
                coreBrightness: 0.9,
                plasmaSpeed: 6,
                isCharged: 0.3,
                layerScale: 0.9,
                rimPower: 1.6,
                redTint: 0.92
            });
            outerMat.side = THREE.DoubleSide;
            outerMat.uniforms.alpha.value = 0.5;
            segGroup.add(new THREE.Mesh(outerGeom, outerMat));
            const strandGeom = new THREE.CylinderGeometry(0.0025, 0.0045, 1, 6);
            const strandMat = createBloodFireMaterial({
                coreBrightness: 1.4,
                plasmaSpeed: 12,
                isCharged: 0.5,
                layerScale: 1.6,
                rimPower: 2.4,
                redTint: 0.92
            });
            strandMat.side = THREE.DoubleSide;
            strandMat.uniforms.alpha.value = 0.9;
            segGroup.add(new THREE.Mesh(strandGeom, strandMat));
            group.add(segGroup);
            this._drainBeamSegments.push(segGroup);
            allMats.push(coreMat, outerMat, strandMat);
            allGeoms.push(coreGeom, outerGeom, strandGeom);
        }
        this._drainBeamMats = allMats;
        this._drainBeamGeoms = allGeoms;
        this.lifeDrainBeam = group;
        this.scene.add(this.lifeDrainBeam);
        const drainLight = new THREE.PointLight(0xaa0a0a, 0, 14, 2);
        this._drainTargetLight = drainLight;
        this.scene.add(drainLight);
    }

    _updateLifeDrainBeam() {
        if (!this.lifeDrainBeam || !this.lifeDrainTargetMesh || !this._drainBeamSegments.length) return;
        if (!this._drainFrom) { this._drainFrom = new THREE.Vector3(); this._drainTo = new THREE.Vector3(); this._drainDir = new THREE.Vector3(); this._drainMid = new THREE.Vector3(); this._drainSegDir = new THREE.Vector3(); this._drainWorldUp = new THREE.Vector3(0, 1, 0); this._drainFallbackUp = new THREE.Vector3(1, 0, 0); }
        const from = this._drainFrom;
        const wp = this.character.getWeaponPosition();
        from.copy(wp);
        this.lifeDrainTargetMesh.getWorldPosition(this._enemyPos);
        const to = this._drainTo.copy(this._enemyPos);
        const dist = from.distanceTo(to);
        const dir = this._drainDir.subVectors(to, from).normalize();
        this._drainRight.crossVectors(dir, this._drainWorldUp).normalize();
        if (this._drainRight.lengthSq() < 0.01) this._drainRight.crossVectors(dir, this._drainFallbackUp).normalize();
        this._drainUp.crossVectors(this._drainRight, dir).normalize();
        const t = this.lifeDrainBeamTime || 0;
        const seed = t * 18;
        const amp = 0.25 + 0.028 * Math.min(dist, 12);
        const maxPoints = this._drainZapNumPointsMax;
        const maxSegLen = this._drainMaxSegmentLength;
        const n = Math.min(maxPoints, Math.max(12, 1 + Math.ceil(dist / maxSegLen)));
        const path = this._drainPath;
        for (let i = 0; i < n; i++) {
            const ti = (n - 1) > 0 ? i / (n - 1) : 0;
            path[i].lerpVectors(from, to, ti);
            if (i > 0 && i < n - 1) {
                const sway = Math.sin(seed + i * 2.7) * amp + Math.sin(seed * 1.4 + i * 4.2) * amp * 0.5 + Math.cos(seed * 0.8 + i * 1.9) * amp * 0.35;
                const lift = Math.cos(seed + i * 3.1 + 1) * amp + Math.cos(seed * 1.6 + i * 3.8) * amp * 0.5 + Math.sin(seed * 0.9 + i * 2.4) * amp * 0.35;
                path[i].addScaledVector(this._drainRight, sway);
                path[i].addScaledVector(this._drainUp, lift);
            }
        }
        const segs = this._drainBeamSegments;
        const mid = this._drainMid;
        const segDir = this._drainSegDir;
        for (let j = 0; j < segs.length; j++) {
            if (j >= n - 1) { segs[j].visible = false; continue; }
            const p0 = path[j], p1 = path[j + 1];
            mid.addVectors(p0, p1).multiplyScalar(0.5);
            segDir.subVectors(p1, p0);
            const len = segDir.length();
            segs[j].position.copy(mid);
            segs[j].quaternion.setFromUnitVectors(this._drainWorldUp, segDir.normalize());
            segs[j].scale.set(1, Math.max(0.05, len), 1);
            segs[j].visible = true;
        }
        this.lifeDrainBeam.visible = true;
        const pulse = 0.88 + 0.08 * Math.sin(t * 14);
        if (this._drainBeamMats && this._drainBeamMats.length) {
            this._drainBeamMats.forEach((mat, i) => {
                const speed = [8, 5, 12][i % 3];
                const alpha = [0.88 * pulse, 0.5 * pulse, 0.9 * pulse][i % 3];
                updateBloodFireMaterial(mat, t * speed, alpha);
            });
        }
        if (this._drainTargetLight) {
            this._drainTargetLight.position.copy(this._enemyPos);
            this._drainTargetLight.intensity = 22 + 8 * Math.sin(t * 18);
            this._drainTargetLight.color.setHex(0xaa0a0a);
        }
    }

    _endLifeDrain(canceled = false) {
        this.gameState.combat.isLifeDraining = false;
        this.lifeDrainTarget = null;
        this.lifeDrainTargetMesh = null;
        this.lifeDrainCooldown = canceled ? 2.5 : this.lifeDrainCooldownDuration;
        this.lifeDrainBeamTime = 0;
        this._drainFlowAccum = 0;
        this._drainTargetBurstAccum = 0;
        if (this.lifeDrainBeam) this.lifeDrainBeam.visible = false;
        if (this._drainTargetLight) this._drainTargetLight.intensity = 0;
    }

    addEnemy(enemy) {
        this.enemies.push(enemy.mesh || enemy);
    }

    removeEnemy(enemy) {
        const mesh = enemy.mesh || enemy;
        const index = this.enemies.indexOf(mesh);
        if (index > -1) {
            this.enemies.splice(index, 1);
        }
    }
}
