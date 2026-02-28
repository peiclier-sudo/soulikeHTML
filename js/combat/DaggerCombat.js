/**
 * DaggerCombat - Shadow Assassin (dagger) kit abilities.
 *
 * Passive: poison charges (max 6), gained on basic/charged hit. Visible as orbiting green orbs.
 * Basic: Green Slash (CAC) - crescent arc slash, generates +1 poison charge on hit.
 * Charged: Double Slash (CAC) - generates +2 poison charges on hit.
 * E: Poison Pierce - consume all charges, damage + poison DoT proportional to charges.
 * V: Teleport Behind (Shadow Step) - teleport behind nearest target, +100% damage 3s, shadow VFX.
 * C: Vanish - invisible ghost effect, +60% movement speed, boss loses focus.
 * X: Toxic Focus - consume charges, +20% damage per charge for 8s.
 * F: Twin Daggers - ultimate ranged attack, consumes poison charges for +20% damage per charge.
 */

import * as THREE from 'three';

const TELEPORT_RANGE = 12;
const TELEPORT_BEHIND_OFFSET = 2.2;
const POISON_TICK_INTERVAL = 0.5;
const POISON_DAMAGE_PER_TICK_BASE = 4;
const POISON_DAMAGE_PER_CHARGE = 3;

export class DaggerCombat {
    constructor(combatSystem) {
        this.cs = combatSystem;
        this.scene = combatSystem.scene;
        this.character = combatSystem.character;
        this.gameState = combatSystem.gameState;
        this.particleSystem = combatSystem.particleSystem;
        this.enemies = combatSystem.enemies;

        this._enemyPos = new THREE.Vector3();
        this._charPos = new THREE.Vector3();
        this._toEnemy = new THREE.Vector3();
        this._behindPos = new THREE.Vector3();
        this._vfxPos = new THREE.Vector3();   // reusable VFX position (avoid clones)
        this._trailFrame = 0;                 // trail throttle counter

        // VFX parameters from kit definition (data-driven)
        this._vfx = this.cs.gameState.selectedKit?.vfx || {};

        // Poison Pierce (E) — green blade projectile
        this._poisonSlash = null;

        // Teleport (A on AZERTY / V fallback)
        this.teleportCooldown = 0;
        this.teleportCooldownDuration = 12;

        // Vanish (C) - state in gameState.combat.vanishRemaining
        this.vanishCooldown = 0;
        this.vanishCooldownDuration = 14;

        // Toxic Focus (X) - state in gameState.combat.poisonDamageBuffRemaining
        this.toxicFocusCooldown = 0;
        this.toxicFocusCooldownDuration = 20;

        // Ultimate: Twin Daggers (F) - projectile
        this.twinDaggersProjectile = null;

        // Poison DoT per enemy (enemy ref -> { remaining, damagePerTick, nextTick })
        this._poisonDots = new WeakMap();
    }

    update(dt) {
        this.teleportCooldown = Math.max(0, this.teleportCooldown - dt);
        this.vanishCooldown = Math.max(0, this.vanishCooldown - dt);
        this.toxicFocusCooldown = Math.max(0, this.toxicFocusCooldown - dt);

        this._updatePoisonSlash(dt);
        this._updateTwinDaggers(dt);
        this._updatePoisonDots(dt);
    }

    /** Get closest enemy in front of character within maxDist. */
    getClosestEnemyInFront(maxDist = TELEPORT_RANGE) {
        this.character.position.copy(this.character.position); // no-op, get ref
        const charPos = this.character.position;
        const forward = this.character.getForwardDirection().clone().normalize();
        forward.y = 0;
        if (forward.lengthSq() < 0.01) return null;

        let best = null;
        let bestDist = maxDist;
        for (const mesh of this.enemies) {
            const enemy = mesh.userData?.enemy;
            if (!enemy || enemy.isAlive === false || enemy.health <= 0) continue;
            mesh.getWorldPosition(this._enemyPos);
            const dist = charPos.distanceTo(this._enemyPos);
            if (dist > bestDist) continue;
            this._toEnemy.copy(this._enemyPos).sub(charPos).normalize();
            this._toEnemy.y = 0;
            if (this._toEnemy.dot(forward) < 0.3) continue;
            bestDist = dist;
            best = { enemy, mesh, position: this._enemyPos.clone() };
        }
        return best;
    }

    /** Teleport behind nearest enemy and activate +100% damage for 3s. */
    executeTeleportBehind() {
        if (this.teleportCooldown > 0) return false;
        const target = this.getClosestEnemyInFront(TELEPORT_RANGE);
        if (!target) return false;

        const va = this._vfx.abilityA ?? {};

        // Departure VFX — lean burst (smoke + sparks, no separate poison call)
        this._vfxPos.copy(this.character.position);
        this._vfxPos.y += va.heightOffset ?? 0.8;
        if (this.particleSystem) {
            this.particleSystem.emitVanishSmoke(this._vfxPos, va.departureSmoke ?? 10);
        }

        // Teleport
        const enemyPos = target.position;
        const forward = this.character.getForwardDirection().clone().normalize();
        forward.y = 0;
        if (forward.lengthSq() < 0.01) forward.set(0, 0, -1);
        forward.normalize();
        this._behindPos.copy(enemyPos).addScaledVector(forward, -TELEPORT_BEHIND_OFFSET);
        this._behindPos.y = this.character.position.y;
        this.character.position.copy(this._behindPos);
        this.gameState.activateTeleportDamageBuff();
        this.teleportCooldown = this.teleportCooldownDuration;

        // Arrival VFX — single burst (shadow step sparks only, no poison duplicate)
        this._vfxPos.copy(this._behindPos);
        this._vfxPos.y += va.heightOffset ?? 0.8;
        if (this.particleSystem) {
            this.particleSystem.emitShadowStepBurst(this._vfxPos, va.arrivalBurst ?? 14);
        }

        // Screen feedback
        if (this.cs.onProjectileHit) {
            this.cs.onProjectileHit({ shadowStepLand: true });
        }

        return true;
    }

    /** E: Poison Pierce — consume charges, launch a HUGE green blade projectile. */
    executePoisonPierce(chargesUsed) {
        if (this._poisonSlash) return; // one at a time
        const abilE = this.gameState.selectedKit?.combat?.abilityE || {};
        const baseDamage = abilE.baseDamage ?? 40;
        const damagePerCharge = abilE.damagePerCharge ?? 18;
        const poisonDurationPerCharge = abilE.poisonDurationPerCharge ?? 2;

        const damage = Math.floor(baseDamage + damagePerCharge * chargesUsed);
        const poisonDuration = poisonDurationPerCharge * chargesUsed;
        const poisonDamagePerTick = POISON_DAMAGE_PER_TICK_BASE + POISON_DAMAGE_PER_CHARGE * chargesUsed;
        const stackRatio = Math.min(1, chargesUsed / 6);

        const ve = this._vfx.abilityE ?? {};

        const weaponPos = this.character.getWeaponPosition();
        const dir = this.character.getForwardDirection().clone();
        dir.y = 0;
        if (dir.lengthSq() < 0.0001) dir.set(0, 0, -1);
        dir.normalize();
        const startPos = weaponPos.clone().addScaledVector(dir, ve.startOffset ?? 0.6);

        // Build massive green blade fan — 3 blades like charged slash but bigger
        const group = new THREE.Group();
        const materials = [];
        const geometries = [];
        const bladeLen = (ve.bladeLenBase ?? 4.0) + chargesUsed * (ve.bladeLenPerCharge ?? 0.6);
        const bladeWidth = (ve.bladeWidthBase ?? 0.6) + chargesUsed * (ve.bladeWidthPerCharge ?? 0.1);
        const angles = ve.fanAngles ?? [-0.4, 0, 0.4];
        const coreColors = ve.coreColors ?? [0x33dd55, 0x55ff88, 0x33dd55];
        const glowColors = ve.glowColors ?? [0x1a8833, 0x22cc55, 0x1a8833];

        for (let i = 0; i < 3; i++) {
            // Blade shape — long tapered
            const shape = new THREE.Shape();
            shape.moveTo(bladeLen * 0.5, 0);
            shape.quadraticCurveTo(bladeLen * 0.12, bladeWidth * 0.8, -bladeLen * 0.45, bladeWidth * 0.12);
            shape.lineTo(-bladeLen * 0.45, -bladeWidth * 0.12);
            shape.quadraticCurveTo(bladeLen * 0.12, -bladeWidth * 0.8, bladeLen * 0.5, 0);

            const geom = new THREE.ShapeGeometry(shape, ve.coreSegments ?? 8);
            const mat = new THREE.MeshBasicMaterial({
                color: coreColors[i], transparent: true, opacity: ve.coreOpacity ?? 0.95,
                side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending
            });
            const blade = new THREE.Mesh(geom, mat);
            blade.rotation.z = angles[i];

            // Glow layer
            const glowGeom = new THREE.ShapeGeometry(shape, ve.glowSegments ?? 6);
            const glowMat = new THREE.MeshBasicMaterial({
                color: glowColors[i], transparent: true, opacity: ve.glowOpacity ?? 0.35,
                side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending
            });
            const glow = new THREE.Mesh(glowGeom, glowMat);
            const gs = ve.glowScale ?? [1.35, 1.0, 1.5];
            glow.scale.set(gs[0] ?? 1.35, gs[1] ?? 1.0, gs[2] ?? 1.5);
            glow.rotation.z = angles[i];

            group.add(blade);
            group.add(glow);
            materials.push(mat, glowMat);
            geometries.push(geom, glowGeom);
        }

        // Bright center flash
        const veFlash = ve.flash ?? {};
        const flashGeo = new THREE.PlaneGeometry(
            bladeLen * (veFlash.lengthRatio ?? 0.9),
            bladeWidth * (veFlash.widthRatio ?? 0.3)
        );
        const flashMat = new THREE.MeshBasicMaterial({
            color: veFlash.color ?? 0xccffcc, transparent: true, opacity: veFlash.opacity ?? 0.5,
            side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending
        });
        const flash = new THREE.Mesh(flashGeo, flashMat);
        group.add(flash);
        materials.push(flashMat);
        geometries.push(flashGeo);

        group.position.copy(startPos);
        const lookTarget = startPos.clone().add(dir);
        group.lookAt(lookTarget);
        this.scene.add(group);

        const speed = (ve.speedBase ?? 28) + stackRatio * (ve.speedPerChargeRatio ?? 12);

        this._poisonSlash = {
            mesh: group,
            velocity: dir.clone().multiplyScalar(speed),
            lifetime: 0,
            maxLifetime: (ve.lifetimeBase ?? 0.4) + stackRatio * (ve.lifetimePerChargeRatio ?? 0.15),
            damage,
            chargesUsed,
            poisonDuration,
            poisonDamagePerTick,
            hitSet: new Set(),
            materials,
            geometries,
            hitRadius: (ve.hitRadiusBase ?? 2.6) + stackRatio * (ve.hitRadiusPerChargeRatio ?? 1.2)
        };

        // Launch VFX
        if (this.particleSystem?.emitPoisonBurst) {
            this.particleSystem.emitPoisonBurst(startPos.clone(), (ve.launchBurstBase ?? 16) + chargesUsed * (ve.launchBurstPerCharge ?? 3));
        }
        if (this.cs.onProjectileHit) this.cs.onProjectileHit({ daggerSlashImpact: true });
    }

    _updatePoisonSlash(dt) {
        const c = this._poisonSlash;
        if (!c) return;
        c.lifetime += dt;
        c.mesh.position.addScaledVector(c.velocity, dt);
        const lifePct = 1 - c.lifetime / c.maxLifetime;

        const ve = this._vfx.abilityE ?? {};

        // Expand + fade
        const expandDur = ve.expandDuration ?? 0.25;
        const expandT = Math.min(1, c.lifetime / (c.maxLifetime * expandDur));
        const scaleRange = ve.scaleRange ?? [0.5, 0.7];
        const scale = (scaleRange[0] ?? 0.5) + ((scaleRange[1] ?? 0.7) - (scaleRange[0] ?? 0.5)) * expandT;
        c.mesh.scale.setScalar(scale);
        for (let i = 0; i < c.materials.length; i += 2) {
            c.materials[i].opacity = (ve.coreOpacity ?? 0.95) * lifePct;
            if (c.materials[i + 1]) c.materials[i + 1].opacity = (ve.glowOpacity ?? 0.35) * lifePct;
        }
        // Flash fades faster
        const veFlash = ve.flash ?? {};
        c.materials[c.materials.length - 1].opacity = (veFlash.opacity ?? 0.5) * lifePct * lifePct;

        // Trail particles
        if (this.particleSystem) {
            c._trailTick = (c._trailTick || 0) + 1;
            if (c._trailTick % (ve.trailInterval ?? 3) === 0) {
                this.particleSystem.emitPoisonTrail?.(c.mesh.position, ve.trailCount ?? 2);
            }
        }

        // Hit detection against enemies
        for (const mesh of this.enemies) {
            const enemy = mesh.userData?.enemy;
            if (!enemy || enemy.health <= 0 || c.hitSet.has(enemy)) continue;
            mesh.getWorldPosition(this._enemyPos);
            const hitRadius = (enemy.hitRadius ?? (enemy.isBoss ? 2.5 : 0.8)) + c.hitRadius;
            if (c.mesh.position.distanceTo(this._enemyPos) <= hitRadius) {
                c.hitSet.add(enemy);
                const rawDmg = Math.floor(c.damage * (this.cs._consumeNextAttackMultiplier?.() ?? 1));
                const { damage: totalDmg, isCritical, isBackstab } = this.cs._applyCritBackstab(rawDmg, enemy, mesh);
                enemy.takeDamage(totalDmg);
                enemy.staggerTimer = Math.max(enemy.staggerTimer, 0.8);
                enemy.state = 'stagger';
                this.gameState.addUltimateCharge('charged');
                this._applyPoisonDoT(enemy, c.poisonDuration, c.poisonDamagePerTick);
                this.gameState.emit('damageNumber', {
                    position: this._enemyPos.clone(),
                    damage: totalDmg,
                    isCritical,
                    isBackstab,
                    kind: 'ability',
                    anchorId: this.cs._getDamageAnchorId(enemy)
                });
                if (this.particleSystem) {
                    this.particleSystem.emitPoisonBurst(this._enemyPos.clone(), (ve.hitBurstBase ?? 18) + c.chargesUsed * (ve.hitBurstPerCharge ?? 3));
                }
                if (this.cs.onProjectileHit) this.cs.onProjectileHit({ daggerSlashImpact: true });
            }
        }

        // Lifetime expired — cleanup
        if (c.lifetime >= c.maxLifetime) {
            this.scene.remove(c.mesh);
            c.geometries.forEach(g => g.dispose());
            c.materials.forEach(m => m.dispose());
            this._poisonSlash = null;
        }
    }

    _applyPoisonDoT(enemy, durationSeconds, damagePerTick) {
        this._poisonDots.set(enemy, {
            remaining: durationSeconds,
            damagePerTick,
            nextTick: POISON_TICK_INTERVAL
        });
    }

    _updatePoisonDots(dt) {
        for (const mesh of this.enemies) {
            const enemy = mesh.userData?.enemy;
            if (!enemy) continue;
            const data = this._poisonDots.get(enemy);
            if (!data) continue;
            data.remaining -= dt;
            data.nextTick -= dt;
            if (data.nextTick <= 0) {
                data.nextTick = POISON_TICK_INTERVAL;
                if (enemy.health > 0) {
                    enemy.takeDamage(Math.floor(data.damagePerTick));
                    mesh.getWorldPosition(this._enemyPos);
                    this.gameState.emit('damageNumber', {
                        position: this._enemyPos.clone(),
                        damage: Math.floor(data.damagePerTick),
                        isCritical: false,
                        kind: 'poison',
                        anchorId: this.cs._getDamageAnchorId(enemy)
                    });
                }
            }
            if (data.remaining <= 0) this._poisonDots.delete(enemy);
        }
    }

    /** C: Vanish - invisible + 60% speed. Drops boss aggro with shadow smoke VFX. */
    executeVanish() {
        if (this.vanishCooldown > 0) return false;
        const abilC = this.gameState.selectedKit?.combat?.abilityC || {};
        const duration = abilC.duration ?? 5;

        const vc = this._vfx.abilityC ?? {};

        // VFX: smoke cloud at vanish position (leaner than before)
        this._vfxPos.copy(this.character.position);
        this._vfxPos.y += vc.heightOffset ?? 0.8;
        if (this.particleSystem) {
            this.particleSystem.emitVanishSmoke(this._vfxPos, vc.vanishSmoke ?? 18);
            this.particleSystem.emitPoisonBurst(this._vfxPos, vc.vanishPoisonBurst ?? 8);
        }

        this.gameState.activateVanish(duration);
        this.vanishCooldown = this.vanishCooldownDuration;

        // Screen feedback
        if (this.cs.onProjectileHit) {
            this.cs.onProjectileHit({ vanishActivated: true });
        }

        return true;
    }

    /** X: Toxic Focus - consume charges for +20% damage per charge, 8s. */
    executeToxicFocus() {
        if (this.toxicFocusCooldown > 0) return false;
        const consumed = this.gameState.tryActivatePoisonDamageBuff();
        if (consumed <= 0) return false;
        this.toxicFocusCooldown = this.toxicFocusCooldownDuration;
        return true;
    }

    /** F: Twin Daggers - ranged ultimate. Consumes all poison charges for +20% damage each. */
    spawnTwinDaggersUltimate() {
        if (this.twinDaggersProjectile) return;
        const pos = this.character.getWeaponPosition().clone();
        const dir = this.character.getForwardDirection().clone().normalize();
        const baseDamage = this.gameState.selectedKit?.combat?.abilityF?.damage ?? 180;

        // Consume all poison charges for +20% damage per charge
        const { consumed } = this.gameState.tryConsumePoisonCharges(6);
        const poisonMult = 1 + 0.20 * consumed;
        const damage = Math.floor(baseDamage * poisonMult);

        const vf = this._vfx.abilityF ?? {};
        const vfBlade1 = vf.blade1 ?? {};
        const vfBlade2 = vf.blade2 ?? {};
        const vfRing = vf.ring ?? {};

        // Build visible spinning dagger mesh (cheap MeshBasicMaterial — no ShaderMaterial)
        const group = new THREE.Group();
        group.position.copy(pos);

        // Dagger blade 1 — bright toxic green
        const bladeGeo = new THREE.ConeGeometry(
            vfBlade1.radius ?? 0.12,
            vfBlade1.height ?? 1.1,
            vfBlade1.segments ?? 4
        );
        bladeGeo.rotateX(Math.PI / 2);
        const bladeMat = new THREE.MeshBasicMaterial({
            color: vfBlade1.color ?? 0x44ff70, transparent: true, opacity: vfBlade1.opacity ?? 0.95,
            depthWrite: false, blending: THREE.AdditiveBlending
        });
        const blade1 = new THREE.Mesh(bladeGeo, bladeMat);
        blade1.position.x = vfBlade1.offsetX ?? 0.25;
        group.add(blade1);

        // Dagger blade 2 — offset, slightly purple
        const blade2Mat = new THREE.MeshBasicMaterial({
            color: vfBlade2.color ?? 0x9944ff, transparent: true, opacity: vfBlade2.opacity ?? 0.85,
            depthWrite: false, blending: THREE.AdditiveBlending
        });
        const blade2 = new THREE.Mesh(bladeGeo, blade2Mat);
        blade2.position.x = vfBlade2.offsetX ?? -0.25;
        blade2.rotation.z = Math.PI;
        group.add(blade2);

        // Outer glow ring — poison green halo
        const ringGeo = new THREE.RingGeometry(
            vfRing.innerRadius ?? 0.3,
            vfRing.outerRadius ?? 0.6,
            vfRing.segments ?? 8
        );
        const ringMat = new THREE.MeshBasicMaterial({
            color: vfRing.color ?? 0x33ff66, transparent: true, opacity: vfRing.opacity ?? 0.4,
            side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        group.add(ring);

        // Point group in travel direction
        const lookTarget = pos.clone().add(dir);
        group.lookAt(lookTarget);

        this.scene.add(group);

        const speed = vf.speed ?? 22;
        const range = vf.range ?? 14;

        this.twinDaggersProjectile = {
            position: pos,
            direction: dir.clone(),
            velocity: dir.clone().multiplyScalar(speed),
            damage,
            poisonChargesConsumed: consumed,
            lifetime: 0,
            maxLifetime: range / speed,
            hitSet: new Set(),
            mesh: group,
            bladeMat,
            blade2Mat,
            ringMat,
            geometries: [bladeGeo, ringGeo]
        };
        this._trailFrame = 0;

        // Launch burst (scales with charges)
        if (this.particleSystem) {
            this.particleSystem.emitShadowStepBurst(pos, (vf.launchBurstBase ?? 10) + consumed * (vf.launchBurstPerCharge ?? 2));
        }
    }

    _updateTwinDaggers(dt) {
        if (!this.twinDaggersProjectile) return;
        const p = this.twinDaggersProjectile;
        p.position.addScaledVector(p.velocity, dt);
        p.lifetime += dt;

        const vf = this._vfx.abilityF ?? {};
        const vfRing = vf.ring ?? {};

        // Spin the dagger mesh and update position
        if (p.mesh) {
            p.mesh.position.copy(p.position);
            p.mesh.rotation.z += dt * (vf.spinSpeed ?? 18);

            // Fade ring and blades as projectile ages
            const fade = 1 - p.lifetime / p.maxLifetime;
            p.ringMat.opacity = (vfRing.opacity ?? 0.4) * fade;
        }

        // Emit trail every N frames
        if (this.particleSystem && p.lifetime < p.maxLifetime) {
            this._trailFrame++;
            if (this._trailFrame % (vf.trailInterval ?? 3) === 0) {
                this.particleSystem.emitPoisonTrail(p.position, vf.trailCount ?? 1);
            }
        }

        if (p.lifetime >= p.maxLifetime) {
            this._cleanupTwinDaggersMesh(p);
            if (this.particleSystem) {
                this.particleSystem.emitPoisonBurst(p.position, vf.expiryBurst ?? 10);
            }
            this.twinDaggersProjectile = null;
            return;
        }
        for (const mesh of this.enemies) {
            const enemy = mesh.userData?.enemy;
            if (!enemy || enemy.health <= 0 || p.hitSet.has(enemy)) continue;
            mesh.getWorldPosition(this._enemyPos);
            const dist = p.position.distanceTo(this._enemyPos);
            const radius = enemy.hitRadius ?? 1.0;
            if (dist < radius + (vf.hitMargin ?? 0.8)) {
                p.hitSet.add(enemy);
                const rawUltDmg = Math.floor(p.damage * (this.cs._consumeNextAttackMultiplier?.() ?? 1));
                const { damage: totalDamage, isCritical, isBackstab } = this.cs._applyCritBackstab(rawUltDmg, enemy, mesh);
                enemy.takeDamage(totalDamage);
                this.gameState.emit('damageNumber', {
                    position: this._enemyPos.clone(),
                    damage: totalDamage,
                    isCritical,
                    isBackstab,
                    kind: 'ultimate',
                    anchorId: this.cs._getDamageAnchorId(enemy)
                });
                if (this.particleSystem) {
                    this.particleSystem.emitPoisonBurst(this._enemyPos, vf.hitBurst ?? 12);
                }
            }
        }
    }

    _cleanupTwinDaggersMesh(p) {
        if (p.mesh) {
            this.scene.remove(p.mesh);
            for (const g of p.geometries) g.dispose();
            p.bladeMat.dispose();
            p.blade2Mat.dispose();
            p.ringMat.dispose();
        }
    }
}
