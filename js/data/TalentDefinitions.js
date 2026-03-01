/**
 * TalentDefinitions — Kit-specific talent trees.
 *
 * Architecture:
 *   - Each kit has a Central Spine (8 nodes, gateway to branches)
 *   - 3 Themed Branches per kit (~23-28 nodes each)
 *   - Choice Nodes: binary pick-one-lock-other decisions
 *   - Keystones: major power spikes within branches
 *   - Capstones: ultimate-modifying final nodes per branch
 *   - Point economy: ~1 point per boss, max ~70 levels, can't fill all 100
 *
 * Node types:
 *   'passive'   — simple stat bonus (cost 1)
 *   'major'     — significant effect (cost 2)
 *   'keystone'  — branch power spike (cost 3)
 *   'capstone'  — ultimate modifier, end of branch (cost 3)
 *   'choice'    — pick one of two options (cost 2). Has choiceGroup field.
 *                 All nodes with same choiceGroup are mutually exclusive.
 *   'connector' — free gateway node on the spine (cost 0) that unlocks a branch
 */

// ─── Branch color themes ─────────────────────────────────────
export const BRANCH_THEMES = {
    spine:    { label: 'Core',      color: '#ffffff', glow: 'rgba(255,255,255,0.3)', icon: '◆' },
    // Blood Mage
    bm_hemo:  { label: 'Hemorrhage',   color: '#ff2222', glow: 'rgba(255,34,34,0.4)',   icon: '🩸' },
    bm_soul:  { label: 'Soul Siphon',  color: '#aa44ff', glow: 'rgba(170,68,255,0.4)',  icon: '👁' },
    bm_inferno:{ label: 'Inferno',     color: '#ff6600', glow: 'rgba(255,102,0,0.4)',   icon: '🔥' },
    // Frost Mage
    fm_glacial:{ label: 'Glacial',     color: '#88ddff', glow: 'rgba(136,221,255,0.4)', icon: '❄' },
    fm_shatter:{ label: 'Shatter',     color: '#4488ff', glow: 'rgba(68,136,255,0.4)',  icon: '💎' },
    fm_storm:  { label: 'Tempest',     color: '#aaccff', glow: 'rgba(170,204,255,0.4)', icon: '🌊' },
    // Shadow Assassin
    sa_venom:  { label: 'Venom',       color: '#44cc44', glow: 'rgba(68,204,68,0.4)',   icon: '🐍' },
    sa_shadow: { label: 'Shadow',      color: '#8844cc', glow: 'rgba(136,68,204,0.4)',  icon: '🌑' },
    sa_blade:  { label: 'Bladework',   color: '#cccccc', glow: 'rgba(204,204,204,0.4)', icon: '⚔' },
    // Bow Ranger
    br_marks:  { label: 'Marksman',    color: '#ffcc44', glow: 'rgba(255,204,68,0.4)',  icon: '🎯' },
    br_hunter: { label: 'Hunter',      color: '#44cc44', glow: 'rgba(68,204,68,0.4)',   icon: '🏹' },
    br_sky:    { label: 'Skyward',     color: '#88bbff', glow: 'rgba(136,187,255,0.4)', icon: '🦅' },
    // Werewolf
    ww_feral:  { label: 'Feral',       color: '#ff4444', glow: 'rgba(255,68,68,0.4)',   icon: '🐺' },
    ww_pack:   { label: 'Pack',        color: '#ffaa44', glow: 'rgba(255,170,68,0.4)',  icon: '🌙' },
    ww_blood:  { label: 'Bloodlust',   color: '#cc2222', glow: 'rgba(204,34,34,0.4)',   icon: '💀' },
    // Bear
    be_iron:   { label: 'Ironhide',    color: '#8899aa', glow: 'rgba(136,153,170,0.4)', icon: '🛡' },
    be_quake:  { label: 'Earthquake',  color: '#cc8844', glow: 'rgba(204,136,68,0.4)',  icon: '⚡' },
    be_warden: { label: 'Warden',      color: '#44aa44', glow: 'rgba(68,170,68,0.4)',   icon: '🌿' },
};

// ─── Helper to build a talent node ──────────────────────────
function node(id, branch, tier, type, cost, name, icon, description, stats, prereqs = [], extra = {}) {
    return { id, branch, tier, type, cost, name, icon, description, stats, prereqs, ...extra };
}

// ═══════════════════════════════════════════════════════════════
// BLOOD MAGE TALENT TREE
// ═══════════════════════════════════════════════════════════════
const BLOOD_MAGE_TALENTS = [
    // ── Central Spine ──────────────────────────────────────────
    node('bm_s1', 'spine', 0, 'passive', 1, 'Blood Attunement',  '🩸', '+3 base damage, +10 HP.', { damage: 3, health: 10 }),
    node('bm_s2', 'spine', 1, 'passive', 1, 'Crimson Flow',      '💉', '+5% crit chance.', { critChance: 0.05 }),
    node('bm_s3', 'spine', 2, 'passive', 1, 'Sanguine Vigor',    '❤', '+20 HP, +10 stamina.', { health: 20, stamina: 10 }),
    node('bm_s4', 'spine', 3, 'connector', 0, 'Hemorrhage Path', '🩸', 'Unlocks the Hemorrhage branch.', {}, ['bm_s3'], { unlocksBranch: 'bm_hemo' }),
    node('bm_s5', 'spine', 4, 'passive', 1, 'Blood Mastery',     '🔮', '+5 damage, +2% lifesteal.', { damage: 5, lifesteal: 0.02 }),
    node('bm_s6', 'spine', 5, 'connector', 0, 'Soul Siphon Path','👁', 'Unlocks the Soul Siphon branch.', {}, ['bm_s5'], { unlocksBranch: 'bm_soul' }),
    node('bm_s7', 'spine', 6, 'passive', 1, 'Lifeblood',         '🫀', '+25 HP, +3 armor.', { health: 25, armor: 3 }),
    node('bm_s8', 'spine', 7, 'connector', 0, 'Inferno Path',    '🔥', 'Unlocks the Inferno branch.', {}, ['bm_s7'], { unlocksBranch: 'bm_inferno' }),

    // ── Hemorrhage Branch (DoT / bleed-focused) ───────────────
    node('bm_h1', 'bm_hemo', 0, 'passive', 1, 'Open Wounds',     '🗡', 'Blood charges deal +2 DoT per tick.', { bloodDotBonus: 2 }, ['bm_s4']),
    node('bm_h2', 'bm_hemo', 1, 'passive', 1, 'Arterial Strike', '💢', '+4 damage, +3% crit chance.', { damage: 4, critChance: 0.03 }, ['bm_h1']),
    node('bm_h3', 'bm_hemo', 2, 'major',   2, 'Hemorrhage',      '🩸', 'Crits cause enemies to bleed for 4s, dealing 5 dmg/s.', { bleedOnCrit: true, bleedDamage: 5, bleedDuration: 4 }, ['bm_h2']),
    node('bm_h4a', 'bm_hemo', 3, 'choice', 2, 'Blood Frenzy',    '⚡', 'Each bleed stack on target gives +5% attack speed.', { bleedAttackSpeedPer: 0.05 }, ['bm_h3'], { choiceGroup: 'bm_h4' }),
    node('bm_h4b', 'bm_hemo', 3, 'choice', 2, 'Deep Cuts',       '🔪', 'Bleeds last 100% longer and deal +30% damage.', { bleedDurationMult: 2.0, bleedDamageMult: 1.3 }, ['bm_h3'], { choiceGroup: 'bm_h4' }),
    node('bm_h5', 'bm_hemo', 4, 'passive', 1, 'Sanguine Feast',  '🍷', '+3% lifesteal.', { lifesteal: 0.03 }, ['bm_h4a', 'bm_h4b']),
    node('bm_h6', 'bm_hemo', 5, 'keystone', 3, 'Exsanguinate',   '💀', 'Enemies below 30% HP take 50% more bleed damage.', { executeBleedMult: 1.5, executeThreshold: 0.3 }, ['bm_h5']),
    node('bm_h7', 'bm_hemo', 6, 'passive', 1, 'Crimson Resilience','🛡', '+15 HP, +5 armor.', { health: 15, armor: 5 }, ['bm_h6']),
    node('bm_h8', 'bm_hemo', 7, 'capstone', 3, 'Blood Crescendo', '🌊', 'Ultimate (F): Each blood charge consumed adds a bonus crescent wave.', { ultBonusWaves: true }, ['bm_h7']),

    // ── Soul Siphon Branch (drain / sustain) ──────────────────
    node('bm_so1', 'bm_soul', 0, 'passive', 1, 'Soul Tap',       '💧', '+2% lifesteal, +10 HP.', { lifesteal: 0.02, health: 10 }, ['bm_s6']),
    node('bm_so2', 'bm_soul', 1, 'passive', 1, 'Spirit Siphon',  '🌀', '+15 HP, HP regen +1/s.', { health: 15, healthRegen: 1 }, ['bm_so1']),
    node('bm_so3', 'bm_soul', 2, 'major',   2, 'Drain Life',     '👻', 'Q ability heals for 25% of damage dealt.', { qHealPercent: 0.25 }, ['bm_so2']),
    node('bm_so4a','bm_soul', 3, 'choice', 2, 'Vampiric Aura',   '🦇', 'Lifesteal applies to ability damage too.', { abilityLifesteal: true }, ['bm_so3'], { choiceGroup: 'bm_so4' }),
    node('bm_so4b','bm_soul', 3, 'choice', 2, 'Soul Shield',     '🛡', 'Overhealing converts to a shield (max 30 HP).', { overhealShield: true, overhealShieldMax: 30 }, ['bm_so3'], { choiceGroup: 'bm_so4' }),
    node('bm_so5', 'bm_soul', 4, 'passive', 1, 'Essence Harvest', '🌾', '+20 HP, +2 HP/s regen.', { health: 20, healthRegen: 2 }, ['bm_so4a', 'bm_so4b']),
    node('bm_so6', 'bm_soul', 5, 'keystone', 3, 'Life Reservoir', '🏺', 'Max HP increased by 15%. Healing effectiveness +25%.', { healthPercent: 0.15, healingMult: 1.25 }, ['bm_so5']),
    node('bm_so7', 'bm_soul', 6, 'passive', 1, 'Undying Will',   '💫', '+3 armor, +1 HP/s regen.', { armor: 3, healthRegen: 1 }, ['bm_so6']),
    node('bm_so8', 'bm_soul', 7, 'capstone', 3, 'Sanguine Rebirth','🔄', 'Ultimate (F): On cast, heal to full HP over 4s.', { ultFullHeal: true }, ['bm_so7']),

    // ── Inferno Branch (burst / fire) ─────────────────────────
    node('bm_i1', 'bm_inferno', 0, 'passive', 1, 'Kindling',     '🔥', '+5 damage, charged attacks +10% damage.', { damage: 5, chargedDamageMult: 0.1 }, ['bm_s8']),
    node('bm_i2', 'bm_inferno', 1, 'passive', 1, 'Firebrand',    '🌡', '+5% crit chance, +15% crit multiplier.', { critChance: 0.05, critMultiplier: 0.15 }, ['bm_i1']),
    node('bm_i3', 'bm_inferno', 2, 'major',   2, 'Ignite',       '💥', 'Charged attacks set enemies on fire (3 dmg/s for 4s).', { igniteDot: true, igniteDamage: 3, igniteDuration: 4 }, ['bm_i2']),
    node('bm_i4a','bm_inferno', 3, 'choice', 2, 'Pyroclasm',     '🌋', 'E ability gains +40% damage and +1 radius.', { eDamageMult: 1.4, eRadiusBonus: 1 }, ['bm_i3'], { choiceGroup: 'bm_i4' }),
    node('bm_i4b','bm_inferno', 3, 'choice', 2, 'Rapid Fire',    '⚡', 'Basic attacks are 25% faster, +3 damage.', { attackSpeed: 0.25, damage: 3 }, ['bm_i3'], { choiceGroup: 'bm_i4' }),
    node('bm_i5', 'bm_inferno', 4, 'passive', 1, 'Wildfire',     '🔥', '+8 damage.', { damage: 8 }, ['bm_i4a', 'bm_i4b']),
    node('bm_i6', 'bm_inferno', 5, 'keystone', 3, 'Combustion',  '☄', 'Killing a burning enemy causes an explosion (50% of kill damage to nearby enemies).', { burnExplosion: true, burnExplosionPercent: 0.5 }, ['bm_i5']),
    node('bm_i7', 'bm_inferno', 6, 'passive', 1, 'Hellfire',     '🔥', '+10 damage, +10% crit multiplier.', { damage: 10, critMultiplier: 0.1 }, ['bm_i6']),
    node('bm_i8', 'bm_inferno', 7, 'capstone', 3, 'Apocalypse',  '🌪', 'Ultimate (F): Leaves a burning ground for 6s dealing 15 dmg/s.', { ultBurningGround: true, ultBurnDamage: 15, ultBurnDuration: 6 }, ['bm_i7']),
];

// ═══════════════════════════════════════════════════════════════
// FROST MAGE TALENT TREE
// ═══════════════════════════════════════════════════════════════
const FROST_MAGE_TALENTS = [
    // ── Central Spine ──────────────────────────────────────────
    node('fm_s1', 'spine', 0, 'passive', 1, 'Frost Attunement',  '❄', '+3 damage, +10 HP.', { damage: 3, health: 10 }),
    node('fm_s2', 'spine', 1, 'passive', 1, 'Cold Snap',         '🌬', '+5% crit chance.', { critChance: 0.05 }),
    node('fm_s3', 'spine', 2, 'passive', 1, 'Winter\'s Grasp',   '🧊', '+20 HP, +10 stamina.', { health: 20, stamina: 10 }),
    node('fm_s4', 'spine', 3, 'connector', 0, 'Glacial Path',    '❄', 'Unlocks the Glacial branch.', {}, ['fm_s3'], { unlocksBranch: 'fm_glacial' }),
    node('fm_s5', 'spine', 4, 'passive', 1, 'Permafrost',        '🔷', '+5 damage, +2 armor.', { damage: 5, armor: 2 }),
    node('fm_s6', 'spine', 5, 'connector', 0, 'Shatter Path',    '💎', 'Unlocks the Shatter branch.', {}, ['fm_s5'], { unlocksBranch: 'fm_shatter' }),
    node('fm_s7', 'spine', 6, 'passive', 1, 'Arctic Resilience', '🛡', '+25 HP, +3 armor.', { health: 25, armor: 3 }),
    node('fm_s8', 'spine', 7, 'connector', 0, 'Tempest Path',    '🌊', 'Unlocks the Tempest branch.', {}, ['fm_s7'], { unlocksBranch: 'fm_storm' }),

    // ── Glacial Branch (freeze / control) ─────────────────────
    node('fm_g1', 'fm_glacial', 0, 'passive', 1, 'Chilling Touch',   '🧊', 'Frost stacks applied +1 faster.', { frostStackBonus: 1 }, ['fm_s4']),
    node('fm_g2', 'fm_glacial', 1, 'passive', 1, 'Frostbite',        '❄', '+4 damage to frozen enemies.', { frozenDamageBonus: 4 }, ['fm_g1']),
    node('fm_g3', 'fm_glacial', 2, 'major',   2, 'Deep Freeze',      '🧊', 'Freeze duration increased by 50%.', { freezeDurationMult: 1.5 }, ['fm_g2']),
    node('fm_g4a','fm_glacial', 3, 'choice', 2, 'Glacial Prison',    '🏔', 'Frozen enemies take +25% damage from all sources.', { frozenVulnerability: 0.25 }, ['fm_g3'], { choiceGroup: 'fm_g4' }),
    node('fm_g4b','fm_glacial', 3, 'choice', 2, 'Spreading Frost',   '🌀', 'When an enemy is frozen, nearby enemies gain 3 frost stacks.', { freezeSpread: true, freezeSpreadStacks: 3 }, ['fm_g3'], { choiceGroup: 'fm_g4' }),
    node('fm_g5', 'fm_glacial', 4, 'passive', 1, 'Icy Veins',        '💙', '+5% crit, +15% crit multiplier.', { critChance: 0.05, critMultiplier: 0.15 }, ['fm_g4a', 'fm_g4b']),
    node('fm_g6', 'fm_glacial', 5, 'keystone', 3, 'Absolute Zero',   '⛄', 'Frozen enemies shatter on death, dealing 40% of max HP as AoE.', { shatterOnDeath: true, shatterPercent: 0.4 }, ['fm_g5']),
    node('fm_g7', 'fm_glacial', 6, 'passive', 1, 'Glacial Armor',    '🛡', '+8 armor, +15 HP.', { armor: 8, health: 15 }, ['fm_g6']),
    node('fm_g8', 'fm_glacial', 7, 'capstone', 3, 'Eternal Winter',  '🌨', 'Ultimate (F): Blizzard freeze threshold reduced to 4 stacks.', { ultFreezeThreshold: 4 }, ['fm_g7']),

    // ── Shatter Branch (burst / crit) ─────────────────────────
    node('fm_sh1', 'fm_shatter', 0, 'passive', 1, 'Brittle',        '💎', '+4 damage, attacks on frozen +10%.', { damage: 4, frozenDamageMult: 0.1 }, ['fm_s6']),
    node('fm_sh2', 'fm_shatter', 1, 'passive', 1, 'Crystal Edge',   '🔹', '+5% crit, +10% crit multiplier.', { critChance: 0.05, critMultiplier: 0.1 }, ['fm_sh1']),
    node('fm_sh3', 'fm_shatter', 2, 'major',   2, 'Ice Lance',      '🗡', 'Charged attacks deal +30% damage to frozen targets.', { chargedFrozenBonus: 0.3 }, ['fm_sh2']),
    node('fm_sh4a','fm_shatter', 3, 'choice', 2, 'Shatter Blast',   '💥', 'Breaking freeze deals bonus burst = 20% of charged damage.', { shatterBurst: true, shatterBurstPercent: 0.2 }, ['fm_sh3'], { choiceGroup: 'fm_sh4' }),
    node('fm_sh4b','fm_shatter', 3, 'choice', 2, 'Piercing Cold',   '🔱', 'Frost projectiles pierce 1 additional enemy.', { frostPierce: 1 }, ['fm_sh3'], { choiceGroup: 'fm_sh4' }),
    node('fm_sh5', 'fm_shatter', 4, 'passive', 1, 'Avalanche',      '🏔', '+8 damage.', { damage: 8 }, ['fm_sh4a', 'fm_sh4b']),
    node('fm_sh6', 'fm_shatter', 5, 'keystone', 3, 'Diamond Dust',  '✨', 'Crits on frozen enemies reset E cooldown.', { critFrozenResetE: true }, ['fm_sh5']),
    node('fm_sh7', 'fm_shatter', 6, 'passive', 1, 'Frozen Fury',    '🔥', '+10 damage, +5% crit.', { damage: 10, critChance: 0.05 }, ['fm_sh6']),
    node('fm_sh8', 'fm_shatter', 7, 'capstone', 3, 'Cataclysm',     '☄', 'Ultimate (F): Blizzard deals 2x damage to frozen targets.', { ultFrozenDoubleDmg: true }, ['fm_sh7']),

    // ── Tempest Branch (AoE / storm) ──────────────────────────
    node('fm_t1', 'fm_storm', 0, 'passive', 1, 'Gale Force',       '🌬', '+3 damage, +0.5 run speed.', { damage: 3, runSpeed: 0.5 }, ['fm_s8']),
    node('fm_t2', 'fm_storm', 1, 'passive', 1, 'Whirlwind',        '🌪', '+10 stamina, +5% attack speed.', { stamina: 10, attackSpeed: 0.05 }, ['fm_t1']),
    node('fm_t3', 'fm_storm', 2, 'major',   2, 'Chain Lightning',  '⚡', 'Stalactite (X) chains to 1 nearby enemy at 60% damage.', { stalactiteChain: true, chainDamagePercent: 0.6 }, ['fm_t2']),
    node('fm_t4a','fm_storm', 3, 'choice', 2, 'Hurricane',         '🌀', 'Ice Barrier (C) deals damage to nearby enemies.', { barrierDamage: true, barrierDps: 8 }, ['fm_t3'], { choiceGroup: 'fm_t4' }),
    node('fm_t4b','fm_storm', 3, 'choice', 2, 'Eye of Storm',      '👁', 'Standing still for 2s grants +20% damage for 4s.', { stillDamageBonus: 0.2, stillDuration: 4 }, ['fm_t3'], { choiceGroup: 'fm_t4' }),
    node('fm_t5', 'fm_storm', 4, 'passive', 1, 'Tempest Shield',   '🛡', '+20 HP, +5 armor.', { health: 20, armor: 5 }, ['fm_t4a', 'fm_t4b']),
    node('fm_t6', 'fm_storm', 5, 'keystone', 3, 'Thunderstorm',    '⛈', 'Every 5th attack calls down a bolt for 40 damage.', { thunderBolt: true, thunderBoltDamage: 40, thunderBoltInterval: 5 }, ['fm_t5']),
    node('fm_t7', 'fm_storm', 6, 'passive', 1, 'Stormcaller',      '🌩', '+8 damage, +15 stamina.', { damage: 8, stamina: 15 }, ['fm_t6']),
    node('fm_t8', 'fm_storm', 7, 'capstone', 3, 'Maelstrom',       '🌊', 'Ultimate (F): Blizzard radius +50%, pulls enemies inward.', { ultRadiusMult: 1.5, ultPull: true }, ['fm_t7']),
];

// ═══════════════════════════════════════════════════════════════
// SHADOW ASSASSIN TALENT TREE
// ═══════════════════════════════════════════════════════════════
const SHADOW_ASSASSIN_TALENTS = [
    // ── Central Spine ──────────────────────────────────────────
    node('sa_s1', 'spine', 0, 'passive', 1, 'Sharpened Blades',   '🗡', '+3 damage, +10 stamina.', { damage: 3, stamina: 10 }),
    node('sa_s2', 'spine', 1, 'passive', 1, 'Quick Reflexes',     '⚡', '+5% crit chance.', { critChance: 0.05 }),
    node('sa_s3', 'spine', 2, 'passive', 1, 'Nimble',             '💨', '+0.5 speed, +10 stamina.', { runSpeed: 0.5, stamina: 10 }),
    node('sa_s4', 'spine', 3, 'connector', 0, 'Venom Path',       '🐍', 'Unlocks the Venom branch.', {}, ['sa_s3'], { unlocksBranch: 'sa_venom' }),
    node('sa_s5', 'spine', 4, 'passive', 1, 'Lethality',          '💀', '+5 damage, +10% backstab multiplier.', { damage: 5, backstabMultiplier: 0.1 }),
    node('sa_s6', 'spine', 5, 'connector', 0, 'Shadow Path',      '🌑', 'Unlocks the Shadow branch.', {}, ['sa_s5'], { unlocksBranch: 'sa_shadow' }),
    node('sa_s7', 'spine', 6, 'passive', 1, 'Ghost Step',         '👻', '+0.5 speed, +15 stamina.', { runSpeed: 0.5, stamina: 15 }),
    node('sa_s8', 'spine', 7, 'connector', 0, 'Bladework Path',   '⚔', 'Unlocks the Bladework branch.', {}, ['sa_s7'], { unlocksBranch: 'sa_blade' }),

    // ── Venom Branch (poison / DoT) ──────────────────────────
    node('sa_v1', 'sa_venom', 0, 'passive', 1, 'Toxic Coating',    '🧪', 'Poison charges deal +2 damage per tick.', { poisonTickBonus: 2 }, ['sa_s4']),
    node('sa_v2', 'sa_venom', 1, 'passive', 1, 'Venomous Strikes', '🐍', '+1 max poison charge.', { maxPoisonCharges: 1 }, ['sa_v1']),
    node('sa_v3', 'sa_venom', 2, 'major',   2, 'Neurotoxin',       '☠', 'Poisoned enemies are slowed by 20%.', { poisonSlow: 0.2 }, ['sa_v2']),
    node('sa_v4a','sa_venom', 3, 'choice', 2, 'Corrosive Venom',   '🧫', 'Poison reduces enemy armor by 3 per stack.', { poisonArmorShred: 3 }, ['sa_v3'], { choiceGroup: 'sa_v4' }),
    node('sa_v4b','sa_venom', 3, 'choice', 2, 'Virulent Plague',   '🦠', 'Poison spreads to nearby enemies at 50% potency.', { poisonSpread: true, spreadPotency: 0.5 }, ['sa_v3'], { choiceGroup: 'sa_v4' }),
    node('sa_v5', 'sa_venom', 4, 'passive', 1, 'Toxic Mastery',    '🧬', '+5 damage, +3% lifesteal.', { damage: 5, lifesteal: 0.03 }, ['sa_v4a', 'sa_v4b']),
    node('sa_v6', 'sa_venom', 5, 'keystone', 3, 'Pandemic',        '💀', 'At 6 poison stacks, enemy takes 50% more poison damage.', { poisonExecute: true, poisonExecuteThreshold: 6, poisonExecuteMult: 1.5 }, ['sa_v5']),
    node('sa_v7', 'sa_venom', 6, 'passive', 1, 'Venom Immunity',   '🛡', '+20 HP, +5 armor.', { health: 20, armor: 5 }, ['sa_v6']),
    node('sa_v8', 'sa_venom', 7, 'capstone', 3, 'Plague Bearer',   '🌫', 'Ultimate (F): Twin Daggers leave poison clouds for 5s.', { ultPoisonCloud: true, ultCloudDuration: 5 }, ['sa_v7']),

    // ── Shadow Branch (stealth / evasion) ─────────────────────
    node('sa_sh1', 'sa_shadow', 0, 'passive', 1, 'Cloak & Dagger', '🌙', 'Vanish duration +1s.', { vanishDurationBonus: 1 }, ['sa_s6']),
    node('sa_sh2', 'sa_shadow', 1, 'passive', 1, 'Shadow Step',    '👣', 'Teleport cooldown reduced by 2s.', { teleportCdReduction: 2 }, ['sa_sh1']),
    node('sa_sh3', 'sa_shadow', 2, 'major',   2, 'Ambush',         '🗡', 'First attack from Vanish deals +50% damage.', { vanishDamageMult: 1.5 }, ['sa_sh2']),
    node('sa_sh4a','sa_shadow', 3, 'choice', 2, 'Phantasm',        '👻', 'Vanish leaves a decoy that taunts enemies for 3s.', { vanishDecoy: true, decoyDuration: 3 }, ['sa_sh3'], { choiceGroup: 'sa_sh4' }),
    node('sa_sh4b','sa_shadow', 3, 'choice', 2, 'Shadow Dance',    '💃', 'After Vanish ends, dodge chance +30% for 3s.', { postVanishDodge: 0.3, dodgeDuration: 3 }, ['sa_sh3'], { choiceGroup: 'sa_sh4' }),
    node('sa_sh5', 'sa_shadow', 4, 'passive', 1, 'Evasion',        '💨', '+15 stamina, +0.5 speed.', { stamina: 15, runSpeed: 0.5 }, ['sa_sh4a', 'sa_sh4b']),
    node('sa_sh6', 'sa_shadow', 5, 'keystone', 3, 'Living Shadow', '🌑', 'Teleport resets on kill.', { teleportResetOnKill: true }, ['sa_sh5']),
    node('sa_sh7', 'sa_shadow', 6, 'passive', 1, 'Night\'s Embrace','🌃', '+8 damage, +20% backstab multiplier.', { damage: 8, backstabMultiplier: 0.2 }, ['sa_sh6']),
    node('sa_sh8', 'sa_shadow', 7, 'capstone', 3, 'Shadowstrike',  '⚫', 'Ultimate (F): Twin Daggers teleport to every enemy in range.', { ultTeleportStrike: true }, ['sa_sh7']),

    // ── Bladework Branch (combos / raw damage) ────────────────
    node('sa_b1', 'sa_blade', 0, 'passive', 1, 'Honed Edge',       '⚔', '+5 damage.', { damage: 5 }, ['sa_s8']),
    node('sa_b2', 'sa_blade', 1, 'passive', 1, 'Flurry',           '💫', '+10% attack speed.', { attackSpeed: 0.1 }, ['sa_b1']),
    node('sa_b3', 'sa_blade', 2, 'major',   2, 'Blade Dance',      '🗡', 'Combo window extended by 0.1s, max combo +1.', { comboWindowBonus: 0.1, maxComboBonus: 1 }, ['sa_b2']),
    node('sa_b4a','sa_blade', 3, 'choice', 2, 'Whirlwind',         '🌪', 'Max combo attack hits all enemies in range.', { comboFinisherAoE: true }, ['sa_b3'], { choiceGroup: 'sa_b4' }),
    node('sa_b4b','sa_blade', 3, 'choice', 2, 'Precision',         '🎯', 'Each combo hit increases crit chance by 8%.', { comboCritBonus: 0.08 }, ['sa_b3'], { choiceGroup: 'sa_b4' }),
    node('sa_b5', 'sa_blade', 4, 'passive', 1, 'Razor\'s Edge',    '🔪', '+5% crit chance, +20% crit multiplier.', { critChance: 0.05, critMultiplier: 0.2 }, ['sa_b4a', 'sa_b4b']),
    node('sa_b6', 'sa_blade', 5, 'keystone', 3, 'Death by 1000 Cuts','⚔', 'Every 4th hit deals double damage.', { everyNthDouble: 4 }, ['sa_b5']),
    node('sa_b7', 'sa_blade', 6, 'passive', 1, 'Perfect Form',     '✨', '+10 damage, +10% attack speed.', { damage: 10, attackSpeed: 0.1 }, ['sa_b6']),
    node('sa_b8', 'sa_blade', 7, 'capstone', 3, 'Blade Fury',      '🌊', 'Ultimate (F): Twin Daggers fire 3 waves instead of 1.', { ultTripleWave: true }, ['sa_b7']),
];

// ═══════════════════════════════════════════════════════════════
// BOW RANGER TALENT TREE
// ═══════════════════════════════════════════════════════════════
const BOW_RANGER_TALENTS = [
    // ── Central Spine ──────────────────────────────────────────
    node('br_s1', 'spine', 0, 'passive', 1, 'Steady Aim',         '🏹', '+3 damage, +10 stamina.', { damage: 3, stamina: 10 }),
    node('br_s2', 'spine', 1, 'passive', 1, 'Eagle Eye',          '🦅', '+5% crit chance.', { critChance: 0.05 }),
    node('br_s3', 'spine', 2, 'passive', 1, 'Pathfinder',         '🧭', '+0.5 speed, +10 stamina.', { runSpeed: 0.5, stamina: 10 }),
    node('br_s4', 'spine', 3, 'connector', 0, 'Marksman Path',    '🎯', 'Unlocks the Marksman branch.', {}, ['br_s3'], { unlocksBranch: 'br_marks' }),
    node('br_s5', 'spine', 4, 'passive', 1, 'Hawkeye',            '👁', '+5 damage, +5% crit.', { damage: 5, critChance: 0.05 }),
    node('br_s6', 'spine', 5, 'connector', 0, 'Hunter Path',      '🏹', 'Unlocks the Hunter branch.', {}, ['br_s5'], { unlocksBranch: 'br_hunter' }),
    node('br_s7', 'spine', 6, 'passive', 1, 'Survival Instinct',  '🛡', '+20 HP, +5 armor.', { health: 20, armor: 5 }),
    node('br_s8', 'spine', 7, 'connector', 0, 'Skyward Path',     '🦅', 'Unlocks the Skyward branch.', {}, ['br_s7'], { unlocksBranch: 'br_sky' }),

    // ── Marksman Branch (precision / single-target) ───────────
    node('br_m1', 'br_marks', 0, 'passive', 1, 'Sharpshooter',    '🎯', '+4 damage, arrows fly 20% faster.', { damage: 4, projectileSpeedMult: 0.2 }, ['br_s4']),
    node('br_m2', 'br_marks', 1, 'passive', 1, 'Headshot',        '💀', '+8% crit chance.', { critChance: 0.08 }, ['br_m1']),
    node('br_m3', 'br_marks', 2, 'major',   2, 'Sniper',          '🔭', 'Charged arrows deal +40% damage at max range.', { chargedRangeBonus: 0.4 }, ['br_m2']),
    node('br_m4a','br_marks', 3, 'choice', 2, 'Deadeye',          '👁', 'Consecutive hits on same target: +10% damage stacking.', { consecutiveHitBonus: 0.1 }, ['br_m3'], { choiceGroup: 'br_m4' }),
    node('br_m4b','br_marks', 3, 'choice', 2, 'Explosive Arrow',  '💥', 'Charged shots explode for 30% damage in small radius.', { chargedExplosion: true, explosionPercent: 0.3 }, ['br_m3'], { choiceGroup: 'br_m4' }),
    node('br_m5', 'br_marks', 4, 'passive', 1, 'Lethal Focus',    '🗡', '+25% crit multiplier.', { critMultiplier: 0.25 }, ['br_m4a', 'br_m4b']),
    node('br_m6', 'br_marks', 5, 'keystone', 3, 'Bullseye',       '🎯', 'Crits have 25% chance to refund the arrow (no trust charge cost).', { critRefundChance: 0.25 }, ['br_m5']),
    node('br_m7', 'br_marks', 6, 'passive', 1, 'Apex Predator',   '🦅', '+10 damage, +5% crit.', { damage: 10, critChance: 0.05 }, ['br_m6']),
    node('br_m8', 'br_marks', 7, 'capstone', 3, 'Perfect Shot',   '⭐', 'Ultimate (F): Skyfall Arrow fires 3 precision bolts first.', { ultPrecisionBolts: true, ultBoltCount: 3 }, ['br_m7']),

    // ── Hunter Branch (traps / utility) ───────────────────────
    node('br_hu1', 'br_hunter', 0, 'passive', 1, 'Tracker',        '🔍', '+1 max trust charge.', { maxTrustCharges: 1 }, ['br_s6']),
    node('br_hu2', 'br_hunter', 1, 'passive', 1, 'Recoil Expert',  '💨', 'Recoil Shot pushes further, -2s cooldown.', { recoilCdReduction: 2 }, ['br_hu1']),
    node('br_hu3', 'br_hunter', 2, 'major',   2, 'Hunter\'s Trap', '🪤', 'Recoil Shot leaves a slow field for 3s.', { recoilSlowField: true, slowDuration: 3, slowPercent: 0.3 }, ['br_hu2']),
    node('br_hu4a','br_hunter', 3, 'choice', 2, 'Camouflage',      '🌿', 'After Recoil Shot, gain 30% dodge for 2s.', { recoilDodge: 0.3, recoilDodgeDuration: 2 }, ['br_hu3'], { choiceGroup: 'br_hu4' }),
    node('br_hu4b','br_hunter', 3, 'choice', 2, 'Mark Prey',       '❌', 'Hunter\'s Mark zone lasts 40% longer and gives +15% damage.', { markDurationMult: 1.4, markDamageMult: 0.15 }, ['br_hu3'], { choiceGroup: 'br_hu4' }),
    node('br_hu5', 'br_hunter', 4, 'passive', 1, 'Wild Instinct',  '🐾', '+15 HP, +2% lifesteal.', { health: 15, lifesteal: 0.02 }, ['br_hu4a', 'br_hu4b']),
    node('br_hu6', 'br_hunter', 5, 'keystone', 3, 'Apex Hunter',   '🏆', 'Enemies below 25% HP: guaranteed crit.', { executeCrit: true, executeCritThreshold: 0.25 }, ['br_hu5']),
    node('br_hu7', 'br_hunter', 6, 'passive', 1, 'Survivor',       '🛡', '+25 HP, +5 armor, +1 HP/s.', { health: 25, armor: 5, healthRegen: 1 }, ['br_hu6']),
    node('br_hu8', 'br_hunter', 7, 'capstone', 3, 'Apex Ambush',   '🎭', 'Ultimate (F): Skyfall creates a massive slow zone on impact.', { ultSlowZone: true, ultSlowPercent: 0.4, ultSlowDuration: 5 }, ['br_hu7']),

    // ── Skyward Branch (AoE / multi-shot) ─────────────────────
    node('br_sk1', 'br_sky', 0, 'passive', 1, 'Volley Training',   '🏹', 'Spread shot fires 1 extra arrow.', { spreadExtraArrow: 1 }, ['br_s8']),
    node('br_sk2', 'br_sky', 1, 'passive', 1, 'Arrow Storm',       '🌧', '+3 damage, multi-shot +1 arrow.', { damage: 3, multiShotExtra: 1 }, ['br_sk1']),
    node('br_sk3', 'br_sky', 2, 'major',   2, 'Rain of Arrows',    '⬇', 'Multi-Shot (X) radius +30%, arrows rain longer.', { multiShotRadiusMult: 1.3 }, ['br_sk2']),
    node('br_sk4a','br_sky', 3, 'choice', 2, 'Suppression Fire',   '🔫', 'Multi-Shot slows enemies hit by 25% for 3s.', { multiShotSlow: 0.25, multiShotSlowDuration: 3 }, ['br_sk3'], { choiceGroup: 'br_sk4' }),
    node('br_sk4b','br_sky', 3, 'choice', 2, 'Piercing Rain',      '🔱', 'Multi-Shot arrows pierce through enemies.', { multiShotPierce: true }, ['br_sk3'], { choiceGroup: 'br_sk4' }),
    node('br_sk5', 'br_sky', 4, 'passive', 1, 'Wind Walker',       '💨', '+0.8 speed, +10 stamina.', { runSpeed: 0.8, stamina: 10 }, ['br_sk4a', 'br_sk4b']),
    node('br_sk6', 'br_sky', 5, 'keystone', 3, 'Arrow Barrage',    '🌪', 'Every 3rd basic attack fires 2 bonus arrows.', { bonusArrowInterval: 3, bonusArrowCount: 2 }, ['br_sk5']),
    node('br_sk7', 'br_sky', 6, 'passive', 1, 'Sky Mastery',       '🦅', '+8 damage, +15% attack speed.', { damage: 8, attackSpeed: 0.15 }, ['br_sk6']),
    node('br_sk8', 'br_sky', 7, 'capstone', 3, 'Skyfall Barrage',  '☄', 'Ultimate (F): Skyfall Arrow splits into 5 on impact.', { ultSplit: true, ultSplitCount: 5 }, ['br_sk7']),
];

// ═══════════════════════════════════════════════════════════════
// WEREWOLF TALENT TREE
// ═══════════════════════════════════════════════════════════════
const WEREWOLF_TALENTS = [
    // ── Central Spine ──────────────────────────────────────────
    node('ww_s1', 'spine', 0, 'passive', 1, 'Predator\'s Instinct','🐺', '+3 damage, +10 HP.', { damage: 3, health: 10 }),
    node('ww_s2', 'spine', 1, 'passive', 1, 'Savage Claws',       '🔪', '+5% crit chance.', { critChance: 0.05 }),
    node('ww_s3', 'spine', 2, 'passive', 1, 'Thick Fur',          '🧥', '+15 HP, +3 armor.', { health: 15, armor: 3 }),
    node('ww_s4', 'spine', 3, 'connector', 0, 'Feral Path',       '🐺', 'Unlocks the Feral branch.', {}, ['ww_s3'], { unlocksBranch: 'ww_feral' }),
    node('ww_s5', 'spine', 4, 'passive', 1, 'Alpha Presence',     '👑', '+5 damage, +2% lifesteal.', { damage: 5, lifesteal: 0.02 }),
    node('ww_s6', 'spine', 5, 'connector', 0, 'Pack Path',        '🌙', 'Unlocks the Pack branch.', {}, ['ww_s5'], { unlocksBranch: 'ww_pack' }),
    node('ww_s7', 'spine', 6, 'passive', 1, 'Apex Wolf',          '🐺', '+20 HP, +5 armor.', { health: 20, armor: 5 }),
    node('ww_s8', 'spine', 7, 'connector', 0, 'Bloodlust Path',   '💀', 'Unlocks the Bloodlust branch.', {}, ['ww_s7'], { unlocksBranch: 'ww_blood' }),

    // ── Feral Branch (rage / melee) ──────────────────────────
    node('ww_f1', 'ww_feral', 0, 'passive', 1, 'Feral Fury',      '💢', 'Feral Rage grants +3 damage per stack (up from +2).', { ragePerStackBonus: 1 }, ['ww_s4']),
    node('ww_f2', 'ww_feral', 1, 'passive', 1, 'Savage Lunge',    '🐾', 'Lunge range +25%, +4 damage.', { lungeRangeBonus: 0.25, damage: 4 }, ['ww_f1']),
    node('ww_f3', 'ww_feral', 2, 'major',   2, 'Berserker',       '🔥', 'At max rage (8), gain +20% attack speed.', { maxRageAttackSpeed: 0.2 }, ['ww_f2']),
    node('ww_f4a','ww_feral', 3, 'choice', 2, 'Unstoppable',      '🦬', 'At max rage, immune to stagger.', { maxRageStaggerImmune: true }, ['ww_f3'], { choiceGroup: 'ww_f4' }),
    node('ww_f4b','ww_feral', 3, 'choice', 2, 'Rampage',          '💀', 'Kills grant +2 rage instead of +1.', { killRageBonus: 1 }, ['ww_f3'], { choiceGroup: 'ww_f4' }),
    node('ww_f5', 'ww_feral', 4, 'passive', 1, 'Primal Might',    '💪', '+8 damage, +5% crit.', { damage: 8, critChance: 0.05 }, ['ww_f4a', 'ww_f4b']),
    node('ww_f6', 'ww_feral', 5, 'keystone', 3, 'Feral Ascension','🌟', 'Max rage increased to 12. Each stack gives bonus effects.', { maxRageIncrease: 4 }, ['ww_f5']),
    node('ww_f7', 'ww_feral', 6, 'passive', 1, 'Primal Wrath',    '🔥', '+10 damage, +15% crit multiplier.', { damage: 10, critMultiplier: 0.15 }, ['ww_f6']),
    node('ww_f8', 'ww_feral', 7, 'capstone', 3, 'Blood Frenzy',   '🩸', 'Ultimate (F): Bloodmoon extends by 2s per kill during it.', { ultExtendOnKill: true, ultExtendDuration: 2 }, ['ww_f7']),

    // ── Pack Branch (buffs / sustain) ─────────────────────────
    node('ww_p1', 'ww_pack', 0, 'passive', 1, 'Pack Vitality',    '💚', '+20 HP, +1 HP/s regen.', { health: 20, healthRegen: 1 }, ['ww_s6']),
    node('ww_p2', 'ww_pack', 1, 'passive', 1, 'Howl Boost',       '🌙', 'Blood Howl (X) also heals 10% max HP.', { howlHealPercent: 0.1 }, ['ww_p1']),
    node('ww_p3', 'ww_pack', 2, 'major',   2, 'Alpha Howl',       '🐺', 'Blood Howl debuffs enemies: -15% damage for 5s.', { howlDebuff: true, howlDebuffPercent: 0.15, howlDebuffDuration: 5 }, ['ww_p2']),
    node('ww_p4a','ww_pack', 3, 'choice', 2, 'Iron Will',         '🛡', '+30 HP, +5 armor.', { health: 30, armor: 5 }, ['ww_p3'], { choiceGroup: 'ww_p4' }),
    node('ww_p4b','ww_pack', 3, 'choice', 2, 'Rejuvenation',      '💚', '+3% lifesteal, +2 HP/s regen.', { lifesteal: 0.03, healthRegen: 2 }, ['ww_p3'], { choiceGroup: 'ww_p4' }),
    node('ww_p5', 'ww_pack', 4, 'passive', 1, 'Resilient Hide',   '🧥', '+5 armor, +15 HP.', { armor: 5, health: 15 }, ['ww_p4a', 'ww_p4b']),
    node('ww_p6', 'ww_pack', 5, 'keystone', 3, 'Undying Fury',    '☀', 'Once per fight: survive lethal hit with 1 HP, gain 3s invuln.', { deathSave: true, deathSaveInvuln: 3 }, ['ww_p5']),
    node('ww_p7', 'ww_pack', 6, 'passive', 1, 'Pack Leader',      '👑', '+25 HP, +3 HP/s regen.', { health: 25, healthRegen: 3 }, ['ww_p6']),
    node('ww_p8', 'ww_pack', 7, 'capstone', 3, 'Moonlight Shield','🌕', 'Ultimate (F): Bloodmoon grants a shield equal to 50% max HP.', { ultShield: true, ultShieldPercent: 0.5 }, ['ww_p7']),

    // ── Bloodlust Branch (damage / aggression) ────────────────
    node('ww_bl1', 'ww_blood', 0, 'passive', 1, 'Blood Scent',     '🩸', '+4 damage, +3% crit.', { damage: 4, critChance: 0.03 }, ['ww_s8']),
    node('ww_bl2', 'ww_blood', 1, 'passive', 1, 'Rending Claws',   '🔪', 'Rend (E) deals +15% damage.', { rendDamageMult: 0.15 }, ['ww_bl1']),
    node('ww_bl3', 'ww_blood', 2, 'major',   2, 'Bloodbath',       '🩸', 'Kills heal 8% max HP.', { killHealPercent: 0.08 }, ['ww_bl2']),
    node('ww_bl4a','ww_blood', 3, 'choice', 2, 'Savage Mauling',   '🐺', 'Rend applies a bleed: 4 dmg/s for 4s.', { rendBleed: true, rendBleedDmg: 4, rendBleedDuration: 4 }, ['ww_bl3'], { choiceGroup: 'ww_bl4' }),
    node('ww_bl4b','ww_blood', 3, 'choice', 2, 'Predator\'s Mark', '❌', 'Pounce marks enemy: +20% damage from you for 5s.', { pounceVulnerability: 0.2, pounceDuration: 5 }, ['ww_bl3'], { choiceGroup: 'ww_bl4' }),
    node('ww_bl5', 'ww_blood', 4, 'passive', 1, 'Thirst for Blood','🗡', '+8 damage, +5% lifesteal.', { damage: 8, lifesteal: 0.05 }, ['ww_bl4a', 'ww_bl4b']),
    node('ww_bl6', 'ww_blood', 5, 'keystone', 3, 'Apex Predator',  '💀', 'Damage increases by 1% per 1% of missing HP.', { missingHpDamage: true }, ['ww_bl5']),
    node('ww_bl7', 'ww_blood', 6, 'passive', 1, 'Carnage',         '🔥', '+12 damage, +20% crit multiplier.', { damage: 12, critMultiplier: 0.2 }, ['ww_bl6']),
    node('ww_bl8', 'ww_blood', 7, 'capstone', 3, 'Crimson Frenzy', '🌑', 'Ultimate (F): Bloodmoon damage mult +50%, but drains HP.', { ultDamageMult: 0.5, ultHpDrain: true }, ['ww_bl7']),
];

// ═══════════════════════════════════════════════════════════════
// BEAR TALENT TREE
// ═══════════════════════════════════════════════════════════════
const BEAR_TALENTS = [
    // ── Central Spine ──────────────────────────────────────────
    node('be_s1', 'spine', 0, 'passive', 1, 'Bear\'s Might',      '🐻', '+3 damage, +15 HP.', { damage: 3, health: 15 }),
    node('be_s2', 'spine', 1, 'passive', 1, 'Thick Hide',         '🛡', '+5 armor.', { armor: 5 }),
    node('be_s3', 'spine', 2, 'passive', 1, 'Mountain Born',      '🏔', '+20 HP, +3 armor.', { health: 20, armor: 3 }),
    node('be_s4', 'spine', 3, 'connector', 0, 'Ironhide Path',    '🛡', 'Unlocks the Ironhide branch.', {}, ['be_s3'], { unlocksBranch: 'be_iron' }),
    node('be_s5', 'spine', 4, 'passive', 1, 'Savage Force',       '💪', '+5 damage, +3 armor.', { damage: 5, armor: 3 }),
    node('be_s6', 'spine', 5, 'connector', 0, 'Earthquake Path',  '⚡', 'Unlocks the Earthquake branch.', {}, ['be_s5'], { unlocksBranch: 'be_quake' }),
    node('be_s7', 'spine', 6, 'passive', 1, 'Titan',              '🗿', '+25 HP, +5 armor.', { health: 25, armor: 5 }),
    node('be_s8', 'spine', 7, 'connector', 0, 'Warden Path',      '🌿', 'Unlocks the Warden branch.', {}, ['be_s7'], { unlocksBranch: 'be_warden' }),

    // ── Ironhide Branch (tank / defense) ──────────────────────
    node('be_i1', 'be_iron', 0, 'passive', 1, 'Iron Plates',       '🛡', '+8 armor, +10 HP.', { armor: 8, health: 10 }, ['be_s4']),
    node('be_i2', 'be_iron', 1, 'passive', 1, 'Fortify',           '🏰', 'Thick Hide (C) +2s duration.', { thickHideDurationBonus: 2 }, ['be_i1']),
    node('be_i3', 'be_iron', 2, 'major',   2, 'Unbreakable',       '💎', 'Damage reduction +10% while Thick Hide active.', { thickHideDR: 0.1 }, ['be_i2']),
    node('be_i4a','be_iron', 3, 'choice', 2, 'Reflective Hide',    '🪞', 'Thick Hide reflects 20% of damage taken.', { thickHideReflect: 0.2 }, ['be_i3'], { choiceGroup: 'be_i4' }),
    node('be_i4b','be_iron', 3, 'choice', 2, 'Regenerative Armor', '💚', 'Thick Hide grants 5 HP/s regen.', { thickHideRegen: 5 }, ['be_i3'], { choiceGroup: 'be_i4' }),
    node('be_i5', 'be_iron', 4, 'passive', 1, 'Stone Skin',        '🗿', '+10 armor, +20 HP.', { armor: 10, health: 20 }, ['be_i4a', 'be_i4b']),
    node('be_i6', 'be_iron', 5, 'keystone', 3, 'Immovable Object', '⚓', 'Cannot be staggered. Take 5% less damage per Primal Force stack.', { staggerImmune: true, forceStackDR: 0.05 }, ['be_i5']),
    node('be_i7', 'be_iron', 6, 'passive', 1, 'Adamantine',        '🛡', '+12 armor, +30 HP.', { armor: 12, health: 30 }, ['be_i6']),
    node('be_i8', 'be_iron', 7, 'capstone', 3, 'Indestructible',   '♾', 'Ultimate (F): Primal Fury grants 50% damage reduction.', { ultDamageReduction: 0.5 }, ['be_i7']),

    // ── Earthquake Branch (AoE / power) ──────────────────────
    node('be_q1', 'be_quake', 0, 'passive', 1, 'Tremor',           '⚡', '+5 damage, Earthquake (Q) +10% damage.', { damage: 5, earthquakeDamageMult: 0.1 }, ['be_s6']),
    node('be_q2', 'be_quake', 1, 'passive', 1, 'Aftershock',       '🌋', 'Earthquake leaves a lingering tremor: 3 dmg/s for 3s.', { earthquakeLinger: true, earthquakeLingerDmg: 3 }, ['be_q1']),
    node('be_q3', 'be_quake', 2, 'major',   2, 'Seismic Slam',     '💥', 'Ground Slam (RMB) radius +30%, stuns for 1.5s.', { slamRadiusMult: 1.3, slamStun: 1.5 }, ['be_q2']),
    node('be_q4a','be_quake', 3, 'choice', 2, 'Tectonic Shift',    '🌍', 'Earthquake pulls enemies to center.', { earthquakePull: true }, ['be_q3'], { choiceGroup: 'be_q4' }),
    node('be_q4b','be_quake', 3, 'choice', 2, 'Fissure',           '🔥', 'Ground Slam creates a fissure that deals 40% damage over 3s.', { slamFissure: true, fissurePercent: 0.4, fissureDuration: 3 }, ['be_q3'], { choiceGroup: 'be_q4' }),
    node('be_q5', 'be_quake', 4, 'passive', 1, 'Crushing Force',   '🔨', '+10 damage, +5% crit.', { damage: 10, critChance: 0.05 }, ['be_q4a', 'be_q4b']),
    node('be_q6', 'be_quake', 5, 'keystone', 3, 'World Breaker',   '🌋', 'Maul (E) at max stacks causes a shockwave hitting all nearby.', { maulShockwave: true }, ['be_q5']),
    node('be_q7', 'be_quake', 6, 'passive', 1, 'Titan\'s Fist',    '👊', '+12 damage, +20% crit multiplier.', { damage: 12, critMultiplier: 0.2 }, ['be_q6']),
    node('be_q8', 'be_quake', 7, 'capstone', 3, 'Cataclysm',       '☄', 'Ultimate (F): Primal Fury stomps deal 2x damage, wider radius.', { ultStompMult: 2.0, ultStompRadius: 1.5 }, ['be_q7']),

    // ── Warden Branch (sustain / hybrid) ──────────────────────
    node('be_w1', 'be_warden', 0, 'passive', 1, 'Nature\'s Gift',   '🌿', '+20 HP, +1 HP/s regen.', { health: 20, healthRegen: 1 }, ['be_s8']),
    node('be_w2', 'be_warden', 1, 'passive', 1, 'Thorns',           '🌹', 'Attackers take 3 damage.', { thornsDamage: 3 }, ['be_w1']),
    node('be_w3', 'be_warden', 2, 'major',   2, 'Roar of Life',     '🐻', 'Thunderous Roar (X) heals 15% max HP.', { roarHealPercent: 0.15 }, ['be_w2']),
    node('be_w4a','be_warden', 3, 'choice', 2, 'Spirit Bear',       '✨', '+3 HP/s regen, +5% lifesteal.', { healthRegen: 3, lifesteal: 0.05 }, ['be_w3'], { choiceGroup: 'be_w4' }),
    node('be_w4b','be_warden', 3, 'choice', 2, 'War Bear',          '⚔', '+8 damage, +5% crit, +15 HP.', { damage: 8, critChance: 0.05, health: 15 }, ['be_w3'], { choiceGroup: 'be_w4' }),
    node('be_w5', 'be_warden', 4, 'passive', 1, 'Guardian',         '🛡', '+5 armor, +25 HP.', { armor: 5, health: 25 }, ['be_w4a', 'be_w4b']),
    node('be_w6', 'be_warden', 5, 'keystone', 3, 'Nature\'s Wrath', '🌿', 'Below 50% HP: +25% damage and +50% HP regen.', { lowHpDamageBonus: 0.25, lowHpRegenMult: 1.5, lowHpThreshold: 0.5 }, ['be_w5']),
    node('be_w7', 'be_warden', 6, 'passive', 1, 'Ancient Guardian', '🗿', '+8 armor, +30 HP, +2 HP/s.', { armor: 8, health: 30, healthRegen: 2 }, ['be_w6']),
    node('be_w8', 'be_warden', 7, 'capstone', 3, 'Primal Guardian', '🌲', 'Ultimate (F): Primal Fury heals 3% max HP per stomp hit.', { ultStompHeal: true, ultStompHealPercent: 0.03 }, ['be_w7']),
];

// ═══════════════════════════════════════════════════════════════
// MASTER EXPORT — All talent trees keyed by kit ID
// ═══════════════════════════════════════════════════════════════

export const KIT_TALENT_TREES = {
    blood_mage:      BLOOD_MAGE_TALENTS,
    frost_mage:      FROST_MAGE_TALENTS,
    shadow_assassin: SHADOW_ASSASSIN_TALENTS,
    bow_ranger:      BOW_RANGER_TALENTS,
    werewolf:        WEREWOLF_TALENTS,
    bear:            BEAR_TALENTS,
};

// ─── Legacy-compatible exports (for backward compatibility) ───

/** Flat array of old generic talents — kept empty for migration */
export const TALENT_BRANCHES = {
    offense:  { label: 'Offense',  color: '#ff4444', icon: '\u2694', glow: 'rgba(255,68,68,0.4)' },
    defense:  { label: 'Defense',  color: '#4488ff', icon: '\u{1F6E1}', glow: 'rgba(68,136,255,0.4)' },
    utility:  { label: 'Utility',  color: '#44cc44', icon: '\u26A1', glow: 'rgba(68,204,68,0.4)' }
};

export const TALENTS = [];

// ─── Query helpers ───────────────────────────────────────────

/** Get the full talent tree for a kit */
export function getKitTalents(kitId) {
    return KIT_TALENT_TREES[kitId] ?? [];
}

/** Get talents for a specific branch within a kit */
export function getKitTalentsByBranch(kitId, branchId) {
    return getKitTalents(kitId)
        .filter(t => t.branch === branchId)
        .sort((a, b) => a.tier - b.tier);
}

/** Get the spine (central) talents for a kit */
export function getKitSpine(kitId) {
    return getKitTalentsByBranch(kitId, 'spine');
}

/** Get branches available for a kit (excluding spine) */
export function getKitBranches(kitId) {
    const talents = getKitTalents(kitId);
    const branches = new Set(talents.map(t => t.branch).filter(b => b !== 'spine'));
    return [...branches];
}

/** Get a talent by ID within a kit */
export function getKitTalent(kitId, talentId) {
    return getKitTalents(kitId).find(t => t.id === talentId) ?? null;
}

/** Get a talent by ID across all kits */
export function getTalent(talentId) {
    for (const kitId of Object.keys(KIT_TALENT_TREES)) {
        const t = getKitTalent(kitId, talentId);
        if (t) return t;
    }
    return null;
}

/** Get talents by branch (legacy compat) */
export function getTalentsByBranch(branch) {
    return [];
}

/** Calculate total talent cost */
export function getTotalTalentCost(unlockedIds) {
    let total = 0;
    for (const kitId of Object.keys(KIT_TALENT_TREES)) {
        for (const t of KIT_TALENT_TREES[kitId]) {
            if (unlockedIds.includes(t.id)) total += t.cost;
        }
    }
    return total;
}

/** Get all nodes in a choice group */
export function getChoiceGroupNodes(kitId, choiceGroup) {
    return getKitTalents(kitId).filter(t => t.choiceGroup === choiceGroup);
}

/** Get branch theme info */
export function getBranchTheme(branchId) {
    return BRANCH_THEMES[branchId] ?? BRANCH_THEMES.spine;
}
