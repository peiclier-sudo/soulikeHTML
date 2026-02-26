/**
 * UI Manager - Handles HUD updates and damage numbers
 */

import * as THREE from 'three';

export class UIManager {
    constructor(gameState, camera = null) {
        this.gameState = gameState;
        this.camera = camera;
        this._projectedPos = new THREE.Vector3();
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
            weaponName: document.getElementById('weapon-name'),
            damageNumbers: document.getElementById('damage-numbers'),
            bossHealth: document.getElementById('boss-health'),
            bossHealthFill: document.getElementById('boss-health-fill'),
            bossName: document.getElementById('boss-name'),
            deathScreen: document.getElementById('death-screen'),
            ultimateBar: document.getElementById('ultimate-bar'),
            ultimateFill: document.getElementById('ultimate-fill'),
            bloodEssenceLabel: document.querySelector('.blood-essence-label'),
            bloodOrbs: [0, 1, 2, 3, 4].map(i => document.getElementById(`blood-orb-${i}`)),
            noBloodEssence: document.getElementById('no-blood-essence'),
            reticule: document.getElementById('reticule')
        };
        
        // Subscribe to game events
        this.setupEventListeners();
        
        // Initialize weapon display
        this.updateWeaponDisplay();
    }
    
    setupEventListeners() {
        // Damage number events
        this.gameState.on('damageNumber', (data) => {
            this.showDamageNumber(data.position, data.damage, data.isCritical);
        });
        
        // Health change events
        this.gameState.on('healthChanged', (health) => {
            this.updateHealthBar(health);
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
        this.updateBloodOrbs();
    }

    updateBloodOrbs() {
        const charges = this.gameState.bloodCharges;
        const label = this.elements.bloodEssenceLabel;
        const orbs = this.elements.bloodOrbs;
        if (label) {
            label.classList.toggle('grayed', charges === 0);
        }
        if (orbs && orbs.length === 5) {
            orbs.forEach((orb, i) => {
                if (orb) orb.classList.toggle('filled', i < charges);
            });
        }
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

    updateWeaponDisplay() {
        if (this.elements.weaponName) {
            this.elements.weaponName.textContent = this.gameState.equipment.weapon.name;
        }
    }
    
    setCamera(camera) {
        this.camera = camera;
    }

    showDamageNumber(worldPosition, damage, isCritical) {
        if (!this.elements.damageNumbers) return;

        const damageEl = document.createElement('div');
        damageEl.className = `damage-number ${isCritical ? 'critical' : ''}`;
        damageEl.textContent = damage.toString();

        let x, y;
        if (this.camera && worldPosition && typeof worldPosition.x === 'number') {
            this._projectedPos.copy(worldPosition).project(this.camera);
            const w = this._canvas?.clientWidth ?? window.innerWidth;
            const h = this._canvas?.clientHeight ?? window.innerHeight;
            x = (this._projectedPos.x * 0.5 + 0.5) * w;
            y = (-this._projectedPos.y * 0.5 + 0.5) * h;
            damageEl.style.left = `${x}px`;
            damageEl.style.top = `${y}px`;
        } else {
            x = window.innerWidth / 2 + (Math.random() - 0.5) * 120;
            y = window.innerHeight / 2 + (Math.random() - 0.5) * 80;
            damageEl.style.left = `${x}px`;
            damageEl.style.top = `${y}px`;
        }

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

