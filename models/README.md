# Character Model Folder

Put your model in this folder.

## Fastest path
- Name it `hero.glb`
- Final path: `/models/hero.glb`

## Robust path (recommended)
Use `models/manifest.json` and set `hero` to your actual filename.

Example:
```json
{
  "hero": "MyCharacter.glb",
  "paths": ["AltCharacter.glb"]
}
```

## Runtime override
You can also force a path with URL query:
- `?hero=/models/MyCharacter.glb`

If all candidates fail, HUD will show `FALLBACK HERO (...)` and console prints all tried paths.
