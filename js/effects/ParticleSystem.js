/**
 * Particle System - Object-pooled particle effects (optimized: zero per-frame allocation)
 *
 * Smooth ease-out fading, additive blending, larger/longer-lived particles for juicy feel.
 */

import * as THREE from 'three';

const BLEED_STACK_COLORS = [0x2a0808, 0x440a0a, 0x550c0c, 0x660e0e, 0x880808, 0xaa0a0a, 0xcc0c0c];
function bleedColor() { return BLEED_STACK_COLORS[Math.floor(Math.random() * BLEED_STACK_COLORS.length)]; }

/** Smooth ease-out: particles decelerate and fade gracefully instead of linearly */
function easeOut(t) { return 1 - (1 - t) * (1 - t); }
function easeOutCubic(t) { return 1 - (1 - t) * (1 - t) * (1 - t); }

export class ParticleSystem {
    constructor(scene) {
        this.scene = scene;
        this.pools = { spark: [], smoke: [], ember: [], shieldAura: [], heal: [] };
        this.activeParticles = [];
        this.activeShieldAuraParticles = [];
        this.shieldAuraTime = 0;
        this.temporaryLights = [];
        this.qualityMultiplier = 1;
        this._tmpVec = new THREE.Vector3();
        this.initializePools();
    }

    addTemporaryLight(position, color, intensity, duration) {
        if (this.temporaryLights.length >= 4) {
            const oldest = this.temporaryLights.shift();
            this.scene.remove(oldest.light);
        }
        const light = new THREE.PointLight(color, intensity, 40, 2.0);
        light.position.copy(position);
        light.userData.initialIntensity = intensity;
        light.userData.duration = duration;
        this.scene.add(light);
        this.temporaryLights.push({ light, remaining: duration });
    }

    initializePools() {
        for (let i = 0; i < 300; i++) this.pools.spark.push(this.createSparkParticle());
        for (let i = 0; i < 120; i++) this.pools.smoke.push(this.createSmokeParticle());
        for (let i = 0; i < 250; i++) this.pools.ember.push(this.createEmberParticle());
        for (let i = 0; i < 120; i++) this.pools.shieldAura.push(this.createShieldAuraParticle());
        for (let i = 0; i < 40; i++) this.pools.heal.push(this.createHealParticle());
    }

    createHealParticle() {
        const geo = new THREE.SphereGeometry(0.07, 4, 4);
        const mat = new THREE.MeshBasicMaterial({ color: 0x22cc44, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
        const p = new THREE.Mesh(geo, mat);
        p.visible = false;
        p.userData = { type: 'heal', active: false, velocity: new THREE.Vector3(), lifetime: 0, maxLifetime: 1.1 };
        this.scene.add(p);
        return p;
    }

    createShieldAuraParticle() {
        const geo = new THREE.SphereGeometry(0.025, 4, 4);
        const mat = new THREE.MeshBasicMaterial({ color: 0x660000, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.NormalBlending });
        const p = new THREE.Mesh(geo, mat);
        p.visible = false;
        p.userData = { type: 'shieldAura', active: false, baseTheta: Math.random() * Math.PI * 2, basePhi: Math.acos(2 * Math.random() - 1), orbitSpeed: 0.3 + Math.random() * 0.4, phase: Math.random() * Math.PI * 2, pulsePhase: Math.random() * Math.PI * 2 };
        this.scene.add(p);
        return p;
    }

    createSparkParticle() {
        const geo = new THREE.PlaneGeometry(0.13, 0.13);
        const mat = new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 1, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
        const p = new THREE.Mesh(geo, mat);
        p.visible = false;
        p.userData = { type: 'spark', velocity: new THREE.Vector3(), lifetime: 0, maxLifetime: 0.5, active: false };
        this.scene.add(p);
        return p;
    }

    createSmokeParticle() {
        const geo = new THREE.PlaneGeometry(0.4, 0.4);
        const mat = new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
        const p = new THREE.Mesh(geo, mat);
        p.visible = false;
        p.userData = { type: 'smoke', velocity: new THREE.Vector3(), lifetime: 0, maxLifetime: 1.8, active: false };
        this.scene.add(p);
        return p;
    }

    createEmberParticle() {
        const geo = new THREE.SphereGeometry(0.03, 4, 4);
        const mat = new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
        const p = new THREE.Mesh(geo, mat);
        p.visible = false;
        p.userData = { type: 'ember', velocity: new THREE.Vector3(), lifetime: 0, maxLifetime: 2.2, active: false };
        this.scene.add(p);
        return p;
    }

    getFromPool(type) {
        const pool = this.pools[type];
        if (!pool) return null;
        for (let i = 0; i < pool.length; i++) {
            if (!pool[i].userData.active) return pool[i];
        }
        return null;
    }

    emitSparks(position, count = 10) {
        const n = Math.floor(count * this.qualityMultiplier);
        for (let i = 0; i < n; i++) {
            const p = this.getFromPool('spark');
            if (!p) return;
            p.position.copy(position);
            p.userData.active = true;
            p.userData.lifetime = 0;
            p.userData.maxLifetime = 0.35 + Math.random() * 0.35;
            p.visible = true;
            const theta = Math.random() * Math.PI * 2;
            const speed = 4 + Math.random() * 5;
            p.userData.velocity.set(Math.cos(theta) * speed, Math.random() * 4 + 2.5, Math.sin(theta) * speed);
            p.material.opacity = 1;
            p.scale.setScalar(0.8 + Math.random() * 0.5);
            this.activeParticles.push(p);
        }
    }

    emitSmoke(position, count = 5) {
        const n = Math.floor(count * this.qualityMultiplier);
        for (let i = 0; i < n; i++) {
            const p = this.getFromPool('smoke');
            if (!p) return;
            p.position.copy(position);
            p.userData.active = true;
            p.userData.lifetime = 0;
            p.visible = true;
            p.userData.velocity.set((Math.random() - 0.5) * 0.8, Math.random() * 1.2 + 0.6, (Math.random() - 0.5) * 0.8);
            p.material.opacity = 0.55;
            p.scale.setScalar(0.35 + Math.random() * 0.4);
            this.activeParticles.push(p);
        }
    }

    emitEmbers(position, count = 8) {
        const n = Math.floor(count * this.qualityMultiplier);
        for (let i = 0; i < n; i++) {
            const p = this.getFromPool('ember');
            if (!p) return;
            p.position.set(position.x + (Math.random() - 0.5) * 2.5, position.y, position.z + (Math.random() - 0.5) * 2.5);
            p.userData.active = true;
            p.userData.lifetime = 0;
            p.visible = true;
            p.userData.velocity.set((Math.random() - 0.5) * 0.5, Math.random() * 2.5 + 1.2, (Math.random() - 0.5) * 0.5);
            p.material.opacity = 1;
            p.scale.setScalar(0.8 + Math.random() * 0.6);
            this.activeParticles.push(p);
        }
    }

    update(deltaTime) {
        let writeIdx = 0;
        for (let i = 0; i < this.activeParticles.length; i++) {
            const p = this.activeParticles[i];
            const d = p.userData;
            d.lifetime += deltaTime;

            if (d.lifetime >= d.maxLifetime) {
                if (d.type === 'smoke' || d.type === 'ember') { p.material.blending = THREE.NormalBlending; p.material.depthWrite = true; }
                if (d.type === 'spark' || d.type === 'smoke' || d.type === 'ember') p.scale.setScalar(1);
                p.visible = false;
                d.active = false;
                continue;
            }

            const v = d.velocity;
            p.position.x += v.x * deltaTime;
            p.position.y += v.y * deltaTime;
            p.position.z += v.z * deltaTime;

            const lifeRatio = d.lifetime / d.maxLifetime;
            // Smooth ease-out fade for all particle types
            const fadeAlpha = 1 - easeOutCubic(lifeRatio);

            if (d.type === 'spark') {
                v.y -= 12 * deltaTime;
                p.material.opacity = fadeAlpha;
                // Slight scale-down as spark fades
                p.scale.setScalar(Math.max(0.1, (1 - lifeRatio * 0.6)) * (0.8 + Math.random() * 0.01));
            } else if (d.type === 'smoke') {
                v.x *= 0.97;
                v.y *= 0.97;
                v.z *= 0.97;
                p.scale.addScalar(deltaTime * 0.7);
                p.material.opacity = 0.55 * fadeAlpha;
            } else if (d.type === 'ember') {
                v.y -= 0.6 * deltaTime;
                // Pulsing glow effect on embers
                const pulse = 0.7 + 0.3 * Math.sin(d.lifetime * 12 + i * 0.5);
                p.material.opacity = fadeAlpha * pulse;
            } else if (d.type === 'heal') {
                v.y *= 0.96;
                p.material.opacity = 0.95 * fadeAlpha;
            }

            this.activeParticles[writeIdx++] = p;
        }
        this.activeParticles.length = writeIdx;

        for (let i = this.temporaryLights.length - 1; i >= 0; i--) {
            const e = this.temporaryLights[i];
            e.remaining -= deltaTime;
            if (e.remaining <= 0) { this.scene.remove(e.light); this.temporaryLights.splice(i, 1); }
            else {
                // Smooth ease-out for light fade
                const t = e.remaining / e.light.userData.duration;
                e.light.intensity = e.light.userData.initialIntensity * easeOut(t);
            }
        }
    }

    updateShieldAura(center, deltaTime, active, isFrost = false) {
        if (!active) {
            for (const p of this.activeShieldAuraParticles) { p.visible = false; p.userData.active = false; this.pools.shieldAura.push(p); }
            this.activeShieldAuraParticles = [];
            return;
        }
        if (this.activeShieldAuraParticles.length === 0) this.shieldAuraTime = 0;
        this.shieldAuraTime += deltaTime;
        const count = Math.min(120, Math.max(40, Math.floor(80 * this.qualityMultiplier)));
        while (this.activeShieldAuraParticles.length < count) {
            const p = this.pools.shieldAura.pop();
            if (!p) break;
            p.userData.active = true;
            if (p.userData.baseTheta === undefined) {
                p.userData.baseTheta = Math.random() * Math.PI * 2;
                p.userData.basePhi = Math.acos(2 * Math.random() - 1);
                p.userData.orbitSpeed = 0.3 + Math.random() * 0.4;
                p.userData.phase = Math.random() * Math.PI * 2;
                p.userData.pulsePhase = Math.random() * Math.PI * 2;
            }
            this.activeShieldAuraParticles.push(p);
        }
        const radius = 1.0;
        const t = this.shieldAuraTime;
        for (let i = 0; i < this.activeShieldAuraParticles.length; i++) {
            const p = this.activeShieldAuraParticles[i];
            const dd = p.userData;
            const theta = dd.baseTheta + t * dd.orbitSpeed + Math.sin(t * 2.5 + dd.phase) * 0.2;
            const phi = dd.basePhi + Math.sin(t * 1.8 + dd.phase * 0.7) * 0.15;
            const r = radius + Math.sin(t * 3.5 + dd.pulsePhase) * 0.08;
            const sinPhi = Math.sin(phi);
            p.position.x = center.x + r * sinPhi * Math.cos(theta);
            p.position.y = center.y + r * Math.cos(phi);
            p.position.z = center.z + r * sinPhi * Math.sin(theta);
            p.visible = true;
            p.material.opacity = Math.max(0.3, Math.min(0.85, 0.55 + 0.4 * Math.sin(t * 4.5 + dd.pulsePhase)));
            const blend = Math.sin(t * 2 + dd.phase) * 0.5 + 0.5;
            if (isFrost) {
                const r255 = (0x22 + Math.floor(blend * (0x66 - 0x22))) / 255;
                const g255 = (0x66 + Math.floor(blend * (0xcc - 0x66))) / 255;
                const b255 = (0xaa + Math.floor(blend * (0xff - 0xaa))) / 255;
                p.material.color.setRGB(r255, g255, b255);
                p.material.blending = THREE.AdditiveBlending;
            } else {
                p.material.color.setRGB((0x2a + Math.floor(blend * (0x88 - 0x2a))) / 255, 0, 0);
                p.material.blending = THREE.NormalBlending;
            }
        }
    }

    setQuality(quality) {
        this.qualityMultiplier = ({ low: 0.3, medium: 0.7, high: 1.0 })[quality] || 0.7;
    }

    emitHitEffect(position) {
        this.emitSparks(position, 12);
        this.emitSmoke(position, 3);
        this.addTemporaryLight(position.clone(), 0xff6622, 30, 0.2);
    }

    emitOrbTrail(position, direction, count = 16) {
        const n = Math.floor(count * this.qualityMultiplier);
        const dir = this._tmpVec.copy(direction).normalize();
        for (let i = 0; i < n; i++) {
            const p = this.getFromPool('ember');
            if (!p) return;
            p.position.copy(position);
            p.userData.active = true; p.userData.lifetime = 0; p.userData.maxLifetime = 0.4 + Math.random() * 0.35; p.visible = true;
            p.material.color.setHex(bleedColor());
            p.userData.velocity.set(dir.x * (-1 - Math.random() * 1.5) + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2, dir.z * (-1 - Math.random() * 1.5) + (Math.random() - 0.5) * 3);
            p.material.opacity = 0.9;
            p.material.blending = THREE.AdditiveBlending;
            p.material.depthWrite = false;
            this.activeParticles.push(p);
        }
        const halfN = Math.floor(n * 0.5);
        for (let i = 0; i < halfN; i++) {
            const p = this.getFromPool('spark');
            if (!p) return;
            p.position.copy(position);
            p.userData.active = true; p.userData.lifetime = 0; p.userData.maxLifetime = 0.25 + Math.random() * 0.2; p.visible = true;
            p.material.color.setHex(bleedColor());
            p.userData.velocity.set(dir.x * (-1.2 - Math.random() * 2) + (Math.random() - 0.5) * 3.5, (Math.random() - 0.5) * 3.5, dir.z * (-1.2 - Math.random() * 2) + (Math.random() - 0.5) * 3.5);
            p.material.opacity = 1;
            this.activeParticles.push(p);
        }
    }

    emitSlashTrail(position, direction, count = 16) {
        const n = Math.floor(count * this.qualityMultiplier);
        const dir = this._tmpVec.copy(direction).normalize();
        for (let i = 0; i < n; i++) {
            const p = this.getFromPool('ember');
            if (!p) return;
            p.position.copy(position);
            p.position.x += (Math.random() - 0.5) * 1.8;
            p.position.z += (Math.random() - 0.5) * 1.0;
            p.userData.active = true; p.userData.lifetime = 0; p.userData.maxLifetime = 0.5 + Math.random() * 0.45; p.visible = true;
            p.material.color.setHex(bleedColor());
            p.userData.velocity.set(dir.x * (-0.6 - Math.random() * 2) + (Math.random() - 0.5) * 3.5, (Math.random() - 0.5) * 2.5, dir.z * (-0.6 - Math.random() * 2) + (Math.random() - 0.5) * 3.5);
            p.material.opacity = 1;
            p.material.blending = THREE.AdditiveBlending;
            p.material.depthWrite = false;
            this.activeParticles.push(p);
        }
        const halfN = Math.floor(n * 0.6);
        for (let i = 0; i < halfN; i++) {
            const p = this.getFromPool('spark');
            if (!p) return;
            p.position.copy(position);
            p.userData.active = true; p.userData.lifetime = 0; p.userData.maxLifetime = 0.3 + Math.random() * 0.25; p.visible = true;
            p.material.color.setHex(bleedColor());
            p.userData.velocity.set(dir.x * (-1.2 - Math.random() * 2.5) + (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, dir.z * (-1.2 - Math.random() * 2.5) + (Math.random() - 0.5) * 5);
            p.material.opacity = 1;
            this.activeParticles.push(p);
        }
    }

    emitUltimateLaunch(position) {
        const m = Math.max(0.5, this.qualityMultiplier);
        const nS = Math.floor(18 * m);
        for (let i = 0; i < nS; i++) {
            const p = this.getFromPool('spark');
            if (!p) break;
            p.position.set(position.x + (Math.random() - 0.5) * 3, position.y, position.z + (Math.random() - 0.5) * 3);
            p.userData.active = true; p.userData.lifetime = 0; p.userData.maxLifetime = 0.5 + Math.random() * 0.4; p.visible = true;
            p.material.color.setHex(bleedColor()); p.material.opacity = 1;
            p.userData.velocity.set((Math.random() - 0.5) * 22, Math.random() * 14 + 5, (Math.random() - 0.5) * 22);
            this.activeParticles.push(p);
        }
        const nE = Math.floor(12 * m);
        for (let i = 0; i < nE; i++) {
            const p = this.getFromPool('ember');
            if (!p) break;
            p.position.copy(position);
            p.userData.active = true; p.userData.lifetime = 0; p.userData.maxLifetime = 0.65 + Math.random() * 0.4; p.visible = true;
            p.material.color.setHex(bleedColor());
            p.userData.velocity.set((Math.random() - 0.5) * 14, Math.random() * 8 + 3, (Math.random() - 0.5) * 14);
            this.activeParticles.push(p);
        }
        this.addTemporaryLight(position.clone(), 0xcc2200, 50, 0.45);
    }

    emitUltimateImpact(position) {
        const m = Math.max(0.5, this.qualityMultiplier);
        this.emitSparks(position, Math.floor(20 * m));
        this.emitSmoke(position, Math.floor(5 * m));
        this.emitEmbers(position, Math.floor(14 * m));
        this.addTemporaryLight(position.clone(), 0xff4400, 60, 0.4);
    }

    emitUltimateExplosion(position) {
        const m = Math.max(0.5, this.qualityMultiplier);
        this.emitSparks(position, Math.floor(28 * m));
        this.emitSmoke(position, Math.floor(6 * m));
        this.emitEmbers(position, Math.floor(20 * m));
        this.addTemporaryLight(position.clone(), 0xff2200, 60, 0.45);
    }

    emitUltimateEndExplosion(position) {
        const m = Math.max(0.5, this.qualityMultiplier);
        const speed = 42;
        const spread = 5;
        const sz = 0.28;
        // Fewer but larger particles — same visual punch, less CPU
        const nS = Math.floor(18 * m);
        for (let i = 0; i < nS; i++) {
            const p = this.getFromPool('spark');
            if (!p) break;
            p.position.set(position.x + (Math.random() - 0.5) * spread, position.y + (Math.random() - 0.5) * spread, position.z + (Math.random() - 0.5) * spread);
            p.userData.active = true; p.userData.lifetime = 0; p.userData.maxLifetime = 0.55 + Math.random() * 0.45; p.visible = true;
            p.scale.setScalar(sz * (0.8 + Math.random() * 1.0));
            p.material.color.setHex(bleedColor()); p.material.opacity = 1;
            p.material.blending = THREE.AdditiveBlending; p.material.depthWrite = false;
            p.userData.velocity.set((Math.random() - 0.5) * speed, Math.random() * speed * 0.6 + speed * 0.2, (Math.random() - 0.5) * speed);
            this.activeParticles.push(p);
        }
        const nSm = Math.floor(5 * m);
        for (let i = 0; i < nSm; i++) {
            const p = this.getFromPool('smoke');
            if (!p) break;
            p.position.set(position.x + (Math.random() - 0.5) * spread, position.y, position.z + (Math.random() - 0.5) * spread);
            p.userData.active = true; p.userData.lifetime = 0; p.userData.maxLifetime = 2.2 + Math.random() * 0.8; p.visible = true;
            p.scale.setScalar(sz * 0.7 * (0.6 + Math.random() * 0.6));
            p.material.color.setHex(bleedColor()); p.material.opacity = 0.9;
            p.material.blending = THREE.AdditiveBlending; p.material.depthWrite = false;
            p.userData.velocity.set((Math.random() - 0.5) * speed * 0.5, Math.random() * speed * 0.35 + speed * 0.15, (Math.random() - 0.5) * speed * 0.5);
            this.activeParticles.push(p);
        }
        const nE = Math.floor(10 * m);
        for (let i = 0; i < nE; i++) {
            const p = this.getFromPool('ember');
            if (!p) break;
            p.position.set(position.x + (Math.random() - 0.5) * spread, position.y + (Math.random() - 0.5) * spread, position.z + (Math.random() - 0.5) * spread);
            p.userData.active = true; p.userData.lifetime = 0; p.userData.maxLifetime = 1.2 + Math.random() * 0.8; p.visible = true;
            p.scale.setScalar(sz * (0.6 + Math.random() * 0.7));
            p.material.color.setHex(bleedColor()); p.material.opacity = 1;
            p.material.blending = THREE.AdditiveBlending; p.material.depthWrite = false;
            p.userData.velocity.set((Math.random() - 0.5) * speed * 0.7, Math.random() * speed * 0.5 + speed * 0.25, (Math.random() - 0.5) * speed * 0.7);
            this.activeParticles.push(p);
        }
        this.addTemporaryLight(position.clone(), 0xcc0a0a, 70, 0.6);
    }

    emitBloodMatterExplosion(position) {
        const m = Math.max(0.5, this.qualityMultiplier);
        const spread = 7; const speed = 48;
        this.addTemporaryLight(position.clone(), 0xaa0a0a, 80, 0.55);
        const nS = Math.floor(16 * m);
        for (let i = 0; i < nS; i++) {
            const p = this.getFromPool('spark');
            if (!p) break;
            p.position.set(position.x + (Math.random() - 0.5) * spread, position.y + (Math.random() - 0.5) * spread, position.z + (Math.random() - 0.5) * spread);
            p.userData.active = true; p.userData.lifetime = 0; p.userData.maxLifetime = 0.7 + Math.random() * 0.5; p.visible = true;
            p.scale.setScalar(1.4 + Math.random() * 1.0);
            p.material.color.setHex(bleedColor()); p.material.opacity = 1;
            p.userData.velocity.set((Math.random() - 0.5) * speed, Math.random() * speed * 0.6 + speed * 0.2, (Math.random() - 0.5) * speed);
            this.activeParticles.push(p);
        }
        const nSm = Math.floor(5 * m);
        for (let i = 0; i < nSm; i++) {
            const p = this.getFromPool('smoke');
            if (!p) break;
            p.position.set(position.x + (Math.random() - 0.5) * spread, position.y, position.z + (Math.random() - 0.5) * spread);
            p.userData.active = true; p.userData.lifetime = 0; p.userData.maxLifetime = 2.0 + Math.random() * 0.6; p.visible = true;
            p.material.color.setHex(bleedColor()); p.material.opacity = 0.9;
            p.material.blending = THREE.AdditiveBlending; p.material.depthWrite = false;
            p.userData.velocity.set((Math.random() - 0.5) * speed * 0.5, Math.random() * speed * 0.35 + speed * 0.15, (Math.random() - 0.5) * speed * 0.5);
            this.activeParticles.push(p);
        }
        const nE = Math.floor(10 * m);
        for (let i = 0; i < nE; i++) {
            const p = this.getFromPool('ember');
            if (!p) break;
            p.position.set(position.x + (Math.random() - 0.5) * spread, position.y + (Math.random() - 0.5) * spread, position.z + (Math.random() - 0.5) * spread);
            p.userData.active = true; p.userData.lifetime = 0; p.userData.maxLifetime = 1.2 + Math.random() * 0.6; p.visible = true;
            p.scale.setScalar(1.2 + Math.random() * 0.7);
            p.material.color.setHex(bleedColor()); p.material.opacity = 1;
            p.material.blending = THREE.AdditiveBlending; p.material.depthWrite = false;
            p.userData.velocity.set((Math.random() - 0.5) * speed * 0.7, Math.random() * speed * 0.5 + speed * 0.25, (Math.random() - 0.5) * speed * 0.7);
            this.activeParticles.push(p);
        }
    }

    emitCrimsonEruptionRing(center, radius) {
        if (!center || typeof radius !== 'number') return;
        const m = Math.max(0.5, this.qualityMultiplier);
        const points = Math.floor(12 * m);
        const upSpeed = 28;
        for (let i = 0; i < points; i++) {
            const angle = (i / points) * Math.PI * 2;
            const px = center.x + Math.cos(angle) * radius + (Math.random() - 0.5) * 0.8;
            const pz = center.z + Math.sin(angle) * radius + (Math.random() - 0.5) * 0.8;
            for (let s = 0; s < 3; s++) {
                const p = this.getFromPool('spark');
                if (!p) break;
                p.position.set(px, center.y, pz);
                p.userData.active = true; p.userData.lifetime = 0; p.userData.maxLifetime = 0.8 + Math.random() * 0.5; p.visible = true;
                p.scale.setScalar(1.2 + Math.random() * 0.6);
                p.material.color.setHex(bleedColor()); p.material.opacity = 1;
                p.userData.velocity.set((Math.random() - 0.5) * 12, upSpeed * (0.7 + Math.random() * 0.9), (Math.random() - 0.5) * 12);
                this.activeParticles.push(p);
            }
            for (let e = 0; e < 2; e++) {
                const p = this.getFromPool('ember');
                if (!p) break;
                p.position.set(px, center.y, pz);
                p.userData.active = true; p.userData.lifetime = 0; p.userData.maxLifetime = 1.2 + Math.random() * 0.7; p.visible = true;
                p.scale.setScalar(1.0 + Math.random() * 0.5);
                p.material.color.setHex(bleedColor()); p.material.opacity = 1;
                p.material.blending = THREE.AdditiveBlending; p.material.depthWrite = false;
                p.userData.velocity.set((Math.random() - 0.5) * 8, upSpeed * 0.5 * (0.6 + Math.random()), (Math.random() - 0.5) * 8);
                this.activeParticles.push(p);
            }
        }
        const cS = Math.floor(18 * m);
        for (let i = 0; i < cS; i++) {
            const p = this.getFromPool('spark');
            if (!p) break;
            p.position.set(center.x + (Math.random() - 0.5) * 1.5, center.y, center.z + (Math.random() - 0.5) * 1.5);
            p.userData.active = true; p.userData.lifetime = 0; p.userData.maxLifetime = 0.9 + Math.random() * 0.6; p.visible = true;
            p.scale.setScalar(1.0 + Math.random() * 0.5);
            p.material.color.setHex(bleedColor()); p.material.opacity = 1;
            p.userData.velocity.set((Math.random() - 0.5) * 16, upSpeed * (0.8 + Math.random()), (Math.random() - 0.5) * 16);
            this.activeParticles.push(p);
        }
        this.addTemporaryLight(center.clone(), 0xcc0a0a, 80, 1.0);
    }

    emitBloodNovaBurst(center, radius = 10) {
        if (!center) return;
        const m = Math.max(0.5, this.qualityMultiplier);
        const ringPts = Math.floor(18 * m);
        const swirlLayers = 3;
        for (let layer = 0; layer < swirlLayers; layer++) {
            const yOff = 0.08 + layer * 0.25;
            const rMul = 0.5 + layer * 0.35;
            for (let i = 0; i < ringPts; i++) {
                const t = (i / ringPts) * Math.PI * 2;
                const px = center.x + Math.cos(t) * radius * rMul;
                const pz = center.z + Math.sin(t) * radius * rMul;
                const p = this.getFromPool('spark');
                if (!p) break;
                p.position.set(px, center.y + yOff, pz);
                p.userData.active = true; p.userData.lifetime = 0; p.userData.maxLifetime = 0.6 + Math.random() * 0.5; p.visible = true;
                p.scale.setScalar(1.2 + Math.random() * 0.8);
                p.material.color.setHex(bleedColor()); p.material.opacity = 1;
                const tangential = 20 + layer * 8;
                p.userData.velocity.set(-Math.sin(t) * tangential + (Math.random() - 0.5) * 3, 10 + Math.random() * 10, Math.cos(t) * tangential + (Math.random() - 0.5) * 3);
                this.activeParticles.push(p);
            }
        }
        const core = Math.floor(35 * m);
        for (let i = 0; i < core; i++) {
            const p = this.getFromPool('ember');
            if (!p) break;
            p.position.set(center.x + (Math.random() - 0.5) * 1.6, center.y + Math.random() * 0.5, center.z + (Math.random() - 0.5) * 1.6);
            p.userData.active = true; p.userData.lifetime = 0; p.userData.maxLifetime = 1.1 + Math.random() * 0.9; p.visible = true;
            p.scale.setScalar(1.0 + Math.random() * 0.6);
            p.material.color.setHex(bleedColor()); p.material.opacity = 1;
            p.material.blending = THREE.AdditiveBlending; p.material.depthWrite = false;
            const a = Math.random() * Math.PI * 2;
            const sp = 20 + Math.random() * 18;
            p.userData.velocity.set(Math.cos(a) * sp, 8 + Math.random() * 12, Math.sin(a) * sp);
            this.activeParticles.push(p);
        }
        this.addTemporaryLight(center.clone(), 0xcc0a0a, 100, 0.9);
    }

    emitPoisonBurst(position, count = 18) {
        const n = Math.floor(count * this.qualityMultiplier);
        for (let i = 0; i < n; i++) {
            const p = this.getFromPool('spark');
            if (!p) break;
            p.position.copy(position);
            p.userData.active = true;
            p.userData.lifetime = 0;
            p.userData.maxLifetime = 0.4 + Math.random() * 0.3;
            p.visible = true;
            p.material.color.setHex(Math.random() > 0.5 ? 0x8bff7a : 0x2bc95a);
            p.material.opacity = 1;
            const theta = Math.random() * Math.PI * 2;
            const speed = 5 + Math.random() * 5;
            p.userData.velocity.set(Math.cos(theta) * speed, Math.random() * 4 + 1.5, Math.sin(theta) * speed);
            this.activeParticles.push(p);
        }
        const embers = Math.floor(n * 0.9);
        for (let i = 0; i < embers; i++) {
            const p = this.getFromPool('ember');
            if (!p) break;
            p.position.copy(position);
            p.userData.active = true;
            p.userData.lifetime = 0;
            p.userData.maxLifetime = 0.8 + Math.random() * 0.5;
            p.visible = true;
            p.material.color.setHex(Math.random() > 0.5 ? 0x4dff66 : 0x1fbf4c);
            p.material.opacity = 1;
            p.material.blending = THREE.AdditiveBlending;
            p.material.depthWrite = false;
            const theta = Math.random() * Math.PI * 2;
            const speed = 3 + Math.random() * 4;
            p.userData.velocity.set(Math.cos(theta) * speed, Math.random() * 2.5 + 0.8, Math.sin(theta) * speed);
            this.activeParticles.push(p);
        }
        this.addTemporaryLight(position.clone(), 0x2bc95a, 55, 0.4);
    }

    emitPoisonTrail(position, count = 2) {
        const n = Math.max(1, Math.floor(count * this.qualityMultiplier));
        for (let i = 0; i < n; i++) {
            const p = this.getFromPool('ember');
            if (!p) return;
            p.position.copy(position);
            p.userData.active = true;
            p.userData.lifetime = 0;
            p.userData.maxLifetime = 0.5 + Math.random() * 0.4;
            p.visible = true;
            p.material.color.setHex(Math.random() > 0.5 ? 0x4dff66 : 0x1fbf4c);
            p.material.blending = THREE.AdditiveBlending;
            p.material.depthWrite = false;
            p.userData.velocity.set(
                (Math.random() - 0.5) * 0.4,
                0.4 + Math.random() * 0.7,
                (Math.random() - 0.5) * 0.4
            );
            p.material.opacity = 0.8;
            this.activeParticles.push(p);
        }
    }

    emitShadowStepBurst(position, count = 35) {
        const n = Math.floor(count * this.qualityMultiplier);
        for (let i = 0; i < n; i++) {
            const p = this.getFromPool('spark');
            if (!p) break;
            p.position.copy(position);
            p.userData.active = true;
            p.userData.lifetime = 0;
            p.userData.maxLifetime = 0.55 + Math.random() * 0.4;
            p.visible = true;
            p.material.color.setHex(Math.random() > 0.3 ? 0x4dff66 : 0x1a0a2e);
            p.material.opacity = 1;
            p.material.blending = THREE.AdditiveBlending;
            p.material.depthWrite = false;
            const theta = Math.random() * Math.PI * 2;
            const speed = 7 + Math.random() * 10;
            p.userData.velocity.set(
                Math.cos(theta) * speed,
                Math.random() * 6 + 3,
                Math.sin(theta) * speed
            );
            this.activeParticles.push(p);
        }
        const embers = Math.floor(n * 0.7);
        for (let i = 0; i < embers; i++) {
            const p = this.getFromPool('ember');
            if (!p) break;
            p.position.copy(position);
            p.userData.active = true;
            p.userData.lifetime = 0;
            p.userData.maxLifetime = 0.9 + Math.random() * 0.6;
            p.visible = true;
            p.material.color.setHex(0x1a0a2e);
            p.material.opacity = 0.95;
            p.material.blending = THREE.AdditiveBlending;
            p.material.depthWrite = false;
            const theta = Math.random() * Math.PI * 2;
            const speed = 4 + Math.random() * 6;
            p.userData.velocity.set(
                Math.cos(theta) * speed,
                Math.random() * 4 + 1.5,
                Math.sin(theta) * speed
            );
            this.activeParticles.push(p);
        }
        this.addTemporaryLight(position.clone(), 0x4dff66, 75, 0.5);
    }

    emitVanishSmoke(position, count = 50) {
        const n = Math.floor(count * this.qualityMultiplier);
        for (let i = 0; i < n; i++) {
            const p = this.getFromPool('smoke');
            if (!p) break;
            p.position.copy(position);
            p.position.x += (Math.random() - 0.5) * 2;
            p.position.z += (Math.random() - 0.5) * 2;
            p.userData.active = true;
            p.userData.lifetime = 0;
            p.userData.maxLifetime = 1.2 + Math.random() * 0.7;
            p.visible = true;
            p.material.color.setHex(0x1a0a2e);
            p.material.opacity = 0.75;
            p.material.blending = THREE.NormalBlending;
            p.scale.setScalar(0.7 + Math.random() * 0.6);
            p.userData.velocity.set(
                (Math.random() - 0.5) * 4,
                2 + Math.random() * 2.5,
                (Math.random() - 0.5) * 4
            );
            this.activeParticles.push(p);
        }
        const sparks = Math.floor(n * 0.6);
        for (let i = 0; i < sparks; i++) {
            const p = this.getFromPool('spark');
            if (!p) break;
            p.position.copy(position);
            p.userData.active = true;
            p.userData.lifetime = 0;
            p.userData.maxLifetime = 0.7 + Math.random() * 0.35;
            p.visible = true;
            p.material.color.setHex(Math.random() > 0.5 ? 0x6633aa : 0x4dff66);
            p.material.opacity = 0.95;
            p.material.blending = THREE.AdditiveBlending;
            p.material.depthWrite = false;
            const theta = Math.random() * Math.PI * 2;
            const speed = 3 + Math.random() * 5;
            p.userData.velocity.set(
                Math.cos(theta) * speed,
                Math.random() * 4 + 1.5,
                Math.sin(theta) * speed
            );
            this.activeParticles.push(p);
        }
        this.addTemporaryLight(position.clone(), 0x6633aa, 45, 0.5);
    }

    emitPunchBurst(position) {
        const m = Math.max(0.5, this.qualityMultiplier);
        const nS = Math.floor(16 * m);
        const speed = 16;
        for (let i = 0; i < nS; i++) {
            const p = this.getFromPool('spark');
            if (!p) break;
            p.position.copy(position);
            p.userData.active = true; p.userData.lifetime = 0; p.userData.maxLifetime = 0.5 + Math.random() * 0.35; p.visible = true;
            p.material.color.setHex(bleedColor()); p.material.opacity = 1;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1) * 0.5;
            p.userData.velocity.set(Math.sin(phi) * Math.cos(theta) * speed * (0.6 + Math.random() * 0.7), Math.random() * speed * 0.9 + speed * 0.2, Math.sin(phi) * Math.sin(theta) * speed * (0.6 + Math.random() * 0.7));
            this.activeParticles.push(p);
        }
        this.addTemporaryLight(position.clone(), 0xcc0a0a, 70, 0.45);
    }

    emitHealEffect(center, count = 40) {
        const n = Math.floor(count * Math.max(0.5, this.qualityMultiplier));
        const greens = [0x22cc44, 0x33dd55, 0x44ee66, 0x28b850, 0x2dd66a];
        for (let i = 0; i < n; i++) {
            const p = this.pools.heal.pop();
            if (!p) break;
            p.position.set(center.x + (Math.random() - 0.5) * 1.0, center.y + (Math.random() - 0.2) * 0.7, center.z + (Math.random() - 0.5) * 1.0);
            p.userData.active = true; p.userData.lifetime = 0; p.userData.maxLifetime = 1.3; p.visible = true;
            p.userData.velocity.set((Math.random() - 0.5) * (0.5 + Math.random() * 0.6), 2.0 + Math.random() * 1.6, (Math.random() - 0.5) * (0.5 + Math.random() * 0.6));
            p.material.color.setHex(greens[Math.floor(Math.random() * greens.length)]);
            p.material.opacity = 1;
            this.activeParticles.push(p);
        }
        this.addTemporaryLight(center.clone(), 0x22cc44, 35, 0.4);
    }

    emitDrainFlow(fromPos, toPos, count = 28) {
        this._tmpVec.subVectors(toPos, fromPos).normalize();
        const speed = 6 + fromPos.distanceTo(toPos) * 0.7;
        const n = Math.floor(count * Math.max(0.5, this.qualityMultiplier));
        for (let i = 0; i < n; i++) {
            const p = this.getFromPool('spark');
            if (!p) break;
            p.position.copy(fromPos);
            p.userData.active = true; p.userData.lifetime = 0; p.userData.maxLifetime = 0.65 + Math.random() * 0.4; p.visible = true;
            p.material.color.setHex(bleedColor()); p.material.opacity = 0.95;
            p.material.blending = THREE.AdditiveBlending;
            const s = speed * (0.85 + Math.random() * 0.55);
            p.userData.velocity.set(this._tmpVec.x * s + (Math.random() - 0.5) * 1.5, this._tmpVec.y * s + (Math.random() - 0.5) * 1.5, this._tmpVec.z * s + (Math.random() - 0.5) * 1.5);
            this.activeParticles.push(p);
        }
        this.addTemporaryLight(fromPos.clone(), 0xaa0a0a, 35, 0.2);
    }

    emitDrainTargetBurst(position) {
        const m = Math.max(0.5, this.qualityMultiplier);
        const nS = Math.floor(12 * m);
        for (let i = 0; i < nS; i++) {
            const p = this.getFromPool('spark');
            if (!p) break;
            p.position.copy(position);
            p.userData.active = true; p.userData.lifetime = 0; p.userData.maxLifetime = 0.4 + Math.random() * 0.35; p.visible = true;
            p.material.color.setHex(bleedColor()); p.material.opacity = 1;
            p.material.blending = THREE.AdditiveBlending;
            const theta = Math.random() * Math.PI * 2;
            const speed = 3 + Math.random() * 4;
            p.userData.velocity.set(Math.cos(theta) * speed, speed * 0.6 + 0.8, Math.sin(theta) * speed);
            this.activeParticles.push(p);
        }
        const nE = Math.floor(8 * m);
        for (let i = 0; i < nE; i++) {
            const p = this.getFromPool('ember');
            if (!p) break;
            p.position.copy(position);
            p.userData.active = true; p.userData.lifetime = 0; p.userData.maxLifetime = 0.5 + Math.random() * 0.4; p.visible = true;
            p.material.color.setHex(bleedColor()); p.material.opacity = 1;
            p.material.blending = THREE.AdditiveBlending; p.material.depthWrite = false;
            const theta = Math.random() * Math.PI * 2;
            const speed = 1.5 + Math.random() * 2.5;
            p.userData.velocity.set(Math.cos(theta) * speed, speed * 0.9, Math.sin(theta) * speed);
            this.activeParticles.push(p);
        }
        this.addTemporaryLight(position.clone(), 0xaa0a0a, 25, 0.15);
    }

    emitTorchFire(position) { this.emitEmbers(position, 2); }

    // ── ICE / FROST particle emitters ──

    /** Burst of ice crystal sparks (cyan-white) */
    emitIceBurst(position, count = 25) {
        const iceColors = [0x88ccff, 0x44aaff, 0xaaddff, 0x66bbff, 0xccf0ff, 0xffffff];
        const n = Math.max(4, Math.floor(count * this.qualityMultiplier));
        for (let i = 0; i < n; i++) {
            const p = this.getFromPool('spark');
            if (!p) break;
            p.position.copy(position);
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const speed = 7 + Math.random() * 14;
            p.userData.velocity.set(
                Math.sin(phi) * Math.cos(theta) * speed,
                Math.sin(phi) * Math.sin(theta) * speed * 0.6 + 3,
                Math.cos(phi) * speed
            );
            p.userData.active = true; p.userData.lifetime = 0;
            p.userData.maxLifetime = 0.35 + Math.random() * 0.55;
            p.visible = true;
            p.material.color.setHex(iceColors[Math.floor(Math.random() * iceColors.length)]);
            p.material.blending = THREE.AdditiveBlending;
            p.material.opacity = 0.95;
            p.scale.setScalar(0.1 + Math.random() * 0.08);
            this.activeParticles.push(p);
        }
        this.addTemporaryLight(position.clone(), 0x66ccff, 45, 0.35);
    }

    /** Ice shatter: sharp crystal fragments flying outward */
    emitIceShatter(position, count = 30) {
        const iceColors = [0x88ccff, 0x44aaff, 0xcceeff, 0xffffff];
        const n = Math.max(4, Math.floor(count * this.qualityMultiplier));
        for (let i = 0; i < n; i++) {
            const p = this.getFromPool('ember');
            if (!p) break;
            p.position.copy(position);
            const theta = Math.random() * Math.PI * 2;
            const speed = 5 + Math.random() * 12;
            p.userData.velocity.set(
                Math.cos(theta) * speed,
                1.5 + Math.random() * 7,
                Math.sin(theta) * speed
            );
            p.userData.active = true; p.userData.lifetime = 0;
            p.userData.maxLifetime = 0.6 + Math.random() * 0.9;
            p.visible = true;
            p.material.color.setHex(iceColors[Math.floor(Math.random() * iceColors.length)]);
            p.material.blending = THREE.AdditiveBlending;
            p.material.opacity = 0.9;
            p.scale.setScalar(0.04 + Math.random() * 0.05);
            this.activeParticles.push(p);
        }
        this.addTemporaryLight(position.clone(), 0x44aaff, 60, 0.45);
    }

    /** Violet energy burst (bow ranger hits) */
    emitVioletBurst(position, count = 8) {
        const violetColors = [0x8844ff, 0xaa66ff, 0xcc88ff, 0xbb55ff, 0xddaaff, 0xffffff];
        const n = Math.max(2, Math.floor(count * this.qualityMultiplier));
        for (let i = 0; i < n; i++) {
            const p = this.getFromPool('spark');
            if (!p) break;
            p.position.copy(position);
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const speed = 6 + Math.random() * 10;
            p.userData.velocity.set(
                Math.sin(phi) * Math.cos(theta) * speed,
                Math.sin(phi) * Math.sin(theta) * speed * 0.5 + 2,
                Math.cos(phi) * speed
            );
            p.userData.active = true; p.userData.lifetime = 0;
            p.userData.maxLifetime = 0.3 + Math.random() * 0.4;
            p.visible = true;
            p.material.color.setHex(violetColors[Math.floor(Math.random() * violetColors.length)]);
            p.material.blending = THREE.AdditiveBlending;
            p.material.opacity = 0.9;
            p.scale.setScalar(0.08 + Math.random() * 0.06);
            this.activeParticles.push(p);
        }
        this.addTemporaryLight(position.clone(), 0x8844ff, 35, 0.3);
    }

    /** Gentle ice trail (falling frost particles) */
    emitIceTrail(position, count = 5) {
        const iceColors = [0x88ccff, 0xaaddff, 0xccf0ff];
        const n = Math.max(1, Math.floor(count * this.qualityMultiplier));
        for (let i = 0; i < n; i++) {
            const p = this.getFromPool('ember');
            if (!p) break;
            p.position.copy(position);
            p.position.x += (Math.random() - 0.5) * 0.6;
            p.position.y += (Math.random() - 0.5) * 0.4;
            p.position.z += (Math.random() - 0.5) * 0.6;
            p.userData.velocity.set(
                (Math.random() - 0.5) * 0.6,
                -0.6 - Math.random() * 1.8,
                (Math.random() - 0.5) * 0.6
            );
            p.userData.active = true; p.userData.lifetime = 0;
            p.userData.maxLifetime = 0.7 + Math.random() * 0.7;
            p.visible = true;
            p.material.color.setHex(iceColors[Math.floor(Math.random() * iceColors.length)]);
            p.material.blending = THREE.AdditiveBlending;
            p.material.opacity = 0.65;
            p.scale.setScalar(0.025 + Math.random() * 0.03);
            this.activeParticles.push(p);
        }
    }

    clear() {
        for (const p of this.activeParticles) { p.visible = false; p.userData.active = false; }
        this.activeParticles.length = 0;
        for (const p of this.activeShieldAuraParticles) { p.visible = false; p.userData.active = false; this.pools.shieldAura.push(p); }
        this.activeShieldAuraParticles = [];
    }
}
