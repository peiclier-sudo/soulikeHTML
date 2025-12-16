/**
 * Elden Flame - Dark Souls Web Experience
 * Main Entry Point
 */

import { Game } from './core/Game.js';
import { AssetLoader } from './core/AssetLoader.js';
import { UIManager } from './ui/UIManager.js';

// Global game instance
let game = null;

// Initialize the game
async function init() {
    try {
        // Get DOM elements
        const canvas = document.getElementById('game-canvas');
        const loadingScreen = document.getElementById('loading-screen');
        const startScreen = document.getElementById('start-screen');
        const loadingBar = document.getElementById('loading-bar');
        const loadingText = document.getElementById('loading-text');

        // Create asset loader with progress callback
        const assetLoader = new AssetLoader((progress, message) => {
            loadingBar.style.width = `${progress * 100}%`;
            loadingText.textContent = message;
        });

        // Load all game assets
        await assetLoader.loadAll();

        // Hide loading screen, show start screen
        loadingScreen.style.display = 'none';
        startScreen.style.display = 'flex';

        // Initialize game (but don't start yet)
        game = new Game(canvas, assetLoader);
        
        // Setup start button
        const startButton = document.getElementById('start-button');
        startButton.addEventListener('click', () => {
            startScreen.style.display = 'none';
            document.getElementById('hud').style.display = 'block';
            game.start();
            
            // Request pointer lock for mouse controls
            canvas.requestPointerLock();
        });

        // Setup pause menu buttons
        setupMenuButtons();

        // Setup keyboard shortcuts
        setupKeyboardShortcuts();

        console.log('Elden Flame initialized successfully');

    } catch (error) {
        console.error('Failed to initialize game:', error);
        document.getElementById('loading-text').textContent = 
            'Failed to load. Please refresh the page.';
    }
}

function setupMenuButtons() {
    const resumeButton = document.getElementById('resume-button');
    const settingsButton = document.getElementById('settings-button');
    const quitButton = document.getElementById('quit-button');
    const settingsBack = document.getElementById('settings-back');

    resumeButton?.addEventListener('click', () => {
        document.getElementById('pause-menu').style.display = 'none';
        game?.resume();
        document.getElementById('game-canvas').requestPointerLock();
    });

    settingsButton?.addEventListener('click', () => {
        document.getElementById('pause-menu').style.display = 'none';
        document.getElementById('settings-panel').style.display = 'flex';
    });

    settingsBack?.addEventListener('click', () => {
        document.getElementById('settings-panel').style.display = 'none';
        document.getElementById('pause-menu').style.display = 'flex';
    });

    quitButton?.addEventListener('click', () => {
        document.getElementById('pause-menu').style.display = 'none';
        document.getElementById('hud').style.display = 'none';
        document.getElementById('start-screen').style.display = 'flex';
        game?.stop();
    });

    // Settings handlers
    setupSettings();
}

function setupSettings() {
    const shadowQuality = document.getElementById('shadow-quality');
    const particleQuality = document.getElementById('particle-quality');
    const postProcessing = document.getElementById('post-processing');
    const mouseSensitivity = document.getElementById('mouse-sensitivity');

    shadowQuality?.addEventListener('change', (e) => {
        game?.setQualitySetting('shadows', e.target.value);
    });

    particleQuality?.addEventListener('change', (e) => {
        game?.setQualitySetting('particles', e.target.value);
    });

    postProcessing?.addEventListener('change', (e) => {
        game?.setQualitySetting('postProcessing', e.target.checked);
    });

    mouseSensitivity?.addEventListener('input', (e) => {
        game?.setMouseSensitivity(parseFloat(e.target.value) / 5);
    });
}

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Escape' && game?.isRunning) {
            if (document.getElementById('settings-panel').style.display === 'flex') {
                document.getElementById('settings-panel').style.display = 'none';
                document.getElementById('pause-menu').style.display = 'flex';
            } else if (document.getElementById('pause-menu').style.display === 'flex') {
                document.getElementById('pause-menu').style.display = 'none';
                game.resume();
                document.getElementById('game-canvas').requestPointerLock();
            } else {
                game.pause();
                document.exitPointerLock();
                document.getElementById('pause-menu').style.display = 'flex';
            }
        }
    });
}

// Handle pointer lock changes
document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && game?.isRunning && !game?.isPaused) {
        game.pause();
        document.getElementById('pause-menu').style.display = 'flex';
    }
});

// Handle window resize
window.addEventListener('resize', () => {
    game?.handleResize();
});

// Start initialization when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Export for debugging
window.game = game;

