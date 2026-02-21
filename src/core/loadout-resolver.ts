import type { ActionId } from '../types/action';
import type { PlayerClassId, WeaponId } from '../types/player';
import type { AnimToken } from '../types/animation';

export type ClassProfile = {
  id: PlayerClassId;
  skillSlots: Record<'SKILL_SLOT_1' | 'SKILL_SLOT_2' | 'SKILL_SLOT_3', AnimToken>;
};

export type WeaponProfile = {
  id: WeaponId;
  basicAttack: AnimToken;
  chargedAttack: AnimToken;
  ultimate: AnimToken;
};

export type LoadoutContext = {
  playerClass: PlayerClassId;
  weapon: WeaponId;
  extraSlots?: Record<string, AnimToken>;
};

export type ResolvedLoadout = {
  context: LoadoutContext;
  actionToToken: Record<ActionId, AnimToken>;
};

const CLASS_PROFILES: Record<PlayerClassId, ClassProfile> = {
  mage: {
    id: 'mage',
    skillSlots: {
      SKILL_SLOT_1: 'MAGE_SPECIAL_SLOT_1_FIREBALL',
      SKILL_SLOT_2: 'MAGE_SPECIAL_SLOT_2_FROST_NOVA',
      SKILL_SLOT_3: 'MAGE_SPECIAL_SLOT_3_LIGHTNING_STORM',
    },
  },
  warrior: {
    id: 'warrior',
    skillSlots: {
      SKILL_SLOT_1: 'WARRIOR_SPECIAL_SLOT_1_CLEAVE',
      SKILL_SLOT_2: 'WARRIOR_SPECIAL_SLOT_2_GUARD_BREAK',
      SKILL_SLOT_3: 'WARRIOR_SPECIAL_SLOT_3_WAR_CRY',
    },
  },
  rogue: {
    id: 'rogue',
    skillSlots: {
      SKILL_SLOT_1: 'ROGUE_SPECIAL_SLOT_1_SHADOW_STEP',
      SKILL_SLOT_2: 'ROGUE_SPECIAL_SLOT_2_POISON_FAN',
      SKILL_SLOT_3: 'ROGUE_SPECIAL_SLOT_3_EXECUTE',
    },
  },
};

const WEAPON_PROFILES: Record<WeaponId, WeaponProfile> = {
  'arcane-staff': {
    id: 'arcane-staff',
    basicAttack: 'STAFF_ATTACK_BASIC_CAST',
    chargedAttack: 'STAFF_ATTACK_CHARGED_CAST',
    ultimate: 'STAFF_ULTIMATE_APOCALYPSE',
  },
  greatsword: {
    id: 'greatsword',
    basicAttack: 'GREATSWORD_ATTACK_BASIC_SLASH',
    chargedAttack: 'GREATSWORD_ATTACK_CHARGED_CLEAVE',
    ultimate: 'GREATSWORD_ULTIMATE_EARTHSHATTER',
  },
  'twin-daggers': {
    id: 'twin-daggers',
    basicAttack: 'DAGGERS_ATTACK_BASIC_STAB',
    chargedAttack: 'DAGGERS_ATTACK_CHARGED_FLURRY',
    ultimate: 'DAGGERS_ULTIMATE_BLOOD_DANCE',
  },
};

export function resolveLoadout(context: LoadoutContext): ResolvedLoadout {
  const classProfile = CLASS_PROFILES[context.playerClass];
  const weaponProfile = WEAPON_PROFILES[context.weapon];

  const actionToToken: Record<ActionId, AnimToken> = {
    MOVE: 'LOCOMOTION_MOVE',
    JUMP: 'LOCOMOTION_JUMP',
    DASH: 'LOCOMOTION_DASH',
    HIT_REACT: 'REACTION_HIT',
    DEATH: 'REACTION_DEATH',

    ATTACK_BASIC: weaponProfile.basicAttack,
    ATTACK_CHARGED: weaponProfile.chargedAttack,

    CONSUME_HEALTH_POTION: 'CONSUME_HEALTH_POTION',
    CONSUME_ENERGY_POTION: 'CONSUME_ENERGY_POTION',

    SKILL_SLOT_1: classProfile.skillSlots.SKILL_SLOT_1,
    SKILL_SLOT_2: classProfile.skillSlots.SKILL_SLOT_2,
    SKILL_SLOT_3: classProfile.skillSlots.SKILL_SLOT_3,

    ULTIMATE: weaponProfile.ultimate,
  };

  if (context.extraSlots) {
    Object.entries(context.extraSlots).forEach(([slotId, token]) => {
      (actionToToken as Record<string, AnimToken>)[slotId] = token;
    });
  }

  return { context, actionToToken };
}
