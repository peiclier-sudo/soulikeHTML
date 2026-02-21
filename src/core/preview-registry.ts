import type { AnimationManifest } from '@/types/animation';
import type { BossId } from '@/types/boss';
import type { PlayerClassId, WeaponId } from '@/types/player';

export type CharacterPreviewConfig = {
  modelPath: string;
  manifestPath: string;
  weapon: WeaponId;
  manifest: AnimationManifest;
};

type BossPreviewConfig = {
  modelPath: string;
};

const baseManifest: AnimationManifest = {
  version: '1.0',
  fallbackIdle: 'Idle',
  aliases: {
    STAFF_ATTACK_BASIC_CAST: 'Basic_Attack',
    STAFF_ATTACK_CHARGED_CAST: 'Charged_Attack',
    STAFF_ULTIMATE_APOCALYPSE: 'Ultimate',
    MAGE_SPECIAL_SLOT_1_FIREBALL: 'Special_Slot1',
    MAGE_SPECIAL_SLOT_2_FROST_NOVA: 'Special_Slot2',
    MAGE_SPECIAL_SLOT_3_LIGHTNING_STORM: 'Special_Slot3',

    GREATSWORD_ATTACK_BASIC_SLASH: 'Basic_Attack',
    GREATSWORD_ATTACK_CHARGED_CLEAVE: 'Charged_Attack',
    GREATSWORD_ULTIMATE_EARTHSHATTER: 'Ultimate',
    WARRIOR_SPECIAL_SLOT_1_CLEAVE: 'Special_Slot1',
    WARRIOR_SPECIAL_SLOT_2_GUARD_BREAK: 'Special_Slot2',
    WARRIOR_SPECIAL_SLOT_3_WAR_CRY: 'Special_Slot3',

    DAGGERS_ATTACK_BASIC_STAB: 'Basic_Attack',
    DAGGERS_ATTACK_CHARGED_FLURRY: 'Charged_Attack',
    DAGGERS_ULTIMATE_BLOOD_DANCE: 'Ultimate',
    ROGUE_SPECIAL_SLOT_1_SHADOW_STEP: 'Special_Slot1',
    ROGUE_SPECIAL_SLOT_2_POISON_FAN: 'Special_Slot2',
    ROGUE_SPECIAL_SLOT_3_EXECUTE: 'Special_Slot3',

    LOCOMOTION_MOVE: 'Walking',
    LOCOMOTION_JUMP: 'Jump',
    LOCOMOTION_DASH: 'Dash',
    REACTION_HIT: 'Hit_React',
    REACTION_DEATH: 'Death',
    CONSUME_POTION: 'Drink_Potion',
  },
  clipMapping: {
    Idle: 'Idle',
    LOCOMOTION_MOVE: 'Walking',
    LOCOMOTION_JUMP: 'Jump',
    LOCOMOTION_DASH: 'Dash',
    ATTACK_BASIC: 'Basic_Attack',
    ATTACK_CHARGED: 'Charged_Attack',
    SKILL_SLOT_1: 'Special_Slot1',
    SKILL_SLOT_2: 'Special_Slot2',
    SKILL_SLOT_3: 'Special_Slot3',
    ULTIMATE: 'Ultimate',
    REACTION_HIT: 'Hit_React',
    REACTION_DEATH: 'Death',
    CONSUME_POTION: 'Drink_Potion',
  },
};

export const CHARACTER_PREVIEW_REGISTRY: Record<PlayerClassId, CharacterPreviewConfig> = {
  mage: {
    modelPath: '/models/characters/mage/model.glb',
    manifestPath: '/models/characters/mage/manifest.json',
    weapon: 'arcane-staff',
    manifest: baseManifest,
  },
  warrior: {
    modelPath: '/models/characters/warrior/model.glb',
    manifestPath: '/models/characters/warrior/manifest.json',
    weapon: 'greatsword',
    manifest: baseManifest,
  },
  rogue: {
    modelPath: '/models/characters/rogue/model.glb',
    manifestPath: '/models/characters/rogue/manifest.json',
    weapon: 'twin-daggers',
    manifest: baseManifest,
  },
};

export const BOSS_PREVIEW_REGISTRY: Record<BossId, BossPreviewConfig> = {
  'boss-1': {
    modelPath: '/models/bosses/boss-1/model.glb',
  },
  'boss-2': {
    modelPath: '/models/bosses/boss-2/model.glb',
  },
};
