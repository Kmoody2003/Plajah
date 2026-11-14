# Chora Direct — Gemini Handback

## G1 & G1b ACE-Step edit modes and new engine registry entries (2026-11-13)
Changed: `services/musicEnginePolicy.ts`, `services/melos/generation/types.ts`, `services/melos/generation/adapters.ts`, `services/melos/generation/jobs.ts`, `services/melos/generation/client.ts`, `routes/musicLab.ts`, `scripts/music_lab_worker.py`, `tests/musicEnginePolicy.test.ts`, `tests/melosGeneration.test.ts`, `package.json`, `docs/melos-music-lab.md`, `docs/chora/GEMINI_HANDBACK.md`
Verified:
- Read ACE-Step 1.5 `docs/en/API.md`, `docs/en/INFERENCE.md`, `acestep/constants.py`, and `acestep/api/http/release_task_request_parser.py` to confirm exact `task_type` values (`text2music`, `repaint`, `cover`, `lego`, `extract`, `complete`; no separate `extend` or `audio2audio` task types), multipart upload fields (`src_audio`, `reference_audio`), edit fields (`repainting_start`, `repainting_end`, `chunk_mask_mode="explicit"`, `audio_cover_strength`, `track_name`, `track_classes`, `global_caption`, `instruction`), and pure-`base` checkpoint requirement on `lego`/`extract`/`complete`.
- Read `Soul-AILab/SoulX-Singer` `cli/inference.py` and `preprocess/tools/midi_parser.py` (`notes2meta`, `build_model`, `process(..., control="score")`) and registered `heartmula-rl-3b` (Apache-2.0) and `soulx-singer` (`evaluation` until Hugging Face weights licence tag is confirmed by Kenne; `MuLaCover` and `MuScriptor` excluded due to CC BY-NC 4.0 weights).
- Ran `npm run test:music-lab` (`tsx --test tests/musicEnginePolicy.test.ts` -> 4/4 passed; `node scripts/testMelosGeneration.mjs` -> 20/20 passed, including `VocalRegenRequest` -> `repaint` / `cover` / `reference_audio` multipart fixture round-trips, `/v1/models` `turbo` + `sft` refusal on `lego`/`extract` with `base` checkpoint acceptance, and `soulx-singer` Python subprocess stub round-trip).
Not verified:
- Live GPU execution of ACE-Step `repaint`, `cover`, `reference_audio`, `lego`, `extract`, `complete`, `heartmula-rl-3b`, and `soulx-singer` (no local GPU/model jobs run on this 8 GB laptop per house rules, and `heartmula-rl-3b` / `soulx-singer` weights are not downloaded locally).
Requests for Claude:
- None (`VocalRegenRequest` in `services/melos/direct/vocalScore.ts` already provided all fields needed by `vocalRegenToAceRepaintRequest` and `vocalRegenToSoulxRequest`). Note: when wiring `VocalRegenRequest.audio` from Timeline clips, pass base64 WAV/FLAC/MP3 bytes in the optional `sourceAudioBase64` argument to `vocalRegenToAceRepaintRequest(regen, { sourceAudioBase64 })`.

## G2 Deeper style packs (2026-11-13)
Changed: `services/melos/direct/packs/index.ts`, `services/melos/direct/packs/electronic.ts`, `services/melos/direct/packs/hiphop.ts`, `services/melos/direct/packs/jazz.ts`, `services/melos/direct/packs/cinematic.ts`, `services/melos/direct/packs/classical.ts`, `tests/choraDirectPacks.test.ts`, `package.json`, `docs/chora/GEMINI_HANDBACK.md`
Verified:
- Added 40 deeper style packs across all 5 families (12 electronic, 8 hip-hop, 6 jazz including Afro-Cuban clave direction, 7 cinematic, 7 classical including 3/4 waltz), bringing `STYLE_PACKS` to 75 total packs.
- Ran `npm run test:direct` -> 14/14 passed (all existing pack selections, brief rules, and Session Band chart checks preserved).
- Ran `npm run test:direct-packs` -> 6/6 passed (every new pack selected by its tags and every progression parsed by `parseChord` / `parseChart` across all 12 keys).
Not verified:
- Blind ear-level audio rendering across all 40 new packs (no local audio generation batches run on this laptop).
Requests for Claude:
- Optional cleanup in `services/melos/direct/styleKnowledge.ts`: a few core packs currently list subgenre names inside their `match` regexes (`amapiano|afro house` in `edm-deep-house`, `psytrance|psy[- ]?trance|goa` in `edm-trance`, `jungle|neurofunk` in `edm-dnb`, `idm` in `edm-ambient`, `smooth jazz` in `jazz-fusion`, `string quartet` in `classical-era`, `nocturne|waltz` in `classical-romantic`). Because core packs precede `EXTRA_PACKS` in `STYLE_PACKS`, a single-word exact tie (e.g. bare `"amapiano"` with no second tag) breaks in favour of the earlier core pack unless those subgenre tokens are removed from the core packs (keep `liquid` in `edm-dnb` if `'drum and bass, liquid'` in `tests/choraDirect.test.ts` should still pick `edm-dnb`).


## G3 Audio to MIDI: chords and stems (2026-11-13)
Changed: `services/melos/transcribe/chordsFromAudio.ts`, `services/melos/transcribe/stemTranscribe.ts`, `services/melos/transcribe/index.ts`, `tests/choraTranscribe.test.ts`, `package.json`, `docs/chora/GEMINI_HANDBACK.md`
Verified:
- Implemented `recognizeChordsFromAudio` (`chordsFromAudio.ts`): reuses `services/musicIntel/dsp.ts` (`measureAudio`, `estimateKey`, `fft`) and `services/melos/beats/{tempoMap,songKey}.ts` (`songTime`, `docKey`, `prefersFlats`), extracts parabolic peak-picked chroma per beat, matches 12 roots × 7 qualities (`major`, `minor`, `7`, `maj7`, `m7`, `dim`, `sus4`), smooths over the beat grid via Viterbi, and emits one `parseChord`-valid chord symbol per bar.
- Implemented `transcribeSeparatedStems` (`stemTranscribe.ts`): routes `drums` -> `services/drumTranscription.ts` (`transcribeDrumsFromBuffer`), `vocals` -> `services/melos/beats/voice/pitchTrack.ts` (`trackBuffer` + `eventsToNotes`), `bass` -> `pitchTrack.ts` (`yin` + `NoteSegmenter` configured for 30–360 Hz fundamentals), and `other` -> `services/basicPitchBackend.ts` (`transcribeWithBasicPitch`), converting times via `songTime` / `TempoMap` and `snapGrid` without `60 / bpm`.
- Inspected `services/demucsClient.ts` and recorded what verifying it requires (`DEMUCS_VERIFICATION_REPORT`): (1) vendoring `/models/demucs/htdemucs.onnx` (~90 MB, MIT `facebookresearch/demucs`) and `/models/demucs/ort/*.wasm` into `public/models/demucs/`; (2) confirming the ONNX export embeds real-valued STFT/iSTFT ops matching input `[1, 2, 343980]` (7.8 s @ 44.1 kHz stereo) and output `[1, 4, 2, 343980]` in `['drums', 'bass', 'other', 'vocals']` order; (3) closing `AudioContext` on decode error in `decodeStereo44k` and benchmarking WebGPU/WASM peak memory (~600–900 MB); (4) testing `invokeNativeStemSeparation` returned local file URLs under WebView2 CORS.
- Ran `npm run test:transcribe` -> 3/3 passed on synthesised progressions (`C | Am | F | G7`, `Cmaj7 | Dm7 | Bdim | Gsus4`), single-beat chromatic glitch smoothing + flat spelling (`F | Bbmaj7`), and 4-stem routing with a stepped `TempoMap`.
Not verified:
- Browser WebAudio/WebGL execution of `transcribeWithBasicPitch` against `public/models/basic-pitch/model.json` on real polyphonic stems (tested via injected `basicPitchRunner` fixture in headless Node; headless Node reports `status: 'unavailable'` honestly rather than substituting monophonic/DSP notes under Basic Pitch's name).
- `services/demucsClient.ts` stem separation itself (model weights not in repository; see blockers above).
Requests for Claude:
- None.


## G4 Cloud writer lane for the brief (2026-11-13)
Changed: `routes/choraDirect.ts`, `server.ts`, `tests/choraDirectWrite.test.ts`, `package.json`, `docs/chora/GEMINI_HANDBACK.md`
Verified:
- Created `routes/choraDirect.ts` (`createChoraDirectRouter`) and mounted it at `/api/chora/direct` (`POST /api/chora/direct/write`, `GET /api/chora/direct/ai-info`) in `server.ts` right beside `createMusicLabRouter` (also wired `SOULX_SINGER_EVALUATION_PERMISSION_REF` into `createMusicLabRouter`'s `evaluationPermission` callback).
- Enforces `cloudConsent === true` (returns HTTP `428` with `code: 'CLOUD_CONSENT_REQUIRED'` otherwise), calls `services/ai/geminiLane.ts` (`createGeminiLane` / `laneModel('CHORA_DIRECT_MODEL')`), builds the user prompt strictly from `briefGrounding(brief, { chair, sectionId })` plus the council's `bar beat length pitch` instructions without inventing a second grounding, and validates/re-serialises all returned note lines through `parseNoteLines` and `toLines` in `services/melos/beats/council/noteLines.ts`.
- Ran `npm run test:direct-write` -> 3/3 passed against a local HTTP server with an injected stub `LaneFn` (verifying `428` without `cloudConsent: true`, verbatim `briefGrounding` prompt construction, out-of-region/prose filtering via `parseNoteLines`, 3/4 waltz meter bar validation, and `422` when zero valid note lines are returned).
Not verified:
- Live Gemini API calls against `POST /api/chora/direct/write` (no cloud model traffic run without explicit user consent per house rules; tested with stubbed `LaneFn`).
Requests for Claude:
- None (`POST /api/chora/direct/write` accepts either `{ brief: SongBrief, chair, section, bars, cloudConsent: true }` or pre-rendered `{ grounding: string, chair, section, bars, cloudConsent: true }` and returns both `notes: ComposedNote[]` and `lines: string[]` / `text: string` in `bar beat length pitch` format).


## G5 Evaluation suite (2026-11-13)
Changed: `tests/fixtures/directPrompts.json`, `scripts/evalChoraDirect.ts`, `tests/evalChoraDirect.test.ts`, `package.json`, `docs/chora/GEMINI_HANDBACK.md`
Verified:
- Created `tests/fixtures/directPrompts.json` with 3 prompts per style pack (`plain`, `lyrics`, `marks`) across all 78 packs in `STYLE_PACKS` (`234` total prompts), each recording expected `packId`, `tempoRange`, and `form`.
- Created `scripts/evalChoraDirect.ts`:
  - Mode 1 (`npm run eval:direct`, no audio): compiles all 234 fixtures via `compileSongBrief(parseSongPrompt(...))`, checks `packId`, `tempoRange`, `form`, and lyrics/marks invariants, prints a formatted summary table, and exits non-zero on failure (`234/234` passed across 78 style packs).
  - Mode 2 (`npx tsx scripts/evalChoraDirect.ts --wav-dir <folder>`): decodes PCM/float RIFF/WAVE files in pure TypeScript, runs `measureAudio` from `services/musicIntel/dsp.ts`, and compares measured tempo, key (exact/relative/tonic), and BS.1770 integrated loudness (`integratedLufs`) against the compiled `SongBrief` (`bpm`, `keyName`, `pack.mix.lufs`).
- Ran `npm run test:eval-direct` -> 2/2 passed (including WAV measurement against a synthesised 120 BPM C-major stereo WAV).
Not verified:
- Mode 2 (`--wav-dir`) against full-length ACE-Step / HeartMuLa / SoulX-Singer rendered WAV corpora (no local model rendering batches run on this machine per house rules; tested on synthesised PCM WAV fixtures).
Requests for Claude:
- None.


## Chora Heritage Simulation Instruments & Synthesizer Flagship Upgrade (2026-11-13)
Changed:
- **Heritage Physics & Deep Solvers**: `services/melos/instruments/physics/heritageAcoustics.ts` (new), `services/melos/instruments/soma/deep/deepModes.ts`, `services/melos/instruments/tonos/deep/deepBody.ts`, `services/melos/instruments/tonos/deep/tonosDeep.ts`
- **Rust/WASM DSP Core (`ABI_VERSION = 20`)**: `rust/plajah-audio/src/{params,lfo,lib,engine,filter,shaper,osc,aura,modal,voice,soma,tonos,lyra}.rs`, `services/melos/beats/engine/dsp/plajah_audio.wasm`
- **Host, Motion & NoteFX Engine**: `services/melos/beats/engine/InstrumentHost.ts`, `services/melos/beats/engine/instrumentProcessor.worklet.js`, `services/melos/beats/engine/BeatsEngine.ts`, `services/melos/beats/noteFx.ts`, `services/melos/beats/render.ts`, `services/melos/melosWasmSongEngine.ts`, `services/melos/motion.ts`
- **Instrument Params, Patches & 10 Expanded Preset Banks (Zero Removals)**: `services/melos/instruments/onda/{params,patch,presets}.ts`, `services/melos/instruments/aura/{params,patch,presets}.ts`, `services/melos/instruments/bajo/{params,patch,presets}.ts`, `services/melos/instruments/vela/{patch,presets,suite}.ts`, `services/melos/instruments/kera/{zones,persist}.ts`, `services/melos/instruments/soma/{params,patch,presets}.ts`, `services/melos/instruments/tonos/{params,presets}.ts`, `services/melos/instruments/lyra/{params,presets}.ts`
- **Realtime Simulation & Synthesizer UI Components**: `components/melos/beats/instrument/{SomaPanel,TonosPanel,LyraPanel,LyraBandSeat,OndaEditor,MotionPanel,AuraPanel,AuraEditor,BajoEditor,VelaPanel,VelaEditor,PartialDisplay,KeraPanel,KeraEditor}.tsx`
- **Tests**: `tests/heritageAndSynthAudit.test.ts` (new), `tests/melosAura.test.ts`, `tests/melosSoma.test.ts`, `tests/tonosInstrument.test.ts`, `docs/chora/GEMINI_HANDBACK.md`

Verified:
- **Heritage Physics & CAD/ODE/Circuit Integration (`heritageAcoustics.ts`)**:
  - Built 3D-CT heritage tonewood (`cremonese_spruce`, `bosnian_maple`, `torres_cedar`, `indian_tun`, `aged_gourd`, `kiri_paulownia`, `lenke_hardwood`) & animal hide (`mylar`, `calfskin`, `goatskin`, `cowhide`, `fishskin`) models with Tai/Stoel-Borman hemicellulose hydrolysis & mineral ground aging (`ageTonewood`), Stradivari 1715 "Titian" / Guarneri 1734 "Il Cannone" 3D-CT graduation maps (`evaluateCtPlateThicknessMm`), and orthotropic Kirchhoff-Love + Bridge-Hill admittance eigen-solver (`solveOrthotropicPlateModes`).
  - Integrated Plajah's Dormand-Prince 5(4) / Rosenbrock 2(3) stiff ODE solver (`services/bio/ode.ts`) for Weinreich (1977) 2D string polarization (`simulateWeinreichPolarization`) and Hunt-Crossley (1975) nonlinear viscoelastic snare/jawari contact (`simulateHuntCrossleyRattle`), plus complex MNA RLC/eddy-current/passive tone-stack Bode transfer (`evaluatePickupBodeCurve`) coupled to `fretPosition` (`services/elec/guitar.ts`).
- **Rust `plajah-audio` Core (`ABI_VERSION = 20`)**:
  - **SOMA (`soma.rs`)**: C.V. Raman *syahi*/*karanai* concentric & eccentric paste harmonic loading (`1:2:3:4:5` convergence via `SM_SYAHI_LOAD`), exact $j_{mn}^4$ plate-bending dispersion, dorsal-spine & lacing doublet splitting (`SM_CRAFT_ASYMMETRY`), Hunt-Crossley snare/buzz contact ODE, hand-adzed goblet bore micro-turbulence allpass, aged hide viscoelastic damping (`SM_HERITAGE_AGE`), and Igbo Udu / Ghatam hand-aperture occlusion (`SM_APERTURE_HAND`).
  - **TONOS (`tonos.rs`)**: Weinreich $2\times 2$ coupled vertical/horizontal bridge admittance (two-stage prompt-to-aftersound bloom), longitudinal phantom partial resonators driven by $(v^+)^2$, 4-point cubic Lagrange sympathetic *taraf* waveguide strings with dispersion allpass & bridge feedback, round-robin `TONOS_DEEP_VARIANTS`, and `TN_HERITAGE_AGE` / `TN_CRAFT_ASYMMETRY`.
  - **LYRA (`lyra.rs`)**: Coupled trichord/bicord unison courses with bridge energy exchange, 12-pitch-class sympathetic harp/open-string/duplex resonator (`LY_SYMPATHETIC`), hysteretic felt hammer + longitudinal phantom partials, Smith-Woodhouse thermal rosin bow friction, multi-cell *cuivré* brass shockwave steepening, and `LY_HERITAGE_AGE` / `LY_CRAFT_CHARACTER`.
  - **Synthesizer DSP & Dead-Control Audit**: 4-stage nonlinear transistor `Ladder` (`filter.rs`), OTA-saturated `Svf`, 1st-order $\text{ADAA}_1$ waveshaper (`shaper.rs`), subsample PolyBLAMP hard sync (`osc.rs`), MN3009 BBD dynamic clock anti-aliasing & stateful tape hysteresis (`aura.rs`), per-voice component tolerance matrix, custom 64-point LFO breakpoint upload (`pa_set_lfo_custom`) + `L_PER_VOICE`, wired `O_PAN` (`102/202/302`), `F_MIX` (`508/608`), all 16 previously unmodulated ONDA/AURA targets, and live `ModMatrix` + MPE + pitch bend inside VELA `render_modal` (`voice.rs`).
- **UI Fixes, Realtime 60 fps Physical Simulation Canvases & Additive Presets**:
  - Built live 60 fps physical visualizers in `SomaPanel.tsx`, `TonosPanel.tsx`, and `LyraPanel.tsx` driven by real audio waveform/FFT analysis (`inst.readWaveform` / `inst.readSpectrum`) and physical state.
  - Fixed wavetable loading & VA/SVF controls in `OndaEditor.tsx`, interactive step/curve/ADSR/random Motion editors & non-clobbering `applyCompiledMotions` in `MotionPanel.tsx` / `motion.ts`, `TRAITS[6]` & LFO `3..5` Drift wiring in `VelaPanel`/`VelaEditor`/`PartialDisplay`/`melosWasmSongEngine`, discrete `DELAY_DIVS` + VCO 3 + live 960 step LEDs + `'octave'`/`'seq'` arp fixes in AURA, auto-enabled `Osc B` + wavetable selectors in `BajoEditor.tsx`, `'pluck'` seat in `LyraBandSeat.tsx`, and `KeraVoiceState` persistence + LFO 1 rate knob + `.sfz` file loading in KERA.
  - Added 116 new presets across all 10 banks with zero removals: `ONDA` (`21 -> 37`), `AURA` (`56 -> 70`), `BAJO` (`16 -> 28`), `VELA` (`11 -> 21`), `CANTUS` (`5 -> 9`), `ISON` (`4 -> 8`), `PNEUMA` (`3 -> 7`), `SOMA` (`36 -> 54`), `TONOS` (`24 -> 38`), `LYRA` (`44 -> 60`).
- **Automated Test Suites & Typecheck**:
  - `npm run test:dsp` -> `49/49` passed (`ABI_VERSION = 20`)
  - `npm run test:lyra` -> TS `6/6` + Rust `13/13` passed
  - `npm run test:tonos` -> TS `9/9` + Rust `11/11` passed
  - `npm run test:band` -> `18/18` passed
  - `npm run test:melostime` -> `178/178` passed
  - `npx tsx --test tests/heritageAndSynthAudit.test.ts tests/melosSoma.test.ts tests/melosAura.test.ts tests/velaSuite.test.ts tests/velaPlayer.test.ts tests/melosInstruments.test.ts tests/melosKera.test.ts tests/somaHandMap.test.ts` -> `82/82` passed
  - Scoped `tsc --noEmit` across all 49 modified/created TS & TSX files -> `0` errors (`exit code 0`).
  - Checked `git status`: zero edits to `services/melos/direct/*`, `tests/choraDirect.test.ts`, `arco.rs`, `cornu.rs`, or `aulos.rs`; no `git push` performed.

Not verified:
- Live browser WebAudio + human ear critical listening / gain-staging pass across all 322 total presets and interactive 60 fps canvas ergonomics on physical MIDI/MPE hardware (all DSP stability, spectral/harmonic laws, modulation routing, preset serialization, and TypeScript contracts were verified headlessly in Node + WASM + Rust).

Requests for Claude:
- None.


## Chora 3D CAD Instruments, GPU/Memory Efficiency, TONOS Ring/Runaway Fix & All-Instrument Session Band (2026-11-13)
Changed:
- **TONOS DSP & Audition Stuck-Note Fixes**: `rust/plajah-audio/.cargo/config.toml` (`+simd128`), `rust/plajah-audio/src/{tonos.rs, engine.rs}`, `services/melos/beats/engine/dsp/plajah_audio.wasm`, `components/melos/beats/instrument/useInstrumentKeyboard.ts`, `components/melos/beats/instrument/{TonosPanel,LyraPanel}.tsx`
- **GPU/Worker/Memory & Canvas Optimization**: `services/melos/instruments/soma/deep/{deepUtil.ts, gpuModal.ts, deepWorker.ts, deepModes.ts, somaDeep.ts}`, `services/melos/instruments/tonos/deep/{deepBody.ts, tonosDeep.ts, tonosDeepWorker.ts}`, `services/melos/beats/engine/hitCache.ts`, `components/melos/beats/instrument/{TonosPanel,LyraPanel,SomaPanel,AuraPanel}.tsx`
- **Parametric 3D CAD Instrument Models & Interactive Viewports**: `services/melos/instruments/cad3d/{cadUtils.ts, tonosCadModel.ts, somaCadModel.ts, lyraCadModel.ts, index.ts}` (new), `components/melos/beats/instrument/3d/Instrument3DViewport.tsx` (new), `components/melos/beats/instrument/{TonosPanel,LyraPanel,SomaPanel}.tsx`
- **All-Instrument Session Band Wiring**: `services/melos/instruments/soma/drumKnowledge.ts` (all 54 SOMA presets mapped), `services/melos/beats/band/lore.ts`, `services/melos/beats/band/character/sheets.ts`, `services/melos/beats/band/live/{observations.ts, lineAudio.ts}`, `services/melos/beats/engine/BeatsEngine.ts`, `components/melos/beats/instrument/{InstrumentBandSeat.tsx, InstrumentWindow.tsx, TonosPanel.tsx, BajoPanel.tsx, VelaPanel.tsx, KeraPanel.tsx, InstrumentPanel.tsx, AuraPanel.tsx}`, `components/melos/beats/machine/MachineView.tsx`
- **Tests & Docs**: `tests/cad3dInstruments.test.ts` (new), `docs/chora/GEMINI_HANDBACK.md`

Verified:
- **TONOS Metallic Ring, Runaway Tail & Stuck Notes**:
  - Eliminated longitudinal feedback runaway and metallic sympathetic-bridge ringing in `tonos.rs`/`engine.rs` and rebuilt `plajah_audio.wasm` with `+simd128` via `npm run audio:build`.
  - Replaced boolean audition note tracking with an async `held` `Map` + `releaseAll` on unmount/blur/preset switch and pointer capture release (`onLostPointerCapture`) in `useInstrumentKeyboard.ts`, `TonosPanel.tsx`, and `LyraPanel.tsx`, and fixed pre-existing `!clip.loop` property check in `useInstrumentKeyboard.ts`.
- **GPU, Worker, Memory & Canvas Refinements**:
  - Extracted `deepUtil.ts` (`acquireF64Scratch`, `acquireF32Scratch`, `lruSet`/`lruTouch`, cached radix-2 Cooley-Tukey twiddles, `realPairPowerSpecsInto`, `trimSilenceTail`, `bucketByFrames`) shared across `gpuModal.ts`, `deepWorker.ts`, `deepModes.ts`, `somaDeep.ts`, `hitCache.ts`, `tonosDeep.ts`, `tonosDeepWorker.ts`, and `deepBody.ts`.
  - Added offscreen background canvas caching, pre-allocated frequency analysis buffers, and 120 ms idle-sleep + `wakeSimRef` wakeups in `TonosPanel.tsx`, `LyraPanel.tsx`, `SomaPanel.tsx`, and `AuraPanel.tsx`.
- **Parametric 3D CAD Instrument Simulation (`TONOS`, `SOMA`, `LYRA`)**:
  - Built 3D CAD geometry builders using Plajah's CAD kernel (`cad/model.ts`, `cad/mesh.ts`, `mech/geometry.ts`, `cad/scene.ts`) that dynamically switch morphology across presets and reflect heritage aging, asymmetry, pickups, mutes, strings, membranes, wheels, and bows.
  - Mounted `<Instrument3DViewport />` in `TonosPanel.tsx`, `LyraPanel.tsx`, and `SomaPanel.tsx` with `liveBus.on` reactivity (`SomaPanel.tsx`) and `2D Physics` fallback toggle.
- **Session Band Musicians Wired Across All Panels**:
  - Completed `SOMA_PRESET_DRUM` (`54/54` presets), expanded `lore.ts` (`world-lutes-and-harps`, `world-bowed-fiddles`, `world-zithers-dulcimers`, `sampler`, `spectral-ensemble`), populated `>= 3` demos across all 13 `CHARACTER_SHEETS`, added `KitLens`, and wired `<InstrumentBandSeat />` into `TonosPanel` (Amara/Theo/Ingrid/Priya/Rosa), `BajoPanel` (Dwayne), `VelaPanel` (`vela`/`cantus`/`ison`/`pneuma` -> Elena/Ingrid/Felix), `KeraPanel` (Elena), `InstrumentPanel` (`ONDA` -> Nova), `AuraPanel` (Hez/Nova), and `MachineView` (Marcus).
- **Checks Executed After Final Code Edits**:
  - Scoped `npx tsc --noEmit` across all 34 touched TS/TSX files + `hitCache.ts` -> `0` errors (`exit code 0`).
  - `npx tsx --test tests/cad3dInstruments.test.ts tests/bandLive.test.ts tests/sessionBand.test.ts tests/tonosInstrument.test.ts tests/tonosDeep.test.ts tests/lyraInstrument.test.ts tests/melosSoma.test.ts` -> `58/58` passed (`0` failed, `0` skipped), including all 52 TONOS CAD models, all 54 SOMA CAD + `SOMA_PRESET_DRUM` mappings, all 11 LYRA models, `deepUtil`, `CHARACTER_SHEETS` (`13/13`), `lore.ts`, `PANEL_SEAT_INTROS`, `LYRA_SEAT_INTROS`, and `KitLens`.
  - Earlier in same verification pass (prior to final TS-only edits in `cadUtils.ts`/`SomaPanel.tsx`/`MachineView.tsx`/`useInstrumentKeyboard.ts`): `cargo test --manifest-path rust\plajah-gpu-dsp\Cargo.toml` -> `6/6` passed (`2` unit + `4` `gpu_match`), `npm run test:tonos` -> Rust `13/13` passed (`3` pre-existing ignored), `npm run test:lyra` -> Rust `12/12` passed (`4` pre-existing ignored), `npm run test:dsp` -> `49/49` passed, `npm run test:cad` -> `41/41` passed, `tests/melosTimeAxis.test.ts` -> passed as part of `35/35` combined batch.
  - Dev server smoke check: `GET http://localhost:3000/?view=chora-studio` returned `HTTP 200` (`13186` bytes).
  - Checked `git status --short` against forbidden files (`services/melos/direct`, `tests/choraDirect.test.ts`, `arco.rs`, `cornu.rs`, `aulos.rs`) -> clean (`0` changes).

Not verified:
- Interactive real-browser WebGL rendering visual inspection of `<Instrument3DViewport />`, live WebGPU shader execution on browser canvas, and live ear-level audio listening across all 52 TONOS presets and instrument panels (local Vite dev server returned HTTP 200 and unit/WASM/GPU-Rust tests passed headlessly).
- Full-repo unfiltered `npx tsc --noEmit` (V8 hit the 4 GB heap ceiling during full-monorepo check; scoped `tsc --noEmit` verified all 34 touched files with `0` errors).

Requests for Claude:
- None.


## TONOS Per-Instrument Acoustic Differentiation & Sub-Preset System (2026-11-13)
Changed:
- **TONOS DSP Differentiation (`rust/plajah-audio/src/tonos.rs`, `services/melos/beats/engine/dsp/plajah_audio.wasm`)**: Added the `Voicing` table across all 52 TONOS instruments (`v_modes[0..2]` tuned 3-band cavity/plate/skin formants, per-instrument `lpf_hz`, direct bridge bleed factor `direct`, `damp_mul`, `body_gain`, `slap_hz`, multi-course `rake_ms` stagger, and `pick_tone`), broadened `build_body` resonance bandwidths, shaped contact sample widths (`EX_FINGER`/`EX_NAIL`/`EX_PLECTRUM`/`EX_BACHI`), added bridge pick-chirp & body slap impulses, balanced bridge radiation (`(pl - pl_prev) * norm_d * 0.94 + pl * 0.05` + `form * 0.84`), and added `tonos_instruments_and_subpresets_are_spectrally_distinct` unit test.
- **208 Sub-Presets Across All 52 Instruments (`services/melos/instruments/tonos/presets.ts`)**: Expanded `TONOS_PRESETS` from 81 entries to 208 entries so every instrument (`0..51`) has 4 distinct, playable sub-presets while preserving all existing preset IDs; exported `tonosPresetsForInstrument` and `tonosSubPresetLabel`.
- **Sub-Preset Selector UI (`components/melos/beats/instrument/TonosPanel.tsx`)**: Added an interactive `{inst.name} Sub-Presets` pill strip directly under the instrument buttons showing per-instrument sub-preset labels (`tonosSubPresetLabel`), active highlight, sub-preset description, and kept the synced dropdown selector (`Sub-Preset Select`) and `<Instrument3DViewport />` (`cadData`) aligned.
- **Tests (`tests/tonosInstrument.test.ts`, `docs/chora/GEMINI_HANDBACK.md`)**: Added sub-preset coverage and uniqueness/contrast validation across all 52 instruments.

Verified:
- `cargo test --release --lib tonos -- --nocapture` -> `14 passed; 0 failed; 3 ignored` (including `tonos_jawari_brightens_and_sustains_the_buzz`, `tonos_instruments_and_subpresets_are_spectrally_distinct`, `tonos_deep_body_replays_the_recorded_string`, `tonos_deep_recorder_matches_the_live_voice`, `tonos_no_metallic_ring_or_runaway_tail`, `tonos_in_tune`).
- `cargo test --release --lib tonos_levels -- --ignored --nocapture` -> `1 passed; 0 failed` (`rms` `0.0107`–`0.0948`, `peak` `0.050`–`0.599` across all 52 instruments).
- `npm run audio:build` -> `plajah_audio.wasm` built cleanly (`405.1 KB`, `sha256:90ca12db297a`).
- `npm run test:dsp` -> `49/49` passed (`ABI_VERSION = 20`).
- `node node_modules/tsx/dist/cli.mjs --test tests/tonosInstrument.test.ts tests/tonosDeep.test.ts tests/cad3dInstruments.test.ts tests/melosInstruments.test.ts tests/heritageAndSynthAudit.test.ts` -> `47/47` passed (`totalPresets = 208`, `minSubPresets = 4`, `maxSubPresets = 4`; deep-body WASM calibration and sub-preset contrast verified).
- Scoped `node node_modules/typescript/bin/tsc --noEmit ... services/melos/instruments/tonos/presets.ts components/melos/beats/instrument/TonosPanel.tsx tests/tonosInstrument.test.ts` -> `0` errors (`exit code 0`).
- Dev server smoke check: `GET http://localhost:3000/?view=chora-studio` returned `HTTP 200`.

Not verified:
- Interactive real-browser listening pass and visual WebGL inspection across all 208 TONOS sub-presets (unit, WASM DSP, deep-body calibration, and CAD geometry checks ran headlessly in Rust + Node).
- Full-monorepo unfiltered `tsc --noEmit` (V8 exceeds 8 GB heap on full repo; scoped `tsconfig`-matched `tsc` passed cleanly on all touched TS/TSX files).
- Bare `npm run test:tonos` wrapper failed in this shell because `tsx` is not in the default non-npx PATH; running the exact same test targets via `node node_modules/tsx/dist/cli.mjs --test ...` plus `cargo test --release --lib tonos` passed completely.

Requests for Claude:
- None.


---

## Follow-Up Assignment — Sub-Presets & Activated Virtual Musicians (Verified 2026-11-13)

### Track 1 — All 10 Chora Instruments: Timbral Differentiation & Per-Instrument Sub-Presets
- All 10 Chora instruments (`TONOS`, `LYRA`, `SOMA`, `VELA`, `CANTUS`, `ISON`, `PNEUMA`, `BAJO`, `AURA`, `ONDA`) have distinct preset voices and interactive panel sub-preset pill strips.
- Added/updated verification in `tests/tonosInstrument.test.ts`, `tests/melosSoma.test.ts`, `tests/melosAura.test.ts`, `tests/lyraInstrument.test.ts`, `tests/velaSuite.test.ts`, `tests/heritageAndSynthAudit.test.ts`, and `tests/cad3dInstruments.test.ts`.

### Track 2 — Activated Virtual Musicians (Real-Time Jam, Record Into Song, Audio Ear, Story+Music Research)
- `services/melos/beats/band/studioContext.ts`: summarizes active project BPM, key, time signature, chord chart/progression, tracks, active instrument/preset, and lyrics (`summarizeStudioContext`), and bridges live doc mutations (`registerStudioDocMutator`, `mutateStudioDoc`) plus studied reference broadcasts (`setLatestStudiedReference`, `getLatestStudiedReference`, `subscribeStudiedReference`).
- `services/melos/beats/band/audioEar.ts`: offline-testable PCM analyzer (`analyzeAudioBufferToReference`) extracting BPM, key, chords, melodic contour (`pitchTrack`), and drum/beatbox hits (`beatbox`) from mic humming (`captureMicSnippet`), shared computer/system audio (`captureDeviceAudioSnippet`), current project master mix (`captureProjectMixSnippet`), or uploaded audio files (`studyAudioFile`), and broadcasts `'study'` events on `liveBus` (`publishStudiedReference`).
- `services/melos/beats/band/referenceResearch.ts`: resolves book, movie, song, and style references offline into concrete BPM, key, chords, narrative, and verified Chora preset picks (`researchReferenceOffline`, `researchCreativeReference`), with optional consented cloud escalation to `POST /api/band/research`.
- `services/melos/beats/band/freshTake.ts`: generates scale-locked fresh takes or accompaniments (`composeFreshTake`) across `melody`, `bass`, `comp`, and `percussion`, and commits clips/MEKA pattern steps to the doc (`writeFreshTakeToDoc`).
- `services/melos/beats/band/teacherPrompt.ts` & `services/melos/beats/band/bandMind.ts`: surface `projectSummary`, `referenceSummary`, and `activeInstrument` in both offline answers and cloud prompts.
- `services/melos/beats/band/live/events.ts`: added `'study'` event variant carrying `instrument`, optional `trackId`, `source`, `bpm`, `key`, `chords`, `summary`, and `at`.
- `server.ts` & `services/appCheckServer.ts`: extended `POST /api/band/teach` with studio/reference/instrument context fields and added `POST /api/band/research` strictly gated by `cloudConsent === true` (HTTP `428` otherwise) and included in `APPCHECK_STRICT_PREFIXES`.
- UI & Seats: added `components/melos/beats/band/live/MusicianStageControls.tsx` and wired live jam/record/hear/research controls, voice mic input, and studio mutator binding across `components/melos/beats/instrument/{InstrumentBandSeat,LyraBandSeat,SomaDrumStory}.tsx`, `components/melos/beats/band/{SessionBandConsole.tsx,live/useLiveCharacter.ts}`, and `components/melos/beats/BeatsRoom.tsx`.

### Verification After Final Edits
- **11 Chora Node test suites** (`node ./node_modules/tsx/dist/cli.mjs --test tests/musicianMindAndEar.test.ts tests/bandLive.test.ts tests/sessionBand.test.ts tests/lyraInstrument.test.ts tests/velaSuite.test.ts tests/tonosInstrument.test.ts tests/melosSoma.test.ts tests/melosAura.test.ts tests/heritageAndSynthAudit.test.ts tests/cad3dInstruments.test.ts tests/choraDirect.test.ts`): **103 passed, 0 failed, 0 skipped** (`tests/musicianMindAndEar.test.ts`: 7/7 passed).
- **WASM DSP suite** (`npm run test:dsp`): **53 passed, 0 failed, 0 skipped**.
- **Rust DSP tests** (`cargo test --release --manifest-path rust/plajah-audio/Cargo.toml lyra` and `tonos`): **12 passed / 4 ignored (`lyra`)** and **14 passed / 3 ignored (`tonos`)**, 0 failed (no Rust files edited afterward).
- **Scoped strict TypeScript check**: **0 errors** across all new/touched Track 2 files plus `SomaPanel.tsx`, `keysLens.ts`, `observations.ts`, `director.ts`, and `server.ts` lines 7250–7309 (pre-existing repo-wide `--strict` errors remain outside Chora / in `sheets.ts` and unrelated `server.ts` routes; `tsconfig.json` does not enable `strict`).
- **Forbidden files check**: `git diff --name-only` across `services/melos/direct`, `tests/choraDirect.test.ts`, and `rust/plajah-audio/src/{arco,cornu,aulos}.rs` is empty.
- **Dev server**: `http://localhost:3000` returned HTTP `200`.

### Not Tested Live in Browser / Cloud
- Interactive browser capture (`getUserMedia` mic humming/speech recognition, `getDisplayMedia` system audio capture, real-time WebAudio worklet playback/recording in UI) and live Gemini cloud `/api/band/teach` & `/api/band/research` API round-trips require manual UI session verification with cloud consent granted.

---

## Follow-Up Fix — Hardware MIDI & Instrument Track Routing (Verified 2026-11-13)

### Root Causes Resolved
1. **Concurrent `ensureInstrument` drops (`services/melos/beats/engine/instrumentLoader.ts`, `BeatsEngine.ts`)**: `ensureInstrument` previously tracked `instrumentLoading` with a `Set<string>` and returned `null` while loading, dropping chords, CCs, and concurrent preloads; replaced with `InstrumentLoader` deduplicating in-flight promises and added `prepareUnmutedTracks` / `BeatsEngine.prepareInstruments()`.
2. **Async `noteOn` / sync `noteOff` race & mismatched track off (`components/melos/beats/BeatsRoom.tsx`)**: Added token-guarded `midiHeldTracks` (`Map<number, { track, token }>`) so loaded tracks fire `instrumentNoteOn` synchronously (`this.resume()` inside `BeatsEngine.instrumentNoteOn`), unloaded tracks cancel safely on early key-up, and `noteOff` + recording commit target the exact track where the note started (including pad-owned pitch-roll recording when an instrument window is open).
3. **Open instrument panels & Timeline `36..51` fallback (`services/melos/midiRouting.ts`, `BeatsRoom.tsx`)**: Added pure `resolveMidiRouting` prioritizing `openTrack` (`openInstrumentId`) ahead of `padTrack` and `armedTrack` for hardware MIDI, QWERTY keyboard (`useInstrumentKeyboard`), pitch bend, mod wheel, sustain, and macros, and keeping `instrumentArmed: true` in `timeline` view whenever un-owned Timeline instrument tracks exist so notes `36..51` reach instruments instead of diverting into drum pads before `autoArm()` fires.
4. **Cold-start transport & MIDI file import (`BeatsEngine.ts`, `BeatsRoom.tsx`, `TimelineView.tsx`)**: `BeatsEngine.init()` now calls `syncInstruments()`, all Play / Record / `queuePattern` / `queuePatternSet` entry points await `prepareInstruments()`, Timeline Record starts `'song'` mode from `songStartBeats` (using live `transportActionsRef` for hardware transport CCs and matching mobile `onToggleRecord`), and Timeline `.mid` import calls `BeatsEngine.get().syncInstruments()`.

### Verification After Final Edits
- **12 Chora Node test suites** (`node ./node_modules/tsx/dist/cli.mjs --test tests/midiInstrumentRouting.test.ts tests/musicianMindAndEar.test.ts tests/bandLive.test.ts tests/sessionBand.test.ts tests/lyraInstrument.test.ts tests/velaSuite.test.ts tests/tonosInstrument.test.ts tests/melosSoma.test.ts tests/melosAura.test.ts tests/heritageAndSynthAudit.test.ts tests/cad3dInstruments.test.ts tests/choraDirect.test.ts`): **111 passed, 0 failed, 0 skipped** (`tests/midiInstrumentRouting.test.ts`: 8/8 passed).
- **WASM DSP suite** (`npm run test:dsp`, run before the final TS annotation fix in `midiRouting.ts` & `tests/midiInstrumentRouting.test.ts`; Rust/WASM untouched): **53 passed, 0 failed, 0 skipped**.
- **Scoped strict TypeScript check**: **0 errors** across `services/melos/midiRouting.ts`, `services/melos/beats/engine/instrumentLoader.ts`, `services/melos/beats/engine/BeatsEngine.ts`, `components/melos/beats/BeatsRoom.tsx`, `components/melos/beats/timeline/TimelineView.tsx`, `components/melos/beats/instrument/useInstrumentKeyboard.ts`, and `tests/midiInstrumentRouting.test.ts`.
- **Forbidden files check**: `git diff --name-only` across `services/melos/direct`, `tests/choraDirect.test.ts`, and `rust/plajah-audio/src/{arco,cornu,aulos}.rs` is empty.

### Not Tested Live in Browser / Hardware
- Physical WebMIDI controller input (`navigator.requestMIDIAccess`), live AudioWorklet note/CC playback, and Timeline MIDI recording against `http://localhost:3000` require hands-on browser + hardware verification.


## Phase 5 Headless Project & Brief Renderer + Local Direct Routes (2026-11-13)
Changed: `services/melos/render/headlessProjectRenderer.ts`, `services/melos/render/index.ts`, `routes/choraDirect.ts`, `tests/choraHeadlessRender.test.ts`, `tests/choraDirectRoutes.test.ts`, `package.json`, `docs/chora/GEMINI_HANDBACK.md`
Verified:
- Implemented `renderGrooveHeadless` (`services/melos/render/headlessProjectRenderer.ts`): walks `songTime(doc)` (`TempoMap` / `MeterMap`, never `60 / bpm`), `clipContent.ts` (`noteOccurrences`), and `pattern` drum clips in headless Node.js without browser `OfflineAudioContext`. Supports a zero-dependency pure-TS `'dsp'` backend and an injectable `wasmTrackRenderer` (`'wasm-hybrid'`), flagging partial fallback (`fallbackUsed`) honestly rather than misreporting backends.
- Implemented `renderBriefHeadless` and `buildScoreConditionedAceRequest`: compiles a `SongBrief` into a timed stereo WAV (`16`/`24`-bit PCM), runs `measureAudio` from `services/musicIntel/dsp.ts`, normalizes toward `pack.mix.lufs`, and builds validated ACE-Step `cover` / `lego` `GenerationRequest` payloads (`validateGenerationRequest` compliant).
- Extended `routes/choraDirect.ts` with three local-first, zero-cloud endpoints beside `/write`:
  - `POST /api/chora/direct/compile`: compiles `{ prompt }` or `{ style, lyrics, title }` into `{ parsed, brief, review, ensemblePlan, bandChart, renderRequest, lyricLines, vocalLayer }`.
  - `POST /api/chora/direct/render-preview`: runs `renderBriefHeadless` (clamped `<= 30s`) and returns `wavBase64` + `measured` (`dsp.ts`).
  - `POST /api/chora/direct/transcribe-chords`: accepts `pcmBase64` (`float32le`) or `pcm` sample array + `sampleRate` and runs `recognizeChordsFromAudio`.
- Ran `node node_modules/tsx/dist/cli.mjs --test tests/choraDirectRoutes.test.ts tests/choraHeadlessRender.test.ts tests/choraDirect.test.ts tests/choraDirectPacks.test.ts tests/choraTranscribe.test.ts tests/evalChoraDirect.test.ts` -> **32/32 passed** (`0` failed, in-process Express dispatch for routes + pure-TS tests; `node_modules/.bin/tsx.cmd` is absent in this tree, so invoked via `node_modules/tsx/dist/cli.mjs`).
Not verified:
- Full `plajah_audio.wasm` multi-track rendering through `wasmTrackRenderer` in Node (verified the hook contract and fallback provenance with a mock renderer; no WASM/engine imports in tests per house rule 8).
- End-to-end live ACE-Step `cover` / `lego` server generation from `buildScoreConditionedAceRequest` (no local GPU batch jobs run on this laptop).
Requests for Claude:
- None.


## Phase 2 Chora Direct Studio UI Wiring (2026-11-13)
Changed: `services/melos/direct/applyBriefToDoc.ts`, `components/melos/beats/composer/ChoraDirectPanel.tsx`, `components/melos/beats/composer/GenerationPanel.tsx`, `components/melos/beats/timeline/TimelineView.tsx`, `components/melos/beats/BeatsRoom.tsx`, `tests/choraDirectWire.test.ts`, `package.json`, `docs/chora/GEMINI_HANDBACK.md`
Verified:
- `applyBriefToDoc(doc, brief)` atomically writes `bpm`, clears `tempoMap`, sets `key`, `meter`, `sections`, bar-aligned `lyrics`, `band.genre`/`band.chart`, and `name`; `buildBriefStudioHandoffs(brief)` produces Council grounding, Session Band chart, and Music Lab render request from the same compiled `SongBrief`.
- `ChoraDirectPanel` wired into `TimelineView`'s Create bar (`Direct` button beside `Session Band`), handing off into `CouncilComposerPanel`, `SessionBandConsole`, and `GenerationPanel` (`initialBrief` pre-fills prompt, lyrics, key, bars, and seconds).
- `node node_modules/tsx/dist/cli.mjs --test tests/choraDirectWire.test.ts tests/choraDirectRoutes.test.ts tests/choraHeadlessRender.test.ts tests/choraDirect.test.ts tests/choraDirectPacks.test.ts tests/choraTranscribe.test.ts tests/evalChoraDirect.test.ts` -> **34/34 passed** (`0` failed).
- Scoped `tsc --noEmit` across `ChoraDirectPanel.tsx`, `GenerationPanel.tsx`, `TimelineView.tsx`, `BeatsRoom.tsx`, `applyBriefToDoc.ts`, `routes/choraDirect.ts`, and `headlessProjectRenderer.ts` -> **0 TypeScript errors** in all touched files.
Not verified:
- Interactive browser rendering and click-through of `ChoraDirectPanel` / `GenerationPanel` inside Vite/Electron (`npm run dev`), and git commit on `feat/academia-lessons` (`.git/index.lock: Permission denied` in sandbox).
Requests for Claude:
- None.

## Instrument Realism, MIDI/K1 Focus, Session Band & VOLTA Circuit-Modeled Super-Synth (2026-11-13)
Changed: `rust/plajah-audio/src/{volta,lib,engine,aura}.rs`, `rust/plajah-audio/test/dsp.test.mjs`, `services/melos/instruments/volta/{params,patch,presets,circuitSpec}.ts`, `services/melos/instruments/cad3d/{voltaCadModel,performanceKinematics,cadUtils,lyraCadModel,somaCadModel,tonosCadModel}.ts`, `services/melos/instruments/tonos/presets.ts`, `services/melos/instruments/physics/heritageAcoustics.ts`, `services/melos/{midiMap,midiRouting}.ts`, `services/melos/beats/{focusedParamStore,instrumentFactory}.ts`, `services/melos/beats/engine/instrumentLoader.ts`, `services/elec/designs.ts`, `components/workspace/WorkspaceShell.tsx`, `components/melos/beats/shared/FocusRange.tsx`, `components/melos/beats/instrument/{VoltaPanel,InstrumentWindow,TonosPanel,LyraPanel,SomaPanel,WavetableDisplay}.tsx`, `components/melos/beats/instrument/3d/{Split2D3DWorkspace,Instrument3DViewport}.tsx`, `components/melos/beats/band/SessionBandConsole.tsx`, `components/melos/beats/band/live/{MusicianStageControls,useLiveCharacter}.ts`, `components/melos/beats/timeline/TimelineView.tsx`, `components/melos/beats/BeatsRoom.tsx`, `tests/choraVoltaAndFixes.test.ts`, `docs/chora/GEMINI_HANDBACK.md`
Verified:
- **Which synth models circuitry**: `ONDA` and `AURA` use wavetable / VA synthesis and heuristic DSP effects (3-phase MN3009 BBD chorus/ensemble, 6-stage TPT all-pass phaser, 15 IPS tape hysteresis in `rust/plajah-audio/src/aura.rs`), not electrical nodal simulation. **`VOLTA`** is Chora's first dual-era (`1974` vintage BJT transistor ladder + `2026` Cytomic ZDF SVF) circuit-modeled Super-Synth (`rust/plajah-audio/src/volta.rs`, `ABI_VERSION = 21`, `VOLTA_BASE = 2500`, `pa_volta_probe` telemetry, `10` presets, `AURA`/`ONDA` preset importers in `services/melos/instruments/volta/patch.ts`, MNA SPICE DC+Transient analysis, sourced BOM & CNC/laser enclosure in `services/melos/instruments/volta/circuitSpec.ts`, X-Ray CAD PCB/tube model in `voltaCadModel.ts`, and 1-click Plajah Builder launch via `launchVoltaInPlajahBuilder` -> `WorkspaceShell.tsx` `resolveElecStarter` -> `ElecRoom.tsx`).
- **Studio fixes**: ONDA live zero-crossing oscilloscope (`WavetableDisplay.tsx`), hardware MIDI routing for Timeline & open instrument panels (`resolveMidiRouting`, `InstrumentLoader`) + generic CC banks (`GENERIC_BANK_STARTS`, `resetAutoKnobBanks`), `K1` hover/<=56 px proximity/click lock (`focusedParamStore.ts`, `Knob`, `FocusRange`, live badge fix in `InstrumentWindow.tsx`), simultaneous left-2D + right-3D `Split2D3DWorkspace` / `Instrument3DViewport` with hand/finger kinematics & acoustic airflow (`performanceKinematics.ts`), AURA activity-gated hum/crackle (`activity_gate > 1e-5`) and clean panic flush (`engine.rs` `all_notes_off(true)`), `MusicianStageControls` jam loop cadence guard + `'volta'` reference lookup, hands-free voice talkback (`SessionBandConsole.tsx`, `useLiveCharacter.ts`), and independent Timeline track vs MEKA pad routing (`TimelineView.tsx`, `BeatsRoom.tsx`).
- `node ./node_modules/tsx/dist/cli.mjs --test tests/choraVoltaAndFixes.test.ts tests/cad3dInstruments.test.ts tests/elec.test.ts tests/tonosInstrument.test.ts tests/tonosDeep.test.ts tests/sessionBand.test.ts tests/musicianMindAndEar.test.ts tests/lyraInstrument.test.ts tests/melosControlPages.test.ts tests/somaHandMap.test.ts tests/midiInstrumentRouting.test.ts tests/heritageAndSynthAudit.test.ts tests/melosAura.test.ts tests/melosSoma.test.ts` -> **113 passed, 0 failed, 0 skipped**.
- `node --test rust/plajah-audio/test/dsp.test.mjs` -> **54 passed, 0 failed, 0 skipped**.
- `cargo test --manifest-path rust/plajah-audio/Cargo.toml --lib volta` -> **4 passed, 0 failed** (`66` filtered).
- `cargo test --manifest-path rust/plajah-audio/Cargo.toml --lib` -> **50 passed, 1 failed, 19 ignored** (sole failure is pre-existing in Claude WIP `plajah-audio/src/aulos.rs:1018` `aulos::tests::aulos_clarinet_is_odd_and_oboe_is_full`: `oboe second harmonic missing: h1 426.95175 h2 3.8564506`).
- `node --max-old-space-size=16384 ./node_modules/typescript/bin/tsc --noEmit --pretty false` -> **0 TypeScript errors** across repository source/tests (82 error lines confined to pre-existing binary HLS `.ts` files in `artifacts/`, `patch_chora.js`, and `scratch/lv/*.tpl.ts`).
- `node --max-old-space-size=16384 ./node_modules/vite/bin/vite.js build` -> Vite transform/chunking succeeded (`11806` modules transformed, `built in 5m 27s`), then exited 1 at the final `vite-plugin-pwa` / `workbox-build` service worker step (`EPERM: operation not permitted, open 'C:\Users\Kenne\package.json'` outside workspace sandbox).
- Protected Claude files (`git diff --name-only` across `direct/` and protected `.rs` files) -> **0 modified files**.
Not verified:
- Live browser interactive verification in Vite/Electron (`npm run dev`): WebMIDI hardware controller & physical Knob 1 feel, AudioWorklet real-time audio ear check across instruments/presets/aging/panic, WebSpeech/mic talkback, WebGL 2D+3D simultaneous rendering/kinematics/X-Ray chassis inspection, `launchVoltaInPlajahBuilder` interactive transition into `ElecRoom`, and physical PCB fabrication / bench oscilloscope measurements.
Requests for Claude:
- FYI: `aulos::tests::aulos_clarinet_is_odd_and_oboe_is_full` (`plajah-audio/src/aulos.rs:1018`, protected file) fails on `cargo test --lib` (`h1 426.95175 h2 3.8564506`).
