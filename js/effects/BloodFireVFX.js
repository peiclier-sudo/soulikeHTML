/**
 * BloodFire VFX – trail, flickering light, embers, spiral rotation.
 * Vanilla Three.js; wire into CombatSystem spawnFireball / updateProjectiles / disposeProjectile.
 */

import * as THREE from 'three';

const MAX_TRAIL_POINTS = 12;
const EMBER_COUNT = 24;
const SPIRAL_SPEED = 7.5;

/**
 * @param {THREE.Scene} scene
 * @param {THREE.Group} projectileGroup – fireball group (light + embers added here)
 * @param {{ isCharged?: boolean }} opts
 * @returns {{ update: (dt: number, worldPos: THREE.Vector3, velocity: THREE.Vector3, lifetime: number, maxLifetime: number) => void, dispose: () => void }}
 */
export function createBloodFireVFX(scene, projectileGroup, opts = {}) {
    const isCharged = !!opts.isCharged;

    // —— Trail (world-space): ring buffer of positions, fading by age
    const trailPositions = new Float32Array(MAX_TRAIL_POINTS * 3);
    const trailColors = new Float32Array(MAX_TRAIL_POINTS * 3);
    let trailCount = 0;
    let trailHead = 0;

    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    trailGeo.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
    const trailMat = new THREE.PointsMaterial({
        size: isCharged ? 0.32 : 0.14,
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        sizeAttenuation: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
    const trailMesh = new THREE.Points(trailGeo, trailMat);
    trailMesh.frustumCulled = false;
    scene.add(trailMesh);

    // Blood trail colors (bright blood → dark red → black)
    const colorCrimson = new THREE.Color(0xcc0c0c);
    const colorOrange = new THREE.Color(0x880808);
    const colorDark = new THREE.Color(0x2a0808);

    // —— Flickering PointLight on the projectile (bleed stack color)
    const light = new THREE.PointLight(0xaa0a0a, isCharged ? 0.8 : 0.5, isCharged ? 8 : 5, 1.5);
    light.position.set(0, 0, 0);
    projectileGroup.add(light);

    // —— Ember/spark cloud (parented to projectile)
    const emberPositions = new Float32Array(EMBER_COUNT * 3);
    const emberRand = new Float32Array(EMBER_COUNT);
    const emberRadius = isCharged ? 0.7 : 0.5;
    for (let i = 0; i < EMBER_COUNT; i++) {
        const r = 0.15 + Math.random() * emberRadius;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        emberPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        emberPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        emberPositions[i * 3 + 2] = r * Math.cos(phi);
        emberRand[i] = Math.random();
    }
    const emberGeo = new THREE.BufferGeometry();
    emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPositions, 3));
    const emberMat = new THREE.PointsMaterial({
        size: isCharged ? 0.09 : 0.06,
        color: 0xaa0a0a,
        transparent: true,
        opacity: 0.9,
        sizeAttenuation: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
    const embersMesh = new THREE.Points(emberGeo, emberMat);
    embersMesh.frustumCulled = false;
    projectileGroup.add(embersMesh);

    let spiralAngle = 0;
    let prevSpiralAngle = 0;

    function reset() {
        trailCount = 0;
        trailHead = 0;
        spiralAngle = 0;
        prevSpiralAngle = 0;
        emberMat.opacity = 0.9;
        trailMesh.visible = false; // hide trail immediately when projectile is pooled/disposed so it doesn’t linger
    }

    function update(dt, worldPos, velocity, lifetime, maxLifetime) {
        trailMesh.visible = true; // show trail while projectile is active
        const lifePct = 1.0 - lifetime / maxLifetime;
        spiralAngle += dt * SPIRAL_SPEED * (isCharged ? 1.2 : 1);

        // Trail: add current world position, trim to ring buffer
        trailPositions[trailHead * 3] = worldPos.x;
        trailPositions[trailHead * 3 + 1] = worldPos.y;
        trailPositions[trailHead * 3 + 2] = worldPos.z;
        trailHead = (trailHead + 1) % MAX_TRAIL_POINTS;
        if (trailCount < MAX_TRAIL_POINTS) trailCount++;
        // Color by age: newest = crimson, oldest = black-red
        const n = trailCount;
        for (let i = 0; i < n; i++) {
            const idx = (trailHead - 1 - i + MAX_TRAIL_POINTS) % MAX_TRAIL_POINTS;
            const t = i / Math.max(n, 1);
            colorCrimson.lerpColors(colorOrange, colorDark, t);
            trailColors[idx * 3] = colorCrimson.r;
            trailColors[idx * 3 + 1] = colorCrimson.g;
            trailColors[idx * 3 + 2] = colorCrimson.b;
        }
        trailGeo.getAttribute('position').needsUpdate = true;
        trailGeo.getAttribute('color').needsUpdate = true;

        // Light: flicker intensity and color
        const flicker = 0.85 + 0.25 * Math.sin(lifetime * 35) * Math.cos(lifetime * 17);
        light.intensity = (isCharged ? 1.5 : 1.0) * flicker;
        light.color.setHSL(0.03 - 0.01 * Math.sin(lifetime * 23), 1, 0.55);

        // Embers: slight rotation and opacity by life
        embersMesh.rotation.y += dt * 2;
        embersMesh.rotation.x += dt * 0.5;
        emberMat.opacity = 0.85 * lifePct;

    }

    /** Caller should rotate projectile group by (spiralAngle - prevSpiralAngle) around velocity axis each frame. */
    function getSpiralDelta() {
        const delta = spiralAngle - prevSpiralAngle;
        prevSpiralAngle = spiralAngle;
        return delta;
    }

    function dispose() {
        scene.remove(trailMesh);
        trailGeo.dispose();
        trailMat.dispose();
        projectileGroup.remove(light);
        projectileGroup.remove(embersMesh);
        emberGeo.dispose();
        emberMat.dispose();
    }

    return {
        update,
        dispose,
        getSpiralDelta,
        reset
    };
}
