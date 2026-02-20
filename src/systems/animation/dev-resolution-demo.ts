import { AnimationCodex } from './AnimationCodex';
import type { AnimationManifest } from '../../types/animation';

const demoManifest: AnimationManifest = {
  version: '1.0',
  fallbackIdle: 'Idle',
  aliases: {
    STAFF_ATTACK_BASIC_CAST: 'Basic_Attack',
  },
  clipMapping: {
    LOCOMOTION_MOVE: 'Walking',
    LOCOMOTION_DASH: 'Dash',
    STAFF_ATTACK_CHARGED_CAST: 'Charged_Attack',
    MAGE_SPECIAL_SLOT_1_FIREBALL: 'Special_Slot1',
    STAFF_ULTIMATE_APOCALYPSE: 'Ultimate',
    Basic_Attack: 'Basic_Attack',
    Idle: 'Idle',
  },
};

const codex = new AnimationCodex(demoManifest);

codex.debugResolutionPaths(
  ['ATTACK_BASIC', 'ATTACK_CHARGED', 'SKILL_SLOT_1', 'ULTIMATE', 'DASH'],
  { playerClass: 'mage', weapon: 'arcane-staff' }
);
