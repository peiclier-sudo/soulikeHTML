/**
 * Main Game Class - Orchestrates all game systems
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';

import { InputManager } from './InputManager.js';
import { GameState } from './GameState.js';
import { Environment } from '../world/Environment.js';
import { LightingSystem } from '../world/LightingSystem.js';
import { Character } from '../entities/Character.js';
import { CombatSystem } from '../combat/CombatSystem.js';
import { ParticleSystem } from '../effects/ParticleSystem.js';
import { UIManager } from '../ui/UIManager.js';
import { Boss } from '../entities/Boss.js';
import { RunProgress } from './RunProgress.js';

export class Game {
    constructor(canvas, assetLoader, kitId = 'blood_mage') {
        this.canvas = canvas;
        this.assetLoader = assetLoader;
        this.kitId = kitId;
        this.isRunning = false;
        this.isPaused = false;
        this.clock = new THREE.Clock();
        this.deltaTime = 0;
        this.elapsedTime = 0;
        
        // Performance monitoring
        this.frameCount = 0;
        this.lastFpsUpdate = 0;
        this.fps = 60;

        // Quality settings — start conservative, adaptive system promotes if GPU can handle it
        this.qualitySettings = {
            shadows: 'low',
            particles: 'low',
            postProcessing: false,
            motionSmoothing: false
        };

        // Adaptive quality: auto-lower DPR when FPS drops, raise when stable
        this._adaptiveDpr = Math.min(window.devicePixelRatio, 0.85);
        this._lowFpsFrames = 0;
        this._highFpsFrames = 0;
        this._qualityPromoted = false;  // true once we've tried promoting
        
        this.mouseSensitivity = 1.0;
        this.targetMouseSensitivity = 1.0;
        
        // Screen shake (impact feel)
        this.shakeTime = 0;
        this.shakeDuration = 0.15;
        this.shakeIntensity = 0;
        this.lastShakeOffset = new THREE.Vector3(0, 0, 0);
        this.targetShakeOffset = new THREE.Vector3(0, 0, 0);
        this.lastPunchOffset = new THREE.Vector3(0, 0, 0);
        this.shakeSeed = Math.random() * 1000;
        this.punchDecay = 0.82;
        this._shieldCenter = new THREE.Vector3();
        this._tmpGroundResult = new THREE.Vector3();
        this._tmpDirVec = new THREE.Vector3();
        this._tmpPosVec = new THREE.Vector3();
        this._tmpDmgPos = new THREE.Vector3();

        // Hit-stop (brief time freeze on heavy impacts)
        this.hitStopTime = 0;
        
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
            antialias: false,
            alpha: false,
            powerPreference: 'high-performance',
            stencil: false,
            depth: true
        });

        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(this._adaptiveDpr);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.BasicShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 0.95;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }

    initScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x080c14);

        this.scene.fog = new THREE.FogExp2(0x080c14, 0.02);
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
        this.bloomResolutionScale = 0.15;
        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(w * this.bloomResolutionScale, h * this.bloomResolutionScale),
            0.15, 0.26, 0.98
        );
        this.composer.addPass(this.bloomPass);
        this.baseBloomStrength = 0.12;
        this.ultimateBloomTime = 0;
        this.ultimateBloomDuration = 0.4;

        // Adaptive afterimage: smooths visual output during FPS drops + dash trails
        this.afterimagePass = new AfterimagePass(0);
        this.composer.addPass(this.afterimagePass);
        this._afterimageDamp = 0;        // current smoothed damp value
        this._afterimageTarget = 0;      // target damp value
    }
    
    initSystems() {
        // Game state management (set kit before reset so stats are kit-driven)
        this.gameState = new GameState();
        this.gameState.setKit(this.kitId);
        this.gameState.reset();
        
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
        this.uiManager = new UIManager(this.gameState, this.camera, this.combatSystem, this.character);
        this.uiManager.applyKitToHud();

        // Boss tracking
        this.boss = null;
        this.bossNumber = 0;           // index of current boss in this run
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
        if (hit) return this._tmpGroundResult.copy(this._groundIntersect);
        this._groundIntersect.set(0, 0, -10);
        return this._tmpGroundResult.copy(this._groundIntersect);
    }

    /** Ground position in front of the player (camera look direction), at least minDistance away */
    getGroundPositionInCameraDirection(minDistance = 3) {
        this._crimsonMouse.set(0, 0);
        this.raycaster.setFromCamera(this._crimsonMouse, this.camera);
        const hit = this.raycaster.ray.intersectPlane(this._groundPlane, this._groundIntersect);
        if (!hit) {
            this._groundIntersect.set(0, 0, -10);
            return this._tmpGroundResult.copy(this._groundIntersect);
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
        return this._tmpGroundResult.copy(this._groundIntersect);
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
        const scaled = RunProgress.getBossConfig(this.bossNumber);
        this.boss = new Boss(this.scene, pos, {
            assets: this.assetLoader.assets,
            health: scaled.health,
            damage: scaled.damage
        });
        this.boss.setGameState(this.gameState);
        this.combatSystem.addEnemy(this.boss);
        const label = this.bossNumber > 0
            ? `${this.boss.name}  (Boss ${this.bossNumber + 1})`
            : this.boss.name;
        this.uiManager.showBossHealth(label, this.boss.health, this.boss.maxHealth);
    }

    /** Show the tower progression overlay after a boss is defeated. */
    showTowerScreen() {
        // Pause the game and release pointer
        this.pause();
        document.exitPointerLock();
        document.getElementById('hud').style.display = 'none';

        const defeated = this.bossNumber + 1; // how many bosses beaten so far (1-indexed)
        const towerScreen = document.getElementById('tower-screen');
        const shaft = document.getElementById('tower-shaft');
        const subtitle = document.getElementById('tower-subtitle');

        subtitle.textContent = `Floor ${defeated} Conquered`;

        // Build tower floors: show defeated + next + a couple of locked future floors
        const totalVisible = Math.max(defeated + 3, 6);
        shaft.innerHTML = '';

        for (let i = 1; i <= totalVisible; i++) {
            const floor = document.createElement('div');
            floor.className = 'tower-floor';

            if (i < defeated) {
                // Previously beaten
                floor.classList.add('defeated');
                floor.innerHTML = `<span class="tower-floor-icon">\u2620</span> BOSS ${i}`;
            } else if (i === defeated) {
                // Just beaten — highlight
                floor.classList.add('defeated', 'just-defeated');
                floor.innerHTML = `<span class="tower-floor-icon">\u2694\uFE0F</span> BOSS ${i} \u2014 DEFEATED`;
            } else if (i === defeated + 1) {
                // Next boss
                floor.classList.add('upcoming');
                floor.innerHTML = `<span class="tower-floor-icon">?</span> BOSS ${i}`;
            } else {
                // Future locked
                floor.classList.add('locked');
                floor.innerHTML = `<span class="tower-floor-icon">\uD83D\uDD12</span> BOSS ${i}`;
            }
            shaft.appendChild(floor);
        }

        towerScreen.style.display = 'flex';
    }

    /** Called when player clicks Continue on the tower screen. */
    proceedFromTower() {
        document.getElementById('tower-screen').style.display = 'none';
        document.getElementById('hud').style.display = 'block';

        this.bossNumber++;
        this.gameState.flags.bossDefeated = false;
        this.spawnBoss();
        this.resume();
        requestAnimationFrame(() => document.getElementById('game-canvas').requestPointerLock());
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
        RunProgress.saveRunState(this.gameState);
        this.gameState.reset();
    }

    /** Restore a saved run (called from main.js when player clicks "Continue"). */
    restoreRun(savedRun) {
        this.bossNumber = savedRun.bossesDefeated;
        if (savedRun.health != null) {
            this.gameState.player.health = Math.min(savedRun.health, this.gameState.player.maxHealth);
            this.gameState.emit('healthChanged', this.gameState.player.health);
        }
        if (savedRun.potions != null) {
            this.gameState.player.healthPotions = savedRun.potions;
        }
    }
    
    gameLoop() {
        if (!this.isRunning || this.isPaused) return;

        requestAnimationFrame(this.gameLoop);

        this.deltaTime = Math.min(this.clock.getDelta(), 0.1);
        this.elapsedTime = this.clock.getElapsedTime();

        this.updateFPS();

        if (this.hitStopTime > 0) {
            this.hitStopTime = Math.max(0, this.hitStopTime - this.deltaTime);
            this.render();
            this.inputManager.resetFrameInput();
            return;
        }

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

        // Dagger kit: update buff timers (teleport/poison damage applied in CombatSystem.onHit)
        const combat = this.gameState.combat;
        if (combat.teleportDamageBuffRemaining > 0) {
            combat.teleportDamageBuffRemaining = Math.max(0, combat.teleportDamageBuffRemaining - this.deltaTime);
        }
        if (combat.vanishRemaining > 0) {
            combat.vanishRemaining = Math.max(0, combat.vanishRemaining - this.deltaTime);
            if (combat.vanishRemaining <= 0) this.gameState.emit('vanishChanged', false);
        }
        if (combat.poisonDamageBuffRemaining > 0) {
            combat.poisonDamageBuffRemaining = Math.max(0, combat.poisonDamageBuffRemaining - this.deltaTime);
        }

        // E = Finisher: Judgment Arrow (bow) / Poison Pierce (dagger) / Frost Beam / Blood Crescend
        if (input.whipAttack) {
            if (this.combatSystem?.isBowRangerKit && this.combatSystem?.bowRangerCombat) {
                const result = this.gameState.tryJudgmentArrow();
                if (result.success) {
                    this.combatSystem.bowRangerCombat.executeJudgmentArrow(result.chargesUsed);
                } else {
                    this.uiManager.showNoBloodEssenceFeedback();
                }
            } else if (this.combatSystem?.isDaggerKit && this.combatSystem?.daggerCombat) {
                const result = this.gameState.tryPoisonPierce();
                if (result.success) {
                    this.combatSystem.daggerCombat.executePoisonPierce(result.chargesUsed);
                } else {
                    this.uiManager.showNoBloodEssenceFeedback();
                }
            } else if (this.combatSystem?.isFrostKit) {
                this.combatSystem.executeBloodflail(0, 1);
            } else {
                const result = this.gameState.tryBloodflail();
                if (result.success) {
                    this.combatSystem.executeBloodflail(result.chargesUsed, result.multiplier);
                } else {
                    this.uiManager.showNoBloodEssenceFeedback();
                }
            }
        }

        // V/A = Recoil Shot (bow) or Teleport Behind (dagger)
        if (input.teleport) {
            if (this.combatSystem?.isBowRangerKit && this.combatSystem?.bowRangerCombat) {
                this.combatSystem.bowRangerCombat.executeRecoilShot();
                input.crimsonEruption = false;
            } else if (this.combatSystem?.isDaggerKit && this.combatSystem?.daggerCombat) {
                this.combatSystem.daggerCombat.executeTeleportBehind();
                input.crimsonEruption = false;
            }
        }

        // C = Hunter's Mark Zone (bow) / Vanish (dagger) / Shield (others)
        if (input.shield && !this.gameState.combat.shieldActive) {
            if (this.combatSystem?.isBowRangerKit && this.combatSystem?.bowRangerCombat) {
                this.combatSystem.bowRangerCombat.executeDamageZone();
            } else if (this.combatSystem?.isDaggerKit && this.combatSystem?.daggerCombat) {
                this.combatSystem.daggerCombat.executeVanish();
            } else {
                this.gameState.activateShield(this.combatSystem.shieldDuration);
            }
        }

        // X = Multi Shot (bow) / Toxic Focus (dagger)
        if (input.bloodNova && this.combatSystem?.isBowRangerKit && this.combatSystem?.bowRangerCombat) {
            this.combatSystem.bowRangerCombat.executeMultiShot();
        }
        if (input.bloodNova && this.combatSystem?.isDaggerKit && this.combatSystem?.daggerCombat) {
            if (!this.combatSystem.daggerCombat.executeToxicFocus()) {
                this.uiManager.showNoBloodEssenceFeedback();
            }
        }

        // Ultimate slash spawn (after short delay when F is pressed)
        // Direction = camera du joueur au moment où il appuie sur F
        const fc = this.combatSystem?.frostCombat;

        if (this.gameState.requestUltimateSlashSpawn) {
            this.pendingUltimateSlash = 0.05;
            this._tmpDirVec.copy(this.character.getForwardDirection()).normalize();
            this.pendingUltimateDir = this._tmpDirVec.clone(); // clone once for delayed use
            this.gameState.requestUltimateSlashSpawn = false;
        }
        if (this.pendingUltimateSlash > 0) {
            this.pendingUltimateSlash -= this.deltaTime;
            if (this.pendingUltimateSlash <= 0) {
                const dir = this.pendingUltimateDir || this._tmpDirVec.copy(this.character.getForwardDirection()).normalize();
                const pos = this._tmpPosVec.copy(this.character.getWeaponPosition()).addScaledVector(dir, 0.5);
                if (this.combatSystem.isBowRangerKit && this.combatSystem.bowRangerCombat) {
                    this.combatSystem.bowRangerCombat.spawnUltimateArrow();
                } else if (this.combatSystem.isDaggerKit && this.combatSystem.daggerCombat) {
                    this.combatSystem.daggerCombat.spawnTwinDaggersUltimate();
                } else if (this.combatSystem.isFrostKit && this.combatSystem.frostCombat) {
                    this.combatSystem.frostCombat.beginBlizzardTargeting();
                } else {
                    this.combatSystem.spawnUltimateSlash(pos, dir);
                }
                this.pendingUltimateSlash = 0;
                this.pendingUltimateDir = null;
                this.ultimateBloomTime = 0.06;
                this.ultimateBloomDuration = 0.06;
                this.ultimateFovTime = 0.04;
            }
        }

        // Blizzard targeting (frost mage F ultimate): move cursor, click to deploy
        if (fc && fc.blizzardTargeting) {
            const w = this.canvas?.clientWidth || 1;
            const h = this.canvas?.clientHeight || 1;
            if (!this._blizzardMouseX) {
                this._blizzardMouseX = w / 2;
                this._blizzardMouseY = h / 2;
            }
            this._blizzardMouseX = (this._blizzardMouseX ?? w / 2) + (input.mouseDeltaX ?? 0);
            this._blizzardMouseY = (this._blizzardMouseY ?? h / 2) + (input.mouseDeltaY ?? 0);
            this._blizzardMouseX = Math.max(0, Math.min(w, this._blizzardMouseX));
            this._blizzardMouseY = Math.max(0, Math.min(h, this._blizzardMouseY));
            let groundPos = this.getMouseGroundPosition(this._blizzardMouseX, this._blizzardMouseY);
            const minDist = 3;
            const px = this.character.position.x;
            const pz = this.character.position.z;
            const dist = Math.sqrt((groundPos.x - px) ** 2 + (groundPos.z - pz) ** 2) || 1;
            if (dist < minDist) {
                groundPos = groundPos.clone();
                groundPos.x = px + (groundPos.x - px) / dist * minDist;
                groundPos.z = pz + (groundPos.z - pz) / dist * minDist;
            }
            fc.updateBlizzardPreview(groundPos);
            if (input.attack) {
                fc.castBlizzard(groundPos);
                this.shakeIntensity = 0.02;
                this.shakeDuration = 0.15;
                this.shakeTime = this.shakeDuration;
                this._blizzardMouseX = null;
                input.attack = false;
            } else if (input.pause || input.rightClickDown === true) {
                fc.cancelBlizzardTargeting();
                this._blizzardMouseX = null;
                // Refund ultimate charge since player cancelled
                this.gameState.player.ultimateCharge = 100;
            }
            input.blizzardTargeting = true;
        } else {
            if (fc) fc.hideBlizzardPreview();
            input.blizzardTargeting = false;
            this._blizzardMouseX = null;
        }

        // Q ability: Frost Mage → Ice Claw, others → Crimson Eruption targeting
        if (this.combatSystem && input.crimsonEruption && !this.combatSystem.isDaggerKit && this.combatSystem.isFrostKit && this.combatSystem.frostCombat) {
            this.combatSystem.frostCombat.castIceClaw();
            input.crimsonEruption = false;
        }
        if (this.combatSystem && typeof this.combatSystem.updateCrimsonEruptionPreview === 'function') {
            if (input.crimsonEruption && !this.combatSystem.isDaggerKit && !this.combatSystem.isBowRangerKit && this.combatSystem.crimsonEruptionCooldown <= 0) {
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

        // Stalactite targeting (frost mage X ability): tap X to enter targeting, click to drop
        if (fc && fc.stalactiteTargeting) {
            const w = this.canvas?.clientWidth || 1;
            const h = this.canvas?.clientHeight || 1;
            if (!this._stalactiteMouseX) {
                this._stalactiteMouseX = w / 2;
                this._stalactiteMouseY = h / 2;
            }
            this._stalactiteMouseX = (this._stalactiteMouseX ?? w / 2) + (input.mouseDeltaX ?? 0);
            this._stalactiteMouseY = (this._stalactiteMouseY ?? h / 2) + (input.mouseDeltaY ?? 0);
            this._stalactiteMouseX = Math.max(0, Math.min(w, this._stalactiteMouseX));
            this._stalactiteMouseY = Math.max(0, Math.min(h, this._stalactiteMouseY));
            let groundPos = this.getMouseGroundPosition(this._stalactiteMouseX, this._stalactiteMouseY);
            const minDist = 3;
            const px = this.character.position.x;
            const pz = this.character.position.z;
            const dist = Math.sqrt((groundPos.x - px) ** 2 + (groundPos.z - pz) ** 2) || 1;
            if (dist < minDist) {
                groundPos = groundPos.clone();
                groundPos.x = px + (groundPos.x - px) / dist * minDist;
                groundPos.z = pz + (groundPos.z - pz) / dist * minDist;
            }
            fc.updateStalactitePreview(groundPos);
            if (input.attack) {
                fc.dropStalactite(groundPos);
                this.shakeIntensity = 0.025;
                this.shakeDuration = 0.2;
                this.shakeTime = this.shakeDuration;
                this._stalactiteMouseX = null;
                input.attack = false;
            } else if (input.pause || input.rightClickDown === true) {
                fc.cancelStalactiteTargeting();
                this._stalactiteMouseX = null;
            }
            // Lock camera during targeting
            input.stalactiteTargeting = true;
        } else {
            if (fc) fc.hideStalactitePreview();
            input.stalactiteTargeting = false;
            this._stalactiteMouseX = null;
        }

        // Shield (C) / Vanish (dagger) handled above with teleport
        if (this.gameState.combat.shieldActive) {
            this.gameState.combat.shieldTimeRemaining -= this.deltaTime;
            if (this.gameState.combat.shieldTimeRemaining <= 0) {
                this.gameState.combat.shieldActive = false;
                this.gameState.combat.shieldTimeRemaining = 0;
            }
        }
        this._shieldCenter.copy(this.character.position);
        this._shieldCenter.y += 0.9;
        this.particleSystem.updateShieldAura(this._shieldCenter, this.deltaTime, this.gameState.combat.shieldActive, this.combatSystem?.isFrostKit);

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

        // Super Dash collision damage sweep
        this.applySuperDashDamage();
        
        // Apply screen shake after camera update (short impact feel)
        this.applyScreenShake();
        this.applyPunchPush();
        // Bloom pulse with smooth ease-out (skip when post-processing is off)
        if (this.qualitySettings.postProcessing) {
            if (this.ultimateBloomTime > 0) {
                this.ultimateBloomTime = Math.max(0, this.ultimateBloomTime - this.deltaTime);
                const t = this.ultimateBloomTime / this.ultimateBloomDuration;
                const eased = t * t;
                const peak = 1.6;
                this.bloomPass.strength = this.baseBloomStrength + (peak - this.baseBloomStrength) * eased;
            } else {
                this.bloomPass.strength = this.baseBloomStrength;
            }
        } else if (this.ultimateBloomTime > 0) {
            this.ultimateBloomTime = Math.max(0, this.ultimateBloomTime - this.deltaTime);
        }
        // FOV punch with smooth ease-out
        if (this.ultimateFovTime > 0) {
            this.ultimateFovTime = Math.max(0, this.ultimateFovTime - this.deltaTime);
            const t = this.ultimateFovTime / 0.25;
            const eased = t * t;
            this.camera.fov = this.baseFov + 10 * eased;
            this.camera.updateProjectionMatrix();
        } else if (this.ultimateFovTime === 0 && this.camera.fov !== this.baseFov) {
            this.camera.fov = this.baseFov;
            this.camera.updateProjectionMatrix();
        }

        // Adaptive afterimage (skip entirely when post-processing is off)
        if (this.qualitySettings.postProcessing) this._updateAfterimage();

        // Update boss AI and boss health bar; apply damage + ultimate charge when boss hits player
        if (this.boss) {
            if (this.boss.isAlive) {
                this.boss.update(this.deltaTime, this.character.position);
                this.uiManager.updateBossHealth(this.boss.health, this.boss.maxHealth);
            } else {
                this.uiManager.hideBossHealth();
                this.gameState.flags.bossDefeated = true;
                RunProgress.onBossDefeated(this.gameState);
                this.boss = null;
                // Show tower progression screen instead of auto-spawning
                this.showTowerScreen();
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


    applySuperDashDamage() {
        if (!this.character?.isDashing || !this.character?.isSuperDashing || !this.combatSystem?.enemies) return;
        const pos = this.character.position;
        for (const enemyMesh of this.combatSystem.enemies) {
            const enemy = enemyMesh.userData?.enemy;
            if (!enemy || enemy.health <= 0) continue;
            const id = enemy._damageAnchorId || enemy.name || String(enemyMesh.id);
            if (this.character.superDashHitSet.has(id)) continue;
            enemyMesh.getWorldPosition(this.combatSystem._enemyPos);
            const hitRadius = (enemy.hitRadius ?? (enemy.isBoss ? 2.5 : 0.8)) + 1.4;
            if (pos.distanceTo(this.combatSystem._enemyPos) > hitRadius) continue;
            enemy.takeDamage(this.character.superDashDamage);
            enemy.staggerTimer = Math.max(enemy.staggerTimer, 0.55);
            enemy.state = 'stagger';
            this.character.superDashHitSet.add(id);
            this._tmpDmgPos.copy(this.combatSystem._enemyPos);
            this.gameState.emit('damageNumber', { position: this._tmpDmgPos, damage: this.character.superDashDamage, isCritical: true, anchorId: this.combatSystem._getDamageAnchorId(enemy) });
            this.onProjectileHit({ whipHit: true, punchFinish: true });
        }
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

            if (!this._fpsElement) this._fpsElement = document.getElementById('fps-counter');
            if (this._fpsElement) {
                this._fpsElement.textContent = `FPS: ${this.fps}`;
            }

            // Adaptive quality: auto-adjust DPR based on sustained FPS
            this._adaptiveQualityTick();
        }
    }

    _adaptiveQualityTick() {
        if (this.fps < 40) {
            // Struggling — demote aggressively (react in 2s instead of 3s)
            this._lowFpsFrames++;
            this._highFpsFrames = 0;
            if (this._lowFpsFrames >= 2) {
                // Step 1: Kill post-processing first (biggest GPU saver)
                if (this.qualitySettings.postProcessing) {
                    this.qualitySettings.postProcessing = false;
                    return;
                }
                // Step 2: Lower DPR
                if (this._adaptiveDpr > 0.5) {
                    this._adaptiveDpr = Math.max(0.5, this._adaptiveDpr - 0.15);
                    this.renderer.setPixelRatio(this._adaptiveDpr);
                    return;
                }
                // Step 3: Disable shadows entirely
                if (this.qualitySettings.shadows !== 'low') {
                    this.qualitySettings.shadows = 'low';
                    this.updateShadowQuality('low');
                }
            }
        } else if (this.fps >= 55) {
            // Running well — cautiously promote (only after 8s sustained)
            this._highFpsFrames++;
            this._lowFpsFrames = 0;
            if (this._highFpsFrames >= 8) {
                const maxDpr = Math.min(window.devicePixelRatio, 1.0);
                if (this._adaptiveDpr < maxDpr) {
                    this._adaptiveDpr = Math.min(maxDpr, this._adaptiveDpr + 0.05);
                    this.renderer.setPixelRatio(this._adaptiveDpr);
                } else if (this.qualitySettings.shadows === 'low') {
                    this.qualitySettings.shadows = 'medium';
                    this.updateShadowQuality('medium');
                } else if (!this.qualitySettings.postProcessing && !this._qualityPromoted) {
                    this.qualitySettings.postProcessing = true;
                    this._qualityPromoted = true;  // only try once
                }
                this._highFpsFrames = 0;  // reset so each promotion takes 8s
            }
        } else {
            this._lowFpsFrames = 0;
            this._highFpsFrames = 0;
        }
    }

    _updateAfterimage() {
        if (!this.afterimagePass) return;

        // Disabled by user setting → force off
        if (!this.qualitySettings.motionSmoothing) {
            this._afterimageDamp = 0;
            this.afterimagePass.uniforms['damp'].value = 0;
            this.afterimagePass.enabled = false;
            return;
        }

        // Per-frame instantaneous FPS from deltaTime (more responsive than 1s counter)
        const instantFps = this.deltaTime > 0 ? Math.min(1 / this.deltaTime, 120) : 60;

        // Base target: scale up as FPS drops below 55
        let target = 0;
        if (instantFps < 55) {
            // Linear ramp: 0 at 55fps -> 0.4 at 35fps
            target = Math.min(0.4, (55 - instantFps) / 50);
        }

        // Dash trail boost: adds a speed-trail feel during dashes
        if (this.character && this.character.isDashing) {
            target = Math.max(target, 0.5);
        }

        this._afterimageTarget = target;

        // Smooth toward target (fast ramp-up, slower decay for natural feel)
        const rate = this._afterimageDamp < this._afterimageTarget ? 12 : 5;
        this._afterimageDamp += (this._afterimageTarget - this._afterimageDamp) * Math.min(1, rate * this.deltaTime);

        // Snap to zero when very small to avoid permanent faint ghosting
        if (this._afterimageDamp < 0.01) this._afterimageDamp = 0;

        this.afterimagePass.uniforms['damp'].value = this._afterimageDamp;
        // Disable the pass entirely when inactive (zero GPU cost)
        this.afterimagePass.enabled = this._afterimageDamp > 0;
    }

    handleResize() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
        this.composer.setSize(width, height);
        this.composer.setPixelRatio(this._adaptiveDpr);
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
    


    triggerHitStop(duration = 0.05) {
        this.hitStopTime = Math.max(this.hitStopTime, duration);
    }
    onProjectileHit(payload = {}) {
        const { charged, isBoss, isUltimate, whipHit, whipWindup, bloodflailCharges, punchFinish, bloodNova, crimsonEruption, daggerSlashImpact, vanishActivated, shadowStepLand, bowRecoilShot, bowDamageZone, bowMultiShot, bowJudgmentArrow, bloodCrescendLaunch, isBowArrow } = payload;
        // Blood crescent launch: snappy forward push + brief bloom, NO heavy hit-stop
        if (bloodCrescendLaunch) {
            const charges = bloodflailCharges ?? 0;
            this.shakeIntensity = 0.02 + charges * 0.002;
            this.shakeDuration = 0.1;
            this.shakeTime = this.shakeDuration;
            this.lastPunchOffset.copy(this.character.getForwardDirection()).multiplyScalar(0.15 + charges * 0.02);
            this.ultimateBloomTime = 0.12 + charges * 0.01;
            this.ultimateBloomDuration = 0.12 + charges * 0.01;
            this.ultimateFovTime = 0.08 + charges * 0.01;
            return;
        }
        if (vanishActivated) {
            this.shakeIntensity = 0.025;
            this.shakeDuration = 0.15;
            this.shakeTime = this.shakeDuration;
            this.ultimateBloomTime = 0.2;
            this.ultimateBloomDuration = 0.2;
        }
        if (shadowStepLand) {
            this.shakeIntensity = 0.03;
            this.shakeDuration = 0.18;
            this.shakeTime = this.shakeDuration;
            this.lastPunchOffset.copy(this.character.getForwardDirection()).multiplyScalar(0.2);
            this.triggerHitStop(0.04);
            this.ultimateBloomTime = 0.25;
            this.ultimateBloomDuration = 0.25;
        }
        if (bowRecoilShot) {
            this.shakeIntensity = 0.035;
            this.shakeDuration = 0.15;
            this.shakeTime = this.shakeDuration;
            this.lastPunchOffset.copy(this.character.getForwardDirection()).multiplyScalar(-0.25);
            this.triggerHitStop(0.03);
            this.ultimateBloomTime = 0.2;
            this.ultimateBloomDuration = 0.2;
        }
        if (bowDamageZone) {
            this.shakeIntensity = 0.02;
            this.shakeDuration = 0.12;
            this.shakeTime = this.shakeDuration;
            this.ultimateBloomTime = 0.3;
            this.ultimateBloomDuration = 0.3;
        }
        if (bowMultiShot) {
            this.shakeIntensity = 0.015;
            this.shakeDuration = 0.1;
            this.shakeTime = this.shakeDuration;
        }
        if (bowJudgmentArrow) {
            const stacks = payload.stacks ?? 1;
            this.shakeIntensity = 0.025 + stacks * 0.005;
            this.shakeDuration = 0.15 + stacks * 0.02;
            this.shakeTime = this.shakeDuration;
            this.lastPunchOffset.copy(this.character.getForwardDirection()).multiplyScalar(0.15 + stacks * 0.02);
            this.triggerHitStop(0.03 + stacks * 0.005);
            this.ultimateBloomTime = 0.2 + stacks * 0.04;
            this.ultimateBloomDuration = 0.2 + stacks * 0.04;
        }
        if (daggerSlashImpact) {
            this.shakeIntensity = 0.018;
            this.shakeDuration = 0.1;
            this.shakeTime = this.shakeDuration;
            this.lastPunchOffset.copy(this.character.getForwardDirection()).multiplyScalar(0.12);
            this.triggerHitStop(0.025);
        }
        if (isUltimate) {
            this.shakeIntensity = 0.1;
            this.shakeDuration = 0.35;
            this.shakeTime = this.shakeDuration;
            this.ultimateBloomTime = 0.6;
            this.ultimateBloomDuration = 0.6;
            this.triggerHitStop(0.08);
        } else if (whipHit) {
            const isMaxCharge = bloodflailCharges >= 8;
            this.shakeIntensity = isMaxCharge ? 0.11 : 0.045;
            this.shakeDuration = isMaxCharge ? 0.34 : 0.2;
            this.shakeTime = this.shakeDuration;
            this.ultimateBloomTime = isMaxCharge ? 0.65 : 0.4;
            this.ultimateBloomDuration = isMaxCharge ? 0.65 : 0.4;
            this.ultimateFovTime = isMaxCharge ? 0.36 : 0.24;
            this.lastPunchOffset.copy(this.character.getForwardDirection()).multiplyScalar(isMaxCharge ? 0.42 : 0.28);
            this.triggerHitStop(punchFinish ? 0.09 : 0.05);
            if (punchFinish) {
                this.shakeIntensity *= 1.18;
                this.shakeDuration += 0.08;
                this.ultimateFovTime = Math.max(this.ultimateFovTime, 0.36);
                this.ultimateBloomTime = Math.max(this.ultimateBloomTime, 0.52);
                this.ultimateBloomDuration = Math.max(this.ultimateBloomDuration, 0.52);
                this.lastPunchOffset.multiplyScalar(1.42);
            }
        } else if (whipWindup) {
            this.shakeIntensity = 0.016;
            this.shakeDuration = 0.07;
            this.shakeTime = this.shakeDuration;
        } else if (crimsonEruption) {
            this.shakeIntensity = 0.06;
            this.shakeDuration = 0.2;
            this.ultimateBloomTime = 0.28;
            this.ultimateBloomDuration = 0.28;
            this.lastPunchOffset.copy(this.character.getForwardDirection()).multiplyScalar(0.1);
            this.triggerHitStop(0.05);
        } else if (bloodNova) {
            this.shakeIntensity = 0.085;
            this.shakeDuration = 0.28;
            this.ultimateBloomTime = 0.42;
            this.ultimateBloomDuration = 0.42;
            this.lastPunchOffset.copy(this.character.getForwardDirection()).multiplyScalar(0.16);
            this.triggerHitStop(0.055);
        } else if (isBowArrow) {
            // Bow arrows: very light feedback — no camera push, no hit-stop
            // so rapid fire feels crisp and aiming isn't disrupted
            this.shakeIntensity = charged ? 0.012 : 0.006;
            this.shakeDuration = 0.08;
            this.ultimateBloomTime = Math.max(this.ultimateBloomTime, 0.06);
            this.ultimateBloomDuration = Math.max(this.ultimateBloomDuration, 0.06);
        } else {
            // Projectile/melee hit feedback
            const base = isBoss ? 0.01 : 0.028;
            this.shakeIntensity = base * (charged ? 1.5 : 1);
            this.shakeDuration = isBoss ? (charged ? 0.26 : 0.22) : (charged ? 0.22 : 0.16);
            this.triggerHitStop(charged ? 0.05 : 0.035);
            // Camera push toward target on every hit
            this.lastPunchOffset.copy(this.character.getForwardDirection()).multiplyScalar(charged ? 0.1 : 0.06);
            // Subtle bloom flash on every hit
            this.ultimateBloomTime = Math.max(this.ultimateBloomTime, charged ? 0.15 : 0.1);
            this.ultimateBloomDuration = Math.max(this.ultimateBloomDuration, charged ? 0.15 : 0.1);
        }
        this.shakeTime = this.shakeDuration;
    }
    
    applyScreenShake() {
        this.camera.position.sub(this.lastShakeOffset);

        if (this.shakeTime <= 0) {
            this.targetShakeOffset.set(0, 0, 0);
        } else {
            this.shakeTime = Math.max(0, this.shakeTime - this.deltaTime);
            const t = this.shakeDuration > 0 ? this.shakeTime / this.shakeDuration : 0;
            const envelope = t * t * (3 - 2 * t);
            const amt = this.shakeIntensity * envelope;
            const time = this.elapsedTime + this.shakeSeed;

            // Lower-frequency blended sine shake: smooth and impactful without jitter.
            this.targetShakeOffset.set(
                amt * (Math.sin(time * 20.0) * 0.72 + Math.sin(time * 31.0 + 1.2) * 0.28),
                amt * (Math.sin(time * 24.0 + 2.0) * 0.88 + Math.sin(time * 36.0 + 0.35) * 0.22),
                amt * (Math.sin(time * 17.0 + 0.65) * 0.18)
            );
        }

        const blend = Math.min(1, this.deltaTime * 22);
        this.lastShakeOffset.lerp(this.targetShakeOffset, blend);
        if (this.lastShakeOffset.lengthSq() < 1e-7) this.lastShakeOffset.set(0, 0, 0);
        this.camera.position.add(this.lastShakeOffset);
    }
    
    applyPunchPush() {
        this.camera.position.sub(this.lastPunchOffset);
        this.lastPunchOffset.multiplyScalar(this.punchDecay);
        this.camera.position.add(this.lastPunchOffset);
    }
}

