import type { ActionId, ActionMeta } from '../types/action';

export const ACTION_CATALOG: Record<ActionId, ActionMeta> = {
  MOVE: { id: 'MOVE', label: 'Move', category: 'movement' },
  JUMP: { id: 'JUMP', label: 'Jump', category: 'movement' },
  DASH: { id: 'DASH', label: 'Dash', category: 'movement', defaultCooldownMs: 520 },

  ATTACK_BASIC: { id: 'ATTACK_BASIC', label: 'Basic Attack', category: 'attack' },
  ATTACK_CHARGED: { id: 'ATTACK_CHARGED', label: 'Charged Attack', category: 'attack' },

  CONSUME_HEALTH_POTION: {
    id: 'CONSUME_HEALTH_POTION',
    label: 'Drink Health Potion',
    category: 'consumable',
    defaultCooldownMs: 900,
  },
  CONSUME_ENERGY_POTION: {
    id: 'CONSUME_ENERGY_POTION',
    label: 'Drink Energy Potion',
    category: 'consumable',
    defaultCooldownMs: 900,
  },

  SKILL_SLOT_1: { id: 'SKILL_SLOT_1', label: 'Special Slot 1', category: 'skill', slot: 1 },
  SKILL_SLOT_2: { id: 'SKILL_SLOT_2', label: 'Special Slot 2', category: 'skill', slot: 2 },
  SKILL_SLOT_3: { id: 'SKILL_SLOT_3', label: 'Special Slot 3', category: 'skill', slot: 3 },

  ULTIMATE: { id: 'ULTIMATE', label: 'Ultimate', category: 'ultimate' },
};

export function listActionIds(): ActionId[] {
  return Object.keys(ACTION_CATALOG) as ActionId[];
}
