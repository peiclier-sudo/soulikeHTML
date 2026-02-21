export const ACTION_IDS = [
  'MOVE',
  'JUMP',
  'DASH',
  'HIT_REACT',
  'DEATH',
  'ATTACK_BASIC',
  'ATTACK_CHARGED',
  'CONSUME_HEALTH_POTION',
  'CONSUME_ENERGY_POTION',
  'SKILL_SLOT_1',
  'SKILL_SLOT_2',
  'SKILL_SLOT_3',
  'ULTIMATE',
] as const;

export type ActionId = (typeof ACTION_IDS)[number];

export type ActionCategory =
  | 'movement'
  | 'reaction'
  | 'attack'
  | 'consumable'
  | 'skill'
  | 'ultimate';

export type ActionMeta = {
  id: ActionId;
  label: string;
  category: ActionCategory;
  slot?: number;
  defaultCooldownMs?: number;
};
