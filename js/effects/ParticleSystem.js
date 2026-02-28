/**
 * Particle System - GPU-instanced particles for maximum FPS
 *
 * Spark, ember, and heal particles use InstancedMesh (590 individual meshes → 3 draw calls).
 * Smoke and shield aura remain individual meshes (few active, complex behavior).
 * Temporary lights are pooled to avoid scene graph churn.
 */

import * as THREE from 'three';

const BLEED_STACK_COLORS = [0x2a0808, 0x440a0a, 0x550c0c, 0x660e0e, 0x880808, 0xaa0a0a, 0xcc0c0c];
function bleedColor() { return BLEED_STACK_COLORS[Math.floor(Math.random() * BLEED_STACK_COLORS.length)]; }

// ─── GPU-Instanced Particle Pool ────────────────────────────────
// One InstancedMesh per particle type. All additive-blending particles
// encode opacity into instanceColor (color * opacity) so no custom shader
// is needed. Particle data lives in TypedArrays (SoA layout) for cache
// efficiency. Dead particles are compacted via swap-with-last.

class InstancedPool {
    constructor(scene, geometry, maxCount) {
        const material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        this.mesh = new THREE.InstancedMesh(geometry, material, maxCount);
        this.mesh.count = 0;
        this.mesh.frustumCulled = false;
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

        const colorArray = new Float32Array(maxCount * 3);
        this.mesh.instanceColor = new THREE.InstancedBufferAttribute(colorArray, 3);
        this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);

        scene.add(this.mesh);

        // CPU particle data — struct of arrays
        this.max = maxCount;
        this.count = 0;
        this.px = new Float32Array(maxCount);
        this.py = new Float32Array(maxCount);
        this.pz = new Float32Array(maxCount);
        this.vx = new Float32Array(maxCount);
        this.vy = new Float32Array(maxCount);
        this.vz = new Float32Array(maxCount);
        this.cr = new Float32Array(maxCount);
        this.cg = new Float32Array(maxCount);
        this.cb = new Float32Array(maxCount);
        this.baseScale = new Float32Array(maxCount);
        this.life = new Float32Array(maxCount);
        this.maxLife = new Float32Array(maxCount);
    }

    /** Emit a particle. Returns slot index or -1 if pool full. */
    emit(x, y, z, vx, vy, vz, colorHex, scale, maxLifetime) {
        if (this.count >= this.max) return -1;
        const i = this.count++;
        this.px[i] = x;  this.py[i] = y;  this.pz[i] = z;
        this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
        this.cr[i] = ((colorHex >> 16) & 0xFF) / 255;
        this.cg[i] = ((colorHex >> 8) & 0xFF) / 255;
        this.cb[i] = (colorHex & 0xFF) / 255;
        this.baseScale[i] = scale;
        this.life[i] = 0;
        this.maxLife[i] = maxLifetime;
        return i;
    }

    clear() {
        this.count = 0;
        this.mesh.count = 0;
    }
}

// ─── Particle System ────────────────────────────────────────────

export class ParticleSystem {
    constructor(scene) {
        this.scene = scene;
        this.qualityMultiplier = 1;
        this._tmpVec = new THREE.Vector3();

        // Instanced pools for additive particles
        const sparkGeo = new THREE.PlaneGeometry(0.13, 0.13);
        const emberGeo = new THREE.SphereGeometry(0.03, 4, 4);
        const healGeo  = new THREE.SphereGeometry(0.07, 4, 4);

        this.sparkPool = new InstancedPool(scene, sparkGeo, 300);
        this.emberPool = new InstancedPool(scene, emberGeo, 250);
        this.healPool  = new InstancedPool(scene, healGeo, 40);

        // Individual mesh pools (smoke + shield aura — few active, complex behavior)
        this.pools = { smoke: [], shieldAura: [] };
        this.activeParticles = [];            // smoke only
        this.activeShieldAuraParticles = [];
        this.shieldAuraTime = 0;

        for (let i = 0; i < 40; i++) this.pools.smoke.push(this._createSmokeMesh());
        for (let i = 0; i < 40; i++) this.pools.shieldAura.push(this._createShieldAuraMesh());

        // Pooled temporary lights (avoid scene-graph add/remove churn)
        this._lightPool = [];
        this._activeLights = [];
        for (let i = 0; i < 4; i++) {
            const light = new THREE.PointLight(0xffffff, 0, 40, 2.0);
            light.visible = false;
            scene.add(light);
            this._lightPool.push(light);
        }
    }

    // ─── Individual mesh creation (smoke + shield aura) ─────────

    _createSmokeMesh() {
        const geo = new THREE.PlaneGeometry(0.4, 0.4);
        const mat = new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
        const p = new THREE.Mesh(geo, mat);
        p.visible = false;
        p.userData = { type: 'smoke', velocity: new THREE.Vector3(), lifetime: 0, maxLifetime: 1.8, active: false };
        this.scene.add(p);
        return p;
    }

    _createShieldAuraMesh() {
        const geo = new THREE.SphereGeometry(0.025, 4, 4);
        const mat = new THREE.MeshBasicMaterial({ color: 0x660000, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.NormalBlending });
        const p = new THREE.Mesh(geo, mat);
        p.visible = false;
        p.userData = { type: 'shieldAura', active: false, baseTheta: Math.random() * Math.PI * 2, basePhi: Math.acos(2 * Math.random() - 1), orbitSpeed: 0.3 + Math.random() * 0.4, phase: Math.random() * Math.PI * 2, pulsePhase: Math.random() * Math.PI * 2 };
        this.scene.add(p);
        return p;
    }

    _getSmokeFromPool() {
        const pool = this.pools.smoke;
        for (let i = 0; i < pool.length; i++) {
            if (!pool[i].userData.active) return pool[i];
        }
        return null;
    }

    // ─── Temporary light pool ───────────────────────────────────

    addTemporaryLight(position, color, intensity, duration) {
        let light;
        if (this._lightPool.length > 0) {
            light = this._lightPool.pop();
        } else if (this._activeLights.length > 0) {
            // Recycle oldest active light
            const oldest = this._activeLights.shift();
            light = oldest.light;
        } else {
            return; // shouldn't happen
        }
        light.color.set(color);
        light.intensity = intensity;
        light.position.copy(position);
        light.visible = true;
        this._activeLights.push({ light, remaining: duration, initialIntensity: intensity, duration });
    }

    // ─── Spark emitters ─────────────────────────────────────────

    emitSparks(position, count = 10) {
        const n = Math.floor(count * this.qualityMultiplier);
        for (let i = 0; i < n; i++) {
            const theta = Math.random() * Math.PI * 2;
            const speed = 4 + Math.random() * 5;
            const s = 0.8 + Math.random() * 0.5;
            this.sparkPool.emit(
                position.x, position.y, position.z,
                Math.cos(theta) * speed, Math.random() * 4 + 2.5, Math.sin(theta) * speed,
                0xffaa44, s, 0.35 + Math.random() * 0.35
            );
        }
    }

    // ─── Smoke emitters ─────────────────────────────────────────

    emitSmoke(position, count = 5) {
        const n = Math.floor(count * this.qualityMultiplier);
        for (let i = 0; i < n; i++) {
            const p = this._getSmokeFromPool();
            if (!p) return;
            p.position.copy(position);
            p.userData.active = true;
            p.userData.lifetime = 0;
            p.visible = true;
            p.userData.velocity.set((Math.random() - 0.5) * 0.8, Math.random() * 1.2 + 0.6, (Math.random() - 0.5) * 0.8);
            p.material.opacity = 0.55;
            p.material.color.setHex(0x888888);
            p.material.blending = THREE.NormalBlending;
            p.scale.setScalar(0.35 + Math.random() * 0.4);
            this.activeParticles.push(p);
        }
    }

    // ─── Ember emitters ─────────────────────────────────────────

    emitEmbers(position, count = 8) {
        const n = Math.floor(count * this.qualityMultiplier);
        for (let i = 0; i < n; i++) {
            this.emberPool.emit(
                position.x + (Math.random() - 0.5) * 2.5, position.y, position.z + (Math.random() - 0.5) * 2.5,
                (Math.random() - 0.5) * 0.5, Math.random() * 2.5 + 1.2, (Math.random() - 0.5) * 0.5,
                0xff6600, 0.8 + Math.random() * 0.6, 2.2
            );
        }
    }

    // ─── Compound emitters ──────────────────────────────────────

    emitHitEffect(position) {
        this.emitSparks(position, 12);
        this.emitSmoke(position, 3);
        this.addTemporaryLight(position, 0xff6622, 30, 0.2);
    }

    emitOrbTrail(position, direction, count = 16) {
        const n = Math.floor(count * this.qualityMultiplier);
        const dir = this._tmpVec.copy(direction).normalize();
        for (let i = 0; i < n; i++) {
            this.emberPool.emit(
                position.x, position.y, position.z,
                dir.x * (-1 - Math.random() * 1.5) + (Math.random() - 0.5) * 3,
                (Math.random() - 0.5) * 2,
                dir.z * (-1 - Math.random() * 1.5) + (Math.random() - 0.5) * 3,
                bleedColor(), 1.0, 0.4 + Math.random() * 0.35
            );
        }
        const halfN = Math.floor(n * 0.5);
        for (let i = 0; i < halfN; i++) {
            this.sparkPool.emit(
                position.x, position.y, position.z,
                dir.x * (-1.2 - Math.random() * 2) + (Math.random() - 0.5) * 3.5,
                (Math.random() - 0.5) * 3.5,
                dir.z * (-1.2 - Math.random() * 2) + (Math.random() - 0.5) * 3.5,
                bleedColor(), 1.0, 0.25 + Math.random() * 0.2
            );
        }
    }

    emitSlashTrail(position, direction, count = 16) {
        const n = Math.floor(count * this.qualityMultiplier);
        const dir = this._tmpVec.copy(direction).normalize();
        for (let i = 0; i < n; i++) {
            this.emberPool.emit(
                position.x + (Math.random() - 0.5) * 1.8, position.y, position.z + (Math.random() - 0.5) * 1.0,
                dir.x * (-0.6 - Math.random() * 2) + (Math.random() - 0.5) * 3.5,
                (Math.random() - 0.5) * 2.5,
                dir.z * (-0.6 - Math.random() * 2) + (Math.random() - 0.5) * 3.5,
                bleedColor(), 1.0, 0.5 + Math.random() * 0.45
            );
        }
        const halfN = Math.floor(n * 0.6);
        for (let i = 0; i < halfN; i++) {
            this.sparkPool.emit(
                position.x, position.y, position.z,
                dir.x * (-1.2 - Math.random() * 2.5) + (Math.random() - 0.5) * 5,
                (Math.random() - 0.5) * 5,
                dir.z * (-1.2 - Math.random() * 2.5) + (Math.random() - 0.5) * 5,
                bleedColor(), 1.0, 0.3 + Math.random() * 0.25
            );
        }
    }

    emitUltimateLaunch(position) {
        const m = Math.max(0.5, this.qualityMultiplier);
        const nS = Math.floor(18 * m);
        for (let i = 0; i < nS; i++) {
            this.sparkPool.emit(
                position.x + (Math.random() - 0.5) * 3, position.y, position.z + (Math.random() - 0.5) * 3,
                (Math.random() - 0.5) * 22, Math.random() * 14 + 5, (Math.random() - 0.5) * 22,
                bleedColor(), 1.0, 0.5 + Math.random() * 0.4
            );
        }
        const nE = Math.floor(12 * m);
        for (let i = 0; i < nE; i++) {
            this.emberPool.emit(
                position.x, position.y, position.z,
                (Math.random() - 0.5) * 14, Math.random() * 8 + 3, (Math.random() - 0.5) * 14,
                bleedColor(), 1.0, 0.65 + Math.random() * 0.4
            );
        }
        this.addTemporaryLight(position, 0xcc2200, 50, 0.45);
    }

    emitUltimateImpact(position) {
        const m = Math.max(0.5, this.qualityMultiplier);
        this.emitSparks(position, Math.floor(20 * m));
        this.emitSmoke(position, Math.floor(5 * m));
        this.emitEmbers(position, Math.floor(14 * m));
        this.addTemporaryLight(position, 0xff4400, 60, 0.4);
    }

    emitUltimateExplosion(position) {
        const m = Math.max(0.5, this.qualityMultiplier);
        this.emitSparks(position, Math.floor(28 * m));
        this.emitSmoke(position, Math.floor(6 * m));
        this.emitEmbers(position, Math.floor(20 * m));
        this.addTemporaryLight(position, 0xff2200, 60, 0.45);
    }

    emitUltimateEndExplosion(position) {
        const m = Math.max(0.5, this.qualityMultiplier);
        const speed = 42;
        const spread = 5;
        const sz = 0.28;
        const nS = Math.floor(18 * m);
        for (let i = 0; i < nS; i++) {
            this.sparkPool.emit(
                position.x + (Math.random() - 0.5) * spread, position.y + (Math.random() - 0.5) * spread, position.z + (Math.random() - 0.5) * spread,
                (Math.random() - 0.5) * speed, Math.random() * speed * 0.6 + speed * 0.2, (Math.random() - 0.5) * speed,
                bleedColor(), sz * (0.8 + Math.random() * 1.0), 0.55 + Math.random() * 0.45
            );
        }
        const nSm = Math.floor(5 * m);
        for (let i = 0; i < nSm; i++) {
            const p = this._getSmokeFromPool();
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
            this.emberPool.emit(
                position.x + (Math.random() - 0.5) * spread, position.y + (Math.random() - 0.5) * spread, position.z + (Math.random() - 0.5) * spread,
                (Math.random() - 0.5) * speed * 0.7, Math.random() * speed * 0.5 + speed * 0.25, (Math.random() - 0.5) * speed * 0.7,
                bleedColor(), sz * (0.6 + Math.random() * 0.7), 1.2 + Math.random() * 0.8
            );
        }
        this.addTemporaryLight(position, 0xcc0a0a, 70, 0.6);
    }

    emitBloodMatterExplosion(position) {
        const m = Math.max(0.5, this.qualityMultiplier);
        const spread = 7; const speed = 48;
        this.addTemporaryLight(position, 0xaa0a0a, 80, 0.55);
        const nS = Math.floor(16 * m);
        for (let i = 0; i < nS; i++) {
            this.sparkPool.emit(
                position.x + (Math.random() - 0.5) * spread, position.y + (Math.random() - 0.5) * spread, position.z + (Math.random() - 0.5) * spread,
                (Math.random() - 0.5) * speed, Math.random() * speed * 0.6 + speed * 0.2, (Math.random() - 0.5) * speed,
                bleedColor(), 1.4 + Math.random() * 1.0, 0.7 + Math.random() * 0.5
            );
        }
        const nSm = Math.floor(5 * m);
        for (let i = 0; i < nSm; i++) {
            const p = this._getSmokeFromPool();
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
            this.emberPool.emit(
                position.x + (Math.random() - 0.5) * spread, position.y + (Math.random() - 0.5) * spread, position.z + (Math.random() - 0.5) * spread,
                (Math.random() - 0.5) * speed * 0.7, Math.random() * speed * 0.5 + speed * 0.25, (Math.random() - 0.5) * speed * 0.7,
                bleedColor(), 1.2 + Math.random() * 0.7, 1.2 + Math.random() * 0.6
            );
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
                this.sparkPool.emit(
                    px, center.y, pz,
                    (Math.random() - 0.5) * 12, upSpeed * (0.7 + Math.random() * 0.9), (Math.random() - 0.5) * 12,
                    bleedColor(), 1.2 + Math.random() * 0.6, 0.8 + Math.random() * 0.5
                );
            }
            for (let e = 0; e < 2; e++) {
                this.emberPool.emit(
                    px, center.y, pz,
                    (Math.random() - 0.5) * 8, upSpeed * 0.5 * (0.6 + Math.random()), (Math.random() - 0.5) * 8,
                    bleedColor(), 1.0 + Math.random() * 0.5, 1.2 + Math.random() * 0.7
                );
            }
        }
        const cS = Math.floor(18 * m);
        for (let i = 0; i < cS; i++) {
            this.sparkPool.emit(
                center.x + (Math.random() - 0.5) * 1.5, center.y, center.z + (Math.random() - 0.5) * 1.5,
                (Math.random() - 0.5) * 16, upSpeed * (0.8 + Math.random()), (Math.random() - 0.5) * 16,
                bleedColor(), 1.0 + Math.random() * 0.5, 0.9 + Math.random() * 0.6
            );
        }
        this.addTemporaryLight(center, 0xcc0a0a, 80, 1.0);
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
                const tangential = 20 + layer * 8;
                this.sparkPool.emit(
                    px, center.y + yOff, pz,
                    -Math.sin(t) * tangential + (Math.random() - 0.5) * 3, 10 + Math.random() * 10, Math.cos(t) * tangential + (Math.random() - 0.5) * 3,
                    bleedColor(), 1.2 + Math.random() * 0.8, 0.6 + Math.random() * 0.5
                );
            }
        }
        const core = Math.floor(35 * m);
        for (let i = 0; i < core; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = 20 + Math.random() * 18;
            this.emberPool.emit(
                center.x + (Math.random() - 0.5) * 1.6, center.y + Math.random() * 0.5, center.z + (Math.random() - 0.5) * 1.6,
                Math.cos(a) * sp, 8 + Math.random() * 12, Math.sin(a) * sp,
                bleedColor(), 1.0 + Math.random() * 0.6, 1.1 + Math.random() * 0.9
            );
        }
        this.addTemporaryLight(center, 0xcc0a0a, 100, 0.9);
    }

    emitPoisonBurst(position, count = 18) {
        const n = Math.floor(count * this.qualityMultiplier);
        for (let i = 0; i < n; i++) {
            const theta = Math.random() * Math.PI * 2;
            const speed = 5 + Math.random() * 5;
            this.sparkPool.emit(
                position.x, position.y, position.z,
                Math.cos(theta) * speed, Math.random() * 4 + 1.5, Math.sin(theta) * speed,
                Math.random() > 0.5 ? 0x8bff7a : 0x2bc95a, 1.0, 0.4 + Math.random() * 0.3
            );
        }
        // Skip embers — sparks alone read well enough
    }

    emitPoisonTrail(position, count = 2) {
        const n = Math.max(1, Math.floor(count * this.qualityMultiplier));
        for (let i = 0; i < n; i++) {
            this.emberPool.emit(
                position.x, position.y, position.z,
                (Math.random() - 0.5) * 0.4, 0.4 + Math.random() * 0.7, (Math.random() - 0.5) * 0.4,
                Math.random() > 0.5 ? 0x4dff66 : 0x1fbf4c, 1.0, 0.5 + Math.random() * 0.4
            );
        }
    }

    emitShadowStepBurst(position, count = 35) {
        const n = Math.floor(count * this.qualityMultiplier);
        for (let i = 0; i < n; i++) {
            const theta = Math.random() * Math.PI * 2;
            const speed = 7 + Math.random() * 10;
            this.sparkPool.emit(
                position.x, position.y, position.z,
                Math.cos(theta) * speed, Math.random() * 6 + 3, Math.sin(theta) * speed,
                Math.random() > 0.3 ? 0x4dff66 : 0x1a0a2e, 1.0, 0.55 + Math.random() * 0.4
            );
        }
        this.addTemporaryLight(position, 0x4dff66, 55, 0.35);
    }

    emitVanishSmoke(position, count = 50) {
        const n = Math.floor(count * this.qualityMultiplier);
        for (let i = 0; i < n; i++) {
            const p = this._getSmokeFromPool();
            if (!p) break;
            p.position.copy(position);
            p.position.x += (Math.random() - 0.5) * 2;
            p.position.z += (Math.random() - 0.5) * 2;
            p.userData.active = true; p.userData.lifetime = 0; p.userData.maxLifetime = 1.2 + Math.random() * 0.7; p.visible = true;
            p.material.color.setHex(0x1a0a2e);
            p.material.opacity = 0.75;
            p.material.blending = THREE.NormalBlending;
            p.scale.setScalar(0.7 + Math.random() * 0.6);
            p.userData.velocity.set((Math.random() - 0.5) * 4, 2 + Math.random() * 2.5, (Math.random() - 0.5) * 4);
            this.activeParticles.push(p);
        }
        // Sparks via instanced pool (cheaper than smoke meshes)
        const sparks = Math.floor(n * 0.4);
        for (let i = 0; i < sparks; i++) {
            const theta = Math.random() * Math.PI * 2;
            const speed = 3 + Math.random() * 5;
            this.sparkPool.emit(
                position.x, position.y, position.z,
                Math.cos(theta) * speed, Math.random() * 4 + 1.5, Math.sin(theta) * speed,
                Math.random() > 0.5 ? 0x6633aa : 0x4dff66, 1.0, 0.7 + Math.random() * 0.35
            );
        }
        this.addTemporaryLight(position, 0x6633aa, 35, 0.4);
    }

    emitPunchBurst(position) {
        const m = Math.max(0.5, this.qualityMultiplier);
        const nS = Math.floor(16 * m);
        const speed = 16;
        for (let i = 0; i < nS; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1) * 0.5;
            this.sparkPool.emit(
                position.x, position.y, position.z,
                Math.sin(phi) * Math.cos(theta) * speed * (0.6 + Math.random() * 0.7),
                Math.random() * speed * 0.9 + speed * 0.2,
                Math.sin(phi) * Math.sin(theta) * speed * (0.6 + Math.random() * 0.7),
                bleedColor(), 1.0, 0.5 + Math.random() * 0.35
            );
        }
        this.addTemporaryLight(position, 0xcc0a0a, 70, 0.45);
    }

    emitHealEffect(center, count = 40) {
        const n = Math.floor(count * Math.max(0.5, this.qualityMultiplier));
        const greens = [0x22cc44, 0x33dd55, 0x44ee66, 0x28b850, 0x2dd66a];
        for (let i = 0; i < n; i++) {
            this.healPool.emit(
                center.x + (Math.random() - 0.5) * 1.0, center.y + (Math.random() - 0.2) * 0.7, center.z + (Math.random() - 0.5) * 1.0,
                (Math.random() - 0.5) * (0.5 + Math.random() * 0.6), 2.0 + Math.random() * 1.6, (Math.random() - 0.5) * (0.5 + Math.random() * 0.6),
                greens[Math.floor(Math.random() * greens.length)], 1.0, 1.3
            );
        }
        this.addTemporaryLight(center, 0x22cc44, 35, 0.4);
    }

    emitDrainFlow(fromPos, toPos, count = 28) {
        this._tmpVec.subVectors(toPos, fromPos).normalize();
        const speed = 6 + fromPos.distanceTo(toPos) * 0.7;
        const n = Math.floor(count * Math.max(0.5, this.qualityMultiplier));
        for (let i = 0; i < n; i++) {
            const s = speed * (0.85 + Math.random() * 0.55);
            this.sparkPool.emit(
                fromPos.x, fromPos.y, fromPos.z,
                this._tmpVec.x * s + (Math.random() - 0.5) * 1.5,
                this._tmpVec.y * s + (Math.random() - 0.5) * 1.5,
                this._tmpVec.z * s + (Math.random() - 0.5) * 1.5,
                bleedColor(), 1.0, 0.65 + Math.random() * 0.4
            );
        }
        this.addTemporaryLight(fromPos, 0xaa0a0a, 35, 0.2);
    }

    emitDrainTargetBurst(position) {
        const m = Math.max(0.5, this.qualityMultiplier);
        const nS = Math.floor(12 * m);
        for (let i = 0; i < nS; i++) {
            const theta = Math.random() * Math.PI * 2;
            const speed = 3 + Math.random() * 4;
            this.sparkPool.emit(
                position.x, position.y, position.z,
                Math.cos(theta) * speed, speed * 0.6 + 0.8, Math.sin(theta) * speed,
                bleedColor(), 1.0, 0.4 + Math.random() * 0.35
            );
        }
        const nE = Math.floor(8 * m);
        for (let i = 0; i < nE; i++) {
            const theta = Math.random() * Math.PI * 2;
            const speed = 1.5 + Math.random() * 2.5;
            this.emberPool.emit(
                position.x, position.y, position.z,
                Math.cos(theta) * speed, speed * 0.9, Math.sin(theta) * speed,
                bleedColor(), 1.0, 0.5 + Math.random() * 0.4
            );
        }
        this.addTemporaryLight(position, 0xaa0a0a, 25, 0.15);
    }

    emitTorchFire(position) { this.emitEmbers(position, 2); }

    // ── ICE / FROST particle emitters ──

    emitIceBurst(position, count = 25) {
        const iceColors = [0x88ccff, 0x44aaff, 0xaaddff, 0x66bbff, 0xccf0ff, 0xffffff];
        const n = Math.max(4, Math.floor(count * this.qualityMultiplier));
        for (let i = 0; i < n; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const speed = 7 + Math.random() * 14;
            this.sparkPool.emit(
                position.x, position.y, position.z,
                Math.sin(phi) * Math.cos(theta) * speed,
                Math.sin(phi) * Math.sin(theta) * speed * 0.6 + 3,
                Math.cos(phi) * speed,
                iceColors[Math.floor(Math.random() * iceColors.length)],
                0.1 + Math.random() * 0.08, 0.35 + Math.random() * 0.55
            );
        }
        this.addTemporaryLight(position, 0x66ccff, 45, 0.35);
    }

    emitIceShatter(position, count = 30) {
        const iceColors = [0x88ccff, 0x44aaff, 0xcceeff, 0xffffff];
        const n = Math.max(4, Math.floor(count * this.qualityMultiplier));
        for (let i = 0; i < n; i++) {
            const theta = Math.random() * Math.PI * 2;
            const speed = 5 + Math.random() * 12;
            this.emberPool.emit(
                position.x, position.y, position.z,
                Math.cos(theta) * speed, 1.5 + Math.random() * 7, Math.sin(theta) * speed,
                iceColors[Math.floor(Math.random() * iceColors.length)],
                0.04 + Math.random() * 0.05, 0.6 + Math.random() * 0.9
            );
        }
        this.addTemporaryLight(position, 0x44aaff, 60, 0.45);
    }

    emitVioletBurst(position, count = 8) {
        const violetColors = [0x8844ff, 0xaa66ff, 0xcc88ff, 0xbb55ff, 0xddaaff, 0xffffff];
        const n = Math.max(2, Math.floor(count * this.qualityMultiplier));
        for (let i = 0; i < n; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const speed = 6 + Math.random() * 10;
            this.sparkPool.emit(
                position.x, position.y, position.z,
                Math.sin(phi) * Math.cos(theta) * speed,
                Math.sin(phi) * Math.sin(theta) * speed * 0.5 + 2,
                Math.cos(phi) * speed,
                violetColors[Math.floor(Math.random() * violetColors.length)],
                0.08 + Math.random() * 0.06, 0.3 + Math.random() * 0.4
            );
        }
        this.addTemporaryLight(position, 0x8844ff, 35, 0.3);
    }

    emitIceTrail(position, count = 5) {
        const iceColors = [0x88ccff, 0xaaddff, 0xccf0ff];
        const n = Math.max(1, Math.floor(count * this.qualityMultiplier));
        for (let i = 0; i < n; i++) {
            this.emberPool.emit(
                position.x + (Math.random() - 0.5) * 0.6, position.y + (Math.random() - 0.5) * 0.4, position.z + (Math.random() - 0.5) * 0.6,
                (Math.random() - 0.5) * 0.6, -0.6 - Math.random() * 1.8, (Math.random() - 0.5) * 0.6,
                iceColors[Math.floor(Math.random() * iceColors.length)],
                0.025 + Math.random() * 0.03, 0.7 + Math.random() * 0.7
            );
        }
    }

    // ─── Shield Aura (individual meshes — complex orbit) ────────

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

    // ─── Quality ────────────────────────────────────────────────

    setQuality(quality) {
        this.qualityMultiplier = ({ low: 0.3, medium: 0.7, high: 1.0 })[quality] || 0.7;
    }

    // ─── Main update ────────────────────────────────────────────

    update(deltaTime) {
        // Update instanced pools (spark, ember, heal)
        this._updateSparkPool(deltaTime);
        this._updateEmberPool(deltaTime);
        this._updateHealPool(deltaTime);

        // Update individual smoke particles
        let writeIdx = 0;
        for (let i = 0; i < this.activeParticles.length; i++) {
            const p = this.activeParticles[i];
            const d = p.userData;
            d.lifetime += deltaTime;

            if (d.lifetime >= d.maxLifetime) {
                p.material.blending = THREE.NormalBlending;
                p.material.depthWrite = true;
                p.scale.setScalar(1);
                p.visible = false;
                d.active = false;
                continue;
            }

            const v = d.velocity;
            p.position.x += v.x * deltaTime;
            p.position.y += v.y * deltaTime;
            p.position.z += v.z * deltaTime;

            const lifeRatio = d.lifetime / d.maxLifetime;
            const rem = 1 - lifeRatio;
            const fadeAlpha = rem * rem * rem; // (1-t)^3

            v.x *= 0.97;
            v.y *= 0.97;
            v.z *= 0.97;
            p.scale.addScalar(deltaTime * 0.7);
            p.material.opacity = 0.55 * fadeAlpha;

            this.activeParticles[writeIdx++] = p;
        }
        this.activeParticles.length = writeIdx;

        // Update pooled temporary lights
        for (let i = this._activeLights.length - 1; i >= 0; i--) {
            const e = this._activeLights[i];
            e.remaining -= deltaTime;
            if (e.remaining <= 0) {
                e.light.visible = false;
                e.light.intensity = 0;
                this._lightPool.push(e.light);
                this._activeLights.splice(i, 1);
            } else {
                const t = e.remaining / e.duration;
                // easeOut: 1 - (1-t)^2
                e.light.intensity = e.initialIntensity * (1 - (1 - t) * (1 - t));
            }
        }
    }

    // ─── Instanced pool update — spark ──────────────────────────

    _updateSparkPool(dt) {
        const pool = this.sparkPool;
        let write = 0;
        for (let read = 0; read < pool.count; read++) {
            pool.life[read] += dt;
            if (pool.life[read] >= pool.maxLife[read]) continue;

            // Physics: strong gravity
            pool.vy[read] -= 12 * dt;
            pool.px[read] += pool.vx[read] * dt;
            pool.py[read] += pool.vy[read] * dt;
            pool.pz[read] += pool.vz[read] * dt;

            if (write !== read) {
                pool.px[write] = pool.px[read]; pool.py[write] = pool.py[read]; pool.pz[write] = pool.pz[read];
                pool.vx[write] = pool.vx[read]; pool.vy[write] = pool.vy[read]; pool.vz[write] = pool.vz[read];
                pool.cr[write] = pool.cr[read]; pool.cg[write] = pool.cg[read]; pool.cb[write] = pool.cb[read];
                pool.baseScale[write] = pool.baseScale[read];
                pool.life[write] = pool.life[read]; pool.maxLife[write] = pool.maxLife[read];
            }
            write++;
        }
        pool.count = write;
        this._syncPoolToGPU(pool, 'spark');
    }

    // ─── Instanced pool update — ember ──────────────────────────

    _updateEmberPool(dt) {
        const pool = this.emberPool;
        let write = 0;
        for (let read = 0; read < pool.count; read++) {
            pool.life[read] += dt;
            if (pool.life[read] >= pool.maxLife[read]) continue;

            // Physics: weak gravity
            pool.vy[read] -= 0.6 * dt;
            pool.px[read] += pool.vx[read] * dt;
            pool.py[read] += pool.vy[read] * dt;
            pool.pz[read] += pool.vz[read] * dt;

            if (write !== read) {
                pool.px[write] = pool.px[read]; pool.py[write] = pool.py[read]; pool.pz[write] = pool.pz[read];
                pool.vx[write] = pool.vx[read]; pool.vy[write] = pool.vy[read]; pool.vz[write] = pool.vz[read];
                pool.cr[write] = pool.cr[read]; pool.cg[write] = pool.cg[read]; pool.cb[write] = pool.cb[read];
                pool.baseScale[write] = pool.baseScale[read];
                pool.life[write] = pool.life[read]; pool.maxLife[write] = pool.maxLife[read];
            }
            write++;
        }
        pool.count = write;
        this._syncPoolToGPU(pool, 'ember');
    }

    // ─── Instanced pool update — heal ───────────────────────────

    _updateHealPool(dt) {
        const pool = this.healPool;
        let write = 0;
        for (let read = 0; read < pool.count; read++) {
            pool.life[read] += dt;
            if (pool.life[read] >= pool.maxLife[read]) continue;

            // Physics: velocity decay
            pool.vy[read] *= 0.96;
            pool.px[read] += pool.vx[read] * dt;
            pool.py[read] += pool.vy[read] * dt;
            pool.pz[read] += pool.vz[read] * dt;

            if (write !== read) {
                pool.px[write] = pool.px[read]; pool.py[write] = pool.py[read]; pool.pz[write] = pool.pz[read];
                pool.vx[write] = pool.vx[read]; pool.vy[write] = pool.vy[read]; pool.vz[write] = pool.vz[read];
                pool.cr[write] = pool.cr[read]; pool.cg[write] = pool.cg[read]; pool.cb[write] = pool.cb[read];
                pool.baseScale[write] = pool.baseScale[read];
                pool.life[write] = pool.life[read]; pool.maxLife[write] = pool.maxLife[read];
            }
            write++;
        }
        pool.count = write;
        this._syncPoolToGPU(pool, 'heal');
    }

    // ─── GPU sync: write instanceMatrix + instanceColor ─────────

    _syncPoolToGPU(pool, type) {
        const n = pool.count;
        if (n === 0) { pool.mesh.count = 0; return; }

        const matArr = pool.mesh.instanceMatrix.array;
        const colArr = pool.mesh.instanceColor.array;

        for (let i = 0; i < n; i++) {
            const lifeRatio = pool.life[i] / pool.maxLife[i];
            const rem = 1 - lifeRatio;
            const fadeAlpha = rem * rem * rem; // (1-t)^3

            let eff, s;
            if (type === 'spark') {
                eff = fadeAlpha;
                s = pool.baseScale[i] * Math.max(0.1, 1 - lifeRatio * 0.6);
            } else if (type === 'ember') {
                const pulse = 0.7 + 0.3 * Math.sin(pool.life[i] * 12 + i * 0.5);
                eff = fadeAlpha * pulse;
                s = pool.baseScale[i];
            } else { // heal
                eff = 0.95 * fadeAlpha;
                s = pool.baseScale[i];
            }

            // instanceColor = baseColor * effectiveOpacity (additive blending trick)
            const ci = i * 3;
            colArr[ci]     = pool.cr[i] * eff;
            colArr[ci + 1] = pool.cg[i] * eff;
            colArr[ci + 2] = pool.cb[i] * eff;

            // instanceMatrix: scale + position (column-major)
            const off = i * 16;
            matArr[off]     = s; matArr[off + 1] = 0; matArr[off + 2]  = 0; matArr[off + 3]  = 0;
            matArr[off + 4] = 0; matArr[off + 5] = s; matArr[off + 6]  = 0; matArr[off + 7]  = 0;
            matArr[off + 8] = 0; matArr[off + 9] = 0; matArr[off + 10] = s; matArr[off + 11] = 0;
            matArr[off + 12] = pool.px[i]; matArr[off + 13] = pool.py[i]; matArr[off + 14] = pool.pz[i]; matArr[off + 15] = 1;
        }

        pool.mesh.count = n;
        pool.mesh.instanceMatrix.needsUpdate = true;
        pool.mesh.instanceColor.needsUpdate = true;
    }

    // ─── Clear all ──────────────────────────────────────────────

    clear() {
        this.sparkPool.clear();
        this.emberPool.clear();
        this.healPool.clear();
        for (const p of this.activeParticles) { p.visible = false; p.userData.active = false; }
        this.activeParticles.length = 0;
        for (const p of this.activeShieldAuraParticles) { p.visible = false; p.userData.active = false; this.pools.shieldAura.push(p); }
        this.activeShieldAuraParticles = [];
    }
}
