/**
 * Lighting System - Cinematic high-contrast arena lighting
 * Optimized: 4 lights (was 6) — fill + kicker baked into hemisphere
 * Supports per-floor color themes via setFloorTheme().
 */

import * as THREE from 'three';

// Per-floor lighting presets — dark cinematic palette
const FLOOR_LIGHTING = [
    { sky: 0x1a2230, ground: 0x0a0808, key: 0x7090cc, rim: 0x8070aa }, // 0: default cool
    { sky: 0x141e3a, ground: 0x080c14, key: 0x5588bb, rim: 0x6677aa }, // 1: cold blue
    { sky: 0x2a1e14, ground: 0x100a04, key: 0xcc9960, rim: 0xbb7744 }, // 2: amber forge
    { sky: 0x28101a, ground: 0x0e0404, key: 0xcc5555, rim: 0xaa4444 }, // 3: crimson
    { sky: 0x18102a, ground: 0x06040c, key: 0x8866bb, rim: 0x7755aa }, // 4+: void purple
];

export class LightingSystem {
    constructor(scene) {
        this.scene = scene;
        this.torchLights = [];
        this.shadowResolution = 256;

        this.setupMainLights();
    }

    setupMainLights() {
        // Hemisphere: dark ground, muted sky — low fill for cinematic shadows
        this.hemisphereLight = new THREE.HemisphereLight(0x1a2230, 0x0a0808, 0.55);
        this.scene.add(this.hemisphereLight);

        // Key light — lower intensity for dramatic contrast, only shadow caster
        this.keyLight = new THREE.DirectionalLight(0x7090cc, 1.6);
        this.keyLight.position.set(5, 14, -7);
        this.keyLight.castShadow = true;
        this.keyLight.shadow.mapSize.width = this.shadowResolution;
        this.keyLight.shadow.mapSize.height = this.shadowResolution;
        this.keyLight.shadow.camera.near = 0.5;
        this.keyLight.shadow.camera.far = 60;
        this.keyLight.shadow.camera.left = -25;
        this.keyLight.shadow.camera.right = 25;
        this.keyLight.shadow.camera.top = 25;
        this.keyLight.shadow.camera.bottom = -25;
        this.keyLight.shadow.bias = -0.0003;
        this.keyLight.shadow.normalBias = 0.02;
        this.scene.add(this.keyLight);

        // Rim light — muted for silhouette pop without washing out
        this.rimLight = new THREE.DirectionalLight(0x8070aa, 0.35);
        this.rimLight.position.set(-12, 8, -10);
        this.scene.add(this.rimLight);

        // Top-down — dim for readability without flattening
        this.topLight = new THREE.DirectionalLight(0xcccccc, 0.3);
        this.topLight.position.set(0.5, 15, 0.5);
        this.topLight.castShadow = false;
        this.scene.add(this.topLight);
    }

    /** Shift lighting colors to match current tower floor. */
    setFloorTheme(floorNumber) {
        const i = Math.min(floorNumber, FLOOR_LIGHTING.length - 1);
        const preset = FLOOR_LIGHTING[i];
        this.hemisphereLight.color.setHex(preset.sky);
        this.hemisphereLight.groundColor.setHex(preset.ground);
        this.keyLight.color.setHex(preset.key);
        if (this.rimLight) this.rimLight.color.setHex(preset.rim);
    }

    update(deltaTime, elapsedTime) {}

    updateShadowResolution(resolution) {
        this.shadowResolution = resolution;
        this.keyLight.shadow.mapSize.width = resolution;
        this.keyLight.shadow.mapSize.height = resolution;
        this.keyLight.shadow.map?.dispose();
        this.keyLight.shadow.map = null;
    }

    setShadowsEnabled(enabled) {
        this.keyLight.castShadow = enabled;
        if (this.topLight) this.topLight.castShadow = enabled;
    }

    setBrightness(multiplier) {
        this.hemisphereLight.intensity = 0.55 * multiplier;
        this.keyLight.intensity = 1.6 * multiplier;
        if (this.rimLight) this.rimLight.intensity = 0.35 * multiplier;
        if (this.topLight) this.topLight.intensity = 0.3 * multiplier;
    }
}
