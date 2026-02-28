/**
 * BowCombat - Bow Ranger kit abilities.
 *
 * Passive: Trust charges (max 8), gained on arrow hits. Visible as orbiting blue orbs.
 * Basic: Single blue arrow.
 * Charged: 3-arrow spread.
 * A/V: Recoil Shot - fire close-range shot + dash backward.
 * E: Judgment Arrow - consume all Trust stacks. Damage scales +25% per stack.
 *     4+ stacks: arrow pierces enemies. 6+ stacks: AoE burst on hit. 8 stacks: marks target +30% vuln 6s.
 * X: Multi Shot - rapid sequential arrows, debuffs target +50% damage taken for 6s.
 * C: Hunter's Mark Zone - ground zone, +100% damage while player stands in it, 5s duration.
 * F: Skyfall Arrow - ultimate, huge blue arrow that pierces everything.
 */

import * as THREE from 'three';

const _defaultDir = new THREE.Vector3(0, 0, -1);

export class BowCombat {
    constructor(combatSystem) {
        this.cs = combatSystem;
        this.scene = combatSystem.scene;
        this.character = combatSystem.character;
        this.gameState = combatSystem.gameState;
        this.particleSystem = combatSystem.particleSystem;
        this.enemies = combatSystem.enemies;

        this._enemyPos = new THREE.Vector3();
        this._tmpUp = new THREE.Vector3(0, 1, 0);

        // ── Recoil Shot (A/V) ────────────────────────────────────
        const abilA = this.gameState.selectedKit?.combat?.abilityA || {};
        this.recoilShotCooldown = 0;
        this.recoilShotCooldownDuration = abilA.cooldown ?? 6;
        this.recoilShotDamage = abilA.damage ?? 55;
        this.recoilDashTimer = 0;
        this.recoilDashDuration = 0.22;
        this.recoilDashSpeed = 28;
        this.recoilDashDir = new THREE.Vector3();

        // ── Hunter's Mark Zone (C) ──────────────────────────────
        const abilC = this.gameState.selectedKit?.combat?.abilityC || {};
        this.damageZone = null;
        this.damageZoneDuration = abilC.duration ?? 5;
        this.damageZoneRadius = abilC.radius ?? 3.5;
        this.damageZoneCooldown = 0;
        this.damageZoneCooldownDuration = abilC.cooldown ?? 14;

        // ── Multi Shot (X) ──────────────────────────────────────
        const abilX = this.gameState.selectedKit?.combat?.abilityX || {};
        this.multiShotCooldown = 0;
        this.multiShotCooldownDuration = abilX.cooldown ?? 10;
        this.multiShotState = null;
        this.multiShotArrowCount = abilX.arrowCount ?? 6;
        this.multiShotInterval = 0.08;
        this.multiShotDamagePerArrow = abilX.damagePerArrow ?? 18;
        this.multiShotDebuffDuration = abilX.debuffDuration ?? 6;
        this.multiShotDebuffMultiplier = abilX.debuffMultiplier ?? 1.5;

        // ── Judgment Arrow (E) ──────────────────────────────────
        this.judgmentCooldown = 0;
        this.judgmentCooldownDuration = 1;
    }

    // ═══════════════════════════════════════════════════════════════
    // Frame update
    // ═══════════════════════════════════════════════════════════════

    update(dt) {
        this.recoilShotCooldown = Math.max(0, this.recoilShotCooldown - dt);
        this.damageZoneCooldown = Math.max(0, this.damageZoneCooldown - dt);
        this.multiShotCooldown = Math.max(0, this.multiShotCooldown - dt);
        this.judgmentCooldown = Math.max(0, this.judgmentCooldown - dt);

        // Recoil dash movement
        if (this.recoilDashTimer > 0) {
            this.recoilDashTimer -= dt;
            const t = this.recoilDashTimer / this.recoilDashDuration;
            // Ease-out: faster at start
            this.character.position.addScaledVector(this.recoilDashDir, this.recoilDashSpeed * t * dt);
        }

        // Damage zone
        if (this.damageZone) {
            this.damageZone.remaining -= dt;
            this._updateDamageZoneVisual(dt);

            const px = this.character.position.x - this.damageZone.center.x;
            const pz = this.character.position.z - this.damageZone.center.z;
            const inZone = Math.sqrt(px * px + pz * pz) <= this.damageZone.radius;
            this.gameState.combat.bowDamageZoneMultiplier = inZone ? 2.0 : 1.0;

            if (this.damageZone.remaining <= 0) this._removeDamageZone();
        } else {
            this.gameState.combat.bowDamageZoneMultiplier = 1.0;
        }

        // Multi shot sequence
        if (this.multiShotState) {
            this.multiShotState.timer -= dt;
            while (this.multiShotState && this.multiShotState.timer <= 0 && this.multiShotState.arrowsRemaining > 0) {
                this._spawnMultiShotArrow();
                this.multiShotState.arrowsRemaining--;
                this.multiShotState.timer += this.multiShotInterval;
            }
            if (this.multiShotState && this.multiShotState.arrowsRemaining <= 0) {
                this.multiShotState = null;
            }
        }

        // Update vulnerability debuffs
        this._updateVulnerabilities(dt);
    }

    // ═══════════════════════════════════════════════════════════════
    // Arrow creation
    // ═══════════════════════════════════════════════════════════════

    /** Create a proper arrow mesh. scale controls overall size. */
    createArrowMesh(scale = 1.0, color = 0x8844ff) {
        const group = new THREE.Group();
        const materials = [];
        const geometries = [];

        // Shaft — real arrow proportions
        const shaftLen = 1.1 * scale;
        const shaftRad = 0.028 * scale;
        const shaftGeo = new THREE.CylinderGeometry(shaftRad, shaftRad * 0.85, shaftLen, 5);
        const shaftMat = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.9
        });
        const shaft = new THREE.Mesh(shaftGeo, shaftMat);
        shaft.rotation.x = Math.PI / 2;
        group.add(shaft);
        materials.push(shaftMat);
        geometries.push(shaftGeo);

        // Arrowhead — sharp, diamond-like
        const headLen = 0.28 * scale;
        const headRad = 0.075 * scale;
        const headGeo = new THREE.ConeGeometry(headRad, headLen, 4);
        const headMat = new THREE.MeshBasicMaterial({
            color: 0xccaaff,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const head = new THREE.Mesh(headGeo, headMat);
        head.rotation.x = -Math.PI / 2;
        head.position.z = -(shaftLen / 2 + headLen / 2);
        group.add(head);
        materials.push(headMat);
        geometries.push(headGeo);

        // Glow at tip — bigger, more visible
        const glowRad = 0.12 * scale;
        const glowGeo = new THREE.SphereGeometry(glowRad, 6, 6);
        const glowMat = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.35,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.position.z = -(shaftLen / 2 + headLen);
        group.add(glow);
        materials.push(glowMat);
        geometries.push(glowGeo);

        // Fletching fins at tail — two flat planes crossed
        const finLen = 0.22 * scale;
        const finWidth = 0.06 * scale;
        const finGeo = new THREE.PlaneGeometry(finWidth, finLen);
        const finMat = new THREE.MeshBasicMaterial({
            color: 0xaa77ee,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        for (let r = 0; r < 2; r++) {
            const fin = new THREE.Mesh(finGeo, finMat);
            fin.position.z = shaftLen * 0.42;
            fin.rotation.z = r * (Math.PI / 2);
            group.add(fin);
        }
        materials.push(finMat);
        geometries.push(finGeo);

        return { group, materials, geometries };
    }

    /**
     * Spawn a single arrow projectile into CombatSystem.projectiles.
     * Returns the projectile object for extra configuration.
     */
    _spawnSingleArrow(pos, dir, speed, damage, maxLifetime, isCharged, isPiercing, extraFlags = {}) {
        const scale = isCharged ? 1.3 : 1.0;
        const { group, materials, geometries } = this.createArrowMesh(
            extraFlags.scale ?? scale,
            extraFlags.color ?? 0x8844ff
        );

        group.quaternion.setFromUnitVectors(_defaultDir, dir);
        group.position.copy(pos);
        this.scene.add(group);

        const projectile = {
            mesh: group,
            velocity: dir.clone().multiplyScalar(speed),
            lifetime: 0,
            maxLifetime,
            damage,
            isCharged,
            isBowArrow: true,
            isPiercing,
            materials,
            geometries,
            hitSet: new Set(),
            releaseBurst: isCharged ? 0.12 : 0,
            ...extraFlags
        };

        this.cs.projectiles.push(projectile);
        return projectile;
    }

    // ═══════════════════════════════════════════════════════════════
    // Basic / Charged arrows (called from CombatSystem)
    // ═══════════════════════════════════════════════════════════════

    /** LMB: single blue arrow. RMB charged: 3-arrow spread. */
    spawnArrow(isCharged) {
        const wp = this.character.getWeaponPosition();
        const dir = this.character.getForwardDirection().clone().normalize();
        const startPos = wp.clone().addScaledVector(dir, 0.5);

        const speed = isCharged ? this.cs.chargedSpeed : this.cs.basicSpeed;
        const baseDamage = isCharged ? this.cs.chargedDamage : this.cs.basicDamage;
        const mult = this.cs._consumeNextAttackMultiplier();
        const c = this.gameState.combat;
        let finalMult = mult;
        if (c.bowDamageZoneMultiplier > 1) finalMult *= c.bowDamageZoneMultiplier;
        const damage = Math.floor(baseDamage * finalMult);
        const maxLifetime = isCharged ? this.cs.chargedLifetime : this.cs.basicLifetime;

        if (!isCharged) {
            this._spawnSingleArrow(startPos, dir, speed, damage, maxLifetime, false, false);
            if (this.particleSystem) this.particleSystem.emitSparks(startPos, 4);
        } else {
            // 3-arrow spread
            const spreadAngle = 0.12;
            for (let i = -1; i <= 1; i++) {
                const spreadDir = dir.clone();
                if (i !== 0) {
                    const right = new THREE.Vector3().crossVectors(dir, this._tmpUp).normalize();
                    spreadDir.addScaledVector(right, Math.tan(spreadAngle * i));
                    spreadDir.normalize();
                }
                this._spawnSingleArrow(startPos.clone(), spreadDir, speed, damage, maxLifetime, true, false);
            }
            if (this.particleSystem) {
                this.particleSystem.emitSparks(startPos, 12);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // A/V: Recoil Shot – fire a close-range shot + dash backward
    // ═══════════════════════════════════════════════════════════════

    executeRecoilShot() {
        if (this.recoilShotCooldown > 0) return false;

        const wp = this.character.getWeaponPosition();
        const dir = this.character.getForwardDirection().clone().normalize();
        const startPos = wp.clone().addScaledVector(dir, 0.3);

        // Fire a powerful close-range arrow
        this._spawnSingleArrow(startPos, dir, 35, this.recoilShotDamage, 0.6, true, false, { scale: 1.5 });

        // VFX at launch
        if (this.particleSystem) {
            this.particleSystem.emitSparks(startPos, 18);
            this.particleSystem.emitSmoke(startPos, 8);
        }

        // Dash backward
        this.recoilDashDir.copy(dir).negate();
        this.recoilDashDir.y = 0;
        this.recoilDashDir.normalize();
        this.recoilDashTimer = this.recoilDashDuration;
        this.recoilShotCooldown = this.recoilShotCooldownDuration;

        if (this.cs.onProjectileHit) this.cs.onProjectileHit({ bowRecoilShot: true });
        return true;
    }

    // ═══════════════════════════════════════════════════════════════
    // C: Hunter's Mark Zone – ground zone, +100% damage while inside
    // ═══════════════════════════════════════════════════════════════

    executeDamageZone() {
        if (this.damageZoneCooldown > 0) return false;
        if (this.damageZone) this._removeDamageZone();

        const center = this.character.position.clone();
        center.y = 0.05;
        const radius = this.damageZoneRadius;

        // Inner disc
        const discGeo = new THREE.CircleGeometry(radius, 48);
        const discMat = new THREE.MeshBasicMaterial({
            color: 0x6622ff,
            transparent: true,
            opacity: 0.18,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        const disc = new THREE.Mesh(discGeo, discMat);
        disc.rotation.x = -Math.PI / 2;
        disc.position.copy(center);
        disc.position.y = 0.03;
        this.scene.add(disc);

        // Bright ring border
        const ringGeo = new THREE.RingGeometry(radius - 0.1, radius, 48);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xbb88ff,
            transparent: true,
            opacity: 0.65,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.copy(center);
        ring.position.y = 0.04;
        this.scene.add(ring);

        // Inner pulsing ring
        const innerRingGeo = new THREE.RingGeometry(0, 0.12, 24);
        const innerRingMat = new THREE.MeshBasicMaterial({
            color: 0xccaaff,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
        innerRing.rotation.x = -Math.PI / 2;
        innerRing.position.copy(center);
        innerRing.position.y = 0.05;
        this.scene.add(innerRing);

        this.damageZone = {
            center: center.clone(),
            radius,
            remaining: this.damageZoneDuration,
            disc, discMat, discGeo,
            ring, ringMat, ringGeo,
            innerRing, innerRingMat, innerRingGeo,
            time: 0
        };

        this.damageZoneCooldown = this.damageZoneCooldownDuration;

        if (this.particleSystem) this.particleSystem.emitSparks(center, 25);
        if (this.cs.onProjectileHit) this.cs.onProjectileHit({ bowDamageZone: true });
        return true;
    }

    _updateDamageZoneVisual(dt) {
        if (!this.damageZone) return;
        const z = this.damageZone;
        z.time += dt;

        const lifeFrac = Math.min(1, z.remaining / this.damageZoneDuration);
        const expiring = z.remaining < 1.0 ? z.remaining : 1.0;

        // Pulsing disc
        z.discMat.opacity = (0.14 + 0.08 * Math.sin(z.time * 3)) * lifeFrac * expiring;

        // Rotating ring pulse
        z.ringMat.opacity = (0.5 + 0.2 * Math.sin(z.time * 4)) * lifeFrac * expiring;

        // Expanding inner marker
        const markerScale = 0.8 + 0.4 * Math.sin(z.time * 2.5);
        z.innerRing.scale.setScalar(markerScale);
        z.innerRingMat.opacity = (0.5 + 0.2 * Math.sin(z.time * 5)) * lifeFrac * expiring;

        // Particles along rim
        if (this.particleSystem && Math.random() < 0.25) {
            const angle = Math.random() * Math.PI * 2;
            const rimPos = new THREE.Vector3(
                z.center.x + Math.cos(angle) * z.radius,
                z.center.y + 0.15,
                z.center.z + Math.sin(angle) * z.radius
            );
            this.particleSystem.emitSparks(rimPos, 1);
        }
    }

    _removeDamageZone() {
        if (!this.damageZone) return;
        const z = this.damageZone;
        this.scene.remove(z.disc);
        this.scene.remove(z.ring);
        this.scene.remove(z.innerRing);
        z.discGeo.dispose(); z.discMat.dispose();
        z.ringGeo.dispose(); z.ringMat.dispose();
        z.innerRingGeo.dispose(); z.innerRingMat.dispose();
        this.damageZone = null;
        this.gameState.combat.bowDamageZoneMultiplier = 1.0;
    }

    // ═══════════════════════════════════════════════════════════════
    // X: Multi Shot – rapid sequential arrows that debuff the target
    // ═══════════════════════════════════════════════════════════════

    executeMultiShot() {
        if (this.multiShotCooldown > 0 || this.multiShotState) return false;

        this.multiShotState = {
            arrowsRemaining: this.multiShotArrowCount,
            timer: 0,
            firedCount: 0
        };
        this.multiShotCooldown = this.multiShotCooldownDuration;

        if (this.cs.onProjectileHit) this.cs.onProjectileHit({ bowMultiShot: true });
        return true;
    }

    _spawnMultiShotArrow() {
        const wp = this.character.getWeaponPosition();
        const dir = this.character.getForwardDirection().clone().normalize();

        // Slight random spread for visual variety
        const right = new THREE.Vector3().crossVectors(dir, this._tmpUp).normalize();
        const spread = (Math.random() - 0.5) * 0.06;
        const spreadDir = dir.clone().addScaledVector(right, spread).normalize();

        const startPos = wp.clone().addScaledVector(spreadDir, 0.4);

        const c = this.gameState.combat;
        let mult = 1;
        if (c.bowDamageZoneMultiplier > 1) mult *= c.bowDamageZoneMultiplier;
        const damage = Math.floor(this.multiShotDamagePerArrow * mult);

        const p = this._spawnSingleArrow(startPos, spreadDir, 32, damage, 1.5, false, false, { scale: 0.85 });
        p.isMultiShot = true;

        if (this.particleSystem) this.particleSystem.emitSparks(startPos, 2);
    }

    /** Apply +50% vulnerability debuff to enemy (called from projectile hit detection). */
    applyMultiShotVulnerability(enemy) {
        enemy._bowVulnerabilityRemaining = this.multiShotDebuffDuration;
        enemy._bowVulnerabilityMult = this.multiShotDebuffMultiplier;
    }

    _updateVulnerabilities(dt) {
        for (const mesh of this.enemies) {
            const enemy = mesh.userData?.enemy;
            if (!enemy || !(enemy._bowVulnerabilityRemaining > 0)) continue;
            enemy._bowVulnerabilityRemaining -= dt;
            if (enemy._bowVulnerabilityRemaining <= 0) {
                enemy._bowVulnerabilityRemaining = 0;
                enemy._bowVulnerabilityMult = 1;
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // E: Judgment Arrow – consume Trust stacks for a powerful shot
    // ═══════════════════════════════════════════════════════════════

    executeJudgmentArrow(chargesUsed) {
        if (this.judgmentCooldown > 0) return;

        const wp = this.character.getWeaponPosition();
        const dir = this.character.getForwardDirection().clone().normalize();
        const startPos = wp.clone().addScaledVector(dir, 0.6);

        const abilE = this.gameState.selectedKit?.combat?.abilityE || {};
        const baseDamage = abilE.baseDamage ?? 65;
        const pctPerCharge = abilE.damagePercentPerCharge ?? 25;

        const c = this.gameState.combat;
        let mult = 1;
        if (c.bowDamageZoneMultiplier > 1) mult *= c.bowDamageZoneMultiplier;
        const damage = Math.floor(baseDamage * (1 + (pctPerCharge / 100) * chargesUsed) * mult);

        // 4+ stacks → pierce, 6+ → AoE, 8 → mark for death
        const isPiercing = chargesUsed >= 4;
        const isAoe = chargesUsed >= 6;
        const isMarked = chargesUsed >= 8;

        const arrowScale = 1.4 + chargesUsed * 0.15;
        const arrowColor = chargesUsed >= 6 ? 0xaa66ff : 0x8844ff;

        const { group, materials, geometries } = this.createArrowMesh(arrowScale, arrowColor);

        // Extra glow for 4+ stacks
        if (chargesUsed >= 4) {
            const extraGlowGeo = new THREE.SphereGeometry(0.18 * arrowScale, 8, 8);
            const extraGlowMat = new THREE.MeshBasicMaterial({
                color: 0xcc88ff,
                transparent: true,
                opacity: 0.15 + chargesUsed * 0.025,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            group.add(new THREE.Mesh(extraGlowGeo, extraGlowMat));
            materials.push(extraGlowMat);
            geometries.push(extraGlowGeo);
        }

        group.quaternion.setFromUnitVectors(_defaultDir, dir);
        group.position.copy(startPos);
        this.scene.add(group);

        const projectile = {
            mesh: group,
            velocity: dir.clone().multiplyScalar(30),
            lifetime: 0,
            maxLifetime: 2.2,
            damage,
            isCharged: true,
            isBowArrow: true,
            isPiercing,
            isJudgmentArrow: true,
            judgmentAoe: isAoe,
            judgmentAoeRadius: 3.5,
            judgmentMark: isMarked,
            judgmentCharges: chargesUsed,
            materials,
            geometries,
            hitSet: new Set(),
            releaseBurst: 0.15
        };

        this.cs.projectiles.push(projectile);

        // VFX
        if (this.particleSystem) {
            this.particleSystem.emitSparks(startPos, 18 + chargesUsed * 3);
            if (chargesUsed >= 4 && this.particleSystem.emitVioletBurst) {
                this.particleSystem.emitVioletBurst(startPos, 8);
            }
        }

        if (this.cs.onProjectileHit) this.cs.onProjectileHit({ bowJudgmentArrow: true, stacks: chargesUsed });
        this.judgmentCooldown = this.judgmentCooldownDuration;
    }

    // ═══════════════════════════════════════════════════════════════
    // F: Skyfall Arrow – ultimate, huge piercing arrow
    // ═══════════════════════════════════════════════════════════════

    spawnUltimateArrow() {
        const wp = this.character.getWeaponPosition();
        const dir = this.character.getForwardDirection().clone().normalize();
        const startPos = wp.clone().addScaledVector(dir, 0.8);

        const damage = this.gameState.selectedKit?.combat?.abilityF?.damage ?? 200;

        const { group, materials, geometries } = this.createArrowMesh(4.5, 0x7733ff);

        // Extra glow layers
        for (let i = 0; i < 3; i++) {
            const gRad = 0.25 + i * 0.12;
            const gGeo = new THREE.SphereGeometry(gRad, 8, 8);
            const gMat = new THREE.MeshBasicMaterial({
                color: [0x8844ff, 0xaa88ff, 0xccaaff][i],
                transparent: true,
                opacity: 0.2 - i * 0.05,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            const gl = new THREE.Mesh(gGeo, gMat);
            gl.position.z = -0.9;
            group.add(gl);
            materials.push(gMat);
            geometries.push(gGeo);
        }

        // Trailing wing shapes
        for (let side = -1; side <= 1; side += 2) {
            const wingGeo = new THREE.PlaneGeometry(0.5, 1.0);
            const wingMat = new THREE.MeshBasicMaterial({
                color: 0x8844ff,
                transparent: true,
                opacity: 0.15,
                side: THREE.DoubleSide,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            const wing = new THREE.Mesh(wingGeo, wingMat);
            wing.position.set(side * 0.3, 0, 0.3);
            wing.rotation.z = side * 0.3;
            group.add(wing);
            materials.push(wingMat);
            geometries.push(wingGeo);
        }

        group.quaternion.setFromUnitVectors(_defaultDir, dir);
        group.position.copy(startPos);
        this.scene.add(group);

        const projectile = {
            mesh: group,
            velocity: dir.clone().multiplyScalar(42),
            lifetime: 0,
            maxLifetime: 3.0,
            damage,
            isCharged: true,
            isBowArrow: true,
            isPiercing: true,
            isUltimateArrow: true,
            materials,
            geometries,
            hitSet: new Set(),
            releaseBurst: 0.2
        };

        this.cs.projectiles.push(projectile);

        // Big VFX burst
        if (this.particleSystem) {
            this.particleSystem.emitSparks(startPos, 35);
            if (this.particleSystem.emitIceBurst) this.particleSystem.emitIceBurst(startPos, 18);
        }
    }

    isPlayerInDamageZone() {
        if (!this.damageZone) return false;
        const dx = this.character.position.x - this.damageZone.center.x;
        const dz = this.character.position.z - this.damageZone.center.z;
        return Math.sqrt(dx * dx + dz * dz) <= this.damageZone.radius;
    }

    dispose() {
        this._removeDamageZone();
    }
}
