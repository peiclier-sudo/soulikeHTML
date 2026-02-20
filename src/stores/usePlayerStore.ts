import { create } from 'zustand';
import type { PlayerClassId } from '../types/player';

interface PlayerStats {
  maxHp: number;
  maxEnergy: number;
  speed: number;
  attackPower: number;
}

const CLASS_STATS: Record<PlayerClassId, PlayerStats> = {
  mage:    { maxHp: 80,  maxEnergy: 150, speed: 5, attackPower: 30 },
  warrior: { maxHp: 150, maxEnergy: 80,  speed: 4, attackPower: 20 },
  rogue:   { maxHp: 100, maxEnergy: 100, speed: 7, attackPower: 15 },
};

interface PlayerState {
  classId: PlayerClassId | null;
  hp: number;
  energy: number;
  stats: PlayerStats | null;
  init: (classId: PlayerClassId) => void;
  takeDamage: (amount: number) => void;
  consumeEnergy: (amount: number) => void;
  restoreEnergy: (amount: number) => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  classId: null,
  hp: 0,
  energy: 0,
  stats: null,

  init: (classId) => {
    const stats = CLASS_STATS[classId];
    set({ classId, hp: stats.maxHp, energy: stats.maxEnergy, stats });
  },

  takeDamage: (amount) =>
    set((s) => ({ hp: Math.max(0, s.hp - amount) })),

  consumeEnergy: (amount) =>
    set((s) => ({ energy: Math.max(0, s.energy - amount) })),

  restoreEnergy: (amount) => {
    const { energy, stats } = get();
    set({ energy: Math.min(stats?.maxEnergy ?? 0, energy + amount) });
  },
}));
