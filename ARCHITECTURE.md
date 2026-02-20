# Scaling structure proposal

The current code now uses a **module boundary** between:

- `game.js`: scene lifecycle, input orchestration, gameplay state loop.
- `lib/character-animation-controller.js`: clip resolution and animation state machine.

## Recommended next extractions (in order)

1. `lib/input-controller.js`
   - Key/mouse bindings
   - rebind flow
   - semantic actions (`move`, `jump`, `attack`, `ability1`...)

2. `lib/combat-system.js`
   - fireball lifecycle
   - enemy hit processing
   - damage / cooldown rules

3. `lib/camera-controller.js`
   - classic/fortnite modes
   - yaw/pitch smoothing
   - camera kick handling

4. `lib/hero-loader.js`
   - manifest loading + validation
   - glb candidate resolution
   - root-motion lock setup

## Why this scales better

- Smaller files, lower merge conflict risk.
- Animation logic can evolve (new abilities/classes) without touching movement/combat loop.
- Makes class-based heroes (Mage/Warrior/Rogue) easier: swap manifest + controller policy.
