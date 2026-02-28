/**
 * FrostCombat - Frost Mage specific combat abilities.
 *
 * Manages: frost stacks on enemies, ice projectile creation,
 * Ice Claw (Q), Frost Beam (E), Ice Block (X), Ice Barrier (C),
 * Blizzard ultimate (F), and frost stack indicator visuals on enemies.
 *
 * Plugs into CombatSystem: CombatSystem delegates to this when kit is frost_mage.
 */

import * as THREE from 'three';
import { createIceMaterial, updateIceMaterial } from '../shaders/IceShader.js';
import { createIceVFX } from '../effects/IceVFX.js';

// ── Default frost stack colors (dark blue → bright cyan) ──
const DEFAULT_FROST_STACK_COLORS = [0x0a1a3a, 0x1a3a6a, 0x2255aa, 0x3377cc, 0x44aaee, 0x66ccff, 0x88ddff, 0xccf0ff];

export class FrostCombat {
    constructor(combatSystem) {
        this.cs = combatSystem;              // parent CombatSystem
        this._vfx = this.cs.gameState.selectedKit?.vfx || {};
        this.scene = combatSystem.scene;
        this.character = combatSystem.character;
        this.gameState = combatSystem.gameState;
        this.particleSystem = combatSystem.particleSystem;

        // ── Frost stacks per enemy (WeakMap: enemy → { stacks, lastTime, indicator }) ──
        this.frostStacks = new WeakMap();
        this.frostIndicators = new Map();    // enemy → THREE.Group (orbs)
        this._frostDecayCheckInterval = 0;

        // ── Ice Claw (Q) — 3 homing ice blades in a claw spread ──
        this.iceClaws = [];          // active claw blade array
        this.iceClawCooldown = 0;
        this.iceClawCooldownDuration = 7;
        this.iceClawDamage = 55;     // per blade

        // ── Frost Beam (E) - consumes frost stacks ──
        this.frostBeam = null;
        this.frostBeamTimer = 0;
        this.frostBeamDuration = 0.6;

        // ── Stalactite Drop (X) - ground-targeted AoE ──
        this.stalactiteTargeting = false;          // true while choosing zone
        this.stalactiteCooldown = 0;
        this.stalactiteCooldownDuration = 12;
        this.stalactiteRadius = 4.0;
        this.stalactiteDamage = 85;
        this.stalactiteFreezeDuration = 2.5;
        this.stalactitePreview = null;             // targeting ring mesh
        this.stalactiteActive = null;              // active stalactite falling
        this._stalactiteTargetPos = new THREE.Vector3();

        // ── Blizzard (F ultimate) - ground-targeted AoE ──
        this.blizzard = null;
        this.blizzardTargeting = false;
        this.blizzardDuration = 3.5;
        this.blizzardRadius = 8;
        this.blizzardDamagePerTick = 28;
        this.blizzardTickInterval = 0.25;
        this.blizzardPreview = null;
        this._blizzardTargetPos = new THREE.Vector3();

        // Reusable vectors
        this._enemyPos = new THREE.Vector3();
        this._tmpVec = new THREE.Vector3();
    }

    // ═══════════════════════════════════════════════════════════
    //  FROST STACKS
    // ═══════════════════════════════════════════════════════════

    /** Add frost stacks to an enemy. At 8, freeze the enemy. */
    addFrostStack(enemy, amount = 1) {
        if (!enemy || enemy.health <= 0) return;
        let data = this.frostStacks.get(enemy);
        if (!data) {
            data = { stacks: 0, lastTime: Date.now() };
            this.frostStacks.set(enemy, data);
        }
        data.stacks = Math.min(8, data.stacks + amount);
        data.lastTime = Date.now();

        // Update visual indicator
        this._updateFrostIndicator(enemy, data.stacks);

        // At 8 stacks: FREEZE
        if (data.stacks >= 8) {
            this._freezeEnemy(enemy);
            data.stacks = 0;
            this._updateFrostIndicator(enemy, 0);
        }
    }

    /** Get current frost stacks on an enemy */
    getFrostStacks(enemy) {
        const data = this.frostStacks.get(enemy);
        return data ? data.stacks : 0;
    }

    /** Consume all frost stacks on an enemy, return count consumed */
    consumeFrostStacks(enemy) {
        const data = this.frostStacks.get(enemy);
        if (!data || data.stacks <= 0) return 0;
        const consumed = data.stacks;
        data.stacks = 0;
        this._updateFrostIndicator(enemy, 0);
        return consumed;
    }

    /** Freeze an enemy (stagger for 3s) */
    _freezeEnemy(enemy) {
        const freezeDuration = 3.0;
        enemy.staggerTimer = Math.max(enemy.staggerTimer ?? 0, freezeDuration + (enemy.isBoss ? 1.0 : 0));
        enemy.state = 'stagger';

        // VFX burst
        if (this.particleSystem) {
            const mesh = this._getEnemyMesh(enemy);
            if (mesh) {
                const fi = this._vfx.frostIndicator ?? {};
                mesh.getWorldPosition(this._enemyPos);
                this.particleSystem.emitIceBurst(this._enemyPos, fi.freezeBurst ?? 40);
                this.particleSystem.emitIceShatter(this._enemyPos, fi.freezeShatter ?? 25);
            }
        }
    }

    /** Create/update frost stack indicator orbs around an enemy */
    _updateFrostIndicator(enemy, stacks) {
        let indicator = this.frostIndicators.get(enemy);

        if (stacks <= 0) {
            if (indicator) {
                indicator.visible = false;
            }
            return;
        }

        if (!indicator) {
            indicator = this._createFrostIndicator();
            this.frostIndicators.set(enemy, indicator);
            this.scene.add(indicator);
        }

        indicator.visible = true;
        // Show/hide individual orbs
        indicator.children.forEach((orb, i) => {
            orb.visible = i < stacks;
        });
    }

    _createFrostIndicator() {
        const fi = this._vfx.frostIndicator ?? {};
        const group = new THREE.Group();
        const maxStacks = 8;
        const circleRadius = fi.circleRadius ?? 1.6;
        const arcSpan = ((fi.arcSpan ?? 140) * Math.PI) / 180;
        const startAngle = -arcSpan / 2;
        const innerOrb = fi.innerOrb ?? {};
        const outerOrb = fi.outerOrb ?? {};
        const innerGeo = new THREE.SphereGeometry(innerOrb.radius ?? 0.055, innerOrb.segments ?? 6, innerOrb.segments ?? 6);
        const outerGeo = new THREE.SphereGeometry(outerOrb.radius ?? 0.08, outerOrb.segments ?? 6, outerOrb.segments ?? 6);

        const innerMat = createIceMaterial({
            coreBrightness: innerOrb.coreBrightness ?? 1.4,
            iceSpeed: innerOrb.iceSpeed ?? 4.0,
            isCharged: innerOrb.isCharged ?? 0.5,
            layerScale: innerOrb.layerScale ?? 1.2,
            alpha: innerOrb.alpha ?? 0.95
        });
        const outerMat = new THREE.MeshBasicMaterial({
            color: outerOrb.color ?? 0x0a2a5a,
            transparent: true,
            opacity: outerOrb.opacity ?? 0.7,
            depthWrite: false
        });

        for (let i = 0; i < maxStacks; i++) {
            const angle = startAngle + (i / (maxStacks - 1)) * arcSpan;
            const orbGroup = new THREE.Group();
            orbGroup.position.set(
                circleRadius * Math.cos(angle),
                0,
                circleRadius * Math.sin(angle)
            );
            const inner = new THREE.Mesh(innerGeo, innerMat);
            inner.userData.iceMat = innerMat;
            orbGroup.add(inner);
            const outer = new THREE.Mesh(outerGeo, outerMat);
            outer.renderOrder = -1;
            orbGroup.add(outer);
            orbGroup.visible = false;
            group.add(orbGroup);
        }

        group.visible = false;
        return group;
    }

    /** Update frost indicators to follow enemies. Call each frame. */
    updateFrostIndicators(deltaTime) {
        const fi = this._vfx.frostIndicator ?? {};
        const yOff = fi.yOffset ?? 1.8;
        const rotSpd = fi.rotationSpeed ?? 1.5;
        const pAmp = fi.pulseScale?.amp ?? 0.08;
        const pFreq = fi.pulseScale?.freq ?? 5;
        const decay = fi.decayTime ?? 10000;
        const t = performance.now() / 1000;
        for (const [enemy, indicator] of this.frostIndicators) {
            if (!indicator.visible) continue;
            const mesh = this._getEnemyMesh(enemy);
            if (!mesh) continue;
            mesh.getWorldPosition(this._enemyPos);
            indicator.position.set(this._enemyPos.x, this._enemyPos.y + yOff, this._enemyPos.z);
            indicator.rotation.y += deltaTime * rotSpd;

            // Animate visible orbs
            indicator.children.forEach((orbGroup, i) => {
                if (!orbGroup.visible) return;
                const pulse = 1 + pAmp * Math.sin(t * pFreq + i * 1.3);
                orbGroup.scale.setScalar(pulse);
                const inner = orbGroup.children[0];
                if (inner?.userData?.iceMat?.uniforms) {
                    updateIceMaterial(inner.userData.iceMat, t * 4, 0.9 + 0.08 * Math.sin(t * 3 + i));
                }
            });
        }

        // Decay: lose all stacks after configured time of no new stacks
        this._frostDecayCheckInterval += deltaTime;
        if (this._frostDecayCheckInterval >= 1.0) {
            this._frostDecayCheckInterval = 0;
            const now = Date.now();
            for (const [enemy, indicator] of this.frostIndicators) {
                const data = this.frostStacks.get(enemy);
                if (data && data.stacks > 0 && now - data.lastTime >= decay) {
                    data.stacks = 0;
                    this._updateFrostIndicator(enemy, 0);
                }
            }
        }
    }

    _getEnemyMesh(enemy) {
        for (const mesh of this.cs.enemies) {
            if (mesh.userData?.enemy === enemy) return mesh;
        }
        return null;
    }

    // ═══════════════════════════════════════════════════════════
    //  ICE PROJECTILES (javelin shape)
    // ═══════════════════════════════════════════════════════════

    createIceProjectile(isCharged, startPos, dir) {
        const vp = this._vfx.projectile ?? {};
        const tier = isCharged ? (vp.charged ?? {}) : (vp.basic ?? {});
        const length = isCharged ? (tier.length ?? 1.4) : (tier.length ?? 0.7);
        const radius = isCharged ? (tier.radius ?? 0.18) : (tier.radius ?? 0.09);
        const coneSides = tier.coneSides ?? 6;
        const speed = isCharged ? this.cs.chargedSpeed : this.cs.basicSpeed;
        const group = new THREE.Group();
        group.position.copy(startPos);
        group.castShadow = false;

        const materials = [];
        const geometries = [];

        // Javelin body (elongated cone)
        const outerCfg = tier.outer ?? {};
        const javelinGeo = new THREE.ConeGeometry(radius, length, coneSides);
        javelinGeo.rotateX(-Math.PI / 2); // point forward
        const javelinMat = createIceMaterial({
            coreBrightness: outerCfg.coreBrightness ?? (isCharged ? 1.6 : 1.2),
            iceSpeed: outerCfg.iceSpeed ?? (isCharged ? 4.5 : 3.5),
            isCharged: outerCfg.isCharged ?? (isCharged ? 1.0 : 0.0),
            layerScale: outerCfg.layerScale ?? (isCharged ? 0.8 : 1.0),
            rimPower: outerCfg.rimPower ?? (isCharged ? 2.5 : 2.0)
        });
        javelinMat.uniforms.alpha.value = outerCfg.alpha ?? (isCharged ? 0.85 : 0.8);
        const javelin = new THREE.Mesh(javelinGeo, javelinMat);
        group.add(javelin);
        materials.push(javelinMat);
        geometries.push(javelinGeo);

        // Inner core glow
        const coreCfg = tier.core ?? {};
        const coreScale = tier.coreScale ?? [0.5, 0.7];
        const coreGeo = new THREE.ConeGeometry(radius * coreScale[0], length * coreScale[1], coneSides);
        coreGeo.rotateX(-Math.PI / 2);
        const coreMat = createIceMaterial({
            coreBrightness: coreCfg.coreBrightness ?? (isCharged ? 2.5 : 2.0),
            iceSpeed: coreCfg.iceSpeed ?? (isCharged ? 7.0 : 5.5),
            isCharged: coreCfg.isCharged ?? (isCharged ? 1.0 : 0.0),
            layerScale: coreCfg.layerScale ?? (isCharged ? 1.5 : 1.2),
            rimPower: coreCfg.rimPower ?? 2.0
        });
        const core = new THREE.Mesh(coreGeo, coreMat);
        group.add(core);
        materials.push(coreMat);
        geometries.push(coreGeo);

        // Orient javelin to face movement direction
        const forward = dir.clone().normalize();
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), forward);
        group.quaternion.copy(quat);

        const vfx = createIceVFX(this.scene, group, { isCharged });
        const velocity = new THREE.Vector3().copy(forward).multiplyScalar(speed);

        return {
            mesh: group, velocity, lifetime: 0,
            maxLifetime: isCharged ? this.cs.chargedLifetime : this.cs.basicLifetime,
            damage: isCharged ? this.cs.chargedDamage : this.cs.basicDamage,
            releaseBurst: isCharged ? (tier.releaseBurst ?? 0.15) : 0,
            isCharged: !!isCharged,
            isFrost: true,
            materials, geometries, vfx,
            hitSet: new Set()
        };
    }

    // ═══════════════════════════════════════════════════════════
    //  ICE CLAW (Q) — 3 sweeping crescent arcs: ━ ╲ ╱
    // ═══════════════════════════════════════════════════════════

    castIceClaw() {
        if (this.iceClaws.length > 0 || this.iceClawCooldown > 0) return false;

        const vq = this._vfx.abilityQ ?? {};
        const startPos = this.character.getWeaponPosition();
        const forward = this.character.getForwardDirection().clone();
        forward.y = 0;
        if (forward.lengthSq() < 0.0001) forward.set(0, 0, -1);
        forward.normalize();

        const target = this._findNearestEnemy(startPos, vq.homingRadius ?? 22);

        // 3 crescent arcs in a claw pattern:
        //   ━━━  horizontal center slash
        //    ╲   diagonal right (tilted +40°)
        //    ╱   diagonal left  (tilted -40°)
        // Staggered spawn for a raking swipe feel
        const bladeConfigs = vq.bladeConfigs ?? [
            { rotZ: 0,     stagger: 0    },  // ━ horizontal
            { rotZ:  0.70, stagger: 0.04 },  // ╲ diagonal
            { rotZ: -0.70, stagger: 0.08 },  // ╱ diagonal
        ];

        const blade = vq.blade ?? {};
        for (let i = 0; i < 3; i++) {
            const cfg = bladeConfigs[i];

            // Wide crescent arc — looks like a slash mark
            const bladeGeo = new THREE.RingGeometry(
                blade.innerRadius ?? 0.7,
                blade.outerRadius ?? 1.5,
                blade.segments ?? 14,
                1, -Math.PI * 0.35, Math.PI * 0.7
            );
            const bladeMat = new THREE.MeshBasicMaterial({
                color: blade.color ?? 0x88ddff,
                transparent: true,
                opacity: 0.0,
                side: THREE.DoubleSide,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });

            const mesh = new THREE.Mesh(bladeGeo, bladeMat);
            mesh.position.copy(startPos).addScaledVector(forward, vq.spawnOffset ?? 0.4);

            // Orient crescent to face forward direction
            const quat = new THREE.Quaternion().setFromUnitVectors(
                new THREE.Vector3(0, 0, 1), forward
            );
            mesh.quaternion.copy(quat);
            // Tilt for horizontal vs diagonal claw marks
            const tilt = new THREE.Quaternion().setFromAxisAngle(forward, cfg.rotZ);
            mesh.quaternion.premultiply(tilt);

            mesh.scale.setScalar(vq.initialScale ?? 0.15); // starts tiny, swipes up
            this.scene.add(mesh);

            this.iceClaws.push({
                mesh,
                dir: forward.clone(),
                velocity: forward.clone().multiplyScalar(vq.speed ?? 20),
                lifetime: -cfg.stagger,
                maxLifetime: vq.maxLifetime ?? 0.75,
                damage: this.iceClawDamage,
                hitSet: new Set(),
                material: bladeMat,
                geometry: bladeGeo,
                target,
                homing: !!target,
                homingStrength: (vq.homingStrengthBase ?? 9) + i * (vq.homingStrengthStep ?? 2),
                index: i,
                _trailTick: 0,
                swipeDur: vq.swipeDuration ?? 0.12,
            });
        }

        this.iceClawCooldown = this.iceClawCooldownDuration;

        if (this.particleSystem) {
            this.particleSystem.emitIceBurst(startPos, vq.spawnBurst ?? 8);
        }
        if (this.cs.onProjectileHit) this.cs.onProjectileHit({ whipWindup: true });
        return true;
    }

    _findNearestEnemy(origin, maxDist) {
        let best = null;
        let bestDist = maxDist * maxDist;
        for (const enemyMesh of this.cs.enemies) {
            const enemy = enemyMesh.userData?.enemy;
            if (!enemy || enemy.health <= 0) continue;
            enemyMesh.getWorldPosition(this._enemyPos);
            const d2 = origin.distanceToSquared(this._enemyPos);
            if (d2 < bestDist) { bestDist = d2; best = { enemy, mesh: enemyMesh }; }
        }
        return best;
    }

    updateIceClaws(deltaTime) {
        const vq = this._vfx.abilityQ ?? {};
        const spinRate = vq.spinRate ?? 2.5;
        const trailInterval = vq.trailInterval ?? 4;
        const initScale = vq.initialScale ?? 0.15;
        for (let i = this.iceClaws.length - 1; i >= 0; i--) {
            const b = this.iceClaws[i];
            b.lifetime += deltaTime;
            if (b.lifetime < 0) continue; // stagger delay

            const age = b.lifetime;

            // Swipe-in: scale initScale → 1.0 with ease-out
            const swipeT = Math.min(1, age / b.swipeDur);
            const eased = 1 - (1 - swipeT) * (1 - swipeT);
            const scale = initScale + (1 - initScale) * eased;
            b.mesh.scale.setScalar(scale);

            // Opacity: fade in on swipe, hold, fade out in last 25%
            const lifePct = 1 - age / b.maxLifetime;
            const alpha = swipeT < 1 ? eased * 0.9
                : lifePct < 0.25 ? (lifePct / 0.25) * 0.9
                : 0.9;
            b.material.opacity = alpha;

            // Homing toward target
            if (b.homing && b.target) {
                const tEnemy = b.target.enemy;
                if (tEnemy && tEnemy.health > 0) {
                    b.target.mesh.getWorldPosition(this._tmpVec);
                    const toTarget = this._tmpVec.sub(b.mesh.position);
                    toTarget.y = 0;
                    const dist = toTarget.length();
                    if (dist > 0.1) {
                        toTarget.divideScalar(dist);
                        const speed = b.velocity.length();
                        b.velocity.addScaledVector(toTarget, b.homingStrength * deltaTime);
                        b.velocity.normalize().multiplyScalar(speed);
                    }
                } else {
                    b.homing = false;
                }
            }

            b.mesh.position.addScaledVector(b.velocity, deltaTime);
            b.mesh.rotateZ(deltaTime * spinRate); // gentle spin for flair

            // Trail — lightweight
            b._trailTick++;
            if (this.particleSystem && b._trailTick % trailInterval === 0 && lifePct > 0.15) {
                this.particleSystem.emitIceTrail(b.mesh.position, 1);
            }

            // Hit detection — wider radius matching the crescent size
            const bladePos = b.mesh.position;
            for (const enemyMesh of this.cs.enemies) {
                const enemy = enemyMesh.userData?.enemy;
                if (!enemy || enemy.health <= 0 || b.hitSet.has(enemy)) continue;
                enemyMesh.getWorldPosition(this._enemyPos);
                const hitRadius = (enemy.hitRadius ?? (enemy.isBoss ? 2.5 : 0.8)) + 1.2 * scale;
                if (bladePos.distanceTo(this._enemyPos) < hitRadius) {
                    b.hitSet.add(enemy);
                    const { damage, isCritical, isBackstab } = this.cs._applyCritBackstab(b.damage, enemy, enemyMesh);
                    enemy.takeDamage(damage);
                    this.addFrostStack(enemy, 2);
                    this.gameState.addUltimateCharge('charged');
                    this.gameState.emit('damageNumber', {
                        position: this._enemyPos.clone(), damage, isCritical, isBackstab,
                        kind: 'ability', anchorId: this.cs._getDamageAnchorId(enemy)
                    });
                    if (this.particleSystem) this.particleSystem.emitIceShatter(this._enemyPos, vq.hitShatter ?? 5);
                    if (this.cs.onProjectileHit) this.cs.onProjectileHit({ charged: true, isBoss: !!enemy.isBoss });
                }
            }

            if (age >= b.maxLifetime) {
                if (this.particleSystem) this.particleSystem.emitIceShatter(bladePos, vq.expiryShatter ?? 3);
                this.scene.remove(b.mesh);
                b.geometry.dispose();
                b.material.dispose();
                this.iceClaws.splice(i, 1);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  FROST BEAM (E) - consume frost stacks, freeze proportionally
    // ═══════════════════════════════════════════════════════════

    /** E ability: fire a frost beam that consumes frost stacks per enemy hit.
     *  Damage and freeze duration scale with each enemy's frost stacks.
     *  0.5s freeze per frost stack consumed on that enemy. */
    executeFrostBeam(chargesUsed, multiplier) {
        if (this.frostBeam) return;

        const ve = this._vfx.abilityE ?? {};
        const weaponPos = this.character.getWeaponPosition();
        const dir = this.character.getForwardDirection().clone();
        dir.y = 0;
        if (dir.lengthSq() < 0.0001) dir.set(0, 0, -1);
        dir.normalize();

        // Create beam visual - width scales with blood charges spent
        const beamLength = ve.beamLength ?? 12;
        const beamWidthBase = (ve.beamWidthBaseStart ?? 0.15) + chargesUsed * (ve.beamWidthBasePerCharge ?? 0.03);
        const beamWidthTip = (ve.beamWidthTipStart ?? 0.35) + chargesUsed * (ve.beamWidthTipPerCharge ?? 0.05);
        const beamGeo = new THREE.CylinderGeometry(beamWidthBase, beamWidthTip, beamLength, ve.outerSegments ?? 8);
        beamGeo.rotateX(Math.PI / 2);
        beamGeo.translate(0, 0, beamLength / 2);
        const outerCfg = ve.outer ?? {};
        const beamMat = createIceMaterial({
            coreBrightness: (outerCfg.coreBrightnessBase ?? 2.2) + chargesUsed * (outerCfg.coreBrightnessPerCharge ?? 0.15),
            iceSpeed: outerCfg.iceSpeed ?? 8.0,
            isCharged: outerCfg.isCharged ?? 1.0,
            layerScale: outerCfg.layerScale ?? 1.0,
            rimPower: outerCfg.rimPower ?? 1.5
        });
        beamMat.uniforms.alpha.value = outerCfg.alpha ?? 0.85;

        const beamMesh = new THREE.Mesh(beamGeo, beamMat);
        beamMesh.position.copy(weaponPos);
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
        beamMesh.quaternion.copy(quat);
        this.scene.add(beamMesh);

        // Inner core beam
        const ic = ve.innerCore ?? {};
        const coreGeo = new THREE.CylinderGeometry(
            ic.radiusTop ?? 0.06,
            ic.radiusBot ?? 0.18,
            beamLength * (ic.lengthRatio ?? 0.95),
            ic.segments ?? 6
        );
        coreGeo.rotateX(Math.PI / 2);
        coreGeo.translate(0, 0, beamLength / 2);
        const coreCfg = ve.core ?? {};
        const coreMat = createIceMaterial({
            coreBrightness: coreCfg.coreBrightness ?? 3.0,
            iceSpeed: coreCfg.iceSpeed ?? 12.0,
            isCharged: coreCfg.isCharged ?? 1.0,
            layerScale: coreCfg.layerScale ?? 1.6
        });
        const coreMesh = new THREE.Mesh(coreGeo, coreMat);
        coreMesh.position.copy(weaponPos);
        coreMesh.quaternion.copy(quat);
        this.scene.add(coreMesh);

        const lt = ve.light ?? {};
        const light = new THREE.PointLight(lt.color ?? 0x66ccff, lt.intensity ?? 12, lt.distance ?? 14, lt.decay ?? 2);
        light.position.copy(weaponPos);
        this.scene.add(light);

        // Hit enemies in the beam path — consume frost stacks per enemy
        for (const enemyMesh of this.cs.enemies) {
            const enemy = enemyMesh.userData?.enemy;
            if (!enemy || enemy.health <= 0) continue;
            enemyMesh.getWorldPosition(this._enemyPos);

            // Distance from enemy to beam line
            const toEnemy = this._tmpVec.subVectors(this._enemyPos, weaponPos);
            const proj = toEnemy.dot(dir);
            if (proj < 0 || proj > beamLength) continue;
            const projPoint = weaponPos.clone().addScaledVector(dir, proj);
            const dist = this._enemyPos.distanceTo(projPoint);
            const hitRadius = (enemy.hitRadius ?? (enemy.isBoss ? 2.5 : 0.8)) + 0.5;
            if (dist > hitRadius) continue;

            // Consume THIS enemy's frost stacks for scaling
            const frostStacks = this.consumeFrostStacks(enemy);
            // Damage: base from blood charges + bonus per frost stack
            const baseDamage = Math.floor((42 + chargesUsed * 18 + frostStacks * 12) * (multiplier ?? 1));
            // Freeze: 0.5s per frost stack consumed on this enemy
            const freezeDuration = frostStacks * 0.5;

            const { damage: beamDmg, isCritical: beamCrit, isBackstab: beamBack } = this.cs._applyCritBackstab(baseDamage, enemy, enemyMesh);
            enemy.takeDamage(beamDmg);
            if (freezeDuration > 0) {
                enemy.staggerTimer = Math.max(enemy.staggerTimer ?? 0, freezeDuration + (enemy.isBoss ? 0.5 : 0));
                enemy.state = 'stagger';
            }
            this.gameState.addUltimateCharge('charged');
            this.gameState.emit('damageNumber', {
                position: this._enemyPos.clone(),
                damage: beamDmg,
                isCritical: beamCrit,
                isBackstab: beamBack,
                kind: 'heavy',
                anchorId: this.cs._getDamageAnchorId(enemy)
            });
            if (this.particleSystem) {
                this.particleSystem.emitIceBurst(this._enemyPos, (ve.hitBurstBase ?? 20) + frostStacks * (ve.hitBurstPerStack ?? 4));
                this.particleSystem.emitIceShatter(this._enemyPos, (ve.hitShatterBase ?? 10) + frostStacks * (ve.hitShatterPerStack ?? 3));
            }
        }

        this.frostBeam = {
            beamMesh, coreMesh, light,
            materials: [beamMat, coreMat],
            geometries: [beamGeo, coreGeo],
            timer: ve.duration ?? this.frostBeamDuration
        };

        if (this.particleSystem) {
            this.particleSystem.emitIceBurst(weaponPos, ve.spawnBurst ?? 25);
        }
        if (this.cs.onProjectileHit) {
            this.cs.onProjectileHit({ whipHit: true, bloodflailCharges: chargesUsed, punchFinish: true });
        }

        // Trigger whip animation
        this.gameState.combat.isWhipAttacking = true;
        this.cs.whipTimer = this.cs.whipDuration;
        this.cs.whipHitOnce = true;
    }

    updateFrostBeam(deltaTime) {
        if (!this.frostBeam) return;
        const ve = this._vfx.abilityE ?? {};
        const fadeCfg = ve.fade ?? {};
        this.frostBeam.timer -= deltaTime;
        const duration = ve.duration ?? this.frostBeamDuration;
        const t = 1 - this.frostBeam.timer / duration;

        // Fade out
        const alpha = Math.max(0, 1 - t * t);
        this.frostBeam.materials.forEach(mat => updateIceMaterial(mat, performance.now() / 1000 * 8, alpha * 0.85));
        if (this.frostBeam.light) {
            this.frostBeam.light.intensity = (fadeCfg.lightIntensity ?? 30) * alpha;
        }

        // Scale down as it fades
        const scale = 1 - t * 0.5;
        this.frostBeam.beamMesh.scale.set(scale, scale, 1);
        this.frostBeam.coreMesh.scale.set(scale, scale, 1);

        if (this.frostBeam.timer <= 0) {
            this.scene.remove(this.frostBeam.beamMesh);
            this.scene.remove(this.frostBeam.coreMesh);
            this.scene.remove(this.frostBeam.light);
            this.frostBeam.geometries.forEach(g => g.dispose());
            this.frostBeam.materials.forEach(m => m.dispose());
            this.frostBeam.light.dispose();
            this.frostBeam = null;
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  STALACTITE DROP (X) - ground-targeted AoE
    //  First press: enter targeting mode (preview ring on ground)
    //  Second press / click: drop the stalactite
    // ═══════════════════════════════════════════════════════════

    /** Toggle stalactite targeting mode (called on X press) */
    beginStalactiteTargeting() {
        if (this.stalactiteCooldown > 0 || this.stalactiteActive) return false;

        if (this.stalactiteTargeting) {
            // Already targeting — cancel
            this.cancelStalactiteTargeting();
            return false;
        }

        this.stalactiteTargeting = true;
        return true;
    }

    /** Update targeting preview ring position */
    updateStalactitePreview(worldPosition) {
        if (!this.stalactiteTargeting) return;
        if (!this.stalactitePreview) {
            const vx = this._vfx.abilityX ?? {};
            const pr = vx.previewRing ?? {};
            const r = this.stalactiteRadius;
            const ringGeo = new THREE.RingGeometry(
                r - (pr.innerOffset ?? 0.3),
                r + (pr.outerOffset ?? 0.15),
                pr.segments ?? 48
            );
            const mat = new THREE.MeshBasicMaterial({
                color: pr.color ?? 0x44aaff,
                transparent: true,
                opacity: pr.opacity ?? 0.5,
                side: THREE.DoubleSide,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            });
            this.stalactitePreview = new THREE.Mesh(ringGeo, mat);
            this.stalactitePreview.rotation.x = -Math.PI / 2;
            this.stalactitePreview.position.y = 0.03;
            this.stalactitePreview.visible = false;
            this.scene.add(this.stalactitePreview);
        }
        this.stalactitePreview.position.x = worldPosition.x;
        this.stalactitePreview.position.z = worldPosition.z;
        this.stalactitePreview.visible = true;
        this._stalactiteTargetPos.set(worldPosition.x, 0, worldPosition.z);
    }

    hideStalactitePreview() {
        if (this.stalactitePreview) this.stalactitePreview.visible = false;
    }

    cancelStalactiteTargeting() {
        this.stalactiteTargeting = false;
        this.hideStalactitePreview();
    }

    /** Drop the stalactite at the target position */
    dropStalactite(targetPos) {
        if (!targetPos) targetPos = this._stalactiteTargetPos.clone();
        this.stalactiteTargeting = false;
        this.hideStalactitePreview();
        this.stalactiteCooldown = this.stalactiteCooldownDuration;

        const vx = this._vfx.abilityX ?? {};
        const center = targetPos.clone();
        center.y = 0;

        // Create falling stalactite mesh (pointed cone)
        const spikeCfg = vx.spike ?? {};
        const spikeHeight = spikeCfg.height ?? 5.0;
        const spikeRadius = spikeCfg.radius ?? 0.8;
        const spikeGeo = new THREE.ConeGeometry(spikeRadius, spikeHeight, spikeCfg.coneSides ?? 6);
        // Point downward
        spikeGeo.rotateX(Math.PI);
        const spikeMatCfg = spikeCfg.material ?? {};
        const spikeMat = createIceMaterial({
            coreBrightness: spikeMatCfg.coreBrightness ?? 1.8,
            iceSpeed: spikeMatCfg.iceSpeed ?? 3.0,
            isCharged: spikeMatCfg.isCharged ?? 1.0,
            layerScale: spikeMatCfg.layerScale ?? 0.5,
            rimPower: spikeMatCfg.rimPower ?? 2.5,
            displaceAmount: spikeMatCfg.displaceAmount ?? 0.6
        });
        spikeMat.uniforms.alpha.value = spikeMatCfg.alpha ?? 0.85;
        const spikeMesh = new THREE.Mesh(spikeGeo, spikeMat);
        const spawnH = vx.spawnHeight ?? 20;
        spikeMesh.position.set(center.x, spawnH, center.z); // start high above
        this.scene.add(spikeMesh);

        // Shadow/warning circle on ground
        const shadowCfg = vx.shadow ?? {};
        const shadowGeo = new THREE.CircleGeometry(this.stalactiteRadius, shadowCfg.segments ?? 32);
        const shadowMat = new THREE.MeshBasicMaterial({
            color: shadowCfg.color ?? 0x44aaff,
            transparent: true,
            opacity: shadowCfg.opacity ?? 0.3,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        const shadow = new THREE.Mesh(shadowGeo, shadowMat);
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.set(center.x, 0.05, center.z);
        this.scene.add(shadow);

        // Point light
        const ltCfg = vx.light ?? {};
        const light = new THREE.PointLight(ltCfg.color ?? 0x66ccff, ltCfg.intensity ?? 10, ltCfg.distance ?? 16, ltCfg.decay ?? 2);
        light.position.set(center.x, 10, center.z);
        this.scene.add(light);

        this.stalactiteActive = {
            mesh: spikeMesh,
            shadow, light,
            center,
            materials: [spikeMat, shadowMat],
            geometries: [spikeGeo, shadowGeo],
            phase: 'falling', // 'falling' → 'impact' → 'fade'
            fallTimer: 0,
            fallDuration: vx.fallDuration ?? 0.35,  // fast drop
            impactTimer: 0,
            impactDuration: vx.impactDuration ?? 0.8
        };

        if (this.particleSystem) {
            this.particleSystem.emitIceTrail(new THREE.Vector3(center.x, 15, center.z), vx.trailCount ?? 8);
        }
        if (this.cs.onProjectileHit) this.cs.onProjectileHit({ whipWindup: true });
    }

    updateStalactite(deltaTime) {
        if (!this.stalactiteActive) return;
        const vx = this._vfx.abilityX ?? {};
        const s = this.stalactiteActive;

        if (s.phase === 'falling') {
            s.fallTimer += deltaTime;
            const t = Math.min(1, s.fallTimer / s.fallDuration);
            // Accelerate downward (easeInQuad)
            const eased = t * t;
            const startY = vx.spawnHeight ?? 20;
            const endY = vx.groundY ?? 2.5;
            s.mesh.position.y = startY + (endY - startY) * eased;
            s.light.position.y = s.mesh.position.y + 2;

            // Shadow grows as spike approaches
            const shadowScale = 0.3 + 0.7 * eased;
            s.shadow.scale.setScalar(shadowScale);
            s.shadow.material.opacity = 0.2 + 0.4 * eased;

            // Update ice material
            if (s.mesh.material.uniforms) {
                updateIceMaterial(s.mesh.material, performance.now() / 1000 * 3, 0.85);
            }

            // Trail particles while falling - throttle for performance
            s._trailTick = (s._trailTick || 0) + 1;
            if (this.particleSystem && s._trailTick % (vx.trailInterval ?? 2) === 0) {
                this.particleSystem.emitIceTrail(s.mesh.position, 2);
            }

            if (t >= 1) {
                // IMPACT
                s.phase = 'impact';
                s.impactTimer = s.impactDuration;
                this._stalactiteImpact(s);
            }
        } else if (s.phase === 'impact') {
            s.impactTimer -= deltaTime;
            const lifePct = Math.max(0, s.impactTimer / s.impactDuration);

            // Fade spike and light
            if (s.mesh.material.uniforms) {
                updateIceMaterial(s.mesh.material, performance.now() / 1000 * 3, 0.8 * lifePct);
            }
            s.shadow.material.opacity = 0.3 * lifePct;
            s.light.intensity = 25 * lifePct;

            // Sink slightly
            s.mesh.position.y -= deltaTime * (vx.sinkRate ?? 0.5);

            if (s.impactTimer <= 0) {
                // Cleanup
                this.scene.remove(s.mesh);
                this.scene.remove(s.shadow);
                this.scene.remove(s.light);
                s.geometries.forEach(g => g.dispose());
                s.materials.forEach(m => m.dispose());
                s.light.dispose();
                this.stalactiteActive = null;
            }
        }
    }

    /** Apply stalactite impact: damage + freeze enemies in radius */
    _stalactiteImpact(s) {
        const center = s.center;
        let hitCount = 0;

        for (const enemyMesh of this.cs.enemies) {
            const enemy = enemyMesh.userData?.enemy;
            if (!enemy || enemy.health <= 0) continue;
            enemyMesh.getWorldPosition(this._enemyPos);
            const dist = center.distanceTo(this._enemyPos);
            const modelRadius = enemy.hitRadius ?? (enemy.isBoss ? 2.5 : 0.8);
            if (dist > this.stalactiteRadius + modelRadius) continue;

            const { damage: stalDmg, isCritical: stalCrit, isBackstab: stalBack } = this.cs._applyCritBackstab(this.stalactiteDamage, enemy, enemyMesh);
            enemy.takeDamage(stalDmg);
            this.addFrostStack(enemy, 3);
            // Freeze on impact
            const freezeDur = this.stalactiteFreezeDuration + (enemy.isBoss ? 0.5 : 0);
            enemy.staggerTimer = Math.max(enemy.staggerTimer ?? 0, freezeDur);
            enemy.state = 'stagger';
            hitCount++;
            this.gameState.addUltimateCharge('charged');
            this.gameState.emit('damageNumber', {
                position: this._enemyPos.clone(),
                damage: stalDmg,
                isCritical: stalCrit,
                isBackstab: stalBack,
                kind: 'ability',
                anchorId: this.cs._getDamageAnchorId(enemy)
            });
        }

        // VFX explosion
        if (this.particleSystem) {
            const vx = this._vfx.abilityX ?? {};
            this.particleSystem.emitIceShatter(center, vx.impactShatter ?? 50);
            this.particleSystem.emitIceBurst(center, vx.impactBurst ?? 40);
        }

        if (hitCount > 0 && this.cs.onProjectileHit) {
            this.cs.onProjectileHit({ bloodNova: true, hits: hitCount });
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  BLIZZARD (F ultimate) - ground-targeted AoE damage storm
    //  First press F: enter targeting mode (preview ring)
    //  Click: deploy blizzard at location
    // ═══════════════════════════════════════════════════════════

    /** Enter blizzard targeting mode */
    beginBlizzardTargeting() {
        if (this.blizzard) return false;
        this.blizzardTargeting = true;
        return true;
    }

    updateBlizzardPreview(worldPosition) {
        if (!this.blizzardTargeting) return;
        if (!this.blizzardPreview) {
            const vf = this._vfx.abilityF ?? {};
            const pr = vf.previewRing ?? {};
            const r = this.blizzardRadius;
            const ringGeo = new THREE.RingGeometry(
                r - (pr.innerOffset ?? 0.35),
                r + (pr.outerOffset ?? 0.2),
                pr.segments ?? 48
            );
            const mat = new THREE.MeshBasicMaterial({
                color: pr.color ?? 0x44aaff,
                transparent: true,
                opacity: pr.opacity ?? 0.45,
                side: THREE.DoubleSide,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            });
            this.blizzardPreview = new THREE.Mesh(ringGeo, mat);
            this.blizzardPreview.rotation.x = -Math.PI / 2;
            this.blizzardPreview.position.y = 0.03;
            this.blizzardPreview.visible = false;
            this.scene.add(this.blizzardPreview);
        }
        this.blizzardPreview.position.x = worldPosition.x;
        this.blizzardPreview.position.z = worldPosition.z;
        this.blizzardPreview.visible = true;
        this._blizzardTargetPos.set(worldPosition.x, 0, worldPosition.z);
    }

    hideBlizzardPreview() {
        if (this.blizzardPreview) this.blizzardPreview.visible = false;
    }

    cancelBlizzardTargeting() {
        this.blizzardTargeting = false;
        this.hideBlizzardPreview();
    }

    castBlizzard(position) {
        if (this.blizzard) return;
        this.blizzardTargeting = false;
        this.hideBlizzardPreview();

        const vf = this._vfx.abilityF ?? {};
        const center = position.clone();
        center.y = vf.centerY ?? 0.1;

        // Visual: ground ring + storm particles
        const ar = vf.activeRing ?? {};
        const ringGeo = new THREE.RingGeometry(
            this.blizzardRadius - (ar.innerOffset ?? 0.3),
            this.blizzardRadius + (ar.outerOffset ?? 0.2),
            ar.segments ?? 64
        );
        const ringMat = new THREE.MeshBasicMaterial({
            color: ar.color ?? 0x44aaff,
            transparent: true,
            opacity: ar.opacity ?? 0.5,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.copy(center);
        ring.position.y = 0.05;
        this.scene.add(ring);

        // Fill disc
        const dc = vf.disc ?? {};
        const dcMat = dc.material ?? {};
        const discGeo = new THREE.CircleGeometry(this.blizzardRadius, dc.segments ?? 48);
        const discMat = createIceMaterial({
            coreBrightness: dcMat.coreBrightness ?? 1.5,
            iceSpeed: dcMat.iceSpeed ?? 10.0,
            isCharged: dcMat.isCharged ?? 1.0,
            layerScale: dcMat.layerScale ?? 2.0,
            rimPower: dcMat.rimPower ?? 2.5
        });
        discMat.uniforms.alpha.value = dcMat.alpha ?? 0.3;
        discMat.side = THREE.DoubleSide;
        const disc = new THREE.Mesh(discGeo, discMat);
        disc.rotation.x = -Math.PI / 2;
        disc.position.copy(center);
        disc.position.y = 0.08;
        this.scene.add(disc);

        const lt = vf.light ?? {};
        const light = new THREE.PointLight(lt.color ?? 0x44aaff, lt.intensity ?? 15, lt.distance ?? 18, lt.decay ?? 2);
        light.position.copy(center);
        light.position.y = 3;
        this.scene.add(light);

        this.blizzard = {
            center,
            ring, disc, light,
            materials: [ringMat, discMat],
            geometries: [ringGeo, discGeo],
            timer: this.blizzardDuration,
            tickTimer: 0,
            hitCount: 0
        };

        if (this.particleSystem) {
            this.particleSystem.emitIceBurst(center, vf.spawnBurst ?? 50);
        }
    }

    updateBlizzard(deltaTime) {
        if (!this.blizzard) return;
        const b = this.blizzard;
        b.timer -= deltaTime;
        b.tickTimer -= deltaTime;

        const lifePct = Math.max(0, b.timer / this.blizzardDuration);

        // Animate
        if (b.disc.material.uniforms) {
            updateIceMaterial(b.disc.material, performance.now() / 1000 * 10, 0.35 * lifePct);
        }
        b.ring.material.opacity = 0.5 * lifePct;
        b.disc.rotation.z += deltaTime * 2;
        if (b.light) b.light.intensity = (40 + 15 * Math.sin(performance.now() / 1000 * 10)) * lifePct;

        // Blizzard particles - throttle for performance
        b._trailTick = (b._trailTick || 0) + 1;
        if (this.particleSystem && b._trailTick % 3 === 0) {
            this.particleSystem.emitIceTrail(b.center.clone().add(new THREE.Vector3(
                (Math.random() - 0.5) * this.blizzardRadius * 2,
                1 + Math.random() * 3,
                (Math.random() - 0.5) * this.blizzardRadius * 2
            )), 2);
        }

        // Damage tick
        if (b.tickTimer <= 0) {
            b.tickTimer = this.blizzardTickInterval;
            for (const enemyMesh of this.cs.enemies) {
                const enemy = enemyMesh.userData?.enemy;
                if (!enemy || enemy.health <= 0) continue;
                enemyMesh.getWorldPosition(this._enemyPos);
                const dist = b.center.distanceTo(this._enemyPos);
                const modelRadius = enemy.hitRadius ?? (enemy.isBoss ? 2.5 : 0.8);
                if (dist > this.blizzardRadius + modelRadius) continue;

                const { damage: blizDmg, isCritical: blizCrit, isBackstab: blizBack } = this.cs._applyCritBackstab(this.blizzardDamagePerTick, enemy, enemyMesh);
                enemy.takeDamage(blizDmg);
                this.addFrostStack(enemy, 1);
                b.hitCount++;
                this.gameState.emit('damageNumber', {
                    position: this._enemyPos.clone(),
                    damage: blizDmg,
                    isCritical: blizCrit,
                    isBackstab: blizBack,
                    kind: 'ability',
                    anchorId: this.cs._getDamageAnchorId(enemy)
                });
            }
        }

        if (b.timer <= 0) {
            // Final burst
            if (this.particleSystem) {
                this.particleSystem.emitIceShatter(b.center, 50);
            }
            this.scene.remove(b.ring);
            this.scene.remove(b.disc);
            this.scene.remove(b.light);
            b.geometries.forEach(g => g.dispose());
            b.materials.forEach(m => m.dispose());
            b.light.dispose();
            this.blizzard = null;
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  MAIN UPDATE (called from CombatSystem.update)
    // ═══════════════════════════════════════════════════════════

    update(deltaTime) {
        if (this.iceClawCooldown > 0) this.iceClawCooldown -= deltaTime;
        if (this.stalactiteCooldown > 0) this.stalactiteCooldown -= deltaTime;

        this.updateIceClaws(deltaTime);
        this.updateFrostBeam(deltaTime);
        this.updateStalactite(deltaTime);
        this.updateBlizzard(deltaTime);
        this.updateFrostIndicators(deltaTime);
    }
}
