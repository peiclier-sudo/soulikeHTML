import { BOSS_SCENES, CLASS_CONTENT, WEAPON_CONTENT } from '../../core/content-registry';
import {
  getGameSelectionState,
  setSelectedBossScene,
  setSelectedClass,
  setSelectedWeapon,
} from '../../stores/useGameStore';

export default function MenuPage() {
  const selected = getGameSelectionState();

  return (
    <main>
      <h1>Soullike Boss Rush - Class Selection</h1>
      <p>Phase 2 scaffold: class / weapon / boss selection UI contract.</p>

      <section>
        <h2>Class</h2>
        {Object.values(CLASS_CONTENT).map((entry) => (
          <button key={entry.id} type="button" onClick={() => setSelectedClass(entry.id)}>
            {entry.label} {selected.selectedClass === entry.id ? '(selected)' : ''}
          </button>
        ))}
      </section>

      <section>
        <h2>Weapon</h2>
        {Object.values(WEAPON_CONTENT).map((entry) => (
          <button key={entry.id} type="button" onClick={() => setSelectedWeapon(entry.id)}>
            {entry.label} {selected.selectedWeapon === entry.id ? '(selected)' : ''}
          </button>
        ))}
      </section>

      <section>
        <h2>Boss Scene</h2>
        {Object.values(BOSS_SCENES).map((entry) => (
          <button key={entry.id} type="button" onClick={() => setSelectedBossScene(entry.id)}>
            {entry.label} {selected.selectedBossScene === entry.id ? '(selected)' : ''}
          </button>
        ))}
      </section>
    </main>
  );
}
