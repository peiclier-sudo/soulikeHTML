# Soulike Prototype — True 3D Third-Person (Vercel-ready)

Yes: this project is now **3D** and uses a **third-person perspective**.

## What is implemented

- 3D scene (Three.js)
- Third-person follow camera + Fortnite-style shoulder mode (toggle `V`)
- ZQSD + WASD movement
- Jump on Space
- Dash with customizable keybind (default Shift, stamina + cooldown)
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
- Dash: default `Shift` (customizable)
- Basic attack: `J`
- Charged attack: hold and release `K`
- Camera orbit: hold right mouse button and move mouse
- Aim control: hold left click and move mouse (full character facing + camera control)
- View mode toggle: `V` (Classic / Fortnite shoulder)
- Mouse lock: click canvas to lock/hide cursor (`Esc` to release)
- Dash rebind: press `B`, then press any key to set your dash button

## Vercel deployment

Already static-compatible:
1. Push repository to GitHub.
2. Import project in Vercel.
3. Framework preset: **Other**.
4. Build command: **(empty)**
5. Output directory: `.`

## Camera note

- Camera vertical drag adjusted: dragging mouse up now moves camera up naturally
## Next milestones

1. Replace primitives with GLB character + animations.
2. Add lock-on system and enemy attack AI.
3. Add dodge i-frames and hit-stun.
4. Add stamina UI bar + damage numbers.
5. Add one small arena level with retry loop.
