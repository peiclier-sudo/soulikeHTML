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
            souls: 0,
            level: 1
        };
        
        // Combat state
        this.combat = {
            isAttacking: false,
            attackPhase: 0,
            comboCount: 0,
            lastAttackTime: 0,
            comboCooldown: 0.5, // seconds between combo hits
            isBlocking: false,
            isDodging: false,
            dodgeCooldown: 0,
            invulnerable: false,
            invulnerabilityTime: 0
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
                staminaCost: 15,
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
        
        // Game flags
        this.flags = {
            tutorialComplete: false,
            bossDefeated: false
        };
    }
    
    // Health management
    takeDamage(amount) {
        const actualDamage = Math.max(0, amount - this.equipment.armor.defense);
        this.player.health = Math.max(0, this.player.health - actualDamage);
        this.emit('healthChanged', this.player.health);
        
        if (this.player.health <= 0) {
            this.emit('playerDeath');
        }
        
        return actualDamage;
    }
    
    heal(amount) {
        this.player.health = Math.min(this.player.maxHealth, this.player.health + amount);
        this.emit('healthChanged', this.player.health);
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

