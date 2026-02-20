import { create } from 'zustand';
import type { PlayerClassId } from '../types/player';

type GamePhase = 'menu' | 'playing';

interface GameState {
  phase: GamePhase;
  selectedClass: PlayerClassId | null;
  setClass: (id: PlayerClassId) => void;
  startGame: () => void;
  returnToMenu: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  phase: 'menu',
  selectedClass: null,
  setClass: (id) => set({ selectedClass: id }),
  startGame: () => set({ phase: 'playing' }),
  returnToMenu: () => set({ phase: 'menu', selectedClass: null }),
}));
