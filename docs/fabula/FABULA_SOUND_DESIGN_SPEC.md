# Fabula Sound — Product and Technical Specification

**Status:** scoped, not implemented  
**Owner surface:** Fabula post-production suite  
**Last reviewed:** 2026-09-02  
**Companion handoff:** `FABULA_SOUND_DESIGN_HANDOFF.md`  
**Related:** `AUDIO_SEPARATION_PLAN.md`, `ECLIPSA_SPATIAL_AUDIO_PLAN.md`, `GEN_HANDOFF_PLAN.md`

## 1. Product decision

Fabula Sound is a **sound-effects design room**, not a second mixer. It gives an editor a Krotos-style
workflow for finding, generating, layering, shaping, previewing to picture, and committing designed
sound events to the existing Fabula audio timeline.

The existing **AUDIO** workspace continues to own dialogue, music, cleanup, stem separation, track
mixing, spatial placement, automation, and final loudness. Sound opens as a mode inside AUDIO for the
first release. Do not add another top-level Resolve-style rail item until usage proves that the surface
needs its own room.

The catalog is deliberately hybrid:

1. **Fabula Essentials** — a small, audited catalog that Fabula may redistribute.
2. **My Library** — files the user imports and is responsible for licensing.
3. **Connected generation** — ElevenLabs using either the user's key or Fabula-metered credits.
4. **Fabula Pro** — a later commercial catalog delivered under a negotiated platform agreement.

No ordinary end-user sound-pack license is sufficient for a built-in downloadable catalog.

## 2. Goals and non-goals

### Goals

- Turn a creative intent such as “heavy sci-fi door with a hydraulic tail” into a synchronized,
  editable sound event quickly.
- Search local, Fabula-owned, and partner catalogs from one browser while preserving source and rights.
- Audition effects against the video frame and timeline selection without first placing a clip.
- Build a sound from layers, envelopes, pitch, filters, transient shaping, convolution, and variation.
- Render a designed event nondestructively, retain its recipe, and place it on the existing timeline.
- Let users spend their own ElevenLabs allowance through a restricted API key.
- Make licensing state visible and exportable rather than hiding it in terms pages.
- Remain useful offline with imported and cached sounds.

### Non-goals for MVP

- Replacing the AUDIO mixer, `AudioEditor`, `AudioTimeline`, or `audioGraph`.
- A full modular synthesizer or Krotos plug-in host.
- VST/AU plug-in hosting in the browser.
- Live cloud collaboration on the same design event.
- Training a generative model on third-party library content.
- Redistributing BOOM, Krotos, Sonniss, ZapSplat, BBC, or Freesound content without a written agreement.
- Claiming that user-imported or user-generated audio is commercially cleared.

## 3. Primary workflow

1. User selects a timeline range, marker, video clip, or SLATE shot.
2. User opens **AUDIO → SOUND DESIGN**.
3. Fabula creates a `SoundCue` with the selection's `shotId`, in/out time, label, and optional visual
   description.
4. User searches the unified library, imports a file, records a sound, or generates candidates.
5. Results are auditioned to picture at the cue time. Auditioning does not mutate the edit.
6. User drags candidates into layers and changes timing, pitch, gain, pan, filters, envelope, and FX.
7. **VARIATIONS** produces deterministic alternates from the same sources and parameter ranges.
8. **COMMIT TO TIMELINE** renders a WAV, stores the recipe, and places the event on a selected/new audio
   track at the cue time.
9. Double-clicking the committed clip reopens the recipe. Re-rendering creates a new take and preserves
   the prior render; it never silently overwrites source media.

## 4. Information architecture

### Entry points

- AUDIO workspace toolbar: `MIX | CLEAN-UP | STEMS | VOICE | SOUND DESIGN`.
- Timeline context menu: **Design sound for selection…**
- SLATE shot action: **Design sound…** with the shot description prefilled.
- Media-pool audio context menu: **Open in Sound Design**.

All doors open the same stateful panel. MVP uses a resizable center/bottom panel in AUDIO, not a modal,
because auditioning and arranging need the monitor and timeline to remain visible.

### Panel layout

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ CUE: 04B / airlock opens       00:01:12:08       [Audition] [Commit]       │
├──────────────────────┬──────────────────────────────────┬───────────────────┤
│ SOURCES              │ DESIGN STACK                     │ INSPECTOR         │
│ Search               │ Layer 1  latch        ──▮        │ Trim / fades      │
│ Essentials           │ Layer 2  servo     ───────▮      │ Gain / pan        │
│ My Library           │ Layer 3  impact         ▮        │ Pitch / reverse   │
│ ElevenLabs           │ Layer 4  tail          ───────   │ Filter / envelope │
│ Fabula Pro (later)   │                                  │ FX / sends        │
├──────────────────────┴──────────────────────────────────┴───────────────────┤
│ WAVEFORM / CUE TIMELINE                  [Variations] [Save recipe/preset]  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Source-result card

Every result shows title, duration, waveform, provider, license badge, sample rate, channel count,
favorite state, download/cache state, and `+ Layer`. Generated results also show estimated/actual cost
and the paying account before generation.

## 5. MVP scope (Phase 1)

### 5.1 Unified local catalog

- IndexedDB stores metadata and small waveform peaks; OPFS stores cached/original audio where supported.
- Folder/file import accepts WAV, AIFF, FLAC, MP3, M4A, and OGG subject to the existing codec matrix.
- Parse Broadcast Wave and common metadata when present; otherwise preserve filename and folder tags.
- Search title, aliases, tags, category, source, duration, channel count, and license.
- Filters: source, category, duration, mono/stereo, sample rate, favorites, cached, and license.
- Preserve original files. Proxies and normalized audition files are derived assets.
- Duplicate detection uses file hash; perceptual duplicate detection is deferred.

### 5.2 Fabula Essentials

- Initial target: **1,000–3,000 manually reviewed sounds**, not an uncurated bulk dump.
- Preferred content: Fabula-owned recordings and individually verified CC0 material.
- Minimum useful categories: impacts, whooshes, risers, UI, doors, footsteps, cloth, body movement,
  household objects, vehicles, nature, weather, crowds, room tones, machinery, weapons, creatures,
  science fiction, horror, comedy, and transitions.
- Normalize metadata to Universal Category System-style category/subcategory fields.
- Retain the original artifact and an immutable license snapshot for every asset.
- Loudness-normalize audition proxies only; do not destructively normalize masters.

### 5.3 Design stack

- Up to 16 layers per event in MVP.
- Layer controls: offset, trim, fades, gain, mute/solo, pan, playback rate, pitch, reverse, and loop.
- Processing: high/low-pass filter, 3-band EQ, compressor, transient emphasis, saturation, delay,
  algorithmic reverb, and convolution reverb using Fabula-cleared impulses.
- Master controls: limiter, output gain, dry/wet, and tail length.
- Web Audio provides live preview. `OfflineAudioContext` renders the committed file.
- Recipe versioning makes every render reproducible.
- Export/commit formats: 48 kHz / 24-bit WAV default; mono or stereo. Project settings may override.

### 5.4 Variations

- Seeded randomization for selected ranges: layer start, pitch, gain, pan, envelope, and FX mix.
- Generate 4 candidates by default; audition and promote one into the active recipe.
- Never substitute source assets without explicit opt-in.
- Store the random seed and all resolved values in the recipe.

### 5.5 Timeline integration

- A committed result becomes a normal Fabula audio clip with `soundDesignId` and `renderId`.
- Default track is the selected audio track; otherwise create `SFX 1`.
- Maintain `shotId` when opened from a shot or shot-linked clip.
- Re-render creates a new take. Previous takes remain recoverable and muted when replaced.
- Existing audio graph, track FX, automation, spatialization, meters, and export remain authoritative.

## 6. ElevenLabs connector (Phase 1B)

### Product behavior

- Connection type is `user_api_key`; do not call it OAuth unless ElevenLabs publishes a suitable
  authorization flow.
- Setup copy asks the user to create a dedicated, restricted, quota-limited ElevenLabs key.
- Before each request show: provider, requested duration, candidate count, payer (`Your ElevenLabs
  account` or `Fabula credits`), and a cost estimate when the API exposes enough pricing information.
- Generation fields: prompt, duration/automatic duration, prompt influence, seamless loop, and candidate
  count, limited to capabilities actually supported by the selected model/API version.
- Results enter a temporary tray. The user must explicitly save to My Library or add to a design.
- Save provider, model, request ID, prompt, parameters, account owner, generation time, and license-plan
  attestation with the asset.

### Security contract

- The browser sends the key once over TLS to Fabula's backend.
- Store it encrypted with AES-256-GCM using the existing credential-vault pattern in
  `services/fabula/genVault.ts`; never return the secret to the client.
- The client receives only provider, linked state, masked tail, quota label if known, and last-used time.
- All ElevenLabs requests are server-side. Never persist the key in localStorage, IndexedDB, logs,
  analytics, errors, or URLs.
- Support revoke, rotate, connection test, request timeout, per-user rate limit, and abuse controls.
- Restrict SSRF: the adapter talks only to allowlisted ElevenLabs API hosts.

### API shape

```text
GET    /api/fabula/sound/connectors
POST   /api/fabula/sound/connect/elevenlabs
DELETE /api/fabula/sound/connect/elevenlabs
POST   /api/fabula/sound/generations
GET    /api/fabula/sound/generations/:id
POST   /api/fabula/sound/generations/:id/import
```

`POST /generations` returns a Fabula job even if the provider responds synchronously. This keeps the UI
compatible with future providers, retry policy, moderation, and metered Fabula credits.

## 7. Professional catalog (Phase 2)

### Preferred partner

Start commercial discussions with **Pro Sound Effects Partner API** because its published partner
offering explicitly supports embedded search, preview, licensing, and download in creative platforms.
Keep the provider behind a catalog adapter so a second partner can be added later.

### Contract gates before implementation

Written terms must explicitly cover:

- Fabula presenting search results and previews inside a paid product.
- Which users/tiers may obtain originals and for how long.
- Incorporation into exported productions and project archives.
- Whether cached files may remain available offline and after subscription expiry.
- Team/project sharing and contractor access.
- Territory, attribution, indemnity, takedown, audit, and reporting duties.
- Transformation, layering, rendering, stems, and whether isolated downloads are allowed.
- Whether similarity embeddings, auto-tagging, and prompt-based retrieval are allowed.
- An explicit prohibition/permission statement for AI training; Fabula defaults to **no training**.
- Pricing basis: MAU, seats, previews, downloads, storage, or revenue share.

Until those gates pass, `Fabula Pro` may appear only behind a disabled `Coming later` feature flag.

### Adapter boundary

```ts
interface SoundCatalogProvider {
  search(query: SoundSearchQuery, cursor?: string): Promise<SoundSearchPage>;
  preview(assetId: string): Promise<SignedAudioRef>;
  acquire(assetId: string, projectId: string): Promise<LicensedAudioRef>;
  license(assetId: string, projectId: string): Promise<RightsManifest>;
}
```

Do not normalize away provider IDs, license revisions, or acquisition receipts.

## 8. Rights and provenance

Every playable asset requires a machine-readable `RightsManifest`. Unknown is a real state and blocks
inclusion in Fabula Essentials; it does not block a user's private import, but it produces a warning.

```ts
type RightsManifest = {
  sourceProvider: 'fabula' | 'user' | 'elevenlabs' | 'pse' | string;
  sourceAssetId?: string;
  sourceUrl?: string;
  creator?: string;
  licenseType: 'owned' | 'CC0' | 'CC-BY' | 'partner' | 'user-attested' | 'unknown';
  licenseVersion?: string;
  licenseSnapshotUrl?: string;
  acquiredAt: string;
  redistributionAllowed: boolean;
  commercialUse: 'allowed' | 'restricted' | 'unknown';
  attribution?: { required: boolean; text?: string };
  aiTraining: 'allowed' | 'prohibited' | 'unknown';
  receiptId?: string;
};
```

### Ingestion rule

An asset enters **Fabula Essentials** only when all are true:

- Fabula owns it or a reviewer verifies a valid CC0 dedication from the rights holder.
- The original source and dated license evidence are archived.
- It passes audio-quality, privacy, trademark, recognizable-voice, music, and duplication review.
- It has normalized metadata and a stable checksum.

Freesound may be used as a discovery lead, but its free API may not power a commercial Fabula catalog.
Commercial API usage requires an agreement, and Fabula must not clone the service. Sonniss GDC and
standard BOOM/Krotos/ZapSplat licenses are user-import candidates, not bundle candidates, unless Fabula
obtains explicit platform redistribution rights.

## 9. Data model

```ts
type SoundAsset = {
  id: string;
  ownerId: string | 'fabula' | `provider:${string}`;
  projectId?: string;
  title: string;
  description?: string;
  tags: string[];
  category?: string;
  subcategory?: string;
  durationMs: number;
  sampleRate: number;
  bitDepth?: number;
  channels: number;
  format: string;
  originalRef: string;
  previewRef?: string;
  waveformRef?: string;
  checksum: string;
  rights: RightsManifest;
  generation?: GenerationProvenance;
};

type SoundDesign = {
  id: string;
  projectId: string;
  shotId?: string;
  name: string;
  cueTime: number;
  duration: number;
  version: number;
  sampleRate: number;
  channels: 1 | 2;
  layers: SoundLayer[];
  master: MasterSoundChain;
  seed?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

type SoundRender = {
  id: string;
  soundDesignId: string;
  designVersion: number;
  audioRef: string;
  checksum: string;
  renderedAt: string;
  timelineClipId?: string;
};
```

Project persistence should follow Fabula's existing project-save mechanism. Large audio binaries belong
in object storage/OPFS, never inside the project JSON document.

## 10. Service boundaries

Suggested new modules:

```text
components/Fabula/SoundDesignPanel.jsx
components/Fabula/SoundSourceBrowser.jsx
components/Fabula/SoundDesignStack.jsx
components/Fabula/SoundLayerInspector.jsx
components/Fabula/SoundGenerationTray.jsx
services/fabula/soundCatalog.ts
services/fabula/soundDesignEngine.ts
services/fabula/soundRights.ts
services/fabula/elevenLabsSfx.ts          # server-only provider adapter
tests/fabulaSoundDesign.test.ts
tests/fabulaSoundRights.test.ts
tests/fabulaElevenLabsSfx.test.ts
```

Reuse rather than fork:

- `services/fabula/audioGraph.ts` for shared audio parameter conventions.
- `services/fabula/genVault.ts` for encrypted BYOK credential storage.
- Existing job/storage/auth primitives in `server.ts`.
- Existing Fabula waveform, playback transport, media resolution, and timeline placement behavior.

The design engine must not make network calls. Catalog and generation adapters supply sources; the
engine only previews/renders recipes.

## 11. Reliability, accessibility, and performance

- First local search result under 150 ms for a 10,000-item indexed library on a target laptop.
- Start cached audition under 100 ms; remote preview under 1.5 s on a healthy broadband connection.
- Parameter changes should become audible within one animation frame where Web Audio permits.
- A 30-second, 16-layer render should complete in under 10 seconds on the target laptop.
- Virtualize long result lists; decode only visible/auditioned audio.
- Cancel superseded searches, waveform jobs, downloads, and generations.
- Keyboard-operable search, results, layers, controls, audition, and commit.
- Visible focus, screen-reader labels, textual values for knobs, and reduced-motion behavior.
- Generation/provider outages must not disable local design or existing projects.
- Missing partner assets reopen in proxy/offline mode with a clear reacquire action.

## 12. Analytics and economics

Collect product events without prompts, filenames, audio, or API secrets:

- Sound Design opened and entry point.
- Source selected: essentials, local, generated, partner.
- Search latency and zero-result rate.
- Audition, layer-add, variation, commit, reopen, and rerender counts.
- Generation duration, provider status, estimated/actual platform cost, and payer model.
- Partner preview/acquisition counts required by contract.

Economic guardrails for Fabula-funded generation:

- Per-plan monthly generation allowance.
- Hard user/project spending caps and idempotency keys.
- Cost reservation before dispatch, reconciliation after response, refund on provider failure.
- Kill switch per provider and global daily budget alert.
- Never silently fall back from user-paid BYOK to Fabula-paid credits.

## 13. Delivery phases

### Phase 0 — rights and content preparation

- Approve rights-manifest schema and ingestion checklist.
- Record/commission a small Fabula-owned hero pack.
- Audit CC0 candidates and create the first 250-asset internal test catalog.
- Open PSE partnership discussion; do not block MVP on it.

**Exit:** 250 cleared assets with immutable provenance and reviewer sign-off.

### Phase 1 — local design MVP

- AUDIO entry point, cue creation, source browser, imported library, design stack, audition, variations,
  offline render, recipe persistence, and timeline commit.
- Expand Essentials toward 1,000–3,000 assets in parallel.

**Exit:** a user can design, reopen, and rerender a synchronized effect without a network connection.

### Phase 1B — ElevenLabs BYOK

- Restricted-key connection, encrypted vault, server adapter, job tray, provenance, quota messaging,
  rate limiting, revoke/rotate, and provider failure states.

**Exit:** a connected user can generate candidates using their account, add one to a recipe, disconnect,
and verify that no secret appears in client storage or logs.

### Phase 2 — professional catalog

- Execute a platform agreement, add partner adapter, acquisition receipts, entitlement/cache lifecycle,
  and tier gating.

**Exit:** contract tests and counsel/business sign-off prove every user-visible action is licensed.

### Phase 3 — advanced design

- Picture-aware prompt suggestions, envelope followers, event families, macro performance controls,
  spatial/object audio handoff, team preset sharing, and optional native/Crossover rendering.

## 14. Acceptance criteria

MVP is complete only when:

- The feature is reachable from AUDIO and at least two contextual doors.
- Search and audition do not modify the timeline.
- A 16-layer recipe previews, renders, commits, reopens, and rerenders reproducibly.
- Undo/redo covers layer and parameter changes plus timeline placement.
- Every built-in result has a valid rights manifest; unknown-rights assets cannot enter Essentials.
- User imports are clearly labeled `User supplied — rights not verified by Fabula`.
- Generated assets retain provider and request provenance.
- Deleting/revoking a provider key leaves saved audio usable but prevents new calls.
- No provider secret is observable in browser storage, client bundles, URLs, telemetry, or server logs.
- Existing AUDIO mixing, cleanup, separation, playback, and delivery tests continue to pass.

## 15. Open decisions

1. Is Sound Design included in all paid Fabula plans, or is the advanced engine a higher tier?
2. Does project sharing copy user-imported originals, or require each collaborator to relink them?
3. Which object-storage retention policy applies to discarded AI candidates?
4. Will Fabula offer its own generation credits at launch, or ship BYOK only?
5. Which legal reviewer signs the CC0 ingestion checklist and professional catalog agreement?
6. Should the first Fabula-owned pack be cinematic/film-general, faith-production focused, or balanced?

The recommended defaults are: paid plans receive the local engine; BYOK only at launch; imported files
remain project-scoped; discarded generations expire after 7 days; and the first owned pack is a balanced
film-production foundation with especially strong dialogue-scene foley, transitions, rooms, and UI.

