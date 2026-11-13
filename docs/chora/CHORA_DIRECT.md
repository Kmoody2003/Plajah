# Chora Direct: the hybrid composition system

Status: 2026-11-13. Core layer built and tested (`npm run test:direct`, 14 tests). Not yet wired
into the Chora UI. Nothing here has been listened to: quality claims wait for Kenne's ears.

## The goal

Chora writes and produces music at the level films and labels release, across cinematic,
classical, jazz, the full electronic suite and hip-hop first (country, rock and the rest after),
with:

- a prompt people already know (Suno's style line plus `[Section]` lyrics) that Chora takes further,
- every engine on the platform working from one plan: the symbolic writers, the Session Band,
  the physical and synth instruments, and the generative audio models,
- vocals that live on the timeline as an editable layer (lyrics, notes, delivery), where a
  retyped phrase is sung again in context,
- strong audio-to-MIDI and MIDI-to-audio in both directions,
- expressiveness from written musical knowledge injected into prompts, not from a large training set.

## What exists today (surveyed 2026-11-13)

| Area | State |
| --- | --- |
| Generative audio | ACE-Step 1.5, HeartMuLa, YuE2 behind `/api/admin/music-lab`. Admin-only, local runtimes, one job at a time. ACE-Step is called with `text2music` only: no repaint, extend, reference audio or audio-to-audio. |
| Symbolic writers | Composer council (`services/melos/beats/council/`): models write melody and counter-melody, rules write the rest. Holistic pipeline (Qwen director then notes per 4 bars). `promptToScore` (Gemini JSON). |
| Session Band | 13 players, deterministic per-bar performance from chords, genre and persona (`services/melos/beats/band/`). About 20 genres, one entry each for jazz, house, hip-hop, trap, cinematic, classical. |
| Prompt understanding | Keyword mood and genre guesses. No structured tag parser before Chora Direct. |
| Vocals | No singing synthesis. CANTUS is wordless. Sung audio only from the external models. No vocal track type; lyrics are bar-level and only visible in the council panel. |
| Audio to MIDI | Basic Pitch (browser, polyphonic), YIN hum-to-notes, beatbox and drum-loop to pattern. No stem-aware multi-track transcription, no chord recognition from audio. Demucs model is not committed and its inference path is unverified. |
| MIDI to audio | `renderGroove` (needs a browser), `renderSongWithMelosWasm` (Node, older engines only). No headless renderer of a whole project. |
| Instruments | ARCO strings, CORNU brass, AULOS woodwinds exist in Rust (ABI 19) but the host is on ABI 18 and they have no UI. Articulations are envelope hints on the TypeScript side, not engine articulations. |

## Architecture

```
 prompt (style line + [Section] lyrics + Chora marks)
        │  songPrompt.ts        parse, nothing dropped
        ▼
 ParsedSongPrompt ──► styleKnowledge.ts   38 style packs: tempo, feel, forms, harmony,
        │                                 chairs and their jobs, production, mix, avoid
        ▼
 SongBrief  (songBrief.ts)   bars, key, tempo, sections, energy, chords per bar, words, lineup
        │
        ├─ reviewBrief()            the read-through: players and producer flag problems
        │
        ├─ briefGrounding()         text for any language model (whole song, one chair, one section)
        ├─ briefToEnsemblePlan()    form + chords for the existing holistic pipeline
        ├─ briefToBandChart()       genre + chart for the Session Band
        ├─ briefToRenderRequest()   tags + tagged lyrics for ACE-Step / HeartMuLa
        ├─ briefToLyricLines()      GrooveDoc.lyrics
        └─ layoutVocal()            the editable vocal layer (vocalScore.ts)
```

The brief is the single source of truth. A model never sees the raw prompt alone: it sees the
prompt resolved against what a professional in that style already knows, plus the notes from the
read-through. That is where the precision over a plain text-to-music prompt comes from.

### The prompt language

Everything Suno users write works unchanged:

```
deep house, 122 bpm, F minor, warm rhodes, female vocal, no guitars

[Verse 1]
City lights are calling out my name

[Chorus]
Hold me in the moment (hold me)
```

Chora additions:

| Write | Meaning |
| --- | --- |
| `[Verse 1 \| 8 bars \| mp \| whispered]` | length, dynamic and delivery for the section |
| `[Solo: tenor sax \| 16 bars]`, `[Guitar Solo]` | who takes it |
| `[Key: F minor]` `[Tempo: 122]` `[Time: 6/8]` | directives anywhere in the song |
| `{Fm9 \| Bbm7 Eb7 \| Abmaj7 \| C7}` | a chord chart for the section |
| `word~` `^word` `wo-o-ord` `/` `*word*` | hold, accent, melisma, breath, emphasis |
| `[Build]` `[Drop]` `[Breakdown]` `[Head]` `[Theme]` `[Recap]` `[Coda]` | club, jazz and score forms |
| `no guitars`, `instrumental`, `3:30` | exclusions and length in the style line |

Tags that are not understood are kept as directions and shown back to the user.

### The read-through

`reviewBrief()` returns notes in a player's voice: tempo outside where the feel lives (half-time
and double-time counts are recognised, not "corrected"), more syllables than a singer or rapper
can deliver, odd phrase lengths, no contrast between sections, a drop with no build, a jazz tune
with no head or solo, keys that are hard for horns or give strings nothing to ring. Explicit
user choices are never overridden; the notes go to the user and into the model prompts.

### The vocal layer

`VocalLayer → phrases → notes(syllable, pitch, time, marks)`. `layoutVocal()` gives a first
singable pass straight from the brief so the layer is editable before any audio exists. Editing
(`retextPhrase`, `editNote`, `setDelivery`, `movePhrase`, `splitPhrase`) marks only the changed
phrases stale; `staleRegions()` merges neighbours and pads without eating a good phrase;
`regenRequest()` is what an engine receives: the words, the exact notes, the phrases before and
after as context, the time window, the voice and the style. A take is pinned to a hash of the
content it was sung from, so undoing an edit restores the take.

Two kinds of engine can sit behind that request:

1. A generative model repainting the window (ACE-Step repaint, to be verified and wired).
2. Chora's own singing synthesiser following the notes exactly. Not started. A formant and
   physical-model voice built on the CANTUS glottal source will give instant, exactly controlled
   previews; it will not sound like a recorded singer on its own. The realistic path is hybrid:
   our score controls, a generative or neural voice renders.

## Phases

1. **Core (done):** prompt language, style packs, brief, read-through, vocal layer model, tests.
2. **Wire it in:** a "Direct" panel (style box and lyric box) showing the compiled brief and the
   read-through; the region generator, council, Session Band and Music Lab adapters all read the
   brief instead of building their own guesses.
3. **Vocal track on the timeline:** a `vocal` track kind and clip holding a `VocalLayer`;
   syllables drawn over notes; type on the timeline; regenerate stale regions; guide-melody
   preview through an instrument until a singing engine is connected.
4. **Engines for the vocal:** ACE-Step edit modes (repaint, extend, reference audio); then the
   Chora singing engine.
5. **Audio to MIDI and back:** stem-aware transcription into tracks, chord recognition from
   audio, a headless project renderer, score-conditioned audio rendering.
6. **Instruments:** ARCO, CORNU, AULOS into the host and UI; real articulations driven from
   `NoteEvent.articulation`; the same depth pass on the synthesisers.
7. **Evaluation:** a fixed prompt suite per pack; measured tempo, key, loudness and form
   adherence; blind listening by Kenne. "Hollywood level" and "label level" are judged by ear.

## Writing a style pack

A pack (`StylePack` in `services/melos/direct/styleKnowledge.ts`) is reviewed like code. Rules:

- Write what a working professional in that style would say, specifically: numbers, beats,
  registers, voicings. No adjectives that do not change what gets played.
- `progressions` are roman numerals against major-scale degrees (`i | bVI | bIII | bVII`).
  First is the verse, second lifts for the chorus or drop, third is the contrast.
- `form` is the default when the user names no sections: section kinds, bars, energy 0 to 1 and
  a direction per section.
- `lineup` maps to Session Band chairs; each seat has a job written as a direction to the player.
- `bandGenre` must be an id in `services/melos/beats/band/styles.ts`.
- `match` names the style specifically; family words (`jazz`, `edm`, `hip hop`) belong to one
  default pack per family.
- New packs go in `services/melos/direct/packs/` and are listed in `EXTRA_PACKS`. The test
  "every pack is complete" must pass.
- Do not name living artists' songs or reproduce their melodies. Describing a tradition's
  techniques is fine.
