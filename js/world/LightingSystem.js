/**
 * Lighting System - Dark enclosed arena, overhead light, moody atmosphere
 */

import * as THREE from 'three';

export class LightingSystem {
    constructor(scene) {
        this.scene = scene;
        this.torchLights = [];
        this.shadowResolution = 128;
        
        this.setupMainLights();
    }
    
    setupMainLights() {
        this.ambientLight = new THREE.AmbientLight(0x282838, 0.6);
        this.scene.add(this.ambientLight);

        this.keyLight = new THREE.DirectionalLight(0xd0d8f0, 2.4);
        this.keyLight.position.set(2, 13, -3);
        this.keyLight.castShadow = true;
        this.keyLight.shadow.mapSize.width = this.shadowResolution;
        this.keyLight.shadow.mapSize.height = this.shadowResolution;
        this.keyLight.shadow.camera.near = 0.5;
        this.keyLight.shadow.camera.far = 30;
        this.keyLight.shadow.camera.left = -22;
        this.keyLight.shadow.camera.right = 22;
        this.keyLight.shadow.camera.top = 22;
        this.keyLight.shadow.camera.bottom = -22;
        this.keyLight.shadow.bias = -0.0003;
        this.keyLight.shadow.normalBias = 0.02;
        this.scene.add(this.keyLight);

        this.fillLight = new THREE.DirectionalLight(0x606880, 0.5);
        this.fillLight.position.set(-6, 8, 10);
        this.scene.add(this.fillLight);

        this.hemisphereLight = new THREE.HemisphereLight(0x3a3a50, 0x1a1a28, 0.7);
        this.scene.add(this.hemisphereLight);
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
    }
    
    setBrightness(multiplier) {
        this.ambientLight.intensity = 0.6 * multiplier;
        this.keyLight.intensity = 2.4 * multiplier;
        this.fillLight.intensity = 0.5 * multiplier;
    }
}
