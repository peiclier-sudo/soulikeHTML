# Soulike Prototype — True 3D Third-Person (Vercel-ready)

Yes: this project is now **3D** and uses a **third-person perspective**.

## What is implemented

- 3D scene (Three.js)
- Third-person follow camera + Fortnite-style shoulder mode (toggle `V`)
- ZQSD + WASD movement
- Jump on Space
- Dash on Shift (stamina + cooldown)
- Basic attack on J
- Charged attack by holding/releasing K
- Enemy dummy with HP and hit detection cone

## Run locally

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173`

## Controls

- Move: `ZQSD` (or `WASD`)
- Jump: `Space`
- Dash: `Shift`
- Basic attack: `J`
- Charged attack: hold and release `K`
- Camera orbit: hold right mouse button and move mouse
- View mode toggle: `V` (Classic / Fortnite shoulder)

## Vercel deployment

Already static-compatible:
1. Push repository to GitHub.
2. Import project in Vercel.
3. Framework preset: **Other**.
4. Build command: **(empty)**
5. Output directory: `.`

## Next milestones

1. Replace primitives with GLB character + animations.
2. Add lock-on system and enemy attack AI.
3. Add dodge i-frames and hit-stun.
4. Add stamina UI bar + damage numbers.
5. Add one small arena level with retry loop.
