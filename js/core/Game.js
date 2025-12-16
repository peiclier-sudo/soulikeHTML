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
        
        // Quality settings
        this.qualitySettings = {
            shadows: 'medium',
            particles: 'medium',
            postProcessing: true
        };
        
        this.mouseSensitivity = 1.0;
        
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
            powerPreference: 'high-performance'
        });
        
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }

    initScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2e);

        // Atmospheric fog - reduced density for better visibility
        this.scene.fog = new THREE.FogExp2(0x2a2a4e, 0.008);
    }
    
    initCamera() {
        this.camera = new THREE.PerspectiveCamera(
            70,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 1.7, 5);
    }
    
    initPostProcessing() {
        this.composer = new EffectComposer(this.renderer);
        
        const renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);
        
        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            0.5,  // strength
            0.4,  // radius
            0.85  // threshold
        );
        this.composer.addPass(this.bloomPass);
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
        
        // Player character
        this.character = new Character(this.scene, this.camera, this.assetLoader, this.gameState);
        
        // Combat system
        this.combatSystem = new CombatSystem(this.scene, this.character, this.gameState);
        
        // Particle effects
        this.particleSystem = new ParticleSystem(this.scene);
        
        // UI Manager
        this.uiManager = new UIManager(this.gameState);
    }
    
    start() {
        this.isRunning = true;
        this.isPaused = false;
        this.clock.start();
        this.gameLoop();
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
        
        // Update FPS counter
        this.updateFPS();
        
        // Update all systems
        this.update();
        
        // Render
        this.render();
    }
    
    update() {
        const input = this.inputManager.getInput();
        
        // Update character with input
        this.character.update(this.deltaTime, input, this.mouseSensitivity);
        
        // Update combat
        this.combatSystem.update(this.deltaTime, input);
        
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
            low: 512,
            medium: 1024,
            high: 2048
        };

        const resolution = resolutions[quality] || 1024;
        this.lightingSystem?.updateShadowResolution(resolution);
    }

    setMouseSensitivity(value) {
        this.mouseSensitivity = value;
    }
}

