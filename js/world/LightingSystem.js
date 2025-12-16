/**
 * Lighting System - Three-point lighting with dynamic effects
 */

import * as THREE from 'three';

export class LightingSystem {
    constructor(scene) {
        this.scene = scene;
        this.torchLights = [];
        this.shadowResolution = 1024;
        
        this.setupMainLights();
        this.setupTorches();
    }
    
    setupMainLights() {
        // Ambient light (fill) - provides base visibility
        this.ambientLight = new THREE.AmbientLight(0x4a4a6e, 0.8);
        this.scene.add(this.ambientLight);

        // Directional light (key) - main scene illumination like moonlight
        this.keyLight = new THREE.DirectionalLight(0x8899cc, 1.2);
        this.keyLight.position.set(-20, 40, 10);
        this.keyLight.castShadow = true;

        // Shadow configuration
        this.keyLight.shadow.mapSize.width = this.shadowResolution;
        this.keyLight.shadow.mapSize.height = this.shadowResolution;
        this.keyLight.shadow.camera.near = 0.5;
        this.keyLight.shadow.camera.far = 100;
        this.keyLight.shadow.camera.left = -30;
        this.keyLight.shadow.camera.right = 30;
        this.keyLight.shadow.camera.top = 30;
        this.keyLight.shadow.camera.bottom = -30;
        this.keyLight.shadow.bias = -0.0001;

        this.scene.add(this.keyLight);

        // Secondary directional light from opposite side for fill
        this.fillLight = new THREE.DirectionalLight(0x6677aa, 0.6);
        this.fillLight.position.set(15, 25, -15);
        this.scene.add(this.fillLight);

        // Rim light (back light) - edge highlight
        this.rimLight = new THREE.SpotLight(0xaabbff, 0.8);
        this.rimLight.position.set(0, 25, -25);
        this.rimLight.angle = Math.PI / 3;
        this.rimLight.penumbra = 0.5;
        this.rimLight.decay = 1.5;
        this.rimLight.distance = 80;
        this.scene.add(this.rimLight);

        // Central boss arena light - brighter
        this.arenaLight = new THREE.PointLight(0xffcc66, 1.5, 35);
        this.arenaLight.position.set(0, 10, 0);
        this.scene.add(this.arenaLight);

        // Hemisphere light for sky/ground color variation
        this.hemisphereLight = new THREE.HemisphereLight(0x6688bb, 0x443322, 0.6);
        this.scene.add(this.hemisphereLight);
    }
    
    setupTorches() {
        // Torch positions around the arena
        const torchPositions = [
            // Main arena torches
            [-6, 3, -6], [6, 3, -6],
            [-6, 3, 6], [6, 3, 6],
            // Wall torches
            [-24, 4, -15], [-24, 4, 0], [-24, 4, 15],
            [24, 4, -15], [24, 4, 0], [24, 4, 15],
            // Back wall
            [-15, 4, -24], [0, 4, -24], [15, 4, -24],
            // Entrance
            [-5, 4, 24], [5, 4, 24]
        ];
        
        torchPositions.forEach((pos, index) => {
            // Point light for torch
            const torchLight = new THREE.PointLight(0xff6622, 1.5, 10);
            torchLight.position.set(...pos);
            torchLight.castShadow = false; // Performance optimization
            
            // Store initial intensity for flickering
            torchLight.userData = {
                baseIntensity: 1.5,
                flickerSpeed: 3 + Math.random() * 2,
                flickerAmount: 0.3 + Math.random() * 0.2,
                phase: Math.random() * Math.PI * 2
            };
            
            this.scene.add(torchLight);
            this.torchLights.push(torchLight);
            
            // Add visible flame (simple cone)
            const flameGeom = new THREE.ConeGeometry(0.1, 0.3, 8);
            const flameMat = new THREE.MeshBasicMaterial({
                color: 0xff6622,
                transparent: true,
                opacity: 0.9
            });
            const flame = new THREE.Mesh(flameGeom, flameMat);
            flame.position.set(pos[0], pos[1] + 0.2, pos[2]);
            this.scene.add(flame);
            
            // Store flame reference for animation
            torchLight.userData.flame = flame;
        });
    }
    
    update(deltaTime, elapsedTime) {
        // Animate torch flickering
        this.torchLights.forEach(torch => {
            const { baseIntensity, flickerSpeed, flickerAmount, phase, flame } = torch.userData;
            
            // Perlin-like noise for natural flicker
            const noise1 = Math.sin(elapsedTime * flickerSpeed + phase);
            const noise2 = Math.sin(elapsedTime * flickerSpeed * 1.7 + phase * 2);
            const noise3 = Math.sin(elapsedTime * flickerSpeed * 0.5 + phase * 0.5);
            
            const flicker = (noise1 * 0.5 + noise2 * 0.3 + noise3 * 0.2) * flickerAmount;
            torch.intensity = baseIntensity + flicker;
            
            // Animate flame mesh
            if (flame) {
                flame.scale.y = 1 + flicker * 0.5;
                flame.rotation.y = elapsedTime * 2 + phase;
            }
        });
        
        // Subtle arena light pulse
        if (this.arenaLight) {
            this.arenaLight.intensity = 0.5 + Math.sin(elapsedTime * 0.5) * 0.1;
        }
    }
    
    updateShadowResolution(resolution) {
        this.shadowResolution = resolution;
        this.keyLight.shadow.mapSize.width = resolution;
        this.keyLight.shadow.mapSize.height = resolution;
        this.keyLight.shadow.map?.dispose();
        this.keyLight.shadow.map = null;
    }
    
    // Enable/disable shadows for performance
    setShadowsEnabled(enabled) {
        this.keyLight.castShadow = enabled;
    }
    
    // Adjust overall brightness
    setBrightness(multiplier) {
        this.ambientLight.intensity = 0.3 * multiplier;
        this.keyLight.intensity = 0.5 * multiplier;
    }
}

