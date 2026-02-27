/**
 * Game State Manager - Centralized state management
 */

import { getKit } from '../kits/KitDefinitions.js';

export class GameState {
    constructor() {
        /** @type {string|null} Currently selected kit id */
        this.selectedKitId = null;
        /** @type {object|null} Resolved kit definition object */
        this.selectedKit = null;
        this.reset();

        // Event listeners
        this.listeners = new Map();
    }

    /** Set the active kit before reset / game start */
    setKit(kitId) {
        const kit = getKit(kitId);
        if (!kit) {
            console.warn(`Unknown kit id: ${kitId}, falling back to blood_mage`);
            this.selectedKitId = 'blood_mage';
            this.selectedKit = getKit('blood_mage');
        } else {
            this.selectedKitId = kitId;
            this.selectedKit = kit;
        }
    }

    reset() {
        const kit = this.selectedKit;
        const stats = kit?.stats;

        // Player stats (driven by kit if available, else defaults)
        this.player = {
            health: stats?.health ?? 100,
            maxHealth: stats?.health ?? 100,
            stamina: stats?.stamina ?? 100,
            maxStamina: stats?.stamina ?? 100,
            ultimateCharge: 0,      // 0–100, fill with 6 charged or 12 basic hits taken
            souls: 0,
            level: 1,
            healthPotions: 5,
            drinkPotionCooldown: 0
        };

        // Combat state
        const chargeDuration = kit?.combat?.chargedAttack?.chargeDuration ?? 1.0;
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
            chargeDuration: chargeDuration,
            minChargeToRelease: chargeDuration,
            releasedCharge: 0,
            isWhipAttacking: false,
            isLifeDraining: false,
            shieldActive: false,
            shieldTimeRemaining: 0,
            isDrinkingPotion: false,
            drinkingPotionTimer: 0,
            nextAttackDamageMultiplier: 1.0,
            // Dagger kit (shadow_assassin): teleport = +100% damage 3s, vanish = invisible + 60% speed, X = 20% per charge 8s
            teleportDamageBuffRemaining: 0,
            vanishRemaining: 0,
            poisonDamageBuffMultiplier: 1.0,
            poisonDamageBuffRemaining: 0,
            // Bow ranger: damage zone multiplier (updated each frame by BowCombat)
            bowDamageZoneMultiplier: 1.0
        };

        // Movement state
        this.movement = {
            isMoving: false,
            isRunning: false,
            isJumping: false,
            isGrounded: true,
            velocity: { x: 0, y: 0, z: 0 }
        };

        // Equipment (driven by kit if available)
        const weapon = kit?.weapon;
        this.equipment = {
            weapon: {
                name: weapon?.name ?? 'Claymore',
                damage: weapon?.damage ?? 25,
                staminaCost: weapon?.staminaCost ?? 5,
                attackSpeed: weapon?.attackSpeed ?? 1.0,
                range: weapon?.range ?? 2.75
            },
            armor: {
                name: 'Knight Armor',
                defense: stats?.armor ?? 10
            }
        };
        
        // Enemies
        this.enemies = [];
        this.bloodCharges = 0;
        this.bloodLastChargeTime = 0;

        // Dagger kit: poison charges (max 6), gained on basic/charged hit
        this.poisonCharges = 0;

        // Bow ranger kit: trust charges (max 8), gained on arrow hits
        this.trustCharges = 0;

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

    // Blood Essence: 0–8 stacks; add on LMB hit (+1), Crimson Eruption hit (+2), life drain (+1 per full second)
    addBloodCharge(amount) {
        const newCharges = Math.min(8, this.bloodCharges + amount);
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

    // ─── Dagger kit: poison charges (max 6) ───────────────────────
    addPoisonCharge(amount = 1) {
        if (this.selectedKitId !== 'shadow_assassin') return;
        const newCharges = Math.min(6, (this.poisonCharges ?? 0) + amount);
        this.poisonCharges = newCharges;
        this.emit('poisonChargesChanged', this.poisonCharges);
    }

    getPoisonCharges() {
        return this.selectedKitId === 'shadow_assassin' ? (this.poisonCharges ?? 0) : 0;
    }

    /** Consume up to maxCharges poison charges; returns { consumed, remaining }. */
    tryConsumePoisonCharges(maxCharges = 6) {
        const have = this.poisonCharges ?? 0;
        const consumed = Math.min(maxCharges, have);
        if (consumed <= 0) return { consumed: 0, remaining: have };
        this.poisonCharges = Math.max(0, have - consumed);
        this.emit('poisonChargesChanged', this.poisonCharges);
        return { consumed, remaining: this.poisonCharges };
    }

    /** E = Poison Pierce: consume charges, apply damage + poison. Returns { success, chargesUsed }. */
    tryPoisonPierce() {
        const have = this.getPoisonCharges();
        if (have < 1) return { success: false, chargesUsed: 0 };
        const consumed = have;
        this.poisonCharges = 0;
        this.emit('poisonChargesChanged', 0);
        return { success: true, chargesUsed: consumed };
    }

    // ─── Bow ranger kit: trust charges (max 8) ─────────────────────
    addTrustCharge(amount = 1) {
        if (this.selectedKitId !== 'bow_ranger') return;
        const newCharges = Math.min(8, (this.trustCharges ?? 0) + amount);
        this.trustCharges = newCharges;
        this.emit('trustChargesChanged', this.trustCharges);
    }

    getTrustCharges() {
        return this.selectedKitId === 'bow_ranger' ? (this.trustCharges ?? 0) : 0;
    }

    /** Consume up to maxCharges trust charges; returns { consumed, remaining }. */
    tryConsumeTrustCharges(maxCharges = 8) {
        const have = this.trustCharges ?? 0;
        const consumed = Math.min(maxCharges, have);
        if (consumed <= 0) return { consumed: 0, remaining: have };
        this.trustCharges = Math.max(0, have - consumed);
        this.emit('trustChargesChanged', this.trustCharges);
        return { consumed, remaining: this.trustCharges };
    }

    /** E = Judgment Arrow: consume all trust charges. Returns { success, chargesUsed }. */
    tryJudgmentArrow() {
        const have = this.getTrustCharges();
        if (have < 1) return { success: false, chargesUsed: 0 };
        this.trustCharges = 0;
        this.emit('trustChargesChanged', 0);
        return { success: true, chargesUsed: have };
    }

    /** Activate teleport-behind buff: +100% damage for 3 seconds. */
    activateTeleportDamageBuff() {
        this.combat.teleportDamageBuffRemaining = 3.0;
    }

    /** Activate vanish: invisible + 60% speed. Duration from kit abilityC or 5s. */
    activateVanish(durationSeconds = 5) {
        this.combat.vanishRemaining = durationSeconds;
        this.emit('vanishChanged', true);
    }

    /** X: consume poison charges for damage buff; 20% per charge, 8s. Returns charges consumed. */
    tryActivatePoisonDamageBuff() {
        const { consumed } = this.tryConsumePoisonCharges(6);
        if (consumed <= 0) return 0;
        this.combat.poisonDamageBuffMultiplier = 1 + 0.20 * consumed;
        this.combat.poisonDamageBuffRemaining = 8.0;
        return consumed;
    }

    // E = Bloodflail. If 0 charges, does nothing (caller shows feedback). Else consumes all, returns multiplier.
    tryBloodflail() {
        const charges = this.bloodCharges;
        if (charges < 1) return { success: false, multiplier: 1, chargesUsed: 0 };
        const multipliers = [0, 1.55, 2.0, 2.5, 3.05, 3.7, 4.35, 5.05, 5.8];
        const multiplier = multipliers[charges] ?? multipliers[multipliers.length - 1];
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
            flags: this.flags,
            kitId: this.selectedKitId
        });
    }

    deserialize(data) {
        const parsed = JSON.parse(data);
        if (parsed.kitId) this.setKit(parsed.kitId);
        this.player = { ...this.player, ...parsed.player };
        this.equipment = { ...this.equipment, ...parsed.equipment };
        this.flags = { ...this.flags, ...parsed.flags };
    }
}
