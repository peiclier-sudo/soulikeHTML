/**
 * Arena Hazards — environmental danger zones that spawn during boss fights.
 * Flame geysers erupt from the floor, telegraphed by a pulsing ring,
 * then deal DOT to the player while standing inside.
 * Frequency and count scale with floor number for rising pressure.
 */

import * as THREE from 'three';

const MAX_GEYSERS = 6;
const GEYSER_RADIUS = 3.0;
const TELEGRAPH_TIME = 1.5;
const ACTIVE_TIME = 3.5;
const FADE_TIME = 0.5;
const DAMAGE = 10;
const DAMAGE_INTERVAL = 0.5;

// Spawn interval (seconds) per floor — gets tighter as you climb
const FLOOR_INTERVALS = [12, 9, 7, 5.5, 4.5];
// Max concurrent geysers per floor
const FLOOR_MAX_CONCURRENT = [1, 2, 2, 3, 4];

export class ArenaHazards {
    constructor(scene, particleSystem) {
        this.scene = scene;
        this.particleSystem = particleSystem;
        this.floorNumber = 0;
        this.arenaBoundary = 16;
        this.spawnTimer = 6;
        this._tmpPos = new THREE.Vector3();

        // Shared geometry (ring + inner disc)
        const ringGeo = new THREE.RingGeometry(0.5, 1.0, 28);
        const discGeo = new THREE.CircleGeometry(1.0, 28);

        this.geysers = [];
        for (let i = 0; i < MAX_GEYSERS; i++) {
            const ringMat = new THREE.MeshBasicMaterial({
                color: 0xff4400, transparent: true, opacity: 0,
                side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false
            });
            const ringMesh = new THREE.Mesh(ringGeo, ringMat);
            ringMesh.rotation.x = -Math.PI / 2;
            ringMesh.visible = false;
            scene.add(ringMesh);

            const discMat = new THREE.MeshBasicMaterial({
                color: 0xff2200, transparent: true, opacity: 0,
                side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false
            });
            const discMesh = new THREE.Mesh(discGeo, discMat);
            discMesh.rotation.x = -Math.PI / 2;
            discMesh.visible = false;
            scene.add(discMesh);

            this.geysers.push({
                ringMesh, ringMat, discMesh, discMat,
                phase: 'idle', timer: 0, damageTimer: 0,
                x: 0, z: 0
            });
        }
    }

    setFloor(floorNumber, boundary) {
        this.floorNumber = floorNumber;
        this.arenaBoundary = boundary || 16;
        this.clear();
        this.spawnTimer = 4 + Math.random() * 3;
    }

    _interval() {
        const i = Math.min(this.floorNumber, FLOOR_INTERVALS.length - 1);
        return FLOOR_INTERVALS[i];
    }

    _maxConcurrent() {
        const i = Math.min(this.floorNumber, FLOOR_MAX_CONCURRENT.length - 1);
        return FLOOR_MAX_CONCURRENT[i];
    }

    _spawn(playerPos) {
        let geyser = null;
        for (const g of this.geysers) { if (g.phase === 'idle') { geyser = g; break; } }
        if (!geyser) return;

        const b = this.arenaBoundary - GEYSER_RADIUS - 1;
        // Avoid spawning directly on top of the player
        for (let attempt = 0; attempt < 8; attempt++) {
            geyser.x = (Math.random() - 0.5) * 2 * b;
            geyser.z = (Math.random() - 0.5) * 2 * b;
            if (!playerPos) break;
            const dx = geyser.x - playerPos.x;
            const dz = geyser.z - playerPos.z;
            if (dx * dx + dz * dz > 16) break; // at least 4 units away
        }

        geyser.phase = 'telegraph';
        geyser.timer = 0;
        geyser.damageTimer = 0;

        geyser.ringMesh.position.set(geyser.x, 0.06, geyser.z);
        geyser.ringMesh.visible = true;
        geyser.ringMesh.scale.setScalar(0.3);

        geyser.discMesh.position.set(geyser.x, 0.05, geyser.z);
        geyser.discMesh.visible = true;
        geyser.discMesh.scale.setScalar(0.3);
    }

    update(dt, playerPos, gameState) {
        // Spawn timer
        let active = 0;
        for (const g of this.geysers) { if (g.phase !== 'idle') active++; }
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0 && active < this._maxConcurrent()) {
            this._spawn(playerPos);
            this.spawnTimer = this._interval() * (0.8 + Math.random() * 0.4);
        }

        for (const g of this.geysers) {
            if (g.phase === 'idle') continue;
            g.timer += dt;

            if (g.phase === 'telegraph') {
                const t = g.timer / TELEGRAPH_TIME;
                // Pulsing ring that intensifies and grows
                const pulse = 0.5 + 0.5 * Math.sin(g.timer * (8 + t * 14));
                g.ringMat.opacity = (0.08 + t * 0.25) * pulse;
                g.ringMat.color.setHex(t > 0.65 ? 0xff2200 : 0xff6600);
                g.discMat.opacity = t * 0.1 * pulse;
                const scale = GEYSER_RADIUS * (0.3 + t * 0.7);
                g.ringMesh.scale.setScalar(scale);
                g.discMesh.scale.setScalar(scale);

                if (g.timer >= TELEGRAPH_TIME) { g.phase = 'active'; g.timer = 0; }
            } else if (g.phase === 'active') {
                const t = g.timer / ACTIVE_TIME;
                g.ringMat.opacity = 0.3 + 0.12 * Math.sin(g.timer * 8);
                g.ringMat.color.setHex(0xff3300);
                g.discMat.opacity = 0.15 + 0.08 * Math.sin(g.timer * 6);
                g.ringMesh.scale.setScalar(GEYSER_RADIUS);
                g.discMesh.scale.setScalar(GEYSER_RADIUS);
                g.ringMesh.rotation.z += dt * 0.5;

                // Fire particles
                if (this.particleSystem && Math.random() < 0.35) {
                    this._tmpPos.set(
                        g.x + (Math.random() - 0.5) * GEYSER_RADIUS * 1.6,
                        0.15,
                        g.z + (Math.random() - 0.5) * GEYSER_RADIUS * 1.6
                    );
                    this.particleSystem.emitEmbers(this._tmpPos, 1, 0xff4400);
                }
                if (this.particleSystem && Math.random() < 0.15) {
                    this._tmpPos.set(g.x, 0.1, g.z);
                    this.particleSystem.emitSparks(this._tmpPos, 3);
                }

                // Damage player if standing inside
                if (playerPos && gameState) {
                    const dx = playerPos.x - g.x;
                    const dz = playerPos.z - g.z;
                    if (dx * dx + dz * dz < GEYSER_RADIUS * GEYSER_RADIUS) {
                        g.damageTimer += dt;
                        if (g.damageTimer >= DAMAGE_INTERVAL) {
                            g.damageTimer -= DAMAGE_INTERVAL;
                            gameState.takeDamage(DAMAGE);
                        }
                    }
                }

                if (g.timer >= ACTIVE_TIME) { g.phase = 'fade'; g.timer = 0; }
            } else if (g.phase === 'fade') {
                const t = 1 - g.timer / FADE_TIME;
                g.ringMat.opacity = 0.3 * t;
                g.discMat.opacity = 0.15 * t;
                if (g.timer >= FADE_TIME) {
                    g.phase = 'idle';
                    g.ringMesh.visible = false;
                    g.discMesh.visible = false;
                }
            }
        }
    }

    clear() {
        for (const g of this.geysers) {
            g.phase = 'idle';
            g.timer = 0;
            g.ringMesh.visible = false;
            g.discMesh.visible = false;
        }
    }

    dispose() {
        for (const g of this.geysers) {
            this.scene.remove(g.ringMesh);
            this.scene.remove(g.discMesh);
            g.ringMat.dispose();
            g.discMat.dispose();
        }
        this.geysers.length = 0;
    }
}
