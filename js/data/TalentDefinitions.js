/**
 * TalentDefinitions — Three-branch passive talent tree.
 *
 * Branches: Offense (red), Defense (blue), Utility (green)
 * Each node: id, branch, tier (0-4), cost (talent points), stat bonuses, prereq
 * Players earn 1 talent point per boss killed.
 */

export const TALENT_BRANCHES = {
    offense:  { label: 'Offense',  color: '#ff4444', icon: '\u2694', glow: 'rgba(255,68,68,0.4)' },
    defense:  { label: 'Defense',  color: '#4488ff', icon: '\u{1F6E1}', glow: 'rgba(68,136,255,0.4)' },
    utility:  { label: 'Utility',  color: '#44cc44', icon: '\u26A1', glow: 'rgba(68,204,68,0.4)' }
};

export const TALENTS = [
    // ── OFFENSE BRANCH (left column) ────────────────────────
    {
        id: 'o_sharpen',     branch: 'offense', tier: 0, cost: 1,
        name: 'Sharpen',     icon: '\u{1F5E1}',
        stats: { damage: 3 },
        description: '+3 base weapon damage.',
        prereq: null
    },
    {
        id: 'o_keen_edge',   branch: 'offense', tier: 1, cost: 1,
        name: 'Keen Edge',   icon: '\u{1F3AF}',
        stats: { critChance: 0.05 },
        description: '+5% critical hit chance.',
        prereq: 'o_sharpen'
    },
    {
        id: 'o_brutality',   branch: 'offense', tier: 2, cost: 2,
        name: 'Brutality',   icon: '\u{1F4A5}',
        stats: { critMultiplier: 0.25 },
        description: '+25% critical damage multiplier.',
        prereq: 'o_keen_edge'
    },
    {
        id: 'o_bloodlust',   branch: 'offense', tier: 3, cost: 2,
        name: 'Bloodlust',   icon: '\u{1FA78}',
        stats: { lifesteal: 0.03 },
        description: 'Heal 3% of damage dealt.',
        prereq: 'o_brutality'
    },
    {
        id: 'o_annihilate',  branch: 'offense', tier: 4, cost: 3,
        name: 'Annihilate',  icon: '\u2620',
        stats: { damage: 10, critChance: 0.05, critMultiplier: 0.15 },
        description: '+10 damage, +5% crit chance, +15% crit multiplier.',
        prereq: 'o_bloodlust'
    },

    // ── DEFENSE BRANCH (center column) ──────────────────────
    {
        id: 'd_toughen',     branch: 'defense', tier: 0, cost: 1,
        name: 'Toughen',     icon: '\u{1F9E1}',
        stats: { health: 15 },
        description: '+15 maximum health.',
        prereq: null
    },
    {
        id: 'd_iron_skin',   branch: 'defense', tier: 1, cost: 1,
        name: 'Iron Skin',   icon: '\u{1F6E1}',
        stats: { armor: 5 },
        description: '+5 armor (damage reduction).',
        prereq: 'd_toughen'
    },
    {
        id: 'd_resilience',  branch: 'defense', tier: 2, cost: 2,
        name: 'Resilience',  icon: '\u2764',
        stats: { health: 25, armor: 3 },
        description: '+25 health, +3 armor.',
        prereq: 'd_iron_skin'
    },
    {
        id: 'd_second_wind', branch: 'defense', tier: 3, cost: 2,
        name: 'Second Wind',  icon: '\u{1F32C}',
        stats: { healthRegen: 1, stamina: 15 },
        description: 'Regenerate 1 HP/s. +15 stamina.',
        prereq: 'd_resilience'
    },
    {
        id: 'd_immortal',    branch: 'defense', tier: 4, cost: 3,
        name: 'Immortal',     icon: '\u{1F300}',
        stats: { health: 40, armor: 8, healthRegen: 2 },
        description: '+40 HP, +8 armor, +2 HP/s regen.',
        prereq: 'd_second_wind'
    },

    // ── UTILITY BRANCH (right column) ───────────────────────
    {
        id: 'u_swift',       branch: 'utility', tier: 0, cost: 1,
        name: 'Swift',       icon: '\u{1F3C3}',
        stats: { runSpeed: 0.5, stamina: 10 },
        description: '+0.5 run speed, +10 stamina.',
        prereq: null
    },
    {
        id: 'u_endurance',   branch: 'utility', tier: 1, cost: 1,
        name: 'Endurance',   icon: '\u26A1',
        stats: { stamina: 20 },
        description: '+20 maximum stamina.',
        prereq: 'u_swift'
    },
    {
        id: 'u_agility',     branch: 'utility', tier: 2, cost: 2,
        name: 'Agility',     icon: '\u{1F4A8}',
        stats: { runSpeed: 0.8, jumpForce: 1.0, attackSpeed: 0.1 },
        description: '+0.8 speed, +1 jump, +10% attack speed.',
        prereq: 'u_endurance'
    },
    {
        id: 'u_scavenger',   branch: 'utility', tier: 3, cost: 2,
        name: 'Scavenger',   icon: '\u{1F4B0}',
        stats: { soulBonus: 0.25 },
        description: '+25% souls earned from kills.',
        prereq: 'u_agility'
    },
    {
        id: 'u_transcend',   branch: 'utility', tier: 4, cost: 3,
        name: 'Transcend',   icon: '\u2728',
        stats: { runSpeed: 1.0, stamina: 20, damage: 5, health: 15 },
        description: 'Mastery over body and spirit. All stats enhanced.',
        prereq: 'u_scavenger'
    }
];

/** Get talents for a specific branch */
export function getTalentsByBranch(branch) {
    return TALENTS.filter(t => t.branch === branch).sort((a, b) => a.tier - b.tier);
}

/** Get talent by id */
export function getTalent(id) {
    return TALENTS.find(t => t.id === id) ?? null;
}

/** Calculate total cost of a set of talent ids */
export function getTotalTalentCost(unlockedIds) {
    return TALENTS.filter(t => unlockedIds.includes(t.id)).reduce((sum, t) => sum + t.cost, 0);
}
