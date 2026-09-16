# Melos Music Council + Virtual Composer — Design

Status: **DESIGN** (2026-09-07). Scoped by Kenne: a Council of producers/mix/master engineers/musicians/
composers (mirror the Art-Director council), and a Virtual Composer that turns a prompt / a hum / a MIDI
file / a Chora breakdown into scored MIDI. Plus a browsable chord **and progression** repository.

Grounded in what exists: `services/council/` (the six director agents behind Aria — propose→dispute→
synthesise→reflect, [[plajah-council-team]]), `services/melos/theory.ts` (CHORDS, 32 PROGRESSIONS,
`realiseProgression`), `services/melos/composition/humToMidi.ts` (`humToNotes`, `transcriptionToNotes`),
`services/audioTranscription.ts` (YIN pitch, [[plajah-music-transcription]]), `components/
TrackBreakdownModal.tsx` (Chora stem/section analysis), grooveDoc note model + PianoRoll, and the shared
Meter Bridge "Studio School" knowledge. Aria is the single persona shell ([[plajah-aria-ai-persona]]).

---

## Part A — The Music Council

Same shape as `services/council/`: N expert personas, each with an evolving profile and a grounded
knowledge base, that **propose → dispute → synthesise → reflect** on a musical question about the user's
project (a mix, a master target, an arrangement, a production choice).

### Personas (lanes, not people — one Aria voice)
- **Producer** — arrangement, energy, hooks, reference-track feel, genre norms.
- **Mix Engineer** — balance, EQ carving, dynamics, space (pan/reverb/depth), the Mix-Doctor findings.
- **Master Engineer** — loudness targets per platform (the Meter Bridge standards), tonal balance, true-
  peak/limiting, translation across systems.
- **Musician / Instrumentalist** — playability, voicing, groove, part-writing idiom.
- **Composer** — harmony, melody, form, tension/release (feeds Part B).

### Knowledge base (the important part — real, not vibes)
A shared `services/melos/council/knowledge/` of typed facts, the SAME source the Meter Bridge Studio
School + Mix Doctor read:
- **Targets**: platform LUFS/TP (Spotify −14, YouTube −14, Apple −16, R128 −23, Club/Cinema…), per-genre
  loudness/dynamics norms, tonal-balance curves per genre (low/low-mid/mid/high energy bands).
- **Techniques**: EQ moves ("box at 300–500", "air 10k+"), compression idioms, de-ess, parallel/bus, the
  RX repair moves ([[MELOS_RX_REPAIR_SUITE]]) as recommendable actions.
- **Schools of thought**: tagged so a council answer can cite "the Motown approach vs the modern-loud
  approach" — different, defensible positions the personas can dispute between.

### Flow
1. **Analyse** the project: read the master-bus meter frame (Meter Bridge engine), per-track balance,
   spectral tilt, dynamics, and the arrangement. This is measured input, not guesswork.
2. Each persona **proposes** moves grounded in the knowledge base + the measurements.
3. **Dispute**: personas challenge each other (loudness vs dynamics, bright vs warm) — surfaces trade-offs.
4. **Synthesise**: Aria delivers a ranked, actionable plan ("−2 dB 400 Hz on the bus, de-ess vox 7k,
   master to −9 LUFS for club") — each item **one click to apply** (pre-fills an FX device / meter target /
   RX module), never a black box.
5. **Reflect**: profiles evolve from what the user accepts/rejects (like the art council).

### Wiring
- `services/melos/council/` mirrors `services/council/` (persona defs, orchestrator, profile store).
- AI layer: `/api/ai/*` (same as the art council); the personas are prompts + the typed knowledge base as
  grounding, so answers cite real targets. Local-key validation is still pending ([[plajah-council-team]]).
- Surface: a "Council" panel in Melos (and the Fabula audio surface) beside the Meter Bridge — the meter
  *shows* the problem, the council *explains + fixes* it.

---

## Part B — The Virtual Composer

Turns intent into **scored MIDI notes on the timeline/piano-roll** (grooveDoc `instrument` track clips —
now first-class after the MIDI-track work). Four input paths, one output.

### Inputs → notes
1. **Prompt / words** → `POST /api/ai/compose` with {key, tempo, genre, bars, direction, targetTrack}.
   The model returns a note list (pitch/start/len/vel) constrained to a chosen scale + progression from
   the repository (below). Deterministic post-pass snaps to key and quantises. Writes into the armed
   instrument track's clip.
2. **Hum / sing** → already have `humToNotes(url, {voice, snapToKey})` (composition/humToMidi.ts) over YIN
   pitch detection; monophonic. UI: a **record-hum** button (mic → blob → humToNotes → notes into a clip),
   with key auto-detected and a "re-sing" retry. (Primary ask, restated.)
3. **User MIDI file** → parse (`@tonejs/midi` or a tiny SMF reader) → notes; then **interpret**: infer
   key/scale/chord context, then offer extend / harmonise / re-voice / arrange (the AI acts on the parsed
   notes, not raw bytes).
4. **Chora Track Breakdown** → reuse `TrackBreakdownModal` analysis (sections, chords, stems) to **score
   parts onto Melos instruments** — e.g. its detected chord track → a pad/keys instrument track, its
   bass line → BAJO, its melody → ONDA lead. A "Score into Melos" action on a breakdown.

### Harmony engine (the repository)
- **Chords**: `theory.ts CHORDS` + voicings.
- **Progressions**: `theory.ts PROGRESSIONS` (32, genre-implied) → the new **progression repository**
  (`services/melos/progressionRepo.ts`, built now) adds genre/family tags, search, and generate helpers,
  so both the composer and a browser UI pull from one place. Pairs with the genre chord patterns
  ([[plajah-melos-genre-presets]]).
- The composer picks/gets-given a progression, `realiseProgression(prog, keyPc, seventh)` → diatonic
  chords → voiced MIDI; melody is written against those chords (chord tones on strong beats, passing tones
  on weak) in the chosen scale.

### Output
- Notes land as a MIDI clip on the target instrument track (draw-able/editable in the piano-roll).
- Non-destructive: generated into a new clip; A/B, regenerate, keep. Never overwrites hand-drawn notes.

---

## Phasing
- **P0 (now)** — Progression **repository** accessor over the existing theory data (genre tags + query +
  generate + realise), unit-tested. Unblocks both the composer and a browse UI.
- **P1 — Composer inputs**: record-hum → clip (wire the existing humToNotes into a mic UI); MIDI-file
  import → clip; a "Progression browser" panel that inserts a realised progression as a clip.
- **P2 — Prompt→score**: `/api/ai/compose` + the constrain/snap post-pass; melody-over-changes writer.
- **P3 — Chora breakdown → Melos**: "Score into Melos" from TrackBreakdownModal onto instrument tracks.
- **P4 — Music Council**: personas + knowledge base + the propose/dispute/synthesise panel, one-click-apply
  into FX/meter/RX.

Each phase ships alone. The Council (P4) is the biggest and depends on the AI layer + knowledge base;
the Composer P0–P1 are concrete and mostly local (theory + pitch detection already exist).
