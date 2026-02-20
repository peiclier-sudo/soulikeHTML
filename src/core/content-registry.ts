import type { PlayerClassId, WeaponId } from '../types/player';

export type BossSceneId = 'boss-1' | 'boss-2';

export type ClassContentEntry = {
  id: PlayerClassId;
  label: string;
  manifestPath: string;
  modelPath: string;
};

export type WeaponContentEntry = {
  id: WeaponId;
  label: string;
  manifestPath: string;
  modelPath: string;
};

export type BossSceneEntry = {
  id: BossSceneId;
  label: string;
  sceneConfigPath: string;
  bossManifestPath: string;
};

export const CLASS_CONTENT: Record<PlayerClassId, ClassContentEntry> = {
  mage: {
    id: 'mage',
    label: 'Mage',
    manifestPath: 'src/models/characters/mage/manifest.json',
    modelPath: 'src/models/characters/mage/model.glb',
  },
  warrior: {
    id: 'warrior',
    label: 'Warrior',
    manifestPath: 'src/models/characters/warrior/manifest.json',
    modelPath: 'src/models/characters/warrior/model.glb',
  },
  rogue: {
    id: 'rogue',
    label: 'Rogue',
    manifestPath: 'src/models/characters/rogue/manifest.json',
    modelPath: 'src/models/characters/rogue/model.glb',
  },
};

export const WEAPON_CONTENT: Record<WeaponId, WeaponContentEntry> = {
  'arcane-staff': {
    id: 'arcane-staff',
    label: 'Arcane Staff',
    manifestPath: 'src/models/weapons/arcane-staff/manifest.json',
    modelPath: 'src/models/weapons/arcane-staff/model.glb',
  },
  greatsword: {
    id: 'greatsword',
    label: 'Greatsword',
    manifestPath: 'src/models/weapons/greatsword/manifest.json',
    modelPath: 'src/models/weapons/greatsword/model.glb',
  },
  'twin-daggers': {
    id: 'twin-daggers',
    label: 'Twin Daggers',
    manifestPath: 'src/models/weapons/twin-daggers/manifest.json',
    modelPath: 'src/models/weapons/twin-daggers/model.glb',
  },
};

export const BOSS_SCENES: Record<BossSceneId, BossSceneEntry> = {
  'boss-1': {
    id: 'boss-1',
    label: 'Current Fight Scene',
    sceneConfigPath: 'src/scenes/boss/boss-1/scene.config.json',
    bossManifestPath: 'src/models/bosses/boss-1/manifest.json',
  },
  'boss-2': {
    id: 'boss-2',
    label: 'Future Boss Scene',
    sceneConfigPath: 'src/scenes/boss/boss-2/scene.config.json',
    bossManifestPath: 'src/models/bosses/boss-2/manifest.json',
  },
};
