/**
 * Main Game Class - Orchestrates all game systems
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

import { InputManager } from './InputManager.js';
import { GameState } from './GameState.js';
import { Environment } from '../world/Environment.js';
import { LightingSystem } from '../world/LightingSystem.js';
import { Character } from '../entities/Character.js';
import { CombatSystem } from '../combat/CombatSystem.js';
import { ParticleSystem } from '../effects/ParticleSystem.js';
import { UIManager } from '../ui/UIManager.js';
import { Boss } from '../entities/Boss.js';

export class Game {
    constructor(canvas, assetLoader) {
        this.canvas = canvas;
        this.assetLoader = assetLoader;
        this.isRunning = false;
        this.isPaused = false;
        this.clock = new THREE.Clock();
        this.deltaTime = 0;
        this.elapsedTime = 0;
        
        // Performance monitoring
        this.frameCount = 0;
        this.lastFpsUpdate = 0;
        this.fps = 60;

        // Quality settings (optimized for performance)
        this.qualitySettings = {
            shadows: 'high',
            particles: 'low',
            postProcessing: true
        };
        
        this.mouseSensitivity = 1.0;
        this.targetMouseSensitivity = 1.0;
        
        // Screen shake (impact feel)
        this.shakeTime = 0;
        this.shakeDuration = 0.15;
        this.shakeIntensity = 0;
        this.lastShakeOffset = new THREE.Vector3(0, 0, 0);
        this.lastPunchOffset = new THREE.Vector3(0, 0, 0);
        this.punchDecay = 0.78;
        this._shieldCenter = new THREE.Vector3();
        
        // Initialize core systems
        this.initRenderer();
        this.initScene();
        this.initCamera();
        this.initPostProcessing();
        this.initSystems();
        
        // Bind methods
        this.gameLoop = this.gameLoop.bind(this);
    }
    
    initRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance',
            stencil: false,
            depth: true
        });
        
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        // Slight supersampling for cleaner silhouettes without huge perf hit.
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 0.95;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }

    initScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0d16);

        this.scene.fog = new THREE.FogExp2(0x0a0d16, 0.02);
    }
    
    initCamera() {
        this.camera = new THREE.PerspectiveCamera(
            70,
            window.innerWidth / window.innerHeight,
            0.1,
            80
        );
        this.baseFov = 70;
        this.camera.position.set(0, 1.7, 5);
        this.ultimateFovTime = 0;
    }
    
    initPostProcessing() {
        this.composer = new EffectComposer(this.renderer);
        
        const renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);
        
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.bloomResolutionScale = 0.5;
        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(w * this.bloomResolutionScale, h * this.bloomResolutionScale),
            0.15, 0.26, 0.98
        );
        this.composer.addPass(this.bloomPass);
        this.baseBloomStrength = 0.12;
        this.ultimateBloomTime = 0;
        this.ultimateBloomDuration = 0.4;
    }
    
    initSystems() {
        // Game state management
        this.gameState = new GameState();
        
        // Input handling
        this.inputManager = new InputManager(this.canvas);
        
        // Environment (gothic cathedral)
        this.environment = new Environment(this.scene, this.assetLoader);
        
        // Lighting system
        this.lightingSystem = new LightingSystem(this.scene);

        // Particle effects (before character so orbs can emit)
        this.particleSystem = new ParticleSystem(this.scene);

        // Player character
        this.character = new Character(this.scene, this.camera, this.assetLoader, this.gameState, this.particleSystem);
        
        // Combat system (with impact callback)
        this.combatSystem = new CombatSystem(
            this.scene,
            this.character,
            this.gameState,
            this.particleSystem,
            (payload) => this.onProjectileHit(payload)
        );
        
        // UI Manager (camera for project damage numbers at hit position)
        this.uiManager = new UIManager(this.gameState, this.camera);

        // Spawn one random boss in the arena
        this.boss = null;
        this.pendingUltimateSlash = 0; // delay before spawning ultimate crescent (sync with anim)
        this.spawnBoss();

        // Apply initial quality settings (low shadows + low particles = better FPS from frame 0)
        this.updateShadowQuality(this.qualitySettings.shadows);
        this.particleSystem?.setQuality(this.qualitySettings.particles);

        // Crimson Eruption (A): ground target, raycast
        this.crimsonEruptionTargeting = false;
        this.raycaster = new THREE.Raycaster();
        this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        this._groundIntersect = new THREE.Vector3();
        this._crimsonMouse = new THREE.Vector2();

    }

    getMouseGroundPosition(mouseScreenX, mouseScreenY) {
        const w = this.canvas?.clientWidth || 1;
        const h = this.canvas?.clientHeight || 1;
        this._crimsonMouse.x = (Number(mouseScreenX) / w) * 2 - 1;
        this._crimsonMouse.y = -((Number(mouseScreenY) / h) * 2 - 1);
        this.raycaster.setFromCamera(this._crimsonMouse, this.camera);
        const hit = this.raycaster.ray.intersectPlane(this._groundPlane, this._groundIntersect);
        if (hit) return this._groundIntersect.clone();
        this._groundIntersect.set(0, 0, -10);
        return this._groundIntersect.clone();
    }

    /** Ground position in front of the player (camera look direction), at least minDistance away */
    getGroundPositionInCameraDirection(minDistance = 3) {
        this._crimsonMouse.set(0, 0);
        this.raycaster.setFromCamera(this._crimsonMouse, this.camera);
        const hit = this.raycaster.ray.intersectPlane(this._groundPlane, this._groundIntersect);
        if (!hit) {
            this._groundIntersect.set(0, 0, -10);
            return this._groundIntersect.clone();
        }
        const playerPos = this.character.position;
        const dist = Math.sqrt(
            (this._groundIntersect.x - playerPos.x) ** 2 +
            (this._groundIntersect.z - playerPos.z) ** 2
        );
        if (dist < minDistance) {
            const dirX = (this._groundIntersect.x - playerPos.x) / (dist || 1);
            const dirZ = (this._groundIntersect.z - playerPos.z) / (dist || 1);
            this._groundIntersect.x = playerPos.x + dirX * minDistance;
            this._groundIntersect.z = playerPos.z + dirZ * minDistance;
        }
        return this._groundIntersect.clone();
    }

    spawnBoss() {
        const spawns = [
            new THREE.Vector3(0, 0, -8),
            new THREE.Vector3(5, 0, -7),
            new THREE.Vector3(-5, 0, -6),
            new THREE.Vector3(4, 0, -5),
            new THREE.Vector3(-3, 0, -9)
        ];
        const pos = spawns[Math.floor(Math.random() * spawns.length)];
        this.boss = new Boss(this.scene, pos, { assets: this.assetLoader.assets });
        this.boss.setGameState(this.gameState);
        this.combatSystem.addEnemy(this.boss);
        this.uiManager.showBossHealth(this.boss.name, this.boss.health, this.boss.maxHealth);
    }
    
    start() {
        this.isRunning = true;
        this.isPaused = false;
        this.clock.start();
        // Lighter warmup (one render instead of full compile) to avoid long timer/rAF violations
        setTimeout(() => {
            const setFC = (obj, val) => {
                obj.frustumCulled = val;
                if (obj.children) obj.children.forEach(c => setFC(c, val));
            };
            if (this.character?.bloodChargeIndicator) {
                const bi = this.character.bloodChargeIndicator;
                bi.visible = true;
                bi.position.set(0, -500, 0);
                setFC(bi, false);
            }
            this.combatSystem.warmupShaders(this.renderer, this.scene, this.camera);
            if (this.character?.bloodChargeIndicator) {
                const bi = this.character.bloodChargeIndicator;
                bi.visible = false;
                bi.position.set(0, 0, 0);
                setFC(bi, true);
            }
        }, 500);
        requestAnimationFrame(this.gameLoop);
    }
    
    pause() {
        this.isPaused = true;
        this.clock.stop();
    }
    
    resume() {
        this.isPaused = false;
        this.clock.start();
        this.gameLoop();
    }
    
    stop() {
        this.isRunning = false;
        this.clock.stop();
        this.gameState.reset();
    }
    
    gameLoop() {
        if (!this.isRunning || this.isPaused) return;

        requestAnimationFrame(this.gameLoop);

        this.deltaTime = Math.min(this.clock.getDelta(), 0.1);
        this.elapsedTime = this.clock.getElapsedTime();

        this.updateFPS();
        this.update();
        this.render();
    }
    
    update() {
        const input = this.inputManager.getInput();
        // Smooth sensitivity so changing slider while jumping doesn't make aim jump
        const sensLerp = 1 - Math.exp(-12 * this.deltaTime);
        this.mouseSensitivity += (this.targetMouseSensitivity - this.mouseSensitivity) * sensLerp;

        // Blood Essence: decay all charges if 8s without adding
        this.gameState.updateBloodEssence();

        // E = Bloodflail (finisher): only works with 1+ blood charges
        if (input.whipAttack) {
            const result = this.gameState.tryBloodflail();
            if (result.success) {
                this.combatSystem.executeBloodflail(result.chargesUsed, result.multiplier);
            } else {
                this.uiManager.showNoBloodEssenceFeedback();
            }
        }

        // Ultimate slash spawn (after short delay when F is pressed)
        // Direction = camera du joueur au moment où il appuie sur F
        if (this.gameState.requestUltimateSlashSpawn) {
            this.pendingUltimateSlash = 0.05;
            this.pendingUltimateDir = this.character.getForwardDirection().clone().normalize();
            this.gameState.requestUltimateSlashSpawn = false;
        }
        if (this.pendingUltimateSlash > 0) {
            this.pendingUltimateSlash -= this.deltaTime;
            if (this.pendingUltimateSlash <= 0) {
                const dir = this.pendingUltimateDir || this.character.getForwardDirection().clone().normalize();
                const pos = this.character.getWeaponPosition().clone().add(dir.clone().multiplyScalar(0.5));
                this.combatSystem.spawnUltimateSlash(pos, dir);
                this.pendingUltimateSlash = 0;
                this.pendingUltimateDir = null;
                this.ultimateBloomTime = 0.06;
                this.ultimateBloomDuration = 0.06;
                this.ultimateFovTime = 0.04;
            }
        }

        // Crimson Eruption (A / Q): single targeting mode — circle starts in front of player, then follows virtual cursor
        if (this.combatSystem && typeof this.combatSystem.updateCrimsonEruptionPreview === 'function') {
            if (input.crimsonEruption && this.combatSystem.crimsonEruptionCooldown <= 0) {
                this.crimsonEruptionTargeting = true;
                const w = this.canvas?.clientWidth || 1;
                const h = this.canvas?.clientHeight || 1;
                this._targetingMouseX = w / 2;
                this._targetingMouseY = h / 2;
            }
            if (this.crimsonEruptionTargeting) {
                const w = this.canvas?.clientWidth || 1;
                const h = this.canvas?.clientHeight || 1;
                this._targetingMouseX = (this._targetingMouseX ?? w / 2) + (input.mouseDeltaX ?? 0);
                this._targetingMouseY = (this._targetingMouseY ?? h / 2) + (input.mouseDeltaY ?? 0);
                this._targetingMouseX = Math.max(0, Math.min(w, this._targetingMouseX));
                this._targetingMouseY = Math.max(0, Math.min(h, this._targetingMouseY));
                let groundPos = this.getMouseGroundPosition(this._targetingMouseX, this._targetingMouseY);
                const minDist = 3;
                const px = this.character.position.x;
                const pz = this.character.position.z;
                const dist = Math.sqrt((groundPos.x - px) ** 2 + (groundPos.z - pz) ** 2) || 1;
                if (dist < minDist) {
                    groundPos = groundPos.clone();
                    groundPos.x = px + (groundPos.x - px) / dist * minDist;
                    groundPos.z = pz + (groundPos.z - pz) / dist * minDist;
                }
                this.combatSystem.updateCrimsonEruptionPreview(groundPos);
                if (input.attack) {
                    this.combatSystem.spawnCrimsonEruption(groundPos);
                    this.shakeIntensity = 0.012;
                    this.shakeDuration = 0.12;
                    this.shakeTime = this.shakeDuration;
                    this.crimsonEruptionTargeting = false;
                    this.combatSystem.hideCrimsonEruptionPreview();
                    input.attack = false;
                } else if (input.pause || input.rightClickDown === true) {
                    this.crimsonEruptionTargeting = false;
                    this.combatSystem.hideCrimsonEruptionPreview();
                }
            } else {
                this.combatSystem.hideCrimsonEruptionPreview();
            }
        }

        // Blood shield (C): activate and timer
        if (input.shield && !this.gameState.combat.shieldActive) {
            this.gameState.activateShield(6);
        }
        if (this.gameState.combat.shieldActive) {
            this.gameState.combat.shieldTimeRemaining -= this.deltaTime;
            if (this.gameState.combat.shieldTimeRemaining <= 0) {
                this.gameState.combat.shieldActive = false;
                this.gameState.combat.shieldTimeRemaining = 0;
            }
        }
        this._shieldCenter.copy(this.character.position);
        this._shieldCenter.y += 0.9;
        this.particleSystem.updateShieldAura(this._shieldCenter, this.deltaTime, this.gameState.combat.shieldActive);

        if (this.gameState.player.drinkPotionCooldown > 0) {
            this.gameState.player.drinkPotionCooldown -= this.deltaTime;
        }
        if (this.gameState.combat.isDrinkingPotion) {
            this.gameState.combat.drinkingPotionTimer -= this.deltaTime;
            if (this.gameState.combat.drinkingPotionTimer <= 0) {
                this.gameState.combat.isDrinkingPotion = false;
                this.gameState.combat.drinkingPotionTimer = 0;
            }
        }
        if (input.healthPotion) {
            if (this.gameState.drinkHealthPotion()) {
                this._shieldCenter.copy(this.character.position);
                this._shieldCenter.y += 0.9;
                this.particleSystem.emitHealEffect(this._shieldCenter);
            }
        }

        // Update combat first so Character sees current combat state (fixes charged attack replay)
        this.combatSystem.update(this.deltaTime, input);

        // En mode ciblage, la caméra reste fixe sur le joueur (pas de rotation)
        input.crimsonEruptionTargeting = this.crimsonEruptionTargeting;

        // Update character with input
        this.character.update(this.deltaTime, input, this.mouseSensitivity);
        
        // Apply screen shake after camera update (short impact feel)
        this.applyScreenShake();
        this.applyPunchPush();
        // Ultimate bloom pulse (insane feel)
        if (this.ultimateBloomTime > 0) {
            this.ultimateBloomTime = Math.max(0, this.ultimateBloomTime - this.deltaTime);
            const t = this.ultimateBloomTime / this.ultimateBloomDuration;
            const peak = 1.35;
            this.bloomPass.strength = this.baseBloomStrength + (peak - this.baseBloomStrength) * t;
        } else {
            this.bloomPass.strength = this.baseBloomStrength;
        }
        // Ultimate FOV punch (fire only)
        if (this.ultimateFovTime > 0) {
            this.ultimateFovTime = Math.max(0, this.ultimateFovTime - this.deltaTime);
            const t = this.ultimateFovTime / 0.22;
            this.camera.fov = this.baseFov + 8 * t;
            this.camera.updateProjectionMatrix();
        } else if (this.ultimateFovTime === 0 && this.camera.fov !== this.baseFov) {
            this.camera.fov = this.baseFov;
            this.camera.updateProjectionMatrix();
        }

        // Update boss AI and boss health bar; apply damage + ultimate charge when boss hits player
        if (this.boss) {
            if (this.boss.isAlive) {
                this.boss.update(this.deltaTime, this.character.position);
                this.uiManager.updateBossHealth(this.boss.health, this.boss.maxHealth);
            } else {
                this.uiManager.hideBossHealth();
                this.gameState.flags.bossDefeated = true;
                this.boss = null;
            }
        }
        
        // Update environment animations
        this.environment.update(this.deltaTime, this.elapsedTime);
        
        // Update lighting (torch flicker, etc)
        this.lightingSystem.update(this.deltaTime, this.elapsedTime);
        
        // Update particles
        this.particleSystem.update(this.deltaTime);
        
        // Update UI
        this.uiManager.update();

        // Reset per-frame input
        this.inputManager.resetFrameInput();
    }

    render() {
        if (this.qualitySettings.postProcessing) {
            this.composer.render();
        } else {
            this.renderer.render(this.scene, this.camera);
        }
    }

    updateFPS() {
        this.frameCount++;
        const now = performance.now();

        if (now - this.lastFpsUpdate >= 1000) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.lastFpsUpdate = now;

            const fpsElement = document.getElementById('fps-counter');
            if (fpsElement) {
                fpsElement.textContent = `FPS: ${this.fps}`;
            }
        }
    }

    handleResize() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
        this.composer.setSize(width, height);
        this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
        this.bloomPass.resolution.set(width * this.bloomResolutionScale, height * this.bloomResolutionScale);
    }

    setQualitySetting(setting, value) {
        this.qualitySettings[setting] = value;

        switch (setting) {
            case 'shadows':
                this.updateShadowQuality(value);
                break;
            case 'particles':
                this.particleSystem?.setQuality(value);
                break;
            case 'postProcessing':
                // Already handled in render()
                break;
        }
    }

    updateShadowQuality(quality) {
        const resolutions = {
            low: 0,
            medium: 128,
            high: 256
        };
        const resolution = resolutions[quality] ?? 128;
        this.lightingSystem?.setShadowsEnabled(resolution > 0);
        if (resolution > 0) this.lightingSystem?.updateShadowResolution(resolution);
    }

    setMouseSensitivity(value) {
        this.targetMouseSensitivity = value;
    }
    
    onProjectileHit(payload = {}) {
        const { charged, isBoss, isUltimate, whipHit, whipWindup, bloodflailCharges } = payload;
        if (isUltimate) {
            this.shakeIntensity = 0.1;
            this.shakeDuration = 0.35;
            this.shakeTime = this.shakeDuration;
            this.ultimateBloomTime = 0.6;
            this.ultimateBloomDuration = 0.6;
        } else if (whipHit) {
            const isFiveCharge = bloodflailCharges === 5;
            this.shakeIntensity = isFiveCharge ? 0.12 : 0.055;
            this.shakeDuration = isFiveCharge ? 0.35 : 0.22;
            this.shakeTime = this.shakeDuration;
            this.ultimateBloomTime = isFiveCharge ? 0.6 : 0.4;
            this.ultimateBloomDuration = isFiveCharge ? 0.6 : 0.4;
            this.ultimateFovTime = isFiveCharge ? 0.25 : 0.2;
            this.lastPunchOffset.copy(this.character.getForwardDirection()).multiplyScalar(isFiveCharge ? 0.28 : 0.22);
        } else if (whipWindup) {
            this.shakeIntensity = 0.016;
            this.shakeDuration = 0.07;
            this.shakeTime = this.shakeDuration;
        } else {
            // Projectile hit: slight shake for basic, slightly more for charged
            const base = 0.022;
            this.shakeIntensity = base * (charged ? 1.6 : 1) * (isBoss ? 1.4 : 1);
            this.shakeDuration = charged ? 0.2 : 0.14;
        }
        this.shakeTime = this.shakeDuration;
    }
    
    applyScreenShake() {
        if (this.shakeTime <= 0) {
            if (this.lastShakeOffset.x !== 0 || this.lastShakeOffset.y !== 0 || this.lastShakeOffset.z !== 0) {
                this.camera.position.sub(this.lastShakeOffset);
                this.lastShakeOffset.set(0, 0, 0);
            }
            return;
        }
        this.camera.position.sub(this.lastShakeOffset);
        this.shakeTime = Math.max(0, this.shakeTime - this.deltaTime);
        const t = this.shakeTime / this.shakeDuration;
        const smoothT = t * t * (3 - 2 * t);
        const amt = this.shakeIntensity * smoothT;
        this.lastShakeOffset.set(
            (Math.random() - 0.5) * 2 * amt,
            (Math.random() - 0.5) * 2 * amt,
            (Math.random() - 0.5) * 2 * amt * 0.3
        );
        this.camera.position.add(this.lastShakeOffset);
    }
    
    applyPunchPush() {
        this.camera.position.sub(this.lastPunchOffset);
        this.lastPunchOffset.multiplyScalar(this.punchDecay);
        this.camera.position.add(this.lastPunchOffset);
    }
}

