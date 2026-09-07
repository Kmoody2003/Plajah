# Fabula Sound — Resume Handoff

**State:** scoped only; no implementation was made in this work session.  
**Date:** 2026-09-02  
**Canonical spec:** `docs/fabula/FABULA_SOUND_DESIGN_SPEC.md`

## Decision captured

Build a Krotos-style **sound-design mode inside the existing Fabula AUDIO workspace**. Keep AUDIO as the
authoritative timeline/mixer and add a focused source browser + layered design stack that renders normal
audio clips back into it.

Use four source classes:

- `Fabula Essentials`: Fabula-owned or individually audited CC0 assets only.
- `My Library`: user-imported files with an explicit rights-not-verified label.
- `ElevenLabs`: BYOK first, through an encrypted server-side key vault.
- `Fabula Pro`: later professional catalog, preferably the Pro Sound Effects Partner API, gated by a
  negotiated platform agreement.

Do not bundle ordinary BOOM, Krotos, Sonniss, ZapSplat, BBC, or Freesound downloads. Their normal terms
do not grant Fabula raw platform redistribution rights. Freesound's free API is not for commercial API
use; negotiate before integrating it.

## Where to resume

Read the canonical spec, then inspect:

- `components/Fabula/Fabula.jsx` — AUDIO room selection and contextual entry points.
- `components/Fabula/AudioTimeline.jsx` — authoritative audio timeline.
- `components/Fabula/AudioEditor.jsx` — established nondestructive clip-editor behavior.
- `services/fabula/audioGraph.ts` — audio parameter and render conventions.
- `services/fabula/genVault.ts` — encrypted provider-key pattern to reuse.
- `docs/fabula/AUDIO_SEPARATION_PLAN.md` — existing AUDIO responsibilities.
- `docs/ECLIPSA_SPATIAL_AUDIO_PLAN.md` — later spatial handoff.

The worktree was already heavily modified before these docs were added. Preserve all unrelated changes;
do not reset or rewrite `Fabula.jsx`, `server.ts`, `genVault.ts`, or other modified files wholesale.

## First implementation slice

1. Add types and pure recipe/render utilities in `services/fabula/soundDesignEngine.ts`.
2. Add a 20–30 asset fixture catalog whose files have test-only rights manifests.
3. Build `SoundDesignPanel.jsx` with search, audition, four layers, trim/offset/gain/pitch/reverse, and
   commit-to-timeline. Keep the UI architecture ready for 16 layers.
4. Persist `SoundDesign` and link committed clips with `soundDesignId`/`renderId`.
5. Add tests proving deterministic render recipes, rights gating, non-destructive rerender, and that
   audition does not mutate the timeline.

Do this local/offline slice before touching ElevenLabs. It validates the product loop without secrets,
provider uptime, billing, or licensing dependencies.

## Next checkpoint

Stop after the thin vertical slice and review:

- Does the mode feel distinct from CLEAN-UP and MIX?
- Can a real effect be built faster than arranging raw timeline clips?
- Is reopening/rerendering understandable and nondestructive?
- Are source/provider/license badges visible without overwhelming the creative workflow?
- Does project save/load retain the recipe without embedding audio binaries in JSON?

If those pass, proceed to the Phase 1 MVP in the canonical spec, then ElevenLabs BYOK.

## External follow-ups

- Request a Pro Sound Effects Partner API demo and commercial/platform licensing proposal.
- Ask ElevenLabs partnerships whether a delegated consumer OAuth flow is available or planned; until
  confirmed, use restricted user API keys and describe the connection accurately.
- Have counsel approve the `RightsManifest`, CC0 evidence policy, user-import disclaimer, retention
  language, and generated-audio commercial-rights messaging.
- Begin a Fabula-owned recording brief for impacts, whooshes, UI, footsteps, cloth, doors, room tones,
  ambiences, and practical machinery.

## Definition of ready to code

- Product owner accepts the mode-within-AUDIO decision.
- Project persistence location for `SoundDesign` is identified.
- Initial timeline placement API is identified.
- Test fixture audio and rights manifests are available.
- No professional third-party content is placed in the repository without written redistribution rights.

