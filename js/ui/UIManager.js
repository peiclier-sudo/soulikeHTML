/**
 * UI Manager - Handles HUD updates and damage numbers
 */

export class UIManager {
    constructor(gameState) {
        this.gameState = gameState;
        
        // Cache DOM elements
        this.elements = {
            healthFill: document.getElementById('health-fill'),
            healthText: document.getElementById('health-text'),
            staminaFill: document.getElementById('stamina-fill'),
            staminaText: document.getElementById('stamina-text'),
            weaponName: document.getElementById('weapon-name'),
            damageNumbers: document.getElementById('damage-numbers'),
            bossHealth: document.getElementById('boss-health'),
            bossHealthFill: document.getElementById('boss-health-fill'),
            bossName: document.getElementById('boss-name'),
            deathScreen: document.getElementById('death-screen')
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
        
        // Player death
        this.gameState.on('playerDeath', () => {
            this.showDeathScreen();
        });
    }
    
    update() {
        // Update health bar
        this.updateHealthBar(this.gameState.player.health);
        
        // Update stamina bar
        this.updateStaminaBar(this.gameState.player.stamina);
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
    
    updateWeaponDisplay() {
        if (this.elements.weaponName) {
            this.elements.weaponName.textContent = this.gameState.equipment.weapon.name;
        }
    }
    
    showDamageNumber(worldPosition, damage, isCritical) {
        if (!this.elements.damageNumbers) return;
        
        // Create damage number element
        const damageEl = document.createElement('div');
        damageEl.className = `damage-number ${isCritical ? 'critical' : ''}`;
        damageEl.textContent = damage.toString();
        
        // Position (convert 3D to 2D screen coordinates would require camera)
        // For now, use random position near center
        const x = window.innerWidth / 2 + (Math.random() - 0.5) * 200;
        const y = window.innerHeight / 2 + (Math.random() - 0.5) * 100;
        
        damageEl.style.left = `${x}px`;
        damageEl.style.top = `${y}px`;
        
        this.elements.damageNumbers.appendChild(damageEl);
        
        // Remove after animation
        setTimeout(() => {
            damageEl.remove();
        }, 1000);
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

