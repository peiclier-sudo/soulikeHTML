/**
 * Environment System - Creates the gothic cathedral environment
 */

import * as THREE from 'three';

export class Environment {
    constructor(scene, assetLoader) {
        this.scene = scene;
        this.assetLoader = assetLoader;
        
        // Environment objects for animation
        this.lavaPlanes = [];
        this.animatedObjects = [];
        
        // Build the environment
        this.createFloor();
        this.createWalls();
        this.createPillars();
        this.createLavaPools();
        this.createArches();
        this.createDebris();
        this.createSkybox();
    }
    
    createFloor() {
        const floorTexture = this.assetLoader.getTexture('stoneFloor');
        const normalTexture = this.assetLoader.getTexture('stoneFloorNormal');
        
        const floorMat = new THREE.MeshStandardMaterial({
            map: floorTexture,
            normalMap: normalTexture,
            roughness: 0.9,
            metalness: 0.1
        });
        
        // Main floor
        const floorGeom = new THREE.PlaneGeometry(50, 50);
        const floor = new THREE.Mesh(floorGeom, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        this.scene.add(floor);
        
        // Raised platform in center
        const platformGeom = new THREE.BoxGeometry(10, 0.5, 10);
        const platform = new THREE.Mesh(platformGeom, floorMat);
        platform.position.set(0, 0.25, 0);
        platform.receiveShadow = true;
        platform.castShadow = true;
        this.scene.add(platform);
        
        // Steps
        for (let i = 0; i < 3; i++) {
            const stepGeom = new THREE.BoxGeometry(12 - i * 0.5, 0.15, 1);
            const step = new THREE.Mesh(stepGeom, floorMat);
            step.position.set(0, 0.075 + i * 0.15, 5.5 + i * 0.5);
            step.receiveShadow = true;
            step.castShadow = true;
            this.scene.add(step);
        }
    }
    
    createWalls() {
        const wallTexture = this.assetLoader.getTexture('stoneWall');
        const normalTexture = this.assetLoader.getTexture('stoneWallNormal');
        
        const wallMat = new THREE.MeshStandardMaterial({
            map: wallTexture,
            normalMap: normalTexture,
            roughness: 0.95,
            metalness: 0.05
        });
        
        // Back wall
        const backWallGeom = new THREE.BoxGeometry(50, 15, 1);
        const backWall = new THREE.Mesh(backWallGeom, wallMat);
        backWall.position.set(0, 7.5, -25);
        backWall.receiveShadow = true;
        backWall.castShadow = true;
        this.scene.add(backWall);
        
        // Side walls
        const sideWallGeom = new THREE.BoxGeometry(1, 15, 50);
        
        const leftWall = new THREE.Mesh(sideWallGeom, wallMat);
        leftWall.position.set(-25, 7.5, 0);
        leftWall.receiveShadow = true;
        leftWall.castShadow = true;
        this.scene.add(leftWall);
        
        const rightWall = new THREE.Mesh(sideWallGeom, wallMat);
        rightWall.position.set(25, 7.5, 0);
        rightWall.receiveShadow = true;
        rightWall.castShadow = true;
        this.scene.add(rightWall);
        
        // Front wall with opening
        const frontWallLeftGeom = new THREE.BoxGeometry(20, 15, 1);
        const frontWallLeft = new THREE.Mesh(frontWallLeftGeom, wallMat);
        frontWallLeft.position.set(-15, 7.5, 25);
        this.scene.add(frontWallLeft);
        
        const frontWallRight = new THREE.Mesh(frontWallLeftGeom, wallMat);
        frontWallRight.position.set(15, 7.5, 25);
        this.scene.add(frontWallRight);
        
        // Top piece above entrance
        const topWallGeom = new THREE.BoxGeometry(10, 7, 1);
        const topWall = new THREE.Mesh(topWallGeom, wallMat);
        topWall.position.set(0, 11.5, 25);
        this.scene.add(topWall);
    }
    
    createPillars() {
        const pillarPositions = [
            [-8, 0, -8], [8, 0, -8],
            [-8, 0, 8], [8, 0, 8],
            [-15, 0, -15], [15, 0, -15],
            [-15, 0, 0], [15, 0, 0],
            [-15, 0, 15], [15, 0, 15]
        ];
        
        pillarPositions.forEach(pos => {
            const pillar = this.assetLoader.getModel('pillar');
            if (pillar) {
                pillar.position.set(...pos);
                pillar.traverse(child => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
                this.scene.add(pillar);
            }
        });
    }
    
    createLavaPools() {
        const lavaTexture = this.assetLoader.getTexture('lava');
        
        // Custom lava material with animation support
        const lavaMat = new THREE.MeshStandardMaterial({
            map: lavaTexture,
            emissive: 0xff4400,
            emissiveIntensity: 0.5,
            roughness: 0.3
        });
        
        // Create lava pools in corners
        const lavaPositions = [
            [-18, 0.01, -18, 5, 5],
            [18, 0.01, -18, 5, 5],
            [-18, 0.01, 18, 4, 4],
            [18, 0.01, 18, 4, 4]
        ];
        
        lavaPositions.forEach(([x, y, z, w, h]) => {
            const lavaGeom = new THREE.PlaneGeometry(w, h);
            const lava = new THREE.Mesh(lavaGeom, lavaMat.clone());
            lava.rotation.x = -Math.PI / 2;
            lava.position.set(x, y, z);
            this.scene.add(lava);
            this.lavaPlanes.push(lava);
            
            // Add point light for lava glow
            const lavaLight = new THREE.PointLight(0xff4400, 2, 8);
            lavaLight.position.set(x, 1, z);
            this.scene.add(lavaLight);
        });
    }

    createArches() {
        // Create arches at entrances and key positions
        const archPositions = [
            [0, 0, 25, 0],           // Front entrance
            [0, 0, -20, 0],          // Back area
            [-20, 0, 0, Math.PI/2],  // Left side
            [20, 0, 0, Math.PI/2]    // Right side
        ];

        archPositions.forEach(([x, y, z, rotation]) => {
            const arch = this.assetLoader.getModel('arch');
            if (arch) {
                arch.position.set(x, y, z);
                arch.rotation.y = rotation;
                arch.traverse(child => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
                this.scene.add(arch);
            }
        });
    }

    createDebris() {
        // Scatter debris around the arena
        const debrisPositions = [
            [-5, 0, -10],
            [7, 0, -8],
            [-12, 0, 5],
            [10, 0, 12],
            [-8, 0, 15]
        ];

        debrisPositions.forEach(pos => {
            const debris = this.assetLoader.getModel('debris');
            if (debris) {
                debris.position.set(...pos);
                debris.rotation.y = Math.random() * Math.PI * 2;
                debris.traverse(child => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
                this.scene.add(debris);
            }
        });
    }

    createSkybox() {
        // Dark atmospheric background using gradient sphere
        const skyGeom = new THREE.SphereGeometry(200, 32, 32);
        const skyMat = new THREE.ShaderMaterial({
            uniforms: {
                topColor: { value: new THREE.Color(0x0a0a15) },
                bottomColor: { value: new THREE.Color(0x1a1020) },
                offset: { value: 20 },
                exponent: { value: 0.6 }
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 topColor;
                uniform vec3 bottomColor;
                uniform float offset;
                uniform float exponent;
                varying vec3 vWorldPosition;
                void main() {
                    float h = normalize(vWorldPosition + offset).y;
                    gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
                }
            `,
            side: THREE.BackSide
        });

        const sky = new THREE.Mesh(skyGeom, skyMat);
        this.scene.add(sky);
    }

    update(deltaTime, elapsedTime) {
        // Animate lava flow
        this.lavaPlanes.forEach((lava, index) => {
            if (lava.material.map) {
                lava.material.map.offset.x = Math.sin(elapsedTime * 0.1 + index) * 0.1;
                lava.material.map.offset.y = elapsedTime * 0.05;
            }

            // Pulsing emissive
            lava.material.emissiveIntensity = 0.4 + Math.sin(elapsedTime * 2 + index) * 0.2;
        });
    }
}

