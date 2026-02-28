/**
 * Combat System - Handles attacks, combos, and hit detection
 */

import * as THREE from 'three';
import { createBloodFireMaterial, updateBloodFireMaterial } from '../shaders/BloodFireShader.js';
import { createBloodFireVFX } from '../effects/BloodFireVFX.js';
import { createIceMaterial, updateIceMaterial } from '../shaders/IceShader.js';
import { FrostCombat } from './FrostCombat.js';
import { DaggerCombat } from './DaggerCombat.js';
import { BowCombat } from './BowCombat.js';

export class CombatSystem {
    constructor(scene, character, gameState, particleSystem = null, onProjectileHit = null) {
        this.scene = scene;
        this.character = character;
        this.gameState = gameState;
        this.particleSystem = particleSystem;
        this.onProjectileHit = onProjectileHit;

        // Read kit combat config (falls back to Blood Mage defaults if no kit set)
        const kit = gameState.selectedKit;
        const vfx = kit?.vfx || {};
        this._vfx = vfx;
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
        this.whipDuration = vfx.abilityE?.whipDuration ?? 0.48;
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
        this._drainZapNumPointsMax = vfx.lifeDrain?.beamPoints ?? 140;
        this._drainMaxSegmentLength = vfx.lifeDrain?.maxSegmentLength ?? 0.11;
        this._drainTargetLight = null;
        this._drainRight = new THREE.Vector3();
        this._drainUp = new THREE.Vector3();
        this._drainPath = Array.from({ length: this._drainZapNumPointsMax }, () => new THREE.Vector3());
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
        this.isBowRangerKit = (kit?.id === 'bow_ranger');
        this.bowRangerCombat = this.isBowRangerKit ? new BowCombat(this) : null;

        // Crit / backstab stats from kit
        const stats = kit?.stats;
        this._critChance = stats?.critChance ?? 0.15;
        this._critMultiplier = stats?.critMultiplier ?? 1.5;
        this._backstabMultiplier = stats?.backstabMultiplier ?? 1.3;
        this._backstabTmpFwd = new THREE.Vector3();
        this._backstabTmpToPlayer = new THREE.Vector3();
    }

    // ─── Crit / Backstab helpers ─────────────────────────────────

    /** Roll crit based on kit's critChance + gear/talent bonuses. */
    _rollCrit() {
        const bonus = this.gameState?.bonuses?.critChance ?? 0;
        return Math.random() < (this._critChance + bonus);
    }

    /**
     * Check if the player is behind the enemy (backstab).
     * Returns true if the player's attack comes from behind the enemy's facing direction.
     * @param {object} enemy - enemy with mesh.rotation or _getForward
     * @param {THREE.Object3D} [enemyMesh] - the enemy's mesh for position
     */
    _isBackstab(enemy, enemyMesh) {
        if (!enemy || !enemy.mesh) return false;
        const playerPos = this.character.position;

        // Get enemy forward direction
        if (typeof enemy._getForward === 'function') {
            enemy._getForward(this._backstabTmpFwd);
        } else {
            this._backstabTmpFwd.set(0, 0, 1).applyEuler(enemy.mesh.rotation);
            this._backstabTmpFwd.y = 0;
            this._backstabTmpFwd.normalize();
        }

        // Vector from enemy to player
        const ePos = enemy.position || enemy.mesh.position;
        this._backstabTmpToPlayer.set(
            playerPos.x - ePos.x,
            0,
            playerPos.z - ePos.z
        ).normalize();

        // If the player is behind the enemy, dot product of enemy-forward and enemy-to-player is negative
        return this._backstabTmpFwd.dot(this._backstabTmpToPlayer) < -0.25;
    }

    /**
     * Apply crit and backstab modifiers to a base damage value.
     * Returns { damage, isCritical, isBackstab }.
     */
    _applyCritBackstab(baseDamage, enemy, enemyMesh) {
        const isCritical = this._rollCrit();
        const isBackstab = this._isBackstab(enemy, enemyMesh);
        const bonuses = this.gameState?.bonuses;
        let damage = baseDamage;
        if (isBackstab) damage = Math.floor(damage * (this._backstabMultiplier + (bonuses?.backstabMultiplier ?? 0)));
        if (isCritical) damage = Math.floor(damage * (this._critMultiplier + (bonuses?.critMultiplier ?? 0)));
        // Bow multi-shot vulnerability debuff
        if (enemy?._bowVulnerabilityRemaining > 0) damage = Math.floor(damage * (enemy._bowVulnerabilityMult ?? 1));

        // Lifesteal from gear/talents
        const lifesteal = bonuses?.lifesteal ?? 0;
        if (lifesteal > 0 && damage > 0) {
            const heal = Math.max(1, Math.floor(damage * lifesteal));
            this.gameState.heal(heal);
        }

        return { damage, isCritical, isBackstab };
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
        const vp = this._vfx.projectile || {};
        const pv = isCharged ? (vp.charged || {}) : (vp.basic || {});
        const radius = isCharged ? this.chargedRadius : this.basicRadius;
        const speed = isCharged ? this.chargedSpeed : this.basicSpeed;
        const seg = pv.segments ?? (isCharged ? 12 : 8);
        const group = new THREE.Group();
        group.position.copy(startPos);
        group.castShadow = false;

        const materials = [];
        const geometries = [];

        const outerParams = pv.outer || {};
        const outerMat = createBloodFireMaterial({
            coreBrightness: outerParams.coreBrightness ?? (isCharged ? 1.0 : 0.9),
            plasmaSpeed: outerParams.plasmaSpeed ?? (isCharged ? 3.5 : 3.8),
            isCharged: outerParams.isCharged ?? (isCharged ? 1.0 : 0.0),
            layerScale: outerParams.layerScale ?? (isCharged ? 0.7 : 0.85),
            rimPower: outerParams.rimPower ?? (isCharged ? 2.0 : 1.8),
            redTint: outerParams.redTint ?? 0.92
        });
        outerMat.uniforms.alpha.value = outerParams.alpha ?? (isCharged ? 0.5 : 0.45);
        const outerGeo = new THREE.SphereGeometry(radius, seg, seg);
        group.add(new THREE.Mesh(outerGeo, outerMat));
        materials.push(outerMat);
        geometries.push(outerGeo);

        const coreParams = pv.core || {};
        const coreMat = createBloodFireMaterial({
            coreBrightness: coreParams.coreBrightness ?? (isCharged ? 2.2 : 2.0),
            plasmaSpeed: coreParams.plasmaSpeed ?? (isCharged ? 6.5 : 5.5),
            isCharged: coreParams.isCharged ?? (isCharged ? 1.0 : 0.0),
            layerScale: coreParams.layerScale ?? (isCharged ? 1.6 : 1.3),
            rimPower: coreParams.rimPower ?? (isCharged ? 2.0 : 1.8),
            redTint: coreParams.redTint ?? 0.92
        });
        const coreRatio = pv.coreRatio ?? 0.55;
        const coreGeo = new THREE.SphereGeometry(radius * coreRatio, seg, seg);
        group.add(new THREE.Mesh(coreGeo, coreMat));
        materials.push(coreMat);
        geometries.push(coreGeo);

        const vfx = createBloodFireVFX(this.scene, group, { isCharged });
        const velocity = new THREE.Vector3().copy(dir).normalize().multiplyScalar(speed);
        return {
            mesh: group, velocity, lifetime: 0,
            maxLifetime: isCharged ? this.chargedLifetime : this.basicLifetime,
            damage: isCharged ? this.chargedDamage : this.basicDamage,
            releaseBurst: isCharged ? (vp.charged?.releaseBurst ?? 0.15) : 0,
            isCharged: !!isCharged,
            materials, geometries, vfx,
            hitSet: new Set()
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
        const vx = this._vfx.abilityX || {};
        const pr = vx.previewRing || {};
        const r = this.bloodNovaRadius * (pr.radiusScale ?? 0.85);
        const innerInset = pr.innerInset ?? 0.22;
        const outerInset = pr.outerInset ?? 0.18;
        const segments = pr.segments ?? 64;
        const geo = new THREE.RingGeometry(r - innerInset, r + outerInset, segments);
        const mat = new THREE.MeshBasicMaterial({
            color: pr.color ?? 0xaa1030,
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
            const vx = this._vfx.abilityX || {};
            this.particleSystem.emitSparks(center, vx.windupSparks ?? 18);
            this.particleSystem.emitEmbers(center, vx.windupEmbers ?? 12);
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
            const { damage: novaDmg, isCritical: novaCrit, isBackstab: novaBack } = this._applyCritBackstab(this.bloodNovaDamage, enemy, enemyMesh);
            enemy.takeDamage(novaDmg);
            enemy.staggerTimer = Math.max(enemy.staggerTimer, this.bloodNovaFreezeDuration + (enemy.isBoss ? 0.8 : 0.0));
            enemy.state = 'stagger';
            hitCount++;
            this.gameState.emit('damageNumber', {
                position: this._enemyPos.clone(),
                damage: novaDmg,
                isCritical: novaCrit,
                isBackstab: novaBack,
                kind: 'ability',
                anchorId: this._getDamageAnchorId(enemy)
            });
        }
        if (this._bloodNovaPreview) this._bloodNovaPreview.mesh.visible = false;
        if (hitCount > 0) {
            this.bloodNovaCooldown = this.bloodNovaCooldownDuration;
            this.gameState.addBloodCharge(1);
            if (this.particleSystem) {
                const vx = this._vfx.abilityX || {};
                this.particleSystem.emitBloodNovaBurst(center, this.bloodNovaRadius * 1.15);
                this.particleSystem.emitBloodMatterExplosion(center);
                this.particleSystem.emitUltimateExplosion(center);
                this.particleSystem.emitUltimateEndExplosion(center);
                this.particleSystem.emitSparks(center, vx.releaseSparks ?? 45);
                this.particleSystem.emitEmbers(center, vx.releaseEmbers ?? 35);
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
        if (input.bloodNova && !this.isDaggerKit && !this.isBowRangerKit) {
            if (this.isFrostKit && this.frostCombat) {
                this.frostCombat.beginStalactiteTargeting();
            } else {
                this.castBloodNova();
            }
        }
        if (this.bloodNovaWindup > 0) {
            this.bloodNovaWindup -= deltaTime;
            if (this._bloodNovaPreview) {
                const vx = this._vfx.abilityX || {};
                const ws = vx.windupScale || {};
                const wo = vx.windupOpacity || {};
                const pr = vx.previewRing || {};
                const t = 1 - Math.max(0, this.bloodNovaWindup) / this.bloodNovaWindupDuration;
                const pulse = (ws.start ?? 0.15) + t * ((ws.end ?? 1.15) - (ws.start ?? 0.15));
                this._bloodNovaPreview.mesh.position.copy(this._bloodNovaPendingCenter);
                this._bloodNovaPreview.mesh.position.y = pr.groundY ?? 0.03;
                this._bloodNovaPreview.mesh.scale.setScalar(pulse);
                this._bloodNovaPreview.mat.opacity = (wo.start ?? 0.2) + ((wo.end ?? 0.8) - (wo.start ?? 0.2)) * t;
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
                            const { damage: drainDmg, isCritical: drainCrit, isBackstab: drainBack } = this._applyCritBackstab(this.lifeDrainDamagePerTick, this.lifeDrainTarget, this.lifeDrainTargetMesh);
                            this.lifeDrainTarget.takeDamage(drainDmg);
                            const heal = Math.floor(drainDmg * this.lifeDrainHealRatio);
                            this.gameState.heal(heal);
                            this.gameState.addUltimateCharge('basic');
                            const elapsed = this.lifeDrainDuration - this.lifeDrainTimer;
                            const secondsFull = Math.floor(elapsed);
                            if (secondsFull > this._lastDrainBloodSecond) {
                                this.gameState.addBloodCharge(1);
                                this._lastDrainBloodSecond = secondsFull;
                            }
                            this.gameState.emit('damageNumber', { position: this._enemyPos.clone(), damage: drainDmg, isCritical: drainCrit, isBackstab: drainBack, anchorId: this._getDamageAnchorId(this.lifeDrainTarget) });
                            if (this.particleSystem) this.particleSystem.emitDrainFlow(this._enemyPos, this.character.position, (this._vfx.lifeDrain?.damageFlowCount ?? 18));
                        }
                        this.lifeDrainBeamTime += deltaTime;
                        this._updateLifeDrainBeam();
                        if (this.particleSystem) {
                            this._drainFlowAccum = (this._drainFlowAccum || 0) + deltaTime;
                            const ldFlow = this._vfx.lifeDrain || {};
                            if (this._drainFlowAccum >= (ldFlow.flowInterval ?? 0.08)) {
                                this._drainFlowAccum = 0;
                                this.particleSystem.emitDrainFlow(this._enemyPos, this.character.position, ldFlow.flowCount ?? 10);
                            }
                            this._drainTargetBurstAccum = (this._drainTargetBurstAccum || 0) + deltaTime;
                            if (this._drainTargetBurstAccum >= (ldFlow.burstInterval ?? 0.15)) {
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
                        this.particleSystem.emitDrainFlow(targetPos.clone(), this.character.position.clone(), this._vfx.lifeDrain?.castFlowCount ?? 40);
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
            const expandT = Math.min(1, v.elapsed / (v.expandDuration ?? 0.22));
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
            // Brief cooldown after charged attack fires (animation wind-down)
            this.chargedAttackTimer -= deltaTime;
            if (this.chargedAttackTimer <= 0) {
                this.gameState.combat.isChargedAttacking = false;
            }
        } else if (this.gameState.combat.isAttacking) {
            this.updateAttack(deltaTime);
        } else {
            if (input.chargedAttackRelease) {
                if (this.chargeTimer >= this.minChargeToRelease && this.gameState.useStamina(10)) {
                    this.gameState.combat.releasedCharge = this.chargeTimer;
                    // Fire immediately on release
                    if (this.isBowRangerKit && this.bowRangerCombat) {
                        this.bowRangerCombat.spawnArrow(true);
                    } else if (this.isDaggerKit) {
                        this._nextMeleeIsCharged = true;
                        this.checkHits();
                        this.spawnDaggerChargedSlash();
                    } else {
                        this.spawnFireball(true);
                    }
                    this.gameState.combat.isChargedAttacking = true;
                    this.chargedAttackTimer = 0.2; // brief recovery
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
        if (this.bowRangerCombat) this.bowRangerCombat.update(deltaTime);
    }

    updateChargeOrb(deltaTime) {
        const combat = this.gameState.combat;
        const co = this._vfx.chargeOrb || {};
        if (combat.isCharging && combat.chargeTimer > 0) {
            if (!this.chargeOrb) {
                const sphereRadius = co.sphereRadius ?? 0.22;
                const sphereSegs = co.sphereSegments ?? 32;
                const geometry = new THREE.SphereGeometry(sphereRadius, sphereSegs, sphereSegs);
                let material;
                const matType = co.materialType || 'bloodfire';
                const matParams = co.material || {};
                if (matType === 'ice') {
                    material = createIceMaterial(matParams);
                } else if (matType === 'standard' || matType === 'basic') {
                    material = new THREE.MeshStandardMaterial(matParams);
                } else {
                    material = createBloodFireMaterial(matParams);
                }
                this.chargeOrb = new THREE.Mesh(geometry, material);
                this.chargeOrb.castShadow = false;
                // Hide the sphere mesh for bow and dagger — only show ring particles
                this.chargeOrb.userData._hideSphere = !!(this.isBowRangerKit || this.isDaggerKit);
                this.chargeOrb.userData.orbTime = 0;
                // Tightening ring of embers
                const ringCount = co.ringCount ?? 36;
                const ringPos = new Float32Array(ringCount * 3);
                const ringGeo = new THREE.BufferGeometry();
                ringGeo.setAttribute('position', new THREE.BufferAttribute(ringPos, 3));
                const ringMat = new THREE.PointsMaterial({
                    size: co.ringSize ?? 0.04,
                    color: co.ringColor ?? 0xaa0a0a,
                    transparent: true,
                    opacity: co.ringOpacity ?? 0.9,
                    depthWrite: false,
                    blending: THREE.AdditiveBlending
                });
                const ring = new THREE.Points(ringGeo, ringMat);
                this.chargeOrb.add(ring);
                this.chargeOrb.userData.ringGeo = ringGeo;
                this.chargeOrb.userData.ringMat = ringMat;
                this.chargeOrb.userData.ringCount = ringCount;
                this.scene.add(this.chargeOrb);
            }
            this.chargeOrb.userData.orbTime += deltaTime;
            const t = Math.min(1, combat.chargeTimer / this.chargeDuration);
            const sr = co.scaleRange || [0.2, 1.8];
            const scale = sr[0] + (sr[1] - sr[0]) * t;
            this.chargeOrb.scale.setScalar(scale);
            const wpos = this.character.getWeaponPosition();
            const wdir = this.character.getForwardDirection();
            const fwdOff = co.forwardOffset ?? 0.4;
            if (this.isBowRangerKit) {
                this.chargeOrb.position.set(wpos.x, wpos.y + 0.32, wpos.z);
            } else {
                this.chargeOrb.position.set(wpos.x + wdir.x * fwdOff, wpos.y + wdir.y * fwdOff, wpos.z + wdir.z * fwdOff);
            }
            // Pulse: brightness and alpha increase with charge
            const pulseCfg = co.pulse || {};
            const pulse = (pulseCfg.base ?? 0.95) + (pulseCfg.amp ?? 0.15) * Math.sin(this.chargeOrb.userData.orbTime * (pulseCfg.freq ?? 6));
            if (this.chargeOrb.userData._hideSphere) {
                // Bow/dagger: sphere is hidden, only ring particles show
                this.chargeOrb.material.opacity = 0;
                this.chargeOrb.material.visible = false;
            } else if (this.chargeOrb.material.uniforms) {
                const alphaR = co.alphaRange || [0.75, 1.0];
                const brightR = co.brightnessRange || [0.9, 1.5];
                this.chargeOrb.material.uniforms.time.value = this.chargeOrb.userData.orbTime;
                this.chargeOrb.material.uniforms.alpha.value = alphaR[0] + (alphaR[1] - alphaR[0]) * t * pulse;
                this.chargeOrb.material.uniforms.coreBrightness.value = brightR[0] + (brightR[1] - brightR[0]) * t * pulse;
            } else if (this.chargeOrb.material.opacity !== undefined) {
                this.chargeOrb.material.opacity = 0.6 + 0.35 * t;
                if (this.chargeOrb.material.emissiveIntensity !== undefined) this.chargeOrb.material.emissiveIntensity = 1.2 + 1.6 * t;
            }
            // Ring tightens and brightens with charge
            const rrRange = co.ringRadiusRange || [0.06, 0.6];
            const ringRadius = rrRange[1] - (rrRange[1] - rrRange[0]) * t;
            const ringGeo = this.chargeOrb.userData.ringGeo;
            const posAttr = ringGeo.getAttribute('position');
            const rc = this.chargeOrb.userData.ringCount || 36;
            for (let i = 0; i < rc; i++) {
                const a = (i / rc) * Math.PI * 2 + this.chargeOrb.userData.orbTime * 2;
                posAttr.array[i * 3] = Math.cos(a) * ringRadius;
                posAttr.array[i * 3 + 1] = Math.sin(a) * ringRadius;
                posAttr.array[i * 3 + 2] = 0;
            }
            posAttr.needsUpdate = true;
            const roRange = co.ringOpacityRange || [0.5, 1.0];
            this.chargeOrb.userData.ringMat.opacity = roRange[0] + (roRange[1] - roRange[0]) * t;
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

        if (this.isBowRangerKit && this.bowRangerCombat) {
            this.bowRangerCombat.spawnArrow(false);
        } else if (this.isDaggerKit) {
            this.spawnDaggerBladeWave();
        } else {
            this.spawnFireball(false);
        }

        const basicClip = this.character.actions?.['Basic attack']?.getClip();
        const basicTimeScale = this.isDaggerKit ? 8.0 : ((this.isBowRangerKit) ? 2.25 : 3.8);
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

        let mult = this._consumeNextAttackMultiplier();
        const c = this.gameState.combat;
        if (c.teleportDamageBuffRemaining > 0) mult *= 2.0;
        if (c.poisonDamageBuffRemaining > 0) mult *= (c.poisonDamageBuffMultiplier ?? 1);
        if (c.bowDamageZoneMultiplier > 1) mult *= c.bowDamageZoneMultiplier;
        let rawDamage = Math.floor(baseDamage * comboMultiplier * mult);

        const enemy = hitInfo.object.userData.enemy;
        if (enemy) {
            const { damage, isCritical, isBackstab } = this._applyCritBackstab(rawDamage, enemy, hitInfo.object);
            enemy.takeDamage(damage);
            this.gameState.addUltimateCharge(isCharged ? 'charged' : 'basic');
            if (this.isDaggerKit) {
                const basicCfg = this.gameState.selectedKit?.combat?.basicAttack || {};
                const chargedCfg = this.gameState.selectedKit?.combat?.chargedAttack || {};
                const gain = isCharged ? (chargedCfg.poisonChargeGain ?? 2) : (basicCfg.poisonChargeGain ?? 1);
                this.gameState.addPoisonCharge(gain);
            }
            if (this.isBowRangerKit) {
                const basicCfg = this.gameState.selectedKit?.combat?.basicAttack || {};
                const chargedCfg = this.gameState.selectedKit?.combat?.chargedAttack || {};
                const gain = isCharged ? (chargedCfg.trustChargeGain ?? 2) : (basicCfg.trustChargeGain ?? 1);
                this.gameState.addTrustCharge(gain);
            }
            const hitPos = hitInfo.point?.clone() ?? hitInfo.object.getWorldPosition?.(new THREE.Vector3()) ?? this.character.position.clone();
            this.gameState.emit('damageNumber', { position: hitPos, damage, isCritical, isBackstab, anchorId: this._getDamageAnchorId(enemy) });
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
                const rawWhipDmg = Math.floor(this.whipDamage * this._consumeNextAttackMultiplier());
                const { damage: whipDamage, isCritical: whipCrit, isBackstab: whipBack } = this._applyCritBackstab(rawWhipDmg, enemy, hit.object);
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
                this.gameState.emit('damageNumber', { position: this._enemyPos.clone(), damage: whipDamage, isCritical: whipCrit, isBackstab: whipBack, anchorId: this._getDamageAnchorId(enemy) });
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
        // Launch feedback: snappy but brief — save the big boom for impact
        if (this.onProjectileHit) this.onProjectileHit({ bloodCrescendLaunch: true, bloodflailCharges: chargesUsed });
    }

    spawnDaggerBladeWave() {
        const vp = this._vfx.projectile || {};
        const bv = vp.basic || {};
        const wp = this.character.getWeaponPosition().clone();
        const dir = this.character.getForwardDirection().clone().normalize();
        const startPos = wp.addScaledVector(dir, 0.8);

        // Alternate slash direction per combo
        const comboIdx = this.gameState.combat.comboCount || 1;
        const slashAngle = comboIdx % 2 === 0 ? -0.35 : 0.35;

        // Long blade shape — tapered katana energy wave
        const bladeShape = new THREE.Shape();
        const len = bv.bladeLen ?? 3.2;
        const width = bv.bladeWidth ?? 0.55;
        // Tip (sharp point forward)
        bladeShape.moveTo(len * 0.5, 0);
        // Top edge — slight outward curve
        bladeShape.quadraticCurveTo(len * 0.15, width * 0.65, -len * 0.5, width * 0.25);
        // Tail (flat back)
        bladeShape.lineTo(-len * 0.5, -width * 0.25);
        // Bottom edge — mirror curve
        bladeShape.quadraticCurveTo(len * 0.15, -width * 0.65, len * 0.5, 0);
        const geom = new THREE.ShapeGeometry(bladeShape, 10);
        geom.rotateX(-Math.PI / 2);

        const group = new THREE.Group();
        group.position.copy(startPos);
        group.lookAt(startPos.clone().add(dir));
        group.rotateZ(slashAngle);

        // Core blade
        const mat = new THREE.MeshBasicMaterial({
            color: bv.coreColor ?? 0x33ff77,
            transparent: true,
            opacity: 0.95,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        group.add(new THREE.Mesh(geom, mat));

        // Outer glow
        const glowGeom = new THREE.ShapeGeometry(bladeShape, 10);
        glowGeom.rotateX(-Math.PI / 2);
        const glowMat = new THREE.MeshBasicMaterial({
            color: bv.glowColor ?? 0x22cc66,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        const glowMesh = new THREE.Mesh(glowGeom, glowMat);
        glowMesh.scale.set(bv.glowScale ?? 1.35, 1.0, 1.6);
        group.add(glowMesh);

        this.scene.add(group);

        if (this.particleSystem) {
            this.particleSystem.emitPoisonBurst(startPos.clone(), bv.launchSparks ?? 6);
        }

        this.projectiles.push({
            mesh: group,
            velocity: dir.multiplyScalar(bv.speed ?? 30),
            lifetime: 0,
            maxLifetime: bv.maxLifetime ?? 0.2,
            isDaggerBlade: true,
            isDaggerSlash: true,
            hitSet: new Set(),
            materials: [mat, glowMat],
            geometries: [geom, glowGeom]
        });
    }

    /** Charged attack: twin crossing blades (X pattern) with bigger VFX */
    spawnDaggerChargedSlash() {
        const vp = this._vfx.projectile || {};
        const cv = vp.charged || {};
        const wp = this.character.getWeaponPosition().clone();
        const dir = this.character.getForwardDirection().clone().normalize();
        const startPos = wp.addScaledVector(dir, 0.6);

        const len = cv.bladeLen ?? 3.8;
        const width = cv.bladeWidth ?? 0.7;
        const spreadAngle = cv.spreadAngle ?? 0.55;
        for (let side = -1; side <= 1; side += 2) {
            const bladeShape = new THREE.Shape();
            bladeShape.moveTo(len * 0.5, 0);
            bladeShape.quadraticCurveTo(len * 0.15, width * 0.65, -len * 0.5, width * 0.25);
            bladeShape.lineTo(-len * 0.5, -width * 0.25);
            bladeShape.quadraticCurveTo(len * 0.15, -width * 0.65, len * 0.5, 0);
            const geom = new THREE.ShapeGeometry(bladeShape, 10);
            geom.rotateX(-Math.PI / 2);

            const group = new THREE.Group();
            group.position.copy(startPos);
            group.lookAt(startPos.clone().add(dir));
            group.rotateZ(side * spreadAngle);

            const mat = new THREE.MeshBasicMaterial({
                color: cv.coreColor ?? 0x55ff90,
                transparent: true,
                opacity: 0.95,
                side: THREE.DoubleSide,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            });
            group.add(new THREE.Mesh(geom, mat));

            const glowGeom = new THREE.ShapeGeometry(bladeShape, 10);
            glowGeom.rotateX(-Math.PI / 2);
            const glowMat = new THREE.MeshBasicMaterial({
                color: cv.glowColor ?? 0x22cc66,
                transparent: true,
                opacity: 0.35,
                side: THREE.DoubleSide,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            });
            const glow = new THREE.Mesh(glowGeom, glowMat);
            glow.scale.set(cv.glowScale ?? 1.3, 1.0, 1.5);
            group.add(glow);

            this.scene.add(group);
            this.projectiles.push({
                mesh: group,
                velocity: dir.clone().multiplyScalar(cv.speed ?? 32),
                lifetime: 0,
                maxLifetime: cv.maxLifetime ?? 0.24,
                isDaggerBlade: true,
                isDaggerSlash: true,
                isChargedSlash: true,
                hitSet: new Set(),
                materials: [mat, glowMat],
                geometries: [geom, glowGeom]
            });
        }

        if (this.particleSystem) {
            this.particleSystem.emitPoisonBurst(startPos.clone(), cv.launchSparks ?? 16);
            this.particleSystem.emitShadowStepBurst(startPos.clone(), cv.launchEmbers ?? 12);
        }
        if (this.onProjectileHit) this.onProjectileHit({ daggerSlashImpact: true });
    }

    _applyDaggerBladeDamage(enemy, hitPos) {
        const basic = this.gameState.selectedKit?.combat?.basicAttack || {};
        const poisonGain = basic.poisonChargeGain ?? 1;
        const baseDamage = basic.damage ?? this.gameState.equipment.weapon.damage;
        const comboMultiplier = 1 + (this.gameState.combat.comboCount - 1) * 0.2;

        let mult = this._consumeNextAttackMultiplier();
        const c = this.gameState.combat;
        if (c.teleportDamageBuffRemaining > 0) mult *= 2.0;
        if (c.poisonDamageBuffRemaining > 0) mult *= (c.poisonDamageBuffMultiplier ?? 1);
        const rawDamage = Math.floor(baseDamage * comboMultiplier * mult);
        const { damage, isCritical, isBackstab } = this._applyCritBackstab(rawDamage, enemy);

        enemy.takeDamage(damage);
        this.gameState.addUltimateCharge('basic');
        this.gameState.addPoisonCharge(poisonGain);
        this.gameState.emit('damageNumber', { position: hitPos.clone(), damage, isCritical, isBackstab, anchorId: this._getDamageAnchorId(enemy) });
        if (this.particleSystem?.emitPoisonBurst) this.particleSystem.emitPoisonBurst(hitPos.clone(), 18);
        if (this.onProjectileHit) this.onProjectileHit({ daggerBladeHit: true, daggerSlashImpact: true });
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
            const projVfx = this._vfx.projectile || {};
            const pv = isCharged ? (projVfx.charged || {}) : (projVfx.basic || {});
            if (this.isFrostKit) {
                this.particleSystem.emitIceBurst(startPos, pv.launchSparks ?? (isCharged ? 10 : 5));
            } else {
                this.particleSystem.emitSparks(startPos, pv.launchSparks ?? (isCharged ? 10 : 5));
                this.particleSystem.emitEmbers(startPos, pv.launchEmbers ?? (isCharged ? 6 : 3));
            }
        }

        const speed = isCharged ? this.chargedSpeed : this.basicSpeed;
        const damage = Math.floor((isCharged ? this.chargedDamage : this.basicDamage) * this._consumeNextAttackMultiplier());
        const maxLifetime = isCharged ? this.chargedLifetime : this.basicLifetime;
        const releaseBurst = isCharged ? (this._vfx.projectile?.charged?.releaseBurst ?? 0.15) : 0;

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
            p.hitSet.clear();
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
            const alpha = (this._vfx.projectile?.fadeAlpha ?? 0.92) * lifePct;
            if (p.isBowArrow) {
                // Bow arrows: fade materials and emit trail sparks
                if (p.materials) {
                    p.materials.forEach(m => { m.opacity = Math.max(0, m.opacity) * (0.4 + 0.6 * lifePct); });
                }
                // Trail particles
                if (this.particleSystem && p.lifetime > 0.05 && Math.random() < 0.5) {
                    this.particleSystem.emitSparks(p.mesh.position.clone(), 1);
                }
            } else if (p.isDaggerBlade) {
                // Animate slash: scale outward and fade
                if (p.isDaggerSlash) {
                    const expandT = Math.min(1, p.lifetime / (p.maxLifetime * 0.5));
                    const scale = 0.6 + 0.6 * expandT;
                    p.mesh.scale.setScalar(scale);
                    p.materials.forEach(m => { m.opacity = (m === p.materials[0] ? 0.92 : 0.45) * lifePct; });
                } else if (p.mesh.material) {
                    p.mesh.material.opacity = 0.85 * lifePct;
                }
            } else if (p.materials) {
                if (p.skipShaderUpdate) {
                    // Lightweight fade for small shards — skip expensive shader uniforms
                    p.materials.forEach(mat => { if (mat.uniforms?.alpha) mat.uniforms.alpha.value = alpha; });
                } else {
                    p.materials.forEach((mat, idx) => {
                        const layerAlpha = idx === 0 ? alpha * (this._vfx.projectile?.outerAlphaRatio ?? 0.5) : alpha;
                        if (p.isFrost) {
                            updateIceMaterial(mat, p.lifetime, layerAlpha);
                        } else {
                            updateBloodFireMaterial(mat, p.lifetime, layerAlpha);
                        }
                    });
                }
            }

            if (p.lifetime >= p.maxLifetime) {
                if (this.particleSystem) {
                    const epVfx = this._vfx.projectile || {};
                    const epv = p.isCharged ? (epVfx.charged || {}) : (epVfx.basic || {});
                    if (p.isBowArrow) {
                        this.particleSystem.emitSparks(p.mesh.position.clone(), p.isCharged ? 6 : 3);
                    } else if (p.isDaggerBlade) {
                        this.particleSystem.emitPoisonBurst?.(p.mesh.position.clone(), 8);
                    } else if (p.isFrost) {
                        this.particleSystem.emitIceBurst(p.mesh.position, p.isCharged ? 8 : 3);
                    } else {
                        this.particleSystem.emitSmoke(p.mesh.position, epv.expireSmoke ?? (p.isCharged ? 3 : 1));
                    }
                }
                this.disposeProjectile(p);
                this.projectiles.splice(i, 1);
                continue;
            }

            if (p.isDaggerBlade) {
                const bladePos = p.mesh.position;
                for (const enemyMesh of this.enemies) {
                    const enemy = enemyMesh.userData?.enemy;
                    if (!enemy || enemy.health <= 0 || p.hitSet.has(enemy)) continue;
                    enemyMesh.getWorldPosition(this._enemyPos);
                    const hitRadius = (enemy.hitRadius ?? (enemy.isBoss ? 2.5 : 0.8)) + 1.1;
                    if (bladePos.distanceTo(this._enemyPos) < hitRadius) {
                        p.hitSet.add(enemy);
                        this._meleeHitThisSwing = true;
                        this._applyDaggerBladeDamage(enemy, this._enemyPos);
                        this.disposeProjectile(p);
                        this.projectiles.splice(i, 1);
                        break;
                    }
                }
                continue;
            }

            let hit = false;
            const fireballPos = p.mesh.position;
            for (const enemyMesh of this.enemies) {
                enemyMesh.getWorldPosition(this._enemyPos);
                const enemy = enemyMesh.userData?.enemy;
                if (!enemy || enemy.health <= 0 || p.hitSet.has(enemy)) continue;
                const modelRadius = enemy.hitRadius ?? (enemy.isBoss ? 2.5 : 0.8);
                const hrPad = this._vfx.projectile?.hitRadiusPadding || {};
                const hitRadius = modelRadius + (p.isCharged ? (hrPad.charged ?? 0.6) : (hrPad.basic ?? 0.3));
                // Use XZ (horizontal) distance — prevents Y offset between
                // projectile flight height and mesh root from shrinking the hitbox
                const dx = fireballPos.x - this._enemyPos.x;
                const dz = fireballPos.z - this._enemyPos.z;
                const distXZ = Math.sqrt(dx * dx + dz * dz);
                if (distXZ < hitRadius) {
                    p.hitSet.add(enemy);
                    const { damage: projDmg, isCritical: projCrit, isBackstab: projBack } = this._applyCritBackstab(p.damage, enemy, enemyMesh);
                    enemy.takeDamage(projDmg);
                    hit = true;

                    // Bow arrow: Judgment Arrow AoE at 6+ stacks
                    if (p.isJudgmentArrow && p.judgmentAoe) {
                        for (const otherMesh of this.enemies) {
                            const otherEnemy = otherMesh.userData?.enemy;
                            if (!otherEnemy || otherEnemy === enemy || otherEnemy.health <= 0) continue;
                            otherMesh.getWorldPosition(this._centerFlat);
                            if (fireballPos.distanceTo(this._centerFlat) > (p.judgmentAoeRadius ?? 3.5)) continue;
                            const aoeDmg = Math.floor(projDmg * 0.6);
                            otherEnemy.takeDamage(aoeDmg);
                            this.gameState.emit('damageNumber', { position: this._centerFlat.clone(), damage: aoeDmg, isCritical: false, kind: 'ability', anchorId: this._getDamageAnchorId(otherEnemy) });
                        }
                        if (this.particleSystem) this.particleSystem.emitSparks(fireballPos.clone(), 25);
                    }

                    // Bow arrow: Judgment Arrow mark at 8 stacks (+30% vuln 6s)
                    if (p.isJudgmentArrow && p.judgmentMark) {
                        enemy._bowVulnerabilityRemaining = 6;
                        enemy._bowVulnerabilityMult = 1.3;
                    }

                    // Bow arrow: Multi Shot vulnerability debuff (+50% damage taken 6s)
                    if (p.isMultiShot && this.bowRangerCombat) {
                        this.bowRangerCombat.applyMultiShotVulnerability(enemy);
                    }

                    this.gameState.addUltimateCharge(p.isCharged ? 'charged' : 'basic');
                    if (p.isBowArrow) {
                        this.gameState.addTrustCharge(p.isCharged ? 2 : 1);
                    } else if (p.isFrost && this.frostCombat) {
                        this.frostCombat.addFrostStack(enemy, p.isCharged ? 2 : 1);
                    } else {
                        this.gameState.addBloodCharge(p.isCharged ? 2 : 1);
                    }
                    this.gameState.emit('damageNumber', { position: this._enemyPos.clone(), damage: projDmg, isCritical: projCrit, isBackstab: projBack, anchorId: this._getDamageAnchorId(enemy) });
                    if (this.particleSystem) {
                        const hitVfx = this._vfx.projectile || {};
                        const hpv = p.isCharged ? (hitVfx.charged || {}) : (hitVfx.basic || {});
                        if (p.isBowArrow) {
                            this.particleSystem.emitSparks(fireballPos.clone(), p.isCharged ? 8 : 4);
                            if (this.particleSystem.emitVioletBurst) this.particleSystem.emitVioletBurst(fireballPos, p.isCharged ? 6 : 3);
                        } else if (p.isFrost) {
                            this.particleSystem.emitIceBurst(fireballPos, p.isCharged ? 12 : 6);
                            this.particleSystem.emitIceShatter(fireballPos, p.isCharged ? 8 : 4);
                        } else {
                            this.particleSystem.emitHitEffect(fireballPos);
                            this.particleSystem.emitEmbers(fireballPos, hpv.hitEmbers ?? (p.isCharged ? 6 : 3));
                        }
                    }
                    if (this.onProjectileHit) {
                        this.onProjectileHit({ charged: p.isCharged, isBoss: !!enemy.isBoss, isUltimate: !!p.isUltimateArrow, isBowArrow: !!p.isBowArrow });
                    }
                    // Piercing arrows don't stop on hit
                    if (!p.isPiercing) break;
                }
            }
            if (hit && !p.isPiercing) {
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
            const vq = this._vfx.abilityQ || {};
            const pr = vq.previewRing || {};
            const r = this.crimsonEruptionRadius;
            const inset = pr.inset ?? 0.35;
            const segments = pr.segments ?? 48;
            const ringGeo = new THREE.RingGeometry(r - inset, r, segments);
            const mat = new THREE.MeshBasicMaterial({
                color: pr.color ?? 0x880808,
                transparent: true,
                opacity: pr.opacity ?? 0.5,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            this.crimsonEruptionPreview = new THREE.Mesh(ringGeo, mat);
            this.crimsonEruptionPreview.rotation.x = -Math.PI / 2;
            this.crimsonEruptionPreview.position.y = pr.groundY ?? 0.02;
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
        const vq = this._vfx.abilityQ || {};
        const discCfg = vq.disc || {};
        const discSegs = discCfg.segments ?? 48;
        const discGeo = new THREE.CircleGeometry(1, discSegs);
        const discMatParams = discCfg.material || {};
        const mat = createBloodFireMaterial({
            coreBrightness: discMatParams.coreBrightness ?? 2.2,
            plasmaSpeed: discMatParams.plasmaSpeed ?? 12,
            isCharged: discMatParams.isCharged ?? 1.0,
            layerScale: discMatParams.layerScale ?? 2.5,
            rimPower: discMatParams.rimPower ?? 3.0,
            alpha: discMatParams.alpha ?? 0.9,
            redTint: discMatParams.redTint ?? 0.92
        });
        mat.side = THREE.DoubleSide;
        const disc = new THREE.Mesh(discGeo, mat);
        disc.rotation.x = -Math.PI / 2;
        disc.position.copy(center);
        disc.position.y = discCfg.groundY ?? 0.02;
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
            duration: vq.duration ?? 1.35,
            expandDuration: vq.expandDuration ?? 0.22,
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
            const ceEnemy = enemyMesh.userData.enemy;
            const { damage: ceDmg, isCritical: ceCrit, isBackstab: ceBack } = this._applyCritBackstab(this.crimsonEruptionDamage, ceEnemy, enemyMesh);
            ceEnemy.takeDamage(ceDmg);
            ceEnemy.staggerTimer = Math.max(ceEnemy.staggerTimer, 0.8);
            ceEnemy.state = 'stagger';
            enemyMesh.getWorldPosition(this._enemyPos);
            this.gameState.emit('damageNumber', { position: this._enemyPos.clone(), damage: ceDmg, isCritical: ceCrit, isBackstab: ceBack, kind: 'ability', anchorId: this._getDamageAnchorId(ceEnemy) });
            crimsonHitCount++;
        }
        if (crimsonHitCount > 0) this.gameState.addBloodCharge(2);
        if (this.onProjectileHit) this.onProjectileHit({ crimsonEruption: true });
    }

    _createUltimateOrb() {
        const vf = this._vfx.abilityF || {};
        const radius = vf.orbRadius ?? 0.52;
        const orbSegs = vf.orbSegments ?? 16;
        const sphereGeo = new THREE.SphereGeometry(radius, orbSegs, orbSegs);
        const orbMat = this._createUltimateOrbMaterial();
        orbMat.uniforms.uRadius.value = radius;
        const mesh = new THREE.Mesh(sphereGeo, orbMat);
        mesh.castShadow = false;
        const group = new THREE.Group();
        group.frustumCulled = false;
        const lightCfg = vf.light || {};
        const glowCfg = vf.outerGlow || {};
        const orbLight = new THREE.PointLight(lightCfg.color ?? 0xc1081a, 0, lightCfg.distance ?? 25, lightCfg.decay ?? 2.5);
        const outerGlow = new THREE.PointLight(glowCfg.color ?? 0x7a0010, 0, glowCfg.distance ?? 16, glowCfg.decay ?? 1.2);
        group.add(mesh); group.add(orbLight); group.add(outerGlow);
        return { group, orbMat, sphereGeo, orbLight, outerGlow, velocity: new THREE.Vector3() };
    }

    spawnUltimateSlash(position, direction) {
        if (this.ultimateSlash) return;
        if (!this._ultimatePool) this._ultimatePool = this._createUltimateOrb();
        const vf = this._vfx.abilityF || {};
        const lightCfg = vf.light || {};
        const glowCfg = vf.outerGlow || {};
        const u = this._ultimatePool;
        u.group.position.copy(position);
        u.group.scale.setScalar(1);
        u.velocity.copy(direction).normalize().multiplyScalar(vf.speed ?? 32);
        u.orbMat.uniforms.time.value = 0;
        u.orbMat.uniforms.alpha.value = vf.launchAlpha ?? 0.92;
        u.orbLight.intensity = lightCfg.intensityBase ?? 38;
        u.outerGlow.intensity = glowCfg.intensityBase ?? 14;
        this.scene.add(u.group);

        this.ultimateSlash = {
            mesh: u.group, velocity: u.velocity,
            lifetime: 0, maxLifetime: vf.maxLifetime ?? 2.4,
            baseDamage: vf.baseDamage ?? 280,
            scaleStart: vf.scaleStart ?? 0.28, scaleEnd: vf.scaleEnd ?? 4.5, growthDuration: vf.growthDuration ?? 0.8,
            materials: [u.orbMat], timeScales: [1], geometries: [],
            light: u.orbLight, outerGlow: u.outerGlow, hitOnce: false, _pooled: true
        };
        this._ultimateHitSet.clear();
        if (this.particleSystem) {
            this.particleSystem.emitUltimateLaunch(position);
            this.particleSystem.emitSparks(position, vf.launchSparks ?? 15);
            this.particleSystem.emitEmbers(position, vf.launchEmbers ?? 10);
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
        const vfPulse = (this._vfx.abilityF || {}).pulse || {};
        const pulse = 1 + (vfPulse.amp ?? 0.08) * Math.sin(s.lifetime * (vfPulse.freq ?? 14));
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
        const vfLight = (this._vfx.abilityF || {}).light || {};
        const vfGlow = (this._vfx.abilityF || {}).outerGlow || {};
        if (s.light) s.light.intensity = ((vfLight.intensityBase ?? 38) + (vfLight.intensityPulse ?? 10) * Math.sin(s.lifetime * (vfLight.pulseFreq ?? 10))) * lifePct;
        if (s.outerGlow) s.outerGlow.intensity = ((vfGlow.intensityBase ?? 14) + (vfGlow.intensityPulse ?? 4) * Math.sin(s.lifetime * (vfGlow.pulseFreq ?? 8))) * lifePct;

        // Trail every 2nd frame + reuse dir to avoid allocations and reduce lag
        if (this.particleSystem && s.lifetime < s.maxLifetime - 0.1) {
            const trailTick = (s._trailTick = (s._trailTick || 0) + 1);
            if (trailTick % 2 === 0) {
                if (!this._ultimateTrailDir) this._ultimateTrailDir = new THREE.Vector3();
                this._ultimateTrailDir.copy(s.velocity).normalize();
                const vfTrail = this._vfx.abilityF || {};
                this.particleSystem.emitOrbTrail(s.mesh.position, this._ultimateTrailDir, vfTrail.trailOrbs ?? 14);
                this.particleSystem.emitSlashTrail(s.mesh.position, this._ultimateTrailDir, vfTrail.trailSlash ?? 6);
            }
        }

        const orbPos = s.mesh.position;
        for (const enemyMesh of this.enemies) {
            if (!enemyMesh.userData?.enemy) continue;
            const enemy = enemyMesh.userData.enemy;
            enemyMesh.getWorldPosition(this._enemyPos);
            const hitRadius = (enemy.hitRadius ?? (enemy.isBoss ? 2.5 : 0.8)) + 0.8;
            if (orbPos.distanceTo(this._enemyPos) < hitRadius) {
                const rawUltDmg = Math.floor(s.baseDamage * Math.min(1.5, Math.max(0.3, s.currentScale)));
                const { damage, isCritical: ultCrit, isBackstab: ultBack } = this._applyCritBackstab(rawUltDmg, enemy, enemyMesh);
                enemy.takeDamage(damage);
                this.gameState.emit('damageNumber', { position: this._enemyPos.clone(), damage, isCritical: ultCrit || true, isBackstab: ultBack, kind: 'heavy', anchorId: this._getDamageAnchorId(enemy) });
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
        const cr = (this._vfx.abilityE || {}).crescend || {};

        const stackRatio = Math.min(1, Math.max(0, chargesUsed / 8));
        const stackScale = 1 + 1.1 * Math.pow(stackRatio, 1.35);
        const bladeLen = ((cr.bladeLenBase ?? 2.2) + chargesUsed * (cr.bladeLenPerCharge ?? 0.5)) * stackScale;
        const bwScale = cr.bladeWidthScale || [0.92, 0.45];
        const bladeWidth = ((cr.bladeWidthBase ?? 0.74) + chargesUsed * (cr.bladeWidthPerCharge ?? 0.16)) * (bwScale[0] + bwScale[1] * stackScale);
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

        const outerCfg = cr.outer || {};
        const geoOuter = new THREE.ShapeGeometry(makeCrescentShape(bladeLen, bladeWidth, 0.44), cr.outerSegments ?? 42);
        const matOuter = createBloodFireMaterial({
            coreBrightness: (outerCfg.coreBrightnessBase ?? 1.55) + chargesUsed * (outerCfg.coreBrightnessPerCharge ?? 0.18) + stackScale * 0.18,
            plasmaSpeed: (outerCfg.plasmaSpeedBase ?? 7.0) + stackScale * 0.6,
            isCharged: 1.0,
            layerScale: outerCfg.layerScale ?? 1.36,
            rimPower: outerCfg.rimPower ?? 1.5,
            alpha: Math.min(1.0, (outerCfg.alphaBase ?? 0.96) + stackScale * 0.04),
            redTint: outerCfg.redTint ?? 0.95
        });
        const meshOuter = new THREE.Mesh(geoOuter, matOuter);

        const innerScale = cr.innerScale || [0.86, 0.74];
        const geoInner = new THREE.ShapeGeometry(makeCrescentShape(bladeLen * innerScale[0], bladeWidth * innerScale[1], 0.5), cr.innerSegments ?? 34);
        const matInner = new THREE.MeshBasicMaterial({
            color: cr.innerColor ?? 0xff4a4a, transparent: true, opacity: cr.innerOpacity ?? 0.5, side: THREE.DoubleSide, depthWrite: false
        });
        const meshInner = new THREE.Mesh(geoInner, matInner);

        const coreScale = cr.coreScale || [0.68, 0.50];
        const geoCore = new THREE.ShapeGeometry(makeCrescentShape(bladeLen * coreScale[0], bladeWidth * coreScale[1], 0.54), cr.coreSegments ?? 28);
        const matCore = new THREE.MeshBasicMaterial({
            color: cr.coreColor ?? 0xffc0a0, transparent: true, opacity: cr.coreOpacity ?? 0.32, side: THREE.DoubleSide, depthWrite: false
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

        const speed = (cr.speedBase ?? 25) + chargesUsed * (cr.speedPerCharge ?? 1.45);
        const baseDamage = 85 + chargesUsed * 36;
        const totalDamage = Math.floor(baseDamage * (multiplier ?? 1) * this._consumeNextAttackMultiplier());

        this.bloodCrescend = {
            mesh: group,
            velocity: dirNorm.clone().multiplyScalar(speed),
            lifetime: 0,
            maxLifetime: (cr.lifetimeBase ?? 1.2) + chargesUsed * (cr.lifetimePerCharge ?? 0.07) + stackScale * 0.08,
            hitRadius: (cr.hitRadiusBase ?? 2.05) + chargesUsed * (cr.hitRadiusPerCharge ?? 0.34) + stackScale * 0.5,
            damage: totalDamage,
            chargesUsed,
            materials: [matOuter, matInner, matCore],
            geometries: [geoOuter, geoInner, geoCore],
            hitSet: new Set(),
            stackScale
        };

        if (this.particleSystem) {
            this.particleSystem.emitSparks(position, (cr.launchSparksBase ?? 14) + chargesUsed * (cr.launchSparksPerCharge ?? 3));
            this.particleSystem.emitEmbers(position, (cr.launchEmbersBase ?? 10) + chargesUsed * (cr.launchEmbersPerCharge ?? 2));
            this.particleSystem.emitSlashTrail(position, dirNorm, (cr.launchTrailBase ?? 10) + chargesUsed * (cr.launchTrailPerCharge ?? 2));
        }
    }

    updateBloodCrescend(deltaTime) {
        const c = this.bloodCrescend;
        if (!c) return;
        c.lifetime += deltaTime;
        c.mesh.position.addScaledVector(c.velocity, deltaTime);
        const lifePct = 1 - c.lifetime / c.maxLifetime;

        // Blood crescend: shader-based animation (blood mage only now)
        const crPulse = ((this._vfx.abilityE || {}).crescend || {}).pulse || {};
        const scaleBoost = c.stackScale ?? 1;
        const pulse = 1 + ((crPulse.base ?? 0.22) + 0.08 * (scaleBoost - 1)) * Math.sin(c.lifetime * (crPulse.freq ?? 24));
        c.mesh.scale.set((1 + 0.2 * Math.sin(c.lifetime * (crPulse.scaleFreq ?? 16))) * scaleBoost, pulse * scaleBoost, scaleBoost);

        const fireMat = c.materials[0];
        if (fireMat?.uniforms) updateBloodFireMaterial(fireMat, c.lifetime * 10, Math.max(0, 0.98 * lifePct));
        if (c.materials[1]) c.materials[1].opacity = Math.max(0, 0.5 * lifePct);
        if (c.materials[2]) c.materials[2].opacity = Math.max(0, 0.3 * lifePct);

        if (this.particleSystem) {
            c._trailTick = (c._trailTick || 0) + 1;
            if (c._trailTick % 3 === 0) {
                const trailDir = c.velocity.clone().normalize();
                this.particleSystem.emitSlashTrail(c.mesh.position, trailDir, 6 + c.chargesUsed);
                this.particleSystem.emitOrbTrail(c.mesh.position, trailDir, 5 + c.chargesUsed);
            }
        }

        for (const enemyMesh of this.enemies) {
            const enemy = enemyMesh.userData?.enemy;
            if (!enemy || enemy.health <= 0 || c.hitSet.has(enemy)) continue;
            enemyMesh.getWorldPosition(this._enemyPos);
            const hitRadius = (enemy.hitRadius ?? (enemy.isBoss ? 2.5 : 0.8)) + c.hitRadius;
            if (c.mesh.position.distanceTo(this._enemyPos) <= hitRadius) {
                c.hitSet.add(enemy);
                const { damage: bcDmg, isCritical: bcCrit, isBackstab: bcBack } = this._applyCritBackstab(c.damage, enemy, enemyMesh);
                enemy.takeDamage(bcDmg);
                enemy.staggerTimer = Math.max(enemy.staggerTimer, 0.95);
                enemy.state = 'stagger';
                this.gameState.addUltimateCharge('charged');
                this.gameState.emit('damageNumber', {
                    position: this._enemyPos.clone(),
                    damage: bcDmg,
                    isCritical: bcCrit,
                    isBackstab: bcBack,
                    kind: 'heavy',
                    anchorId: this._getDamageAnchorId(enemy)
                });
                if (this.particleSystem) {
                    this.particleSystem.emitPunchBurst(this._enemyPos.clone());
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
        const ld = this._vfx.lifeDrain || {};
        const coreCfg = ld.core || {};
        const outerCfg = ld.outer || {};
        const strandCfg = ld.strand || {};
        const lightCfg = ld.light || {};
        const group = new THREE.Group();
        group.visible = false;
        const numSegments = this._drainZapNumPointsMax - 1;
        const allMats = [];
        const allGeoms = [];
        for (let s = 0; s < numSegments; s++) {
            const segGroup = new THREE.Group();
            const coreGeom = new THREE.CylinderGeometry(coreCfg.radiusTop ?? 0.007, coreCfg.radiusBot ?? 0.013, 1, coreCfg.segments ?? 8);
            const coreMat = createBloodFireMaterial({
                coreBrightness: coreCfg.coreBrightness ?? 1.5,
                plasmaSpeed: coreCfg.plasmaSpeed ?? 10,
                isCharged: coreCfg.isCharged ?? 0.4,
                layerScale: coreCfg.layerScale ?? 1.3,
                rimPower: coreCfg.rimPower ?? 2.2,
                redTint: coreCfg.redTint ?? 0.92
            });
            coreMat.side = THREE.DoubleSide;
            coreMat.uniforms.alpha.value = coreCfg.alpha ?? 0.88;
            segGroup.add(new THREE.Mesh(coreGeom, coreMat));
            const outerGeom = new THREE.CylinderGeometry(outerCfg.radiusTop ?? 0.019, outerCfg.radiusBot ?? 0.028, 1, outerCfg.segments ?? 8);
            const outerMat = createBloodFireMaterial({
                coreBrightness: outerCfg.coreBrightness ?? 0.9,
                plasmaSpeed: outerCfg.plasmaSpeed ?? 6,
                isCharged: outerCfg.isCharged ?? 0.3,
                layerScale: outerCfg.layerScale ?? 0.9,
                rimPower: outerCfg.rimPower ?? 1.6,
                redTint: outerCfg.redTint ?? 0.92
            });
            outerMat.side = THREE.DoubleSide;
            outerMat.uniforms.alpha.value = outerCfg.alpha ?? 0.5;
            segGroup.add(new THREE.Mesh(outerGeom, outerMat));
            const strandGeom = new THREE.CylinderGeometry(strandCfg.radiusTop ?? 0.0025, strandCfg.radiusBot ?? 0.0045, 1, strandCfg.segments ?? 6);
            const strandMat = createBloodFireMaterial({
                coreBrightness: strandCfg.coreBrightness ?? 1.4,
                plasmaSpeed: strandCfg.plasmaSpeed ?? 12,
                isCharged: strandCfg.isCharged ?? 0.5,
                layerScale: strandCfg.layerScale ?? 1.6,
                rimPower: strandCfg.rimPower ?? 2.4,
                redTint: strandCfg.redTint ?? 0.92
            });
            strandMat.side = THREE.DoubleSide;
            strandMat.uniforms.alpha.value = strandCfg.alpha ?? 0.9;
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
        const drainLight = new THREE.PointLight(lightCfg.color ?? 0xaa0a0a, 0, lightCfg.distance ?? 14, lightCfg.decay ?? 2);
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
        const ldVfx = this._vfx.lifeDrain || {};
        const waverCfg = ldVfx.waver || {};
        const seed = t * (waverCfg.seedMult ?? 18);
        const amp = (waverCfg.ampBase ?? 0.25) + (waverCfg.ampPerDist ?? 0.028) * Math.min(dist, 12);
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
        const pulseCfg = ldVfx.pulse || {};
        const pulse = (pulseCfg.base ?? 0.88) + (pulseCfg.amp ?? 0.08) * Math.sin(t * (pulseCfg.freq ?? 14));
        if (this._drainBeamMats && this._drainBeamMats.length) {
            this._drainBeamMats.forEach((mat, i) => {
                const speed = [8, 5, 12][i % 3];
                const alpha = [0.88 * pulse, 0.5 * pulse, 0.9 * pulse][i % 3];
                updateBloodFireMaterial(mat, t * speed, alpha);
            });
        }
        if (this._drainTargetLight) {
            const lightCfg = ldVfx.light || {};
            this._drainTargetLight.position.copy(this._enemyPos);
            this._drainTargetLight.intensity = (lightCfg.intensityBase ?? 22) + (lightCfg.intensityPulse ?? 8) * Math.sin(t * (lightCfg.pulseFreq ?? 18));
            this._drainTargetLight.color.setHex(lightCfg.color ?? 0xaa0a0a);
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
