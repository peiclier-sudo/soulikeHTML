/**
 * Dash VFX – blood-red vortex, sparks, trail. Same pattern as BloodFireVFX.
 * Vanilla Three.js; wire into Character startDash / updateDash / update.
 */

import * as THREE from 'three';

const TRAIL_POINTS = 26;
const VORTEX_RINGS = 3;
const VORTEX_POINTS_PER_RING = 18;
const SPARK_COUNT = 56;
const FADEOUT_DURATION = 0.4;

const BLOOD_BRIGHT = 0xcc0c0c;
const BLOOD_MID = 0x880808;
const BLOOD_DARK = 0x2a0808;

/**
 * @param {THREE.Scene} scene
 * @returns {{ update: (dt: number, position: THREE.Vector3, direction: THREE.Vector3, progress: number, isDashing: boolean) => boolean, dispose: () => void }}
 * update returns true while VFX is active (keep calling); false when done and disposed.
 */
export function createDashVFX(scene) {
    let fadeOutTimer = -1;

    // —— Trail (world-space, blood red)
    const trailPositions = new Float32Array(TRAIL_POINTS * 3);
    const trailColors = new Float32Array(TRAIL_POINTS * 3);
    let trailCount = 0;
    let trailHead = 0;
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    trailGeo.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
    const trailMat = new THREE.PointsMaterial({
        size: 0.18,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        sizeAttenuation: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
    const trailMesh = new THREE.Points(trailGeo, trailMat);
    trailMesh.frustumCulled = false;
    scene.add(trailMesh);
    const colorCrimson = new THREE.Color(BLOOD_BRIGHT);
    const colorDark = new THREE.Color(BLOOD_DARK);
    const colorMid = new THREE.Color(BLOOD_MID);
    const _right = new THREE.Vector3();
    const _up = new THREE.Vector3();
    const _worldUp = new THREE.Vector3(0, 1, 0);

    // —— Vortex: rings of particles around the character, spiral
    const vortexCount = VORTEX_RINGS * VORTEX_POINTS_PER_RING;
    const vortexPositions = new Float32Array(vortexCount * 3);
    const vortexBaseAngle = new Float32Array(vortexCount);
    const vortexRing = new Float32Array(vortexCount);
    for (let r = 0; r < VORTEX_RINGS; r++) {
        for (let i = 0; i < VORTEX_POINTS_PER_RING; i++) {
            const idx = r * VORTEX_POINTS_PER_RING + i;
            vortexBaseAngle[idx] = (i / VORTEX_POINTS_PER_RING) * Math.PI * 2 + r * 0.7;
            vortexRing[idx] = r;
        }
    }
    const vortexGeo = new THREE.BufferGeometry();
    vortexGeo.setAttribute('position', new THREE.BufferAttribute(vortexPositions, 3));
    const vortexMat = new THREE.PointsMaterial({
        size: 0.12,
        color: BLOOD_BRIGHT,
        transparent: true,
        opacity: 0.85,
        sizeAttenuation: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
    const vortexMesh = new THREE.Points(vortexGeo, vortexMat);
    vortexMesh.frustumCulled = false;
    scene.add(vortexMesh);
    let vortexAngle = 0;

    // —— Sparks: burst outward from center
    const sparkPositions = new Float32Array(SPARK_COUNT * 3);
    const sparkVelocities = new Float32Array(SPARK_COUNT * 3);
    const sparkLife = new Float32Array(SPARK_COUNT);
    for (let i = 0; i < SPARK_COUNT; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const speed = 2 + Math.random() * 4;
        sparkVelocities[i * 3] = Math.sin(phi) * Math.cos(theta) * speed;
        sparkVelocities[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * speed;
        sparkVelocities[i * 3 + 2] = Math.cos(phi) * speed;
        sparkLife[i] = 0;
    }
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
    const sparkMat = new THREE.PointsMaterial({
        size: 0.08,
        color: BLOOD_BRIGHT,
        transparent: true,
        opacity: 0.95,
        sizeAttenuation: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
    const sparkMesh = new THREE.Points(sparkGeo, sparkMat);
    sparkMesh.frustumCulled = false;
    scene.add(sparkMesh);
    const sparkBasePos = new THREE.Vector3();

    function update(dt, position, direction, progress, isDashing) {
        vortexAngle += dt * 14;

        if (fadeOutTimer >= 0) {
            fadeOutTimer -= dt;
            const alpha = Math.max(0, fadeOutTimer / FADEOUT_DURATION);
            trailMat.opacity = 0.9 * alpha;
            vortexMat.opacity = 0.85 * alpha;
            sparkMat.opacity = 0.95 * alpha;
            if (fadeOutTimer <= 0) {
                dispose();
                return false;
            }
            return true;
        }

        if (isDashing) {
            // Trail: add current position
            trailPositions[trailHead * 3] = position.x;
            trailPositions[trailHead * 3 + 1] = position.y;
            trailPositions[trailHead * 3 + 2] = position.z;
            trailHead = (trailHead + 1) % TRAIL_POINTS;
            if (trailCount < TRAIL_POINTS) trailCount++;
            for (let i = 0; i < trailCount; i++) {
                const idx = (trailHead - 1 - i + TRAIL_POINTS) % TRAIL_POINTS;
                const t = i / Math.max(trailCount, 1);
                colorCrimson.lerpColors(colorMid, colorDark, t);
                trailColors[idx * 3] = colorCrimson.r;
                trailColors[idx * 3 + 1] = colorCrimson.g;
                trailColors[idx * 3 + 2] = colorCrimson.b;
            }
            trailGeo.getAttribute('position').needsUpdate = true;
            trailGeo.getAttribute('color').needsUpdate = true;

            // Vortex: rings around position, perpendicular to dash direction (reuse vectors)
            if (Math.abs(direction.y) < 0.99) {
                _right.crossVectors(direction, _worldUp).normalize();
                _up.crossVectors(_right, direction).normalize();
            } else {
                _right.set(1, 0, 0);
                _up.set(0, 0, 1);
            }
            const radius = 0.5 + progress * 0.4;
            for (let i = 0; i < vortexCount; i++) {
                const a = vortexBaseAngle[i] + vortexAngle + vortexRing[i] * 0.5;
                const r = radius * (0.6 + 0.4 * vortexRing[i] / VORTEX_RINGS);
                vortexPositions[i * 3] = position.x + _right.x * r * Math.cos(a) + _up.x * r * Math.sin(a);
                vortexPositions[i * 3 + 1] = position.y + 0.4 + _right.y * r * Math.cos(a) + _up.y * r * Math.sin(a);
                vortexPositions[i * 3 + 2] = position.z + _right.z * r * Math.cos(a) + _up.z * r * Math.sin(a);
            }
            vortexGeo.getAttribute('position').needsUpdate = true;

            // Sparks: emit from position, move outward over time
            sparkBasePos.copy(position);
            sparkBasePos.y += 0.4;
            for (let i = 0; i < SPARK_COUNT; i++) {
                sparkLife[i] = Math.min(1.2, sparkLife[i] + dt * 5);
                const life = sparkLife[i];
                sparkPositions[i * 3] = sparkBasePos.x + sparkVelocities[i * 3] * life * 0.35;
                sparkPositions[i * 3 + 1] = sparkBasePos.y + sparkVelocities[i * 3 + 1] * life * 0.35;
                sparkPositions[i * 3 + 2] = sparkBasePos.z + sparkVelocities[i * 3 + 2] * life * 0.35;
            }
            sparkGeo.getAttribute('position').needsUpdate = true;
        } else {
            fadeOutTimer = FADEOUT_DURATION;
        }
        return true;
    }

    function dispose() {
        scene.remove(trailMesh);
        trailGeo.dispose();
        trailMat.dispose();
        scene.remove(vortexMesh);
        vortexGeo.dispose();
        vortexMat.dispose();
        scene.remove(sparkMesh);
        sparkGeo.dispose();
        sparkMat.dispose();
    }

    return { update, dispose };
}
