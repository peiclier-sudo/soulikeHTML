/**
 * Kit Definitions - Data-driven character class/specialization system
 *
 * Each kit defines: stats, abilities, visual theme colors, and combat parameters.
 * The game systems read from the selected kit to configure themselves.
 *
 * Classes: Mage (2), Rogue (2), Warrior (2)
 */

export const CLASS_MAGE = 'mage';
export const CLASS_ROGUE = 'rogue';
export const CLASS_WARRIOR = 'warrior';

/**
 * All 6 character kits.
 * Each kit has:
 *   id, name, className, description
 *   stats: { health, stamina, walkSpeed, runSpeed, jumpForce, armor }
 *   weapon: { name, damage, staminaCost, attackSpeed, range }
 *   abilities: keyed ability configs (Q, E, X, C, F + LMB/RMB)
 *   theme: { primary, secondary, accent } hex colors for VFX/UI
 *   model: which character model to load
 */
export const KIT_DEFINITIONS = {

    // ─── MAGE 1: BLOOD MAGE (existing) ────────────────────────────
    blood_mage: {
        id: 'blood_mage',
        name: 'Blood Mage',
        className: CLASS_MAGE,
        description: 'Wields forbidden blood magic. Drains life from foes and unleashes devastating crimson fire.',
        icon: '\u{1F525}',

        stats: {
            health: 100,
            stamina: 100,
            walkSpeed: 4,
            runSpeed: 8,
            jumpForce: 8,
            armor: 10
        },

        weapon: {
            name: 'Claymore',
            damage: 25,
            staminaCost: 5,
            attackSpeed: 1.0,
            range: 2.75
        },

        // Combat system parameters
        combat: {
            // LMB: fireball projectile
            basicAttack: {
                type: 'projectile',
                damage: 20,
                speed: 20,
                radius: 0.25,
                lifetime: 1.5,
                staminaCost: 5
            },
            // RMB hold+release: charged fireball
            chargedAttack: {
                type: 'projectile_charged',
                damage: 55,
                speed: 20,
                radius: 0.72,
                lifetime: 2.4,
                chargeDuration: 1.0
            },
            // Q: Crimson Eruption (ground target AoE)
            abilityQ: {
                name: 'Crimson Eruption',
                type: 'ground_aoe',
                damage: 50,
                radius: 3.5,
                cooldown: 8,
                bloodChargeGain: 2
            },
            // E: Bloodflail (finisher consumes blood charges)
            abilityE: {
                name: 'Bloodflail',
                type: 'melee_finisher',
                baseDamage: 45,
                range: 3.8,
                requiresBloodCharges: true
            },
            // X: Blood Nova (AoE root/freeze)
            abilityX: {
                name: 'Blood Nova',
                type: 'nova_aoe',
                damage: 35,
                radius: 12,
                cooldown: 10,
                freezeDuration: 2.4
            },
            // C: Blood Shield
            abilityC: {
                name: 'Blood Shield',
                type: 'shield',
                duration: 6
            },
            // F: Ultimate crescent slash
            abilityF: {
                name: 'Blood Crescent',
                type: 'ultimate_projectile',
                damage: 120,
                chargeNeeded: 100
            }
        },

        theme: {
            primary: 0x8b0000,    // dark red
            secondary: 0xff4422,  // blood orange
            accent: 0xffaa00,     // fire gold
            particleColor: 0xff2200,
            uiClass: 'kit-blood-mage'
        },

        model: 'character_3k_mage'
    },

    // ─── MAGE 2: FROST MAGE ───────────────────────────────────────
    frost_mage: {
        id: 'frost_mage',
        name: 'Frost Mage',
        className: CLASS_MAGE,
        description: 'Commands the bitter cold. Slows enemies with frost and shatters them with ice.',
        icon: '\u{2744}',

        stats: {
            health: 90,
            stamina: 110,
            walkSpeed: 4,
            runSpeed: 8,
            jumpForce: 8,
            armor: 8
        },

        weapon: {
            name: 'Frost Staff',
            damage: 22,
            staminaCost: 4,
            attackSpeed: 1.1,
            range: 2.75
        },

        combat: {
            basicAttack: {
                type: 'projectile',
                damage: 18,
                speed: 22,
                radius: 0.22,
                lifetime: 1.6,
                staminaCost: 4
            },
            chargedAttack: {
                type: 'projectile_charged',
                damage: 50,
                speed: 18,
                radius: 0.65,
                lifetime: 2.6,
                chargeDuration: 1.1
            },
            abilityQ: {
                name: 'Frozen Orb',
                type: 'projectile_aoe',
                damage: 15,
                radius: 14,
                cooldown: 9,
                bloodChargeGain: 2
            },
            abilityE: {
                name: 'Frost Beam',
                type: 'melee_finisher',
                baseDamage: 42,
                range: 12,
                requiresBloodCharges: true
            },
            abilityX: {
                name: 'Stalactite',
                type: 'ground_targeted',
                damage: 85,
                radius: 4.0,
                cooldown: 12,
                freezeDuration: 2.5
            },
            abilityC: {
                name: 'Ice Barrier',
                type: 'shield',
                duration: 5
            },
            abilityF: {
                name: 'Blizzard',
                type: 'ultimate_aoe',
                damage: 28,
                radius: 8,
                duration: 3.5,
                chargeNeeded: 100
            }
        },

        theme: {
            primary: 0x1a4a8a,    // deep blue
            secondary: 0x44aaff,  // ice blue
            accent: 0xcceeff,     // frost white
            particleColor: 0x66ccff,
            uiClass: 'kit-frost-mage'
        },

        model: 'character_3k_mage'
    },

    // ─── ROGUE 1: SHADOW ASSASSIN (dagger CAC) ────────────────────
    shadow_assassin: {
        id: 'shadow_assassin',
        name: 'Shadow Assassin',
        className: CLASS_ROGUE,
        description: 'A toxic assassin with emerald dashes and instant strikes. Build poison charges, then blink behind targets.',
        icon: '\u{1F5E1}',

        stats: {
            health: 80,
            stamina: 130,
            walkSpeed: 5,
            runSpeed: 10,
            jumpForce: 9,
            armor: 5
        },

        weapon: {
            name: 'Shadow Daggers',
            damage: 18,
            staminaCost: 3,
            attackSpeed: 1.6,
            range: 2.0
        },

        combat: {
            basicAttack: {
                name: 'Green Slash',
                type: 'melee',
                damage: 22,
                staminaCost: 3,
                range: 2.2,
                poisonChargeGain: 1
            },
            chargedAttack: {
                name: 'Double Slash',
                type: 'melee',
                damage: 42,
                staminaCost: 8,
                range: 2.2,
                chargeDuration: 0.5,
                poisonChargeGain: 2
            },
            abilityA: {
                name: 'Teleport Behind',
                type: 'teleport_buff',
                cooldown: 12,
                damageBuffDuration: 3,
                damageBuffMultiplier: 2.0
            },
            abilityQ: {
                name: 'Shadow Step',
                type: 'ground_aoe',
                damage: 35,
                radius: 2.5,
                cooldown: 6
            },
            abilityE: {
                name: 'Poison Pierce',
                type: 'melee_finisher',
                baseDamage: 40,
                damagePerCharge: 18,
                range: 2.8,
                requiresPoisonCharges: true,
                poisonDurationPerCharge: 2
            },
            abilityX: {
                name: 'Toxic Focus',
                type: 'consume_charges_buff',
                cooldown: 20,
                damagePercentPerCharge: 15,
                buffDuration: 8
            },
            abilityC: {
                name: 'Vanish',
                type: 'vanish',
                duration: 5,
                speedMultiplier: 1.6
            },
            abilityF: {
                name: 'Twin Daggers',
                type: 'ultimate_hold_release',
                damage: 180,
                chargeNeeded: 100,
                range: 14
            }
        },

        theme: {
            primary: 0x0b2a12,
            secondary: 0x1fbf4c,
            accent: 0x8bff7a,
            particleColor: 0x4dff66,
            uiClass: 'kit-shadow-assassin'
        },

        model: 'character_3k_rogue',
        animationKey: 'character_3k_rogue_dagger'
    },

    // ─── ROGUE 2: VENOM STALKER (bow) ──────────────────────────────
    venom_stalker: {
        id: 'venom_stalker',
        name: 'Venom Stalker',
        className: CLASS_ROGUE,
        description: 'Poisons the battlefield. Corrodes enemies with toxic attacks and deadly plagues.',
        icon: '\u{2620}',

        stats: {
            health: 85,
            stamina: 120,
            walkSpeed: 4.5,
            runSpeed: 9.5,
            jumpForce: 8.5,
            armor: 6
        },

        weapon: {
            name: 'Venom Fangs',
            damage: 20,
            staminaCost: 4,
            attackSpeed: 1.4,
            range: 2.2
        },

        combat: {
            basicAttack: {
                type: 'projectile',
                damage: 16,
                speed: 24,
                radius: 0.2,
                lifetime: 1.2,
                staminaCost: 4
            },
            chargedAttack: {
                type: 'projectile_charged',
                damage: 45,
                speed: 22,
                radius: 0.5,
                lifetime: 2.0,
                chargeDuration: 0.8
            },
            abilityQ: {
                name: 'Venom Pool',
                type: 'ground_aoe',
                damage: 40,
                radius: 4.0,
                cooldown: 7,
                bloodChargeGain: 2
            },
            abilityE: {
                name: 'Toxic Burst',
                type: 'melee_finisher',
                baseDamage: 55,
                range: 3.2,
                requiresBloodCharges: true
            },
            abilityX: {
                name: 'Plague Cloud',
                type: 'nova_aoe',
                damage: 25,
                radius: 10,
                cooldown: 11,
                freezeDuration: 2.0
            },
            abilityC: {
                name: 'Toxin Shield',
                type: 'shield',
                duration: 5
            },
            abilityF: {
                name: 'Venomous Eclipse',
                type: 'ultimate_projectile',
                damage: 140,
                chargeNeeded: 100
            }
        },

        theme: {
            primary: 0x0a3a0a,    // dark green
            secondary: 0x44cc22,  // toxic green
            accent: 0xaaff44,     // acid yellow-green
            particleColor: 0x66ff22,
            uiClass: 'kit-venom-stalker'
        },

        model: 'character_3k_rogue',
        animationKey: 'character_3k_rogue_bow'
    },

    // ─── WARRIOR 1: BERSERKER ─────────────────────────────────────
    berserker: {
        id: 'berserker',
        name: 'Berserker',
        className: CLASS_WARRIOR,
        description: 'Unstoppable rage. Trades defense for devastating melee power and relentless aggression.',
        icon: '\u{1FA93}',

        stats: {
            health: 130,
            stamina: 90,
            walkSpeed: 3.5,
            runSpeed: 7.5,
            jumpForce: 7,
            armor: 12
        },

        weapon: {
            name: 'Great Axe',
            damage: 35,
            staminaCost: 7,
            attackSpeed: 0.8,
            range: 3.0
        },

        combat: {
            basicAttack: {
                type: 'projectile',
                damage: 28,
                speed: 16,
                radius: 0.35,
                lifetime: 1.2,
                staminaCost: 7
            },
            chargedAttack: {
                type: 'projectile_charged',
                damage: 70,
                speed: 14,
                radius: 0.9,
                lifetime: 2.0,
                chargeDuration: 1.3
            },
            abilityQ: {
                name: 'Ground Slam',
                type: 'ground_aoe',
                damage: 60,
                radius: 4.0,
                cooldown: 10,
                bloodChargeGain: 2
            },
            abilityE: {
                name: 'Fury Strike',
                type: 'melee_finisher',
                baseDamage: 55,
                range: 3.5,
                requiresBloodCharges: true
            },
            abilityX: {
                name: 'War Cry',
                type: 'nova_aoe',
                damage: 40,
                radius: 10,
                cooldown: 15,
                freezeDuration: 2.0
            },
            abilityC: {
                name: 'Iron Will',
                type: 'shield',
                duration: 8
            },
            abilityF: {
                name: 'Ragnarok',
                type: 'ultimate_projectile',
                damage: 160,
                chargeNeeded: 100
            }
        },

        theme: {
            primary: 0x8a2200,    // dark orange
            secondary: 0xff6622,  // fire orange
            accent: 0xffcc44,     // fury gold
            particleColor: 0xff4400,
            uiClass: 'kit-berserker'
        },

        model: 'character_3k_mage'
    },

    // ─── WARRIOR 2: PALADIN ──────────────────────────────────────
    paladin: {
        id: 'paladin',
        name: 'Paladin',
        className: CLASS_WARRIOR,
        description: 'Holy warrior. Balanced offense and defense with radiant smites and divine protection.',
        icon: '\u{1F6E1}',

        stats: {
            health: 120,
            stamina: 100,
            walkSpeed: 3.8,
            runSpeed: 7.8,
            jumpForce: 7.5,
            armor: 15
        },

        weapon: {
            name: 'Holy Mace',
            damage: 30,
            staminaCost: 6,
            attackSpeed: 0.9,
            range: 2.8
        },

        combat: {
            basicAttack: {
                type: 'projectile',
                damage: 24,
                speed: 18,
                radius: 0.3,
                lifetime: 1.4,
                staminaCost: 6
            },
            chargedAttack: {
                type: 'projectile_charged',
                damage: 60,
                speed: 16,
                radius: 0.8,
                lifetime: 2.2,
                chargeDuration: 1.2
            },
            abilityQ: {
                name: 'Holy Smite',
                type: 'ground_aoe',
                damage: 55,
                radius: 3.5,
                cooldown: 9,
                bloodChargeGain: 2
            },
            abilityE: {
                name: 'Divine Strike',
                type: 'melee_finisher',
                baseDamage: 50,
                range: 3.0,
                requiresBloodCharges: true
            },
            abilityX: {
                name: 'Consecration',
                type: 'nova_aoe',
                damage: 35,
                radius: 11,
                cooldown: 12,
                freezeDuration: 2.2
            },
            abilityC: {
                name: 'Divine Shield',
                type: 'shield',
                duration: 7
            },
            abilityF: {
                name: 'Judgment',
                type: 'ultimate_projectile',
                damage: 140,
                chargeNeeded: 100
            }
        },

        theme: {
            primary: 0x8a7a22,    // dark gold
            secondary: 0xffd700,  // gold
            accent: 0xffffcc,     // holy white
            particleColor: 0xffdd44,
            uiClass: 'kit-paladin'
        },

        model: 'character_3k_mage'
    }
};

/** Get all kits for a given class */
export function getKitsByClass(className) {
    return Object.values(KIT_DEFINITIONS).filter(k => k.className === className);
}

/** Get a kit by id */
export function getKit(kitId) {
    return KIT_DEFINITIONS[kitId] || null;
}

/** Get all available classes with their display info */
export const CLASS_INFO = {
    [CLASS_MAGE]: {
        name: 'Mage',
        description: 'Masters of arcane arts. Powerful ranged attacks and devastating spells.',
        icon: '\u{1F9D9}'
    },
    [CLASS_ROGUE]: {
        name: 'Rogue',
        description: 'Swift and deadly. Fast attacks, high mobility, and lethal precision.',
        icon: '\u{1F977}'
    },
    [CLASS_WARRIOR]: {
        name: 'Warrior',
        description: 'Unyielding might. Heavy armor, powerful strikes, and unmatched resilience.',
        icon: '\u{2694}'
    }
};
