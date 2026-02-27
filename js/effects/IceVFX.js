/**
 * Ice VFX - Per-projectile visual effects for Frost Mage attacks.
 * Frost trail, snowflake embers, cold point light, ice shard spiral.
 */

import * as THREE from 'three';
import { createIceMaterial, updateIceMaterial } from '../shaders/IceShader.js';

const MAX_TRAIL_POINTS = 16;
const EMBER_COUNT = 24;
const SPIRAL_SPEED = 6.0;

const ICE_COLORS = [
    new THREE.Color(0x88ccff),
    new THREE.Color(0x44aaff),
    new THREE.Color(0xaaddff),
    new THREE.Color(0x66bbff),
    new THREE.Color(0xccf0ff),
    new THREE.Color(0xffffff)
];

/**
 * Create ice VFX for a frost projectile.
 * @param {THREE.Scene} scene
 * @param {THREE.Group} projectileGroup - the projectile mesh group
 * @param {{ isCharged?: boolean }} opts
 */
export function createIceVFX(scene, projectileGroup, opts = {}) {
    const isCharged = !!opts.isCharged;

    // ── Trail (world-space ring buffer of ice crystal points) ──
    const trailSize = isCharged ? 0.28 : 0.12;
    const trailPositions = new Float32Array(MAX_TRAIL_POINTS * 3);
    const trailColors = new Float32Array(MAX_TRAIL_POINTS * 3);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    trailGeo.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
    const trailMat = new THREE.PointsMaterial({
        size: trailSize,
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
    const trailMesh = new THREE.Points(trailGeo, trailMat);
    trailMesh.frustumCulled = false;
    trailMesh.visible = false;
    scene.add(trailMesh);

    let trailHead = 0;
    let trailCount = 0;

    // ── Point light (cold blue flicker) ──
    const lightColor = 0x66bbff;
    const lightIntensity = isCharged ? 12 : 6;
    const lightDist = isCharged ? 16 : 9;
    const light = new THREE.PointLight(lightColor, lightIntensity, lightDist, 2);
    projectileGroup.add(light);

    // ── Frost ember cloud (snowflake particles orbiting projectile) ──
    const emberRadius = isCharged ? 0.65 : 0.45;
    const emberSize = isCharged ? 0.07 : 0.04;
    const emberPositions = new Float32Array(EMBER_COUNT * 3);
    const emberColors = new Float32Array(EMBER_COUNT * 3);
    for (let i = 0; i < EMBER_COUNT; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = emberRadius * (0.6 + Math.random() * 0.4);
        emberPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        emberPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        emberPositions[i * 3 + 2] = r * Math.cos(phi);
        const c = ICE_COLORS[Math.floor(Math.random() * ICE_COLORS.length)];
        emberColors[i * 3] = c.r;
        emberColors[i * 3 + 1] = c.g;
        emberColors[i * 3 + 2] = c.b;
    }
    const emberGeo = new THREE.BufferGeometry();
    emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPositions, 3));
    emberGeo.setAttribute('color', new THREE.BufferAttribute(emberColors, 3));
    const emberMat = new THREE.PointsMaterial({
        size: emberSize,
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
    const emberMesh = new THREE.Points(emberGeo, emberMat);
    emberMesh.frustumCulled = false;
    projectileGroup.add(emberMesh);

    // ── Spiral tracking ──
    let spiralAngle = 0;
    let lastSpiralAngle = 0;
    const spiralMul = isCharged ? 1.3 : 1.0;

    // ── Color helpers ──
    const _trailColor = new THREE.Color();
    const _iceBlue = new THREE.Color(0x66bbff);
    const _deepBlue = new THREE.Color(0x0a1a3a);
    let _frameTick = 0;

    function update(dt, worldPos, velocity, lifetime, maxLifetime) {
        _frameTick++;
        // Trail position - update every frame for smooth movement
        trailPositions[trailHead * 3] = worldPos.x;
        trailPositions[trailHead * 3 + 1] = worldPos.y;
        trailPositions[trailHead * 3 + 2] = worldPos.z;
        trailHead = (trailHead + 1) % MAX_TRAIL_POINTS;
        if (trailCount < MAX_TRAIL_POINTS) trailCount++;
        trailGeo.attributes.position.needsUpdate = true;

        // Update trail colors every 3rd frame (visual diff is negligible)
        if (_frameTick % 3 === 0) {
            for (let i = 0; i < MAX_TRAIL_POINTS; i++) {
                const age = (trailHead - 1 - i + MAX_TRAIL_POINTS) % MAX_TRAIL_POINTS;
                const t = i < trailCount ? age / Math.max(1, trailCount - 1) : 1;
                _trailColor.copy(_iceBlue).lerp(_deepBlue, t);
                trailColors[i * 3] = _trailColor.r;
                trailColors[i * 3 + 1] = _trailColor.g;
                trailColors[i * 3 + 2] = _trailColor.b;
            }
            trailGeo.attributes.color.needsUpdate = true;
        }
        trailMesh.visible = trailCount > 1;

        // Light flicker
        const lifePct = 1 - lifetime / maxLifetime;
        const flicker = 0.85 + 0.15 * Math.sin(lifetime * 18) * Math.cos(lifetime * 11);
        light.intensity = lightIntensity * lifePct * flicker;

        // Ember rotation and fade
        emberMesh.rotation.y += dt * 2.5 * spiralMul;
        emberMesh.rotation.x += dt * 1.2;
        emberMat.opacity = 0.7 * lifePct;

        // Spiral
        spiralAngle += dt * SPIRAL_SPEED * spiralMul;
    }

    function getSpiralDelta() {
        const delta = spiralAngle - lastSpiralAngle;
        lastSpiralAngle = spiralAngle;
        return delta;
    }

    function dispose() {
        scene.remove(trailMesh);
        trailGeo.dispose();
        trailMat.dispose();
        projectileGroup.remove(light);
        light.dispose();
        projectileGroup.remove(emberMesh);
        emberGeo.dispose();
        emberMat.dispose();
    }

    function reset() {
        trailHead = 0;
        trailCount = 0;
        trailMesh.visible = false;
        spiralAngle = 0;
        lastSpiralAngle = 0;
        emberMat.opacity = 0.8;
        for (let i = 0; i < MAX_TRAIL_POINTS * 3; i++) trailPositions[i] = 0;
        trailGeo.attributes.position.needsUpdate = true;
    }

    return { update, dispose, getSpiralDelta, reset };
}
