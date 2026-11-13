# Chora Direct: workstream for the Google model

You are working alongside Claude on the Chora music system in this repository. Read
`docs/chora/CHORA_DIRECT.md` first: it has the goal, what exists, the architecture and the
contract types. This file says what is yours, what is not, and how to hand work back.

## House rules (the owner's, not negotiable)

1. **Branch:** work on `feat/academia-lessons`. Never push. A push to `master` deploys to production.
2. **Commits:** the working tree holds other sessions' uncommitted work. Stage only the files you
   changed, by path. Never `git add -A` or `git add .`.
3. **No local model batches.** Do not run ACE-Step, Qwen, diffusion or any long GPU job on this
   laptop; it has crashed the machine. Use fixture servers and recorded responses in tests.
4. **Desktop first, cloud by consent.** AI features run on the Plajah desktop app's native engine
   first, the browser second. A cloud model is used for a user only after explicit consent
   (existing pattern: the route answers 428 without `cloudConsent: true`). Users never run on
   the owner's accounts silently.
5. **Say what is true.** If something is untested, unverified or stubbed, the code comment, the
   UI text and your hand-back say so. No silent fallbacks that present one engine's output under
   another engine's name.
6. **Do not edit** `rust/plajah-audio/` (active work in progress) or the files listed under
   "Claude's files" below.
7. **Time and key math** go through `services/melos/beats/tempoMap.ts` (`songTime`),
   `snapGrid.ts` and `songKey.ts`. Never `60 / bpm` against a `GrooveDoc`.
8. **Tests:** pure TypeScript, `tsx --test tests/<name>.test.ts`, no engine or wasm imports in
   tests. Add an `npm run test:<name>` script.

## Claude's files (read, import, do not edit)

```
services/melos/direct/songPrompt.ts
services/melos/direct/styleKnowledge.ts
services/melos/direct/songBrief.ts
services/melos/direct/vocalScore.ts
tests/choraDirect.test.ts
```

If a type there needs to change for your work, write the request in the hand-back file instead.

## Your tasks

Each task is file-disjoint from Claude's work. Do them in this order unless told otherwise.

### G1. ACE-Step edit modes in the Music Lab adapter

Today `services/melos/generation/adapters.ts` sends `task_type: 'text2music'` only. The vocal
layer needs a window of an existing recording sung again in context
(`VocalRegenRequest` in `vocalScore.ts`: `startSec`, `endSec`, `lyrics`, context lyrics, audio).

- Read the ACE-Step 1.5 API documentation linked at the bottom of `docs/melos-music-lab.md`.
  Verify, from the documentation and not from memory, which task types exist (repaint, extend,
  cover or audio-to-audio, reference audio), their exact field names and limits.
- Extend `GenerationRequest` in `services/melos/generation/types.ts` with an optional `task`
  and the fields it needs (source audio, window start and end, reference audio), validated.
- Implement them in `adapters.ts`; keep `text2music` behaviour unchanged.
- Fixture-server tests in the style of `scripts/testMelosGeneration.mjs`.
- Files: `services/melos/generation/{types,adapters,jobs,client}.ts`, `routes/musicLab.ts`,
  `scripts/testMelosGeneration.mjs`, `docs/melos-music-lab.md`.
- Done when: a repaint request built from a `VocalRegenRequest` round-trips through the fixture
  server, and the doc states which modes are verified against the real API and which are not.

### G2. Deeper style packs

Add packs in `services/melos/direct/packs/` (one file per family, listed in `EXTRA_PACKS` in
`packs/index.ts`). Follow "Writing a style pack" in `CHORA_DIRECT.md`. Wanted first:

- Electronic: breakbeat and big beat, electro (808 electro-funk), IDM, minimal, psytrance
  (separate from uplifting trance), liquid drum and bass and neurofunk as separate packs,
  jungle, amapiano, afro house, disco and nu-disco, hyperpop.
- Hip-hop: jazz rap, trap soul and R&B, cloud rap, crunk and Southern, old-school and electro
  rap, Detroit (fast, off-beat flows), Jersey club, reggaeton and dembow.
- Jazz: Latin jazz (Afro-Cuban, with clave direction), gypsy jazz, free and avant-garde, soul
  jazz with organ trio, New Orleans and Dixieland, smooth jazz as its own pack.
- Cinematic: western, noir and spy, romance, sci-fi (synth score), comedy and animation,
  documentary underscore, video-game orchestral.
- Classical: string quartet, solo piano nocturne, choral (sacred, a cappella), opera aria,
  Renaissance polyphony, 20th-century modernist, waltz and dance forms (3/4).

Done when: `npm run test:direct` passes with the new packs, each new pack has a test line in a
new `tests/choraDirectPacks.test.ts` proving its own tags select it, and existing selections in
`tests/choraDirect.test.ts` still hold.

### G3. Audio to MIDI: chords and stems

New folder `services/melos/transcribe/`.

- `chordsFromAudio.ts`: chord recognition from audio (chroma per beat, template matching for
  major, minor, 7, maj7, m7, dim, sus; smoothing over the beat grid). Input: mono Float32Array,
  sample rate, beat times. Output: chord symbol per bar in the format
  `services/melos/beats/band/chords.ts` `parseChord` reads. Reuse `services/musicIntel/dsp.ts`
  for tempo and key rather than rewriting them.
- `stemTranscribe.ts`: given separated stems (bass, drums, vocals, other), route each to the
  right transcriber that already exists (`services/basicPitchBackend.ts`,
  `services/drumTranscription.ts`, `services/melos/beats/voice/pitchTrack.ts`) and return
  note tracks with roles. Do not build stem separation itself yet: `services/demucsClient.ts`
  has an unverified inference path and the model is not in the repository; report what it would
  take to verify it.
- Tests with synthesised fixtures (sine chords, known progressions), no model downloads.

### G4. Cloud writer lane for the brief (Gemini)

A server route that writes parts from a brief, for users who consent to cloud.

- `routes/choraDirect.ts`, mounted in `server.ts` beside the Music Lab router:
  `POST /api/chora/direct/write` with `{ brief grounding text, chair, section, bars, cloudConsent }`.
  Answers 428 without consent. Uses `services/ai/geminiLane.ts`. Returns notes in the council's
  line format (`bar beat length pitch`, see `services/melos/beats/council/noteLines.ts`) and
  validates them with the existing `parseNoteLines`.
- The prompt is `briefGrounding(brief, { chair, sectionId })` plus the line-format instructions.
  Do not invent a second grounding.
- Tests with a stubbed lane.

### G5. Evaluation suite

- `tests/fixtures/directPrompts.json`: 3 prompts per style pack (plain, with lyrics, with Chora
  marks), each with the expected pack id, tempo range and form.
- `scripts/evalChoraDirect.ts`: compiles every prompt, checks expectations, prints a table. No
  audio. A second mode takes a folder of rendered WAVs and reports measured tempo, key and
  integrated loudness against the brief using `services/musicIntel/dsp.ts`.

## Handing back

Append to `docs/chora/GEMINI_HANDBACK.md` after each task:

```
## G<n> <title> (<date>)
Changed: <files>
Verified: <what you ran and its result>
Not verified: <what you could not test, and why>
Requests for Claude: <type changes or questions>
```

Commit each task separately with a message that names it, staged by path, not pushed.

## What Claude is doing meanwhile

Wiring the brief into the existing generators and a Direct panel in the Chora studio, then the
vocal track on the timeline (track kind, clip, syllable overlay, type-to-edit, regenerate stale
regions). Files: `components/melos/beats/**`, `services/melos/beats/**`,
`services/melos/beats/council/**`, `services/melos/beats/band/**`. Stay out of those.
