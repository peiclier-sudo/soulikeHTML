/**
 * ArenaHazards — flame geysers that erupt from the arena floor.
 * Telegraph → Active → Fade lifecycle. Frequency scales with floor.
 */

import * as THREE from 'three';

const MAX_GEYSERS    = 6;
const RADIUS         = 3.0;
const TELEGRAPH_TIME = 1.6;
const ACTIVE_TIME    = 3.2;
const FADE_TIME      = 0.45;
const DMG            = 10;
const DMG_INTERVAL   = 0.5;

const INTERVALS      = [12, 9, 7, 5.5, 4.5];
const MAX_CONCURRENT = [1, 2, 2, 3, 4];

export class ArenaHazards {
    constructor(scene, particleSystem) {
        this.scene = scene;
        this.ps = particleSystem;
        this.floor = 0;
        this.boundary = 16;
        this.spawnTimer = 6;
        this._v = new THREE.Vector3();

        const ringGeo = new THREE.RingGeometry(0.5, 1.0, 28);
        const discGeo = new THREE.CircleGeometry(1.0, 28);

        this.geysers = [];
        for (let i = 0; i < MAX_GEYSERS; i++) {
            const rMat = new THREE.MeshBasicMaterial({
                color: 0xff4400, transparent: true, opacity: 0,
                side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false
            });
            const rMesh = new THREE.Mesh(ringGeo, rMat);
            rMesh.rotation.x = -Math.PI / 2;
            rMesh.visible = false;
            scene.add(rMesh);

            const dMat = new THREE.MeshBasicMaterial({
                color: 0xff2200, transparent: true, opacity: 0,
                side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false
            });
            const dMesh = new THREE.Mesh(discGeo, dMat);
            dMesh.rotation.x = -Math.PI / 2;
            dMesh.visible = false;
            scene.add(dMesh);

            this.geysers.push({
                rMesh, rMat, dMesh, dMat,
                phase: 'idle', timer: 0, dmgTimer: 0,
                x: 0, z: 0
            });
        }
    }

    setFloor(floorNumber, boundary) {
        this.floor = floorNumber;
        this.boundary = boundary || 16;
        this.clear();
        this.spawnTimer = 4 + Math.random() * 3;
    }

    _spawn(playerPos) {
        let g = null;
        for (const gy of this.geysers) { if (gy.phase === 'idle') { g = gy; break; } }
        if (!g) return;

        const b = this.boundary - RADIUS - 1;
        for (let a = 0; a < 8; a++) {
            g.x = (Math.random() - 0.5) * 2 * b;
            g.z = (Math.random() - 0.5) * 2 * b;
            if (!playerPos) break;
            const dx = g.x - playerPos.x, dz = g.z - playerPos.z;
            if (dx * dx + dz * dz > 16) break;
        }

        g.phase = 'telegraph';
        g.timer = 0;
        g.dmgTimer = 0;
        g.rMesh.position.set(g.x, 0.06, g.z);
        g.rMesh.visible = true;
        g.rMesh.scale.setScalar(0.3);
        g.dMesh.position.set(g.x, 0.05, g.z);
        g.dMesh.visible = true;
        g.dMesh.scale.setScalar(0.3);
    }

    update(dt, playerPos, gameState) {
        let active = 0;
        for (const g of this.geysers) if (g.phase !== 'idle') active++;

        const fi = Math.min(this.floor, INTERVALS.length - 1);
        const maxC = MAX_CONCURRENT[fi];
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0 && active < maxC) {
            this._spawn(playerPos);
            this.spawnTimer = INTERVALS[fi] * (0.8 + Math.random() * 0.4);
        }

        for (const g of this.geysers) {
            if (g.phase === 'idle') continue;
            g.timer += dt;

            if (g.phase === 'telegraph') {
                const t = g.timer / TELEGRAPH_TIME;
                const pulse = 0.5 + 0.5 * Math.sin(g.timer * (8 + t * 14));
                g.rMat.opacity = (0.1 + t * 0.3) * pulse;
                g.rMat.color.setHex(t > 0.65 ? 0xff2200 : 0xff6600);
                g.dMat.opacity = t * 0.12 * pulse;
                const s = RADIUS * (0.3 + t * 0.7);
                g.rMesh.scale.setScalar(s);
                g.dMesh.scale.setScalar(s);
                if (g.timer >= TELEGRAPH_TIME) { g.phase = 'active'; g.timer = 0; }

            } else if (g.phase === 'active') {
                g.rMat.opacity = 0.32 + 0.1 * Math.sin(g.timer * 8);
                g.rMat.color.setHex(0xff3300);
                g.dMat.opacity = 0.16 + 0.06 * Math.sin(g.timer * 6);
                g.rMesh.scale.setScalar(RADIUS);
                g.dMesh.scale.setScalar(RADIUS);
                g.rMesh.rotation.z += dt * 0.5;

                // Particles
                if (this.ps && Math.random() < 0.3) {
                    this._v.set(g.x + (Math.random() - 0.5) * RADIUS * 1.4, 0.15, g.z + (Math.random() - 0.5) * RADIUS * 1.4);
                    this.ps.emitEmbers(this._v, 1, 0xff4400);
                }

                // Damage
                if (playerPos && gameState) {
                    const dx = playerPos.x - g.x, dz = playerPos.z - g.z;
                    if (dx * dx + dz * dz < RADIUS * RADIUS) {
                        g.dmgTimer += dt;
                        if (g.dmgTimer >= DMG_INTERVAL) {
                            g.dmgTimer -= DMG_INTERVAL;
                            gameState.takeDamage(DMG);
                        }
                    }
                }
                if (g.timer >= ACTIVE_TIME) { g.phase = 'fade'; g.timer = 0; }

            } else if (g.phase === 'fade') {
                const t = 1 - g.timer / FADE_TIME;
                g.rMat.opacity = 0.32 * t;
                g.dMat.opacity = 0.16 * t;
                if (g.timer >= FADE_TIME) {
                    g.phase = 'idle';
                    g.rMesh.visible = false;
                    g.dMesh.visible = false;
                }
            }
        }
    }

    clear() {
        for (const g of this.geysers) {
            g.phase = 'idle';
            g.timer = 0;
            g.rMesh.visible = false;
            g.dMesh.visible = false;
        }
    }

    dispose() {
        for (const g of this.geysers) {
            this.scene.remove(g.rMesh);
            this.scene.remove(g.dMesh);
            g.rMat.dispose();
            g.dMat.dispose();
        }
        this.geysers.length = 0;
    }
}
