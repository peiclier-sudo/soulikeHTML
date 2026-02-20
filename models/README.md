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
  "facingDeg": 0
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
