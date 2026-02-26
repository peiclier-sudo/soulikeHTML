/**
 * Game State Manager - Centralized state management
 */

export class GameState {
    constructor() {
        this.reset();
        
        // Event listeners
        this.listeners = new Map();
    }
    
    reset() {
        // Player stats
        this.player = {
            health: 100,
            maxHealth: 100,
            stamina: 100,
            maxStamina: 100,
            ultimateCharge: 0,      // 0–100, fill with 6 charged or 12 basic hits taken
            souls: 0,
            level: 1,
            healthPotions: 5,
            drinkPotionCooldown: 0
        };
        
        // Combat state
        this.combat = {
            isAttacking: false,
            attackPhase: 0,
            comboCount: 0,
            lastAttackTime: 0,
            comboCooldown: 0.5,
            isBlocking: false,
            isDodging: false,
            dodgeCooldown: 0,
            invulnerable: false,
            invulnerabilityTime: 0,
            isCharging: false,
            isChargedAttacking: false,
            chargeTimer: 0,
            chargeDuration: 1.0,
            minChargeToRelease: 1.0,
            releasedCharge: 0,
            isWhipAttacking: false,
            isLifeDraining: false,
            shieldActive: false,
            shieldTimeRemaining: 0,
            isDrinkingPotion: false,
            drinkingPotionTimer: 0
        };
        
        // Movement state
        this.movement = {
            isMoving: false,
            isRunning: false,
            isJumping: false,
            isGrounded: true,
            velocity: { x: 0, y: 0, z: 0 }
        };
        
        // Equipment
        this.equipment = {
            weapon: {
                name: 'Claymore',
                damage: 25,
                staminaCost: 5,
                attackSpeed: 1.0,
                range: 2.5
            },
            armor: {
                name: 'Knight Armor',
                defense: 10
            }
        };
        
        // Enemies
        this.enemies = [];
        this.bloodCharges = 0;
        this.bloodLastChargeTime = 0;

        // Game flags
        this.flags = {
            tutorialComplete: false,
            bossDefeated: false
        };
        this.requestUltimateSlashSpawn = false;
        /** Set true to test ultimate: F triggers it without needing charge */
        this.ultimateTestMode = false;
    }
    
    // Health management
    takeDamage(amount) {
        if (this.combat.shieldActive) return 0;
        const actualDamage = Math.max(0, amount - this.equipment.armor.defense);
        this.player.health = Math.max(0, this.player.health - actualDamage);
        this.emit('healthChanged', this.player.health);
        
        if (this.player.health <= 0) {
            this.bloodCharges = 0;
            this.emit('bloodChargesChanged', 0);
            this.emit('playerDeath');
        }

        return actualDamage;
    }
    
    heal(amount) {
        this.player.health = Math.min(this.player.maxHealth, this.player.health + amount);
        this.emit('healthChanged', this.player.health);
    }

    activateShield(duration = 6) {
        this.combat.shieldActive = true;
        this.combat.shieldTimeRemaining = duration;
    }

    drinkHealthPotion() {
        if (this.player.drinkPotionCooldown > 0 || this.player.healthPotions <= 0) return false;
        if (this.player.health >= this.player.maxHealth) return false;
        if (this.combat.isDrinkingPotion) return false;
        this.player.healthPotions -= 1;
        this.player.drinkPotionCooldown = 4;
        this.heal(45);
        this.combat.isDrinkingPotion = true;
        this.combat.drinkingPotionTimer = 1.2;
        return true;
    }
    
    // Stamina management
    useStamina(amount) {
        if (this.player.stamina >= amount) {
            this.player.stamina -= amount;
            this.emit('staminaChanged', this.player.stamina);
            return true;
        }
        return false;
    }
    
    regenerateStamina(deltaTime) {
        if (!this.combat.isAttacking && !this.combat.isBlocking && !this.movement.isRunning) {
            const regenRate = 20; // stamina per second
            this.player.stamina = Math.min(
                this.player.maxStamina,
                this.player.stamina + regenRate * deltaTime
            );
            this.emit('staminaChanged', this.player.stamina);
        }
    }
    
    // Combat state
    startAttack() {
        if (this.player.stamina >= this.equipment.weapon.staminaCost) {
            this.combat.isAttacking = true;
            this.combat.attackPhase = 1;
            this.useStamina(this.equipment.weapon.staminaCost);
            return true;
        }
        return false;
    }
    
    endAttack() {
        this.combat.isAttacking = false;
        this.combat.attackPhase = 0;
    }
    
    // Ultimate: fills when hit (6 charged or 12 basic), F to use
    addUltimateCharge(attackType) {
        const chargePerCharged = 100 / 6;
        const chargePerBasic = 100 / 12;
        const add = attackType === 'charged' ? chargePerCharged : chargePerBasic;
        this.player.ultimateCharge = Math.min(100, this.player.ultimateCharge + add);
        this.emit('ultimateChanged', this.player.ultimateCharge);
    }
    
    useUltimate() {
        if (!this.ultimateTestMode && this.player.ultimateCharge < 100) return false;
        if (!this.ultimateTestMode) this.player.ultimateCharge = 0;
        this.requestUltimateSlashSpawn = true; // Game spawns crescent projectile after delay
        if (!this.ultimateTestMode) this.emit('ultimateChanged', 0);
        return true;
    }

    // Blood Essence: 0–5 charges; add on LMB hit (+1), Crimson Eruption hit (+2), life drain (+1 per full second)
    addBloodCharge(amount) {
        const newCharges = Math.min(5, this.bloodCharges + amount);
        this.bloodCharges = newCharges;
        this.bloodLastChargeTime = Date.now();
        this.emit('bloodChargesChanged', this.bloodCharges);
    }

    // Decay: if 8s pass without adding a charge, lose all charges. Call once per frame from Game.
    updateBloodEssence() {
        if (this.bloodCharges <= 0) return;
        if (Date.now() - this.bloodLastChargeTime >= 8000) {
            this.bloodCharges = 0;
            this.emit('bloodChargesChanged', 0);
        }
    }

    // E = Bloodflail. If 0 charges, does nothing (caller shows feedback). Else consumes all, returns multiplier.
    tryBloodflail() {
        const charges = this.bloodCharges;
        if (charges < 1) return { success: false, multiplier: 1, chargesUsed: 0 };
        const multipliers = [0, 1.8, 2.5, 3.3, 4.2, 5.0];
        const multiplier = multipliers[charges];
        this.bloodCharges = 0;
        this.emit('bloodChargesChanged', 0);
        return { success: true, multiplier, chargesUsed: charges };
    }

    // Event system
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }
    
    off(event, callback) {
        if (this.listeners.has(event)) {
            const callbacks = this.listeners.get(event);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }
    
    emit(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => callback(data));
        }
    }
    
    // Serialization for save/load
    serialize() {
        return JSON.stringify({
            player: this.player,
            equipment: this.equipment,
            flags: this.flags
        });
    }
    
    deserialize(data) {
        const parsed = JSON.parse(data);
        this.player = { ...this.player, ...parsed.player };
        this.equipment = { ...this.equipment, ...parsed.equipment };
        this.flags = { ...this.flags, ...parsed.flags };
    }
}

