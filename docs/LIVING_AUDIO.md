# Living Books audio engine

`services/living/audio/*` implements `BookAudioApi` from `services/living/contracts.ts`. Everything is **synthesised in code** with WebAudio: no audio files, no licensing, fully remixable. One engine per reader session via `getBookAudio()`.

```ts
import { getBookAudio } from 'services/living/audio';
const audio = getBookAudio();
audio.registerScores(book.scores);
onFirstTap(() => audio.unlock());          // REQUIRED, from a user gesture (iOS Safari). Nothing sounds before it.
audio.sfx('beep', { pitch: 3, pan: 'auto', x01: 0.8 });
audio.note('marimba', 'E4');                // an instrument the child plays
const v = audio.voice('kazoo', 'C4'); v?.setPitch('E4', 120); v?.stop();   // held, pitch-bendable
audio.playCue('lullaby', { fadeMs: 800 }); audio.setTempoScale(0.6, 4000);
audio.setAmbience('night-crickets'); audio.setDepth(0.7); audio.duck(0.6, 1500);
const s = audio.speak(pageText, { onWord: (i) => highlight(i) }); await s.done;
audio.stopTransient();                      // page change: stops narration, one-shots and held voices; music + ambience continue
audio.stopAll(); audio.dispose();           // unmount
```

Extras beyond the contract (`BookAudioEx`): `setReducedSound(on)`, `stopTransient()`, `pauseSpeech()/resumeSpeech()`, `cue`, `ambienceBed`, `stats`. Tests and authors' dry runs use `createMockAudio()` (`audio/mock.ts`), which records every call and reports unknown ids and sound-before-unlock as `problems`.

`stopAll()` in this engine really stops everything (music and ambience fade out over 300 ms). On a page change call `stopTransient()` instead, otherwise the lullaby restarts on every page.

**Word indices.** `onWord(i)` indexes `splitWords(text)` = `text.split(/\s+/).filter(Boolean)`. Highlight the same split.

## Files
| file | what |
|---|---|
| `engine.ts` | `createBookAudio()`: lazy AudioContext, unlock, buses, polyphony, visibility suspend, pending requests before unlock |
| `graph.ts` | master chain (sfx / music / ambience / voice buses, generated reverb, compressor, soft limiter), `depthParams`, ducking |
| `sfxCatalog.ts` | the sound-effect recipes + `playSfxInto()` |
| `instruments.ts` | instruments, held voices, drum kit, `playNoteInto()` |
| `sequencer.ts` | score expansion, seeded variation, lookahead scheduler, tempo ramps, crossfades |
| `compose.ts` | composition library (notation, scales, chords, arpeggios, bass, drums, transforms) |
| `demoScores.ts` | three demo cues: `lullaby`, `city`, `folk` |
| `ambience.ts` | ambience beds |
| `narration.ts` | read-aloud (Aria proxy / Web Speech / silent read-along), word timing, voice recorder |
| `voices.ts` | polyphony caps and voice stealing |
| `calibration.ts` | generated loudness tables (see "Loudness") |
| `analysis.ts`, `render.ts` | offline rendering and measurement used by the tests and the lab |
| `mock.ts` | recording stand-in for the engine |

## Sound-effect catalogue (55 sounds)
`sfx(id, { pitch (semitones), gain, variation (0..1 random detune), durationScale, pan: 'auto' | -1..1, x01 })`. Aliases: `car-horn` = `beep-car`, `footstep` alternates left/right. Measured offline at default params on the raw sound (before the master chain and its reverb): length is the time above -60 dBFS, loudness is RMS over the sounding part, centroid is the spectral centre of mass. "startle" sounds are quieter by default and are softened further in reduced-sound mode.

| id | category | what | default gain | length (s) | loudness (dBFS) | centroid (Hz) |
|---|---|---|---|---|---|---|
| `beep` | beep | Beep | 0.34 | 0.16 | -19.88 | 1460 |
| `beep-low` | beep | Beep (low) | 0.34 | 0.16 | -19.9 | 890 |
| `beep-high` | beep | Beep (high) | 0.33 | 0.16 | -20.12 | 2016 |
| `beep-double` | beep | Double beep | 0.36 | 0.36 | -20.05 | 1607 |
| `beep-car` | vehicle | Car-horn beep | 0.33 | 0.25 | -20.09 | 1131 |
| `honk` | vehicle (startle) | Honk | 0.32 | 0.47 | -23.92 | 726 |
| `toot` | vehicle | Toot | 0.42 | 0.18 | -20.07 | 598 |
| `kazoo-toot` | music | Kazoo toot | 0.95 | 0.35 | -20 | 2045 |
| `pop` | cartoon | Pop | 0.77 | 0.08 | -20.15 | 1913 |
| `boing` | cartoon | Boing | 0.91 | 0.59 | -20.67 | 716 |
| `whoosh` | cartoon | Whoosh | 2.13 | 0.56 | -21.39 | 2036 |
| `swoosh` | cartoon | Swoosh | 4.42 | 0.31 | -20.05 | 5707 |
| `zip` | cartoon | Zip | 1.95 | 0.21 | -20.03 | 3366 |
| `jelly-squish` | cartoon | Jelly squish | 0.95 | 0.34 | -19.97 | 319 |
| `squeak` | cartoon | Squeak | 0.73 | 0.26 | -19.99 | 2113 |
| `boop` | ui | Boop | 0.86 | 0.09 | -19.93 | 671 |
| `tick` | ui | Tick | 1.74 | 0.02 | -20.38 | 12040 |
| `button-click` | ui | Button click | 1.25 | 0.03 | -21.33 | 4562 |
| `pop-balloon` | cartoon (startle) | Balloon pop | 0.74 | 0.11 | -24.69 | 3526 |
| `confetti` | cartoon | Confetti | 1.51 | 0.79 | -31.72 | 11355 |
| `sparkle` | magic | Sparkle | 1.79 | 0.6 | -20.19 | 4415 |
| `twinkle` | magic | Twinkle | 1.42 | 0.48 | -20.18 | 1804 |
| `magic-appear` | magic | Magic appear | 1.17 | 1 | -20.67 | 6797 |
| `success-jingle` | story | Success jingle | 1.21 | 1.09 | -21.68 | 1711 |
| `gentle-no` | story | Gentle 'No!' | 0.56 | 0.6 | -20.01 | 462 |
| `chime` | bell | Chime | 0.76 | 1.05 | -22.64 | 1294 |
| `glass-chime` | bell | Glass chime | 0.7 | 1.17 | -23.71 | 2330 |
| `bell` | bell | Bell | 0.47 | 1.89 | -25.75 | 542 |
| `ding` | bell | Ding | 0.89 | 0.69 | -21.46 | 1888 |
| `harp-gliss` | music | Harp glissando | 0.97 | 1.11 | -21.48 | 1782 |
| `stitch` | story | Stitch | 1.43 | 0.08 | -21.54 | 2839 |
| `thread-pluck` | story | Thread pluck | 1.01 | 0.8 | -22.92 | 1124 |
| `thread-tug` | story | Thread tug | 0.57 | 0.43 | -20.05 | 289 |
| `unravel` | story | Unravel | 2.23 | 0.89 | -31.01 | 4847 |
| `knock` | texture | Knock | 0.92 | 0.25 | -22.13 | 333 |
| `thud` | texture | Thud | 0.69 | 0.21 | -19.67 | 104 |
| `crunch` | nature | Crunch (twig) | 2.89 | 0.1 | -23.3 | 9957 |
| `rustle` | nature | Rustle (leaves) | 3.55 | 0.71 | -22.8 | 10212 |
| `splash` | nature | Splash | 2.15 | 0.45 | -23.74 | 3568 |
| `bubble` | nature | Bubble | 1.01 | 0.08 | -20.06 | 497 |
| `drip` | nature | Drip | 1.26 | 0.19 | -23.73 | 1334 |
| `cricket` | creature | Cricket | 2.15 | 0.49 | -20 | 5190 |
| `owl-hoo` | creature | Owl hoo | 0.57 | 1.21 | -19.94 | 433 |
| `wings` | creature | Fluttering wings | 3.34 | 0.56 | -22.87 | 8387 |
| `whale-call` | creature | Whale call | 0.41 | 3.4 | -20.02 | 270 |
| `hum` | body | Hum | 0.6 | 1.21 | -20 | 221 |
| `snore` | body | Snore | 1.18 | 1.7 | -19.98 | 396 |
| `yawn` | body | Yawn | 1.31 | 1.51 | -20.01 | 998 |
| `footstep-left` | body | Footstep (left) | 1.03 | 0.08 | -20.04 | 438 |
| `footstep-right` | body | Footstep (right) | 1.12 | 0.08 | -19.99 | 409 |
| `heartbeat` | body | Heartbeat | 0.77 | 1.3 | -24.47 | 134 |
| `candle-flicker` | texture | Candle flicker | 3.53 | 0.61 | -22.28 | 3747 |
| `candle-blow` | texture | Candle blow-out | 4.31 | 0.61 | -21.89 | 2362 |
| `page-flip` | texture | Page flip | 3.8 | 0.25 | -20.11 | 4984 |
| `rumble` | texture (startle) | Rumble | 0.34 | 1.7 | -24.02 | 107 |

## Instruments
Pitched notes by name (`'C4'`, `'F#3'`) or MIDI number; `'x'` for an unpitched hit. Plain instruments play through `note()` and scores; the holdable ones also work with `voice()` (glide with `setPitch(note, glideMs)`, vibrato fades in after a moment, `stop(releaseMs)`). The drum kit takes names (`kick`, `snare`, `hat`, `ohat`, `clap`, `tom`, `shaker`, `click`) or GM numbers (36 kick, 38 snare, 42 hat, 46 open hat, 39 clap, 45 tom, 70 shaker, 37 click) on `drum`, or each piece as its own instrument. Aliases: `piano` = `felt-piano`, `music-box` = `musicbox`, `xylophone` = `marimba`, `thread-hum` = `hum`, `whale-song` = `whale`, `drums` = `drum`.

| id | family | holdable (voice) | level | C4 length (s) | loudness (dBFS) | centroid (Hz) |
|---|---|---|---|---|---|---|
| `musicbox` | struck | - | 1.02 | 0.78 | -23.05 | 314 |
| `marimba` | struck | - | 0.86 | 0.43 | -22.88 | 299 |
| `felt-piano` | struck | - | 0.88 | 0.99 | -22.86 | 433 |
| `harp` | plucked | - | 1.25 | 0.9 | -23.13 | 647 |
| `pluck` | plucked | - | 1.73 | 0.44 | -23.49 | 1164 |
| `kalimba` | plucked | - | 0.96 | 0.72 | -22.92 | 346 |
| `bell` | struck | - | 0.77 | 1.95 | -25.07 | 324 |
| `glass` | struck | - | 1.08 | 1.16 | -23.03 | 465 |
| `bass` | plucked | - | 0.23 | 0.58 | -23.02 | 361 |
| `flute` | blown | yes | 0.36 | 0.75 | -22.88 | 334 |
| `whistle` | blown | yes | 0.42 | 0.72 | -22.9 | 273 |
| `kazoo` | blown | yes | 1.32 | 0.72 | -23.08 | 1977 |
| `pad` | sustained | yes | 1.21 | 1.61 | -23.02 | 550 |
| `choir` | sustained | yes | 1.3 | 1.41 | -22.98 | 1682 |
| `whale` | sustained | yes | 1.15 | 1.91 | -22.99 | 342 |
| `hum` | sustained | yes | 0.6 | 1.11 | -22.95 | 367 |
| `kick` | drum | - | 0.6 | 0.27 | -22.5 | 105 |
| `snare` | drum | - | 1.79 | 0.14 | -23.71 | 5397 |
| `hat` | drum | - | 2.04 | 0.05 | -23.44 | 13103 |
| `ohat` | drum | - | 2.29 | 0.22 | -23.6 | 12930 |
| `shaker` | drum | - | 1.5 | 0.11 | -22.99 | 8279 |
| `click` | drum | - | 1.19 | 0.02 | -23.11 | 3932 |
| `clap` | drum | - | 2.5 | 0.13 | -26.77 | 4670 |
| `tom` | drum | - | 0.73 | 0.27 | -22.8 | 201 |
| `drum` | drum | - | 0.6 | 0.27 | -22.5 | 105 |

## Ambience beds
`setAmbience(bed, { gain (default 0.5), fadeMs (default 1200) })`. Built from looped noise, filters and slow LFOs (no timers, so they keep running when the tab is throttled). Aliases: `crickets`, `forest`, `ocean`, `city`, `room`, `space`, `rain`. `forest-night` is wind plus crickets.

| id | what | loudness at gain 0.5 (dBFS) | centroid (Hz) | drift early vs late (dB) |
|---|---|---|---|---|
| `night-crickets` | Night crickets | -27.95 | 2127 | 0.23 |
| `forest-wind` | Forest wind | -28.38 | 3603 | 3.69 |
| `ocean-hum` | Ocean hum | -28.96 | 1156 | 5.89 |
| `city-murmur` | City murmur | -28.03 | 1296 | 0.13 |
| `room-tone` | Room tone | -28.06 | 1545 | 0.39 |
| `space-drone` | Space drone | -28.13 | 240 | 0.44 |
| `wind` | Wind | -28.49 | 1981 | 0.59 |
| `rain-soft` | Soft rain | -28.01 | 5813 | 0.09 |
| `forest-night` | Forest night | -28.39 | 3595 | 3.27 |

`setDepth(0..1)` low-passes music and ambience from 18 kHz down to 380 Hz, lowers them to 45% and raises their reverb send from 4% to 54% (`depthParams` in `graph.ts`). Measured on the city cue: centroid 2996 Hz at depth 0, 655 Hz at depth 1, level -23.3 to -30.3 dBFS. Ducking (`duck(amount, ms)`) and the automatic duck while narration speaks are separate stages, so they combine.

## Writing a cue
Scores are plain `Score` JSON (tracks of `{ t, n, d, v }` in beats). The composition library keeps them short:

```ts
import { parseNotation, chord, arpeggiate, bassline, drums, makeScore, track } from 'services/living/audio/compose';

const melody = parseNotation('E5:1.5 D5:.5 C5:1 | D5:1.5 C5:.5 G4:1 | C5:3');
const harp   = arpeggiate(chord('C3', 'maj').map((n) => n + 12), { pattern: 'up', step: 1, count: 3, dur: 1 });
const score  = makeScore({
  id: 'goodnight', tempo: 72, beatsPerBar: 3, lengthBeats: melody.lengthBeats, reverb: 0.4,
  variation: { seed: 3, humanizeMs: 14, dropout: 0.05 },
  tracks: [track('musicbox', melody.notes, { gain: 0.9 }), track('harp', harp, { gain: 0.45, pan: -0.25 })],
});
```

**Compact notation** (`parseNotation`): tokens separated by spaces, each `pitch[:beats][@velocity][*repeat]`.
`C4:1 E4:.5 G4:.5` notes; `rest:1` (or `r`, `-`) silence; `[C4,E4,G4]:2` or `C4+E4+G4:2` a chord; `x:.25*4` four unpitched hits; `60:1` MIDI; `G4:1~ G4:1` a tie; `|` a bar line (recorded in `bars`); a token without `:beats` reuses the previous length. **ABC-like** (`parseAbc(src, { unit })`): `C D E F | G2 A2 | [CEG]4 z`, lowercase and `'` go up an octave, `,` down, `^` sharp, `_` flat.

Also: `scale(root, name, octaves)` (major, minor, harmonic-minor, pentatonic, minor-pentatonic, dorian, phrygian, lydian, mixolydian, blues, whole-tone, chromatic), `degree()`, `chord(root, quality, inversion)` (maj, min, dim, aug, sus2, sus4, maj7, min7, dom7, add9, 6, min6, power), `diatonicChord()`, `progression()`, `arpeggiate()` (up, down, updown, random, converge, thumb), `bassline()` (root, root-fifth, walking, oompah, pulse, octave), `drums({ kick: 'x...x...' })`, `transpose`, `shift`, `repeat`, `concat`, `merge`, `swing`, `scaleVelocity`, `chordsToNotes`.

**Variation** is seeded and a pure function of (seed, pass, track, note), so a seed always sounds the same: `humanizeMs` jitters timing, `dropout` drops a fraction of notes. A track with `loop: false` plays only in the first pass. A cue loops until stopped; notes may ring over the loop seam. `playCue()` of a cue already playing is ignored; of a different cue it crossfades over `fadeMs` (default 600). `setTempoScale(scale, rampMs)` ramps smoothly (the lullaby slowing as the book ends).

## Narration
`speak()` order: (1) **Aria's studio voice** if the server has ElevenLabs configured and this signed-in account may use it. The probe (`GET /api/aria/speak/status`) runs in the background after `unlock()`, is cached (10 minutes for yes, 60 s for no) and never blocks: until it says yes the engine does not try Aria, it speaks right away. Audio is fetched from `POST /api/aria/speak`, decoded and played through the voice bus, with word timing estimated across the real audio length. Any failure falls back to (2). (2) **Web Speech**: a warm English voice (`pickVoice`), default rate 0.85, text split into sentence chunks (Chrome stops long utterances), word indices from boundary events; if none arrive within 0.9 s (Android Chrome) it switches to estimated timing. (3) **Silent read-along** when there is no speech engine: the highlight still advances at the estimated pace and `done` resolves. Music and ambience duck while speech is audible. Estimated timing = syllable count x 215 ms / rate, plus pauses after commas (160 ms), semicolons (220 ms) and full stops (380 ms). `getBookAudio()` wires the Aria client to the Firebase token (lazy import of `services/backendService`); `createBookAudio()` alone has no Aria client.

**Record your own voice** (`VoiceRecorder` in `narration.ts`, off unless an author opens it; the lab shows a minimal UI): `start()` triggers the browser's microphone prompt, `stop()` returns a `RecordedTake` (`blob`, object `url`, `mime`, `durationMs`) and releases the microphone, `exportTake()` gives a download-ready file, `timingsForTake(text, take, taps?)` gives word timings (author taps via `TapTimer`, otherwise estimated across the duration), `playTake()` plays it with highlighting. Storing the blob in the Tela bundle is the builder's job.

## Safety and limits
- No sound until `unlock()` from a gesture; the AudioContext is created there. Tab hidden suspends the context, visible resumes it. If the browser interrupts audio (iOS), the next `unlock()` from a tap resumes it.
- Master chain: compressor (-16 dB threshold, 8:1) then a soft limiter that cannot exceed 0.98. Measured worst case: 40 startle sounds stacked within 300 ms over a full score peaked at 0.94.
- Polyphony: 18 sfx voices (5 per sound, same sound not retriggered within 30 ms), 28 note voices (12 per instrument), 6 held voices, 96 music voices. Beyond a cap the OLDEST matching voice is faded out in 40 ms (never a hard cut).
- Reduced-sound mode (`setReducedSound(true)`): onsets at least 12-15 ms, sfx level x0.7 (startle sounds x0.4) and the sfx bus low-passed at 4.5 kHz. It is separate from reduced motion; the reader decides when to switch it on.
- Unknown ids (sfx, instrument, bed, cue) warn once and do nothing; they never throw. `voice()` returns `null` for instruments that cannot be held.
- Aria voice entitlements and daily limits are server-side (`routes/ariaSpeak.ts`); the client only feature-detects.

## Loudness
The recipes are written at natural synthesis levels; `calibration.ts` holds per-sound multipliers generated from offline renders: sfx to about -20 dBFS active RMS and no more than 0.5 peak (startle sounds -24 dBFS, 0.4), instruments to about -23 dBFS, beds to about -28 dBFS at gain 0.5. After changing a recipe run `npx tsx tests/support/livingAudioSurvey.ts calibrate --write`.

## Verification (what was measured, and what was not)
`npm run test:livingaudio` runs three files:
- `tests/livingAudio.core.test.ts`: notation, ABC, scales, chords, arpeggios, drum patterns, seeded variation determinism, the lookahead scheduler on a fake clock (timing, loop seam, crossfade, tempo ramp, no burst after a stall), voice stealing, depth mapping, estimated word timing, narration with fake speech (boundary events, no-boundary fallback, silent mode, chunking), Aria client, catalogue integrity, the mock.
- `tests/livingAudio.engine.test.ts`: the engine against a fake AudioContext (no context before unlock, pending cues, caps and stealing, visibility, mute, stopAll vs stopTransient, dispose).
- `tests/livingAudio.render.test.ts`: renders every sound through `OfflineAudioContext` in headless Chromium (Playwright) and asserts non-silent, no NaN/Infinity, no clipping, length within `maxSec`, loudness window, dark sounds dark and bright sounds bright, pitch and duration params, instruments one octave apart, beds steady, demo cues safe and deterministic, depth darkens and quiets, ducking dips and recovers, reduced mode softens startle sounds, limiter holds under a pile-up. Without Chromium these tests are skipped, not passed.

`LIVING_AUDIO_WRITE=1 npm run test:livingaudio` also writes the WAV renders (22.05 kHz mono, through the master chain, so sfx include reverb), spectrogram contact sheets and `stats.json` to `docs/living-audio-renders/` (about 13 MB).

**Not verified:** nobody has LISTENED to any of this; a sound can pass every measurement and still sound bad (thin, harsh, wrong). The spectrograms were looked at, and show the intended shapes (harmonic stacks for beeps, a decaying wobble for the boing, gated 4-5 kHz chirps for crickets, swelling bands for wind), which is not the same as hearing them. No real phone, tablet or iOS Safari was tried (unlock, interruptions, silent switch, Bluetooth latency are unknown). Web Speech voices and boundary events differ per device. The Aria path was exercised only against fakes (the route is dark until ELEVENLABS_API_KEY and ELEVENLABS_ARIA_VOICE_ID are set). The record-your-own-voice helper was not run against a real microphone. Live scheduling was smoke-tested in Chromium (context running, cue playing, no console errors) but not for long sessions or clock drift. Treat the calibration as a starting point and judge by ear on real devices.

## Lab
`npx vite --config living-audio-lab.vite.config.mjs` then open `http://127.0.0.1:3141/living-audio-lab.html`. Click "Unlock sound", then audition every sfx (with pitch / variation / length sliders), the keyboard (hold keys for held voices and bend them), ambience beds, the demo cues, depth, ducking, tempo ramp, narration with highlighting, a notation scratchpad, the recorder, and "m" buttons that measure a sound offline and offer a WAV.
