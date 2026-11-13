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
