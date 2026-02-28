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

        // Poison Pierce (E)
        this.poisonPierceTimer = 0;
        this.poisonPierceDuration = 0.45;
        this.poisonPierceHit = false;

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
        this.twinDaggersSpeed = 22;
        this.twinDaggersRange = 14;

        // Poison DoT per enemy (enemy ref -> { remaining, damagePerTick, nextTick })
        this._poisonDots = new WeakMap();
    }

    update(dt) {
        this.teleportCooldown = Math.max(0, this.teleportCooldown - dt);
        this.vanishCooldown = Math.max(0, this.vanishCooldown - dt);
        this.toxicFocusCooldown = Math.max(0, this.toxicFocusCooldown - dt);

        if (this.poisonPierceTimer > 0) {
            this.poisonPierceTimer -= dt;
            if (!this.poisonPierceHit && this._pendingPoisonPierce) {
                this._doPoisonPierceHit();
            }
        }

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

        // Departure VFX — lean burst (smoke + sparks, no separate poison call)
        this._vfxPos.copy(this.character.position);
        this._vfxPos.y += 0.8;
        if (this.particleSystem) {
            this.particleSystem.emitVanishSmoke(this._vfxPos, 10);
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
        this._vfxPos.y += 0.8;
        if (this.particleSystem) {
            this.particleSystem.emitShadowStepBurst(this._vfxPos, 14);
        }

        // Screen feedback
        if (this.cs.onProjectileHit) {
            this.cs.onProjectileHit({ shadowStepLand: true });
        }

        return true;
    }

    /** E: Poison Pierce - consume charges, deal damage + apply poison DoT. */
    executePoisonPierce(chargesUsed) {
        if (this.poisonPierceTimer > 0) return;
        const abilE = this.gameState.selectedKit?.combat?.abilityE || {};
        const baseDamage = abilE.baseDamage ?? 40;
        const damagePerCharge = abilE.damagePerCharge ?? 18;
        const range = abilE.range ?? 2.8;
        const poisonDurationPerCharge = abilE.poisonDurationPerCharge ?? 2;

        const damage = Math.floor(baseDamage + damagePerCharge * chargesUsed);
        const poisonDuration = poisonDurationPerCharge * chargesUsed;
        const poisonDamagePerTick = POISON_DAMAGE_PER_TICK_BASE + POISON_DAMAGE_PER_CHARGE * chargesUsed;

        this.gameState.combat.isWhipAttacking = true;
        this.cs.whipTimer = this.poisonPierceDuration;
        this.cs.whipHitOnce = false;
        this.poisonPierceTimer = this.poisonPierceDuration;
        this.poisonPierceHit = false;
        this._pendingPoisonPierce = { damage, poisonDuration, poisonDamagePerTick };
        // VFX: poison lunge particles
        if (this.particleSystem) {
            const wp = this.character.getWeaponPosition();
            this.particleSystem.emitPoisonBurst(wp, 8 + chargesUsed * 2);
        }
        if (this.cs.onProjectileHit) this.cs.onProjectileHit({ whipHit: true, poisonPierce: true, bloodflailCharges: chargesUsed });
    }

    _doPoisonPierceHit() {
        if (this.poisonPierceHit || !this._pendingPoisonPierce) return;
        const { damage, poisonDuration, poisonDamagePerTick } = this._pendingPoisonPierce;
        this._pendingPoisonPierce = null;

        const weaponPos = this.character.getWeaponPosition();
        const forward = this.character.getForwardDirection().clone().normalize();
        this.cs.raycaster.set(weaponPos, forward);
        this.cs.raycaster.far = this.gameState.selectedKit?.combat?.abilityE?.range ?? 2.8;
        const intersects = this.cs.raycaster.intersectObjects(this.enemies, true);
        if (intersects.length > 0) {
            const enemy = this.cs._getEnemyFromHitObject(intersects[0].object);
            if (enemy && enemy.health > 0) {
                this.poisonPierceHit = true;
                const rawDmg = Math.floor(damage * (this.cs._consumeNextAttackMultiplier?.() ?? 1));
                const { damage: totalDamage, isCritical, isBackstab } = this.cs._applyCritBackstab(rawDmg, enemy, intersects[0].object);
                enemy.takeDamage(totalDamage);
                this._applyPoisonDoT(enemy, poisonDuration, poisonDamagePerTick);
                intersects[0].object.getWorldPosition(this.cs._enemyPos);
                this.gameState.emit('damageNumber', {
                    position: this.cs._enemyPos.clone(),
                    damage: totalDamage,
                    isCritical,
                    isBackstab,
                    kind: 'ability',
                    anchorId: this.cs._getDamageAnchorId(enemy)
                });
                if (this.particleSystem) {
                    this.particleSystem.emitPoisonBurst(this.cs._enemyPos, 12);
                }
            }
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

        // VFX: smoke cloud at vanish position (leaner than before)
        this._vfxPos.copy(this.character.position);
        this._vfxPos.y += 0.8;
        if (this.particleSystem) {
            this.particleSystem.emitVanishSmoke(this._vfxPos, 18);
            this.particleSystem.emitPoisonBurst(this._vfxPos, 8);
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

        // Build visible spinning dagger mesh (cheap MeshBasicMaterial — no ShaderMaterial)
        const group = new THREE.Group();
        group.position.copy(pos);

        // Dagger blade 1 — bright toxic green
        const bladeGeo = new THREE.ConeGeometry(0.12, 1.1, 4);
        bladeGeo.rotateX(Math.PI / 2);
        const bladeMat = new THREE.MeshBasicMaterial({
            color: 0x44ff70, transparent: true, opacity: 0.95,
            depthWrite: false, blending: THREE.AdditiveBlending
        });
        const blade1 = new THREE.Mesh(bladeGeo, bladeMat);
        blade1.position.x = 0.25;
        group.add(blade1);

        // Dagger blade 2 — offset, slightly purple
        const blade2Mat = new THREE.MeshBasicMaterial({
            color: 0x9944ff, transparent: true, opacity: 0.85,
            depthWrite: false, blending: THREE.AdditiveBlending
        });
        const blade2 = new THREE.Mesh(bladeGeo, blade2Mat);
        blade2.position.x = -0.25;
        blade2.rotation.z = Math.PI;
        group.add(blade2);

        // Outer glow ring — poison green halo
        const ringGeo = new THREE.RingGeometry(0.3, 0.6, 8);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0x33ff66, transparent: true, opacity: 0.4,
            side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        group.add(ring);

        // Point group in travel direction
        const lookTarget = pos.clone().add(dir);
        group.lookAt(lookTarget);

        this.scene.add(group);

        this.twinDaggersProjectile = {
            position: pos,
            direction: dir.clone(),
            velocity: dir.clone().multiplyScalar(this.twinDaggersSpeed),
            damage,
            poisonChargesConsumed: consumed,
            lifetime: 0,
            maxLifetime: this.twinDaggersRange / this.twinDaggersSpeed,
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
            this.particleSystem.emitShadowStepBurst(pos, 10 + consumed * 2);
        }
    }

    _updateTwinDaggers(dt) {
        if (!this.twinDaggersProjectile) return;
        const p = this.twinDaggersProjectile;
        p.position.addScaledVector(p.velocity, dt);
        p.lifetime += dt;

        // Spin the dagger mesh and update position
        if (p.mesh) {
            p.mesh.position.copy(p.position);
            p.mesh.rotation.z += dt * 18;  // fast spin

            // Fade ring and blades as projectile ages
            const fade = 1 - p.lifetime / p.maxLifetime;
            p.ringMat.opacity = 0.4 * fade;
        }

        // Emit trail every 3rd frame
        if (this.particleSystem && p.lifetime < p.maxLifetime) {
            this._trailFrame++;
            if (this._trailFrame % 3 === 0) {
                this.particleSystem.emitPoisonTrail(p.position, 1);
            }
        }

        if (p.lifetime >= p.maxLifetime) {
            this._cleanupTwinDaggersMesh(p);
            if (this.particleSystem) {
                this.particleSystem.emitPoisonBurst(p.position, 10);
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
            if (dist < radius + 0.8) {
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
                    this.particleSystem.emitPoisonBurst(this._enemyPos, 12);
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
