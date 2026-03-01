/**
 * BearCombat – Bear kit combat module
 *
 * Fantasy: Tanky bruiser, slow but devastating, highest armor.
 * Resource: Primal Force (max 8) – gained from melee hits, decays over time.
 *   Buffs: +6% damage and +4% damage reduction per stack.
 *
 * LMB  – Heavy Paw Strike: slow melee swipe (uses base melee system)
 * RMB  – Ground Slam: charged AoE around self
 * Q    – Earthquake: ground AoE + lingering damage zone
 * E    – Maul: consume Primal Force for massive single-target hit + stagger
 * X    – Thunderous Roar: massive AoE stun + armor buff
 * C    – Thick Hide: damage absorption shield (blocks all damage)
 * F    – Primal Fury: ultimate buff mode (massive damage + AoE stomp)
 */

import * as THREE from 'three';
import { createBloodFireMaterial, updateBloodFireMaterial } from '../shaders/BloodFireShader.js';

export class BearCombat {
    constructor(combatSystem) {
        this.cs = combatSystem;
        this.scene = combatSystem.scene;
        this.character = combatSystem.character;
        this.gameState = combatSystem.gameState;
        this.particleSystem = combatSystem.particleSystem;

        const kit = this.gameState.selectedKit;
        const kc = kit?.combat || {};
        const vfx = kit?.vfx || {};
        this._vfx = vfx;
        this._tintColor = vfx.tintColor || [0.9, 0.55, 0.15];

        // ── Ground Slam (RMB) ───────────────────────────────────
        const charged = kc.chargedAttack || {};
        this.slamDamage = charged.damage ?? 75;
        this.slamRadius = charged.radius ?? 4.0;
        this.slamWindup = 0;
        this.slamWindupDuration = 0.4;
        this._slamActive = false;
        this._slamVfx = null;

        // ── Q: Earthquake ───────────────────────────────────────
        const abilQ = kc.abilityQ || {};
        this.quakeCooldown = 0;
        this.quakeCooldownDuration = abilQ.cooldown ?? 11;
        this.quakeDamage = abilQ.damage ?? 65;
        this.quakeRadius = abilQ.radius ?? 4.5;
        this.quakeRagePerHit = abilQ.ragePerHit ?? 2;
        this.quakeLingerDuration = abilQ.lingerDuration ?? 3.0;
        this.quakeLingerDamage = abilQ.lingerDamage ?? 8;
        this._quakeZones = [];
        this._quakeVfx = null;

        // ── E: Maul (consume Primal Force) ──────────────────────
        const abilE = kc.abilityE || {};
        this.maulBaseDamage = abilE.baseDamage ?? 65;
        this.maulDamagePerCharge = abilE.damagePerCharge ?? 18;
        this.maulRange = abilE.range ?? 3.5;
        this.maulStaggerDuration = abilE.staggerDuration ?? 1.5;
        this._maulSlashes = [];

        // ── X: Thunderous Roar (AoE stun + armor buff) ─────────
        const abilX = kc.abilityX || {};
        this.roarCooldown = 0;
        this.roarCooldownDuration = abilX.cooldown ?? 15;
        this.roarDamage = abilX.damage ?? 40;
        this.roarRadius = abilX.radius ?? 12;
        this.roarStagger = abilX.stagger ?? 2.0;
        this.roarArmorBuffDuration = abilX.armorBuffDuration ?? 8;
        this.roarArmorBuffAmount = abilX.armorBuffAmount ?? 10;
        this.roarRageGain = abilX.rageGain ?? 3;

        // ── C: Thick Hide (damage absorption shield) ────────────
        const abilC = kc.abilityC || {};
        this.thickHideCooldown = 0;
        this.thickHideCooldownDuration = abilC.cooldown ?? 16;
        this.thickHideDuration = abilC.duration ?? 9;

        // ── F: Primal Fury (ultimate buff) ──────────────────────
        const abilF = kc.abilityF || {};
        this.furyDuration = abilF.duration ?? 10;
        this.furyDamageMult = abilF.damageMult ?? 1.5;
        this.furyArmorBonus = abilF.armorBonus ?? 15;
        this.furyStompInterval = abilF.stompInterval ?? 1.5;
        this.furyStompDamage = abilF.stompDamage ?? 25;
        this.furyStompRadius = abilF.stompRadius ?? 5;

        // Paw strike VFX pool
        this._pawStrikes = [];

        // Reusable vectors
        this._tmpV = new THREE.Vector3();
        this._tmpV2 = new THREE.Vector3();
    }

    // ─── LMB override: heavy paw strike (no projectile) ────
    spawnPawStrike() {
        // Bear uses base melee hit detection – no projectile spawned.
        // Primal Force gain is applied in onMeleeHit.
        const pos = this.character.getWeaponPosition();
        const fwd = this.character.getForwardDirection().normalize();

        // Spawn visible ground-slam impact ring + dust VFX
        this._spawnPawStrikeVfx(pos, fwd);

        if (this.particleSystem) {
            this.particleSystem.emitSparks(pos, 6);
            this.particleSystem.emitPunchBurst(pos);
            this.particleSystem.emitEmbers(pos, 5, this._particleColor());
        }
    }

    _spawnPawStrikeVfx(origin, direction) {
        // Ground-level impact ring that expands and fades
        const geo = new THREE.RingGeometry(0.2, 0.8, 24, 1);
        const mat = createBloodFireMaterial({
            coreBrightness: 2.0,
            plasmaSpeed: 12,
            isCharged: 1.0,
            layerScale: 2.0,
            rimPower: 2.5,
            alpha: 0.9,
            redTint: 0.0,
            tintColor: this._tintColor
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        // Position slightly in front of character on the ground
        const impactPos = origin.clone();
        impactPos.y = 0.05;
        mesh.position.copy(impactPos);
        mesh.scale.setScalar(0.3);
        this.scene.add(mesh);

        this._pawStrikes.push({
            mesh, geo, mat,
            elapsed: 0,
            maxLife: 0.35,
            maxScale: 2.5
        });
    }

    _updatePawStrikes(dt) {
        for (let i = this._pawStrikes.length - 1; i >= 0; i--) {
            const s = this._pawStrikes[i];
            s.elapsed += dt;
            const t = s.elapsed / s.maxLife;
            // Expand outward quickly then fade
            const scale = s.maxScale * (1 - (1 - Math.min(1, t * 2.5)) * (1 - Math.min(1, t * 2.5)));
            s.mesh.scale.setScalar(Math.max(0.01, scale));
            if (s.mat.uniforms) {
                const alpha = t < 0.15 ? 0.9 : Math.max(0, 0.9 * (1 - (t - 0.15) / 0.85));
                updateBloodFireMaterial(s.mat, s.elapsed * 14, alpha);
            }
            if (s.elapsed >= s.maxLife) {
                this.scene.remove(s.mesh);
                s.geo?.dispose();
                s.mat?.dispose();
                this._pawStrikes.splice(i, 1);
            }
        }
    }

    /** Called from CombatSystem.onHit when bear lands a melee hit */
    onMeleeHit(enemy, damage, hitPos) {
        this.gameState.addBloodCharge(1);
        // Fury stomp timer reset on hit (keeps rhythm)
        const c = this.gameState.combat;
        if (c.bearFuryRemaining > 0) {
            // Bonus damage during fury
            const furyBonus = Math.floor(damage * 0.2);
            if (furyBonus > 0 && enemy.health > 0) {
                enemy.takeDamage(furyBonus);
            }
        }
    }

    // ─── RMB override: Ground Slam (AoE around self) ───────
    executeGroundSlam() {
        if (!this.gameState.useStamina(15)) return;
        this.slamWindup = this.slamWindupDuration;
        this._slamActive = true;
        this.gameState.combat.isChargedAttacking = true;

        if (this.particleSystem) {
            const pos = this.character.position.clone();
            this.particleSystem.emitSparks(pos, 6);
        }
        if (this.cs.onProjectileHit) this.cs.onProjectileHit({ whipWindup: true });
    }

    _updateGroundSlam(dt) {
        if (!this._slamActive) return;
        this.slamWindup -= dt;

        if (this.slamWindup <= 0) {
            this._slamActive = false;
            this.gameState.combat.isChargedAttacking = false;
            // Impact!
            this._groundSlamImpact();
        }
    }

    _groundSlamImpact() {
        const center = this.character.position.clone();
        const rageStacks = this.gameState.bloodCharges;
        const totalDamage = this.slamDamage + rageStacks * 5;

        for (const enemyMesh of this.cs.enemies) {
            const enemy = enemyMesh.userData?.enemy;
            if (!enemy || enemy.health <= 0) continue;
            enemyMesh.getWorldPosition(this._tmpV);
            const dist = center.distanceTo(this._tmpV);
            const hitRadius = enemy.hitRadius ?? (enemy.isBoss ? 2.5 : 0.8);
            if (dist > this.slamRadius + hitRadius) continue;
            const { damage, isCritical, isBackstab } = this.cs._applyCritBackstab(totalDamage, enemy, enemyMesh);
            enemy.takeDamage(damage);
            enemy.staggerTimer = Math.max(enemy.staggerTimer, 0.8);
            enemy.state = 'stagger';
            this.gameState.addBloodCharge(1);
            this.gameState.emit('damageNumber', {
                position: this._tmpV.clone(), damage, isCritical, isBackstab,
                anchorId: this.cs._getDamageAnchorId(enemy)
            });
        }

        this.gameState.addUltimateCharge('charged');
        if (this.particleSystem) {
            this.particleSystem.emitPunchBurst(center);
            this.particleSystem.emitSparks(center, 20);
            this.particleSystem.emitEmbers(center, 16, this._particleColor());
        }
        if (this.cs.onProjectileHit) this.cs.onProjectileHit({ whipHit: true, punchFinish: true });
        this._spawnSlamVfx(center);
    }

    _spawnSlamVfx(center) {
        if (this._slamVfx) {
            this.scene.remove(this._slamVfx.group);
            this._slamVfx.geo?.dispose();
            this._slamVfx.mat?.dispose();
        }
        const vq = this._vfx.abilityQ || {};
        const discCfg = vq.disc || {};
        const geo = new THREE.CircleGeometry(1, 48);
        const matParams = discCfg.material || {};
        const mat = createBloodFireMaterial({
            coreBrightness: matParams.coreBrightness ?? 1.8,
            plasmaSpeed: matParams.plasmaSpeed ?? 10,
            isCharged: 1.0,
            layerScale: matParams.layerScale ?? 2.2,
            rimPower: matParams.rimPower ?? 2.8,
            alpha: matParams.alpha ?? 0.9,
            redTint: matParams.redTint ?? 0.0,
            tintColor: matParams.tintColor || this._tintColor
        });
        const disc = new THREE.Mesh(geo, mat);
        disc.rotation.x = -Math.PI / 2;
        disc.position.set(center.x, 0.03, center.z);
        disc.scale.setScalar(0.1);
        this.scene.add(disc);
        this._slamVfx = {
            group: disc, geo, mat,
            elapsed: 0,
            duration: 0.9,
            expandDuration: 0.22,
            radius: this.slamRadius
        };
    }

    _updateSlamVfx(dt) {
        if (!this._slamVfx) return;
        const v = this._slamVfx;
        v.elapsed += dt;
        const t = v.elapsed / v.duration;
        const expandT = Math.min(1, v.elapsed / v.expandDuration);
        v.group.scale.setScalar(v.radius * (1 - (1 - expandT) * (1 - expandT)));
        const alpha = t < 0.15 ? 0.9 : Math.max(0, 0.9 * (1 - (t - 0.15) / 0.85));
        if (v.mat.uniforms) updateBloodFireMaterial(v.mat, v.elapsed * 8, alpha);
        if (v.elapsed >= v.duration) {
            this.scene.remove(v.group);
            v.geo?.dispose();
            v.mat?.dispose();
            this._slamVfx = null;
        }
    }

    // ─── Q: Earthquake (AoE + lingering zone) ──────────────
    executeEarthquake(targetPos) {
        if (this.quakeCooldown > 0) return;
        this.quakeCooldown = this.quakeCooldownDuration;

        const center = targetPos.clone();
        center.y = this.character.position.y;
        // Clamp distance
        const maxDist = 10;
        const toTarget = this._tmpV.subVectors(center, this.character.position);
        if (toTarget.length() > maxDist) {
            toTarget.normalize().multiplyScalar(maxDist);
            center.copy(this.character.position).add(toTarget);
        }

        const rageStacks = this.gameState.bloodCharges;
        const totalDamage = this.quakeDamage + rageStacks * 8;

        // Immediate AoE damage
        for (const enemyMesh of this.cs.enemies) {
            const enemy = enemyMesh.userData?.enemy;
            if (!enemy || enemy.health <= 0) continue;
            enemyMesh.getWorldPosition(this._tmpV);
            const dist = center.distanceTo(this._tmpV);
            const hitRadius = enemy.hitRadius ?? (enemy.isBoss ? 2.5 : 0.8);
            if (dist > this.quakeRadius + hitRadius) continue;
            const { damage, isCritical, isBackstab } = this.cs._applyCritBackstab(totalDamage, enemy, enemyMesh);
            enemy.takeDamage(damage);
            enemy.staggerTimer = Math.max(enemy.staggerTimer, 1.0);
            enemy.state = 'stagger';
            this.gameState.addBloodCharge(this.quakeRagePerHit);
            this.gameState.emit('damageNumber', {
                position: this._tmpV.clone(), damage, isCritical, isBackstab,
                anchorId: this.cs._getDamageAnchorId(enemy)
            });
        }

        this.gameState.addUltimateCharge('charged');

        // Lingering damage zone
        this._quakeZones.push({
            center: center.clone(),
            radius: this.quakeRadius,
            remaining: this.quakeLingerDuration,
            tickInterval: 0.8,
            nextTick: 0.8,
            damagePerTick: this.quakeLingerDamage + rageStacks * 2,
            hitSet: new Set()
        });

        if (this.particleSystem) {
            this.particleSystem.emitPunchBurst(center);
            this.particleSystem.emitSparks(center, 24);
            this.particleSystem.emitEmbers(center, 18, this._particleColor());
        }
        if (this.cs.onProjectileHit) this.cs.onProjectileHit({ whipHit: true, punchFinish: true });
        this._spawnQuakeVfx(center);
    }

    _spawnQuakeVfx(center) {
        if (this._quakeVfx) {
            this.scene.remove(this._quakeVfx.group);
            this._quakeVfx.geo?.dispose();
            this._quakeVfx.mat?.dispose();
        }
        const vq = this._vfx.abilityQ || {};
        const discCfg = vq.disc || {};
        const geo = new THREE.CircleGeometry(1, 48);
        const matParams = discCfg.material || {};
        const mat = createBloodFireMaterial({
            coreBrightness: matParams.coreBrightness ?? 1.8,
            plasmaSpeed: matParams.plasmaSpeed ?? 10,
            isCharged: 1.0,
            layerScale: matParams.layerScale ?? 2.2,
            rimPower: matParams.rimPower ?? 2.8,
            alpha: matParams.alpha ?? 0.92,
            redTint: matParams.redTint ?? 0.0,
            tintColor: matParams.tintColor || this._tintColor
        });
        const disc = new THREE.Mesh(geo, mat);
        disc.rotation.x = -Math.PI / 2;
        disc.position.set(center.x, 0.03, center.z);
        disc.scale.setScalar(0.1);
        this.scene.add(disc);
        this._quakeVfx = {
            group: disc, geo, mat,
            elapsed: 0,
            duration: vq.duration ?? 1.6,
            expandDuration: vq.expandDuration ?? 0.28,
            radius: this.quakeRadius
        };
    }

    _updateQuakeVfx(dt) {
        if (!this._quakeVfx) return;
        const v = this._quakeVfx;
        v.elapsed += dt;
        const t = v.elapsed / v.duration;
        const expandT = Math.min(1, v.elapsed / v.expandDuration);
        v.group.scale.setScalar(v.radius * (1 - (1 - expandT) * (1 - expandT)));
        const alpha = t < 0.15 ? 0.92 : Math.max(0, 0.92 * (1 - (t - 0.15) / 0.85));
        if (v.mat.uniforms) updateBloodFireMaterial(v.mat, v.elapsed * 6, alpha);
        if (v.elapsed >= v.duration) {
            this.scene.remove(v.group);
            v.geo?.dispose();
            v.mat?.dispose();
            this._quakeVfx = null;
        }
    }

    _updateQuakeZones(dt) {
        for (let i = this._quakeZones.length - 1; i >= 0; i--) {
            const zone = this._quakeZones[i];
            zone.remaining -= dt;
            zone.nextTick -= dt;

            if (zone.nextTick <= 0) {
                zone.nextTick = zone.tickInterval;
                zone.hitSet.clear(); // reset per tick
                for (const enemyMesh of this.cs.enemies) {
                    const enemy = enemyMesh.userData?.enemy;
                    if (!enemy || enemy.health <= 0) continue;
                    enemyMesh.getWorldPosition(this._tmpV);
                    const dist = zone.center.distanceTo(this._tmpV);
                    if (dist > zone.radius + (enemy.hitRadius ?? 0.8)) continue;
                    enemy.takeDamage(zone.damagePerTick);
                    this.gameState.emit('damageNumber', {
                        position: this._tmpV.clone(),
                        damage: zone.damagePerTick,
                        isCritical: false, isBackstab: false,
                        kind: 'dot',
                        anchorId: this.cs._getDamageAnchorId(enemy)
                    });
                }
                // Ember particles on each tick
                if (this.particleSystem) {
                    this.particleSystem.emitEmbers(zone.center, 4, this._particleColor());
                }
            }

            if (zone.remaining <= 0) {
                this._quakeZones.splice(i, 1);
            }
        }
    }

    // ─── E: Maul (consume Primal Force for massive hit) ────
    executeMaul(chargesUsed, multiplier) {
        if (chargesUsed < 1) return;
        const stacks = chargesUsed;
        const totalDamage = this.maulBaseDamage + stacks * this.maulDamagePerCharge;
        const forward = this.character.getForwardDirection().normalize();
        const pos = this.character.getWeaponPosition();
        const vfxE = this._vfx.abilityE || {};
        const cr = vfxE.crescend || {};

        // Spawn a single massive crescent slash
        this._spawnMaulSlash(pos.clone(), forward.clone(), totalDamage, stacks, cr, multiplier);

        // Direct hit on closest enemy in range for bonus stagger
        let closestEnemy = null;
        let closestDist = Infinity;
        for (const enemyMesh of this.cs.enemies) {
            const enemy = enemyMesh.userData?.enemy;
            if (!enemy || enemy.health <= 0) continue;
            enemyMesh.getWorldPosition(this._tmpV);
            const dist = pos.distanceTo(this._tmpV);
            if (dist <= this.maulRange + (enemy.hitRadius ?? 0.8) && dist < closestDist) {
                closestDist = dist;
                closestEnemy = { enemy, mesh: enemyMesh };
            }
        }
        if (closestEnemy) {
            const dmg = Math.floor(totalDamage * (multiplier ?? 1) * this.cs._consumeNextAttackMultiplier());
            const { damage, isCritical, isBackstab } = this.cs._applyCritBackstab(dmg, closestEnemy.enemy, closestEnemy.mesh);
            closestEnemy.enemy.takeDamage(damage);
            closestEnemy.enemy.staggerTimer = Math.max(closestEnemy.enemy.staggerTimer, this.maulStaggerDuration);
            closestEnemy.enemy.state = 'stagger';
            closestEnemy.mesh.getWorldPosition(this._tmpV);
            this.gameState.emit('damageNumber', {
                position: this._tmpV.clone(), damage, isCritical, isBackstab,
                anchorId: this.cs._getDamageAnchorId(closestEnemy.enemy)
            });
            this.gameState.addUltimateCharge('charged');
        }

        this.gameState.combat.isWhipAttacking = true;
        if (this.particleSystem) {
            this.particleSystem.emitSparks(pos, 10 + stacks * 3);
            this.particleSystem.emitEmbers(pos, 8 + stacks * 2, this._particleColor());
        }
        if (this.cs.onProjectileHit) this.cs.onProjectileHit({ whipWindup: true, punchFinish: true });
    }

    _spawnMaulSlash(origin, direction, damage, stacks, cr, multiplier) {
        const bladeLen = (cr.bladeLenBase ?? 2.5) + stacks * (cr.bladeLenPerCharge ?? 0.45);
        const bladeWidth = (cr.bladeWidthBase ?? 0.85) + stacks * (cr.bladeWidthPerCharge ?? 0.2);
        const speed = (cr.speedBase ?? 22) + stacks * (cr.speedPerCharge ?? 1.2);
        const lifetime = (cr.lifetimeBase ?? 1.3) + stacks * (cr.lifetimePerCharge ?? 0.08);
        const hitRadius = (cr.hitRadiusBase ?? 2.3) + stacks * (cr.hitRadiusPerCharge ?? 0.38);

        const outerCfg = cr.outer || {};
        const geo = new THREE.RingGeometry(bladeWidth * 0.3, bladeWidth, 24, 1, 0, Math.PI * 0.7);
        const mat = createBloodFireMaterial({
            coreBrightness: (outerCfg.coreBrightnessBase ?? 1.3) + stacks * 0.15,
            plasmaSpeed: (outerCfg.plasmaSpeedBase ?? 6.0),
            isCharged: 1.0,
            layerScale: outerCfg.layerScale ?? 1.2,
            rimPower: outerCfg.rimPower ?? 1.4,
            alpha: outerCfg.alphaBase ?? 0.94,
            redTint: outerCfg.redTint ?? 0.0,
            tintColor: outerCfg.tintColor || this._tintColor
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.scale.setScalar(bladeLen * 0.6);
        const group = new THREE.Group();
        group.add(mesh);
        group.position.copy(origin);
        const dirNorm = direction.clone(); dirNorm.y = 0; dirNorm.normalize();
        group.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dirNorm);
        this.scene.add(group);

        const totalDmg = Math.floor(damage * (multiplier ?? 1));
        this._maulSlashes.push({
            mesh: group, geo, mat,
            velocity: dirNorm.clone().multiplyScalar(speed),
            lifetime: 0,
            maxLifetime: lifetime,
            hitRadius,
            damage: totalDmg,
            hitSet: new Set()
        });
    }

    _updateMaulSlashes(dt) {
        for (let i = this._maulSlashes.length - 1; i >= 0; i--) {
            const s = this._maulSlashes[i];
            s.lifetime += dt;
            s.mesh.position.addScaledVector(s.velocity, dt);
            const t = s.lifetime / s.maxLifetime;
            const scale = t < 0.1 ? t / 0.1 : 1.0;
            s.mesh.scale.setScalar(scale * 2.0);
            if (s.mat.uniforms) {
                updateBloodFireMaterial(s.mat, s.lifetime * 5, Math.max(0, 0.94 * (1 - t * 0.5)));
            }
            // Hit detection
            for (const enemyMesh of this.cs.enemies) {
                const enemy = enemyMesh.userData?.enemy;
                if (!enemy || enemy.health <= 0 || s.hitSet.has(enemy)) continue;
                enemyMesh.getWorldPosition(this._tmpV);
                const dist = s.mesh.position.distanceTo(this._tmpV);
                const hr = (enemy.hitRadius ?? 0.8) + s.hitRadius;
                if (dist > hr) continue;
                s.hitSet.add(enemy);
                const { damage, isCritical, isBackstab } = this.cs._applyCritBackstab(s.damage, enemy, enemyMesh);
                enemy.takeDamage(damage);
                enemy.staggerTimer = Math.max(enemy.staggerTimer, 0.5);
                this.gameState.emit('damageNumber', {
                    position: this._tmpV.clone(), damage, isCritical, isBackstab,
                    anchorId: this.cs._getDamageAnchorId(enemy)
                });
            }
            if (s.lifetime >= s.maxLifetime) {
                this.scene.remove(s.mesh);
                s.geo?.dispose();
                s.mat?.dispose();
                this._maulSlashes.splice(i, 1);
            }
        }
    }

    // ─── X: Thunderous Roar ──────────────────────────────────
    executeRoar() {
        if (this.roarCooldown > 0) return;
        this.roarCooldown = this.roarCooldownDuration;
        const center = this.character.position.clone();

        for (const enemyMesh of this.cs.enemies) {
            const enemy = enemyMesh.userData?.enemy;
            if (!enemy || enemy.health <= 0) continue;
            enemyMesh.getWorldPosition(this._tmpV);
            const dist = center.distanceTo(this._tmpV);
            if (dist > this.roarRadius + (enemy.hitRadius ?? 0.8)) continue;
            const { damage, isCritical, isBackstab } = this.cs._applyCritBackstab(this.roarDamage, enemy, enemyMesh);
            enemy.takeDamage(damage);
            enemy.staggerTimer = Math.max(enemy.staggerTimer, this.roarStagger);
            enemy.state = 'stagger';
            this.gameState.emit('damageNumber', {
                position: this._tmpV.clone(), damage, isCritical, isBackstab,
                anchorId: this.cs._getDamageAnchorId(enemy)
            });
        }

        // Armor buff
        this.gameState.combat.bearArmorBuffRemaining = this.roarArmorBuffDuration;
        this.gameState.combat.bearArmorBuffAmount = this.roarArmorBuffAmount;
        // Gain Primal Force
        this.gameState.addBloodCharge(this.roarRageGain);
        this.gameState.addUltimateCharge('charged');

        if (this.particleSystem) {
            this.particleSystem.emitSparks(center, 35);
            this.particleSystem.emitEmbers(center, 25, this._particleColor());
        }
        if (this.cs.onProjectileHit) this.cs.onProjectileHit({ whipHit: true, punchFinish: true });
    }

    // ─── C: Thick Hide (damage absorption shield) ───────────
    executeThickHide() {
        if (this.thickHideCooldown > 0) return;
        this.thickHideCooldown = this.thickHideCooldownDuration;
        this.gameState.activateShield(this.thickHideDuration);
        if (this.particleSystem) {
            const pos = this.character.position.clone();
            this.particleSystem.emitSparks(pos, 10);
            this.particleSystem.emitEmbers(pos, 8, this._particleColor());
        }
    }

    // ─── F: Primal Fury (ultimate buff) ─────────────────────
    executeFury() {
        this.gameState.combat.bearFuryRemaining = this.furyDuration;
        this.gameState.combat.bearFuryDamageMult = this.furyDamageMult;
        this.gameState.combat.bearFuryArmorBonus = this.furyArmorBonus;
        this.gameState.combat.bearFuryStompTimer = this.furyStompInterval;

        if (this.particleSystem) {
            const pos = this.character.position.clone();
            this.particleSystem.emitSparks(pos, 35);
            this.particleSystem.emitEmbers(pos, 30, this._particleColor());
        }
        if (this.cs.onProjectileHit) this.cs.onProjectileHit({ whipHit: true, punchFinish: true });
    }

    // ─── Fury auto-stomp (AoE every N seconds during Primal Fury) ──
    _updateFuryStomp(dt) {
        const c = this.gameState.combat;
        if (c.bearFuryRemaining <= 0) return;

        c.bearFuryStompTimer = (c.bearFuryStompTimer ?? 0) - dt;
        if (c.bearFuryStompTimer > 0) return;
        c.bearFuryStompTimer = this.furyStompInterval;

        const center = this.character.position.clone();
        for (const enemyMesh of this.cs.enemies) {
            const enemy = enemyMesh.userData?.enemy;
            if (!enemy || enemy.health <= 0) continue;
            enemyMesh.getWorldPosition(this._tmpV);
            const dist = center.distanceTo(this._tmpV);
            if (dist > this.furyStompRadius + (enemy.hitRadius ?? 0.8)) continue;
            enemy.takeDamage(this.furyStompDamage);
            enemy.staggerTimer = Math.max(enemy.staggerTimer, 0.3);
            this.gameState.emit('damageNumber', {
                position: this._tmpV.clone(),
                damage: this.furyStompDamage,
                isCritical: false, isBackstab: false,
                kind: 'stomp',
                anchorId: this.cs._getDamageAnchorId(enemy)
            });
        }

        if (this.particleSystem) {
            this.particleSystem.emitPunchBurst(center);
            this.particleSystem.emitEmbers(center, 10, this._particleColor());
        }
    }

    // ─── Primal Force decay ─────────────────────────────────
    _updateForceDecay(dt) {
        if (!this._lastForceDecay) this._lastForceDecay = 0;
        this._lastForceDecay += dt;
        // Lose 1 Primal Force every 5 seconds
        if (this._lastForceDecay >= 5 && this.gameState.bloodCharges > 0) {
            this._lastForceDecay = 0;
            this.gameState.bloodCharges = Math.max(0, this.gameState.bloodCharges - 1);
        }
        // Reset timer if charges were gained recently
        if (this.gameState.bloodCharges > (this._prevForceCount ?? 0)) {
            this._lastForceDecay = 0;
        }
        this._prevForceCount = this.gameState.bloodCharges;
    }

    // ─── Buff timers ────────────────────────────────────────
    _updateBuffs(dt) {
        const c = this.gameState.combat;
        if (c.bearArmorBuffRemaining > 0) {
            c.bearArmorBuffRemaining -= dt;
            if (c.bearArmorBuffRemaining <= 0) {
                c.bearArmorBuffRemaining = 0;
                c.bearArmorBuffAmount = 0;
            }
        }
        if (c.bearFuryRemaining > 0) {
            c.bearFuryRemaining -= dt;
            if (c.bearFuryRemaining <= 0) {
                c.bearFuryRemaining = 0;
                c.bearFuryDamageMult = 1.0;
                c.bearFuryArmorBonus = 0;
            }
        }
    }

    // ─── Frame update ───────────────────────────────────────
    update(dt) {
        this.quakeCooldown = Math.max(0, this.quakeCooldown - dt);
        this.roarCooldown = Math.max(0, this.roarCooldown - dt);
        this.thickHideCooldown = Math.max(0, this.thickHideCooldown - dt);
        this._updatePawStrikes(dt);
        this._updateGroundSlam(dt);
        this._updateSlamVfx(dt);
        this._updateQuakeVfx(dt);
        this._updateQuakeZones(dt);
        this._updateMaulSlashes(dt);
        this._updateFuryStomp(dt);
        this._updateForceDecay(dt);
        this._updateBuffs(dt);
    }

    _particleColor() {
        return this.gameState.selectedKit?.theme?.particleColor ?? 0xCC8822;
    }
}
