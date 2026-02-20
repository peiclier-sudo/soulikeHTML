import { BOSS_SCENES, CLASS_CONTENT, WEAPON_CONTENT } from '../../core/content-registry';
import { getGameSelectionState } from '../../stores/useGameStore';

export default function GamePage() {
  const selected = getGameSelectionState();
  const classEntry = CLASS_CONTENT[selected.selectedClass];
  const weaponEntry = WEAPON_CONTENT[selected.selectedWeapon];
  const bossEntry = BOSS_SCENES[selected.selectedBossScene];

  return (
    <main>
      <h1>Boss Fight Scene</h1>
      <p>Phase 2 scaffold: runtime selection plumbing done.</p>
      <ul>
        <li>Class manifest: {classEntry.manifestPath}</li>
        <li>Weapon manifest: {weaponEntry.manifestPath}</li>
        <li>Boss scene config: {bossEntry.sceneConfigPath}</li>
      </ul>
    </main>
  );
}
