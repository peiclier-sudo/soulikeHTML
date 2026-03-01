/**
 * WolfCombat – Werewolf kit combat module
 *
 * Fantasy: Fast predator with high crit, rapid claw strikes.
 * Resource: Feral Rage (max 8) – gained from melee hits, decays over time.
 *   Buffs: +8% attack speed and +5% move speed per stack.
 *
 * LMB  – Claw Strike: fast melee swipe (uses base melee system)
 * RMB  – Feral Lunge: dash forward + AoE claw damage
 * Q    – Savage Pounce: leap to cursor, AoE on landing
 * E    – Rend: consume rage for multi-slash bleed attack
 * X    – Blood Howl: AoE stun + crit buff
 * C    – Feral Instinct: speed + evasion buff
 * F    – Bloodmoon Frenzy: ultimate buff mode
 */

import * as THREE from 'three';
import { createBloodFireMaterial, updateBloodFireMaterial } from '../shaders/BloodFireShader.js';

export class WolfCombat {
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
        this._tintColor = vfx.tintColor || [0.55, 0.6, 0.75];

        // ── Feral Lunge (RMB) ────────────────────────────────────
        const lunge = kc.chargedAttack || {};
        this.lungeDamage = lunge.damage ?? 35;
        this.lungeSpeed = lunge.speed ?? 28;
        this.lungeDuration = lunge.duration ?? 0.25;
        this.lungeRadius = lunge.radius ?? 2.5;
        this.lungeTimer = 0;
        this.lungeDir = new THREE.Vector3();
        this._lungeHitSet = new Set();

        // ── Q: Savage Pounce ─────────────────────────────────────
        const abilQ = kc.abilityQ || {};
        this.pounceCooldown = 0;
        this.pounceCooldownDuration = abilQ.cooldown ?? 7;
        this.pounceDamage = abilQ.damage ?? 45;
        this.pounceRadius = abilQ.radius ?? 3.5;
        this.pounceRagePerHit = abilQ.ragePerHit ?? 1;
        this.pounceRageDamageBonus = abilQ.rageDamageBonus ?? 5;
        this.pounceTimer = 0;
        this.pounceDuration = 0.35;
        this.pounceTarget = new THREE.Vector3();
        this.pounceStart = new THREE.Vector3();
        this._pounceActive = false;
        this._pounceHitSet = new Set();
        this._pounceVfx = null;

        // ── E: Rend (consume rage) ───────────────────────────────
        const abilE = kc.abilityE || {};
        this.rendBaseDamage = abilE.baseDamage ?? 25;
        this.rendDamagePerRage = abilE.damagePerRage ?? 12;
        this.rendRange = abilE.range ?? 3.0;
        this.rendSlashCount = abilE.slashCount ?? 3;
        this.rendBleedDuration = abilE.bleedDuration ?? 3.0;
        this.rendBleedDmgPerRage = abilE.bleedDmgPerRage ?? 5;
        this._rendSlashes = [];
        this._bleedDots = new WeakMap();

        // ── X: Blood Howl (AoE stun + crit buff) ────────────────
        const abilX = kc.abilityX || {};
        this.howlCooldown = 0;
        this.howlCooldownDuration = abilX.cooldown ?? 12;
        this.howlDamage = abilX.damage ?? 30;
        this.howlRadius = abilX.radius ?? 9;
        this.howlStagger = abilX.stagger ?? 1.5;
        this.howlCritBuffDuration = abilX.critBuffDuration ?? 6;
        this.howlCritBuffAmount = abilX.critBuffAmount ?? 0.25;
        this.howlRageGain = abilX.rageGain ?? 3;

        // ── C: Feral Instinct (speed + evasion) ─────────────────
        const abilC = kc.abilityC || {};
        this.instinctCooldown = 0;
        this.instinctCooldownDuration = abilC.cooldown ?? 14;
        this.instinctDuration = abilC.duration ?? 5;
        this.instinctSpeedMult = abilC.speedMult ?? 1.6;

        // ── F: Bloodmoon Frenzy (ultimate buff) ──────────────────
        const abilF = kc.abilityF || {};
        this.frenzyDuration = abilF.duration ?? 8;
        this.frenzyDamageMult = abilF.damageMult ?? 1.3;
        this.frenzyAttackSpeedMult = abilF.attackSpeedMult ?? 1.5;
        this.frenzyLifesteal = abilF.lifesteal ?? 0.05;

        // Claw slash VFX pool
        this._clawSlashes = [];

        // Reusable vectors
        this._tmpV = new THREE.Vector3();
        this._tmpV2 = new THREE.Vector3();
    }

    // ─── LMB override: melee claw strike (no projectile) ─────
    spawnClawStrike() {
        // Wolf uses base melee hit detection – no projectile spawned.
        // Rage gain and claw VFX are applied in onMeleeHit.
        const pos = this.character.getWeaponPosition();
        const fwd = this.character.getForwardDirection().normalize();

        // Spawn a visible slash arc mesh
        this._spawnClawSlashVfx(pos, fwd);

        if (this.particleSystem) {
            this.particleSystem.emitSparks(pos, 8);
            this.particleSystem.emitEmbers(pos, 5, this._particleColor());
        }
    }

    _spawnClawSlashVfx(origin, direction) {
        // Alternating left/right slash arcs
        this._clawSlashSide = (this._clawSlashSide ?? 1) * -1;
        const side = this._clawSlashSide;

        const geo = new THREE.RingGeometry(0.15, 0.6, 16, 1, 0, Math.PI * 0.55);
        const mat = createBloodFireMaterial({
            coreBrightness: 2.5,
            plasmaSpeed: 18,
            isCharged: 1.0,
            layerScale: 1.8,
            rimPower: 2.0,
            alpha: 0.95,
            redTint: 0.0,
            tintColor: this._tintColor
        });
        const mesh = new THREE.Mesh(geo, mat);
        // Orient slash vertically, angled to match swipe direction
        mesh.rotation.x = -Math.PI * 0.35;
        mesh.rotation.z = side * 0.6;
        mesh.scale.setScalar(1.8);

        const group = new THREE.Group();
        group.add(mesh);
        group.position.copy(origin);
        // Face the slash toward the attack direction
        const dirNorm = direction.clone(); dirNorm.y = 0; dirNorm.normalize();
        group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dirNorm);
        this.scene.add(group);

        this._clawSlashes.push({
            mesh: group, geo, mat,
            elapsed: 0,
            maxLife: 0.22,
            side
        });
    }

    _updateClawSlashes(dt) {
        for (let i = this._clawSlashes.length - 1; i >= 0; i--) {
            const s = this._clawSlashes[i];
            s.elapsed += dt;
            const t = s.elapsed / s.maxLife;
            // Quick scale up then fade
            const scale = t < 0.3 ? (t / 0.3) * 2.2 : 2.2 * (1 - (t - 0.3) / 0.7);
            s.mesh.scale.setScalar(Math.max(0.01, scale));
            s.mesh.children[0].rotation.z += s.side * dt * 12; // spin the slash arc
            if (s.mat.uniforms) {
                const alpha = t < 0.2 ? 0.95 : Math.max(0, 0.95 * (1 - (t - 0.2) / 0.8));
                updateBloodFireMaterial(s.mat, s.elapsed * 20, alpha);
            }
            if (s.elapsed >= s.maxLife) {
                this.scene.remove(s.mesh);
                s.geo?.dispose();
                s.mat?.dispose();
                this._clawSlashes.splice(i, 1);
            }
        }
    }

    /** Called from CombatSystem.onHit when wolf lands a melee hit */
    onMeleeHit(enemy, damage, hitPos) {
        this.gameState.addBloodCharge(1);
        // Frenzy lifesteal
        const c = this.gameState.combat;
        if (c.wolfFrenzyRemaining > 0 && damage > 0) {
            const heal = Math.max(1, Math.floor(damage * this.frenzyLifesteal));
            this.gameState.heal(heal);
        }
    }

    // ─── RMB override: Feral Lunge (dash + AoE) ─────────────
    executeLunge() {
        if (!this.gameState.useStamina(12)) return;
        const dir = this.character.getForwardDirection().normalize();
        this.lungeDir.copy(dir);
        this.lungeTimer = this.lungeDuration;
        this._lungeHitSet.clear();
        this.gameState.combat.isChargedAttacking = true;

        if (this.particleSystem) {
            const pos = this.character.position.clone();
            this.particleSystem.emitSparks(pos, 8);
            this.particleSystem.emitEmbers(pos, 6, this._particleColor());
        }
        if (this.cs.onProjectileHit) this.cs.onProjectileHit({ whipWindup: true });
    }

    _updateLunge(dt) {
        if (this.lungeTimer <= 0) return;
        this.lungeTimer -= dt;
        // Move character forward
        const speed = this.lungeSpeed * Math.max(0, this.lungeTimer / this.lungeDuration);
        this.character.position.x += this.lungeDir.x * speed * dt;
        this.character.position.z += this.lungeDir.z * speed * dt;

        // AoE hit detection during lunge
        const charPos = this.character.position;
        for (const enemyMesh of this.cs.enemies) {
            const enemy = enemyMesh.userData?.enemy;
            if (!enemy || enemy.health <= 0) continue;
            if (this._lungeHitSet.has(enemy)) continue;
            enemyMesh.getWorldPosition(this._tmpV);
            const dist = charPos.distanceTo(this._tmpV);
            const hitRadius = enemy.hitRadius ?? (enemy.isBoss ? 2.5 : 0.8);
            if (dist > this.lungeRadius + hitRadius) continue;
            this._lungeHitSet.add(enemy);
            const rageStacks = this.gameState.bloodCharges;
            let dmg = this.lungeDamage + rageStacks * 3;
            const { damage, isCritical, isBackstab } = this.cs._applyCritBackstab(dmg, enemy, enemyMesh);
            enemy.takeDamage(damage);
            enemy.staggerTimer = Math.max(enemy.staggerTimer, 0.4);
            enemy.state = 'stagger';
            this.gameState.addBloodCharge(2);
            this.gameState.addUltimateCharge('charged');
            if (this.particleSystem) {
                this.particleSystem.emitPunchBurst(this._tmpV.clone());
                this.particleSystem.emitSparks(this._tmpV.clone(), 6);
            }
            this.gameState.emit('damageNumber', {
                position: this._tmpV.clone(), damage, isCritical, isBackstab,
                anchorId: this.cs._getDamageAnchorId(enemy)
            });
        }

        if (this.lungeTimer <= 0) {
            this.gameState.combat.isChargedAttacking = false;
        }
    }

    // ─── Q: Savage Pounce ────────────────────────────────────
    executePounce(targetPos) {
        if (this.pounceCooldown > 0) return;
        this.pounceCooldown = this.pounceCooldownDuration;
        this.pounceStart.copy(this.character.position);
        this.pounceTarget.copy(targetPos);
        this.pounceTarget.y = this.character.position.y;
        // Clamp distance
        const maxDist = 12;
        const toDest = this._tmpV.subVectors(this.pounceTarget, this.pounceStart);
        if (toDest.length() > maxDist) {
            toDest.normalize().multiplyScalar(maxDist);
            this.pounceTarget.copy(this.pounceStart).add(toDest);
        }
        this.pounceTimer = this.pounceDuration;
        this._pounceActive = true;
        this._pounceHitSet.clear();
        // Jump arc
        this.gameState.combat.isChargedAttacking = true;
        if (this.cs.onProjectileHit) this.cs.onProjectileHit({ whipWindup: true });
    }

    _updatePounce(dt) {
        if (!this._pounceActive) return;
        this.pounceTimer -= dt;
        const t = 1 - Math.max(0, this.pounceTimer / this.pounceDuration);
        // Lerp position with arc
        const pos = this._tmpV.lerpVectors(this.pounceStart, this.pounceTarget, t);
        pos.y += Math.sin(t * Math.PI) * 3.0; // arc height
        this.character.position.copy(pos);

        if (this.pounceTimer <= 0) {
            this._pounceActive = false;
            this.gameState.combat.isChargedAttacking = false;
            this.character.position.copy(this.pounceTarget);
            // Landing AoE
            this._pounceImpact();
        }
    }

    _pounceImpact() {
        const center = this.pounceTarget.clone();
        const rageStacks = this.gameState.bloodCharges;
        const totalDamage = this.pounceDamage + rageStacks * this.pounceRageDamageBonus;
        let hitCount = 0;

        for (const enemyMesh of this.cs.enemies) {
            const enemy = enemyMesh.userData?.enemy;
            if (!enemy || enemy.health <= 0) continue;
            enemyMesh.getWorldPosition(this._tmpV);
            const dist = center.distanceTo(this._tmpV);
            const hitRadius = enemy.hitRadius ?? (enemy.isBoss ? 2.5 : 0.8);
            if (dist > this.pounceRadius + hitRadius) continue;
            const { damage, isCritical, isBackstab } = this.cs._applyCritBackstab(totalDamage, enemy, enemyMesh);
            enemy.takeDamage(damage);
            enemy.staggerTimer = Math.max(enemy.staggerTimer, 0.6);
            enemy.state = 'stagger';
            this.gameState.addBloodCharge(this.pounceRagePerHit);
            hitCount++;
            this.gameState.emit('damageNumber', {
                position: this._tmpV.clone(), damage, isCritical, isBackstab,
                anchorId: this.cs._getDamageAnchorId(enemy)
            });
        }

        this.gameState.addUltimateCharge('charged');
        if (this.particleSystem) {
            this.particleSystem.emitPunchBurst(center);
            this.particleSystem.emitSparks(center, 16);
            this.particleSystem.emitEmbers(center, 12, this._particleColor());
        }
        if (this.cs.onProjectileHit) this.cs.onProjectileHit({ whipHit: true, punchFinish: true });
        // Spawn ground VFX disc
        this._spawnPounceVfx(center);
    }

    _spawnPounceVfx(center) {
        if (this._pounceVfx) {
            this.scene.remove(this._pounceVfx.group);
            this._pounceVfx.geo?.dispose();
            this._pounceVfx.mat?.dispose();
        }
        const vq = this._vfx.abilityQ || {};
        const discCfg = vq.disc || {};
        const geo = new THREE.CircleGeometry(1, 48);
        const matParams = discCfg.material || {};
        const mat = createBloodFireMaterial({
            coreBrightness: matParams.coreBrightness ?? 2.0,
            plasmaSpeed: matParams.plasmaSpeed ?? 14,
            isCharged: 1.0,
            layerScale: matParams.layerScale ?? 2.8,
            rimPower: matParams.rimPower ?? 3.2,
            alpha: matParams.alpha ?? 0.85,
            redTint: matParams.redTint ?? 0.0,
            tintColor: matParams.tintColor || this._tintColor
        });
        const disc = new THREE.Mesh(geo, mat);
        disc.rotation.x = -Math.PI / 2;
        disc.position.set(center.x, 0.03, center.z);
        disc.scale.setScalar(0.1);
        this.scene.add(disc);
        this._pounceVfx = {
            group: disc, geo, mat,
            elapsed: 0,
            duration: vq.duration ?? 1.1,
            expandDuration: vq.expandDuration ?? 0.18,
            radius: this.pounceRadius
        };
    }

    _updatePounceVfx(dt) {
        if (!this._pounceVfx) return;
        const v = this._pounceVfx;
        v.elapsed += dt;
        const t = v.elapsed / v.duration;
        const expandT = Math.min(1, v.elapsed / v.expandDuration);
        v.group.scale.setScalar(v.radius * (1 - (1 - expandT) * (1 - expandT)));
        const alpha = t < 0.15 ? 0.85 : Math.max(0, 0.85 * (1 - (t - 0.15) / 0.85));
        if (v.mat.uniforms) updateBloodFireMaterial(v.mat, v.elapsed * 8, alpha);
        if (v.elapsed >= v.duration) {
            this.scene.remove(v.group);
            v.geo?.dispose();
            v.mat?.dispose();
            this._pounceVfx = null;
        }
    }

    // ─── E: Rend (multi-slash consuming rage) ────────────────
    executeRend(chargesUsed, multiplier) {
        if (chargesUsed < 1) return;
        const stacks = chargesUsed;
        const dmgPerSlash = this.rendBaseDamage + stacks * this.rendDamagePerRage;
        const forward = this.character.getForwardDirection().normalize();
        const pos = this.character.getWeaponPosition();
        const vfxE = this._vfx.abilityE || {};
        const cr = vfxE.crescend || {};

        // Spawn multiple crescent slashes in quick succession
        for (let i = 0; i < this.rendSlashCount; i++) {
            const angle = (i - 1) * 0.3; // spread: -0.3, 0, 0.3
            const dir = forward.clone();
            dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
            const delay = i * 0.08;
            this._spawnRendSlash(pos.clone(), dir, dmgPerSlash, stacks, delay, cr, multiplier);
        }

        // Apply bleed DoT to nearby enemies
        if (stacks >= 2) {
            for (const enemyMesh of this.cs.enemies) {
                const enemy = enemyMesh.userData?.enemy;
                if (!enemy || enemy.health <= 0) continue;
                enemyMesh.getWorldPosition(this._tmpV);
                if (pos.distanceTo(this._tmpV) > this.rendRange + 2) continue;
                this._applyBleed(enemy, this.rendBleedDuration, stacks * this.rendBleedDmgPerRage);
            }
        }

        this.gameState.combat.isWhipAttacking = true;
        if (this.particleSystem) {
            this.particleSystem.emitSparks(pos, 14 + stacks * 3);
            this.particleSystem.emitEmbers(pos, 10 + stacks * 2, this._particleColor());
        }
        if (this.cs.onProjectileHit) this.cs.onProjectileHit({ whipWindup: true, punchFinish: true });
    }

    _spawnRendSlash(origin, direction, damage, stacks, delay, cr, multiplier) {
        const bladeLen = (cr.bladeLenBase ?? 2.0) + stacks * (cr.bladeLenPerCharge ?? 0.6);
        const bladeWidth = (cr.bladeWidthBase ?? 0.65) + stacks * (cr.bladeWidthPerCharge ?? 0.18);
        const speed = (cr.speedBase ?? 30) + stacks * (cr.speedPerCharge ?? 1.8);
        const lifetime = (cr.lifetimeBase ?? 1.0) + stacks * (cr.lifetimePerCharge ?? 0.06);
        const hitRadius = (cr.hitRadiusBase ?? 1.8) + stacks * (cr.hitRadiusPerCharge ?? 0.4);

        const outerCfg = cr.outer || {};
        const geo = new THREE.RingGeometry(bladeWidth * 0.3, bladeWidth, 24, 1, 0, Math.PI * 0.6);
        const mat = createBloodFireMaterial({
            coreBrightness: (outerCfg.coreBrightnessBase ?? 1.4) + stacks * 0.15,
            plasmaSpeed: (outerCfg.plasmaSpeedBase ?? 9.0),
            isCharged: 1.0,
            layerScale: outerCfg.layerScale ?? 1.5,
            rimPower: outerCfg.rimPower ?? 1.8,
            alpha: outerCfg.alphaBase ?? 0.92,
            redTint: outerCfg.redTint ?? 0.0,
            tintColor: outerCfg.tintColor || this._tintColor
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.scale.setScalar(bladeLen * 0.5);
        const group = new THREE.Group();
        group.add(mesh);
        group.position.copy(origin);
        const dirNorm = direction.clone(); dirNorm.y = 0; dirNorm.normalize();
        group.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dirNorm);
        this.scene.add(group);

        const totalDmg = Math.floor(damage * (multiplier ?? 1) * this.cs._consumeNextAttackMultiplier());
        this._rendSlashes.push({
            mesh: group, geo, mat,
            velocity: dirNorm.clone().multiplyScalar(speed),
            lifetime: delay > 0 ? -delay : 0,
            maxLifetime: lifetime,
            hitRadius,
            damage: totalDmg,
            hitSet: new Set(),
            delay
        });
    }

    _updateRendSlashes(dt) {
        for (let i = this._rendSlashes.length - 1; i >= 0; i--) {
            const s = this._rendSlashes[i];
            s.lifetime += dt;
            if (s.lifetime < 0) { s.mesh.visible = false; continue; }
            s.mesh.visible = true;
            s.mesh.position.addScaledVector(s.velocity, dt);
            const t = s.lifetime / s.maxLifetime;
            const scale = t < 0.1 ? t / 0.1 : 1.0;
            s.mesh.scale.setScalar(scale * 1.5);
            if (s.mat.uniforms) {
                updateBloodFireMaterial(s.mat, s.lifetime * 6, Math.max(0, 0.92 * (1 - t * 0.5)));
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
                enemy.staggerTimer = Math.max(enemy.staggerTimer, 0.3);
                this.gameState.emit('damageNumber', {
                    position: this._tmpV.clone(), damage, isCritical, isBackstab,
                    anchorId: this.cs._getDamageAnchorId(enemy)
                });
            }
            if (s.lifetime >= s.maxLifetime) {
                this.scene.remove(s.mesh);
                s.geo?.dispose();
                s.mat?.dispose();
                this._rendSlashes.splice(i, 1);
            }
        }
    }

    // ─── X: Blood Howl ───────────────────────────────────────
    executeHowl() {
        if (this.howlCooldown > 0) return;
        this.howlCooldown = this.howlCooldownDuration;
        const center = this.character.position.clone();

        for (const enemyMesh of this.cs.enemies) {
            const enemy = enemyMesh.userData?.enemy;
            if (!enemy || enemy.health <= 0) continue;
            enemyMesh.getWorldPosition(this._tmpV);
            const dist = center.distanceTo(this._tmpV);
            if (dist > this.howlRadius + (enemy.hitRadius ?? 0.8)) continue;
            const { damage, isCritical, isBackstab } = this.cs._applyCritBackstab(this.howlDamage, enemy, enemyMesh);
            enemy.takeDamage(damage);
            enemy.staggerTimer = Math.max(enemy.staggerTimer, this.howlStagger);
            enemy.state = 'stagger';
            this.gameState.emit('damageNumber', {
                position: this._tmpV.clone(), damage, isCritical, isBackstab,
                anchorId: this.cs._getDamageAnchorId(enemy)
            });
        }

        // Crit buff
        this.gameState.combat.wolfCritBuffRemaining = this.howlCritBuffDuration;
        this.gameState.combat.wolfCritBuffAmount = this.howlCritBuffAmount;
        // Gain rage
        this.gameState.addBloodCharge(this.howlRageGain);
        this.gameState.addUltimateCharge('charged');

        if (this.particleSystem) {
            this.particleSystem.emitSparks(center, 30);
            this.particleSystem.emitEmbers(center, 20, this._particleColor());
        }
        if (this.cs.onProjectileHit) this.cs.onProjectileHit({ whipHit: true, punchFinish: true });
    }

    // ─── C: Feral Instinct ───────────────────────────────────
    executeInstinct() {
        if (this.instinctCooldown > 0) return;
        this.instinctCooldown = this.instinctCooldownDuration;
        this.gameState.combat.wolfInstinctRemaining = this.instinctDuration;
        this.gameState.combat.wolfInstinctSpeedMult = this.instinctSpeedMult;
        if (this.particleSystem) {
            const pos = this.character.position.clone();
            this.particleSystem.emitSparks(pos, 12);
        }
    }

    // ─── F: Bloodmoon Frenzy (ultimate) ──────────────────────
    executeFrenzy() {
        this.gameState.combat.wolfFrenzyRemaining = this.frenzyDuration;
        this.gameState.combat.wolfFrenzyDamageMult = this.frenzyDamageMult;
        this.gameState.combat.wolfFrenzyAttackSpeedMult = this.frenzyAttackSpeedMult;
        if (this.particleSystem) {
            const pos = this.character.position.clone();
            this.particleSystem.emitSparks(pos, 30);
            this.particleSystem.emitEmbers(pos, 25, this._particleColor());
        }
        if (this.cs.onProjectileHit) this.cs.onProjectileHit({ whipHit: true, punchFinish: true });
    }

    // ─── Bleed DoT ───────────────────────────────────────────
    _applyBleed(enemy, duration, damagePerTick) {
        this._bleedDots.set(enemy, {
            remaining: duration,
            tickInterval: 0.5,
            nextTick: 0.5,
            damagePerTick
        });
    }

    _updateBleeds(dt) {
        for (const enemyMesh of this.cs.enemies) {
            const enemy = enemyMesh.userData?.enemy;
            if (!enemy) continue;
            const dot = this._bleedDots.get(enemy);
            if (!dot) continue;
            dot.remaining -= dt;
            dot.nextTick -= dt;
            if (dot.nextTick <= 0 && enemy.health > 0) {
                dot.nextTick = dot.tickInterval;
                enemy.takeDamage(dot.damagePerTick);
                enemyMesh.getWorldPosition(this._tmpV);
                this.gameState.emit('damageNumber', {
                    position: this._tmpV.clone(),
                    damage: dot.damagePerTick,
                    isCritical: false, isBackstab: false,
                    kind: 'bleed',
                    anchorId: this.cs._getDamageAnchorId(enemy)
                });
            }
            if (dot.remaining <= 0) this._bleedDots.delete(enemy);
        }
    }

    // ─── Rage decay ──────────────────────────────────────────
    _updateRageDecay(dt) {
        if (!this._lastRageDecay) this._lastRageDecay = 0;
        this._lastRageDecay += dt;
        // Lose 1 rage every 4 seconds
        if (this._lastRageDecay >= 4 && this.gameState.bloodCharges > 0) {
            this._lastRageDecay = 0;
            this.gameState.bloodCharges = Math.max(0, this.gameState.bloodCharges - 1);
        }
        // Reset timer if rage was gained recently
        if (this.gameState.bloodCharges > (this._prevRageCount ?? 0)) {
            this._lastRageDecay = 0;
        }
        this._prevRageCount = this.gameState.bloodCharges;
    }

    // ─── Buff timers ─────────────────────────────────────────
    _updateBuffs(dt) {
        const c = this.gameState.combat;
        if (c.wolfCritBuffRemaining > 0) {
            c.wolfCritBuffRemaining -= dt;
            if (c.wolfCritBuffRemaining <= 0) {
                c.wolfCritBuffRemaining = 0;
                c.wolfCritBuffAmount = 0;
            }
        }
        if (c.wolfInstinctRemaining > 0) {
            c.wolfInstinctRemaining -= dt;
            if (c.wolfInstinctRemaining <= 0) {
                c.wolfInstinctRemaining = 0;
                c.wolfInstinctSpeedMult = 1.0;
            }
        }
        if (c.wolfFrenzyRemaining > 0) {
            c.wolfFrenzyRemaining -= dt;
            if (c.wolfFrenzyRemaining <= 0) {
                c.wolfFrenzyRemaining = 0;
                c.wolfFrenzyDamageMult = 1.0;
                c.wolfFrenzyAttackSpeedMult = 1.0;
            }
        }
    }

    // ─── Frame update ────────────────────────────────────────
    update(dt) {
        this.pounceCooldown = Math.max(0, this.pounceCooldown - dt);
        this.howlCooldown = Math.max(0, this.howlCooldown - dt);
        this.instinctCooldown = Math.max(0, this.instinctCooldown - dt);
        this._updateClawSlashes(dt);
        this._updateLunge(dt);
        this._updatePounce(dt);
        this._updatePounceVfx(dt);
        this._updateRendSlashes(dt);
        this._updateBleeds(dt);
        this._updateRageDecay(dt);
        this._updateBuffs(dt);
    }

    _particleColor() {
        return this.gameState.selectedKit?.theme?.particleColor ?? 0x778899;
    }
}
