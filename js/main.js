/**
 * ORDALIE - Main Entry Point
 *
 * Flow: Loading → Character Select → Hub → Fight / Character / Boutique
 */

import { Game } from './core/Game.js';
import { AssetLoader } from './core/AssetLoader.js';
import { KIT_DEFINITIONS, CLASS_INFO, getKitsByClass } from './kits/KitDefinitions.js';
import { RunProgress } from './core/RunProgress.js';
import { HubManager } from './ui/HubManager.js';

// Global game instance
let game = null;
let assetLoader = null;
let canvas = null;
let hubManager = null;

/** Currently selected kit id from the class selection screen */
let selectedKitId = null;

/** Currently active character id */
let activeCharId = null;

// ─── Account UI helpers ─────────────────────────────────────────

function refreshAccountUI() {
    const acct = RunProgress.getAccount();
    const noneEl = document.getElementById('account-none');
    const infoEl = document.getElementById('account-info');
    const createEl = document.getElementById('account-create-form');
    const restoreEl = document.getElementById('account-restore-form');
    const codeEl = document.getElementById('account-code-display');
    if (!noneEl) return;
    [noneEl, infoEl, createEl, restoreEl, codeEl].forEach(e => e.style.display = 'none');
    if (acct) {
        infoEl.style.display = '';
        document.getElementById('account-name-text').textContent = acct.name;
    } else {
        noneEl.style.display = '';
    }
}

// ─── Initialization ─────────────────────────────────────────────

async function init() {
    try {
        canvas = document.getElementById('game-canvas');
        const loadingScreen = document.getElementById('loading-screen');
        const loadingBar = document.getElementById('loading-bar');
        const loadingText = document.getElementById('loading-text');

        assetLoader = new AssetLoader((progress, message) => {
            loadingBar.style.width = `${progress * 100}%`;
            loadingText.textContent = message;
        });

        await assetLoader.loadAll();

        // Migrate legacy save data to multi-character system
        RunProgress.migrateToCharacters();

        // Create HubManager (once)
        hubManager = new HubManager({
            onStartTower: () => {
                const char = RunProgress.getCharacterById(activeCharId);
                if (!char) return;
                const saved = RunProgress.getSavedRun();
                if (saved?.characterId === activeCharId) {
                    startGameWithKit(saved.kitId, saved);
                } else {
                    startGameWithKit(char.kitId);
                }
            },
            onBackToCharSelect: () => {
                showCharacterSelect();
            }
        });

        // Hide loading, show character select
        loadingScreen.style.display = 'none';
        showCharacterSelect();

        setupMenuButtons();
        setupKeyboardShortcuts();
        setupClassSelection();
        setupAccountUI();
        setupTowerScreen();
        setupCharTabs();

        console.log('ORDALIE initialized successfully');
    } catch (error) {
        console.error('Failed to initialize game:', error);
        document.getElementById('loading-text').textContent =
            'Failed to load. Please refresh the page.';
    }
}

// ─── Character Select (Page 1) ──────────────────────────────────

function showCharacterSelect() {
    hideAllScreens();
    const screen = document.getElementById('char-select-screen');
    screen.style.display = 'flex';
    renderCharacterGrid();
    refreshAccountUI();
    // Update souls display
    const pd = RunProgress.getPlayerData();
    const soulsEl = document.getElementById('charselect-souls');
    if (soulsEl) soulsEl.textContent = `${pd.souls} SOULS`;
}

function renderCharacterGrid() {
    const grid = document.getElementById('char-select-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const chars = RunProgress.getCharacters();

    for (const char of chars) {
        const kit = KIT_DEFINITIONS[char.kitId];
        const icon = kit?.icon ?? '\u{1F464}';
        const className = kit?.name ?? char.kitId;
        const savedRun = RunProgress.getSavedRun();
        const hasRun = savedRun?.characterId === char.id;

        const slot = document.createElement('div');
        slot.className = 'char-slot';
        slot.innerHTML = `
            <div class="char-slot-cylinder">
                <span class="char-slot-icon">${icon}</span>
                <button class="char-slot-delete" title="Delete character">\u2715</button>
            </div>
            <div class="char-slot-name">${char.name}</div>
            <div class="char-slot-class">${className}</div>
            ${hasRun ? `<div class="char-slot-run">Boss ${savedRun.bossesDefeated + 1}</div>` : ''}
        `;

        // Click cylinder → select character → hub
        slot.querySelector('.char-slot-cylinder').addEventListener('click', (e) => {
            if (e.target.closest('.char-slot-delete')) return;
            selectCharacter(char.id);
        });

        // Delete button
        slot.querySelector('.char-slot-delete').addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`Delete ${char.name}?`)) {
                RunProgress.deleteCharacter(char.id);
                renderCharacterGrid();
            }
        });

        grid.appendChild(slot);
    }

    // Create button (only if < 6)
    if (chars.length < 6) {
        const createSlot = document.createElement('div');
        createSlot.className = 'char-slot char-slot-create';
        createSlot.id = 'char-create-btn';
        createSlot.innerHTML = `
            <div class="char-slot-cylinder">
                <span class="char-slot-icon">+</span>
            </div>
            <div class="char-slot-name">CREATE NEW</div>
        `;
        createSlot.addEventListener('click', () => {
            document.getElementById('char-select-screen').style.display = 'none';
            showClassSelection();
        });
        grid.appendChild(createSlot);
    }
}

function selectCharacter(charId) {
    const char = RunProgress.getCharacterById(charId);
    if (!char) return;
    activeCharId = charId;
    selectedKitId = char.kitId;
    hubManager.setActiveCharacter(charId, char.kitId);
    document.getElementById('char-select-screen').style.display = 'none';
    hubManager.showHub();
}

// ─── Class Selection (character creation) ───────────────────────

function showClassSelection() {
    const screen = document.getElementById('class-select-screen');
    screen.style.display = 'flex';
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

    // Confirm button → create character and go to hub
    document.getElementById('confirm-btn').addEventListener('click', () => {
        if (!selectedKitId) return;
        const nameInput = document.getElementById('char-name-input');
        const name = nameInput?.value.trim() || KIT_DEFINITIONS[selectedKitId]?.name || 'Champion';
        const char = RunProgress.createCharacter(name, selectedKitId);
        if (!char) return;
        nameInput.value = '';
        document.getElementById('class-select-screen').style.display = 'none';
        selectCharacter(char.id);
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

    document.getElementById('kit-preview').innerHTML = `
        <h2>${kit.icon} ${kit.name.toUpperCase()}</h2>
        <p>${kit.description}</p>
    `;

    document.getElementById('kit-preview-stats').innerHTML = `
        <div class="preview-stat"><span class="preview-stat-value">${kit.stats.health}</span><span class="preview-stat-label">Health</span></div>
        <div class="preview-stat"><span class="preview-stat-value">${kit.stats.stamina}</span><span class="preview-stat-label">Stamina</span></div>
        <div class="preview-stat"><span class="preview-stat-value">${kit.stats.armor}</span><span class="preview-stat-label">Armor</span></div>
        <div class="preview-stat"><span class="preview-stat-value">${kit.weapon.damage}</span><span class="preview-stat-label">ATK</span></div>
        <div class="preview-stat"><span class="preview-stat-value">${kit.stats.runSpeed}</span><span class="preview-stat-label">Speed</span></div>
        <div class="preview-stat"><span class="preview-stat-value">${kit.weapon.name}</span><span class="preview-stat-label">Weapon</span></div>
    `;

    const kc = kit.combat;
    document.getElementById('kit-preview-abilities').innerHTML = `
        <div class="preview-ability"><div class="preview-ability-key">LMB</div><div class="preview-ability-name">Basic Attack</div></div>
        <div class="preview-ability"><div class="preview-ability-key">RMB</div><div class="preview-ability-name">Charged Attack</div></div>
        <div class="preview-ability"><div class="preview-ability-key">Q</div><div class="preview-ability-name">${kc.abilityQ?.name ?? '???'}</div></div>
        <div class="preview-ability"><div class="preview-ability-key">E</div><div class="preview-ability-name">${kc.abilityE?.name ?? '???'}</div></div>
        <div class="preview-ability"><div class="preview-ability-key">X</div><div class="preview-ability-name">${kc.abilityX?.name ?? '???'}</div></div>
        <div class="preview-ability"><div class="preview-ability-key">C</div><div class="preview-ability-name">${kc.abilityC?.name ?? '???'}</div></div>
        <div class="preview-ability"><div class="preview-ability-key">F</div><div class="preview-ability-name">${kc.abilityF?.name ?? '???'}</div></div>
    `;

    // Suggest a default name
    const nameInput = document.getElementById('char-name-input');
    if (nameInput && !nameInput.value) nameInput.placeholder = kit.name;
}

// ─── Character Tabs ─────────────────────────────────────────────

function setupCharTabs() {
    document.getElementById('char-tabs')?.addEventListener('click', (e) => {
        const tab = e.target.closest('.char-tab');
        if (!tab) return;
        document.querySelectorAll('.char-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.dataset.tab;
        document.getElementById('char-tab-gear').style.display = target === 'gear' ? '' : 'none';
        document.getElementById('char-tab-talent').style.display = target === 'talent' ? '' : 'none';
    });
}

// ─── Game Start ─────────────────────────────────────────────────

function startGameWithKit(kitId, savedRun = null) {
    if (game) { game.stop(); game = null; }

    if (!savedRun) {
        RunProgress.startNewRun(kitId, activeCharId);
    }

    game = new Game(canvas, assetLoader, kitId);
    window.game = game;

    if (hubManager) {
        game.applyStatBonuses(hubManager.getStatBonuses());
        if (game.applyTalentEffects) {
            game.applyTalentEffects(hubManager.getTalentEffects());
        }
    }

    if (savedRun) game.restoreRun(savedRun);

    game.gameState.on('playerDeath', () => {
        RunProgress.onPlayerDeath();
        setTimeout(() => {
            document.getElementById('death-screen').style.display = 'none';
            document.getElementById('hud').style.display = 'none';
            if (game) { game.stop(); game = null; }
            hubManager.showHub();
        }, 3000);
    });

    document.getElementById('hud').style.display = 'block';
    game.start();
    // No pointer lock — cursor stays visible for click-to-move
}

// ─── Menu Buttons ───────────────────────────────────────────────

function setupMenuButtons() {
    document.getElementById('resume-button')?.addEventListener('click', () => {
        document.getElementById('pause-menu').style.display = 'none';
        game?.resume();
    });

    document.getElementById('settings-button')?.addEventListener('click', () => {
        document.getElementById('pause-menu').style.display = 'none';
        document.getElementById('settings-panel').style.display = 'flex';
    });

    document.getElementById('settings-back')?.addEventListener('click', () => {
        document.getElementById('settings-panel').style.display = 'none';
        document.getElementById('pause-menu').style.display = 'flex';
    });

    document.getElementById('quit-button')?.addEventListener('click', () => {
        document.getElementById('pause-menu').style.display = 'none';
        document.getElementById('hud').style.display = 'none';
        game?.stop();
        hubManager.showHub();
    });

    setupSettings();
}

function setupSettings() {
    document.getElementById('shadow-quality')?.addEventListener('change', (e) => {
        game?.setQualitySetting('shadows', e.target.value);
    });
    document.getElementById('particle-quality')?.addEventListener('change', (e) => {
        game?.setQualitySetting('particles', e.target.value);
    });
    document.getElementById('post-processing')?.addEventListener('change', (e) => {
        game?.setQualitySetting('postProcessing', e.target.checked);
    });
    document.getElementById('motion-smoothing')?.addEventListener('change', (e) => {
        game?.setQualitySetting('motionSmoothing', e.target.checked);
    });
    document.getElementById('mouse-sensitivity')?.addEventListener('input', (e) => {
        game?.setMouseSensitivity(parseFloat(e.target.value) / 5);
    });
}

function setupTowerScreen() {
    document.getElementById('tower-continue-btn')?.addEventListener('click', () => {
        if (game) game.proceedFromTower();
    });
    document.getElementById('tower-quit-btn')?.addEventListener('click', () => {
        document.getElementById('tower-screen').style.display = 'none';
        document.getElementById('hud').style.display = 'none';
        game?.stop();
        hubManager.showHub();
    });
}

function setupAccountUI() {
    const noneEl    = document.getElementById('account-none');
    const infoEl    = document.getElementById('account-info');
    const createEl  = document.getElementById('account-create-form');
    const restoreEl = document.getElementById('account-restore-form');
    const codeEl    = document.getElementById('account-code-display');

    function showPanel(el) {
        [noneEl, infoEl, createEl, restoreEl, codeEl].forEach(e => e.style.display = 'none');
        el.style.display = '';
    }

    // Account overlay back button
    document.getElementById('account-back-btn')?.addEventListener('click', () => {
        document.getElementById('account-overlay').style.display = 'none';
        showCharacterSelect();
    });

    // Open account overlay
    document.getElementById('charselect-account-btn')?.addEventListener('click', () => {
        document.getElementById('char-select-screen').style.display = 'none';
        document.getElementById('account-overlay').style.display = 'flex';
        refreshAccountUI();
    });

    document.getElementById('create-account-btn')?.addEventListener('click', () => {
        showPanel(createEl);
        document.getElementById('account-name-input').value = '';
        document.getElementById('account-name-input').focus();
    });

    document.getElementById('restore-account-btn')?.addEventListener('click', () => {
        showPanel(restoreEl);
        document.getElementById('account-code-input').value = '';
        document.getElementById('account-restore-error').style.display = 'none';
        document.getElementById('account-code-input').focus();
    });

    document.getElementById('account-create-confirm')?.addEventListener('click', () => {
        const name = document.getElementById('account-name-input').value.trim();
        if (!name) return;
        const code = RunProgress.createAccount(name);
        document.getElementById('recovery-code-text').textContent = code;
        showPanel(codeEl);
    });

    document.getElementById('account-create-cancel')?.addEventListener('click', () => refreshAccountUI());

    document.getElementById('account-restore-confirm')?.addEventListener('click', () => {
        const code = document.getElementById('account-code-input').value.trim();
        if (!code) return;
        const result = RunProgress.restoreFromCode(code);
        if (result.success) {
            refreshAccountUI();
        } else {
            const errEl = document.getElementById('account-restore-error');
            errEl.textContent = result.error;
            errEl.style.display = '';
        }
    });

    document.getElementById('account-restore-cancel')?.addEventListener('click', () => refreshAccountUI());

    document.getElementById('show-code-btn')?.addEventListener('click', () => {
        const code = RunProgress.generateRecoveryCode();
        document.getElementById('recovery-code-text').textContent = code;
        showPanel(codeEl);
    });

    document.getElementById('copy-code-btn')?.addEventListener('click', () => {
        const code = document.getElementById('recovery-code-text').textContent;
        navigator.clipboard.writeText(code).then(() => {
            document.getElementById('copy-code-btn').textContent = 'COPIED!';
            setTimeout(() => {
                document.getElementById('copy-code-btn').textContent = 'COPY CODE';
            }, 2000);
        });
    });

    document.getElementById('close-code-btn')?.addEventListener('click', () => refreshAccountUI());
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
            } else {
                game.pause();
                document.getElementById('pause-menu').style.display = 'flex';
            }
        }
    });
}

// ─── Helpers ────────────────────────────────────────────────────

function hideAllScreens() {
    const ids = [
        'char-select-screen', 'account-overlay', 'class-select-screen',
        'hub-screen', 'fight-screen', 'boutique-screen', 'character-screen'
    ];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
}

// Pointer lock no longer used — cursor stays visible for click-to-move

window.addEventListener('resize', () => { game?.handleResize(); });

// Start initialization
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

window.game = game;
