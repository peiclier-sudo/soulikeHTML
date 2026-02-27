/**
 * FrostCombat - Frost Mage specific combat abilities.
 *
 * Manages: frost stacks on enemies, ice projectile creation,
 * Frozen Orb (Q), Frost Beam (E), Ice Block (X), Ice Barrier (C),
 * Blizzard ultimate (F), and frost stack indicator visuals on enemies.
 *
 * Plugs into CombatSystem: CombatSystem delegates to this when kit is frost_mage.
 */

import * as THREE from 'three';
import { createIceMaterial, updateIceMaterial } from '../shaders/IceShader.js';
import { createIceVFX } from '../effects/IceVFX.js';

// ── Frost stack colors (dark blue → bright cyan) ──
const FROST_STACK_COLORS = [0x0a1a3a, 0x1a3a6a, 0x2255aa, 0x3377cc, 0x44aaee, 0x66ccff, 0x88ddff, 0xccf0ff];

/** Y position for stalactite ground impact (tip of cone at ground level + half height) */
function spikeGroundY() { return 2.5; }

export class FrostCombat {
    constructor(combatSystem) {
        this.cs = combatSystem;              // parent CombatSystem
        this.scene = combatSystem.scene;
        this.character = combatSystem.character;
        this.gameState = combatSystem.gameState;
        this.particleSystem = combatSystem.particleSystem;

        // ── Frost stacks per enemy (WeakMap: enemy → { stacks, lastTime, indicator }) ──
        this.frostStacks = new WeakMap();
        this.frostIndicators = new Map();    // enemy → THREE.Group (orbs)
        this._frostDecayCheckInterval = 0;

        // ── Frozen Orb (Q) ──
        this.frozenOrb = null;
        this.frozenOrbCooldown = 0;
        this.frozenOrbCooldownDuration = 9;
        this.frozenOrbDamage = 30;           // per shard (was 15)
        this.frozenOrbShardInterval = 0.14;
        this.frozenOrbRadius = 14;

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
                mesh.getWorldPosition(this._enemyPos);
                this.particleSystem.emitIceBurst(this._enemyPos, 40);
                this.particleSystem.emitIceShatter(this._enemyPos, 25);
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
        const group = new THREE.Group();
        const maxStacks = 8;
        const circleRadius = 1.6;
        const arcSpan = (140 * Math.PI) / 180;
        const startAngle = -arcSpan / 2;
        const innerGeo = new THREE.SphereGeometry(0.055, 6, 6);
        const outerGeo = new THREE.SphereGeometry(0.08, 6, 6);

        const innerMat = createIceMaterial({
            coreBrightness: 1.4,
            iceSpeed: 4.0,
            isCharged: 0.5,
            layerScale: 1.2,
            alpha: 0.95
        });
        const outerMat = new THREE.MeshBasicMaterial({
            color: 0x0a2a5a,
            transparent: true,
            opacity: 0.7,
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
        const t = performance.now() / 1000;
        for (const [enemy, indicator] of this.frostIndicators) {
            if (!indicator.visible) continue;
            const mesh = this._getEnemyMesh(enemy);
            if (!mesh) continue;
            mesh.getWorldPosition(this._enemyPos);
            indicator.position.set(this._enemyPos.x, this._enemyPos.y + 1.8, this._enemyPos.z);
            indicator.rotation.y += deltaTime * 1.5;

            // Animate visible orbs
            indicator.children.forEach((orbGroup, i) => {
                if (!orbGroup.visible) return;
                const pulse = 1 + 0.08 * Math.sin(t * 5 + i * 1.3);
                orbGroup.scale.setScalar(pulse);
                const inner = orbGroup.children[0];
                if (inner?.userData?.iceMat?.uniforms) {
                    updateIceMaterial(inner.userData.iceMat, t * 4, 0.9 + 0.08 * Math.sin(t * 3 + i));
                }
            });
        }

        // Decay: lose all stacks after 10s of no new stacks
        this._frostDecayCheckInterval += deltaTime;
        if (this._frostDecayCheckInterval >= 1.0) {
            this._frostDecayCheckInterval = 0;
            const now = Date.now();
            for (const [enemy, indicator] of this.frostIndicators) {
                const data = this.frostStacks.get(enemy);
                if (data && data.stacks > 0 && now - data.lastTime >= 10000) {
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
        const length = isCharged ? 1.4 : 0.7;
        const radius = isCharged ? 0.18 : 0.09;
        const speed = isCharged ? this.cs.chargedSpeed : this.cs.basicSpeed;
        const group = new THREE.Group();
        group.position.copy(startPos);
        group.castShadow = false;

        const materials = [];
        const geometries = [];

        // Javelin body (elongated cone)
        const javelinGeo = new THREE.ConeGeometry(radius, length, 6);
        javelinGeo.rotateX(-Math.PI / 2); // point forward
        const javelinMat = createIceMaterial({
            coreBrightness: isCharged ? 1.6 : 1.2,
            iceSpeed: isCharged ? 4.5 : 3.5,
            isCharged: isCharged ? 1.0 : 0.0,
            layerScale: isCharged ? 0.8 : 1.0,
            rimPower: isCharged ? 2.5 : 2.0
        });
        javelinMat.uniforms.alpha.value = isCharged ? 0.85 : 0.8;
        const javelin = new THREE.Mesh(javelinGeo, javelinMat);
        group.add(javelin);
        materials.push(javelinMat);
        geometries.push(javelinGeo);

        // Inner core glow
        const coreGeo = new THREE.ConeGeometry(radius * 0.5, length * 0.7, 6);
        coreGeo.rotateX(-Math.PI / 2);
        const coreMat = createIceMaterial({
            coreBrightness: isCharged ? 2.5 : 2.0,
            iceSpeed: isCharged ? 7.0 : 5.5,
            isCharged: isCharged ? 1.0 : 0.0,
            layerScale: isCharged ? 1.5 : 1.2,
            rimPower: 2.0
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
            releaseBurst: isCharged ? 0.15 : 0,
            isCharged: !!isCharged,
            isFrost: true,
            materials, geometries, vfx,
            hitSet: new Set()
        };
    }

    // ═══════════════════════════════════════════════════════════
    //  FROZEN ORB (Q) - surprise ability!
    // ═══════════════════════════════════════════════════════════

    castFrozenOrb() {
        if (this.frozenOrb || this.frozenOrbCooldown > 0) return false;

        const startPos = this.character.getWeaponPosition();
        const dir = this.character.getForwardDirection().clone();
        dir.y = 0;
        if (dir.lengthSq() < 0.0001) dir.set(0, 0, -1);
        dir.normalize();

        const group = new THREE.Group();
        group.position.copy(startPos).addScaledVector(dir, 0.5);

        // Main orb (glowing ice sphere)
        const orbGeo = new THREE.SphereGeometry(0.55, 12, 12);
        const orbMat = createIceMaterial({
            coreBrightness: 1.8,
            iceSpeed: 5.0,
            isCharged: 1.0,
            layerScale: 0.7,
            rimPower: 1.8,
            displaceAmount: 0.8
        });
        orbMat.uniforms.alpha.value = 0.75;
        group.add(new THREE.Mesh(orbGeo, orbMat));

        // Inner core
        const coreGeo = new THREE.SphereGeometry(0.3, 10, 10);
        const coreMat = createIceMaterial({
            coreBrightness: 2.5,
            iceSpeed: 8.0,
            isCharged: 1.0,
            layerScale: 1.4
        });
        group.add(new THREE.Mesh(coreGeo, coreMat));

        // Point light
        const light = new THREE.PointLight(0x66ccff, 18, 20, 2);
        group.add(light);

        this.scene.add(group);

        this.frozenOrb = {
            mesh: group,
            velocity: dir.clone().multiplyScalar(4.5), // slow-moving heavy orb
            lifetime: 0,
            maxLifetime: 4.0,
            shardTimer: 0,
            materials: [orbMat, coreMat],
            geometries: [orbGeo, coreGeo],
            light,
            hitSet: new Set()
        };

        this.frozenOrbCooldown = this.frozenOrbCooldownDuration;

        if (this.particleSystem) {
            this.particleSystem.emitIceBurst(startPos, 20);
        }
        if (this.cs.onProjectileHit) this.cs.onProjectileHit({ whipWindup: true });

        return true;
    }

    updateFrozenOrb(deltaTime) {
        const orb = this.frozenOrb;
        if (!orb) return;

        orb.lifetime += deltaTime;
        orb.mesh.position.addScaledVector(orb.velocity, deltaTime);
        orb.mesh.rotation.y += deltaTime * 3;

        const lifePct = 1 - orb.lifetime / orb.maxLifetime;
        orb.materials.forEach(mat => updateIceMaterial(mat, orb.lifetime * 6, 0.8 * lifePct));
        if (orb.light) orb.light.intensity = (18 + 6 * Math.sin(orb.lifetime * 12)) * lifePct;

        // Emit ice shards radially
        orb.shardTimer -= deltaTime;
        if (orb.shardTimer <= 0) {
            orb.shardTimer = this.frozenOrbShardInterval;
            this._emitFrozenOrbShard(orb);
        }

        // Particles - throttle to every 3rd frame for performance
        if (this.particleSystem && orb.lifetime < orb.maxLifetime - 0.2) {
            orb._trailTick = (orb._trailTick || 0) + 1;
            if (orb._trailTick % 3 === 0) {
                this.particleSystem.emitIceTrail(orb.mesh.position, 2);
            }
        }

        // Check direct hits (orb itself)
        const orbPos = orb.mesh.position;
        for (const enemyMesh of this.cs.enemies) {
            const enemy = enemyMesh.userData?.enemy;
            if (!enemy || enemy.health <= 0) continue;
            enemyMesh.getWorldPosition(this._enemyPos);
            const hitRadius = (enemy.hitRadius ?? (enemy.isBoss ? 2.5 : 0.8)) + 0.8;
            if (orbPos.distanceTo(this._enemyPos) < hitRadius && !orb.hitSet.has(enemy)) {
                orb.hitSet.add(enemy);
                const rawOrbDmg = this.frozenOrbDamage * 4;
                const { damage: orbDmg, isCritical: orbCrit, isBackstab: orbBack } = this.cs._applyCritBackstab(rawOrbDmg, enemy, enemyMesh);
                enemy.takeDamage(orbDmg);
                this.addFrostStack(enemy, 3);
                this.gameState.addUltimateCharge('charged');
                this.gameState.emit('damageNumber', {
                    position: this._enemyPos.clone(),
                    damage: orbDmg,
                    isCritical: orbCrit,
                    isBackstab: orbBack,
                    kind: 'ability',
                    anchorId: this.cs._getDamageAnchorId(enemy)
                });
            }
        }

        if (orb.lifetime >= orb.maxLifetime) {
            // Shatter explosion
            if (this.particleSystem) {
                this.particleSystem.emitIceShatter(orbPos, 18);
                this.particleSystem.emitIceBurst(orbPos, 14);
            }
            this.scene.remove(orb.mesh);
            orb.geometries.forEach(g => g.dispose());
            orb.materials.forEach(m => m.dispose());
            this.frozenOrb = null;
        }
    }

    /** Shoot an ice shard from the Frozen Orb in a radial direction */
    _emitFrozenOrbShard(orb) {
        // Pick a random horizontal direction
        const angle = Math.random() * Math.PI * 2;
        const dir = new THREE.Vector3(Math.cos(angle), 0.1 * (Math.random() - 0.5), Math.sin(angle));
        dir.normalize();

        const startPos = orb.mesh.position.clone();

        // Create small ice shard projectile
        const shardGeo = new THREE.ConeGeometry(0.04, 0.25, 4);
        shardGeo.rotateX(-Math.PI / 2);
        const shardMat = createIceMaterial({
            coreBrightness: 2.0,
            iceSpeed: 6.0,
            layerScale: 1.5
        });
        shardMat.uniforms.alpha.value = 0.9;
        const shardMesh = new THREE.Mesh(shardGeo, shardMat);
        shardMesh.position.copy(startPos);
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
        shardMesh.quaternion.copy(quat);
        this.scene.add(shardMesh);

        // Add as a mini-projectile to CombatSystem's projectile list
        const shard = {
            mesh: shardMesh,
            velocity: dir.clone().multiplyScalar(16),
            lifetime: 0,
            maxLifetime: 0.8,
            damage: this.frozenOrbDamage,
            releaseBurst: 0,
            isCharged: false,
            isFrost: true,
            isShard: true,
            materials: [shardMat],
            geometries: [shardGeo],
            vfx: null
        };
        this.cs.projectiles.push(shard);
        this.scene.add(shardMesh);
    }

    // ═══════════════════════════════════════════════════════════
    //  FROST BEAM (E) - consume frost stacks, freeze proportionally
    // ═══════════════════════════════════════════════════════════

    /** E ability: fire a frost beam that consumes frost stacks per enemy hit.
     *  Damage and freeze duration scale with each enemy's frost stacks.
     *  0.5s freeze per frost stack consumed on that enemy. */
    executeFrostBeam(chargesUsed, multiplier) {
        if (this.frostBeam) return;

        const weaponPos = this.character.getWeaponPosition();
        const dir = this.character.getForwardDirection().clone();
        dir.y = 0;
        if (dir.lengthSq() < 0.0001) dir.set(0, 0, -1);
        dir.normalize();

        // Create beam visual - width scales with blood charges spent
        const beamLength = 12;
        const beamWidthBase = 0.15 + chargesUsed * 0.03;
        const beamWidthTip = 0.35 + chargesUsed * 0.05;
        const beamGeo = new THREE.CylinderGeometry(beamWidthBase, beamWidthTip, beamLength, 8);
        beamGeo.rotateX(Math.PI / 2);
        beamGeo.translate(0, 0, beamLength / 2);
        const beamMat = createIceMaterial({
            coreBrightness: 2.2 + chargesUsed * 0.15,
            iceSpeed: 8.0,
            isCharged: 1.0,
            layerScale: 1.0,
            rimPower: 1.5
        });
        beamMat.uniforms.alpha.value = 0.85;

        const beamMesh = new THREE.Mesh(beamGeo, beamMat);
        beamMesh.position.copy(weaponPos);
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
        beamMesh.quaternion.copy(quat);
        this.scene.add(beamMesh);

        // Inner core beam
        const coreGeo = new THREE.CylinderGeometry(0.06, 0.18, beamLength * 0.95, 6);
        coreGeo.rotateX(Math.PI / 2);
        coreGeo.translate(0, 0, beamLength / 2);
        const coreMat = createIceMaterial({
            coreBrightness: 3.0,
            iceSpeed: 12.0,
            isCharged: 1.0,
            layerScale: 1.6
        });
        const coreMesh = new THREE.Mesh(coreGeo, coreMat);
        coreMesh.position.copy(weaponPos);
        coreMesh.quaternion.copy(quat);
        this.scene.add(coreMesh);

        const light = new THREE.PointLight(0x66ccff, 30, 20, 2);
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
                this.particleSystem.emitIceBurst(this._enemyPos, 20 + frostStacks * 4);
                this.particleSystem.emitIceShatter(this._enemyPos, 10 + frostStacks * 3);
            }
        }

        this.frostBeam = {
            beamMesh, coreMesh, light,
            materials: [beamMat, coreMat],
            geometries: [beamGeo, coreGeo],
            timer: this.frostBeamDuration
        };

        if (this.particleSystem) {
            this.particleSystem.emitIceBurst(weaponPos, 25);
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
        this.frostBeam.timer -= deltaTime;
        const t = 1 - this.frostBeam.timer / this.frostBeamDuration;

        // Fade out
        const alpha = Math.max(0, 1 - t * t);
        this.frostBeam.materials.forEach(mat => updateIceMaterial(mat, performance.now() / 1000 * 8, alpha * 0.85));
        if (this.frostBeam.light) {
            this.frostBeam.light.intensity = 30 * alpha;
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
            const r = this.stalactiteRadius;
            const ringGeo = new THREE.RingGeometry(r - 0.3, r + 0.15, 48);
            const mat = new THREE.MeshBasicMaterial({
                color: 0x44aaff,
                transparent: true,
                opacity: 0.5,
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

        const center = targetPos.clone();
        center.y = 0;

        // Create falling stalactite mesh (pointed cone)
        const spikeHeight = 5.0;
        const spikeRadius = 0.8;
        const spikeGeo = new THREE.ConeGeometry(spikeRadius, spikeHeight, 6);
        // Point downward
        spikeGeo.rotateX(Math.PI);
        const spikeMat = createIceMaterial({
            coreBrightness: 1.8,
            iceSpeed: 3.0,
            isCharged: 1.0,
            layerScale: 0.5,
            rimPower: 2.5,
            displaceAmount: 0.6
        });
        spikeMat.uniforms.alpha.value = 0.85;
        const spikeMesh = new THREE.Mesh(spikeGeo, spikeMat);
        spikeMesh.position.set(center.x, 20, center.z); // start high above
        this.scene.add(spikeMesh);

        // Shadow/warning circle on ground
        const shadowGeo = new THREE.CircleGeometry(this.stalactiteRadius, 32);
        const shadowMat = new THREE.MeshBasicMaterial({
            color: 0x44aaff,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        const shadow = new THREE.Mesh(shadowGeo, shadowMat);
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.set(center.x, 0.05, center.z);
        this.scene.add(shadow);

        // Point light
        const light = new THREE.PointLight(0x66ccff, 25, 25, 2);
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
            fallDuration: 0.35,  // fast drop
            impactTimer: 0,
            impactDuration: 0.8
        };

        if (this.particleSystem) {
            this.particleSystem.emitIceTrail(new THREE.Vector3(center.x, 15, center.z), 8);
        }
        if (this.cs.onProjectileHit) this.cs.onProjectileHit({ whipWindup: true });
    }

    updateStalactite(deltaTime) {
        if (!this.stalactiteActive) return;
        const s = this.stalactiteActive;

        if (s.phase === 'falling') {
            s.fallTimer += deltaTime;
            const t = Math.min(1, s.fallTimer / s.fallDuration);
            // Accelerate downward (easeInQuad)
            const eased = t * t;
            const startY = 20;
            const endY = spikeGroundY(s.center);
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
            if (this.particleSystem && s._trailTick % 2 === 0) {
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
            s.mesh.position.y -= deltaTime * 0.5;

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
            this.particleSystem.emitIceShatter(center, 50);
            this.particleSystem.emitIceBurst(center, 40);
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
            const r = this.blizzardRadius;
            const ringGeo = new THREE.RingGeometry(r - 0.35, r + 0.2, 48);
            const mat = new THREE.MeshBasicMaterial({
                color: 0x44aaff,
                transparent: true,
                opacity: 0.45,
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

        const center = position.clone();
        center.y = 0.1;

        // Visual: ground ring + storm particles
        const ringGeo = new THREE.RingGeometry(this.blizzardRadius - 0.3, this.blizzardRadius + 0.2, 64);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0x44aaff,
            transparent: true,
            opacity: 0.5,
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
        const discGeo = new THREE.CircleGeometry(this.blizzardRadius, 48);
        const discMat = createIceMaterial({
            coreBrightness: 1.5,
            iceSpeed: 10.0,
            isCharged: 1.0,
            layerScale: 2.0,
            rimPower: 2.5
        });
        discMat.uniforms.alpha.value = 0.3;
        discMat.side = THREE.DoubleSide;
        const disc = new THREE.Mesh(discGeo, discMat);
        disc.rotation.x = -Math.PI / 2;
        disc.position.copy(center);
        disc.position.y = 0.08;
        this.scene.add(disc);

        const light = new THREE.PointLight(0x44aaff, 40, 30, 2);
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
            this.particleSystem.emitIceBurst(center, 50);
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
        if (this.frozenOrbCooldown > 0) this.frozenOrbCooldown -= deltaTime;
        if (this.stalactiteCooldown > 0) this.stalactiteCooldown -= deltaTime;

        this.updateFrozenOrb(deltaTime);
        this.updateFrostBeam(deltaTime);
        this.updateStalactite(deltaTime);
        this.updateBlizzard(deltaTime);
        this.updateFrostIndicators(deltaTime);
    }
}
