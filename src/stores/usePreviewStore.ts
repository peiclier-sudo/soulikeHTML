import { create } from 'zustand';
import type { ActionId } from '@/types/action';
import type { BossId } from '@/types/boss';
import type { PlayerClassId } from '@/types/player';

interface PreviewState {
  selectedClass: PlayerClassId;
  selectedBoss: BossId;
  selectedAction: ActionId;
  setSelectedClass: (classId: PlayerClassId) => void;
  setSelectedBoss: (bossId: BossId) => void;
  setSelectedAction: (actionId: ActionId) => void;
}

export const usePreviewStore = create<PreviewState>((set) => ({
  selectedClass: 'mage',
  selectedBoss: 'boss-1',
  selectedAction: 'MOVE',
  setSelectedClass: (selectedClass) => set({ selectedClass }),
  setSelectedBoss: (selectedBoss) => set({ selectedBoss }),
  setSelectedAction: (selectedAction) => set({ selectedAction }),
}));
