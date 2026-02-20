# Soullike Boss-Rush Prototype — Architecture Guideline

This README is the **official project guideline** and handover reference for building the next version of the game.

## Vision (Exact Scope)

- Single scene flow: choose **1 of 3 classes** -> fight **1 boss**.
- Core gameplay actions (all animated):
  - Movement (ZQSD/WASD)
  - Jump
  - Dash
  - Basic attack
  - Charged attack (hold + release)
  - Health potion
  - Energy potion
  - Special slot 1 / 2 / 3 (class-unique)
  - Ultimate (weapon-dependent)
- Extra attack slots must be extensible for future content.

### Gameplay ownership rules

- **Class-dependent:** special attacks in slots 1/2/3.
- **Weapon-dependent:** basic attack, charged attack, ultimate.
- Content must scale to more classes, weapons, bosses without rewriting core logic.

---

## Architecture (Locked)

Keep this architecture exactly:

1. **Action Catalog** (single source of truth)
2. **Loadout Resolver**
3. **Animation Resolver**
4. **AnimationCodex** (runtime animation brain)

### Non-negotiable animation resolution chain

Every animation request must always follow:

`ActionId -> AnimToken -> clipName`

Where:

- `ActionId`: stable gameplay identifier (code contract)
- `AnimToken`: logical animation token (content contract)
- `clipName`: exact GLB animation string (asset contract)

Gameplay code must never depend directly on raw GLB clip strings.

---

## Target Stack

- Next.js App Router
- TypeScript strict mode
- Three.js + React Three Fiber + Drei
- Rapier physics
- Zustand state
- Vercel deployment from day 1

Performance target:

- **90 FPS desktop** (and high-end mobile target)
- fixed timestep where needed
- minimal React re-renders
- Draco/KTX2 where possible

---

## Canonical Folder Structure (Target)

```text
soulike-boss-rush/
├── src/
│   ├── app/
│   │   ├── (menu)/
│   │   │   └── page.tsx
│   │   ├── (game)/
│   │   │   ├── page.tsx
│   │   │   └── layout.tsx
│   │   └── globals.css
│   │
│   ├── components/
│   │   ├── ui/
│   │   └── game/
│   │       ├── Canvas3D.tsx
│   │       ├── Character.tsx
│   │       ├── Boss.tsx
│   │       ├── VFX/
│   │       └── HUD.tsx
│   │
│   ├── core/
│   │   ├── action-catalog.ts
│   │   ├── loadout-resolver.ts
│   │   └── animation-resolver.ts
│   │
│   ├── models/
│   │   ├── characters/
│   │   │   ├── mage/
│   │   │   │   ├── model.glb
│   │   │   │   └── manifest.json
│   │   │   ├── warrior/
│   │   │   └── rogue/
│   │   ├── weapons/
│   │   │   ├── arcane-staff/
│   │   │   │   ├── model.glb
│   │   │   │   └── manifest.json
│   │   │   └── ...
│   │   └── boss/
│   │       ├── model.glb
│   │       └── manifest.json
│   │
│   ├── stores/
│   │   ├── usePlayerStore.ts
│   │   ├── useCombatStore.ts
│   │   └── useGameStore.ts
│   │
│   ├── systems/
│   │   ├── animation/AnimationCodex.ts
│   │   ├── input/
│   │   ├── combat/
│   │   ├── physics/
│   │   └── audio/
│   │
│   ├── types/
│   │   ├── action.ts
│   │   ├── player.ts
│   │   ├── animation.ts
│   │   └── combat.ts
│   │
│   └── lib/
│       └── three/
│
├── public/
├── data/
├── next.config.mjs
├── tsconfig.json
├── package.json
└── vercel.json
```

---

## Action Contract (Core Gameplay)

Minimum action set:

- `MOVE`
- `JUMP`
- `DASH`
- `ATTACK_BASIC`
- `ATTACK_CHARGED`
- `CONSUME_HEALTH_POTION`
- `CONSUME_ENERGY_POTION`
- `SKILL_SLOT_1`
- `SKILL_SLOT_2`
- `SKILL_SLOT_3`
- `ULTIMATE`

Future-proof extension:

- `SKILL_SLOT_4...SKILL_SLOT_N`

---

## GLB Naming Convention (Mandatory)

Use semantic names only. Prefer `PascalCase` (or `snake_case` when needed).

Good examples:

- `Idle`
- `Walking`
- `RunFast`
- `Jump`
- `Crouch`
- `Basic_Attack`
- `Charged_Attack`
- `Special_Slot1`
- `Ultimate`
- `Drink_Health_Potion`
- `Drink_Energy_Potion`

Forbidden names:

- `Animation_001`
- `Take 001`
- `mixamo.com`
- `ArmatureAction.002`
- unnamed numbered variants

---

## Content Validation Rules

At load-time, validation must attempt:

1. exact clip match
2. normalized match
3. alias lookup
4. class/weapon default fallback
5. safe idle fallback

Missing mappings must:

- log explicit console errors in development
- show visible warning in development
- never fail silently

---

## Step-by-Step Guide for Asset Creators (GLB Integration)

1. Create folder for new content:
   - class: `models/characters/<class-id>/`
   - weapon: `models/weapons/<weapon-id>/`
   - boss: `models/boss/<boss-id>/`
2. Ensure required clips exist and use clean names.
3. Export as `model.glb` with all animations.
4. Add `manifest.json` next to `model.glb`.
5. Validate in game and check resolver logs.

### Example `manifest.json`

```json
{
  "version": "1.0",
  "clipMapping": {
    "Idle": "Idle",
    "Walk": "Walking",
    "Run": "RunFast",
    "Jump": "Jump",
    "Crouch": "Crouch",
    "Basic_Attack": "Basic_Attack",
    "Charged_Attack": "Charged_Attack",
    "Dash": "Dash",
    "Special_Slot1": "Special_Slot1",
    "Special_Slot2": "Special_Slot2",
    "Special_Slot3": "Special_Slot3",
    "Ultimate": "Ultimate",
    "Drink_Health_Potion": "Drink_Health_Potion",
    "Drink_Energy_Potion": "Drink_Energy_Potion"
  },
  "animTokens": {
    "ATTACK_BASIC": "Basic_Attack",
    "ATTACK_CHARGED": "Charged_Attack",
    "SKILL_SLOT_1": "Special_Slot1",
    "ULTIMATE": "Ultimate"
  }
}
```

---

## Roadmap (Execution Order)

### Phase 0 — Setup

- Next.js project + target folder structure
- base canvas + ground + lights
- core Zustand stores
- Vercel deployment

### Phase 1 — Core Systems

- `action-catalog.ts`
- `loadout-resolver.ts`
- `animation-resolver.ts`
- `AnimationCodex.ts`

### Phase 2 — Content Pipeline

- 3 classes (mage / warrior / rogue) with manifests
- 1 starter weapon (arcane staff)
- class selection route + dynamic content load

### Phase 3 — Core Gameplay

- input, movement, dash, jump
- basic + charged attacks
- potions
- animation blending via codex
- third-person camera + shoulder toggle

### Phase 4 — Combat + Polish

- boss AI
- health/stamina/energy/cooldowns
- Q/E/R specials
- weapon ultimate
- HUD + VFX + menu polish

### Phase 5 — Performance

- 90 FPS optimization pass
- compression and render budget checks
- audio + final polish

### Phase 6 — Extensibility

- extra skill slots
- more weapons
- more bosses

---

## Success Criteria

- Phase 1: logs show clean `ActionId -> AnimToken -> clipName` resolution.
- Phase 2: class switch correctly changes GLB + animation mapping.
- Final: stable high framerate target in Chrome performance profiling.

---

## Current Repository Note

Current repository is still the legacy static prototype (`index.html` + `game.js`) and serves as a gameplay reference while migrating to the target architecture.



## Phase 1 Progress (Core Systems)

Implemented in scaffold:

- `src/core/action-catalog.ts` with canonical core ActionIds
- `src/core/loadout-resolver.ts` resolving class + weapon -> action-to-token mappings
- `src/core/animation-resolver.ts` resolving ActionId -> AnimToken -> clipName with fallback strategies
- `src/systems/animation/AnimationCodex.ts` consuming resolver output and exposing debug trace logs
- `src/systems/animation/dev-resolution-demo.ts` proving the resolution path for 5 actions

## Phase 2 Progress (Content Pipeline)

Implemented in scaffold:

- class manifests for `mage`, `warrior`, `rogue` under `src/models/characters/*/manifest.json`
- weapon manifest for `arcane-staff` and boss manifests for `boss-1`/`boss-2`
- `src/core/content-registry.ts` centralizing class/weapon/boss content paths
- menu/game route placeholders now consume selection + registry data
- `src/stores/useGameStore.ts` now tracks selected class/weapon/boss scene

## Scaffold Status (Current Repository)

The repository now includes a concrete scaffold for the target architecture under `src/`, including:

- `src/app/(menu)` and `src/app/(game)` route placeholders
- `src/core` (`action-catalog`, `loadout-resolver`, `animation-resolver`)
- `src/systems/animation/AnimationCodex.ts` placeholder
- `src/models/characters`, `src/models/weapons`, and `src/models/bosses`
- dedicated boss scene folders under `src/scenes/boss/` (`boss-1`, `boss-2`)

This lets us move feature-by-feature without losing architecture clarity.

