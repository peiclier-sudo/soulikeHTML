/**
 * Asset Loading Manager - Handles loading of all game assets
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

export class AssetLoader {
    constructor(onProgress) {
        this.onProgress = onProgress;
        this.assets = {
            models: {},
            textures: {},
            animations: {}
        };
        
        // Setup loaders
        this.textureLoader = new THREE.TextureLoader();
        this.gltfLoader = new GLTFLoader();
        
        // Setup DRACO decoder for compressed models
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/');
        this.gltfLoader.setDRACOLoader(dracoLoader);
        
        // Cube texture loader for environment maps
        this.cubeTextureLoader = new THREE.CubeTextureLoader();
    }
    
    async loadAll() {
        const totalSteps = 7;
        let currentStep = 0;

        const updateProgress = (message) => {
            currentStep++;
            this.onProgress(currentStep / totalSteps, message);
        };

        try {
            // Step 1: Load procedural textures
            this.onProgress(0, 'Generating textures...');
            await this.generateProceduralTextures();
            updateProgress('Textures ready');

            // Step 2: Load real character model from Three.js examples
            this.onProgress(currentStep / totalSteps, 'Summoning warrior...');
            await this.loadCharacterModel();
            updateProgress('Warrior ready');

            // Step 3: Load boss model (Boss1_3k.glb)
            this.onProgress(currentStep / totalSteps, 'Loading boss...');
            await this.loadBossModel();
            updateProgress('Boss ready');

            // Step 4: Create environment geometry
            this.onProgress(currentStep / totalSteps, 'Building environment...');
            await this.createEnvironmentAssets();
            updateProgress('Environment ready');

            // Step 5: Create weapon models
            this.onProgress(currentStep / totalSteps, 'Forging weapons...');
            await this.createWeaponAssets();
            updateProgress('Weapons ready');

            // Step 6: Generate particle textures
            this.onProgress(currentStep / totalSteps, 'Preparing effects...');
            await this.generateParticleTextures();
            updateProgress('Effects ready');

            // Step 7: Finalize
            this.onProgress(currentStep / totalSteps, 'Entering the dark world...');
            await new Promise(resolve => setTimeout(resolve, 500));
            updateProgress('Ready');

            return this.assets;

        } catch (error) {
            console.error('Asset loading failed:', error);
            throw error;
        }
    }

    /**
     * Load the integrated character model (character_3k_mage.glb) with embedded animations
     */
    async loadCharacterModel() {
        const characterUrl = './models/character_3k_mage.glb?v=20260226-1';

        try {
            const characterGltf = await this.loadGLTF(characterUrl);
            const model = characterGltf.scene;

            // User-requested upscale for the 3k mage asset.
            model.scale.setScalar(10.0);

            // Enable shadows on all meshes
            model.traverse((child) => {
                if (child.isMesh) {
                    if (child.geometry?.isBufferGeometry) {
                        // Smooth shading pass so low-poly meshes feel rounder.
                        child.geometry.computeVertexNormals();
                        if (typeof child.geometry.normalizeNormals === 'function') {
                            child.geometry.normalizeNormals();
                        }
                    }
                    child.castShadow = true;
                    child.receiveShadow = true;
                    if (child.material) {
                        const wasArrayMaterial = Array.isArray(child.material);
                        const materials = wasArrayMaterial ? child.material : [child.material];
                        child.material = materials.map((m) => {
                            const mat = m.clone();
                            // Force fully opaque, no alpha-based transparency or discard
                            mat.transparent = false;
                            mat.opacity = 1.0;
                            mat.alphaTest = 0.0;
                            if ('alphaMap' in mat) mat.alphaMap = null;
                            if ('transmission' in mat) mat.transmission = 0;
                            if ('thickness' in mat) mat.thickness = 0;
                            if ('premultipliedAlpha' in mat) mat.premultipliedAlpha = false;
                            if ('blending' in mat) mat.blending = THREE.NormalBlending;
                            if ('side' in mat) mat.side = THREE.FrontSide;
                            mat.depthWrite = true;
                            mat.depthTest = true;
                            mat.flatShading = false;
                            if ('metalness' in mat) mat.metalness = 0.02;
                            if ('roughness' in mat) mat.roughness = 0.97;
                            if ('envMapIntensity' in mat) mat.envMapIntensity = 0.0;
                            if ('specularIntensity' in mat) mat.specularIntensity = 0.05;
                            if ('clearcoat' in mat) mat.clearcoat = 0.0;
                            if ('sheen' in mat) mat.sheen = 0.0;
                            if (mat.color) mat.color.multiplyScalar(0.32);
                            if (mat.map) {
                                mat.map.premultiplyAlpha = false;
                                mat.map.needsUpdate = true;
                            }
                            mat.needsUpdate = true;
                            return mat;
                        });
                        if (!wasArrayMaterial) child.material = child.material[0];
                    }
                }
            });

            this.assets.models.character = model;

            // Use animations embedded in the character GLB
            const clips = characterGltf.animations || [];
            if (clips.length > 0) {
                console.log('Character animations:', clips.map(a => a.name));

                const animMap = {};
                clips.forEach(clip => {
                    animMap[clip.name] = clip;
                    const lower = clip.name.toLowerCase();
                    if (lower.includes('idle')) animMap['Idle'] = clip;
                    if (lower.includes('walk')) animMap['Walk'] = clip;
                    if (lower.includes('running') || lower.includes('run')) animMap['Run'] = clip;
                    if (lower.includes('fast') && lower.includes('run')) animMap['Fast running'] = clip;
                    if (lower.includes('run') && lower.includes('left')) animMap['Run left'] = clip;
                    if (lower.includes('run') && lower.includes('right')) animMap['Run right'] = clip;
                    if (lower.includes('jump')) animMap['Jump'] = clip;
                    if (lower.includes('basic') && lower.includes('attack')) animMap['Basic attack'] = clip;
                    if (lower.includes('charged') && lower.includes('attack')) animMap['Charged attack'] = clip;
                    if (lower.includes('special') && lower.includes('attack') && lower.includes('1')) animMap['Special attack 1'] = clip;
                    if (lower.includes('special') && lower.includes('attack') && lower.includes('2')) animMap['Special attack 2'] = clip;
                    if (lower.includes('special') && lower.includes('attack') && lower.includes('3')) animMap['Special attack 3'] = clip;
                    if (lower.includes('ultimate')) animMap['Ultimate'] = clip;
                    if (lower.includes('drink') || lower.includes('potion') || (lower.includes('use') && lower.includes('item')) || lower.includes('consume')) animMap['Drink'] = clip;
                    if (lower.includes('whip')) animMap['Whip'] = clip;
                    if (lower.includes('roll') || lower.includes('dodge')) animMap['Roll dodge'] = clip;
                });

                // Spell fallback chain for reduced animation sets:
                // keep gameplay functional even when dedicated clips are missing.
                animMap['Whip'] = animMap['Whip'] || animMap['Special attack 2'] || animMap['Basic attack'] || animMap['Charged attack'];
                animMap['Special attack 3'] = animMap['Special attack 3'] || animMap['Special attack 2'] || animMap['Charged attack'];
                animMap['Drink'] = animMap['Drink'] || animMap['Special attack 2'] || animMap['Idle'];
                animMap['Run'] = animMap['Run'] || animMap['Walk'] || animMap['Fast running'] || animMap['Idle'];
                animMap['Walk'] = animMap['Walk'] || animMap['Run'] || animMap['Idle'];
                animMap['Idle'] = animMap['Idle'] || clips[0];

                this.assets.animations.character = {
                    clips,
                    map: animMap
                };
            } else {
                this.assets.animations.character = { clips: [], map: {} };
            }

            console.log('Character loaded successfully');
            return model;

        } catch (error) {
            console.error('Failed to load character model:', error);
            console.log('Falling back to procedural character...');
            await this.createProceduralCharacter();
        }
    }

    /**
     * Load boss model (Boss1_3k.glb) from models/
     */
    async loadBossModel() {
        const base = (typeof window !== 'undefined' && window.location)
            ? window.location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '')
            : '';
        const bossPath = 'models/Boss1_3k.glb?v=20260226-1';
        const bossUrl = base ? (base + bossPath) : ('./' + bossPath);
        console.log('Loading boss from:', bossUrl);
        try {
            const gltf = await this.loadGLTF(bossUrl);
            const model = gltf.scene;
            model.scale.setScalar(1.0);
            model.traverse((child) => {
                if (child.isMesh) {
                    if (child.geometry?.isBufferGeometry) {
                        // Smooth shading pass so low-poly meshes feel rounder.
                        child.geometry.computeVertexNormals();
                        if (typeof child.geometry.normalizeNormals === 'function') {
                            child.geometry.normalizeNormals();
                        }
                    }
                    child.castShadow = true;
                    child.receiveShadow = true;
                    if (child.material) {
                        const wasArrayMaterial = Array.isArray(child.material);
                        const materials = wasArrayMaterial ? child.material : [child.material];
                        child.material = materials.map((m) => {
                            const mat = m.clone();
                            mat.transparent = false;
                            mat.opacity = 1.0;
                            mat.alphaTest = 0.0;
                            if ('alphaMap' in mat) mat.alphaMap = null;
                            if ('transmission' in mat) mat.transmission = 0;
                            if ('thickness' in mat) mat.thickness = 0;
                            if ('premultipliedAlpha' in mat) mat.premultipliedAlpha = false;
                            if ('blending' in mat) mat.blending = THREE.NormalBlending;
                            if ('side' in mat) mat.side = THREE.FrontSide;
                            mat.depthWrite = true;
                            mat.depthTest = true;
                            mat.flatShading = false;
                            if ('metalness' in mat) mat.metalness = 0.02;
                            if ('roughness' in mat) mat.roughness = 0.97;
                            if ('envMapIntensity' in mat) mat.envMapIntensity = 0.0;
                            if ('specularIntensity' in mat) mat.specularIntensity = 0.05;
                            if ('clearcoat' in mat) mat.clearcoat = 0.0;
                            if ('sheen' in mat) mat.sheen = 0.0;
                            if (mat.color) mat.color.multiplyScalar(0.18);
                            if (mat.map) {
                                mat.map.premultiplyAlpha = false;
                                mat.map.needsUpdate = true;
                            }
                            mat.needsUpdate = true;
                            return mat;
                        });
                        if (!wasArrayMaterial) child.material = child.material[0];
                    }
                }
            });
            this.assets.models.boss = model;
            const clips = gltf.animations || [];
            const map = {};
            clips.forEach(clip => {
                map[clip.name] = clip;
                const name = clip.name;
                const lower = name.toLowerCase();
                if (name === 'Idle' || lower.includes('idle')) map['Idle'] = clip;
                if (name === 'RunFast.001' || name === 'RunFast' || lower.includes('runfast')) map['Run'] = clip;
                if (name === 'Running.001' || name === 'Walk' || lower.includes('walk') || lower.includes('running')) map['Walk'] = clip;
                if (name === 'Punch' || lower.includes('punch')) map['Attack'] = map['Attack'] || clip;
                if (name === 'Reverse punch' || lower.includes('reverse')) map['ReversePunch'] = clip;
            });
            // Charged attack can reuse Reverse Punch (preferred) or Punch if no dedicated clip.
            map['Charged'] = map['ReversePunch'] || map['Attack'] || map['Run'] || map['Walk'];
            if (!map['Idle'] && clips.length > 0) map['Idle'] = clips[0];
            if (!map['Run'] && map['Walk']) map['Run'] = map['Walk'];
            this.assets.animations.boss = { clips, map };
            console.log('Boss clips:', clips.map(c => `${c.name} (${c.duration.toFixed(2)}s)`).join(', '));
            return model;
        } catch (err) {
            console.warn('Boss model not found (place Boss1_3k.glb in ./models/):', err.message);
            this.assets.models.boss = null;
            this.assets.animations.boss = { clips: [], map: {} };
            return null;
        }
    }

    /**
     * Helper to load GLTF with promise
     */
    loadGLTF(url) {
        return new Promise((resolve, reject) => {
            this.gltfLoader.load(
                url,
                (gltf) => resolve(gltf),
                (progress) => {
                    if (progress.total > 0) {
                        console.log(`Loading ${url}: ${((progress.loaded / progress.total) * 100).toFixed(1)}%`);
                    }
                },
                (error) => reject(error)
            );
        });
    }
    
    async generateProceduralTextures() {
        // Stone floor texture
        this.assets.textures.stoneFloor = this.createStoneTexture(512, 512, '#3a3a3a', '#2a2a2a');
        this.assets.textures.stoneFloorNormal = this.createNoiseTexture(512, 512);
        
        // Wall texture
        this.assets.textures.stoneWall = this.createBrickTexture(512, 512);
        this.assets.textures.stoneWallNormal = this.createNoiseTexture(512, 512);
        
        // Lava texture
        this.assets.textures.lava = this.createLavaTexture(256, 256);
        
        // Metal texture
        this.assets.textures.metal = this.createMetalTexture(256, 256);
    }
    
    createStoneTexture(width, height, color1, color2) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        // Base color with noise
        ctx.fillStyle = color1;
        ctx.fillRect(0, 0, width, height);
        
        // Add noise for stone effect
        for (let i = 0; i < 5000; i++) {
            const x = Math.random() * width;
            const y = Math.random() * height;
            const size = Math.random() * 3 + 1;
            const brightness = Math.random() * 40 - 20;
            ctx.fillStyle = `rgba(${58 + brightness}, ${58 + brightness}, ${58 + brightness}, 0.5)`;
            ctx.fillRect(x, y, size, size);
        }
        
        // Add cracks
        ctx.strokeStyle = color2;
        ctx.lineWidth = 1;
        for (let i = 0; i < 20; i++) {
            ctx.beginPath();
            ctx.moveTo(Math.random() * width, Math.random() * height);
            for (let j = 0; j < 5; j++) {
                ctx.lineTo(
                    ctx.canvas.width * Math.random(),
                    ctx.canvas.height * Math.random()
                );
            }
            ctx.stroke();
        }
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(4, 4);
        return texture;
    }
    
    createBrickTexture(width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        const brickWidth = 64;
        const brickHeight = 32;
        const mortarWidth = 4;
        
        // Mortar background
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, width, height);
        
        // Draw bricks
        for (let row = 0; row < height / brickHeight; row++) {
            const offset = (row % 2) * (brickWidth / 2);
            for (let col = -1; col < width / brickWidth + 1; col++) {
                const x = col * brickWidth + offset;
                const y = row * brickHeight;
                
                // Random brick color variation
                const brightness = Math.random() * 20 + 40;
                ctx.fillStyle = `rgb(${brightness}, ${brightness - 5}, ${brightness - 10})`;
                ctx.fillRect(x + mortarWidth/2, y + mortarWidth/2, 
                           brickWidth - mortarWidth, brickHeight - mortarWidth);
            }
        }
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(2, 4);
        return texture;
    }

    createNoiseTexture(width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        const imageData = ctx.createImageData(width, height);
        for (let i = 0; i < imageData.data.length; i += 4) {
            const noise = Math.random() * 128 + 64;
            imageData.data[i] = noise;
            imageData.data[i + 1] = noise;
            imageData.data[i + 2] = 255;
            imageData.data[i + 3] = 255;
        }
        ctx.putImageData(imageData, 0, 0);

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    createLavaTexture(width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // Grey/whitish base to fit character design
        ctx.fillStyle = '#5a5a5a';
        ctx.fillRect(0, 0, width, height);

        // Soft lighter spots (ash/mist feel)
        for (let i = 0; i < 30; i++) {
            const x = Math.random() * width;
            const y = Math.random() * height;
            const radius = Math.random() * 30 + 10;

            const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
            gradient.addColorStop(0, 'rgba(240, 240, 245, 0.6)');
            gradient.addColorStop(0.5, 'rgba(200, 200, 210, 0.3)');
            gradient.addColorStop(1, 'rgba(120, 120, 130, 0)');

            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, width, height);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    createMetalTexture(width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // Metal gradient
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, '#5a5a6a');
        gradient.addColorStop(0.5, '#8a8a9a');
        gradient.addColorStop(1, '#4a4a5a');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        // Add scratches
        ctx.strokeStyle = 'rgba(100, 100, 110, 0.5)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 50; i++) {
            ctx.beginPath();
            ctx.moveTo(Math.random() * width, Math.random() * height);
            ctx.lineTo(Math.random() * width, Math.random() * height);
            ctx.stroke();
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    async createProceduralCharacter() {
        // Create a procedural knight character model
        this.assets.models.character = this.createKnightModel();
        this.assets.animations.character = this.createCharacterAnimations();
    }

    createKnightModel() {
        const group = new THREE.Group();

        // Body/torso
        const bodyGeom = new THREE.CylinderGeometry(0.3, 0.35, 0.8, 8);
        const armorMat = new THREE.MeshStandardMaterial({
            color: 0x2e2e38,
            metalness: 0.8,
            roughness: 0.3
        });
        const body = new THREE.Mesh(bodyGeom, armorMat);
        body.position.y = 1.0;
        group.add(body);

        // Head
        const headGeom = new THREE.SphereGeometry(0.2, 16, 16);
        const head = new THREE.Mesh(headGeom, armorMat);
        head.position.y = 1.6;
        group.add(head);

        // Helmet visor
        const visorGeom = new THREE.BoxGeometry(0.25, 0.08, 0.15);
        const visorMat = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            metalness: 0.9,
            roughness: 0.1
        });
        const visor = new THREE.Mesh(visorGeom, visorMat);
        visor.position.set(0, 1.58, 0.15);
        group.add(visor);

        // Shoulders
        const shoulderGeom = new THREE.SphereGeometry(0.15, 8, 8);
        const leftShoulder = new THREE.Mesh(shoulderGeom, armorMat);
        leftShoulder.position.set(-0.4, 1.3, 0);
        group.add(leftShoulder);

        const rightShoulder = new THREE.Mesh(shoulderGeom, armorMat);
        rightShoulder.position.set(0.4, 1.3, 0);
        group.add(rightShoulder);

        // Arms
        const armGeom = new THREE.CylinderGeometry(0.08, 0.06, 0.5, 8);
        const leftArm = new THREE.Mesh(armGeom, armorMat);
        leftArm.position.set(-0.4, 0.9, 0);
        group.add(leftArm);

        const rightArm = new THREE.Mesh(armGeom, armorMat);
        rightArm.position.set(0.4, 0.9, 0);
        rightArm.name = 'rightArm';
        group.add(rightArm);

        // Legs
        const legGeom = new THREE.CylinderGeometry(0.1, 0.08, 0.6, 8);
        const leftLeg = new THREE.Mesh(legGeom, armorMat);
        leftLeg.position.set(-0.15, 0.3, 0);
        group.add(leftLeg);

        const rightLeg = new THREE.Mesh(legGeom, armorMat);
        rightLeg.position.set(0.15, 0.3, 0);
        group.add(rightLeg);

        // Cape
        const capeGeom = new THREE.PlaneGeometry(0.6, 0.8);
        const capeMat = new THREE.MeshStandardMaterial({
            color: 0x8b0000,
            side: THREE.DoubleSide,
            roughness: 0.8
        });
        const cape = new THREE.Mesh(capeGeom, capeMat);
        cape.position.set(0, 0.9, -0.35);
        cape.rotation.x = 0.2;
        group.add(cape);

        group.name = 'character';
        return group;
    }

    createCharacterAnimations() {
        // Return placeholder animation data
        // In production, these would be loaded from GLTF files
        return {
            idle: { name: 'idle', duration: 2.0 },
            walk: { name: 'walk', duration: 1.0 },
            run: { name: 'run', duration: 0.6 },
            attack1: { name: 'attack1', duration: 0.5 },
            attack2: { name: 'attack2', duration: 0.6 },
            attack3: { name: 'attack3', duration: 0.7 },
            dodge: { name: 'dodge', duration: 0.5 },
            hit: { name: 'hit', duration: 0.3 },
            death: { name: 'death', duration: 2.0 }
        };
    }

    async createEnvironmentAssets() {
        // Gothic pillar
        this.assets.models.pillar = this.createPillarModel();

        // Gothic arch
        this.assets.models.arch = this.createArchModel();

        // Torch holder
        this.assets.models.torch = this.createTorchModel();

        // Debris/rocks
        this.assets.models.debris = this.createDebrisModel();
    }

    createPillarModel() {
        const group = new THREE.Group();

        // Base
        const baseGeom = new THREE.CylinderGeometry(0.6, 0.7, 0.3, 8);
        const stoneMat = new THREE.MeshStandardMaterial({
            color: 0x3a3a3a,
            roughness: 0.9,
            metalness: 0.1
        });
        const base = new THREE.Mesh(baseGeom, stoneMat);
        base.position.y = 0.15;
        group.add(base);

        // Column
        const columnGeom = new THREE.CylinderGeometry(0.4, 0.45, 4, 8);
        const column = new THREE.Mesh(columnGeom, stoneMat);
        column.position.y = 2.3;
        group.add(column);

        // Capital
        const capitalGeom = new THREE.CylinderGeometry(0.6, 0.4, 0.4, 8);
        const capital = new THREE.Mesh(capitalGeom, stoneMat);
        capital.position.y = 4.5;
        group.add(capital);

        return group;
    }

    createArchModel() {
        const group = new THREE.Group();

        const stoneMat = new THREE.MeshStandardMaterial({
            color: 0x3a3a3a,
            roughness: 0.9,
            metalness: 0.1
        });

        // Left pillar
        const pillarGeom = new THREE.BoxGeometry(0.5, 4, 0.5);
        const leftPillar = new THREE.Mesh(pillarGeom, stoneMat);
        leftPillar.position.set(-2, 2, 0);
        group.add(leftPillar);

        // Right pillar
        const rightPillar = new THREE.Mesh(pillarGeom, stoneMat);
        rightPillar.position.set(2, 2, 0);
        group.add(rightPillar);

        // Arch top (using torus segment)
        const archGeom = new THREE.TorusGeometry(2, 0.3, 8, 16, Math.PI);
        const arch = new THREE.Mesh(archGeom, stoneMat);
        arch.position.set(0, 4, 0);
        arch.rotation.z = Math.PI;
        group.add(arch);

        return group;
    }

    createTorchModel() {
        const group = new THREE.Group();

        // Bracket
        const bracketMat = new THREE.MeshStandardMaterial({
            color: 0x2a2a2a,
            metalness: 0.8,
            roughness: 0.4
        });
        const bracketGeom = new THREE.BoxGeometry(0.1, 0.3, 0.15);
        const bracket = new THREE.Mesh(bracketGeom, bracketMat);
        group.add(bracket);

        // Torch handle
        const handleGeom = new THREE.CylinderGeometry(0.04, 0.05, 0.4, 8);
        const woodMat = new THREE.MeshStandardMaterial({
            color: 0x4a3020,
            roughness: 0.9
        });
        const handle = new THREE.Mesh(handleGeom, woodMat);
        handle.position.set(0, 0, 0.15);
        handle.rotation.x = Math.PI / 2;
        group.add(handle);

        return group;
    }

    createDebrisModel() {
        const group = new THREE.Group();

        const stoneMat = new THREE.MeshStandardMaterial({
            color: 0x3a3a3a,
            roughness: 0.95
        });

        // Create several random rocks
        for (let i = 0; i < 5; i++) {
            const size = 0.1 + Math.random() * 0.2;
            const geom = new THREE.DodecahedronGeometry(size, 0);
            const rock = new THREE.Mesh(geom, stoneMat);
            rock.position.set(
                (Math.random() - 0.5) * 2,
                size / 2,
                (Math.random() - 0.5) * 2
            );
            rock.rotation.set(
                Math.random() * Math.PI,
                Math.random() * Math.PI,
                Math.random() * Math.PI
            );
            group.add(rock);
        }

        return group;
    }

    async createWeaponAssets() {
        // Use procedural claymore (no external sword model required)
        this.assets.models.claymore = this.createClaymoreModel();
    }

    createClaymoreModel() {
        // Fallback procedural sword
        const group = new THREE.Group();

        const metalMat = new THREE.MeshStandardMaterial({
            color: 0x8a8a9a,
            metalness: 0.9,
            roughness: 0.2
        });

        // Blade
        const bladeGeom = new THREE.BoxGeometry(0.08, 1.2, 0.02);
        const blade = new THREE.Mesh(bladeGeom, metalMat);
        blade.position.y = 0.7;
        group.add(blade);

        // Cross guard
        const guardGeom = new THREE.BoxGeometry(0.3, 0.06, 0.04);
        const guard = new THREE.Mesh(guardGeom, metalMat);
        guard.position.y = 0.05;
        group.add(guard);

        // Handle
        const handleGeom = new THREE.CylinderGeometry(0.025, 0.025, 0.25, 8);
        const handleMat = new THREE.MeshStandardMaterial({
            color: 0x3a2a1a,
            roughness: 0.8
        });
        const handle = new THREE.Mesh(handleGeom, handleMat);
        handle.position.y = -0.1;
        group.add(handle);

        group.name = 'claymore';
        return group;
    }

    async generateParticleTextures() {
        this.assets.textures.particle = this.createParticleTexture();
        this.assets.textures.spark = this.createSparkTexture();
        this.assets.textures.smoke = this.createSmokeTexture();
    }

    createParticleTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.3, 'rgba(255, 200, 100, 0.8)');
        gradient.addColorStop(1, 'rgba(255, 100, 0, 0)');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 64, 64);

        return new THREE.CanvasTexture(canvas);
    }

    createSparkTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');

        const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
        gradient.addColorStop(0, 'rgba(255, 255, 200, 1)');
        gradient.addColorStop(0.5, 'rgba(255, 200, 50, 0.5)');
        gradient.addColorStop(1, 'rgba(255, 100, 0, 0)');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 32, 32);

        return new THREE.CanvasTexture(canvas);
    }

    createSmokeTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, 'rgba(100, 100, 100, 0.5)');
        gradient.addColorStop(0.5, 'rgba(80, 80, 80, 0.3)');
        gradient.addColorStop(1, 'rgba(50, 50, 50, 0)');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 64, 64);

        return new THREE.CanvasTexture(canvas);
    }

    // Get loaded asset
    getModel(name) {
        const model = this.assets.models[name];
        if (!model) {
            console.warn(`Model '${name}' not found in assets`);
            return null;
        }
        // For character model, return directly (skeletal mesh needs original)
        // For other models (weapons, environment), clone
        if (name === 'character') {
            return model;
        }
        return model.clone();
    }

    getTexture(name) {
        return this.assets.textures[name] || null;
    }

    getAnimation(name) {
        return this.assets.animations[name] || null;
    }
}
