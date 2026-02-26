/**
 * Particle System - Object-pooled particle effects (optimized: zero per-frame allocation)
 */

import * as THREE from 'three';

const BLEED_STACK_COLORS = [0x2a0808, 0x440a0a, 0x550c0c, 0x660e0e, 0x880808, 0xaa0a0a, 0xcc0c0c];
function bleedColor() { return BLEED_STACK_COLORS[Math.floor(Math.random() * BLEED_STACK_COLORS.length)]; }

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
        if (this.temporaryLights.length >= 3) {
            const oldest = this.temporaryLights.shift();
            this.scene.remove(oldest.light);
        }
        const light = new THREE.PointLight(color, intensity, 35, 2.2);
        light.position.copy(position);
        light.userData.initialIntensity = intensity;
        light.userData.duration = duration;
        this.scene.add(light);
        this.temporaryLights.push({ light, remaining: duration });
    }

    initializePools() {
        for (let i = 0; i < 200; i++) this.pools.spark.push(this.createSparkParticle());
        for (let i = 0; i < 80; i++) this.pools.smoke.push(this.createSmokeParticle());
        for (let i = 0; i < 180; i++) this.pools.ember.push(this.createEmberParticle());
        for (let i = 0; i < 120; i++) this.pools.shieldAura.push(this.createShieldAuraParticle());
        for (let i = 0; i < 30; i++) this.pools.heal.push(this.createHealParticle());
    }

    createHealParticle() {
        const geo = new THREE.SphereGeometry(0.06, 4, 4);
        const mat = new THREE.MeshBasicMaterial({ color: 0x22cc44, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
        const p = new THREE.Mesh(geo, mat);
        p.visible = false;
        p.userData = { type: 'heal', active: false, velocity: new THREE.Vector3(), lifetime: 0, maxLifetime: 0.9 };
        this.scene.add(p);
        return p;
    }

    createShieldAuraParticle() {
        const geo = new THREE.SphereGeometry(0.02, 4, 4);
        const mat = new THREE.MeshBasicMaterial({ color: 0x660000, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.NormalBlending });
        const p = new THREE.Mesh(geo, mat);
        p.visible = false;
        p.userData = { type: 'shieldAura', active: false, baseTheta: Math.random() * Math.PI * 2, basePhi: Math.acos(2 * Math.random() - 1), orbitSpeed: 0.3 + Math.random() * 0.4, phase: Math.random() * Math.PI * 2, pulsePhase: Math.random() * Math.PI * 2 };
        this.scene.add(p);
        return p;
    }

    createSparkParticle() {
        const geo = new THREE.PlaneGeometry(0.1, 0.1);
        const mat = new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 1, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
        const p = new THREE.Mesh(geo, mat);
        p.visible = false;
        p.userData = { type: 'spark', velocity: new THREE.Vector3(), lifetime: 0, maxLifetime: 0.5, active: false };
        this.scene.add(p);
        return p;
    }

    createSmokeParticle() {
        const geo = new THREE.PlaneGeometry(0.3, 0.3);
        const mat = new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
        const p = new THREE.Mesh(geo, mat);
        p.visible = false;
        p.userData = { type: 'smoke', velocity: new THREE.Vector3(), lifetime: 0, maxLifetime: 1.5, active: false };
        this.scene.add(p);
        return p;
    }

    createEmberParticle() {
        const geo = new THREE.SphereGeometry(0.02, 3, 3);
        const mat = new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 1 });
        const p = new THREE.Mesh(geo, mat);
        p.visible = false;
        p.userData = { type: 'ember', velocity: new THREE.Vector3(), lifetime: 0, maxLifetime: 2, active: false };
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
            p.userData.maxLifetime = 0.3 + Math.random() * 0.3;
            p.visible = true;
            p.userData.velocity.set((Math.random() - 0.5) * 5, Math.random() * 3 + 2, (Math.random() - 0.5) * 5);
            p.material.opacity = 1;
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
            p.userData.velocity.set((Math.random() - 0.5) * 0.5, Math.random() + 0.5, (Math.random() - 0.5) * 0.5);
            p.material.opacity = 0.5;
            p.scale.setScalar(0.3 + Math.random() * 0.3);
            this.activeParticles.push(p);
        }
    }

    emitEmbers(position, count = 8) {
        const n = Math.floor(count * this.qualityMultiplier);
        for (let i = 0; i < n; i++) {
            const p = this.getFromPool('ember');
            if (!p) return;
            p.position.set(position.x + (Math.random() - 0.5) * 2, position.y, position.z + (Math.random() - 0.5) * 2);
            p.userData.active = true;
            p.userData.lifetime = 0;
            p.visible = true;
            p.userData.velocity.set((Math.random() - 0.5) * 0.3, Math.random() * 2 + 1, (Math.random() - 0.5) * 0.3);
            p.material.opacity = 1;
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

            if (d.type === 'spark') v.y -= 10 * deltaTime;
            else if (d.type === 'smoke') { v.x *= 0.98; v.y *= 0.98; v.z *= 0.98; p.scale.addScalar(deltaTime * 0.5); }
            else if (d.type === 'ember') { v.y -= 0.5 * deltaTime; p.material.opacity = 1 - (d.lifetime / d.maxLifetime) * 0.5; }
            else if (d.type === 'heal') { v.y *= 0.97; p.material.opacity = 0.9 * (1 - d.lifetime / d.maxLifetime); }

            if (d.type !== 'heal') {
                p.material.opacity *= (1 - (d.lifetime / d.maxLifetime) * 0.5);
            }

            this.activeParticles[writeIdx++] = p;
        }
        this.activeParticles.length = writeIdx;

        for (let i = this.temporaryLights.length - 1; i >= 0; i--) {
            const e = this.temporaryLights[i];
            e.remaining -= deltaTime;
            if (e.remaining <= 0) { this.scene.remove(e.light); this.temporaryLights.splice(i, 1); }
            else e.light.intensity = e.light.userData.initialIntensity * (e.remaining / e.light.userData.duration);
        }
    }

    updateShieldAura(center, deltaTime, active) {
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
        const radius = 0.95;
        const t = this.shieldAuraTime;
        for (let i = 0; i < this.activeShieldAuraParticles.length; i++) {
            const p = this.activeShieldAuraParticles[i];
            const dd = p.userData;
            const theta = dd.baseTheta + t * dd.orbitSpeed + Math.sin(t * 2 + dd.phase) * 0.15;
            const phi = dd.basePhi + Math.sin(t * 1.5 + dd.phase * 0.7) * 0.12;
            const r = radius + Math.sin(t * 3 + dd.pulsePhase) * 0.06;
            const sinPhi = Math.sin(phi);
            p.position.x = center.x + r * sinPhi * Math.cos(theta);
            p.position.y = center.y + r * Math.cos(phi);
            p.position.z = center.z + r * sinPhi * Math.sin(theta);
            p.visible = true;
            p.material.opacity = Math.max(0.25, Math.min(0.8, 0.5 + 0.35 * Math.sin(t * 4 + dd.pulsePhase)));
            const blend = Math.sin(t * 2 + dd.phase) * 0.5 + 0.5;
            p.material.color.setRGB((0x2a + Math.floor(blend * (0x88 - 0x2a))) / 255, 0, 0);
        }
    }

    setQuality(quality) {
        this.qualityMultiplier = ({ low: 0.3, medium: 0.7, high: 1.0 })[quality] || 0.7;
    }

    emitHitEffect(position) { this.emitSparks(position, 8); this.emitSmoke(position, 2); }

    emitOrbTrail(position, direction, count = 16) {
        const n = Math.floor(count * this.qualityMultiplier);
        const dir = this._tmpVec.copy(direction).normalize();
        for (let i = 0; i < n; i++) {
            const p = this.getFromPool('ember');
            if (!p) return;
            p.position.copy(position);
            p.userData.active = true; p.userData.lifetime = 0; p.userData.maxLifetime = 0.35 + Math.random() * 0.3; p.visible = true;
            p.material.color.setHex(bleedColor());
            p.userData.velocity.set(dir.x * (-0.8 - Math.random() * 1.2) + (Math.random() - 0.5) * 2.5, (Math.random() - 0.5) * 1.5, dir.z * (-0.8 - Math.random() * 1.2) + (Math.random() - 0.5) * 2.5);
            p.material.opacity = 0.85;
            this.activeParticles.push(p);
        }
        const halfN = Math.floor(n * 0.4);
        for (let i = 0; i < halfN; i++) {
            const p = this.getFromPool('spark');
            if (!p) return;
            p.position.copy(position);
            p.userData.active = true; p.userData.lifetime = 0; p.userData.maxLifetime = 0.2 + Math.random() * 0.15; p.visible = true;
            p.material.color.setHex(bleedColor());
            p.userData.velocity.set(dir.x * (-1 - Math.random() * 1.5) + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, dir.z * (-1 - Math.random() * 1.5) + (Math.random() - 0.5) * 3);
            p.material.opacity = 1;
            this.activeParticles.push(p);
        }
    }

    emitSlashTrail(position, direction, count = 12) {
        const n = Math.floor(count * this.qualityMultiplier);
        const dir = this._tmpVec.copy(direction).normalize();
        for (let i = 0; i < n; i++) {
            const p = this.getFromPool('ember');
            if (!p) return;
            p.position.copy(position);
            p.position.x += (Math.random() - 0.5) * 1.5;
            p.position.z += (Math.random() - 0.5) * 0.8;
            p.userData.active = true; p.userData.lifetime = 0; p.userData.maxLifetime = 0.4 + Math.random() * 0.4; p.visible = true;
            p.material.color.setHex(bleedColor());
            p.userData.velocity.set(dir.x * (-0.5 - Math.random() * 1.5) + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2, dir.z * (-0.5 - Math.random() * 1.5) + (Math.random() - 0.5) * 3);
            p.material.opacity = 0.9;
            this.activeParticles.push(p);
        }
        const halfN = Math.floor(n * 0.5);
        for (let i = 0; i < halfN; i++) {
            const p = this.getFromPool('spark');
            if (!p) return;
            p.position.copy(position);
            p.userData.active = true; p.userData.lifetime = 0; p.userData.maxLifetime = 0.25 + Math.random() * 0.2; p.visible = true;
            p.material.color.setHex(bleedColor());
            p.userData.velocity.set(dir.x * (-1 - Math.random() * 2) + (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, dir.z * (-1 - Math.random() * 2) + (Math.random() - 0.5) * 4);
            p.material.opacity = 1;
            this.activeParticles.push(p);
        }
    }

    emitUltimateLaunch(position) {
        const m = Math.max(0.5, this.qualityMultiplier);
        const nS = Math.floor(12 * m);
        for (let i = 0; i < nS; i++) {
            const p = this.getFromPool('spark');
            if (!p) break;
            p.position.set(position.x + (Math.random() - 0.5) * 2.5, position.y, position.z + (Math.random() - 0.5) * 2.5);
            p.userData.active = true; p.userData.lifetime = 0; p.userData.maxLifetime = 0.4 + Math.random() * 0.3; p.visible = true;
            p.material.color.setHex(bleedColor()); p.material.opacity = 1;
            p.userData.velocity.set((Math.random() - 0.5) * 18, Math.random() * 12 + 4, (Math.random() - 0.5) * 18);
            this.activeParticles.push(p);
        }
        const nE = Math.floor(8 * m);
        for (let i = 0; i < nE; i++) {
            const p = this.getFromPool('ember');
            if (!p) break;
            p.position.copy(position);
            p.userData.active = true; p.userData.lifetime = 0; p.userData.maxLifetime = 0.55 + Math.random() * 0.35; p.visible = true;
            p.material.color.setHex(bleedColor());
            p.userData.velocity.set((Math.random() - 0.5) * 10, Math.random() * 6 + 2, (Math.random() - 0.5) * 10);
            this.activeParticles.push(p);
        }
    }

    emitUltimateImpact(position) {
        const m = Math.max(0.5, this.qualityMultiplier);
        this.emitSparks(position, Math.floor(15 * m));
        this.emitSmoke(position, Math.floor(4 * m));
        this.emitEmbers(position, Math.floor(10 * m));
    }

    emitUltimateExplosion(position) {
        const m = Math.max(0.5, this.qualityMultiplier);
        this.emitSparks(position, Math.floor(20 * m));
        this.emitSmoke(position, Math.floor(5 * m));
        this.emitEmbers(position, Math.floor(15 * m));
    }

    emitUltimateEndExplosion(position) {
        const m = Math.max(0.5, this.qualityMultiplier);
        const speed = 38;
        const spread = 4;
        const sz = 0.18;
        const nS = Math.floor(25 * m);
        for (let i = 0; i < nS; i++) {
            const p = this.getFromPool('spark');
            if (!p) break;
            p.position.set(position.x + (Math.random() - 0.5) * spread, position.y + (Math.random() - 0.5) * spread, position.z + (Math.random() - 0.5) * spread);
            p.userData.active = true; p.userData.lifetime = 0; p.userData.maxLifetime = 0.5 + Math.random() * 0.4; p.visible = true;
            p.scale.setScalar(sz * (0.7 + Math.random() * 0.6));
            p.material.color.setHex(bleedColor()); p.material.opacity = 0.95;
            p.material.blending = THREE.AdditiveBlending; p.material.depthWrite = false;
            p.userData.velocity.set((Math.random() - 0.5) * speed, Math.random() * speed * 0.6 + speed * 0.2, (Math.random() - 0.5) * speed);
            this.activeParticles.push(p);
        }
        const nSm = Math.floor(8 * m);
        for (let i = 0; i < nSm; i++) {
            const p = this.getFromPool('smoke');
            if (!p) break;
            p.position.set(position.x + (Math.random() - 0.5) * spread, position.y, position.z + (Math.random() - 0.5) * spread);
            p.userData.active = true; p.userData.lifetime = 0; p.userData.maxLifetime = 2.2 + Math.random() * 0.8; p.visible = true;
            p.scale.setScalar(sz * 0.5 * (0.6 + Math.random() * 0.5));
            p.material.color.setHex(bleedColor()); p.material.opacity = 0.85;
            p.material.blending = THREE.AdditiveBlending; p.material.depthWrite = false;
            p.userData.velocity.set((Math.random() - 0.5) * speed * 0.5, Math.random() * speed * 0.35 + speed * 0.15, (Math.random() - 0.5) * speed * 0.5);
            this.activeParticles.push(p);
        }
        const nE = Math.floor(15 * m);
        for (let i = 0; i < nE; i++) {
            const p = this.getFromPool('ember');
            if (!p) break;
            p.position.set(position.x + (Math.random() - 0.5) * spread, position.y + (Math.random() - 0.5) * spread, position.z + (Math.random() - 0.5) * spread);
            p.userData.active = true; p.userData.lifetime = 0; p.userData.maxLifetime = 1.2 + Math.random() * 0.8; p.visible = true;
            p.scale.setScalar(sz * (0.5 + Math.random() * 0.5));
            p.material.color.setHex(bleedColor()); p.material.opacity = 0.9;
            p.material.blending = THREE.AdditiveBlending; p.material.depthWrite = false;
            p.userData.velocity.set((Math.random() - 0.5) * speed * 0.7, Math.random() * speed * 0.5 + speed * 0.25, (Math.random() - 0.5) * speed * 0.7);
            this.activeParticles.push(p);
        }
    }

    emitBloodMatterExplosion(position) {
        const m = Math.max(0.5, this.qualityMultiplier);
        const spread = 6; const speed = 44;
        this.addTemporaryLight(position.clone(), 0xaa0a0a, 90, 0.55);
        const nS = Math.floor(60 * m);
        for (let i = 0; i < nS; i++) {
            const p = this.getFromPool('spark');
            if (!p) break;
            p.position.set(position.x + (Math.random() - 0.5) * spread, position.y + (Math.random() - 0.5) * spread, position.z + (Math.random() - 0.5) * spread);
            p.userData.active = true; p.userData.lifetime = 0; p.userData.maxLifetime = 0.6 + Math.random() * 0.5; p.visible = true;
            p.material.color.setHex(bleedColor()); p.material.opacity = 1;
            p.userData.velocity.set((Math.random() - 0.5) * speed, Math.random() * speed * 0.6 + speed * 0.2, (Math.random() - 0.5) * speed);
            this.activeParticles.push(p);
        }
        const nSm = Math.floor(20 * m);
        for (let i = 0; i < nSm; i++) {
            const p = this.getFromPool('smoke');
            if (!p) break;
            p.position.set(position.x + (Math.random() - 0.5) * spread, position.y, position.z + (Math.random() - 0.5) * spread);
            p.userData.active = true; p.userData.lifetime = 0; p.userData.maxLifetime = 2.8 + Math.random(); p.visible = true;
            p.material.color.setHex(bleedColor()); p.material.opacity = 0.9;
            p.material.blending = THREE.AdditiveBlending; p.material.depthWrite = false;
            p.userData.velocity.set((Math.random() - 0.5) * speed * 0.5, Math.random() * speed * 0.35 + speed * 0.15, (Math.random() - 0.5) * speed * 0.5);
            this.activeParticles.push(p);
        }
        const nE = Math.floor(50 * m);
        for (let i = 0; i < nE; i++) {
            const p = this.getFromPool('ember');
            if (!p) break;
            p.position.set(position.x + (Math.random() - 0.5) * spread, position.y + (Math.random() - 0.5) * spread, position.z + (Math.random() - 0.5) * spread);
            p.userData.active = true; p.userData.lifetime = 0; p.userData.maxLifetime = 1.5 + Math.random(); p.visible = true;
            p.material.color.setHex(bleedColor()); p.material.opacity = 1;
            p.material.blending = THREE.AdditiveBlending; p.material.depthWrite = false;
            p.userData.velocity.set((Math.random() - 0.5) * speed * 0.7, Math.random() * speed * 0.5 + speed * 0.25, (Math.random() - 0.5) * speed * 0.7);
            this.activeParticles.push(p);
        }
    }

    emitCrimsonEruptionRing(center, radius) {
        if (!center || typeof radius !== 'number') return;
        const m = Math.max(0.5, this.qualityMultiplier);
        const points = Math.floor(18 * m);
        const upSpeed = 24;
        for (let i = 0; i < points; i++) {
            const angle = (i / points) * Math.PI * 2;
            const px = center.x + Math.cos(angle) * radius + (Math.random() - 0.5) * 0.7;
            const pz = center.z + Math.sin(angle) * radius + (Math.random() - 0.5) * 0.7;
            for (let s = 0; s < 6; s++) {
                const p = this.getFromPool('spark');
                if (!p) break;
                p.position.set(px, center.y, pz);
                p.userData.active = true; p.userData.lifetime = 0; p.userData.maxLifetime = 0.7 + Math.random() * 0.5; p.visible = true;
                p.material.color.setHex(bleedColor()); p.material.opacity = 1;
                p.userData.velocity.set((Math.random() - 0.5) * 10, upSpeed * (0.7 + Math.random() * 0.8), (Math.random() - 0.5) * 10);
                this.activeParticles.push(p);
            }
            for (let e = 0; e < 4; e++) {
                const p = this.getFromPool('ember');
                if (!p) break;
                p.position.set(px, center.y, pz);
                p.userData.active = true; p.userData.lifetime = 0; p.userData.maxLifetime = 1.1 + Math.random() * 0.6; p.visible = true;
                p.material.color.setHex(bleedColor()); p.material.opacity = 1;
                p.material.blending = THREE.AdditiveBlending; p.material.depthWrite = false;
                p.userData.velocity.set((Math.random() - 0.5) * 7, upSpeed * 0.5 * (0.6 + Math.random()), (Math.random() - 0.5) * 7);
                this.activeParticles.push(p);
            }
        }
        const cS = Math.floor(30 * m);
        for (let i = 0; i < cS; i++) {
            const p = this.getFromPool('spark');
            if (!p) break;
            p.position.set(center.x + (Math.random() - 0.5) * 1.2, center.y, center.z + (Math.random() - 0.5) * 1.2);
            p.userData.active = true; p.userData.lifetime = 0; p.userData.maxLifetime = 0.8 + Math.random() * 0.6; p.visible = true;
            p.material.color.setHex(bleedColor()); p.material.opacity = 1;
            p.userData.velocity.set((Math.random() - 0.5) * 14, upSpeed * (0.8 + Math.random()), (Math.random() - 0.5) * 14);
            this.activeParticles.push(p);
        }
        this.addTemporaryLight(center.clone(), 0xaa0a0a, 95, 1);
    }

    emitPunchBurst(position) {
        const m = Math.max(0.5, this.qualityMultiplier);
        const nS = Math.floor(24 * m);
        const speed = 14;
        for (let i = 0; i < nS; i++) {
            const p = this.getFromPool('spark');
            if (!p) break;
            p.position.copy(position);
            p.userData.active = true; p.userData.lifetime = 0; p.userData.maxLifetime = 0.45 + Math.random() * 0.3; p.visible = true;
            p.material.color.setHex(bleedColor()); p.material.opacity = 1;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1) * 0.5;
            p.userData.velocity.set(Math.sin(phi) * Math.cos(theta) * speed * (0.6 + Math.random() * 0.6), Math.random() * speed * 0.8 + speed * 0.2, Math.sin(phi) * Math.sin(theta) * speed * (0.6 + Math.random() * 0.6));
            this.activeParticles.push(p);
        }
        this.addTemporaryLight(position.clone(), 0xaa0a0a, 58, 0.4);
    }

    emitHealEffect(center, count = 18) {
        const n = Math.floor(count * Math.max(0.5, this.qualityMultiplier));
        const greens = [0x22cc44, 0x33dd55, 0x44ee66, 0x28b850, 0x2dd66a];
        for (let i = 0; i < n; i++) {
            const p = this.pools.heal.pop();
            if (!p) break;
            p.position.set(center.x + (Math.random() - 0.5) * 0.8, center.y + (Math.random() - 0.2) * 0.6, center.z + (Math.random() - 0.5) * 0.8);
            p.userData.active = true; p.userData.lifetime = 0; p.userData.maxLifetime = 0.9; p.visible = true;
            p.userData.velocity.set((Math.random() - 0.5) * (0.4 + Math.random() * 0.5), 1.8 + Math.random() * 1.4, (Math.random() - 0.5) * (0.4 + Math.random() * 0.5));
            p.material.color.setHex(greens[Math.floor(Math.random() * greens.length)]);
            p.material.opacity = 0.9;
            this.activeParticles.push(p);
        }
        this.addTemporaryLight(center.clone(), 0x22cc44, 25, 0.35);
    }

    emitDrainFlow(fromPos, toPos, count = 24) {
        this._tmpVec.subVectors(toPos, fromPos).normalize();
        const speed = 5 + fromPos.distanceTo(toPos) * 0.6;
        const n = Math.floor(count * Math.max(0.5, this.qualityMultiplier));
        for (let i = 0; i < n; i++) {
            const p = this.getFromPool('spark');
            if (!p) break;
            p.position.copy(fromPos);
            p.userData.active = true; p.userData.lifetime = 0; p.userData.maxLifetime = 0.6 + Math.random() * 0.35; p.visible = true;
            p.material.color.setHex(bleedColor()); p.material.opacity = 0.9;
            p.material.blending = THREE.AdditiveBlending;
            const s = speed * (0.85 + Math.random() * 0.5);
            p.userData.velocity.set(this._tmpVec.x * s, this._tmpVec.y * s, this._tmpVec.z * s);
            this.activeParticles.push(p);
        }
        this.addTemporaryLight(fromPos.clone(), 0xaa0a0a, 28, 0.18);
    }

    emitDrainTargetBurst(position) {
        const m = Math.max(0.5, this.qualityMultiplier);
        const nS = Math.floor(8 * m);
        for (let i = 0; i < nS; i++) {
            const p = this.getFromPool('spark');
            if (!p) break;
            p.position.copy(position);
            p.userData.active = true; p.userData.lifetime = 0; p.userData.maxLifetime = 0.35 + Math.random() * 0.3; p.visible = true;
            p.material.color.setHex(bleedColor()); p.material.opacity = 0.95;
            p.material.blending = THREE.AdditiveBlending;
            const theta = Math.random() * Math.PI * 2;
            const speed = 2.5 + Math.random() * 3;
            p.userData.velocity.set(Math.cos(theta) * speed, speed * 0.5 + 0.5, Math.sin(theta) * speed);
            this.activeParticles.push(p);
        }
        const nE = Math.floor(6 * m);
        for (let i = 0; i < nE; i++) {
            const p = this.getFromPool('ember');
            if (!p) break;
            p.position.copy(position);
            p.userData.active = true; p.userData.lifetime = 0; p.userData.maxLifetime = 0.4 + Math.random() * 0.35; p.visible = true;
            p.material.color.setHex(bleedColor()); p.material.opacity = 0.9;
            p.material.blending = THREE.AdditiveBlending; p.material.depthWrite = false;
            const theta = Math.random() * Math.PI * 2;
            const speed = 1.2 + Math.random() * 2;
            p.userData.velocity.set(Math.cos(theta) * speed, speed * 0.8, Math.sin(theta) * speed);
            this.activeParticles.push(p);
        }
        this.addTemporaryLight(position.clone(), 0xaa0a0a, 18, 0.12);
    }

    emitTorchFire(position) { this.emitEmbers(position, 1); }

    clear() {
        for (const p of this.activeParticles) { p.visible = false; p.userData.active = false; }
        this.activeParticles.length = 0;
        for (const p of this.activeShieldAuraParticles) { p.visible = false; p.userData.active = false; this.pools.shieldAura.push(p); }
        this.activeShieldAuraParticles = [];
    }
}
