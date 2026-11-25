# Plajah Academia & Elevate Games — Phase 0 Handoff & Surface Placement

## Locked Surface Placement (Next Up — Phase 1 Wiring)
1. **Academia Games** (Reading, Math, Science, 9–12 Studio, History) live in **both**:
   - **Plajah Academia** (integrated directly into the Academia learning workspace)
   - **Plajah Games** — inside a dedicated **Education** section
2. **Elevate Bible Games** (built on the same zero-tear layered engine spine) live in **both**:
   - **Plajah Games**
   - **Churches / Elevate page** — via a dedicated **Games** tab to be added to Elevate

## Phase 0 Vertical Slice (Committed Here)
- **Zero-Tear Multi-Layer Cel/Multiplane Pipeline:**
  - 7 clean `1376x768` hand-painted background plates (`public/academia-games/plates/*.jpg`) with baked actors and baked concept UI removed.
  - 8 isolated transparent RGBA sprites (`public/academia-games/sprites/*.png`) extracted through Plajah's production alpha-matting engine (`services/matting/alphaMattingEngine.ts` via `services/academiaGames/spriteMatting.ts` & `scripts/academia/isolateSprites.ts`), preserving solid warm cream/wool/fur highlights while punching inter-spoke and filigree cutouts with color decontamination.
  - Layered scene compositor (`services/academiaGames/plateAnimator.ts` + `components/academiaGames/LivingSceneStage.tsx`) wired to Plajah's Motion Council (`services/motion/council/motionCouncilService.ts`), Anima physics/fluids/procedural noise, Living particle bursts & WAAPI `compileAnim`, 13-seat Education Council (`services/educationCouncil/members.ts`), Voca speech alignment, Ora affective pacing, and Lorea keepsake Field Journal export.
- **Standalone Lab & Verification:**
  - `npm run lab:academia-games` -> `http://127.0.0.1:3148/academia-games-lab.html`
  - `npm run test:academia-games` -> 11/11 passing (`tests/academiaGames.test.ts`)
  - `npm run typecheck:academia-games` -> 0 errors (`tsconfig.academia-games.json`)
