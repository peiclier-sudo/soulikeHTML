/**
 * Lighting System - Cinematic high-contrast arena lighting
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
        // Low ambient keeps deep blacks intact.
        this.ambientLight = new THREE.AmbientLight(0x1a1e2e, 0.45);
        this.scene.add(this.ambientLight);

        // Strong cool key — main dramatic source, slightly off-center (reduced so models aren’t too bright).
        this.keyLight = new THREE.DirectionalLight(0xb0c8ff, 1.85);
        this.keyLight.position.set(5, 14, -7);
        this.keyLight.castShadow = true;
        this.keyLight.shadow.mapSize.width = this.shadowResolution;
        this.keyLight.shadow.mapSize.height = this.shadowResolution;
        this.keyLight.shadow.camera.near = 0.5;
        this.keyLight.shadow.camera.far = 40;
        this.keyLight.shadow.camera.left = -26;
        this.keyLight.shadow.camera.right = 26;
        this.keyLight.shadow.camera.top = 26;
        this.keyLight.shadow.camera.bottom = -26;
        this.keyLight.shadow.bias = -0.0003;
        this.keyLight.shadow.normalBias = 0.02;
        this.scene.add(this.keyLight);

        // Warm subtle fill from opposite side for color depth.
        this.fillLight = new THREE.DirectionalLight(0x7a5540, 0.28);
        this.fillLight.position.set(-8, 5, 9);
        this.scene.add(this.fillLight);

        // Low hemisphere for ambient body — keeps floor readable without washing out.
        this.hemisphereLight = new THREE.HemisphereLight(0x3a4462, 0x0a0e1a, 0.42);
        this.scene.add(this.hemisphereLight);

        // Purple-white rim for silhouette (reduced to avoid overly bright models).
        this.rimLight = new THREE.DirectionalLight(0xc8b8ff, 0.48);
        this.rimLight.position.set(-12, 8, -10);
        this.scene.add(this.rimLight);

        // Top-down white directional for clean model shadows on the floor.
        this.topLight = new THREE.DirectionalLight(0xffffff, 0.55);
        this.topLight.position.set(0.5, 15, 0.5);
        this.topLight.castShadow = true;
        this.topLight.shadow.mapSize.width = 512;
        this.topLight.shadow.mapSize.height = 512;
        this.topLight.shadow.camera.near = 0.5;
        this.topLight.shadow.camera.far = 40;
        this.topLight.shadow.camera.left = -20;
        this.topLight.shadow.camera.right = 20;
        this.topLight.shadow.camera.top = 20;
        this.topLight.shadow.camera.bottom = -20;
        this.topLight.shadow.bias = -0.0002;
        this.topLight.shadow.normalBias = 0.02;
        this.scene.add(this.topLight);

        // Subtle cool kicker from behind camera to lift dark faces just enough.
        this.kickerLight = new THREE.DirectionalLight(0x8898c0, 0.2);
        this.kickerLight.position.set(0, 3, 12);
        this.scene.add(this.kickerLight);
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
        this.ambientLight.intensity = 0.45 * multiplier;
        this.keyLight.intensity = 1.85 * multiplier;
        this.fillLight.intensity = 0.28 * multiplier;
        if (this.rimLight) this.rimLight.intensity = 0.48 * multiplier;
        if (this.topLight) this.topLight.intensity = 0.55 * multiplier;
        if (this.kickerLight) this.kickerLight.intensity = 0.2 * multiplier;
    }
}
