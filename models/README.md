# Character Model Folder

Put your character model at one of these exact names:

- `models/hero.glb` (recommended)
- `models/Hero.glb`

The game now auto-tries both absolute/relative paths:

- `/models/hero.glb`
- `models/hero.glb`
- `/models/Hero.glb`
- `models/Hero.glb`

If all fail, it will show `FALLBACK HERO (hero.glb NOT FOUND)` in HUD.
