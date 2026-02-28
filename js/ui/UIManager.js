/**
 * UI Manager - Handles HUD updates and damage numbers
 */

import * as THREE from 'three';

export class UIManager {
    constructor(gameState, camera = null, combatSystem = null, character = null) {
        this.gameState = gameState;
        this.camera = camera;
        this.combatSystem = combatSystem;
        this.character = character;
        this._kitApplied = false;
        this._projectedPos = new THREE.Vector3();
        this._damageAnchorScreenCache = new Map();
        this._canvas = document.getElementById('game-canvas');
        this._abilityReadyState = new Map();
        this._superDashWasReady = true;
        this._ultimateWasReady = false;

        // Cache DOM elements
        this.elements = {
            healthFill: document.getElementById('health-fill'),
            healthText: document.getElementById('health-text'),
            staminaFill: document.getElementById('stamina-fill'),
            staminaText: document.getElementById('stamina-text'),
            chargeBar: document.getElementById('charge-bar'),
            chargeFill: document.getElementById('charge-fill'),
            chargeReady: document.getElementById('charge-ready'),
            damageNumbers: document.getElementById('damage-numbers'),
            bossHealth: document.getElementById('boss-health'),
            bossHealthFill: document.getElementById('boss-health-fill'),
            bossName: document.getElementById('boss-name'),
            deathScreen: document.getElementById('death-screen'),
            ultimateBar: document.getElementById('ultimate-bar'),
            ultimateFill: document.getElementById('ultimate-fill'),
            superDashBar: document.getElementById('superdash-bar'),
            superDashFill: document.getElementById('superdash-fill'),
            noBloodEssence: document.getElementById('no-blood-essence'),
            reticule: document.getElementById('reticule')
        };

        // Cache ability box + timer elements (avoids 8-10 getElementById per frame)
        this._abilityElements = {};
        for (const id of ['ability-eruption', 'ability-nova', 'ability-shield', 'ability-potion']) {
            this._abilityElements[id] = {
                box: document.getElementById(id),
                timer: document.getElementById(`${id}-timer`)
            };
        }

        // Previous state tracking to avoid redundant DOM writes
        this._prevHealthPct = -1;
        this._prevHealthLow = false;
        this._prevHealthText = '';
        this._prevStaminaPct = -1;
        this._prevStaminaLow = false;
        this._prevStaminaText = '';
        this._prevUltimatePct = -1;
        this._prevSuperDashPct = -1;
        this._prevChargeVisible = false;
        this._prevChargePct = -1;
        this._prevChargeReady = false;
        this._prevBossPct = -1;

        // Damage number pool (reuse DOM elements instead of create/destroy)
        this._dmgPool = [];
        this._dmgPoolSize = 30;
        for (let i = 0; i < this._dmgPoolSize; i++) {
            const el = document.createElement('div');
            el.style.display = 'none';
            this.elements.damageNumbers?.appendChild(el);
            this._dmgPool.push(el);
        }
        this._dmgPoolIdx = 0;

        // Cache hit overlay element
        this._hitOverlay = document.getElementById('player-hit-overlay');
        if (!this._hitOverlay) {
            this._hitOverlay = document.createElement('div');
            this._hitOverlay.id = 'player-hit-overlay';
            document.body.appendChild(this._hitOverlay);
        }

        // Subscribe to game events
        this.setupEventListeners();

    }



    _pulseCooldownElement(el) {
        if (!el) return;
        el.classList.remove('cooldown-ready-pulse');
        void el.offsetWidth;
        el.classList.add('cooldown-ready-pulse');
        setTimeout(() => el.classList.remove('cooldown-ready-pulse'), 360);

        if (this.elements.reticule) {
            this.elements.reticule.classList.remove('reticule-flash-ready');
            void this.elements.reticule.offsetWidth;
            this.elements.reticule.classList.add('reticule-flash-ready');
            setTimeout(() => this.elements.reticule?.classList.remove('reticule-flash-ready'), 260);
        }
    }
    /** Update HUD ability labels to match the selected kit */
    applyKitToHud() {
        const kit = this.gameState.selectedKit;
        if (!kit || this._kitApplied) return;
        this._kitApplied = true;
        const kc = kit.combat || {};
        const names = {
            'ability-eruption': kc.abilityQ?.name ?? 'Eruption',
            'ability-nova': kc.abilityX?.name ?? 'Nova',
            'ability-shield': kc.abilityC?.name ?? 'Shield'
        };
        for (const [id, name] of Object.entries(names)) {
            const el = this._abilityElements[id]?.box;
            if (el) {
                const nameEl = el.querySelector('.ability-name');
                if (nameEl) nameEl.textContent = name;
            }
        }
    }

    setupEventListeners() {
        // Damage number events
        this.gameState.on('damageNumber', (data) => {
            this.showDamageNumber(data.position, data.damage, data.isCritical, data.anchorId, data.kind);
        });

        // Health change events
        this.gameState.on('healthChanged', (health) => {
            const prevHealth = this._lastHealth ?? health;
            this.updateHealthBar(health);
            if (health < prevHealth) {
                this.showPlayerHitFeedback(prevHealth - health);
            }
            this._lastHealth = health;
        });

        // Stamina change events
        this.gameState.on('staminaChanged', (stamina) => {
            this.updateStaminaBar(stamina);
        });

        // Ultimate charge events
        this.gameState.on('ultimateChanged', (charge) => {
            this.updateUltimateBar(charge);
        });

        // Player death
        this.gameState.on('playerDeath', () => {
            this.showDeathScreen();
        });
    }

    update() {
        this.updateHealthBar(this.gameState.player.health);
        this.updateStaminaBar(this.gameState.player.stamina);
        this.updateUltimateBar(this.gameState.player.ultimateCharge);
        this.updateChargeBar();
        this.updateAbilityCooldowns();
    }

    updateAbilityCooldowns() {
        const fmt = (v) => `${Math.max(0, v).toFixed(1)}s`;
        const setBox = (id, ready, text) => {
            const cached = this._abilityElements[id];
            if (!cached || !cached.box || !cached.timer) return;
            const wasReady = this._abilityReadyState.get(id) === true;
            cached.box.dataset.ready = ready ? 'true' : 'false';
            cached.timer.textContent = text;
            if (ready && !wasReady) this._pulseCooldownElement(cached.box);
            this._abilityReadyState.set(id, !!ready);
        };

        const isFrost = this.combatSystem?.isFrostKit;
        const isDagger = this.combatSystem?.isDaggerKit;
        const isBow = this.combatSystem?.isBowRangerKit;
        const fc = this.combatSystem?.frostCombat;
        const dc = this.combatSystem?.daggerCombat;
        const bc = this.combatSystem?.bowRangerCombat;

        // Q ability slot
        const eruptionCd = isDagger ? (dc?.teleportCooldown ?? 0)
            : isBow ? (bc?.recoilShotCooldown ?? 0)
            : isFrost ? (fc?.iceClawCooldown ?? 0)
            : (this.combatSystem?.crimsonEruptionCooldown ?? 0);
        setBox('ability-eruption', eruptionCd <= 0, eruptionCd <= 0 ? 'Ready' : fmt(eruptionCd));

        // X ability slot
        const novaCd = isDagger ? (dc?.toxicFocusCooldown ?? 0)
            : isBow ? (bc?.multiShotCooldown ?? 0)
            : isFrost ? (fc?.stalactiteCooldown ?? 0)
            : (this.combatSystem?.bloodNovaCooldown ?? 0);
        setBox('ability-nova', novaCd <= 0, novaCd <= 0 ? 'Ready' : fmt(novaCd));

        // C ability slot
        if (isDagger) {
            const vanishCd = dc?.vanishCooldown ?? 0;
            setBox('ability-shield', vanishCd <= 0, vanishCd <= 0 ? 'Ready' : fmt(vanishCd));
        } else if (isBow) {
            const zoneCd = bc?.damageZoneCooldown ?? 0;
            setBox('ability-shield', zoneCd <= 0, zoneCd <= 0 ? 'Ready' : fmt(zoneCd));
        } else {
            const shieldActive = this.gameState.combat.shieldActive;
            const shieldTime = this.gameState.combat.shieldTimeRemaining ?? 0;
            setBox('ability-shield', !shieldActive, shieldActive ? fmt(shieldTime) : 'Ready');
        }

        const potionCd = this.gameState.player.drinkPotionCooldown ?? 0;
        const potionCount = this.gameState.player.healthPotions ?? 0;
        if (potionCount <= 0) setBox('ability-potion', false, 'Empty');
        else setBox('ability-potion', potionCd <= 0, potionCd <= 0 ? `Ready x${potionCount}` : `${fmt(potionCd)} x${potionCount}`);

        const sDashCd = this.character?.superDashCooldown ?? 0;
        const sDashMax = this.character?.superDashCooldownDuration ?? 20;
        const sDashPct = sDashCd <= 0 ? 100 : Math.max(0, 100 - (sDashCd / sDashMax) * 100);
        const sDashRounded = (sDashPct + 0.5) | 0;
        if (this.elements.superDashFill && sDashRounded !== this._prevSuperDashPct) {
            this.elements.superDashFill.style.width = `${sDashPct}%`;
            this._prevSuperDashPct = sDashRounded;
        }
        const superReady = sDashCd <= 0 && this.character?.isSuperDashing !== true;
        if (this.elements.superDashBar) {
            this.elements.superDashBar.classList.toggle('ready', superReady);
            if (superReady && !this._superDashWasReady) this._pulseCooldownElement(this.elements.superDashBar);
        }
        this._superDashWasReady = superReady;
    }

    showNoBloodEssenceFeedback() {
        const popup = this.elements.noBloodEssence;
        const reticule = this.elements.reticule;
        if (popup) {
            popup.style.display = 'block';
            setTimeout(() => {
                popup.style.display = 'none';
            }, 800);
        }
        if (reticule) {
            reticule.classList.add('reticule-flash-red');
            setTimeout(() => {
                reticule.classList.remove('reticule-flash-red');
            }, 250);
        }
    }

    updateHealthBar(health) {
        const maxHealth = this.gameState.player.maxHealth;
        const percentage = (health / maxHealth) * 100;
        const pctRounded = (percentage + 0.5) | 0;

        if (this.elements.healthFill && pctRounded !== this._prevHealthPct) {
            this.elements.healthFill.style.width = `${percentage}%`;
            this._prevHealthPct = pctRounded;

            const isLow = percentage <= 25;
            if (isLow !== this._prevHealthLow) {
                this.elements.healthFill.style.animation = isLow ? 'pulse 0.5s infinite' : 'none';
                this._prevHealthLow = isLow;
            }
        }

        if (this.elements.healthText) {
            const text = `${Math.ceil(health)}/${maxHealth}`;
            if (text !== this._prevHealthText) {
                this.elements.healthText.textContent = text;
                this._prevHealthText = text;
            }
        }
    }

    showPlayerHitFeedback(damageTaken = 0) {
        const overlay = this._hitOverlay;
        if (overlay) {
            overlay.classList.remove('hit-flash');
            void overlay.offsetWidth;
            overlay.classList.add('hit-flash');
        }

        if (this.elements.reticule) {
            this.elements.reticule.classList.add('reticule-flash-red');
            setTimeout(() => this.elements.reticule?.classList.remove('reticule-flash-red'), 220);
        }

        // Reuse pooled damage element for player hit text
        const dmgEl = this._acquireDmgElement();
        dmgEl.className = 'player-damage-taken';
        dmgEl.textContent = `-${Math.ceil(damageTaken)}`;
        dmgEl.style.left = '50%';
        dmgEl.style.top = '58%';
        dmgEl.style.display = '';
        setTimeout(() => { dmgEl.style.display = 'none'; }, 700);
    }

    updateStaminaBar(stamina) {
        const maxStamina = this.gameState.player.maxStamina;
        const percentage = (stamina / maxStamina) * 100;
        const pctRounded = (percentage + 0.5) | 0;

        if (this.elements.staminaFill && pctRounded !== this._prevStaminaPct) {
            this.elements.staminaFill.style.width = `${percentage}%`;
            this._prevStaminaPct = pctRounded;

            const isLow = percentage <= 10;
            if (isLow !== this._prevStaminaLow) {
                this.elements.staminaFill.style.opacity = isLow ? '0.5' : '1';
                this._prevStaminaLow = isLow;
            }
        }

        if (this.elements.staminaText) {
            const text = `${Math.ceil(stamina)}/${maxStamina}`;
            if (text !== this._prevStaminaText) {
                this.elements.staminaText.textContent = text;
                this._prevStaminaText = text;
            }
        }
    }

    updateUltimateBar(charge) {
        if (this.elements.ultimateFill) {
            const pct = Math.min(100, Math.max(0, charge));
            const pctRounded = (pct + 0.5) | 0;
            if (pctRounded !== this._prevUltimatePct) {
                this.elements.ultimateFill.style.width = `${pct}%`;
                this._prevUltimatePct = pctRounded;
            }
        }
        if (this.elements.ultimateBar) {
            const ready = charge >= 100;
            this.elements.ultimateBar.classList.toggle('ready', ready);
            if (ready && !this._ultimateWasReady) this._pulseCooldownElement(this.elements.ultimateBar);
            this._ultimateWasReady = ready;
        }
    }

    updateChargeBar() {
        const combat = this.gameState.combat;
        const chargeBar = this.elements.chargeBar;
        const chargeFill = this.elements.chargeFill;

        if (!chargeBar || !chargeFill) return;

        const visible = combat.isCharging || combat.isChargedAttacking;
        if (visible !== this._prevChargeVisible) {
            chargeBar.style.display = visible ? 'block' : 'none';
            this._prevChargeVisible = visible;
        }
        if (visible) {
            const chargeVal = combat.isChargedAttacking ? combat.releasedCharge : combat.chargeTimer;
            const pct = (chargeVal / combat.chargeDuration) * 100;
            const pctRounded = (pct + 0.5) | 0;
            if (pctRounded !== this._prevChargePct) {
                chargeFill.style.width = `${pct}%`;
                this._prevChargePct = pctRounded;
            }
            const isReady = chargeVal >= combat.minChargeToRelease;
            if (isReady !== this._prevChargeReady) {
                chargeBar.classList.toggle('ready', isReady);
                this._prevChargeReady = isReady;
            }
        }
    }

    setCamera(camera) {
        this.camera = camera;
        this.combatSystem = combatSystem;
        this.character = character;
    }

    /** Acquire a damage number element from the pool */
    _acquireDmgElement() {
        const el = this._dmgPool[this._dmgPoolIdx];
        this._dmgPoolIdx = (this._dmgPoolIdx + 1) % this._dmgPoolSize;
        // Reset any pending hide timer
        el.style.display = 'none';
        return el;
    }

    showDamageNumber(worldPosition, damage, isCritical, anchorId = null, kind = null) {
        if (!this.elements.damageNumbers) return;

        const damageEl = this._acquireDmgElement();
        const classes = ['damage-number'];
        if (isCritical) classes.push('critical');
        if (kind) classes.push(kind);
        damageEl.className = classes.join(' ');
        damageEl.textContent = damage.toString();

        let x, y;
        const cached = anchorId ? this._damageAnchorScreenCache.get(anchorId) : null;
        if (cached && performance.now() - cached.time < 140) {
            x = cached.x;
            y = cached.y;
        } else if (this.camera && worldPosition && typeof worldPosition.x === 'number') {
            this._projectedPos.copy(worldPosition).project(this.camera);
            const w = this._canvas?.clientWidth ?? window.innerWidth;
            const h = this._canvas?.clientHeight ?? window.innerHeight;
            x = (this._projectedPos.x * 0.5 + 0.5) * w;
            y = (-this._projectedPos.y * 0.5 + 0.5) * h;
            if (anchorId) this._damageAnchorScreenCache.set(anchorId, { x, y, time: performance.now() });
        } else {
            x = window.innerWidth * 0.5;
            y = window.innerHeight * 0.45;
        }
        damageEl.style.left = `${x}px`;
        damageEl.style.top = `${y}px`;
        damageEl.style.display = '';

        // Re-trigger animation by forcing reflow
        void damageEl.offsetWidth;

        setTimeout(() => { damageEl.style.display = 'none'; }, 1000);
    }

    showBossHealth(bossName, health, maxHealth) {
        if (this.elements.bossHealth) {
            this.elements.bossHealth.style.display = 'block';
        }
        if (this.elements.bossName) {
            this.elements.bossName.textContent = bossName;
        }
        this.updateBossHealth(health, maxHealth);
    }

    updateBossHealth(health, maxHealth) {
        if (this.elements.bossHealthFill) {
            const percentage = (health / maxHealth) * 100;
            const pctRounded = (percentage + 0.5) | 0;
            if (pctRounded !== this._prevBossPct) {
                this.elements.bossHealthFill.style.width = `${percentage}%`;
                this._prevBossPct = pctRounded;
            }
        }
    }

    hideBossHealth() {
        if (this.elements.bossHealth) {
            this.elements.bossHealth.style.display = 'none';
        }
        this._prevBossPct = -1;
    }

    showDeathScreen() {
        if (this.elements.deathScreen) {
            this.elements.deathScreen.style.display = 'flex';

            // After "YOU DIED" animation, return to main menu (roguelike: run ends on death)
            setTimeout(() => {
                this.elements.deathScreen.style.display = 'none';
                document.getElementById('hud').style.display = 'none';
                document.getElementById('start-screen').style.display = 'flex';
                document.exitPointerLock();
                // Game stop + state reset is handled by main.js quit flow
                if (window.game) {
                    window.game.isRunning = false;
                    window.game.clock.stop();
                    window.game.gameState.reset();
                }
                // Refresh continue button (run was cleared on death)
                const btn = document.getElementById('continue-button');
                if (btn) btn.style.display = 'none';
            }, 4000);
        }
    }

    // Show floating text (for pickups, messages, etc.)
    showFloatingText(text, x, y, color = '#00d4ff') {
        const textEl = document.createElement('div');
        textEl.className = 'floating-text';
        textEl.textContent = text;
        textEl.style.cssText = `
            position: absolute;
            left: ${x}px;
            top: ${y}px;
            color: ${color};
            font-size: 1.2rem;
            font-family: 'Cinzel', serif;
            text-shadow: 2px 2px 4px black;
            animation: damageFloat 2s ease-out forwards;
            pointer-events: none;
        `;

        this.elements.damageNumbers?.appendChild(textEl);

        setTimeout(() => textEl.remove(), 2000);
    }
}
