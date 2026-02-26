/**
 * Elden Flame - Dark Souls Web Experience
 * Main Entry Point
 */

import { Game } from './core/Game.js';
import { AssetLoader } from './core/AssetLoader.js';
import { KIT_DEFINITIONS, CLASS_INFO, getKitsByClass } from './kits/KitDefinitions.js';

// Global game instance
let game = null;
let assetLoader = null;
let canvas = null;

/** Currently selected kit id from the class selection screen */
let selectedKitId = null;

// Initialize the game
async function init() {
    try {
        // Get DOM elements
        canvas = document.getElementById('game-canvas');
        const loadingScreen = document.getElementById('loading-screen');
        const startScreen = document.getElementById('start-screen');
        const loadingBar = document.getElementById('loading-bar');
        const loadingText = document.getElementById('loading-text');

        // Create asset loader with progress callback
        assetLoader = new AssetLoader((progress, message) => {
            loadingBar.style.width = `${progress * 100}%`;
            loadingText.textContent = message;
        });

        // Load all game assets
        await assetLoader.loadAll();

        // Hide loading screen, show start screen
        loadingScreen.style.display = 'none';
        startScreen.style.display = 'flex';

        // Setup start button → goes to class selection
        const startButton = document.getElementById('start-button');
        startButton.addEventListener('click', () => {
            startScreen.style.display = 'none';
            showClassSelection();
        });

        // Setup pause menu buttons
        setupMenuButtons();

        // Setup keyboard shortcuts
        setupKeyboardShortcuts();

        // Setup class selection UI
        setupClassSelection();

        console.log('Elden Flame initialized successfully');

    } catch (error) {
        console.error('Failed to initialize game:', error);
        document.getElementById('loading-text').textContent =
            'Failed to load. Please refresh the page.';
    }
}

// ─── Class Selection UI ────────────────────────────────────────

function showClassSelection() {
    const screen = document.getElementById('class-select-screen');
    screen.style.display = 'flex';

    // Reset to step 1
    document.getElementById('class-step').style.display = '';
    document.getElementById('kit-step').style.display = 'none';
    document.getElementById('confirm-step').style.display = 'none';
}

function setupClassSelection() {
    const classCardsContainer = document.getElementById('class-cards');
    const kitCardsContainer = document.getElementById('kit-cards');

    // Build class cards (Step 1)
    for (const [classId, info] of Object.entries(CLASS_INFO)) {
        const card = document.createElement('div');
        card.className = 'class-card';
        card.innerHTML = `
            <span class="class-card-icon">${info.icon}</span>
            <div class="class-card-name">${info.name.toUpperCase()}</div>
            <div class="class-card-desc">${info.description}</div>
        `;
        card.addEventListener('click', () => showKitStep(classId));
        classCardsContainer.appendChild(card);
    }

    // Back buttons
    document.getElementById('kit-back-btn').addEventListener('click', () => {
        document.getElementById('kit-step').style.display = 'none';
        document.getElementById('class-step').style.display = '';
        document.getElementById('class-step').style.animation = 'none';
        void document.getElementById('class-step').offsetWidth;
        document.getElementById('class-step').style.animation = '';
    });

    document.getElementById('confirm-back-btn').addEventListener('click', () => {
        document.getElementById('confirm-step').style.display = 'none';
        document.getElementById('kit-step').style.display = '';
        document.getElementById('kit-step').style.animation = 'none';
        void document.getElementById('kit-step').offsetWidth;
        document.getElementById('kit-step').style.animation = '';
    });

    // Confirm button → start game with selected kit
    document.getElementById('confirm-btn').addEventListener('click', () => {
        if (!selectedKitId) return;
        document.getElementById('class-select-screen').style.display = 'none';
        startGameWithKit(selectedKitId);
    });
}

function showKitStep(classId) {
    document.getElementById('class-step').style.display = 'none';
    const kitStep = document.getElementById('kit-step');
    kitStep.style.display = '';
    kitStep.style.animation = 'none';
    void kitStep.offsetWidth;
    kitStep.style.animation = '';

    const container = document.getElementById('kit-cards');
    container.innerHTML = '';

    const kits = getKitsByClass(classId);
    for (const kit of kits) {
        const card = document.createElement('div');
        card.className = 'kit-card';
        card.innerHTML = `
            <span class="kit-card-icon">${kit.icon}</span>
            <div class="kit-card-name">${kit.name.toUpperCase()}</div>
            <div class="kit-card-desc">${kit.description}</div>
            <div class="kit-card-stats">
                <div class="kit-stat"><span class="kit-stat-value">${kit.stats.health}</span><span class="kit-stat-label">HP</span></div>
                <div class="kit-stat"><span class="kit-stat-value">${kit.stats.stamina}</span><span class="kit-stat-label">Stamina</span></div>
                <div class="kit-stat"><span class="kit-stat-value">${kit.stats.armor}</span><span class="kit-stat-label">Armor</span></div>
                <div class="kit-stat"><span class="kit-stat-value">${kit.weapon.damage}</span><span class="kit-stat-label">ATK</span></div>
                <div class="kit-stat"><span class="kit-stat-value">${kit.stats.runSpeed}</span><span class="kit-stat-label">Speed</span></div>
            </div>
        `;
        card.addEventListener('click', () => showConfirmStep(kit));
        container.appendChild(card);
    }
}

function showConfirmStep(kit) {
    selectedKitId = kit.id;
    document.getElementById('kit-step').style.display = 'none';
    const confirmStep = document.getElementById('confirm-step');
    confirmStep.style.display = '';
    confirmStep.style.animation = 'none';
    void confirmStep.offsetWidth;
    confirmStep.style.animation = '';

    // Preview header
    const preview = document.getElementById('kit-preview');
    preview.innerHTML = `
        <h2>${kit.icon} ${kit.name.toUpperCase()}</h2>
        <p>${kit.description}</p>
    `;

    // Stats
    const statsEl = document.getElementById('kit-preview-stats');
    statsEl.innerHTML = `
        <div class="preview-stat"><span class="preview-stat-value">${kit.stats.health}</span><span class="preview-stat-label">Health</span></div>
        <div class="preview-stat"><span class="preview-stat-value">${kit.stats.stamina}</span><span class="preview-stat-label">Stamina</span></div>
        <div class="preview-stat"><span class="preview-stat-value">${kit.stats.armor}</span><span class="preview-stat-label">Armor</span></div>
        <div class="preview-stat"><span class="preview-stat-value">${kit.weapon.damage}</span><span class="preview-stat-label">ATK</span></div>
        <div class="preview-stat"><span class="preview-stat-value">${kit.stats.runSpeed}</span><span class="preview-stat-label">Speed</span></div>
        <div class="preview-stat"><span class="preview-stat-value">${kit.weapon.name}</span><span class="preview-stat-label">Weapon</span></div>
    `;

    // Abilities
    const kc = kit.combat;
    const abilitiesEl = document.getElementById('kit-preview-abilities');
    abilitiesEl.innerHTML = `
        <div class="preview-ability"><div class="preview-ability-key">LMB</div><div class="preview-ability-name">Basic Attack</div></div>
        <div class="preview-ability"><div class="preview-ability-key">RMB</div><div class="preview-ability-name">Charged Attack</div></div>
        <div class="preview-ability"><div class="preview-ability-key">Q</div><div class="preview-ability-name">${kc.abilityQ?.name ?? '???'}</div></div>
        <div class="preview-ability"><div class="preview-ability-key">E</div><div class="preview-ability-name">${kc.abilityE?.name ?? '???'}</div></div>
        <div class="preview-ability"><div class="preview-ability-key">X</div><div class="preview-ability-name">${kc.abilityX?.name ?? '???'}</div></div>
        <div class="preview-ability"><div class="preview-ability-key">C</div><div class="preview-ability-name">${kc.abilityC?.name ?? '???'}</div></div>
        <div class="preview-ability"><div class="preview-ability-key">F</div><div class="preview-ability-name">${kc.abilityF?.name ?? '???'}</div></div>
    `;
}

function startGameWithKit(kitId) {
    // Create or recreate game with selected kit
    if (game) {
        game.stop();
        game = null;
    }
    game = new Game(canvas, assetLoader, kitId);
    window.game = game;

    document.getElementById('hud').style.display = 'block';
    game.start();
    requestAnimationFrame(() => canvas.requestPointerLock());
}

// ─── Menu Buttons ──────────────────────────────────────────────

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
