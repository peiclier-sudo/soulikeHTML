/**
 * ItemDefinitions — all purchasable & equippable items.
 *
 * Gear slots: weapon, helmet, chest, boots
 * Each item has: id, name, slot, rarity, cost (souls), stats, description, icon
 */

export const RARITIES = {
    common:    { label: 'Common',    color: '#aaaaaa', glow: 'rgba(170,170,170,0.3)' },
    uncommon:  { label: 'Uncommon',  color: '#44cc44', glow: 'rgba(68,204,68,0.3)' },
    rare:      { label: 'Rare',      color: '#4488ff', glow: 'rgba(68,136,255,0.4)' },
    epic:      { label: 'Epic',      color: '#aa44ff', glow: 'rgba(170,68,255,0.4)' },
    legendary: { label: 'Legendary', color: '#ffaa00', glow: 'rgba(255,170,0,0.5)' }
};

export const GEAR_SLOTS = ['weapon', 'helmet', 'chest', 'boots'];

export const ITEMS = {
    // ── WEAPONS ─────────────────────────────────────────────
    w_iron_blade: {
        id: 'w_iron_blade', name: 'Iron Blade', slot: 'weapon', rarity: 'common',
        cost: 0, icon: '\u2694',
        stats: { damage: 0 },
        description: 'Standard-issue blade. Nothing special.'
    },
    w_venom_fang: {
        id: 'w_venom_fang', name: 'Venom Fang', slot: 'weapon', rarity: 'uncommon',
        cost: 150, icon: '\u{1F5E1}',
        stats: { damage: 4, critChance: 0.03 },
        description: 'Corroded edge that bites deeper on critical strikes.'
    },
    w_shadow_edge: {
        id: 'w_shadow_edge', name: 'Shadow Edge', slot: 'weapon', rarity: 'rare',
        cost: 400, icon: '\u{1F5E1}',
        stats: { damage: 8, critChance: 0.05, backstabMultiplier: 0.15 },
        description: 'Blade forged in darkness. Devastating from behind.'
    },
    w_crimson_harvest: {
        id: 'w_crimson_harvest', name: 'Crimson Harvest', slot: 'weapon', rarity: 'epic',
        cost: 800, icon: '\u{1F5E1}',
        stats: { damage: 12, critMultiplier: 0.2, lifesteal: 0.03 },
        description: 'Drinks the blood of the fallen. Heals on every hit.'
    },
    w_abyssal_claw: {
        id: 'w_abyssal_claw', name: 'Abyssal Claw', slot: 'weapon', rarity: 'legendary',
        cost: 1500, icon: '\u{1F5E1}',
        stats: { damage: 18, critChance: 0.08, critMultiplier: 0.25, attackSpeed: 0.15 },
        description: 'Ripped from the abyss itself. Strikes with inhuman speed.'
    },

    // ── HELMETS ─────────────────────────────────────────────
    h_cloth_hood: {
        id: 'h_cloth_hood', name: 'Cloth Hood', slot: 'helmet', rarity: 'common',
        cost: 0, icon: '\u{1F3A9}',
        stats: { armor: 0 },
        description: 'Thin fabric. Barely protection.'
    },
    h_iron_helm: {
        id: 'h_iron_helm', name: 'Iron Helm', slot: 'helmet', rarity: 'uncommon',
        cost: 120, icon: '\u{1F3A9}',
        stats: { armor: 3, health: 8 },
        description: 'Dented but dependable iron headpiece.'
    },
    h_shadow_cowl: {
        id: 'h_shadow_cowl', name: 'Shadow Cowl', slot: 'helmet', rarity: 'rare',
        cost: 350, icon: '\u{1F3A9}',
        stats: { armor: 5, critChance: 0.04, stamina: 10 },
        description: 'Dark hood that sharpens focus and reflexes.'
    },
    h_dragon_visage: {
        id: 'h_dragon_visage', name: 'Dragon Visage', slot: 'helmet', rarity: 'epic',
        cost: 700, icon: '\u{1F3A9}',
        stats: { armor: 8, health: 20, damage: 3 },
        description: 'Forged from dragon scales. Inspires terror and resilience.'
    },
    h_crown_of_thorns: {
        id: 'h_crown_of_thorns', name: 'Crown of Thorns', slot: 'helmet', rarity: 'legendary',
        cost: 1400, icon: '\u{1F451}',
        stats: { armor: 6, damage: 8, critChance: 0.06, health: 15 },
        description: 'Pain becomes power. Every wound sharpens the mind.'
    },

    // ── CHEST ARMOR ─────────────────────────────────────────
    c_leather_vest: {
        id: 'c_leather_vest', name: 'Leather Vest', slot: 'chest', rarity: 'common',
        cost: 0, icon: '\u{1F6E1}',
        stats: { armor: 0 },
        description: 'Basic leather protection.'
    },
    c_chainmail: {
        id: 'c_chainmail', name: 'Chainmail', slot: 'chest', rarity: 'uncommon',
        cost: 140, icon: '\u{1F6E1}',
        stats: { armor: 5, health: 10 },
        description: 'Interlocked rings absorb slashing blows.'
    },
    c_phantom_shroud: {
        id: 'c_phantom_shroud', name: 'Phantom Shroud', slot: 'chest', rarity: 'rare',
        cost: 380, icon: '\u{1F6E1}',
        stats: { armor: 7, stamina: 15, runSpeed: 0.5 },
        description: 'Weightless fabric that moves with the wind.'
    },
    c_bloodforged_plate: {
        id: 'c_bloodforged_plate', name: 'Bloodforged Plate', slot: 'chest', rarity: 'epic',
        cost: 750, icon: '\u{1F6E1}',
        stats: { armor: 12, health: 25, lifesteal: 0.02 },
        description: 'Living armor that mends itself with spilled blood.'
    },
    c_abyssal_mantle: {
        id: 'c_abyssal_mantle', name: 'Abyssal Mantle', slot: 'chest', rarity: 'legendary',
        cost: 1600, icon: '\u{1F6E1}',
        stats: { armor: 15, health: 30, damage: 5, stamina: 10 },
        description: 'Woven from void-silk. Defies both blade and sorcery.'
    },

    // ── BOOTS ────────────────────────────────────────────────
    b_sandals: {
        id: 'b_sandals', name: 'Worn Sandals', slot: 'boots', rarity: 'common',
        cost: 0, icon: '\u{1F462}',
        stats: { armor: 0 },
        description: 'Light footwear. Better than barefoot.'
    },
    b_iron_greaves: {
        id: 'b_iron_greaves', name: 'Iron Greaves', slot: 'boots', rarity: 'uncommon',
        cost: 100, icon: '\u{1F462}',
        stats: { armor: 3, runSpeed: 0.3 },
        description: 'Heavy but grounded. Slightly faster stride.'
    },
    b_windwalkers: {
        id: 'b_windwalkers', name: 'Windwalkers', slot: 'boots', rarity: 'rare',
        cost: 320, icon: '\u{1F462}',
        stats: { armor: 4, runSpeed: 0.8, stamina: 10, jumpForce: 0.5 },
        description: 'Enchanted soles that barely touch the ground.'
    },
    b_dread_treads: {
        id: 'b_dread_treads', name: 'Dread Treads', slot: 'boots', rarity: 'epic',
        cost: 650, icon: '\u{1F462}',
        stats: { armor: 7, runSpeed: 0.5, health: 12, critChance: 0.03 },
        description: 'Each step echoes with malice. Enemies falter nearby.'
    },
    b_voidstriders: {
        id: 'b_voidstriders', name: 'Voidstriders', slot: 'boots', rarity: 'legendary',
        cost: 1300, icon: '\u{1F97E}',
        stats: { armor: 8, runSpeed: 1.2, stamina: 20, jumpForce: 1.0 },
        description: 'Step between dimensions. Unmatched agility.'
    },

    // ── CONSUMABLES (Boutique only, not equipped) ───────────
    potion_heal: {
        id: 'potion_heal', name: 'Health Potion', slot: 'consumable', rarity: 'common',
        cost: 50, icon: '\u{1F9EA}',
        stats: {},
        description: 'Restores one use of your healing flask.',
        consumable: true, effect: 'addPotion'
    },
    potion_mega: {
        id: 'potion_mega', name: 'Mega Potion', slot: 'consumable', rarity: 'rare',
        cost: 200, icon: '\u{1F9EA}',
        stats: {},
        description: 'Restores 3 uses of your healing flask.',
        consumable: true, effect: 'addPotionx3'
    },
    soul_crystal: {
        id: 'soul_crystal', name: 'Soul Crystal', slot: 'consumable', rarity: 'epic',
        cost: 500, icon: '\u{1F48E}',
        stats: {},
        description: 'Gain 1 talent point immediately.',
        consumable: true, effect: 'addTalentPoint'
    }
};

/** Get items filtered by slot */
export function getItemsBySlot(slot) {
    return Object.values(ITEMS).filter(i => i.slot === slot);
}

/** Get item by id */
export function getItem(id) {
    return ITEMS[id] ?? null;
}
