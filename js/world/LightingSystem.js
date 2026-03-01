/**
 * Lighting System - Cinematic high-contrast arena lighting
 * Optimized: 4 lights (was 6) — fill + kicker baked into hemisphere
 * Supports per-floor color themes via setFloorTheme().
 */

import * as THREE from 'three';

// Per-floor lighting presets: [hemisphere sky, hemisphere ground, key color, rim color]
const FLOOR_LIGHTING = [
    { sky: 0x3a4462, ground: 0x1a1510, key: 0xb0c8ff, rim: 0xc8b8ff }, // 0: default cool
    { sky: 0x2a3a6a, ground: 0x101820, key: 0x88bbff, rim: 0x99aaff }, // 1: cold blue
    { sky: 0x5a4232, ground: 0x201408, key: 0xffcc88, rim: 0xffaa66 }, // 2: amber forge
    { sky: 0x4a2028, ground: 0x1a0808, key: 0xff8888, rim: 0xff6666 }, // 3: crimson
    { sky: 0x302050, ground: 0x0a0614, key: 0xcc99ff, rim: 0xaa77ff }, // 4+: void purple
];

export class LightingSystem {
    constructor(scene) {
        this.scene = scene;
        this.torchLights = [];
        this.shadowResolution = 256;

        this.setupMainLights();
    }

    setupMainLights() {
        // Hemisphere replaces ambient + fill + kicker: warm ground, cool sky
        this.hemisphereLight = new THREE.HemisphereLight(0x3a4462, 0x1a1510, 1.1);
        this.scene.add(this.hemisphereLight);

        // Strong cool key — main dramatic source, only shadow caster
        this.keyLight = new THREE.DirectionalLight(0xb0c8ff, 2.6);
        this.keyLight.position.set(5, 14, -7);
        this.keyLight.castShadow = true;
        this.keyLight.shadow.mapSize.width = this.shadowResolution;
        this.keyLight.shadow.mapSize.height = this.shadowResolution;
        this.keyLight.shadow.camera.near = 0.5;
        this.keyLight.shadow.camera.far = 40;
        this.keyLight.shadow.camera.left = -18;
        this.keyLight.shadow.camera.right = 18;
        this.keyLight.shadow.camera.top = 18;
        this.keyLight.shadow.camera.bottom = -18;
        this.keyLight.shadow.bias = -0.0003;
        this.keyLight.shadow.normalBias = 0.02;
        this.scene.add(this.keyLight);

        // Purple-white rim for silhouette pop
        this.rimLight = new THREE.DirectionalLight(0xc8b8ff, 0.72);
        this.rimLight.position.set(-12, 8, -10);
        this.scene.add(this.rimLight);

        // Top-down white for readability, no shadow
        this.topLight = new THREE.DirectionalLight(0xffffff, 0.85);
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
        this.hemisphereLight.intensity = 1.1 * multiplier;
        this.keyLight.intensity = 2.6 * multiplier;
        if (this.rimLight) this.rimLight.intensity = 0.72 * multiplier;
        if (this.topLight) this.topLight.intensity = 0.85 * multiplier;
    }
}
