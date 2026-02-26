# Character animations (character.glb)

All animations available in the integrated character model:

| # | Animation name      | Use in game        |
|---|---------------------|--------------------|
| 1 | Basic attack        | (combat)           |
| 2 | Charged attack      | —                  |
| 3 | Dead                | —                  |
| 4 | Fast running        | —                  |
| 5 | Hit reaction        | —                  |
| 6 | Idle                | Standing still     |
| 7 | Jump                | —                  |
| 8 | Move backwards      | —                  |
| 9 | Potion drinking     | —                  |
|10 | Roll dodge          | Dodge roll (Space) |
|11 | Run left            | —                  |
|12 | Run right           | —                  |
|13 | Running             | When running       |
|14 | Special attack 1    | —                  |
|15 | Special attack 2    | —                  |
|16 | Special attack 3    | —                  |
|17 | Ultimate            | —                  |
|18 | Walking             | When walking       |

Currently wired: **Idle**, **Walking**, **Running**, **Roll dodge**.  
You can hook more in `js/entities/Character.js` (e.g. attack, jump, hit reaction).
