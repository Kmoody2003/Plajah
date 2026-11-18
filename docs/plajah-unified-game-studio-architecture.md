# Plajah Unified 3D Game, Argilla, CAD & Story Intelligence Architecture

> **Superseded 2026-11-17 by [game-studio-unified-plan.md](game-studio-unified-plan.md).**

## 1. Where the Game Design Tools Live
- **Primary Authoring Surface: Maker Studio (`cad-lab` + `argilla-lab` + new Game Builder rail)**
  - Maker already owns mechanical parts (`components/cad/MechPartsPanel.tsx`), workspaces (`services/workspace/`), and engineering sims.
  - **Tela** (`services/cad/telaCad.ts`) acts as the portable document/asset container (`MODEL_3D` GLB + `.cad.json`).
  - **Fabula** connects via **Story Intelligence** (`services/storyIntelBridge.ts`) so storyboards, characters, and camera beats can compile into playable missions/cutscenes — and game replays/telemetry can export back into Fabula film timelines.

## 2. Argilla ↔ CAD ↔ Game Engine Pipeline
1. **Argilla (`services/argilla/`)**:
   - Expand beyond organic clay (`pictureClay.ts`, `surfaceNets.ts`) into **hard-surface & vehicle sub-assemblies** (chassis, fenders, suspension arms, brake calipers, engine blocks) built from 2D design sheets.
   - Bidirectional handoff with **CAD (`services/cad/model.ts`, `scene.ts`)** via `CadModel` JSON + `GLB` (`modelToGlb`), preserving part hierarchy and pivot points (`wheelSteerPivots`, `rotorMats`, `suspensionTravel`).
2. **Maker / MATLAB-Style Simulation**:
   - Engine torque curves (`EngineSpec.torqueCurve`), suspension spring/damper rates (`SuspensionSpec`), and brake thermal curves (`BrakeSpec`) are authored as deterministic JSON profiles shared between Maker sims and the game's 60 Hz physics step.
3. **Prompt-to-Game + Visual Level Editor (No-Code)**:
   - Natural-language prompt compiles into a `WorldSpec` + `MissionGraph` (via Story Intelligence) that populates terrain, splines, checkpoints, and AI behavior, while allowing direct 3D drag-and-drop placement of CAD/Argilla assets.
4. **Decentralized Gaming Identity**:
   - `PlajahGamesBridge` links XP, achievements, and creator-owned vehicle/level provenance to the user's Plajah Games identity.
