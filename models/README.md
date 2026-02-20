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
  "facingDeg": 0,
  "animations": {
    "idle": "Inactif 1",
    "locomotion": "Marche",
    "basicAttack": "Mage Soell lance Sort 4",
    "chargedAttack": "Mage Soell Cast 3"
  }
}
```

- `facingDeg`: optional. Rotation offset in degrees for rigs that face the wrong way.
  - `0` = no extra rotation
  - `180` = flip around

## Optional override
- URL query: `?hero=models/MyCharacter.glb`
- localStorage: `heroModelPath`

The loader now **only** tries configured paths (query/localStorage/manifest), which avoids noisy 404 probes.


If your app is served from a sub-path, relative paths are now tried automatically as well.


- `animations`: optional explicit clip names from your GLB to force exact mapping.
  - `idle`: idle/rest clip
  - `locomotion`: movement clip
  - `basicAttack`: quick/basic attack clip
  - `chargedAttack`: heavy/charged attack clip

Tip: use your DCC/asset viewer animation names exactly (case-insensitive; spaces/underscores tolerated).
