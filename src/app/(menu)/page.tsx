'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useGameStore } from '@/stores/useGameStore';
import { usePlayerStore } from '@/stores/usePlayerStore';
import type { PlayerClassId } from '@/types/player';

const CLASSES = [
  {
    id: 'mage' as PlayerClassId,
    name: 'MAGE',
    subtitle: 'Arcane Weaver',
    weapon: 'Arcane Staff',
    description: 'Commands the fabric of reality. Fragile yet devastating at range.',
    stats: { HP: 80, Energy: 150, Speed: 5, Power: 30 } as Record<string, number>,
    accent: 'var(--accent-mage)',
    glow: 'var(--glow-mage)',
    icon: '✦',
  },
  {
    id: 'warrior' as PlayerClassId,
    name: 'WARRIOR',
    subtitle: 'Iron Vanguard',
    weapon: 'Greatsword',
    description: 'Unbreakable bulwark of the front line. Slow to act, impossible to ignore.',
    stats: { HP: 150, Energy: 80, Speed: 4, Power: 20 } as Record<string, number>,
    accent: 'var(--accent-warrior)',
    glow: 'var(--glow-warrior)',
    icon: '⚔',
  },
  {
    id: 'rogue' as PlayerClassId,
    name: 'ROGUE',
    subtitle: 'Shadow Dancer',
    weapon: 'Twin Daggers',
    description: 'Vanishes between strikes. Death arrives before the echo of their footsteps.',
    stats: { HP: 100, Energy: 100, Speed: 7, Power: 15 } as Record<string, number>,
    accent: 'var(--accent-rogue)',
    glow: 'var(--glow-rogue)',
    icon: '◈',
  },
] as const;

export default function MenuPage() {
  const router = useRouter();
  const [hovered, setHovered] = useState<PlayerClassId | null>(null);
  const setClass = useGameStore((s) => s.setClass);
  const startGame = useGameStore((s) => s.startGame);
  const init = usePlayerStore((s) => s.init);

  function handleSelect(id: PlayerClassId) {
    setClass(id);
    init(id);
    startGame();
    router.push('/game');
  }

  return (
    <main style={s.main}>
      <header style={s.header}>
        <p style={s.eyebrow}>— Choose Your Fate —</p>
        <h1 style={s.title}>SELECT YOUR CLASS</h1>
        <p style={s.subtitle}>Your path defines your power. Choose wisely.</p>
      </header>

      <div style={s.grid}>
        {CLASSES.map((cls) => {
          const active = hovered === cls.id;
          return (
            <button
              key={cls.id}
              style={{
                ...s.card,
                borderColor: active ? cls.accent : 'var(--border)',
                boxShadow: active ? cls.glow : 'none',
                transform: active ? 'translateY(-8px) scale(1.02)' : 'translateY(0) scale(1)',
              }}
              onMouseEnter={() => setHovered(cls.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => handleSelect(cls.id)}
            >
              {/* top accent bar */}
              <div style={{ ...s.accentBar, background: cls.accent }} />

              {/* class icon */}
              <div style={{ ...s.icon, color: cls.accent }}>{cls.icon}</div>

              {/* header */}
              <div style={s.cardHeader}>
                <span style={{ ...s.className, color: cls.accent }}>{cls.name}</span>
                <span style={s.classSubtitle}>{cls.subtitle}</span>
                <span style={s.weaponLine}>✦ {cls.weapon}</span>
              </div>

              {/* flavour text */}
              <p style={s.desc}>{cls.description}</p>

              {/* stat bars */}
              <ul style={s.statList}>
                {Object.entries(cls.stats).map(([key, val]) => (
                  <li key={key} style={s.statRow}>
                    <span style={s.statLabel}>{key}</span>
                    <div style={s.barTrack}>
                      <div
                        style={{
                          ...s.barFill,
                          width: `${(val / 150) * 100}%`,
                          background: cls.accent,
                          boxShadow: active ? `0 0 8px ${cls.accent}` : 'none',
                        }}
                      />
                    </div>
                    <span style={s.statVal}>{val}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <div
                style={{
                  ...s.cta,
                  background: active ? cls.accent : 'transparent',
                  borderColor: cls.accent,
                  color: active ? '#fff' : cls.accent,
                }}
              >
                SELECT CLASS
              </div>
            </button>
          );
        })}
      </div>
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  main: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 24px',
    background: 'radial-gradient(ellipse 80% 60% at 50% -10%, #1c0e3a 0%, #0a0a0f 65%)',
  },
  header: {
    textAlign: 'center',
    marginBottom: '56px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  eyebrow: {
    fontSize: '11px',
    letterSpacing: '0.4em',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 'clamp(26px, 5vw, 52px)',
    fontWeight: 900,
    letterSpacing: '0.22em',
    color: 'var(--text)',
    textShadow: '0 0 60px #7b4fff33',
  },
  subtitle: {
    fontSize: '13px',
    color: 'var(--text-muted)',
    letterSpacing: '0.1em',
    fontStyle: 'italic',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
    gap: '24px',
    maxWidth: '1020px',
    width: '100%',
  },
  card: {
    position: 'relative',
    background: 'var(--surface)',
    border: '1px solid',
    borderRadius: '6px',
    padding: '36px 28px 28px',
    cursor: 'pointer',
    textAlign: 'left',
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
    transition: 'transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease',
    overflow: 'hidden',
  },
  accentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '3px',
  },
  icon: {
    fontSize: '36px',
    lineHeight: 1,
    fontWeight: 400,
  },
  cardHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  className: {
    fontSize: '20px',
    fontWeight: 800,
    letterSpacing: '0.22em',
  },
  classSubtitle: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  },
  weaponLine: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    marginTop: '2px',
  },
  desc: {
    fontSize: '13px',
    color: 'var(--text-muted)',
    lineHeight: 1.65,
    fontStyle: 'italic',
  },
  statList: {
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: '9px',
  },
  statRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '11px',
  },
  statLabel: {
    width: '52px',
    color: 'var(--text-muted)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    flexShrink: 0,
  },
  barTrack: {
    flex: 1,
    height: '3px',
    background: '#1e1e2e',
    borderRadius: '2px',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: '2px',
    transition: 'box-shadow 0.22s ease',
  },
  statVal: {
    width: '28px',
    textAlign: 'right',
    color: 'var(--text)',
    flexShrink: 0,
  },
  cta: {
    marginTop: '4px',
    padding: '11px 0',
    border: '1px solid',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.25em',
    textAlign: 'center',
    transition: 'background 0.18s ease, color 0.18s ease',
  },
};
