import type { PlayerClassId, WeaponId } from '../types/player';
import type { BossSceneId } from '../core/content-registry';

export type GameSelectionState = {
  selectedClass: PlayerClassId;
  selectedWeapon: WeaponId;
  selectedBossScene: BossSceneId;
};

const state: GameSelectionState = {
  selectedClass: 'mage',
  selectedWeapon: 'arcane-staff',
  selectedBossScene: 'boss-1',
};

export function getGameSelectionState(): GameSelectionState {
  return state;
}

export function setSelectedClass(selectedClass: PlayerClassId): void {
  state.selectedClass = selectedClass;
}

export function setSelectedWeapon(selectedWeapon: WeaponId): void {
  state.selectedWeapon = selectedWeapon;
}

export function setSelectedBossScene(selectedBossScene: BossSceneId): void {
  state.selectedBossScene = selectedBossScene;
}
