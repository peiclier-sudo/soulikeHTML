/**
 * Lighting System - Cinematic high-contrast arena lighting
 * Optimized: 4 lights (was 6) — fill + kicker baked into hemisphere
 */

import * as THREE from 'three';

export class LightingSystem {
    constructor(scene) {
        this.scene = scene;
        this.torchLights = [];
        this.shadowResolution = 256;

        this.setupMainLights();
    }

    setupMainLights() {
        // Hemisphere replaces ambient + fill + kicker: warm ground, cool sky
        this.hemisphereLight = new THREE.HemisphereLight(0x3a4462, 0x1a1510, 0.7);
        this.scene.add(this.hemisphereLight);

        // Strong cool key — main dramatic source, only shadow caster
        this.keyLight = new THREE.DirectionalLight(0xb0c8ff, 1.85);
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
        this.rimLight = new THREE.DirectionalLight(0xc8b8ff, 0.48);
        this.rimLight.position.set(-12, 8, -10);
        this.scene.add(this.rimLight);

        // Top-down white for readability, no shadow
        this.topLight = new THREE.DirectionalLight(0xffffff, 0.55);
        this.topLight.position.set(0.5, 15, 0.5);
        this.topLight.castShadow = false;
        this.scene.add(this.topLight);
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
        this.hemisphereLight.intensity = 0.7 * multiplier;
        this.keyLight.intensity = 1.85 * multiplier;
        if (this.rimLight) this.rimLight.intensity = 0.48 * multiplier;
        if (this.topLight) this.topLight.intensity = 0.55 * multiplier;
    }
}
