# Character Model Folder

Put your model in this folder.

## Recommended setup
1. Copy your file into `models/`
2. Edit `models/manifest.json`
3. Set `hero` to the exact filename

Example:
```json
{
  "hero": "MyCharacter.glb",
  "paths": [],
  "facingDeg": 180,
  "animations": {
    "walk": "Walking",
    "run": "Running",
    "jump": "Run_and_Jump - basic jump"
  }
}
```

- `facingDeg`: optional. Rotation offset in degrees for rigs that face the wrong way.
  - `0` = no extra rotation
  - `180` = flip around (useful when the hero starts by facing the camera)

## Optional override
- URL query: `?hero=models/MyCharacter.glb`
- localStorage: `heroModelPath`

The loader now **only** tries configured paths (query/localStorage/manifest), which avoids noisy 404 probes.


If your app is served from a sub-path, relative paths are now tried automatically as well.


- `animations`: optional explicit clip names from your GLB to force exact mapping.
  - `idle`: optional idle/rest clip (if missing, scene uses walk as fallback)
  - `walk`: walk clip
  - `run`: run clip
  - `jump`: jump clip (played once while airborne)
  - `locomotion`: optional fallback when `walk` is missing
  - `basicAttack` / `chargedAttack`: optional combat clips (not required for movement)

Tip: use your DCC/asset viewer animation names exactly (case-insensitive; spaces/underscores tolerated).
