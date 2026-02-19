# Character Model Folder

Drop your model file in this folder.

## Recommended name
- `hero.glb`

## Supported behavior
- The game auto-discovers `.glb` files inside `/models/` and tries to load the first discovered file.
- It also explicitly tries these fallback paths:
  - `/models/hero.glb`
  - `/models/Hero.glb`
  - `/hero.glb`

If all loads fail, HUD shows `FALLBACK HERO (...)` with the reason.
