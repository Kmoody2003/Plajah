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
