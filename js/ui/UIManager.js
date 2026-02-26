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
        this._projectedPos = new THREE.Vector3();
        this._damageAnchorScreenCache = new Map();
        this._canvas = document.getElementById('game-canvas');
        
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
            noBloodEssence: document.getElementById('no-blood-essence'),
            reticule: document.getElementById('reticule')
        };
        
        // Subscribe to game events
        this.setupEventListeners();
        
    }
    
    setupEventListeners() {
        // Damage number events
        this.gameState.on('damageNumber', (data) => {
            this.showDamageNumber(data.position, data.damage, data.isCritical, data.anchorId);
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
            const box = document.getElementById(id);
            const timer = document.getElementById(`${id}-timer`);
            if (!box || !timer) return;
            box.dataset.ready = ready ? 'true' : 'false';
            timer.textContent = text;
        };

        const eruptionCd = this.combatSystem?.crimsonEruptionCooldown ?? 0;
        setBox('ability-eruption', eruptionCd <= 0, eruptionCd <= 0 ? 'Ready' : fmt(eruptionCd));

        const novaCd = this.combatSystem?.bloodNovaCooldown ?? 0;
        setBox('ability-nova', novaCd <= 0, novaCd <= 0 ? 'Ready' : fmt(novaCd));

        const shieldActive = this.gameState.combat.shieldActive;
        const shieldTime = this.gameState.combat.shieldTimeRemaining ?? 0;
        setBox('ability-shield', !shieldActive, shieldActive ? fmt(shieldTime) : 'Ready');

        const potionCd = this.gameState.player.drinkPotionCooldown ?? 0;
        const potionCount = this.gameState.player.healthPotions ?? 0;
        if (potionCount <= 0) setBox('ability-potion', false, 'Empty');
        else setBox('ability-potion', potionCd <= 0, potionCd <= 0 ? `Ready x${potionCount}` : `${fmt(potionCd)} x${potionCount}`);

        const sDashCd = this.character?.superDashCooldown ?? 0;
        const dashing = this.character?.isSuperDashing === true;
        setBox('ability-superdash', sDashCd <= 0 && !dashing, dashing ? 'Dashing' : (sDashCd <= 0 ? 'Ready' : fmt(sDashCd)));
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
        
        if (this.elements.healthFill) {
            this.elements.healthFill.style.width = `${percentage}%`;
            
            // Flash effect when low health
            if (percentage <= 25) {
                this.elements.healthFill.style.animation = 'pulse 0.5s infinite';
            } else {
                this.elements.healthFill.style.animation = 'none';
            }
        }
        
        if (this.elements.healthText) {
            this.elements.healthText.textContent = `${Math.ceil(health)}/${maxHealth}`;
        }
    }

    showPlayerHitFeedback(damageTaken = 0) {
        // Classic playerfeel cue: quick red vignette + center text + reticule pulse.
        let overlay = document.getElementById('player-hit-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'player-hit-overlay';
            document.body.appendChild(overlay);
        }
        overlay.classList.remove('hit-flash');
        // Force restart animation.
        void overlay.offsetWidth;
        overlay.classList.add('hit-flash');

        if (this.elements.reticule) {
            this.elements.reticule.classList.add('reticule-flash-red');
            setTimeout(() => this.elements.reticule?.classList.remove('reticule-flash-red'), 220);
        }

        const dmgEl = document.createElement('div');
        dmgEl.className = 'player-damage-taken';
        dmgEl.textContent = `-${Math.ceil(damageTaken)}`;
        dmgEl.style.left = '50%';
        dmgEl.style.top = '58%';
        this.elements.damageNumbers?.appendChild(dmgEl);
        setTimeout(() => dmgEl.remove(), 700);
    }
    
    updateStaminaBar(stamina) {
        const maxStamina = this.gameState.player.maxStamina;
        const percentage = (stamina / maxStamina) * 100;
        
        if (this.elements.staminaFill) {
            this.elements.staminaFill.style.width = `${percentage}%`;
            
            // Dim when depleted
            if (percentage <= 10) {
                this.elements.staminaFill.style.opacity = '0.5';
            } else {
                this.elements.staminaFill.style.opacity = '1';
            }
        }
        
        if (this.elements.staminaText) {
            this.elements.staminaText.textContent = `${Math.ceil(stamina)}/${maxStamina}`;
        }
    }
    
    updateUltimateBar(charge) {
        if (this.elements.ultimateFill) {
            const pct = Math.min(100, Math.max(0, charge));
            this.elements.ultimateFill.style.width = `${pct}%`;
        }
        if (this.elements.ultimateBar) {
            this.elements.ultimateBar.classList.toggle('ready', charge >= 100);
        }
    }
    
    updateChargeBar() {
        const combat = this.gameState.combat;
        const chargeBar = this.elements.chargeBar;
        const chargeFill = this.elements.chargeFill;

        if (!chargeBar || !chargeFill) return;

        if (combat.isCharging || combat.isChargedAttacking) {
            chargeBar.style.display = 'block';
            const chargeVal = combat.isChargedAttacking ? combat.releasedCharge : combat.chargeTimer;
            const pct = (chargeVal / combat.chargeDuration) * 100;
            chargeFill.style.width = `${pct}%`;
            chargeBar.classList.toggle('ready', chargeVal >= combat.minChargeToRelease);
        } else {
            chargeBar.style.display = 'none';
        }
    }

    setCamera(camera) {
        this.camera = camera;
        this.combatSystem = combatSystem;
        this.character = character;
    }

    showDamageNumber(worldPosition, damage, isCritical, anchorId = null) {
        if (!this.elements.damageNumbers) return;

        const damageEl = document.createElement('div');
        damageEl.className = `damage-number ${isCritical ? 'critical' : ''}`;
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

        this.elements.damageNumbers.appendChild(damageEl);

        setTimeout(() => damageEl.remove(), 1000);
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
            this.elements.bossHealthFill.style.width = `${percentage}%`;
        }
    }
    
    hideBossHealth() {
        if (this.elements.bossHealth) {
            this.elements.bossHealth.style.display = 'none';
        }
    }
    
    showDeathScreen() {
        if (this.elements.deathScreen) {
            this.elements.deathScreen.style.display = 'flex';
            
            // Hide after animation and reset
            setTimeout(() => {
                this.elements.deathScreen.style.display = 'none';
                this.gameState.reset();
                // Could trigger respawn here
            }, 4000);
        }
    }
    
    // Show floating text (for pickups, messages, etc.)
    showFloatingText(text, x, y, color = '#c9a227') {
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

