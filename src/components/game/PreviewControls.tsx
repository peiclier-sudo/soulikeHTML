'use client';

import { useEffect, type CSSProperties } from 'react';
import { ACTION_IDS } from '@/types/action';
import type { BossId } from '@/types/boss';
import type { PlayerClassId } from '@/types/player';
import { usePreviewStore } from '@/stores/usePreviewStore';
import { useGameStore } from '@/stores/useGameStore';

const CLASSES: PlayerClassId[] = ['mage', 'warrior', 'rogue'];
const BOSSES: BossId[] = ['boss-1', 'boss-2'];

export default function PreviewControls() {
  const selectedClassFromGame = useGameStore((s) => s.selectedClass);
  const selectedClass = usePreviewStore((s) => s.selectedClass);
  const selectedBoss = usePreviewStore((s) => s.selectedBoss);
  const selectedAction = usePreviewStore((s) => s.selectedAction);
  const setSelectedClass = usePreviewStore((s) => s.setSelectedClass);
  const setSelectedBoss = usePreviewStore((s) => s.setSelectedBoss);
  const setSelectedAction = usePreviewStore((s) => s.setSelectedAction);

  useEffect(() => {
    if (selectedClassFromGame) {
      setSelectedClass(selectedClassFromGame);
    }
  }, [selectedClassFromGame, setSelectedClass]);

  return (
    <div style={styles.panel}>
      <h3 style={styles.title}>Preview Controls</h3>

      <label style={styles.label}>
        Class
        <select
          style={styles.select}
          value={selectedClass}
          onChange={(e) => setSelectedClass(e.target.value as PlayerClassId)}
        >
          {CLASSES.map((classId) => (
            <option key={classId} value={classId}>
              {classId}
            </option>
          ))}
        </select>
      </label>

      <label style={styles.label}>
        Boss
        <select
          style={styles.select}
          value={selectedBoss}
          onChange={(e) => setSelectedBoss(e.target.value as BossId)}
        >
          {BOSSES.map((bossId) => (
            <option key={bossId} value={bossId}>
              {bossId}
            </option>
          ))}
        </select>
      </label>

      <label style={styles.label}>
        Action
        <select
          style={styles.select}
          value={selectedAction}
          onChange={(e) => setSelectedAction(e.target.value as (typeof ACTION_IDS)[number])}
        >
          {ACTION_IDS.map((actionId) => (
            <option key={actionId} value={actionId}>
              {actionId}
            </option>
          ))}
        </select>
      </label>

      <p style={styles.tip}>Place assets in public/models/characters/&lt;class&gt;/model.glb and public/models/bosses/&lt;boss&gt;/model.glb</p>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  panel: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 320,
    zIndex: 5,
    padding: 12,
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'rgba(17, 17, 24, 0.9)',
    display: 'grid',
    gap: 10,
  },
  title: {
    fontSize: 16,
    marginBottom: 4,
  },
  label: {
    display: 'grid',
    gap: 4,
    fontSize: 12,
    color: 'var(--text-muted)',
  },
  select: {
    border: '1px solid var(--border)',
    borderRadius: 6,
    background: '#09090f',
    color: 'var(--text)',
    padding: '8px 10px',
  },
  tip: {
    fontSize: 11,
    color: 'var(--text-muted)',
    lineHeight: 1.35,
  },
};
