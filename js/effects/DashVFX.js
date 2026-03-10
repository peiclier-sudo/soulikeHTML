/**
 * Dash VFX – blood-red vortex, sparks, trail, and ghost afterimages.
 * Vanilla Three.js; wire into Character startDash / updateDash / update.
 */

import * as THREE from 'three';

const TRAIL_POINTS = 26;
const SPARK_COUNT = 56;
const FADEOUT_DURATION = 0.4;

// Per-kit dash color palettes: { bright, mid, dark }
const KIT_DASH_COLORS = {
    blood_mage:      { bright: 0xcc0c0c, mid: 0x880808, dark: 0x2a0808 },  // crimson red
    frost_mage:      { bright: 0x88ddff, mid: 0x44aaff, dark: 0x0a2a5a },  // ice blue
    shadow_assassin: { bright: 0x8bff7a, mid: 0x2bc95a, dark: 0x0b2a12 },  // poison green
    bow_ranger:      { bright: 0xcc88ff, mid: 0x8844ff, dark: 0x1a0a3a },  // violet
    werewolf:        { bright: 0xccddee, mid: 0x8899aa, dark: 0x2a3344 },  // moonlight silver
    bear:            { bright: 0xffcc44, mid: 0xbb8833, dark: 0x3a2810 },  // amber gold
};

const DEFAULT_COLORS = KIT_DASH_COLORS.blood_mage;

/**
 * @param {THREE.Scene} scene
 * @param {{ kitId?: string }} opts
 * @returns {{ update: (dt: number, position: THREE.Vector3, direction: THREE.Vector3, progress: number, isDashing: boolean) => boolean, dispose: () => void }}
 * update returns true while VFX is active (keep calling); false when done and disposed.
 */
export function createDashVFX(scene, opts = {}) {
    const palette = KIT_DASH_COLORS[opts.kitId] || DEFAULT_COLORS;
    const COL_BRIGHT = palette.bright;
    const COL_MID = palette.mid;
    const COL_DARK = palette.dark;
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
    const colorCrimson = new THREE.Color(COL_BRIGHT);
    const colorDark = new THREE.Color(COL_DARK);
    const colorMid = new THREE.Color(COL_MID);

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
        color: COL_BRIGHT,
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

    // —— Motion blur streak: elongated quad stretched behind the player
    const streakGeo = new THREE.PlaneGeometry(1, 1);
    const streakMat = new THREE.MeshBasicMaterial({
        color: COL_MID,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    const streakMesh = new THREE.Mesh(streakGeo, streakMat);
    streakMesh.frustumCulled = false;
    streakMesh.rotation.order = 'YXZ';
    streakMesh.visible = false;
    scene.add(streakMesh);
    const _streakDir = new THREE.Vector3();

    function update(dt, position, direction, progress, isDashing) {
        if (fadeOutTimer >= 0) {
            fadeOutTimer -= dt;
            const alpha = Math.max(0, fadeOutTimer / FADEOUT_DURATION);
            trailMat.opacity = 0.9 * alpha;
            sparkMat.opacity = 0.95 * alpha;
            streakMat.opacity = 0.2 * alpha;
            streakMesh.visible = alpha > 0.01;
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

            // Motion blur streak: stretched quad behind the player
            _streakDir.copy(direction);
            _streakDir.y = 0;
            if (_streakDir.lengthSq() > 0.0001) _streakDir.normalize();
            const streakLen = 2.5 + progress * 3.5;
            const streakWidth = 0.35 + progress * 0.15;
            streakMesh.scale.set(streakLen, streakWidth, 1);
            streakMesh.position.set(
                position.x - _streakDir.x * streakLen * 0.45,
                position.y + 0.55,
                position.z - _streakDir.z * streakLen * 0.45
            );
            streakMesh.rotation.set(-Math.PI / 2, Math.atan2(_streakDir.x, _streakDir.z), 0);
            const streakAlpha = 0.18 + progress * 0.12;
            streakMat.opacity = streakAlpha;
            streakMesh.visible = true;
        } else {
            streakMesh.visible = false;
            fadeOutTimer = FADEOUT_DURATION;
        }
        return true;
    }

    function dispose() {
        scene.remove(trailMesh);
        trailGeo.dispose();
        trailMat.dispose();
        scene.remove(sparkMesh);
        sparkGeo.dispose();
        sparkMat.dispose();
        scene.remove(streakMesh);
        streakGeo.dispose();
        streakMat.dispose();
    }

    return { update, dispose };
}
